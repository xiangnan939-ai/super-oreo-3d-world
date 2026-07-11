/**
 * Deterministic, serializable 2D platform simulation for a Three.js renderer.
 *
 * All entity positions are rectangle centre points. The renderer can therefore
 * copy `x` and `y` straight to a mesh and keep the visual lane on any fixed z.
 * `stepWorld` never mutates the world passed to it and advances at a fixed 60 Hz.
 */

export const FIXED_TIMESTEP = 1 / 60;
export const MAX_FRAME_TIME = 0.25;

export const PHYSICS = {
  gravity: -38,
  walkSpeed: 6,
  sprintSpeed: 9,
  groundAcceleration: 58,
  airAcceleration: 31,
  groundDeceleration: 72,
  jumpSpeed: 14,
  jumpReleaseSpeed: 5.5,
  maxFallSpeed: 24,
  coyoteTime: 0.1,
  jumpBufferTime: 0.12,
  stompBounceSpeed: 9.5,
  respawnDelay: 0.65,
  respawnInvulnerability: 0.75,
  playerWidth: 0.72,
  playerHeight: 1.4,
  collisionEpsilon: 0.001,
} as const;

export interface Vec2 {
  x: number;
  y: number;
}

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface InputState {
  left?: boolean;
  right?: boolean;
  jump?: boolean;
  sprint?: boolean;
}

export type NormalizedInputState = Required<InputState>;
export type InputMap = Readonly<Record<string, InputState | undefined>>;

export interface PlatformMotion {
  /** Total offset from the authored position at the far end of the path. */
  x: number;
  y: number;
  /** Seconds for a complete out-and-back trip. */
  period: number;
  /** Normalized starting phase in the range 0..1. */
  phase?: number;
}

export interface PlatformDefinition extends Rect {
  id: string;
  motion?: PlatformMotion;
  /** One-way platforms only collide with a player landing on their top face. */
  oneWay?: boolean;
}

export interface Platform extends Rect {
  id: string;
  motion?: PlatformMotion;
  oneWay: boolean;
  originX: number;
  originY: number;
  previousX: number;
  previousY: number;
}

export interface HazardDefinition extends Rect {
  id: string;
  active?: boolean;
}

export interface Hazard extends Rect {
  id: string;
  active: boolean;
}

export interface CollectibleDefinition extends Rect {
  id: string;
  value?: number;
}

export interface Collectible extends Rect {
  id: string;
  value: number;
  collected: boolean;
  collectedBy: string | null;
}

export interface EnemyDefinition extends Rect {
  id: string;
  speed?: number;
  direction?: -1 | 1;
  patrolMinX?: number;
  patrolMaxX?: number;
  stompable?: boolean;
  points?: number;
}

export interface Enemy extends Rect {
  id: string;
  speed: number;
  direction: -1 | 1;
  patrolMinX: number;
  patrolMaxX: number;
  stompable: boolean;
  points: number;
  alive: boolean;
  startX: number;
  startY: number;
  previousX: number;
  previousY: number;
}

export interface CheckpointDefinition extends Rect {
  id: string;
  /** Defaults to the checkpoint centre when omitted. */
  respawn?: Vec2;
}

export interface Checkpoint extends Rect {
  id: string;
  respawnX: number;
  respawnY: number;
}

export interface GoalDefinition extends Rect {
  id?: string;
}

export interface Goal extends Rect {
  id: string;
}

export interface LevelBounds {
  minX: number;
  maxX: number;
  killY: number;
}

export interface LevelDefinition {
  id: string;
  name?: string;
  spawn: Vec2;
  bounds?: Partial<LevelBounds>;
  lives?: number;
  platforms: readonly PlatformDefinition[];
  hazards?: readonly HazardDefinition[];
  collectibles?: readonly CollectibleDefinition[];
  enemies?: readonly EnemyDefinition[];
  checkpoints?: readonly CheckpointDefinition[];
  goal?: GoalDefinition | null;
}

export type PlayerStatus = "active" | "dead" | "won" | "game-over";
export type WorldStatus = "playing" | "won" | "game-over";

