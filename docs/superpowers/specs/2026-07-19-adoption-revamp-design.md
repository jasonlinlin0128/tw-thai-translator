# 中泰翻譯 採用率改版（Adoption Revamp）設計

日期：2026-07-19
狀態：已定案（自主 session：澄清問題以 codebase 證據自答，假設清單見文末）
目標：生產部台籍人員與泰籍同仁**優先選這個工具而不是 Google 翻譯**。

## 1. 問題診斷（為何現在輸給 Google 翻譯）

| #   | 現況                                                  | 後果                               |
| --- | ----------------------------------------------------- | ---------------------------------- |
| 1   | Gemini 免費 key 打包在前端，全體共用 10 RPM / 250 RPD | 撞限整天掛掉；「不可靠」是棄用主因 |
| 2   | 每句都打 API（常用句按鈕也是）                        | 延遲 2-3s、狂燒額度                |
| 3   | 角色制單向：對話要返回首頁切角色                      | 兩人對話比 Google 翻譯還麻煩       |
| 4   | 資料收集要每台手機手動貼 GAS URL                      | 推廣者負擔、數據殘缺               |
| 5   | 術語表僅 19 條通用詞，無壓鑄術語                      | 專業對話翻錯 → 信任崩盤            |

## 2. 成功標準

- 高頻溝通（常用句/重複句）**0 API、0 延遲、可離線**。
- 即時翻譯含壓鑄術語正確；zh→th 顯示回譯供確認。
- 兩人對話**單畫面**完成（雙按鈕，遞手機即可）。
- 終端使用者**零設定**：裝 PWA 即用（後端 URL 與 key 都不需輸入）。
- 回饋閉環：👍/👎 進 Google Sheet，管理者有據可修術語表。

## 3. 方案比較

- **A. 只補 prompt 術語**：最省，但修不了可靠性/工作流 → 達不到目標。
- **B.（採用）全面改版、零新基建**：GAS 升級為 translate proxy（key 移到 Script Properties）+ 集中額度 + 伺服器快取 + 自動 log；前端改單畫面對話模式 + 預譯常用句庫 + 本地快取 + 回饋。免費、沿用既有 stack（Vite + GAS）。
- **C. B + Vercel/CF proxy + 付費 tier**：更快更穩但要新帳號與費用；等試點證明價值再升級（升級路徑寫進 README）。

## 4. 架構

```
PWA (GitHub Pages)
 ├─ 常用句庫/收藏（預譯資料，離線可用，0 API）
 ├─ 本地翻譯快取（localStorage LRU 500，重複句 0ms）
 └─ 即時翻譯
     ├─ 有後端 URL（build 內建 VITE_BACKEND_URL 或手動設定）→ GAS proxy
     │    GAS: 共用日額度(LockService) → CacheService 快取 → Gemini(key 在 Script Properties)
     │         → 同筆請求順手寫入 Sheet log → 回傳 {result, quota}
     └─ 無後端 URL → 直連 Gemini（現行為，向下相容）
```

- 單一 GAS 部署同時是：翻譯 proxy、log 收集、回饋收集、共用額度計數。前端只需一個 URL。
- 遷移：現有 `google_sheet_url` localStorage key 沿用為後端 URL；GAS URL 也打進 build（GitHub Actions var `VITE_BACKEND_URL`）達成零設定。
- Proxy 模式下前端不再需要 Gemini key；採用後應轉輪替並移除 `VITE_GEMINI_API_KEY` secret（README 記載）。

## 5. 畫面（移除角色制）

1. **主畫面（對話）**：header（☰ 設定選單、狀態、👨ครับ/👩ค่ะ 切換、📋 紀錄）→ 聊天區 → 常用句橫向快捷列（來自句庫+收藏，點了即出、0 API）→ 文字輸入（依字元自動判斷 zh/th 方向）→ **雙大按鈕：按住說中文｜กดพูดไทย**（≥88px 高，戴手套可按）。
2. **常用句庫畫面**：分類 chips（⭐收藏｜安全｜品質｜機台｜排班請假｜生活｜術語）+ 雙語大字列表；點句 → 大字顯示 + TTS 播放 + 寫入對話區；術語分類可搜尋。
3. **紀錄畫面**：沿用 + 點擊任一筆重播 TTS。
4. **設定對話框**（☰）：主題、後端網址、額度重置、麥克風授權、匯出 CSV。

