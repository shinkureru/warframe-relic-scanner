import test from 'node:test';
import assert from 'node:assert/strict';
import {columnsFromPaddle} from '../src/utils/paddleMapping.js';
// The module can import browser-only functions without evaluating PaddleOCR.
test('PaddleOCR recognition lines map to four reward strips by their polygon',()=>{
 const boxes=Array.from({length:4},(_,i)=>({slot:i,x:10,y:20+i*130,width:400,height:100}));
 const input=boxes.map((box,i)=>({poly:[[20,box.y+15],[200,box.y+15],[200,box.y+55],[20,box.y+55]],text:`測試${i} Prime 藍圖`}));
 const out=columnsFromPaddle(input,boxes);
 assert.deepEqual(out.map(x=>x[0]),input.map(x=>x.text));
});
