import test from 'node:test';
import assert from 'node:assert/strict';
import { getNameRegions, groupCompositeLines, identifyRewardLayout, REWARD_LAYOUTS } from '../src/utils/ocrRegions.js';

function syntheticRewardNames(layout='wide', y=.59) {
  const width=800,height=440;
  const data=new Uint8ClampedArray(width*height*4);
  for(let i=3;i<data.length;i+=4)data[i]=255;
  const {centers,width:band}=REWARD_LAYOUTS[layout];
  for(const center of centers){
    for(let row=Math.round((y-.014)*height);row<Math.round((y+.014)*height);row++){
      for(let x=Math.round((center-band*.40)*width);x<Math.round((center+band*.40)*width);x+=2){
        const i=(row*width+x)*4;
        data[i]=70;data[i+1]=169;data[i+2]=231;
      }
    }
  }
  return {width,height,data};
}

test('cropped four-card layout reliably discovers title at ~59% height',()=>{
  const d=identifyRewardLayout(syntheticRewardNames());
  assert.equal(d.layout,'wide');
  assert.ok(Math.abs(d.titleCenterY-.59)<.04);
});

test('cropped reward input 973x519 produces four non-overlapping label crops',()=>{
  const rows=getNameRegions(973,519,'wide',0,null,{titleCenterY:.59});
  assert.equal(rows.length,4);
  assert.deepEqual(rows.map(r=>r.slot),[0,1,2,3]);
  for(const [i,r] of rows.entries()){
    assert.ok(Math.abs((r.x+r.width/2)-[193,394,596,797][i])<3);
    assert.ok(r.y<=291 && r.y+r.height>=316);
    if(i) assert.ok(r.x>=rows[i-1].x+rows[i-1].width-6);
  }
});

test('compact four-card layout keeps its own narrower horizontal alignment',()=>{
  const rows=getNameRegions(1920,1080,'compact',0,null,{titleCenterY:.72});
  assert.ok(Math.abs((rows[0].x+rows[0].width/2)/1920-.375)<.003);
  assert.ok(Math.abs((rows[3].x+rows[3].width/2)/1920-.615)<.003);
});

test('manual calibration interpolates four card centers on the source image',()=>{
  const cal={firstX:.2,lastX:.82,centerY:.60,aspect:973/519};
  const rows=getNameRegions(973,519,'custom',0,cal);
  const ratios=rows.map(r=>(r.x+r.width/2)/973);
  for(let i=0;i<4;i++) assert.ok(Math.abs(ratios[i]-(.2+.62*i/3))<.004);
});

test('manual calibration is ignored if uploaded aspect ratio changes substantially',()=>{
  const cal={firstX:.2,lastX:.82,centerY:.60,aspect:6};
  const rows=getNameRegions(973,519,'custom',0,cal,{titleCenterY:.59});
  assert.ok(Math.abs((rows[0].x+rows[0].width/2)/973-.198)<.004);
});

test('vertical fine-tuning moves source-image crops',()=>{
  const before=getNameRegions(973,519,'wide',0,null,{titleCenterY:.59});
  const after=getNameRegions(973,519,'wide',-3,null,{titleCenterY:.59});
  assert.ok(after[0].y<before[0].y);
});

test('OCR words route to the correct one of four strips',()=>{
  const boxes=[0,1,2,3].map(i=>({slot:i,x:22,y:22+i*158,width:850,height:126}));
  const words=[
    {text:'瓦達雅',bbox:{x0:40,x1:160,y0:185,y1:229}},
    {text:'Prime',bbox:{x0:175,x1:275,y0:185,y1:229}},
    {text:'槍機',bbox:{x0:292,x1:360,y0:185,y1:229}},
    {text:'Forma',bbox:{x0:50,x1:140,y0:342,y1:390}},
  ];
  const rows=groupCompositeLines(words,boxes);
  assert.equal(rows[1][0],'瓦達雅 Prime 槍機');
  assert.equal(rows[2][0],'Forma');
});
