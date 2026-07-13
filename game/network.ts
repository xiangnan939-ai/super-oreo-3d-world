export type RoomStatus = "offline" | "connecting" | "connected" | "fallback";

/**
 * `websocket-relay` is still host-mediated: guests send to the host and the
 * host explicitly forwards to the other guests. Cloudflare only transports
 * those directed envelopes when a WebRTC path is unavailable.
 */
export type RoomTransport =
  | "none"
  | "webrtc-direct"
  | "webrtc-turn"
  | "webrtc-mixed"
  | "websocket-relay"
  | "local";

export interface PlayerProfile {
  playerId: string;
  name: string;
  skin: string;
}

export interface RoomPlayer extends PlayerProfile {
  ready: boolean;
  host: boolean;
  joinedAt?: number;
}

export interface PlayerFrame extends PlayerProfile {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  facing: number;
  action: string;
  tick: number;
}

export interface RoomConnectionEvents {
  onStatus(status: RoomStatus): void;
  onRoomState(players: RoomPlayer[]): void;
  onStart(): void;
  onPlayerState(frame: PlayerFrame): void;
  onPlayerLeft(playerId: string): void;
  onError(message: string): void;
  /** Optional so the existing UI remains source-compatible. */
  onTransport?(transport: RoomTransport): void;
}

interface StatePacket {
  type: "player.state";
  frame: PlayerFrame;
  seq: number;
  sentAt: number;
}

type WireMessage = {
  type: string;
  player?: RoomPlayer;
  players?: RoomPlayer[];
  playerId?: string;
  fromId?: string;
  targetId?: string;
  ready?: boolean;
  started?: boolean;
  frame?: PlayerFrame;
  payload?: unknown;
  message?: string;
  code?: string;
  sentAt?: number;
  seq?: number;
  sdp?: string;
  candidate?: RTCIceCandidateInit;
  reconnectToken?: string;
};

interface PeerLink {
  playerId: string;
  connection: RTCPeerConnection;
  channel: RTCDataChannel | null;
  pendingCandidates: RTCIceCandidateInit[];
  viaTurn: boolean | null;
  retryCount: number;
}

const ROOM_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const ROOM_CODE_PATTERN = /^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$/;
const DEFAULT_ICE_SERVERS: RTCIceServer[] = [
  { urls: ["stun:stun.cloudflare.com:3478"] },
];
const MAX_POSITION = 10_000;
const MAX_VELOCITY = 500;
const MAX_RECONNECT_DELAY_MS = 8_000;
const MAX_INITIAL_CONNECT_ATTEMPTS = 3;
const pendingHostTokens = new Map<string, string>();
const localOnlyRooms = new Set<string>();

export function normalizeRoomCode(value: string): string {
  return value.trim().toUpperCase();
}

export function isValidRoomCode(value: string): boolean {
  return ROOM_CODE_PATTERN.test(normalizeRoomCode(value));
}

interface RoomAvailabilityPayload {
  started?: unknown;
  players?: unknown;
  maxPlayers?: unknown;
  full?: unknown;
}

/** Returns a user-facing reason when a fresh guest must not open a socket. */
export function roomJoinBlockReason(value: unknown, hasReconnectCredential = false): string | null {
  if (hasReconnectCredential || !value || typeof value !== "object" || Array.isArray(value)) return null;
  const status = value as RoomAvailabilityPayload;
  if (status.started === true) return "这局冒险已经开始，暂时不能加入。";
  if (status.full === true && typeof status.maxPlayers === "number" && Number.isInteger(status.maxPlayers)) {
    return `房间已满，最多支持 ${status.maxPlayers} 名玩家。`;
  }
  if (
    typeof status.players === "number" &&
    Number.isInteger(status.players) &&
    typeof status.maxPlayers === "number" &&
    Number.isInteger(status.maxPlayers) &&
    status.maxPlayers > 0 &&
    status.players >= status.maxPlayers
  ) {
    return `房间已满，最多支持 ${status.maxPlayers} 名玩家。`;
  }
  return null;
}

