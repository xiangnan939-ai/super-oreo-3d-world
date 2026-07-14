import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import {
  WORLD_3D,
  type AirTube,
  type AssetProp,
  type BiomeZone,
  type BoostPad,
  type Decoration,
  type GroundRoad,
  type WindZone,
} from "./world3d";
import { DEFAULT_GAME_SETTINGS, type GameSettings } from "./settings";
import { toSimulationLevel } from "./level3d";
import {
  createWorld3D,
  stepWorld3D,
  type GameEvent3D,
  type InputState3D,
  type PlayerState3D,
  type WorldState3D,
} from "./simulation3d";

const LOCAL_PLAYER_ID = "local-player";
const NETWORK_TICK_MS = 50;
const HUD_TICK_MS = 90;

export interface EngineHud {
  coins: number;
  totalCoins: number;
  starMedals: number;
  totalStarMedals: number;
  moonShards: number;
  totalMoonShards: number;
  lives: number;
  deaths: number;
  score: number;
  elapsedMs: number;
  timeRemaining: number;
  checkpoint: number;
  totalCheckpoints: number;
  biome: string;
  biomeSubtitle: string;
  objective: string;
  dashReady: boolean;
  rating: "S" | "A" | "B" | "C";
  finished: boolean;
}

export interface EngineFrame {
  playerId: string;
  name: string;
  skin: string;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  facing: number;
  action: string;
  tick: number;
}

interface EngineOptions {
  skin: string;
  soundOn: boolean;
  settings?: GameSettings;
  onHud(hud: EngineHud): void;
  onLocalFrame(frame: Omit<EngineFrame, "playerId" | "name" | "skin">): void;
  onFinish(hud: EngineHud): void;
}

interface TouchInput {
  left: boolean;
  right: boolean;
  forward: boolean;
  backward: boolean;
  jump: boolean;
  run: boolean;
  dash: boolean;
}

interface RemoteAvatar {
  group: THREE.Group;
  target: EngineFrame;
  lastSeen: number;
}

interface TubeRide {
  curve: THREE.CatmullRomCurve3;
  elapsed: number;
  duration: number;
  reverse: boolean;
}

const SKIN_COLORS: Record<string, { cream: number; trim: number; boot: number }> = {
  classic: { cream: 0xf8f0d8, trim: 0x35a6df, boot: 0x2c5f8f },
  berry: { cream: 0xff7c9c, trim: 0xffd8e2, boot: 0x9b3654 },
  mint: { cream: 0x66e5bf, trim: 0xd5fff3, boot: 0x187765 },
  caramel: { cream: 0xffc95d, trim: 0xffefb7, boot: 0xa25c18 },
};

class AdventureAudio {
  private context: AudioContext | null = null;
  private enabled: boolean;
  private nextMusicAt = 0;
  private musicStep = 0;
  private readonly samples = {
    grass: "/audio/kenney-impact/footstep_grass_000.ogg",
    snow: "/audio/kenney-impact/footstep_snow_000.ogg",
    bell: "/audio/kenney-impact/impactBell_heavy_000.ogg",
    metal: "/audio/kenney-impact/impactMetal_medium_000.ogg",
    soft: "/audio/kenney-impact/impactSoft_heavy_000.ogg",
  } as const;

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
    const melody = [392, 523.25, 659.25, 587.33, 523.25, 440, 493.88, 659.25, 783.99, 659.25, 587.33, 493.88];
    const bass = [130.81, 164.81, 146.83, 196];
    this.tone(melody[this.musicStep % melody.length], 0.075, 0.014, "square", now);
    if (this.musicStep % 3 === 0) this.tone(bass[Math.floor(this.musicStep / 3) % bass.length], 0.14, 0.011, "triangle", now);
    this.musicStep += 1;
    this.nextMusicAt = now + 0.18;
  }

  jump() { this.unlock(); this.sweep(270, 540, 0.11, 0.052, "square"); }
  collect() {
    this.unlock();
    this.tone(760, 0.05, 0.04, "square");
    if (this.context) this.tone(1010, 0.075, 0.03, "triangle", this.context.currentTime + 0.045);
  }
  star() {
    this.unlock();
    if (!this.context) return;
    [659, 784, 988].forEach((f, i) => this.tone(f, 0.12, 0.04, "triangle", this.context!.currentTime + i * 0.07));
  }
  shard() {
    this.unlock();
    this.playSample("bell", 0.16, 1.45);
    if (!this.context) return;
    [880, 1175, 1320].forEach((f, i) => this.tone(f, 0.16, 0.026, "sine", this.context!.currentTime + i * 0.06));
  }
  stomp() { this.unlock(); this.playSample("soft", 0.2, 1.08); this.sweep(180, 340, 0.09, 0.048, "triangle"); }
  checkpoint() {
    this.unlock();
    this.playSample("bell", 0.16, 1.2);
    if (!this.context) return;
    [523, 659, 784].forEach((f, i) => this.tone(f, 0.1, 0.034, "triangle", this.context!.currentTime + i * 0.07));
  }
  death() { this.unlock(); this.sweep(360, 92, 0.32, 0.055, "sawtooth"); }
  tube() { this.unlock(); this.sweep(360, 880, 0.32, 0.036, "sine"); }
  boost() { this.unlock(); this.sweep(190, 920, 0.22, 0.05, "triangle"); }
  dash() { this.unlock(); this.playSample("soft", 0.13, 1.85); this.sweep(240, 980, 0.12, 0.035, "sine"); }
  footstep(surface: "grass" | "snow" | "metal") {
    this.playSample(surface === "metal" ? "metal" : surface, 0.075, 0.92 + Math.random() * 0.14);
  }
  finish() {
    this.unlock();
    if (!this.context) return;
    [523, 659, 784, 1047].forEach((f, i) => this.tone(f, 0.19, 0.045, "square", this.context!.currentTime + i * 0.11));
  }
  close() { if (this.context) void this.context.close(); this.context = null; }

  private playSample(name: keyof AdventureAudio["samples"], volume: number, playbackRate: number) {
    if (!this.enabled || typeof Audio === "undefined") return;
    const audio = new Audio(this.samples[name]);
    audio.volume = volume;
    audio.playbackRate = playbackRate;
    void audio.play().catch(() => undefined);
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
  interface Window { webkitAudioContext?: typeof AudioContext; }
}

export class OreoGameEngine {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(WORLD_3D.camera.fovDegrees, 1, WORLD_3D.camera.near, WORLD_3D.camera.far);
  private readonly worldGroup = new THREE.Group();
  private readonly effectsGroup = new THREE.Group();
  private readonly simulationLevel = toSimulationLevel();
  private world: WorldState3D = createWorld3D(this.simulationLevel, LOCAL_PLAYER_ID);
  private readonly platformMeshes = new Map<string, THREE.Object3D>();
  private readonly collectibleMeshes = new Map<string, THREE.Object3D>();
  private readonly enemyMeshes = new Map<string, THREE.Object3D>();
  private readonly checkpointMeshes = new Map<string, THREE.Object3D>();
  private readonly hazardMeshes = new Map<string, THREE.Object3D>();
  private readonly assetPropMeshes = new Map<string, THREE.Object3D>();
  private readonly remoteAvatars = new Map<string, RemoteAvatar>();
  private readonly cameraColliders: THREE.Object3D[] = [];
  private readonly raycaster = new THREE.Raycaster();
  private readonly keys = new Set<string>();
  private readonly touch: TouchInput = { left: false, right: false, forward: false, backward: false, jump: false, run: false, dash: false };
  private readonly audio: AdventureAudio;
  private readonly gltfLoader = new GLTFLoader();
  private readonly textureCache = new Map<string, THREE.Texture>();
  private readonly animatedScenery = new Set<THREE.Object3D>();
  private hemisphereLight!: THREE.HemisphereLight;
  private sunLight!: THREE.DirectionalLight;
  private skyMaterial: THREE.ShaderMaterial | null = null;
  private playerGroup: THREE.Group;
  private skin: string;
  private active = false;
  private paused = false;
  private attract = true;
  private destroyed = false;
  private animationFrame = 0;
  private lastTime = performance.now();
  private lastNetworkAt = 0;
  private lastHudAt = 0;
  private finishedNotified = false;
  private cameraYaw = -2.42;
  private cameraPitch = -0.38;
  private cameraDistance: number = WORLD_3D.camera.followDistance * 0.84;
  private readonly cameraTarget = new THREE.Vector3();
  private readonly cameraDesired = new THREE.Vector3();
  private dragging = false;
  private lastPointerX = 0;
  private lastPointerY = 0;
  private tubeRide: TubeRide | null = null;
  private tubeCooldown = 0;
  private boostCooldown = 0;
  private lastFootstepAt = 0;
  private readonly tubeCurves = new Map<string, THREE.CatmullRomCurve3>();
  private settings: GameSettings;

  private readonly onResize = () => this.resize();
  private readonly onKeyDown = (event: KeyboardEvent) => this.handleKey(event, true);
  private readonly onKeyUp = (event: KeyboardEvent) => this.handleKey(event, false);
  private readonly onPointerLock = () => {
    this.canvas.classList.toggle("is-pointer-locked", document.pointerLockElement === this.canvas);
  };
  private readonly onMouseMove = (event: MouseEvent) => {
    if (!this.active || this.paused || document.pointerLockElement !== this.canvas) return;
    this.orbitBy(event.movementX, event.movementY);
  };
  private readonly onPointerDown = (event: PointerEvent) => {
    if (!this.active || this.paused) return;
    this.audio.unlock();
    this.dragging = true;
    this.lastPointerX = event.clientX;
    this.lastPointerY = event.clientY;
    if (this.settings.autoPointerLock && event.pointerType === "mouse" && document.pointerLockElement !== this.canvas) {
      void this.canvas.requestPointerLock();
    }
  };
  private readonly onPointerMove = (event: PointerEvent) => {
    if (!this.active || this.paused || !this.dragging) return;
    if (event.pointerType === "mouse" && document.pointerLockElement === this.canvas) return;
    this.orbitBy(event.clientX - this.lastPointerX, event.clientY - this.lastPointerY);
    this.lastPointerX = event.clientX;
    this.lastPointerY = event.clientY;
  };
  private readonly onPointerUp = () => { this.dragging = false; };
  private readonly onWheel = (event: WheelEvent) => {
    if (!this.active || this.paused) return;
    this.cameraDistance = THREE.MathUtils.clamp(this.cameraDistance + event.deltaY * 0.008, 7.5, 18);
  };
  private readonly releaseInputs = () => {
    this.keys.clear();
    for (const key of Object.keys(this.touch) as Array<keyof TouchInput>) this.touch[key] = false;
    this.dragging = false;
  };
  private readonly onVisibilityChange = () => {
    if (document.visibilityState !== "visible") this.releaseInputs();
  };

