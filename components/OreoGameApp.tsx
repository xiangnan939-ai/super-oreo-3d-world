"use client";

/* eslint-disable @next/next/no-img-element -- the same component also ships through static Vite/Cloudflare Pages */

import { useCallback, useEffect, useRef, useState } from "react";
import { GameStage, type GameHud, type RemotePlayerFrame } from "./GameStage";
import {
  createChatMessage,
  createOnlineRoom,
  isValidRoomCode,
  normalizeRoomCode,
  RoomConnection,
  type RoomPlayer,
  type RoomStatus,
  type RoomTransport,
  type ChatMessage,
} from "../game/network";
import {
  DEFAULT_DEVELOPER_OPTIONS,
  type DeveloperOptions,
} from "../game/developer";
import {
  DEFAULT_GAME_SETTINGS,
  GAME_ACTIONS,
  GAME_ACTION_LABELS,
  keyCodeLabel,
  normalizeGameSettings,
  type GameAction,
  type GameSettings,
} from "../game/settings";
import { WORLD_3D } from "../game/world3d";

type Screen = "menu" | "join" | "lobby" | "playing" | "results";
type PauseView = "closed" | "menu" | "settings";
type ChatEntry = ChatMessage & { system?: boolean };

const SETTINGS_STORAGE_KEY = "super-oreo-settings-v2";
const SOUND_STORAGE_KEY = "super-oreo-sound-v1";

const TRANSPORT_LABELS: Record<RoomTransport, { title: string; detail: string }> = {
  none: { title: "正在建立房主中继", detail: "连接完成后会自动选择最快通道" },
  "webrtc-direct": { title: "房主直连中继", detail: "玩家数据经房主浏览器实时转发 · WebRTC" },
  "webrtc-turn": { title: "房主安全中继", detail: "玩家数据经房主浏览器转发 · TURN" },
  "webrtc-mixed": { title: "房主混合中继", detail: "部分玩家直连房主，其他玩家使用云端通道" },
  "websocket-relay": { title: "房主云端中继", detail: "房主负责数据转发，Cloudflare 提供传输通道" },
  local: { title: "本机联机测试", detail: "仅供同一台电脑的开发测试" },
};

const SKINS = [
  { id: "classic", name: "经典黑巧", accent: "#f5f1df", detail: "均衡" },
  { id: "berry", name: "莓果红", accent: "#ff6f91", detail: "醒目" },
  { id: "mint", name: "薄荷青", accent: "#63e6be", detail: "清爽" },
  { id: "caramel", name: "焦糖金", accent: "#ffc857", detail: "闪亮" },
] as const;

