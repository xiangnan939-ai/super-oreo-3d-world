import assert from "node:assert/strict";
import test from "node:test";

import {
  DEFAULT_GAME_SETTINGS,
  GAME_ACTIONS,
  normalizeGameSettings,
} from "../game/settings.ts";
import { normalizeDeveloperOptions } from "../game/developer.ts";

test("normalizes camera settings and rejects reserved bindings", () => {
  const settings = normalizeGameSettings({
    mouseSensitivity: 99,
    invertYAxis: true,
    autoPointerLock: false,
    keyBindings: { forward: "Tab", jump: "Escape", left: "KeyT", right: "Backquote" },
  });
  assert.equal(settings.mouseSensitivity, 2);
  assert.equal(settings.invertYAxis, true);
  assert.equal(settings.autoPointerLock, false);
  assert.equal(settings.keyBindings.forward, DEFAULT_GAME_SETTINGS.keyBindings.forward);
  assert.equal(settings.keyBindings.jump, DEFAULT_GAME_SETTINGS.keyBindings.jump);
  assert.equal(settings.keyBindings.left, DEFAULT_GAME_SETTINGS.keyBindings.left);
  assert.equal(settings.keyBindings.right, DEFAULT_GAME_SETTINGS.keyBindings.right);
});

test("clamps developer controls to safe local ranges", () => {
  const options = normalizeDeveloperOptions({
    enabled: true,
    flying: true,
    invulnerable: true,
    lives: 500,
    moveSpeedMultiplier: 20,
    jumpHeightMultiplier: 0.01,
  });
  assert.equal(options.enabled, true);
  assert.equal(options.flying, true);
  assert.equal(options.invulnerable, true);
  assert.equal(options.lives, 99);
  assert.equal(options.moveSpeedMultiplier, 4);
  assert.equal(options.jumpHeightMultiplier, 0.5);
});

test("keeps every normalized action binding unique", () => {
  const settings = normalizeGameSettings({
    keyBindings: { forward: "KeyS", backward: "KeyS", left: "KeyS" },
  });
  const codes = GAME_ACTIONS.map((action) => settings.keyBindings[action]);
  assert.equal(new Set(codes).size, GAME_ACTIONS.length);
});