function makeRoomCode(): string {
  const bytes = new Uint8Array(6);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (value) => ROOM_CODE_ALPHABET[value % ROOM_CODE_ALPHABET.length]).join("");
}

function localFallbackAllowed(): boolean {
  if (typeof window === "undefined") return false;
  return window.location.hostname === "localhost" ||
    window.location.hostname === "127.0.0.1" ||
    window.location.hostname === "[::1]";
}

function hostTokenStorageKey(roomId: string): string {
  return `super-oreo-host-token-${roomId}`;
}

function rememberHostToken(roomId: string, token: string): void {
  pendingHostTokens.set(roomId, token);
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(hostTokenStorageKey(roomId), token);
  } catch {
    // Private browsing may disable storage; the in-memory copy still works.
  }
}

function readHostToken(roomId: string): string | null {
  const pending = pendingHostTokens.get(roomId);
  if (pending) return pending;
  if (typeof window === "undefined") return null;
  try {
    return window.sessionStorage.getItem(hostTokenStorageKey(roomId));
  } catch {
    return null;
  }
}

function finiteWithin(value: unknown, maximum: number): value is number {
  return typeof value === "number" && Number.isFinite(value) && Math.abs(value) <= maximum;
}

/** Shared client-side validation for untrusted WebRTC payloads. */
export function sanitizePlayerFrame(value: unknown, profile: PlayerProfile): PlayerFrame | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const frame = value as Partial<PlayerFrame>;
  if (
    !finiteWithin(frame.x, MAX_POSITION) ||
    !finiteWithin(frame.y, MAX_POSITION) ||
    !finiteWithin(frame.z, MAX_POSITION) ||
    !finiteWithin(frame.vx, MAX_VELOCITY) ||
    !finiteWithin(frame.vy, MAX_VELOCITY) ||
    !finiteWithin(frame.vz, MAX_VELOCITY) ||
    !finiteWithin(frame.facing, Math.PI * 100) ||
    typeof frame.tick !== "number" ||
    !Number.isSafeInteger(frame.tick) ||
    frame.tick < 0
  ) {
    return null;
  }

  return {
    ...profile,
    x: frame.x,
    y: frame.y,
    z: frame.z,
    vx: frame.vx,
    vy: frame.vy,
    vz: frame.vz,
    facing: frame.facing,
    action: typeof frame.action === "string" ? frame.action.slice(0, 24) : "idle",
    tick: frame.tick,
  };
}

export async function createOnlineRoom(): Promise<string> {
  try {
    const response = await fetch("/api/rooms", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
    });
    if (!response.ok) throw new Error(`Room service returned ${response.status}`);
    const data = (await response.json()) as { roomId?: string; hostToken?: string };
    const roomId = normalizeRoomCode(data.roomId ?? "");
    if (!isValidRoomCode(roomId) || !data.hostToken) throw new Error("Room service returned an invalid room credential");
    rememberHostToken(roomId, data.hostToken);
    return roomId;
  } catch (error) {
    // A local-only room is useful for development, but production must never
    // silently pretend that BroadcastChannel is cross-computer multiplayer.
    if (localFallbackAllowed()) {
      const roomId = makeRoomCode();
      localOnlyRooms.add(roomId);
      return roomId;
    }
    throw error instanceof Error ? error : new Error("无法连接联机房间服务，请稍后重试。");
  }
}

export class RoomConnection {
  private socket: WebSocket | null = null;
  private channel: BroadcastChannel | null = null;
  private fallbackPlayers = new Map<string, RoomPlayer>();
  private currentPlayers = new Map<string, RoomPlayer>();
  private peers = new Map<string, PeerLink>();
  private lastSequenceByPlayer = new Map<string, number>();
  private status: RoomStatus = "offline";
  private transport: RoomTransport = "none";
  private heartbeat: number | null = null;
  private reconnectTimer: number | null = null;
  private reconnectAttempts = 0;
  private intentionallyClosed = false;
  private opened = false;
  private hasEverConnected = false;
  private localIsHost = false;
  private startedNotified = false;
  private outgoingSequence = 0;
  private reconnectToken = "";
  private readonly normalizedRoomId: string;
  private readonly hostToken: string | null;
  private readonly profile: PlayerProfile;
  private readonly events: RoomConnectionEvents;

