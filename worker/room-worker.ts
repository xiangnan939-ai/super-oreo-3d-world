const MAX_PLAYERS = 4;
const ROOM_CODE_LENGTH = 6;
const ROOM_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const ROOM_CODE_PATTERN = /^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$/;
const ROOM_STORAGE_KEY = "room";
const MAX_MESSAGE_BYTES = 32 * 1024;
const MAX_GUEST_MESSAGES_PER_SECOND = 180;
const MAX_HOST_MESSAGES_PER_SECOND = 420;
const MIN_STATE_INTERVAL_MS = 8;
const HOST_RECONNECT_GRACE_MS = 15_000;
export const GUEST_RECONNECT_GRACE_MS = 45_000;
const ROOM_IDLE_TTL_MS = 6 * 60 * 60 * 1_000;
const MAX_POSITION = 10_000;
const MAX_VELOCITY = 500;

type DurableObjectIdLike = object;

interface DurableObjectStubLike {
  fetch(request: Request): Promise<Response>;
}

interface DurableObjectNamespaceLike {
  idFromName(name: string): DurableObjectIdLike;
  get(id: DurableObjectIdLike): DurableObjectStubLike;
}

interface DurableObjectStorageLike {
  get<T>(key: string): Promise<T | undefined>;
  put<T>(key: string, value: T): Promise<void>;
  deleteAll(): Promise<void>;
  setAlarm(scheduledTime: number | Date): Promise<void>;
}

interface DurableObjectStateLike {
  storage: DurableObjectStorageLike;
  blockConcurrencyWhile<T>(callback: () => Promise<T>): Promise<T>;
  acceptWebSocket(webSocket: WebSocket): void;
  getWebSockets(tag?: string): WebSocket[];
}

interface CloudflareWebSocket extends WebSocket {
  deserializeAttachment(): unknown;
  serializeAttachment(attachment: unknown): void;
}

interface WebSocketPairLike {
  0: CloudflareWebSocket;
  1: CloudflareWebSocket;
}

declare const WebSocketPair: {
  new (): WebSocketPairLike;
};

interface WebSocketResponseInit extends ResponseInit {
  webSocket: WebSocket;
}

interface Env {
  GAME_ROOMS: DurableObjectNamespaceLike;
  /** A comma-separated allowlist. */
  ALLOWED_ORIGINS?: string;
}

export interface PlayerAttachment {
  playerId: string;
  name: string;
  skin: string;
  ready: boolean;
  host: boolean;
  joinedAt: number;
  reconnectToken: string;
  rateWindowStartedAt: number;
  rateCount: number;
  lastStateAt: number;
  reconnectOnClose: boolean;
}

export interface PublicRoomPlayer {
  playerId: string;
  name: string;
  skin: string;
  ready: boolean;
  host: boolean;
  joinedAt: number;
}

export interface GuestReconnectLease {
  playerId: string;
  tokenHash: string;
  name: string;
  skin: string;
  ready: boolean;
  joinedAt: number;
  expiresAt: number;
}

interface FinishResult {
  playerId: string;
  rank: number;
  finishedAt: number;
  timeMs?: number;
}

interface RoomRecord {
  roomId: string;
  createdAt: number;
  lastActiveAt: number;
  hostTokenHash?: string;
  hostDisconnectedAt?: number;
  started: boolean;
  startedAt?: number;
  finishes: FinishResult[];
  reconnectLeases?: Record<string, GuestReconnectLease>;
}

interface ClientMessage {
  type?: unknown;
  player?: unknown;
  ready?: unknown;
  state?: unknown;
  frame?: unknown;
  payload?: unknown;
  seq?: unknown;
  ts?: unknown;
  clientTime?: unknown;
  sentAt?: unknown;
  timeMs?: unknown;
  targetId?: unknown;
  sdp?: unknown;
  candidate?: unknown;
}

export interface ServerPlayerFrame extends PublicRoomPlayer {
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

function jsonResponse(body: unknown, status = 200, headers?: HeadersInit): Response {
  const responseHeaders = new Headers(headers);
  responseHeaders.set("cache-control", "no-store");
  return Response.json(body, { status, headers: responseHeaders });
}

function configuredOrigins(env: Env): string[] {
  return (env.ALLOWED_ORIGINS || "*")
    .split(",")
    .map((origin) => origin.trim().replace(/\/$/, ""))
    .filter(Boolean);
}

function requestOriginIsAllowed(request: Request, env: Env): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  const allowed = configuredOrigins(env);
  return allowed.includes("*") || allowed.includes(origin.replace(/\/$/, ""));
}

