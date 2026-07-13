"use client";

import { useEffect, useRef, useState } from "react";
import { OreoGameEngine, type EngineFrame, type EngineHud } from "../game/engine";
import type { GameSettings } from "../game/settings";

export type GameHud = EngineHud;
export type RemotePlayerFrame = EngineFrame;

interface GameStageProps {
  active: boolean;
  attract: boolean;
  skin: string;
  soundOn: boolean;
  paused: boolean;
  settings: GameSettings;
  remotePlayers: Record<string, RemotePlayerFrame>;
  onHud(hud: GameHud): void;
  onLocalFrame(frame: Omit<RemotePlayerFrame, "playerId" | "name" | "skin">): void;
  onFinish(hud: GameHud): void;
}

export function GameStage({
  active,
  attract,
  skin,
  soundOn,
  paused,
  settings,
  remotePlayers,
  onHud,
  onLocalFrame,
  onFinish,
}: GameStageProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<OreoGameEngine | null>(null);
  const callbacksRef = useRef({ onHud, onLocalFrame, onFinish });
  const initialOptionsRef = useRef({ skin, soundOn, settings });
  const [ready, setReady] = useState(false);

  useEffect(() => {
    callbacksRef.current = { onHud, onLocalFrame, onFinish };
  }, [onFinish, onHud, onLocalFrame]);

  useEffect(() => {
    if (!canvasRef.current) return;
    const engine = new OreoGameEngine(canvasRef.current, {
      skin: initialOptionsRef.current.skin,
      soundOn: initialOptionsRef.current.soundOn,
      settings: initialOptionsRef.current.settings,
      onHud: (hud) => callbacksRef.current.onHud(hud),
      onLocalFrame: (frame) => callbacksRef.current.onLocalFrame(frame),
      onFinish: (hud) => callbacksRef.current.onFinish(hud),
    });
    engineRef.current = engine;
    setReady(true);
    return () => {
      engine.destroy();
      engineRef.current = null;
    };
  }, []);

  useEffect(() => engineRef.current?.setActive(active), [active]);
  useEffect(() => engineRef.current?.setAttract(attract), [attract]);
  useEffect(() => engineRef.current?.setSkin(skin), [skin]);
  useEffect(() => engineRef.current?.setSoundOn(soundOn), [soundOn]);
  useEffect(() => engineRef.current?.setPaused(paused), [paused]);
  useEffect(() => engineRef.current?.setSettings(settings), [settings]);
  useEffect(() => engineRef.current?.setRemotePlayers(remotePlayers), [remotePlayers]);

  const touch = (key: "left" | "right" | "forward" | "backward" | "jump" | "run", pressed: boolean) => {
    engineRef.current?.setTouchInput(key, pressed);
  };

  return (
    <div className="game-stage" aria-label="超级奥利奥 3D 游戏画面">
      <canvas ref={canvasRef} />
      {!ready && <div className="game-stage__loading">正在铺设青空遗迹…</div>}
      {active && !paused && (
        <div className="touch-controls" aria-label="触摸游戏控制">
          <div className="touch-controls__cluster touch-controls__dpad">
            <button className="touch-button touch-button--up" type="button" aria-label="向前" onPointerDown={() => touch("forward", true)} onPointerUp={() => touch("forward", false)} onPointerCancel={() => touch("forward", false)}>W</button>
            <button className="touch-button touch-button--left" type="button" aria-label="向左" onPointerDown={() => touch("left", true)} onPointerUp={() => touch("left", false)} onPointerCancel={() => touch("left", false)}>A</button>
            <button className="touch-button touch-button--down" type="button" aria-label="向后" onPointerDown={() => touch("backward", true)} onPointerUp={() => touch("backward", false)} onPointerCancel={() => touch("backward", false)}>S</button>
            <button className="touch-button touch-button--right" type="button" aria-label="向右" onPointerDown={() => touch("right", true)} onPointerUp={() => touch("right", false)} onPointerCancel={() => touch("right", false)}>D</button>
          </div>
          <div className="touch-controls__cluster">
            <button className="touch-button" type="button" aria-label="冲刺" onPointerDown={() => touch("run", true)} onPointerUp={() => touch("run", false)} onPointerCancel={() => touch("run", false)}>⇧</button>
            <button className="touch-button touch-button--jump" type="button" aria-label="跳跃" onPointerDown={() => touch("jump", true)} onPointerUp={() => touch("jump", false)} onPointerCancel={() => touch("jump", false)}>跳跃</button>
          </div>
        </div>
      )}
    </div>
  );
}