  constructor(private readonly canvas: HTMLCanvasElement, private readonly options: EngineOptions) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: "high-performance" });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.08;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.scene.background = new THREE.Color(WORLD_3D.theme.sky.horizon);
    this.scene.fog = new THREE.Fog(WORLD_3D.theme.sky.fog, 76, 235);
    this.scene.add(this.worldGroup, this.effectsGroup);
    this.audio = new AdventureAudio(options.soundOn);
    this.skin = options.skin;
    this.settings = options.settings ?? DEFAULT_GAME_SETTINGS;
    this.setupLights();
    this.buildEnvironment();
    this.buildLevel();
    this.indexAnimatedScenery();
    this.playerGroup = this.createCookieCharacter(this.skin, false);
    this.worldGroup.add(this.playerGroup);
    this.applyDevelopmentSpawn();
    this.resetCamera(true);
    this.resize();
    window.addEventListener("resize", this.onResize);
    window.addEventListener("keydown", this.onKeyDown, { passive: false });
    window.addEventListener("keyup", this.onKeyUp);
    window.addEventListener("blur", this.releaseInputs);
    document.addEventListener("visibilitychange", this.onVisibilityChange);
    document.addEventListener("pointerlockchange", this.onPointerLock);
    document.addEventListener("mousemove", this.onMouseMove);
    canvas.addEventListener("pointerdown", this.onPointerDown);
    canvas.addEventListener("pointermove", this.onPointerMove);
    canvas.addEventListener("pointerup", this.onPointerUp);
    canvas.addEventListener("pointercancel", this.onPointerUp);
    canvas.addEventListener("wheel", this.onWheel, { passive: true });
    this.animationFrame = requestAnimationFrame(this.frame);
  }

  setActive(active: boolean) {
    if (this.active === active) return;
    this.active = active;
    this.paused = false;
    if (active) {
      this.world = createWorld3D(this.simulationLevel, LOCAL_PLAYER_ID);
      this.applyDevelopmentSpawn();
      this.finishedNotified = false;
      this.tubeRide = null;
      this.tubeCooldown = 0;
      this.boostCooldown = 0;
      this.lastFootstepAt = 0;
      this.resetVisualState();
      this.resetCamera(true);
      this.lastTime = performance.now();
      this.options.onHud(this.makeHud());
      this.audio.unlock();
    } else {
      this.releaseInputs();
      if (document.pointerLockElement === this.canvas) document.exitPointerLock();
    }
  }

  setAttract(attract: boolean) { this.attract = attract; }

  /** Local visual-QA hook; Vite removes the branch from production builds. */
  private applyDevelopmentSpawn() {
    if (!import.meta.env.DEV) return;
    const raw = new URLSearchParams(window.location.search).get("qaSpawn");
    if (!raw) return;
    const coordinates = raw.split(",").map(Number);
    if (coordinates.length !== 3 || coordinates.some((value) => !Number.isFinite(value))) return;
    const [x, y, z] = coordinates;
    const player = this.world.players[LOCAL_PLAYER_ID];
    player.x = THREE.MathUtils.clamp(x, this.world.bounds.minX, this.world.bounds.maxX);
    player.y = Math.max(y, this.world.bounds.killY + player.height);
    player.z = THREE.MathUtils.clamp(z, this.world.bounds.minZ, this.world.bounds.maxZ);
    player.vx = 0;
    player.vy = 0;
    player.vz = 0;
    player.grounded = false;
    player.groundObjectId = null;
    player.respawnX = player.x;
    player.respawnY = player.y;
    player.respawnZ = player.z;
  }

  setPaused(paused: boolean) {
    this.paused = paused;
    this.releaseInputs();
    if (paused && document.pointerLockElement === this.canvas) document.exitPointerLock();
    this.lastTime = performance.now();
  }

  setSettings(settings: GameSettings) {
    this.settings = settings;
  }

  setSkin(skin: string) {
    if (skin === this.skin) return;
    this.skin = skin;
    const next = this.createCookieCharacter(skin, false);
    next.position.copy(this.playerGroup.position);
    next.rotation.copy(this.playerGroup.rotation);
    this.worldGroup.remove(this.playerGroup);
    this.disposeObject(this.playerGroup);
    this.playerGroup = next;
    this.worldGroup.add(next);
  }

  setSoundOn(enabled: boolean) { this.audio.setEnabled(enabled); }

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
        group.position.set(frame.x, frame.y, Number.isFinite(frame.z) ? frame.z : 0);
        this.worldGroup.add(group);
        avatar = { group, target: frame, lastSeen: now };
        this.remoteAvatars.set(id, avatar);
      }
      if (avatar.target.skin !== frame.skin) this.updateRemoteSkin(avatar, frame.skin);
      avatar.target = frame;
      avatar.lastSeen = now;
    }
  }

  destroy() {
    this.destroyed = true;
    cancelAnimationFrame(this.animationFrame);
    window.removeEventListener("resize", this.onResize);
    window.removeEventListener("keydown", this.onKeyDown);
    window.removeEventListener("keyup", this.onKeyUp);
    window.removeEventListener("blur", this.releaseInputs);
    document.removeEventListener("visibilitychange", this.onVisibilityChange);
    document.removeEventListener("pointerlockchange", this.onPointerLock);
    document.removeEventListener("mousemove", this.onMouseMove);
    this.canvas.removeEventListener("pointerdown", this.onPointerDown);
    this.canvas.removeEventListener("pointermove", this.onPointerMove);
    this.canvas.removeEventListener("pointerup", this.onPointerUp);
    this.canvas.removeEventListener("pointercancel", this.onPointerUp);
    this.canvas.removeEventListener("wheel", this.onWheel);
    if (document.pointerLockElement === this.canvas) document.exitPointerLock();
    this.audio.close();
    this.disposeObjectResources(this.scene);
    this.renderer.dispose();
  }

  private readonly frame = (time: number) => {
    if (this.destroyed) return;
    const dt = Math.min((time - this.lastTime) / 1000, 0.05);
    this.lastTime = time;
    if (this.active && !this.paused) this.updateGame(dt, time);
    else if (this.active && this.paused) this.updatePaused(dt, time);
    else if (this.attract) this.updateAttract(dt, time);
    this.updateScenery(dt, time);
    this.audio.updateMusic(this.active && !this.paused);
    this.renderer.render(this.scene, this.camera);
    this.animationFrame = requestAnimationFrame(this.frame);
  };

  private updateGame(dt: number, time: number) {
    this.tubeCooldown = Math.max(0, this.tubeCooldown - dt);
    this.boostCooldown = Math.max(0, this.boostCooldown - dt);
    if (this.tubeRide) this.updateTubeRide(dt);
    else {
      this.world = stepWorld3D(this.world, this.currentInput(), dt);
      this.applyInteractiveForces(dt);
      this.tryEnterTube();
    }
    this.handleEvents(this.world.events);
    this.syncWorldMeshes(time);
    const player = this.world.players[LOCAL_PLAYER_ID];
    this.updateBiome(player, dt);
    this.updateFootsteps(player, time);
    this.updateCamera(player, dt);
    this.updateRemoteAvatars(dt, time);

    this.emitLocalFrame(time, NETWORK_TICK_MS, false);
    if (time - this.lastHudAt >= HUD_TICK_MS) {
      this.lastHudAt = time;
      this.options.onHud(this.makeHud());
    }
    if (this.world.status === "won" && !this.finishedNotified) {
      this.finishedNotified = true;
      const hud = this.makeHud(true);
      this.options.onHud(hud);
      this.options.onFinish(hud);
    }
  }

  private updatePaused(dt: number, time: number) {
    this.syncWorldMeshes(time);
    this.updateRemoteAvatars(dt, time);
    // Multiplayer peers keep the paused avatar present while local simulation
    // is frozen. The low-rate idle frame also keeps a host relay alive.
    this.emitLocalFrame(time, 1_000, true);
  }

  private emitLocalFrame(time: number, interval: number, paused: boolean) {
    if (time - this.lastNetworkAt < interval) return;
    this.lastNetworkAt = time;
    const player = this.world.players[LOCAL_PLAYER_ID];
    const speed = Math.hypot(player.vx, player.vz);
    this.options.onLocalFrame({
      x: player.x,
      y: player.y,
      z: player.z,
      vx: paused ? 0 : player.vx,
      vy: paused ? 0 : player.vy,
      vz: paused ? 0 : player.vz,
      facing: player.facingYaw,
      action: paused ? "idle" : player.status !== "active" ? player.status : player.dashRemaining > 0 ? "dash" : !player.grounded ? "jump" : speed > 7.5 ? "run" : speed > 0.4 ? "walk" : "idle",
      tick: this.world.tick,
    });
  }

  private updateAttract(dt: number, time: number) {
    const t = time * 0.000065;
    const target = new THREE.Vector3(-2, 3.8, 8);
    const desired = new THREE.Vector3(
      target.x - 45 + Math.sin(t) * 13,
      24 + Math.sin(t * 1.4) * 2,
      target.z - 44 + Math.cos(t) * 10,
    );
    const alpha = 1 - Math.exp(-dt * 1.7);
    this.camera.position.lerp(desired, alpha);
    this.cameraTarget.lerp(target, alpha);
    this.camera.lookAt(this.cameraTarget);
    const spawn = WORLD_3D.player.position;
    this.playerGroup.visible = true;
    this.playerGroup.position.set(spawn.x, spawn.y, spawn.z);
    this.playerGroup.rotation.y = WORLD_3D.player.facingYawRadians;
    this.animateCharacter(this.playerGroup, 0, 0, 0, true, time);
  }

  private currentInput(): InputState3D {
    const bindings = this.settings.keyBindings;
    return {
      forward: this.keys.has(bindings.forward) || this.touch.forward,
      backward: this.keys.has(bindings.backward) || this.touch.backward,
      left: this.keys.has(bindings.left) || this.touch.left,
      right: this.keys.has(bindings.right) || this.touch.right,
      jump: this.keys.has(bindings.jump) || this.touch.jump,
      sprint: this.keys.has(bindings.sprint) || this.touch.run,
      dash: this.keys.has(bindings.dash) || this.touch.dash,
      cameraYaw: this.cameraYaw,
    };
  }

  private handleKey(event: KeyboardEvent, pressed: boolean) {
    const gameKeys = Object.values(this.settings.keyBindings);
    if (!gameKeys.includes(event.code)) return;
    if (this.active && !this.paused) event.preventDefault();
    if (this.paused) return;
    if (pressed) {
      const first = !this.keys.has(event.code);
      this.keys.add(event.code);
      if (this.active && first) {
        this.audio.unlock();
        if (event.code === this.settings.keyBindings.jump) this.audio.jump();
        if (event.code === this.settings.keyBindings.restart) {
          this.world = createWorld3D(this.simulationLevel, LOCAL_PLAYER_ID);
          this.finishedNotified = false;
          this.tubeRide = null;
          this.tubeCooldown = 0;
          this.boostCooldown = 0;
          this.lastFootstepAt = 0;
          this.lastNetworkAt = 0;
          this.lastHudAt = 0;
          this.resetVisualState();
          this.resetCamera(true);
          this.options.onHud(this.makeHud());
        }
      }
    } else this.keys.delete(event.code);
  }

  private orbitBy(dx: number, dy: number) {
    const sensitivity = WORLD_3D.camera.mouseSensitivity * this.settings.mouseSensitivity;
    this.cameraYaw -= dx * sensitivity;
    this.cameraPitch = THREE.MathUtils.clamp(
      this.cameraPitch - dy * sensitivity * (this.settings.invertYAxis ? -1 : 1),
      WORLD_3D.camera.minimumPitchRadians,
      WORLD_3D.camera.maximumPitchRadians,
    );
  }

  private handleEvents(events: GameEvent3D[]) {
    for (const event of events) {
      if (event.playerId !== LOCAL_PLAYER_ID) continue;
      const player = this.world.players[LOCAL_PLAYER_ID];
      switch (event.type) {
        case "collectible": {
          const mesh = this.collectibleMeshes.get(event.collectibleId);
          const isStar = event.collectibleId.startsWith("star-medal");
          const isShard = event.collectibleId.startsWith("moon-shard");
          this.burstAt(mesh?.getWorldPosition(new THREE.Vector3()), isStar ? 0x82f33b : isShard ? 0xaad8ff : 0xffd748);
          if (isStar) this.audio.star(); else if (isShard) this.audio.shard(); else this.audio.collect();
          break;
        }
        case "enemy-stomp":
          this.audio.stomp();
          this.burstAt(this.enemyMeshes.get(event.enemyId)?.getWorldPosition(new THREE.Vector3()), 0xf4c76b);
          break;
        case "dash":
          this.audio.dash();
          this.burstAt(new THREE.Vector3(player.x, player.y + 0.15, player.z), 0xb8edff);
          break;
        case "checkpoint": this.audio.checkpoint(); this.activateCheckpoint(event.checkpointId); break;
        case "death": this.audio.death(); this.burstAt(new THREE.Vector3(player.x, player.y, player.z), 0xffffff); break;
        case "respawn": this.resetCamera(true); break;
        case "goal": this.audio.finish(); this.burstAt(new THREE.Vector3(player.x, player.y + 1, player.z), 0xffe34f); break;
        default: break;
      }
    }
  }

  private makeHud(finished = this.world.status === "won"): EngineHud {
    const player = this.world.players[LOCAL_PLAYER_ID];
    const collectedIds = new Set(this.world.collectibles.filter((item) => item.collected).map((item) => item.id));
    const coins = WORLD_3D.collectibles.filter((item) => item.kind === "coin" && collectedIds.has(item.id)).length;
    const starMedals = this.world.collectibles.filter((item) => item.collected && item.id.startsWith("star-medal")).length;
    const moonShards = this.world.collectibles.filter((item) => item.collected && item.id.startsWith("moon-shard")).length;
    const totalCoins = WORLD_3D.collectibles.filter((item) => item.kind === "coin").length;
    const totalStarMedals = WORLD_3D.collectibles.filter((item) => item.kind === "star_medal").length;
    const totalMoonShards = WORLD_3D.collectibles.filter((item) => item.kind === "moon_shard").length;
    const checkpointIndex = WORLD_3D.checkpoints.findIndex((item) => item.id === player.checkpointId);
    const biome = this.biomeForZ(player.z);
    const ratingPoints =
      (starMedals === totalStarMedals ? 3 : Math.floor(starMedals / 2)) +
      (moonShards === totalMoonShards ? 2 : Math.floor(moonShards / 3)) +
      (player.deaths === 0 ? 2 : player.deaths <= 2 ? 1 : 0) +
      (this.world.time <= 720 ? 2 : this.world.time <= 840 ? 1 : 0) +
      (coins >= totalCoins * 0.6 ? 1 : 0);
    const rating: EngineHud["rating"] = ratingPoints >= 9 ? "S" : ratingPoints >= 7 ? "A" : ratingPoints >= 4 ? "B" : "C";
    return {
      coins,
      totalCoins,
      starMedals,
      totalStarMedals,
      moonShards,
      totalMoonShards,
      lives: player.lives,
      deaths: player.deaths,
      score: player.score,
      elapsedMs: Math.round(this.world.time * 1000),
      timeRemaining: Math.max(0, WORLD_3D.metadata.timeLimitSeconds - Math.floor(this.world.time)),
      checkpoint: checkpointIndex + 1,
      totalCheckpoints: WORLD_3D.checkpoints.length,
      biome: biome.name,
      biomeSubtitle: biome.subtitle,
      objective: biome.objective,
      dashReady: player.airDashAvailable,
      rating,
      finished,
    };
  }

  private biomeForZ(z: number): BiomeZone {
    return WORLD_3D.biomes.find((biome) => z >= biome.minimumZ && z < biome.maximumZ)
      ?? WORLD_3D.biomes[WORLD_3D.biomes.length - 1];
  }

  private updateBiome(player: PlayerState3D, dt: number) {
    const biome = this.biomeForZ(player.z);
    const alpha = 1 - Math.exp(-dt * 1.45);
    if (this.scene.background instanceof THREE.Color) {
      this.scene.background.lerp(new THREE.Color(biome.sky.horizon), alpha);
    }
    if (this.scene.fog instanceof THREE.Fog) {
      this.scene.fog.color.lerp(new THREE.Color(biome.sky.fog), alpha);
    }
    if (this.skyMaterial) {
      const top = this.skyMaterial.uniforms.topColor?.value as THREE.Color | undefined;
      const bottom = this.skyMaterial.uniforms.bottomColor?.value as THREE.Color | undefined;
      top?.lerp(new THREE.Color(biome.sky.zenith), alpha);
      bottom?.lerp(new THREE.Color(biome.sky.horizon), alpha);
    }
    this.hemisphereLight.color.lerp(new THREE.Color(biome.ambient), alpha);
    this.sunLight.color.lerp(new THREE.Color(biome.accent), alpha * 0.55);
    const water = this.worldGroup.getObjectByName("shimmering-water");
    if (water instanceof THREE.Mesh && water.material instanceof THREE.MeshPhysicalMaterial) {
      const waterTarget = biome.id === "cocoa" ? new THREE.Color(0x7b3b42) : biome.id === "moon" ? new THREE.Color(0x414d9a) : new THREE.Color(WORLD_3D.theme.palette.water);
      water.material.color.lerp(waterTarget, alpha * 0.45);
    }
  }

  private updateFootsteps(player: PlayerState3D, time: number) {
    const speed = Math.hypot(player.vx, player.vz);
    if (!player.grounded || speed < 1.25 || player.status !== "active") return;
    const interval = speed > 7.5 ? 250 : 360;
    if (time - this.lastFootstepAt < interval) return;
    this.lastFootstepAt = time;
    const biome = this.biomeForZ(player.z);
    const surface = player.groundObjectId
      ? this.world.platforms.find((platform) => platform.id === player.groundObjectId)?.surface
      : "normal";
    this.audio.footstep(surface === "ice" || biome.id === "frost" ? "snow" : surface === "conveyor" || biome.id === "clockwork" || biome.id === "cocoa" ? "metal" : "grass");
  }

  private tryEnterTube() {
    if (this.tubeCooldown > 0) return;
    const player = this.world.players[LOCAL_PLAYER_ID];
    if (!player || player.status !== "active") return;
    for (const tube of WORLD_3D.airTubes) {
      const fromEntry = this.insideVolume(player, tube.entry);
      const fromExit = tube.bidirectional && this.insideVolume(player, tube.exit);
      if (!fromEntry && !fromExit) continue;
      const curve = this.tubeCurves.get(tube.id);
      if (!curve) continue;
      this.tubeRide = { curve, elapsed: 0, duration: tube.travelSeconds, reverse: Boolean(fromExit) };
      player.vx = 0; player.vy = 0; player.vz = 0; player.grounded = false;
      this.audio.tube();
      break;
    }
  }

  private applyInteractiveForces(dt: number) {
    const player = this.world.players[LOCAL_PLAYER_ID];
    if (!player || player.status !== "active") return;

    for (const zone of WORLD_3D.windZones) {
      if (!this.insideVolume(player, zone)) continue;
      player.vx = THREE.MathUtils.clamp(player.vx + zone.force.x * dt, -13, 13);
      player.vy = THREE.MathUtils.clamp(player.vy + zone.force.y * dt, -25, 18);
      player.vz = THREE.MathUtils.clamp(player.vz + zone.force.z * dt, -13, 13);
    }

    if (this.boostCooldown > 0) return;
    for (const pad of WORLD_3D.boostPads) {
      if (!this.insideVolume(player, pad)) continue;
      player.vx = pad.launchVelocity.x;
      player.vy = pad.launchVelocity.y;
      player.vz = pad.launchVelocity.z;
      player.grounded = false;
      player.groundObjectId = null;
      player.jumpCutAvailable = false;
      this.boostCooldown = pad.cooldownSeconds;
      this.audio.boost();
      this.burstAt(new THREE.Vector3(player.x, player.y - 0.6, player.z), new THREE.Color(pad.color).getHex());
      break;
    }
  }

  private updateTubeRide(dt: number) {
    if (!this.tubeRide) return;
    const player = this.world.players[LOCAL_PLAYER_ID];
    this.tubeRide.elapsed += dt;
    const raw = THREE.MathUtils.clamp(this.tubeRide.elapsed / this.tubeRide.duration, 0, 1);
    const eased = raw * raw * (3 - 2 * raw);
    const progress = this.tubeRide.reverse ? 1 - eased : eased;
    const point = this.tubeRide.curve.getPointAt(progress);
    const tangent = this.tubeRide.curve.getTangentAt(progress).multiplyScalar(this.tubeRide.reverse ? -1 : 1);
    player.x = point.x; player.y = point.y; player.z = point.z;
    player.vx = tangent.x * 8; player.vy = tangent.y * 8; player.vz = tangent.z * 8;
    player.facingYaw = Math.atan2(tangent.x, tangent.z);
    if (raw >= 1) {
      player.vx = tangent.x * 3; player.vy = Math.max(0, tangent.y * 3); player.vz = tangent.z * 3;
      this.tubeRide = null;
      this.tubeCooldown = 1.1;
    }
  }

  private insideVolume(player: PlayerState3D, volume: { position: { x: number; y: number; z: number }; size: { x: number; y: number; z: number } }) {
    return Math.abs(player.x - volume.position.x) <= volume.size.x / 2 &&
      Math.abs(player.y - volume.position.y) <= volume.size.y / 2 &&
      Math.abs(player.z - volume.position.z) <= volume.size.z / 2;
  }

  private syncWorldMeshes(time: number) {
    const player = this.world.players[LOCAL_PLAYER_ID];
    this.canvas.dataset.playerPosition = `${player.x.toFixed(3)},${player.y.toFixed(3)},${player.z.toFixed(3)}`;
    this.canvas.dataset.cameraYaw = this.cameraYaw.toFixed(4);
    this.canvas.dataset.playerGrounded = String(player.grounded);
    this.playerGroup.visible = player.status !== "dead" && player.status !== "game-over";
    this.playerGroup.position.set(player.x, player.y, player.z);
    this.playerGroup.rotation.y = THREE.MathUtils.lerp(this.playerGroup.rotation.y, player.facingYaw, 0.24);
    this.animateCharacter(this.playerGroup, player.vx, player.vy, player.vz, player.grounded, time);
    for (const platform of this.world.platforms) {
      const mesh = this.platformMeshes.get(platform.id);
      if (mesh) mesh.position.set(platform.x, platform.y, platform.z);
    }
    for (const item of this.world.collectibles) {
      const mesh = this.collectibleMeshes.get(item.id);
      if (!mesh) continue;
      mesh.visible = !item.collected;
      if (mesh.visible) {
        mesh.rotation.y = time * (item.id.startsWith("star-medal") ? 0.0014 : 0.0028);
        mesh.position.y = (Number(mesh.userData.baseY) || item.y) + Math.sin(time * 0.003 + item.x) * 0.12;
      }
    }
    for (const enemy of this.world.enemies) {
      const mesh = this.enemyMeshes.get(enemy.id);
      if (!mesh) continue;
      mesh.visible = enemy.alive;
      mesh.position.set(enemy.x, enemy.y, enemy.z);
      mesh.rotation.y = enemy.patrolAxis === "x" ? (enemy.direction > 0 ? Math.PI / 2 : -Math.PI / 2) : (enemy.direction > 0 ? 0 : Math.PI);
      mesh.position.y += Math.sin(time * 0.005 + enemy.x) * 0.04;
    }
    for (const hazard of this.world.hazards) {
      const mesh = this.hazardMeshes.get(hazard.id);
      if (!mesh) continue;
      mesh.visible = hazard.active;
      mesh.userData.hazardActive = hazard.active;
    }
  }

  private updateCamera(player: PlayerState3D, dt: number) {
    const target = new THREE.Vector3(player.x, player.y + 0.75, player.z);
    const targetAlpha = 1 - Math.exp(-dt * 11);
    this.cameraTarget.lerp(target, targetAlpha);
    const horizontal = Math.cos(this.cameraPitch) * this.cameraDistance;
    this.cameraDesired.set(
      this.cameraTarget.x + Math.sin(this.cameraYaw) * horizontal,
      this.cameraTarget.y - Math.sin(this.cameraPitch) * this.cameraDistance,
      this.cameraTarget.z + Math.cos(this.cameraYaw) * horizontal,
    );
    const ray = this.cameraDesired.clone().sub(this.cameraTarget);
    const distance = ray.length();
    ray.normalize();
    this.raycaster.set(this.cameraTarget, ray);
    this.raycaster.far = distance;
    const hit = this.raycaster.intersectObjects(this.cameraColliders, false)[0];
    if (hit && hit.distance < distance) this.cameraDesired.copy(this.cameraTarget).addScaledVector(ray, Math.max(2.8, hit.distance - 0.55));
    const cameraAlpha = 1 - Math.exp(-dt * 9);
    this.camera.position.lerp(this.cameraDesired, cameraAlpha);
    this.camera.lookAt(this.cameraTarget);
  }

  private resetCamera(instant: boolean) {
    const player = this.world.players[LOCAL_PLAYER_ID];
    this.cameraYaw = -2.42;
    this.cameraPitch = -0.38;
    this.cameraDistance = WORLD_3D.camera.followDistance * 0.84;
    this.cameraTarget.set(player.x, player.y + 0.75, player.z);
    const horizontal = Math.cos(this.cameraPitch) * this.cameraDistance;
    this.cameraDesired.set(
      this.cameraTarget.x + Math.sin(this.cameraYaw) * horizontal,
      this.cameraTarget.y - Math.sin(this.cameraPitch) * this.cameraDistance,
      this.cameraTarget.z + Math.cos(this.cameraYaw) * horizontal,
    );
    if (instant) this.camera.position.copy(this.cameraDesired);
    this.camera.lookAt(this.cameraTarget);
  }

  private updateRemoteAvatars(dt: number, time: number) {
    const now = performance.now();
    for (const [id, avatar] of this.remoteAvatars) {
      if (now - avatar.lastSeen > 8_000) {
        this.worldGroup.remove(avatar.group);
        this.disposeObject(avatar.group);
        this.remoteAvatars.delete(id);
        continue;
      }
      const z = Number.isFinite(avatar.target.z) ? avatar.target.z : 0;
      const target = new THREE.Vector3(avatar.target.x, avatar.target.y, z);
      avatar.group.position.lerp(target, 1 - Math.exp(-dt * 12));
      avatar.group.rotation.y = THREE.MathUtils.lerp(avatar.group.rotation.y, avatar.target.facing, 1 - Math.exp(-dt * 10));
      this.animateCharacter(avatar.group, avatar.target.vx, avatar.target.vy, avatar.target.vz ?? 0, avatar.target.action !== "jump" && avatar.target.action !== "dash", time);
    }
  }

  private updateRemoteSkin(avatar: RemoteAvatar, skin: string) {
    const next = this.createCookieCharacter(skin, true);
    next.position.copy(avatar.group.position);
    next.rotation.copy(avatar.group.rotation);
    this.worldGroup.remove(avatar.group);
    this.disposeObject(avatar.group);
    avatar.group = next;
    this.worldGroup.add(next);
  }

  private animateCharacter(group: THREE.Group, vx: number, vy: number, vz: number, grounded: boolean, time: number) {
    const speed = Math.hypot(vx, vz);
    const stride = grounded ? Math.sin(time * 0.013 * Math.max(1, speed * 0.45)) * Math.min(0.7, speed * 0.09) : 0.24;
    const leftArm = group.getObjectByName("left-arm");
    const rightArm = group.getObjectByName("right-arm");
    const leftLeg = group.getObjectByName("left-leg");
    const rightLeg = group.getObjectByName("right-leg");
    if (leftArm) leftArm.rotation.x = -stride - (grounded ? 0 : 0.35);
    if (rightArm) rightArm.rotation.x = stride - (grounded ? 0 : 0.35);
    if (leftLeg) leftLeg.rotation.x = stride;
    if (rightLeg) rightLeg.rotation.x = -stride;
    const body = group.getObjectByName("cookie-body");
    if (body) {
      body.rotation.z = grounded ? Math.sin(time * 0.006) * 0.025 : THREE.MathUtils.clamp(-vy * 0.012, -0.13, 0.13);
      const stretch = speed > 13 ? 1.12 : 1;
      body.scale.lerp(new THREE.Vector3(stretch, speed > 13 ? 0.88 : 1, stretch), 0.24);
    }
  }

  private setupLights() {
    this.hemisphereLight = new THREE.HemisphereLight(WORLD_3D.theme.light.ambient, 0x9f713f, WORLD_3D.theme.light.ambientIntensity);
    this.scene.add(this.hemisphereLight);
    this.sunLight = new THREE.DirectionalLight(WORLD_3D.theme.light.sun, WORLD_3D.theme.light.sunIntensity);
    this.sunLight.position.set(-75, 118, 80);
    this.sunLight.target.position.set(10, 0, 130);
    this.sunLight.castShadow = true;
    this.sunLight.shadow.mapSize.set(2048, 2048);
    this.sunLight.shadow.camera.left = -150;
    this.sunLight.shadow.camera.right = 150;
    this.sunLight.shadow.camera.top = 220;
    this.sunLight.shadow.camera.bottom = -180;
    this.sunLight.shadow.camera.near = 10;
    this.sunLight.shadow.camera.far = 420;
    this.sunLight.shadow.bias = -0.00018;
    this.scene.add(this.sunLight, this.sunLight.target);
  }

  private buildEnvironment() {
    const waterMaterial = new THREE.MeshPhysicalMaterial({
      color: WORLD_3D.theme.palette.water,
      roughness: 0.16,
      metalness: 0.02,
      transparent: true,
      opacity: 0.9,
      clearcoat: 0.75,
      clearcoatRoughness: 0.18,
    });
    const water = new THREE.Mesh(new THREE.PlaneGeometry(360, 500, 18, 24), waterMaterial);
    water.rotation.x = -Math.PI / 2;
    water.position.set(10, WORLD_3D.waterLevelY, 120);
    water.receiveShadow = true;
    water.name = "shimmering-water";
    this.worldGroup.add(water);

    const skyGeometry = new THREE.SphereGeometry(520, 36, 22);
    const skyMaterial = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      uniforms: {
        topColor: { value: new THREE.Color(WORLD_3D.theme.sky.zenith) },
        bottomColor: { value: new THREE.Color(WORLD_3D.theme.sky.horizon) },
        offset: { value: 12 },
        exponent: { value: 0.72 },
      },
      vertexShader: "varying vec3 vWorldPosition; void main(){ vec4 worldPosition = modelMatrix * vec4(position, 1.0); vWorldPosition = worldPosition.xyz; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
      fragmentShader: "uniform vec3 topColor; uniform vec3 bottomColor; uniform float offset; uniform float exponent; varying vec3 vWorldPosition; void main(){ float h = normalize(vWorldPosition + vec3(0.0, offset, 0.0)).y; gl_FragColor = vec4(mix(bottomColor, topColor, max(pow(max(h, 0.0), exponent), 0.0)), 1.0); }",
    });
    const sky = new THREE.Mesh(skyGeometry, skyMaterial);
    sky.position.set(10, -20, 120);
    this.skyMaterial = skyMaterial;
    this.scene.add(sky);

    const cloudPositions = [
      [-72, 21, -25, 1.6], [-45, 31, 12, 1.15], [-18, 25, 80, 1.5], [24, 34, -30, 1.3],
      [61, 22, -2, 1.55], [83, 36, 58, 1.2], [48, 25, 112, 1.7], [-64, 39, 105, 1.45],
      [-96, 29, 46, 1.2], [94, 28, -48, 1.4], [5, 42, 125, 1.05], [8, 29, -76, 1.6],
      [-55, 35, 178, 1.5], [80, 30, 205, 1.25], [22, 42, 238, 1.4], [-70, 31, 270, 1.55],
      [65, 38, 292, 1.35], [5, 47, 320, 1.2],
    ] as const;
    for (const [x, y, z, scale] of cloudPositions) {
      const cloud = this.createCloud(scale);
      cloud.position.set(x, y, z);
      this.worldGroup.add(cloud);
    }

    const sun = new THREE.Mesh(
      new THREE.SphereGeometry(7, 28, 20),
      new THREE.MeshBasicMaterial({ color: 0xfff3a4, fog: false }),
    );
    sun.position.set(-92, 72, -126);
    this.worldGroup.add(sun);
  }

  private buildLevel() {
    for (const platform of WORLD_3D.platforms) {
      const group = this.createPlatform(platform.material, platform.size, platform.edgeRadius);
      group.position.set(platform.position.x, platform.position.y, platform.position.z);
      const rotation = (platform as { rotation?: { x: number; y: number; z: number } }).rotation;
      if (rotation) group.rotation.set(rotation.x, rotation.y, rotation.z);
      group.name = platform.id;
      this.worldGroup.add(group);
      this.platformMeshes.set(platform.id, group);
      const collider = group.getObjectByName("camera-collider");
      if (collider) this.cameraColliders.push(collider);
    }
    for (const platform of WORLD_3D.movingPlatforms) {
      const group = this.createPlatform(platform.material, platform.size, 0.32);
      const simulationPlatform = this.world.platforms.find((item) => item.id === platform.id);
      group.position.set(
        simulationPlatform?.x ?? platform.position.x,
        simulationPlatform?.y ?? platform.position.y,
        simulationPlatform?.z ?? platform.position.z,
      );
      group.name = platform.id;
      this.worldGroup.add(group);
      this.platformMeshes.set(platform.id, group);
      const collider = group.getObjectByName("camera-collider");
      if (collider) this.cameraColliders.push(collider);
    }
    for (const ramp of WORLD_3D.ramps) {
      const texture = this.makeTexture("/textures/path-felt.png", 1.2, 3.5);
      const mesh = new THREE.Mesh(
        new THREE.BoxGeometry(ramp.size.x, ramp.size.y, ramp.size.z),
        new THREE.MeshStandardMaterial({ map: texture, color: 0xffd05c, roughness: 0.98 }),
      );
      mesh.position.set(ramp.position.x, ramp.position.y, ramp.position.z);
      mesh.rotation.set(ramp.rotation.x, ramp.rotation.y, ramp.rotation.z);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      this.worldGroup.add(mesh);
    }
    for (const road of WORLD_3D.roads) this.worldGroup.add(this.createRoad(road));
    for (const fence of WORLD_3D.fences) this.worldGroup.add(this.createFence(fence.points, fence.height, fence.postSpacing, fence.postWidth, fence.railWidth));
    for (const tube of WORLD_3D.airTubes) this.worldGroup.add(this.createAirTube(tube));
    for (const pad of WORLD_3D.boostPads) {
      const mesh = this.createBoostPad(pad);
      mesh.position.set(pad.position.x, pad.position.y - pad.size.y / 2, pad.position.z);
      this.worldGroup.add(mesh);
    }
    for (const zone of WORLD_3D.windZones) {
      const mesh = this.createWindZone(zone);
      mesh.position.set(zone.position.x, zone.position.y, zone.position.z);
      this.worldGroup.add(mesh);
    }

    for (const item of WORLD_3D.collectibles) {
      const mesh = this.createCollectible(item.kind);
      mesh.position.set(item.position.x, item.position.y, item.position.z);
      mesh.userData.baseY = item.position.y;
      this.collectibleMeshes.set(item.id, mesh);
      this.worldGroup.add(mesh);
    }
    for (const enemy of WORLD_3D.enemies) {
      const mesh = this.createEnemy(enemy.kind, enemy.id);
      mesh.position.set(enemy.position.x, enemy.position.y, enemy.position.z);
      this.enemyMeshes.set(enemy.id, mesh);
      this.worldGroup.add(mesh);
    }
    for (const hazard of WORLD_3D.hazards) {
      if (hazard.kind === "water" || hazard.kind === "void" || hazard.visual === "invisible") continue;
      const mesh = hazard.kind === "spikes"
        ? this.createSpikes(hazard.size.x, hazard.size.z)
        : hazard.kind === "steam"
          ? this.createSteamJet(hazard.size.x, hazard.size.y)
          : this.createMoltenHazard(hazard.size.x, hazard.size.y, hazard.size.z);
      mesh.position.set(hazard.position.x, hazard.position.y - hazard.size.y / 2, hazard.position.z);
      mesh.name = hazard.id;
      this.hazardMeshes.set(hazard.id, mesh);
      this.worldGroup.add(mesh);
    }
    for (const checkpoint of WORLD_3D.checkpoints) {
      const mesh = this.createCheckpoint(checkpoint.order);
      mesh.position.set(checkpoint.position.x, checkpoint.position.y - checkpoint.size.y / 2, checkpoint.position.z);
      this.checkpointMeshes.set(checkpoint.id, mesh);
      this.worldGroup.add(mesh);
    }
    for (const decoration of WORLD_3D.decorations) {
      const mesh = this.createDecoration(decoration);
      mesh.position.set(decoration.position.x, decoration.position.y, decoration.position.z);
      mesh.rotation.y = decoration.yawRadians;
      mesh.scale.set(decoration.scale.x, decoration.scale.y, decoration.scale.z);
      this.worldGroup.add(mesh);
    }
    for (const prop of WORLD_3D.assetProps) this.loadAssetProp(prop);
    const goal = this.createGoal();
    goal.position.set(WORLD_3D.goal.position.x, WORLD_3D.goal.position.y - WORLD_3D.goal.size.y / 2, WORLD_3D.goal.position.z);
    goal.rotation.y = WORLD_3D.goal.facingYawRadians;
    this.worldGroup.add(goal);
  }

  private makeTexture(url: string, repeatX: number, repeatY: number) {
    const roundedX = Math.max(0.25, Math.round(repeatX * 2) / 2);
    const roundedY = Math.max(0.25, Math.round(repeatY * 2) / 2);
    const key = `${url}|${roundedX}|${roundedY}`;
    const cached = this.textureCache.get(key);
    if (cached) return cached;
    const texture = new THREE.TextureLoader().load(url);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(roundedX, roundedY);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = Math.min(8, this.renderer.capabilities.getMaxAnisotropy());
    this.textureCache.set(key, texture);
    return texture;
  }

  private createPlatform(materialName: string, size: { x: number; y: number; z: number }, edgeRadius: number) {
    const group = new THREE.Group();
    const isGrass = materialName === "felt_grass" || materialName === "felt_grass_high";
    const isStone = materialName === "cream_stone" || materialName === "sunstone";
    const isMetal = materialName === "toy_metal" || materialName === "clockwork_brass";
    const isIce = materialName === "frosted_ice";
    const isCocoa = materialName === "cocoa_wafer";
    const isLavaRock = materialName === "lava_rock";
    const isMoon = materialName === "moonstone";
    const isGlass = materialName === "cloud_glass";
    const baseTexture = isGrass || isCocoa
      ? this.makeTexture("/textures/soil-felt.png", size.x / 6, size.y / 4)
      : null;
    const baseColor = materialName === "cream_stone" ? 0xfff1d0
      : materialName === "sunstone" ? 0xf2b948
        : materialName === "toy_metal" ? 0x83d9e9
          : materialName === "clockwork_brass" ? 0xb7782f
            : isIce ? 0x88dff2
              : isCocoa ? 0x713b2d
                : isLavaRock ? 0x3b2730
                  : isMoon ? 0x878bd5
                    : isGlass ? 0xbdefff
                      : 0xe0aa48;
    const baseMaterial = isGlass
      ? new THREE.MeshPhysicalMaterial({ color: baseColor, transparent: true, opacity: 0.62, transmission: 0.35, roughness: 0.12, metalness: 0.02, clearcoat: 0.8 })
      : new THREE.MeshStandardMaterial({
      map: isGrass || isCocoa ? baseTexture : null,
      color: baseColor,
      roughness: isStone ? 0.75 : isMetal ? 0.42 : isIce ? 0.2 : isMoon ? 0.52 : 0.96,
      metalness: isMetal ? 0.48 : isMoon ? 0.08 : 0,
      emissive: isLavaRock ? 0x22050a : isMoon ? 0x20275f : 0x000000,
      emissiveIntensity: isLavaRock ? 0.35 : isMoon ? 0.16 : 0,
    });
    const base = new THREE.Mesh(new THREE.BoxGeometry(size.x, size.y, size.z, 1, 1, 1), baseMaterial);
    base.castShadow = true;
    base.receiveShadow = true;
    base.name = "camera-collider";
    group.add(base);
    if (isGrass) {
      const grassTexture = this.makeTexture("/textures/grass-felt.png", size.x / 5, size.z / 5);
      const top = new THREE.Mesh(
        new THREE.BoxGeometry(Math.max(0.2, size.x - edgeRadius * 0.25), 0.28, Math.max(0.2, size.z - edgeRadius * 0.25)),
        new THREE.MeshStandardMaterial({ map: grassTexture, color: materialName === "felt_grass_high" ? 0x55d968 : 0x50d65f, roughness: 1 }),
      );
      top.position.y = size.y / 2 + 0.11;
      top.castShadow = true;
      top.receiveShadow = true;
      group.add(top);
      const edge = new THREE.Mesh(
        new THREE.BoxGeometry(size.x + 0.08, 0.22, size.z + 0.08),
        new THREE.MeshStandardMaterial({ color: 0x249b42, roughness: 1 }),
      );
      edge.position.y = size.y / 2 - 0.03;
      edge.receiveShadow = true;
      group.add(edge);
    } else if (isMetal) {
      const trim = new THREE.Mesh(
        new THREE.BoxGeometry(size.x * 0.84, 0.16, size.z * 0.84),
        new THREE.MeshStandardMaterial({ color: materialName === "clockwork_brass" ? 0xffcf67 : 0xfaf1d4, metalness: 0.32, roughness: 0.4 }),
      );
      trim.position.y = size.y / 2 + 0.07;
      group.add(trim);
      const rivetMaterial = new THREE.MeshStandardMaterial({ color: 0x5b6470, metalness: 0.72, roughness: 0.24 });
      for (const [x, z] of [[-0.38, -0.38], [0.38, -0.38], [-0.38, 0.38], [0.38, 0.38]] as const) {
        const rivet = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.08, 10), rivetMaterial);
        rivet.position.set(x * size.x, size.y / 2 + 0.17, z * size.z);
        group.add(rivet);
      }
    } else if (isIce) {
      const cap = new THREE.Mesh(
        new THREE.BoxGeometry(Math.max(0.3, size.x - 0.12), 0.22, Math.max(0.3, size.z - 0.12)),
        new THREE.MeshPhysicalMaterial({ color: 0xc9f7ff, transparent: true, opacity: 0.78, transmission: 0.35, roughness: 0.08, clearcoat: 1 }),
      );
      cap.position.y = size.y / 2 + 0.08;
      cap.receiveShadow = true;
      group.add(cap);
    } else if (isCocoa) {
      const cream = new THREE.Mesh(
        new THREE.BoxGeometry(size.x + 0.04, 0.22, size.z + 0.04),
        new THREE.MeshStandardMaterial({ color: 0xf4e5c5, roughness: 0.82 }),
      );
      cream.position.y = size.y / 2 - 0.06;
      group.add(cream);
      const wafer = new THREE.Mesh(
        new THREE.BoxGeometry(size.x * 0.96, 0.18, size.z * 0.96),
        new THREE.MeshStandardMaterial({ map: baseTexture, color: 0x8c5035, roughness: 0.94 }),
      );
      wafer.position.y = size.y / 2 + 0.11;
      group.add(wafer);
    } else if (isLavaRock) {
      const glow = new THREE.Mesh(
        new THREE.BoxGeometry(size.x * 0.72, 0.09, Math.max(0.12, size.z * 0.08)),
        new THREE.MeshStandardMaterial({ color: 0xff6a33, emissive: 0xff2b0a, emissiveIntensity: 1.7, roughness: 0.5 }),
      );
      glow.position.set(size.x * 0.08, size.y / 2 + 0.07, -size.z * 0.1);
      glow.rotation.y = 0.32;
      group.add(glow);
    } else if (isMoon || isGlass) {
      const cap = new THREE.Mesh(
        new THREE.BoxGeometry(Math.max(0.3, size.x - edgeRadius * 0.2), 0.18, Math.max(0.3, size.z - edgeRadius * 0.2)),
        new THREE.MeshStandardMaterial({ color: isGlass ? 0xe7fbff : 0xc4c4ff, emissive: isGlass ? 0x2b7995 : 0x4c4e9a, emissiveIntensity: 0.32, roughness: 0.38, transparent: isGlass, opacity: isGlass ? 0.78 : 1 }),
      );
      cap.position.y = size.y / 2 + 0.08;
      group.add(cap);
    }
    return group;
  }

  private createRoad(road: GroundRoad) {
    const curve = new THREE.CatmullRomCurve3(road.points.map((point) => new THREE.Vector3(point.x, point.y + 0.24, point.z)), false, "catmullrom", 0.45);
    const divisions = Math.max(24, road.points.length * 16);
    const positions: number[] = [];
    const uvs: number[] = [];
    const indices: number[] = [];
    const totalLength = curve.getLength();
    for (let index = 0; index <= divisions; index += 1) {
      const t = index / divisions;
      const point = curve.getPointAt(t);
      const tangent = curve.getTangentAt(t);
      const side = new THREE.Vector3(-tangent.z, 0, tangent.x).normalize().multiplyScalar(road.width / 2);
      const left = point.clone().add(side);
      const right = point.clone().sub(side);
      positions.push(left.x, left.y, left.z, right.x, right.y, right.z);
      const u = t * totalLength / 4;
      uvs.push(u, 0, u, 1);
      if (index < divisions) {
        const a = index * 2;
        indices.push(a, a + 2, a + 1, a + 2, a + 3, a + 1);
      }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    const roadColor = road.id.includes("frost") ? 0xb8efff
      : road.id.includes("cocoa") ? 0xd9783f
        : road.id.includes("moon") ? 0xd8d0ff
          : 0xffca49;
    const mesh = new THREE.Mesh(
      geometry,
      new THREE.MeshStandardMaterial({ map: this.makeTexture("/textures/path-felt.png", 1, 1), color: roadColor, roughness: 1, side: THREE.DoubleSide }),
    );
    mesh.receiveShadow = true;
    return mesh;
  }

  private createFence(points: readonly { x: number; y: number; z: number }[], height: number, spacing: number, postWidth: number, railWidth: number) {
    const group = new THREE.Group();
    const material = new THREE.MeshStandardMaterial({ color: 0xfff8df, roughness: 0.82 });
    for (let segment = 0; segment < points.length - 1; segment += 1) {
      const start = new THREE.Vector3(points[segment].x, points[segment].y, points[segment].z);
      const end = new THREE.Vector3(points[segment + 1].x, points[segment + 1].y, points[segment + 1].z);
      const length = start.distanceTo(end);
      const count = Math.max(1, Math.ceil(length / spacing));
      for (let index = 0; index <= count; index += 1) {
        if (segment > 0 && index === 0) continue;
        const position = start.clone().lerp(end, index / count);
        const post = new THREE.Mesh(new THREE.BoxGeometry(postWidth, height, postWidth), material);
        post.position.set(position.x, position.y + height / 2, position.z);
        post.castShadow = true;
        group.add(post);
      }
      const midpoint = start.clone().lerp(end, 0.5);
      const angle = -Math.atan2(end.z - start.z, end.x - start.x);
      for (const railHeight of [height * 0.42, height * 0.72]) {
        const rail = new THREE.Mesh(new THREE.BoxGeometry(length, railWidth, railWidth), material);
        rail.position.set(midpoint.x, midpoint.y + railHeight, midpoint.z);
        rail.rotation.y = angle;
        rail.castShadow = true;
        group.add(rail);
      }
    }
    return group;
  }

  private createAirTube(tube: AirTube) {
    const group = new THREE.Group();
    const curve = new THREE.CatmullRomCurve3(tube.points.map((point) => new THREE.Vector3(point.x, point.y, point.z)), false, "catmullrom", 0.45);
    this.tubeCurves.set(tube.id, curve);
    const shell = new THREE.Mesh(
      new THREE.TubeGeometry(curve, 72, tube.radius, 16, false),
      new THREE.MeshPhysicalMaterial({
        color: tube.color,
        transparent: true,
        opacity: tube.opacity,
        roughness: 0.06,
        metalness: 0,
        transmission: 0.68,
        thickness: 0.25,
        clearcoat: 1,
        side: THREE.DoubleSide,
        depthWrite: false,
      }),
    );
    shell.castShadow = false;
    group.add(shell);
    const ringMaterial = new THREE.MeshStandardMaterial({ color: 0xe9fdff, transparent: true, opacity: 0.72, roughness: 0.16 });
    for (let index = 0; index <= 12; index += 1) {
      const t = index / 12;
      const ring = new THREE.Mesh(new THREE.TorusGeometry(tube.radius + 0.03, 0.075, 8, 24), ringMaterial);
      ring.position.copy(curve.getPointAt(t));
      ring.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), curve.getTangentAt(t).normalize());
      group.add(ring);
    }
    const flowMaterial = new THREE.MeshBasicMaterial({ color: tube.flowColor, transparent: true, opacity: 0.92 });
    for (let index = 0; index < 7; index += 1) {
      const orb = new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 8), flowMaterial);
      orb.userData.tubeCurve = curve;
      orb.userData.tubeOffset = index / 7;
      group.add(orb);
    }
    return group;
  }

  private createBoostPad(pad: BoostPad) {
    const group = new THREE.Group();
    group.name = pad.id;
    const color = new THREE.Color(pad.color);
    const base = new THREE.Mesh(
      new THREE.CylinderGeometry(1.55, 1.75, 0.32, 24),
      new THREE.MeshStandardMaterial({ color: 0x345e77, metalness: 0.32, roughness: 0.48 }),
    );
    base.position.y = 0.16;
    base.castShadow = true;
    group.add(base);
    const spring = new THREE.Mesh(
      new THREE.CylinderGeometry(1.25, 1.4, 0.24, 24),
      new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.22, roughness: 0.58 }),
    );
    spring.position.y = 0.42;
    spring.name = "boost-spring";
    group.add(spring);
    for (let index = 0; index < 3; index += 1) {
      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(0.48 + index * 0.28, 0.055, 8, 28),
        new THREE.MeshBasicMaterial({ color: index % 2 ? 0xffffff : color, transparent: true, opacity: 0.72 }),
      );
      ring.rotation.x = -Math.PI / 2;
      ring.position.y = 0.57 + index * 0.08;
      ring.name = "boost-ring";
      ring.userData.ringIndex = index;
      group.add(ring);
    }
    return group;
  }

  private createWindZone(zone: WindZone) {
    const group = new THREE.Group();
    group.name = zone.id;
    group.rotation.y = Math.atan2(zone.force.x, zone.force.z);
    const material = new THREE.MeshBasicMaterial({
      color: zone.color,
      transparent: true,
      opacity: 0.2,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const length = Math.max(zone.size.x, zone.size.z);
    for (let index = 0; index < 10; index += 1) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(1.1 + (index % 3) * 0.24, 0.045, 8, 24), material.clone());
      ring.position.set(
        ((index * 1.71) % 4 - 2) * 0.48,
        ((index * 1.19) % 4 - 2) * 0.48,
        -length / 2 + index / 9 * length,
      );
      ring.name = "wind-ring";
      ring.userData.windLength = length;
      ring.userData.windSpeed = 4.4 + (index % 3) * 0.7;
      group.add(ring);
    }
    return group;
  }

  private createCookieCharacter(skin: string, remote: boolean) {
    const palette = SKIN_COLORS[skin] ?? SKIN_COLORS.classic;
    const group = new THREE.Group();
    group.scale.setScalar(remote ? 0.93 : 1);
    const cookie = new THREE.Group();
    cookie.name = "cookie-body";
    cookie.position.y = 0.1;
    group.add(cookie);

    const dark = new THREE.MeshStandardMaterial({ color: 0x4d2a1b, roughness: 0.88 });
    const edgeDark = new THREE.MeshStandardMaterial({ color: 0x301a13, roughness: 0.9 });
    const cream = new THREE.MeshStandardMaterial({ color: palette.cream, roughness: 0.72 });
    const trim = new THREE.MeshStandardMaterial({ color: palette.trim, roughness: 0.68 });
    const boot = new THREE.MeshStandardMaterial({ color: palette.boot, roughness: 0.78 });
    const glove = new THREE.MeshStandardMaterial({ color: 0xfff6dd, roughness: 0.72 });

    const filling = new THREE.Mesh(new THREE.CylinderGeometry(0.47, 0.47, 0.24, 32), cream);
    filling.rotation.x = Math.PI / 2;
    cookie.add(filling);
    for (const z of [-0.17, 0.17]) {
      const wafer = new THREE.Mesh(new THREE.CylinderGeometry(0.51, 0.51, 0.16, 32), dark);
      wafer.rotation.x = Math.PI / 2;
      wafer.position.z = z;
      wafer.castShadow = true;
      cookie.add(wafer);
      const rim = new THREE.Mesh(new THREE.TorusGeometry(0.39, 0.045, 8, 28), edgeDark);
      rim.position.z = z + Math.sign(z) * 0.085;
      cookie.add(rim);
    }
    const eyeWhite = new THREE.MeshStandardMaterial({ color: 0xfffbeb, roughness: 0.45 });
    const pupilMaterial = new THREE.MeshStandardMaterial({ color: 0x171313, roughness: 0.45 });
    for (const x of [-0.17, 0.17]) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.105, 16, 12), eyeWhite);
      eye.scale.y = 1.25;
      eye.position.set(x, 0.13, 0.28);
      cookie.add(eye);
      const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.045, 12, 10), pupilMaterial);
      pupil.position.set(x + 0.012, 0.13, 0.37);
      cookie.add(pupil);
    }
    const smile = new THREE.Mesh(new THREE.TorusGeometry(0.13, 0.027, 7, 18, Math.PI), pupilMaterial);
    smile.rotation.z = Math.PI;
    smile.position.set(0, -0.07, 0.36);
    cookie.add(smile);
    const cheekMaterial = new THREE.MeshBasicMaterial({ color: 0xd77e65 });
    for (const x of [-0.3, 0.3]) {
      const cheek = new THREE.Mesh(new THREE.SphereGeometry(0.042, 10, 8), cheekMaterial);
      cheek.scale.y = 0.55;
      cheek.position.set(x, -0.02, 0.35);
      cookie.add(cheek);
    }
    const scarf = new THREE.Mesh(new THREE.TorusGeometry(0.43, 0.055, 8, 30), trim);
    scarf.position.set(0, -0.22, 0.03);
    scarf.rotation.z = -0.08;
    cookie.add(scarf);
    const scarfTail = new THREE.Mesh(new THREE.ConeGeometry(0.14, 0.38, 4), trim);
    scarfTail.position.set(0.36, -0.38, -0.03);
    scarfTail.rotation.z = -0.65;
    cookie.add(scarfTail);

    group.add(this.createLimb(dark, glove, -0.48, 0.22, "left-arm", false));
    group.add(this.createLimb(dark, glove, 0.48, 0.22, "right-arm", false));
    group.add(this.createLimb(dark, boot, -0.23, -0.38, "left-leg", true));
    group.add(this.createLimb(dark, boot, 0.23, -0.38, "right-leg", true));
    group.traverse((object) => {
      if (object instanceof THREE.Mesh) {
        object.castShadow = true;
        object.receiveShadow = true;
      }
    });
    return group;
  }

  private createLimb(limbMaterial: THREE.Material, endMaterial: THREE.Material, x: number, y: number, name: string, leg: boolean) {
    const pivot = new THREE.Group();
    pivot.name = name;
    pivot.position.set(x, y, 0);
    const length = leg ? 0.34 : 0.38;
    const limb = new THREE.Mesh(new THREE.CapsuleGeometry(0.065, length, 5, 10), limbMaterial);
    limb.position.y = -length * 0.45;
    limb.rotation.z = leg ? 0 : x < 0 ? -0.28 : 0.28;
    pivot.add(limb);
    const end = new THREE.Mesh(leg ? new THREE.CapsuleGeometry(0.11, 0.12, 5, 10) : new THREE.SphereGeometry(0.13, 14, 10), endMaterial);
    end.position.set(leg ? (x < 0 ? -0.04 : 0.04) : (x < 0 ? -0.08 : 0.08), -length - 0.04, leg ? 0.1 : 0);
    if (leg) end.rotation.x = Math.PI / 2;
    pivot.add(end);
    return pivot;
  }

  private createCollectible(kind: string) {
    const group = new THREE.Group();
    if (kind === "star_medal") {
      const shape = new THREE.Shape();
      const outer = 0.52;
      const inner = 0.23;
      for (let index = 0; index < 10; index += 1) {
        const angle = Math.PI / 2 + index * Math.PI / 5;
        const radius = index % 2 === 0 ? outer : inner;
        const x = Math.cos(angle) * radius;
        const y = Math.sin(angle) * radius;
        if (index === 0) shape.moveTo(x, y); else shape.lineTo(x, y);
      }
      shape.closePath();
      const geometry = new THREE.ExtrudeGeometry(shape, { depth: 0.16, bevelEnabled: true, bevelSize: 0.05, bevelThickness: 0.04, bevelSegments: 2 });
      geometry.center();
      const star = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ color: 0x71ed30, emissive: 0x205a08, emissiveIntensity: 0.28, roughness: 0.34, metalness: 0.08 }));
      group.add(star);
      const glow = new THREE.PointLight(0x80ff46, 0.9, 4);
      group.add(glow);
    } else if (kind === "moon_shard") {
      const shard = new THREE.Mesh(
        new THREE.OctahedronGeometry(0.46, 1),
        new THREE.MeshPhysicalMaterial({ color: 0xbceaff, emissive: 0x506bd8, emissiveIntensity: 0.72, roughness: 0.16, metalness: 0.08, transmission: 0.2, clearcoat: 1 }),
      );
      shard.scale.set(0.62, 1.35, 0.62);
      shard.rotation.z = 0.32;
      group.add(shard);
      const orbit = new THREE.Mesh(
        new THREE.TorusGeometry(0.58, 0.035, 8, 32),
        new THREE.MeshBasicMaterial({ color: 0xe7f7ff, transparent: true, opacity: 0.82 }),
      );
      orbit.rotation.x = Math.PI / 2.8;
      group.add(orbit);
      group.add(new THREE.PointLight(0xa9d9ff, 1.1, 5));
    } else {
      const coin = new THREE.Mesh(
        new THREE.CylinderGeometry(0.34, 0.34, 0.1, 28),
        new THREE.MeshStandardMaterial({ color: 0xffc52f, emissive: 0x8f4a00, emissiveIntensity: 0.24, roughness: 0.28, metalness: 0.52 }),
      );
      coin.rotation.x = Math.PI / 2;
      group.add(coin);
      const rim = new THREE.Mesh(new THREE.TorusGeometry(0.27, 0.035, 7, 24), new THREE.MeshStandardMaterial({ color: 0xffe170, metalness: 0.55, roughness: 0.22 }));
      rim.position.z = 0.06;
      group.add(rim);
    }
    group.traverse((object) => { if (object instanceof THREE.Mesh) object.castShadow = true; });
    return group;
  }

  private createEnemy(kind: string, id = "") {
    const group = new THREE.Group();
    const themedColor = id.includes("frost") ? 0x77cce8 : id.includes("cocoa") ? 0x9d4a2f : id.includes("moon") ? 0x7d78c9 : kind === "tin_beetle" ? 0x5a8da0 : 0x8b4f2d;
    const brown = new THREE.MeshStandardMaterial({ color: themedColor, roughness: 0.8, metalness: kind === "tin_beetle" ? 0.38 : 0 });
    const body = new THREE.Mesh(kind === "spring_puff" || kind === "cloud_mite" ? new THREE.SphereGeometry(0.48, 18, 12) : new THREE.CapsuleGeometry(0.42, 0.22, 6, 16), brown);
    body.scale.set(1.15, kind === "tin_beetle" ? 0.7 : 0.9, 1);
    body.castShadow = true;
    group.add(body);
    const white = new THREE.MeshStandardMaterial({ color: 0xfff7df, roughness: 0.5 });
    const black = new THREE.MeshStandardMaterial({ color: 0x171515, roughness: 0.5 });
    for (const x of [-0.18, 0.18]) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.1, 12, 9), white);
      eye.position.set(x, 0.1, 0.38);
      group.add(eye);
      const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.044, 10, 8), black);
      pupil.position.set(x, 0.09, 0.47);
      group.add(pupil);
    }
    const footMaterial = new THREE.MeshStandardMaterial({ color: 0x4d2f27, roughness: 0.92 });
    for (const x of [-0.25, 0.25]) {
      const foot = new THREE.Mesh(new THREE.SphereGeometry(0.15, 10, 8), footMaterial);
      foot.scale.set(1.25, 0.45, 1.4);
      foot.position.set(x, -0.42, 0.08);
      group.add(foot);
    }
    if (kind === "spring_puff") {
      const spring = new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.035, 6, 20), new THREE.MeshStandardMaterial({ color: 0xffd75f, metalness: 0.45, roughness: 0.3 }));
      spring.rotation.x = Math.PI / 2;
      spring.position.y = -0.39;
      group.add(spring);
    }
    if (kind === "tin_beetle") {
      for (const x of [-0.28, 0.28]) {
        const horn = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.42, 8), new THREE.MeshStandardMaterial({ color: 0xf6d27a, metalness: 0.5, roughness: 0.35 }));
        horn.position.set(x, 0.16, 0.48);
        horn.rotation.x = Math.PI / 2;
        group.add(horn);
      }
    }
    if (kind === "cloud_mite") {
      for (const x of [-0.52, 0.52]) {
        const wing = new THREE.Mesh(new THREE.SphereGeometry(0.28, 12, 8), new THREE.MeshPhysicalMaterial({ color: 0xe9fbff, transparent: true, opacity: 0.72, roughness: 0.18 }));
        wing.scale.set(0.45, 1, 1.4);
        wing.position.set(x, 0.08, -0.05);
        group.add(wing);
      }
    }
    return group;
  }

  private createSteamJet(width: number, height: number) {
    const group = new THREE.Group();
    const base = new THREE.Mesh(
      new THREE.CylinderGeometry(width * 0.32, width * 0.42, 0.28, 20),
      new THREE.MeshStandardMaterial({ color: 0x69727c, metalness: 0.68, roughness: 0.35 }),
    );
    base.position.y = 0.14;
    group.add(base);
    const material = new THREE.MeshPhysicalMaterial({ color: 0xeefcff, transparent: true, opacity: 0.48, roughness: 0.08, depthWrite: false });
    for (let index = 0; index < 9; index += 1) {
      const puff = new THREE.Mesh(new THREE.SphereGeometry(0.35 + (index % 3) * 0.1, 12, 8), material.clone());
      puff.name = "steam-particle";
      puff.userData.phase = index / 9;
      puff.userData.jetHeight = height;
      group.add(puff);
    }
    const glow = new THREE.PointLight(0xbfeeff, 0.8, Math.max(4, height));
    glow.position.y = 0.6;
    group.add(glow);
    return group;
  }

  private createMoltenHazard(width: number, height: number, depth: number) {
    const group = new THREE.Group();
    const molten = new THREE.MeshStandardMaterial({ color: 0xff6438, emissive: 0xd92309, emissiveIntensity: 1.35, roughness: 0.42, metalness: 0.06 });
    if (width > 10 || depth > 10) {
      const field = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth, 1, 1, 1), molten);
      field.position.y = height / 2;
      field.name = "molten-field";
      group.add(field);
      for (let index = 0; index < 18; index += 1) {
        const bubble = new THREE.Mesh(new THREE.SphereGeometry(0.18 + index % 4 * 0.06, 10, 7), molten.clone());
        bubble.position.set(((index * 7) % 17) / 16 * width - width / 2, height + 0.05, ((index * 11) % 19) / 18 * depth - depth / 2);
        bubble.name = "lava-bubble";
        bubble.userData.phase = index * 0.73;
        group.add(bubble);
      }
    } else {
      const vent = new THREE.Mesh(new THREE.CylinderGeometry(width * 0.34, width * 0.46, 0.35, 18), new THREE.MeshStandardMaterial({ color: 0x422c31, roughness: 0.9 }));
      vent.position.y = 0.18;
      group.add(vent);
      for (let index = 0; index < 8; index += 1) {
        const drop = new THREE.Mesh(new THREE.SphereGeometry(0.18 + index % 3 * 0.05, 10, 7), molten.clone());
        drop.name = "lava-particle";
        drop.userData.phase = index / 8;
        drop.userData.jetHeight = height;
        group.add(drop);
      }
      group.add(new THREE.PointLight(0xff562c, 1.9, Math.max(5, height * 1.2)));
    }
    return group;
  }

  private loadAssetProp(prop: AssetProp) {
    this.gltfLoader.load(
      `/models/kenney-platformer/${prop.kind}.glb`,
      (gltf) => {
        if (this.destroyed) {
          this.disposeObjectResources(gltf.scene);
          return;
        }
        const object = gltf.scene;
        object.name = prop.id;
        object.position.set(prop.position.x, prop.position.y, prop.position.z);
        object.scale.set(prop.scale.x, prop.scale.y, prop.scale.z);
        object.rotation.y = prop.yawRadians;
        object.userData.assetAnimation = prop.animation ?? "none";
        object.userData.baseY = prop.position.y;
        object.traverse((child) => {
          if (!(child instanceof THREE.Mesh)) return;
          child.castShadow = true;
          child.receiveShadow = true;
          const materials = Array.isArray(child.material) ? child.material : [child.material];
          for (const material of materials) {
            if (material instanceof THREE.MeshStandardMaterial) {
              material.roughness = Math.max(0.48, material.roughness);
            }
          }
        });
        if (object.userData.assetAnimation !== "none") this.animatedScenery.add(object);
        this.assetPropMeshes.set(prop.id, object);
        this.worldGroup.add(object);
      },
      undefined,
      () => undefined,
    );
  }

  private createSpikes(width: number, depth: number) {
    const group = new THREE.Group();
    const material = new THREE.MeshStandardMaterial({ color: 0xffeee0, roughness: 0.84 });
    const columns = Math.max(2, Math.floor(width / 0.65));
    const rows = Math.max(2, Math.floor(depth / 0.65));
    for (let x = 0; x < columns; x += 1) {
      for (let z = 0; z < rows; z += 1) {
        const spike = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.7, 8), material);
        spike.position.set((x / Math.max(1, columns - 1) - 0.5) * (width - 0.45), 0.35, (z / Math.max(1, rows - 1) - 0.5) * (depth - 0.45));
        spike.castShadow = true;
        group.add(spike);
      }
    }
    return group;
  }

  private createCheckpoint(order: number) {
    const group = new THREE.Group();
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.11, 2.5, 10), new THREE.MeshStandardMaterial({ color: 0xfff3d8, roughness: 0.74 }));
    pole.position.y = 1.25;
    pole.castShadow = true;
    group.add(pole);
    const wheel = new THREE.Group();
    wheel.name = "checkpoint-wheel";
    wheel.position.y = 2.35;
    const colors = [0xffd449, 0xff7a5d, 0x4cc6e8, 0x78d758];
    for (let index = 0; index < 8; index += 1) {
      const petal = new THREE.Mesh(new THREE.ConeGeometry(0.18, 0.62, 4), new THREE.MeshStandardMaterial({ color: colors[(index + order) % colors.length], roughness: 0.7 }));
      petal.position.set(Math.cos(index * Math.PI / 4) * 0.34, Math.sin(index * Math.PI / 4) * 0.34, 0);
      petal.rotation.z = index * Math.PI / 4 - Math.PI / 2;
      wheel.add(petal);
    }
    const hub = new THREE.Mesh(new THREE.SphereGeometry(0.15, 12, 9), new THREE.MeshStandardMaterial({ color: 0xffeb83, roughness: 0.45 }));
    hub.position.z = 0.08;
    wheel.add(hub);
    group.add(wheel);
    return group;
  }

  private activateCheckpoint(id: string) {
    for (const [checkpointId, mesh] of this.checkpointMeshes) {
      const wheel = mesh.getObjectByName("checkpoint-wheel");
      if (!wheel) continue;
      if (checkpointId === id) {
        wheel.scale.setScalar(1.28);
        const light = new THREE.PointLight(0xffe45a, 1.8, 7);
        light.name = "checkpoint-light";
        wheel.add(light);
      } else {
        wheel.scale.setScalar(1);
        const old = wheel.getObjectByName("checkpoint-light");
        if (old) wheel.remove(old);
      }
    }
  }

  private createGoal() {
    const group = new THREE.Group();
    const stone = new THREE.MeshStandardMaterial({ color: 0xc5c4ff, emissive: 0x454dba, emissiveIntensity: 0.35, roughness: 0.48, metalness: 0.08 });
    for (const x of [-2, 2]) {
      const pillar = new THREE.Mesh(new THREE.CapsuleGeometry(0.38, 3.5, 8, 16), stone);
      pillar.position.set(x, 2.25, 0);
      pillar.castShadow = true;
      group.add(pillar);
    }
    const arch = new THREE.Mesh(new THREE.TorusGeometry(2, 0.38, 12, 36, Math.PI), stone);
    arch.position.y = 4;
    group.add(arch);
    const disc = new THREE.Mesh(new THREE.CylinderGeometry(0.72, 0.72, 0.2, 28), new THREE.MeshStandardMaterial({ color: 0xfff2b8, emissive: 0x8a86ff, emissiveIntensity: 0.75, roughness: 0.28 }));
    disc.rotation.x = Math.PI / 2;
    disc.position.y = 3.85;
    group.add(disc);
    for (let index = 0; index < 12; index += 1) {
      const ray = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.48, 4), stone);
      const angle = index * Math.PI / 6;
      ray.position.set(Math.cos(angle) * 1.05, 3.85 + Math.sin(angle) * 1.05, 0);
      ray.rotation.z = angle - Math.PI / 2;
      group.add(ray);
    }
    const light = new THREE.PointLight(0xc0b9ff, 2.4, 14);
    light.position.y = 3.8;
    group.add(light);
    return group;
  }

  private createDecoration(decoration: Decoration) {
    const group = new THREE.Group();
    const color = new THREE.Color(decoration.color ?? 0xffb556);
    const wood = new THREE.MeshStandardMaterial({ color: 0x9e652f, roughness: 0.92 });
    const leaf = new THREE.MeshStandardMaterial({ color, roughness: 0.94 });
    switch (decoration.kind) {
      case "felt_tree":
      case "puff_tree": {
        const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.4, 2.5, 12), new THREE.MeshStandardMaterial({ color: 0xf0e4c7, roughness: 0.94 }));
        trunk.position.y = 1.25;
        trunk.castShadow = true;
        group.add(trunk);
        if (decoration.kind === "felt_tree") {
          for (const [y, radius] of [[2.15, 1.2], [2.8, 0.95], [3.38, 0.65]] as const) {
            const crown = new THREE.Mesh(new THREE.ConeGeometry(radius, 1.45, 16), leaf);
            crown.position.y = y;
            crown.castShadow = true;
            group.add(crown);
          }
        } else {
          for (const [x, y, z, scale] of [[0, 2.65, 0, 1], [-0.7, 2.5, 0.12, 0.72], [0.68, 2.58, -0.12, 0.76], [0.1, 3.2, 0, 0.72]] as const) {
            const puff = new THREE.Mesh(new THREE.SphereGeometry(0.86 * scale, 16, 12), leaf);
            puff.position.set(x, y, z);
            puff.castShadow = true;
            group.add(puff);
          }
        }
        break;
      }
      case "cloud_bush": {
        for (const [x, y, z, scale] of [[0, 0.52, 0, 1], [-0.62, 0.42, 0.1, 0.72], [0.62, 0.4, -0.08, 0.76]] as const) {
          const puff = new THREE.Mesh(new THREE.SphereGeometry(0.72 * scale, 14, 10), leaf);
          puff.position.set(x, y, z);
          puff.castShadow = true;
          group.add(puff);
        }
        break;
      }
      case "toy_flower_patch": {
        const petals = new THREE.MeshStandardMaterial({ color, roughness: 0.72 });
        const center = new THREE.MeshStandardMaterial({ color: 0xffd348, roughness: 0.5 });
        for (let flowerIndex = 0; flowerIndex < 7; flowerIndex += 1) {
          const flower = new THREE.Group();
          const angle = flowerIndex * 2.399;
          const radius = 0.25 + (flowerIndex % 3) * 0.24;
          flower.position.set(Math.cos(angle) * radius, 0.28 + (flowerIndex % 2) * 0.08, Math.sin(angle) * radius);
          flower.rotation.x = -0.28;
          for (let petalIndex = 0; petalIndex < 5; petalIndex += 1) {
            const petal = new THREE.Mesh(new THREE.SphereGeometry(0.12, 9, 7), petals);
            const a = petalIndex * Math.PI * 2 / 5;
            petal.scale.set(1.25, 0.6, 0.45);
            petal.position.set(Math.cos(a) * 0.15, Math.sin(a) * 0.15, 0);
            flower.add(petal);
          }
          const dot = new THREE.Mesh(new THREE.SphereGeometry(0.09, 9, 7), center);
          dot.position.z = 0.05;
          flower.add(dot);
          group.add(flower);
        }
        break;
      }
      case "direction_sign": {
        const post = new THREE.Mesh(new THREE.BoxGeometry(0.24, 1.8, 0.24), wood);
        post.position.y = 0.9;
        post.castShadow = true;
        group.add(post);
        const board = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.82, 0.16), new THREE.MeshStandardMaterial({ color: 0xb17a3d, roughness: 0.9 }));
        board.position.set(0.22, 1.55, 0);
        board.castShadow = true;
        group.add(board);
        const arrowShape = new THREE.Shape();
        arrowShape.moveTo(-0.58, -0.14); arrowShape.lineTo(0.18, -0.14); arrowShape.lineTo(0.18, -0.34);
        arrowShape.lineTo(0.62, 0); arrowShape.lineTo(0.18, 0.34); arrowShape.lineTo(0.18, 0.14); arrowShape.lineTo(-0.58, 0.14); arrowShape.closePath();
        const arrow = new THREE.Mesh(new THREE.ShapeGeometry(arrowShape), new THREE.MeshStandardMaterial({ color: 0xf05645, roughness: 0.65, side: THREE.DoubleSide }));
        arrow.position.set(0.22, 1.55, 0.09);
        group.add(arrow);
        const arrowBack = arrow.clone();
        arrowBack.position.z = -0.09;
        arrowBack.rotation.y = Math.PI;
        group.add(arrowBack);
        break;
      }
      case "pinwheel":
      case "wind_sock": {
        const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.07, 2, 8), wood);
        pole.position.y = 1;
        group.add(pole);
        const wheel = new THREE.Group();
        wheel.name = "spin-decoration";
        wheel.position.y = 1.9;
        for (let index = 0; index < 6; index += 1) {
          const blade = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.65, 4), new THREE.MeshStandardMaterial({ color: index % 2 ? color : 0xffef9f, roughness: 0.72 }));
          blade.position.set(Math.cos(index * Math.PI / 3) * 0.34, Math.sin(index * Math.PI / 3) * 0.34, 0);
          blade.rotation.z = index * Math.PI / 3 - Math.PI / 2;
          wheel.add(blade);
        }
        group.add(wheel);
        break;
      }
      case "toy_block_stack": {
        for (let index = 0; index < 4; index += 1) {
          const block = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.9, 0.9), new THREE.MeshStandardMaterial({ color: index % 2 ? color : 0xffcf4b, roughness: 0.72 }));
          block.position.set((index % 2) * 0.72 - 0.35, Math.floor(index / 2) * 0.8 + 0.45, (index % 3) * 0.12);
          block.rotation.y = index * 0.14;
          block.castShadow = true;
          group.add(block);
        }
        break;
      }
      case "sun_banner": {
        const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 2.6, 8), wood);
        pole.position.y = 1.3;
        group.add(pole);
        const banner = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.75, 0.06), new THREE.MeshStandardMaterial({ color, roughness: 0.72, side: THREE.DoubleSide }));
        banner.position.set(0.58, 2.05, 0);
        group.add(banner);
        const sun = new THREE.Mesh(new THREE.CircleGeometry(0.2, 18), new THREE.MeshBasicMaterial({ color: 0xfff0a2, side: THREE.DoubleSide }));
        sun.position.set(0.58, 2.05, 0.04);
        group.add(sun);
        break;
      }
      case "clockwork_gear": {
        const gear = new THREE.Group();
        gear.name = "spin-decoration";
        gear.position.y = 1.25;
        const metal = new THREE.MeshStandardMaterial({ color, metalness: 0.58, roughness: 0.34 });
        gear.add(new THREE.Mesh(new THREE.TorusGeometry(0.72, 0.18, 10, 28), metal));
        gear.add(new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 0.28, 16), metal));
        gear.children[1].rotation.x = Math.PI / 2;
        for (let index = 0; index < 12; index += 1) {
          const tooth = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.38, 0.22), metal);
          const angle = index * Math.PI / 6;
          tooth.position.set(Math.cos(angle) * 0.91, Math.sin(angle) * 0.91, 0);
          tooth.rotation.z = angle;
          gear.add(tooth);
        }
        group.add(gear);
        break;
      }
      case "frost_crystal": {
        const crystalMaterial = new THREE.MeshPhysicalMaterial({ color, emissive: color.clone().multiplyScalar(0.35), emissiveIntensity: 0.52, transparent: true, opacity: 0.86, transmission: 0.28, roughness: 0.12, clearcoat: 1 });
        for (const [x, z, height, tilt] of [[0, 0, 2.5, 0], [-0.48, 0.14, 1.7, -0.25], [0.46, -0.1, 1.9, 0.22], [0.12, 0.42, 1.35, -0.12]] as const) {
          const shard = new THREE.Mesh(new THREE.ConeGeometry(0.34, height, 6), crystalMaterial);
          shard.position.set(x, height / 2, z);
          shard.rotation.z = tilt;
          shard.castShadow = true;
          group.add(shard);
        }
        break;
      }
      case "cocoa_arch": {
        const wafer = new THREE.MeshStandardMaterial({ color, roughness: 0.9 });
        for (const x of [-1.15, 1.15]) {
          const pillar = new THREE.Mesh(new THREE.BoxGeometry(0.55, 3, 0.65), wafer);
          pillar.position.set(x, 1.5, 0);
          pillar.castShadow = true;
          group.add(pillar);
        }
        const arch = new THREE.Mesh(new THREE.TorusGeometry(1.15, 0.29, 9, 28, Math.PI), wafer);
        arch.position.y = 3;
        group.add(arch);
        break;
      }
      case "lava_vent": {
        const rock = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.72, 0.46, 10), new THREE.MeshStandardMaterial({ color: 0x3b2930, roughness: 0.92 }));
        rock.position.y = 0.23;
        group.add(rock);
        const glow = new THREE.Mesh(new THREE.CircleGeometry(0.38, 18), new THREE.MeshBasicMaterial({ color }));
        glow.rotation.x = -Math.PI / 2;
        glow.position.y = 0.47;
        group.add(glow, new THREE.PointLight(color, 1.4, 5));
        break;
      }
      case "moon_obelisk": {
        const obelisk = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.58, 3.4, 5), new THREE.MeshStandardMaterial({ color, emissive: color.clone().multiplyScalar(0.2), emissiveIntensity: 0.32, roughness: 0.5 }));
        obelisk.position.y = 1.7;
        obelisk.castShadow = true;
        group.add(obelisk);
        const ring = new THREE.Mesh(new THREE.TorusGeometry(0.46, 0.055, 8, 24), new THREE.MeshBasicMaterial({ color: 0xf8edba }));
        ring.position.y = 2.35;
        ring.rotation.x = Math.PI / 2;
        ring.name = "spin-decoration";
        group.add(ring);
        break;
      }
      case "floating_lantern": {
        const lantern = new THREE.Mesh(new THREE.DodecahedronGeometry(0.38, 0), new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.9, roughness: 0.4 }));
        lantern.name = "floating-decoration";
        lantern.userData.baseY = 0;
        group.add(lantern, new THREE.PointLight(color, 1.1, 6));
        break;
      }
      default: break;
    }
    return group;
  }

  private sceneryObjectIsAnimated(object: THREE.Object3D) {
    return object.name === "spin-decoration" ||
      object.name === "floating-decoration" ||
      object.name === "steam-particle" ||
      object.name === "lava-particle" ||
      object.name === "lava-bubble" ||
      object.name === "molten-field" ||
      object.name === "boost-ring" ||
      object.name === "boost-spring" ||
      object.name === "wind-ring" ||
      Boolean(object.userData.tubeCurve) ||
      object.userData.assetAnimation === "spin" ||
      object.userData.assetAnimation === "bob";
  }

  private indexAnimatedScenery() {
    this.animatedScenery.clear();
    this.worldGroup.traverse((object) => {
      if (this.sceneryObjectIsAnimated(object)) this.animatedScenery.add(object);
    });
  }

  private sceneryObjectIsVisible(object: THREE.Object3D) {
    let current: THREE.Object3D | null = object;
    while (current) {
      if (!current.visible) return false;
      if (current === this.worldGroup) return true;
      current = current.parent;
    }
    return false;
  }

  private updateScenery(dt: number, time: number) {
    const water = this.worldGroup.getObjectByName("shimmering-water");
    if (water instanceof THREE.Mesh) {
      const material = water.material as THREE.MeshPhysicalMaterial;
      material.color.offsetHSL(Math.sin(time * 0.00035) * 0.00005, 0, Math.sin(time * 0.0005) * 0.00008);
    }
    for (const object of this.animatedScenery) {
      if (!this.sceneryObjectIsVisible(object)) continue;
      if (object.name === "spin-decoration") object.rotation.z += dt * 1.25;
      if (object.name === "floating-decoration") object.position.y = Number(object.userData.baseY) + Math.sin(time * 0.0024 + object.id) * 0.24;
      if (object.userData.assetAnimation === "spin") object.rotation.y += dt * 2.2;
      if (object.userData.assetAnimation === "bob") object.position.y = Number(object.userData.baseY) + Math.sin(time * 0.0022 + object.id) * 0.18;
      if (object.name === "steam-particle") {
        const phase = Number(object.userData.phase) || 0;
        const progress = (time * 0.00072 + phase) % 1;
        const height = Number(object.userData.jetHeight) || 4;
        object.position.set(Math.sin(progress * 18 + phase * 8) * 0.22, 0.38 + progress * (height - 0.5), Math.cos(progress * 15 + phase * 6) * 0.22);
        object.scale.setScalar(0.45 + progress * 1.15);
        if (object instanceof THREE.Mesh && object.material instanceof THREE.MeshPhysicalMaterial) object.material.opacity = (1 - progress) * 0.52;
      }
      if (object.name === "lava-particle") {
        const phase = Number(object.userData.phase) || 0;
        const progress = (time * 0.00055 + phase) % 1;
        const height = Number(object.userData.jetHeight) || 5;
        object.position.set(Math.sin(progress * 15 + phase * 9) * 0.28, 0.4 + Math.sin(progress * Math.PI) * height, Math.cos(progress * 13 + phase * 7) * 0.28);
        object.scale.setScalar(0.65 + Math.sin(progress * Math.PI) * 0.55);
      }
      if (object.name === "lava-bubble") {
        const phase = Number(object.userData.phase) || 0;
        object.scale.y = 0.55 + (Math.sin(time * 0.003 + phase) + 1) * 0.5;
      }
      if (object.name === "molten-field" && object instanceof THREE.Mesh && object.material instanceof THREE.MeshStandardMaterial) {
        object.material.emissiveIntensity = 1.15 + Math.sin(time * 0.0028) * 0.22;
      }
      if (object.name === "boost-ring") {
        const index = Number(object.userData.ringIndex) || 0;
        object.position.y = 0.57 + index * 0.08 + Math.sin(time * 0.006 + index) * 0.08;
        object.rotation.z += dt * (0.7 + index * 0.18);
      }
      if (object.name === "boost-spring") {
        object.scale.y = 1 + Math.sin(time * 0.006) * 0.08;
      }
      if (object.name === "wind-ring") {
        const length = Number(object.userData.windLength) || 20;
        object.position.z += dt * (Number(object.userData.windSpeed) || 4.5);
        if (object.position.z > length / 2) object.position.z -= length;
        object.rotation.z += dt * 0.55;
      }
      const curve = object.userData.tubeCurve as THREE.CatmullRomCurve3 | undefined;
      if (curve) {
        const progress = ((time * 0.00022 + Number(object.userData.tubeOffset)) % 1 + 1) % 1;
        object.position.copy(curve.getPointAt(progress));
      }
    }
    for (const checkpoint of this.checkpointMeshes.values()) {
      const wheel = checkpoint.getObjectByName("checkpoint-wheel");
      if (wheel) wheel.rotation.z += dt * 0.8;
    }
    for (let index = this.effectsGroup.children.length - 1; index >= 0; index -= 1) {
      const effect = this.effectsGroup.children[index];
      effect.userData.life = Number(effect.userData.life) - dt;
      effect.position.y += dt * 1.8;
      effect.scale.multiplyScalar(1 + dt * 1.7);
      const material = effect instanceof THREE.Points ? effect.material as THREE.PointsMaterial : null;
      if (material) material.opacity = Math.max(0, Number(effect.userData.life) / Number(effect.userData.maxLife));
      if (Number(effect.userData.life) <= 0) {
        this.effectsGroup.remove(effect);
        this.disposeObject(effect);
      }
    }
  }

  private createCloud(scale: number) {
    const group = new THREE.Group();
    const material = new THREE.MeshStandardMaterial({ color: WORLD_3D.theme.sky.cloud, roughness: 0.9, transparent: true, opacity: 0.95 });
    for (const [x, y, z, radius] of [[0, 0, 0, 2.1], [-2.1, -0.2, 0.2, 1.45], [2.15, -0.1, -0.1, 1.55], [-0.65, 1.05, -0.2, 1.5], [1, 0.82, 0.15, 1.3]] as const) {
      const puff = new THREE.Mesh(new THREE.SphereGeometry(radius, 14, 10), material);
      puff.position.set(x, y, z);
      group.add(puff);
    }
    group.scale.setScalar(scale);
    return group;
  }

  private burstAt(position: THREE.Vector3 | undefined, color: number) {
    if (!position) return;
    const count = 24;
    const positions = new Float32Array(count * 3);
    for (let index = 0; index < count; index += 1) {
      const angle = index / count * Math.PI * 2;
      const radius = 0.25 + (index % 5) * 0.13;
      positions[index * 3] = Math.cos(angle) * radius;
      positions[index * 3 + 1] = ((index * 7) % 11) * 0.08 - 0.22;
      positions[index * 3 + 2] = Math.sin(angle) * radius;
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    const points = new THREE.Points(geometry, new THREE.PointsMaterial({ color, size: 0.2, transparent: true, opacity: 1, depthWrite: false }));
    points.position.copy(position);
    points.userData.life = 0.72;
    points.userData.maxLife = 0.72;
    this.effectsGroup.add(points);
  }

  private resetVisualState() {
    for (const mesh of this.collectibleMeshes.values()) mesh.visible = true;
    for (const mesh of this.enemyMeshes.values()) mesh.visible = true;
    for (const mesh of this.checkpointMeshes.values()) {
      const wheel = mesh.getObjectByName("checkpoint-wheel");
      if (wheel) {
        wheel.scale.setScalar(1);
        const light = wheel.getObjectByName("checkpoint-light");
        if (light) wheel.remove(light);
      }
    }
    while (this.effectsGroup.children.length) {
      const effect = this.effectsGroup.children.pop();
      if (effect) this.disposeObject(effect);
    }
  }

  private resize() {
    const width = Math.max(1, this.canvas.clientWidth || window.innerWidth);
    const height = Math.max(1, this.canvas.clientHeight || window.innerHeight);
    const pixelRatio = Math.min(window.devicePixelRatio || 1, 1.75);
    this.renderer.setPixelRatio(pixelRatio);
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
  }

  private disposeObject(object: THREE.Object3D) {
    this.disposeObjectResources(object);
    object.removeFromParent();
  }

  private disposeObjectResources(object: THREE.Object3D) {
    object.traverse((child) => {
      if (!(child instanceof THREE.Mesh || child instanceof THREE.Points)) return;
      child.geometry?.dispose();
      const materials = Array.isArray(child.material) ? child.material : [child.material];
      for (const material of materials) {
        for (const value of Object.values(material)) {
          if (value instanceof THREE.Texture) value.dispose();
        }
        material.dispose();
      }
    });
  }
}
