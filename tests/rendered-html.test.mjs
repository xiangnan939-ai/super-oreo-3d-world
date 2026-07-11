import assert from "node:assert/strict";
import test from "node:test";

async function render(pathname = "/") {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}-${Math.random()}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request(`http://localhost${pathname}`, { headers: { accept: "text/html" } }),
    { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } },
    { waitUntil() {}, passThroughOnException() {} },
  );
}

test("server-renders the Super Oreo 3D adventure shell", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<html lang="zh-CN">/i);
  assert.match(html, /超级奥利奥/);
  assert.match(html, /原创 3D 平台冒险/);
  assert.match(html, /单人出发/);
  assert.match(html, /创建联机房间/);
  assert.match(html, /<canvas>/i);
  assert.doesNotMatch(html, /codex-preview|react-loading-skeleton|Your site is taking shape/i);
});

test("ships product metadata instead of starter metadata", async () => {
  const response = await render();
  const html = await response.text();
  assert.match(html, /<meta name="application-name" content="超级奥利奥"/i);
  assert.match(html, /3D 在线闯关/);
  assert.match(html, /theme-color/);
  assert.doesNotMatch(html, /Starter Project|Codex is building/i);
});
