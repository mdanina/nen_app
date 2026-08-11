# Выкат на n-e-n.ru/knigi/

Сервис живёт внутри страницы основного сайта: HTML отдаёт Yii в раскладке
`new_nen` (настоящие шапка, подвал и счётчики), а сборку приложения, каталог
и обложки раздаёт nginx файлами. Обрамление не копируется в статику намеренно:
шапка и подвал собираются из базы (`Menu::active`), снимок бы замёрз.

Правка на стороне сайта — [peshexod/n-e-n.ru](https://github.com/peshexod/n-e-n.ru):
контроллер `KnigiController`, вьюха `knigi/app`, правила маршрутов, блок nginx
и bind-mount каталога сборки.

## Сборка

```bash
pnpm install --frozen-lockfile
pnpm covers:cache          # обложки в собственный кеш, ~100 МБ, идемпотентно
pnpm build                 # каталог, приложение, карта сайта
```

На выходе `apps/books/dist`:

| Что | Где | Размер |
|---|---|---|
| Приложение | `assets/*.js`, `assets/*.css` | ~300 КБ |
| Манифест сборки | `.vite/manifest.json` | по нему сайт подключает файлы |
| Индекс каталога | `data/catalog-index.json` | 4 МБ (527 КБ gzip) |
| Карточки книг | `data/books/<слаг>.json` | ~5 КБ каждая |
| Обложки | `covers/*.webp` | ~29 КБ каждая |
| Карта сайта | `sitemap.xml` | 2514 адресов |

Постоянные страницы (`kniga/<слаг>.html` и разделы) сборка тоже делает — они
нужны для отдельного стенда и Vercel. **На n-e-n.ru их заливать не надо**:
HTML там рисует Yii, а `knigi/index.html` перехватил бы `/knigi/`.

## Что положить на сервер

```bash
rsync -az --delete --include='assets/***' --include='covers/***' --include='data/***' --include='brand/***' --include='.vite/***' --include='sitemap.xml' --exclude='*' apps/books/dist/ root@n-e-n.ru:/home/nen/n-e-n.ru/frontend/web/knigi/
```

Каталог примонтирован в контейнер только на чтение (`docker/compose.prod.yml`),
поэтому после заливки перезапуск не нужен — файлы видны сразу. Исключение:
меняли `compose.prod.yml` или nginx образа — тогда пересобрать и поднять заново.

**Перед первым выкатом сделать бэкап заменяемого каталога с датой** — прод не
под git.

## Карта сайта

Добавить в `robots.txt` домена:

```
Sitemap: https://n-e-n.ru/knigi/sitemap.xml
```

## Адреса

Со слэшем на конце — конвенция сайта (`urlManager` suffix «/» и нормализатор
с постоянным редиректом):

| Страница | Адрес |
|---|---|
| Главная | `/knigi/` |
| Каталог | `/knigi/katalog/` |
| Книга | `/knigi/kniga/<слаг>/` |
| Подборки | `/knigi/podborki/`, `/knigi/podborki/<слаг>/` |
| Подбор книги | `/knigi/podbor/` |
| Избранное | `/knigi/izbrannoe/` (закрыто от индексации) |

## Проверки после выката

1. `curl -sI https://n-e-n.ru/knigi/ | head -1` — 200.
2. `curl -s https://n-e-n.ru/knigi/kniga/kolobok/ | grep -E "canonical|<title>"` —
   canonical на тот же адрес, в заголовке возраст книги.
3. `curl -s https://n-e-n.ru/knigi/katalog/ | grep -c "footer"` — подвал сайта на месте.
4. `curl -sI https://n-e-n.ru/knigi/data/catalog-index.json | head -1` — 200.
5. `curl -s https://n-e-n.ru/knigi/sitemap.xml | grep -c "<loc>"` — 2514.
6. `curl -sI https://n-e-n.ru/knigi/chego-to-net/ | head -1` — 404 сайта.
7. Открыть каталог с телефона: обложки идут с `n-e-n.ru`, панель разделов снизу.

## Локальное превью

```bash
pnpm preview:site          # http://localhost:5199/knigi/
```

Забирает свёрстанную страницу `n-e-n.ru` и показывает сборку внутри неё.
Обрамление в превью — снимок, на проде его рисует Yii.

## Обновление каталога

`pnpm covers:cache && pnpm build`, затем тот же rsync. Правки на стороне сайта
не нужны: имена файлов сборки меняются, но подключаются они по манифесту.