function corsHeaders(request: Request, env: Env): Headers {
  const headers = new Headers({
    "access-control-allow-headers": "content-type",
    "access-control-allow-methods": "GET, POST, OPTIONS",
    "access-control-max-age": "86400",
  });
  const requestOrigin = request.headers.get("origin");
  const allowed = configuredOrigins(env);
  if (allowed.includes("*")) headers.set("access-control-allow-origin", "*");
  else if (requestOrigin && allowed.includes(requestOrigin.replace(/\/$/, ""))) {
    headers.set("access-control-allow-origin", requestOrigin);
    headers.set("vary", "Origin");
  }
  return headers;
}

function apiJson(request: Request, env: Env, body: unknown, status = 200): Response {
  return jsonResponse(body, status, corsHeaders(request, env));
}

function withCors(response: Response, request: Request, env: Env): Response {
  const headers = new Headers(response.headers);
  corsHeaders(request, env).forEach((value, key) => headers.set(key, value));
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

function createRoomCode(): string {
  const bytes = new Uint8Array(ROOM_CODE_LENGTH);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => ROOM_CODE_ALPHABET[byte % ROOM_CODE_ALPHABET.length]).join("");
}

function randomToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function hashToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function messageRateLimitForRole(host: boolean): number {
  return host ? MAX_HOST_MESSAGES_PER_SECOND : MAX_GUEST_MESSAGES_PER_SECOND;
}

export async function createGuestReconnectLease(
  player: Pick<PlayerAttachment, "playerId" | "reconnectToken" | "name" | "skin" | "ready" | "joinedAt">,
  now = Date.now(),
): Promise<GuestReconnectLease> {
  return {
    playerId: player.playerId,
    tokenHash: await hashToken(player.reconnectToken),
    name: player.name,
    skin: player.skin,
    ready: player.ready,
    joinedAt: player.joinedAt,
    expiresAt: now + GUEST_RECONNECT_GRACE_MS,
  };
}

export async function guestReconnectLeaseMatches(
  lease: GuestReconnectLease | undefined,
  playerId: string,
  token: string,
  now = Date.now(),
): Promise<boolean> {
  return Boolean(
    lease &&
    lease.playerId === playerId &&
    token &&
    lease.expiresAt > now &&
    await hashToken(token) === lease.tokenHash
  );
}

function cleanText(value: string | null, fallback: string, maxLength: number): string {
  const cleaned = value?.trim().replace(/[\u0000-\u001f\u007f]/g, "");
  return cleaned ? cleaned.slice(0, maxLength) : fallback;
}

function isPlayerAttachment(value: unknown): value is PlayerAttachment {
  if (!value || typeof value !== "object") return false;
  const player = value as Partial<PlayerAttachment>;
  return (
    typeof player.playerId === "string" &&
    typeof player.name === "string" &&
    typeof player.skin === "string" &&
    typeof player.ready === "boolean" &&
    typeof player.host === "boolean" &&
    typeof player.joinedAt === "number" &&
    typeof player.reconnectToken === "string" &&
    typeof player.rateWindowStartedAt === "number" &&
    typeof player.rateCount === "number" &&
    typeof player.lastStateAt === "number" &&
    (player.reconnectOnClose === undefined || typeof player.reconnectOnClose === "boolean")
  );
}

function socketAttachment(socket: WebSocket): PlayerAttachment | null {
  try {
    const attachment = (socket as CloudflareWebSocket).deserializeAttachment();
    return isPlayerAttachment(attachment) ? attachment : null;
  } catch {
    return null;
  }
}

function publicPlayer(player: PlayerAttachment): PublicRoomPlayer {
  return {
    playerId: player.playerId,
    name: player.name,
    skin: player.skin,
    ready: player.ready,
    host: player.host,
    joinedAt: player.joinedAt,
  };
}

function sendJson(socket: WebSocket, message: unknown): void {
  if (socket.readyState !== WebSocket.OPEN) return;
  try {
    socket.send(JSON.stringify(message));
  } catch {
    // Presence cleanup is owned by the close/error callbacks.
  }
}

function finiteWithin(value: unknown, maximum: number): value is number {
  return typeof value === "number" && Number.isFinite(value) && Math.abs(value) <= maximum;
}

