import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchCatalog, fetchPrices, fetchRelicRewards } from '../services/marketApi.js';
import { scanImagePaddle, warmPaddle } from '../services/paddleOCR.js';
import { findSetForItem } from '../utils/sets.js';
import { buildCatalogIndex, matchRewards } from '../utils/matching.js';
import { learnConfirmedName, recallConfirmedName } from '../utils/learnedCorrections.js';

const blankRows = () => Array.from({ length: 4 }, (_, slot) => ({
  slot, text: '', item: null, confidence: null, price: null, error: null,
}));
const limitSerialScans = { queue: Promise.resolve() };

export function useRelicScanner() {
  const [catalogStatus, setCatalogStatus] = useState('loading');
  const [catalogError, setCatalogError] = useState('');
  const [catalogWarning, setCatalogWarning] = useState('');
  const [ocrStatus, setOcrStatus] = useState('loading');
  const [relicScope, setRelicScope] = useState('loading');
  const [status, setStatus] = useState('ready');
  const [error, setError] = useState('');
  const [mode, setMode] = useState('auto');
  const [calibration, setCalibration] = useState(() => {
    try { return JSON.parse(localStorage.getItem('relic-scan-name-anchors') || 'null'); } catch { return null; }
  });
  const [layoutInfo, setLayoutInfo] = useState('');
  const [yShift, setYShift] = useState(0);
  const [imageURL, setImageURL] = useState('');
  const [rows, setRows] = useState(blankRows);
  const [elapsed, setElapsed] = useState(null);
  const [rawOCR, setRawOCR] = useState('');
  const [debugURL, setDebugURL] = useState('');
  const [priceUpdatedAt, setPriceUpdatedAt] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshNotice, setRefreshNotice] = useState('');
  const index = useRef(null);
  const marketItems = useRef([]);
  const relicNames = useRef([]);
  const catalogReady = useRef(null);
  const runId = useRef(0);
  const urlRef = useRef(null);
  const previous = useRef(null);
  const rowsRef = useRef(rows);
  const refreshLock = useRef(false);

  useEffect(() => { rowsRef.current = rows; }, [rows]);
  const loadCatalog = useCallback(async (force = false) => {
    setCatalogStatus('loading');
    setCatalogError('');
    try {
      const { items, meta } = await fetchCatalog({ force });
      marketItems.current = items;
      index.current = buildCatalogIndex(items,relicNames.current);
      setCatalogWarning(meta?.warning || '');
      setCatalogStatus(meta?.source === 'stale' ? 'stale' : 'ready');
      return index.current;
    } catch (err) {
      setCatalogStatus('error');
      setCatalogError(err.message || 'Market 連線失敗');
      throw err;
    }
  }, []);
  useEffect(() => {
    catalogReady.current = loadCatalog();
    catalogReady.current.catch(() => {});
    // Warm the reward whitelist independently: a drop-data outage must never
    // stop screenshot OCR or the Market catalogue loading.
    fetchRelicRewards().then(names => {
      relicNames.current=names;
      if(marketItems.current.length) index.current=buildCatalogIndex(marketItems.current,names);
      setRelicScope(names.length?'ready':'fallback');
    }).catch(()=>setRelicScope('fallback'));
    warmPaddle().then(() => setOcrStatus('ready')).catch(() => setOcrStatus('error'));
    return () => { if (urlRef.current) URL.revokeObjectURL(urlRef.current); };
  }, [loadCatalog]);

  const updatePrices = useCallback(async (source, scanId, force = false) => {
    // Four individual components and up to four corresponding full Prime sets.
    // Requests stay under the four-item API limit, with server-side price cache.
    const partSlugs = [...new Set(source.filter(r=>r.item?.slug && !r.item.nontradable).map(r=>r.item.slug))];
    const setSlugs = [...new Set(source.map(r=>r.setItem?.slug).filter(Boolean))];
    if (!partSlugs.length && !setSlugs.length) return {};
    const data = {};
    // Sequential batches avoid eight simultaneous requests to Market.
    for (const slugs of [partSlugs, setSlugs]) {
      if (!slugs.length) continue;
      Object.assign(data, await fetchPrices(slugs, {force}));
      if (runId.current !== scanId) return null;
      setRows(before => before.map(row => ({
        ...row,
        price: row.item?.slug && data[row.item.slug] ? data[row.item.slug] : row.price,
        setPrice: row.setItem?.slug && data[row.setItem.slug] ? data[row.setItem.slug] : row.setPrice,
        error: row.item?.slug && data[row.item.slug]?.error ? data[row.item.slug].error : row.error,
      })));
    }
    const dates=Object.values(data).map(p=>p?.checkedAt).filter(Boolean);
    if(dates.length) setPriceUpdatedAt(dates.sort().at(-1));
    return data;
  }, []);

  const runScan = useCallback(async (file, selectedMode = mode, selectedShift = yShift, selectedCalibration = calibration) => {
    if (!file?.type?.startsWith('image/')) { setError('請貼上 PNG、JPG 或其他圖片'); return; }
    const current = ++runId.current;
    const started = performance.now();
    if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    urlRef.current = URL.createObjectURL(file);
    setImageURL(urlRef.current);
    setRows(blankRows());
    setRawOCR(''); setDebugURL(''); setElapsed(null);setLayoutInfo('');
    setPriceUpdatedAt(null); setRefreshNotice(''); setError(''); setStatus('scanning');
    previous.current = file;
    const execute = async () => {
      if (runId.current !== current) return; // Skip obsolete scans awaiting the worker.
      try {
        // OCR and Market are independent: failed network calls must not discard OCR output.
        // PP-OCRv5 is now the single production engine. No silent low-quality
        // Tesseract fallback: errors should be visible and actionable.
        const ocr = await scanImagePaddle(file,selectedMode,selectedShift,selectedCalibration);
        if (runId.current !== current) return;
        setRawOCR(ocr.raw);setLayoutInfo(ocr.layoutInfo);
        setDebugURL(ocr.debugURL);
        let dict = index.current;
        if (!dict) {
          try { dict = await catalogReady.current; } catch { /* OCR result remains visible. */ }
        }
        if (runId.current !== current) return;
        if (!dict) {
          const waiting = ocr.columns.map((bands, slot) => ({
            slot, text: (Array.isArray(bands) ? bands : [bands]).filter(Boolean).join(' / '),
            item: null, confidence: null, price: null, error: '等待 Market 索引恢復',
          }));
          rowsRef.current = waiting;
          setRows(waiting);
          setStatus('needs-review');
          setError('圖片 OCR 已完成，但 Market 物品索引載入失敗。按「重新連線 Market」即可重試，不需重新貼圖。');
          setElapsed((performance.now() - started) / 1000);
          return;
        }
        const matched = matchRewards(ocr.columns, dict).map((result,slot) => {
          // Only user-confirmed, specific OCR strings are reused. Never guess
          // a weapon from a generic 'Prime 刀刃' substring.
          const learned=recallConfirmedName(ocr.columns[slot],dict);
          return learned ? {...result, match:learned} : result;
        });
        const prepared = matched.map((entry, slot) => ({
          slot, text: entry.text, ocrAlternatives: ocr.columns[slot], candidateOptions: entry.candidates || [], item: entry.match?.item ?? null,
          setItem: entry.match?.item ? findSetForItem(entry.match.item, marketItems.current) : null,
          confidence: entry.match?.score ?? null, price: null, setPrice: null,
          error: entry.match ? null : '需要手動校正名稱',
        }));
        rowsRef.current = prepared;
        setRows(prepared);
        if (!prepared.some((r) => r.item?.slug)) {
          setStatus('needs-review');
          setError('尚未辨識出可交易獎勵。可調整名稱位置、查看裁切預覽，或在下方手動搜尋。');
        } else {
          setStatus('pricing');
          await updatePrices(prepared, current);
          if (runId.current !== current) return;
          setStatus(prepared.every((r) => !!r.item) ? 'complete' : 'needs-review');
        }
        if (runId.current === current) setElapsed((performance.now() - started) / 1000);
      } catch (e) {
        if (runId.current !== current) return;
        setError(e.message || '辨識失敗');
        setStatus('error');
        setElapsed((performance.now() - started) / 1000);
      }
    };
    // One PaddleOCR model: serialize scans and skip superseded screenshots.
    limitSerialScans.queue = limitSerialScans.queue.catch(() => {}).then(execute);
  }, [mode, yShift, calibration, updatePrices]);

  const rescan = useCallback(() => {
    if (previous.current) runScan(previous.current, mode, yShift, calibration);
  }, [runScan, mode, yShift, calibration]);

  const retryCatalog = useCallback(async () => {
    const loading = loadCatalog(true);
    catalogReady.current = loading;
    try {
      await loading;
      if (previous.current) rescan();
    } catch { /* Detailed error is shown next to the retry button. */ }
  }, [loadCatalog, rescan]);

  const applyCalibration = useCallback((anchors) => {
    setCalibration(anchors);
    setMode('custom');
    setYShift(0);
    localStorage.setItem('relic-scan-name-anchors', JSON.stringify(anchors));
    if (previous.current) runScan(previous.current, 'custom', 0, anchors);
  }, [runScan]);

  const forgetCalibration = useCallback(() => {
    setCalibration(null); setMode('auto');
    localStorage.removeItem('relic-scan-name-anchors');
    if(previous.current) runScan(previous.current, 'auto', 0, null);
  }, [runScan]);

  const selectItem = useCallback(async (slot, item) => {
    const current = runId.current;
    const original = rowsRef.current[slot];
    // Remember manual confirmations only when their raw OCR included a
    // distinctive base name. OCR may return multiple alternative readings.
    for(const raw of original.ocrAlternatives || [original.text]) learnConfirmedName(raw,item?.slug);
    const result = { ...original, item, setItem: findSetForItem(item, marketItems.current), confidence: 1, price: null, setPrice: null, error: null };
    rowsRef.current = rowsRef.current.map((r) => r.slot === slot ? result : r);
    setRows((before) => before.map((r) => r.slot === slot ? result : r));
    try { await updatePrices([result], current); }
    catch (e) { if (runId.current === current) setError(e.message); }
  }, [updatePrices]);

  const refreshPrices = useCallback(async () => {
    if (refreshLock.current) return;
    const current = runId.current;
    const chosen = rowsRef.current;
    if (!chosen.some((r) => r.item?.slug)) {
      setRefreshNotice('請先貼上截圖或手動選擇物品，才能刷新價格。');
      return;
    }
    refreshLock.current = true;
    setRefreshing(true); setRefreshNotice('正在向 Market 強制更新已辨識的掛單…');
    try {
      const result = await updatePrices(chosen, current, true);
      if (result && current === runId.current) {
        const count = Object.values(result).filter((price) => !price.error).length;
        setRefreshNotice(`已重新查詢 ${count} 筆線上掛單價格，未重新執行 OCR。`);
      }
    } catch (e) { if (current === runId.current) setRefreshNotice(`更新失敗：${e.message}`); }
    finally { refreshLock.current = false; setRefreshing(false); }
  }, [updatePrices]);


  const changeMode = useCallback((next) => {
    setMode(next);
    if (previous.current) runScan(previous.current, next, yShift, calibration);
  }, [runScan, yShift, calibration]);
  const changeYShift = useCallback((next) => {
    setYShift(next);
    if (previous.current) runScan(previous.current, mode, next, calibration);
  }, [runScan, mode, calibration]);

  return { catalogStatus, catalogError, catalogWarning, retryCatalog, relicScope, ocrStatus, status, error, mode, changeMode, yShift, changeYShift, calibration, applyCalibration, forgetCalibration, layoutInfo,
    rows, imageURL, elapsed, rawOCR, debugURL, catalogIndex: index,
    priceUpdatedAt, refreshing, refreshNotice, refreshPrices,
    runScan, rescan, selectItem };
}
