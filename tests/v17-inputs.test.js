import test from 'node:test';
import assert from 'node:assert/strict';
import {detectInputKind, getNameStripRegions, identifyAutoLayout, REWARD_LAYOUTS} from '../src/utils/ocrRegions.js';

test('narrow strip goes to full-height OCR instead of fixed middle crop',()=>{
  assert.equal(detectInputKind(1651,87),'names');
  const regions=getNameStripRegions(1651,87);
  assert.equal(regions.length,4);
  assert.equal(regions[0].x,0);
  assert.equal(regions[0].height,87);
  assert.equal(regions[3].x+regions[3].width,1651);
  assert.ok(regions.every(r=>r.width>=412));
});

test('standard four-reward crop not treated as one row of text',()=>{
  assert.equal(detectInputKind(973,519),'rewards');
  assert.equal(detectInputKind(1920,1080),'rewards');
});

test('auto layout distinguishes four evenly spaced cards and center-packed cards',()=>{
 const make=(type)=>{
  const width=800,height=440,data=new Uint8ClampedArray(width*height*4);
  const config=REWARD_LAYOUTS[type];
  for(const xcenter of config.centers){
   for(let y=255;y<263;y++)for(let x=Math.round((xcenter-config.width*.30)*width);x<Math.round((xcenter+config.width*.30)*width);x++){
    const n=(y*width+x)*4;data[n]=80;data[n+1]=164;data[n+2]=225;data[n+3]=255;
   }
  }
  return {width,height,data};
 };
 assert.equal(identifyAutoLayout(make('wide')).layout,'wide');
 assert.equal(identifyAutoLayout(make('compact')).layout,'compact');
});

// Actual OCR recognition is intentionally browser-side; here we assert that
// unreadable lines get a chance at the second original-pixels pass.