  constructor(
    roomId: string,
    profile: PlayerProfile,
    events: RoomConnectionEvents,
  ) {
    this.profile = profile;
    this.events = events;
    this.normalizedRoomId = normalizeRoomCode(roomId);
    this.hostToken = readHostToken(this.normalizedRoomId);
  }

  getTransport(): RoomTransport {
    return this.transport;
  }

  async connect(): Promise<void> {
    this.intentionallyClosed = false;
    if (!isValidRoomCode(this.normalizedRoomId)) {
      this.events.onError("房间码必须是 6 位字母或数字，且不包含 I、O、0、1。");
      this.setStatus("offline");
      return;
    }

    this.setStatus("connecting");
    if (localOnlyRooms.has(this.normalizedRoomId)) {
      this.enableLocalFallback();
      return;
    }

    try {
      const response = await fetch(`/api/rooms/${encodeURIComponent(this.normalizedRoomId)}`, {
        method: "GET",
        headers: { accept: "application/json" },
      });
      if (response.status === 404 || response.status === 410) {
        if (localFallbackAllowed()) {
          this.enableLocalFallback();
          return;
        }
        this.events.onError("没有找到这个房间，请检查房间码。");
        this.setStatus("offline");
        return;
      }
      if (response.ok) {
        const availability = await response.json() as RoomAvailabilityPayload;
        const blocked = roomJoinBlockReason(availability, Boolean(this.hostToken || this.reconnectToken));
        if (blocked) {
          this.events.onError(blocked);
          this.setStatus("offline");
          this.setTransport("none");
          return;
        }
      }
    } catch {
      // The WebSocket may still be reachable; let it make the final decision.
    }

    await this.openSocket();
  }

  disconnect(): void {
    this.intentionallyClosed = true;
    this.clearReconnectTimer();
    this.clearHeartbeat();
    this.closePeerLinks();
    if (this.channel) {
      this.channel.postMessage({ type: "player.left", playerId: this.profile.playerId });
      this.channel.close();
    }
    this.channel = null;
    const socket = this.socket;
    if (socket?.readyState === WebSocket.OPEN) {
      try { socket.send(JSON.stringify({ type: "room.leave" })); } catch { /* closing */ }
    }
    this.socket = null;
    socket?.close(4000, "Intentional leave");
    this.fallbackPlayers.clear();
    this.currentPlayers.clear();
    this.lastSequenceByPlayer.clear();
    this.opened = false;
    this.localIsHost = false;
    this.setTransport("none");
    this.setStatus("offline");
  }

  setReady(ready: boolean): void {
    if (this.channel) {
      const current = this.fallbackPlayers.get(this.profile.playerId);
      if (current) this.fallbackPlayers.set(this.profile.playerId, { ...current, ready });
      this.channel.postMessage({ type: "room.ready", ready, playerId: this.profile.playerId });
      this.emitFallbackState(true);
      return;
    }
    this.sendSocket({ type: "room.ready", ready });
  }

  startGame(): void {
    if (this.channel) {
      const local = this.fallbackPlayers.get(this.profile.playerId);
      if (!local?.host) {
        this.events.onError("只有房主可以开始游戏。");
        return;
      }
      this.channel.postMessage({ type: "room.start", playerId: this.profile.playerId });
      this.notifyStart();
      return;
    }
    this.sendSocket({ type: "room.start" });
  }

  sendPlayerState(frame: PlayerFrame): void {
    const safeFrame = sanitizePlayerFrame(frame, this.profile);
    if (!safeFrame) return;
    const packet: StatePacket = {
      type: "player.state",
      frame: safeFrame,
      seq: ++this.outgoingSequence,
      sentAt: Date.now(),
    };

    if (this.channel) {
      this.channel.postMessage(packet);
      return;
    }

    if (this.localIsHost) {
      this.forwardFromHost(packet);
      return;
    }

    const host = [...this.currentPlayers.values()].find((player) => player.host);
    const hostPeer = host ? this.peers.get(host.playerId) : undefined;
    if (!this.sendDataChannel(hostPeer, packet)) this.sendSocket(packet);
  }