const INITIAL_HUD: GameHud = {
  coins: 0,
  totalCoins: WORLD_3D.collectibles.filter((item) => item.kind === "coin").length,
  starMedals: 0,
  totalStarMedals: WORLD_3D.collectibles.filter((item) => item.kind === "star_medal").length,
  moonShards: 0,
  totalMoonShards: WORLD_3D.collectibles.filter((item) => item.kind === "moon_shard").length,
  lives: 5,
  deaths: 0,
  score: 0,
  elapsedMs: 0,
  timeRemaining: WORLD_3D.metadata.timeLimitSeconds,
  checkpoint: 0,
  totalCheckpoints: WORLD_3D.checkpoints.length,
  biome: WORLD_3D.biomes[0].name,
  biomeSubtitle: WORLD_3D.biomes[0].subtitle,
  objective: WORLD_3D.biomes[0].objective,
  dashReady: true,
  rating: "C",
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

function formatChatTime(sentAt: number) {
  return new Intl.DateTimeFormat("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(sentAt));
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
  const [roomTransport, setRoomTransport] = useState<RoomTransport>("none");
  const [isReady, setIsReady] = useState(false);
  const [copied, setCopied] = useState(false);
  const [hud, setHud] = useState<GameHud>(INITIAL_HUD);
  const [remoteFrames, setRemoteFrames] = useState<Record<string, RemotePlayerFrame>>({});
  const [notice, setNotice] = useState("");
  const [soundOn, setSoundOn] = useState(true);
  const [pauseView, setPauseView] = useState<PauseView>("closed");
  const [settings, setSettings] = useState<GameSettings>(DEFAULT_GAME_SETTINGS);
  const [settingsHydrated, setSettingsHydrated] = useState(false);
  const [bindingAction, setBindingAction] = useState<GameAction | null>(null);
  const [settingsNotice, setSettingsNotice] = useState("");
  const [chatOpen, setChatOpen] = useState(false);
  const [chatDraft, setChatDraft] = useState("");
  const [chatMessages, setChatMessages] = useState<ChatEntry[]>([]);
  const [unreadChat, setUnreadChat] = useState(0);
  const [developerOptions, setDeveloperOptions] = useState<DeveloperOptions>(DEFAULT_DEVELOPER_OPTIONS);
  const [developerMenuOpen, setDeveloperMenuOpen] = useState(false);
  const [playerId] = useState(randomPlayerId);
  const room = useRef<RoomConnection | null>(null);
  const nicknameRef = useRef(nickname);
  const pauseDialogRef = useRef<HTMLElement | null>(null);
  const resumeButtonRef = useRef<HTMLButtonElement | null>(null);
  const pauseReturnFocusRef = useRef<HTMLElement | null>(null);
  const chatInputRef = useRef<HTMLInputElement | null>(null);
  const chatLogRef = useRef<HTMLDivElement | null>(null);
  const chatOpenRef = useRef(false);
  const finishTimerRef = useRef<number | null>(null);

  useEffect(() => {
    nicknameRef.current = nickname;
  }, [nickname]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const params = new URLSearchParams(window.location.search);
      const invitedRoom = normalizeRoomCode(params.get("room") ?? "");
      if (isValidRoomCode(invitedRoom)) {
        setJoinCode(invitedRoom);
        setScreen("join");
      }
      const savedName = window.localStorage.getItem("super-oreo-name");
      const savedSkin = window.localStorage.getItem("super-oreo-skin");
      const savedSettings = window.localStorage.getItem(SETTINGS_STORAGE_KEY);
      const savedSound = window.localStorage.getItem(SOUND_STORAGE_KEY);
      if (savedName) setNickname(savedName.slice(0, 20));
      if (SKINS.some((item) => item.id === savedSkin)) {
        setSkin(savedSkin as (typeof SKINS)[number]["id"]);
      }
      if (savedSettings) {
        try {
          setSettings(normalizeGameSettings(JSON.parse(savedSettings)));
        } catch {
          setSettings(DEFAULT_GAME_SETTINGS);
        }
      }
      if (savedSound !== null) setSoundOn(savedSound !== "false");
      setSettingsHydrated(true);
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    window.localStorage.setItem("super-oreo-name", nickname.trim() || "探险家");
    window.localStorage.setItem("super-oreo-skin", skin);
  }, [nickname, skin]);

  useEffect(() => {
    if (!settingsHydrated) return;
    window.localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings));
  }, [settings, settingsHydrated]);

  useEffect(() => {
    if (!settingsHydrated) return;
    window.localStorage.setItem(SOUND_STORAGE_KEY, String(soundOn));
  }, [settingsHydrated, soundOn]);

  const openPauseMenu = useCallback(() => {
    pauseReturnFocusRef.current = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    setChatOpen(false);
    setDeveloperMenuOpen(false);
    setPauseView("menu");
  }, []);

  const assignBinding = useCallback((action: GameAction, code: string) => {
    if (code === "Tab" || code === "Escape" || code === "KeyT" || code === "Backquote") {
      setSettingsNotice("Tab、Esc、T 与 ` 是界面保留键，请选择其他按键。");
      return;
    }
    setSettings((current) => {
      const nextBindings = { ...current.keyBindings };
      const duplicate = GAME_ACTIONS.find((item) => item !== action && nextBindings[item] === code);
      if (duplicate) nextBindings[duplicate] = nextBindings[action];
      nextBindings[action] = code;
      return { ...current, keyBindings: nextBindings };
    });
    setBindingAction(null);
    setSettingsNotice(`${GAME_ACTION_LABELS[action]} 已设为 ${keyCodeLabel(code)}`);
  }, []);

  useEffect(() => {
    if (!bindingAction) return;
    const captureBinding = (event: KeyboardEvent) => {
      event.preventDefault();
      event.stopImmediatePropagation();
      if (event.code === "Escape") {
        setBindingAction(null);
        setSettingsNotice("已取消按键设置");
        return;
      }
      assignBinding(bindingAction, event.code);
    };
    window.addEventListener("keydown", captureBinding, true);
    return () => window.removeEventListener("keydown", captureBinding, true);
  }, [assignBinding, bindingAction]);

  useEffect(() => {
    chatOpenRef.current = chatOpen;
    const frame = window.requestAnimationFrame(() => {
      if (chatOpen) chatInputRef.current?.focus();
      chatLogRef.current?.scrollTo({ top: chatLogRef.current.scrollHeight });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [chatMessages, chatOpen]);

  useEffect(() => {
    const toggleGamePanels = (event: KeyboardEvent) => {
      if (screen !== "playing" || pauseView !== "closed" || bindingAction || event.repeat) return;
      const target = event.target;
      const editable = (target instanceof HTMLInputElement &&
        ["text", "search", "email", "url", "tel", "password"].includes(target.type)) ||
        target instanceof HTMLTextAreaElement ||
        (target instanceof HTMLElement && target.isContentEditable);
      if (event.code === "Escape" && (chatOpen || developerMenuOpen)) {
        event.preventDefault();
        event.stopImmediatePropagation();
        setChatOpen(false);
        setDeveloperMenuOpen(false);
        return;
      }
      if (editable) return;
      if (event.code === "KeyT") {
        event.preventDefault();
        event.stopImmediatePropagation();
        setDeveloperMenuOpen(false);
        if (!chatOpen) setUnreadChat(0);
        setChatOpen(!chatOpen);
        return;
      }
      if (event.code === "Backquote" && developerOptions.enabled) {
        event.preventDefault();
        event.stopImmediatePropagation();
        setChatOpen(false);
        setDeveloperMenuOpen((current) => !current);
      }
    };
    window.addEventListener("keydown", toggleGamePanels, true);
    return () => window.removeEventListener("keydown", toggleGamePanels, true);
  }, [bindingAction, chatOpen, developerMenuOpen, developerOptions.enabled, pauseView, screen]);

  useEffect(() => {
    const togglePause = (event: KeyboardEvent) => {
      if (screen !== "playing" || pauseView !== "closed" || chatOpen || developerMenuOpen || event.code !== "Tab" || bindingAction) return;
      if (event.repeat) return;
      event.preventDefault();
      openPauseMenu();
    };
    window.addEventListener("keydown", togglePause, true);
    return () => window.removeEventListener("keydown", togglePause, true);
  }, [bindingAction, chatOpen, developerMenuOpen, openPauseMenu, pauseView, screen]);

  useEffect(() => {
    if (pauseView === "closed") {
      const target = pauseReturnFocusRef.current;
      pauseReturnFocusRef.current = null;
      if (target && document.contains(target)) target.focus();
      return;
    }
    const frame = window.requestAnimationFrame(() => {
      if (pauseView === "menu") resumeButtonRef.current?.focus();
      else pauseDialogRef.current?.querySelector<HTMLElement>("[data-settings-autofocus]")?.focus();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [pauseView]);

  useEffect(() => {
    if (pauseView === "closed") return;
    const containFocus = (event: KeyboardEvent) => {
      if (bindingAction) return;
      if (event.code === "Escape") {
        event.preventDefault();
        setPauseView((current) => current === "settings" ? "menu" : "closed");
        return;
      }
      if (event.code !== "Tab") return;
      const focusable = [...(pauseDialogRef.current?.querySelectorAll<HTMLElement>(
        'button:not(:disabled), input:not(:disabled), [href], [tabindex]:not([tabindex="-1"])',
      ) ?? [])].filter((element) => element.offsetParent !== null);
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", containFocus, true);
    return () => window.removeEventListener("keydown", containFocus, true);
  }, [bindingAction, pauseView]);

  const appendChatMessage = useCallback((message: ChatEntry) => {
    setChatMessages((current) => [...current, message].slice(-100));
    if (!chatOpenRef.current) setUnreadChat((current) => Math.min(99, current + 1));
  }, []);

  const appendSystemMessage = useCallback((text: string) => {
    appendChatMessage({
      id: `system_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
      playerId: "system",
      name: "系统",
      text,
      sentAt: Date.now(),
      system: true,
    });
  }, [appendChatMessage]);

  const disconnect = useCallback(() => {
    room.current?.disconnect();
    room.current = null;
    setPlayers([]);
    setRemoteFrames({});
    setRoomCode("");
    setRoomStatus("offline");
    setRoomTransport("none");
    setIsReady(false);
    setChatOpen(false);
    setChatDraft("");
    setChatMessages([]);
    setUnreadChat(0);
    setDeveloperMenuOpen(false);
    setDeveloperOptions(DEFAULT_DEVELOPER_OPTIONS);
  }, []);

  useEffect(() => () => {
    disconnect();
    if (finishTimerRef.current !== null) window.clearTimeout(finishTimerRef.current);
  }, [disconnect]);

  const openRoom = useCallback(
    async (code: string) => {
      const normalizedCode = normalizeRoomCode(code);
      if (!isValidRoomCode(normalizedCode)) {
        setNotice("房间码应为 6 位字符，且不包含容易混淆的 I、O、0、1。");
        setScreen("join");
        return;
      }
      disconnect();
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
          onTransport: setRoomTransport,
          onRoomState: (nextPlayers) => setPlayers(nextPlayers),
          onStart: () => {
            setHud(INITIAL_HUD);
            setPauseView("closed");
            setChatOpen(false);
            setDeveloperMenuOpen(false);
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
          onChatMessage: appendChatMessage,
          onError: (message) => setNotice(message),
        },
      );
      room.current = connection;
      await connection.connect();
    },
    [appendChatMessage, disconnect, nickname, playerId, skin],
  );

  const createRoom = useCallback(async () => {
    setNotice("正在搭建冒险房间…");
    try {
      const code = await createOnlineRoom();
      await openRoom(code);
    } catch {
      setNotice("创建房间失败，请检查网络连接后重试。");
      setScreen("menu");
    }
  }, [openRoom]);

  const startSolo = useCallback(() => {
    disconnect();
    setHud(INITIAL_HUD);
    setPauseView("closed");
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

  const submitChat = useCallback(() => {
    const text = chatDraft.trim();
    if (!text) return;
    setChatDraft("");
    if (text.toLowerCase() === "/develop") {
      const enabled = !developerOptions.enabled;
      setDeveloperOptions((current) => ({
        ...current,
        enabled,
        lives: enabled ? hud.lives : current.lives,
        flying: enabled ? current.flying : false,
        invulnerable: enabled ? current.invulnerable : false,
      }));
      if (!enabled) setDeveloperMenuOpen(false);
      appendSystemMessage(enabled
        ? "开发者模式已开启。按 ` 显示或隐藏开发者菜单。"
        : "开发者模式已关闭，本机参数已恢复正常规则。");
      return;
    }

    if (room.current) {
      room.current.sendChatMessage(text);
      return;
    }
    const localMessage = createChatMessage({
      playerId,
      name: nicknameRef.current || "探险家",
      skin,
    }, text);
    if (localMessage) appendChatMessage(localMessage);
  }, [appendChatMessage, appendSystemMessage, chatDraft, developerOptions.enabled, hud.lives, playerId, skin]);

  const handleFinish = useCallback((finalHud: GameHud) => {
    setHud(finalHud);
    setPauseView("closed");
    setChatOpen(false);
    setDeveloperMenuOpen(false);
    room.current?.sendFinish({ elapsedMs: finalHud.elapsedMs, coins: finalHud.coins, deaths: finalHud.deaths });
    if (finishTimerRef.current !== null) window.clearTimeout(finishTimerRef.current);
    finishTimerRef.current = window.setTimeout(() => {
      finishTimerRef.current = null;
      setScreen("results");
    }, 650);
  }, []);

  const returnHome = useCallback(() => {
    if (finishTimerRef.current !== null) {
      window.clearTimeout(finishTimerRef.current);
      finishTimerRef.current = null;
    }
    disconnect();
    setHud(INITIAL_HUD);
    setPauseView("closed");
    setBindingAction(null);
    setNotice("");
    setScreen("menu");
    window.history.replaceState({}, "", window.location.pathname);
  }, [disconnect]);

  const transportLabel = TRANSPORT_LABELS[roomTransport];

  return (
    <main className="game-shell">
      <GameStage
        active={screen === "playing"}
        attract={screen !== "playing"}
        skin={skin}
        soundOn={soundOn}
        paused={pauseView !== "closed"}
        controlsBlocked={chatOpen || developerMenuOpen}
        settings={settings}
        developerOptions={developerOptions}
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
          {screen === "playing" && (
            <button className="icon-button game-menu-button" type="button" onClick={openPauseMenu} aria-label="打开暂停菜单">菜单</button>
          )}
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
            <div className="hud-shards" aria-label={`已找到 ${hud.moonShards} 枚月光碎片`}><span>◆</span><strong>{hud.moonShards}/{hud.totalMoonShards}</strong></div>
          </div>
          <div className="hud-stack hud-stack--right">
            <div className="hud-timer"><small>TIME</small><strong>{formatCounter(hud.timeRemaining, 4)}</strong></div>
            <div className="hud-score">{formatCounter(hud.score, 6)}</div>
            <div className={`hud-dash${hud.dashReady ? " is-ready" : ""}`}><kbd>{keyCodeLabel(settings.keyBindings.dash)}</kbd> 空中冲刺 {hud.dashReady ? "就绪" : "落地充能"}</div>
          </div>
          <div className="hud-route"><small>{hud.biomeSubtitle}</small><span>{hud.biome}</span><strong>{hud.objective}</strong><em>检查点 {hud.checkpoint}/{hud.totalCheckpoints}</em></div>
          <div className="mouse-hint"><span>点击画面锁定鼠标 · T 聊天 · Tab 菜单</span><small>{keyCodeLabel(settings.keyBindings.forward)} {keyCodeLabel(settings.keyBindings.backward)} {keyCodeLabel(settings.keyBindings.left)} {keyCodeLabel(settings.keyBindings.right)} 移动 · {keyCodeLabel(settings.keyBindings.jump)} 跳跃 · {keyCodeLabel(settings.keyBindings.sprint)} 加速 · {keyCodeLabel(settings.keyBindings.dash)} 空中冲刺 · 鼠标转动视角</small></div>
        </section>
      )}

      {screen === "playing" && (
        <>
          {!chatOpen && (
            <button className="chat-launcher" type="button" onClick={() => { setDeveloperMenuOpen(false); setUnreadChat(0); setChatOpen(true); }} aria-label="打开房间聊天">
              <kbd>T</kbd><span>聊天</span>{unreadChat > 0 && <strong>{unreadChat}</strong>}
            </button>
          )}
          {chatOpen && (
            <section className="game-chat" aria-label="房间聊天窗口">
              <header className="game-chat__header">
                <div><span className="chat-live-dot" /><b>{roomCode ? `房间 ${roomCode}` : "本次冒险"}</b><small>全房间聊天</small></div>
                <button type="button" onClick={() => setChatOpen(false)} aria-label="关闭聊天">关闭</button>
              </header>
              <div ref={chatLogRef} className="game-chat__log" role="log" aria-live="polite" aria-relevant="additions text">
                {chatMessages.length === 0 && (
                  <p className="game-chat__empty">还没有消息。向队友打个招呼吧！</p>
                )}
                {chatMessages.map((message) => (
                  <article className={`chat-message${message.system ? " chat-message--system" : ""}`} key={`${message.playerId}:${message.id}`}>
                    <div><b>{message.name}</b><time dateTime={new Date(message.sentAt).toISOString()}>{formatChatTime(message.sentAt)}</time></div>
                    <p>{message.text}</p>
                  </article>
                ))}
              </div>
              <form className="game-chat__composer" onSubmit={(event) => { event.preventDefault(); submitChat(); }}>
                <input
                  ref={chatInputRef}
                  value={chatDraft}
                  maxLength={280}
                  onChange={(event) => setChatDraft(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key !== "Enter" || event.nativeEvent.isComposing) return;
                    event.preventDefault();
                    submitChat();
                  }}
                  placeholder="输入消息，Enter 发送"
                  aria-label="聊天消息"
                  autoComplete="off"
                />
                <button type="submit" disabled={!chatDraft.trim()}>发送</button>
              </form>
              <p className="game-chat__hint">T 打开/关闭 · Esc 关闭 · 输入 /develop 切换本机开发者模式</p>
            </section>
          )}

          {developerOptions.enabled && !developerMenuOpen && (
            <button className="developer-badge" type="button" onClick={() => { setChatOpen(false); setDeveloperMenuOpen(true); }}>
              <b>DEV</b><span>` 开发者菜单</span>
            </button>
          )}
          {developerOptions.enabled && developerMenuOpen && (
            <aside className="developer-panel" aria-label="开发者菜单">
              <header>
                <div><small>LOCAL PLAYER</small><h2>开发者菜单</h2></div>
                <button type="button" onClick={() => setDeveloperMenuOpen(false)} aria-label="隐藏开发者菜单">×</button>
              </header>
              <p className="developer-panel__scope">所有修改仅作用于本人，不会改变其他玩家。</p>

              <label className="developer-number" htmlFor="developer-lives">
                <span><b>生命数</b><small>当前 HUD：{hud.lives}</small></span>
                <input
                  id="developer-lives"
                  type="number"
                  min="1"
                  max="99"
                  value={developerOptions.lives}
                  onChange={(event) => setDeveloperOptions((current) => ({
                    ...current,
                    lives: Math.min(99, Math.max(1, Number(event.target.value) || 1)),
                  }))}
                />
              </label>

              <button className="developer-toggle" type="button" role="switch" aria-checked={developerOptions.flying} onClick={() => setDeveloperOptions((current) => ({ ...current, flying: !current.flying }))}>
                <span><b>飞行模式</b><small>空格上升，Ctrl 下降</small></span><i />
              </button>
              <button className="developer-toggle" type="button" role="switch" aria-checked={developerOptions.invulnerable} onClick={() => setDeveloperOptions((current) => ({ ...current, invulnerable: !current.invulnerable }))}>
                <span><b>无敌模式</b><small>忽略敌人与机关伤害</small></span><i />
              </button>

              <label className="developer-range" htmlFor="developer-speed">
                <span><b>行走速度</b><strong>×{developerOptions.moveSpeedMultiplier.toFixed(1)}</strong></span>
                <input
                  id="developer-speed"
                  type="range"
                  min="0.5"
                  max="4"
                  step="0.1"
                  value={developerOptions.moveSpeedMultiplier}
                  onChange={(event) => setDeveloperOptions((current) => ({ ...current, moveSpeedMultiplier: Number(event.target.value) }))}
                />
              </label>
              <label className="developer-range" htmlFor="developer-jump">
                <span><b>跳跃高度</b><strong>×{developerOptions.jumpHeightMultiplier.toFixed(1)}</strong></span>
                <input
                  id="developer-jump"
                  type="range"
                  min="0.5"
                  max="3"
                  step="0.1"
                  value={developerOptions.jumpHeightMultiplier}
                  onChange={(event) => setDeveloperOptions((current) => ({ ...current, jumpHeightMultiplier: Number(event.target.value) }))}
                />
              </label>

              <footer>
                <button type="button" onClick={() => setDeveloperOptions({ ...DEFAULT_DEVELOPER_OPTIONS, enabled: true, lives: hud.lives })}>恢复本机默认值</button>
                <span>按 ` 隐藏</span>
              </footer>
            </aside>
          )}
        </>
      )}

      {screen === "playing" && pauseView !== "closed" && (
        <div className="pause-overlay" role="presentation">
          <section ref={pauseDialogRef} className={`pause-card${pauseView === "settings" ? " pause-card--settings" : ""}`} role="dialog" aria-modal="true" aria-labelledby="pause-title">
            {pauseView === "menu" ? (
              <>
                <div className="pause-card__emblem"><CookieAvatar /></div>
                <p className="dialog-kicker">冒险暂停</p>
                <h2 id="pause-title">暂停菜单</h2>
                <p>当前进度已保留。按 <kbd>Esc</kbd> 或点击下方按钮继续。</p>
                <div className="pause-menu-actions">
                  <button ref={resumeButtonRef} className="button button--sun button--full" type="button" onClick={() => setPauseView("closed")}>继续游戏</button>
                  <button className="button button--cloud button--full" type="button" onClick={() => { setSettingsNotice(""); setPauseView("settings"); }}>设置</button>
                  <button className="button button--outline button--full" type="button" onClick={returnHome}>主菜单</button>
                </div>
              </>
            ) : (
              <>
                <div className="pause-settings-heading">
                  <div><p className="dialog-kicker">个人设置</p><h2 id="pause-title">控制与镜头</h2></div>
                  <button className="dialog-close" data-settings-autofocus type="button" onClick={() => { setBindingAction(null); setPauseView("menu"); }}>返回</button>
                </div>

                <div className="settings-layout">
                  <div className="settings-panel">
                    <label className="range-setting" htmlFor="mouse-sensitivity">
                      <span><b>鼠标灵敏度</b><small>{Math.round(settings.mouseSensitivity * 100)}%</small></span>
                      <input
                        id="mouse-sensitivity"
                        type="range"
                        min="0.35"
                        max="2"
                        step="0.05"
                        value={settings.mouseSensitivity}
                        aria-valuetext={`${Math.round(settings.mouseSensitivity * 100)}%`}
                        onChange={(event) => setSettings((current) => ({ ...current, mouseSensitivity: Number(event.target.value) }))}
                      />
                    </label>
                    <button className="toggle-setting" type="button" role="switch" aria-checked={settings.invertYAxis} onClick={() => setSettings((current) => ({ ...current, invertYAxis: !current.invertYAxis }))}>
                      <span><b>垂直视角反转</b><small>反转鼠标上下移动方向</small></span><i />
                    </button>
                    <button className="toggle-setting" type="button" role="switch" aria-checked={settings.autoPointerLock} onClick={() => setSettings((current) => ({ ...current, autoPointerLock: !current.autoPointerLock }))}>
                      <span><b>点击后锁定鼠标</b><small>关闭后可按住拖动视角</small></span><i />
                    </button>
                    <button className="toggle-setting" type="button" role="switch" aria-checked={soundOn} onClick={() => setSoundOn((value) => !value)}>
                      <span><b>游戏声音</b><small>背景节拍与交互音效</small></span><i />
                    </button>
                  </div>

                  <div className="keybind-panel" aria-label="自定义按键">
                    <div className="keybind-panel__title"><b>自定义按键</b><small>{bindingAction ? "请按下新按键，Esc 取消" : "点击任一按键后重新输入"}</small></div>
                    <div className="keybind-grid">
                      {GAME_ACTIONS.map((action) => (
                        <div className="keybind-row" key={action}>
                          <span>{GAME_ACTION_LABELS[action]}</span>
                          <button
                            className={bindingAction === action ? "is-listening" : ""}
                            type="button"
                            onClick={() => { setBindingAction(action); setSettingsNotice(""); }}
                            aria-label={bindingAction === action
                              ? `${GAME_ACTION_LABELS[action]}，正在等待输入`
                              : `${GAME_ACTION_LABELS[action]}，当前为 ${keyCodeLabel(settings.keyBindings[action])}，点击修改`}
                          >{bindingAction === action ? "请按键…" : keyCodeLabel(settings.keyBindings[action])}</button>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
                <div className="settings-footer">
                  <p role="status">{settingsNotice || "设置会自动保存在此浏览器中"}</p>
                  <button className="button button--outline" type="button" onClick={() => { setSettings(DEFAULT_GAME_SETTINGS); setSoundOn(true); setSettingsNotice("已恢复默认设置"); }}>恢复默认</button>
                  <button className="button button--sun" type="button" onClick={() => { setBindingAction(null); setPauseView("closed"); }}>保存并继续</button>
                </div>
              </>
            )}
          </section>
        </div>
      )}

      {screen === "menu" && (
        <section className="hero-panel">
          <div className="eyebrow"><span /> 六境原创 3D 平台远征 <span /></div>
          <h1 aria-label="超级奥利奥">
            <span className="title-super">超级</span>
            <span className="title-oreo">奥利奥</span>
          </h1>
          <p className="hero-copy">穿过花庭、齿轮港、霜晶谷、可可熔炉与月光城。<br />寻找隐藏支路，或者叫上三位朋友一起远征。</p>

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
          {notice && <p className="menu-notice" role="status">{notice}</p>}

          <div className="control-hint"><kbd>W</kbd><kbd>S</kbd><kbd>A</kbd><kbd>D</kbd> 自由移动 <kbd>Space</kbd> 跳跃 <kbd>Shift</kbd> 加速 <kbd>E</kbd> 空中冲刺 · 鼠标控制视角</div>
        </section>
      )}

      {screen === "join" && (
        <section className="dialog-card join-card">
          <button className="dialog-close" type="button" onClick={() => setScreen("menu")} aria-label="关闭">关闭</button>
          <CookieAvatar />
          <p className="dialog-kicker">加入好友</p>
          <h2>输入房间码</h2>
          <p>房间码由 6 位字母与数字组成，不含 I、O、0、1。</p>
          <input
            className="room-code-input"
            value={joinCode}
            maxLength={6}
            onChange={(event) => {
              setJoinCode(event.target.value.toUpperCase().replace(/[^ABCDEFGHJKLMNPQRSTUVWXYZ23456789]/g, ""));
              setNotice("");
            }}
            placeholder="CKY234"
            autoFocus
            aria-label="房间码"
          />
          <button className="button button--sun button--full" type="button" disabled={!isValidRoomCode(joinCode)} onClick={() => openRoom(joinCode)}>进入房间</button>
          {notice && <p className="notice" role="status">{notice}</p>}
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
              <span className={`transport-badge transport-badge--${roomTransport}`}>{transportLabel.title}</span>
              <h3>{roomStatus === "connected" ? "跨设备连接已就绪" : roomStatus === "fallback" ? "本机联机可用" : "正在连接房间"}</h3>
              <p>{hostPlayer ? `${hostPlayer.name} 的电脑是本局临时主机` : "正在确定房主"}<br />{transportLabel.detail}<br />最多 4 人，所有人可独立抵达终点。</p>
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
          <div className={`result-rating result-rating--${hud.rating.toLowerCase()}`} aria-label={`${hud.rating} 级评价`}>{hud.rating}</div>
          <h2>六境远征完成！</h2>
          <p>你已经穿过月光门。再次挑战可以寻找遗漏的月光碎片、隐藏星章与无伤评级。</p>
          <div className="result-stats">
            <div><small>用时</small><strong>{formatTime(hud.elapsedMs)}</strong></div>
            <div><small>金币</small><strong>{hud.coins}/{hud.totalCoins}</strong></div>
            <div><small>星章</small><strong>{hud.starMedals}/{hud.totalStarMedals}</strong></div>
            <div><small>月光碎片</small><strong>{hud.moonShards}/{hud.totalMoonShards}</strong></div>
            <div><small>失误</small><strong>{hud.deaths}</strong></div>
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
