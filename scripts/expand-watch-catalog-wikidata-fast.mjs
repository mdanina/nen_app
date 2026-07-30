import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const sourcePath = "data/source/watch-v2.json";
const reportPath = "data/reports/watch-expansion-wikidata.json";
const poolCachePath = path.join(os.tmpdir(), "nen-watch-wikidata-pool.json");
const entityCachePath = path.join(os.tmpdir(), "nen-watch-wikidata-entities.json");
const linkedCachePath = path.join(os.tmpdir(), "nen-watch-wikidata-linked.json");
const countryNames = new Map(Object.entries({
  Q29:"Испания",Q142:"Франция",Q183:"Германия",Q38:"Италия",Q145:"Великобритания",Q17:"Япония",
  Q884:"Республика Корея",Q36:"Польша",Q213:"Чехия",Q34:"Швеция",Q20:"Норвегия",Q35:"Дания",
  Q33:"Финляндия",Q55:"Нидерланды",Q16:"Канада",Q408:"Австралия",Q664:"Новая Зеландия",
  Q96:"Мексика",Q414:"Аргентина",Q155:"Бразилия",Q27:"Ирландия",Q31:"Бельгия",Q39:"Швейцария",
  Q40:"Австрия",Q794:"Иран",Q668:"Индия",
}));
const typeNames = {Q11424:"film",Q202866:"animation",Q5398426:"series",Q581714:"animated-series",Q117467246:"animated-series",Q93204:"documentary"};
const targetGenres = new Set(["Q1361932","Q2143665","Q102429885","Q1146335","Q861402","Q1760864","Q116777250"]);
const bad = /ужас|horror|эрот|porn|слэшер|гангстер|маф|adult animation|боевик|action film/iu;
const good = /семейн|детск|подрост|взрослен|приключ|фэнтез|сказ|комед|музык|спорт|школ|образоват|науч|природ|эколог|истор|биограф|документ|анимац|мульт|family|children|coming.of.age|teen|adventure|fantasy|educational|nature|science|documentary|animation/iu;
const uniq = (a) => [...new Set(a.filter(Boolean))];
const qid = (url) => String(url).match(/Q\d+$/u)?.[0];
const claimQids = (entity, property) => uniq((entity.claims?.[property] ?? []).map((c) => c.mainsnak?.datavalue?.value?.id));
const quantity = (entity, property) => Number((entity.claims?.[property] ?? [])[0]?.mainsnak?.datavalue?.value?.amount);
const label = (entity) => entity?.labels?.ru?.value || entity?.labels?.en?.value;
const description = (entity) => entity?.descriptions?.ru?.value || entity?.descriptions?.en?.value || "";
const normalize = (s) => String(s).toLocaleLowerCase("ru").replaceAll("ё","е").replace(/[^\p{L}\p{N}]+/gu," ").trim();
const titleValue = (entity) => (entity.claims?.P1476 ?? []).map((c) => c.mainsnak?.datavalue?.value?.text).find(Boolean);
const firstYear = (entity) => Math.min(...(entity.claims?.P577 ?? []).map((c) => Number(String(c.mainsnak?.datavalue?.value?.time ?? "").slice(1,5))).filter(Number.isInteger));

async function fetchJson(url, attempts=6) {
  let error;
  for (let i=0;i<attempts;i++) try {
    const r=await fetch(url,{headers:{"user-agent":"NENWatchCatalog/3.0","accept":"application/json"},signal:AbortSignal.timeout(60_000)});
    if(r.status===429){await new Promise(resolve=>setTimeout(resolve,(i+1)*30_000));throw new Error(`${r.status} ${url}`)}
    if(!r.ok) throw new Error(`${r.status} ${url}`);
    return await r.json();
  } catch(e){error=e;}
  throw error;
}