雙按鈕行為：按住 → 該語言 STT → 放開 → 翻譯至另一語 → 泡泡 + 自動 TTS。翻譯泡泡含：大字譯文、回譯（小字）、🔊播放、📋複製、⭐收藏、👍/👎。

性別切換只影響 th 輸出語尾（ครับ/ค่ะ），th→zh 不受影響。

## 6. Know-how 資料層（`src/data.js`）

- **GLOSSARY**：~55 組 zh↔th 壓鑄產業對照，分五群：機台製程（壓鑄機/模具/頂針/鋁湯/料管/脫模劑/換模…）、不良（毛邊/氣孔/縮孔/冷紋/缺料/黏模…）、後加工（去毛邊/噴砂/攻牙…）、品檢（良品/不良品/全檢/卡尺/公差/重工/報廢…）、班務生活安全（加班/排班/請假/宿舍/安全帽/小心燙…）。
- **matchGlossary(text, dir)**：子字串比對輸入，只把命中術語 + 核心 15 組注入 prompt（控制 token/延遲；無命中時僅核心組）。
- **PHRASES**：~70 句預譯常用句，6 分類；泰文存男性語尾，**女性語尾規則轉換**（句尾 ครับ→ค่ะ；疑問詞結尾 ไหม/หรือเปล่า/กี่โมง 等→คะ）。
- 資料是單一可編輯檔；泰籍同仁核對後直接改檔重佈署（README 記為推廣步驟）。

## 7. Prompt v2（`gemini.js`）

- 保留：口語化、性別語尾、clarify 反問格式、純 JSON 輸出。
- 新增：命中之術語對照、台灣口語慣用語處理提示、`back` 欄位（譯文回譯回來源語，供說話者確認）。
- translate 回傳：`{"type":"translate","translated":"...","back":"...","note":"..."}`（不再回 echo original，省 token）。

## 8. 快取（`src/cache.js`）

- key = `dir|gender|normalize(text)`（trim、收斂空白、去尾標點）；值含 translated/back/note/ts。
- LRU 上限 500，僅快取 translate 型結果。命中：0 API、0 額度、即時顯示（仍寫 log type=cache，fire-and-forget）。

## 9. GAS v2（`google-apps-script.js` 重寫）

- `doPost` action：
  - `translate`：日額度檢查（Script Properties `DAILY_LIMIT` 預設 250，`LockService` 防 race）→ `CacheService` 查快取（6h）→ 呼 Gemini（key 在 Script Properties `GEMINI_API_KEY`）→ appendRow log → 回 `{ok, result, quota:{used,max}}`。
  - `log` / `feedback`：僅 appendRow（前端 fire-and-forget）。
- `doGet`：健康檢查 + 今日額度。
- 前端以 `Content-Type: text/plain` 簡單請求避免 CORS preflight（GAS 標準模式）。
- Sheet 欄位不變（時間/說話方/方向/原文/譯文/類型/備註/裝置ID）；type 增加 `phrase`、`cache`、`feedback-good`、`feedback-bad`。

## 10. 錯誤處理

- Proxy 失敗（GAS 掛/超時 15s）→ 顯示簡化錯誤；若 build 內建 Gemini key 存在則自動 fallback 直連一次。
- 額度用完：server 回 `quota_exceeded` → 前端提示「今日額度已用完，常用句仍可使用」並自動打開常用句庫。
- 離線：banner + 即時翻譯停用，常用句/紀錄/收藏照常。

## 11. 測試

- `test/check.mjs`（node 直跑）：女性語尾轉換、matchGlossary 雙向、cache normalize/LRU、資料完整性（每句都有 zh+th）。
- `npm run build` 通過；瀏覽器煙霧測試：對話流程、常用句 0 API、回饋、離線。

## 12. 自主模式假設（可推翻，皆可逆）

1. 後端選 GAS 而非 Vercel：零新帳號、沿用現有 stack；延遲 +0.3~1s 由快取/句庫吸收。若嫌慢 → 方案 C。
2. 移除角色選擇畫面，改單畫面對話模式（舊版在 git history）。
3. 不動付費決策：免費額度靠快取+句庫續命；付費升級路徑寫在 README。
4. 泰文由 Claude 撰寫標準工廠用語，**上線前應由泰籍同仁核對 `src/data.js`**（已列為推廣 SOP 第一步，並有 👎 回饋兜底）。
5. 維持 gemini-2.5-flash（已知可用，不churn）。
