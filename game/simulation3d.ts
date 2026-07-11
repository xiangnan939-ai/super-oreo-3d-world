/**
 * Deterministic third-person 3D platform simulation.
 *
 * Every position is the centre point of an axis-aligned box. The renderer may
 * copy x/y/z directly to a mesh; this module intentionally has no dependency on
 * Three.js, the DOM, timers, or other runtime state. `stepWorld3D` clones its
 * input and advances it with exact 60 Hz ticks, so every returned value can be
 * JSON serialized for network prediction or replay.
 */

export const FIXED_TIMESTEP_3D = 1 / 60;
export const MAX_FRAME_TIME_3D = 0.25;

export const PHYSICS_3D = {
  fixedTimeStep: FIXED_TIMESTEP_3D,
  gravity: -38,
  walkSpeed: 6.5,
  sprintSpeed: 10,
  groundAcceleration: 54,
  airAcceleration: 24,
  groundDeceleration: 68,
  jumpSpeed: 14,
  jumpReleaseSpeed: 5.5,
  maxFallSpeed: 25,
  coyoteTime: 0.1,
  jumpBufferTime: 0.12,
  stompBounceSpeed: 10,
  respawnDelay: 0.65,
  respawnInvulnerability: 0.75,
  playerWidth: 0.72,
  playerHeight: 1.4,
  playerDepth: 0.72,
  collisionEpsilon: 0.001,
} as const;

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

/** Axis-aligned volume whose x/y/z coordinates are its centre point. */
export interface Box3D extends Vec3 {
  width: number;
  height: number;
  depth: number;
}

export interface InputState3D {
  forward?: boolean;
  backward?: boolean;
  left?: boolean;
  right?: boolean;
  jump?: boolean;
  sprint?: boolean;
  /** Camera yaw in radians. At zero, forward points towards world -Z. */
  cameraYaw?: number;
  /** Optional world-space movement. When either value is supplied, it wins. */
  moveX?: number;
  moveZ?: number;
}

export interface NormalizedInputState3D {
  forward: boolean;
  backward: boolean;
  left: boolean;
  right: boolean;
  jump: boolean;
  sprint: boolean;
  cameraYaw: number;
  moveX: number | null;
  moveZ: number | null;
}

export type InputMap3D = Readonly<
  Record<string, InputState3D | undefined>
>;
export type WorldInput3D = InputState3D | InputMap3D;

export interface PlatformMotionDefinition3D {
  /** Offset from the authored centre at the far end of the path. */
  x?: number;
  y?: number;
  z?: number;
  /** Seconds for a complete out-and-back trip. */
  period: number;
  /** Normalized start phase. Values outside 0..1 wrap safely. */
  phase?: number;
}

export interface PlatformMotion3D extends Vec3 {
  period: number;
  phase: number;
}

export interface PlatformDefinition3D extends Box3D {
  id: string;
  motion?: PlatformMotionDefinition3D;
  /** One-way platforms only collide with a descending player at their top. */
  oneWay?: boolean;
}

export interface Platform3D extends Box3D {
  id: string;
  motion: PlatformMotion3D | null;
  oneWay: boolean;
  originX: number;
  originY: number;
  originZ: number;
  previousX: number;
  previousY: number;
  previousZ: number;
}

/** A static solid AABB, useful for walls, pillars, and invisible boundaries. */
export interface BlockerDefinition3D extends Box3D {
  id: string;
}

export interface Blocker3D extends BlockerDefinition3D {
  previousX: number;
  previousY: number;
  previousZ: number;
  oneWay: false;
}

export interface HazardDefinition3D extends Box3D {
  id: string;
  active?: boolean;
}

export interface Hazard3D extends Box3D {
  id: string;
  active: boolean;
}

export interface CollectibleDefinition3D extends Box3D {
  id: string;
  value?: number;
}

export interface Collectible3D extends Box3D {
  id: string;
  value: number;
  collected: boolean;
  collectedBy: string | null;
}

export type PatrolAxis3D = "x" | "z";

export interface EnemyDefinition3D extends Box3D {
  id: string;
  speed?: number;
  direction?: -1 | 1;
  patrolAxis?: PatrolAxis3D;
  /** Minimum/maximum centre coordinate along patrolAxis. */
  patrolMin?: number;
  patrolMax?: number;
  stompable?: boolean;
  points?: number;
}

export interface Enemy3D extends Box3D {
  id: string;
  speed: number;
  direction: -1 | 1;
  patrolAxis: PatrolAxis3D;
  patrolMin: number;
  patrolMax: number;
  stompable: boolean;
  points: number;
  alive: boolean;
  startX: number;
  startY: number;
  startZ: number;
  previousX: number;
  previousY: number;
  previousZ: number;
}

