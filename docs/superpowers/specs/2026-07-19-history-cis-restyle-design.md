# 翻譯紀錄雙語播放 + SH-CIS 全面換裝 設計

日期：2026-07-19｜架構師：Claude（Fable）｜實作：GPT-5.6 sol｜狀態：已核准待實作
基底 branch：`feature-adoption-revamp`（working tree 乾淨，build/自檢均綠）

## 0. 範圍

1. **翻譯紀錄畫面**：每筆紀錄可分別播放「中文」與「泰文」兩側。
2. **全 App 套用 SIMHOPE CIS**（`C:/dev/now/simhope-map/SH-CIS-for-system-dev`，tokens v2）。

**不動**：`src/gemini.js`、`src/logger.js`、`src/cache.js`、`src/quota.js`、`src/data.js` 資料內容、`google-apps-script.js`、翻譯/常用句/收藏等現有流程邏輯。`test/check.mjs` 必須維持通過。

## 1. 翻譯紀錄優化

現況（[src/app.js](../../src/app.js) `renderHistory`）：整列點擊只播 `translated` 單側。

改為：

- 每筆 entry 底部加兩顆按鈕：`[🔊 中文]` `[🔊 ไทย]`（lucide `volume-2` icon + 文字，高度 ≥44px）。
  - 中文鍵播 zh 側文字：`e.fromLang === 'zh-TW' ? e.original : e.translated`，lang `zh-TW`。
  - 泰文鍵播 th 側文字（另一側），lang `th-TH`。
  - 呼叫既有 `speak(text, lang, gender)`（gender 用當前設定）。
- 移除整列 tap 播放（避免誤觸；文字維持可選取複製）。meta 列的「點擊重播 🔊」提示文字刪除。
- 其餘（搜尋/匯出/清除/badge/時間/note）不變。

## 2. CIS 套用

### 2.1 Tokens（單一事實來源）

- 複製 `C:/dev/now/simhope-map/SH-CIS-for-system-dev/core/tokens.css` → **`src/cis-tokens.css`**，逐字保留，檔頭加註：
  `/* Vendored from simhope-map/SH-CIS-for-system-dev core/tokens.css v2 @ 2026-07-19 — 勿手改，更新請重新同步 */`
- `src/main.js` import 順序：`./cis-tokens.css` → `./style.css`。
- `src/style.css` 全面改寫為**只消費 CIS 變數**，目標 0 個硬寫 hex（app 自有變數如 `--font-th` 可保留，但顏色一律引 token）。

### 2.2 主題

- **淺色為預設**（CIS 規範），深色用 tokens.css 內建 `[data-theme="dark"]`：主題切換改為在 `<html>` 設/移除 `data-theme="dark"`（現行 `body.light` class 機制與 `body.light {...}` 覆寫區全部移除）。
- localStorage key `theme` 沿用：`'dark'` → 設 attr；其他/未設 → 淺色。設定選單按鈕文案邏輯同步反轉（預設顯示「🌙 切換深色模式」）。
- PWA/meta 同步：`index.html` `<meta name="theme-color" content="#FFFFFF">`；`vite.config.js` manifest `theme_color`/`background_color` → `#FFFFFF`。

### 2.3 字體

`index.html` Google Fonts link 改為（一條 link，CIS fonts adapter 方式 A + 本案泰文）：
`IBM+Plex+Sans:wght@400;500;600` + `IBM+Plex+Mono:wght@400;500` + `Noto+Sans+TC:wght@400;500;600;700` + `Noto+Sans+Thai:wght@400;500;600;700`。

- `--font-zh` 廢除 → 內文一律 `var(--font-sans)`（tokens 已含 Noto Sans TC fallback）。
- 泰文元素維持專用：`--font-th: 'Noto Sans Thai', var(--font-sans)`（定義於 style.css :root）。
- 額度 chip、時間戳等數字用 `var(--font-mono)` + `font-feature-settings:"tnum"`。

### 2.4 品牌區

- 複製 logo：CIS repo `logo/藍色Logo.png`、`logo/白色Logo.png` → `public/logo/`。
- Header 左側品牌：`<img>` 信鋐工業字標（高 20px，寬自動，勿變形）+「中泰翻譯」文字（--fs-h3 600）。淺色底用藍色 Logo、`data-theme="dark"` 時用白色 Logo（兩個 `<img>` 以 CSS 依主題顯示其一）。移除 🌏 emoji。
- 禁止字母色塊 logo（CIS §9）。

### 2.5 色彩對照表（style.css 改寫依據）

