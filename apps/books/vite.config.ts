import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Сервис раздаётся из подкаталога основного сайта (n-e-n.ru/knigi/).
// Путь задаётся переменной, чтобы превью и отдельный поддомен собирались тем же кодом.
export default defineConfig({
  base: process.env.BOOKS_BASE_PATH ?? "/knigi/",
  plugins: [react()],
});
