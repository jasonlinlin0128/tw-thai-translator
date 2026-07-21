# zh-thai-translation

中泰翻譯工具（工廠版 PWA）。單畫面雙按鈕對話：按住「說中文」或「พูดไทย」即翻譯＋朗讀。

## 狀態

✅ 2026-07-21 已上線 production：https://jasonlinlin0128.github.io/tw-thai-translator/

main 含 SH-CIS 換裝 ＋ 設計升級 ＋ 深色模式對比修正；GAS v2 後端已部署、
GitHub var `VITE_BACKEND_URL` 已設 → 全廠零設定走 proxy 模式。

待：

1. 泰籍同仁核對 `src/data.js` 術語/句庫（推廣前必做）
2. 到 Google AI Studio 作廢舊 Gemini key（前端 secret 已刪，但該 key 曾打包進公開網頁 = 視同外洩）
3. 推廣：手機加入主畫面、每週看 Sheet `feedback-bad` 列回頭修 data.js

## Stack

Vanilla JS + Vite PWA（**不是 Vue**，舊筆記有誤）+ Google Apps Script 後端
（translate proxy + 共用額度 + 伺服器快取 + Sheets 使用紀錄，單一部署）。

## 核心設計

- Know-how 護城河都在 `src/data.js`：81 條壓鑄術語 + 69 句預譯常用句（0 API、離線可用）。
  泰文存男性語尾，`toFemaleThai()` 轉女性；prompt 只注入輸入命中的術語。
- 翻譯路徑：本地 LRU 快取 → GAS proxy（key 在 Script Properties）。前端已無 Gemini
  key，故不再有直連 fallback（安全 > 備援，見 README 第 3 步）。
- 回饋閉環：翻譯泡泡 👍👎 → Sheet `feedback-*` 列 → 修 data.js。
- `node test/check.mjs` = 資料完整性自檢，改 data.js 後必跑。

## 受保護的 Branch

main
