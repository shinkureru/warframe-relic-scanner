const API_BASE = String(import.meta.env.VITE_MARKET_API_URL || '').replace(/\/$/, '');
const urlFor = (route) => `${API_BASE}/api/${route}`;
const parseApiResponse = async (response) => {
  const json = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(json.detail || json.error || `HTTP ${response.status}`);
  return json;
};
export const fetchCatalog = async ({ force=false }={}) => {
  const res = await fetch(urlFor(`catalog${force?'?refresh=1':''}`), { cache:'no-store' });
  const payload = await parseApiResponse(res);
  return { items: payload.items, meta: { source:payload.source, warning:payload.warning, updatedAt:payload.updatedAt } };
};
export const fetchPrices = async (slugs,{ force=false }={}) => {
  const unique=[...new Set(slugs)].filter(Boolean).slice(0,4);
  if (!unique.length) return {};
  const query=new URLSearchParams({ slugs:unique.join(','), ...(force?{refresh:'1'}:{}) });
  return (await parseApiResponse(await fetch(urlFor(`prices?${query}`),{cache:'no-store'}))).prices;
};
export const fetchRelicRewards = async () => {
  try {
    const json=await parseApiResponse(await fetch(urlFor('relic-rewards'),{cache:'no-store'}));
    return Array.isArray(json.names)?json.names:[];
  } catch { return []; }
};
