import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
// @ts-expect-error — конфигурационный модуль на JS, типов не имеет
import { scopeCssPlugin } from "../../scripts/books/scope-css.mjs";

// Сервис раздаётся из подкаталога основного сайта (n-e-n.ru/knigi/) и живёт
// внутри его раскладки, поэтому стили заворачиваются в контейнер .knigi.
// Путь задаётся переменной, чтобы превью и отдельный поддомен собирались тем же кодом.
export default defineConfig({
  base: process.env.BOOKS_BASE_PATH ?? "/knigi/",
  plugins: [scopeCssPlugin(), react()],
  build: {
    // Сайт подключает сборку по манифесту: имена файлов содержат хеш.
    manifest: true,
  },
});
