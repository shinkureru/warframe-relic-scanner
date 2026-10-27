import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeName, buildCatalogIndex, matchRewards } from '../src/utils/matching.js';
import { isSpecificOcrName } from '../src/utils/learnedCorrections.js';

const sample = [
  {id:'1',slug:'yareli_prime_blueprint',nameZh:'Yareli Prime 藍圖',nameEn:'Yareli Prime Blueprint',ducats:100},
  {id:'2',slug:'cedo_prime_blueprint',nameZh:'席多 Prime 藍圖',nameEn:'Cedo Prime Blueprint',ducats:100},
  {id:'3',slug:'fang_prime_blade',nameZh:'闇牙 Prime 刀刃',nameEn:'Fang Prime Blade',ducats:45},
  {id:'4',slug:'other_prime_blade',nameZh:'其他 Prime 刀刃',nameEn:'Other Prime Blade',ducats:45},
];

test('OCR reading with flipped suffix is normalized',()=>{
  assert.equal(normalizeName('藍圖 Yareli Prime'), 'yareliprime藍圖');
});

test('Mixed name dictionary recognizes English family + Chinese part',()=>{
  const index=buildCatalogIndex(sample);
  assert.ok(index.entries.some(e=>e.name==='yareliprime藍圖'));
  const result=matchRewards([['藍圖 Yareli Prime']],index);
  assert.equal(result[0].match?.item.slug,'yareli_prime_blueprint');
});

test('Unrecognized base in generic blade OCR is never auto-learned',()=>{
  assert.equal(isSpecificOcrName('jf Prime 刀刃'),false);
  assert.equal(isSpecificOcrName('席多 Prime #'),true);
});

test('No guesses for unreadable generic blade label',()=>{
  const result=matchRewards([['jf Prime 刀刃']],buildCatalogIndex(sample));
  assert.equal(result[0].match,null);
});
