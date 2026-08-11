# Выкат на n-e-n.ru/knigi/

Сервис раздаётся статикой из подкаталога основного сайта — так же, как `/school/`
и `/firstyear/`. Приложение ничего не исполняет на сервере: nginx отдаёт файлы,
всё остальное происходит в браузере.

## Что складывается в сборке

```bash
pnpm install --frozen-lockfile
pnpm covers:cache          # обложки в собственный кеш, ~70 МБ, идемпотентно
pnpm build                 # каталог, приложение, 2500 постоянных страниц, sitemap
```

На выходе `apps/books/dist`:

| Что | Где | Размер |
|---|---|---|
| Приложение | `assets/*.js`, `assets/*.css` | ~200 КБ |
| Индекс каталога | `data/catalog-index.json` | 3,5 МБ (527 КБ gzip) |
| Карточки книг | `data/books/<слаг>.json` | ~5 КБ каждая |
| Обложки | `covers/*.webp` | ~29 КБ каждая |
| Постоянные страницы | `kniga/<слаг>.html` и разделы | 2500 + 5 |
| Карта сайта | `sitemap.xml` | 2500+ адресов |

Адрес и базовый путь задаются переменными окружения, значения по умолчанию —
боевые: `BOOKS_PUBLIC_ORIGIN=https://n-e-n.ru`, `BOOKS_BASE_PATH=/knigi/`.

## Что положить на сервер

```bash
rsync -az --delete apps/books/dist/ root@n-e-n.ru:/home/nen/n-e-n.ru/_static/knigi/
```

**Перед первым выкатом сделать бэкап заменяемого каталога с датой** — прод не под
git, откатываться больше нечем.

## nginx

Блок добавляется в `sites-enabled/nen.conf` рядом с остальными статическими
разделами. `try_files` нужен, потому что путь книги — это отдельный html-файл,
а внутренняя навигация переписывает адрес через History API.

```nginx
location /knigi/ {
    alias /home/nen/n-e-n.ru/_static/knigi/;

    # /knigi/kniga/kolobok → kniga/kolobok.html; неизвестный адрес → 404 приложения
    try_files $uri $uri.html $uri/index.html /knigi/404.html;

    location ~* ^/knigi/(assets|covers)/ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }

    # Индекс каталога меняется с каждой пересборкой — держим короткий кеш
    location ~* ^/knigi/data/ {
        expires 10m;
        add_header Cache-Control "public";
        gzip_static on;
    }
}
```

Карту сайта добавить в `robots.txt` домена:

```
Sitemap: https://n-e-n.ru/knigi/sitemap.xml
```

## Проверки после выката

1. `curl -sI https://n-e-n.ru/knigi/ | head -1` — 200.
2. `curl -s https://n-e-n.ru/knigi/kniga/kolobok | grep canonical` — canonical на
   `https://n-e-n.ru/knigi/kniga/kolobok`, а не на домен превью.
3. `curl -s https://n-e-n.ru/knigi/sitemap.xml | grep -c "<loc>"` — 2500+.
4. Открыть каталог с телефона: карточки появляются после загрузки индекса,
   обложки идут с `n-e-n.ru`, а не с сайтов издательств.
5. `curl -sI https://n-e-n.ru/knigi/chego-to-net | head -1` — отдаётся 404-страница.

## Обновление каталога

Каталог пересобирается из выгрузок в `data/source/`, поэтому обновление —
это `pnpm build` и повторный rsync. Кеш обложек докачивает только новое:
`pnpm covers:cache` можно гонять перед каждым выкатом.
