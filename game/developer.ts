export interface DeveloperOptions {
  enabled: boolean;
  flying: boolean;
  invulnerable: boolean;
  lives: number;
  moveSpeedMultiplier: number;
  jumpHeightMultiplier: number;
}

export const DEFAULT_DEVELOPER_OPTIONS: DeveloperOptions = {
  enabled: false,
  flying: false,
  invulnerable: false,
  lives: 5,
  moveSpeedMultiplier: 1,
  jumpHeightMultiplier: 1,
};

function finiteNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

export function normalizeDeveloperOptions(value: unknown): DeveloperOptions {
  const candidate = value && typeof value === "object"
    ? value as Partial<DeveloperOptions>
    : {};
  return {
    enabled: candidate.enabled === true,
    flying: candidate.flying === true,
    invulnerable: candidate.invulnerable === true,
    lives: Math.round(Math.min(99, Math.max(1, finiteNumber(candidate.lives, 5)))),
    moveSpeedMultiplier: Math.min(4, Math.max(0.5, finiteNumber(candidate.moveSpeedMultiplier, 1))),
    jumpHeightMultiplier: Math.min(3, Math.max(0.5, finiteNumber(candidate.jumpHeightMultiplier, 1))),
  };
}