export interface CheckpointDefinition3D extends Box3D {
  id: string;
  /** Defaults to the checkpoint's centre. */
  respawn?: Vec3;
}

export interface Checkpoint3D extends Box3D {
  id: string;
  respawnX: number;
  respawnY: number;
  respawnZ: number;
}

export interface GoalDefinition3D extends Box3D {
  id?: string;
}

export interface Goal3D extends Box3D {
  id: string;
}

export interface LevelBounds3D {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  killY: number;
}

export interface LevelDefinition3D {
  id: string;
  name?: string;
  spawn: Vec3;
  bounds?: Partial<LevelBounds3D>;
  lives?: number;
  platforms: readonly PlatformDefinition3D[];
  blockers?: readonly BlockerDefinition3D[];
  hazards?: readonly HazardDefinition3D[];
  collectibles?: readonly CollectibleDefinition3D[];
  enemies?: readonly EnemyDefinition3D[];
  checkpoints?: readonly CheckpointDefinition3D[];
  goal?: GoalDefinition3D | null;
}

export type PlayerStatus3D = "active" | "dead" | "won" | "game-over";
export type WorldStatus3D = "playing" | "won" | "game-over";

export interface PlayerState3D extends Box3D {
  id: string;
  vx: number;
  vy: number;
  vz: number;
  /** World-space facing direction in radians (atan2(x, z)). */
  facingYaw: number;
  grounded: boolean;
  groundObjectId: string | null;
  status: PlayerStatus3D;
  lives: number;
  deaths: number;
  score: number;
  collectibleCount: number;
  checkpointId: string | null;
  respawnX: number;
  respawnY: number;
  respawnZ: number;
  respawnRemaining: number;
  invulnerabilityRemaining: number;
  coyoteRemaining: number;
  jumpBufferRemaining: number;
  jumpCutAvailable: boolean;
  input: NormalizedInputState3D;
}

export type DeathReason3D = "fall" | "hazard" | "enemy";

export type GameEvent3D =
  | {
      type: "death";
      playerId: string;
      reason: DeathReason3D;
      sourceId?: string;
    }
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

export interface WorldState3D {
  levelId: string;
  levelName: string;
  time: number;
  tick: number;
  /** Wall-clock time not yet simulated; always less than one fixed tick. */
  accumulator: number;
  status: WorldStatus3D;
  bounds: LevelBounds3D;
  spawn: Vec3;
  initialLives: number;
  players: Record<string, PlayerState3D>;
  platforms: Platform3D[];
  blockers: Blocker3D[];
  hazards: Hazard3D[];
  collectibles: Collectible3D[];
  enemies: Enemy3D[];
  checkpoints: Checkpoint3D[];
  goal: Goal3D | null;
  /** Events produced by the latest call to stepWorld3D only. */
  events: GameEvent3D[];
}

interface CollisionBox3D extends Box3D {
  id: string;
  previousX: number;
  previousY: number;
  previousZ: number;
  oneWay: boolean;
}

const NEUTRAL_INPUT_3D: NormalizedInputState3D = {
  forward: false,
  backward: false,
  left: false,
  right: false,
  jump: false,
  sprint: false,
  cameraYaw: 0,
  moveX: null,
  moveZ: null,
};

function finiteOr(value: number | undefined, fallback: number): number {
  return Number.isFinite(value) ? (value as number) : fallback;
}

function normalizeInput3D(
  input: InputState3D | undefined,
): NormalizedInputState3D {
  const hasMoveX = Number.isFinite(input?.moveX);
  const hasMoveZ = Number.isFinite(input?.moveZ);
  const useWorldMovement = hasMoveX || hasMoveZ;
  return {
    forward: input?.forward === true,
    backward: input?.backward === true,
    left: input?.left === true,
    right: input?.right === true,
    jump: input?.jump === true,
    sprint: input?.sprint === true,
    cameraYaw: finiteOr(input?.cameraYaw, 0),
    moveX: useWorldMovement ? finiteOr(input?.moveX, 0) : null,
    moveZ: useWorldMovement ? finiteOr(input?.moveZ, 0) : null,
  };
}

function createPlayer3D(
  id: string,
  spawn: Vec3,
  lives: number,
): PlayerState3D {
  return {
    id,
    x: spawn.x,
    y: spawn.y,
    z: spawn.z,
    width: PHYSICS_3D.playerWidth,
    height: PHYSICS_3D.playerHeight,
    depth: PHYSICS_3D.playerDepth,
    vx: 0,
    vy: 0,
    vz: 0,
    facingYaw: Math.PI,
    grounded: false,
    groundObjectId: null,
    status: "active",
    lives,
    deaths: 0,
    score: 0,
    collectibleCount: 0,
    checkpointId: null,
    respawnX: spawn.x,
    respawnY: spawn.y,
    respawnZ: spawn.z,
    respawnRemaining: 0,
    invulnerabilityRemaining: 0,
    coyoteRemaining: 0,
    jumpBufferRemaining: 0,
    jumpCutAvailable: false,
    input: { ...NEUTRAL_INPUT_3D },
  };
}

