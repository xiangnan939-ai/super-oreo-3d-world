import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

/** A browser-only Vite build for Cloudflare Pages (no vinext output required). */
export default defineConfig({
  plugins: [react()],
  publicDir: "public",
  build: {
    outDir: "pages-dist",
    assetsDir: "assets",
    emptyOutDir: true,
    target: "es2022",
  },
});
