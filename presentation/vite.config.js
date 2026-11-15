// Two decks: index.html (Turkish, live talk, 11 slides) and nasa.html (English, 7-page submission).
// Written with AI assistance (Claude).
import { defineConfig } from "vite";

export default defineConfig({
  build: {
    rollupOptions: { input: { main: "index.html", nasa: "nasa.html" } },
  },
});
