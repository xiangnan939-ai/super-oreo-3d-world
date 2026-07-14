import { WORLD_3D } from "./world3d.ts";
import type {
  ConveyorVelocity3D,
  HazardScheduleDefinition3D,
  LevelDefinition3D,
  PlatformSurface3D,
} from "./simulation3d.ts";

interface AuthoredPlatformGameplay {
  readonly surface?: PlatformSurface3D;
  readonly conveyorVelocity?: Partial<ConveyorVelocity3D>;
}

interface AuthoredHazardGameplay {
  readonly schedule?: HazardScheduleDefinition3D;
}

function platformGameplay(value: unknown) {
  const authored = value as AuthoredPlatformGameplay;
  return {
    surface: authored.surface,
    conveyorVelocity: authored.conveyorVelocity
      ? {
          x: authored.conveyorVelocity.x,
          z: authored.conveyorVelocity.z,
        }
      : undefined,
  };
}

function hazardGameplay(value: unknown) {
  const authored = value as AuthoredHazardGameplay;
  return {
    schedule: authored.schedule
      ? {
          periodSeconds: authored.schedule.periodSeconds,
          activeSeconds: authored.schedule.activeSeconds,
          phaseSeconds: authored.schedule.phaseSeconds,
        }
      : undefined,
  };
}

function box3D(volume: { position: { x: number; y: number; z: number }; size: { x: number; y: number; z: number } }) {
  return {
    x: volume.position.x,
    y: volume.position.y,
    z: volume.position.z,
    width: volume.size.x,
    height: volume.size.y,
    depth: volume.size.z,
  };
}

/** Convert authored visual world data into deterministic simulation volumes. */
export function toSimulationLevel(): LevelDefinition3D {
  const staticPlatforms = WORLD_3D.platforms
    .filter((platform) => String(platform.collision) !== "none")
    .map((platform) => ({
    id: platform.id,
    ...box3D(platform),
    oneWay: String(platform.collision) === "one_way",
    ...platformGameplay(platform),
  }));
  const movingPlatforms = WORLD_3D.movingPlatforms.map((platform) => ({
    id: platform.id,
    ...box3D(platform),
    oneWay: false,
    ...platformGameplay(platform),
    motion: {
      x: platform.path.to.x - platform.path.from.x,
      y: platform.path.to.y - platform.path.from.y,
      z: platform.path.to.z - platform.path.from.z,
      period: Math.max(1, 2 * (platform.path.travelSeconds + platform.path.waitAtEndsSeconds)),
      phase: platform.path.phase,
      travelSeconds: platform.path.travelSeconds,
      waitAtEndsSeconds: platform.path.waitAtEndsSeconds,
      easing: platform.path.easing,
    },
  }));
  const rampPlatforms = WORLD_3D.ramps.flatMap((ramp) => {
    const segmentCount = Math.max(8, Math.ceil(ramp.rise / 0.25));
    const bottom = Math.min(0, ramp.position.y - ramp.rise / 2 - 2);
    const xAxis = String(ramp.slopeAxis) === "x";
    return Array.from({ length: segmentCount }, (_, index) => {
      const progress = (index + 1) / segmentCount;
      const top = ramp.position.y - ramp.rise / 2 + ramp.rise * progress;
      const alongSize = xAxis ? ramp.size.x : ramp.size.z;
      const alongStart = xAxis
        ? ramp.position.x - ramp.uphillDirection * alongSize / 2
        : ramp.position.z - ramp.uphillDirection * alongSize / 2;
      const along = alongStart + ramp.uphillDirection * alongSize * (index + 0.5) / segmentCount;
      return {
        id: `${ramp.id}-collision-${String(index + 1).padStart(2, "0")}`,
        x: xAxis ? along : ramp.position.x,
        y: (top + bottom) / 2,
        z: xAxis ? ramp.position.z : along,
        width: xAxis ? alongSize / segmentCount + 0.04 : ramp.size.x,
        height: top - bottom,
        depth: xAxis ? ramp.size.z : alongSize / segmentCount + 0.04,
        oneWay: false,
        ...platformGameplay(ramp),
      };
    });
  });
  const fenceBlockers = WORLD_3D.fences
    .filter((fence) => fence.collision)
    .flatMap((fence) => fence.points.slice(0, -1).map((start, index) => {
      const end = fence.points[index + 1];
      return {
        id: `${fence.id}-collision-${index + 1}`,
        x: (start.x + end.x) / 2,
        y: (start.y + end.y) / 2 + fence.height / 2,
        z: (start.z + end.z) / 2,
        width: Math.abs(end.x - start.x) + Math.max(fence.postWidth, fence.railWidth),
        height: fence.height,
        depth: Math.abs(end.z - start.z) + Math.max(fence.postWidth, fence.railWidth),
      };
    }));

  return {
    id: WORLD_3D.metadata.id,
    name: WORLD_3D.metadata.name,
    spawn: { ...WORLD_3D.player.position },
    lives: 5,
    bounds: {
      minX: WORLD_3D.bounds.minimumX,
      maxX: WORLD_3D.bounds.maximumX,
      minZ: WORLD_3D.bounds.minimumZ,
      maxZ: WORLD_3D.bounds.maximumZ,
      killY: WORLD_3D.bounds.deathY,
    },
    platforms: [...staticPlatforms, ...rampPlatforms, ...movingPlatforms],
    blockers: fenceBlockers,
    hazards: WORLD_3D.hazards.map((hazard) => ({
      id: hazard.id,
      ...box3D(hazard),
      active: hazard.active,
      ...hazardGameplay(hazard),
    })),
    collectibles: WORLD_3D.collectibles.map((item) => ({
      id: item.id,
      x: item.position.x,
      y: item.position.y,
      z: item.position.z,
      width: item.pickupRadius * 1.45,
      height: item.pickupRadius * 1.45,
      depth: item.pickupRadius * 1.45,
      value: item.scoreValue,
    })),
    enemies: WORLD_3D.enemies.map((enemy) => ({
      id: enemy.id,
      x: enemy.position.x,
      y: enemy.position.y,
      z: enemy.position.z,
      width: enemy.colliderSize.x,
      height: enemy.colliderSize.y,
      depth: enemy.colliderSize.z,
      speed: enemy.patrol.speed,
      direction: 1,
      patrolAxis: enemy.patrol.axis,
      patrolMin: enemy.patrol.minimum,
      patrolMax: enemy.patrol.maximum,
      behavior: enemy.behavior,
      pauseAtTurnSeconds: enemy.patrol.pauseAtTurnSeconds,
      stompable: enemy.canBeBouncedOn,
      points: enemy.scoreValue,
    })),
    checkpoints: WORLD_3D.checkpoints.map((checkpoint) => ({
      id: checkpoint.id,
      order: checkpoint.order,
      ...box3D(checkpoint),
      respawn: { ...checkpoint.respawnPosition },
    })),
    goal: { id: WORLD_3D.goal.id, ...box3D(WORLD_3D.goal) },
  };
}
