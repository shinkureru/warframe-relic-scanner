/**
 * Warframe.Market v2 relay with clear upstream errors and persistent catalog fallback.
 * Public API budget: <= 3 requests/sec. No Warframe client / EE.log access.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const BASE = 'https://api.warframe.market/v2';
const HEADERS = {
  Accept: 'application/json',
  Language: 'zh-hant',
  Platform: 'pc',
  Crossplay: 'true',
  'User-Agent': process.env.MARKET_USER_AGENT || 'RelicScanner/1.4 (personal-use)',
};
const CATALOG_TTL = 12 * 60 * 60 * 1000;
const PRICE_TTL = 35 * 1000;
const REQUEST_GAP = 410;
const TIMEOUT = 7500;
const CACHE_FILE = process.env.MARKET_CACHE_PATH || path.resolve(path.dirname(fileURLToPath(import.meta.url)), '.cache', 'catalog-zh-hant.json');

const priceCache = new Map();
const inFlightPrices = new Map();
let catalogCache = null;
let catalogPromise = null;
let cacheLoadPromise = null;
let requestQueue = Promise.resolve();
let lastRequestStartedAt = 0;
let lastUpstreamError = null;
let lastUpstreamSuccessAt = null;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function throttle(task) {
  const run = requestQueue.catch(() => {}).then(async () => {
    const wait = REQUEST_GAP - (Date.now() - lastRequestStartedAt);
    if (wait > 0) await sleep(wait);
    lastRequestStartedAt = Date.now();
    return task();
  });
  requestQueue = run.catch(() => {});
  return run;
}

export function describeError(err) {
  if (err?.name === 'AbortError' || err?.name === 'TimeoutError') return '連線逾時（超過 7.5 秒）';
  const code = err?.cause?.code || err?.code;
  if (code) return `連線失敗（${code}）：${err.message || '網路連線錯誤'}`;
  return String(err?.message || err || '未知錯誤');
}

async function requestOnce(endpoint) {
  return throttle(async () => {
    try {
      const response = await fetch(`${BASE}${endpoint}`, {
        headers: HEADERS,
        signal: AbortSignal.timeout(TIMEOUT),
      });
      if (!response.ok) {
        const err = new Error(`Market 上游 HTTP ${response.status} ${response.statusText}`.trim());
        err.status = response.status;
        throw err;
      }
      const body = await response.json();
      if (body?.error) throw new Error(`Market API 錯誤：${JSON.stringify(body.error).slice(0, 200)}`);
      if (!body || !('data' in body)) throw new Error('Market API 回傳結構缺少 data 欄位');
      lastUpstreamSuccessAt = new Date().toISOString();
      lastUpstreamError = null;
      return body.data;
    } catch (err) {
      lastUpstreamError = { endpoint, message: describeError(err), at: new Date().toISOString() };
      throw err;
    }
  });
}

async function apiGet(endpoint) {
  try {
    return await requestOnce(endpoint);
  } catch (err) {
    // Retry a transient gateway failure exactly once; never retry 403/429 or bad JSON.
    if (![408, 500, 502, 503, 504].includes(err?.status) && err?.name !== 'TimeoutError') throw err;
    await sleep(750);
    return requestOnce(endpoint);
  }
}

export function compactCatalog(data) {
  const items = Array.isArray(data) ? data : Array.isArray(data?.items) ? data.items : [];
  if (!items.length) throw new Error('Market 的 /v2/items 未傳回有效物品清單，請確認 API 格式');
  const mapped = items.filter((item) => item?.slug && item?.id).map((item) => ({
    id: item.id,
    slug: item.slug,
    nameZh: item.i18n?.['zh-hant']?.name || item.i18n?.['zh-Hant']?.name || '',
    nameEn: item.i18n?.en?.name || item.slug.replaceAll('_', ' '),
    ducats: typeof item.ducats === 'number' ? item.ducats : null,
    tags: item.tags || [],
  }));
  if (!mapped.length) throw new Error('Market 物品資料不包含可識別的 slug 和 id');
  return mapped;
}

async function readDiskCache() {
  if (!cacheLoadPromise) cacheLoadPromise = (async () => {
    try {
      const json = JSON.parse(await fs.readFile(CACHE_FILE, 'utf8'));
      if (!Array.isArray(json.items) || !json.items.length) return null;
      const items = json.items.filter((item) => item.slug && item.id);
      return items.length ? { items, at: Date.parse(json.updatedAt) || 0, updatedAt: json.updatedAt } : null;
    } catch (e) {
      if (e.code !== 'ENOENT') console.warn('[Market] 無法讀取磁碟物品快取：', describeError(e));
      return null;
    }
  })();
  return cacheLoadPromise;
}

async function saveDiskCache(items, updatedAt) {
  try {
    await fs.mkdir(path.dirname(CACHE_FILE), { recursive: true });
    await fs.writeFile(CACHE_FILE, JSON.stringify({ version: 1, updatedAt, items }), 'utf8');
  } catch (err) {
    console.warn('[Market] 無法寫入物品快取：', describeError(err));
  }
}

export async function getCatalog({ force = false } = {}) {
  if (!catalogCache) {
    const disk = await readDiskCache();
    if (disk) catalogCache = { ...disk, source: 'disk' };
  }
  if (!force && catalogCache && Date.now() - catalogCache.at < CATALOG_TTL) {
    return { items: catalogCache.items, source: catalogCache.source, updatedAt: catalogCache.updatedAt };
  }
  if (!catalogPromise) {
    catalogPromise = (async () => {
      try {
        const items = compactCatalog(await apiGet('/items'));
        const updatedAt = new Date().toISOString();
        catalogCache = { items, at: Date.now(), updatedAt, source: 'live' };
        await saveDiskCache(items, updatedAt);
        return { items, source: 'live', updatedAt };
      } catch (err) {
        const detail = describeError(err);
        console.error('[Market] 物品索引載入失敗：', detail);
        if (catalogCache?.items?.length) {
          return { items: catalogCache.items, source: 'stale', updatedAt: catalogCache.updatedAt, warning: `Market 暫時無法連線，沿用本機快取：${detail}` };
        }
        const failure = new Error(detail);
        failure.upstreamStatus = err?.status || null;
        throw failure;
      }
    })().finally(() => { catalogPromise = null; });
  }
  return catalogPromise;
}

export function compactTopOrders(data) {
  const sell = (Array.isArray(data?.sell) ? data.sell : [])
    .map((item) => Number(item.platinum)).filter((n) => Number.isFinite(n) && n >= 0);
  const buy = (Array.isArray(data?.buy) ? data.buy : [])
    .map((item) => Number(item.platinum)).filter((n) => Number.isFinite(n) && n >= 0);
  return {
    lowestSell: sell.length ? Math.min(...sell) : null,
    highestBuy: buy.length ? Math.max(...buy) : null,
    sellCount: sell.length,
    buyCount: buy.length,
  };
}

export async function getPrice(slug, { force = false } = {}) {
  const cached = priceCache.get(slug);
  if (!force && cached && Date.now() - cached.at < PRICE_TTL) {
    return { ...cached.value, checkedAt: cached.checkedAt, cached: true };
  }
  if (inFlightPrices.has(slug)) return inFlightPrices.get(slug);
  const task = (async () => {
    try {
      const data = await apiGet(`/orders/item/${encodeURIComponent(slug)}/top`);
      const value = compactTopOrders(data);
      const checkedAt = new Date().toISOString();
      priceCache.set(slug, { value, at: Date.now(), checkedAt });
      return { ...value, checkedAt, cached: false };
    } catch (err) {
      // Never label an old order as live. Stale prices are explicitly marked.
      if (cached) return { ...cached.value, checkedAt: cached.checkedAt, cached: true, stale: true, warning: describeError(err) };
      throw new Error(describeError(err));
    }
  })().finally(() => inFlightPrices.delete(slug));
  inFlightPrices.set(slug, task);
  return task;
}

export function marketDiagnostics() {
  return {
    lastUpstreamError, lastUpstreamSuccessAt,
    catalog: catalogCache ? { source: catalogCache.source, updatedAt: catalogCache.updatedAt, count: catalogCache.items.length } : null,
    api: BASE,
  };
}
