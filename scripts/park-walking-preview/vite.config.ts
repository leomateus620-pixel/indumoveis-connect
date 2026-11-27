import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";

const here = (path: string) => fileURLToPath(new URL(path, import.meta.url));
export default defineConfig({
  root: here("./"),
  publicDir: here("../../public/"),
  envDir: here("../"),
  resolve: { alias: { "@": here("../../src/") } },
  plugins: [react()],
  server: { fs: { allow: [here("../../")] } },
  build: { outDir: here("../../artifacts.local/park-walking-preview"), emptyOutDir: true },
});