export interface PlayerState extends Rect {
  id: string;
  vx: number;
  vy: number;
  facing: -1 | 1;
  grounded: boolean;
  groundPlatformId: string | null;
  status: PlayerStatus;
  lives: number;
  deaths: number;
  score: number;
  collectibleCount: number;
  checkpointId: string | null;
  respawnX: number;
  respawnY: number;
  respawnRemaining: number;
  invulnerabilityRemaining: number;
  coyoteRemaining: number;
  jumpBufferRemaining: number;
  jumpCutAvailable: boolean;
  input: NormalizedInputState;
}

export type DeathReason = "fall" | "hazard" | "enemy";

export type GameEvent =
  | { type: "death"; playerId: string; reason: DeathReason; sourceId?: string }
  | { type: "respawn"; playerId: string }
  | { type: "game-over"; playerId: string }
  | {
      type: "collectible";
      playerId: string;
      collectibleId: string;
      value: number;
    }
  | { type: "checkpoint"; playerId: string; checkpointId: string }
  | { type: "enemy-stomp"; playerId: string; enemyId: string; value: number }
  | { type: "goal"; playerId: string; goalId: string };

export interface WorldState {
  levelId: string;
  levelName: string;
  time: number;
  tick: number;
  /** Unsimulated wall-clock time, always less than one fixed tick. */
  accumulator: number;
  status: WorldStatus;
  bounds: LevelBounds;
  spawn: Vec2;
  initialLives: number;
  players: Record<string, PlayerState>;
  platforms: Platform[];
  hazards: Hazard[];
  collectibles: Collectible[];
  enemies: Enemy[];
  checkpoints: Checkpoint[];
  goal: Goal | null;
  /** Events generated by the most recent `stepWorld` call only. */
  events: GameEvent[];
}

const NEUTRAL_INPUT: NormalizedInputState = {
  left: false,
  right: false,
  jump: false,
  sprint: false,
};

function normalizeInput(input: InputState | undefined): NormalizedInputState {
  return {
    left: input?.left === true,
    right: input?.right === true,
    jump: input?.jump === true,
    sprint: input?.sprint === true,
  };
}

function createPlayer(
  id: string,
  spawn: Vec2,
  lives: number,
): PlayerState {
  return {
    id,
    x: spawn.x,
    y: spawn.y,
    width: PHYSICS.playerWidth,
    height: PHYSICS.playerHeight,
    vx: 0,
    vy: 0,
    facing: 1,
    grounded: false,
    groundPlatformId: null,
    status: "active",
    lives,
    deaths: 0,
    score: 0,
    collectibleCount: 0,
    checkpointId: null,
    respawnX: spawn.x,
    respawnY: spawn.y,
    respawnRemaining: 0,
    invulnerabilityRemaining: 0,
    coyoteRemaining: 0,
    jumpBufferRemaining: 0,
    jumpCutAvailable: false,
    input: { ...NEUTRAL_INPUT },
  };
}

function finiteOr(value: number | undefined, fallback: number): number {
  return Number.isFinite(value) ? (value as number) : fallback;
}

function deriveHorizontalBounds(level: LevelDefinition): {
  minX: number;
  maxX: number;
} {
  const rects: Rect[] = [
    ...level.platforms,
    ...(level.hazards ?? []),
    ...(level.collectibles ?? []),
    ...(level.enemies ?? []),
    ...(level.checkpoints ?? []),
    ...(level.goal ? [level.goal] : []),
  ];
  if (rects.length === 0) {
    return { minX: level.spawn.x - 20, maxX: level.spawn.x + 20 };
  }
  let minX = level.spawn.x;
  let maxX = level.spawn.x;
  for (const rect of rects) {
    minX = Math.min(minX, rect.x - rect.width / 2);
    maxX = Math.max(maxX, rect.x + rect.width / 2);
  }
  return { minX: minX - 8, maxX: maxX + 8 };
}

function assertRect(rect: Rect, label: string): void {
  if (
    !Number.isFinite(rect.x) ||
    !Number.isFinite(rect.y) ||
    !Number.isFinite(rect.width) ||
    !Number.isFinite(rect.height) ||
    rect.width <= 0 ||
    rect.height <= 0
  ) {
    throw new Error(`${label} must have finite coordinates and positive dimensions`);
  }
}