function assertVec3(vector: Vec3, label: string): void {
  if (
    !Number.isFinite(vector.x) ||
    !Number.isFinite(vector.y) ||
    !Number.isFinite(vector.z)
  ) {
    throw new Error(`${label} must contain finite x/y/z coordinates`);
  }
}

function assertBox3D(box: Box3D, label: string): void {
  assertVec3(box, label);
  if (
    !Number.isFinite(box.width) ||
    !Number.isFinite(box.height) ||
    !Number.isFinite(box.depth) ||
    box.width <= 0 ||
    box.height <= 0 ||
    box.depth <= 0
  ) {
    throw new Error(`${label} must have positive finite width/height/depth`);
  }
}

function assertUniqueIds3D(level: LevelDefinition3D): void {
  const ids = new Set<string>();
  const groups: ReadonlyArray<readonly { id: string }[]> = [
    level.platforms,
    level.blockers ?? [],
    level.hazards ?? [],
    level.collectibles ?? [],
    level.enemies ?? [],
    level.checkpoints ?? [],
  ];
  for (const group of groups) {
    for (const entity of group) {
      if (!entity.id) throw new Error("Level entity id must not be empty");
      if (ids.has(entity.id)) {
        throw new Error(`Duplicate level entity id: ${entity.id}`);
      }
      ids.add(entity.id);
    }
  }
  const goalId = level.goal?.id ?? (level.goal ? "goal" : null);
  if (goalId && ids.has(goalId)) {
    throw new Error(`Duplicate level entity id: ${goalId}`);
  }
}

function deriveBounds3D(level: LevelDefinition3D): LevelBounds3D {
  const boxes: Box3D[] = [
    ...level.platforms,
    ...(level.blockers ?? []),
    ...(level.hazards ?? []),
    ...(level.collectibles ?? []),
    ...(level.enemies ?? []),
    ...(level.checkpoints ?? []),
    ...(level.goal ? [level.goal] : []),
  ];
  let minX = level.spawn.x;
  let maxX = level.spawn.x;
  let minZ = level.spawn.z;
  let maxZ = level.spawn.z;
  for (const box of boxes) {
    minX = Math.min(minX, box.x - box.width / 2);
    maxX = Math.max(maxX, box.x + box.width / 2);
    minZ = Math.min(minZ, box.z - box.depth / 2);
    maxZ = Math.max(maxZ, box.z + box.depth / 2);
  }
  return {
    minX: minX - 8,
    maxX: maxX + 8,
    minZ: minZ - 8,
    maxZ: maxZ + 8,
    killY: level.spawn.y - 20,
  };
}

