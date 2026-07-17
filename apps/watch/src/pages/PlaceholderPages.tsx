import { Link, type Navigate } from "../components/Link";

export function CollectionsPage({ slug, navigate }: { slug?: string; navigate: Navigate }) {
  return <div className="page narrow"><p className="eyebrow">Редакционные подборки</p><h1>{slug ? "Подборка готовится" : "Подборки"}</h1><p>{slug ? `Страница «${slug}» уже маршрутизируется, а содержимое появится на следующем редакционном этапе.` : "Здесь появятся тематические списки для семейного вечера, спокойного просмотра и знакомства с новым."}</p><Link href="/" navigate={navigate} className="primary-link">На главную</Link></div>;
}

export function RecommendPage({ navigate }: { navigate: Navigate }) {
  return <div className="page narrow"><p className="eyebrow">Умный подбор</p><h1>Не знаете, что выбрать?</h1><p>Пошаговый рекомендательный сценарий появится на следующем этапе. Сейчас можно воспользоваться точными фильтрами каталогов.</p><div className="button-row"><Link href="/cartoons" navigate={navigate} className="primary-link">Выбрать мультфильм</Link><Link href="/movies" navigate={navigate} className="secondary-link">Выбрать фильм</Link></div></div>;
}

export function NotFoundPage({ navigate }: { navigate: Navigate }) {
  return <div className="page narrow"><p className="eyebrow">Ошибка 404</p><h1>Страница не найдена</h1><p>Проверьте адрес или вернитесь на главную.</p><Link href="/" navigate={navigate} className="primary-link">На главную</Link></div>;
}
