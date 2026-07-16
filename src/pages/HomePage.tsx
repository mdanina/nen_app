import { ContentCard, EditorialCollectionCard, Icon } from "../components";
import { editorialCollections } from "../data/collections";
import { contentByType } from "../lib/content";
import { useSeo } from "../hooks/useSeo";

export function HomePage({ favorites, toggle, navigate }: { favorites: string[]; toggle: (id: string) => void; navigate: (path: string) => void }) {
  useSeo("Что почитать и посмотреть с ребёнком — НЭН", "Книги, мультфильмы, фильмы, редакционные подборки и умный подбор НЭН.", "/");
  const directions = [
    { icon: "📚", title: "Что почитать", description: "Книги для самостоятельного и совместного чтения — с учетом возраста, интересов и состояния ребенка.", path: "/books", color: "yellow" },
    { icon: "🎨", title: "Что посмотреть", subtitle: "Мультфильмы", description: "Полнометражные мультфильмы и сериалы для детей разных возрастов.", path: "/cartoons", color: "pink" },
    { icon: "🎬", title: "Что посмотреть", subtitle: "Фильмы", description: "Семейные и подростковые фильмы, которые можно смотреть и обсуждать вместе.", path: "/movies", color: "blue" },
    { icon: "💡", title: "Подборки НЭН", description: "Тематические рекомендации редакции для разных ситуаций, возрастов и запросов семьи.", path: "/collections", color: "green" },
  ];
  const popular = [contentByType.book[10], contentByType.cartoon[0], contentByType.movie[4]].filter(Boolean);
  return <><section className="home-intro"><div className="eyebrow">Навигатор НЭН для родителей</div><h1>Найдём историю<br /><em>для вашего вечера</em></h1><p>Выберите отдельный каталог, откройте редакционную подборку или ответьте на несколько вопросов.</p></section><section className="direction-grid">{directions.map((card) => <button key={card.path} className={`direction-card ${card.color}`} onClick={() => navigate(card.path)}><span className="direction-icon" aria-hidden="true">{card.icon}</span><div>{card.subtitle && <div className="eyebrow">{card.subtitle}</div>}<h2>{card.title}</h2><p>{card.description}</p><span className="card-link">Открыть <Icon name="arrow" /></span></div></button>)}</section>
    <section className="smart-cta"><span aria-hidden="true">✨</span><div><div className="eyebrow">Умный подбор НЭН</div><h2>Не знаете, что выбрать?</h2><p>Ответьте на несколько вопросов о ребенке, ситуации и настроении — и НЭН предложит подходящие книги, мультфильмы или фильмы.</p></div><button className="primary-button" onClick={() => navigate("/recommend")}>Подобрать <Icon name="arrow" /></button></section>
    <section className="section home-popular"><div className="section-heading"><div><div className="eyebrow">Выбор редакции</div><h2>Популярно сейчас</h2></div></div><div className="catalog-grid">{popular.map((item) => <ContentCard key={item.id} content={item} favorite={favorites.includes(item.id)} toggleFavorite={() => toggle(item.id)} navigate={navigate} />)}</div>{editorialCollections[0] && <div className="featured-collection"><EditorialCollectionCard collection={editorialCollections[0]} navigate={navigate} /></div>}</section></>;
}
