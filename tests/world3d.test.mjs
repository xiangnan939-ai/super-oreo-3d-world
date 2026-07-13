import assert from "node:assert/strict";
import test from "node:test";

import { toSimulationLevel } from "../game/level3d.ts";
import { WORLD_3D } from "../game/world3d.ts";

test("adapts every visible ramp and collidable fence into physics", () => {
  const level = toSimulationLevel();
  for (const ramp of WORLD_3D.ramps) {
    assert.ok(level.platforms.some((platform) => platform.id.startsWith(`${ramp.id}-collision-`)));
  }
  for (const fence of WORLD_3D.fences.filter((item) => item.collision)) {
    assert.ok(level.blockers.some((blocker) => blocker.id.startsWith(`${fence.id}-collision-`)));
  }
});

test("ships the extended four-checkpoint challenge course", () => {
  const level = toSimulationLevel();
  assert.equal(level.checkpoints.length, 4);
  assert.ok(WORLD_3D.platforms.some((platform) => platform.id === "island-sun-citadel"));
  assert.ok(WORLD_3D.boostPads.length >= 2);
  assert.ok(WORLD_3D.windZones.length >= 1);
  assert.ok(WORLD_3D.collectibles.filter((item) => item.kind === "coin").length >= 100);
});
