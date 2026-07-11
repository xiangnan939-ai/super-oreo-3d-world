"use client";

import { useEffect, useRef, useState } from "react";
import { OreoGameEngine, type EngineFrame, type EngineHud } from "../game/engine";

export type GameHud = EngineHud;
export type RemotePlayerFrame = EngineFrame;

interface GameStageProps {
  active: boolean;
  attract: boolean;
  skin: string;
  soundOn: boolean;
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
  remotePlayers,
  onHud,
  onLocalFrame,
  onFinish,
}: GameStageProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<OreoGameEngine | null>(null);
  const callbacksRef = useRef({ onHud, onLocalFrame, onFinish });
  const initialOptionsRef = useRef({ skin, soundOn });
  const [ready, setReady] = useState(false);

  useEffect(() => {
    callbacksRef.current = { onHud, onLocalFrame, onFinish };
  }, [onFinish, onHud, onLocalFrame]);

  useEffect(() => {
    if (!canvasRef.current) return;
    const engine = new OreoGameEngine(canvasRef.current, {
      skin: initialOptionsRef.current.skin,
      soundOn: initialOptionsRef.current.soundOn,
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
  useEffect(() => engineRef.current?.setRemotePlayers(remotePlayers), [remotePlayers]);

  const touch = (key: "left" | "right" | "jump" | "run", pressed: boolean) => {
    engineRef.current?.setTouchInput(key, pressed);
  };

  return (
    <div className="game-stage" aria-label="超级奥利奥 3D 游戏画面">
      <canvas ref={canvasRef} />
      {!ready && <div className="game-stage__loading">正在铺设青空遗迹…</div>}
      {active && (
        <div className="touch-controls" aria-label="触摸游戏控制">
          <div className="touch-controls__cluster">
            <button className="touch-button" type="button" aria-label="向左" onPointerDown={() => touch("left", true)} onPointerUp={() => touch("left", false)} onPointerCancel={() => touch("left", false)}>←</button>
            <button className="touch-button" type="button" aria-label="向右" onPointerDown={() => touch("right", true)} onPointerUp={() => touch("right", false)} onPointerCancel={() => touch("right", false)}>→</button>
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