export function sanitizeServerFrame(value: unknown, player: PublicRoomPlayer): ServerPlayerFrame | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const frame = value as Partial<ServerPlayerFrame>;
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
  ) return null;

  return {
    ...player,
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

/**
 * This helper is deliberately small and exported for a protocol invariant
 * test: a guest frame has exactly one cloud recipient, the host. Only a host
 * may address a guest, which keeps the fallback topology host-mediated.
 */
export function directedStateRecipients(
  sender: PublicRoomPlayer,
  players: PublicRoomPlayer[],
  targetId?: string,
): string[] {
  if (!sender.host) {
    const host = players.find((player) => player.host);
    return host ? [host.playerId] : [];
  }
  if (targetId) {
    const target = players.find((player) => player.playerId === targetId && !player.host);
    return target ? [target.playerId] : [];
  }
  return players.filter((player) => !player.host).map((player) => player.playerId);
}

/** A single room used for presence, signaling and directed fallback transport. */
export class GameRoom {
  private readonly state: DurableObjectStateLike;
  private room: RoomRecord | null = null;
  private readonly initialized: Promise<void>;

  constructor(state: DurableObjectStateLike) {
    this.state = state;
    this.initialized = state.blockConcurrencyWhile(async () => {
      this.room = (await state.storage.get<RoomRecord>(ROOM_STORAGE_KEY)) ?? null;
    });
  }

  async fetch(request: Request): Promise<Response> {
    await this.initialized;
    const url = new URL(request.url);

    if (url.pathname === "/internal/create" && request.method === "POST") return this.create(request);
    if (url.pathname === "/internal/status" && request.method === "GET") {
      if (!this.room) return jsonResponse({ error: "ROOM_NOT_FOUND" }, 404);
      if (this.pruneExpiredReconnectLeases(Date.now())) await this.persistRoom();
      const players = this.playerSockets();
      const activePlayerIds = new Set(players.map(({ player }) => player.playerId));
      const reservedGuestSeats = Object.values(this.room.reconnectLeases ?? {})
        .filter((lease) => !activePlayerIds.has(lease.playerId))
        .length;
      const hostConnected = players.some(({ player }) => player.host);
      return jsonResponse({
        roomId: this.room.roomId,
        started: this.room.started,
        players: players.length,
        maxPlayers: MAX_PLAYERS,
        full: players.length + reservedGuestSeats + (hostConnected ? 0 : 1) >= MAX_PLAYERS,
        hostConnected,
      });
    }

    if (request.method !== "GET" || request.headers.get("upgrade")?.toLowerCase() !== "websocket") {
      return jsonResponse({ error: "WEBSOCKET_UPGRADE_REQUIRED" }, 426);
    }
    if (!this.room) return jsonResponse({ error: "ROOM_NOT_FOUND" }, 404);
    return this.connect(url);
  }

  async alarm(): Promise<void> {
    await this.initialized;
    if (!this.room) return;
    const now = Date.now();
    const hostConnected = this.playerSockets().some(({ player }) => player.host);
    let roomChanged = this.pruneExpiredReconnectLeases(now);
    if (hostConnected && this.room.hostDisconnectedAt) {
      delete this.room.hostDisconnectedAt;
      roomChanged = true;
    }
    if (roomChanged) await this.persistRoom();
    if (
      !hostConnected &&
      this.room.hostDisconnectedAt &&
      now - this.room.hostDisconnectedAt >= HOST_RECONNECT_GRACE_MS
    ) {
      await this.closeRoom("房主连接超时，房间已关闭。");
      return;
    }
    const connectedPlayers = this.playerSockets().length;
    if (connectedPlayers === 0 && now - this.room.lastActiveAt >= ROOM_IDLE_TTL_MS) {
      await this.closeRoom("房间长时间无人使用，已自动关闭。");
      return;
    }
    if (connectedPlayers > 0 && this.room.lastActiveAt + ROOM_IDLE_TTL_MS <= now) {
      this.room.lastActiveAt = now;
      await this.persistRoom();
    }
    await this.scheduleAlarm();
  }

  async webSocketMessage(socket: WebSocket, message: string | ArrayBuffer): Promise<void> {
    await this.initialized;
    const attachedPlayer = socketAttachment(socket);
    if (!attachedPlayer || !this.room) return;
    let player: PlayerAttachment = attachedPlayer;

    if (typeof message !== "string" || new TextEncoder().encode(message).byteLength > MAX_MESSAGE_BYTES) {
      this.sendError(socket, "INVALID_MESSAGE", "Only JSON messages up to 32 KiB are supported.");
      return;
    }

    const now = Date.now();
    if (now - player.rateWindowStartedAt >= 1_000) {
      player = { ...player, rateWindowStartedAt: now, rateCount: 1 };
    } else {
      player = { ...player, rateCount: player.rateCount + 1 };
    }
    (socket as CloudflareWebSocket).serializeAttachment(player);
    if (player.rateCount > messageRateLimitForRole(player.host)) {
      this.sendError(socket, "RATE_LIMITED", "Too many room messages.");
      socket.close(1008, "Rate limited");
      return;
    }

    let data: ClientMessage;
    try {
      data = JSON.parse(message) as ClientMessage;
    } catch {
      this.sendError(socket, "INVALID_JSON", "Message must be valid JSON.");
      return;
    }

    this.room.lastActiveAt = now;
    switch (data.type) {
      case "room.join": {
        const requested = data.player && typeof data.player === "object"
          ? data.player as { name?: unknown; skin?: unknown }
          : null;
        const nextPlayer: PlayerAttachment = {
          ...player,
          name: cleanText(typeof requested?.name === "string" ? requested.name : null, player.name, 20),
          skin: cleanText(typeof requested?.skin === "string" ? requested.skin : null, player.skin, 32),
        };
        (socket as CloudflareWebSocket).serializeAttachment(nextPlayer);
        await this.persistRoom();
        this.broadcastRoomState();
        break;
      }

      case "room.ready": {
        const nextPlayer = {
          ...player,
          ready: typeof data.ready === "boolean" ? data.ready : !player.ready,
        };
        (socket as CloudflareWebSocket).serializeAttachment(nextPlayer);
        await this.persistRoom();
        this.broadcastRoomState();
        break;
      }

      case "room.start": {
        if (!player.host) return this.sendError(socket, "HOST_ONLY", "Only the room host can start the game.");
        if (this.room.started) return this.sendError(socket, "ALREADY_STARTED", "The game has already started.");
        this.room.started = true;
        this.room.startedAt = now;
        await this.persistRoom();
        this.broadcast({ type: "room.start", roomId: this.room.roomId, by: player.playerId, startedAt: now });
        this.broadcastRoomState();
        break;
      }

      case "room.leave":
        if (player.host) await this.closeRoom("房主已离开，房间已关闭。");
        else {
          const leavingPlayer = { ...player, reconnectOnClose: false };
          (socket as CloudflareWebSocket).serializeAttachment(leavingPlayer);
          if (this.room.reconnectLeases?.[player.playerId]) {
            delete this.room.reconnectLeases[player.playerId];
            await this.persistRoom();
          }
          socket.close(1000, "Leaving room");
        }
        break;

      case "signal.offer":
      case "signal.answer":
      case "signal.ice":
        this.routeSignal(socket, player, data);
        break;

      case "player.state": {
        if (now - player.lastStateAt < MIN_STATE_INTERVAL_MS) return;
        player = { ...player, lastStateAt: now };
        (socket as CloudflareWebSocket).serializeAttachment(player);
        const frame = sanitizeServerFrame(data.frame ?? data.state, publicPlayer(player));
        if (!frame) return this.sendError(socket, "INVALID_STATE", "player.state contains an invalid frame.");
        const players = this.playerSockets().map(({ player: current }) => publicPlayer(current));
        const recipients = directedStateRecipients(publicPlayer(player), players);
        this.sendToPlayers(recipients, {
          type: player.host ? "player.state" : "relay.player-state",
          frame,
          ...(typeof data.seq === "number" ? { seq: data.seq } : {}),
          ...(typeof data.sentAt === "number" ? { sentAt: data.sentAt } : {}),
        });
        break;
      }

      case "host.relay-state": {
        if (!player.host) return this.sendError(socket, "HOST_ONLY", "Only the host can relay player state.");
        if (typeof data.targetId !== "string") return this.sendError(socket, "TARGET_REQUIRED", "A relay target is required.");
        const players = this.playerSockets().map(({ player: current }) => publicPlayer(current));
        const sourceId = data.frame && typeof data.frame === "object"
          ? (data.frame as { playerId?: unknown }).playerId
          : null;
        const source = typeof sourceId === "string" ? players.find((current) => current.playerId === sourceId) : undefined;
        if (!source) return this.sendError(socket, "UNKNOWN_SOURCE", "The relayed player is not in this room.");
        const frame = sanitizeServerFrame(data.frame, source);
        if (!frame) return this.sendError(socket, "INVALID_STATE", "host.relay-state contains an invalid frame.");
        const recipients = directedStateRecipients(publicPlayer(player), players, data.targetId);
        if (recipients.length !== 1) return this.sendError(socket, "INVALID_TARGET", "The relay target is not a guest in this room.");
        this.sendToPlayers(recipients, {
          type: "player.state",
          frame,
          ...(typeof data.seq === "number" ? { seq: data.seq } : {}),
          ...(typeof data.sentAt === "number" ? { sentAt: data.sentAt } : {}),
        });
        break;
      }

      case "player.finish": {
        const existing = this.room.finishes.find((result) => result.playerId === player.playerId);
        if (existing) {
          sendJson(socket, { type: "player.finish", ...existing });
          return;
        }
        const finishPayload = data.payload && typeof data.payload === "object"
          ? data.payload as { elapsedMs?: unknown }
          : null;
        const submittedTime = typeof data.timeMs === "number" ? data.timeMs : finishPayload?.elapsedMs;
        const result: FinishResult = {
          playerId: player.playerId,
          rank: this.room.finishes.length + 1,
          finishedAt: now,
          ...(typeof submittedTime === "number" && Number.isFinite(submittedTime)
            ? { timeMs: Math.max(0, Math.round(submittedTime)) }
            : {}),
        };
        this.room.finishes.push(result);
        await this.persistRoom();
        this.broadcast({ type: "player.finish", ...result });
        this.broadcastRoomState();
        break;
      }

      case "ping":
        sendJson(socket, {
          type: "pong",
          ...(typeof data.ts === "number" ? { ts: data.ts } : {}),
          ...(typeof data.clientTime === "number" ? { clientTime: data.clientTime } : {}),
          serverTime: now,
        });
        break;

      case "connection.ping":
        sendJson(socket, {
          type: "connection.pong",
          ...(typeof data.sentAt === "number" ? { sentAt: data.sentAt } : {}),
          serverTime: now,
        });
        break;

      case "connection.pong":
        break;

      default:
        this.sendError(socket, "UNKNOWN_MESSAGE", "Unknown message type.");
    }
  }

  async webSocketClose(socket: WebSocket, code: number, reason: string): Promise<void> {
    await this.initialized;
    const player = socketAttachment(socket);
    try { socket.close(code, reason); } catch { /* already closed */ }
    if (player?.host && code === 4000 && this.room) {
      await this.closeRoom("房主已离开，房间已关闭。");
      return;
    }
    if (player) {
      await this.handleDeparture(socket, code === 4000 ? { ...player, reconnectOnClose: false } : player);
    }
  }

  async webSocketError(socket: WebSocket): Promise<void> {
    await this.initialized;
    const player = socketAttachment(socket);
    try { socket.close(1011, "WebSocket error"); } catch { /* already closed */ }
    if (player) await this.handleDeparture(socket, player);
  }

  private async create(request: Request): Promise<Response> {
    if (this.room) return jsonResponse({ error: "ROOM_EXISTS" }, 409);
    let payload: { roomId?: unknown };
    try {
      payload = await request.json() as { roomId?: unknown };
    } catch {
      return jsonResponse({ error: "INVALID_JSON" }, 400);
    }
    if (typeof payload.roomId !== "string" || !ROOM_CODE_PATTERN.test(payload.roomId)) {
      return jsonResponse({ error: "INVALID_ROOM_ID" }, 400);
    }
    const hostToken = randomToken();
    const now = Date.now();
    this.room = {
      roomId: payload.roomId,
      createdAt: now,
      lastActiveAt: now,
      hostTokenHash: await hashToken(hostToken),
      started: false,
      finishes: [],
      reconnectLeases: {},
    };
    await this.persistRoom();
    await this.scheduleAlarm();
    return jsonResponse({ roomId: payload.roomId, hostToken }, 201);
  }

  private async connect(url: URL): Promise<Response> {
    if (!this.room) return jsonResponse({ error: "ROOM_NOT_FOUND" }, 404);
    const now = Date.now();
    const playerId = cleanText(url.searchParams.get("playerId"), crypto.randomUUID(), 64);
    const name = cleanText(url.searchParams.get("name"), "Player", 20);
    const skin = cleanText(url.searchParams.get("skin"), "classic", 32);
    const suppliedHostToken = url.searchParams.get("hostToken") ?? "";
    const validHostCredential = this.room.hostTokenHash
      ? Boolean(suppliedHostToken) && await hashToken(suppliedHostToken) === this.room.hostTokenHash
      : false;
    const currentSockets = this.playerSockets();
    const previous = currentSockets.find(({ player }) => player.playerId === playerId);
    const suppliedReconnectToken = url.searchParams.get("reconnectToken") ?? "";
    let roomChanged = this.pruneExpiredReconnectLeases(now);
    if (!this.room.reconnectLeases) {
      this.room.reconnectLeases = {};
      roomChanged = true;
    }
    const reconnectLease = this.room.reconnectLeases[playerId];
    const validCurrentReconnect = Boolean(previous) && suppliedReconnectToken === previous?.player.reconnectToken;
    const validGuestLease = !validHostCredential && await guestReconnectLeaseMatches(
      reconnectLease,
      playerId,
      suppliedReconnectToken,
      now,
    );
    const validReconnect = validCurrentReconnect || validGuestLease;

    if (this.room.started && !previous && !validHostCredential && !validGuestLease) {
      return jsonResponse({ error: "ROOM_ALREADY_STARTED" }, 409);
    }
    if (previous && !validReconnect && !validHostCredential) {
      return jsonResponse({ error: "PLAYER_ID_IN_USE" }, 409);
    }
    if (reconnectLease && !validGuestLease && !validHostCredential) {
      return jsonResponse({ error: "PLAYER_ID_RESERVED" }, 409);
    }
    const hostConnected = currentSockets.some(({ player }) => player.host);
    const activePlayerIds = new Set(currentSockets.map(({ player }) => player.playerId));
    const reservedGuestSeats = Object.values(this.room.reconnectLeases)
      .filter((lease) => lease.playerId !== playerId && !activePlayerIds.has(lease.playerId))
      .length;
    const replacingActiveSocket = Boolean(previous) || (validHostCredential && hostConnected);
    const projectedPlayers = currentSockets.length + (replacingActiveSocket ? 0 : 1);
    const reservedHostSeat = hostConnected || validHostCredential ? 0 : 1;
    if (projectedPlayers + reservedGuestSeats + reservedHostSeat > MAX_PLAYERS) {
      return jsonResponse({ error: "ROOM_FULL", maxPlayers: MAX_PLAYERS }, 409);
    }

    if (validHostCredential) {
      for (const entry of currentSockets) {
        if (entry.player.host && entry.player.playerId !== playerId) {
          try { entry.socket.close(4001, "Host reconnected from another client"); } catch { /* stale */ }
        }
      }
    }
    if (previous) {
      try { previous.socket.close(4001, "Reconnected from another client"); } catch { /* stale */ }
    }

    const pair = new WebSocketPair();
    const client = pair[0];
    const server = pair[1];
    const legacyFirstHost = !this.room.hostTokenHash && currentSockets.length === 0;
    const attachment: PlayerAttachment = {
      playerId,
      name: previous?.player.name ?? (validGuestLease ? reconnectLease.name : name),
      skin: previous?.player.skin ?? (validGuestLease ? reconnectLease.skin : skin),
      ready: previous?.player.ready ?? (validGuestLease ? reconnectLease.ready : false),
      host: validHostCredential || legacyFirstHost,
      joinedAt: previous?.player.joinedAt ?? (validGuestLease ? reconnectLease.joinedAt : now),
      reconnectToken: previous?.player.reconnectToken ?? randomToken(),
      rateWindowStartedAt: now,
      rateCount: 0,
      lastStateAt: 0,
      reconnectOnClose: true,
    };

    this.state.acceptWebSocket(server);
    server.serializeAttachment(attachment);
    if (reconnectLease && (validGuestLease || validHostCredential)) {
      delete this.room.reconnectLeases[playerId];
      roomChanged = true;
    }
    if (attachment.host) {
      delete this.room.hostDisconnectedAt;
      roomChanged = true;
    }
    if (roomChanged) await this.persistRoom();
    sendJson(server, {
      type: "room.joined",
      roomId: this.room.roomId,
      player: publicPlayer(attachment),
      reconnectToken: attachment.reconnectToken,
      maxPlayers: MAX_PLAYERS,
    });
    this.broadcastRoomState();
    await this.scheduleAlarm();

    return new Response(null, {
      status: 101,
      webSocket: client,
    } as WebSocketResponseInit);
  }

  private routeSignal(socket: WebSocket, sender: PlayerAttachment, data: ClientMessage): void {
    if (typeof data.targetId !== "string") return this.sendError(socket, "TARGET_REQUIRED", "A signal target is required.");
    const target = this.playerSockets().find(({ player }) => player.playerId === data.targetId);
    if (!target || target.player.playerId === sender.playerId) {
      return this.sendError(socket, "INVALID_TARGET", "The signal target is not in this room.");
    }
    if (!sender.host && !target.player.host) {
      return this.sendError(socket, "HOST_STAR_ONLY", "Guests may only negotiate with the host.");
    }
    if ((data.type === "signal.offer" || data.type === "signal.answer") && typeof data.sdp !== "string") {
      return this.sendError(socket, "SDP_REQUIRED", "An SDP description is required.");
    }
    if (data.type === "signal.offer" && !sender.host) {
      return this.sendError(socket, "HOST_OFFER_ONLY", "Only the host initiates peer connections.");
    }
    if (data.type === "signal.answer" && !target.player.host) {
      return this.sendError(socket, "HOST_TARGET_REQUIRED", "Answers must target the host.");
    }
    sendJson(target.socket, {
      type: data.type,
      fromId: sender.playerId,
      targetId: target.player.playerId,
      ...(typeof data.sdp === "string" ? { sdp: data.sdp.slice(0, 24 * 1024) } : {}),
      ...(data.candidate && typeof data.candidate === "object" ? { candidate: data.candidate } : {}),
    });
  }

  private async handleDeparture(socket: WebSocket, player: PlayerAttachment): Promise<void> {
    if (!this.room) return;
    const remainingPlayers = this.playerSockets(socket);
    const replacement = remainingPlayers.find(({ player: current }) => current.playerId === player.playerId);
    if (replacement) {
      this.broadcastRoomState(socket);
      return;
    }
    this.broadcast({ type: "player.left", playerId: player.playerId }, socket);
    if (player.host) {
      if (remainingPlayers.some(({ player: current }) => current.host)) {
        this.broadcastRoomState(socket);
        return;
      }
      this.room.hostDisconnectedAt = Date.now();
      this.room.lastActiveAt = Date.now();
      this.broadcast({ type: "room.host-disconnected", graceMs: HOST_RECONNECT_GRACE_MS }, socket);
      await this.persistRoom();
      await this.scheduleAlarm();
    } else if (player.reconnectOnClose !== false) {
      this.room.reconnectLeases ??= {};
      this.room.reconnectLeases[player.playerId] = await createGuestReconnectLease(player);
      await this.persistRoom();
      await this.scheduleAlarm();
    } else if (this.room.reconnectLeases?.[player.playerId]) {
      delete this.room.reconnectLeases[player.playerId];
      await this.persistRoom();
    }
    this.broadcastRoomState(socket);
  }

  private playerSockets(except?: WebSocket): Array<{ socket: WebSocket; player: PlayerAttachment }> {
    const unique = new Map<string, { socket: WebSocket; player: PlayerAttachment }>();
    for (const socket of this.state.getWebSockets()) {
      if (socket === except || socket.readyState !== WebSocket.OPEN) continue;
      const player = socketAttachment(socket);
      if (player) unique.set(player.playerId, { socket, player });
    }
    return [...unique.values()].sort((a, b) => a.player.joinedAt - b.player.joinedAt);
  }

  private sendToPlayers(playerIds: string[], message: unknown): void {
    const ids = new Set(playerIds);
    for (const { socket, player } of this.playerSockets()) {
      if (ids.has(player.playerId)) sendJson(socket, message);
    }
  }

  private broadcast(message: unknown, except?: WebSocket): void {
    for (const { socket } of this.playerSockets(except)) sendJson(socket, message);
  }

  private broadcastRoomState(except?: WebSocket): void {
    if (!this.room) return;
    const players = this.playerSockets(except).map(({ player }) => publicPlayer(player));
    this.broadcast({
      type: "room.state",
      roomId: this.room.roomId,
      started: this.room.started,
      ...(this.room.startedAt ? { startedAt: this.room.startedAt } : {}),
      maxPlayers: MAX_PLAYERS,
      players,
      finishes: this.room.finishes,
      serverTime: Date.now(),
    }, except);
  }

  private sendError(socket: WebSocket, code: string, message: string): void {
    sendJson(socket, { type: "room.error", code, message });
  }

  private async closeRoom(message: string): Promise<void> {
    this.broadcast({ type: "room.closed", code: "HOST_LEFT", message });
    for (const { socket } of this.playerSockets()) {
      try { socket.close(4002, message); } catch { /* already closed */ }
    }
    this.room = null;
    await this.state.storage.deleteAll();
  }

  private async scheduleAlarm(): Promise<void> {
    if (!this.room) return;
    const lastActiveAt = Number.isFinite(this.room.lastActiveAt) ? this.room.lastActiveAt : this.room.createdAt;
    const idleAt = lastActiveAt + ROOM_IDLE_TTL_MS;
    const hostGraceAt = this.room.hostDisconnectedAt
      ? this.room.hostDisconnectedAt + HOST_RECONNECT_GRACE_MS
      : Number.POSITIVE_INFINITY;
    const reconnectLeaseAt = Math.min(
      ...Object.values(this.room.reconnectLeases ?? {}).map((lease) => lease.expiresAt),
      Number.POSITIVE_INFINITY,
    );
    await this.state.storage.setAlarm(Math.min(idleAt, hostGraceAt, reconnectLeaseAt));
  }

  private pruneExpiredReconnectLeases(now: number): boolean {
    if (!this.room?.reconnectLeases) return false;
    let changed = false;
    for (const [playerId, lease] of Object.entries(this.room.reconnectLeases)) {
      if (lease.expiresAt <= now) {
        delete this.room.reconnectLeases[playerId];
        changed = true;
      }
    }
    return changed;
  }

  private async persistRoom(): Promise<void> {
    if (this.room) await this.state.storage.put(ROOM_STORAGE_KEY, this.room);
  }
}

const worker = {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname.startsWith("/api/") && request.method === "OPTIONS") {
      if (!requestOriginIsAllowed(request, env)) return apiJson(request, env, { error: "ORIGIN_NOT_ALLOWED" }, 403);
      return new Response(null, { status: 204, headers: corsHeaders(request, env) });
    }
    if (!requestOriginIsAllowed(request, env)) return apiJson(request, env, { error: "ORIGIN_NOT_ALLOWED" }, 403);

    if (url.pathname === "/api/health") {
      if (request.method !== "GET") return apiJson(request, env, { error: "METHOD_NOT_ALLOWED" }, 405);
      return apiJson(request, env, { ok: true, service: "super-oreo-multiplayer", time: new Date().toISOString() });
    }

    if (url.pathname === "/api/rooms") {
      if (request.method !== "POST") return apiJson(request, env, { error: "METHOD_NOT_ALLOWED" }, 405);
      for (let attempt = 0; attempt < 8; attempt += 1) {
        const roomId = createRoomCode();
        const room = env.GAME_ROOMS.get(env.GAME_ROOMS.idFromName(roomId));
        const response = await room.fetch(new Request("https://game-room.internal/internal/create", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ roomId }),
        }));
        if (response.status === 201) return apiJson(request, env, await response.json(), 201);
        if (response.status !== 409) return apiJson(request, env, { error: "ROOM_CREATE_FAILED" }, 502);
      }
      return apiJson(request, env, { error: "ROOM_CODE_EXHAUSTED" }, 503);
    }

    const statusMatch = url.pathname.match(/^\/api\/rooms\/([A-Za-z2-9]{6})$/);
    if (statusMatch) {
      if (request.method !== "GET") return apiJson(request, env, { error: "METHOD_NOT_ALLOWED" }, 405);
      const roomId = statusMatch[1].toUpperCase();
      if (!ROOM_CODE_PATTERN.test(roomId)) return apiJson(request, env, { error: "INVALID_ROOM_ID" }, 400);
      const room = env.GAME_ROOMS.get(env.GAME_ROOMS.idFromName(roomId));
      const response = await room.fetch(new Request("https://game-room.internal/internal/status"));
      return withCors(response, request, env);
    }

    const socketMatch = url.pathname.match(/^\/api\/rooms\/([A-Za-z2-9]{6})\/ws$/);
    if (socketMatch) {
      if (request.method !== "GET") return apiJson(request, env, { error: "METHOD_NOT_ALLOWED" }, 405);
      const roomId = socketMatch[1].toUpperCase();
      if (!ROOM_CODE_PATTERN.test(roomId)) return apiJson(request, env, { error: "INVALID_ROOM_ID" }, 400);
      const room = env.GAME_ROOMS.get(env.GAME_ROOMS.idFromName(roomId));
      const response = await room.fetch(request);
      return response.status === 101 ? response : withCors(response, request, env);
    }

    return apiJson(request, env, { error: "NOT_FOUND" }, 404);
  },
};

export default worker;
