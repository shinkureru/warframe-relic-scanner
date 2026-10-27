import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../worker/src/index.js';
const env={ALLOWED_ORIGIN:'https://example.github.io',APP_USER_AGENT:'RelicScanner/1.8 (+example)'};
test('Worker returns separate individual and set online prices from mocked Market API',async()=>{
  const oldFetch=globalThis.fetch,oldCaches=globalThis.caches;
  globalThis.caches={default:{match:async()=>null,put:async()=>{}}};
  const requests=[];
  globalThis.fetch=async(url)=>{
    const path=String(url);requests.push(path);
    let data;
    if(path.endsWith('/v2/items')) data=[
      {id:'1',slug:'cedo_prime_blueprint',i18n:{en:{name:'Cedo Prime Blueprint'}}},
      {id:'2',slug:'cedo_prime_set',i18n:{en:{name:'Cedo Prime Set'}}},
    ];
    else if(path.includes('cedo_prime_blueprint'))data={sell:[{platinum:24},{platinum:30}],buy:[{platinum:17}]};
    else if(path.includes('cedo_prime_set'))data={sell:[{platinum:96}],buy:[{platinum:80}]};
    else throw new Error('Unexpected endpoint '+path);
    return new Response(JSON.stringify({data,error:null}),{status:200,headers:{'Content-Type':'application/json'}});
  };
  try {
    for(const [slug,expected] of [['cedo_prime_blueprint',24],['cedo_prime_set',96]]){
      const req=new Request(`https://worker.example.dev/api/prices?slugs=${slug}`,{headers:{Origin:'https://example.github.io'}});
      const res=await worker.fetch(req,env);
      assert.equal(res.status,200);
      const value=(await res.json()).prices[slug];
      assert.equal(value.lowestSell,expected);
    }
    assert.ok(requests.some(u=>u.endsWith('/v2/items')));
    assert.ok(requests.some(u=>u.includes('/top')));
  } finally {globalThis.fetch=oldFetch;globalThis.caches=oldCaches;}
});
