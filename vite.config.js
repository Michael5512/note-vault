import { defineConfig } from "vite";

export default defineConfig({
  server: {
    host: true,
    port: process.env.PORT ? Number(process.env.PORT) : 5173,
  },
  preview: {
    host: true,
    port: process.env.PORT ? Number(process.env.PORT) : 4173,
  },
});
