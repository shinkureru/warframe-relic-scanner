# RELIC / SCANNER v1.8 — Warframe 遺物即時白金價格

使用 React、Vite、PaddleOCR PP-OCRv5 及 Warframe.Market v2 API 的個人輔助網頁。按 `Ctrl + V` 貼上遺物獎勵畫面，顯示左至右四格零件的買賣價，並同時顯示相對應 Prime 整套的最低在線賣價。

**重要：** OCR 只在瀏覽器處理圖片，不讀 Warframe 程序／記憶體／EE.log，也不把截圖上傳給 Market 代理。最低賣價為在線賣家掛單，並非已成交價格或保證能賣出的價格。

## 主要功能

- 唯一辨識引擎：PaddleOCR PP-OCRv5；網頁一啟動便預熱模型。首次模型下載可能較慢，遊戲前請先打開網站。
- 支援完整四獎勵畫面，及只含四個名稱的橫條截圖。仍可進階手動校正特殊版型。
- 四張卡依照遊戲從左到右排序；大字顯示該部件的**最低在線賣價**，右側顯示買家的最高買單；另有 Prime 完整套裝最低賣價。
- 四格資料都已知時，將「最低在線賣價最高」的可交易獎勵標成綠框，顯示輕微擺動的「推薦拿取」氣泡。辨識不完整或報價不可用時不猜測。
- 更新 Market 價格：略過短期快取，刷新目前單件與整套價格，不重新跑 OCR。
- 繁中使用 Noto Sans TC；英文字使用 Inter（Google Fonts）。
- 不需要任何 Warframe 帳號或 Market 登入。

## 專案資料夾

```text
warframe-relic-scanner-v1.8/
├── .github/workflows/deploy.yml    # GitHub Pages 自動部署
├── src/
│   ├── App.jsx
│   ├── components/                  # 圖片區、價格卡片、狀態
│   ├── hooks/useRelicScanner.js     # 貼圖 / OCR / 價格狀態
│   ├── services/paddleOCR.js        # PP-OCRv5
│   ├── services/marketApi.js        # API 連線
│   ├── utils/sets.js               # 找 Prime 套裝 + 安全推薦
│   ├── utils/matching.js           # 名稱比對
│   └── styles/main.scss
├── server/                          # 本機開發使用的 Express API
├── worker/
│   ├── src/index.js                # GitHub Pages 正式站的 Cloudflare API
│   └── wrangler.jsonc
├── tests/
├── package.json
└── vite.config.js
```

## 一、本機執行

需求：Node.js 20 以上，建議 Node.js 22。

```bash
npm install
npm run dev
```

開啟 `http://localhost:5173`，本機前端透過 Vite proxy 向 `http://localhost:8787` Express 查價。第一次請等到 OCR 與 Market 物品索引都顯示已就緒，再開始正式選獎勵。

> 如果有建立 `.env.local` 並設定了 `VITE_MARKET_API_URL`，本機前端也會轉向該遠端 Worker；要使用本機 Express 請不要設定此變數。

## 二、GitHub Pages 部署（需額外 Cloudflare Worker）

GitHub Pages 是靜態網站服務，**不能執行 Express 後端**；正式部署時以 Cloudflare Worker 提供 Market API 代理。

### A. 先把 Worker 部署到 Cloudflare

1. 建立或登入 Cloudflare 帳號，啟用 Workers。
2. 編輯 `worker/wrangler.jsonc` 裡的兩個範例值：
   - `ALLOWED_ORIGIN`：改成 `https://你的GitHub帳號.github.io`（**不要**加儲存庫名稱或結尾斜線）。
   - `APP_USER_AGENT`：改成 `RelicScanner/1.8 (+https://github.com/你的帳號/你的儲存庫)`，辨識自己的整合服務。
3. 在專案根目錄的 VS Code 終端機執行：

   ```bash
   npm install
   npx wrangler login
   npm run deploy:worker
   ```

4. 第一次部署成功後，終端機會顯示類似 `https://warframe-relic-market-api.<帳號>.workers.dev` 的網址。請複製它。
5. 在瀏覽器開啟 `https://<Worker網址>/api/health` 應顯示 `ok: true`；再測試 `/api/catalog` 看物品索引是否可讀。

> 若 Market 暫時封鎖 Worker 出口 IP，服務可能回傳 502；這與 GitHub Pages 前端無關。官方限制 3 次／秒，Worker 已加入 35 秒的價格快取、12 小時的物品字典快取及每筆查詢的間隔。請勿加上密集自動輪詢。

