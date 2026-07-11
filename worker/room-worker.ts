const MAX_PLAYERS = 4;
const ROOM_CODE_LENGTH = 6;
const ROOM_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const ROOM_STORAGE_KEY = "room";
const MAX_MESSAGE_BYTES = 32 * 1024;

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
  /** A comma-separated allowlist. Use * while bootstrapping a public demo. */
  ALLOWED_ORIGINS?: string;
}

export interface PlayerAttachment {
  playerId: string;
  name: string;
  skin: string;
  ready: boolean;
  host: boolean;
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
  started: boolean;
  startedAt?: number;
  finishes: FinishResult[];
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

  if (allowed.includes("*")) {
    headers.set("access-control-allow-origin", "*");
  } else if (requestOrigin && allowed.includes(requestOrigin.replace(/\/$/, ""))) {
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
  const randomBytes = new Uint8Array(ROOM_CODE_LENGTH);
  crypto.getRandomValues(randomBytes);
  return Array.from(
    randomBytes,
    (byte) => ROOM_CODE_ALPHABET[byte % ROOM_CODE_ALPHABET.length],
  ).join("");
}

function cleanText(value: string | null, fallback: string, maxLength: number): string {
  const cleaned = value?.trim().replace(/[\u0000-\u001f\u007f]/g, "");
  return cleaned ? cleaned.slice(0, maxLength) : fallback;
}

function isPlayerAttachment(value: unknown): value is PlayerAttachment {
  if (!value || typeof value !== "object") return false;
  const attachment = value as Partial<PlayerAttachment>;
  return (
    typeof attachment.playerId === "string" &&
    typeof attachment.name === "string" &&
    typeof attachment.skin === "string" &&
    typeof attachment.ready === "boolean" &&
    typeof attachment.host === "boolean"
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

function sendJson(socket: WebSocket, message: unknown): void {
  if (socket.readyState !== WebSocket.OPEN) return;
  try {
    socket.send(JSON.stringify(message));
  } catch {
    // Presence cleanup is owned by the close/error callbacks.
  }
}

/** One authoritative lobby, persisted and addressed by its six-character code. */
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

    if (url.pathname === "/internal/create" && request.method === "POST") {
      return this.create(request);
    }

    if (request.method !== "GET" || request.headers.get("upgrade")?.toLowerCase() !== "websocket") {
      return jsonResponse({ error: "WEBSOCKET_UPGRADE_REQUIRED" }, 426);
    }

    if (!this.room) return jsonResponse({ error: "ROOM_NOT_FOUND" }, 404);
    return this.connect(url);
  }

  async webSocketMessage(socket: WebSocket, message: string | ArrayBuffer): Promise<void> {
    await this.initialized;
    const player = socketAttachment(socket);
    if (!player || !this.room) return;

    if (typeof message !== "string" || new TextEncoder().encode(message).byteLength > MAX_MESSAGE_BYTES) {
      this.sendError(socket, "INVALID_MESSAGE", "Only JSON messages up to 32 KiB are supported.");
      return;
    }

    let data: ClientMessage;
    try {
      data = JSON.parse(message) as ClientMessage;
    } catch {
      this.sendError(socket, "INVALID_JSON", "Message must be valid JSON.");
      return;
    }

    switch (data.type) {
      case "room.join": {
        const requestedProfile = data.player && typeof data.player === "object"
          ? data.player as { name?: unknown; skin?: unknown }
          : null;
        const nextPlayer: PlayerAttachment = {
          ...player,
          name: cleanText(
            typeof requestedProfile?.name === "string" ? requestedProfile.name : null,
            player.name,
            20,
          ),
          skin: cleanText(
            typeof requestedProfile?.skin === "string" ? requestedProfile.skin : null,
            player.skin,
            32,
          ),
        };
        (socket as CloudflareWebSocket).serializeAttachment(nextPlayer);
        this.broadcastRoomState();
        break;
      }

      case "room.ready": {
        const nextPlayer = {
          ...player,
          ready: typeof data.ready === "boolean" ? data.ready : !player.ready,
        };
        (socket as CloudflareWebSocket).serializeAttachment(nextPlayer);
        this.broadcastRoomState();
        break;
      }

      case "room.start": {
        if (!player.host) {
          this.sendError(socket, "HOST_ONLY", "Only the room host can start the game.");
          return;
        }
        if (this.room.started) {
          this.sendError(socket, "ALREADY_STARTED", "The game has already started.");
          return;
        }

        this.room.started = true;
        this.room.startedAt = Date.now();
        await this.persistRoom();
        this.broadcast({
          type: "room.start",
          roomId: this.room.roomId,
          by: player.playerId,
          startedAt: this.room.startedAt,
        });
        this.broadcastRoomState();
        break;
      }

      case "player.state": {
        const frame = data.frame && typeof data.frame === "object" && !Array.isArray(data.frame)
          ? {
              ...(data.frame as Record<string, unknown>),
              playerId: player.playerId,
              name: player.name,
              skin: player.skin,
            }
          : undefined;
        const authoritativeState = frame ?? data.state;
        if (authoritativeState === undefined) {
          this.sendError(socket, "STATE_REQUIRED", "player.state requires a state or frame field.");
          return;
        }

        this.broadcast(
          {
            type: "player.state",
            playerId: player.playerId,
            state: authoritativeState,
            ...(frame ? { frame } : {}),
            ...(typeof data.seq === "number" ? { seq: data.seq } : {}),
            ...(typeof data.clientTime === "number" ? { clientTime: data.clientTime } : {}),
          },
          socket,
        );
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
        const submittedTime = typeof data.timeMs === "number"
          ? data.timeMs
          : finishPayload?.elapsedMs;
        const result: FinishResult = {
          playerId: player.playerId,
          rank: this.room.finishes.length + 1,
          finishedAt: Date.now(),
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
          serverTime: Date.now(),
        });
        break;

      case "connection.ping":
        sendJson(socket, {
          type: "connection.pong",
          ...(typeof data.sentAt === "number" ? { sentAt: data.sentAt } : {}),
          serverTime: Date.now(),
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
    try {
      socket.close(code, reason);
    } catch {
      // The peer may already be fully closed.
    }
    if (player) this.broadcast({ type: "player.left", playerId: player.playerId }, socket);
    this.reconcileHost(socket);
    this.broadcastRoomState(socket);
  }

  async webSocketError(socket: WebSocket): Promise<void> {
    await this.initialized;
    const player = socketAttachment(socket);
    try {
      socket.close(1011, "WebSocket error");
    } catch {
      // The peer may already be fully closed.
    }
    if (player) this.broadcast({ type: "player.left", playerId: player.playerId }, socket);
    this.reconcileHost(socket);
    this.broadcastRoomState(socket);
  }

  private async create(request: Request): Promise<Response> {
    if (this.room) return jsonResponse({ error: "ROOM_EXISTS" }, 409);

    let payload: { roomId?: unknown };
    try {
      payload = (await request.json()) as { roomId?: unknown };
    } catch {
      return jsonResponse({ error: "INVALID_JSON" }, 400);
    }

    if (typeof payload.roomId !== "string" || !/^[A-Z2-9]{6}$/.test(payload.roomId)) {
      return jsonResponse({ error: "INVALID_ROOM_ID" }, 400);
    }

    this.room = {
      roomId: payload.roomId,
      createdAt: Date.now(),
      started: false,
      finishes: [],
    };
    await this.persistRoom();
    return jsonResponse({ roomId: payload.roomId }, 201);
  }

  private connect(url: URL): Response {
    const playerId = cleanText(url.searchParams.get("playerId"), crypto.randomUUID(), 64);
    const name = cleanText(url.searchParams.get("name"), "Player", 20);
    const skin = cleanText(url.searchParams.get("skin"), "classic", 32);
    const currentSockets = this.playerSockets();
    const previous = currentSockets.find(({ player }) => player.playerId === playerId);

    if (!previous && currentSockets.length >= MAX_PLAYERS) {
      return jsonResponse({ error: "ROOM_FULL", maxPlayers: MAX_PLAYERS }, 409);
    }

    if (previous) {
      try {
        previous.socket.close(4001, "Reconnected from another client");
      } catch {
        // The stale socket will disappear from presence on its close callback.
      }
    }

    const pair = new WebSocketPair();
    const client = pair[0];
    const server = pair[1];
    const attachment: PlayerAttachment = {
      playerId,
      name,
      skin,
      ready: previous?.player.ready ?? false,
      host: previous?.player.host ?? currentSockets.length === 0,
    };

    this.state.acceptWebSocket(server);
    server.serializeAttachment(attachment);
    this.reconcileHost();
    sendJson(server, {
      type: "room.joined",
      roomId: this.room?.roomId,
      player: socketAttachment(server) ?? attachment,
      maxPlayers: MAX_PLAYERS,
    });
    this.broadcastRoomState();

    return new Response(null, {
      status: 101,
      webSocket: client,
    } as WebSocketResponseInit);
  }

  private playerSockets(except?: WebSocket): Array<{ socket: WebSocket; player: PlayerAttachment }> {
    const uniquePlayers = new Map<string, { socket: WebSocket; player: PlayerAttachment }>();

    for (const socket of this.state.getWebSockets()) {
      if (socket === except || socket.readyState !== WebSocket.OPEN) continue;
      const player = socketAttachment(socket);
      if (player) uniquePlayers.set(player.playerId, { socket, player });
    }

    return [...uniquePlayers.values()];
  }

  private reconcileHost(except?: WebSocket): void {
    const players = this.playerSockets(except);
    if (players.length === 0) return;

    let hostAssigned = false;
    for (const entry of players) {
      const shouldBeHost = !hostAssigned && (
        entry.player.host || !players.some(({ player }) => player.host)
      );
      if (entry.player.host !== shouldBeHost) {
        entry.player = { ...entry.player, host: shouldBeHost };
        (entry.socket as CloudflareWebSocket).serializeAttachment(entry.player);
      }
      if (shouldBeHost) hostAssigned = true;
    }
  }

  private broadcast(message: unknown, except?: WebSocket): void {
    for (const { socket } of this.playerSockets()) {
      if (socket !== except) sendJson(socket, message);
    }
  }

  private broadcastRoomState(except?: WebSocket): void {
    if (!this.room) return;
    const players = this.playerSockets(except).map(({ player }) => player);
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

  private async persistRoom(): Promise<void> {
    if (this.room) await this.state.storage.put(ROOM_STORAGE_KEY, this.room);
  }
}

const worker = {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname.startsWith("/api/") && request.method === "OPTIONS") {
      if (!requestOriginIsAllowed(request, env)) {
        return apiJson(request, env, { error: "ORIGIN_NOT_ALLOWED" }, 403);
      }
      return new Response(null, { status: 204, headers: corsHeaders(request, env) });
    }

    if (!requestOriginIsAllowed(request, env)) {
      return apiJson(request, env, { error: "ORIGIN_NOT_ALLOWED" }, 403);
    }

    if (url.pathname === "/api/health") {
      if (request.method !== "GET") {
        return apiJson(request, env, { error: "METHOD_NOT_ALLOWED" }, 405);
      }
      return apiJson(request, env, {
        ok: true,
        service: "super-oreo-multiplayer",
        time: new Date().toISOString(),
      });
    }

    if (url.pathname === "/api/rooms") {
      if (request.method !== "POST") {
        return apiJson(request, env, { error: "METHOD_NOT_ALLOWED" }, 405);
      }

      for (let attempt = 0; attempt < 8; attempt += 1) {
        const roomId = createRoomCode();
        const room = env.GAME_ROOMS.get(env.GAME_ROOMS.idFromName(roomId));
        const response = await room.fetch(
          new Request("https://game-room.internal/internal/create", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ roomId }),
          }),
        );

        if (response.status === 201) return apiJson(request, env, { roomId }, 201);
        if (response.status !== 409) {
          return apiJson(request, env, { error: "ROOM_CREATE_FAILED" }, 502);
        }
      }

      return apiJson(request, env, { error: "ROOM_CODE_EXHAUSTED" }, 503);
    }

    const roomWebSocketMatch = url.pathname.match(/^\/api\/rooms\/([A-Za-z2-9]{6})\/ws$/);
    if (roomWebSocketMatch) {
      if (request.method !== "GET") {
        return apiJson(request, env, { error: "METHOD_NOT_ALLOWED" }, 405);
      }
      const roomId = roomWebSocketMatch[1].toUpperCase();
      const room = env.GAME_ROOMS.get(env.GAME_ROOMS.idFromName(roomId));
      const response = await room.fetch(request);
      return response.status === 101 ? response : withCors(response, request, env);
    }

    return apiJson(request, env, { error: "NOT_FOUND" }, 404);
  },
};

export default worker;