function assertUniqueIds(level: LevelDefinition): void {
  const ids = new Set<string>();
  const groups: ReadonlyArray<readonly { id: string }[]> = [
    level.platforms,
    level.hazards ?? [],
    level.collectibles ?? [],
    level.enemies ?? [],
    level.checkpoints ?? [],
  ];
  for (const group of groups) {
    for (const entity of group) {
      if (ids.has(entity.id)) {
        throw new Error(`Duplicate level entity id: ${entity.id}`);
      }
      ids.add(entity.id);
    }
  }
  if (level.goal?.id && ids.has(level.goal.id)) {
    throw new Error(`Duplicate level entity id: ${level.goal.id}`);
  }
}

/** Create a fresh, JSON-serializable world containing the first player. */
export function createWorld(
  level: LevelDefinition,
  playerId: string,
): WorldState {
  if (!playerId) {
    throw new Error("playerId must not be empty");
  }
  if (!level.id) {
    throw new Error("level.id must not be empty");
  }
  if (!Number.isFinite(level.spawn.x) || !Number.isFinite(level.spawn.y)) {
    throw new Error("level.spawn must contain finite coordinates");
  }
  assertUniqueIds(level);
  level.platforms.forEach((rect) => assertRect(rect, `Platform ${rect.id}`));
  (level.hazards ?? []).forEach((rect) => assertRect(rect, `Hazard ${rect.id}`));
  (level.collectibles ?? []).forEach((rect) =>
    assertRect(rect, `Collectible ${rect.id}`),
  );
  (level.enemies ?? []).forEach((rect) => assertRect(rect, `Enemy ${rect.id}`));
  (level.checkpoints ?? []).forEach((rect) =>
    assertRect(rect, `Checkpoint ${rect.id}`),
  );
  if (level.goal) assertRect(level.goal, "Goal");

  const derivedBounds = deriveHorizontalBounds(level);
  const bounds: LevelBounds = {
    minX: finiteOr(level.bounds?.minX, derivedBounds.minX),
    maxX: finiteOr(level.bounds?.maxX, derivedBounds.maxX),
    killY: finiteOr(level.bounds?.killY, level.spawn.y - 20),
  };
  if (bounds.minX >= bounds.maxX) {
    throw new Error("level.bounds.minX must be less than maxX");
  }

  const initialLives = Math.max(1, Math.floor(finiteOr(level.lives, 3)));
  const platforms: Platform[] = level.platforms.map((platform) => ({
    ...platform,
    motion: platform.motion ? { ...platform.motion } : undefined,
    oneWay: platform.oneWay === true,
    originX: platform.x,
    originY: platform.y,
    previousX: platform.x,
    previousY: platform.y,
  }));
  for (const platform of platforms) {
    if (platform.motion && (!(platform.motion.period > 0) || !Number.isFinite(platform.motion.period))) {
      throw new Error(`Platform ${platform.id} motion.period must be positive`);
    }
  }

  const hazards: Hazard[] = (level.hazards ?? []).map((hazard) => ({
    ...hazard,
    active: hazard.active !== false,
  }));
  const collectibles: Collectible[] = (level.collectibles ?? []).map(
    (collectible) => ({
      ...collectible,
      value: finiteOr(collectible.value, 100),
      collected: false,
      collectedBy: null,
    }),
  );
  const enemies: Enemy[] = (level.enemies ?? []).map((enemy) => {
    const speed = Math.max(0, finiteOr(enemy.speed, 0));
    const defaultRange = speed > 0 ? 3 : 0;
    return {
      ...enemy,
      speed,
      direction: enemy.direction === -1 ? -1 : 1,
      patrolMinX: finiteOr(enemy.patrolMinX, enemy.x - defaultRange),
      patrolMaxX: finiteOr(enemy.patrolMaxX, enemy.x + defaultRange),
      stompable: enemy.stompable !== false,
      points: finiteOr(enemy.points, 200),
      alive: true,
      startX: enemy.x,
      startY: enemy.y,
      previousX: enemy.x,
      previousY: enemy.y,
    };
  });
  const checkpoints: Checkpoint[] = (level.checkpoints ?? []).map(
    (checkpoint) => ({
      id: checkpoint.id,
      x: checkpoint.x,
      y: checkpoint.y,
      width: checkpoint.width,
      height: checkpoint.height,
      respawnX: checkpoint.respawn?.x ?? checkpoint.x,
      respawnY: checkpoint.respawn?.y ?? checkpoint.y,
    }),
  );
  const goal: Goal | null = level.goal
    ? { ...level.goal, id: level.goal.id ?? "goal" }
    : null;

  return {
    levelId: level.id,
    levelName: level.name ?? level.id,
    time: 0,
    tick: 0,
    accumulator: 0,
    status: "playing",
    bounds,
    spawn: { ...level.spawn },
    initialLives,
    players: {
      [playerId]: createPlayer(playerId, level.spawn, initialLives),
    },
    platforms,
    hazards,
    collectibles,
    enemies,
    checkpoints,
    goal,
    events: [],
  };
}

