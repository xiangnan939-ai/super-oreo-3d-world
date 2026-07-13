import assert from "node:assert/strict";
import test from "node:test";

import {
  DEFAULT_GAME_SETTINGS,
  GAME_ACTIONS,
  normalizeGameSettings,
} from "../game/settings.ts";

test("normalizes camera settings and rejects reserved bindings", () => {
  const settings = normalizeGameSettings({
    mouseSensitivity: 99,
    invertYAxis: true,
    autoPointerLock: false,
    keyBindings: { forward: "Tab", jump: "Escape" },
  });
  assert.equal(settings.mouseSensitivity, 2);
  assert.equal(settings.invertYAxis, true);
  assert.equal(settings.autoPointerLock, false);
  assert.equal(settings.keyBindings.forward, DEFAULT_GAME_SETTINGS.keyBindings.forward);
  assert.equal(settings.keyBindings.jump, DEFAULT_GAME_SETTINGS.keyBindings.jump);
});

test("keeps every normalized action binding unique", () => {
  const settings = normalizeGameSettings({
    keyBindings: { forward: "KeyS", backward: "KeyS", left: "KeyS" },
  });
  const codes = GAME_ACTIONS.map((action) => settings.keyBindings[action]);
  assert.equal(new Set(codes).size, GAME_ACTIONS.length);
});
