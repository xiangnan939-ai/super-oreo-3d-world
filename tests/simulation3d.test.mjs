import assert from "node:assert/strict";
import test from "node:test";

import {
  FIXED_TIMESTEP_3D,
  PHYSICS_3D,
  createWorld3D,
  stepWorld3D,
} from "../game/simulation3d.ts";

function baseLevel(overrides = {}) {
  return {
    id: "test-world-3d",
    spawn: { x: 0, y: 1.2, z: 0 },
    bounds: { minX: -20, maxX: 40, minZ: -20, maxZ: 20, killY: -8 },
    lives: 3,
    platforms: [
      {
        id: "ground",
        x: 5,
        y: 0,
        z: 0,
        width: 50,
        height: 1,
        depth: 30,
      },
    ],
    blockers: [],
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
    next = stepWorld3D(next, input, FIXED_TIMESTEP_3D);
  }
  return next;
}

test("runs immutable serializable fixed 60 Hz steps", () => {
  const world = createWorld3D(baseLevel());
  const next = tick(world, { right: true });

  assert.equal(world.tick, 0);
  assert.equal(world.players.player.x, 0);
  assert.equal(next.tick, 1);
  assert.equal(next.time, FIXED_TIMESTEP_3D);
  assert.ok(next.players.player.x > 0);
  assert.doesNotThrow(() => JSON.stringify(next));
});

test("moves freely across XZ with camera-relative WASD or direct world axes", () => {
  const settled = tick(createWorld3D(baseLevel()), {}, 3);
  const diagonal = tick(
    settled,
    { forward: true, right: true, cameraYaw: 0 },
    30,
  );
  assert.ok(diagonal.players.player.x > 1);
  assert.ok(diagonal.players.player.z < -1);

  const rotated = tick(settled, { forward: true, cameraYaw: Math.PI / 2 }, 20);
  assert.ok(rotated.players.player.x < -0.5);
  assert.ok(Math.abs(rotated.players.player.z) < 0.05);

  const direct = tick(settled, { moveX: 0, moveZ: 1 }, 20);
  assert.ok(direct.players.player.z > 0.5);
  assert.ok(Math.abs(direct.players.player.x) < 0.05);
});

