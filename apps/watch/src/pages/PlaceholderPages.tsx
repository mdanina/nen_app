import type { WatchTitle } from "../domain/catalog/types";
import { Link, type Navigate } from "../components/Link";
import { MediaCard } from "../components/MediaCard";

const collectionConfig = {
  "semeinyi-vecher": {
    title: "Для семейного вечера",
    description: "Истории с ясным сюжетом, теплом и темами, которые интересно обсудить всей семьёй после просмотра.",
    slugs: ["moy-sosed-totoro", "istoriya-igrushek", "klaus", "priklyucheniya-paddingtona", "tayna-koko", "ratatuy", "luka", "paddington-2"],
  },
  "uznat-novoe": {
    title: "Чтобы узнать новое",
    description: "Фильмы и мультфильмы о науке, истории, природе и культурах — хороший вход в новый разговор с ребёнком.",
    slugs: ["tayna-tretey-planety", "vall-i", "hranitel-vremeni", "eddi-orel", "unesennye-prizrakami", "skrytye-figury", "koroleva-katve", "malchik-kotoryy-obuzdal-veter"],
  },
} as const;

interface CollectionProps {
  slug?: string;
  titles: WatchTitle[];
  favorites: string[];
  toggleFavorite: (id: string) => void;
  navigate: Navigate;
}

export function CollectionsPage({ slug, titles, favorites, toggleFavorite, navigate }: CollectionProps) {
  if (!slug) return <div className="page">
    <p className="eyebrow">Редакционные подборки</p>
    <h1>Подборки</h1>
    <p className="lead">Готовые маршруты по каталогу для разных семейных планов и разговоров.</p>
    <div className="collection-row">
      <Link href="/collections/semeinyi-vecher" navigate={navigate} className="collection-tile">Для семейного вечера</Link>
      <Link href="/collections/uznat-novoe" navigate={navigate} className="collection-tile alt">Чтобы узнать новое</Link>
    </div>
  </div>;

  const collection = collectionConfig[slug as keyof typeof collectionConfig];
  if (!collection) return <NotFoundPage navigate={navigate} />;
  const bySlug = new Map(titles.map((title) => [title.slug, title]));
  const selected = collection.slugs.map((itemSlug) => bySlug.get(itemSlug)).filter((title): title is WatchTitle => Boolean(title));

  return <div className="page">
    <p className="eyebrow">Редакционная подборка</p>
    <h1>{collection.title}</h1>
    <p className="lead">{collection.description}</p>
    <div className="media-grid">{selected.map((title) => <MediaCard key={title.id} title={title} favorite={favorites.includes(title.id)} toggleFavorite={toggleFavorite} navigate={navigate} />)}</div>
    <Link href="/collections" navigate={navigate} className="secondary-link">Все подборки</Link>
  </div>;
}

export function RecommendPage({ navigate }: { navigate: Navigate }) {
  return <div className="page narrow"><p className="eyebrow">Быстрый выбор</p><h1>Что будем смотреть?</h1><p>В каталогах можно уточнить выбор по возрасту ребёнка, настроению, темам, стране и формату произведения.</p><div className="button-row"><Link href="/cartoons" navigate={navigate} className="primary-link">Выбрать мультфильм</Link><Link href="/movies" navigate={navigate} className="secondary-link">Выбрать фильм</Link></div></div>;
}

export function NotFoundPage({ navigate }: { navigate: Navigate }) {
  return <div className="page narrow"><p className="eyebrow">Ошибка 404</p><h1>Страница не найдена</h1><p>Проверьте адрес или вернитесь на главную.</p><Link href="/" navigate={navigate} className="primary-link">На главную</Link></div>;
}
