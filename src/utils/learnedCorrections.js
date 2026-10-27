import { normalizeName } from './matching.js';

const STORE = 'relic-scanner-confirmed-labels-v1';
const MAX_ENTRIES = 120;
const COMMON_SUFFIX = /神經光元|下弓臂|接收器|藍圖|設計圖|刀刃|弓弦|槍機|槍托|槍管|槍身|槍膛|機體|系統|握柄|prime/gi;

/** Reject generic OCR garbage to avoid learning that all 'Prime 刀刃' are the same weapon. */
export function isSpecificOcrName(raw){
  const remaining = normalizeName(raw).replace(COMMON_SUFFIX,'');
  const han = (remaining.match(/\p{Script=Han}/gu)||[]).length;
  const latin = (remaining.match(/[a-z]/gi)||[]).length;
  return han>=2 || latin>=5;
}
function load(){
  try { return JSON.parse(localStorage.getItem(STORE) || '{}') || {}; }
  catch { return {}; }
}
export function learnConfirmedName(raw, slug){
  if(!slug || !isSpecificOcrName(raw)) return false;
  try {
    const key=normalizeName(raw), old=load();
    delete old[key];
    old[key]={slug,createdAt:Date.now()};
    const entries=Object.entries(old).sort((a,b)=>b[1].createdAt-a[1].createdAt).slice(0,MAX_ENTRIES);
    localStorage.setItem(STORE,JSON.stringify(Object.fromEntries(entries)));
    return true;
  }catch {return false;}
}
export function recallConfirmedName(rawTexts,index){
  if(!index?.items)return null;
  const stored=load();
  for(const raw of rawTexts){
    if(!isSpecificOcrName(raw))continue;
    const learned=stored[normalizeName(raw)];
    if(learned){
      const item=index.items.find(item=>item.slug===learned.slug);
      if(item)return {item,score:1};
    }
  }
  return null;
}
