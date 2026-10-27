import test from 'node:test';
import assert from 'node:assert/strict';
import { buildCatalogIndex, findCandidates, findRelicCandidates, matchRewards } from '../src/utils/matching.js';
import { collectRelicRewardNames } from '../server/relics.js';
const items = [
  {id:'1',slug:'cedo_prime_blueprint',nameZh:'席多 Prime 藍圖',nameEn:'Cedo Prime Blueprint',ducats:100},
  {id:'2',slug:'fang_prime_blade',nameZh:'闇牙 Prime 刀刃',nameEn:'Fang Prime Blade',ducats:45},
  {id:'3',slug:'yareli_prime_blueprint',nameZh:'Yareli Prime 藍圖',nameEn:'Yareli Prime Blueprint',ducats:100},
  {id:'4',slug:'braton_prime_stock',nameZh:'布萊頓 Prime 槍托',nameEn:'Braton Prime Stock',ducats:45},
  {id:'5',slug:'braton_prime_barrel',nameZh:'布萊頓 Prime 槍管',nameEn:'Braton Prime Barrel',ducats:45},
  {id:'6',slug:'braton_prime_set',nameZh:'布萊頓 Prime 套裝',nameEn:'Braton Prime Set'},
  {id:'7',slug:'arcane_energize',nameZh:'充沛賦能',nameEn:'Arcane Energize'},
];
const index=buildCatalogIndex(items);
test('完全辨識繁中物品直接匹配',()=>{
  assert.equal(matchRewards([['席多 Prime 藍圖']],index)[0].match.item.slug,'cedo_prime_blueprint');
});
test('OCR 只剩首字時，提供候選但不亂給白金價格',()=>{
  const value=matchRewards([['席 Prime #']],index)[0];
  assert.equal(value.match,null);
  assert.equal(value.candidates[0].item.slug,'cedo_prime_blueprint');
});
test('OCR 正確兩個字但丟失部件，仍提供候選',()=>{
  assert.equal(matchRewards([['席多 Prime #']],index)[0].candidates[0].item.slug,'cedo_prime_blueprint');
});
test('部件衝突不得錯配',()=>{
  const result=findRelicCandidates(index,'布萊頓 Prime 槍托');
  assert.equal(result[0].item.slug,'braton_prime_stock');
  assert.ok(!result.some(c=>c.item.slug==='braton_prime_barrel'));
});
test('Yareli 英文倒序 OCR 仍匹配',()=>{
  assert.equal(matchRewards([['藍圖 Yareli Prime']],index)[0].match.item.slug,'yareli_prime_blueprint');
});
test('只剩英文雜訊與部件不能亂匹配',()=>{
  assert.equal(matchRewards([['jf Prime 刀刃']],index)[0].match,null);
});
test('非交易品 Forma 藍圖要能攔截',()=>{
  assert.equal(matchRewards([['2 X Forma 藍圖']],index)[0].match.item.nontradable,true);
});
test('手動輸入單個繁中字能出現 Market 候選',()=>{
  assert.equal(findCandidates(index,'席')[0].item.slug,'cedo_prime_blueprint');
});
test('遺物掉落清單會排除非遺物的 Prime 物品',()=>{
  const many=Array.from({length:61},(_,i)=>({id:String(i+10),slug:`dummy${i}_prime_blueprint`,nameZh:`假測${i} Prime 藍圖`,nameEn:`Dummy${i} Prime Blueprint`}));
  const idx=buildCatalogIndex([...items,...many],many.map(x=>x.nameEn));
  assert.equal(idx.source,'official-relic-list');
  assert.ok(idx.relicItems.every(x=>x.slug.startsWith('dummy')));
});
test('掉落清單處理 WFCD 標準格式',()=>{
  const names=collectRelicRewardNames({relics:Array.from({length:45},(_,i)=>({rewards:[{itemName:`Example Prime ${i} Blueprint`}] }))});
  assert.equal(names.length,45);
});
