export interface BookCollection {
  slug: string;
  title: string;
  description: string;
  introduction: string;
  bookIds: string[];
  ageLabel?: string;
  updatedAt: string;
  sourceUrl?: string;
}

export const collections: BookCollection[] = [
    {
      slug: "vybor-redaktsii-nen-2020",
      title: "Лучшие книги для детей: выбор редакции НЭН",
      description: "Книги, которые дети редакции НЭН особенно полюбили за год: смешные, волшебные, приключенческие и уютные истории для семейного чтения.",
      introduction: "В этой подборке разные читательские характеры и возрасты встречаются на одной книжной полке — от стихов и сказок до больших приключенческих историй.",
      bookIds: [
        "nen-bv2-081",
        "nen-002",
        "nen-bv2-056",
        "nen-bv2-079",
        "ol-ol29230428w"
      ],
      ageLabel: "3–12 лет",
      updatedAt: "2026-07-25",
      sourceUrl: "https://n-e-n.ru/thebestbooksforchildren2020/"
    },
    {
      slug: "desyat-glavnyh-detskih-knig",
      title: "10 главных детских книг за 10 лет",
      description: "Десять заметных детских книг последнего десятилетия — от озорных стихов и сказок до серьёзных историй о взрослении и поиске своего места.",
      introduction: "Подборка пригодится семьям, которые хотят быстро познакомиться с современной детской литературой и выбрать книгу под настроение и возраст ребёнка.",
      bookIds: [
        "nen-024",
        "nen-023",
        "curated-whitecrow-navoznyy-zhuk-letaet-v-sumerkah-navoznyj-zhuk-letaet-v-sumerkah",
        "curated-samokat-miss-cheriti-miss-cheriti",
        "ol-ol26452135w",
        "curated-samokat-den-chisla-pi-den-chisla-pi"
      ],
      ageLabel: "5–15 лет",
      updatedAt: "2026-07-25",
      sourceUrl: "https://n-e-n.ru/10-glavnih-detskih-knig/"
    },
    {
      slug: "knigi-pro-pervuyu-lyubov",
      title: "Подборка книг про первую любовь",
      description: "Четыре подростковые книги о первом сильном чувстве, неловкости, границах и переменах, которые начинаются вместе с влюблённостью.",
      introduction: "Эти истории помогут подростку узнать себя в героях, а взрослым — бережно начать разговор о чувствах без поучений и готовых ответов.",
      bookIds: [
        "curated-samokat-otel-bolshaya-l-otel-bolshaya-l",
        "curated-samokat-gips-gips"
      ],
      ageLabel: "10–16 лет",
      updatedAt: "2026-07-25",
      sourceUrl: "https://n-e-n.ru/knigi-pro-pervuyu-lyubov/"
    },
    {
      slug: "knigi-dlya-podrostkov",
      title: "15 книг для подростков, от которых невозможно оторваться",
      description: "Динамичные романы о магии, школе, семье, тайнах и сложном взрослении — для подростков, которым важно, чтобы книга захватила с первых страниц.",
      introduction: "Здесь есть фэнтези, реалистическая проза и напряжённые семейные истории; подборка подойдёт и увлечённым читателям, и тем, кто пока не нашёл свою книгу.",
      bookIds: [
        "nen-bv2-140",
        "nen-bv2-137"
      ],
      ageLabel: "12–17 лет",
      updatedAt: "2026-07-25",
      sourceUrl: "https://n-e-n.ru/knigi-dlya-podrostkov/"
    },
    {
      slug: "knigi-na-kanikuly",
      title: "Телефоны в сторону: 8 книг для подростков, которые стоит прочитать на каникулах",
      description: "Восемь книг с магией, тайнами, путешествиями и необычными героями — хороший повод отложить телефон и провести каникулы за чтением.",
      introduction: "Подборка рассчитана на детей постарше и подростков, которые любят быстрое действие, загадки и миры, куда хочется возвращаться.",
      bookIds: [
        "curated-samokat-neveroyatnoe-nashestvie-medvedey-na-sitsiliyu-neveroyatnoe-nashestvie-medvedey-na-sitsiliyu"
      ],
      ageLabel: "9–16 лет",
      updatedAt: "2026-07-25",
      sourceUrl: "https://n-e-n.ru/8-knig/"
    },
    {
      slug: "goroshek-tsikada-i-volshebstvo",
      title: "Горошек, цикада и немного волшебства: подборка книг для малышей",
      description: "Пять свежих книжек для самых маленьких — о совместной игре, творчестве, встречах, домашнем уюте и сказках перед сном.",
      introduction: "Книги удобно читать вместе с малышом, обсуждая картинки, чувства героев и маленькие события, из которых складывается детский день.",
      bookIds: [
        "ol-ol26452135w",
        "ol-ol19978428w"
      ],
      ageLabel: "2–6 лет",
      updatedAt: "2026-07-25",
      sourceUrl: "https://n-e-n.ru/goroshek/"
    },
    {
      slug: "novye-fantasticheskie-istorii",
      title: "«Сохраняй свободу в голове и магию на кончиках пальцев»: новые фантастические истории для младших школьников",
      description: "Пять фантастических книг с говорящими предметами, волшебными ремёслами, тайнами и приключениями для младших школьников.",
      introduction: "Подборка подойдёт детям, которые любят необычные миры, короткие сказочные истории и героев, способных находить выход из самых странных ситуаций.",
      bookIds: [
        "curated-samokat-slon-v-polnom-smysle-etogo-slova-skazki-slon-v-polnom-smysle-etogo-slova-skazki",
        "curated-samokat-kvartetnye-skazki-kvartetnye-skazki"
      ],
      ageLabel: "6–12 лет",
      updatedAt: "2026-07-25",
      sourceUrl: "https://n-e-n.ru/sohraniai-svobody-v-golove/"
    }
  ];
