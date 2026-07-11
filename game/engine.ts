import * as THREE from "three";
import { LEVEL_ONE, type LevelDefinition as VisualLevel } from "./level";
import {
  createWorld,
  stepWorld,
  type GameEvent,
  type InputState,
  type LevelDefinition as SimulationLevel,
  type WorldState,
} from "./simulation";

const LOCAL_PLAYER_ID = "local-player";
const NETWORK_TICK_MS = 50;
const HUD_TICK_MS = 90;

export interface EngineHud {
  coins: number;
  totalCoins: number;
  deaths: number;
  elapsedMs: number;
  checkpoint: number;
  finished: boolean;
}

export interface EngineFrame {
  playerId: string;
  name: string;
  skin: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  facing: number;
  action: string;
  tick: number;
}

interface EngineOptions {
  skin: string;
  soundOn: boolean;
  onHud(hud: EngineHud): void;
  onLocalFrame(frame: Omit<EngineFrame, "playerId" | "name" | "skin">): void;
  onFinish(hud: EngineHud): void;
}

interface TouchInput {
  left: boolean;
  right: boolean;
  jump: boolean;
  run: boolean;
}

interface RemoteAvatar {
  group: THREE.Group;
  target: EngineFrame;
  lastSeen: number;
}

const SKIN_COLORS: Record<string, { cream: number; trim: number; boot: number }> = {
  classic: { cream: 0xf5f1df, trim: 0x4ea5df, boot: 0x2b5c8c },
  berry: { cream: 0xff6f91, trim: 0xffd1dc, boot: 0x9f3554 },
  mint: { cream: 0x63e6be, trim: 0xc5fff0, boot: 0x187b6c },
  caramel: { cream: 0xffc857, trim: 0xffefb2, boot: 0xa45b16 },
};

function boxFromVolume(volume: { position: { x: number; y: number }; size: { x: number; y: number } }) {
  return {
    x: volume.position.x,
    y: volume.position.y,
    width: volume.size.x,
    height: volume.size.y,
  };
}

function toSimulationLevel(level: VisualLevel): SimulationLevel {
  const staticPlatforms = level.platforms.map((platform) => ({
    id: platform.id,
    ...boxFromVolume(platform),
    oneWay: platform.collision === "one_way",
  }));
  const obstacles = level.obstacles.map((obstacle) => ({
    id: obstacle.id,
    ...boxFromVolume(obstacle),
    oneWay: false,
  }));
  const movingPlatforms = level.movingPlatforms.map((platform) => ({
    id: platform.id,
    x: platform.path.from.x,
    y: platform.path.from.y,
    width: platform.size.x,
    height: platform.size.y,
    oneWay: false,
    motion: {
      x: platform.path.to.x - platform.path.from.x,
      y: platform.path.to.y - platform.path.from.y,
      period: Math.max(1, 2 * (platform.path.travelSeconds + platform.path.waitAtEndsSeconds)),
      phase: platform.path.phase,
    },
  }));
  return {
    id: level.metadata.id,
    name: level.metadata.name,
    spawn: { x: level.start.position.x, y: level.start.position.y },
    lives: 99,
    bounds: { minX: 0, maxX: level.world.length, killY: level.world.deathY },
    platforms: [...staticPlatforms, ...movingPlatforms, ...obstacles],
    hazards: level.hazards.map((hazard) => ({ id: hazard.id, ...boxFromVolume(hazard) })),
    collectibles: level.collectibles.map((collectible) => ({
      id: collectible.id,
      x: collectible.position.x,
      y: collectible.position.y,
      width: collectible.pickupRadius * 1.55,
      height: collectible.pickupRadius * 1.55,
      value: collectible.scoreValue,
    })),
    enemies: level.enemies.map((enemy) => ({
      id: enemy.id,
      x: enemy.position.x,
      y: enemy.position.y,
      width: enemy.colliderSize.x,
      height: enemy.colliderSize.y,
      speed: enemy.patrol.axis === "x" ? enemy.patrol.speed : 0,
      patrolMinX: enemy.patrol.axis === "x" ? enemy.patrol.minimum : enemy.position.x,
      patrolMaxX: enemy.patrol.axis === "x" ? enemy.patrol.maximum : enemy.position.x,
      stompable: enemy.canBeBouncedOn,
      points: 200,
    })),
    checkpoints: level.checkpoints.map((checkpoint) => ({
      id: checkpoint.id,
      ...boxFromVolume(checkpoint),
      respawn: { x: checkpoint.respawnPosition.x, y: checkpoint.respawnPosition.y },
    })),
    goal: { id: level.goal.id, ...boxFromVolume(level.goal) },
  };
}

class AdventureAudio {
  private context: AudioContext | null = null;
  private enabled: boolean;
  private nextMusicAt = 0;
  private musicStep = 0;

  constructor(enabled: boolean) {
    this.enabled = enabled;
  }

  setEnabled(enabled: boolean) {
    this.enabled = enabled;
    if (!enabled && this.context?.state === "running") void this.context.suspend();
    if (enabled && this.context?.state === "suspended") void this.context.resume();
  }

  unlock() {
    if (!this.enabled) return;
    if (!this.context) {
      const Context = window.AudioContext ?? window.webkitAudioContext;
      if (!Context) return;
      this.context = new Context();
    }
    if (this.context.state === "suspended") void this.context.resume();
  }

  updateMusic(active: boolean) {
    if (!active || !this.enabled || !this.context || this.context.state !== "running") return;
    const now = this.context.currentTime;
    if (now < this.nextMusicAt) return;
    const notes = [261.63, 329.63, 392, 523.25, 392, 329.63, 293.66, 392];
    const bass = [130.81, 146.83, 164.81, 146.83];
    this.tone(notes[this.musicStep % notes.length], 0.08, 0.018, "square", now);
    if (this.musicStep % 2 === 0) this.tone(bass[Math.floor(this.musicStep / 2) % bass.length], 0.12, 0.012, "triangle", now);
    this.musicStep += 1;
    this.nextMusicAt = now + 0.19;
  }

  jump() {
    this.unlock();
    this.sweep(260, 520, 0.11, 0.055, "square");
  }

  collect() {
    this.unlock();
    this.tone(740, 0.055, 0.045, "square");
    if (this.context) this.tone(988, 0.07, 0.035, "square", this.context.currentTime + 0.045);
  }