async function batches(ids, props, cachePath) {
  const out=await fs.readFile(cachePath,"utf8").then(JSON.parse).catch(()=>({}));
  const pending=ids.filter(id=>!out[id]);
  for(let i=0;i<pending.length;i+=25){
    const part=pending.slice(i,i+25);
    const url=`https://www.wikidata.org/w/api.php?action=wbgetentities&format=json&languages=ru|en&languagefallback=1&props=${props}&ids=${part.join("|")}`;
    Object.assign(out,(await fetchJson(url)).entities);
    await fs.writeFile(cachePath,JSON.stringify(out));
    await new Promise(resolve=>setTimeout(resolve,2000));
  }
  return out;
}

const typeValues=Object.keys(typeNames).map(x=>`wd:${x}`).join(" ");
const countryIds=[...countryNames.keys()];
const poolRows=await fs.readFile(poolCachePath,"utf8").then(JSON.parse).catch(async()=>{
  const rows=[];
  for(let i=0;i<countryIds.length;i+=5){
    const values=countryIds.slice(i,i+5).map(x=>`wd:${x}`).join(" ");
    const sparql=`SELECT DISTINCT ?work ?country ?type WHERE {
     VALUES ?country { ${values} } VALUES ?type { ${typeValues} }
     ?work wdt:P495 ?country; wdt:P31 ?type; wdt:P577 ?date; wdt:P2047 ?duration.
    } LIMIT 1200`;
    const data=await fetchJson(`https://query.wikidata.org/sparql?format=json&query=${encodeURIComponent(sparql)}`);
    rows.push(...data.results.bindings);
  }
  await fs.writeFile(poolCachePath,JSON.stringify(rows));
  return rows;
});
const pool=uniq(countryIds.flatMap(countryId =>
  poolRows.filter(row => qid(row.country.value) === countryId).slice(0, 500).map(row => qid(row.work.value))
));
const entities=await batches(pool,"labels|descriptions|claims",entityCachePath);

const existing=JSON.parse(await fs.readFile(sourcePath,"utf8"));
const existingNames=new Set(existing.flatMap(x=>[x.title,x.originalTitle].filter(Boolean).map(normalize)));
const rejected=[];
const candidates=[];
for(const id of pool){
  const e=entities[id]; if(!e) continue;
  const title=label(e), originalTitle=titleValue(e), year=firstYear(e), runtime=Math.round(quantity(e,"P2047"));
  const countryId=claimQids(e,"P495").find(x=>countryNames.has(x));
  const typeId=claimQids(e,"P31").find(x=>typeNames[x]);
  const genreIds=claimQids(e,"P136"), genreLabels=[];
  const text=`${description(e)} ${genreLabels.join(" ")}`;
  let reason=!title||!countryId||!typeId?"нет основных данных":existingNames.has(normalize(title))||existingNames.has(normalize(originalTitle))?"уже есть":!Number.isInteger(year)||year<1900||year>2027?"нет года":!Number.isFinite(runtime)||runtime<2||runtime>360?"нет хронометража":bad.test(text)?"не соответствует семейной концепции":null;
  const broad=["animation","animated-series","documentary"].includes(typeNames[typeId]);
  if(!reason && !broad && !genreIds.some(x=>targetGenres.has(x)) && !good.test(text)) reason="нет семейных или образовательных признаков";
  if(reason){rejected.push({id,title,reason});continue;}
  candidates.push({id,e,title,originalTitle,year,runtime,country:countryNames.get(countryId),type:typeNames[typeId],genreIds,genreLabels,
    studioIds:claimQids(e,"P272"),awardIds:claimQids(e,"P166"),relatedIds:uniq([...claimQids(e,"P179"),...claimQids(e,"P144")]),
    studios:[],awards:[],related:[],
    episodeCount:Math.round(quantity(e,"P1113")),seasonCount:Math.round(quantity(e,"P2437")),desc:description(e)});
}

