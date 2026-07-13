const ROOM_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const ROOM_CODE_PATTERN = /^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$/;

interface DurableObjectStubLike {
  fetch(request: Request): Promise<Response>;
}

interface DurableObjectNamespaceLike {
  idFromName(name: string): object;
  get(id: object): DurableObjectStubLike;
}

interface Env {
  /** Namespace is implemented by the standalone super-oreo-room-worker. */
  GAME_ROOMS: DurableObjectNamespaceLike;
}

interface PagesContext {
  request: Request;
  env: Env;
}

const PRODUCTION_ORIGIN = "https://essential.eu.cc";
const PAGES_HOST = "super-oreo-3d-adventure.pages.dev";

export function pagesOriginIsAllowed(origin: string | null): boolean {
  if (!origin) return true;
  try {
    const url = new URL(origin);
    if (url.origin !== origin) return false;
    if (url.origin === PRODUCTION_ORIGIN) return true;
    if (
      url.protocol === "https:" &&
      (url.hostname === PAGES_HOST || url.hostname.endsWith(`.${PAGES_HOST}`))
    ) return true;
    return (
      (url.protocol === "http:" || url.protocol === "https:") &&
      (url.hostname === "localhost" || url.hostname === "127.0.0.1" || url.hostname === "[::1]")
    );
  } catch {
    return false;
  }
}

function corsHeaders(request: Request): Headers {
  const headers = new Headers({
    "access-control-allow-headers": "content-type",
    "access-control-allow-methods": "GET, POST, OPTIONS",
    "access-control-max-age": "86400",
  });
  const origin = request.headers.get("origin");
  if (origin && pagesOriginIsAllowed(origin)) {
    headers.set("access-control-allow-origin", origin);
    headers.set("vary", "Origin");
  }
  return headers;
}

function json(body: unknown, status: number, request: Request): Response {
  const headers = corsHeaders(request);
  headers.set("cache-control", "no-store");
  return Response.json(body, {
    status,
    headers,
  });
}

function withCors(response: Response, request: Request): Response {
  const headers = new Headers(response.headers);
  corsHeaders(request).forEach((value, key) => headers.set(key, value));
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

function createRoomCode(): string {
  const bytes = new Uint8Array(6);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => ROOM_CODE_ALPHABET[byte % ROOM_CODE_ALPHABET.length]).join("");
}

/**
 * Same-origin Pages gateway. It talks to the Durable Object namespace over a
 * binding, so multiplayer does not depend on the public workers.dev hostname.
 */
export async function onRequest(context: PagesContext): Promise<Response> {
  const { request, env } = context;
  const url = new URL(request.url);

  if (!pagesOriginIsAllowed(request.headers.get("origin"))) {
    return json({ error: "ORIGIN_NOT_ALLOWED" }, 403, request);
  }
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders(request) });

  if (url.pathname === "/api/health") {
    if (request.method !== "GET") return json({ error: "METHOD_NOT_ALLOWED" }, 405, request);
    return json({ ok: true, service: "super-oreo-pages-gateway", time: new Date().toISOString() }, 200, request);
  }

  if (url.pathname === "/api/rooms") {
    if (request.method !== "POST") return json({ error: "METHOD_NOT_ALLOWED" }, 405, request);
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const roomId = createRoomCode();
      const room = env.GAME_ROOMS.get(env.GAME_ROOMS.idFromName(roomId));
      const response = await room.fetch(new Request("https://game-room.internal/internal/create", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ roomId }),
      }));
      if (response.status === 201) {
        const created = await response.json() as { roomId?: string; hostToken?: string };
        if (created.roomId && created.hostToken) return json(created, 201, request);
        return json({ error: "INVALID_ROOM_CREDENTIAL" }, 502, request);
      }
      if (response.status !== 409) return json({ error: "ROOM_CREATE_FAILED" }, 502, request);
    }
    return json({ error: "ROOM_CODE_EXHAUSTED" }, 503, request);
  }

  const statusMatch = url.pathname.match(/^\/api\/rooms\/([A-Za-z2-9]{6})$/);
  if (statusMatch) {
    if (request.method !== "GET") return json({ error: "METHOD_NOT_ALLOWED" }, 405, request);
    const roomId = statusMatch[1].toUpperCase();
    if (!ROOM_CODE_PATTERN.test(roomId)) return json({ error: "INVALID_ROOM_ID" }, 400, request);
    const room = env.GAME_ROOMS.get(env.GAME_ROOMS.idFromName(roomId));
    const response = await room.fetch(new Request("https://game-room.internal/internal/status", {
      method: "GET",
      headers: request.headers,
    }));
    return withCors(response, request);
  }

  const match = url.pathname.match(/^\/api\/rooms\/([A-Za-z2-9]{6})\/ws$/);
  if (match) {
    if (request.method !== "GET") return json({ error: "METHOD_NOT_ALLOWED" }, 405, request);
    const roomId = match[1].toUpperCase();
    if (!ROOM_CODE_PATTERN.test(roomId)) return json({ error: "INVALID_ROOM_ID" }, 400, request);
    const room = env.GAME_ROOMS.get(env.GAME_ROOMS.idFromName(roomId));
    return room.fetch(request);
  }

  return json({ error: "NOT_FOUND" }, 404, request);
}
