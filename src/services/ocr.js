import { getNameRegions, groupCompositeLines, identifyRewardLayout, identifyAutoLayout, detectInputKind, getNameStripRegions } from '../utils/ocrRegions.js';
import { createWorker, PSM } from 'tesseract.js';

let workerPromise;
export function preloadOCR() {
  if (!workerPromise) {
    workerPromise=createWorker(['chi_tra','eng'], undefined, {
      // Default model is best_int (quality-focused). Avoid deprecated projectnaptha fast CDN.
      logger:()=>{},
    }).then(async worker=>{
      await worker.setParameters({tessedit_pageseg_mode:PSM.SINGLE_BLOCK,preserve_interword_spaces:'1'});
      return worker;
    }).catch(error=>{workerPromise=null;throw error;});
  }
  return workerPromise;
}

async function loadImage(file){
  if(typeof createImageBitmap==='function')return createImageBitmap(file);
  const url=URL.createObjectURL(file);
  return new Promise((resolve,reject)=>{
    const img=new Image();
    img.onload=()=>{URL.revokeObjectURL(url);resolve(img);};
    img.onerror=()=>{URL.revokeObjectURL(url);reject(new Error('無法讀取圖片'));};
    img.src=url;
  });
}

/**
 * On the real Traditional Chinese reward screen, white-on-blue text is much
 * more legible after cyan isolation than after plain grayscale conversion.
 * Retain anti-aliasing strokes; avoid binary thresholding Chinese characters.
 */
export function isolateBlueText(ctx,w,h){
  const image=ctx.getImageData(0,0,w,h), pixels=image.data;
  for(let i=0;i<pixels.length;i+=4){
    const r=pixels[i],g=pixels[i+1],b=pixels[i+2];
    const color=Math.max(0,Math.min(1,(b-r-20)/45));
    const cyan=Math.max(0,Math.min(1,(g-r-5)/30));
    const brightness=Math.max(0,Math.min(1,(b-100)/90));
    const value=Math.round(255*(1-color*cyan*brightness));
    pixels[i]=pixels[i+1]=pixels[i+2]=value;
    pixels[i+3]=255;
  }
  ctx.putImageData(image,0,0);
}

/**
 * One OCR request for 4 horizontal name strips, NOT a screenshot-sized job.
 * Each row is one reward. Blank space keeps the OCR engine from mixing lines.
 */
export async function preprocessImage(file,mode='auto',yShift=0,calibration=null,treatment='soft'){
  const image=await loadImage(file);
  const {width,height}=image;
  if(!width||!height)throw new Error('無效的圖片尺寸');
  const inputKind=detectInputKind(width,height);
  const detected=inputKind==='names'
    ? {layout:'names',titleCenterY:.5,score:1}
    : (()=>{
      const probe=document.createElement('canvas');
      probe.width=800;probe.height=Math.max(120,Math.round(800*height/width));
      const dc=probe.getContext('2d',{willReadFrequently:true});
      dc.drawImage(image,0,0,probe.width,probe.height);
      const data=dc.getImageData(0,0,probe.width,probe.height);
      return mode==='auto'?identifyAutoLayout(data):identifyRewardLayout(data,mode==='compact'?'compact':'wide');
    })();
  const regions=inputKind==='names'
    ? getNameStripRegions(width,height)
    : getNameRegions(width,height,mode==='auto'?detected.layout:mode,yShift,calibration,detected);
  // Preserve the original character proportions. The old 850x126 stretching
  // warped Chinese glyphs and made even sharp source screenshots unreadable.
  const pad=22, gap=28, rowH=106, innerH=90;
  const canvas=document.createElement('canvas');
  canvas.width=960;
  canvas.height=pad*2+rowH*4+gap*3;
  const ctx=canvas.getContext('2d',{willReadFrequently:true});
  ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);
  const boxes=[];
  for(const region of regions){
    const x=pad,y=pad+region.slot*(rowH+gap);
    const scale=Math.min((canvas.width-2*pad)/region.width,innerH/region.height);
    const targetW=Math.max(1,Math.round(region.width*scale));
    const targetH=Math.max(1,Math.round(region.height*scale));
    const crop=document.createElement('canvas');crop.width=targetW;crop.height=targetH;
    const cc=crop.getContext('2d',{willReadFrequently:true});
    cc.imageSmoothingEnabled=true;
    cc.imageSmoothingQuality='high';
    cc.drawImage(image,region.x,region.y,region.width,region.height,0,0,targetW,targetH);
    if(treatment==='blue')isolateBlueText(cc,targetW,targetH);
    else if(treatment==='soft')softenBlueText(cc,targetW,targetH);
    // The original color image is also available as a fallback pass.
    const targetY=y+Math.round((rowH-targetH)/2);
    ctx.drawImage(crop,x,targetY);
    boxes.push({slot:region.slot,x,y,width:canvas.width-pad*2,height:rowH});
  }
  image.close?.();
  return {canvas,boxes,regions,detected,inputKind};
}