### B. 建立 GitHub 儲存庫

例如儲存庫名稱 `warframe-relic-scanner`。將**解壓縮後專案資料夾內的所有內容**（包含隱藏的 `.github`）放在儲存庫根目錄。不要上傳 `node_modules/` 或 `dist/`。

VS Code 終端機可使用：

```bash
git init
git add .
git commit -m "Build relic scanner v1.8"
git branch -M main
git remote add origin https://github.com/你的帳號/warframe-relic-scanner.git
git push -u origin main
```

如儲存庫已存在 Git，請略過 `git init` 和 `git remote add`，直接 commit/push。

### C. 設定 GitHub Actions 的 Worker URL

GitHub 儲存庫 → **Settings → Secrets and variables → Actions → Variables → New repository variable**：

- **Name:** `VITE_MARKET_API_URL`
- **Value:** 你前面取得的完整 Cloudflare Worker HTTPS 網址，**不要**加 `/api`。

例如：`https://warframe-relic-market-api.你的帳號.workers.dev`

這個變數會在 Vite 編譯時植入前端。它不是密碼，GitHub Pages 使用者可以看到服務網址。

### D. 啟用 Pages 與 Actions

1. 儲存庫 → **Settings → Pages → Build and deployment → Source → GitHub Actions**。
2. 儲存庫 → **Actions** → 找到 `Deploy Relic Scanner to GitHub Pages`。
3. 如果沒有自動執行，點 `Run workflow`。之後 push 到 `main` 會自動部署。
4. 通常會得到 `https://你的帳號.github.io/warframe-relic-scanner/`。

`vite.config.js` 的 `base` 由工作流程自動按照 GitHub 儲存庫名稱設定，避免 JavaScript/CSS 的 404。

若修改 `VITE_MARKET_API_URL`，**記得重新執行一次 Actions 部署**，單純重新整理網站不會把新 Worker URL 寫進既有 JavaScript。

### E. 正式站測試清單

- 開啟 GitHub Pages，確認 OCR 載入成功（首次載入模型需要時間，可能依賴 CDN 可用性）。
- Ctrl+V 貼上有四個獎勵的 Warframe 圖，檢查四欄名稱與左右順序。
- 看四個零件是否有在線賣價；有 Prime 整套商品時應出現「整套最低賣價」。
- 確認四格均可判斷時，最高**最低在線賣價**那張有綠框與「推薦拿取」。
- 按「更新 Market 價格」，確認時間更新且不重新辨識圖片。
- 如 Console 顯示 CORS 錯誤，確認 Worker 的 `ALLOWED_ORIGIN` 與實際 GitHub Pages 的**來源網域**完全一致，更新 `worker/wrangler.jsonc` 後重新部署 Worker。

## 三、維護說明

- Market `/v2/items` 提供繁中名稱和 `slug`；`/v2/orders/item/{slug}/top` 查在線最優買／賣掛單。若某個獎勵在 Market 沒有整套商品，會顯示「不適用」。
- 手動更新價格會對目前四個單件和相應套裝再次查詢，最多兩批四個；採順序呼叫，避免一次把多筆請求全部打到上游。
- Cloudflare Worker 是單純公開讀取 API 代理，不儲存截圖；若未來公開服務給大量使用者，需要增加全域 API 限流（例如 Durable Objects）避免超過 Warframe.Market 政策。
- 由於這個專案使用遊戲截圖辨識與第三方掛單，所有價格僅供選獎勵參考，並不保證一定交易成功。

## 四、驗證狀態

本次在隔離測試環境完成 JS 語法檢查及 **39 項 Node.js 單元測試**（含價格推薦、套裝比對、Worker CORS、模擬 Market 報價與裁切邏輯）。**因該環境無法連上 npm Registry，尚未完成 npm 安裝後的 Vite 正式編譯、GitHub Pages 端對端部署與真實 Market API 連線測試。** 完成 Cloudflare Worker 部署後，請照上一節確認實際可用性。

官方文件：
- https://vite.dev/guide/static-deploy
- https://docs.warframe.market/docs/api/orders/
- https://docs.warframe.market/docs/rules/overview/
- https://developers.cloudflare.com/workers/wrangler/configuration/
- https://github.com/PaddlePaddle/PaddleOCR/tree/main/paddleocr-js
