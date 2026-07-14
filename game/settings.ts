export const GAME_ACTIONS = [
  "forward",
  "backward",
  "left",
  "right",
  "jump",
  "sprint",
  "dash",
  "restart",
] as const;

export type GameAction = (typeof GAME_ACTIONS)[number];

export interface GameSettings {
  /** Multiplier applied to the authored camera sensitivity. */
  mouseSensitivity: number;
  invertYAxis: boolean;
  autoPointerLock: boolean;
  keyBindings: Record<GameAction, string>;
}

export const DEFAULT_GAME_SETTINGS: GameSettings = {
  mouseSensitivity: 1,
  invertYAxis: false,
  autoPointerLock: true,
  keyBindings: {
    forward: "KeyW",
    backward: "KeyS",
    left: "KeyA",
    right: "KeyD",
    jump: "Space",
    sprint: "ShiftLeft",
    dash: "KeyE",
    restart: "KeyR",
  },
};

export const GAME_ACTION_LABELS: Record<GameAction, string> = {
  forward: "向前移动",
  backward: "向后移动",
  left: "向左移动",
  right: "向右移动",
  jump: "跳跃",
  sprint: "加速奔跑",
  dash: "空中冲刺",
  restart: "从头重开",
};

const RESERVED_BINDINGS = new Set(["Tab", "Escape"]);

function finiteNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

export function normalizeGameSettings(value: unknown): GameSettings {
  const candidate = value && typeof value === "object"
    ? value as Partial<GameSettings>
    : {};
  const candidateBindings = candidate.keyBindings && typeof candidate.keyBindings === "object"
    ? candidate.keyBindings as Partial<Record<GameAction, unknown>>
    : {};
  const used = new Set<string>();
  const keyBindings = {} as Record<GameAction, string>;
  const defaultCodes = GAME_ACTIONS.map((action) => DEFAULT_GAME_SETTINGS.keyBindings[action]);

  for (const action of GAME_ACTIONS) {
    const candidateCode = candidateBindings[action];
    let code =
      typeof candidateCode === "string" &&
      candidateCode.length > 0 &&
      candidateCode.length <= 32 &&
      !RESERVED_BINDINGS.has(candidateCode) &&
      !used.has(candidateCode)
        ? candidateCode
        : DEFAULT_GAME_SETTINGS.keyBindings[action];
    if (
      used.has(code)
    ) {
      code = defaultCodes.find((item) => !used.has(item)) ?? code;
    }
    keyBindings[action] = code;
    used.add(code);
  }

  return {
    mouseSensitivity: Math.min(2, Math.max(0.35, finiteNumber(candidate.mouseSensitivity, 1))),
    invertYAxis: candidate.invertYAxis === true,
    autoPointerLock: candidate.autoPointerLock !== false,
    keyBindings,
  };
}

export function keyCodeLabel(code: string): string {
  if (code === "Space") return "空格";
  if (code === "ShiftLeft") return "左 Shift";
  if (code === "ShiftRight") return "右 Shift";
  if (code === "ControlLeft") return "左 Ctrl";
  if (code === "ControlRight") return "右 Ctrl";
  if (code === "ArrowUp") return "↑";
  if (code === "ArrowDown") return "↓";
  if (code === "ArrowLeft") return "←";
  if (code === "ArrowRight") return "→";
  if (code.startsWith("Key")) return code.slice(3);
  if (code.startsWith("Digit")) return code.slice(5);
  return code.replace(/(Left|Right)$/, " $1");
}
