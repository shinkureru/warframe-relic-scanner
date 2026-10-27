import { useEffect, useMemo, useState } from 'react';
import { ExternalLink, Search, Check, AlertCircle } from 'lucide-react';
import { findCandidates } from '../utils/matching.js';

export default function RewardCard({ row, indexRef, onSelect, isBest, busy }) {
  const [query, setQuery] = useState('');
  const [focused, setFocused] = useState(false);
  useEffect(() => { setQuery(''); }, [row.item?.slug, row.text]);
  const suggestions = useMemo(() => {
    if (!query.trim() || !indexRef.current) return [];
    return findCandidates(indexRef.current, query, 5).map(({ item }) => item);
  }, [query, indexRef]);
  const price = row.price;
  const hasPrice = price && !price.error;
  const nontradable = Boolean(row.item?.nontradable);
  const hasData = Boolean(row.item);

  return <article className={`reward-card ${isBest ? 'is-best' : ''} ${!hasData && row.text ? 'needs-review' : ''}`}>
    <div className="reward-top">
      <span className="reward-number">{String(row.slot + 1).padStart(2, '0')}</span>
      {isBest && <span className="best-label">推薦拿取</span>}
      {!hasData && row.text && <span className="verify-label"><AlertCircle size={12}/> 待確認</span>}
    </div>
    <div className="reward-title" title={row.item?.nameZh || row.item?.nameEn || row.text || ''}>
      {row.item?.nameZh || row.item?.nameEn || (row.text ? '辨識待確認' : '尚無物品')}
    </div>
    <div className="reward-subtitle">{row.item?.nameEn || (row.text ? `OCR：${row.text.slice(0, 42)}` : '等待貼上獎勵截圖')}</div>
    {nontradable && <div className="nontradable-note">此獎勵無法於 Warframe.Market 交易</div>}
    <div className="set-price-row">
      <span>Prime 整套最低賣價</span>
      <span className="set-price-value">{row.setItem
        ? (typeof row.setPrice?.lowestSell === 'number' && !row.setPrice.stale
            ? <><strong>{row.setPrice.lowestSell}</strong> pt</>
            : <small>{row.setPrice?.error?'暫無報價':'查詢中／無掛單'}</small>)
        : <small>不適用</small>}</span>
    </div>
    <div className="prices">
      <div className="price-block primary">
        <span className="price-heading">最低在線賣價</span>
        <div className="price-line"><strong>{hasPrice ? price.lowestSell ?? '—' : '—'}</strong><span>pt</span></div>
      </div>
      <div className="price-block secondary">
        <span className="price-heading">最高在線買價</span>
        <div className="price-line"><strong>{hasPrice ? price.highestBuy ?? '—' : '—'}</strong><span>pt</span></div>
      </div>
    </div>
    <div className="reward-meta">
      <span>杜卡德 <strong>{row.item?.ducats ?? '—'}</strong></span>
      <span>{nontradable ? '不可交易' : hasPrice ? (price.stale ? '舊價格（目前無法連線）' : price.cached ? '短期快取' : '在線掛單') : busy && hasData ? '查詢中' : row.error ? '需要確認' : '—'}</span>
    </div>
    {!hasData && row.candidateOptions?.length > 0 && <div className="ocr-candidates">
      <div className="ocr-candidates-header">可能是以下遺物獎勵 · 點一下確認查價</div>
      {row.candidateOptions.slice(0,3).map(({item,score}) => <button
        className="ocr-candidate" type="button" key={item.slug} onClick={()=>onSelect(row.slot,item)}>
        <span>{item.nameZh||item.nameEn}</span><small>{Math.round(score*100)}%</small>
      </button>)}
    </div>}
    <div className="reward-search-wrap">
      <div className="reward-search-field"><Search size={13} />
        <input aria-label={`第 ${row.slot + 1} 項獎勵名稱校正`} value={query}
          onChange={(e) => { setQuery(e.target.value); setFocused(true); }}
          onFocus={() => setFocused(true)}
          onBlur={() => setTimeout(() => setFocused(false), 160)}
          placeholder="辨識不準？搜尋物品名稱" />
      </div>
      {focused && suggestions.length > 0 && <div className="suggest-list">
        {suggestions.map((item) => <button key={item.slug} type="button" onMouseDown={(e) => e.preventDefault()}
          onClick={() => { onSelect(row.slot, item); setQuery(''); setFocused(false); }}>
          <span>{item.nameZh || item.nameEn}</span>
          <small>{item.nameEn}</small>
        </button>)}
      </div>}
    </div>
    <div className="reward-bottom">
      <span className="confidence">{row.confidence != null ? `辨識相似度 ${Math.round(row.confidence * 100)}%` : '等待辨識'}</span>
      {hasData && row.item.slug && <a href={`https://warframe.market/items/${encodeURIComponent(row.item.slug)}`} target="_blank" rel="noreferrer" title="查看 Warframe.Market 掛單"><ExternalLink size={14}/></a>}
    </div>
  </article>;
}
