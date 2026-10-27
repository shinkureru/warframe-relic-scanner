import express from 'express';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { getCatalog, getPrice, marketDiagnostics } from './market.js';
import { getRelicRewards } from './relics.js';

const app = express();
const PORT = Number(process.env.PORT || 8787);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dist = path.resolve(__dirname, '..', 'dist');

app.disable('x-powered-by');
app.get('/api/health', (_req, res) => res.json({ ok: true, service: 'relic-scanner', market: marketDiagnostics() }));
app.get('/api/diagnostics', (_req, res) => res.set('Cache-Control', 'no-store').json(marketDiagnostics()));

app.get('/api/relic-rewards', async (req,res)=>{
  try {res.set('Cache-Control','no-store').json(await getRelicRewards({force:req.query.refresh==='1'}));}
  catch(error){res.json({names:[],source:'unavailable',warning:error.message});}
});

app.get('/api/catalog', async (req, res) => {
  try {
    const result = await getCatalog({ force: req.query.refresh === '1' });
    res.set('Cache-Control', 'no-store');
    res.json(result);
  } catch (err) {
    res.status(502).json({
      error: 'Market 物品索引無法載入',
      detail: err.message,
      hint: '請先開啟 http://localhost:8787/api/health 查看後端，再看 VS Code 終端機的 [Market] 詳細錯誤。',
    });
  }
});

app.get('/api/prices', async (req, res) => {
  const raw = String(req.query.slugs || '');
  const slugs = [...new Set(raw.split(',').map((s) => s.trim()).filter(Boolean))];
  if (!slugs.length || slugs.length > 4 || slugs.some((s) => !/^[a-z0-9_-]{2,120}$/i.test(s))) {
    return res.status(400).json({ error: '請提供最多 4 個有效物品 slug' });
  }
  try {
    const { items } = await getCatalog();
    const knownSlugs = new Set(items.map((item) => item.slug));
    if (slugs.some((s) => !knownSlugs.has(s))) return res.status(400).json({ error: '包含非 Market 物品代碼' });
    const force = req.query.refresh === '1';
    const settled = await Promise.allSettled(slugs.map((slug) => getPrice(slug, { force })));
    const prices = Object.fromEntries(slugs.map((slug, i) => {
      const result = settled[i];
      return [slug, result.status === 'fulfilled' ? result.value : { error: result.reason?.message || 'Market 查詢失敗' }];
    }));
    res.set('Cache-Control', 'no-store');
    return res.json({ prices });
  } catch (err) {
    return res.status(502).json({ error: 'Market 價格查詢失敗', detail: err.message });
  }
});

app.use(express.static(dist));
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api/')) return next();
  res.sendFile(path.join(dist, 'index.html'), (err) => {
    if (err && !res.headersSent) res.status(404).send('請先執行 npm run build');
  });
});

app.listen(PORT, () => console.log(`[API] http://localhost:${PORT} · Warframe.Market v2 relay`));
