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
      slug: "desyat-glavnyh-detskih-knig",
      title: "10 главных детских книг за 10 лет",
      description: "Десять заметных детских книг последнего десятилетия — от озорных стихов и сказок до серьёзных историй о взрослении и поиске своего места.",
      introduction: "Подборка пригодится семьям, которые хотят быстро познакомиться с современной детской литературой и выбрать книгу под настроение и возраст ребёнка.",
      bookIds: [
        "curated-nen-collection-kartofelnaya-sobaka-yuriy-koval",
        "curated-nen-collection-medved-v-svoem-repertuare-gubert-shirnek",
        "nen-024",
        "nen-023",
        "curated-whitecrow-navoznyy-zhuk-letaet-v-sumerkah-navoznyj-zhuk-letaet-v-sumerkah",
        "curated-nen-collection-shtora-nyanyushki-lagton-virdzhiniya-vulf",
        "curated-samokat-miss-cheriti-miss-cheriti",
        "ol-ol26452135w",
        "curated-samokat-den-chisla-pi-den-chisla-pi",
        "curated-nen-collection-ne-vse-umeyut-padat-toon-tellegen"
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
        "curated-nen-collection-reka-tekuschaya-vspyat-klod-murleva",
        "curated-nen-collection-ya-ne-ya-zhanna-zaytseva-aleksandra",
        "curated-samokat-otel-bolshaya-l-otel-bolshaya-l",
        "curated-samokat-gips-gips"
      ],
      ageLabel: "10–16 лет",
      updatedAt: "2026-07-25",
      sourceUrl: "https://n-e-n.ru/knigi-pro-pervuyu-lyubov/"
    },
    {
      slug: "desyat-knig-dlya-malyshey",
      title: "Что почитать: 10 книг для малышей и младших школьников",
      description: "Книжные новинки для малышей и младших школьников: истории о семье, дружбе, приключениях и повседневных открытиях.",
      introduction: "Подборка поможет выбрать чтение для дождливого дня, спокойного вечера или первых самостоятельных встреч ребёнка с большой книгой.",
      bookIds: [
        "curated-nen-collection-chto-nuzhno-malenkoy-koshke-natalya-shaloshvili",
        "curated-nen-collection-vernye-druzya-mariam-kordes",
        "curated-nen-collection-spat-kak-tigr-masha-lukashkina",
        "curated-nen-collection-moya-sestrenka-olkozavra-dina-gerbek",
        "curated-nen-collection-kak-flip-zatopil-ves-mir-adam-stouer",
        "curated-nen-collection-molli-i-shtormovoe-more-doyl-malahiya",
        "curated-nen-collection-idi-poigray-s-tem-malchikom-klementina-bove",
        "curated-nen-collection-god-polnyy-chudes-b-klyayn",
        "curated-nen-collection-lev-petrushka-i-ego-druzya-maykl-bond",
        "curated-nen-collection-pingvikingi-anton-soya"
      ],
      ageLabel: "1–10 лет",
      updatedAt: "2026-07-25",
      sourceUrl: "https://n-e-n.ru/tenbestbooksforchildren/"
    },
    {
      slug: "knigi-dlya-podrostkov",
      title: "15 книг для подростков, от которых невозможно оторваться",
      description: "Динамичные романы о магии, школе, семье, тайнах и сложном взрослении — для подростков, которым важно, чтобы книга захватила с первых страниц.",
      introduction: "Здесь есть фэнтези, реалистическая проза и напряжённые семейные истории; подборка подойдёт и увлечённым читателям, и тем, кто пока не нашёл свою книгу.",
      bookIds: [
        "curated-nen-collection-zakoldovannaya-zhizn-uinn-dzhons",
        "nen-bv2-140",
        "curated-nen-collection-muley-erlend-lu",
        "nen-bv2-137",
        "curated-nen-collection-zhutko-gromko-i-zapredelno-blizko-safran-foer",
        "curated-nen-collection-milye-kosti-elis-sibold",
        "curated-nen-collection-kogda-my-vstretimsya-rebekka-sted",
        "curated-nen-collection-trinadtsataya-skazka-diana-setterfild",
        "curated-nen-collection-bezdna-chellendzhera-nil-shusterman",
        "curated-nen-collection-devyatnadtsat-minut-dzhodi-pikolt",
        "curated-nen-collection-ptitsa-v-kletke-robin-rou",
        "curated-nen-collection-ulichnyy-kot-po-imeni-bob-dzheyms-bouen",
        "curated-nen-collection-spletni-i-k-pop-aleksandra-yang",
        "curated-nen-collection-heytery-dzhessi-endryus"
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
        "curated-nen-collection-schepotka-magii-mishel-harrison",
        "curated-nen-collection-gorstka-volshebstva-mishel-harrison",
        "curated-nen-collection-klubok-zaklinaniy-mishel-harrison",
        "curated-samokat-neveroyatnoe-nashestvie-medvedey-na-sitsiliyu-neveroyatnoe-nashestvie-medvedey-na-sitsiliyu",
        "curated-nen-collection-malenkaya-vsemirnaya-istoriya-ernst-gombrih",
        "curated-nen-collection-sekrety-koshek-sasha-raush",
        "curated-nen-collection-brat-drakona-larisa-romanovskaya",
        "curated-nen-collection-zatonuvshiy-les-lloyd-dzhons",
        "curated-nen-collection-6-minut-dlya-detey-dominik-spenst",
        "curated-nen-collection-drugaya-elis-mishel-harrison"
      ],
      ageLabel: "9–16 лет",
      updatedAt: "2026-07-25",
      sourceUrl: "https://n-e-n.ru/8-knig/"
    },
    {
      slug: "lyubimye-knigi-alpina-deti",
      title: "Слизь, ссоры и ларёк с шавермой: любимые книги редакции «Альпина.Дети»",
      description: "Любимые книги редакции «Альпина.Дети» о научных открытиях, школьных ссорах, самостоятельности и неловких ситуациях, знакомых каждому ребёнку.",
      introduction: "Подборка объединяет разные форматы и возрасты, но все эти книги помогают с интересом смотреть на мир и узнавать себя в героях.",
      bookIds: [
        "curated-nen-collection-neveroyatno-opasnaya-sliz-ledyanye-myshki-sedobnye-kamni-i-esche-95-istoriy-o-mire-vokrug-nas-nastya-tr",
        "curated-nen-collection-druzhba-posle-ssory-novye-priklyucheniya-emo-i-chiki-dzhoshua-vays",
        "curated-nen-collection-ya-idu-iskat-v-sankt-peterburge-svetlana-shahverdova",
        "curated-nen-collection-konni-i-druzya-novaya-shkola-yuliya-beme",
        "curated-nen-collection-istorii-pro-pyarta-anti-saar"
      ],
      ageLabel: "3–14 лет",
      updatedAt: "2026-07-25",
      sourceUrl: "https://n-e-n.ru/5-knig-alpina/"
    },
    {
      slug: "goroshek-tsikada-i-volshebstvo",
      title: "Горошек, цикада и немного волшебства: подборка книг для малышей",
      description: "Пять свежих книжек для самых маленьких — о совместной игре, творчестве, встречах, домашнем уюте и сказках перед сном.",
      introduction: "Книги удобно читать вместе с малышом, обсуждая картинки, чувства героев и маленькие события, из которых складывается детский день.",
      bookIds: [
        "curated-nen-collection-poigray-s-mimi-anna-permyakova",
        "curated-nen-collection-shkola-risovaniya-goroshka-david-kali",
        "curated-nen-collection-i-kto-to-skazal-privet-nihan-temiz",
        "ol-ol26452135w",
        "ol-ol19978428w"
      ],
      ageLabel: "2–6 лет",
      updatedAt: "2026-07-25",
      sourceUrl: "https://n-e-n.ru/goroshek/"
    },
    {
      slug: "novinki-dlya-doshkolnikov",
      title: "Принятие, дружба и немного философии: книжные новинки для дошкольников",
      description: "Семь историй для дошкольников о дружбе, принятии, фантазии и умении видеть необычное в самых простых вещах.",
      introduction: "Подборка подойдёт для чтения вслух детям от трёх до пяти лет и спокойных разговоров после каждой истории.",
      bookIds: [
        "curated-nen-collection-frederik-leo-lionni",
        "curated-nen-collection-letniy-den-s-druzyami-filip-vehter",
        "curated-nen-collection-moya-bolshaya-sibiy-delakrua",
        "curated-nen-collection-dobraya-akula-elena-repetur",
        "curated-nen-collection-sup-sinora-leprona-dzhovanna-dzoboli",
        "curated-nen-collection-silviya-i-ptichka-ketrin-reyner",
        "curated-nen-collection-ochki-dlya-selesty-mariya-kolker"
      ],
      ageLabel: "3–6 лет",
      updatedAt: "2026-07-25",
      sourceUrl: "https://n-e-n.ru/novinki-dlya-shkolnikov/"
    },
    {
      slug: "volshebnye-zimnie-knigi",
      title: "Волшебные зимние книги для самых маленьких",
      description: "Зимние сказки и книжки-картинки о снеге, чудесах, заветных желаниях и ожидании праздника для семейного чтения в холодные вечера.",
      introduction: "Эта подборка пригодится тем, кто ищет короткие атмосферные истории для дошкольников и хочет добавить в декабрьские вечера немного книжного волшебства.",
      bookIds: [
        "curated-nen-collection-vasilkovaya-zima-hegyum-kim",
        "curated-nen-collection-gde-to-v-snegu-linde-faas",
        "curated-nen-collection-zavetnoe-zhelanie-krotika-sangyn-kim",
        "curated-nen-collection-elka-yulka-olive-tallek",
        "curated-nen-collection-v-poiskah-deda-moroza-ann-montel",
        "curated-nen-collection-samoe-pervoe-novogodnee-derevo-ovila-fonten",
        "curated-nen-collection-gnom-i-lis-astrid-lindgren",
        "curated-nen-collection-vyuzhik-i-upavshaya-zvezda-anna-mohovaya"
      ],
      ageLabel: "2–7 лет",
      updatedAt: "2026-07-25",
      sourceUrl: "https://n-e-n.ru/podborka-volshebnyh-zimnih-knig-dlya-malyshey/"
    },
    {
      slug: "novye-fantasticheskie-istorii",
      title: "«Сохраняй свободу в голове и магию на кончиках пальцев»: новые фантастические истории для младших школьников",
      description: "Пять фантастических книг с говорящими предметами, волшебными ремёслами, тайнами и приключениями для младших школьников.",
      introduction: "Подборка подойдёт детям, которые любят необычные миры, короткие сказочные истории и героев, способных находить выход из самых странных ситуаций.",
      bookIds: [
        "curated-samokat-slon-v-polnom-smysle-etogo-slova-skazki-slon-v-polnom-smysle-etogo-slova-skazki",
        "curated-samokat-kvartetnye-skazki-kvartetnye-skazki",
        "curated-nen-collection-peschernyy-chelovek-terri-pratchett",
        "curated-nen-collection-shlyapniki-tamzin-merchant",
        "curated-nen-collection-magazin-dikovinnyh-sladostey-schaste-za-monetku-reyko-hirosima"
      ],
      ageLabel: "6–12 лет",
      updatedAt: "2026-07-25",
      sourceUrl: "https://n-e-n.ru/sohraniai-svobody-v-golove/"
    }
  ];
