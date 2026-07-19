# zh-thai-translation

中泰翻譯工具（工廠版 PWA）。單畫面雙按鈕對話：按住「說中文」或「พูดไทย」即翻譯＋朗讀。

## 狀態

🔄 2026-07-19 採用率改版完成（branch `feature-adoption-revamp`），待：

1. 部署 GAS v2 + 設 GitHub var `VITE_BACKEND_URL`（SOP 見 README）
2. 泰籍同仁核對 `src/data.js` 術語/句庫
3. merge 到 main → 推廣

## Stack

Vanilla JS + Vite PWA（**不是 Vue**，舊筆記有誤）+ Google Apps Script 後端
（translate proxy + 共用額度 + 伺服器快取 + Sheets 使用紀錄，單一部署）。

## 核心設計

- Know-how 護城河都在 `src/data.js`：81 條壓鑄術語 + 69 句預譯常用句（0 API、離線可用）。
  泰文存男性語尾，`toFemaleThai()` 轉女性；prompt 只注入輸入命中的術語。
- 翻譯路徑：本地 LRU 快取 → GAS proxy（key 在 Script Properties）→ fallback 直連。
- 回饋閉環：翻譯泡泡 👍👎 → Sheet `feedback-*` 列 → 修 data.js。
- `node test/check.mjs` = 資料完整性自檢，改 data.js 後必跑。

## 受保護的 Branch

main
