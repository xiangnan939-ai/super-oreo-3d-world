export type RoomStatus = "offline" | "connecting" | "connected" | "fallback";

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
}

type WireMessage = {
  type: string;
  player?: RoomPlayer;
  players?: RoomPlayer[];
  playerId?: string;
  ready?: boolean;
  frame?: PlayerFrame;
  payload?: unknown;
  message?: string;
  sentAt?: number;
};

function makeRoomCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = new Uint8Array(6);
  if (typeof crypto !== "undefined") crypto.getRandomValues(bytes);
  return Array.from(bytes, (value) => alphabet[value % alphabet.length]).join("");
}

export async function createOnlineRoom(): Promise<string> {
  try {
    const response = await fetch("/api/rooms", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
    });
    if (response.ok) {
      const data = (await response.json()) as { roomId?: string };
      if (data.roomId) return data.roomId.toUpperCase();
    }
  } catch {
    // The in-browser fallback below keeps local previews playable.
  }
  return makeRoomCode();
}

export class RoomConnection {
  private socket: WebSocket | null = null;
  private channel: BroadcastChannel | null = null;
  private fallbackPlayers = new Map<string, RoomPlayer>();
  private status: RoomStatus = "offline";
  private fallbackTimer: number | null = null;
  private heartbeat: number | null = null;
  private intentionallyClosed = false;
  private opened = false;

  constructor(
    private readonly roomId: string,
    private readonly profile: PlayerProfile,
    private readonly events: RoomConnectionEvents,
  ) {}

  async connect(): Promise<void> {
    this.intentionallyClosed = false;
    this.setStatus("connecting");
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const params = new URLSearchParams({
      playerId: this.profile.playerId,
      name: this.profile.name,
      skin: this.profile.skin,
    });
    const url = `${protocol}//${window.location.host}/api/rooms/${encodeURIComponent(this.roomId)}/ws?${params}`;

    await new Promise<void>((resolve) => {
      let settled = false;
      const finish = () => {
        if (settled) return;
        settled = true;
        resolve();
      };

      try {
        this.socket = new WebSocket(url);
        this.socket.addEventListener("open", () => {
          this.opened = true;
          if (this.fallbackTimer !== null) window.clearTimeout(this.fallbackTimer);
          this.setStatus("connected");
          this.socket?.send(JSON.stringify({ type: "room.join", player: { ...this.profile } }));
          this.heartbeat = window.setInterval(() => this.send({ type: "connection.ping", sentAt: Date.now() }), 8_000);
          finish();
        });
        this.socket.addEventListener("message", (event) => this.handleMessage(event.data));
        this.socket.addEventListener("error", () => {
          if (!this.opened) {
            this.enableFallback();
            finish();
          }
        });
        this.socket.addEventListener("close", () => {
          this.opened = false;
          if (!this.intentionallyClosed && !this.channel) this.enableFallback();
          finish();
        });
      } catch {
        this.enableFallback();
        finish();
      }

      this.fallbackTimer = window.setTimeout(() => {
        if (!this.opened) {
          this.socket?.close();
          this.enableFallback();
          finish();
        }
      }, 2_800);
    });
  }

  disconnect() {
    this.intentionallyClosed = true;
    if (this.fallbackTimer !== null) window.clearTimeout(this.fallbackTimer);
    if (this.heartbeat !== null) window.clearInterval(this.heartbeat);
    if (this.channel) {
      this.channel.postMessage({ type: "player.left", playerId: this.profile.playerId });
      this.channel.close();
    }
    this.channel = null;
    this.socket?.close(1000, "Leaving room");
    this.socket = null;
    this.fallbackPlayers.clear();
    this.opened = false;
    this.setStatus("offline");
  }

  setReady(ready: boolean) {
    this.send({ type: "room.ready", ready, playerId: this.profile.playerId });
    if (this.channel) {
      const current = this.fallbackPlayers.get(this.profile.playerId);
      if (current) this.fallbackPlayers.set(this.profile.playerId, { ...current, ready });
      this.emitFallbackState();
    }
  }

  startGame() {
    this.send({ type: "room.start", playerId: this.profile.playerId });
  }

  sendPlayerState(frame: PlayerFrame) {
    this.send({ type: "player.state", frame });
  }

  sendFinish(result: { elapsedMs: number; coins: number; deaths: number }) {
    this.send({
      type: "player.finish",
      playerId: this.profile.playerId,
      payload: result,
    });
  }

  private setStatus(status: RoomStatus) {
    this.status = status;
    this.events.onStatus(status);
  }

  private send(message: WireMessage) {
    if (this.socket?.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify(message));
      return;
    }
    this.channel?.postMessage(message);
    if (message.type === "room.start") this.events.onStart();
  }

  private handleMessage(raw: unknown) {
    try {
      const data = typeof raw === "string" ? (JSON.parse(raw) as WireMessage) : (raw as WireMessage);
      switch (data.type) {
        case "room.state":
          if (Array.isArray(data.players)) this.events.onRoomState(data.players);
          break;
        case "room.start":
        case "game.start":
          this.events.onStart();
          break;
        case "player.state":
          if (data.frame) this.events.onPlayerState(data.frame);
          break;
        case "player.left":
          if (data.playerId) this.events.onPlayerLeft(data.playerId);
          break;
        case "room.error":
        case "error":
          this.events.onError(data.message || "房间连接遇到问题，请重试。");
          break;
        case "connection.ping":
          this.send({ type: "connection.pong", sentAt: data.sentAt });
          break;
        default:
          break;
      }
    } catch {
      this.events.onError("收到了一条无法识别的房间消息。");
    }
  }

  private enableFallback() {
    if (this.channel || this.intentionallyClosed) return;
    this.socket?.close();
    this.socket = null;
    if (!("BroadcastChannel" in window)) {
      this.events.onError("浏览器不支持联机通道，请使用较新的 Chrome、Edge 或 Safari。");
      this.setStatus("offline");
      return;
    }
    this.channel = new BroadcastChannel(`super-oreo-room-${this.roomId}`);
    const localPlayer: RoomPlayer = {
      ...this.profile,
      ready: false,
      host: false,
      joinedAt: Date.now(),
    };
    this.fallbackPlayers.set(this.profile.playerId, localPlayer);
    this.channel.addEventListener("message", (event) => this.handleFallbackMessage(event.data as WireMessage));
    this.setStatus("fallback");
    this.channel.postMessage({ type: "room.hello", player: localPlayer });
    window.setTimeout(() => this.emitFallbackState(true), 120);
  }

  private handleFallbackMessage(data: WireMessage) {
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
        this.events.onStart();
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

  private emitFallbackState(broadcast = false) {
    const sorted = [...this.fallbackPlayers.values()]
      .sort((a, b) => (a.joinedAt ?? 0) - (b.joinedAt ?? 0) || a.playerId.localeCompare(b.playerId))
      .slice(0, 4)
      .map((player, index) => ({ ...player, host: index === 0 }));
    this.fallbackPlayers = new Map(sorted.map((player) => [player.playerId, player]));
    this.events.onRoomState(sorted);
    if (broadcast) this.channel?.postMessage({ type: "room.state", players: sorted, playerId: this.profile.playerId });
  }
}
