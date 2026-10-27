import { useEffect, useMemo, useState } from 'react';
import { Activity, ScanEye, ShieldCheck, TriangleAlert, RefreshCw, Clock3, X, Settings2 } from 'lucide-react';
import ScreenshotPanel from './components/ScreenshotPanel.jsx';
import RewardCard from './components/RewardCard.jsx';
import StatusPill from './components/StatusPill.jsx';
import { useRelicScanner } from './hooks/useRelicScanner.js';
import { recommendRewardSlot } from './utils/sets.js';

const statusText={
 ready:'待命 · 貼上圖片即可辨識',scanning:'正在辨識四個獎勵',pricing:'正在取得 Market 白金價格',
 complete:'辨識完成','needs-review':'部分獎勵請確認',error:'辨識失敗',
};

export default function App(){
 const scanner=useRelicScanner();
 const [showDebug,setShowDebug]=useState(false);
 const [showAdvanced,setShowAdvanced]=useState(false);
 const running=scanner.status==='scanning'||scanner.status==='pricing';
 useEffect(()=>{
   const paste=event=>{
     const file=Array.from(event.clipboardData?.items||[])
       .filter(item=>item.kind==='file'&&item.type.startsWith('image/'))
       .map(item=>item.getAsFile()).find(Boolean);
     if(file){event.preventDefault();scanner.runScan(file);}
   };
   window.addEventListener('paste',paste);
   return ()=>window.removeEventListener('paste',paste);
 },[scanner.runScan]);
 const bestSlot=useMemo(()=>recommendRewardSlot(scanner.rows),[scanner.rows]);
 return <div className="site-shell v17">
   <header className="site-header">
     <div className="brand"><div className="logo-icon"><ScanEye size={20}/></div>
       <div><div className="brand-name">RELIC <span>/</span> SCANNER <small>1.8</small></div>
         <div className="brand-caption">Ctrl + V 貼圖 · 四格獎勵即時白金價格</div></div></div>
     <div className="header-right">
       <StatusPill label="OCR" status={scanner.ocrStatus}/>
       <StatusPill label="Market 索引" status={scanner.catalogStatus}/>
       <span className="privacy-note"><ShieldCheck size={15}/> 不讀取遊戲程序</span>
     </div>
   </header>
   <main className="main-layout">
     {scanner.catalogStatus==='error'&&<div className="catalog-health compact" role="alert">
       <TriangleAlert size={15}/><span>Market 索引連線失敗：{scanner.catalogError}</span>
       <button onClick={scanner.retryCatalog}><RefreshCw size={14}/> 重新連線</button>
     </div>}
     <ScreenshotPanel imageURL={scanner.imageURL} runScan={scanner.runScan} rescan={scanner.rescan}
       busy={running} calibration={scanner.calibration} applyCalibration={scanner.applyCalibration} forgetCalibration={scanner.forgetCalibration}/>
     <section className="result-section" aria-label="四個遺物獎勵價格比較">
       <div className="frame-bar yellow">
         <div className="frame-title"><Activity size={15}/> 02 / 遺物價值比較</div>
         <div className="frame-caption">左 → 右，對應遊戲中的獎勵順序</div>
       </div>
       <div className="results-body">
         <div className="results-toolbar">
           <div className={`stage ${scanner.status}`}>{running?<span className="mini-spinner"/>:<span className="live-dot"/>}
             {statusText[scanner.status]||'待命'}
             {scanner.elapsed!==null&&<span className="duration">{scanner.elapsed.toFixed(1)} 秒</span>}
           </div>
           <div className="toolbar-right">
             <span className="price-time"><Clock3 size={13}/>{scanner.priceUpdatedAt?new Date(scanner.priceUpdatedAt).toLocaleTimeString('zh-TW',{hour12:false}):'尚未查價'}</span>
             <button className="ghost-btn small" onClick={()=>setShowAdvanced(v=>!v)}><Settings2 size={14}/> 辨識設定</button>
             <button className="ghost-btn small" onClick={()=>setShowDebug(true)}><ScanEye size={14}/> OCR 檢查</button>
             <button type="button" className="refresh-btn" onClick={scanner.refreshPrices}
                disabled={scanner.refreshing||running||!scanner.rows.some(r=>r.item?.slug)}>
               <RefreshCw size={15} className={scanner.refreshing?'spin':''}/>
               {scanner.refreshing?'查詢中':'更新 Market 價格'}
             </button>
           </div>
         </div>
         {showAdvanced&&<div className="advanced-settings">
           <label>截圖 <select value={scanner.mode} onChange={e=>scanner.changeMode(e.target.value)}>
             <option value="auto">自動判斷（建議）</option><option value="wide">完整獎勵四格</option>
             <option value="compact">完整遊戲畫面</option>{scanner.calibration&&<option value="custom">手動校正</option>}
           </select></label>
           <label>名稱上下位置 <select value={scanner.yShift} onChange={e=>scanner.changeYShift(Number(e.target.value))}>
             <option value={-6}>上移 6%</option><option value={-3}>上移 3%</option>
             <option value={0}>自動</option><option value={3}>下移 3%</option><option value={6}>下移 6%</option>
           </select></label>
           <small>採用 PP-OCRv5，模型預先載入後直接貼圖辨識。</small>
         </div>}
         {scanner.error&&<div className="error-banner"><TriangleAlert size={14}/>{scanner.error}</div>}
         {scanner.refreshNotice&&<div className="refresh-notice">{scanner.refreshNotice}</div>}
         <div className="results-grid">
           {scanner.rows.map(row=><RewardCard key={row.slot} row={row} indexRef={scanner.catalogIndex}
             isBest={bestSlot===row.slot} busy={running} onSelect={scanner.selectItem}/>)}
         </div>
         <div className="scan-footnote">最低賣價僅為目前在線掛單，並非保證成交價。僅在資料齊全時推薦。</div>
       </div>
     </section>
     {showDebug&&<div className="debug-modal-backdrop" onClick={()=>setShowDebug(false)}>
       <div className="debug-modal" onClick={e=>e.stopPropagation()} role="dialog" aria-modal="true" aria-label="OCR 裁切偵錯">
         <div className="debug-modal-header"><strong>OCR 文字與實際裁切畫面</strong>
           <button className="ghost-btn" onClick={()=>setShowDebug(false)}><X size={16}/> 關閉</button></div>
         <p>這裡展示的是送進辨識器的圖。截圖內的四個獎勵應該依序位於四行；若來源只有文字，會擷取原圖的全部高度。</p>
         {scanner.debugURL&&<img src={scanner.debugURL} alt="四列 OCR 文字實際裁切預覽"/>}
         <pre>{scanner.rawOCR||'尚未辨識'}</pre>
       </div>
     </div>}
   </main>
 </div>;
}