test("supports variable jump height", () => {
  const settled = tick(createWorld3D(baseLevel()), {}, 3);
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

test("honours the 100 ms coyote window and 120 ms jump buffer", () => {
  const ledgeLevel = baseLevel({
    spawn: { x: 1.25, y: 1.2, z: 0 },
    platforms: [
      {
        id: "ledge",
        x: 0,
        y: 0,
        z: 0,
        width: 4,
        height: 1,
        depth: 4,
      },
    ],
  });
  let coyote = tick(createWorld3D(ledgeLevel), {}, 3);
  for (let index = 0; index < 30 && coyote.players.player.grounded; index += 1) {
    coyote = tick(coyote, { right: true, sprint: true });
  }
  assert.equal(coyote.players.player.grounded, false);
  assert.ok(coyote.players.player.coyoteRemaining > 0);
  coyote = tick(coyote, { right: true, jump: true });
  assert.ok(coyote.players.player.vy > 0);

  const falling = createWorld3D(baseLevel());
  falling.players.player.y = 1.55;
  falling.players.player.vy = -5;
  let buffered = falling;
  for (let index = 0; index < 5; index += 1) {
    buffered = tick(buffered, { jump: true });
  }
  assert.equal(buffered.players.player.grounded, false);
  assert.ok(buffered.players.player.vy > 0);
  assert.equal(buffered.players.player.jumpBufferRemaining, 0);
});

test("lands on platform tops, blocks walls, and rides moving platforms", () => {
  const level = baseLevel({
    spawn: { x: 0, y: 4, z: 0 },
    platforms: [
      {
        id: "lift",
        x: 0,
        y: 0,
        z: 0,
        width: 4,
        height: 0.5,
        depth: 4,
        motion: { x: 4, z: 2, period: 2 },
      },
      {
        id: "wall-floor",
        x: 9,
        y: 0,
        z: 2,
        width: 8,
        height: 1,
        depth: 8,
      },
    ],
    blockers: [
      {
        id: "wall",
        x: 8,
        y: 1.5,
        z: 2,
        width: 1,
        height: 3,
        depth: 5,
      },
    ],
  });
  let world = tick(createWorld3D(level), {}, 40);
  assert.equal(world.players.player.grounded, true);
  assert.equal(world.players.player.groundObjectId, "lift");
  const relativeX = world.players.player.x - world.platforms[0].x;
  const relativeZ = world.players.player.z - world.platforms[0].z;

  world = tick(world, {}, 20);
  assert.ok(
    Math.abs(world.players.player.x - world.platforms[0].x - relativeX) < 0.02,
  );
  assert.ok(
    Math.abs(world.players.player.z - world.platforms[0].z - relativeZ) < 0.02,
  );

  const relativeBeforeWalking = world.players.player.x - world.platforms[0].x;
  world = tick(world, { moveX: 1, moveZ: 0 });
  const relativeAfterWalking = world.players.player.x - world.platforms[0].x;
  assert.ok(relativeAfterWalking > relativeBeforeWalking);
  assert.ok(relativeAfterWalking - relativeBeforeWalking < 0.08);
  assert.equal(world.players.player.groundObjectId, "lift");

  world.players.player.x = 6.5;
  world.players.player.z = 2;
  world.players.player.y = 1.2;
  world.players.player.grounded = true;
  world.players.player.groundObjectId = null;
  world = tick(world, { moveX: 1, moveZ: 0, sprint: true }, 30);
  assert.ok(world.players.player.x <= 7.14 + 1e-6);
});

test("walks up half-height stairs without snagging on their front faces", () => {
  const level = baseLevel({
    spawn: { x: 0, y: 1.2, z: 0 },
    platforms: [
      { id: "floor", x: 0, y: 0, z: 0, width: 4, height: 1, depth: 5 },
      { id: "step-1", x: 2.5, y: 0, z: 0, width: 1, height: 2, depth: 5 },
      { id: "step-2", x: 3.5, y: 0.25, z: 0, width: 1, height: 2.5, depth: 5 },
      { id: "landing", x: 6, y: 0.5, z: 0, width: 4, height: 3, depth: 5 },
    ],
  });
  let world = tick(createWorld3D(level), {}, 3);
  world = tick(world, { moveX: 1, sprint: false }, 65);
  assert.ok(world.players.player.x > 4);
  assert.ok(world.players.player.y >= 2.69);
  assert.equal(world.players.player.grounded, true);
});

test("initializes phased platforms at their authored phase without a first-tick teleport", () => {
  const level = baseLevel({
    spawn: { x: 5, y: 2, z: 0 },
    platforms: [
      {
        id: "phased-lift",
        x: 0,
        y: 0,
        z: 0,
        width: 4,
        height: 0.5,
        depth: 4,
        motion: { x: 10, period: 2, phase: 0.25 },
      },
    ],
  });
  const world = createWorld3D(level);
  assert.equal(world.platforms[0].x, 5);
  const next = tick(world);
  assert.ok(Math.abs(next.platforms[0].x - world.platforms[0].x) < 0.18);
});

test("honours smooth travel and endpoint waits for authored moving platforms", () => {
  const level = baseLevel({
    platforms: [{
      id: "waiting-lift",
      x: 0,
      y: 0,
      z: 0,
      width: 4,
      height: 0.5,
      depth: 4,
      motion: {
        x: 4,
        period: 2,
        phase: 0,
        travelSeconds: 0.5,
        waitAtEndsSeconds: 0.5,
        easing: "smoothstep",
      },
    }],
  });
  let world = createWorld3D(level);
  world = tick(world, {}, 30);
  assert.ok(Math.abs(world.platforms[0].x - 4) < 1e-9);
  const atFarEnd = world.platforms[0].x;
  world = tick(world, {}, 20);
  assert.equal(world.platforms[0].x, atFarEnd);
});

test("keeps the previous moving support when overlapping platforms cross heights", () => {
  const level = baseLevel({
    spawn: { x: 1.55, y: 0.95, z: 0 },
    platforms: [
      {
        id: "carrier-a",
        x: 0,
        y: 0,
        z: 0,
        width: 4,
        height: 0.5,
        depth: 4,
        motion: { z: 2, period: 2, phase: 0.12 },
      },
      {
        id: "carrier-b",
        x: 3.1,
        y: 0.08,
        z: 0,
        width: 4,
        height: 0.5,
        depth: 4,
        motion: { x: -1, y: 0.2, period: 2.4, phase: 0.44 },
      },
    ],
  });
  let world = createWorld3D(level);
  const carrier = world.platforms[0];
  world.players.player.x = 1.55;
  world.players.player.y = carrier.y + carrier.height / 2 + PHYSICS_3D.playerHeight / 2;
  world.players.player.z = carrier.z;
  world.players.player.grounded = true;
  world.players.player.groundObjectId = "carrier-a";

  for (let index = 0; index < 12; index += 1) {
    world = tick(world);
    assert.equal(world.players.player.groundObjectId, "carrier-a");
  }
});

test("activates a checkpoint, collects an item, dies, and respawns there", () => {
  const level = baseLevel({
    checkpoints: [
      {
        id: "checkpoint-1",
        x: 2,
        y: 1.2,
        z: 1,
        width: 1,
        height: 2,
        depth: 1,
        respawn: { x: 2, y: 1.2, z: 1 },
      },
    ],
    collectibles: [
      {
        id: "coin-1",
        x: 3,
        y: 1.2,
        z: 1,
        width: 0.6,
        height: 0.6,
        depth: 0.6,
        value: 75,
      },
    ],
    hazards: [
      {
        id: "spikes",
        x: 5,
        y: 1.2,
        z: 1,
        width: 1,
        height: 1,
        depth: 1,
      },
    ],
  });
  let world = tick(createWorld3D(level), {}, 3);
  world.players.player.x = 2;
  world.players.player.z = 1;
  world = tick(world);
  assert.equal(world.players.player.checkpointId, "checkpoint-1");
  assert.ok(world.events.some((event) => event.type === "checkpoint"));

  world.players.player.x = 3;
  world = tick(world);
  assert.equal(world.collectibles[0].collected, true);
  assert.equal(world.players.player.score, 75);

  world.players.player.x = 5;
  world = tick(world);
  assert.equal(world.players.player.status, "dead");
  assert.ok(
    world.events.some(
      (event) => event.type === "death" && event.reason === "hazard",
    ),
  );

  world = tick(
    world,
    {},
    Math.ceil(PHYSICS_3D.respawnDelay / FIXED_TIMESTEP_3D) + 1,
  );
  assert.equal(world.players.player.status, "active");
  assert.equal(world.players.player.x, 2);
  assert.equal(world.players.player.z, 1);
});

test("stomps enemies in 3D and reaches the goal", () => {
  const level = baseLevel({
    enemies: [
      {
        id: "walker",
        x: 2,
        y: 1,
        z: 2,
        width: 1,
        height: 1,
        depth: 1,
        points: 250,
      },
    ],
    goal: {
      id: "flag",
      x: 8,
      y: 1.5,
      z: -3,
      width: 1,
      height: 3,
      depth: 1,
    },
  });
  let world = createWorld3D(level);
  world.players.player.x = 2;
  world.players.player.y = 2.25;
  world.players.player.z = 2;
  world.players.player.vy = -5;
  world = tick(world);
  assert.equal(world.enemies[0].alive, false);
  assert.equal(world.players.player.score, 250);
  assert.equal(world.players.player.vy, PHYSICS_3D.stompBounceSpeed);
  assert.ok(world.events.some((event) => event.type === "enemy-stomp"));

  world.players.player.x = 8;
  world.players.player.y = 1.5;
  world.players.player.z = -3;
  world = tick(world);
  assert.equal(world.players.player.status, "won");
  assert.equal(world.status, "won");
  assert.ok(world.events.some((event) => event.type === "goal"));
});
