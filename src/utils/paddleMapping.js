const lineMidpoint = poly => {
  if(!Array.isArray(poly)||!poly.length)return null;
  const points=poly.map(pt=>Array.isArray(pt)?pt:([pt.x,pt.y]));
  const ys=points.map(p=>Number(p[1])).filter(Number.isFinite);
  const xs=points.map(p=>Number(p[0])).filter(Number.isFinite);
  return ys.length&&xs.length ? {x:xs.reduce((a,b)=>a+b,0)/xs.length,y:ys.reduce((a,b)=>a+b,0)/ys.length} : null;
};
export function columnsFromPaddle(items, boxes){
  const groups=Array.from({length:4},()=>[]);
  for(const item of items||[]){
    const midpoint=lineMidpoint(item.poly);
    if(!midpoint||!item.text?.trim())continue;
    const box=boxes.find(box=>midpoint.x>=box.x&&midpoint.x<box.x+box.width&&midpoint.y>=box.y&&midpoint.y<box.y+box.height);
    if(box)groups[box.slot].push({y:midpoint.y,x:midpoint.x,text:item.text.trim()});
  }
  return groups.map(group=>[group.sort((a,b)=>a.y-b.y||a.x-b.x).map(item=>item.text).join(' ').trim()]);
}