function kind(c){const t=c.genreLabels.join(" ");if(c.type==="documentary")return"documentary";if(c.type==="animated-series")return"animated-series";if(c.type==="series")return"series";const a=c.type==="animation"||/анимац|мульт|animation|anime/iu.test(t);return a?(c.runtime<=40?"animated-short":"animated-feature"):(c.runtime<=40?"short-film":"movie");}
function genres(c,k){const t=c.genreLabels.join(" ");const a=[];const m=(r,v)=>{if(r.test(t))a.push(v)};m(/семейн|детск|family|children/iu,"семейный");m(/комед|comedy/iu,"комедия");m(/драм|drama/iu,"драма");m(/приключ|adventure/iu,"приключения");m(/фэнтез|fantasy/iu,"фэнтези");m(/фантаст|science fiction/iu,"фантастика");m(/детектив|mystery/iu,"детектив");m(/сказ|fairy/iu,"сказка");m(/музык|music/iu,"мюзикл");m(/истор|histor/iu,"исторический");m(/биограф|biograph/iu,"биографический");m(/спорт|sport/iu,"спортивный");if(k==="documentary")a.push("документальный");if(/образоват|educational|science/iu.test(t))a.push("образовательный");if(k.includes("short"))a.push("короткометражный");return uniq(a.length?a:[k.includes("animated")?"семейный":"драма"]).slice(0,4)}
function themes(c,g){const t=`${c.desc} ${c.genreLabels.join(" ")}`;const a=[];const m=(r,v)=>{if(r.test(t))a.push(v)};m(/семь|родител|family/iu,"семья");m(/друж|friend/iu,"дружба");m(/подрост|взрослен|teen|coming/iu,"взросление");m(/школ|school|education/iu,"школа");m(/природ|живот|nature|animal/iu,"природа");m(/эколог|climate/iu,"экология");m(/наук|science|space/iu,"наука");m(/истор|histor/iu,"история");m(/музык|music/iu,"музыка");m(/спорт|sport/iu,"спорт");if(g.includes("приключения"))a.push("путешествия","смелость");if(g.includes("фэнтези")||g.includes("сказка"))a.push("волшебство","мечты");a.push("культурное разнообразие","выбор","эмпатия");return uniq(a).slice(0,6)}
function age(c,k,g){const t=`${c.desc} ${c.genreLabels.join(" ")}`;if(/войн|насили|смерт|утрат|war|death|violence/iu.test(t))return k==="documentary"?14:12;if(/подрост|teen|coming/iu.test(t))return 12;if(k==="documentary")return /наук|природ|science|nature/iu.test(t)?8:10;if(k==="series")return 9;if(k==="animated-series"||k==="animated-short")return c.runtime<=12?3:6;return g.includes("семейный")?6:9}
function record(c){const k=kind(c),g=genres(c,k),th=themes(c,g),a=age(c,k,g),series=k==="series"||k==="animated-series",d=c.desc?`${c.desc[0].toLocaleUpperCase("ru")}${c.desc.slice(1).replace(/[.!?]*$/u,"")}.`:`«${c.title}» — произведение из страны ${c.country}, выпущенное в ${c.year} году.`;const duration=series?`${c.runtime} минут на серию`:`${c.runtime} минут`;return{schemaVersion:2,id:`nen-wd-${c.id.toLocaleLowerCase()}`,slug:`wikidata-${c.id.toLocaleLowerCase()}`,title:c.title,...(c.originalTitle&&normalize(c.originalTitle)!==normalize(c.title)?{originalTitle:c.originalTitle}:{}),kind:k,shortDescription:`${d} Хронометраж — ${duration}; основные жанры: ${g.join(", ")}.`,whyRecommended:`Подходит для совместного просмотра и разговора о темах «${th.slice(0,3).join("», «")}», решениях героев и разных культурных перспективах.`,country:[c.country],year:c.year,duration:series?{episodeMinutes:c.runtime,...(c.episodeCount>0?{episodeCount:c.episodeCount}:{}),...(c.seasonCount>0?{seasonCount:c.seasonCount}:{})}:{minutes:c.runtime},genres:g,themes:th,discussionTopics:[`Как тема «${th[0]}» раскрывается в произведении «${c.title}» и какой эпизод показывает её точнее всего?`,`С каким решением героев «${c.title}» вы бы поспорили и что предложили бы сделать иначе?`],mood:k==="documentary"?["вдумчивое","вдохновляющее"]:g.includes("комедия")?["весёлое","уютное"]:g.includes("приключения")?["приключенческое","эмоциональное"]:["вдумчивое","эмоциональное"],sensitiveTopics:/войн|war/iu.test(c.desc)?["война"]:/смерт|утрат|death|loss/iu.test(c.desc)?["утрата"]:[],nenAgeRecommendation:{minAge:a,...(a<14?{maxAge:Math.min(18,a+6)}:{}),rationale:`Рекомендуем с ${a} лет: хронометраж ${duration}, жанры «${g.join("», «")}» и темы «${th.slice(0,2).join("», «")}» требуют соответствующего внимания и эмоциональной готовности.`},...(c.studios.length?{studios:uniq(c.studios).slice(0,6)}:{}),...(c.awards.length?{awards:uniq(c.awards).slice(0,4).map(title=>({title}))}:{}),...(c.related.length?{relatedTitles:uniq(c.related).slice(0,4)}:{})}}

