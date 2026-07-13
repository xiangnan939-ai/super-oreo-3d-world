import { access, mkdir, rm, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "vite";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const configFile = resolve(projectRoot, "vite.pages.config.ts");
const outputDirectory = resolve(projectRoot, "pages-dist");

await Promise.all([
  access(resolve(projectRoot, "index.html")),
  access(resolve(projectRoot, "src/main.tsx")),
  access(configFile),
]);

const roomApiOrigin = process.env.VITE_ROOM_API_ORIGIN?.trim();
if (roomApiOrigin) {
  const url = new URL(roomApiOrigin);
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new Error("VITE_ROOM_API_ORIGIN must be an http(s) origin.");
  }
}

process.chdir(projectRoot);
await build({
  configFile,
  mode: process.env.NODE_ENV === "development" ? "development" : "production",
});

// `vinext build` writes this pointer for Worker deployments. Wrangler Pages
// also reads it when present, so remove the generated hint before a Pages
// upload and let Wrangler use the root Pages configuration instead.
await rm(resolve(projectRoot, ".wrangler/deploy/config.json"), { force: true });

await mkdir(outputDirectory, { recursive: true });
await writeFile(
  resolve(outputDirectory, "_headers"),
  `/*
  X-Content-Type-Options: nosniff
  Referrer-Policy: strict-origin-when-cross-origin
  Permissions-Policy: camera=(), microphone=(), geolocation=()

/assets/*
  Cache-Control: public, max-age=31536000, immutable

/index.html
  Cache-Control: no-cache
`,
  "utf8",
);

console.log(`Cloudflare Pages bundle ready: ${outputDirectory}`);
