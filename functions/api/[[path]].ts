const ROOM_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

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

function json(body: unknown, status = 200): Response {
  return Response.json(body, {
    status,
    headers: {
      "cache-control": "no-store",
      "access-control-allow-origin": "*",
      "access-control-allow-headers": "content-type",
      "access-control-allow-methods": "GET, POST, OPTIONS",
    },
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

  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: json(null).headers });

  if (url.pathname === "/api/health") {
    if (request.method !== "GET") return json({ error: "METHOD_NOT_ALLOWED" }, 405);
    return json({ ok: true, service: "super-oreo-pages-gateway", time: new Date().toISOString() });
  }

  if (url.pathname === "/api/rooms") {
    if (request.method !== "POST") return json({ error: "METHOD_NOT_ALLOWED" }, 405);
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const roomId = createRoomCode();
      const room = env.GAME_ROOMS.get(env.GAME_ROOMS.idFromName(roomId));
      const response = await room.fetch(new Request("https://game-room.internal/internal/create", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ roomId }),
      }));
      if (response.status === 201) return json({ roomId }, 201);
      if (response.status !== 409) return json({ error: "ROOM_CREATE_FAILED" }, 502);
    }
    return json({ error: "ROOM_CODE_EXHAUSTED" }, 503);
  }

  const match = url.pathname.match(/^\/api\/rooms\/([A-Za-z2-9]{6})\/ws$/);
  if (match) {
    if (request.method !== "GET") return json({ error: "METHOD_NOT_ALLOWED" }, 405);
    const roomId = match[1].toUpperCase();
    const room = env.GAME_ROOMS.get(env.GAME_ROOMS.idFromName(roomId));
    return room.fetch(request);
  }

  return json({ error: "NOT_FOUND" }, 404);
}