const goals={movie:75,"animated-feature":70,"animated-short":20,"animated-series":40,series:45,documentary:35,"short-film":15};
const selected=[],countryCount=new Map(),kindCount=new Map();
const ordered=candidates.sort((a,b)=>a.country.localeCompare(b.country,"ru")||a.year-b.year||a.title.localeCompare(b.title,"ru"));
for(let pass=0;pass<3&&selected.length<300;pass++)for(const c of ordered){if(selected.includes(c))continue;const k=kind(c),cc=countryCount.get(c.country)||0,kc=kindCount.get(k)||0;if(cc>=(pass===0?14:pass===1?22:45)||kc>=(pass<2?goals[k]:300))continue;selected.push(c);countryCount.set(c.country,cc+1);kindCount.set(k,kc+1);if(selected.length===300)break}
if(selected.length<300)throw new Error(`После проверки найдено ${selected.length} пригодных произведений; требуется 300`);
const selectedLinked=uniq(selected.flatMap(c=>[...c.genreIds,...c.studioIds,...c.awardIds,...c.relatedIds]));
const linkedEntities=await batches(selectedLinked,"labels",linkedCachePath);
for(const c of selected){
  c.genreLabels=c.genreIds.map(x=>label(linkedEntities[x])).filter(Boolean);
  c.studios=c.studioIds.map(x=>label(linkedEntities[x])).filter(Boolean);
  c.awards=c.awardIds.map(x=>label(linkedEntities[x])).filter(Boolean);
  c.related=c.relatedIds.map(x=>label(linkedEntities[x])).filter(Boolean);
}
const added=selected.map(record);await fs.writeFile(sourcePath,JSON.stringify([...existing,...added],null,2)+"\n");
const report={generatedAt:new Date().toISOString(),source:"Wikidata Query Service + Wikidata API",before:existing.length,added:added.length,after:existing.length+added.length,candidateCount:candidates.length,rejectedCount:rejected.length,rejected:rejected.slice(0,500),addedTitles:added.map(x=>({title:x.title,kind:x.kind,country:x.country[0],year:x.year}))};await fs.writeFile(reportPath,JSON.stringify(report,null,2)+"\n");console.log(JSON.stringify({before:report.before,added:report.added,after:report.after,candidates:report.candidateCount,kinds:Object.fromEntries([...new Set(added.map(x=>x.kind))].map(k=>[k,added.filter(x=>x.kind===k).length]))},null,2));
