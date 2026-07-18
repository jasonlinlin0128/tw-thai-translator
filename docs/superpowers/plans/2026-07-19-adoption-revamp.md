# Adoption Revamp Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans（本 session 自主 inline 執行；每 task 一個 commit）。Spec：`docs/superpowers/specs/2026-07-19-adoption-revamp-design.md`

**Goal:** 讓生產部與泰籍同仁優先選用本工具（勝過 Google 翻譯）：零設定、常用句零延遲離線、壓鑄術語正確、單畫面對話。

**Architecture:** 前端 vanilla JS + Vite PWA 不變；GAS 升級為 translate proxy + 集中額度 + 快取 + log 單一端點；前端加資料層（術語/句庫）與本地 LRU 快取；UI 移除角色制改雙按鈕對話模式。

**Tech Stack:** Vite 6 / vite-plugin-pwa / Web Speech API / Gemini 2.5 Flash / Google Apps Script

## Global Constraints

- 不加任何 npm dependency（現有 devDeps 即可）。
- 不動 `vite.config.js` 的 `base: '/tw-thai-translator/'`。
- UI 文案一律雙語（繁中 + ไทย），泰文用 `--font-th`。
- 觸控目標 ≥ 44px，錄音鍵 ≥ 88px 高。
- 純 JS（無 TS）、無框架；沿用現有 module 風格與命名。
- Commit：Conventional Commits + `Co-Authored-By: Jason simhope ai agent <jasonlin@simhope.com.tw>`。

---

### Task 1: 資料層 `src/data.js` + 自檢 `test/check.mjs`

**Files:** Create `src/data.js`, `test/check.mjs`

**Produces（後續 task 依賴的介面）:**

```js
export const GLOSSARY;          // Array<{zh, th, cat, core?:true}> ~55 組，core ~15 組
export const PHRASE_CATS;       // Array<{id, zh, th, icon}> 5 類：safety|quality|machine|shift|life
export const PHRASES;           // Array<{cat, zh, th}> ~70 句（th 存男性語尾）
export function toFemaleThai(th);            // ครับ→ค่ะ；疑問（ไหม/หรือเปล่า/อะไร/ที่ไหน/เมื่อไหร่/กี่โมง/ยังไง/ใคร/เท่าไหร่+ครับ）→คะ
export function matchGlossary(text, fromLang); // 回 core + 子字串命中，cap 25，供 prompt 注入
```

- [ ] data.js（術語五群：機台製程/不良/後加工/品檢/班務生活安全；句庫 6 類）
- [ ] check.mjs：assert 資料完整（每筆 zh+th 非空、cat 合法）、toFemaleThai 陳述/疑問兩例、matchGlossary zh/th 各一例命中 + 無命中回 core
- [ ] `node test/check.mjs` 全 assert 通過
- [ ] Commit `feat: add die-casting glossary and pre-translated phrasebook data`

### Task 2: 本地快取 `src/cache.js`

**Files:** Create `src/cache.js`；Test: 併入 `test/check.mjs`（純函式，localStorage 用可注入 storage 或 node 端以 Map polyfill）

**Produces:**

```js
export function getCached(text, fromLang, gender);  // → {translated, back?, note?} | null
export function putCached(text, fromLang, gender, result);
// key = `${fromLang}|${gender}|${normalize(text)}`；normalize: trim+收斂空白+去尾標點；LRU 500
```

- [ ] 實作 + check.mjs 增測（hit/miss/normalize 等價/LRU 淘汰最舊）
- [ ] `node test/check.mjs` 通過
- [ ] Commit `feat: add local translation cache (LRU 500)`

### Task 3: API 層 v2 `src/gemini.js` + `src/logger.js`

**Files:** Modify `src/gemini.js`, `src/logger.js`

**Consumes:** data.js `matchGlossary`；cache.js
**Produces:**

```js
// gemini.js — 對外簽名不變：
analyzeAndTranslate(text, fromLang, toLang, gender)
  // → {type:'translate', translated, back?, note?, cached?:true} | {type:'clarify', ...現有 shape}
translateClarified(clarifiedText, fromLang, toLang, gender)
export function getBackendUrl();   // localStorage 'google_sheet_url' || import.meta.env.VITE_BACKEND_URL || ''
export function getServerQuota();  // {used, max} | null（proxy 回應後更新）
// logger.js
export function logEvent(type, entry);  // type: translate|clarify|phrase|cache|feedback-good|feedback-bad
```

行為：

1. 先查 cache → 命中直接回（附 cached:true）。
2. 有 backendUrl → POST text/plain `{action:'translate', text, from, to, gender, deviceId}`；回 `{ok, result, quota, cached?}`；`ok:false,error:'quota_exceeded'` → throw 帶標記訊息；其他失敗且有 BUILT_IN_KEY → fallback 直連一次。
3. 無 backendUrl → 直連（現行程式路徑，prompt 換 v2）。
4. translate 結果寫入 cache；proxy 模式 log 由 GAS 同筆完成，前端僅在 cache 命中/phrase/feedback 時 `logEvent`。
   Prompt v2：注入 matchGlossary 命中組 + `back` 欄位 + 台灣口語提示；translate JSON 不回 original。

