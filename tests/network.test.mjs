import assert from "node:assert/strict";
import test from "node:test";

import {
  isValidRoomCode,
  normalizeRoomCode,
  roomJoinBlockReason,
  sanitizeChatMessage,
  sanitizePlayerFrame,
} from "../game/network.ts";
import {
  GUEST_RECONNECT_GRACE_MS,
  GameRoom,
  createGuestReconnectLease,
  directedStateRecipients,
  guestReconnectLeaseMatches,
  messageRateLimitForRole,
  sanitizeServerChat,
  sanitizeServerFrame,
} from "../worker/room-worker.ts";
import {
  onRequest as pagesApiRequest,
  pagesOriginIsAllowed,
} from "../functions/api/[[path]].ts";

const host = {
  playerId: "host-a",
  name: "Host",
  skin: "classic",
  ready: true,
  host: true,
  joinedAt: 1,
};
const guestB = {
  playerId: "guest-b",
  name: "Guest B",
  skin: "mint",
  ready: true,
  host: false,
  joinedAt: 2,
};
const guestC = {
  playerId: "guest-c",
  name: "Guest C",
  skin: "berry",
  ready: false,
  host: false,
  joinedAt: 3,
};

function frame(overrides = {}) {
  return {
    playerId: "spoofed-player",
    name: "Spoofed name",
    skin: "spoofed-skin",
    x: 10,
    y: 2,
    z: -4,
    vx: 1,
    vy: 0,
    vz: -1,
    facing: 1.25,
    action: "walk",
    tick: 42,
    ...overrides,
  };
}

test("uses one unambiguous six-character room-code alphabet", () => {
  assert.equal(normalizeRoomCode("  ab2c3d "), "AB2C3D");
  assert.equal(isValidRoomCode("AB2C3D"), true);
  assert.equal(isValidRoomCode("ABCD"), false);
  assert.equal(isValidRoomCode("ABCDEF7"), false);
  assert.equal(isValidRoomCode("AB0C3D"), false);
  assert.equal(isValidRoomCode("ABIC3D"), false);
  assert.equal(isValidRoomCode("ABOC3D"), false);
});

test("client validation rejects invalid physics data and overwrites peer identity", () => {
  const safe = sanitizePlayerFrame(frame(), guestB);
  assert.ok(safe);
  assert.equal(safe.playerId, guestB.playerId);
  assert.equal(safe.name, guestB.name);
  assert.equal(safe.skin, guestB.skin);
  assert.equal(sanitizePlayerFrame(frame({ x: Number.NaN }), guestB), null);
  assert.equal(sanitizePlayerFrame(frame({ vx: 50_000 }), guestB), null);
  assert.equal(sanitizePlayerFrame(frame({ tick: -1 }), guestB), null);
});

test("server validation also binds a frame to its authenticated room player", () => {
  const safe = sanitizeServerFrame(frame(), guestC);
  assert.ok(safe);
  assert.equal(safe.playerId, guestC.playerId);
  assert.equal(safe.host, false);
  assert.equal(sanitizeServerFrame(frame({ facing: Number.POSITIVE_INFINITY }), guestC), null);
});

test("chat validation binds identity, strips controls and caps message length", () => {
  const chat = sanitizeChatMessage({
    id: "message_123",
    playerId: "spoofed-player",
    name: "Spoofed name",
    text: `  你好\u0000，房间！${"x".repeat(400)}  `,
    sentAt: 12_345,
  }, guestB);
  assert.ok(chat);
  assert.equal(chat.playerId, guestB.playerId);
  assert.equal(chat.name, guestB.name);
  assert.equal(chat.text.includes("\u0000"), false);
  assert.equal(chat.text.length, 280);
  assert.equal(sanitizeChatMessage({ id: "bad id", text: "hello" }, guestB), null);
  assert.equal(sanitizeChatMessage({ id: "message_456", text: "   " }, guestB), null);

  const serverChat = sanitizeServerChat({ id: "message_789", text: "hello", name: "fake" }, guestC, 99_000);
  assert.ok(serverChat);
  assert.equal(serverChat.playerId, guestC.playerId);
  assert.equal(serverChat.name, guestC.name);
  assert.equal(serverChat.sentAt, 99_000);
});

test("WebSocket fallback preserves the host-star relay invariant", () => {
  const players = [host, guestB, guestC];

  // A guest has exactly one cloud recipient: the host. It can never address
  // another guest directly through the Durable Object.
  assert.deepEqual(directedStateRecipients(guestB, players), [host.playerId]);
  assert.deepEqual(directedStateRecipients(guestC, players, guestB.playerId), [host.playerId]);

  // The host may forward to one selected guest or publish its own frame to all
  // guests. Invalid targets and attempts to target itself are rejected.
  assert.deepEqual(directedStateRecipients(host, players, guestC.playerId), [guestC.playerId]);
  assert.deepEqual(directedStateRecipients(host, players), [guestB.playerId, guestC.playerId]);
  assert.deepEqual(directedStateRecipients(host, players, host.playerId), []);
  assert.deepEqual(directedStateRecipients(host, players, "missing"), []);
});

