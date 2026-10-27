/**
 * Reward whitelist from WFCD's parse of official Digital Extremes drop tables.
 * Never blocks OCR/Market when data source is unavailable.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const URLS = [
  'https://raw.githubusercontent.com/WFCD/warframe-drop-data/main/data/relics.json',
  'https://raw.githubusercontent.com/WFCD/warframe-drop-data/master/data/relics.json',
];
const CACHE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '.cache', 'relic-reward-names.json');
const TTL = 24*60*60*1000;
let memory = null;
let inFlight = null;

export function collectRelicRewardNames(source) {
  const relics = Array.isArray(source) ? source : source?.relics;
  if(!Array.isArray(relics)) throw new Error('遺物掉落清單格式不正確');
  const names = [...new Set(relics.flatMap(relic => {
    // Supports both flat and grouped reward formats.
    const list = Array.isArray(relic.rewards) ? relic.rewards : Object.values(relic.rewards || {}).flat();
    return list.map(item => item?.itemName).filter(name=>typeof name==='string');
  }))];
  if(names.length<40) throw new Error('遺物獎勵清單不完整');
  return names;
}
export async function getRelicRewards({force=false}={}) {
  if (!memory) {
    try { memory=JSON.parse(await fs.readFile(CACHE,'utf8')); } catch {}
  }
  if(!force && memory?.names?.length && Date.now()-Date.parse(memory.updatedAt)<TTL) return {...memory, source:'cache'};
  if(inFlight)return inFlight;
  inFlight=(async()=>{
    let error='';
    for(const url of URLS){
      try {
        const response=await fetch(url,{headers:{Accept:'application/json'},signal:AbortSignal.timeout(6500)});
        if(!response.ok)throw new Error(`HTTP ${response.status}`);
        const names=collectRelicRewardNames(await response.json());
        memory={names,updatedAt:new Date().toISOString()};
        await fs.mkdir(path.dirname(CACHE),{recursive:true});
        await fs.writeFile(CACHE,JSON.stringify(memory));
        return {...memory,source:'live'};
      }catch(e){error=e.message;}
    }
    return memory?.names?.length ? {...memory,source:'stale',warning:error} : {names:[],source:'unavailable',warning:error};
  })().finally(()=>inFlight=null);
  return inFlight;
}
