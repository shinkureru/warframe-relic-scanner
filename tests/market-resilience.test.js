import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs/promises';

test('Catalog can survive a later upstream 502 by reusing a clearly marked disk/memory cache', async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'relic-market-test-'));
  const originalFetch = globalThis.fetch;
  const previousPath = process.env.MARKET_CACHE_PATH;
  process.env.MARKET_CACHE_PATH = path.join(tmp, 'catalog.json');
  let requests = 0;
  globalThis.fetch = async (_url, _opts) => {
    requests++;
    if (requests === 1) return {
      ok: true,
      json: async () => ({ data: [{ id: 'test-1', slug: 'test_prime_part', ducats: 100, i18n: { en: { name: 'Test Prime Part' }, 'zh-hant': { name: '測試 Prime 部件' } } }] }),
    };
    return { ok: false, status: 502, statusText: 'Bad Gateway' };
  };
  try {
    const m = await import('../server/market.js?test=resilience');
    const one = await m.getCatalog();
    assert.equal(one.source, 'live');
    assert.equal(one.items[0].nameZh, '測試 Prime 部件');
    const file = JSON.parse(await fs.readFile(process.env.MARKET_CACHE_PATH, 'utf8'));
    assert.equal(file.items[0].slug, 'test_prime_part');
    const two = await m.getCatalog({ force: true });
    assert.equal(two.source, 'stale');
    assert.equal(two.items.length, 1);
    assert.match(two.warning, /Market 上游 HTTP 502/);
    assert.equal(requests, 3); // one success; failure and exactly one retry
  } finally {
    globalThis.fetch = originalFetch;
    if (previousPath === undefined) delete process.env.MARKET_CACHE_PATH;
    else process.env.MARKET_CACHE_PATH = previousPath;
    await fs.rm(tmp, { recursive: true, force: true });
  }
});
