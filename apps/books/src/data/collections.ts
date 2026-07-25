export interface BookCollection {
  slug: string; title: string; description: string; introduction: string; bookIds: string[]; ageLabel?: string; updatedAt: string;
}

export const collections: BookCollection[] = [
  { slug: "pered-snom", title: "Что почитать перед сном", description: "Спокойные короткие истории для завершения дня.", introduction: "Собрали книги, которые удобно читать вместе вечером: без необходимости торопиться и с возможностью остановиться после одной истории.", bookIds: ["nen-001","nen-002","nen-003","nen-004","nen-006","nen-009"], ageLabel: "2–7 лет", updatedAt: "2026-07-16" },
  { slug: "pro-druzhbu", title: "Книги про дружбу", description: "Истории о знакомстве, поддержке, ссорах и примирении.", introduction: "Эта подборка помогает начать разговор о дружбе и о том, почему отношения иногда требуют смелости и терпения.", bookIds: ["nen-011","nen-014","nen-018","nen-023"], ageLabel: "5–12 лет", updatedAt: "2026-07-16" },
  { slug: "dlya-samostoyatelnogo-chteniya", title: "Для самостоятельного чтения", description: "Книги, с которыми ребенок может остаться один на один.", introduction: "Разные по настроению произведения для детей, которые уже читают сами и хотят выбирать истории по собственным интересам.", bookIds: ["nen-021"], ageLabel: "7–14 лет", updatedAt: "2026-07-16" }
];
