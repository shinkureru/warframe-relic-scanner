import test from 'node:test';
import assert from 'node:assert/strict';
import worker,{compactCatalog,compactPrices} from '../worker/src/index.js';
const env={ALLOWED_ORIGIN:'https://example.github.io',APP_USER_AGENT:'RelicScanner/1.8 (test)'};
test('worker health endpoint and origin header',async()=>{
  const req=new Request('https://mock.workers.dev/api/health',{headers:{Origin:'https://example.github.io'}});
  const res=await worker.fetch(req,env);
  assert.equal(res.status,200);
  assert.equal(res.headers.get('Access-Control-Allow-Origin'),'https://example.github.io');
  assert.equal((await res.json()).ok,true);
});
test('worker preflight does not create invalid 204 response body',async()=>{
  const res=await worker.fetch(new Request('https://mock.workers.dev/api/prices',{method:'OPTIONS',headers:{Origin:'https://example.github.io'}}),env);
  assert.equal(res.status,204);
  assert.equal(await res.text(),'');
});
test('worker denies unknown remote origins',async()=>{
  const res=await worker.fetch(new Request('https://mock.workers.dev/api/health',{headers:{Origin:'https://unrelated.example'}}),env);
  assert.equal(res.status,403);
});
test('worker parses market top orders and catalog',()=>{
  assert.deepEqual(compactPrices({sell:[{platinum:12},{platinum:9}],buy:[{platinum:5}]}),{
    lowestSell:9,highestBuy:5,sellCount:2,buyCount:1
  });
  const list=compactCatalog([{slug:'cedo_prime_set',id:'1',i18n:{'zh-hant':{name:'席多 Prime 一套'},en:{name:'Cedo Prime Set'}}}]);
  assert.equal(list[0].nameZh,'席多 Prime 一套');
});