/** Create a fresh JSON-serializable 3D world containing one player. */
export function createWorld3D(
  level: LevelDefinition3D,
  playerId = "player",
): WorldState3D {
  if (!level.id) throw new Error("level.id must not be empty");
  if (!playerId) throw new Error("playerId must not be empty");
  assertVec3(level.spawn, "level.spawn");
  assertUniqueIds3D(level);
  level.platforms.forEach((box) => assertBox3D(box, `Platform ${box.id}`));
  (level.blockers ?? []).forEach((box) =>
    assertBox3D(box, `Blocker ${box.id}`),
  );
  (level.hazards ?? []).forEach((box) =>
    assertBox3D(box, `Hazard ${box.id}`),
  );
  (level.collectibles ?? []).forEach((box) =>
    assertBox3D(box, `Collectible ${box.id}`),
  );
  (level.enemies ?? []).forEach((box) =>
    assertBox3D(box, `Enemy ${box.id}`),
  );
  (level.checkpoints ?? []).forEach((box) =>
    assertBox3D(box, `Checkpoint ${box.id}`),
  );
  if (level.goal) assertBox3D(level.goal, "Goal");

  const derivedBounds = deriveBounds3D(level);
  const bounds: LevelBounds3D = {
    minX: finiteOr(level.bounds?.minX, derivedBounds.minX),
    maxX: finiteOr(level.bounds?.maxX, derivedBounds.maxX),
    minZ: finiteOr(level.bounds?.minZ, derivedBounds.minZ),
    maxZ: finiteOr(level.bounds?.maxZ, derivedBounds.maxZ),
    killY: finiteOr(level.bounds?.killY, derivedBounds.killY),
  };
  if (bounds.minX >= bounds.maxX || bounds.minZ >= bounds.maxZ) {
    throw new Error("level bounds min values must be less than max values");
  }

  const initialLives = Math.max(1, Math.floor(finiteOr(level.lives, 3)));
  const platforms: Platform3D[] = level.platforms.map((platform) => {
    const motion = platform.motion
      ? {
          x: finiteOr(platform.motion.x, 0),
          y: finiteOr(platform.motion.y, 0),
          z: finiteOr(platform.motion.z, 0),
          period: platform.motion.period,
          phase: finiteOr(platform.motion.phase, 0),
        }
      : null;
    if (motion && (!Number.isFinite(motion.period) || motion.period <= 0)) {
      throw new Error(`Platform ${platform.id} motion.period must be positive`);
    }
    return {
      id: platform.id,
      x: platform.x,
      y: platform.y,
      z: platform.z,
      width: platform.width,
      height: platform.height,
      depth: platform.depth,
      oneWay: platform.oneWay === true,
      motion,
      originX: platform.x,
      originY: platform.y,
      originZ: platform.z,
      previousX: platform.x,
      previousY: platform.y,
      previousZ: platform.z,
    };
  });
  const blockers: Blocker3D[] = (level.blockers ?? []).map((blocker) => ({
    ...blocker,
    previousX: blocker.x,
    previousY: blocker.y,
    previousZ: blocker.z,
    oneWay: false,
  }));
  const hazards: Hazard3D[] = (level.hazards ?? []).map((hazard) => ({
    ...hazard,
    active: hazard.active !== false,
  }));
  const collectibles: Collectible3D[] = (level.collectibles ?? []).map(
    (collectible) => ({
      ...collectible,
      value: finiteOr(collectible.value, 100),
      collected: false,
      collectedBy: null,
    }),
  );
  const enemies: Enemy3D[] = (level.enemies ?? []).map((enemy) => {
    const speed = Math.max(0, finiteOr(enemy.speed, 0));
    const axis: PatrolAxis3D = enemy.patrolAxis === "z" ? "z" : "x";
    const coordinate = axis === "x" ? enemy.x : enemy.z;
    const range = speed > 0 ? 3 : 0;
    const patrolMin = finiteOr(enemy.patrolMin, coordinate - range);
    const patrolMax = finiteOr(enemy.patrolMax, coordinate + range);
    if (patrolMin > patrolMax) {
      throw new Error(`Enemy ${enemy.id} patrolMin must not exceed patrolMax`);
    }
    return {
      ...enemy,
      speed,
      direction: enemy.direction === -1 ? -1 : 1,
      patrolAxis: axis,
      patrolMin,
      patrolMax,
      stompable: enemy.stompable !== false,
      points: finiteOr(enemy.points, 200),
      alive: true,
      startX: enemy.x,
      startY: enemy.y,
      startZ: enemy.z,
      previousX: enemy.x,
      previousY: enemy.y,
      previousZ: enemy.z,
    };
  });
  const checkpoints: Checkpoint3D[] = (level.checkpoints ?? []).map(
    (checkpoint) => ({
      id: checkpoint.id,
      x: checkpoint.x,
      y: checkpoint.y,
      z: checkpoint.z,
      width: checkpoint.width,
      height: checkpoint.height,
      depth: checkpoint.depth,
      respawnX: checkpoint.respawn?.x ?? checkpoint.x,
      respawnY: checkpoint.respawn?.y ?? checkpoint.y,
      respawnZ: checkpoint.respawn?.z ?? checkpoint.z,
    }),
  );
  for (const checkpoint of level.checkpoints ?? []) {
    if (checkpoint.respawn) {
      assertVec3(checkpoint.respawn, `Checkpoint ${checkpoint.id} respawn`);
    }
  }
  const goal: Goal3D | null = level.goal
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
      [playerId]: createPlayer3D(playerId, level.spawn, initialLives),
    },
    platforms,
    blockers,
    hazards,
    collectibles,
    enemies,
    checkpoints,
    goal,
    events: [],
  };
}

function cloneWorld3D(world: WorldState3D): WorldState3D {
  const players: Record<string, PlayerState3D> = {};
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
      motion: platform.motion ? { ...platform.motion } : null,
    })),
    blockers: world.blockers.map((blocker) => ({ ...blocker })),
    hazards: world.hazards.map((hazard) => ({ ...hazard })),
    collectibles: world.collectibles.map((collectible) => ({ ...collectible })),
    enemies: world.enemies.map((enemy) => ({ ...enemy })),
    checkpoints: world.checkpoints.map((checkpoint) => ({ ...checkpoint })),
    goal: world.goal ? { ...world.goal } : null,
    events: [],
  };
}