function cloneWorld(world: WorldState): WorldState {
  const players: Record<string, PlayerState> = {};
  for (const [id, player] of Object.entries(world.players)) {
    players[id] = { ...player, input: { ...player.input } };
  }
  return {
    ...world,
    bounds: { ...world.bounds },
    spawn: { ...world.spawn },
    players,
    platforms: world.platforms.map((platform) => ({
      ...platform,
      motion: platform.motion ? { ...platform.motion } : undefined,
    })),
    hazards: world.hazards.map((hazard) => ({ ...hazard })),
    collectibles: world.collectibles.map((collectible) => ({ ...collectible })),
    enemies: world.enemies.map((enemy) => ({ ...enemy })),
    checkpoints: world.checkpoints.map((checkpoint) => ({ ...checkpoint })),
    goal: world.goal ? { ...world.goal } : null,
    events: [],
  };
}

/** Pure helper for adding another network player at the level spawn. */
export function addPlayer(world: WorldState, playerId: string): WorldState {
  if (!playerId) throw new Error("playerId must not be empty");
  if (world.players[playerId]) return world;
  const next = cloneWorld(world);
  next.players[playerId] = createPlayer(
    playerId,
    next.spawn,
    next.initialLives,
  );
  if (next.status === "game-over") next.status = "playing";
  return next;
}

function moveToward(value: number, target: number, maxDelta: number): number {
  if (value < target) return Math.min(value + maxDelta, target);
  if (value > target) return Math.max(value - maxDelta, target);
  return target;
}

function horizontalOverlap(a: Rect, b: Rect): boolean {
  return Math.abs(a.x - b.x) * 2 < a.width + b.width;
}

function verticalOverlap(a: Rect, b: Rect): boolean {
  return Math.abs(a.y - b.y) * 2 < a.height + b.height;
}

function overlaps(a: Rect, b: Rect): boolean {
  return horizontalOverlap(a, b) && verticalOverlap(a, b);
}

function updateMovingPlatforms(world: WorldState): void {
  for (const platform of world.platforms) {
    platform.previousX = platform.x;
    platform.previousY = platform.y;
    if (!platform.motion) continue;
    const rawPhase = world.time / platform.motion.period + (platform.motion.phase ?? 0);
    const phase = ((rawPhase % 1) + 1) % 1;
    const progress = phase < 0.5 ? phase * 2 : (1 - phase) * 2;
    platform.x = platform.originX + platform.motion.x * progress;
    platform.y = platform.originY + platform.motion.y * progress;
  }
}

function updateEnemies(world: WorldState, dt: number): void {
  for (const enemy of world.enemies) {
    enemy.previousX = enemy.x;
    enemy.previousY = enemy.y;
    if (!enemy.alive || enemy.speed <= 0) continue;
    enemy.x += enemy.direction * enemy.speed * dt;
    if (enemy.x < enemy.patrolMinX) {
      enemy.x = enemy.patrolMinX;
      enemy.direction = 1;
    } else if (enemy.x > enemy.patrolMaxX) {
      enemy.x = enemy.patrolMaxX;
      enemy.direction = -1;
    }
  }
}

