import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "node:path";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  root: "src/client",
  resolve: { alias: { "@": path.resolve(__dirname, "src/client") } },
  build: { outDir: "../../dist", emptyOutDir: true },
  server: { port: 5173, proxy: { "/api": "http://127.0.0.1:3001" } },
});