/** Pure helper for adding another network player at the authored spawn. */
export function addPlayer3D(
  world: WorldState3D,
  playerId: string,
): WorldState3D {
  if (!playerId) throw new Error("playerId must not be empty");
  if (world.players[playerId]) return world;
  const next = cloneWorld3D(world);
  next.players[playerId] = createPlayer3D(
    playerId,
    next.spawn,
    next.initialLives,
  );
  if (next.status === "game-over") next.status = "playing";
  return next;
}

function moveToward(value: number, target: number, delta: number): number {
  if (value < target) return Math.min(value + delta, target);
  if (value > target) return Math.max(value - delta, target);
  return target;
}

function axisOverlap(
  aPosition: number,
  aSize: number,
  bPosition: number,
  bSize: number,
): boolean {
  return Math.abs(aPosition - bPosition) * 2 < aSize + bSize;
}

function overlaps3D(a: Box3D, b: Box3D): boolean {
  return (
    axisOverlap(a.x, a.width, b.x, b.width) &&
    axisOverlap(a.y, a.height, b.y, b.height) &&
    axisOverlap(a.z, a.depth, b.z, b.depth)
  );
}

function horizontalFootprintOverlap(a: Box3D, b: Box3D): boolean {
  return (
    axisOverlap(a.x, a.width, b.x, b.width) &&
    axisOverlap(a.z, a.depth, b.z, b.depth)
  );
}

function collisionBoxes(world: WorldState3D): CollisionBox3D[] {
  return [...world.platforms, ...world.blockers];
}

function updateMovingPlatforms3D(world: WorldState3D): void {
  for (const platform of world.platforms) {
    platform.previousX = platform.x;
    platform.previousY = platform.y;
    platform.previousZ = platform.z;
    if (!platform.motion) continue;
    const rawPhase = world.time / platform.motion.period + platform.motion.phase;
    const phase = ((rawPhase % 1) + 1) % 1;
    const progress = phase < 0.5 ? phase * 2 : (1 - phase) * 2;
    platform.x = platform.originX + platform.motion.x * progress;
    platform.y = platform.originY + platform.motion.y * progress;
    platform.z = platform.originZ + platform.motion.z * progress;
  }
}

function updateEnemies3D(world: WorldState3D, dt: number): void {
  for (const enemy of world.enemies) {
    enemy.previousX = enemy.x;
    enemy.previousY = enemy.y;
    enemy.previousZ = enemy.z;
    if (!enemy.alive || enemy.speed <= 0) continue;
    const coordinate = enemy.patrolAxis === "x" ? "x" : "z";
    enemy[coordinate] += enemy.direction * enemy.speed * dt;
    if (enemy[coordinate] < enemy.patrolMin) {
      enemy[coordinate] = enemy.patrolMin;
      enemy.direction = 1;
    } else if (enemy[coordinate] > enemy.patrolMax) {
      enemy[coordinate] = enemy.patrolMax;
      enemy.direction = -1;
    }
  }
}

function movementDirection(input: NormalizedInputState3D): {
  x: number;
  z: number;
} {
  let x: number;
  let z: number;
  if (input.moveX !== null || input.moveZ !== null) {
    x = input.moveX ?? 0;
    z = input.moveZ ?? 0;
  } else {
    const localRight = Number(input.right) - Number(input.left);
    const localForward = Number(input.forward) - Number(input.backward);
    const sin = Math.sin(input.cameraYaw);
    const cos = Math.cos(input.cameraYaw);
    // Three-style camera convention: yaw 0 looks towards world -Z.
    x = localRight * cos - localForward * sin;
    z = -localRight * sin - localForward * cos;
  }
  const magnitude = Math.hypot(x, z);
  if (magnitude > 1) {
    x /= magnitude;
    z /= magnitude;
  }
  return { x, z };
}

