import assert from "node:assert/strict";
import test from "node:test";

import {
  FIXED_TIMESTEP_3D,
  PHYSICS_3D,
  addPlayer3D,
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

test("applies local developer speed, jump, flight and invulnerability modifiers", () => {
  const settled = tick(createWorld3D(baseLevel()), {}, 3);
  const normalRun = tick(settled, { moveX: 1 }, 45);
  const fastRun = tick(settled, { moveX: 1, moveSpeedMultiplier: 2 }, 45);
  assert.ok(fastRun.players.player.x > normalRun.players.player.x * 1.45);

  const normalJump = tick(settled, { jump: true });
  const highJump = tick(settled, { jump: true, jumpHeightMultiplier: 2 });
  assert.ok(highJump.players.player.vy > normalJump.players.player.vy * 1.8);

  const flying = tick(settled, { flying: true, flyVertical: 1, moveSpeedMultiplier: 1.5 }, 20);
  assert.ok(flying.players.player.y > settled.players.player.y + 1.5);
  assert.equal(flying.players.player.status, "active");

  const hazardous = baseLevel({
    hazards: [{ id: "test-hazard", x: 0, y: 1.2, z: 0, width: 2, height: 2, depth: 2 }],
  });
  const protectedWorld = tick(createWorld3D(hazardous), { invulnerable: true }, 3);
  assert.equal(protectedWorld.players.player.status, "active");
  assert.equal(protectedWorld.players.player.lives, 3);
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

test("hands a rider to a higher static dock without a lateral snap", () => {
  const level = baseLevel({
    spawn: { x: 0, y: 0.95, z: 0 },
    platforms: [
      {
        id: "carrier",
        x: 0,
        y: 0,
        z: 0,
        width: 4,
        height: 0.5,
        depth: 4,
        motion: { x: 0, y: 0, z: 0, period: 2 },
      },
      {
        id: "arrival-dock",
        x: 1.5,
        y: 0.25,
        z: 0,
        width: 4,
        height: 0.5,
        depth: 4,
      },
    ],
  });
  const placeOnCarrier = (world) => {
    const carrier = world.platforms.find((platform) => platform.id === "carrier");
    const player = world.players.player;
    player.x = 0;
    player.y = carrier.y + carrier.height / 2 + PHYSICS_3D.playerHeight / 2;
    player.z = 0;
    player.grounded = true;
    player.groundObjectId = carrier.id;
    return world;
  };

  let idleWorld = placeOnCarrier(createWorld3D(level));
  idleWorld = tick(idleWorld);
  assert.equal(idleWorld.players.player.groundObjectId, "arrival-dock");
  assert.ok(Math.abs(idleWorld.players.player.x) < 0.01);

  let walkingWorld = placeOnCarrier(createWorld3D(level));
  walkingWorld = tick(walkingWorld, { moveX: 1 });
  assert.equal(walkingWorld.players.player.groundObjectId, "arrival-dock");
  assert.ok(walkingWorld.players.player.x > 0);
  assert.ok(walkingWorld.players.player.x < 0.1);
});

test("does not snap a moving-platform rider backward at a lower dock edge", () => {
  const level = baseLevel({
    spawn: { x: 1.45, y: 0.95, z: 0 },
    platforms: [
      {
        id: "edge-carrier",
        x: 0,
        y: 0,
        z: 0,
        width: 4,
        height: 0.5,
        depth: 4,
        motion: { x: 1.5, period: 2 },
      },
      {
        id: "lower-dock",
        x: 4,
        y: -0.12,
        z: 0,
        width: 4,
        height: 0.5,
        depth: 4,
      },
    ],
  });
  let world = createWorld3D(level);
  const carrier = world.platforms.find((platform) => platform.id === "edge-carrier");
  const player = world.players.player;
  player.x = carrier.x + 1.45;
  player.y = carrier.y + carrier.height / 2 + PHYSICS_3D.playerHeight / 2;
  player.z = 0;
  player.grounded = true;
  player.groundObjectId = carrier.id;

  for (let index = 0; index < 90; index += 1) {
    const previousX = world.players.player.x;
    const previousPlatformX = world.platforms.find((platform) => platform.id === "edge-carrier").x;
    world = tick(world, { moveX: 1 });
    const platformX = world.platforms.find((platform) => platform.id === "edge-carrier").x;
    const expectedMaximum = Math.abs(platformX - previousPlatformX) + 0.12;
    assert.ok(
      Math.abs(world.players.player.x - previousX) <= expectedMaximum,
      `unexpected edge snap at tick ${index}: ${world.players.player.x - previousX}`,
    );
  }
});

test("keeps an idle rider stable on every moving-platform edge", () => {
  const level = baseLevel({
    platforms: [{
      id: "edge-stability-carrier",
      x: 0,
      y: 0,
      z: 0,
      width: 4,
      height: 0.5,
      depth: 4,
      motion: { x: 4, y: 1, z: 3, period: 2.6 },
    }],
  });

  for (const [offsetX, offsetZ] of [[1.54, 0], [-1.54, 0], [0, 1.54], [0, -1.54]]) {
    let world = createWorld3D(level);
    const carrier = world.platforms[0];
    const player = world.players.player;
    player.x = carrier.x + offsetX;
    player.y = carrier.y + carrier.height / 2 + PHYSICS_3D.playerHeight / 2;
    player.z = carrier.z + offsetZ;
    player.grounded = true;
    player.groundObjectId = carrier.id;
    for (let index = 0; index < 120; index += 1) {
      world = tick(world);
      const currentCarrier = world.platforms[0];
      assert.equal(world.players.player.groundObjectId, carrier.id);
      assert.ok(Math.abs(world.players.player.x - currentCarrier.x - offsetX) < 0.025);
      assert.ok(Math.abs(world.players.player.z - currentCarrier.z - offsetZ) < 0.025);
    }
  }
});

test("does not resolve through a moving platform's far edge when it catches up from behind", () => {
  const level = baseLevel({
    spawn: { x: -15, y: 16, z: 281 },
    bounds: { minX: -30, maxX: 20, minZ: 260, maxZ: 310, killY: -8 },
    platforms: [
      {
        id: "lower-landing",
        x: -10,
        y: 13,
        z: 280,
        width: 6,
        height: 1.4,
        depth: 6,
      },
      {
        id: "orbit-carrier",
        x: -15,
        y: 14.2,
        z: 281,
        width: 5.5,
        height: 0.8,
        depth: 5.5,
        motion: {
          x: 11,
          y: 1,
          z: 7,
          period: 6,
          phase: 0.1,
          travelSeconds: 2.7,
          waitAtEndsSeconds: 0.3,
          easing: "smoothstep",
        },
      },
    ],
  });
  let world = createWorld3D(level);
  const carrier = world.platforms.find((platform) => platform.id === "orbit-carrier");
  const player = world.players.player;
  player.x = carrier.x + carrier.width / 2 - player.width / 2 - 0.02;
  player.y = carrier.y + carrier.height / 2 + player.height / 2;
  player.z = carrier.z;
  player.grounded = true;
  player.groundObjectId = carrier.id;

  for (let index = 0; index < 45; index += 1) {
    const previousX = world.players.player.x;
    world = tick(world, index < 20 ? { moveX: 1, moveZ: 0 } : {});
    assert.ok(
      Math.abs(world.players.player.x - previousX) < 0.35,
      `moving platform caused a far-edge snap at tick ${index}`,
    );
  }
});

test("uses low acceleration and long stopping distance on ice", () => {
  const normalLevel = baseLevel();
  const iceLevel = baseLevel({
    platforms: [
      {
        id: "ground",
        x: 5,
        y: 0,
        z: 0,
        width: 50,
        height: 1,
        depth: 30,
        surface: "ice",
      },
    ],
  });
  let normal = tick(createWorld3D(normalLevel), {}, 3);
  let ice = tick(createWorld3D(iceLevel), {}, 3);

  normal = tick(normal, { moveX: 1 });
  ice = tick(ice, { moveX: 1 });
  assert.ok(normal.players.player.vx > ice.players.player.vx * 3);

  normal.players.player.vx = 6;
  ice.players.player.vx = 6;
  normal = tick(normal);
  ice = tick(ice);
  assert.ok(ice.players.player.vx > normal.players.player.vx + 0.8);
  assert.equal(ice.players.player.groundObjectId, "ground");
});

test("combines conveyor velocity with moving-platform carry", () => {
  const level = baseLevel({
    spawn: { x: 0, y: 1.2, z: 0 },
    platforms: [
      {
        id: "moving-belt",
        x: 0,
        y: 0,
        z: 0,
        width: 7,
        height: 1,
        depth: 8,
        surface: "conveyor",
        conveyorVelocity: { x: 0, z: 1.5 },
        motion: { x: 4, period: 2 },
      },
    ],
  });
  let world = tick(createWorld3D(level), {}, 3);
  assert.equal(world.players.player.groundObjectId, "moving-belt");
  const relativeX = world.players.player.x - world.platforms[0].x;
  const relativeZ = world.players.player.z - world.platforms[0].z;

  world = tick(world, {}, 30);
  const nextRelativeX = world.players.player.x - world.platforms[0].x;
  const nextRelativeZ = world.players.player.z - world.platforms[0].z;
  assert.equal(world.players.player.groundObjectId, "moving-belt");
  assert.ok(Math.abs(nextRelativeX - relativeX) < 0.02);
  assert.ok(nextRelativeZ - relativeZ > 0.7);
  assert.ok(nextRelativeZ - relativeZ < 0.8);
  assert.ok(Math.abs(world.players.player.vz) < 1e-12);
});

test("updates scheduled hazards deterministically at phase boundaries", () => {
  const level = baseLevel({
    hazards: [
      {
        id: "pulse-a",
        x: 12,
        y: 1,
        z: 0,
        width: 1,
        height: 1,
        depth: 1,
        schedule: { periodSeconds: 1, activeSeconds: 0.25 },
      },
      {
        id: "pulse-b",
        x: 14,
        y: 1,
        z: 0,
        width: 1,
        height: 1,
        depth: 1,
        schedule: {
          periodSeconds: 1,
          activeSeconds: 0.25,
          phaseSeconds: 0.5,
        },
      },
      {
        id: "disabled-pulse",
        x: 16,
        y: 1,
        z: 0,
        width: 1,
        height: 1,
        depth: 1,
        active: false,
        schedule: { periodSeconds: 1, activeSeconds: 1 },
      },
    ],
  });
  let world = createWorld3D(level);
  assert.deepEqual(world.hazards.map((hazard) => hazard.active), [true, false, false]);

  world = tick(world, {}, 15);
  assert.equal(world.time, 0.25);
  assert.deepEqual(world.hazards.map((hazard) => hazard.active), [false, false, false]);

  world = tick(world, {}, 15);
  assert.equal(world.time, 0.5);
  assert.deepEqual(world.hazards.map((hazard) => hazard.active), [false, true, false]);

  world = tick(world, {}, 30);
  assert.equal(world.time, 1);
  assert.deepEqual(world.hazards.map((hazard) => hazard.active), [true, false, false]);
});

test("scheduled hazards only damage players during their active window", () => {
  const level = baseLevel({
    hazards: [
      {
        id: "timed-spikes",
        x: 0,
        y: 1.2,
        z: 0,
        width: 1,
        height: 1,
        depth: 1,
        schedule: {
          periodSeconds: 1,
          activeSeconds: 0.25,
          phaseSeconds: 0.5,
        },
      },
    ],
  });
  let world = createWorld3D(level);
  world = tick(world, {}, 29);
  assert.equal(world.hazards[0].active, false);
  assert.equal(world.players.player.status, "active");

  world = tick(world);
  assert.equal(world.time, 0.5);
  assert.equal(world.hazards[0].active, true);
  assert.equal(world.players.player.status, "dead");
  assert.ok(world.events.some((event) =>
    event.type === "death" && event.sourceId === "timed-spikes"
  ));
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

test("keeps an exploration goal locked until its collectible quest is complete", () => {
  const level = baseLevel({
    spawn: { x: 0, y: 1.2, z: 0 },
    collectibles: [
      { id: "star-medal-a", x: 2, y: 1.2, z: 0, width: 1, height: 1, depth: 1 },
      { id: "star-medal-b", x: 4, y: 1.2, z: 0, width: 1, height: 1, depth: 1 },
      { id: "coin-a", x: 3, y: 1.2, z: 2, width: 1, height: 1, depth: 1 },
    ],
    goal: {
      id: "quest-gate",
      x: 7,
      y: 1.5,
      z: 0,
      width: 2,
      height: 3,
      depth: 3,
      requiredCollectiblePrefix: "star-medal",
      requiredCollectibleCount: 2,
    },
  });
  let locked = createWorld3D(level);
  locked.players.player.x = 7;
  locked = tick(locked);
  assert.equal(locked.status, "playing");
  assert.ok(locked.events.some((event) => event.type === "goal-locked"));

  let unlocked = createWorld3D(level);
  unlocked.collectibles[0].collected = true;
  unlocked.collectibles[1].collected = true;
  unlocked.players.player.x = 7;
  unlocked = tick(unlocked);
  assert.equal(unlocked.status, "won");
  assert.ok(unlocked.events.some((event) => event.type === "goal"));
});

test("grants one deterministic air dash per landing", () => {
  let world = tick(createWorld3D(baseLevel()), {}, 3);
  world = tick(world, { jump: true });
  world = tick(world, { jump: false }, 4);
  assert.equal(world.players.player.grounded, false);

  const beforeX = world.players.player.x;
  world = tick(world, { dash: true, moveX: 1, moveZ: 0 });
  assert.ok(world.events.some((event) => event.type === "dash"));
  assert.ok(world.players.player.dashRemaining > 0);
  assert.equal(world.players.player.airDashAvailable, false);
  world = tick(world, { dash: true, moveX: 1, moveZ: 0 }, 5);
  assert.ok(world.players.player.x > beforeX + 1);

  const xAfterFirstDash = world.players.player.x;
  world = tick(world, { dash: false, moveX: 0, moveZ: 0 });
  world = tick(world, { dash: true, moveX: 1, moveZ: 0 });
  assert.ok(!world.events.some((event) => event.type === "dash"));
  assert.ok(world.players.player.x - xAfterFirstDash < 0.8);

  for (let index = 0; index < 180 && !world.players.player.grounded; index += 1) {
    world = tick(world, {});
  }
  assert.equal(world.players.player.grounded, true);
  assert.equal(world.players.player.airDashAvailable, true);
});

test("keeps later checkpoints when revisiting an earlier route", () => {
  const level = baseLevel({
    checkpoints: [
      { id: "checkpoint-1", order: 1, x: 0, y: 1.2, z: 0, width: 2, height: 3, depth: 2, respawn: { x: 0, y: 1.2, z: 0 } },
      { id: "checkpoint-2", order: 2, x: 6, y: 1.2, z: 0, width: 2, height: 3, depth: 2, respawn: { x: 6, y: 1.2, z: 0 } },
    ],
  });
  let world = tick(createWorld3D(level), {}, 3);
  assert.equal(world.players.player.checkpointId, "checkpoint-1");
  world.players.player.x = 6;
  world = tick(world);
  assert.equal(world.players.player.checkpointId, "checkpoint-2");
  world.players.player.x = 0;
  world = tick(world);
  assert.equal(world.players.player.checkpointId, "checkpoint-2");
  assert.equal(world.players.player.respawnX, 6);
});

test("simulates hop, float, and charge enemies as distinct behaviors", () => {
  const level = baseLevel({
    enemies: [
      { id: "hopper", x: 8, y: 1.15, z: -5, width: 1, height: 1.3, depth: 1, speed: 1, patrolAxis: "x", patrolMin: 6, patrolMax: 10, behavior: "hop" },
      { id: "floater", x: 8, y: 2, z: 5, width: 1, height: 1.3, depth: 1, speed: 1, patrolAxis: "x", patrolMin: 6, patrolMax: 10, behavior: "float" },
      { id: "charger", x: 5, y: 1.15, z: 0, width: 1, height: 1.3, depth: 1, speed: 1, patrolAxis: "x", patrolMin: -10, patrolMax: 10, behavior: "charge" },
      { id: "walker", x: 5, y: 1.15, z: 3, width: 1, height: 1.3, depth: 1, speed: 1, patrolAxis: "x", patrolMin: -10, patrolMax: 10, behavior: "walk" },
    ],
  });
  let world = createWorld3D(level);
  world = tick(world, {}, 12);
  const hopper = world.enemies.find((enemy) => enemy.id === "hopper");
  const floater = world.enemies.find((enemy) => enemy.id === "floater");
  const charger = world.enemies.find((enemy) => enemy.id === "charger");
  const walker = world.enemies.find((enemy) => enemy.id === "walker");
  assert.notEqual(hopper.y, hopper.startY);
  assert.notEqual(floater.y, floater.startY);
  assert.ok(Math.abs(charger.x - charger.startX) > Math.abs(walker.x - walker.startX) * 2);
});

test("charge enemies select the nearest player who is actually in their lane", () => {
  const level = baseLevel({
    enemies: [
      { id: "charger", x: 0, y: 1.15, z: 0, width: 1, height: 1.3, depth: 1, speed: 1, patrolAxis: "x", patrolMin: -10, patrolMax: 10, behavior: "charge" },
    ],
  });
  let world = addPlayer3D(createWorld3D(level), "guest");
  world.players.player.x = 1;
  world.players.player.z = 5;
  world.players.guest.x = 3;
  world.players.guest.z = 0;
  world = tick(world);
  const charger = world.enemies[0];
  assert.equal(charger.direction, 1);
  assert.ok(charger.x > charger.speed * FIXED_TIMESTEP_3D * 2);
});