test("host relay traffic has enough headroom above the guest rate limit", () => {
  assert.equal(messageRateLimitForRole(false), 180);
  assert.ok(messageRateLimitForRole(true) >= 360);
  assert.ok(messageRateLimitForRole(true) > messageRateLimitForRole(false));
});

test("guest reconnect leases hash credentials and expire after the grace window", async () => {
  const now = 10_000;
  const reconnectingGuest = {
    playerId: guestB.playerId,
    reconnectToken: "guest-secret-token",
    name: guestB.name,
    skin: guestB.skin,
    ready: guestB.ready,
    joinedAt: guestB.joinedAt,
  };
  const lease = await createGuestReconnectLease(reconnectingGuest, now);

  assert.notEqual(lease.tokenHash, reconnectingGuest.reconnectToken);
  assert.equal(lease.expiresAt, now + GUEST_RECONNECT_GRACE_MS);
  assert.equal(await guestReconnectLeaseMatches(lease, guestB.playerId, reconnectingGuest.reconnectToken, now + 1), true);
  assert.equal(await guestReconnectLeaseMatches(lease, guestB.playerId, "wrong-token", now + 1), false);
  assert.equal(await guestReconnectLeaseMatches(lease, guestC.playerId, reconnectingGuest.reconnectToken, now + 1), false);
  assert.equal(await guestReconnectLeaseMatches(lease, guestB.playerId, reconnectingGuest.reconnectToken, lease.expiresAt), false);
});

test("room availability blocks fresh joins but permits credentialed recovery", () => {
  assert.match(roomJoinBlockReason({ started: true, players: 2, maxPlayers: 4 }), /已经开始/);
  assert.match(roomJoinBlockReason({ started: false, players: 4, maxPlayers: 4 }), /房间已满/);
  assert.match(roomJoinBlockReason({ started: false, players: 3, maxPlayers: 4, full: true }), /房间已满/);
  assert.equal(roomJoinBlockReason({ started: true, players: 4, maxPlayers: 4 }, true), null);
  assert.equal(roomJoinBlockReason({ started: false, players: 3, maxPlayers: 4 }), null);
});

test("room status publishes maxPlayers for client-side admission checks", async () => {
  const storedRoom = {
    roomId: "ABC234",
    createdAt: 1,
    lastActiveAt: Date.now(),
    started: false,
    finishes: [],
    reconnectLeases: {},
  };
  const storage = {
    async get() { return storedRoom; },
    async put() {},
    async deleteAll() {},
    async setAlarm() {},
  };
  const state = {
    storage,
    blockConcurrencyWhile(callback) { return callback(); },
    acceptWebSocket() {},
    getWebSockets() { return []; },
  };
  const room = new GameRoom(state);
  const response = await room.fetch(new Request("https://game-room.internal/internal/status"));
  const status = await response.json();

  assert.equal(response.status, 200);
  assert.equal(status.players, 0);
  assert.equal(status.maxPlayers, 4);
  assert.equal(status.full, false);
});

test("Pages gateway accepts only production, Pages previews and localhost origins", async () => {
  const allowed = [
    "https://essential.eu.cc",
    "https://super-oreo-3d-adventure.pages.dev",
    "https://preview-123.super-oreo-3d-adventure.pages.dev",
    "http://localhost:4173",
    "http://127.0.0.1:4173",
  ];
  for (const origin of allowed) assert.equal(pagesOriginIsAllowed(origin), true, origin);
  assert.equal(pagesOriginIsAllowed(null), true);

  const denied = [
    "https://evil.example",
    "https://super-oreo-3d-adventure.pages.dev.evil.example",
    "http://essential.eu.cc",
    "https://essential.eu.cc/path",
  ];
  for (const origin of denied) assert.equal(pagesOriginIsAllowed(origin), false, origin);

  const rejected = await pagesApiRequest({
    request: new Request("https://essential.eu.cc/api/health", {
      headers: { origin: "https://evil.example" },
    }),
    env: {},
  });
  assert.equal(rejected.status, 403);
  assert.equal(rejected.headers.get("access-control-allow-origin"), null);

  const accepted = await pagesApiRequest({
    request: new Request("https://essential.eu.cc/api/health", {
      headers: { origin: "https://essential.eu.cc" },
    }),
    env: {},
  });
  assert.equal(accepted.status, 200);
  assert.equal(accepted.headers.get("access-control-allow-origin"), "https://essential.eu.cc");
});