  stomp() {
    this.unlock();
    this.sweep(180, 330, 0.09, 0.05, "triangle");
  }

  checkpoint() {
    this.unlock();
    if (!this.context) return;
    [523, 659, 784].forEach((frequency, index) => this.tone(frequency, 0.1, 0.035, "triangle", this.context!.currentTime + index * 0.07));
  }

  death() {
    this.unlock();
    this.sweep(360, 90, 0.32, 0.06, "sawtooth");
  }

  finish() {
    this.unlock();
    if (!this.context) return;
    [523, 659, 784, 1047].forEach((frequency, index) => this.tone(frequency, 0.19, 0.05, "square", this.context!.currentTime + index * 0.11));
  }

  close() {
    if (this.context) void this.context.close();
    this.context = null;
  }

  private tone(frequency: number, duration: number, volume: number, type: OscillatorType, when?: number) {
    if (!this.enabled || !this.context) return;
    const start = when ?? this.context.currentTime;
    const oscillator = this.context.createOscillator();
    const gain = this.context.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, start);
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(volume, start + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    oscillator.connect(gain).connect(this.context.destination);
    oscillator.start(start);
    oscillator.stop(start + duration + 0.02);
  }

  private sweep(from: number, to: number, duration: number, volume: number, type: OscillatorType) {
    if (!this.enabled || !this.context) return;
    const start = this.context.currentTime;
    const oscillator = this.context.createOscillator();
    const gain = this.context.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(from, start);
    oscillator.frequency.exponentialRampToValueAtTime(Math.max(1, to), start + duration);
    gain.gain.setValueAtTime(volume, start);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    oscillator.connect(gain).connect(this.context.destination);
    oscillator.start(start);
    oscillator.stop(start + duration + 0.02);
  }
}

declare global {
  interface Window {
    webkitAudioContext?: typeof AudioContext;
  }
}

export class OreoGameEngine {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(48, 1, 0.1, 420);
  private readonly cameraTarget = new THREE.Vector3(8, 2.5, 0);
  private readonly level = LEVEL_ONE;
  private readonly simulationLevel = toSimulationLevel(LEVEL_ONE);
  private world: WorldState = createWorld(this.simulationLevel, LOCAL_PLAYER_ID);
  private readonly worldGroup = new THREE.Group();
  private playerGroup: THREE.Group;
  private playerSkin: string;
  private readonly platformMeshes = new Map<string, THREE.Object3D>();
  private readonly collectibleMeshes = new Map<string, THREE.Object3D>();
  private readonly enemyMeshes = new Map<string, THREE.Object3D>();
  private readonly checkpointMeshes = new Map<string, THREE.Object3D>();
  private readonly remoteAvatars = new Map<string, RemoteAvatar>();
  private readonly clouds: THREE.Group[] = [];
  private readonly decorativeSpinners: THREE.Object3D[] = [];
  private readonly keys = new Set<string>();
  private readonly touch: TouchInput = { left: false, right: false, jump: false, run: false };
  private readonly audio: AdventureAudio;
  private active = false;
  private attract = true;
  private destroyed = false;
  private animationFrame = 0;
  private lastTime = performance.now();
  private lastHudAt = 0;
  private lastNetworkAt = 0;
  private finishedNotified = false;
  private previousJump = false;
  private respawnFlash = 0;
  private readonly onResize = () => this.resize();
  private readonly onKeyDown = (event: KeyboardEvent) => this.handleKey(event, true);
  private readonly onKeyUp = (event: KeyboardEvent) => this.handleKey(event, false);

