/** Cloudflare Workers API relay for GitHub Pages (no Warframe client access). */
const MARKET = 'https://api.warframe.market/v2';
const RELIC_URLS = [
  'https://raw.githubusercontent.com/WFCD/warframe-drop-data/main/data/relics.json',
  'https://raw.githubusercontent.com/WFCD/warframe-drop-data/master/data/relics.json',
];
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const reply = (data, status=200, request, env) => {
  const origin = request.headers.get('Origin') || '';
  const allowed = env.ALLOWED_ORIGIN || '';
  const headers = { 'Content-Type':'application/json; charset=utf-8', 'Cache-Control':'no-store', 'Vary':'Origin' };
  if (origin === allowed || (origin.startsWith('http://localhost:') && allowed !== '')) {
    headers['Access-Control-Allow-Origin'] = origin;
    headers['Access-Control-Allow-Methods'] = 'GET, OPTIONS';
    headers['Access-Control-Allow-Headers'] = 'Content-Type';
  }
  return new Response(status === 204 ? null : JSON.stringify(data), {status, headers});
};
const upstreamHeaders = env => ({
  Accept:'application/json', Language:'zh-hant', Platform:'pc', Crossplay:'true',
  'User-Agent':env.APP_USER_AGENT || 'RelicScanner/1.8 (+personal-use)',
});
async function marketGet(path, env) {
  const resp = await fetch(`${MARKET}${path}`, { headers:upstreamHeaders(env), signal:AbortSignal.timeout(7000) });
  if (!resp.ok) throw new Error(`Market 上游 HTTP ${resp.status}`);
  const json=await resp.json();
  if(json?.error || !('data' in json)) throw new Error('Market API 資料異常');
  return json.data;
}
async function cachedRequest(request, env, key, ttl, force, loader) {
  // Cloudflare caches.default operates at the edge, persists between requests.
  const cache=caches.default;
  // Cache API keys should remain on the same zone / workers.dev host.
  const k=new Request(new URL(`/_market_cache/${encodeURIComponent(key)}`,request.url).toString());
  const cached=await cache.match(k);
  if (cached && !force) return {value:await cached.json(),source:'cache'};
  try {
    const value=await loader();
    try {
      await cache.put(k,new Response(JSON.stringify(value),{headers:{'Cache-Control':`public, max-age=${ttl}`,'Content-Type':'application/json'}}));
    } catch {
      // Some preview environments do not support Cache API persistence.
      // A caching failure must never hide successful Market data.
    }
    return {value,source:'live'};
  } catch(e) {
    if (cached) return {value:await cached.json(),source:'stale',warning:e.message};
    throw e;
  }
}
export const compactCatalog = data => {
  const input=Array.isArray(data)?data:Array.isArray(data?.items)?data.items:[];
  if(!input.length)throw new Error('Market 物品清單空白');
  return input.filter(i=>i.slug&&i.id).map(i=>({
    id:i.id,slug:i.slug,nameZh:i.i18n?.['zh-hant']?.name||i.i18n?.['zh-Hant']?.name||'',
    nameEn:i.i18n?.en?.name||i.slug.replaceAll('_',' '),ducats:typeof i.ducats==='number'?i.ducats:null,
    tags:i.tags||[],
  }));
};
export const compactPrices = data => {
  const values=type=>(Array.isArray(data?.[type])?data[type]:[]).map(v=>Number(v.platinum)).filter(v=>Number.isFinite(v)&&v>=0);
  const sell=values('sell'),buy=values('buy');
  return {lowestSell:sell.length?Math.min(...sell):null,highestBuy:buy.length?Math.max(...buy):null,sellCount:sell.length,buyCount:buy.length};
};
async function catalog(env,force=false,request) {
  const cached=await cachedRequest(request,env,'market-catalog-zh-hant-v2',12*60*60,force,async()=>compactCatalog(await marketGet('/items',env)));
  return {items:cached.value,source:cached.source,updatedAt:new Date().toISOString(),warning:cached.warning};
}
async function price(slug,env,force=false,request) {
  const response=await cachedRequest(request,env,`top-${slug}`,35,force,async()=>({
    ...compactPrices(await marketGet(`/orders/item/${encodeURIComponent(slug)}/top`,env)),checkedAt:new Date().toISOString(),
  }));
  return {...response.value,cached:response.source!=='live',stale:response.source==='stale',warning:response.warning};
}
async function relicRewards(env,force=false,request) {
  const result=await cachedRequest(request,env,'wfcd-relics-names',24*60*60,force,async()=>{
    let lastError='';
    for (const url of RELIC_URLS) {
      try {
        const r=await fetch(url,{signal:AbortSignal.timeout(6000)});
        if(!r.ok)throw new Error(`HTTP ${r.status}`);
        const data=await r.json();
        const relics=Array.isArray(data)?data:data?.relics;
        if(!Array.isArray(relics))throw new Error('清單格式不同');
        const names=[...new Set(relics.flatMap(v=>{
          const rewards=Array.isArray(v.rewards)?v.rewards:Object.values(v.rewards||{}).flat();
          return rewards.map(x=>x?.itemName).filter(Boolean);
        }))];
        if(names.length<40)throw new Error('物品名稱數不足');
        return {names};
      } catch(e) {lastError=e.message;}
    }
    throw new Error(lastError||'無法下載 WFCD 遺物清單');
  });
  return {...result.value,source:result.source,warning:result.warning};
}
export default {
  async fetch(request,env) {
    const origin=request.headers.get('Origin');
    if(request.method==='OPTIONS')return reply({},204,request,env);
    if (request.method!=='GET')return reply({error:'僅接受 GET'},405,request,env);
    const url=new URL(request.url);
    if(origin && origin!==env.ALLOWED_ORIGIN && !origin.startsWith('http://localhost:'))
      return reply({error:'Origin 不允許'},403,request,env);
    try {
      if(url.pathname==='/api/health')return reply({ok:true,service:'relic-market-api'},200,request,env);
      if(url.pathname==='/api/catalog')return reply(await catalog(env,url.searchParams.get('refresh')==='1',request),200,request,env);
      if(url.pathname==='/api/relic-rewards'){
        try{return reply(await relicRewards(env,url.searchParams.get('refresh')==='1',request),200,request,env);}
        catch(e){return reply({names:[],source:'unavailable',warning:e.message},200,request,env);}
      }
      if(url.pathname==='/api/prices'){
        const slugs=[...new Set(String(url.searchParams.get('slugs')||'').split(',').map(v=>v.trim()).filter(Boolean))];
        if(!slugs.length||slugs.length>4||slugs.some(v=>!/^[a-z0-9_-]{2,120}$/i.test(v)))return reply({error:'僅允許 1～4 個合法 slug'},400,request,env);
        // Prevent open proxy abuse: only quote items in the Market catalogue.
        const marketItems=(await catalog(env,false,request)).items;
        const allowed=new Set(marketItems.map(x=>x.slug));
        if(slugs.some(s=>!allowed.has(s)))return reply({error:'未知 Market 物品代碼'},400,request,env);
        const force=url.searchParams.get('refresh')==='1',prices={};
        for(const slug of slugs){
          try {prices[slug]=await price(slug,env,force,request);} catch(e){prices[slug]={error:e.message};}
          await sleep(380); // Limit bursts toward upstream 3 requests / second.
        }
        return reply({prices},200,request,env);
      }
      return reply({error:'路徑不存在'},404,request,env);
    } catch(e){return reply({error:'Market API 暫時不可用',detail:e.message},502,request,env);}
  }
};