function resolveHorizontalAxis(
  player: PlayerState3D,
  startPosition: number,
  axis: "x" | "z",
  solids: CollisionBox3D[],
): void {
  const sizeKey = axis === "x" ? "width" : "depth";
  const crossAxis = axis === "x" ? "z" : "x";
  const crossSizeKey = axis === "x" ? "depth" : "width";
  const delta = player[axis] - startPosition;
  if (Math.abs(delta) <= Number.EPSILON) return;

  let collision: CollisionBox3D | null = null;
  if (delta > 0) {
    let nearestFace = Number.POSITIVE_INFINITY;
    const oldPositiveFace = startPosition + player[sizeKey] / 2;
    const newPositiveFace = player[axis] + player[sizeKey] / 2;
    for (const solid of solids) {
      if (
        solid.oneWay ||
        !axisOverlap(
          player.y,
          player.height,
          solid.y,
          solid.height,
        ) ||
        !axisOverlap(
          player[crossAxis],
          player[crossSizeKey],
          solid[crossAxis],
          solid[crossSizeKey],
        )
      ) {
        continue;
      }
      const face = solid[axis] - solid[sizeKey] / 2;
      const oldFace = solid[
        axis === "x" ? "previousX" : "previousZ"
      ] - solid[sizeKey] / 2;
      const crossed =
        oldPositiveFace <= oldFace + PHYSICS_3D.collisionEpsilon &&
        newPositiveFace >= face - PHYSICS_3D.collisionEpsilon;
      if ((crossed || overlaps3D(player, solid)) && face < nearestFace) {
        nearestFace = face;
        collision = solid;
      }
    }
    if (collision) {
      player[axis] = collision[axis] - collision[sizeKey] / 2 - player[sizeKey] / 2;
    }
  } else {
    let nearestFace = Number.NEGATIVE_INFINITY;
    const oldNegativeFace = startPosition - player[sizeKey] / 2;
    const newNegativeFace = player[axis] - player[sizeKey] / 2;
    for (const solid of solids) {
      if (
        solid.oneWay ||
        !axisOverlap(
          player.y,
          player.height,
          solid.y,
          solid.height,
        ) ||
        !axisOverlap(
          player[crossAxis],
          player[crossSizeKey],
          solid[crossAxis],
          solid[crossSizeKey],
        )
      ) {
        continue;
      }
      const face = solid[axis] + solid[sizeKey] / 2;
      const oldFace = solid[
        axis === "x" ? "previousX" : "previousZ"
      ] + solid[sizeKey] / 2;
      const crossed =
        oldNegativeFace >= oldFace - PHYSICS_3D.collisionEpsilon &&
        newNegativeFace <= face + PHYSICS_3D.collisionEpsilon;
      if ((crossed || overlaps3D(player, solid)) && face > nearestFace) {
        nearestFace = face;
        collision = solid;
      }
    }
    if (collision) {
      player[axis] = collision[axis] + collision[sizeKey] / 2 + player[sizeKey] / 2;
    }
  }
  if (collision) {
    if (axis === "x") player.vx = 0;
    else player.vz = 0;
  }
}