  constructor(private readonly canvas: HTMLCanvasElement, private readonly options: EngineOptions) {
    this.playerSkin = options.skin;
    this.audio = new AdventureAudio(options.soundOn);
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: "high-performance" });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.08;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.setClearColor(0x000000, 0);
    this.scene.fog = new THREE.Fog(0xc9efff, 28, 92);
    this.scene.add(this.worldGroup);
    this.setupLights();
    this.buildEnvironment();
    this.buildLevel();
    this.playerGroup = this.createCookieCharacter(this.playerSkin, false);
    this.playerGroup.name = "local-player-avatar";
    this.worldGroup.add(this.playerGroup);
    this.camera.position.set(9, 6, 16);
    this.camera.lookAt(this.cameraTarget);
    this.resize();
    window.addEventListener("resize", this.onResize);
    window.addEventListener("keydown", this.onKeyDown, { passive: false });
    window.addEventListener("keyup", this.onKeyUp, { passive: false });
    this.canvas.addEventListener("pointerdown", () => this.audio.unlock());
    this.animationFrame = requestAnimationFrame(this.frame);
  }

  setActive(active: boolean) {
    if (active && !this.active) {
      this.world = createWorld(this.simulationLevel, LOCAL_PLAYER_ID);
      this.finishedNotified = false;
      this.lastHudAt = 0;
      this.lastNetworkAt = 0;
      this.keys.clear();
      Object.assign(this.touch, { left: false, right: false, jump: false, run: false });
      this.resetVisualState();
      this.audio.unlock();
    }
    this.active = active;
  }

  setAttract(attract: boolean) {
    this.attract = attract;
  }

  setSkin(skin: string) {
    if (skin === this.playerSkin) return;
    this.playerSkin = skin;
    const replacement = this.createCookieCharacter(skin, false);
    replacement.position.copy(this.playerGroup.position);
    replacement.rotation.copy(this.playerGroup.rotation);
    this.worldGroup.remove(this.playerGroup);
    this.disposeObject(this.playerGroup);
    this.playerGroup = replacement;
    this.playerGroup.name = "local-player-avatar";
    this.worldGroup.add(this.playerGroup);
  }

  setSoundOn(enabled: boolean) {
    this.audio.setEnabled(enabled);
  }

  setTouchInput(key: keyof TouchInput, pressed: boolean) {
    this.touch[key] = pressed;
    if (pressed) this.audio.unlock();
  }

  setRemotePlayers(frames: Record<string, EngineFrame>) {
    const now = performance.now();
    for (const [id, frame] of Object.entries(frames)) {
      let avatar = this.remoteAvatars.get(id);
      if (!avatar) {
        const group = this.createCookieCharacter(frame.skin, true);
        group.position.set(frame.x, frame.y, -0.35);
        group.name = `remote-${id}`;
        this.worldGroup.add(group);
        avatar = { group, target: frame, lastSeen: now };
        this.remoteAvatars.set(id, avatar);
      }
      avatar.target = frame;
      avatar.lastSeen = now;
    }
    for (const [id, avatar] of this.remoteAvatars) {
      if (!frames[id] && now - avatar.lastSeen > 12_000) {
        this.worldGroup.remove(avatar.group);
        this.disposeObject(avatar.group);
        this.remoteAvatars.delete(id);
      }
    }
  }

  destroy() {
    this.destroyed = true;
    cancelAnimationFrame(this.animationFrame);
    window.removeEventListener("resize", this.onResize);
    window.removeEventListener("keydown", this.onKeyDown);
    window.removeEventListener("keyup", this.onKeyUp);
    this.audio.close();
    this.scene.traverse((object) => this.disposeObjectResources(object));
    this.renderer.dispose();
  }

  private readonly frame = (time: number) => {
    if (this.destroyed) return;
    const dt = Math.min(0.05, Math.max(0, (time - this.lastTime) / 1000));
    this.lastTime = time;
    if (this.active) this.updateGame(dt, time);
    else this.updateAttract(dt, time);
    this.updateScenery(dt, time);
    this.updateRemoteAvatars(dt, time);
    this.renderer.render(this.scene, this.camera);
    this.animationFrame = requestAnimationFrame(this.frame);
  };

  private updateGame(dt: number, time: number) {
    const input = this.currentInput();
    const playerBefore = this.world.players[LOCAL_PLAYER_ID];
    if (input.jump && !this.previousJump && playerBefore?.status === "active") this.audio.jump();
    this.previousJump = Boolean(input.jump);
    this.world = stepWorld(this.world, { [LOCAL_PLAYER_ID]: input }, dt);
    this.handleEvents(this.world.events);
    const player = this.world.players[LOCAL_PLAYER_ID];
    if (!player) return;

    this.playerGroup.visible = player.status !== "dead" || Math.floor(time / 80) % 2 === 0;
    this.playerGroup.position.set(player.x, player.y, 0);
    this.animateCharacter(this.playerGroup, player.vx, player.vy, player.grounded, player.facing, time);
    this.syncWorldMeshes(time);

    const lookAhead = 4.2 * player.facing;
    const desiredX = THREE.MathUtils.clamp(player.x + lookAhead, 6, this.level.world.length - 6);
    const desiredY = THREE.MathUtils.clamp(player.y + 2.5, 2.8, 8);
    this.cameraTarget.lerp(new THREE.Vector3(desiredX, desiredY, 0), 1 - Math.pow(0.001, dt));
    this.camera.position.lerp(new THREE.Vector3(desiredX, desiredY + 2.15, 15.5), 1 - Math.pow(0.004, dt));
    this.camera.lookAt(this.cameraTarget);
    this.audio.updateMusic(true);

    if (time - this.lastHudAt >= HUD_TICK_MS) {
      this.options.onHud(this.makeHud());
      this.lastHudAt = time;
    }
    if (time - this.lastNetworkAt >= NETWORK_TICK_MS) {
      this.options.onLocalFrame({
        x: player.x,
        y: player.y,
        vx: player.vx,
        vy: player.vy,
        facing: player.facing,
        action: player.status === "dead" ? "hurt" : !player.grounded ? (player.vy > 0 ? "jump" : "fall") : Math.abs(player.vx) > 0.3 ? "run" : "idle",
        tick: this.world.tick,
      });
      this.lastNetworkAt = time;
    }
  }

  private updateAttract(dt: number, time: number) {
    const t = time / 1000;
    if (this.attract) {
      this.playerGroup.visible = true;
      this.playerGroup.position.set(11.8, 1.85 + Math.sin(t * 1.6) * 0.12, 0.25);
      this.playerGroup.rotation.y = -0.18 + Math.sin(t * 0.5) * 0.08;
      this.animateCharacter(this.playerGroup, 1.2, Math.cos(t) * 0.2, true, 1, time);
      const target = new THREE.Vector3(10.2 + Math.sin(t * 0.18) * 0.35, 2.7, 0);
      const position = new THREE.Vector3(10.2 + Math.sin(t * 0.18) * 0.5, 5.2, 16.5);
      this.cameraTarget.lerp(target, 1 - Math.pow(0.003, dt));
      this.camera.position.lerp(position, 1 - Math.pow(0.003, dt));
      this.camera.lookAt(this.cameraTarget);
      this.syncWorldMeshes(time);
    }
  }

  private currentInput(): InputState {
    return {
      left: this.keys.has("ArrowLeft") || this.keys.has("KeyA") || this.touch.left,
      right: this.keys.has("ArrowRight") || this.keys.has("KeyD") || this.touch.right,
      jump: this.keys.has("Space") || this.keys.has("ArrowUp") || this.keys.has("KeyW") || this.touch.jump,
      sprint: this.keys.has("ShiftLeft") || this.keys.has("ShiftRight") || this.touch.run,
    };
  }

  private handleKey(event: KeyboardEvent, pressed: boolean) {
    const gameKeys = ["ArrowLeft", "ArrowRight", "ArrowUp", "Space", "KeyA", "KeyD", "KeyW", "ShiftLeft", "ShiftRight"];
    if (!gameKeys.includes(event.code)) return;
    if (this.active) event.preventDefault();
    if (pressed) {
      this.keys.add(event.code);
      this.audio.unlock();
    } else {
      this.keys.delete(event.code);
    }
  }

  private handleEvents(events: GameEvent[]) {
    for (const event of events) {
      switch (event.type) {
        case "collectible":
          this.audio.collect();
          this.burstAt(this.collectibleMeshes.get(event.collectibleId)?.position, 0xffd34d);
          break;
        case "enemy-stomp":
          this.audio.stomp();
          this.burstAt(this.enemyMeshes.get(event.enemyId)?.position, 0x9ce55a);
          break;
        case "checkpoint":
          this.audio.checkpoint();
          this.activateCheckpoint(event.checkpointId);
          break;
        case "death":
          this.audio.death();
          this.respawnFlash = performance.now();
          break;
        case "goal":
          if (!this.finishedNotified) {
            this.finishedNotified = true;
            this.audio.finish();
            const hud = this.makeHud(true);
            this.options.onHud(hud);
            this.options.onFinish(hud);
          }
          break;
        default:
          break;
      }
    }
  }

  private makeHud(finished = this.world.status === "won"): EngineHud {
    const player = this.world.players[LOCAL_PLAYER_ID];
    const checkpointIndex = Math.max(0, this.level.checkpoints.findIndex((checkpoint) => checkpoint.id === player?.checkpointId) + 1);
    return {
      coins: player?.collectibleCount ?? 0,
      totalCoins: this.world.collectibles.length,
      deaths: player?.deaths ?? 0,
      elapsedMs: Math.round(this.world.time * 1000),
      checkpoint: checkpointIndex,
      finished,
    };
  }

  private syncWorldMeshes(time: number) {
    for (const platform of this.world.platforms) {
      const mesh = this.platformMeshes.get(platform.id);
      if (mesh) mesh.position.set(platform.x, platform.y, mesh.position.z);
    }
    for (const collectible of this.world.collectibles) {
      const mesh = this.collectibleMeshes.get(collectible.id);
      if (!mesh) continue;
      mesh.visible = !collectible.collected;
      if (mesh.visible) {
        mesh.rotation.y = time * 0.0024;
        mesh.position.y = collectible.y + Math.sin(time * 0.004 + collectible.x) * 0.12;
      }
    }
    for (const enemy of this.world.enemies) {
      const mesh = this.enemyMeshes.get(enemy.id);
      if (!mesh) continue;
      mesh.visible = enemy.alive;
      mesh.position.x = enemy.x;
      mesh.position.y = enemy.y + Math.sin(time * 0.007 + enemy.x) * 0.05;
      mesh.rotation.y = enemy.direction === 1 ? 0 : Math.PI;
    }
    if (this.respawnFlash > 0 && performance.now() - this.respawnFlash < 280) {
      this.renderer.toneMappingExposure = 1.5;
    } else {
      this.renderer.toneMappingExposure = 1.08;
    }
  }

  private updateRemoteAvatars(dt: number, time: number) {
    for (const avatar of this.remoteAvatars.values()) {
      const factor = 1 - Math.pow(0.0008, dt);
      avatar.group.position.x = THREE.MathUtils.lerp(avatar.group.position.x, avatar.target.x, factor);
      avatar.group.position.y = THREE.MathUtils.lerp(avatar.group.position.y, avatar.target.y, factor);
      this.animateCharacter(avatar.group, avatar.target.vx, avatar.target.vy, avatar.target.action === "idle" || avatar.target.action === "run", avatar.target.facing, time);
    }
  }

  private updateScenery(dt: number, time: number) {
    for (let index = 0; index < this.clouds.length; index += 1) {
      const cloud = this.clouds[index];
      cloud.position.x += dt * (0.18 + index * 0.02);
      if (cloud.position.x > this.level.world.length + 20) cloud.position.x = -25;
    }
    for (const object of this.decorativeSpinners) object.rotation.y += dt * 0.7;
    const sun = this.scene.getObjectByName("sky-sun");
    if (sun) sun.scale.setScalar(1 + Math.sin(time * 0.0015) * 0.025);
  }

  private updateRemoteSkin(group: THREE.Group, skin: string) {
    const palette = SKIN_COLORS[skin] ?? SKIN_COLORS.classic;
    group.traverse((object) => {
      if (object.userData.role === "cream" && object instanceof THREE.Mesh) {
        (object.material as THREE.MeshStandardMaterial).color.setHex(palette.cream);
      }
    });
  }

  private animateCharacter(group: THREE.Group, vx: number, vy: number, grounded: boolean, facing: number, time: number) {
    const stride = Math.sin(time * 0.018 * Math.max(0.55, Math.min(1.7, Math.abs(vx)))) * Math.min(0.7, Math.abs(vx) * 0.08);
    const leftLeg = group.getObjectByName("left-leg");
    const rightLeg = group.getObjectByName("right-leg");
    const leftArm = group.getObjectByName("left-arm");
    const rightArm = group.getObjectByName("right-arm");
    if (leftLeg) leftLeg.rotation.z = grounded ? stride : -0.3;
    if (rightLeg) rightLeg.rotation.z = grounded ? -stride : 0.34;
    if (leftArm) leftArm.rotation.z = grounded ? -stride * 0.7 - 0.18 : -0.85;
    if (rightArm) rightArm.rotation.z = grounded ? stride * 0.7 + 0.18 : 0.85;
    group.rotation.y = THREE.MathUtils.lerp(group.rotation.y, facing < 0 ? -0.23 : 0.23, 0.18);
    group.rotation.z = THREE.MathUtils.lerp(group.rotation.z, grounded ? -vx * 0.012 : THREE.MathUtils.clamp(-vy * 0.018, -0.18, 0.18), 0.13);
  }

  private setupLights() {
    const hemisphere = new THREE.HemisphereLight(0xd8f4ff, 0x7b9560, 2.35);
    this.scene.add(hemisphere);
    const sunlight = new THREE.DirectionalLight(0xfff3c0, 3.2);
    sunlight.position.set(28, 34, 22);
    sunlight.castShadow = true;
    sunlight.shadow.mapSize.set(2048, 2048);
    sunlight.shadow.camera.left = -28;
    sunlight.shadow.camera.right = 28;
    sunlight.shadow.camera.top = 22;
    sunlight.shadow.camera.bottom = -14;
    sunlight.shadow.camera.near = 1;
    sunlight.shadow.camera.far = 100;
    sunlight.shadow.bias = -0.0003;
    this.scene.add(sunlight);
    const fill = new THREE.DirectionalLight(0x71c9ff, 0.7);
    fill.position.set(-12, 8, 10);
    this.scene.add(fill);
  }

  private buildEnvironment() {
    const hillMaterialA = new THREE.MeshStandardMaterial({ color: 0x76c961, roughness: 0.92 });
    const hillMaterialB = new THREE.MeshStandardMaterial({ color: 0x4aa868, roughness: 0.95 });
    for (let x = -8; x < this.level.world.length + 30; x += 15) {
      const hill = new THREE.Mesh(new THREE.ConeGeometry(8 + (x % 4), 11, 16), x % 30 === 0 ? hillMaterialB : hillMaterialA);
      hill.position.set(x, -0.2, -18 - (x % 3));
      hill.scale.z = 0.7;
      this.worldGroup.add(hill);
    }
    const distantGround = new THREE.Mesh(
      new THREE.PlaneGeometry(this.level.world.length + 80, 55),
      new THREE.MeshStandardMaterial({ color: 0x9fdc71, roughness: 1 }),
    );
    distantGround.rotation.x = -Math.PI / 2;
    distantGround.position.set(this.level.world.length / 2, -2.05, -12);
    distantGround.receiveShadow = true;
    this.worldGroup.add(distantGround);

    for (let index = 0; index < 13; index += 1) {
      const cloud = this.createCloud(0.75 + (index % 3) * 0.18);
      cloud.position.set(-10 + index * 16, 8.5 + (index % 4) * 1.2, -9 - (index % 3) * 2.5);
      this.worldGroup.add(cloud);
      this.clouds.push(cloud);
    }

    const sunGroup = new THREE.Group();
    sunGroup.name = "sky-sun";
    const sun = new THREE.Mesh(new THREE.SphereGeometry(2.4, 32, 24), new THREE.MeshBasicMaterial({ color: 0xffef9b, fog: false }));
    sunGroup.add(sun);
    for (let index = 0; index < 12; index += 1) {
      const ray = new THREE.Mesh(new THREE.ConeGeometry(0.18, 1.5, 5), new THREE.MeshBasicMaterial({ color: 0xffe47b, fog: false }));
      const angle = (index / 12) * Math.PI * 2;
      ray.position.set(Math.cos(angle) * 3.25, Math.sin(angle) * 3.25, 0);
      ray.rotation.z = angle - Math.PI / 2;
      sunGroup.add(ray);
    }
    sunGroup.position.set(27, 13.5, -25);
    this.worldGroup.add(sunGroup);
  }

  private buildLevel() {
    for (const platform of this.level.platforms) {
      const object = this.createPlatform(platform.kind, platform.material, platform.size);
      object.position.set(platform.position.x, platform.position.y, platform.position.z);
      object.name = platform.id;
      this.platformMeshes.set(platform.id, object);
      this.worldGroup.add(object);
    }
    for (const platform of this.level.movingPlatforms) {
      const object = this.createPlatform("floating_stone", platform.material, platform.size);
      object.position.set(platform.path.from.x, platform.path.from.y, platform.position.z);
      object.name = platform.id;
      this.platformMeshes.set(platform.id, object);
      this.worldGroup.add(object);
    }
    for (const obstacle of this.level.obstacles) {
      const object = obstacle.kind === "wind_conduit" ? this.createWindConduit(obstacle.size) : this.createSunPillar(obstacle.size);
      object.position.set(obstacle.position.x, obstacle.position.y, obstacle.position.z);
      object.name = obstacle.id;
      this.platformMeshes.set(obstacle.id, object);
      this.worldGroup.add(object);
    }
    for (const collectible of this.level.collectibles) {
      const object = this.createCollectible(collectible.kind);
      object.position.set(collectible.position.x, collectible.position.y, collectible.position.z + 0.15);
      object.name = collectible.id;
      this.collectibleMeshes.set(collectible.id, object);
      this.worldGroup.add(object);
    }
    for (const enemy of this.level.enemies) {
      const object = this.createEnemy(enemy.kind);
      object.position.set(enemy.position.x, enemy.position.y, enemy.position.z);
      object.name = enemy.id;
      this.enemyMeshes.set(enemy.id, object);
      this.worldGroup.add(object);
    }
    for (const hazard of this.level.hazards) {
      if (hazard.kind !== "crystal_spikes") continue;
      const object = this.createSpikes(hazard.size.x, hazard.size.z);
      object.position.set(hazard.position.x, hazard.position.y - hazard.size.y / 2, hazard.position.z);
      object.name = hazard.id;
      this.worldGroup.add(object);
    }
    for (const checkpoint of this.level.checkpoints) {
      const object = this.createCheckpoint(checkpoint.order);
      object.position.set(checkpoint.position.x, 0, checkpoint.position.z - 1.8);
      object.name = checkpoint.id;
      this.checkpointMeshes.set(checkpoint.id, object);
      this.worldGroup.add(object);
    }
    const goal = this.createGoal();
    goal.position.set(this.level.goal.position.x, 0, this.level.goal.position.z);
    goal.name = this.level.goal.id;
    this.worldGroup.add(goal);
    this.addRuinsAndPlants();
  }

  private createPlatform(kind: string, material: string, size: { x: number; y: number; z: number }) {
    const group = new THREE.Group();
    const colors: Record<string, number> = {
      sunlit_grass: 0xa36b3f,
      warm_ruin_stone: 0xd0af78,
      cloud_brick: 0xc9764d,
      gold_trim_stone: 0xd8bd74,
    };
    const bodyMaterial = new THREE.MeshStandardMaterial({ color: colors[material] ?? 0xd2b985, roughness: 0.78, metalness: 0.02 });
    const body = new THREE.Mesh(new THREE.BoxGeometry(size.x, size.y, size.z), bodyMaterial);
    body.castShadow = true;
    body.receiveShadow = true;
    group.add(body);
    if (kind === "ground" || kind === "grass_ledge") {
      const grass = new THREE.Mesh(
        new THREE.BoxGeometry(size.x + 0.05, Math.min(0.25, size.y * 0.25), size.z + 0.06),
        new THREE.MeshStandardMaterial({ color: kind === "ground" ? 0x55c85e : 0x72d769, roughness: 0.95 }),
      );
      grass.position.y = size.y / 2 + Math.min(0.12, size.y * 0.13);
      grass.castShadow = true;
      grass.receiveShadow = true;
      group.add(grass);
    } else if (kind === "ruin_brick") {
      const trim = new THREE.Mesh(new THREE.BoxGeometry(size.x + 0.08, 0.1, size.z + 0.08), new THREE.MeshStandardMaterial({ color: 0xf3c975, roughness: 0.65 }));
      trim.position.y = size.y / 2 + 0.05;
      group.add(trim);
      for (let x = -size.x / 2 + 0.65; x < size.x / 2; x += 1.25) {
        const seam = new THREE.Mesh(new THREE.BoxGeometry(0.035, size.y * 0.8, size.z + 0.01), new THREE.MeshBasicMaterial({ color: 0x9a533a }));
        seam.position.set(x, 0, size.z * 0.005);
        group.add(seam);
      }
    } else {
      const under = new THREE.Mesh(new THREE.ConeGeometry(size.x * 0.35, Math.max(0.7, size.y * 1.2), 7), new THREE.MeshStandardMaterial({ color: 0xa28b66, roughness: 0.9 }));
      under.position.y = -size.y / 2 - Math.max(0.32, size.y * 0.55);
      group.add(under);
    }
    return group;
  }

  private createCookieCharacter(skin: string, remote: boolean) {
    const palette = SKIN_COLORS[skin] ?? SKIN_COLORS.classic;
    const group = new THREE.Group();
    const cookieMaterial = new THREE.MeshStandardMaterial({ color: 0x27292f, roughness: 0.68, metalness: 0.08, transparent: remote, opacity: remote ? 0.82 : 1 });
    const edgeMaterial = new THREE.MeshStandardMaterial({ color: 0x111216, roughness: 0.82, transparent: remote, opacity: remote ? 0.82 : 1 });
    const creamMaterial = new THREE.MeshStandardMaterial({ color: palette.cream, roughness: 0.6, emissive: palette.cream, emissiveIntensity: 0.05, transparent: remote, opacity: remote ? 0.84 : 1 });
    const body = new THREE.Group();
    body.position.y = 0.16;
    const cream = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.62, 0.24, 32), creamMaterial);
    cream.rotation.x = Math.PI / 2;
    cream.userData.role = "cream";
    body.add(cream);
    for (const z of [-0.18, 0.18]) {
      const cookie = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.7, 0.18, 32), cookieMaterial);
      cookie.rotation.x = Math.PI / 2;
      cookie.position.z = z;
      cookie.castShadow = true;
      body.add(cookie);
    }
    const frontZ = 0.285;
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.48, 0.045, 8, 32), edgeMaterial);
    ring.position.z = frontZ;
    body.add(ring);
    for (let index = 0; index < 9; index += 1) {
      const angle = (index / 9) * Math.PI * 2;
      const bump = new THREE.Mesh(new THREE.SphereGeometry(0.045, 8, 6), edgeMaterial);
      bump.position.set(Math.cos(angle) * 0.36, Math.sin(angle) * 0.36, frontZ + 0.045);
      body.add(bump);
    }
    const eyeMaterial = new THREE.MeshStandardMaterial({ color: 0xf8fbff, roughness: 0.35 });
    const pupilMaterial = new THREE.MeshStandardMaterial({ color: 0x15171b, roughness: 0.5 });
    for (const x of [-0.2, 0.2]) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.115, 14, 10), eyeMaterial);
      eye.scale.y = 1.28;
      eye.position.set(x, 0.18, frontZ + 0.09);
      body.add(eye);
      const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.048, 10, 8), pupilMaterial);
      pupil.position.set(x + 0.015, 0.16, frontZ + 0.19);
      body.add(pupil);
    }
    const mouth = new THREE.Mesh(new THREE.TorusGeometry(0.12, 0.025, 7, 18, Math.PI), pupilMaterial);
    mouth.position.set(0, -0.08, frontZ + 0.12);
    mouth.rotation.z = Math.PI;
    body.add(mouth);
    const scarf = new THREE.Mesh(new THREE.TorusGeometry(0.53, 0.075, 8, 30), new THREE.MeshStandardMaterial({ color: palette.trim, roughness: 0.55 }));
    scarf.scale.y = 0.25;
    scarf.position.set(0, -0.42, 0.02);
    body.add(scarf);
    group.add(body);

    const limbMaterial = new THREE.MeshStandardMaterial({ color: 0x373a42, roughness: 0.72, transparent: remote, opacity: remote ? 0.8 : 1 });
    const bootMaterial = new THREE.MeshStandardMaterial({ color: palette.boot, roughness: 0.62, transparent: remote, opacity: remote ? 0.8 : 1 });
    const leftArm = this.createLimb(limbMaterial, bootMaterial, -0.64, -0.05, "left-arm", false);
    const rightArm = this.createLimb(limbMaterial, bootMaterial, 0.64, -0.05, "right-arm", false);
    const leftLeg = this.createLimb(limbMaterial, bootMaterial, -0.28, -0.48, "left-leg", true);
    const rightLeg = this.createLimb(limbMaterial, bootMaterial, 0.28, -0.48, "right-leg", true);
    group.add(leftArm, rightArm, leftLeg, rightLeg);
    group.scale.setScalar(remote ? 0.9 : 1);
    return group;
  }

  private createLimb(limbMaterial: THREE.Material, endMaterial: THREE.Material, x: number, y: number, name: string, leg: boolean) {
    const pivot = new THREE.Group();
    pivot.name = name;
    pivot.position.set(x, y, 0);
    const limb = new THREE.Mesh(new THREE.CapsuleGeometry(0.085, leg ? 0.38 : 0.33, 5, 8), limbMaterial);
    limb.position.y = leg ? -0.29 : -0.25;
    limb.castShadow = true;
    pivot.add(limb);
    const end = new THREE.Mesh(leg ? new THREE.SphereGeometry(0.17, 12, 8) : new THREE.SphereGeometry(0.13, 12, 8), endMaterial);
    end.scale.set(leg ? 1.25 : 1, leg ? 0.65 : 1, leg ? 1.45 : 1);
    end.position.set(leg ? 0.05 : 0, leg ? -0.58 : -0.49, 0.04);
    end.castShadow = true;
    pivot.add(end);
    return pivot;
  }

  private createCollectible(kind: string) {
    const group = new THREE.Group();
    if (kind === "sky_shard") {
      const shard = new THREE.Mesh(new THREE.OctahedronGeometry(0.48, 0), new THREE.MeshStandardMaterial({ color: 0x86ecff, emissive: 0x37a9de, emissiveIntensity: 0.55, roughness: 0.22, metalness: 0.3 }));
      shard.scale.y = 1.35;
      shard.castShadow = true;
      group.add(shard);
      this.decorativeSpinners.push(group);
    } else if (kind === "heart_bloom") {
      const material = new THREE.MeshStandardMaterial({ color: 0xff6685, emissive: 0xff315f, emissiveIntensity: 0.15, roughness: 0.45 });
      for (const x of [-0.17, 0.17]) {
        const lobe = new THREE.Mesh(new THREE.SphereGeometry(0.24, 14, 10), material);
        lobe.position.set(x, 0.12, 0);
        group.add(lobe);
      }
      const point = new THREE.Mesh(new THREE.ConeGeometry(0.34, 0.55, 16), material);
      point.rotation.z = Math.PI;
      point.position.y = -0.17;
      group.add(point);
    } else {
      const coin = new THREE.Mesh(new THREE.TorusGeometry(0.34, 0.1, 10, 24), new THREE.MeshStandardMaterial({ color: 0xffcc35, emissive: 0xe69a0a, emissiveIntensity: 0.18, roughness: 0.32, metalness: 0.45 }));
      coin.castShadow = true;
      group.add(coin);
      const star = new THREE.Mesh(new THREE.OctahedronGeometry(0.13, 0), new THREE.MeshStandardMaterial({ color: 0xfff4a8, emissive: 0xffd847, emissiveIntensity: 0.25 }));
      group.add(star);
    }
    return group;
  }

  private createEnemy(kind: string) {
    const group = new THREE.Group();
    const colors: Record<string, number> = { moss_walker: 0x69a94b, pebble_hopper: 0x9b83bb, breeze_wisp: 0x80dced };
    const material = new THREE.MeshStandardMaterial({ color: colors[kind] ?? 0x78aa55, roughness: 0.8 });
    const body = new THREE.Mesh(kind === "breeze_wisp" ? new THREE.SphereGeometry(0.55, 18, 12) : new THREE.SphereGeometry(0.58, 16, 12), material);
    body.scale.y = kind === "pebble_hopper" ? 1.05 : 0.78;
    body.castShadow = true;
    group.add(body);
    const eyeWhite = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.3 });
    const pupil = new THREE.MeshStandardMaterial({ color: 0x17202a, roughness: 0.4 });
    for (const x of [-0.2, 0.2]) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.12, 10, 8), eyeWhite);
      eye.position.set(x, 0.1, 0.5);
      group.add(eye);
      const dot = new THREE.Mesh(new THREE.SphereGeometry(0.052, 8, 6), pupil);
      dot.position.set(x, 0.08, 0.6);
      group.add(dot);
    }
    if (kind !== "breeze_wisp") {
      const footMaterial = new THREE.MeshStandardMaterial({ color: 0x3e4a35, roughness: 0.9 });
      for (const x of [-0.3, 0.3]) {
        const foot = new THREE.Mesh(new THREE.SphereGeometry(0.18, 10, 7), footMaterial);
        foot.scale.set(1.3, 0.55, 1.45);
        foot.position.set(x, -0.48, 0.08);
        group.add(foot);
      }
    } else {
      for (let index = 0; index < 3; index += 1) {
        const wisp = new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 7), material);
        wisp.position.set(-0.35 + index * 0.35, -0.53 - Math.abs(index - 1) * 0.1, -0.1);
        group.add(wisp);
      }
    }
    return group;
  }

  private createWindConduit(size: { x: number; y: number; z: number }) {
    const group = new THREE.Group();
    const stone = new THREE.MeshStandardMaterial({ color: 0x47b9b0, roughness: 0.62, metalness: 0.05 });
    const dark = new THREE.MeshStandardMaterial({ color: 0x267b80, roughness: 0.75 });
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(size.x * 0.36, size.x * 0.42, size.y, 18), stone);
    stem.castShadow = true;
    stem.receiveShadow = true;
    group.add(stem);
    const rim = new THREE.Mesh(new THREE.CylinderGeometry(size.x * 0.54, size.x * 0.54, 0.4, 18), stone);
    rim.position.y = size.y / 2 - 0.05;
    group.add(rim);
    const opening = new THREE.Mesh(new THREE.CylinderGeometry(size.x * 0.37, size.x * 0.37, 0.05, 18), dark);
    opening.position.y = size.y / 2 + 0.17;
    group.add(opening);
    return group;
  }

  private createSunPillar(size: { x: number; y: number; z: number }) {
    const group = new THREE.Group();
    const material = new THREE.MeshStandardMaterial({ color: 0xe8c16c, roughness: 0.65 });
    const column = new THREE.Mesh(new THREE.BoxGeometry(size.x * 0.68, size.y, size.z * 0.68), material);
    column.castShadow = true;
    group.add(column);
    for (const y of [-size.y / 2 + 0.18, size.y / 2 - 0.18]) {
      const cap = new THREE.Mesh(new THREE.BoxGeometry(size.x, 0.35, size.z), material);
      cap.position.y = y;
      group.add(cap);
    }
    const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.35), new THREE.MeshStandardMaterial({ color: 0xffed83, emissive: 0xffca38, emissiveIntensity: 0.3 }));
    gem.position.set(0, size.y * 0.12, size.z * 0.36);
    group.add(gem);
    return group;
  }

  private createSpikes(width: number, depth: number) {
    const group = new THREE.Group();
    const count = Math.max(2, Math.floor(width / 0.55));
    const material = new THREE.MeshStandardMaterial({ color: 0xf05568, emissive: 0xb71f3b, emissiveIntensity: 0.12, roughness: 0.38, metalness: 0.15 });
    for (let index = 0; index < count; index += 1) {
      const spike = new THREE.Mesh(new THREE.ConeGeometry(0.3, 0.95, 5), material);
      spike.position.set(-width / 2 + ((index + 0.5) / count) * width, 0.47, (index % 2 ? 0.35 : -0.35) * Math.min(1, depth / 4));
      spike.castShadow = true;
      group.add(spike);
    }
    return group;
  }

  private createCheckpoint(order: number) {
    const group = new THREE.Group();
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.075, 3.8, 10), new THREE.MeshStandardMaterial({ color: 0xe9eef1, metalness: 0.55, roughness: 0.3 }));
    pole.position.y = 1.9;
    pole.castShadow = true;
    group.add(pole);
    const flagMaterial = new THREE.MeshStandardMaterial({ color: 0x72cde7, side: THREE.DoubleSide, roughness: 0.65 });
    const flag = new THREE.Mesh(new THREE.PlaneGeometry(1.05, 0.62, 4, 2), flagMaterial);
    flag.position.set(0.55, 3.25, 0);
    flag.name = "flag";
    group.userData.order = order;
    group.add(flag);
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.42, 0.25, 12), new THREE.MeshStandardMaterial({ color: 0xb08d5a, roughness: 0.8 }));
    base.position.y = 0.12;
    group.add(base);
    return group;
  }

  private activateCheckpoint(id: string) {
    const group = this.checkpointMeshes.get(id);
    const flag = group?.getObjectByName("flag");
    if (flag instanceof THREE.Mesh && flag.material instanceof THREE.MeshStandardMaterial) {
      flag.material.color.setHex(0xffcf46);
      flag.material.emissive.setHex(0xe09b13);
      flag.material.emissiveIntensity = 0.18;
    }
  }

  private createGoal() {
    const group = new THREE.Group();
    const stone = new THREE.MeshStandardMaterial({ color: 0xf0c96e, roughness: 0.58 });
    for (const x of [-1.25, 1.25]) {
      const pillar = new THREE.Mesh(new THREE.BoxGeometry(0.65, 4.6, 1.1), stone);
      pillar.position.set(x, 2.3, 0);
      pillar.castShadow = true;
      group.add(pillar);
    }
    const arch = new THREE.Mesh(new THREE.TorusGeometry(1.25, 0.32, 12, 32, Math.PI), stone);
    arch.position.y = 4.55;
    group.add(arch);
    const disk = new THREE.Mesh(new THREE.CylinderGeometry(0.48, 0.48, 0.14, 24), new THREE.MeshStandardMaterial({ color: 0xffec84, emissive: 0xf5ae22, emissiveIntensity: 0.35, roughness: 0.3 }));
    disk.rotation.x = Math.PI / 2;
    disk.position.set(0, 4.45, 0.2);
    group.add(disk);
    this.decorativeSpinners.push(disk);
    return group;
  }

  private addRuinsAndPlants() {
    const trunkMaterial = new THREE.MeshStandardMaterial({ color: 0x7c5635, roughness: 0.9 });
    const leafMaterial = new THREE.MeshStandardMaterial({ color: 0x46b85b, roughness: 0.88 });
    for (const x of [5, 16, 38, 63, 93, 111, 130, 158]) {
      const tree = new THREE.Group();
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.2, 1.25, 8), trunkMaterial);
      trunk.position.y = 0.62;
      tree.add(trunk);
      for (const [dx, dy, scale] of [[0, 1.45, 0.8], [-0.38, 1.35, 0.58], [0.38, 1.35, 0.58]] as const) {
        const leaves = new THREE.Mesh(new THREE.SphereGeometry(scale, 12, 9), leafMaterial);
        leaves.position.set(dx, dy, 0);
        leaves.castShadow = true;
        tree.add(leaves);
      }
      tree.position.set(x, 0, -3.2);
      this.worldGroup.add(tree);
    }
    const flowerColors = [0xff6685, 0xffd74a, 0x7e9cff, 0xffffff];
    for (let index = 0; index < 42; index += 1) {
      const x = 2 + ((index * 19) % 162);
      if (this.level.hazards.some((hazard) => hazard.kind === "bottomless_pit" && Math.abs(hazard.position.x - x) < hazard.size.x / 2 + 0.4)) continue;
      const stem = new THREE.Group();
      const blossom = new THREE.Mesh(new THREE.SphereGeometry(0.08, 7, 5), new THREE.MeshStandardMaterial({ color: flowerColors[index % flowerColors.length], roughness: 0.65 }));
      blossom.position.y = 0.18;
      stem.add(blossom);
      stem.position.set(x, 0.05, index % 2 ? -2.8 : 2.8);
      this.worldGroup.add(stem);
    }
  }

  private createCloud(scale: number) {
    const group = new THREE.Group();
    const material = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, transparent: true, opacity: 0.84, depthWrite: false });
    for (const [x, y, radius] of [[-0.8, 0, 0.7], [0, 0.22, 0.95], [0.9, 0, 0.68], [0.25, -0.18, 0.74]] as const) {
      const puff = new THREE.Mesh(new THREE.SphereGeometry(radius, 14, 9), material);
      puff.position.set(x, y, 0);
      group.add(puff);
    }
    group.scale.setScalar(scale);
    return group;
  }

  private burstAt(position: THREE.Vector3 | undefined, color: number) {
    if (!position) return;
    const group = new THREE.Group();
    group.position.copy(position);
    const material = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9 });
    for (let index = 0; index < 8; index += 1) {
      const spark = new THREE.Mesh(new THREE.OctahedronGeometry(0.08), material.clone());
      const angle = (index / 8) * Math.PI * 2;
      spark.userData.velocity = new THREE.Vector3(Math.cos(angle) * 2.3, Math.sin(angle) * 2.3 + 1, 0);
      group.add(spark);
    }
    this.worldGroup.add(group);
    const started = performance.now();
    const animate = () => {
      const age = (performance.now() - started) / 1000;
      if (age > 0.55 || this.destroyed) {
        this.worldGroup.remove(group);
        this.disposeObject(group);
        return;
      }
      for (const child of group.children) {
        const velocity = child.userData.velocity as THREE.Vector3;
        child.position.addScaledVector(velocity, 0.016);
        velocity.y -= 0.08;
        if (child instanceof THREE.Mesh && child.material instanceof THREE.MeshBasicMaterial) child.material.opacity = 1 - age / 0.55;
      }
      requestAnimationFrame(animate);
    };
    requestAnimationFrame(animate);
  }

  private resetVisualState() {
    for (const mesh of this.collectibleMeshes.values()) mesh.visible = true;
    for (const mesh of this.enemyMeshes.values()) mesh.visible = true;
    for (const group of this.checkpointMeshes.values()) {
      const flag = group.getObjectByName("flag");
      if (flag instanceof THREE.Mesh && flag.material instanceof THREE.MeshStandardMaterial) {
        flag.material.color.setHex(0x72cde7);
        flag.material.emissive.setHex(0x000000);
        flag.material.emissiveIntensity = 0;
      }
    }
  }

  private resize() {
    const rect = this.canvas.getBoundingClientRect();
    const width = Math.max(1, Math.floor(rect.width));
    const height = Math.max(1, Math.floor(rect.height));
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
  }

  private disposeObject(object: THREE.Object3D) {
    object.traverse((child) => this.disposeObjectResources(child));
  }

  private disposeObjectResources(object: THREE.Object3D) {
    if (!(object instanceof THREE.Mesh)) return;
    object.geometry?.dispose();
    if (Array.isArray(object.material)) object.material.forEach((material) => material.dispose());
    else object.material?.dispose();
  }
}