function resolveHorizontal(player: PlayerState, startX: number, platforms: Platform[]): void {
  const deltaX = player.x - startX;
  if (Math.abs(deltaX) <= Number.EPSILON) return;

  let collision: Platform | null = null;
  if (deltaX > 0) {
    let nearestFace = Number.POSITIVE_INFINITY;
    const oldRight = startX + player.width / 2;
    const newRight = player.x + player.width / 2;
    for (const platform of platforms) {
      if (platform.oneWay || !verticalOverlap(player, platform)) continue;
      const oldLeft = platform.previousX - platform.width / 2;
      const newLeft = platform.x - platform.width / 2;
      const crossed =
        oldRight <= oldLeft + PHYSICS.collisionEpsilon &&
        newRight >= newLeft - PHYSICS.collisionEpsilon;
      if ((crossed || overlaps(player, platform)) && newLeft < nearestFace) {
        nearestFace = newLeft;
        collision = platform;
      }
    }
    if (collision) player.x = collision.x - collision.width / 2 - player.width / 2;
  } else {
    let nearestFace = Number.NEGATIVE_INFINITY;
    const oldLeft = startX - player.width / 2;
    const newLeft = player.x - player.width / 2;
    for (const platform of platforms) {
      if (platform.oneWay || !verticalOverlap(player, platform)) continue;
      const oldRight = platform.previousX + platform.width / 2;
      const newRight = platform.x + platform.width / 2;
      const crossed =
        oldLeft >= oldRight - PHYSICS.collisionEpsilon &&
        newLeft <= newRight + PHYSICS.collisionEpsilon;
      if ((crossed || overlaps(player, platform)) && newRight > nearestFace) {
        nearestFace = newRight;
        collision = platform;
      }
    }
    if (collision) player.x = collision.x + collision.width / 2 + player.width / 2;
  }
  if (collision) player.vx = 0;
}

function resolveVertical(player: PlayerState, startY: number, platforms: Platform[]): boolean {
  const deltaY = player.y - startY;
  let landedOn: Platform | null = null;

  if (deltaY <= 0) {
    let highestTop = Number.NEGATIVE_INFINITY;
    const oldBottom = startY - player.height / 2;
    const newBottom = player.y - player.height / 2;
    for (const platform of platforms) {
      if (!horizontalOverlap(player, platform)) continue;
      const oldTop = platform.previousY + platform.height / 2;
      const newTop = platform.y + platform.height / 2;
      const crossed =
        oldBottom >= oldTop - PHYSICS.collisionEpsilon &&
        newBottom <= newTop + PHYSICS.collisionEpsilon;
      if ((crossed || (!platform.oneWay && overlaps(player, platform))) && newTop > highestTop) {
        highestTop = newTop;
        landedOn = platform;
      }
    }
    if (landedOn) {
      player.y = landedOn.y + landedOn.height / 2 + player.height / 2;
      player.vy = 0;
      player.grounded = true;
      player.groundPlatformId = landedOn.id;
      player.jumpCutAvailable = false;
      return true;
    }
  } else {
    let lowestBottom = Number.POSITIVE_INFINITY;
    const oldTop = startY + player.height / 2;
    const newTop = player.y + player.height / 2;
    let hit: Platform | null = null;
    for (const platform of platforms) {
      if (platform.oneWay || !horizontalOverlap(player, platform)) continue;
      const oldBottom = platform.previousY - platform.height / 2;
      const newBottom = platform.y - platform.height / 2;
      const crossed =
        oldTop <= oldBottom + PHYSICS.collisionEpsilon &&
        newTop >= newBottom - PHYSICS.collisionEpsilon;
      if ((crossed || overlaps(player, platform)) && newBottom < lowestBottom) {
        lowestBottom = newBottom;
        hit = platform;
      }
    }
    if (hit) {
      player.y = hit.y - hit.height / 2 - player.height / 2;
      player.vy = 0;
      player.jumpCutAvailable = false;
    }
  }
  return false;
}

function consumeBufferedJump(player: PlayerState): boolean {
  if (player.jumpBufferRemaining <= 0 || player.coyoteRemaining <= 0) {
    return false;
  }
  player.vy = PHYSICS.jumpSpeed;
  player.grounded = false;
  player.groundPlatformId = null;
  player.coyoteRemaining = 0;
  player.jumpBufferRemaining = 0;
  player.jumpCutAvailable = true;
  return true;
}

