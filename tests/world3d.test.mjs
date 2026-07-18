import assert from "node:assert/strict";
import test from "node:test";

import { toSimulationLevel } from "../game/level3d.ts";
import { createWorld3D, PHYSICS_3D } from "../game/simulation3d.ts";
import { WORLD_3D } from "../game/world3d.ts";

test("adapts every visible ramp, fence and landmark blocker into physics", () => {
  const level = toSimulationLevel();
  for (const ramp of WORLD_3D.ramps) {
    assert.ok(level.platforms.some((platform) => platform.id.startsWith(`${ramp.id}-collision-`)));
  }
  for (const fence of WORLD_3D.fences.filter((item) => item.collision)) {
    assert.ok(level.blockers.some((blocker) => blocker.id.startsWith(`${fence.id}-collision-`)));
  }
  for (const blocker of WORLD_3D.blockers) {
    assert.ok(level.blockers.some((item) => item.id === blocker.id));
  }
});

test("ships the six-biome expedition with optional challenge routes", () => {
  const level = toSimulationLevel();
  assert.equal(level.checkpoints.length, 6);
  assert.equal(WORLD_3D.biomes.length, 6);
  assert.ok(WORLD_3D.platforms.some((platform) => platform.id === "island-sun-citadel"));
  assert.ok(WORLD_3D.platforms.some((platform) => platform.surface === "ice"));
  assert.ok(WORLD_3D.platforms.some((platform) => platform.surface === "conveyor"));
  assert.ok(WORLD_3D.hazards.some((hazard) => hazard.schedule));
  assert.ok(WORLD_3D.airTubes.length >= 2);
  assert.ok(WORLD_3D.boostPads.length >= 4);
  assert.ok(WORLD_3D.windZones.length >= 2);
  assert.ok(WORLD_3D.collectibles.filter((item) => item.kind === "coin").length >= 140);
  assert.equal(WORLD_3D.collectibles.filter((item) => item.kind === "star_medal").length, 5);
  assert.equal(WORLD_3D.collectibles.filter((item) => item.kind === "moon_shard").length, 5);
  assert.ok(WORLD_3D.assetProps.length >= 10);
  assert.equal(WORLD_3D.goal.id, "goal-moon-gate");
  assert.equal(WORLD_3D.goal.requiredStarMedals, 3);
});

test("instantiates the complete production expedition without duplicate entity ids", () => {
  assert.doesNotThrow(() => createWorld3D(toSimulationLevel()));
});

test("keeps secret-route collectibles inside reachable launch and tube envelopes", () => {
  for (const [padId, collectibleId] of [
    ["boost-citadel-secret", "moon-shard-03-sky"],
    ["boost-cocoa-loft", "star-medal-05-cocoa-loft"],
  ]) {
    const pad = WORLD_3D.boostPads.find((item) => item.id === padId);
    const collectible = WORLD_3D.collectibles.find((item) => item.id === collectibleId);
    const launchCentreY = pad.position.y + pad.size.y / 2;
    const maximumPlayerTop = launchCentreY + pad.launchVelocity.y ** 2 / (-2 * PHYSICS_3D.gravity) + PHYSICS_3D.playerHeight / 2;
    const collectibleBottom = collectible.position.y - collectible.pickupRadius;
    assert.ok(maximumPlayerTop - collectibleBottom >= 0.15, `${collectibleId} needs launch-height safety margin`);
  }

  const frostTube = WORLD_3D.airTubes.find((item) => item.id === "aero-ribbon-frost-secret");
  const frostShard = WORLD_3D.collectibles.find((item) => item.id === "moon-shard-04-frost");
  assert.ok(Math.abs(frostShard.position.x - frostTube.exit.position.x) <= frostTube.exit.size.x / 2);
  assert.ok(Math.abs(frostShard.position.y - frostTube.exit.position.y) <= frostTube.exit.size.y / 2);
  assert.ok(Math.abs(frostShard.position.z - frostTube.exit.position.z) <= frostTube.exit.size.z / 2);
});

test("keeps new cargo and moon-orbit platform endpoints out of static geometry", () => {
  const overlaps = (a, b) =>
    Math.abs(a.position.x - b.position.x) * 2 < a.size.x + b.size.x &&
    Math.abs(a.position.y - b.position.y) * 2 < a.size.y + b.size.y &&
    Math.abs(a.position.z - b.position.z) * 2 < a.size.z + b.size.z;
  const ids = new Set(["moving-cocoa-cargo", "moving-moon-orbit-01", "moving-moon-orbit-02"]);
  for (const moving of WORLD_3D.movingPlatforms.filter((item) => ids.has(item.id))) {
    for (const endpoint of [moving.path.from, moving.path.to]) {
      const endpointBox = { position: endpoint, size: moving.size };
      const collisions = WORLD_3D.platforms.filter((platform) => overlaps(endpointBox, platform));
      assert.deepEqual(collisions.map((platform) => platform.id), [], `${moving.id} endpoint intersects static geometry`);
    }
  }
});