  sendFinish(result: { elapsedMs: number; coins: number; deaths: number }): void {
    this.sendSocket({
      type: "player.finish",
      playerId: this.profile.playerId,
      payload: result,
    });
  }

  private async openSocket(): Promise<void> {
    if (this.intentionallyClosed) return;
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const params = new URLSearchParams({
      playerId: this.profile.playerId,
      name: this.profile.name,
      skin: this.profile.skin,
    });
    if (this.hostToken) params.set("hostToken", this.hostToken);
    if (this.reconnectToken) params.set("reconnectToken", this.reconnectToken);
    const url = `${protocol}//${window.location.host}/api/rooms/${encodeURIComponent(this.normalizedRoomId)}/ws?${params}`;

    await new Promise<void>((resolve) => {
      let settled = false;
      const finish = () => {
        if (settled) return;
        settled = true;
        resolve();
      };

      let socket: WebSocket;
      try {
        socket = new WebSocket(url);
      } catch {
        this.handleSocketFailure();
        finish();
        return;
      }
      this.socket = socket;

      const timeout = window.setTimeout(() => {
        if (socket.readyState === WebSocket.CONNECTING) socket.close();
        finish();
      }, 8_000);

      socket.addEventListener("open", () => {
        if (this.socket !== socket || this.intentionallyClosed) {
          socket.close();
          finish();
          return;
        }
        window.clearTimeout(timeout);
        this.opened = true;
        this.hasEverConnected = true;
        this.reconnectAttempts = 0;
        this.setStatus("connected");
        this.setTransport("websocket-relay");
        this.sendSocket({
          type: "room.join",
          player: { ...this.profile, ready: false, host: this.localIsHost },
        });
        this.clearHeartbeat();
        this.heartbeat = window.setInterval(
          () => this.sendSocket({ type: "connection.ping", sentAt: Date.now() }),
          8_000,
        );
        finish();
      });
      socket.addEventListener("message", (event) => this.handleSocketMessage(event.data));
      socket.addEventListener("error", finish);
      socket.addEventListener("close", () => {
        window.clearTimeout(timeout);
        if (this.socket === socket) this.socket = null;
        this.opened = false;
        this.clearHeartbeat();
        this.closePeerLinks();
        if (!this.intentionallyClosed) this.handleSocketFailure();
        finish();
      });
    });
  }

  private handleSocketFailure(): void {
    if (this.intentionallyClosed || this.channel) return;
    if (localFallbackAllowed()) {
      this.enableLocalFallback();
      return;
    }
    this.setStatus("connecting");
    this.setTransport("none");
    this.reconnectAttempts += 1;
    if (!this.hasEverConnected && this.reconnectAttempts >= MAX_INITIAL_CONNECT_ATTEMPTS) {
      this.clearReconnectTimer();
      this.setStatus("offline");
      this.events.onError("无法进入房间；它可能已经开始、已满员或网络暂时不可用。");
      return;
    }
    const delay = Math.min(MAX_RECONNECT_DELAY_MS, 500 * 2 ** Math.min(this.reconnectAttempts - 1, 4));
    this.clearReconnectTimer();
    this.reconnectTimer = window.setTimeout(() => {
      this.reconnectTimer = null;
      void this.openSocket();
    }, delay);
  }