function resolveVertical3D(
  player: PlayerState3D,
  startY: number,
  solids: CollisionBox3D[],
): boolean {
  const deltaY = player.y - startY;
  if (deltaY <= 0) {
    let highestTop = Number.NEGATIVE_INFINITY;
    let landedOn: CollisionBox3D | null = null;
    const oldBottom = startY - player.height / 2;
    const newBottom = player.y - player.height / 2;
    for (const solid of solids) {
      if (!horizontalFootprintOverlap(player, solid)) continue;
      const oldTop = solid.previousY + solid.height / 2;
      const newTop = solid.y + solid.height / 2;
      const crossed =
        oldBottom >= oldTop - PHYSICS_3D.collisionEpsilon &&
        newBottom <= newTop + PHYSICS_3D.collisionEpsilon;
      if (
        (crossed || (!solid.oneWay && overlaps3D(player, solid))) &&
        newTop > highestTop
      ) {
        highestTop = newTop;
        landedOn = solid;
      }
    }
    if (landedOn) {
      player.y = landedOn.y + landedOn.height / 2 + player.height / 2;
      player.vy = 0;
      player.grounded = true;
      player.groundObjectId = landedOn.id;
      player.jumpCutAvailable = false;
      return true;
    }
  } else {
    let lowestBottom = Number.POSITIVE_INFINITY;
    let hit: CollisionBox3D | null = null;
    const oldTop = startY + player.height / 2;
    const newTop = player.y + player.height / 2;
    for (const solid of solids) {
      if (solid.oneWay || !horizontalFootprintOverlap(player, solid)) continue;
      const oldBottom = solid.previousY - solid.height / 2;
      const newBottom = solid.y - solid.height / 2;
      const crossed =
        oldTop <= oldBottom + PHYSICS_3D.collisionEpsilon &&
        newTop >= newBottom - PHYSICS_3D.collisionEpsilon;
      if ((crossed || overlaps3D(player, solid)) && newBottom < lowestBottom) {
        lowestBottom = newBottom;
        hit = solid;
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

function consumeBufferedJump3D(player: PlayerState3D): boolean {
  if (player.jumpBufferRemaining <= 0 || player.coyoteRemaining <= 0) {
    return false;
  }
  player.vy = PHYSICS_3D.jumpSpeed;
  player.grounded = false;
  player.groundObjectId = null;
  player.coyoteRemaining = 0;
  player.jumpBufferRemaining = 0;
  player.jumpCutAvailable = true;
  return true;
}

function killPlayer3D(
  world: WorldState3D,
  player: PlayerState3D,
  reason: DeathReason3D,
  sourceId?: string,
): void {
  if (player.status !== "active") return;
  player.deaths += 1;
  player.lives = Math.max(0, player.lives - 1);
  player.vx = 0;
  player.vy = 0;
  player.vz = 0;
  player.grounded = false;
  player.groundObjectId = null;
  player.coyoteRemaining = 0;
  player.jumpBufferRemaining = 0;
  player.jumpCutAvailable = false;
  world.events.push({ type: "death", playerId: player.id, reason, sourceId });
  if (player.lives === 0) {
    player.status = "game-over";
    player.respawnRemaining = 0;
    world.events.push({ type: "game-over", playerId: player.id });
  } else {
    player.status = "dead";
    player.respawnRemaining = PHYSICS_3D.respawnDelay;
  }
}

function respawnPlayer3D(world: WorldState3D, player: PlayerState3D): void {
  player.x = player.respawnX;
  player.y = player.respawnY;
  player.z = player.respawnZ;
  player.vx = 0;
  player.vy = 0;
  player.vz = 0;
  player.facingYaw = Math.PI;
  player.grounded = false;
  player.groundObjectId = null;
  player.status = "active";
  player.respawnRemaining = 0;
  player.invulnerabilityRemaining = PHYSICS_3D.respawnInvulnerability;
  player.coyoteRemaining = 0;
  player.jumpBufferRemaining = 0;
  player.jumpCutAvailable = false;
  world.events.push({ type: "respawn", playerId: player.id });
}

function updatePlayer3D(
  world: WorldState3D,
  player: PlayerState3D,
  dt: number,
): void {
  if (player.status === "dead") {
    player.respawnRemaining = Math.max(0, player.respawnRemaining - dt);
    if (player.respawnRemaining === 0) respawnPlayer3D(world, player);
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
    player.coyoteRemaining = PHYSICS_3D.coyoteTime;
    const platform = player.groundObjectId
      ? world.platforms.find((item) => item.id === player.groundObjectId)
      : undefined;
    if (platform) {
      player.x += platform.x - platform.previousX;
      player.y += platform.y - platform.previousY;
      player.z += platform.z - platform.previousZ;
    }
  } else {
    player.coyoteRemaining = Math.max(0, player.coyoteRemaining - dt);
  }

  const direction = movementDirection(player.input);
  const hasMovement = Math.hypot(direction.x, direction.z) > 1e-8;
  if (hasMovement) player.facingYaw = Math.atan2(direction.x, direction.z);
  const maxSpeed = player.input.sprint
    ? PHYSICS_3D.sprintSpeed
    : PHYSICS_3D.walkSpeed;
  const acceleration = player.grounded
    ? hasMovement
      ? PHYSICS_3D.groundAcceleration
      : PHYSICS_3D.groundDeceleration
    : PHYSICS_3D.airAcceleration;
  player.vx = moveToward(
    player.vx,
    direction.x * maxSpeed,
    acceleration * dt,
  );
  player.vz = moveToward(
    player.vz,
    direction.z * maxSpeed,
    acceleration * dt,
  );

  const jumped = consumeBufferedJump3D(player);
  if (
    player.jumpCutAvailable &&
    !player.input.jump &&
    player.vy > PHYSICS_3D.jumpReleaseSpeed
  ) {
    player.vy = PHYSICS_3D.jumpReleaseSpeed;
    player.jumpCutAvailable = false;
  }
  player.vy = Math.max(
    player.vy + PHYSICS_3D.gravity * dt,
    -PHYSICS_3D.maxFallSpeed,
  );
  player.grounded = false;
  player.groundObjectId = null;

  const solids = collisionBoxes(world);
  const startX = player.x;
  player.x += player.vx * dt;
  resolveHorizontalAxis(player, startX, "x", solids);
  const halfWidth = player.width / 2;
  if (player.x - halfWidth < world.bounds.minX) {
    player.x = world.bounds.minX + halfWidth;
    player.vx = Math.max(0, player.vx);
  } else if (player.x + halfWidth > world.bounds.maxX) {
    player.x = world.bounds.maxX - halfWidth;
    player.vx = Math.min(0, player.vx);
  }

  const startZ = player.z;
  player.z += player.vz * dt;
  resolveHorizontalAxis(player, startZ, "z", solids);
  const halfDepth = player.depth / 2;
  if (player.z - halfDepth < world.bounds.minZ) {
    player.z = world.bounds.minZ + halfDepth;
    player.vz = Math.max(0, player.vz);
  } else if (player.z + halfDepth > world.bounds.maxZ) {
    player.z = world.bounds.maxZ - halfDepth;
    player.vz = Math.min(0, player.vz);
  }

  const startY = player.y;
  const previousBottom = startY - player.height / 2;
  player.y += player.vy * dt;
  const landed = resolveVertical3D(player, startY, solids);
  if (landed && !jumped) {
    player.coyoteRemaining = PHYSICS_3D.coyoteTime;
    consumeBufferedJump3D(player);
  }

  if (player.y - player.height / 2 < world.bounds.killY) {
    killPlayer3D(world, player, "fall");
    return;
  }

  if (player.invulnerabilityRemaining === 0) {
    for (const hazard of world.hazards) {
      if (hazard.active && overlaps3D(player, hazard)) {
        killPlayer3D(world, player, "hazard", hazard.id);
        return;
      }
    }
  }

  for (const checkpoint of world.checkpoints) {
    if (player.checkpointId !== checkpoint.id && overlaps3D(player, checkpoint)) {
      player.checkpointId = checkpoint.id;
      player.respawnX = checkpoint.respawnX;
      player.respawnY = checkpoint.respawnY;
      player.respawnZ = checkpoint.respawnZ;
      world.events.push({
        type: "checkpoint",
        playerId: player.id,
        checkpointId: checkpoint.id,
      });
    }
  }

  for (const collectible of world.collectibles) {
    if (!collectible.collected && overlaps3D(player, collectible)) {
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
    if (!enemy.alive || !overlaps3D(player, enemy)) continue;
    const enemyTop = enemy.y + enemy.height / 2;
    const descendingOntoEnemy =
      player.vy <= 0 &&
      previousBottom >=
        enemyTop - Math.max(0.12, Math.abs(player.vy * dt));
    if (enemy.stompable && descendingOntoEnemy) {
      enemy.alive = false;
      player.y = enemyTop + player.height / 2;
      player.vy = PHYSICS_3D.stompBounceSpeed;
      player.grounded = false;
      player.groundObjectId = null;
      player.jumpCutAvailable = false;
      player.score += enemy.points;
      world.events.push({
        type: "enemy-stomp",
        playerId: player.id,
        enemyId: enemy.id,
        value: enemy.points,
      });
    } else if (player.invulnerabilityRemaining === 0) {
      killPlayer3D(world, player, "enemy", enemy.id);
      return;
    }
  }

  if (world.goal && overlaps3D(player, world.goal)) {
    player.status = "won";
    player.vx = 0;
    player.vy = 0;
    player.vz = 0;
    world.status = "won";
    world.events.push({ type: "goal", playerId: player.id, goalId: world.goal.id });
  }
}

function refreshWorldStatus3D(world: WorldState3D): void {
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

function fixedStep3D(world: WorldState3D): void {
  world.tick += 1;
  world.time = world.tick * FIXED_TIMESTEP_3D;
  updateMovingPlatforms3D(world);
  updateEnemies3D(world, FIXED_TIMESTEP_3D);
  for (const player of Object.values(world.players)) {
    updatePlayer3D(world, player, FIXED_TIMESTEP_3D);
  }
  refreshWorldStatus3D(world);
}

const INPUT_KEYS_3D: ReadonlyArray<keyof InputState3D> = [
  "forward",
  "backward",
  "left",
  "right",
  "jump",
  "sprint",
  "cameraYaw",
  "moveX",
  "moveZ",
];

function isSingleInput3D(input: WorldInput3D): input is InputState3D {
  return INPUT_KEYS_3D.some((key) =>
    Object.prototype.hasOwnProperty.call(input, key),
  );
}

/**
 * Advance a world using either one local input or a per-player input map.
 *
 * `dt` is wall-clock seconds (defaulting to one tick). It is clamped to 250 ms
 * and accumulated into exact 1/60 s steps. Jump presses are latched even on a
 * render frame that is shorter than one physics tick.
 */
export function stepWorld3D(
  world: WorldState3D,
  inputs: WorldInput3D = {},
  dt = FIXED_TIMESTEP_3D,
): WorldState3D {
  const next = cloneWorld3D(world);
  const playerIds = Object.keys(next.players);
  const singleInput = isSingleInput3D(inputs);
  for (const [id, player] of Object.entries(next.players)) {
    const source = singleInput
      ? id === playerIds[0]
        ? inputs
        : undefined
      : inputs[id];
    const input = normalizeInput3D(source);
    if (input.jump && !player.input.jump && player.status === "active") {
      player.jumpBufferRemaining = PHYSICS_3D.jumpBufferTime;
    }
    player.input = input;
  }

  if (!Number.isFinite(dt) || dt <= 0) return next;
  next.accumulator += Math.min(dt, MAX_FRAME_TIME_3D);
  while (next.accumulator + Number.EPSILON >= FIXED_TIMESTEP_3D) {
    fixedStep3D(next);
    next.accumulator -= FIXED_TIMESTEP_3D;
  }
  if (next.accumulator < 1e-12) next.accumulator = 0;
  return next;
}
