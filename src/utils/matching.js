import { ADDITIONAL_ALIASES, NON_TRADABLE_REWARDS } from './aliases.js';

const PARTS = ['神經光元','下弓臂','接收器','機體','系統','槍機','槍托','槍管','槍柄','槍身','槍膛','握柄','刀刃','弓弦','刀柄','刀鋒','連結','藍圖'];
const EN_PARTS = ['neuroptics','lower limb','receiver','chassis','systems','stock','barrel','blade','string','handle','blueprint','link','grip','ornament'];
const TRANSLATIONS = { 'blueprint':'藍圖','blade':'刀刃','stock':'槍托','receiver':'接收器','barrel':'槍管','chassis':'機體','neuroptics':'神經光元','systems':'系統','string':'弓弦','handle':'握柄','lower limb':'下弓臂','link':'連結','grip':'握柄' };
const han = text => (String(text).match(/\p{Script=Han}/gu)||[]).join('');
const latin = text => (String(text).match(/[a-z]{2,}/gi)||[]).join('').toLowerCase();
const unique = array => [...new Set(array)];

export function normalizeName(raw) {
  let name=String(raw||'').normalize('NFKC').toLowerCase()
    .replace(/prlme|prirne|pnme|prlne|pirme|prirne/gi,'prime')
    .replace(/設計圖|設計藍圖/g,'藍圖')
    .replace(/[\s\u200b\u00a0\[\](){}.,:;!'"“”‘’。．、·+／\\/\-＿_]/g,'')
    .replace(/[|¦丨]/g,'');
  for(const suffix of PARTS){
    if(name.startsWith(suffix)&&/[a-z]{4,}/.test(name.slice(suffix.length))){
      name=name.slice(suffix.length)+suffix;break;
    }
  }
  return name;
}
const partOf = name => {
  const q=normalizeName(name);
  return PARTS.find(part => q.includes(part)) || EN_PARTS.find(part=>q.endsWith(part.replaceAll(' ',''))) || null;
};
const withoutPart = name => {
  let q=normalizeName(name).replace(/prime/gi,'').replace(/[#?？]/g,'');
  for(const part of PARTS)q=q.replaceAll(part,'');
  for(const part of EN_PARTS)q=q.replaceAll(part.replaceAll(' ',''),'');
  return q;
};
const getRootVariants = item => {
  const full=[item.nameZh,item.nameEn,...(ADDITIONAL_ALIASES[item.slug]||[])].filter(Boolean);
  return unique(full.map(withoutPart).filter(Boolean));
};
const mixedEnglishNames = name => Object.entries(TRANSLATIONS).flatMap(([english,chinese]) => {
  const re=new RegExp(`\\s${english}$`,'i');
  return re.test(name)?[name.replace(re,` ${chinese}`)]:[];
});
const scoreSequence = (needle,haystack) => {
  if(!needle||!haystack)return 0;
  if(needle===haystack)return 1;
  if(haystack.startsWith(needle))return .93;
  if(haystack.includes(needle))return .84;
  let j=0;
  for(const ch of haystack)if(ch===needle[j])j++;
  return j===needle.length?.62:0;
};
const levenshtein = (a,b) => {
  const prev=Array.from({length:b.length+1},(_,i)=>i);
  for(let i=0;i<a.length;i++){
    const cur=[i+1];
    for(let j=0;j<b.length;j++)cur.push(Math.min(cur[j]+1,prev[j+1]+1,prev[j]+(a[i]===b[j]?0:1)));
    for(let j=0;j<cur.length;j++)prev[j]=cur[j];
  }
  return prev[b.length];
};
const isPart = item => Boolean(item.slug) && !item.slug.endsWith('_set') && !/\bset\b/i.test(item.nameEn||'');
const normalizeEnglish = name => String(name||'').normalize('NFKC').toLowerCase().replace(/[^a-z0-9]/g,'');

/**
 * Catalog contains all Market items for manual search, and a separate relic-only
 * corpus for OCR. If WFCD data is temporarily unavailable, Prime parts fallback.
 */
export function buildCatalogIndex(items, relicNames=[]) {
  const wanted=new Set(relicNames.map(normalizeEnglish));
  const eligible=items.filter(item=> {
    if(!isPart(item))return false;
    const english=String(item.nameEn||'').toLowerCase();
    const prime = english.includes('prime') || String(item.slug||'').includes('_prime_');
    if(!prime)return false;
    if(!wanted.size)return true;
    return wanted.has(normalizeEnglish(item.nameEn)) || wanted.has(normalizeEnglish(item.slug.replaceAll('_',' ')));
  });
  // Do not discard the only working Market index if an upstream drop list is
  // outdated or its naming convention changed.
  const relicItems=(eligible.length>=60?eligible:items.filter(item=>isPart(item)&&(/prime/i.test(item.nameEn||'')||item.slug.includes('_prime_'))));
  const makeEntries=(list)=>list.flatMap(item=>{
    const names=[item.nameZh,item.nameEn,item.slug?.replaceAll('_',' '),...mixedEnglishNames(item.nameEn||''),...(ADDITIONAL_ALIASES[item.slug]||[])];
    return unique(names.filter(Boolean).map(normalizeName).filter(x=>x.length>=2)).map(name=>({item,name}));
  });
  const entries=makeEntries(items), relicEntries=makeEntries(relicItems);
  return {entries,relicEntries,items,relicItems,
    source:wanted.size&&eligible.length>=60?'official-relic-list':'prime-fallback',
    fuse:null};
}

function rankRelic(index,raw) {
  const query=normalizeName(raw);
  if(!query || query==='prime' || query==='藍圖')return [];
  const qpart=partOf(raw), qroot=withoutPart(raw), qhan=han(qroot), qlatin=latin(qroot);
  const qHasPrime=query.includes('prime');
  // A single suffix/"Prime" isn't useful evidence for a weapon family.
  if(!qhan.length && qlatin.length<3)return [];
  const ranked=[];
  for(const item of index.relicItems||[]){
    const names=unique([item.nameZh,item.nameEn,item.slug.replaceAll('_',' '),...(ADDITIONAL_ALIASES[item.slug]||[])]
      .filter(Boolean).map(normalizeName));
    const exact=names.includes(query);
    const familyRoots=getRootVariants(item);
    let family=0;
    let evidence=0;
    const qRootLength=qhan.length||qlatin.length;
    for(const root of familyRoots){
      const hanRoot=han(root),enRoot=latin(root);
      if(qhan && hanRoot){
        const match=scoreSequence(qhan,hanRoot);
        const typo=qhan.length>=2 ? 1-levenshtein(qhan,hanRoot)/Math.max(qhan.length,hanRoot.length) : 0;
        const thisScore=Math.max(match,typo*.75);
        if(thisScore>family){family=thisScore;evidence=qhan.length>=2?2:1;}
      }
      if(qlatin.length>=3 && enRoot){
        const s=scoreSequence(qlatin,enRoot);
        const typo=1-levenshtein(qlatin,enRoot)/Math.max(qlatin.length,enRoot.length);
        const thisScore=Math.max(s,typo*.85);
        if(thisScore>family){family=thisScore;evidence=qlatin.length>=5?2:1;}
      }
    }
    if(!family && !exact)continue;
    if(family<.60 && !exact)continue;
    const itemPart=partOf(item.nameZh)||partOf(item.nameEn);
    let mismatch=false;
    if(qpart && itemPart){
      const translate=name=>TRANSLATIONS[name]||name;
      mismatch=translate(qpart)!==translate(itemPart);
    }
    if(mismatch)continue;
    let score=exact?1:.32+family*.38;
    if(qpart)score+=.19;
    if(qHasPrime)score+=.07;
    if(qroot===withoutPart(item.nameZh))score+=.03;
    // Use visual name length only as supporting evidence; OCR can drop letters.
    const expectedName=normalizeName(item.nameZh||item.nameEn);
    const lengthFit=Math.min(query.length,expectedName.length)/Math.max(query.length,expectedName.length);
    score+=lengthFit*.025;
    if(evidence===1)score=Math.min(score,.78);
    if(!qpart)score=Math.min(score,.89);
    ranked.push({item,score:Math.min(1,score),evidence,partConfirmed:!!qpart});
  }
  return ranked.sort((a,b)=>b.score-a.score || a.item.slug.localeCompare(b.item.slug));
}

export function findRelicCandidates(index,raw,limit=5){
  if(!index?.relicItems?.length)return [];
  return rankRelic(index,raw).slice(0,limit);
}

/** Autocomplete still uses the entire Market catalog for explicit manual searches. */
export function findCandidates(index,raw,limit=5){
  const query=normalizeName(raw);
  if(!index?.entries||!query)return [];
  const ranked=new Map();
  for(const entry of index.entries){
    const {item,name}=entry;
    if(!isPart(item))continue;
    let score=0;
    if(name===query)score=1;
    else if(name.startsWith(query))score=.94*Math.min(1,query.length/Math.max(1,name.length)*.5+.5);
    else if(name.includes(query))score=.75;
    if(score && (!ranked.has(item.slug)||ranked.get(item.slug).score<score))ranked.set(item.slug,{item,score});
  }
  // Last resort typo matching without a heavyweight fuzzy search dependency.
  if(query.length>=3 && ranked.size<limit){
    for(const entry of index.entries){
      if(!isPart(entry.item))continue;
      const similarity=1-levenshtein(query,entry.name)/Math.max(query.length,entry.name.length);
      if(similarity<.66)continue;
      const score=similarity*.72;
      if(!ranked.has(entry.item.slug)||ranked.get(entry.item.slug).score<score)ranked.set(entry.item.slug,{item:entry.item,score});
    }
  }
  return [...ranked.values()].sort((a,b)=>b.score-a.score).slice(0,limit);
}

export function matchRewards(ocrColumns,index){
  return ocrColumns.map(bands=>{
    const texts=(Array.isArray(bands)?bands:[bands]).filter(Boolean);
    const nontrade=texts.map(raw=>NON_TRADABLE_REWARDS.find(({re})=>re.test(raw))).find(Boolean);
    if(nontrade)return {text:texts[0]||nontrade.name,match:{item:{nameZh:nontrade.name,nameEn:nontrade.name,slug:null,nontradable:true},score:1},candidates:[]};
    const bySlug=new Map();
    for(const text of texts){
      for(const result of rankRelic(index,text).slice(0,12)){
        const slug=result.item.slug;
        if(!bySlug.has(slug)||bySlug.get(slug).score<result.score)bySlug.set(slug,result);
      }
    }
    const candidates=[...bySlug.values()].sort((a,b)=>b.score-a.score).slice(0,5);
    const [best,second]=candidates;
    // First-character guesses remain visible candidates. No auto-selection
    // unless a unique item is supported by two family glyphs plus the part,
    // or an exact full-name recognition.
    const confident=best && (best.score>=.995 || (
      best.evidence>=2 && best.partConfirmed && best.score>=.82 && (!second||best.score-second.score>=.095)
    ));
    return {text:texts.join(' / '),match:confident?{item:best.item,score:best.score}:null,candidates};
  });
}