  private handleSocketMessage(raw: unknown): void {
    let data: WireMessage;
    try {
      data = typeof raw === "string" ? JSON.parse(raw) as WireMessage : raw as WireMessage;
    } catch {
      this.events.onError("收到了一条无法识别的房间消息。");
      return;
    }

    switch (data.type) {
      case "room.joined":
        if (typeof data.reconnectToken === "string") this.reconnectToken = data.reconnectToken;
        if (data.player) this.localIsHost = data.player.host;
        break;
      case "room.state":
        if (Array.isArray(data.players)) this.applyRoomState(data.players);
        if (data.started) this.notifyStart();
        break;
      case "room.start":
      case "game.start":
        this.notifyStart();
        break;
      case "relay.player-state":
        if (this.localIsHost) this.acceptGuestPacket(data);
        break;
      case "player.state":
        this.acceptRemotePacket(data);
        break;
      case "player.left":
        if (data.playerId) this.removePlayer(data.playerId);
        break;
      case "signal.offer":
        void this.acceptOffer(data);
        break;
      case "signal.answer":
        void this.acceptAnswer(data);
        break;
      case "signal.ice":
        void this.acceptIceCandidate(data);
        break;
      case "room.host-disconnected":
        this.events.onError("房主连接暂时中断，正在等待房主重连…");
        break;
      case "room.closed":
        {
          const message = data.message || "房主已离开，房间已关闭。";
          this.disconnect();
          this.events.onError(message);
        }
        break;
      case "room.error":
      case "error":
        this.events.onError(data.message || "房间连接遇到问题，请重试。");
        break;
      case "connection.ping":
        this.sendSocket({ type: "connection.pong", sentAt: data.sentAt });
        break;
      default:
        break;
    }
  }

  private applyRoomState(players: RoomPlayer[]): void {
    const next = new Map(players.map((player) => [player.playerId, player]));
    for (const playerId of this.currentPlayers.keys()) {
      if (!next.has(playerId)) this.removePlayer(playerId, false);
    }
    this.currentPlayers = next;
    this.localIsHost = next.get(this.profile.playerId)?.host ?? false;
    this.events.onRoomState(players);

    if (this.localIsHost) {
      for (const player of players) {
        if (!player.host && player.playerId !== this.profile.playerId) void this.ensureHostPeer(player.playerId);
      }
      for (const peerId of this.peers.keys()) {
        if (!next.has(peerId) || next.get(peerId)?.host) this.closePeer(peerId);
      }
    } else {
      const hostId = players.find((player) => player.host)?.playerId;
      for (const peerId of this.peers.keys()) {
        if (peerId !== hostId) this.closePeer(peerId);
      }
    }
    this.refreshTransport();
  }

  private async ensureHostPeer(playerId: string): Promise<void> {
    if (!this.localIsHost || this.peers.has(playerId) || !("RTCPeerConnection" in window)) return;
    try {
      const peer = this.createPeer(playerId, true);
      const offer = await peer.connection.createOffer();
      await peer.connection.setLocalDescription(offer);
      this.sendSocket({ type: "signal.offer", targetId: playerId, sdp: offer.sdp });
    } catch {
      this.closePeer(playerId);
      this.refreshTransport();
    }
  }

  private createPeer(playerId: string, initiator: boolean): PeerLink {
    const connection = new RTCPeerConnection({ iceServers: DEFAULT_ICE_SERVERS });
    const peer: PeerLink = {
      playerId,
      connection,
      channel: null,
      pendingCandidates: [],
      viaTurn: null,
      retryCount: 0,
    };
    this.peers.set(playerId, peer);

    connection.addEventListener("icecandidate", (event) => {
      if (event.candidate) {
        this.sendSocket({ type: "signal.ice", targetId: playerId, candidate: event.candidate.toJSON() });
      }
    });
    connection.addEventListener("datachannel", (event) => this.attachDataChannel(peer, event.channel));
    connection.addEventListener("connectionstatechange", () => {
      if (connection.connectionState === "failed" || connection.connectionState === "closed") {
        this.closePeer(playerId);
        this.refreshTransport();
        if (
          this.localIsHost &&
          this.opened &&
          this.socket?.readyState === WebSocket.OPEN &&
          this.currentPlayers.has(playerId) &&
          !this.intentionallyClosed
        ) {
          window.setTimeout(() => void this.ensureHostPeer(playerId), 2_000);
        }
      }
    });
    if (initiator) {
      this.attachDataChannel(peer, connection.createDataChannel("player-state", {
        ordered: false,
        maxRetransmits: 0,
      }));
    }
    return peer;
  }

