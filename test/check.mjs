/**
 * 最小自檢：node test/check.mjs
 * 覆蓋：資料完整性、女性語尾轉換、術語比對、快取 normalize/LRU。
 */
import assert from "node:assert/strict";
import {
  GLOSSARY,
  PHRASES,
  PHRASE_CATS,
  toFemaleThai,
  matchGlossary,
} from "../src/data.js";
import { getCached, putCached, clearCache } from "../src/cache.js";

// ===== 資料完整性 =====
const catIds = new Set(PHRASE_CATS.map((c) => c.id));
for (const p of PHRASES) {
  assert.ok(p.zh && p.th, `句庫缺欄位: ${JSON.stringify(p)}`);
  assert.ok(catIds.has(p.cat), `未知分類 ${p.cat}: ${p.zh}`);
  assert.ok(!/ผม|ดิฉัน/.test(p.th), `泰文含第一人稱代詞（性別轉換會錯）: ${p.zh}`);
}
const glossaryCats = new Set(["machine", "defect", "post", "qc", "work", "safety"]);
for (const g of GLOSSARY) {
  assert.ok(g.zh && g.th, `術語缺欄位: ${JSON.stringify(g)}`);
  assert.ok(glossaryCats.has(g.cat), `術語未知分類: ${g.zh}`);
  assert.ok(!g.zh.includes("/") && !g.th.includes("/"), `術語不可含斜線別名: ${g.zh}`);
}
// zh 不重複（子字串比對靠唯一詞）
assert.equal(new Set(GLOSSARY.map((g) => g.zh)).size, GLOSSARY.length, "術語 zh 重複");

// ===== 女性語尾 =====
assert.equal(toFemaleThai("เข้าใจแล้วครับ"), "เข้าใจแล้วค่ะ"); // 陳述
assert.equal(toFemaleThai("พรุ่งนี้มีโอทีไหมครับ"), "พรุ่งนี้มีโอทีไหมคะ"); // 疑問
assert.equal(toFemaleThai("กินข้าวหรือยังครับ"), "กินข้าวหรือยังคะ"); // หรือยัง
assert.equal(toFemaleThai("หอพักมีปัญหาให้บอกนะครับ"), "หอพักมีปัญหาให้บอกนะคะ"); // นะ
assert.equal(toFemaleThai("ผิวมีรอยขีดข่วน หยิบเบาๆ ครับ"), "ผิวมีรอยขีดข่วน หยิบเบาๆ ค่ะ"); // 空格保留
assert.equal(toFemaleThai("หยุดเครื่อง"), "หยุดเครื่อง"); // 無語尾不動

// ===== 術語比對 =====
const zhHit = matchGlossary("這批鋁湯溫度太低，出現冷紋", "zh-TW");
assert.ok(zhHit.some((g) => g.zh === "冷紋"), "zh 命中失敗");
const thHit = matchGlossary("แม่พิมพ์มีปัญหา ต้องซ่อมแม่พิมพ์", "th-TH");
assert.ok(thHit.some((g) => g.zh === "修模"), "th 命中失敗");
const noHit = matchGlossary("你好", "zh-TW");
assert.ok(noHit.length >= 10 && noHit.every((g) => g.core), "無命中應回 core 組");
assert.ok(zhHit.length <= 30, "術語注入超過上限");

// ===== 快取 =====
clearCache();
assert.equal(getCached("測試", "zh-TW", "male"), null);
putCached("測試", "zh-TW", "male", { translated: "ทดสอบครับ", back: "測試" });
assert.equal(getCached("測試", "zh-TW", "male").translated, "ทดสอบครับ");
assert.equal(getCached("  測試。 ", "zh-TW", "male").translated, "ทดสอบครับ", "normalize 等價失敗");
assert.equal(getCached("測試", "zh-TW", "female"), null, "gender 應分開");
assert.equal(getCached("測試", "th-TH", "male"), null, "方向應分開");
// LRU：塞爆後最舊的被淘汰
clearCache();
for (let i = 0; i < 501; i++) putCached(`句子${i}`, "zh-TW", "male", { translated: `t${i}` });
assert.equal(getCached("句子0", "zh-TW", "male"), null, "LRU 未淘汰最舊");
assert.ok(getCached("句子500", "zh-TW", "male"), "LRU 誤刪最新");
clearCache();

console.log(`OK — glossary ${GLOSSARY.length} 條 / phrases ${PHRASES.length} 句，全部檢查通過`);
