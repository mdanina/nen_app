import { useMemo, useState, type ReactNode } from "react";
import { CatalogCard } from "../components";
import { catalog } from "../data/catalog";
import { useSeo } from "../hooks/useSeo";
import { emptyQuery } from "../lib/catalog";
import { recommend } from "../lib/recommendations";
import type { CatalogQuery, FormatFilter, Situation } from "../types";

interface Answers {
  age: number;
  format: FormatFilter;
  feeling: string;
  interest: string;
  time: string;
  interaction: string;
}

const initial: Answers = { age: 7, format: "all", feeling: "", interest: "", time: "", interaction: "" };

function toQuery(answers: Answers): CatalogQuery {
  const moodMap: Record<string, string[]> = { rest: ["спокойное"], anxious: ["спокойное", "уютное"], sad: ["трогательное", "уютное"], bored: ["захватывающее"], angry: ["спокойное"], changes: ["трогательное"], laugh: ["смешное"] };
  const situation: Situation | null = answers.interaction === "self" ? "independent" : answers.interaction === "family" || answers.interaction === "adult" ? "family" : null;
  const durationMap: Record<string, string | null> = { short: "до 15 минут", medium: "до 30 минут", hour: "до 60 минут", long: null, any: null };
  const interests = [answers.interest, answers.feeling === "learn" ? "наука" : ""].filter(Boolean);
  return { ...emptyQuery, age: answers.age, format: answers.format, interests, moods: moodMap[answers.feeling] ?? [], situation, duration: durationMap[answers.time] ?? null };
}

export function RecommendPage({ favorites, toggle, navigate }: { favorites: string[]; toggle: (id: string) => void; navigate: (path: string) => void }) {
  useSeo("Умный подбор НЭН — что почитать и посмотреть", "Ответьте на несколько вопросов и получите рекомендации из базы НЭН.", "/recommend");
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState(initial);
  const result = useMemo(() => recommend(catalog, toQuery(answers)), [answers]);
  const recommendations = [...result.exact, ...result.partial, ...result.alternateType].filter((entry, index, array) => array.findIndex((candidate) => candidate.item.id === entry.item.id) === index).slice(0, 6);
  const update = <K extends keyof Answers>(key: K, value: Answers[K]) => setAnswers((current) => ({ ...current, [key]: value }));
  const reset = () => { setAnswers(initial); setStep(0); };
  return <section className="recommend-page"><header><div className="breadcrumbs"><button onClick={() => navigate("/")}>Главная</button><span>/</span><span>Умный подбор</span></div><div className="eyebrow">Подбор по правилам НЭН</div><h1>Не знаете,<br />что выбрать?</h1><p>Ответьте на несколько вопросов — правила НЭН подберут произведения из проверенной базы.</p><div className="progress" aria-label={`Шаг ${Math.min(step + 1, 4)} из 4`}><span style={{ width: `${Math.min(step + 1, 4) * 25}%` }} /></div></header>
    {step === 0 && <WizardStep number="01" title="Для кого и что выбираем?"><label className="wizard-age">Возраст ребёнка <input type="range" min="2" max="14" value={answers.age} onChange={(event) => update("age", Number(event.target.value))} /><output>{answers.age} лет</output></label><Options value={answers.format} onChange={(value) => update("format", value as FormatFilter)} options={[["reading", "Книга"], ["cartoon", "Мультфильм"], ["movie", "Фильм"], ["all", "Не знаю — предложите"]]} /></WizardStep>}
    {step === 1 && <WizardStep number="02" title="Что сейчас происходит?"><Options value={answers.feeling} onChange={(value) => update("feeling", value)} options={[["rest", "Хочет отдохнуть"], ["anxious", "Тревожится"], ["sad", "Грустит"], ["bored", "Скучает"], ["angry", "Злится"], ["changes", "Переживает перемены"], ["learn", "Хочет узнать новое"], ["laugh", "Хочет посмеяться"]]} /></WizardStep>}
    {step === 2 && <WizardStep number="03" title="Что интересно и сколько есть времени?"><Options value={answers.interest} onChange={(value) => update("interest", value)} options={[["дружба", "Дружба"], ["семья", "Семья"], ["школа", "Школа"], ["приключения", "Приключения"], ["животные", "Животные"], ["фантастика", "Фантазия"], ["", "Не важно"]]} /><h3>Время</h3><Options value={answers.time} onChange={(value) => update("time", value)} options={[["short", "До 15 минут"], ["medium", "15–30 минут"], ["hour", "30–60 минут"], ["long", "Больше часа"], ["any", "Не важно"]]} /></WizardStep>}
    {step === 3 && <WizardStep number="04" title="Как будете знакомиться с историей?"><Options value={answers.interaction} onChange={(value) => update("interaction", value)} options={[["self", "Ребёнок сам"], ["adult", "Вместе со взрослым"], ["family", "Всей семьёй"]]} /></WizardStep>}
    {step === 4 && <section className="recommend-results"><div className="eyebrow">Результат умного подбора</div><h2>Сейчас может подойти</h2><p className="recommend-explanation">{explanation(answers)}</p><div className="catalog-grid">{recommendations.map((entry) => <CatalogCard key={entry.item.id} result={entry} favorite={favorites.includes(entry.item.id)} toggleFavorite={() => toggle(entry.item.id)} navigate={navigate} />)}</div><div className="recommend-actions"><button onClick={() => setStep(0)}>Уточнить ответы</button><button onClick={reset}>Начать заново</button></div></section>}
    {step < 4 && <div className="wizard-controls"><button disabled={step === 0} onClick={() => setStep((current) => Math.max(0, current - 1))}>Назад</button><button className="primary-button" onClick={() => setStep((current) => current + 1)}>{step === 3 ? "Показать результат" : "Дальше"}</button></div>}
  </section>;
}

function WizardStep({ number, title, children }: { number: string; title: string; children: ReactNode }) { return <section className="wizard-step"><span>{number}</span><div><h2>{title}</h2>{children}</div></section>; }
function Options({ value, onChange, options }: { value: string; onChange: (value: string) => void; options: Array<[string, string]> }) { return <div className="wizard-options">{options.map(([option, label]) => <button key={`${option}-${label}`} className={value === option ? "selected" : ""} aria-pressed={value === option} onClick={() => onChange(option)}>{label}</button>)}</div>; }
function explanation(answers: Answers): string {
  const format = answers.format === "reading" ? "историю для чтения" : answers.format === "cartoon" ? "мультфильм" : answers.format === "movie" ? "фильм" : "книгу, мультфильм или фильм";
  const mood = answers.feeling === "anxious" ? "спокойный и уютный" : answers.feeling === "laugh" ? "смешной" : answers.feeling === "learn" ? "познавательный" : "подходящий по настроению";
  const together = answers.interaction === "self" ? "для самостоятельного знакомства" : "для совместного времени";
  return `Сейчас лучше выбрать ${mood} ${format} ${together}. Мы сохранили возрастную рекомендацию НЭН и сначала искали точные совпадения, а затем — ближайшие варианты.`;
}