  private attachDataChannel(peer: PeerLink, channel: RTCDataChannel): void {
    if (channel.label !== "player-state") {
      channel.close();
      return;
    }
    peer.channel = channel;
    channel.addEventListener("open", () => {
      void this.detectTurn(peer);
      this.refreshTransport();
    });
    channel.addEventListener("close", () => this.refreshTransport());
    channel.addEventListener("error", () => this.refreshTransport());
    channel.addEventListener("message", (event) => {
      if (typeof event.data !== "string") return;
      let packet: WireMessage;
      try {
        packet = JSON.parse(event.data) as WireMessage;
      } catch {
        return;
      }
      if (packet.type !== "player.state") return;
      if (this.localIsHost) this.acceptGuestPacket(packet, peer.playerId);
      else this.acceptRemotePacket(packet);
    });
  }

  private async acceptOffer(data: WireMessage): Promise<void> {
    if (this.localIsHost || !data.fromId || typeof data.sdp !== "string" || !("RTCPeerConnection" in window)) return;
    const host = this.currentPlayers.get(data.fromId);
    if (!host?.host) return;
    try {
      let peer = this.peers.get(data.fromId);
      if (!peer || peer.connection.connectionState === "closed") {
        if (peer) this.closePeer(data.fromId);
        peer = this.createPeer(data.fromId, false);
      }
      await peer.connection.setRemoteDescription({ type: "offer", sdp: data.sdp });
      await this.flushCandidates(peer);
      const answer = await peer.connection.createAnswer();
      await peer.connection.setLocalDescription(answer);
      this.sendSocket({ type: "signal.answer", targetId: data.fromId, sdp: answer.sdp });
    } catch {
      this.closePeer(data.fromId);
      this.refreshTransport();
    }
  }

  private async acceptAnswer(data: WireMessage): Promise<void> {
    if (!this.localIsHost || !data.fromId || typeof data.sdp !== "string") return;
    const peer = this.peers.get(data.fromId);
    if (!peer) return;
    try {
      await peer.connection.setRemoteDescription({ type: "answer", sdp: data.sdp });
      await this.flushCandidates(peer);
    } catch {
      this.closePeer(data.fromId);
    }
  }

  private async acceptIceCandidate(data: WireMessage): Promise<void> {
    if (!data.fromId || !data.candidate) return;
    let peer = this.peers.get(data.fromId);
    if (!peer && !this.localIsHost && this.currentPlayers.get(data.fromId)?.host && "RTCPeerConnection" in window) {
      peer = this.createPeer(data.fromId, false);
    }
    if (!peer) return;
    if (!peer.connection.remoteDescription) {
      peer.pendingCandidates.push(data.candidate);
      return;
    }
    try {
      await peer.connection.addIceCandidate(data.candidate);
    } catch {
      // A stale trickle candidate should not tear down the WebSocket fallback.
    }
  }

  private async flushCandidates(peer: PeerLink): Promise<void> {
    const pending = peer.pendingCandidates.splice(0);
    for (const candidate of pending) {
      try {
        await peer.connection.addIceCandidate(candidate);
      } catch {
        // Ignore candidates from an abandoned negotiation generation.
      }
    }
  }

  private acceptGuestPacket(data: WireMessage, expectedPlayerId?: string): void {
    if (!this.localIsHost || !data.frame) return;
    const sourceId = expectedPlayerId ?? data.frame.playerId;
    const source = this.currentPlayers.get(sourceId);
    if (!source || source.host || (expectedPlayerId && data.frame.playerId !== expectedPlayerId)) return;
    const frame = sanitizePlayerFrame(data.frame, source);
    if (!frame || !this.acceptSequence(sourceId, data.seq)) return;
    const packet: StatePacket = {
      type: "player.state",
      frame,
      seq: typeof data.seq === "number" ? data.seq : frame.tick,
      sentAt: typeof data.sentAt === "number" ? data.sentAt : Date.now(),
    };
    this.events.onPlayerState(frame);
    this.forwardFromHost(packet, sourceId);
  }

  private acceptRemotePacket(data: WireMessage): void {
    if (!data.frame || data.frame.playerId === this.profile.playerId) return;
    const source = this.currentPlayers.get(data.frame.playerId);
    if (!source) return;
    const frame = sanitizePlayerFrame(data.frame, source);
    if (!frame || !this.acceptSequence(source.playerId, data.seq)) return;
    this.events.onPlayerState(frame);
  }

