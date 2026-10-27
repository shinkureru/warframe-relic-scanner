import test from 'node:test';
import assert from 'node:assert/strict';
import { compactCatalog, compactTopOrders } from '../server/market.js';

test('Market item catalog includes traditional Chinese, English, and ducat value', () => {
  const [item] = compactCatalog([{ id: '1', slug: 'example_prime_blueprint', ducats: 100,
    i18n: { en: { name: 'Example Prime Blueprint' }, 'zh-hant': { name: '範例 Prime 藍圖' } } }]);
  assert.equal(item.nameZh, '範例 Prime 藍圖');
  assert.equal(item.ducats, 100);
  assert.equal(item.slug, 'example_prime_blueprint');
});

test('Highest buy / lowest sell are based on active order arrays', () => {
  const result = compactTopOrders({ sell: [{ platinum: 55 }, { platinum: 48 }], buy: [{ platinum: 22 }, { platinum: 27 }] });
  assert.equal(result.lowestSell, 48);
  assert.equal(result.highestBuy, 27);
});

test('Missing orders are represented as null (not invented prices)', () => {
  assert.equal(compactTopOrders({ sell: [], buy: [] }).highestBuy, null);
});