- [ ] 實作、`npm run build` 通過（無瀏覽器可測部分靠 Task 7 煙霧測試）
- [ ] Commit `feat: backend proxy mode, glossary-aware prompt v2 with back-translation, cache integration`

### Task 4: GAS v2 `google-apps-script.js`

**Files:** Rewrite `google-apps-script.js`

**Produces（HTTP 介面）:**

```
POST(text/plain JSON):
 {action:'translate', text, from, to, gender, deviceId}
   → {ok:true, result:{type,translated,back,note}|{type:'clarify',...}, quota:{used,max}, cached:bool}
   → {ok:false, error:'quota_exceeded', quota} | {ok:false, error:msg}
 {action:'log', type, ...entry}      → {ok:true}（appendRow）
GET → {status:'ok', quota:{used,max}}
Script Properties: GEMINI_API_KEY（必填）, DAILY_LIMIT（選填，預設 250）
```

- 日額度：Properties `usage_YYYY-MM-DD` + LockService；CacheService 快取 key=MD5(`from|gender|text`) 6h；log 欄位沿用 8 欄；檔頭部署 SOP 註解（含把前端網址填進 GitHub var）。
- [ ] 重寫 + 檔頭 SOP
- [ ] Commit `feat: GAS v2 - translate proxy with shared quota, server cache, unified logging`

### Task 5: UI 改版 `index.html` + `src/style.css` + `src/ui.js` + `src/app.js`

**Files:** Modify 全部四檔；Delete role-screen 相關 HTML/CSS/JS

**Consumes:** data.js PHRASES/PHRASE_CATS/toFemaleThai；gemini.js getServerQuota；logger.js logEvent
**結構:**

- `#main-screen`：header［☰｜quota-chip｜👨/👩 chip｜📋］→ `#chat-area` → `#quick-strip`（⭐收藏 + 精選句，點擊 0 API）→ text-input-bar（泰文字元 `/[฀-๿]/` 自動判向）→ `#dual-record`：`#btn-rec-zh`「按住說中文」+ `#btn-rec-th`「กดค้างพูดไทย」（各 ≥88px、分色）。
- `#phrasebook-screen`：cat chips（⭐/safety/quality/machine/shift/life/術語）+ 列表（zh+th 大字、row tap=插入對話+播 th、小鍵 🔊中文；術語類附搜尋框）。
- `#history-screen`：沿用 + row tap 重播譯文 TTS。
- `#settings-dialog`：主題、後端網址（沿用 google_sheet_url key）、額度重置、麥克風授權、匯出 CSV。
- 翻譯泡泡：大字譯文 + 回譯小字 + ［🔊 播放｜📋 複製｜⭐ 收藏｜👍｜👎］；👍👎→logEvent+toast；⭐→favorites localStorage `{zh,th}` 陣列（上限 30，去重）。
- 額度耗盡錯誤 → toast + 自動開啟 phrasebook。
- 離線 banner 文案改「離線中：常用句仍可使用」。
- [ ] index.html 重構（移除 role-screen；保留 PWA/meta）
- [ ] style.css：dual-record、quick-strip、phrasebook、feedback/star、quota-chip；刪 role/quota-bar 舊樣式
- [ ] ui.js：泡泡 v2（back/feedback/star 參數與 callbacks）、phrasebook 渲染
- [ ] app.js：雙按鈕錄音（沿用 press-hold 邏輯 ×2）、方向推導、phrase 插入流、favorites、設定選單、history 重播
- [ ] `npm run build` 通過
- [ ] Commit `feat: single-screen conversation mode, phrasebook, feedback loop`（過大可拆兩個 commit）

### Task 6: 部署與文件

**Files:** Modify `.github/workflows/deploy.yml`；Create `README.md`；Modify `.claude/CLAUDE.md`

- [ ] deploy.yml build env 加 `VITE_BACKEND_URL: ${{ vars.VITE_BACKEND_URL }}`
- [ ] README：架構圖、GAS 部署 SOP（Script Properties/權限/取得 URL→填 GitHub var）、key 輪替提醒、泰文核對 SOP（改 data.js）、付費升級路徑、推廣話術
- [ ] .claude/CLAUDE.md 狀態改為「改版完成待推廣」
- [ ] Commit `docs: deployment SOP and rollout guide; ci: inject backend url`

### Task 7: 驗證

- [ ] `node test/check.mjs` 通過
- [ ] `npm run build` 通過
- [ ] 瀏覽器（vite preview）煙霧測試：主畫面渲染、phrase tap 0 API 出泡泡、文字輸入 th 判向、設定/紀錄/句庫導航、離線 banner
- [ ] 修掉發現的問題並 commit `fix: ...`

### Task 8: 收尾

- [ ] memory 寫入（專案狀態/決策）
- [ ] 總結回報（含未做事項與使用者待辦：部署 GAS、填 var、泰文核對、merge 決策）

## Self-Review

- Spec 覆蓋：§4→T3/T4、§5→T5、§6→T1、§7→T3、§8→T2、§9→T4、§10→T3/T5、§11→T1/T7、README/CI→T6 ✅
- 介面一致：analyzeAndTranslate 簽名沿用；getBackendUrl 沿用 `google_sheet_url` key；logEvent type 枚舉與 GAS 對齊 ✅
- 無 TBD/placeholder ✅
