import path from "node:path";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const repositoryRoot = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  root: path.join(repositoryRoot, "desktop"),
  plugins: [react()],
  resolve: {
    alias: {
      "@": repositoryRoot,
    },
  },
  server: {
    host: "127.0.0.1",
    port: 1420,
    strictPort: true,
  },
  clearScreen: false,
  build: {
    outDir: path.join(repositoryRoot, "dist-desktop"),
    emptyOutDir: true,
  },
});