function killPlayer(
  world: WorldState,
  player: PlayerState,
  reason: DeathReason,
  sourceId?: string,
): void {
  if (player.status !== "active") return;
  player.deaths += 1;
  player.lives = Math.max(0, player.lives - 1);
  player.vx = 0;
  player.vy = 0;
  player.grounded = false;
  player.groundPlatformId = null;
  player.jumpBufferRemaining = 0;
  player.coyoteRemaining = 0;
  player.jumpCutAvailable = false;
  world.events.push({ type: "death", playerId: player.id, reason, sourceId });
  if (player.lives === 0) {
    player.status = "game-over";
    player.respawnRemaining = 0;
    world.events.push({ type: "game-over", playerId: player.id });
  } else {
    player.status = "dead";
    player.respawnRemaining = PHYSICS.respawnDelay;
  }
}

function respawnPlayer(world: WorldState, player: PlayerState): void {
  player.x = player.respawnX;
  player.y = player.respawnY;
  player.vx = 0;
  player.vy = 0;
  player.facing = 1;
  player.grounded = false;
  player.groundPlatformId = null;
  player.status = "active";
  player.respawnRemaining = 0;
  player.invulnerabilityRemaining = PHYSICS.respawnInvulnerability;
  player.coyoteRemaining = 0;
  player.jumpBufferRemaining = 0;
  player.jumpCutAvailable = false;
  world.events.push({ type: "respawn", playerId: player.id });
}

function updatePlayer(world: WorldState, player: PlayerState, dt: number): void {
  if (player.status === "dead") {
    player.respawnRemaining = Math.max(0, player.respawnRemaining - dt);
    if (player.respawnRemaining === 0) respawnPlayer(world, player);
    return;
  }
  if (player.status !== "active") return;

  player.invulnerabilityRemaining = Math.max(
    0,
    player.invulnerabilityRemaining - dt,
  );
  player.jumpBufferRemaining = Math.max(0, player.jumpBufferRemaining - dt);

  const wasGrounded = player.grounded;
  if (wasGrounded) {
    player.coyoteRemaining = PHYSICS.coyoteTime;
    const platform = player.groundPlatformId
      ? world.platforms.find((candidate) => candidate.id === player.groundPlatformId)
      : undefined;
    if (platform) {
      player.x += platform.x - platform.previousX;
      player.y += platform.y - platform.previousY;
    }
  } else {
    player.coyoteRemaining = Math.max(0, player.coyoteRemaining - dt);
  }

  const axis = Number(player.input.right) - Number(player.input.left);
  if (axis !== 0) player.facing = axis < 0 ? -1 : 1;
  const maxSpeed = player.input.sprint ? PHYSICS.sprintSpeed : PHYSICS.walkSpeed;
  const targetVx = axis * maxSpeed;
  const acceleration = player.grounded
    ? axis === 0
      ? PHYSICS.groundDeceleration
      : PHYSICS.groundAcceleration
    : PHYSICS.airAcceleration;
  player.vx = moveToward(player.vx, targetVx, acceleration * dt);

  const jumped = consumeBufferedJump(player);
  if (player.jumpCutAvailable && !player.input.jump && player.vy > PHYSICS.jumpReleaseSpeed) {
    player.vy = PHYSICS.jumpReleaseSpeed;
    player.jumpCutAvailable = false;
  }

  player.vy = Math.max(
    player.vy + PHYSICS.gravity * dt,
    -PHYSICS.maxFallSpeed,
  );
  player.grounded = false;
  player.groundPlatformId = null;

  const startX = player.x;
  player.x += player.vx * dt;
  resolveHorizontal(player, startX, world.platforms);
  const halfWidth = player.width / 2;
  if (player.x - halfWidth < world.bounds.minX) {
    player.x = world.bounds.minX + halfWidth;
    player.vx = Math.max(0, player.vx);
  } else if (player.x + halfWidth > world.bounds.maxX) {
    player.x = world.bounds.maxX - halfWidth;
    player.vx = Math.min(0, player.vx);
  }

  const startY = player.y;
  const previousBottom = startY - player.height / 2;
  player.y += player.vy * dt;
  const landed = resolveVertical(player, startY, world.platforms);
  if (landed && !jumped) {
    player.coyoteRemaining = PHYSICS.coyoteTime;
    consumeBufferedJump(player);
  }

  if (player.y - player.height / 2 < world.bounds.killY) {
    killPlayer(world, player, "fall");
    return;
  }

  if (player.invulnerabilityRemaining === 0) {
    for (const hazard of world.hazards) {
      if (hazard.active && overlaps(player, hazard)) {
        killPlayer(world, player, "hazard", hazard.id);
        return;
      }
    }
  }

  for (const checkpoint of world.checkpoints) {
    if (player.checkpointId !== checkpoint.id && overlaps(player, checkpoint)) {
      player.checkpointId = checkpoint.id;
      player.respawnX = checkpoint.respawnX;
      player.respawnY = checkpoint.respawnY;
      world.events.push({
        type: "checkpoint",
        playerId: player.id,
        checkpointId: checkpoint.id,
      });
    }
  }

  for (const collectible of world.collectibles) {
    if (!collectible.collected && overlaps(player, collectible)) {
      collectible.collected = true;
      collectible.collectedBy = player.id;
      player.collectibleCount += 1;
      player.score += collectible.value;
      world.events.push({
        type: "collectible",
        playerId: player.id,
        collectibleId: collectible.id,
        value: collectible.value,
      });
    }
  }

  for (const enemy of world.enemies) {
    if (!enemy.alive || !overlaps(player, enemy)) continue;
    const enemyTop = enemy.y + enemy.height / 2;
    const descendingOntoEnemy =
      player.vy <= 0 &&
      previousBottom >= enemyTop - Math.max(0.12, Math.abs(player.vy * dt));
    if (enemy.stompable && descendingOntoEnemy) {
      enemy.alive = false;
      player.y = enemyTop + player.height / 2;
      player.vy = PHYSICS.stompBounceSpeed;
      player.grounded = false;
      player.groundPlatformId = null;
      player.jumpCutAvailable = false;
      player.score += enemy.points;
      world.events.push({
        type: "enemy-stomp",
        playerId: player.id,
        enemyId: enemy.id,
        value: enemy.points,
      });
    } else if (player.invulnerabilityRemaining === 0) {
      killPlayer(world, player, "enemy", enemy.id);
      return;
    }
  }

  if (world.goal && overlaps(player, world.goal)) {
    player.status = "won";
    player.vx = 0;
    player.vy = 0;
    world.status = "won";
    world.events.push({
      type: "goal",
      playerId: player.id,
      goalId: world.goal.id,
    });
  }
}

