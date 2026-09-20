# 中泰翻譯（工廠版）

生產部 ↔ 泰籍同仁的即時翻譯 PWA。目標很直接：**比 Google 翻譯好用**——
壓鑄術語翻得對、常用句零延遲可離線、單畫面按住就講、零設定開箱即用。

## 為什麼不用 Google 翻譯？

|                               | Google 翻譯  | 這個工具                                |
| ----------------------------- | ------------ | --------------------------------------- |
| 壓鑄術語（毛邊/縮孔/脫模劑…） | 常翻錯       | 內建 81 條術語表，翻譯時自動注入        |
| 高頻常用句                    | 每次都要打字 | 69 句預譯句庫＋收藏，點了就唸、離線可用 |
| 兩人對話                      | 切來切去     | 單畫面雙按鈕，誰講話按誰的              |
| 語意模糊（「弄一下那個」）    | 硬翻         | 反問澄清再翻                            |
| 泰語男女語尾 ครับ/ค่ะ         | 無           | 一鍵切換                                |
| 翻對了沒？                    | 不知道       | 顯示回譯 + 👍👎 回饋進 Google Sheet     |

## 架構

```
PWA（GitHub Pages, vanilla JS + Vite）
 ├─ 常用句庫/收藏/術語表（src/data.js，離線 0 API）
 ├─ 本地翻譯快取（LRU 500，重複句 0ms）
 └─ 即時翻譯
     ├─ Proxy 模式（預設）→ Google Apps Script
     │    共用每日額度 → 伺服器快取(6h) → Gemini（key 在 Script Properties）
     │    → 同筆寫入 Google Sheet 使用紀錄 → 回傳結果+剩餘額度
     └─ Direct 模式（後端未設定時）→ 前端直連 Gemini（build 內建 key）
```

## 管理者部署 SOP

### 1. 部署 Google Apps Script 後端（一次）

照 [google-apps-script.js](google-apps-script.js) 檔頭註解：開 Google Sheets → Apps Script → 貼上 → 指令碼屬性設 `GEMINI_API_KEY`（選填 `DAILY_LIMIT`）→ 部署為網頁應用程式（執行身分：我；存取：所有人）→ 複製網址。

### 2. 前端注入後端網址（一次）

GitHub repo → Settings → Secrets and variables → Actions → **Variables** → 新增
`VITE_BACKEND_URL` = 上一步的網址 → 重跑 deploy workflow。

之後所有使用者**零設定**：裝了就能用、紀錄自動收集、額度全廠共用。

### 3. 清理舊 key（採用 proxy 後）

前端不再需要 Gemini key：刪除 repo secret `VITE_GEMINI_API_KEY`，並到
Google AI Studio 作廢舊 key——Vite 會把 `VITE_*` 變數內聯進前端 bundle，
凡是這樣用過的 key 都該當成已公開，一律輪替。

### 4. 泰文核對（推廣前必做）

請泰籍同仁核對 [src/data.js](src/data.js) 的術語表與句庫（都在同一檔，直接改字串），
改完 commit 重佈署即生效。上線後靠翻譯泡泡的 👎 回饋（進 Sheet）持續修正。

## 額度與升級路徑

- 免費層 gemini-2.5-flash：10 RPM / 250 RPD（全廠共用）。句庫、收藏、
  本地快取、伺服器快取都不耗額度，250 次/天對試點通常夠用。
- 不夠時：Google AI Studio 開啟計費（pay-as-you-go，flash 極便宜），
  然後把 GAS 指令碼屬性 `DAILY_LIMIT` 調大即可，前端不用改。

## 推廣建議

1. 先請 1-2 位泰籍同仁核對句庫（上面第 4 步），順便就是第一批種子用戶。
2. 現場示範三件事：按住講話翻譯、點常用句直接唸、👎 回報翻錯。
3. 手機加入主畫面（PWA）：Chrome → 選單 → 加入主畫面。
4. 每週看一次 Google Sheet：`feedback-bad` 列 = 待修術語；高頻句子 → 加進句庫。

## 開發

```bash
npm install
npm run dev        # http://localhost:5173/tw-thai-translator/
node test/check.mjs  # 資料完整性 + 語尾轉換 + 快取自檢
npm run build
```

push 到 `main` 即自動部署 GitHub Pages（[.github/workflows/deploy.yml](.github/workflows/deploy.yml)）。
