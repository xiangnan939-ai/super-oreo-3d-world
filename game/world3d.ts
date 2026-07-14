/**
 * Authored data for the first true-3D Super Oreo adventure world.
 *
 * Coordinate convention:
 * - +Y is up; X and Z are equally playable horizontal axes.
 * - Every collision volume uses a centre position.
 * - Every platform `size` contains its complete X/Y/Z dimensions.
 * - Rotations are Euler angles in radians.
 *
 * The level is deliberately folded across the X/Z plane. The critical route
 * travels east, north, east, north, west, north and east again, so it cannot
 * be played like a side-scrolling lane.
 */

export interface Vec3 {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export interface Euler3 {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export interface BoxVolume {
  /** Centre of the volume, never a corner or a bottom-left coordinate. */
  readonly position: Vec3;
  /** Full dimensions along the local X/Y/Z axes. */
  readonly size: Vec3;
}

export interface World3DMetadata {
  readonly id: string;
  readonly name: string;
  readonly subtitle: string;
  readonly description: string;
  readonly estimatedSeconds: readonly [minimum: number, maximum: number];
  readonly difficulty: 1 | 2 | 3 | 4 | 5;
  readonly timeLimitSeconds: number;
}

export interface World3DBounds {
  readonly minimumX: number;
  readonly maximumX: number;
  readonly minimumZ: number;
  readonly maximumZ: number;
  readonly deathY: number;
}

export interface World3DTheme {
  readonly sky: {
    readonly zenith: string;
    readonly horizon: string;
    readonly fog: string;
    readonly cloud: string;
  };
  readonly light: {
    readonly sun: string;
    readonly ambient: string;
    readonly sunDirection: Vec3;
    readonly sunIntensity: number;
    readonly ambientIntensity: number;
  };
  readonly palette: {
    readonly grass: string;
    readonly grassEdge: string;
    readonly soil: string;
    readonly road: string;
    readonly roadEdge: string;
    readonly water: string;
    readonly fence: string;
    readonly accent: string;
    readonly danger: string;
  };
  readonly textureStyle: "soft_felt_toy";
  readonly textureScale: number;
  readonly edgeRoundness: number;
}

export interface CameraSpawn {
  readonly position: Vec3;
  readonly lookAt: Vec3;
  readonly fovDegrees: number;
  readonly near: number;
  readonly far: number;
  readonly followDistance: number;
  readonly followHeight: number;
  readonly minimumPitchRadians: number;
  readonly maximumPitchRadians: number;
  readonly mouseSensitivity: number;
}

export interface PlayerSpawn {
  readonly position: Vec3;
  readonly colliderSize: Vec3;
  /** Zero faces +Z; the authored start faces east (+X). */
  readonly facingYawRadians: number;
  readonly safeRadius: number;
  readonly walkSpeed: number;
  readonly sprintSpeed: number;
  readonly jumpSpeed: number;
}

export type WorldMaterial =
  | "felt_grass"
  | "felt_grass_high"
  | "golden_felt_path"
  | "painted_wood"
  | "cream_stone"
  | "sunstone"
  | "cloud_glass"
  | "toy_metal"
  | "clockwork_brass"
  | "frosted_ice"
  | "cocoa_wafer"
  | "lava_rock"
  | "moonstone";

export type PlatformSurface = "normal" | "ice" | "conveyor";

export type PlatformKind =
  | "start_island"
  | "meadow_island"
  | "garden_island"
  | "workshop_island"
  | "tower_island"
  | "goal_island"
  | "stepping_stone"
  | "stair"
  | "causeway";

export interface StaticPlatform extends BoxVolume {
  readonly id: string;
  readonly kind: PlatformKind;
  readonly material: WorldMaterial;
  readonly collision: "solid" | "one_way" | "none";
  readonly castsShadow: boolean;
  readonly receivesShadow: boolean;
  readonly edgeRadius: number;
  readonly rotation?: Euler3;
  readonly surface?: PlatformSurface;
  readonly conveyorVelocity?: Pick<Vec3, "x" | "z">;
}

export interface Ramp extends BoxVolume {
  readonly id: string;
  readonly kind: "ramp";
  readonly material: WorldMaterial;
  readonly collision: "ramp";
  readonly slopeAxis: "x" | "z";
  readonly uphillDirection: -1 | 1;
  readonly rise: number;
  readonly rotation: Euler3;
  readonly castsShadow: boolean;
}

export interface MovingPlatformPath {
  readonly from: Vec3;
  readonly to: Vec3;
  /** Time for one direction; a full out-and-back cycle is twice this value. */
  readonly travelSeconds: number;
  readonly waitAtEndsSeconds: number;
  readonly phase: number;
  readonly easing: "linear" | "smoothstep";
}

export interface MovingPlatform extends BoxVolume {
  readonly id: string;
  readonly kind: "moving_platform";
  readonly material: WorldMaterial;
  readonly collision: "solid";
  readonly castsShadow: boolean;
  /** Authored initial centre; equal to `path.from`. */
  readonly position: Vec3;
  readonly path: MovingPlatformPath;
  readonly surface?: PlatformSurface;
  readonly conveyorVelocity?: Pick<Vec3, "x" | "z">;
}

export interface GroundRoad {
  readonly id: string;
  /** Catmull-Rom control points. Y is slightly above the supporting platform. */
  readonly points: readonly Vec3[];
  readonly width: number;
  readonly thickness: number;
  readonly material: "golden_felt_path";
  readonly edgeColor: string;
  readonly closed: false;
}

export interface FenceLine {
  readonly id: string;
  readonly points: readonly Vec3[];
  readonly height: number;
  readonly postSpacing: number;
  readonly postWidth: number;
  readonly railWidth: number;
  readonly material: "painted_wood";
  readonly collision: boolean;
}

export interface AirTube {
  readonly id: string;
  readonly kind: "aero_ribbon_tube";
  /** Catmull-Rom centre line used to build a transparent tube mesh. */
  readonly points: readonly Vec3[];
  readonly radius: number;
  readonly wallThickness: number;
  readonly color: string;
  readonly flowColor: string;
  readonly opacity: number;
  readonly entry: BoxVolume;
  readonly exit: BoxVolume;
  readonly travelSeconds: number;
  readonly bidirectional: boolean;
  readonly collision: "tube_trigger";
}

export type EnemyKind =
  | "crumb_trundler"
  | "spring_puff"
  | "tin_beetle"
  | "cloud_mite";

export interface EnemyPatrol {
  readonly axis: "x" | "z";
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
  readonly behavior: "walk" | "hop" | "charge" | "float";
  readonly contactDamage: number;
  readonly canBeBouncedOn: boolean;
  readonly scoreValue: number;
}

interface CollectibleBase {
  readonly id: string;
  readonly position: Vec3;
  readonly pickupRadius: number;
  readonly spinRadiansPerSecond: number;
  readonly scoreValue: number;
}

export interface CoinCollectible extends CollectibleBase {
  readonly kind: "coin";
}

export interface StarMedalCollectible extends CollectibleBase {
  readonly kind: "star_medal";
  readonly medalNumber: 1 | 2 | 3 | 4 | 5;
}

export interface MoonShardCollectible extends CollectibleBase {
  readonly kind: "moon_shard";
  readonly shardNumber: 1 | 2 | 3 | 4 | 5;
}

export type Collectible = CoinCollectible | StarMedalCollectible | MoonShardCollectible;

export type HazardKind = "water" | "spikes" | "steam" | "lava" | "void";

export interface HazardSchedule {
  readonly periodSeconds: number;
  readonly activeSeconds: number;
  readonly phaseSeconds: number;
}

export interface Hazard extends BoxVolume {
  readonly id: string;
  readonly kind: HazardKind;
  readonly damage: number;
  readonly instantRespawn: boolean;
  readonly active: boolean;
  readonly visual: "shimmering_water" | "felt_spikes" | "steam_jet" | "molten_cocoa" | "invisible";
  readonly schedule?: HazardSchedule;
}

export interface Checkpoint extends BoxVolume {
  readonly id: string;
  readonly order: 1 | 2 | 3 | 4 | 5 | 6;
  readonly label: string;
  readonly respawnPosition: Vec3;
  readonly facingYawRadians: number;
  readonly visual: "sun_pinwheel_flag";
}

export interface BoostPad extends BoxVolume {
  readonly id: string;
  readonly launchVelocity: Vec3;
  readonly cooldownSeconds: number;
  readonly color: string;
}

export interface WindZone extends BoxVolume {
  readonly id: string;
  /** Acceleration applied while the player is inside the volume. */
  readonly force: Vec3;
  readonly color: string;
}

export interface Goal extends BoxVolume {
  readonly id: string;
  readonly name: string;
  readonly visual: "sun_gate";
  readonly requiredStarMedals: number;
  readonly celebrationSeconds: number;
  readonly facingYawRadians: number;
}

export type DecorationKind =
  | "felt_tree"
  | "puff_tree"
  | "toy_flower_patch"
  | "pinwheel"
  | "direction_sign"
  | "wind_sock"
  | "toy_block_stack"
  | "cloud_bush"
  | "sun_banner"
  | "clockwork_gear"
  | "frost_crystal"
  | "cocoa_arch"
  | "lava_vent"
  | "moon_obelisk"
  | "floating_lantern";

export interface Decoration {
  readonly id: string;
  readonly kind: DecorationKind;
  readonly position: Vec3;
  readonly scale: Vec3;
  readonly yawRadians: number;
  readonly color?: string;
  readonly label?: string;
}

export interface RouteNode {
  readonly id: string;
  readonly position: Vec3;
  readonly hint: string;
  readonly expectedDirection: "east" | "west" | "north" | "south" | "up";
}

export type BiomeId = "meadow" | "clockwork" | "sky" | "frost" | "cocoa" | "moon";

export interface BiomeZone {
  readonly id: BiomeId;
  readonly name: string;
  readonly subtitle: string;
  readonly objective: string;
  readonly minimumZ: number;
  readonly maximumZ: number;
  readonly sky: { readonly zenith: string; readonly horizon: string; readonly fog: string };
  readonly ambient: string;
  readonly accent: string;
}

export type AssetPropKind =
  | "barrel"
  | "chest"
  | "conveyor-belt"
  | "flag"
  | "mushrooms"
  | "pipe"
  | "rocks"
  | "saw"
  | "spring"
  | "tree-pine-snow";

export interface AssetProp {
  readonly id: string;
  readonly kind: AssetPropKind;
  readonly position: Vec3;
  readonly scale: Vec3;
  readonly yawRadians: number;
  readonly animation?: "spin" | "bob" | "none";
}

export interface World3DDefinition {
  readonly metadata: World3DMetadata;
  readonly bounds: World3DBounds;
  readonly gravity: number;
  readonly waterLevelY: number;
  readonly theme: World3DTheme;
  readonly biomes: readonly BiomeZone[];
  readonly camera: CameraSpawn;
  readonly player: PlayerSpawn;
  readonly platforms: readonly StaticPlatform[];
  readonly ramps: readonly Ramp[];
  readonly movingPlatforms: readonly MovingPlatform[];
  readonly roads: readonly GroundRoad[];
  readonly fences: readonly FenceLine[];
  readonly airTubes: readonly AirTube[];
  readonly boostPads: readonly BoostPad[];
  readonly windZones: readonly WindZone[];
  readonly enemies: readonly EnemySpawn[];
  readonly collectibles: readonly Collectible[];
  readonly hazards: readonly Hazard[];
  readonly checkpoints: readonly Checkpoint[];
  readonly decorations: readonly Decoration[];
  readonly assetProps: readonly AssetProp[];
  readonly criticalRoute: readonly RouteNode[];
  readonly goal: Goal;
}

function coinTrail(prefix: string, positions: readonly Vec3[]): CoinCollectible[] {
  return positions.map((position, index) => ({
    id: `${prefix}-${String(index + 1).padStart(2, "0")}`,
    kind: "coin",
    position,
    pickupRadius: 0.7,
    spinRadiansPerSecond: 3.6,
    scoreValue: 100,
  }));
}

const COINS: readonly CoinCollectible[] = [
  ...coinTrail("start", [
    { x: -55, y: 1.25, z: -42 },
    { x: -52, y: 1.25, z: -42 },
    { x: -49, y: 1.25, z: -41 },
    { x: -46, y: 1.25, z: -40 },
    { x: -43, y: 1.25, z: -39 },
    { x: -40, y: 1.25, z: -38 },
  ]),
  ...coinTrail("stone-hop", [
    { x: -34, y: 1.2, z: -37 },
    { x: -30, y: 1.65, z: -36 },
    { x: -26, y: 1.2, z: -35 },
  ]),
  ...coinTrail("meadow-bend", [
    { x: -22, y: 1.25, z: -35 },
    { x: -19, y: 1.25, z: -34 },
    { x: -16, y: 1.25, z: -33 },
    { x: -13, y: 1.25, z: -31 },
    { x: -11, y: 1.25, z: -28 },
    { x: -9, y: 1.25, z: -25 },
    { x: -8, y: 1.25, z: -22 },
    { x: -7, y: 1.25, z: -19 },
    { x: -6, y: 1.25, z: -16 },
    { x: -4, y: 1.25, z: -13 },
    { x: -2, y: 1.25, z: -10 },
    { x: 0, y: 1.25, z: -7 },
  ]),
  ...coinTrail("sun-lawn", [
    { x: 1, y: 1.25, z: -3 },
    { x: 2, y: 1.25, z: 1 },
    { x: 4, y: 1.25, z: 5 },
    { x: 6, y: 1.25, z: 9 },
    { x: 9, y: 1.25, z: 12 },
    { x: 13, y: 1.25, z: 14 },
    { x: 17, y: 1.25, z: 16 },
  ]),
  ...coinTrail("east-crossing", [
    { x: 22, y: 1.45, z: 16 },
    { x: 25, y: 1.7, z: 15 },
    { x: 28, y: 1.7, z: 17 },
    { x: 31, y: 1.45, z: 16 },
    { x: 35, y: 1.25, z: 16 },
    { x: 39, y: 1.25, z: 17 },
    { x: 43, y: 1.25, z: 19 },
    { x: 43, y: 1.25, z: 23 },
  ]),
  ...coinTrail("tower-climb", [
    { x: 43, y: 1.35, z: 25 },
    { x: 43, y: 2.25, z: 27 },
    { x: 43, y: 3.25, z: 29 },
    { x: 43, y: 4.25, z: 31 },
    { x: 43, y: 5.25, z: 33 },
    { x: 43, y: 7.25, z: 37 },
  ]),
  ...coinTrail("high-terrace", [
    { x: 44, y: 7.25, z: 41 },
    { x: 43, y: 7.25, z: 45 },
    { x: 41, y: 7.25, z: 49 },
    { x: 38, y: 7.25, z: 52 },
    { x: 34, y: 7.25, z: 53 },
    { x: 30, y: 7.25, z: 53 },
  ]),
  ...coinTrail("west-crossing", [
    { x: 25, y: 7.35, z: 52 },
    { x: 21, y: 7.35, z: 51 },
    { x: 17, y: 7.35, z: 50 },
    { x: 13, y: 7.35, z: 50 },
    { x: 9, y: 7.25, z: 50 },
  ]),
  ...coinTrail("orchard", [
    { x: 6, y: 7.25, z: 49 },
    { x: 3, y: 7.25, z: 49 },
    { x: 0, y: 7.25, z: 51 },
    { x: -3, y: 7.25, z: 53 },
    { x: -5, y: 7.25, z: 56 },
    { x: -7, y: 7.25, z: 58 },
  ]),
  ...coinTrail("north-landing", [
    { x: -13, y: 5.2, z: 64 },
    { x: -17, y: 5.0, z: 68 },
    { x: -21, y: 4.25, z: 71 },
    { x: -24, y: 4.25, z: 74 },
    { x: -24, y: 4.25, z: 78 },
    { x: -20, y: 4.25, z: 80 },
    { x: -16, y: 4.25, z: 79 },
    { x: -12, y: 4.25, z: 78 },
  ]),
  ...coinTrail("final-run", [
    { x: -7, y: 4.35, z: 77 },
    { x: -3, y: 4.45, z: 76 },
    { x: 1, y: 4.35, z: 76 },
    { x: 6, y: 4.25, z: 76 },
    { x: 11, y: 4.25, z: 75 },
    { x: 16, y: 4.25, z: 75 },
    { x: 21, y: 4.25, z: 76 },
    { x: 26, y: 4.25, z: 78 },
    { x: 31, y: 4.25, z: 80 },
    { x: 36, y: 4.25, z: 81 },
    { x: 41, y: 4.25, z: 81 },
  ]),
  ...coinTrail("clockwork-bridge", [
    { x: 49, y: 4.25, z: 83 },
    { x: 54, y: 4.1, z: 86 },
    { x: 59, y: 4.0, z: 89 },
    { x: 64, y: 4.35, z: 92 },
    { x: 69, y: 4.55, z: 96 },
    { x: 75, y: 4.25, z: 100 },
  ]),
  ...coinTrail("clockwork-harbor", [
    { x: 77, y: 4.25, z: 103 },
    { x: 79, y: 4.25, z: 106 },
    { x: 78, y: 4.25, z: 109 },
  ]),
  ...coinTrail("bounce-arc", [
    { x: 78, y: 5.6, z: 112 },
    { x: 78, y: 8.2, z: 116 },
    { x: 78, y: 10.7, z: 120 },
    { x: 77, y: 11.4, z: 124 },
    { x: 76, y: 10.4, z: 128 },
  ]),
  ...coinTrail("wind-gauntlet", [
    { x: 74, y: 10.25, z: 135 },
    { x: 69, y: 10.25, z: 139 },
    { x: 64, y: 10.35, z: 142 },
    { x: 59, y: 10.35, z: 144 },
    { x: 54, y: 10.35, z: 146 },
    { x: 50, y: 10.35, z: 146 },
    { x: 46, y: 10.6, z: 146 },
    { x: 42, y: 11.1, z: 146 },
    { x: 38, y: 10.35, z: 146 },
    { x: 34, y: 10.35, z: 148 },
    { x: 29, y: 10.35, z: 150 },
    { x: 23, y: 10.25, z: 149 },
  ]),
];

const EXPEDITION_COINS: readonly CoinCollectible[] = [
  ...coinTrail("frost-gate", [
    { x: 18, y: 10.25, z: 160 }, { x: 18, y: 10.25, z: 166 },
    { x: 18, y: 10.25, z: 171 }, { x: 20, y: 10.25, z: 176 },
    { x: 25, y: 10.25, z: 179 },
  ]),
  ...coinTrail("ice-slalom", [
    { x: 30, y: 10.25, z: 180 }, { x: 35, y: 10.25, z: 182 },
    { x: 40, y: 10.25, z: 185 }, { x: 45, y: 10.25, z: 188 },
    { x: 50, y: 10.25, z: 191 }, { x: 55, y: 10.25, z: 193 },
    { x: 60, y: 10.25, z: 195 }, { x: 64, y: 10.25, z: 198 },
  ]),
  ...coinTrail("crystal-climb", [
    { x: 58, y: 10.5, z: 202 }, { x: 56, y: 11.1, z: 205 },
    { x: 53, y: 11.8, z: 208 }, { x: 50, y: 12.5, z: 211 },
    { x: 47, y: 13.2, z: 214 }, { x: 42, y: 14.25, z: 217 },
    { x: 36, y: 14.25, z: 218 }, { x: 30, y: 14.25, z: 220 },
  ]),
  ...coinTrail("cocoa-conveyor", [
    { x: 25, y: 13.3, z: 227 }, { x: 20, y: 13.3, z: 231 },
    { x: 14, y: 13.3, z: 233 }, { x: 8, y: 13.3, z: 235 },
    { x: 2, y: 13.3, z: 237 }, { x: -4, y: 13.3, z: 239 },
    { x: -10, y: 12.3, z: 241 }, { x: -16, y: 12.3, z: 243 },
  ]),
  ...coinTrail("molten-hop", [
    { x: -24, y: 12.2, z: 247 }, { x: -29, y: 12.2, z: 251 },
    { x: -34, y: 12.7, z: 255 }, { x: -39, y: 13.2, z: 259 },
    { x: -36, y: 13.7, z: 264 }, { x: -30, y: 14.2, z: 268 },
  ]),
  ...coinTrail("moon-orbit", [
    { x: -23, y: 14.25, z: 272 }, { x: -18, y: 14.25, z: 276 },
    { x: -12, y: 15.25, z: 280 }, { x: -6, y: 15.8, z: 283 },
    { x: 1, y: 16.25, z: 284 }, { x: 8, y: 16.9, z: 283 },
    { x: 15, y: 17.25, z: 281 }, { x: 22, y: 17.25, z: 282 },
    { x: 29, y: 17.25, z: 284 }, { x: 36, y: 17.25, z: 285 },
  ]),
];

const EXPEDITION_PLATFORMS = [
  { id: "frost-gate-step", kind: "stepping_stone", material: "moonstone", position: { x: 18, y: 8.4, z: 162 }, size: { x: 5.5, y: 1.2, z: 4.5 }, collision: "solid", castsShadow: true, receivesShadow: true, edgeRadius: 0.55 },
  { id: "island-frost-gate", kind: "tower_island", material: "frosted_ice", position: { x: 18, y: 8, z: 174 }, size: { x: 23, y: 2, z: 18 }, collision: "solid", castsShadow: true, receivesShadow: true, edgeRadius: 1.35, surface: "ice" },
  { id: "platform-ice-slalom-01", kind: "causeway", material: "frosted_ice", position: { x: 32, y: 8, z: 181 }, size: { x: 10, y: 2, z: 8 }, collision: "solid", castsShadow: true, receivesShadow: true, edgeRadius: 0.9, surface: "ice" },
  { id: "platform-ice-slalom-02", kind: "causeway", material: "frosted_ice", position: { x: 43, y: 8, z: 186 }, size: { x: 10, y: 2, z: 8 }, collision: "solid", castsShadow: true, receivesShadow: true, edgeRadius: 0.9, surface: "ice" },
  { id: "island-frost-cavern", kind: "tower_island", material: "frosted_ice", position: { x: 58, y: 8, z: 193 }, size: { x: 22, y: 2, z: 19 }, collision: "solid", castsShadow: true, receivesShadow: true, edgeRadius: 1.35, surface: "ice" },
  { id: "crystal-step-01", kind: "stair", material: "moonstone", position: { x: 57, y: 8.35, z: 204 }, size: { x: 6, y: 1.3, z: 3.2 }, collision: "solid", castsShadow: true, receivesShadow: true, edgeRadius: 0.4 },
  { id: "crystal-step-02", kind: "stair", material: "frosted_ice", position: { x: 54, y: 9.05, z: 207 }, size: { x: 5.5, y: 1.4, z: 3.2 }, collision: "solid", castsShadow: true, receivesShadow: true, edgeRadius: 0.4, surface: "ice" },
  { id: "crystal-step-03", kind: "stair", material: "moonstone", position: { x: 51, y: 9.75, z: 210 }, size: { x: 5.5, y: 1.4, z: 3.2 }, collision: "solid", castsShadow: true, receivesShadow: true, edgeRadius: 0.4 },
  { id: "crystal-step-04", kind: "stair", material: "frosted_ice", position: { x: 48, y: 10.45, z: 213 }, size: { x: 5.5, y: 1.4, z: 3.2 }, collision: "solid", castsShadow: true, receivesShadow: true, edgeRadius: 0.4, surface: "ice" },
  { id: "crystal-step-05", kind: "stair", material: "moonstone", position: { x: 45, y: 11.15, z: 216 }, size: { x: 5.5, y: 1.4, z: 3.2 }, collision: "solid", castsShadow: true, receivesShadow: true, edgeRadius: 0.4 },
  { id: "island-frost-summit", kind: "tower_island", material: "moonstone", position: { x: 35, y: 12, z: 219 }, size: { x: 25, y: 2, z: 16 }, collision: "solid", castsShadow: true, receivesShadow: true, edgeRadius: 1.45 },
  { id: "cocoa-entry-step", kind: "stepping_stone", material: "cocoa_wafer", position: { x: 24, y: 11.5, z: 229 }, size: { x: 5.5, y: 1.4, z: 5.5 }, collision: "solid", castsShadow: true, receivesShadow: true, edgeRadius: 0.55 },
  { id: "conveyor-cocoa-01", kind: "causeway", material: "clockwork_brass", position: { x: 15, y: 11, z: 233 }, size: { x: 15, y: 2, z: 7 }, collision: "solid", castsShadow: true, receivesShadow: true, edgeRadius: 0.55, surface: "conveyor", conveyorVelocity: { x: -2.4, z: 0.35 } },
  { id: "conveyor-cocoa-02", kind: "causeway", material: "clockwork_brass", position: { x: 0, y: 11, z: 238 }, size: { x: 15, y: 2, z: 7 }, collision: "solid", castsShadow: true, receivesShadow: true, edgeRadius: 0.55, surface: "conveyor", conveyorVelocity: { x: -3.1, z: 0.2 } },
  { id: "island-cocoa-furnace", kind: "workshop_island", material: "cocoa_wafer", position: { x: -17, y: 10, z: 243 }, size: { x: 21, y: 2, z: 19 }, collision: "solid", castsShadow: true, receivesShadow: true, edgeRadius: 1.35 },
  { id: "lava-rock-01", kind: "stepping_stone", material: "lava_rock", position: { x: -29, y: 10, z: 252 }, size: { x: 6, y: 2, z: 6 }, collision: "solid", castsShadow: true, receivesShadow: true, edgeRadius: 0.85 },
  { id: "lava-rock-02", kind: "stepping_stone", material: "lava_rock", position: { x: -39, y: 10.6, z: 259 }, size: { x: 6, y: 2, z: 6 }, collision: "solid", castsShadow: true, receivesShadow: true, edgeRadius: 0.85 },
  { id: "lava-rock-03", kind: "stepping_stone", material: "lava_rock", position: { x: -31, y: 11.2, z: 267 }, size: { x: 6, y: 2, z: 6 }, collision: "solid", castsShadow: true, receivesShadow: true, edgeRadius: 0.85 },
  { id: "island-moon-entry", kind: "tower_island", material: "moonstone", position: { x: -22, y: 12, z: 274 }, size: { x: 19, y: 2, z: 17 }, collision: "solid", castsShadow: true, receivesShadow: true, edgeRadius: 1.5 },
  { id: "moon-step-01", kind: "stepping_stone", material: "cloud_glass", position: { x: -10, y: 13, z: 280 }, size: { x: 6, y: 1.4, z: 6 }, collision: "solid", castsShadow: true, receivesShadow: true, edgeRadius: 0.75 },
  { id: "moon-step-02", kind: "stepping_stone", material: "moonstone", position: { x: 3, y: 14, z: 284 }, size: { x: 6, y: 1.4, z: 6 }, collision: "solid", castsShadow: true, receivesShadow: true, edgeRadius: 0.75 },
  { id: "moon-step-03", kind: "stepping_stone", material: "cloud_glass", position: { x: 16, y: 15, z: 280 }, size: { x: 6, y: 1.4, z: 6 }, collision: "solid", castsShadow: true, receivesShadow: true, edgeRadius: 0.75 },
  { id: "island-moon-temple", kind: "goal_island", material: "moonstone", position: { x: 35, y: 15, z: 284 }, size: { x: 29, y: 2, z: 23 }, collision: "solid", castsShadow: true, receivesShadow: true, edgeRadius: 1.9 },
] as const satisfies readonly StaticPlatform[];

const EXPEDITION_MOVING_PLATFORMS = [
  { id: "moving-frost-secret", kind: "moving_platform", material: "frosted_ice", position: { x: 68, y: 9.25, z: 188 }, size: { x: 5, y: 0.8, z: 5 }, collision: "solid", castsShadow: true, surface: "ice", path: { from: { x: 68, y: 9.25, z: 188 }, to: { x: 80, y: 11.8, z: 190 }, travelSeconds: 3.1, waitAtEndsSeconds: 0.45, phase: 0.17, easing: "smoothstep" } },
  { id: "moving-crystal-elevator", kind: "moving_platform", material: "moonstone", position: { x: 61, y: 9.3, z: 203 }, size: { x: 5.5, y: 0.8, z: 5.5 }, collision: "solid", castsShadow: true, path: { from: { x: 61, y: 9.3, z: 203 }, to: { x: 51, y: 12.1, z: 214 }, travelSeconds: 3.5, waitAtEndsSeconds: 0.5, phase: 0.52, easing: "smoothstep" } },
  { id: "moving-cocoa-cargo", kind: "moving_platform", material: "clockwork_brass", position: { x: -27, y: 12, z: 249 }, size: { x: 5.5, y: 0.8, z: 5.5 }, collision: "solid", castsShadow: true, surface: "conveyor", conveyorVelocity: { x: -1.5, z: 0 }, path: { from: { x: -27, y: 12, z: 249 }, to: { x: -38, y: 12.6, z: 255 }, travelSeconds: 2.8, waitAtEndsSeconds: 0.25, phase: 0.29, easing: "smoothstep" } },
  { id: "moving-moon-orbit-01", kind: "moving_platform", material: "cloud_glass", position: { x: -15, y: 14.2, z: 281 }, size: { x: 5.5, y: 0.8, z: 5.5 }, collision: "solid", castsShadow: true, path: { from: { x: -15, y: 14.2, z: 281 }, to: { x: -4, y: 15.2, z: 288 }, travelSeconds: 2.7, waitAtEndsSeconds: 0.3, phase: 0.1, easing: "smoothstep" } },
  { id: "moving-moon-orbit-02", kind: "moving_platform", material: "moonstone", position: { x: 8.5, y: 15.4, z: 286 }, size: { x: 5.5, y: 0.8, z: 5.5 }, collision: "solid", castsShadow: true, path: { from: { x: 8.5, y: 15.4, z: 286 }, to: { x: 15, y: 16.4, z: 277 }, travelSeconds: 2.4, waitAtEndsSeconds: 0.25, phase: 0.61, easing: "smoothstep" } },
] as const satisfies readonly MovingPlatform[];

/**
 * World 1-1 — “晴空绒线庭”
 *
 * A broad, toy-like garden course designed for roughly four to six minutes on
 * a first playthrough. Visual language is original: soft felt, rounded painted
 * wood, sun emblems and a translucent ribbon-shaped air tube.
 */
export const WORLD_3D = {
  metadata: {
    id: "world-01-six-realms-expedition",
    name: "六境奥利奥远征",
    subtitle: "穿过花庭、工坊、霜谷、熔炉与月光城",
    description:
      "一条拥有六种主题、隐藏支路与技巧挑战的立体远征路线，鼓励探索和重复挑战。",
    estimatedSeconds: [660, 900],
    difficulty: 5,
    timeLimitSeconds: 960,
  },
  bounds: {
    minimumX: -80,
    maximumX: 110,
    minimumZ: -60,
    maximumZ: 310,
    deathY: -10,
  },
  gravity: -28,
  waterLevelY: -2.15,
  theme: {
    sky: {
      zenith: "#249CFF",
      horizon: "#C9F2FF",
      fog: "#BDEAFF",
      cloud: "#FFFDF5",
    },
    light: {
      sun: "#FFF0B5",
      ambient: "#BEE9FF",
      sunDirection: { x: -0.55, y: 1, z: -0.35 },
      sunIntensity: 2.35,
      ambientIntensity: 1.15,
    },
    palette: {
      grass: "#43C95C",
      grassEdge: "#208A3C",
      soil: "#DDA947",
      road: "#F4C548",
      roadEdge: "#DEA52F",
      water: "#36BDE8",
      fence: "#FFF6DE",
      accent: "#FF8E45",
      danger: "#E94E59",
    },
    textureStyle: "soft_felt_toy",
    textureScale: 5.5,
    edgeRoundness: 0.28,
  },
  biomes: [
    { id: "meadow", name: "绒线花庭", subtitle: "第一境 · 风与花的教学箱庭", objective: "越过花庭与高台，找到透明风带", minimumZ: -60, maximumZ: 86, sky: { zenith: "#249CFF", horizon: "#C9F2FF", fog: "#BDEAFF" }, ambient: "#BEE9FF", accent: "#FFD34E" },
    { id: "clockwork", name: "饼干齿轮港", subtitle: "第二境 · 黄铜机关与弹簧货台", objective: "避开蒸汽节拍，踩弹簧鼓台升空", minimumZ: 86, maximumZ: 124, sky: { zenith: "#3E8FCE", horizon: "#FFD49B", fog: "#B7D5DD" }, ambient: "#FFD2A0", accent: "#F2A83B" },
    { id: "sky", name: "逆风太阳堡", subtitle: "第三境 · 漂浮机关与横风考验", objective: "顶风穿过移动浮桥，抵达太阳堡", minimumZ: 124, maximumZ: 160, sky: { zenith: "#4179E8", horizon: "#D9F6FF", fog: "#C7E9F5" }, ambient: "#CFE8FF", accent: "#6FE5F3" },
    { id: "frost", name: "奶油霜晶谷", subtitle: "第四境 · 冰面惯性与晶体阶梯", objective: "控制滑行节奏，攀上霜晶峰顶", minimumZ: 160, maximumZ: 226, sky: { zenith: "#4A65C8", horizon: "#D9F7FF", fog: "#BFD8F4" }, ambient: "#C8E7FF", accent: "#92F1FF" },
    { id: "cocoa", name: "焦糖可可熔炉", subtitle: "第五境 · 传送带、蒸汽与熔岩捷径", objective: "借货运带穿过熔炉，踏过熔岩石阵", minimumZ: 226, maximumZ: 270, sky: { zenith: "#653F78", horizon: "#FFB46E", fog: "#B77565" }, ambient: "#FFB67E", accent: "#FF7448" },
    { id: "moon", name: "云顶月光城", subtitle: "终境 · 轨道浮台与最终之门", objective: "连续飞跃月轨浮台，登上月光神殿", minimumZ: 270, maximumZ: 311, sky: { zenith: "#25285F", horizon: "#9AA8F4", fog: "#777FC4" }, ambient: "#B9C6FF", accent: "#FFF0A8" },
  ],
  camera: {
    position: { x: -62, y: 13, z: -58 },
    lookAt: { x: -48, y: 1, z: -41 },
    fovDegrees: 52,
    near: 0.1,
    far: 650,
    followDistance: 13,
    followHeight: 6.5,
    minimumPitchRadians: -1.05,
    maximumPitchRadians: -0.12,
    mouseSensitivity: 0.0022,
  },
  player: {
    position: { x: -55, y: 1.05, z: -42 },
    colliderSize: { x: 0.9, y: 1.9, z: 0.9 },
    facingYawRadians: Math.PI / 2,
    safeRadius: 4,
    walkSpeed: 7,
    sprintSpeed: 10.5,
    jumpSpeed: 11.5,
  },
  platforms: [
    {
      id: "island-start-plaza",
      kind: "start_island",
      material: "felt_grass",
      position: { x: -48, y: -1, z: -42 },
      size: { x: 24, y: 2, z: 22 },
      collision: "solid",
      castsShadow: true,
      receivesShadow: true,
      edgeRadius: 1.25,
    },
    {
      id: "hop-stone-01",
      kind: "stepping_stone",
      material: "cream_stone",
      position: { x: -33.6, y: -0.65, z: -37 },
      size: { x: 3.6, y: 1.3, z: 3.6 },
      collision: "solid",
      castsShadow: true,
      receivesShadow: true,
      edgeRadius: 0.6,
    },
    {
      id: "hop-stone-02",
      kind: "stepping_stone",
      material: "sunstone",
      position: { x: -29.7, y: -0.25, z: -36 },
      size: { x: 3.3, y: 1.5, z: 3.3 },
      collision: "solid",
      castsShadow: true,
      receivesShadow: true,
      edgeRadius: 0.55,
    },
    {
      id: "hop-stone-03",
      kind: "stepping_stone",
      material: "cream_stone",
      position: { x: -26, y: -0.65, z: -35 },
      size: { x: 3.5, y: 1.3, z: 3.5 },
      collision: "solid",
      castsShadow: true,
      receivesShadow: true,
      edgeRadius: 0.6,
    },
    {
      id: "island-meadow-ribbon",
      kind: "meadow_island",
      material: "felt_grass",
      position: { x: -13, y: -1, z: -36 },
      size: { x: 22, y: 2, z: 18 },
      collision: "solid",
      castsShadow: true,
      receivesShadow: true,
      edgeRadius: 1.5,
    },
    {
      id: "island-bend-garden",
      kind: "garden_island",
      material: "felt_grass",
      position: { x: -6, y: -1, z: -18 },
      size: { x: 18, y: 2, z: 18 },
      collision: "solid",
      castsShadow: true,
      receivesShadow: true,
      edgeRadius: 1.4,
    },
    {
      id: "island-sun-lawn",
      kind: "garden_island",
      material: "felt_grass",
      position: { x: 2, y: -1, z: 1 },
      size: { x: 24, y: 2, z: 20 },
      collision: "solid",
      castsShadow: true,
      receivesShadow: true,
      edgeRadius: 1.6,
    },
    {
      id: "island-central-garden",
      kind: "garden_island",
      material: "felt_grass",
      position: { x: 8, y: -1, z: 16 },
      size: { x: 26, y: 2, z: 14 },
      collision: "solid",
      castsShadow: true,
      receivesShadow: true,
      edgeRadius: 1.35,
    },
    {
      id: "island-workshop",
      kind: "workshop_island",
      material: "felt_grass",
      position: { x: 43, y: -1, z: 16 },
      size: { x: 20, y: 2, z: 20 },
      collision: "solid",
      castsShadow: true,
      receivesShadow: true,
      edgeRadius: 1.4,
    },
    ...Array.from({ length: 12 }, (_, index) => {
      const top = (index + 1) * 0.5;
      const bottom = -2;
      return {
        id: `stair-north-${String(index + 1).padStart(2, "0")}`,
        kind: "stair" as const,
        material: "sunstone" as const,
        position: {
          x: 41,
          y: (top + bottom) / 2,
          z: 26.5 + index * 0.82,
        },
        size: { x: 6.2, y: top - bottom, z: 1.02 },
        collision: "solid" as const,
        castsShadow: true,
        receivesShadow: true,
        edgeRadius: 0.16,
      };
    }),
    {
      id: "island-high-terrace",
      kind: "tower_island",
      material: "felt_grass_high",
      position: { x: 42, y: 5, z: 48 },
      size: { x: 30, y: 2, z: 24 },
      collision: "solid",
      castsShadow: true,
      receivesShadow: true,
      edgeRadius: 1.6,
    },
    {
      id: "island-high-orchard",
      kind: "tower_island",
      material: "felt_grass_high",
      position: { x: -1, y: 5, z: 48 },
      size: { x: 22, y: 2, z: 24 },
      collision: "solid",
      castsShadow: true,
      receivesShadow: true,
      edgeRadius: 1.45,
    },
    {
      id: "island-north-landing",
      kind: "meadow_island",
      material: "felt_grass_high",
      position: { x: -22, y: 2, z: 76 },
      size: { x: 28, y: 2, z: 20 },
      collision: "solid",
      castsShadow: true,
      receivesShadow: true,
      edgeRadius: 1.5,
    },
    {
      id: "causeway-final-01",
      kind: "causeway",
      material: "cream_stone",
      position: { x: -5.5, y: 2, z: 77 },
      size: { x: 5, y: 1.4, z: 5.5 },
      collision: "solid",
      castsShadow: true,
      receivesShadow: true,
      edgeRadius: 0.65,
    },
    {
      id: "causeway-final-02",
      kind: "causeway",
      material: "sunstone",
      position: { x: 0, y: 2, z: 76 },
      size: { x: 5, y: 1.4, z: 5.5 },
      collision: "solid",
      castsShadow: true,
      receivesShadow: true,
      edgeRadius: 0.65,
    },
    {
      id: "island-goal-court",
      kind: "goal_island",
      material: "felt_grass_high",
      position: { x: 29, y: 2, z: 77 },
      size: { x: 50, y: 2, z: 24 },
      collision: "solid",
      castsShadow: true,
      receivesShadow: true,
      edgeRadius: 1.75,
    },
    {
      id: "causeway-clockwork-01",
      kind: "causeway",
      material: "clockwork_brass",
      position: { x: 57, y: 2, z: 87 },
      size: { x: 5, y: 1.4, z: 5 },
      collision: "solid",
      castsShadow: true,
      receivesShadow: true,
      edgeRadius: 0.62,
    },
    {
      id: "causeway-clockwork-02",
      kind: "causeway",
      material: "cocoa_wafer",
      position: { x: 62, y: 2.4, z: 91 },
      size: { x: 5, y: 1.4, z: 5 },
      collision: "solid",
      castsShadow: true,
      receivesShadow: true,
      edgeRadius: 0.62,
    },
    {
      id: "causeway-clockwork-03",
      kind: "causeway",
      material: "toy_metal",
      position: { x: 67, y: 2.8, z: 95 },
      size: { x: 5, y: 1.4, z: 5 },
      collision: "solid",
      castsShadow: true,
      receivesShadow: true,
      edgeRadius: 0.62,
    },
    {
      id: "island-clockwork-harbor",
      kind: "workshop_island",
      material: "clockwork_brass",
      position: { x: 78, y: 2, z: 103 },
      size: { x: 22, y: 2, z: 20 },
      collision: "solid",
      castsShadow: true,
      receivesShadow: true,
      edgeRadius: 1.55,
      surface: "conveyor",
      conveyorVelocity: { x: 0, z: 1.25 },
    },
    {
      id: "ledge-wind-launch",
      kind: "stepping_stone",
      material: "sunstone",
      position: { x: 78, y: 3.7, z: 117 },
      size: { x: 6, y: 1.4, z: 5 },
      collision: "solid",
      castsShadow: true,
      receivesShadow: true,
      edgeRadius: 0.55,
    },
    {
      id: "island-wind-roost",
      kind: "tower_island",
      material: "felt_grass_high",
      position: { x: 76, y: 8, z: 133 },
      size: { x: 24, y: 2, z: 20 },
      collision: "solid",
      castsShadow: true,
      receivesShadow: true,
      edgeRadius: 1.55,
    },
    {
      id: "sky-anchor-west-01",
      kind: "stepping_stone",
      material: "cream_stone",
      position: { x: 52, y: 8, z: 146 },
      size: { x: 4.8, y: 1.4, z: 4.8 },
      collision: "solid",
      castsShadow: true,
      receivesShadow: true,
      edgeRadius: 0.58,
    },
    {
      id: "sky-anchor-west-02",
      kind: "stepping_stone",
      material: "sunstone",
      position: { x: 38, y: 8, z: 147 },
      size: { x: 4.8, y: 1.4, z: 4.8 },
      collision: "solid",
      castsShadow: true,
      receivesShadow: true,
      edgeRadius: 0.58,
    },
    {
      id: "island-sun-citadel",
      kind: "goal_island",
      material: "cloud_glass",
      position: { x: 18, y: 8, z: 147 },
      size: { x: 28, y: 2, z: 24 },
      collision: "solid",
      castsShadow: true,
      receivesShadow: true,
      edgeRadius: 1.8,
    },
    ...EXPEDITION_PLATFORMS,
  ],
  ramps: [
    {
      id: "ramp-to-tower",
      kind: "ramp",
      material: "golden_felt_path",
      position: { x: 46.5, y: 3, z: 31 },
      size: { x: 5.2, y: 0.85, z: 12.7 },
      collision: "ramp",
      slopeAxis: "z",
      uphillDirection: 1,
      rise: 6,
      rotation: { x: -0.49, y: 0, z: 0 },
      castsShadow: true,
    },
  ],
  movingPlatforms: [
    {
      id: "moving-east-01",
      kind: "moving_platform",
      material: "toy_metal",
      position: { x: 24, y: 0.25, z: 14 },
      size: { x: 4.5, y: 0.7, z: 4.5 },
      collision: "solid",
      castsShadow: true,
      path: {
        from: { x: 24, y: 0.25, z: 14 },
        to: { x: 24, y: 0.25, z: 18 },
        travelSeconds: 2.2,
        waitAtEndsSeconds: 0.35,
        phase: 0,
        easing: "smoothstep",
      },
    },
    {
      id: "moving-east-02",
      kind: "moving_platform",
      material: "sunstone",
      position: { x: 28, y: 0.25, z: 17 },
      size: { x: 4.5, y: 0.7, z: 4.5 },
      collision: "solid",
      castsShadow: true,
      path: {
        from: { x: 28, y: 0.25, z: 17 },
        to: { x: 31, y: 1.25, z: 17 },
        travelSeconds: 2.6,
        waitAtEndsSeconds: 0.25,
        phase: 0.48,
        easing: "smoothstep",
      },
    },
    {
      id: "moving-west-01",
      kind: "moving_platform",
      material: "toy_metal",
      position: { x: 24, y: 6.35, z: 49 },
      size: { x: 4.5, y: 0.7, z: 4.5 },
      collision: "solid",
      castsShadow: true,
      path: {
        from: { x: 24, y: 6.35, z: 49 },
        to: { x: 24, y: 6.35, z: 54 },
        travelSeconds: 2.4,
        waitAtEndsSeconds: 0.25,
        phase: 0.1,
        easing: "smoothstep",
      },
    },
    {
      id: "moving-west-02",
      kind: "moving_platform",
      material: "sunstone",
      position: { x: 18.5, y: 6.35, z: 50 },
      size: { x: 5, y: 0.7, z: 4.5 },
      collision: "solid",
      castsShadow: true,
      path: {
        from: { x: 18.5, y: 6.35, z: 50 },
        to: { x: 16.5, y: 7.35, z: 50 },
        travelSeconds: 2.1,
        waitAtEndsSeconds: 0.2,
        phase: 0.52,
        easing: "smoothstep",
      },
    },
    {
      id: "moving-north-lift",
      kind: "moving_platform",
      material: "toy_metal",
      position: { x: -10, y: 4.1, z: 61.5 },
      size: { x: 4.5, y: 0.7, z: 5 },
      collision: "solid",
      castsShadow: true,
      path: {
        from: { x: -10, y: 4.1, z: 61.5 },
        to: { x: -10, y: 3.1, z: 66.5 },
        travelSeconds: 3.1,
        waitAtEndsSeconds: 0.45,
        phase: 0.22,
        easing: "smoothstep",
      },
    },
    {
      id: "moving-clockwork-lift",
      kind: "moving_platform",
      material: "toy_metal",
      position: { x: 78, y: 4.75, z: 119 },
      size: { x: 5, y: 0.7, z: 5 },
      collision: "solid",
      castsShadow: true,
      path: {
        from: { x: 78, y: 4.75, z: 119 },
        to: { x: 82, y: 8.35, z: 125 },
        travelSeconds: 3.2,
        waitAtEndsSeconds: 0.5,
        phase: 0.08,
        easing: "smoothstep",
      },
    },
    {
      id: "moving-sky-gauntlet-01",
      kind: "moving_platform",
      material: "toy_metal",
      position: { x: 64, y: 9.35, z: 142 },
      size: { x: 5, y: 0.7, z: 5 },
      collision: "solid",
      castsShadow: true,
      path: {
        from: { x: 64, y: 9.35, z: 142 },
        to: { x: 56, y: 9.35, z: 146 },
        travelSeconds: 2.7,
        waitAtEndsSeconds: 0.25,
        phase: 0.16,
        easing: "smoothstep",
      },
    },
    {
      id: "moving-sky-gauntlet-02",
      kind: "moving_platform",
      material: "sunstone",
      position: { x: 48, y: 9.35, z: 146 },
      size: { x: 4.5, y: 0.7, z: 4.5 },
      collision: "solid",
      castsShadow: true,
      path: {
        from: { x: 48, y: 9.35, z: 146 },
        to: { x: 43, y: 10.55, z: 144 },
        travelSeconds: 2.35,
        waitAtEndsSeconds: 0.2,
        phase: 0.53,
        easing: "smoothstep",
      },
    },
    {
      id: "moving-sky-gauntlet-03",
      kind: "moving_platform",
      material: "toy_metal",
      position: { x: 34, y: 9.35, z: 149 },
      size: { x: 4.8, y: 0.7, z: 4.8 },
      collision: "solid",
      castsShadow: true,
      path: {
        from: { x: 34, y: 9.35, z: 149 },
        to: { x: 29, y: 9.35, z: 145 },
        travelSeconds: 2.5,
        waitAtEndsSeconds: 0.3,
        phase: 0.31,
        easing: "smoothstep",
      },
    },
    ...EXPEDITION_MOVING_PLATFORMS,
  ],
  roads: [
    {
      id: "road-start-plaza",
      points: [
        { x: -56, y: 0.07, z: -42 },
        { x: -50, y: 0.07, z: -42 },
        { x: -45, y: 0.07, z: -40 },
        { x: -39, y: 0.07, z: -37 },
      ],
      width: 4.6,
      thickness: 0.12,
      material: "golden_felt_path",
      edgeColor: "#D49A27",
      closed: false,
    },
    {
      id: "road-meadow-bend",
      points: [
        { x: -23, y: 0.07, z: -35 },
        { x: -17, y: 0.07, z: -34 },
        { x: -12, y: 0.07, z: -30 },
        { x: -8, y: 0.07, z: -24 },
        { x: -6, y: 0.07, z: -17 },
        { x: -2, y: 0.07, z: -10 },
      ],
      width: 4.2,
      thickness: 0.12,
      material: "golden_felt_path",
      edgeColor: "#D49A27",
      closed: false,
    },
    {
      id: "road-sun-lawn",
      points: [
        { x: -1, y: 0.07, z: -8 },
        { x: 1, y: 0.07, z: -2 },
        { x: 3, y: 0.07, z: 4 },
        { x: 7, y: 0.07, z: 10 },
        { x: 13, y: 0.07, z: 14 },
        { x: 19, y: 0.07, z: 16 },
      ],
      width: 4.4,
      thickness: 0.12,
      material: "golden_felt_path",
      edgeColor: "#D49A27",
      closed: false,
    },
    {
      id: "road-workshop",
      points: [
        { x: 34, y: 0.07, z: 16 },
        { x: 39, y: 0.07, z: 17 },
        { x: 43, y: 0.07, z: 20 },
        { x: 43, y: 0.07, z: 25 },
      ],
      width: 4.2,
      thickness: 0.12,
      material: "golden_felt_path",
      edgeColor: "#D49A27",
      closed: false,
    },
    {
      id: "road-high-terrace",
      points: [
        { x: 43, y: 6.07, z: 37 },
        { x: 44, y: 6.07, z: 44 },
        { x: 40, y: 6.07, z: 50 },
        { x: 34, y: 6.07, z: 53 },
        { x: 28, y: 6.07, z: 52 },
      ],
      width: 4.4,
      thickness: 0.12,
      material: "golden_felt_path",
      edgeColor: "#D49A27",
      closed: false,
    },
    {
      id: "road-high-orchard",
      points: [
        { x: 9, y: 6.07, z: 50 },
        { x: 4, y: 6.07, z: 49 },
        { x: -1, y: 6.07, z: 51 },
        { x: -5, y: 6.07, z: 55 },
        { x: -7, y: 6.07, z: 59 },
      ],
      width: 4,
      thickness: 0.12,
      material: "golden_felt_path",
      edgeColor: "#D49A27",
      closed: false,
    },
    {
      id: "road-north-landing",
      points: [
        { x: -23, y: 3.07, z: 68 },
        { x: -25, y: 3.07, z: 74 },
        { x: -22, y: 3.07, z: 79 },
        { x: -16, y: 3.07, z: 80 },
        { x: -10, y: 3.07, z: 78 },
      ],
      width: 4.2,
      thickness: 0.12,
      material: "golden_felt_path",
      edgeColor: "#D49A27",
      closed: false,
    },
    {
      id: "road-goal-court",
      points: [
        { x: 5, y: 3.07, z: 77 },
        { x: 13, y: 3.07, z: 75 },
        { x: 22, y: 3.07, z: 76 },
        { x: 31, y: 3.07, z: 80 },
        { x: 40, y: 3.07, z: 81 },
        { x: 47, y: 3.07, z: 81 },
      ],
      width: 4.8,
      thickness: 0.12,
      material: "golden_felt_path",
      edgeColor: "#D49A27",
      closed: false,
    },
    {
      id: "road-clockwork-harbor",
      points: [
        { x: 70, y: 3.07, z: 99 },
        { x: 74, y: 3.07, z: 101 },
        { x: 78, y: 3.07, z: 104 },
        { x: 78, y: 3.07, z: 109 },
      ],
      width: 3.8,
      thickness: 0.12,
      material: "golden_felt_path",
      edgeColor: "#D49A27",
      closed: false,
    },
    {
      id: "road-wind-roost",
      points: [
        { x: 81, y: 9.07, z: 126 },
        { x: 78, y: 9.07, z: 132 },
        { x: 73, y: 9.07, z: 137 },
        { x: 67, y: 9.07, z: 140 },
      ],
      width: 3.7,
      thickness: 0.12,
      material: "golden_felt_path",
      edgeColor: "#D49A27",
      closed: false,
    },
    {
      id: "road-sun-citadel",
      points: [
        { x: 29, y: 9.07, z: 147 },
        { x: 24, y: 9.07, z: 146 },
        { x: 18, y: 9.07, z: 147 },
        { x: 12, y: 9.07, z: 149 },
      ],
      width: 4.2,
      thickness: 0.12,
      material: "golden_felt_path",
      edgeColor: "#D49A27",
      closed: false,
    },
    {
      id: "road-frost-gate",
      points: [
        { x: 18, y: 9.07, z: 165 }, { x: 18, y: 9.07, z: 171 },
        { x: 22, y: 9.07, z: 176 }, { x: 28, y: 9.07, z: 179 },
      ],
      width: 3.5, thickness: 0.12, material: "golden_felt_path", edgeColor: "#8DE8FF", closed: false,
    },
    {
      id: "road-frost-summit",
      points: [
        { x: 44, y: 13.07, z: 216 }, { x: 39, y: 13.07, z: 219 },
        { x: 33, y: 13.07, z: 219 }, { x: 27, y: 13.07, z: 222 },
      ],
      width: 3.4, thickness: 0.12, material: "golden_felt_path", edgeColor: "#A6CFFF", closed: false,
    },
    {
      id: "road-cocoa-furnace",
      points: [
        { x: -8, y: 11.07, z: 239 }, { x: -12, y: 11.07, z: 241 },
        { x: -17, y: 11.07, z: 243 }, { x: -22, y: 11.07, z: 246 },
      ],
      width: 3.2, thickness: 0.12, material: "golden_felt_path", edgeColor: "#E46F38", closed: false,
    },
    {
      id: "road-moon-temple",
      points: [
        { x: 21, y: 16.07, z: 281 }, { x: 27, y: 16.07, z: 283 },
        { x: 34, y: 16.07, z: 284 }, { x: 42, y: 16.07, z: 285 },
      ],
      width: 3.6, thickness: 0.12, material: "golden_felt_path", edgeColor: "#D7D0FF", closed: false,
    },
  ],
  fences: [
    {
      id: "fence-start-south",
      points: [
        { x: -59, y: 0, z: -52 },
        { x: -48, y: 0, z: -52 },
        { x: -37, y: 0, z: -52 },
      ],
      height: 1.65,
      postSpacing: 1.4,
      postWidth: 0.22,
      railWidth: 0.18,
      material: "painted_wood",
      collision: true,
    },
    {
      id: "fence-start-west",
      points: [
        { x: -59, y: 0, z: -52 },
        { x: -59, y: 0, z: -42 },
        { x: -59, y: 0, z: -32 },
      ],
      height: 1.65,
      postSpacing: 1.4,
      postWidth: 0.22,
      railWidth: 0.18,
      material: "painted_wood",
      collision: true,
    },
    {
      id: "fence-meadow-south",
      points: [
        { x: -23, y: 0, z: -44 },
        { x: -13, y: 0, z: -44 },
        { x: -3, y: 0, z: -44 },
      ],
      height: 1.45,
      postSpacing: 1.35,
      postWidth: 0.2,
      railWidth: 0.16,
      material: "painted_wood",
      collision: true,
    },
    {
      id: "fence-lawn-west",
      points: [
        { x: -9, y: 0, z: -7 },
        { x: -9, y: 0, z: 0 },
        { x: -9, y: 0, z: 7 },
      ],
      height: 1.45,
      postSpacing: 1.35,
      postWidth: 0.2,
      railWidth: 0.16,
      material: "painted_wood",
      collision: true,
    },
    {
      id: "fence-workshop-east",
      points: [
        { x: 52, y: 0, z: 7 },
        { x: 52, y: 0, z: 16 },
        { x: 52, y: 0, z: 25 },
      ],
      height: 1.5,
      postSpacing: 1.35,
      postWidth: 0.2,
      railWidth: 0.16,
      material: "painted_wood",
      collision: true,
    },
    {
      id: "fence-high-north",
      points: [
        { x: 28, y: 6, z: 59 },
        { x: 41, y: 6, z: 59 },
        { x: 56, y: 6, z: 59 },
      ],
      height: 1.6,
      postSpacing: 1.5,
      postWidth: 0.22,
      railWidth: 0.18,
      material: "painted_wood",
      collision: true,
    },
    {
      id: "fence-orchard-south",
      points: [
        { x: -11, y: 6, z: 37 },
        { x: -1, y: 6, z: 37 },
        { x: 9, y: 6, z: 37 },
      ],
      height: 1.55,
      postSpacing: 1.45,
      postWidth: 0.22,
      railWidth: 0.17,
      material: "painted_wood",
      collision: true,
    },
    {
      id: "fence-final-south",
      points: [
        { x: 6, y: 3, z: 66 },
        { x: 20, y: 3, z: 66 },
        { x: 34, y: 3, z: 66 },
        { x: 51, y: 3, z: 66 },
      ],
      height: 1.65,
      postSpacing: 1.5,
      postWidth: 0.22,
      railWidth: 0.18,
      material: "painted_wood",
      collision: true,
    },
    {
      id: "fence-final-north",
      points: [
        { x: 6, y: 3, z: 88 },
        { x: 20, y: 3, z: 88 },
        { x: 34, y: 3, z: 88 },
        { x: 52, y: 3, z: 88 },
      ],
      height: 1.65,
      postSpacing: 1.5,
      postWidth: 0.22,
      railWidth: 0.18,
      material: "painted_wood",
      collision: true,
    },
  ],
  airTubes: [
    {
      id: "aero-ribbon-north",
      kind: "aero_ribbon_tube",
      points: [
        { x: -7, y: 7.2, z: 57.5 },
        { x: -8, y: 9.5, z: 61 },
        { x: -12, y: 10.8, z: 65 },
        { x: -17, y: 9.2, z: 68 },
        { x: -22, y: 5.1, z: 70.5 },
      ],
      radius: 1.45,
      wallThickness: 0.09,
      color: "#C9F8FF",
      flowColor: "#FFF2A6",
      opacity: 0.38,
      entry: {
        position: { x: -7, y: 7.2, z: 57.5 },
        size: { x: 3.2, y: 3.2, z: 3.2 },
      },
      exit: {
        position: { x: -22, y: 5.1, z: 70.5 },
        size: { x: 3.2, y: 3.2, z: 3.2 },
      },
      travelSeconds: 2.8,
      bidirectional: true,
      collision: "tube_trigger",
    },
    {
      id: "aero-ribbon-frost-secret",
      kind: "aero_ribbon_tube",
      points: [
        { x: 80, y: 12.8, z: 190 }, { x: 75, y: 16, z: 198 },
        { x: 65, y: 18, z: 207 }, { x: 53, y: 16.5, z: 214 },
        { x: 42, y: 14.2, z: 219 },
      ],
      radius: 1.25,
      wallThickness: 0.08,
      color: "#D8F7FF",
      flowColor: "#B4A9FF",
      opacity: 0.32,
      entry: { position: { x: 80, y: 12.8, z: 190 }, size: { x: 3.2, y: 3.2, z: 3.2 } },
      exit: { position: { x: 42, y: 14.2, z: 219 }, size: { x: 3.2, y: 3.2, z: 3.2 } },
      travelSeconds: 3.1,
      bidirectional: true,
      collision: "tube_trigger",
    },
  ],
  boostPads: [
    {
      id: "boost-clockwork-launch",
      position: { x: 78, y: 3.55, z: 109 },
      size: { x: 3.8, y: 1.2, z: 3.8 },
      launchVelocity: { x: 0, y: 16.5, z: 11.5 },
      cooldownSeconds: 1.1,
      color: "#FFCE45",
    },
    {
      id: "boost-citadel-secret",
      position: { x: 11, y: 9.55, z: 140 },
      size: { x: 3.4, y: 1.2, z: 3.4 },
      launchVelocity: { x: 4, y: 14.5, z: 0 },
      cooldownSeconds: 1,
      color: "#69E7F4",
    },
    {
      id: "boost-frost-secret",
      position: { x: 64, y: 9.6, z: 187 },
      size: { x: 3.5, y: 1.2, z: 3.5 },
      launchVelocity: { x: 10.5, y: 12.5, z: 1.5 },
      cooldownSeconds: 1,
      color: "#91EEFF",
    },
    {
      id: "boost-cocoa-loft",
      position: { x: -12, y: 11.55, z: 248 },
      size: { x: 3.5, y: 1.2, z: 3.5 },
      launchVelocity: { x: 3.5, y: 15.5, z: 3.5 },
      cooldownSeconds: 1.05,
      color: "#FF8050",
    },
  ],
  windZones: [
    {
      id: "wind-sky-gauntlet",
      position: { x: 51, y: 11, z: 146 },
      size: { x: 35, y: 8, z: 13 },
      force: { x: -3.2, y: 0, z: 2.4 },
      color: "#C9F8FF",
    },
    {
      id: "wind-moon-orbit",
      position: { x: 2, y: 17, z: 282 },
      size: { x: 34, y: 10, z: 18 },
      force: { x: 2.2, y: 0.35, z: -2.6 },
      color: "#DAD7FF",
    },
  ],
  enemies: [
    {
      id: "enemy-meadow-crumb-01",
      kind: "crumb_trundler",
      position: { x: -16, y: 0.65, z: -38 },
      colliderSize: { x: 1.25, y: 1.3, z: 1.25 },
      patrol: { axis: "x", minimum: -21, maximum: -9, speed: 1.8, pauseAtTurnSeconds: 0.25 },
      behavior: "walk",
      contactDamage: 1,
      canBeBouncedOn: true,
      scoreValue: 200,
    },
    {
      id: "enemy-bend-puff-01",
      kind: "spring_puff",
      position: { x: -9, y: 0.7, z: -17 },
      colliderSize: { x: 1.2, y: 1.4, z: 1.2 },
      patrol: { axis: "z", minimum: -23, maximum: -12, speed: 1.45, pauseAtTurnSeconds: 0.35 },
      behavior: "hop",
      contactDamage: 1,
      canBeBouncedOn: true,
      scoreValue: 250,
    },
    {
      id: "enemy-lawn-beetle-01",
      kind: "tin_beetle",
      position: { x: 6, y: 0.55, z: 2 },
      colliderSize: { x: 1.45, y: 1.1, z: 1.25 },
      patrol: { axis: "z", minimum: -5, maximum: 8, speed: 2.15, pauseAtTurnSeconds: 0.15 },
      behavior: "charge",
      contactDamage: 1,
      canBeBouncedOn: true,
      scoreValue: 300,
    },
    {
      id: "enemy-garden-crumb-01",
      kind: "crumb_trundler",
      position: { x: 10, y: 0.65, z: 14 },
      colliderSize: { x: 1.25, y: 1.3, z: 1.25 },
      patrol: { axis: "x", minimum: 2, maximum: 18, speed: 1.75, pauseAtTurnSeconds: 0.25 },
      behavior: "walk",
      contactDamage: 1,
      canBeBouncedOn: true,
      scoreValue: 200,
    },
    {
      id: "enemy-workshop-beetle-01",
      kind: "tin_beetle",
      position: { x: 43, y: 0.55, z: 12 },
      colliderSize: { x: 1.45, y: 1.1, z: 1.25 },
      patrol: { axis: "z", minimum: 8, maximum: 22, speed: 2.25, pauseAtTurnSeconds: 0.12 },
      behavior: "charge",
      contactDamage: 1,
      canBeBouncedOn: true,
      scoreValue: 300,
    },
    {
      id: "enemy-terrace-cloud-01",
      kind: "cloud_mite",
      position: { x: 48, y: 7.1, z: 45 },
      colliderSize: { x: 1.35, y: 1.35, z: 1.35 },
      patrol: { axis: "x", minimum: 34, maximum: 51, speed: 1.65, pauseAtTurnSeconds: 0.4 },
      behavior: "float",
      contactDamage: 1,
      canBeBouncedOn: true,
      scoreValue: 350,
    },
    {
      id: "enemy-terrace-crumb-01",
      kind: "crumb_trundler",
      position: { x: 37, y: 6.65, z: 53 },
      colliderSize: { x: 1.25, y: 1.3, z: 1.25 },
      patrol: { axis: "x", minimum: 30, maximum: 47, speed: 1.95, pauseAtTurnSeconds: 0.2 },
      behavior: "walk",
      contactDamage: 1,
      canBeBouncedOn: true,
      scoreValue: 200,
    },
    {
      id: "enemy-orchard-puff-01",
      kind: "spring_puff",
      position: { x: 0, y: 6.7, z: 45 },
      colliderSize: { x: 1.2, y: 1.4, z: 1.2 },
      patrol: { axis: "z", minimum: 40, maximum: 56, speed: 1.55, pauseAtTurnSeconds: 0.3 },
      behavior: "hop",
      contactDamage: 1,
      canBeBouncedOn: true,
      scoreValue: 250,
    },
    {
      id: "enemy-north-beetle-01",
      kind: "tin_beetle",
      position: { x: -24, y: 3.55, z: 77 },
      colliderSize: { x: 1.45, y: 1.1, z: 1.25 },
      patrol: { axis: "x", minimum: -31, maximum: -14, speed: 2.2, pauseAtTurnSeconds: 0.15 },
      behavior: "charge",
      contactDamage: 1,
      canBeBouncedOn: true,
      scoreValue: 300,
    },
    {
      id: "enemy-goal-crumb-01",
      kind: "crumb_trundler",
      position: { x: 18, y: 3.65, z: 75 },
      colliderSize: { x: 1.25, y: 1.3, z: 1.25 },
      patrol: { axis: "x", minimum: 9, maximum: 26, speed: 2, pauseAtTurnSeconds: 0.2 },
      behavior: "walk",
      contactDamage: 1,
      canBeBouncedOn: true,
      scoreValue: 200,
    },
    {
      id: "enemy-goal-puff-01",
      kind: "spring_puff",
      position: { x: 34, y: 3.7, z: 80 },
      colliderSize: { x: 1.2, y: 1.4, z: 1.2 },
      patrol: { axis: "z", minimum: 70, maximum: 85, speed: 1.6, pauseAtTurnSeconds: 0.3 },
      behavior: "hop",
      contactDamage: 1,
      canBeBouncedOn: true,
      scoreValue: 250,
    },
    {
      id: "enemy-clockwork-beetle-01",
      kind: "tin_beetle",
      position: { x: 74, y: 3.55, z: 103 },
      colliderSize: { x: 1.45, y: 1.1, z: 1.25 },
      patrol: { axis: "x", minimum: 70, maximum: 85, speed: 2.45, pauseAtTurnSeconds: 0.12 },
      behavior: "charge",
      contactDamage: 1,
      canBeBouncedOn: true,
      scoreValue: 350,
    },
    {
      id: "enemy-clockwork-puff-01",
      kind: "spring_puff",
      position: { x: 83, y: 3.7, z: 106 },
      colliderSize: { x: 1.2, y: 1.4, z: 1.2 },
      patrol: { axis: "z", minimum: 98, maximum: 110, speed: 1.85, pauseAtTurnSeconds: 0.22 },
      behavior: "hop",
      contactDamage: 1,
      canBeBouncedOn: true,
      scoreValue: 300,
    },
    {
      id: "enemy-wind-cloud-01",
      kind: "cloud_mite",
      position: { x: 78, y: 10.05, z: 132 },
      colliderSize: { x: 1.35, y: 1.35, z: 1.35 },
      patrol: { axis: "x", minimum: 67, maximum: 84, speed: 2.15, pauseAtTurnSeconds: 0.18 },
      behavior: "float",
      contactDamage: 1,
      canBeBouncedOn: true,
      scoreValue: 400,
    },
    {
      id: "enemy-citadel-beetle-01",
      kind: "tin_beetle",
      position: { x: 17, y: 9.55, z: 143 },
      colliderSize: { x: 1.45, y: 1.1, z: 1.25 },
      patrol: { axis: "z", minimum: 138, maximum: 155, speed: 2.6, pauseAtTurnSeconds: 0.1 },
      behavior: "charge",
      contactDamage: 1,
      canBeBouncedOn: true,
      scoreValue: 400,
    },
    {
      id: "enemy-frost-puff-01", kind: "spring_puff", position: { x: 28, y: 9.7, z: 175 },
      colliderSize: { x: 1.2, y: 1.4, z: 1.2 }, patrol: { axis: "x", minimum: 10, maximum: 28, speed: 2.1, pauseAtTurnSeconds: 0.2 },
      behavior: "hop", contactDamage: 1, canBeBouncedOn: true, scoreValue: 350,
    },
    {
      id: "enemy-frost-cloud-01", kind: "cloud_mite", position: { x: 55, y: 10.2, z: 194 },
      colliderSize: { x: 1.35, y: 1.35, z: 1.35 }, patrol: { axis: "z", minimum: 186, maximum: 200, speed: 2.25, pauseAtTurnSeconds: 0.18 },
      behavior: "float", contactDamage: 1, canBeBouncedOn: true, scoreValue: 450,
    },
    {
      id: "enemy-frost-beetle-01", kind: "tin_beetle", position: { x: 34, y: 13.55, z: 219 },
      colliderSize: { x: 1.45, y: 1.1, z: 1.25 }, patrol: { axis: "x", minimum: 26, maximum: 43, speed: 2.8, pauseAtTurnSeconds: 0.1 },
      behavior: "charge", contactDamage: 1, canBeBouncedOn: true, scoreValue: 500,
    },
    {
      id: "enemy-cocoa-crumb-01", kind: "crumb_trundler", position: { x: -14, y: 11.65, z: 242 },
      colliderSize: { x: 1.25, y: 1.3, z: 1.25 }, patrol: { axis: "z", minimum: 236, maximum: 249, speed: 2.15, pauseAtTurnSeconds: 0.18 },
      behavior: "walk", contactDamage: 1, canBeBouncedOn: true, scoreValue: 350,
    },
    {
      id: "enemy-cocoa-beetle-01", kind: "tin_beetle", position: { x: -20, y: 11.55, z: 247 },
      colliderSize: { x: 1.45, y: 1.1, z: 1.25 }, patrol: { axis: "x", minimum: -24, maximum: -10, speed: 3, pauseAtTurnSeconds: 0.08 },
      behavior: "charge", contactDamage: 1, canBeBouncedOn: true, scoreValue: 550,
    },
    {
      id: "enemy-moon-cloud-01", kind: "cloud_mite", position: { x: -20, y: 14.1, z: 275 },
      colliderSize: { x: 1.35, y: 1.35, z: 1.35 }, patrol: { axis: "x", minimum: -28, maximum: -14, speed: 2.55, pauseAtTurnSeconds: 0.12 },
      behavior: "float", contactDamage: 1, canBeBouncedOn: true, scoreValue: 600,
    },
    {
      id: "enemy-moon-puff-01", kind: "spring_puff", position: { x: 34, y: 16.7, z: 280 },
      colliderSize: { x: 1.2, y: 1.4, z: 1.2 }, patrol: { axis: "z", minimum: 276, maximum: 292, speed: 2.45, pauseAtTurnSeconds: 0.12 },
      behavior: "hop", contactDamage: 1, canBeBouncedOn: true, scoreValue: 650,
    },
  ],
  collectibles: [
    ...COINS,
    ...EXPEDITION_COINS,
    {
      id: "star-medal-01-garden",
      kind: "star_medal",
      medalNumber: 1,
      position: { x: -1, y: 3.2, z: 16 },
      pickupRadius: 1.1,
      spinRadiansPerSecond: 1.8,
      scoreValue: 1000,
    },
    {
      id: "star-medal-02-terrace",
      kind: "star_medal",
      medalNumber: 2,
      position: { x: 53, y: 9.3, z: 54 },
      pickupRadius: 1.1,
      spinRadiansPerSecond: 1.8,
      scoreValue: 1000,
    },
    {
      id: "star-medal-03-north",
      kind: "star_medal",
      medalNumber: 3,
      position: { x: -31, y: 6.1, z: 83 },
      pickupRadius: 1.1,
      spinRadiansPerSecond: 1.8,
      scoreValue: 1000,
    },
    {
      id: "star-medal-04-frost-secret", kind: "star_medal", medalNumber: 4,
      position: { x: 80, y: 14.1, z: 190 }, pickupRadius: 1.1, spinRadiansPerSecond: 1.8, scoreValue: 1400,
    },
    {
      id: "star-medal-05-cocoa-loft", kind: "star_medal", medalNumber: 5,
      position: { x: -10, y: 16.5, z: 251 }, pickupRadius: 1.1, spinRadiansPerSecond: 1.8, scoreValue: 1600,
    },
    {
      id: "moon-shard-01-meadow", kind: "moon_shard", shardNumber: 1,
      position: { x: -55, y: 2.2, z: -33 }, pickupRadius: 0.95, spinRadiansPerSecond: 2.2, scoreValue: 750,
    },
    {
      id: "moon-shard-02-clockwork", kind: "moon_shard", shardNumber: 2,
      position: { x: 86, y: 6.2, z: 96 }, pickupRadius: 0.95, spinRadiansPerSecond: 2.2, scoreValue: 750,
    },
    {
      id: "moon-shard-03-sky", kind: "moon_shard", shardNumber: 3,
      position: { x: 11.3, y: 13.9, z: 140 }, pickupRadius: 0.95, spinRadiansPerSecond: 2.2, scoreValue: 750,
    },
    {
      id: "moon-shard-04-frost", kind: "moon_shard", shardNumber: 4,
      position: { x: 42, y: 14.4, z: 219 }, pickupRadius: 0.95, spinRadiansPerSecond: 2.2, scoreValue: 750,
    },
    {
      id: "moon-shard-05-moon", kind: "moon_shard", shardNumber: 5,
      position: { x: 42, y: 20, z: 290 }, pickupRadius: 0.95, spinRadiansPerSecond: 2.2, scoreValue: 750,
    },
  ],
  hazards: [
    {
      id: "hazard-water-basin",
      kind: "water",
      position: { x: 10, y: -3.2, z: 120 },
      size: { x: 230, y: 2, z: 390 },
      damage: 1,
      instantRespawn: true,
      active: true,
      visual: "shimmering_water",
    },
    {
      id: "hazard-spikes-lawn-01",
      kind: "spikes",
      position: { x: -5, y: 0.35, z: 4 },
      size: { x: 3.4, y: 0.7, z: 3.4 },
      damage: 1,
      instantRespawn: false,
      active: true,
      visual: "felt_spikes",
    },
    {
      id: "hazard-spikes-workshop-01",
      kind: "spikes",
      position: { x: 48, y: 0.35, z: 19 },
      size: { x: 3.8, y: 0.7, z: 4.5 },
      damage: 1,
      instantRespawn: false,
      active: true,
      visual: "felt_spikes",
    },
    {
      id: "hazard-spikes-terrace-01",
      kind: "spikes",
      position: { x: 35, y: 6.35, z: 42 },
      size: { x: 4.5, y: 0.7, z: 3.2 },
      damage: 1,
      instantRespawn: false,
      active: true,
      visual: "felt_spikes",
    },
    {
      id: "hazard-spikes-final-01",
      kind: "spikes",
      position: { x: 27, y: 3.35, z: 72 },
      size: { x: 4.5, y: 0.7, z: 3.4 },
      damage: 1,
      instantRespawn: false,
      active: true,
      visual: "felt_spikes",
    },
    {
      id: "hazard-spikes-clockwork-01",
      kind: "spikes",
      position: { x: 84, y: 3.35, z: 100 },
      size: { x: 4.2, y: 0.7, z: 4.2 },
      damage: 1,
      instantRespawn: false,
      active: true,
      visual: "felt_spikes",
    },
    {
      id: "hazard-spikes-wind-roost-01",
      kind: "spikes",
      position: { x: 70, y: 9.35, z: 128 },
      size: { x: 5.2, y: 0.7, z: 3.8 },
      damage: 1,
      instantRespawn: false,
      active: true,
      visual: "felt_spikes",
    },
    {
      id: "hazard-spikes-citadel-01",
      kind: "spikes",
      position: { x: 21, y: 9.35, z: 151 },
      size: { x: 4.8, y: 0.7, z: 4 },
      damage: 1,
      instantRespawn: false,
      active: true,
      visual: "felt_spikes",
    },
    {
      id: "hazard-steam-clockwork-01", kind: "steam",
      position: { x: 78, y: 5.2, z: 104 }, size: { x: 3.2, y: 4.4, z: 3.2 },
      damage: 1, instantRespawn: false, active: true, visual: "steam_jet",
      schedule: { periodSeconds: 3.2, activeSeconds: 1.25, phaseSeconds: 0.35 },
    },
    {
      id: "hazard-steam-clockwork-02", kind: "steam",
      position: { x: 83, y: 5.2, z: 108 }, size: { x: 3.2, y: 4.4, z: 3.2 },
      damage: 1, instantRespawn: false, active: true, visual: "steam_jet",
      schedule: { periodSeconds: 3.2, activeSeconds: 1.25, phaseSeconds: 1.95 },
    },
    {
      id: "hazard-frost-pulse-01", kind: "spikes",
      position: { x: 42, y: 9.35, z: 185 }, size: { x: 3.8, y: 0.7, z: 3.8 },
      damage: 1, instantRespawn: false, active: true, visual: "felt_spikes",
      schedule: { periodSeconds: 2.8, activeSeconds: 1.15, phaseSeconds: 0.1 },
    },
    {
      id: "hazard-frost-pulse-02", kind: "spikes",
      position: { x: 57, y: 9.35, z: 195 }, size: { x: 3.8, y: 0.7, z: 3.8 },
      damage: 1, instantRespawn: false, active: true, visual: "felt_spikes",
      schedule: { periodSeconds: 2.8, activeSeconds: 1.15, phaseSeconds: 1.5 },
    },
    {
      id: "hazard-steam-cocoa-01", kind: "steam",
      position: { x: 8, y: 14.2, z: 234 }, size: { x: 3.2, y: 5, z: 3.2 },
      damage: 1, instantRespawn: false, active: true, visual: "steam_jet",
      schedule: { periodSeconds: 3, activeSeconds: 1.2, phaseSeconds: 0 },
    },
    {
      id: "hazard-steam-cocoa-02", kind: "steam",
      position: { x: -3, y: 14.2, z: 239 }, size: { x: 3.2, y: 5, z: 3.2 },
      damage: 1, instantRespawn: false, active: true, visual: "steam_jet",
      schedule: { periodSeconds: 3, activeSeconds: 1.2, phaseSeconds: 1.5 },
    },
    {
      id: "hazard-cocoa-lava-field", kind: "lava",
      position: { x: -30, y: 8, z: 258 }, size: { x: 55, y: 1.6, z: 37 },
      damage: 1, instantRespawn: true, active: true, visual: "molten_cocoa",
    },
    {
      id: "hazard-lava-geyser-01", kind: "lava",
      position: { x: -35, y: 12.8, z: 255 }, size: { x: 3.5, y: 6, z: 3.5 },
      damage: 1, instantRespawn: false, active: true, visual: "molten_cocoa",
      schedule: { periodSeconds: 3.6, activeSeconds: 1.1, phaseSeconds: 0.4 },
    },
    {
      id: "hazard-lava-geyser-02", kind: "lava",
      position: { x: -31, y: 13.5, z: 266 }, size: { x: 3.5, y: 6, z: 3.5 },
      damage: 1, instantRespawn: false, active: true, visual: "molten_cocoa",
      schedule: { periodSeconds: 3.6, activeSeconds: 1.1, phaseSeconds: 2.2 },
    },
    {
      id: "hazard-clockwork-saw-01", kind: "spikes",
      position: { x: 78, y: 4.1, z: 103 }, size: { x: 3, y: 2.1, z: 1.4 },
      damage: 1, instantRespawn: true, active: true, visual: "invisible",
    },
    {
      id: "hazard-world-void",
      kind: "void",
      position: { x: 10, y: -12, z: 120 },
      size: { x: 250, y: 2, z: 410 },
      damage: 99,
      instantRespawn: true,
      active: true,
      visual: "invisible",
    },
  ],
  checkpoints: [
    {
      id: "checkpoint-sun-lawn",
      order: 1,
      label: "向日草坪",
      position: { x: 3, y: 1.5, z: 8 },
      size: { x: 3.2, y: 3, z: 3.2 },
      respawnPosition: { x: 1, y: 1.05, z: 5 },
      facingYawRadians: 0,
      visual: "sun_pinwheel_flag",
    },
    {
      id: "checkpoint-high-terrace",
      order: 2,
      label: "云端阶庭",
      position: { x: 44, y: 7.5, z: 39 },
      size: { x: 3.2, y: 3, z: 3.2 },
      respawnPosition: { x: 43, y: 7.05, z: 38 },
      facingYawRadians: 0,
      visual: "sun_pinwheel_flag",
    },
    {
      id: "checkpoint-north-landing",
      order: 3,
      label: "风带终站",
      position: { x: -23, y: 4.5, z: 71 },
      size: { x: 3.2, y: 3, z: 3.2 },
      respawnPosition: { x: -23, y: 4.05, z: 69 },
      facingYawRadians: 0,
      visual: "sun_pinwheel_flag",
    },
    {
      id: "checkpoint-clockwork-harbor",
      order: 4,
      label: "齿轮风港",
      position: { x: 74, y: 4.5, z: 99 },
      size: { x: 3.2, y: 3, z: 3.2 },
      respawnPosition: { x: 74, y: 3.75, z: 101 },
      facingYawRadians: 0,
      visual: "sun_pinwheel_flag",
    },
    {
      id: "checkpoint-frost-gate", order: 5, label: "霜晶谷门",
      position: { x: 18, y: 10.5, z: 170 }, size: { x: 3.2, y: 3, z: 3.2 },
      respawnPosition: { x: 18, y: 10.05, z: 168 }, facingYawRadians: 0, visual: "sun_pinwheel_flag",
    },
    {
      id: "checkpoint-cocoa-furnace", order: 6, label: "可可熔炉",
      position: { x: -17, y: 12.5, z: 240 }, size: { x: 3.2, y: 3, z: 3.2 },
      respawnPosition: { x: -17, y: 12.05, z: 241 }, facingYawRadians: Math.PI, visual: "sun_pinwheel_flag",
    },
  ],
  decorations: [
    { id: "sign-start", kind: "direction_sign", position: { x: -53, y: 0.8, z: -35 }, scale: { x: 1, y: 1, z: 1 }, yawRadians: 0.2, label: "绵风庭院 →" },
    { id: "tree-start-01", kind: "felt_tree", position: { x: -52, y: 0, z: -47 }, scale: { x: 1.35, y: 1.35, z: 1.35 }, yawRadians: 0, color: "#FFB34C" },
    { id: "tree-start-02", kind: "puff_tree", position: { x: -43, y: 0, z: -47 }, scale: { x: 1.05, y: 1.05, z: 1.05 }, yawRadians: 0.7, color: "#8CE070" },
    { id: "flowers-start", kind: "toy_flower_patch", position: { x: -47, y: 0.12, z: -34 }, scale: { x: 1.5, y: 1, z: 1.5 }, yawRadians: 0, color: "#FFF6E0" },
    { id: "pinwheel-meadow", kind: "pinwheel", position: { x: -19, y: 0, z: -40 }, scale: { x: 1, y: 1, z: 1 }, yawRadians: 0.4, color: "#FF795C" },
    { id: "bush-meadow-01", kind: "cloud_bush", position: { x: -8, y: 0, z: -41 }, scale: { x: 1.3, y: 0.9, z: 1.1 }, yawRadians: 0, color: "#2EAA4B" },
    { id: "sign-bend", kind: "direction_sign", position: { x: -12, y: 0.8, z: -25 }, scale: { x: 0.9, y: 0.9, z: 0.9 }, yawRadians: -0.3, label: "花路 ↑" },
    { id: "flowers-bend", kind: "toy_flower_patch", position: { x: -1, y: 0.12, z: -20 }, scale: { x: 1.4, y: 1, z: 1.4 }, yawRadians: 0.2, color: "#FFD760" },
    { id: "tree-lawn-01", kind: "puff_tree", position: { x: 9, y: 0, z: -5 }, scale: { x: 1.25, y: 1.25, z: 1.25 }, yawRadians: 0, color: "#FF9B57" },
    { id: "tree-lawn-02", kind: "felt_tree", position: { x: -5, y: 0, z: 8 }, scale: { x: 1.15, y: 1.15, z: 1.15 }, yawRadians: 1, color: "#FFE15A" },
    { id: "block-garden-01", kind: "toy_block_stack", position: { x: 15, y: 0, z: 20 }, scale: { x: 1.2, y: 1.2, z: 1.2 }, yawRadians: 0.12, color: "#F18B45" },
    { id: "windsock-workshop", kind: "wind_sock", position: { x: 49, y: 0, z: 10 }, scale: { x: 1.25, y: 1.25, z: 1.25 }, yawRadians: -0.6, color: "#FF655D" },
    { id: "block-workshop-01", kind: "toy_block_stack", position: { x: 37, y: 0, z: 9 }, scale: { x: 1, y: 1, z: 1 }, yawRadians: 0, color: "#4BB9E8" },
    { id: "banner-stairs", kind: "sun_banner", position: { x: 34, y: 1.2, z: 25 }, scale: { x: 1, y: 1, z: 1 }, yawRadians: 0, color: "#FFCE45" },
    { id: "tree-terrace-01", kind: "felt_tree", position: { x: 51, y: 6, z: 39 }, scale: { x: 1.2, y: 1.2, z: 1.2 }, yawRadians: 0.5, color: "#FFA552" },
    { id: "bush-terrace-01", kind: "cloud_bush", position: { x: 49, y: 6, z: 55 }, scale: { x: 1.3, y: 0.9, z: 1.3 }, yawRadians: 0, color: "#2EAA4B" },
    { id: "sign-terrace", kind: "direction_sign", position: { x: 30, y: 6.8, z: 47 }, scale: { x: 0.9, y: 0.9, z: 0.9 }, yawRadians: Math.PI, label: "穿过浮空板 ←" },
    { id: "tree-orchard-01", kind: "puff_tree", position: { x: 5, y: 6, z: 41 }, scale: { x: 1.15, y: 1.15, z: 1.15 }, yawRadians: 0.2, color: "#FF8D62" },
    { id: "tree-orchard-02", kind: "felt_tree", position: { x: -6, y: 6, z: 43 }, scale: { x: 1.3, y: 1.3, z: 1.3 }, yawRadians: 0.8, color: "#FFD659" },
    { id: "pinwheel-tube", kind: "pinwheel", position: { x: -9, y: 6, z: 55 }, scale: { x: 1.1, y: 1.1, z: 1.1 }, yawRadians: 0.5, color: "#61D8EF" },
    { id: "flowers-north", kind: "toy_flower_patch", position: { x: -29, y: 3.12, z: 70 }, scale: { x: 1.6, y: 1, z: 1.6 }, yawRadians: 0, color: "#FFF3DF" },
    { id: "tree-north-01", kind: "puff_tree", position: { x: -30, y: 3, z: 80 }, scale: { x: 1.2, y: 1.2, z: 1.2 }, yawRadians: 0, color: "#FFAE52" },
    { id: "sign-final", kind: "direction_sign", position: { x: 8, y: 3.8, z: 82 }, scale: { x: 1, y: 1, z: 1 }, yawRadians: 0.1, label: "齿轮风港 →" },
    { id: "banner-goal-01", kind: "sun_banner", position: { x: 42, y: 3, z: 87 }, scale: { x: 1.2, y: 1.2, z: 1.2 }, yawRadians: 0, color: "#FFCE45" },
    { id: "banner-goal-02", kind: "sun_banner", position: { x: 42, y: 3, z: 68 }, scale: { x: 1.2, y: 1.2, z: 1.2 }, yawRadians: Math.PI, color: "#FF8F52" },
    { id: "flowers-goal", kind: "toy_flower_patch", position: { x: 48, y: 3.12, z: 74 }, scale: { x: 2, y: 1, z: 1.7 }, yawRadians: 0, color: "#FFF4D7" },
    { id: "sign-clockwork", kind: "direction_sign", position: { x: 71, y: 3.8, z: 96 }, scale: { x: 1, y: 1, z: 1 }, yawRadians: 0.55, label: "弹簧鼓台 ↑" },
    { id: "block-clockwork-01", kind: "toy_block_stack", position: { x: 84, y: 3, z: 108 }, scale: { x: 1.15, y: 1.15, z: 1.15 }, yawRadians: 0.4, color: "#5DD7E9" },
    { id: "windsock-clockwork", kind: "wind_sock", position: { x: 70, y: 3, z: 108 }, scale: { x: 1.35, y: 1.35, z: 1.35 }, yawRadians: -0.45, color: "#FF765D" },
    { id: "banner-clockwork-01", kind: "sun_banner", position: { x: 86, y: 3, z: 96 }, scale: { x: 1.15, y: 1.15, z: 1.15 }, yawRadians: 0, color: "#FFCE45" },
    { id: "pinwheel-wind-roost-01", kind: "pinwheel", position: { x: 84, y: 9, z: 136 }, scale: { x: 1.4, y: 1.4, z: 1.4 }, yawRadians: 0.3, color: "#66E4EF" },
    { id: "pinwheel-wind-roost-02", kind: "pinwheel", position: { x: 68, y: 9, z: 137 }, scale: { x: 1.25, y: 1.25, z: 1.25 }, yawRadians: -0.5, color: "#FFF089" },
    { id: "sign-wind-gauntlet", kind: "direction_sign", position: { x: 67, y: 9.8, z: 140 }, scale: { x: 1, y: 1, z: 1 }, yawRadians: Math.PI, label: "逆风浮桥 ←" },
    { id: "tree-citadel-01", kind: "puff_tree", position: { x: 9, y: 9, z: 153 }, scale: { x: 1.25, y: 1.25, z: 1.25 }, yawRadians: 0.4, color: "#FFAA55" },
    { id: "tree-citadel-02", kind: "felt_tree", position: { x: 25, y: 9, z: 138 }, scale: { x: 1.2, y: 1.2, z: 1.2 }, yawRadians: 0.8, color: "#FFE15A" },
    { id: "banner-citadel-01", kind: "sun_banner", position: { x: 11, y: 9, z: 157 }, scale: { x: 1.3, y: 1.3, z: 1.3 }, yawRadians: 0, color: "#FFCE45" },
    { id: "banner-citadel-02", kind: "sun_banner", position: { x: 26, y: 9, z: 157 }, scale: { x: 1.3, y: 1.3, z: 1.3 }, yawRadians: Math.PI, color: "#FF8F52" },
    { id: "gear-clockwork-01", kind: "clockwork_gear", position: { x: 70, y: 3, z: 99 }, scale: { x: 1.4, y: 1.4, z: 1.4 }, yawRadians: 0.2, color: "#F5B94A" },
    { id: "gear-clockwork-02", kind: "clockwork_gear", position: { x: 85, y: 3, z: 103 }, scale: { x: 1.1, y: 1.1, z: 1.1 }, yawRadians: -0.4, color: "#8ED7E6" },
    { id: "crystal-frost-gate-01", kind: "frost_crystal", position: { x: 10, y: 9, z: 172 }, scale: { x: 1.35, y: 1.8, z: 1.35 }, yawRadians: 0.2, color: "#8FEAFF" },
    { id: "crystal-frost-gate-02", kind: "frost_crystal", position: { x: 25, y: 9, z: 169 }, scale: { x: 1, y: 1.4, z: 1 }, yawRadians: 0.8, color: "#C1B7FF" },
    { id: "crystal-cavern-01", kind: "frost_crystal", position: { x: 65, y: 9, z: 188 }, scale: { x: 1.4, y: 2, z: 1.4 }, yawRadians: -0.5, color: "#B5F5FF" },
    { id: "crystal-summit-01", kind: "frost_crystal", position: { x: 29, y: 13, z: 214 }, scale: { x: 1.6, y: 2.2, z: 1.6 }, yawRadians: 0.3, color: "#9CA9FF" },
    { id: "sign-frost", kind: "direction_sign", position: { x: 16, y: 9.8, z: 164 }, scale: { x: 1, y: 1, z: 1 }, yawRadians: 0, label: "霜晶谷 ↑" },
    { id: "arch-cocoa-entry", kind: "cocoa_arch", position: { x: 25, y: 12.2, z: 229 }, scale: { x: 1.5, y: 1.5, z: 1.5 }, yawRadians: -0.7, color: "#8C4B2E" },
    { id: "vent-cocoa-01", kind: "lava_vent", position: { x: -9, y: 11, z: 247 }, scale: { x: 1.1, y: 1.1, z: 1.1 }, yawRadians: 0, color: "#FF6B3D" },
    { id: "vent-cocoa-02", kind: "lava_vent", position: { x: -24, y: 11, z: 240 }, scale: { x: 1.3, y: 1.3, z: 1.3 }, yawRadians: 0, color: "#FF9A45" },
    { id: "gear-cocoa-01", kind: "clockwork_gear", position: { x: -19, y: 11, z: 249 }, scale: { x: 1.5, y: 1.5, z: 1.5 }, yawRadians: 0.4, color: "#D9823C" },
    { id: "obelisk-moon-entry-01", kind: "moon_obelisk", position: { x: -28, y: 13, z: 271 }, scale: { x: 1.2, y: 1.5, z: 1.2 }, yawRadians: 0.2, color: "#A9B7FF" },
    { id: "obelisk-moon-entry-02", kind: "moon_obelisk", position: { x: -17, y: 13, z: 278 }, scale: { x: 1, y: 1.25, z: 1 }, yawRadians: -0.5, color: "#E1D8FF" },
    { id: "lantern-moon-01", kind: "floating_lantern", position: { x: -5, y: 18, z: 275 }, scale: { x: 1, y: 1, z: 1 }, yawRadians: 0, color: "#FFF0A8" },
    { id: "lantern-moon-02", kind: "floating_lantern", position: { x: 9, y: 19, z: 291 }, scale: { x: 1.1, y: 1.1, z: 1.1 }, yawRadians: 0, color: "#B9F2FF" },
    { id: "lantern-moon-03", kind: "floating_lantern", position: { x: 25, y: 20, z: 275 }, scale: { x: 1, y: 1, z: 1 }, yawRadians: 0, color: "#FFF0A8" },
    { id: "obelisk-temple-01", kind: "moon_obelisk", position: { x: 26, y: 16, z: 293 }, scale: { x: 1.4, y: 1.8, z: 1.4 }, yawRadians: 0.1, color: "#C5C9FF" },
    { id: "obelisk-temple-02", kind: "moon_obelisk", position: { x: 45, y: 16, z: 293 }, scale: { x: 1.4, y: 1.8, z: 1.4 }, yawRadians: -0.1, color: "#C5C9FF" },
  ],
  assetProps: [
    { id: "asset-clockwork-pipe-01", kind: "pipe", position: { x: 71, y: 3, z: 109 }, scale: { x: 2, y: 2, z: 2 }, yawRadians: 0.5, animation: "none" },
    { id: "asset-clockwork-barrel-01", kind: "barrel", position: { x: 84, y: 3, z: 97 }, scale: { x: 1.3, y: 1.3, z: 1.3 }, yawRadians: 0.25, animation: "none" },
    { id: "asset-clockwork-saw-01", kind: "saw", position: { x: 78, y: 4.1, z: 103 }, scale: { x: 1.4, y: 1.4, z: 1.4 }, yawRadians: Math.PI / 2, animation: "spin" },
    { id: "asset-frost-tree-01", kind: "tree-pine-snow", position: { x: 11, y: 9, z: 179 }, scale: { x: 1.6, y: 1.6, z: 1.6 }, yawRadians: 0.3, animation: "none" },
    { id: "asset-frost-tree-02", kind: "tree-pine-snow", position: { x: 63, y: 9, z: 200 }, scale: { x: 1.4, y: 1.4, z: 1.4 }, yawRadians: -0.4, animation: "none" },
    { id: "asset-frost-chest", kind: "chest", position: { x: 80, y: 12.3, z: 190 }, scale: { x: 1.2, y: 1.2, z: 1.2 }, yawRadians: -0.7, animation: "bob" },
    { id: "asset-conveyor-01", kind: "conveyor-belt", position: { x: 15, y: 12.05, z: 233 }, scale: { x: 4.8, y: 1.2, z: 2.2 }, yawRadians: Math.PI / 2, animation: "none" },
    { id: "asset-conveyor-02", kind: "conveyor-belt", position: { x: 0, y: 12.05, z: 238 }, scale: { x: 4.8, y: 1.2, z: 2.2 }, yawRadians: Math.PI / 2, animation: "none" },
    { id: "asset-cocoa-pipe", kind: "pipe", position: { x: -23, y: 11, z: 237 }, scale: { x: 2.2, y: 2.2, z: 2.2 }, yawRadians: -0.4, animation: "none" },
    { id: "asset-lava-rocks-01", kind: "rocks", position: { x: -29, y: 11.05, z: 252 }, scale: { x: 2.1, y: 1.2, z: 2.1 }, yawRadians: 0.4, animation: "none" },
    { id: "asset-moon-mushrooms", kind: "mushrooms", position: { x: -27, y: 13, z: 279 }, scale: { x: 1.5, y: 1.5, z: 1.5 }, yawRadians: 0.8, animation: "none" },
    { id: "asset-temple-flag", kind: "flag", position: { x: 48, y: 16, z: 278 }, scale: { x: 2, y: 2, z: 2 }, yawRadians: Math.PI, animation: "none" },
  ],
  criticalRoute: [
    { id: "route-start", position: { x: -55, y: 0, z: -42 }, hint: "从起点广场向东穿过跳石", expectedDirection: "east" },
    { id: "route-bend", position: { x: -8, y: 0, z: -25 }, hint: "沿黄色绒路向北转入花庭", expectedDirection: "north" },
    { id: "route-east-crossing", position: { x: 20, y: 0, z: 16 }, hint: "借助浮空板向东抵达工坊", expectedDirection: "east" },
    { id: "route-climb", position: { x: 43, y: 0, z: 25 }, hint: "走坡道或台阶向北攀上高台", expectedDirection: "up" },
    { id: "route-west-crossing", position: { x: 28, y: 6, z: 52 }, hint: "在高台北侧转向西边果园", expectedDirection: "west" },
    { id: "route-air-tube", position: { x: -7, y: 6, z: 58 }, hint: "进入透明风带管向北滑行", expectedDirection: "north" },
    { id: "route-final", position: { x: -10, y: 3, z: 78 }, hint: "越过石路后向东穿过旧日庭院", expectedDirection: "east" },
    { id: "route-clockwork", position: { x: 58, y: 3, z: 88 }, hint: "沿齿轮跳石抵达第四检查点", expectedDirection: "east" },
    { id: "route-boost", position: { x: 78, y: 3, z: 109 }, hint: "踩中弹簧鼓台飞上风巢，移动升降台可作为稳妥路线", expectedDirection: "up" },
    { id: "route-wind", position: { x: 66, y: 9, z: 141 }, hint: "顶着横风连续跳过三组浮空机关", expectedDirection: "west" },
    { id: "route-citadel", position: { x: 28, y: 9, z: 147 }, hint: "穿过太阳堡，继续向北进入霜晶谷", expectedDirection: "north" },
    { id: "route-frost-gate", position: { x: 18, y: 9, z: 168 }, hint: "在冰面上提前转向，避开交替伸缩的晶刺", expectedDirection: "north" },
    { id: "route-frost-secret", position: { x: 66, y: 9, z: 188 }, hint: "弹上右侧移动冰台可发现高速风带捷径", expectedDirection: "east" },
    { id: "route-crystal-climb", position: { x: 58, y: 9, z: 202 }, hint: "沿晶体阶梯或升降台攀上霜晶峰", expectedDirection: "up" },
    { id: "route-cocoa-conveyor", position: { x: 24, y: 12, z: 229 }, hint: "逆着货运带前进，并观察蒸汽喷口节拍", expectedDirection: "west" },
    { id: "route-molten-hop", position: { x: -25, y: 11, z: 248 }, hint: "连续踏过熔岩石阵，喷泉熄灭时起跳", expectedDirection: "north" },
    { id: "route-moon-orbit", position: { x: -22, y: 13, z: 274 }, hint: "借月轨浮台穿过侧风，保持连续跳跃", expectedDirection: "east" },
    { id: "route-moon-temple", position: { x: 26, y: 16, z: 283 }, hint: "登上月光神殿，穿过最终远征门", expectedDirection: "east" },
  ],
  goal: {
    id: "goal-moon-gate",
    name: "奶油月光门",
    visual: "sun_gate",
    position: { x: 44, y: 18.5, z: 284 },
    size: { x: 5, y: 5, z: 3 },
    requiredStarMedals: 0,
    celebrationSeconds: 4.5,
    facingYawRadians: Math.PI / 2,
  },
} as const satisfies World3DDefinition;
