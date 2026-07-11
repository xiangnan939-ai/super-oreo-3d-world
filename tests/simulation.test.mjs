import assert from "node:assert/strict";
import test from "node:test";

import {
  FIXED_TIMESTEP,
  PHYSICS,
  createWorld,
  stepWorld,
} from "../game/simulation.ts";

function baseLevel(overrides = {}) {
  return {
    id: "test-level",
    spawn: { x: 0, y: 1.2 },
    bounds: { minX: -20, maxX: 40, killY: -8 },
    lives: 3,
    platforms: [{ id: "ground", x: 8, y: 0, width: 40, height: 1 }],
    hazards: [],
    collectibles: [],
    enemies: [],
    checkpoints: [],
    goal: null,
    ...overrides,
  };
}

function tick(world, input = {}, count = 1) {
  let next = world;
  for (let index = 0; index < count; index += 1) {
    next = stepWorld(next, { player: input }, FIXED_TIMESTEP);
  }
  return next;
}

test("advances at 60 Hz without mutating the previous world", () => {
  const world = createWorld(baseLevel(), "player");
  const next = tick(world, { right: true });

  assert.equal(world.tick, 0);
  assert.equal(world.players.player.x, 0);
  assert.equal(next.tick, 1);
  assert.ok(next.players.player.x > 0);
  assert.ok(next.players.player.vx > 0);
  assert.doesNotThrow(() => JSON.stringify(next));
});

test("supports variable jump height", () => {
  const settled = tick(createWorld(baseLevel(), "player"), {}, 3);
  assert.equal(settled.players.player.grounded, true);

  let held = tick(settled, { jump: true });
  let tapped = tick(settled, { jump: true });
  tapped = tick(tapped, { jump: false });
  for (let index = 0; index < 18; index += 1) {
    held = tick(held, { jump: true });
    tapped = tick(tapped, { jump: false });
  }

  assert.ok(held.players.player.y > tapped.players.player.y + 1);
});

test("allows a jump during the 100 ms coyote window", () => {
  const level = baseLevel({
    platforms: [{ id: "ledge", x: 0, y: 0, width: 4, height: 1 }],
    spawn: { x: 1.25, y: 1.2 },
  });
  let world = tick(createWorld(level, "player"), {}, 3);
  assert.equal(world.players.player.grounded, true);

  for (let index = 0; index < 30 && world.players.player.grounded; index += 1) {
    world = tick(world, { right: true, sprint: true });
  }
  assert.equal(world.players.player.grounded, false);
  assert.ok(world.players.player.coyoteRemaining > 0);

  world = tick(world, { right: true, jump: true });
  assert.ok(world.players.player.vy > 0);
});

test("buffers a jump for 120 ms before landing", () => {
  const world = createWorld(baseLevel(), "player");
  world.players.player.y = 1.5;
  world.players.player.vy = -5;

  let next = world;
  for (let index = 0; index < 5; index += 1) {
    next = tick(next, { jump: true });
  }

  assert.equal(next.players.player.grounded, false);
  assert.ok(next.players.player.vy > 0);
  assert.equal(next.players.player.jumpBufferRemaining, 0);
});

test("carries a grounded player on a moving platform", () => {
  const level = baseLevel({
    spawn: { x: 0, y: 0.95 },
    platforms: [
      {
        id: "lift",
        x: 0,
        y: 0,
        width: 3,
        height: 0.5,
        motion: { x: 6, y: 0, period: 2 },
      },
    ],
  });
  let world = tick(createWorld(level, "player"), {}, 3);
  assert.equal(world.players.player.grounded, true);
  const relativeX = world.players.player.x - world.platforms[0].x;

  world = tick(world, {}, 30);
  assert.ok(world.platforms[0].x > 2.5);
  assert.ok(
    Math.abs(world.players.player.x - world.platforms[0].x - relativeX) < 0.02,
  );
});

test("activates checkpoints, collects items, then respawns at the checkpoint", () => {
  const level = baseLevel({
    checkpoints: [
      {
        id: "checkpoint-1",
        x: 2,
        y: 1.2,
        width: 1,
        height: 2,
        respawn: { x: 2, y: 1.2 },
      },
    ],
    collectibles: [
      { id: "coin-1", x: 3, y: 1.2, width: 0.6, height: 0.6, value: 75 },
    ],
    hazards: [{ id: "spikes", x: 5, y: 1.2, width: 1, height: 1 }],
  });
  let world = tick(createWorld(level, "player"), {}, 3);

  world.players.player.x = 2;
  world = tick(world);
  assert.equal(world.players.player.checkpointId, "checkpoint-1");
  assert.ok(world.events.some((event) => event.type === "checkpoint"));

  world.players.player.x = 3;
  world = tick(world);
  assert.equal(world.collectibles[0].collected, true);
  assert.equal(world.players.player.score, 75);
  assert.ok(world.events.some((event) => event.type === "collectible"));

  world.players.player.x = 5;
  world = tick(world);
  assert.equal(world.players.player.status, "dead");
  assert.ok(
    world.events.some(
      (event) => event.type === "death" && event.reason === "hazard",
    ),
  );

  world = tick(world, {}, Math.ceil(PHYSICS.respawnDelay / FIXED_TIMESTEP) + 1);
  assert.equal(world.players.player.status, "active");
  assert.equal(world.players.player.x, 2);
  assert.equal(world.players.player.y, 1.2);
});

test("stomps enemies and detects the level goal", () => {
  const level = baseLevel({
    enemies: [
      {
        id: "walker",
        x: 2,
        y: 1,
        width: 1,
        height: 1,
        points: 250,
      },
    ],
    goal: { id: "flag", x: 8, y: 1.5, width: 1, height: 3 },
  });
  let world = createWorld(level, "player");
  world.players.player.x = 2;
  world.players.player.y = 2.25;
  world.players.player.vy = -5;
  world = tick(world);

  assert.equal(world.enemies[0].alive, false);
  assert.equal(world.players.player.score, 250);
  assert.equal(world.players.player.vy, PHYSICS.stompBounceSpeed);
  assert.ok(world.events.some((event) => event.type === "enemy-stomp"));

  world.players.player.x = 8;
  world.players.player.y = 1.5;
  world = tick(world);
  assert.equal(world.players.player.status, "won");
  assert.equal(world.status, "won");
  assert.ok(world.events.some((event) => event.type === "goal"));
});

test("falling below killY causes a fall death", () => {
  const world = createWorld(baseLevel(), "player");
  world.players.player.y = -9;
  const next = tick(world);
  assert.equal(next.players.player.status, "dead");
  assert.ok(
    next.events.some(
      (event) => event.type === "death" && event.reason === "fall",
    ),
  );
});
