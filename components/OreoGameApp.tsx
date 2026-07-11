"use client";

/* eslint-disable @next/next/no-img-element -- the same component also ships through static Vite/Cloudflare Pages */

import { useCallback, useEffect, useRef, useState } from "react";
import { GameStage, type GameHud, type RemotePlayerFrame } from "./GameStage";
import {
  createOnlineRoom,
  RoomConnection,
  type RoomPlayer,
  type RoomStatus,
} from "../game/network";

type Screen = "menu" | "join" | "lobby" | "playing" | "results";

const SKINS = [
  { id: "classic", name: "经典黑巧", accent: "#f5f1df", detail: "均衡" },
  { id: "berry", name: "莓果红", accent: "#ff6f91", detail: "醒目" },
  { id: "mint", name: "薄荷青", accent: "#63e6be", detail: "清爽" },
  { id: "caramel", name: "焦糖金", accent: "#ffc857", detail: "闪亮" },
] as const;

const INITIAL_HUD: GameHud = {
  coins: 0,
  totalCoins: 78,
  starMedals: 0,
  totalStarMedals: 3,
  lives: 5,
  deaths: 0,
  score: 0,
  elapsedMs: 0,
  timeRemaining: 420,
  checkpoint: 0,
  finished: false,
};

function randomPlayerId() {
  return `p_${Math.random().toString(36).slice(2, 10)}`;
}

function formatTime(ms: number) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(total / 60).toString().padStart(2, "0");
  const seconds = (total % 60).toString().padStart(2, "0");
  return `${minutes}:${seconds}`;
}

function formatCounter(value: number, digits: number) {
  return Math.max(0, Math.floor(value)).toString().padStart(digits, "0");
}

function CookieAvatar({ small = false }: { small?: boolean }) {
  return (
    <img className={`cookie-avatar${small ? " cookie-avatar--small" : ""}`} src="/hud/avatar.png" alt="" aria-hidden="true" />
  );
}

