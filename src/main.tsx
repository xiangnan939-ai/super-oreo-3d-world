/// <reference types="vite/client" />

import { createRoot } from "react-dom/client";
import { OreoGameApp } from "../components/OreoGameApp";
import "../app/globals.css";

/**
 * Cloudflare Pages and the multiplayer Worker are deployed independently.
 * Keep the existing game client unchanged by transparently routing only its
 * room API requests to the Worker configured at build time.
 */
function installRoomApiRouter(): void {
  const configuredOrigin = import.meta.env.VITE_ROOM_API_ORIGIN?.trim();
  if (!configuredOrigin) return;

  let roomApiOrigin: URL;
  try {
    roomApiOrigin = new URL(configuredOrigin);
    if (roomApiOrigin.protocol !== "https:" && roomApiOrigin.protocol !== "http:") {
      throw new Error("VITE_ROOM_API_ORIGIN must use http or https");
    }
  } catch (error) {
    console.error("Ignoring invalid VITE_ROOM_API_ORIGIN.", error);
    return;
  }

  const shouldRoute = (url: URL) =>
    url.host === window.location.host && /^\/api\/rooms(?:\/|$)/.test(url.pathname);

  const routeHttpUrl = (value: string | URL): URL => {
    const url = new URL(value.toString(), window.location.href);
    if (!shouldRoute(url)) return url;
    url.protocol = roomApiOrigin.protocol;
    url.host = roomApiOrigin.host;
    return url;
  };

  const nativeFetch = window.fetch.bind(window);
  window.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
    if (input instanceof Request) {
      const routedUrl = routeHttpUrl(input.url);
      const routedRequest = routedUrl.href === input.url
        ? input
        : new Request(routedUrl, input);
      return nativeFetch(routedRequest, init);
    }

    return nativeFetch(routeHttpUrl(input), init);
  }) as typeof window.fetch;

  const NativeWebSocket = window.WebSocket;
  class RoomWebSocket extends NativeWebSocket {
    constructor(url: string | URL, protocols?: string | string[]) {
      const routedUrl = routeHttpUrl(url);
      if (shouldRoute(new URL(url.toString(), window.location.href))) {
        routedUrl.protocol = roomApiOrigin.protocol === "https:" ? "wss:" : "ws:";
      }

      if (protocols === undefined) super(routedUrl);
      else super(routedUrl, protocols);
    }
  }

  window.WebSocket = RoomWebSocket as typeof WebSocket;
}

installRoomApiRouter();

const rootElement = document.getElementById("root");
if (!rootElement) throw new Error("Missing #root application mount point.");

createRoot(rootElement).render(<OreoGameApp />);
