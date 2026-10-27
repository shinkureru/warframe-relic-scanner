import { Camera, Clipboard, Upload, ScanLine, Repeat2, Crosshair } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

function relativeImagePoint(event) {
  const image = event.currentTarget;
  const rect = image.getBoundingClientRect();
  const ratio = image.naturalWidth / image.naturalHeight;
  const viewRatio = rect.width / rect.height;
  const actualW = viewRatio > ratio ? rect.height * ratio : rect.width;
  const actualH = viewRatio > ratio ? rect.height : rect.width / ratio;
  const left = rect.left + (rect.width - actualW)/2;
  const top = rect.top + (rect.height - actualH)/2;
  const x = (event.clientX-left)/actualW;
  const y = (event.clientY-top)/actualH;
  if (x<0||x>1||y<0||y>1) return null;
  return {x,y,aspect:ratio};
}

export default function ScreenshotPanel({imageURL,runScan,rescan,busy,calibration,applyCalibration,forgetCalibration}) {
  const fileInput=useRef(null);
  useEffect(() => {
    const cancel = (event) => { if (event.key === 'Escape') setAnchors(null); };
    window.addEventListener('keydown', cancel);
    return () => window.removeEventListener('keydown', cancel);
  }, []);
  const [dragging,setDragging]=useState(false);
  const [anchors,setAnchors]=useState(null);
  const getFile=(files)=>[...(files || [])].find(file=>file.type.startsWith('image/'));
  const handleDrop=(event)=>{
    event.preventDefault();setDragging(false);
    const file=getFile(event.dataTransfer.files);if(file)runScan(file);
  };
  const clickName=(event)=>{
    if(!anchors)return;
    const point=relativeImagePoint(event);
    if(!point)return;
    if(!anchors.first) {setAnchors({first:point});return;}
    const first=anchors.first;
    if(point.x-first.x<.10){setAnchors(null);return;}
    applyCalibration({firstX:first.x,lastX:point.x,centerY:(first.y+point.y)/2,aspect:point.aspect});
    setAnchors(null);
  };
  return <section aria-label="截圖預覽" className={`screenshot-frame ${dragging?'is-dragging':''}`}
    onDragOver={e=>{e.preventDefault();setDragging(true);}}
    onDragLeave={e=>{if(!e.currentTarget.contains(e.relatedTarget))setDragging(false);}}
    onDrop={handleDrop}>
    <div className="frame-bar red">
      <div className="frame-title"><Camera size={15}/> 01 / 遊戲獎勵截圖</div>
      <div className="frame-caption"><ScanLine size={14}/> 直接 Ctrl + V · 自動判斷輸入格式</div>
    </div>
    <div className="image-area">
      {imageURL ? <>
        <img onClick={clickName} className={`screenshot-image ${anchors?'calibrating':''}`}
          src={imageURL} alt="Warframe 遺物獎勵截圖，開啟校正後請點第一與第四格獎勵名稱中心" />
        {anchors && <div className="calibration-toast"><Crosshair size={16}/>
          {anchors.first?'請點「第四格」獎勵名稱中央':'請點「第一格」獎勵名稱中央'} · Esc 可取消
        </div>}
      </> : <div className="empty-state">
        <div className="empty-icon"><Clipboard size={31} strokeWidth={1.3}/></div>
        <h2>等待貼上獎勵截圖</h2><p>回 Warframe 截圖，切回網站按 <kbd>Ctrl</kbd> + <kbd>V</kbd></p>
        <div className="empty-sublabel">僅在本機辨識圖片，不讀取遊戲程序</div>
      </div>}
      {busy && imageURL && <div className="scanning-label"><span className="live-dot"/> 正在分析獎勵…</div>}
    </div>
    <div className="frame-foot">
      <div className="frame-hint"><span className="keycap">CTRL</span><span className="plus">+</span><span className="keycap">V</span><span>貼上新截圖立即重新辨識</span></div>
      <div className="frame-actions">
        {imageURL && <button type="button" onClick={()=>setAnchors(anchors?null:{})} className="ghost-btn" title="通常不需使用，僅在特殊版型時校正"><Crosshair size={15}/>{anchors?'取消校正':'進階校正'}</button>}
        {calibration && <button type="button" className="ghost-btn" onClick={forgetCalibration}>還原標準四格定位</button>}
        {imageURL && <button type="button" onClick={rescan} className="ghost-btn"><Repeat2 size={15}/> 重試本張</button>}
        <button type="button" onClick={()=>fileInput.current?.click()} className="ghost-btn"><Upload size={15}/> 選擇圖片</button>
      </div>
    </div>
    <input className="visually-hidden" ref={fileInput} type="file" accept="image/*" onChange={e=>{
      const file=getFile(e.target.files);if(file)runScan(file);e.target.value='';
    }}/>
  </section>;
}
