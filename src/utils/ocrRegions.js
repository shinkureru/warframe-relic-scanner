/**
 * Warframe relic selection screenshot geometry.
 * All coordinates refer to the SOURCE IMAGE, never to its CSS preview.
 * The primary preset is the user's cropped four-reward screenshot (4 cards
 * spanning most of the image, with a single title strip near the lower edge).
 */
export const REWARD_LAYOUTS = {
  wide:    { centers: [0.198, 0.405, 0.612, 0.819], width: 0.202 },
  compact: { centers: [0.375, 0.455, 0.535, 0.615], width: 0.080 },
};
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

/**
 * Only the NAME LINE needs to be located; never infer the four columns from
 * blue text (player names, top HUD labels and icons all look very similar).
 * Default to cropped four-card layout; allow an explicit full-screen preset.
 */
export function identifyRewardLayout(imageData, layout='wide') {
  const { width, height, data } = imageData;
  const config = REWARD_LAYOUTS[layout] || REWARD_LAYOUTS.wide;
  const countTextPixels = (x0, x1, y0, y1) => {
    let count = 0;
    for (let y=y0; y<y1; y+=2) {
      for (let x=x0; x<x1; x+=2) {
        const i = (y*width+x)*4;
        const r=data[i], g=data[i+1], b=data[i+2];
        // Light blue/cyan lettering; reject bright gold, gray and dark scenery.
        if (b>128 && g>95 && b-r>24 && g-r>11 && b-g>-24) count++;
      }
    }
    return count;
  };
  const candidates=[];
  // The title generally falls at 55–68% of the image's height in a tightly
  // cropped screenshot. Search a little wider for HUD scale differences.
  for (let cy=.48; cy<=.80; cy+=.008) {
    const stripH=Math.max(5,Math.round(.033*height));
    const y0=clamp(Math.round(cy*height-stripH/2),0,height-stripH);
    const counts=config.centers.map(c => {
      const w=config.width*.85;
      return countTextPixels(
        clamp(Math.round((c-w/2)*width),0,width),
        clamp(Math.round((c+w/2)*width),0,width),
        y0,y0+stripH);
    });
    // All four titles must show something; prevents single-player name or icon.
    const min=Math.min(...counts), avg=counts.reduce((a,b)=>a+b,0)/4;
    // Reward name line is mostly in upper part of this search for a cropped shot.
    const positionBonus=cy<.68?1:.65;
    candidates.push({layout, titleCenterY:cy, score:(min*.7+avg*.3)*positionBonus});
  }
  candidates.sort((a,b)=>b.score-a.score);
  // The candidate strip is centered on the character strokes. Small shifts
  // keep 1-line labels wholly within the final cropped image.
  return candidates[0] || {layout,titleCenterY:.59,score:0};
}

export function getNameRegions(width,height,mode='wide',yShift=0,calibration=null,detected=null) {
  const aspect=width/height;
  const calibrated=calibration && Math.abs(aspect/calibration.aspect-1)<.16;
  const useCal=mode==='custom'&&calibrated;
  const layout=mode==='compact'?'compact':'wide';
  const c=REWARD_LAYOUTS[layout];
  const centers=useCal
    ? Array.from({length:4},(_,i)=>calibration.firstX+(calibration.lastX-calibration.firstX)*i/3)
    : c.centers;
  const span=useCal ? clamp((calibration.lastX-calibration.firstX)/3*.95,.05,.215) : c.width;
  const centerY=useCal ? calibration.centerY : (detected?.titleCenterY ?? .59);
  const h=useCal ? .088 : (layout==='compact'?.055:.079);
  return centers.map((center,slot)=>{
    const x=clamp(Math.round((center-span/2)*width),0,width-1);
    const w=Math.min(width-x,Math.round(span*width));
    const y=clamp(Math.round((centerY-h/2+yShift/100)*height),0,height-1);
    const hh=Math.min(height-y,Math.round(h*height));
    return {slot,x,y,width:Math.max(1,w),height:Math.max(1,hh)};
  });
}

/** Map one OCR worker's output back to the four stacked name-strip rows. */
export function groupCompositeLines(words,boxes) {
  const rows=Array.from({length:4},()=>[]);
  for(const word of words){
    const x=((word.bbox?.x0??0)+(word.bbox?.x1??0))/2;
    const y=((word.bbox?.y0??0)+(word.bbox?.y1??0))/2;
    const box=boxes.find(b=>x>=b.x&&x<b.x+b.width&&y>=b.y&&y<b.y+b.height);
    if(box) rows[box.slot].push(word);
  }
  return rows.map(words=>{
    words.sort((a,b)=>{
      const dy=a.bbox.y0-b.bbox.y0;
      return Math.abs(dy)>13?dy:a.bbox.x0-b.bbox.x0;
    });
    // Keep array shape expected by matchRewards, allowing future multi-pass OCR.
    return [words.map(w=>w.text).join(' ').trim()];
  });
}

/** v1.7: source-shape classification. Coordinates always refer to pasted pixels. */
export function detectInputKind(width,height){
  if(!width||!height)return 'invalid';
  // E.g. 1600x70 cropped name row: DO NOT search for labels at 59% height.
  if(width/height>=5.2)return 'names';
  return 'rewards';
}

/** Resolve both 4-wide and centrally packed full-game reward layouts. */
export function identifyAutoLayout(imageData){
  const candidates=['wide','compact'].map(layout=>identifyRewardLayout(imageData,layout));
  // The compact layout spans only ~32% as much horizontal space. Its score
  // must surpass the wide layout clearly, or we risk cropping wrong columns.
  const [wide,compact]=candidates;
  return compact.score>wide.score*1.23?compact:wide;
}

/** Four equal-width image strips; full height already consists of text. */
export function getNameStripRegions(width,height){
  return Array.from({length:4},(_,slot)=>{
    const x=Math.round(width*slot/4);
    const right=Math.round(width*(slot+1)/4);
    return {slot,x,y:0,width:right-x,height};
  });
}