| 元件                 | CIS 做法                                                                                                                                                         |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 頁面底/卡片          | `--bg` / `--bg-subtle`；邊框 `--border`，**以邊框取代陰影**建立層次                                                                                              |
| Header/輸入列/快捷列 | 實色 `--bg` + `border --border`（**移除所有 backdrop-filter 玻璃效果**）                                                                                         |
| 說中文鍵             | 實色 `--brand-blue` 白字；按壓 `--brand-blue-hover`（**移除漸層**）                                                                                              |
| 說泰文鍵             | 實色 `--brand-green` + 近黑字 `--ink`（CIS 唯一亮綠大面積用法，badge-brand-fill 邏輯）                                                                           |
| 錄音中               | 兩鍵皆轉 `--status-danger` 白字；**移除 glow 光暈**，改 opacity 微脈動（ease-out）                                                                               |
| 來源泡泡             | `--bg-subtle` 底 + `--border` + `--ink`                                                                                                                          |
| 譯文泡泡             | `--brand-blue` 底白字；回譯線 `1px dashed rgba(255,255,255,.35)` 可留                                                                                            |
| Clarify 泡泡         | `--status-info-soft` 底 + `--ink` + `--border`（**移除紫色漸層**）                                                                                               |
| 常用句/分類 chips    | `--bg` + `--border`；active/按壓 `--nav-active-bg` + `--nav-active-fg`（填色圓角，**禁 side-stripe**）                                                           |
| 紀錄 badge 中文      | pill：`--brand-blue-soft` 底 + `--brand-blue` 字                                                                                                                 |
| 紀錄 badge ไทย       | pill：`--brand-green-soft` 底 + `--status-success-strong` 字                                                                                                     |
| 額度 chip            | pill：`--status-neutral-soft` + `--ink-soft`，數字 mono tnum；低量 → `--status-danger-soft` + `--status-danger-strong`                                           |
| 離線 banner          | `--status-warning-soft` 底 + `--status-warning-strong` 字（非實色紅/橘）                                                                                         |
| Toast                | 預設 `--ink` 底白字；錯誤加 `.error` → `--status-danger`。`showToast(msg, duration, isError=false)` 增參數，`handleTranslateError` 內全部帶 `true`，其他呼叫不變 |
| 設定 dialog          | `--bg` + `--radius-lg` + `--shadow-overlay`；主/次按鈕 = CIS `.btn-primary`（--brand-blue 白字）/`.btn-secondary`（--border + --ink）                            |
| 輸入框               | `--bg` + `--border` + `--radius-md`；focus → `box-shadow: var(--focus-ring)`                                                                                     |
| 紀錄/句庫列卡片      | `--bg` + `--border` + `--radius-lg`，無陰影                                                                                                                      |

### 2.6 幾何/動效/其他

- 圓角全面對齊 CIS：按鈕/輸入 `--radius-md`、卡片/泡泡/dialog `--radius-lg`、badge/chips `--radius-pill`。現行 16px 圓角淘汰。
- Motion：transition 一律 `var(--motion-base) var(--ease)`；錄音鍵按壓 scale 保留但 ease-out；**禁 bounce/elastic**。loading dots 動畫保留但緩動改 ease-out。
- 所有可聚焦元件 `:focus-visible { box-shadow: var(--focus-ring); outline: none; }`。
- **觸控底線不受 CIS 桌機密度影響**：錄音鍵 ≥88px 高、其他按鈕 ≥44px（工廠手套場景，此為本案硬規格）。
- Chrome icon 換 lucide 靜態 SVG（stroke-width 1.8, viewBox 24）：menu、history、arrow-left、download、trash-2、send、volume-2、x。**內容性 emoji 保留**（分類 icon、⭐、👍👎、📖、🎤 錄音鍵圖示）。
- 移除項總表：漸層（rec 鍵/clarify/舊 h1）、glow shadow、backdrop-filter、`body.light` 覆寫區、紫色 `--bg-clarify`、橘色 `--thai`/`--thai-glow` 自訂色（泰側改用 brand-green 系）。

## 3. 驗收清單（agy 審查 + 架構師驗收依據）

- [ ] `node test/check.mjs` 通過、`npm run build` 通過。
- [ ] 紀錄頁每筆兩顆播放鍵，各播正確側（zh→th 與 th→zh 的 entry 都要驗：中文鍵永遠唸中文字、泰文鍵永遠唸泰文字）。
- [ ] `src/style.css` 內 0 硬寫色彩 hex（grep `#[0-9a-fA-F]{3,6}` 只允許出現在註解）。
- [ ] 無漸層、無 backdrop-filter、無 glow、無 bounce 緩動、圓角 ≤8px（pill 除外）— CIS §9 全數符合。
- [ ] 淺色預設、深色切換正常（`<html data-theme="dark">`）、logo 隨主題換版。
- [ ] 觸控尺寸：rec ≥88px、按鈕 ≥44px。
- [ ] 字體四族載入且生效（Plex Sans/Mono、Noto TC/Thai）；額度 chip 數字為 mono。
- [ ] 不動清單內檔案 diff 為零（app.js/ui.js/index.html/style.css/vite.config.js/main.js 以外不得有變更；新增檔僅 `src/cis-tokens.css`、`public/logo/*.png`）。

## 4. 架構備註（給 sol）

- 現有程式風格：vanilla JS ES module、prettier 2-space/double-quote（有 formatter hook）、繁中註解。
- `renderHistory` 目前用事件委派在 `#history-list` 上聽整列 click — 改為委派判斷 `.hist-play-zh` / `.hist-play-th` 按鈕（data-idx 沿用）。
- 主題切換現於 `initSettings()` 的 `applyTheme`；改為操作 `document.documentElement` 的 `data-theme`。
- 淺色變預設 = 現存使用者未存 theme 者會從深變淺 — 已知且接受（尚未推廣，CIS 一致性優先）。