function refreshWorldStatus(world: WorldState): void {
  const players = Object.values(world.players);
  if (players.some((player) => player.status === "won")) {
    world.status = "won";
  } else if (
    players.length > 0 &&
    players.every((player) => player.status === "game-over")
  ) {
    world.status = "game-over";
  } else {
    world.status = "playing";
  }
}

function fixedStep(world: WorldState): void {
  world.tick += 1;
  world.time = world.tick * FIXED_TIMESTEP;
  updateMovingPlatforms(world);
  updateEnemies(world, FIXED_TIMESTEP);
  for (const player of Object.values(world.players)) {
    updatePlayer(world, player, FIXED_TIMESTEP);
  }
  refreshWorldStatus(world);
}

/**
 * Advance a world using per-player input snapshots.
 *
 * `dt` is wall-clock seconds. It is clamped to 250 ms and accumulated into
 * exact 1/60 s ticks, making the result suitable for client prediction and
 * authoritative server re-simulation. A jump press is latched even when a
 * render frame is shorter than one simulation tick.
 */
export function stepWorld(
  world: WorldState,
  inputs: InputMap,
  dt: number,
): WorldState {
  const next = cloneWorld(world);

  for (const [id, player] of Object.entries(next.players)) {
    const input = normalizeInput(inputs[id]);
    if (input.jump && !player.input.jump && player.status === "active") {
      player.jumpBufferRemaining = PHYSICS.jumpBufferTime;
    }
    player.input = input;
  }

  if (!Number.isFinite(dt) || dt <= 0) return next;
  next.accumulator += Math.min(dt, MAX_FRAME_TIME);
  while (next.accumulator + Number.EPSILON >= FIXED_TIMESTEP) {
    fixedStep(next);
    next.accumulator -= FIXED_TIMESTEP;
  }
  if (next.accumulator < 1e-12) next.accumulator = 0;
  return next;
}
