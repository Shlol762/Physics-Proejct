import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  base: "/Physics-Proejct/", // This is the crucial line for GitHub Pages
  server: {
    host: true,
    port: 5173
  }
});