/**
 * Alternative OCR input: preserve more stroke detail than the cyan-only mask.
 * Intended as a selective second pass for low-confidence rows, not every scan.
 */
export function softenBlueText(ctx,w,h){
  const {data}=ctx.getImageData(0,0,w,h), image=ctx.getImageData(0,0,w,h);
  for(let i=0;i<data.length;i+=4){
    const r=data[i],g=data[i+1],b=data[i+2];
    const cyan=Math.max(0,b-r)*.67+Math.max(0,g-r)*.33;
    const ink=Math.max(0,Math.min(225,(cyan-9)*2.25))*Math.min(1,Math.max(0,(b-75)/85));
    const out=Math.round(255-ink);
    image.data[i]=image.data[i+1]=image.data[i+2]=out;
    image.data[i+3]=255;
  }
  ctx.putImageData(image,0,0);
}

export function likelyNeedsSecondPass(columns){
  return columns.some((row)=>{
    const text=(Array.isArray(row)?row.join(' '):row||'').trim();
    if(!text || /[#?�]/.test(text))return true;
    // Garbled all-Latin OCR (e.g. 'QAM UPIMA TRIM') needs a second pass too.
    // Older versions skipped it merely because OCR had lost the word Prime.
    if(!/\p{Script=Han}/u.test(text) && !/forma/i.test(text))return true;
    if(!/prime/i.test(text))return false;
    const base=text.replace(/prime/gi,'').replace(/藍圖|設計圖|刀刃|弓弦|槍機|槍托|槍管|槍身|機體|系統|神經光元|握柄|下弓臂|接收器/gi,'');
    const han=(base.match(/\p{Script=Han}/gu)||[]).length;
    const latin=(base.match(/[a-z]{4,}/gi)||[]).join('');
    return han<2 && latin.length<4;
  });
}

function getWords(data){
  const words=[];
  for(const block of data.blocks||[])for(const paragraph of block.paragraphs||[]){
    for(const line of paragraph.lines||[]){
      if(line.words?.length){
        for(const word of line.words){
          if(word.bbox&&word.text?.trim())words.push({bbox:word.bbox,text:word.text.trim()});
        }
      }else if(line.bbox&&line.text?.trim())words.push({bbox:line.bbox,text:line.text.trim()});
    }
  }
  return words;
}

export async function scanImage(file,mode='auto',yShift=0,calibration=null){
  const {canvas,boxes,regions,detected,inputKind}=await preprocessImage(file,mode,yShift,calibration);
  const worker=await preloadOCR();
  const {data}=await worker.recognize(canvas,{}, {blocks:true,text:true});
  const columns=groupCompositeLines(getWords(data),boxes);
  // Fallback for Tesseract versions that omit word-level boxes.
  if(columns.every(col=>!col[0])&&data.text){
    const lines=data.text.split(/\r?\n/).map(s=>s.trim()).filter(Boolean);
    if(lines.length===4)lines.forEach((line,i)=>{columns[i]=[line];});
  }
  // The selective second pass can recover faint Chinese strokes that the
  // first blue-only color mask destroyed. Keep BOTH readings for catalog matching.
  let passCount=1;
  if(likelyNeedsSecondPass(columns)){
    const alternative=await preprocessImage(file,mode,yShift,calibration,'original');
    const second=await worker.recognize(alternative.canvas,{}, {blocks:true,text:true});
    const next=groupCompositeLines(getWords(second.data),alternative.boxes);
    if(next.every(col=>!col[0])&&second.data.text){
      const lines=second.data.text.split(/\r?\n/).map(s=>s.trim()).filter(Boolean);
      if(lines.length===4)lines.forEach((line,i)=>{next[i]=[line];});
    }
    next.forEach((c,i)=>{
      const text=c.join(' ').trim();
      if(text && !columns[i].includes(text))columns[i].push(text);
    });
    passCount=2;
  }
  const raw=columns.map((c,i)=>`#${i+1}: ${c.join(' / ')||'(無文字)'}`).join('\n');
  return {columns,raw,debugURL:canvas.toDataURL('image/png'),regions,
    layoutInfo:(inputKind==='names'?'純名稱截圖／全高度辨識':mode==='custom'?'手動校正四格名稱':`${detected.layout==='compact'?'完整遊戲畫面':'獎勵四格截圖'}／名稱列 ${Math.round(detected.titleCenterY*100)}%`)+`／OCR ${passCount} 次`};
}
