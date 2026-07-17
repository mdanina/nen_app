import type { WatchTitle } from "../domain/catalog/types";
import { Link, type Navigate } from "../components/Link";
import { MediaCard } from "../components/MediaCard";

export function HomePage({ titles, favorites, toggleFavorite, navigate }: { titles: WatchTitle[]; favorites: string[]; toggleFavorite: (id: string) => void; navigate: Navigate }) {
  return <div className="page home-page">
    <section className="hero">
      <p className="eyebrow">Семейный просмотр без бесконечного поиска</p>
      <h1>Что посмотреть с детьми</h1>
      <p className="lead">Демонстрационный каталог НЭН помогает выбрать фильм или мультфильм по возрасту, настроению и темам для разговора.</p>
    </section>
    <section className="entry-grid" aria-label="Каталоги">
      <Link href="/cartoons" navigate={navigate} className="entry-card cartoons"><span>✦</span><strong>Мультфильмы</strong><small>Полный метр и сериалы</small></Link>
      <Link href="/movies" navigate={navigate} className="entry-card movies"><span>▶</span><strong>Фильмы</strong><small>Игровые и документальные</small></Link>
    </section>
    <section className="recommend-callout"><div><p className="eyebrow">Быстрый путь</p><h2>Не знаете, что выбрать?</h2><p>Ответьте на несколько вопросов — скоро здесь появится персональный подбор.</p></div><Link href="/recommend" navigate={navigate} className="primary-link">Перейти к подбору →</Link></section>
    <section><div className="section-heading"><div><p className="eyebrow">Редакционный выбор</p><h2>Небольшие подборки</h2></div><Link href="/collections" navigate={navigate} className="text-link">Все подборки →</Link></div><div className="collection-row"><Link href="/collections/semeinyi-vecher" navigate={navigate} className="collection-tile">Для семейного вечера</Link><Link href="/collections/uznat-novoe" navigate={navigate} className="collection-tile alt">Чтобы узнать новое</Link></div></section>
    <section><div className="section-heading"><div><p className="eyebrow">Попробуйте сейчас</p><h2>Рекомендуем из демо-каталога</h2></div></div><div className="media-grid">{titles.slice(0, 3).map((title) => <MediaCard key={title.id} title={title} favorite={favorites.includes(title.id)} toggleFavorite={toggleFavorite} navigate={navigate} />)}</div></section>
  </div>;
}