  private acceptSequence(playerId: string, value: unknown): boolean {
    if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) return true;
    const previous = this.lastSequenceByPlayer.get(playerId);
    if (previous !== undefined && value <= previous) return false;
    this.lastSequenceByPlayer.set(playerId, value);
    return true;
  }

  private forwardFromHost(packet: StatePacket, excludePlayerId?: string): void {
    for (const player of this.currentPlayers.values()) {
      if (player.host || player.playerId === this.profile.playerId || player.playerId === excludePlayerId) continue;
      const peer = this.peers.get(player.playerId);
      if (!this.sendDataChannel(peer, packet)) {
        this.sendSocket({ ...packet, type: "host.relay-state", targetId: player.playerId });
      }
    }
  }

  private sendDataChannel(peer: PeerLink | undefined, packet: StatePacket): boolean {
    if (!peer?.channel || peer.channel.readyState !== "open") return false;
    if (peer.channel.bufferedAmount > 64 * 1024) return false;
    try {
      peer.channel.send(JSON.stringify(packet));
      return true;
    } catch {
      return false;
    }
  }

  private async detectTurn(peer: PeerLink): Promise<void> {
    try {
      const stats = await peer.connection.getStats();
      let selectedLocalCandidateId = "";
      let selectedRemoteCandidateId = "";
      stats.forEach((raw) => {
        const stat = raw as RTCStats & { selected?: boolean; nominated?: boolean; state?: string; localCandidateId?: string; remoteCandidateId?: string };
        if (stat.type === "candidate-pair" && (stat.selected || (stat.nominated && stat.state === "succeeded"))) {
          selectedLocalCandidateId = stat.localCandidateId ?? "";
          selectedRemoteCandidateId = stat.remoteCandidateId ?? "";
        }
      });
      let relay = false;
      stats.forEach((raw) => {
        const stat = raw as RTCStats & { candidateType?: string };
        if ((stat.id === selectedLocalCandidateId || stat.id === selectedRemoteCandidateId) && stat.candidateType === "relay") relay = true;
      });
      peer.viaTurn = relay;
    } catch {
      peer.viaTurn = null;
    }
    this.refreshTransport();
  }

  private refreshTransport(): void {
    if (this.channel) {
      this.setTransport("local");
      return;
    }
    if (!this.opened) {
      this.setTransport("none");
      return;
    }
    const openPeers = [...this.peers.values()].filter((peer) => peer.channel?.readyState === "open");
    if (openPeers.length === 0) {
      this.setTransport("websocket-relay");
      return;
    }
    const expectedGuests = this.localIsHost
      ? [...this.currentPlayers.values()].filter((player) => !player.host).length
      : 1;
    if (openPeers.length < expectedGuests) {
      this.setTransport("webrtc-mixed");
      return;
    }
    const turnCount = openPeers.filter((peer) => peer.viaTurn === true).length;
    if (turnCount === openPeers.length) this.setTransport("webrtc-turn");
    else if (turnCount > 0) this.setTransport("webrtc-mixed");
    else this.setTransport("webrtc-direct");
  }

  private closePeer(playerId: string): void {
    const peer = this.peers.get(playerId);
    if (!peer) return;
    this.peers.delete(playerId);
    try { peer.channel?.close(); } catch { /* already closed */ }
    try { peer.connection.close(); } catch { /* already closed */ }
  }

  private closePeerLinks(): void {
    for (const playerId of [...this.peers.keys()]) this.closePeer(playerId);
    this.refreshTransport();
  }

  private removePlayer(playerId: string, emitState = true): void {
    this.currentPlayers.delete(playerId);
    this.lastSequenceByPlayer.delete(playerId);
    this.closePeer(playerId);
    this.events.onPlayerLeft(playerId);
    if (emitState) this.events.onRoomState([...this.currentPlayers.values()]);
    this.refreshTransport();
  }

  private notifyStart(): void {
    if (this.startedNotified) return;
    this.startedNotified = true;
    this.events.onStart();
  }

  private sendSocket(message: WireMessage): void {
    if (this.socket?.readyState !== WebSocket.OPEN) return;
    try {
      this.socket.send(JSON.stringify(message));
    } catch {
      // The close handler will activate the directed WebSocket retry path.
    }
  }

  private setStatus(status: RoomStatus): void {
    if (this.status === status) return;
    this.status = status;
    this.events.onStatus(status);
  }

  private setTransport(transport: RoomTransport): void {
    if (this.transport === transport) return;
    this.transport = transport;
    this.events.onTransport?.(transport);
  }

  private clearHeartbeat(): void {
    if (this.heartbeat !== null) window.clearInterval(this.heartbeat);
    this.heartbeat = null;
  }

  private clearReconnectTimer(): void {
    if (this.reconnectTimer !== null) window.clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
  }

  private enableLocalFallback(): void {
    if (this.channel || this.intentionallyClosed || !localFallbackAllowed()) return;
    const socket = this.socket;
    this.socket = null;
    socket?.close();
    if (!("BroadcastChannel" in window)) {
      this.events.onError("浏览器不支持本机联机测试通道。");
      this.setStatus("offline");
      return;
    }
    this.channel = new BroadcastChannel(`super-oreo-room-${this.normalizedRoomId}`);
    const localPlayer: RoomPlayer = {
      ...this.profile,
      ready: false,
      host: false,
      joinedAt: Date.now(),
    };
    this.fallbackPlayers.set(this.profile.playerId, localPlayer);
    this.channel.addEventListener("message", (event) => this.handleFallbackMessage(event.data as WireMessage));
    this.setStatus("fallback");
    this.setTransport("local");
    this.channel.postMessage({ type: "room.hello", player: localPlayer });
    window.setTimeout(() => this.emitFallbackState(true), 120);
  }

  private handleFallbackMessage(data: WireMessage): void {
    if (data.playerId === this.profile.playerId || data.frame?.playerId === this.profile.playerId) return;
    switch (data.type) {
      case "room.hello":
        if (data.player) {
          if (this.fallbackPlayers.size >= 4 && !this.fallbackPlayers.has(data.player.playerId)) {
            this.channel?.postMessage({ type: "room.error", playerId: data.player.playerId, message: "房间已满，最多支持 4 名玩家。" });
            return;
          }
          this.fallbackPlayers.set(data.player.playerId, data.player);
          this.emitFallbackState(true);
        }
        break;
      case "room.state":
        data.players?.forEach((player) => this.fallbackPlayers.set(player.playerId, player));
        this.emitFallbackState(false);
        break;
      case "room.ready": {
        const current = data.playerId ? this.fallbackPlayers.get(data.playerId) : undefined;
        if (current) this.fallbackPlayers.set(current.playerId, { ...current, ready: Boolean(data.ready) });
        this.emitFallbackState(false);
        break;
      }
      case "room.start":
        this.notifyStart();
        break;
      case "player.state":
        if (data.frame) this.events.onPlayerState(data.frame);
        break;
      case "player.left":
        if (data.playerId) {
          this.fallbackPlayers.delete(data.playerId);
          this.events.onPlayerLeft(data.playerId);
          this.emitFallbackState(false);
        }
        break;
      case "room.error":
        if (!data.playerId || data.playerId === this.profile.playerId) this.events.onError(data.message || "房间连接失败。");
        break;
      default:
        break;
    }
  }

  private emitFallbackState(broadcast = false): void {
    const sorted = [...this.fallbackPlayers.values()]
      .sort((a, b) => (a.joinedAt ?? 0) - (b.joinedAt ?? 0) || a.playerId.localeCompare(b.playerId))
      .slice(0, 4)
      .map((player, index) => ({ ...player, host: index === 0 }));
    this.fallbackPlayers = new Map(sorted.map((player) => [player.playerId, player]));
    this.currentPlayers = new Map(sorted.map((player) => [player.playerId, player]));
    this.localIsHost = this.currentPlayers.get(this.profile.playerId)?.host ?? false;
    this.events.onRoomState(sorted);
    if (broadcast) this.channel?.postMessage({ type: "room.state", players: sorted, playerId: this.profile.playerId });
  }
}
