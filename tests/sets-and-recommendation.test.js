import test from 'node:test';
import assert from 'node:assert/strict';
import {findSetForItem,recommendRewardSlot} from '../src/utils/sets.js';
const c={slug:'cedo_prime_blueprint'};
const items=[{slug:'cedo_prime_set',nameZh:'席多 Prime 一套'},{slug:'unrelated_prime_set'},{slug:'dual_cedo_prime_set'}];
test('component finds a matching complete Prime set',()=>assert.equal(findSetForItem(c,items)?.slug,'cedo_prime_set'));
test('untradable has no set',()=>assert.equal(findSetForItem({slug:null,nontradable:true},items),null));
const mk=(slot,sell)=>({slot,item:{slug:`x_${slot}`},price:{lowestSell:sell}});
test('recommend uses highest lowest seller ask, NOT highest buy offer',()=>{
  const r=[mk(0,12),mk(1,25),mk(2,7),mk(3,13)];r[0].price.highestBuy=99;
  assert.equal(recommendRewardSlot(r),1);
});
test('unknown or stale prices produce no misleading recommendation',()=>{
  const r=[mk(0,12),mk(1,25),mk(2,7),mk(3,13)];r[1].price.stale=true;
  assert.equal(recommendRewardSlot(r),null);
  r[1].price.stale=false;r[2].item=null;
  assert.equal(recommendRewardSlot(r),null);
});
test('untradable is excluded from recommendation',()=>{
  const r=[mk(0,8),mk(1,9),mk(2,7),mk(3,8)];r[1].item={nontradable:true};r[1].price=null;
  assert.equal(recommendRewardSlot(r),0);
});
