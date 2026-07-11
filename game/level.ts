/**
 * Data-only level description for a 2.5D game rendered in Three.js.
 *
 * Coordinate convention:
 * - +X moves toward the goal.
 * - +Y points up.
 * - Z is the playable lane width; the intended player plane is Z = 0.
 * - Every `position` is the centre of the corresponding box/collider.
 */

export interface Vec3 {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export interface BoxVolume {
  readonly position: Vec3;
  readonly size: Vec3;
}

export interface LevelMetadata {
  readonly id: string;
  readonly name: string;
  readonly subtitle: string;
  readonly description: string;
  readonly estimatedSeconds: readonly [minimum: number, maximum: number];
  readonly difficulty: 1 | 2 | 3 | 4 | 5;
}

export interface WorldSettings {
  readonly length: number;
  readonly playableWidth: number;
  readonly gravity: number;
  readonly deathY: number;
  readonly playerPlaneZ: number;
  readonly camera: {
    readonly minimumX: number;
    readonly maximumX: number;
    readonly minimumY: number;
    readonly maximumY: number;
    readonly lookAhead: number;
  };
}

export interface LevelTheme {
  readonly skyTop: string;
  readonly skyBottom: string;
  readonly fog: string;
  readonly sunlight: string;
  readonly grass: string;
  readonly stone: string;
  readonly brick: string;
  readonly accent: string;
  readonly hazard: string;
}

export interface PlayerStart {
  readonly position: Vec3;
  readonly facing: "left" | "right";
  readonly safeRadius: number;
}

export type PlatformKind =
  | "ground"
  | "grass_ledge"
  | "ruin_brick"
  | "floating_stone";

export type SurfaceMaterial =
  | "sunlit_grass"
  | "warm_ruin_stone"
  | "cloud_brick"
  | "gold_trim_stone";

export interface StaticPlatform extends BoxVolume {
  readonly id: string;
  readonly kind: PlatformKind;
  readonly material: SurfaceMaterial;
  readonly collision: "solid" | "one_way";
  readonly castsShadow: boolean;
}

export interface PlatformPath {
  readonly from: Vec3;
  readonly to: Vec3;
  readonly travelSeconds: number;
  readonly waitAtEndsSeconds: number;
  readonly easing: "linear" | "smoothstep";
  readonly phase: number;
}

export interface MovingPlatform extends BoxVolume {
  readonly id: string;
  readonly kind: "moving_stone";
  readonly material: SurfaceMaterial;
  readonly collision: "solid";
  readonly path: PlatformPath;
}

export type ObstacleKind = "wind_conduit" | "sun_pillar";

export interface Obstacle extends BoxVolume {
  readonly id: string;
  readonly kind: ObstacleKind;
  readonly visualShape: "stacked_cylinder" | "carved_column";
  /** Broad-phase physics may use this box; renderers can use `visualShape`. */
  readonly colliderShape: "box" | "cylinder";
  readonly material: "aqua_stone" | "sunstone";
  readonly standable: boolean;
}

export type CollectibleKind = "sun_token" | "sky_shard" | "heart_bloom";

export interface Collectible {
  readonly id: string;
  readonly kind: CollectibleKind;
  readonly position: Vec3;
  readonly pickupRadius: number;
  readonly scoreValue: number;
  readonly spinSpeed: number;
}

export type EnemyKind = "moss_walker" | "pebble_hopper" | "breeze_wisp";

export interface EnemyPatrol {
  readonly axis: "x" | "y";
  readonly minimum: number;
  readonly maximum: number;
  readonly speed: number;
  readonly pauseAtTurnSeconds: number;
}

export interface EnemySpawn {
  readonly id: string;
  readonly kind: EnemyKind;
  readonly position: Vec3;
  readonly colliderSize: Vec3;
  readonly patrol: EnemyPatrol;
  readonly contactDamage: number;
  readonly canBeBouncedOn: boolean;
  readonly respawnAfterCheckpointReset: boolean;
}

export type HazardKind = "bottomless_pit" | "crystal_spikes";

export interface Hazard extends BoxVolume {
  readonly id: string;
  readonly kind: HazardKind;
  readonly damage: number;
  readonly instantRespawn: boolean;
}

export interface Checkpoint extends BoxVolume {
  readonly id: string;
  readonly order: 1 | 2 | 3;
  readonly label: string;
  readonly respawnPosition: Vec3;
  readonly facing: "left" | "right";
}

export interface LevelGoal extends BoxVolume {
  readonly id: string;
  readonly name: string;
  readonly visual: "sun_gate";
  readonly requiredSkyShards: number;
}

export interface LevelDefinition {
  readonly metadata: LevelMetadata;
  readonly world: WorldSettings;
  readonly theme: LevelTheme;
  readonly start: PlayerStart;
  readonly platforms: readonly StaticPlatform[];
  readonly movingPlatforms: readonly MovingPlatform[];
  readonly obstacles: readonly Obstacle[];
  readonly collectibles: readonly Collectible[];
  readonly enemies: readonly EnemySpawn[];
  readonly hazards: readonly Hazard[];
  readonly checkpoints: readonly Checkpoint[];
  readonly goal: LevelGoal;
}

/**
 * Level 1 — “青空遗迹”
 *
 * The critical route is 168 units long and is tuned for roughly 2–4 minutes.
 * Its silhouettes and traversal rhythm evoke a bright, classic 3D platform
 * adventure while all names, objects, colours and layouts remain original.
 */
export const LEVEL_ONE = {
  metadata: {
    id: "level-01-sky-ruins",
    name: "青空遗迹",
    subtitle: "穿过浮空石庭，抵达太阳门",
    description:
      "一条穿行于草地、浮空砖台与古老导风柱之间的明亮立体闯关路线。",
    estimatedSeconds: [120, 240],
    difficulty: 2,
  },
  world: {
    length: 168,
    playableWidth: 8,
    gravity: -24,
    deathY: -8,
    playerPlaneZ: 0,
    camera: {
      minimumX: 0,
      maximumX: 168,
      minimumY: -2,
      maximumY: 13,
      lookAhead: 4.5,
    },
  },
  theme: {
    skyTop: "#58BDEB",
    skyBottom: "#DDF7FF",
    fog: "#C9EFFF",
    sunlight: "#FFF2B0",
    grass: "#56C85F",
    stone: "#D9C48F",
    brick: "#D88755",
    accent: "#FFD35A",
    hazard: "#F45B5B",
  },
  start: {
    position: { x: 3, y: 1.15, z: 0 },
    facing: "right",
    safeRadius: 3,
  },
  platforms: [
    {
      id: "ground-start",
      kind: "ground",
      material: "sunlit_grass",
      position: { x: 10.5, y: -1, z: 0 },
      size: { x: 21, y: 2, z: 8 },
      collision: "solid",
      castsShadow: true,
    },
    {
      id: "ground-meadow",
      kind: "ground",
      material: "sunlit_grass",
      position: { x: 36.5, y: -1, z: 0 },
      size: { x: 19, y: 2, z: 8 },
      collision: "solid",
      castsShadow: true,
    },
    {
      id: "ground-temple",
      kind: "ground",
      material: "sunlit_grass",
      position: { x: 64, y: -1, z: 0 },
      size: { x: 22, y: 2, z: 8 },
      collision: "solid",
      castsShadow: true,
    },
    {
      id: "ground-wind-court",
      kind: "ground",
      material: "sunlit_grass",
      position: { x: 99, y: -1, z: 0 },
      size: { x: 26, y: 2, z: 8 },
      collision: "solid",
      castsShadow: true,
    },
    {
      id: "ground-high-ruins",
      kind: "ground",
      material: "sunlit_grass",
      position: { x: 130, y: -1, z: 0 },
      size: { x: 22, y: 2, z: 8 },
      collision: "solid",
      castsShadow: true,
    },
    {
      id: "ground-goal",
      kind: "ground",
      material: "sunlit_grass",
      position: { x: 158.5, y: -1, z: 0 },
      size: { x: 19, y: 2, z: 8 },
      collision: "solid",
      castsShadow: true,
    },
    {
      id: "ledge-01",
      kind: "grass_ledge",
      material: "sunlit_grass",
      position: { x: 7.5, y: 2.25, z: 0 },
      size: { x: 5, y: 0.8, z: 4.5 },
      collision: "one_way",
      castsShadow: true,
    },
    {
      id: "brick-01",
      kind: "ruin_brick",
      material: "cloud_brick",
      position: { x: 13, y: 4.5, z: 0 },
      size: { x: 3.5, y: 0.85, z: 4 },
      collision: "solid",
      castsShadow: true,
    },
    {
      id: "brick-02",
      kind: "ruin_brick",
      material: "cloud_brick",
      position: { x: 18, y: 6.2, z: 0 },
      size: { x: 4, y: 0.85, z: 4 },
      collision: "solid",
      castsShadow: true,
    },
    {
      id: "ledge-02",
      kind: "grass_ledge",
      material: "sunlit_grass",
      position: { x: 29.5, y: 2.2, z: 0 },
      size: { x: 4, y: 0.8, z: 4.5 },
      collision: "one_way",
      castsShadow: true,
    },
    {
      id: "brick-03",
      kind: "ruin_brick",
      material: "cloud_brick",
      position: { x: 35, y: 3.8, z: 0 },
      size: { x: 5, y: 0.85, z: 4 },
      collision: "solid",
      castsShadow: true,
    },
    {
      id: "float-01",
      kind: "floating_stone",
      material: "gold_trim_stone",
      position: { x: 43, y: 2.8, z: 0 },
      size: { x: 3.5, y: 0.75, z: 4 },
      collision: "one_way",
      castsShadow: true,
    },
    {
      id: "ledge-03",
      kind: "grass_ledge",
      material: "sunlit_grass",
      position: { x: 56, y: 2.3, z: 0 },
      size: { x: 4, y: 0.8, z: 4.5 },
      collision: "one_way",
      castsShadow: true,
    },
    {
      id: "brick-04",
      kind: "ruin_brick",
      material: "cloud_brick",
      position: { x: 62.5, y: 4.1, z: 0 },
      size: { x: 4, y: 0.85, z: 4 },
      collision: "solid",
      castsShadow: true,
    },
    {
      id: "ledge-04",
      kind: "grass_ledge",
      material: "sunlit_grass",
      position: { x: 70, y: 2.6, z: 0 },
      size: { x: 5, y: 0.8, z: 4.5 },
      collision: "one_way",
      castsShadow: true,
    },
    {
      id: "float-02",
      kind: "floating_stone",
      material: "gold_trim_stone",
      position: { x: 88, y: 2.1, z: 0 },
      size: { x: 4, y: 0.75, z: 4 },
      collision: "one_way",
      castsShadow: true,
    },
    {
      id: "brick-05",
      kind: "ruin_brick",
      material: "cloud_brick",
      position: { x: 94, y: 3.8, z: 0 },
      size: { x: 5, y: 0.85, z: 4 },
      collision: "solid",
      castsShadow: true,
    },
    {
      id: "brick-06",
      kind: "ruin_brick",
      material: "cloud_brick",
      position: { x: 101, y: 5.3, z: 0 },
      size: { x: 4, y: 0.85, z: 4 },
      collision: "solid",
      castsShadow: true,
    },
    {
      id: "ledge-05",
      kind: "grass_ledge",
      material: "sunlit_grass",
      position: { x: 108.5, y: 2.5, z: 0 },
      size: { x: 4, y: 0.8, z: 4.5 },
      collision: "one_way",
      castsShadow: true,
    },
    {
      id: "float-gap-03",
      kind: "floating_stone",
      material: "gold_trim_stone",
      position: { x: 115.5, y: 1.8, z: 0 },
      size: { x: 3.4, y: 0.75, z: 4 },
      collision: "one_way",
      castsShadow: true,
    },
    {
      id: "ledge-06",
      kind: "grass_ledge",
      material: "sunlit_grass",
      position: { x: 122, y: 2.4, z: 0 },
      size: { x: 4, y: 0.8, z: 4.5 },
      collision: "one_way",
      castsShadow: true,
    },
    {
      id: "brick-07",
      kind: "ruin_brick",
      material: "cloud_brick",
      position: { x: 128, y: 4.3, z: 0 },
      size: { x: 5, y: 0.85, z: 4 },
      collision: "solid",
      castsShadow: true,
    },
    {
      id: "float-03",
      kind: "floating_stone",
      material: "gold_trim_stone",
      position: { x: 136.5, y: 2.5, z: 0 },
      size: { x: 3.5, y: 0.75, z: 4 },
      collision: "one_way",
      castsShadow: true,
    },
    {
      id: "ledge-07",
      kind: "grass_ledge",
      material: "sunlit_grass",
      position: { x: 151.5, y: 2.4, z: 0 },
      size: { x: 4, y: 0.8, z: 4.5 },
      collision: "one_way",
      castsShadow: true,
    },
    {
      id: "brick-08",
      kind: "ruin_brick",
      material: "cloud_brick",
      position: { x: 157, y: 4, z: 0 },
      size: { x: 5, y: 0.85, z: 4 },
      collision: "solid",
      castsShadow: true,
    },
  ],
  movingPlatforms: [
    {
      id: "moving-gap-01",
      kind: "moving_stone",
      material: "gold_trim_stone",
      position: { x: 24, y: 1.2, z: 0 },
      size: { x: 3.6, y: 0.7, z: 4 },
      collision: "solid",
      path: {
        from: { x: 22.8, y: 1.2, z: 0 },
        to: { x: 25.2, y: 2.8, z: 0 },
        travelSeconds: 2.8,
        waitAtEndsSeconds: 0.35,
        easing: "smoothstep",
        phase: 0,
      },
    },
    {
      id: "moving-gap-02",
      kind: "moving_stone",
      material: "warm_ruin_stone",
      position: { x: 49.5, y: 1.4, z: 0 },
      size: { x: 3.4, y: 0.7, z: 4 },
      collision: "solid",
      path: {
        from: { x: 49.5, y: 1.2, z: 0 },
        to: { x: 49.5, y: 4.1, z: 0 },
        travelSeconds: 2.6,
        waitAtEndsSeconds: 0.45,
        easing: "smoothstep",
        phase: 0.35,
      },
    },
    {
      id: "moving-wide-gap-a",
      kind: "moving_stone",
      material: "gold_trim_stone",
      position: { x: 79, y: 1.25, z: 0 },
      size: { x: 3.5, y: 0.7, z: 4 },
      collision: "solid",
      path: {
        from: { x: 77.2, y: 1.25, z: 0 },
        to: { x: 81.2, y: 1.25, z: 0 },
        travelSeconds: 3.2,
        waitAtEndsSeconds: 0.25,
        easing: "smoothstep",
        phase: 0.15,
      },
    },
    {
      id: "moving-wide-gap-b",
      kind: "moving_stone",
      material: "warm_ruin_stone",
      position: { x: 84, y: 2.5, z: 0 },
      size: { x: 3.2, y: 0.7, z: 4 },
      collision: "solid",
      path: {
        from: { x: 84, y: 0.9, z: 0 },
        to: { x: 84, y: 4.2, z: 0 },
        travelSeconds: 2.9,
        waitAtEndsSeconds: 0.35,
        easing: "smoothstep",
        phase: 0.6,
      },
    },
    {
      id: "moving-final-gap",
      kind: "moving_stone",
      material: "gold_trim_stone",
      position: { x: 145, y: 1.5, z: 0 },
      size: { x: 4, y: 0.7, z: 4 },
      collision: "solid",
      path: {
        from: { x: 143.2, y: 1.5, z: 0 },
        to: { x: 146.8, y: 2.8, z: 0 },
        travelSeconds: 3,
        waitAtEndsSeconds: 0.3,
        easing: "smoothstep",
        phase: 0.25,
      },
    },
  ],
  obstacles: [
    {
      id: "conduit-01",
      kind: "wind_conduit",
      visualShape: "stacked_cylinder",
      colliderShape: "cylinder",
      material: "aqua_stone",
      position: { x: 18.5, y: 1.5, z: 0 },
      size: { x: 2.6, y: 3, z: 2.6 },
      standable: true,
    },
    {
      id: "conduit-02",
      kind: "wind_conduit",
      visualShape: "stacked_cylinder",
      colliderShape: "cylinder",
      material: "aqua_stone",
      position: { x: 59, y: 2, z: 0 },
      size: { x: 3, y: 4, z: 3 },
      standable: true,
    },
    {
      id: "pillar-01",
      kind: "sun_pillar",
      visualShape: "carved_column",
      colliderShape: "box",
      material: "sunstone",
      position: { x: 104.5, y: 1.5, z: 0 },
      size: { x: 2.4, y: 3, z: 3 },
      standable: true,
    },
    {
      id: "conduit-03",
      kind: "wind_conduit",
      visualShape: "stacked_cylinder",
      colliderShape: "cylinder",
      material: "aqua_stone",
      position: { x: 127, y: 1.8, z: 0 },
      size: { x: 2.8, y: 3.6, z: 2.8 },
      standable: true,
    },
  ],
  collectibles: [
    { id: "token-01", kind: "sun_token", position: { x: 4, y: 1.5, z: 0 }, pickupRadius: 0.75, scoreValue: 10, spinSpeed: 2.4 },
    { id: "token-02", kind: "sun_token", position: { x: 6, y: 2.3, z: 0 }, pickupRadius: 0.75, scoreValue: 10, spinSpeed: 2.4 },
    { id: "token-03", kind: "sun_token", position: { x: 8, y: 3.6, z: 0 }, pickupRadius: 0.75, scoreValue: 10, spinSpeed: 2.4 },
    { id: "token-04", kind: "sun_token", position: { x: 10, y: 4.2, z: 0 }, pickupRadius: 0.75, scoreValue: 10, spinSpeed: 2.4 },
    { id: "token-05", kind: "sun_token", position: { x: 12.5, y: 5.8, z: 0 }, pickupRadius: 0.75, scoreValue: 10, spinSpeed: 2.4 },
    { id: "token-06", kind: "sun_token", position: { x: 15, y: 5.8, z: 0 }, pickupRadius: 0.75, scoreValue: 10, spinSpeed: 2.4 },
    { id: "token-07", kind: "sun_token", position: { x: 18, y: 7.5, z: 0 }, pickupRadius: 0.75, scoreValue: 10, spinSpeed: 2.4 },
    { id: "token-08", kind: "sun_token", position: { x: 22.5, y: 3, z: 0 }, pickupRadius: 0.75, scoreValue: 10, spinSpeed: 2.4 },
    { id: "token-09", kind: "sun_token", position: { x: 25, y: 3.5, z: 0 }, pickupRadius: 0.75, scoreValue: 10, spinSpeed: 2.4 },
    { id: "token-10", kind: "sun_token", position: { x: 28, y: 1.5, z: 0 }, pickupRadius: 0.75, scoreValue: 10, spinSpeed: 2.4 },
    { id: "token-11", kind: "sun_token", position: { x: 30, y: 3.4, z: 0 }, pickupRadius: 0.75, scoreValue: 10, spinSpeed: 2.4 },
    { id: "token-12", kind: "sun_token", position: { x: 33, y: 5, z: 0 }, pickupRadius: 0.75, scoreValue: 10, spinSpeed: 2.4 },
    { id: "token-13", kind: "sun_token", position: { x: 35, y: 5, z: 0 }, pickupRadius: 0.75, scoreValue: 10, spinSpeed: 2.4 },
    { id: "token-14", kind: "sun_token", position: { x: 37, y: 5, z: 0 }, pickupRadius: 0.75, scoreValue: 10, spinSpeed: 2.4 },
    { id: "token-15", kind: "sun_token", position: { x: 40, y: 1.5, z: 0 }, pickupRadius: 0.75, scoreValue: 10, spinSpeed: 2.4 },
    { id: "token-16", kind: "sun_token", position: { x: 43, y: 4.1, z: 0 }, pickupRadius: 0.75, scoreValue: 10, spinSpeed: 2.4 },
    { id: "token-17", kind: "sun_token", position: { x: 45, y: 2, z: 0 }, pickupRadius: 0.75, scoreValue: 10, spinSpeed: 2.4 },
    { id: "token-18", kind: "sun_token", position: { x: 48, y: 3.5, z: 0 }, pickupRadius: 0.75, scoreValue: 10, spinSpeed: 2.4 },
    { id: "token-19", kind: "sun_token", position: { x: 50, y: 5.2, z: 0 }, pickupRadius: 0.75, scoreValue: 10, spinSpeed: 2.4 },
    { id: "token-20", kind: "sun_token", position: { x: 52, y: 3.5, z: 0 }, pickupRadius: 0.75, scoreValue: 10, spinSpeed: 2.4 },
    { id: "token-21", kind: "sun_token", position: { x: 55, y: 1.5, z: 0 }, pickupRadius: 0.75, scoreValue: 10, spinSpeed: 2.4 },
    { id: "token-22", kind: "sun_token", position: { x: 57, y: 3.6, z: 0 }, pickupRadius: 0.75, scoreValue: 10, spinSpeed: 2.4 },
    { id: "token-23", kind: "sun_token", position: { x: 60, y: 4.8, z: 0 }, pickupRadius: 0.75, scoreValue: 10, spinSpeed: 2.4 },
    { id: "token-24", kind: "sun_token", position: { x: 62.5, y: 5.4, z: 0 }, pickupRadius: 0.75, scoreValue: 10, spinSpeed: 2.4 },
    { id: "token-25", kind: "sun_token", position: { x: 65, y: 3.2, z: 0 }, pickupRadius: 0.75, scoreValue: 10, spinSpeed: 2.4 },
    { id: "token-26", kind: "sun_token", position: { x: 67, y: 2, z: 0 }, pickupRadius: 0.75, scoreValue: 10, spinSpeed: 2.4 },
    { id: "token-27", kind: "sun_token", position: { x: 70, y: 4, z: 0 }, pickupRadius: 0.75, scoreValue: 10, spinSpeed: 2.4 },
    { id: "token-28", kind: "sun_token", position: { x: 73.5, y: 2, z: 0 }, pickupRadius: 0.75, scoreValue: 10, spinSpeed: 2.4 },
    { id: "token-29", kind: "sun_token", position: { x: 77.5, y: 3, z: 0 }, pickupRadius: 0.75, scoreValue: 10, spinSpeed: 2.4 },
    { id: "token-30", kind: "sun_token", position: { x: 80.5, y: 3.8, z: 0 }, pickupRadius: 0.75, scoreValue: 10, spinSpeed: 2.4 },
    { id: "token-31", kind: "sun_token", position: { x: 84, y: 5.4, z: 0 }, pickupRadius: 0.75, scoreValue: 10, spinSpeed: 2.4 },
    { id: "token-32", kind: "sun_token", position: { x: 87, y: 1.5, z: 0 }, pickupRadius: 0.75, scoreValue: 10, spinSpeed: 2.4 },
    { id: "token-33", kind: "sun_token", position: { x: 90, y: 3.2, z: 0 }, pickupRadius: 0.75, scoreValue: 10, spinSpeed: 2.4 },
    { id: "token-34", kind: "sun_token", position: { x: 94, y: 5.1, z: 0 }, pickupRadius: 0.75, scoreValue: 10, spinSpeed: 2.4 },
    { id: "token-35", kind: "sun_token", position: { x: 98, y: 1.5, z: 0 }, pickupRadius: 0.75, scoreValue: 10, spinSpeed: 2.4 },
    { id: "token-36", kind: "sun_token", position: { x: 101, y: 6.7, z: 0 }, pickupRadius: 0.75, scoreValue: 10, spinSpeed: 2.4 },
    { id: "token-37", kind: "sun_token", position: { x: 105, y: 4, z: 0 }, pickupRadius: 0.75, scoreValue: 10, spinSpeed: 2.4 },
    { id: "token-38", kind: "sun_token", position: { x: 109, y: 3.8, z: 0 }, pickupRadius: 0.75, scoreValue: 10, spinSpeed: 2.4 },
    { id: "token-39", kind: "sun_token", position: { x: 111, y: 1.5, z: 0 }, pickupRadius: 0.75, scoreValue: 10, spinSpeed: 2.4 },
    { id: "token-40", kind: "sun_token", position: { x: 115.5, y: 3.3, z: 0 }, pickupRadius: 0.75, scoreValue: 10, spinSpeed: 2.4 },
    { id: "token-41", kind: "sun_token", position: { x: 120, y: 1.5, z: 0 }, pickupRadius: 0.75, scoreValue: 10, spinSpeed: 2.4 },
    { id: "token-42", kind: "sun_token", position: { x: 122, y: 3.7, z: 0 }, pickupRadius: 0.75, scoreValue: 10, spinSpeed: 2.4 },
    { id: "token-43", kind: "sun_token", position: { x: 126, y: 5.8, z: 0 }, pickupRadius: 0.75, scoreValue: 10, spinSpeed: 2.4 },
    { id: "token-44", kind: "sun_token", position: { x: 129, y: 5.8, z: 0 }, pickupRadius: 0.75, scoreValue: 10, spinSpeed: 2.4 },
    { id: "token-45", kind: "sun_token", position: { x: 134, y: 1.8, z: 0 }, pickupRadius: 0.75, scoreValue: 10, spinSpeed: 2.4 },
    { id: "token-46", kind: "sun_token", position: { x: 137, y: 3.8, z: 0 }, pickupRadius: 0.75, scoreValue: 10, spinSpeed: 2.4 },
    { id: "token-47", kind: "sun_token", position: { x: 143, y: 3, z: 0 }, pickupRadius: 0.75, scoreValue: 10, spinSpeed: 2.4 },
    { id: "token-48", kind: "sun_token", position: { x: 146, y: 3.6, z: 0 }, pickupRadius: 0.75, scoreValue: 10, spinSpeed: 2.4 },
    { id: "token-49", kind: "sun_token", position: { x: 150, y: 1.5, z: 0 }, pickupRadius: 0.75, scoreValue: 10, spinSpeed: 2.4 },
    { id: "token-50", kind: "sun_token", position: { x: 153, y: 3.8, z: 0 }, pickupRadius: 0.75, scoreValue: 10, spinSpeed: 2.4 },
    { id: "token-51", kind: "sun_token", position: { x: 157, y: 5.3, z: 0 }, pickupRadius: 0.75, scoreValue: 10, spinSpeed: 2.4 },
    { id: "token-52", kind: "sun_token", position: { x: 161, y: 2, z: 0 }, pickupRadius: 0.75, scoreValue: 10, spinSpeed: 2.4 },
    { id: "shard-01", kind: "sky_shard", position: { x: 18, y: 8.2, z: 0 }, pickupRadius: 0.9, scoreValue: 100, spinSpeed: 1.4 },
    { id: "shard-02", kind: "sky_shard", position: { x: 84, y: 6.6, z: 0 }, pickupRadius: 0.9, scoreValue: 100, spinSpeed: 1.4 },
    { id: "shard-03", kind: "sky_shard", position: { x: 129, y: 7.2, z: 0 }, pickupRadius: 0.9, scoreValue: 100, spinSpeed: 1.4 },
    { id: "heart-01", kind: "heart_bloom", position: { x: 54, y: 1.6, z: 0 }, pickupRadius: 0.85, scoreValue: 25, spinSpeed: 1.8 },
    { id: "heart-02", kind: "heart_bloom", position: { x: 120, y: 1.6, z: 0 }, pickupRadius: 0.85, scoreValue: 25, spinSpeed: 1.8 },
  ],
  enemies: [
    {
      id: "enemy-01",
      kind: "moss_walker",
      position: { x: 12, y: 0.65, z: 0 },
      colliderSize: { x: 1.35, y: 1.3, z: 1.35 },
      patrol: { axis: "x", minimum: 4.5, maximum: 16, speed: 1.8, pauseAtTurnSeconds: 0.15 },
      contactDamage: 1,
      canBeBouncedOn: true,
      respawnAfterCheckpointReset: true,
    },
    {
      id: "enemy-02",
      kind: "pebble_hopper",
      position: { x: 30.5, y: 0.7, z: 0 },
      colliderSize: { x: 1.35, y: 1.4, z: 1.35 },
      patrol: { axis: "x", minimum: 28.5, maximum: 31.5, speed: 1.55, pauseAtTurnSeconds: 0.35 },
      contactDamage: 1,
      canBeBouncedOn: true,
      respawnAfterCheckpointReset: true,
    },
    {
      id: "enemy-03",
      kind: "moss_walker",
      position: { x: 39, y: 0.65, z: 0 },
      colliderSize: { x: 1.35, y: 1.3, z: 1.35 },
      patrol: { axis: "x", minimum: 36.5, maximum: 40.5, speed: 2, pauseAtTurnSeconds: 0.15 },
      contactDamage: 1,
      canBeBouncedOn: true,
      respawnAfterCheckpointReset: true,
    },
    {
      id: "enemy-04",
      kind: "breeze_wisp",
      position: { x: 64, y: 3.4, z: 0 },
      colliderSize: { x: 1.4, y: 1.4, z: 1.4 },
      patrol: { axis: "x", minimum: 61, maximum: 67, speed: 1.65, pauseAtTurnSeconds: 0.1 },
      contactDamage: 1,
      canBeBouncedOn: false,
      respawnAfterCheckpointReset: true,
    },
    {
      id: "enemy-05",
      kind: "pebble_hopper",
      position: { x: 72, y: 0.7, z: 0 },
      colliderSize: { x: 1.35, y: 1.4, z: 1.35 },
      patrol: { axis: "x", minimum: 70.5, maximum: 73.5, speed: 1.6, pauseAtTurnSeconds: 0.35 },
      contactDamage: 1,
      canBeBouncedOn: true,
      respawnAfterCheckpointReset: true,
    },
    {
      id: "enemy-06",
      kind: "moss_walker",
      position: { x: 91, y: 0.65, z: 0 },
      colliderSize: { x: 1.35, y: 1.3, z: 1.35 },
      patrol: { axis: "x", minimum: 87.5, maximum: 93.5, speed: 2.1, pauseAtTurnSeconds: 0.15 },
      contactDamage: 1,
      canBeBouncedOn: true,
      respawnAfterCheckpointReset: true,
    },
    {
      id: "enemy-07",
      kind: "pebble_hopper",
      position: { x: 108, y: 0.7, z: 0 },
      colliderSize: { x: 1.35, y: 1.4, z: 1.35 },
      patrol: { axis: "x", minimum: 106, maximum: 110.5, speed: 1.7, pauseAtTurnSeconds: 0.3 },
      contactDamage: 1,
      canBeBouncedOn: true,
      respawnAfterCheckpointReset: true,
    },
    {
      id: "enemy-08",
      kind: "moss_walker",
      position: { x: 123, y: 0.65, z: 0 },
      colliderSize: { x: 1.35, y: 1.3, z: 1.35 },
      patrol: { axis: "x", minimum: 120, maximum: 125, speed: 2.15, pauseAtTurnSeconds: 0.12 },
      contactDamage: 1,
      canBeBouncedOn: true,
      respawnAfterCheckpointReset: true,
    },
    {
      id: "enemy-09",
      kind: "breeze_wisp",
      position: { x: 134, y: 4, z: 0 },
      colliderSize: { x: 1.4, y: 1.4, z: 1.4 },
      patrol: { axis: "x", minimum: 131, maximum: 136, speed: 1.85, pauseAtTurnSeconds: 0.1 },
      contactDamage: 1,
      canBeBouncedOn: false,
      respawnAfterCheckpointReset: true,
    },
    {
      id: "enemy-10",
      kind: "moss_walker",
      position: { x: 155, y: 0.65, z: 0 },
      colliderSize: { x: 1.35, y: 1.3, z: 1.35 },
      patrol: { axis: "x", minimum: 150.5, maximum: 160.5, speed: 2.25, pauseAtTurnSeconds: 0.12 },
      contactDamage: 1,
      canBeBouncedOn: true,
      respawnAfterCheckpointReset: true,
    },
  ],
  hazards: [
    {
      id: "pit-01",
      kind: "bottomless_pit",
      position: { x: 24, y: -5, z: 0 },
      size: { x: 6, y: 6, z: 8 },
      damage: 999,
      instantRespawn: true,
    },
    {
      id: "pit-02",
      kind: "bottomless_pit",
      position: { x: 49.5, y: -5, z: 0 },
      size: { x: 7, y: 6, z: 8 },
      damage: 999,
      instantRespawn: true,
    },
    {
      id: "pit-03",
      kind: "bottomless_pit",
      position: { x: 80.5, y: -5, z: 0 },
      size: { x: 11, y: 6, z: 8 },
      damage: 999,
      instantRespawn: true,
    },
    {
      id: "pit-04",
      kind: "bottomless_pit",
      position: { x: 115.5, y: -5, z: 0 },
      size: { x: 7, y: 6, z: 8 },
      damage: 999,
      instantRespawn: true,
    },
    {
      id: "pit-05",
      kind: "bottomless_pit",
      position: { x: 145, y: -5, z: 0 },
      size: { x: 8, y: 6, z: 8 },
      damage: 999,
      instantRespawn: true,
    },
    {
      id: "spikes-01",
      kind: "crystal_spikes",
      position: { x: 33.5, y: 0.45, z: 0 },
      size: { x: 2.5, y: 0.9, z: 5 },
      damage: 1,
      instantRespawn: false,
    },
    {
      id: "spikes-02",
      kind: "crystal_spikes",
      position: { x: 68, y: 0.45, z: 0 },
      size: { x: 2.8, y: 0.9, z: 5 },
      damage: 1,
      instantRespawn: false,
    },
    {
      id: "spikes-03",
      kind: "crystal_spikes",
      position: { x: 102.5, y: 0.45, z: 0 },
      size: { x: 2.4, y: 0.9, z: 5 },
      damage: 1,
      instantRespawn: false,
    },
    {
      id: "spikes-04",
      kind: "crystal_spikes",
      position: { x: 132.5, y: 0.45, z: 0 },
      size: { x: 3, y: 0.9, z: 5 },
      damage: 1,
      instantRespawn: false,
    },
  ],
  checkpoints: [
    {
      id: "checkpoint-01",
      order: 1,
      label: "草风平台",
      position: { x: 42, y: 2.5, z: 0 },
      size: { x: 1.5, y: 5, z: 7 },
      respawnPosition: { x: 42.5, y: 1.15, z: 0 },
      facing: "right",
    },
    {
      id: "checkpoint-02",
      order: 2,
      label: "导风庭院",
      position: { x: 96.5, y: 2.5, z: 0 },
      size: { x: 1.5, y: 5, z: 7 },
      respawnPosition: { x: 97, y: 1.15, z: 0 },
      facing: "right",
    },
    {
      id: "checkpoint-03",
      order: 3,
      label: "太阳高台",
      position: { x: 137.5, y: 2.5, z: 0 },
      size: { x: 1.5, y: 5, z: 7 },
      respawnPosition: { x: 138, y: 1.15, z: 0 },
      facing: "right",
    },
  ],
  goal: {
    id: "goal-sun-gate",
    name: "太阳门",
    visual: "sun_gate",
    position: { x: 164, y: 3, z: 0 },
    size: { x: 2.5, y: 6, z: 6 },
    requiredSkyShards: 0,
  },
} as const satisfies LevelDefinition;