export function OreoGameApp() {
  const [screen, setScreen] = useState<Screen>("menu");
  const [nickname, setNickname] = useState("探险家");
  const [skin, setSkin] = useState<(typeof SKINS)[number]["id"]>("classic");
  const [roomCode, setRoomCode] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [players, setPlayers] = useState<RoomPlayer[]>([]);
  const [roomStatus, setRoomStatus] = useState<RoomStatus>("offline");
  const [isReady, setIsReady] = useState(false);
  const [copied, setCopied] = useState(false);
  const [hud, setHud] = useState<GameHud>(INITIAL_HUD);
  const [remoteFrames, setRemoteFrames] = useState<Record<string, RemotePlayerFrame>>({});
  const [notice, setNotice] = useState("");
  const [soundOn, setSoundOn] = useState(true);
  const [playerId] = useState(randomPlayerId);
  const room = useRef<RoomConnection | null>(null);
  const nicknameRef = useRef(nickname);

  useEffect(() => {
    nicknameRef.current = nickname;
  }, [nickname]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const params = new URLSearchParams(window.location.search);
      const invitedRoom = params.get("room")?.toUpperCase();
      if (invitedRoom && /^[A-Z0-9]{4,8}$/.test(invitedRoom)) {
        setJoinCode(invitedRoom);
        setScreen("join");
      }
      const savedName = window.localStorage.getItem("super-oreo-name");
      const savedSkin = window.localStorage.getItem("super-oreo-skin");
      if (savedName) setNickname(savedName.slice(0, 20));
      if (SKINS.some((item) => item.id === savedSkin)) {
        setSkin(savedSkin as (typeof SKINS)[number]["id"]);
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    window.localStorage.setItem("super-oreo-name", nickname.trim() || "探险家");
    window.localStorage.setItem("super-oreo-skin", skin);
  }, [nickname, skin]);

  const disconnect = useCallback(() => {
    room.current?.disconnect();
    room.current = null;
    setPlayers([]);
    setRemoteFrames({});
    setRoomStatus("offline");
    setIsReady(false);
  }, []);

  useEffect(() => () => disconnect(), [disconnect]);

  const openRoom = useCallback(
    async (code: string) => {
      disconnect();
      const normalizedCode = code.trim().toUpperCase();
      if (!normalizedCode) return;
      setRoomCode(normalizedCode);
      setScreen("lobby");
      setNotice("正在穿越云端隧道…");
      const connection = new RoomConnection(
        normalizedCode,
        {
          playerId,
          name: nickname.trim().slice(0, 20) || "探险家",
          skin,
        },
        {
          onStatus: (status) => {
            setRoomStatus(status);
            setNotice(status === "connected" ? "房间连接成功" : status === "fallback" ? "已进入本机联机模式" : "");
          },
          onRoomState: (nextPlayers) => setPlayers(nextPlayers),
          onStart: () => {
            setHud(INITIAL_HUD);
            setScreen("playing");
          },
          onPlayerState: (frame) => {
            if (frame.playerId === playerId) return;
            setRemoteFrames((current) => ({ ...current, [frame.playerId]: frame }));
          },
          onPlayerLeft: (id) => {
            setRemoteFrames((current) => {
              const next = { ...current };
              delete next[id];
              return next;
            });
          },
          onError: (message) => setNotice(message),
        },
      );
      room.current = connection;
      await connection.connect();
    },
    [disconnect, nickname, playerId, skin],
  );

  const createRoom = useCallback(async () => {
    setNotice("正在搭建冒险房间…");
    const code = await createOnlineRoom();
    await openRoom(code);
  }, [openRoom]);

  const startSolo = useCallback(() => {
    disconnect();
    setHud(INITIAL_HUD);
    setScreen("playing");
  }, [disconnect]);

  const toggleReady = useCallback(() => {
    const next = !isReady;
    setIsReady(next);
    room.current?.setReady(next);
  }, [isReady]);

  const localPlayer = players.find((player) => player.playerId === playerId);
  const hostPlayer = players.find((player) => player.host);
  const isHost = localPlayer?.host ?? false;
  const canStart = isHost && players.length > 0 && players.every((player) => player.ready || player.host);

  const copyInvite = useCallback(async () => {
    const url = `${window.location.origin}${window.location.pathname}?room=${roomCode}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setNotice(`邀请链接：${url}`);
    }
  }, [roomCode]);

  const handleHud = useCallback((next: GameHud) => setHud(next), []);

  const handleLocalFrame = useCallback((frame: Omit<RemotePlayerFrame, "playerId" | "name" | "skin">) => {
    room.current?.sendPlayerState({
      ...frame,
      playerId,
      name: nicknameRef.current || "探险家",
      skin,
    });
  }, [playerId, skin]);

  const handleFinish = useCallback((finalHud: GameHud) => {
    setHud(finalHud);
    room.current?.sendFinish({ elapsedMs: finalHud.elapsedMs, coins: finalHud.coins, deaths: finalHud.deaths });
    window.setTimeout(() => setScreen("results"), 650);
  }, []);

  const returnHome = useCallback(() => {
    disconnect();
    setHud(INITIAL_HUD);
    setScreen("menu");
    window.history.replaceState({}, "", window.location.pathname);
  }, [disconnect]);

  return (
    <main className="game-shell">
      <GameStage
        active={screen === "playing"}
        attract={screen !== "playing"}
        skin={skin}
        soundOn={soundOn}
        remotePlayers={remoteFrames}
        onHud={handleHud}
        onLocalFrame={handleLocalFrame}
        onFinish={handleFinish}
      />

      <header className={`topbar${screen === "playing" ? " topbar--playing" : ""}`}>
        <button className="brand-lockup" type="button" onClick={returnHome} aria-label="返回超级奥利奥首页">
          <CookieAvatar small />
          <span>超级奥利奥</span>
        </button>
        <div className="topbar__actions">
          {roomCode && screen !== "menu" && (
            <span className="room-chip"><i className={`status-dot status-dot--${roomStatus}`} />房间 {roomCode}</span>
          )}
          <button className="icon-button" type="button" onClick={() => setSoundOn((value) => !value)} aria-label={soundOn ? "关闭声音" : "打开声音"}>
            {soundOn ? "声音开" : "声音关"}
          </button>
        </div>
      </header>

      {screen === "playing" && (
        <section className="play-hud" aria-label="游戏状态">
          <div className="hud-stack hud-stack--left">
            <div className="hud-line hud-line--lives"><CookieAvatar /><strong>×{hud.lives}</strong></div>
            <div className="hud-line hud-line--coins"><img src="/hud/coin.png" alt="金币" /><strong>×{formatCounter(hud.coins, 2)}</strong><small>/{hud.totalCoins}</small></div>
            <div className="hud-stars" aria-label={`已收集 ${hud.starMedals} 枚星章`}>
              {Array.from({ length: hud.totalStarMedals }, (_, index) => (
                <img key={index} className={index < hud.starMedals ? "is-collected" : ""} src="/hud/star.png" alt="" />
              ))}
            </div>
          </div>
          <div className="hud-stack hud-stack--right">
            <div className="hud-timer"><small>TIME</small><strong>{formatCounter(hud.timeRemaining, 4)}</strong></div>
            <div className="hud-score">{formatCounter(hud.score, 6)}</div>
          </div>
          <div className="hud-route"><span>晴空绒线庭</span><strong>检查点 {hud.checkpoint}/3</strong></div>
          <div className="mouse-hint"><span>点击画面锁定鼠标</span><small>W S A D 移动 · 空格跳跃 · Shift 冲刺 · 鼠标转动视角 · Esc 释放</small></div>
        </section>
      )}

      {screen === "menu" && (
        <section className="hero-panel">
          <div className="eyebrow"><span /> 原创 3D 平台冒险 <span /></div>
          <h1 aria-label="超级奥利奥">
            <span className="title-super">超级</span>
            <span className="title-oreo">奥利奥</span>
          </h1>
          <p className="hero-copy">穿过青空遗迹，踩过机关，收集星饼。<br />一个人出发，或者叫上三位朋友。</p>

          <label className="nickname-field">
            <span>探险家名字</span>
            <input value={nickname} maxLength={20} onChange={(event) => setNickname(event.target.value)} aria-label="探险家名字" />
          </label>

          <div className="skin-picker" role="radiogroup" aria-label="选择奥利奥角色">
            {SKINS.map((item) => (
              <button
                key={item.id}
                type="button"
                role="radio"
                aria-checked={skin === item.id}
                className={`skin-card${skin === item.id ? " is-selected" : ""}`}
                onClick={() => setSkin(item.id)}
              >
                <CookieAvatar />
                <span><b>{item.name}</b><small>{item.detail}</small></span>
                <i className="skin-swatch" style={{ background: item.accent }} aria-hidden="true" />
              </button>
            ))}
          </div>

          <div className="primary-actions">
            <button className="button button--sun" type="button" onClick={startSolo}>单人出发</button>
            <button className="button button--cloud" type="button" onClick={createRoom}>创建联机房间</button>
          </div>
          <button className="text-action" type="button" onClick={() => setScreen("join")}>已有房间码？加入朋友的冒险</button>

          <div className="control-hint"><kbd>W</kbd><kbd>S</kbd><kbd>A</kbd><kbd>D</kbd> 自由移动 <kbd>Space</kbd> 跳跃 <kbd>Shift</kbd> 冲刺 · 鼠标控制视角</div>
        </section>
      )}

      {screen === "join" && (
        <section className="dialog-card join-card">
          <button className="dialog-close" type="button" onClick={() => setScreen("menu")} aria-label="关闭">关闭</button>
          <CookieAvatar />
          <p className="dialog-kicker">加入好友</p>
          <h2>输入房间码</h2>
          <p>房间码由 6 位字母与数字组成。</p>
          <input
            className="room-code-input"
            value={joinCode}
            maxLength={8}
            onChange={(event) => setJoinCode(event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""))}
            placeholder="OREO88"
            autoFocus
            aria-label="房间码"
          />
          <button className="button button--sun button--full" type="button" disabled={joinCode.length < 4} onClick={() => openRoom(joinCode)}>进入房间</button>
        </section>
      )}

      {screen === "lobby" && (
        <section className="dialog-card lobby-card">
          <div className="lobby-heading">
            <div><p className="dialog-kicker">青空遗迹 · 等候区</p><h2>准备好就出发</h2></div>
            <div className="big-room-code"><small>房间码</small><strong>{roomCode}</strong></div>
          </div>

          <div className="lobby-grid">
            <div className="player-list">
              {[0, 1, 2, 3].map((slot) => {
                const player = players[slot];
                return (
                  <div className={`player-slot${player ? " is-filled" : ""}`} key={slot}>
                    {player ? <CookieAvatar small /> : <span className="empty-slot">空位</span>}
                    <span className="player-name">{player?.name ?? "等待探险家…"}<small>{player?.host ? "房主" : player?.ready ? "已准备" : player ? "整装备中" : `空位 ${slot + 1}`}</small></span>
                    {player?.ready && <span className="ready-badge">已准备</span>}
                  </div>
                );
              })}
            </div>
            <div className="lobby-info">
              <div className="connection-orbit"><CookieAvatar /><i /><i /><i /></div>
              <h3>{roomStatus === "connected" ? "云端连接稳定" : roomStatus === "fallback" ? "本机联机可用" : "正在连接房间"}</h3>
              <p>{hostPlayer ? `${hostPlayer.name} 是本局房主` : "正在确定房主"}<br />最多 4 人，所有人可独立抵达终点。</p>
              <button className="button button--outline button--full" type="button" onClick={copyInvite}>{copied ? "已复制邀请链接" : "复制邀请链接"}</button>
            </div>
          </div>

          {notice && <p className="notice" role="status">{notice}</p>}
          <div className="lobby-actions">
            <button className="text-action text-action--muted" type="button" onClick={returnHome}>退出房间</button>
            {!isHost && <button className={`button ${isReady ? "button--ready" : "button--cloud"}`} type="button" onClick={toggleReady}>{isReady ? "已准备" : "我准备好了"}</button>}
            {isHost && <button className="button button--sun" type="button" disabled={!canStart} onClick={() => room.current?.startGame()}>{canStart ? "开始冒险" : "等待大家准备"}</button>}
          </div>
        </section>
      )}

      {screen === "results" && (
        <section className="dialog-card result-card">
          <div className="result-rays" aria-hidden="true" />
          <p className="dialog-kicker">关卡完成</p>
          <h2>青空遗迹通关！</h2>
          <p>漂亮的最后一跳。你的星饼已经装进冒险口袋。</p>
          <div className="result-stats">
            <div><small>用时</small><strong>{formatTime(hud.elapsedMs)}</strong></div>
            <div><small>金币</small><strong>{hud.coins}/{hud.totalCoins}</strong></div>
            <div><small>星章</small><strong>{hud.starMedals}/{hud.totalStarMedals}</strong></div>
            <div><small>得分</small><strong>{formatCounter(hud.score, 6)}</strong></div>
          </div>
          <div className="primary-actions primary-actions--center">
            <button className="button button--sun" type="button" onClick={() => { setHud(INITIAL_HUD); setScreen("playing"); }}>再来一次</button>
            <button className="button button--outline" type="button" onClick={returnHome}>返回主页</button>
          </div>
        </section>
      )}

      <div className="legal-note">原创角色与关卡 · 灵感来自经典平台冒险</div>
    </main>
  );
}
