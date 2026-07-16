import { ContentCard, EditorialCollectionCard } from "../components";
import { editorialCollections } from "../data/collections";
import { contentItems } from "../lib/content";
import { useSeo } from "../hooks/useSeo";

export function CollectionsPage({ navigate }: { navigate: (path: string) => void }) {
  useSeo("Подборки НЭН — книги, фильмы и мультфильмы для детей", "Редакционные рекомендации НЭН для разных ситуаций, возрастов и семейных запросов.", "/collections");
  return <section className="catalog-page collections-page"><div className="breadcrumbs"><button onClick={() => navigate("/")}>Главная</button><span>/</span><span>Подборки НЭН</span></div><header className="catalog-intro"><div className="eyebrow">Редакция рекомендует</div><h1>Подборки НЭН</h1><p>Не просто списки произведений, а контекст, объяснение выбора и идеи для разговора с ребёнком.</p></header><div className="editorial-grid">{editorialCollections.map((collection) => <EditorialCollectionCard key={collection.id} collection={collection} navigate={navigate} />)}</div></section>;
}

export function CollectionDetailPage({ slug, favorites, toggle, navigate }: { slug: string; favorites: string[]; toggle: (id: string) => void; navigate: (path: string) => void }) {
  const collection = editorialCollections.find((entry) => entry.slug === slug);
  useSeo(collection?.seoTitle ?? "Подборка не найдена — НЭН", collection?.seoDescription ?? "Редакционные подборки НЭН.", collection ? `/collections/${collection.slug}` : "/collections");
  if (!collection) return <section className="section"><h1>Подборка не найдена</h1><button onClick={() => navigate("/collections")}>Все подборки</button></section>;
  const items = collection.itemIds.map((id) => contentItems.find((item) => item.id === id)).filter((item): item is NonNullable<typeof item> => Boolean(item));
  return <article className="collection-detail"><header><div className="breadcrumbs"><button onClick={() => navigate("/")}>Главная</button><span>/</span><button onClick={() => navigate("/collections")}>Подборки</button><span>/</span><span>{collection.title}</span></div><div className="eyebrow">Опубликовано {new Date(collection.publishedAt).toLocaleDateString("ru-RU")}{collection.updatedAt ? ` · обновлено ${new Date(collection.updatedAt).toLocaleDateString("ru-RU")}` : ""}</div><h1>{collection.title}</h1><p className="collection-lead">{collection.description}</p><div className="collection-introduction">{collection.introduction}</div></header><section className="section"><div className="eyebrow">{items.length} рекомендаций</div><h2>Что вошло в подборку</h2><div className="catalog-grid">{items.map((item) => <div key={item.id} className="collection-recommendation"><ContentCard content={item} favorite={favorites.includes(item.id)} toggleFavorite={() => toggle(item.id)} navigate={navigate} /><p><strong>Почему здесь:</strong> соответствует темам «{item.themes.slice(0, 2).join("» и «")}» и возрастной рекомендации НЭН {item.nenAgeRecommendation.label}.</p></div>)}</div></section></article>;
}
