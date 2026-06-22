import { defineConfig } from "vite";

export default defineConfig({
  root: "src/client",
  build: {
    outDir: "../../dist/client",
    emptyOutDir: true,
  },
  server: {
    host: "127.0.0.1",
    port: 5173,
    hmr: {
      host: "127.0.0.1",
      clientPort: 5173,
    },
  },
});
