/**
 * Know-how data layer: die-casting glossary + pre-translated phrasebook.
 *
 * 這個檔案是給人改的：泰籍同仁核對後直接修正泰文，重新部署即生效。
 * 規則：
 * - zh / th 都是單一標準寫法（不要放「/」或括號別名，術語比對靠子字串）。
 * - 泰文一律存「男性語尾」（ครับ），女性語尾由 toFemaleThai() 轉換。
 * - 泰文句子避免第一人稱代名詞（ผม/ฉัน），性別轉換只處理語尾。
 *
 * Pure data + pure functions（無 DOM 依賴，node 可直接 import 測試）。
 */

// ===== 術語表 GLOSSARY =====
// cat: machine 機台製程 | defect 不良 | post 後加工 | qc 品檢 | work 班務生活 | safety 安全
// core: true 的一定進 system prompt；其他只有輸入命中時才注入（控制 token）
export const GLOSSARY = [
  // --- 機台/製程 ---
  { zh: "壓鑄機", th: "เครื่องฉีดอลูมิเนียม", cat: "machine", core: true },
  { zh: "模具", th: "แม่พิมพ์", cat: "machine", core: true },
  { zh: "換模", th: "เปลี่ยนแม่พิมพ์", cat: "machine" },
  { zh: "修模", th: "ซ่อมแม่พิมพ์", cat: "machine" },
  { zh: "試模", th: "ลองแม่พิมพ์", cat: "machine" },
  { zh: "頂針", th: "เข็มกระทุ้ง", cat: "machine" },
  { zh: "鋁湯", th: "น้ำอลูมิเนียม", cat: "machine", core: true },
  { zh: "鋁錠", th: "อลูมิเนียมแท่ง", cat: "machine" },
  { zh: "熔解爐", th: "เตาหลอม", cat: "machine" },
  { zh: "保溫爐", th: "เตาอุ่น", cat: "machine" },
  { zh: "給湯", th: "ตักน้ำอลูมิเนียม", cat: "machine" },
  { zh: "料管", th: "ปลอกฉีด", cat: "machine" },
  { zh: "沖頭", th: "หัวลูกสูบฉีด", cat: "machine" },
  { zh: "脫模劑", th: "น้ำยาถอดแบบ", cat: "machine", core: true },
  { zh: "機械手", th: "แขนกล", cat: "machine" },
  { zh: "冷卻水", th: "น้ำหล่อเย็น", cat: "machine" },
  { zh: "模溫", th: "อุณหภูมิแม่พิมพ์", cat: "machine" },
  { zh: "週期時間", th: "ไซเคิลไทม์", cat: "machine" },
  { zh: "停機", th: "หยุดเครื่อง", cat: "machine", core: true },
  { zh: "開機", th: "เปิดเครื่อง", cat: "machine", core: true },
  { zh: "機台故障", th: "เครื่องเสีย", cat: "machine", core: true },
  { zh: "保養", th: "ซ่อมบำรุง", cat: "machine" },
  { zh: "警報", th: "สัญญาณเตือน", cat: "machine" },
  // --- 不良 ---
  { zh: "毛邊", th: "ครีบ", cat: "defect", core: true },
  { zh: "氣孔", th: "รูอากาศ", cat: "defect", core: true },
  { zh: "針孔", th: "ตามด", cat: "defect" },
  { zh: "縮孔", th: "โพรงหด", cat: "defect" },
  { zh: "冷紋", th: "ลายเย็น", cat: "defect" },
  { zh: "缺料", th: "ฉีดไม่เต็ม", cat: "defect", core: true },
  { zh: "裂痕", th: "รอยแตก", cat: "defect" },
  { zh: "變形", th: "เสียรูป", cat: "defect" },
  { zh: "黏模", th: "ติดแม่พิมพ์", cat: "defect" },
  { zh: "撞傷", th: "รอยกระแทก", cat: "defect" },
  { zh: "刮傷", th: "รอยขีดข่วน", cat: "defect" },
  { zh: "油污", th: "คราบน้ำมัน", cat: "defect" },
  // --- 後加工 ---
  { zh: "去毛邊", th: "ตัดครีบ", cat: "post", core: true },
  { zh: "研磨", th: "เจียร", cat: "post" },
  { zh: "拋光", th: "ขัดเงา", cat: "post" },
  { zh: "噴砂", th: "พ่นทราย", cat: "post" },
  { zh: "CNC加工", th: "งานกลึง CNC", cat: "post" },
  { zh: "攻牙", th: "ต๊าปเกลียว", cat: "post" },
  { zh: "鑽孔", th: "เจาะรู", cat: "post" },
  { zh: "清洗", th: "ล้างชิ้นงาน", cat: "post" },
  { zh: "烤漆", th: "พ่นสี", cat: "post" },
  // --- 品檢 ---
  { zh: "品檢", th: "ตรวจ QC", cat: "qc", core: true },
  { zh: "良品", th: "งานดี", cat: "qc", core: true },
  { zh: "不良品", th: "งานเสีย", cat: "qc", core: true },
  { zh: "全檢", th: "ตรวจร้อยเปอร์เซ็นต์", cat: "qc" },
  { zh: "抽檢", th: "สุ่มตรวจ", cat: "qc" },
  { zh: "卡尺", th: "เวอร์เนีย", cat: "qc" },
  { zh: "公差", th: "ค่าเผื่อ", cat: "qc" },
  { zh: "尺寸", th: "ขนาด", cat: "qc", core: true },
  { zh: "圖面", th: "แบบงาน", cat: "qc" },
  { zh: "重工", th: "ทำใหม่", cat: "qc" },
  { zh: "報廢", th: "คัดทิ้ง", cat: "qc" },
  // --- 班務/生活 ---
  { zh: "日班", th: "กะกลางวัน", cat: "work" },
  { zh: "夜班", th: "กะกลางคืน", cat: "work" },
  { zh: "加班", th: "ทำโอที", cat: "work", core: true },
  { zh: "交接班", th: "ส่งกะ", cat: "work" },
  { zh: "打卡", th: "ตอกบัตร", cat: "work" },
  { zh: "請假", th: "ลางาน", cat: "work", core: true },
  { zh: "病假", th: "ลาป่วย", cat: "work" },
  { zh: "事假", th: "ลากิจ", cat: "work" },
  { zh: "特休", th: "ลาพักร้อน", cat: "work" },
  { zh: "薪水", th: "เงินเดือน", cat: "work" },
  { zh: "加班費", th: "ค่าโอที", cat: "work" },
  { zh: "宿舍", th: "หอพัก", cat: "work" },
  { zh: "工作證", th: "ใบอนุญาตทำงาน", cat: "work" },
  { zh: "倉庫", th: "คลังสินค้า", cat: "work" },
  { zh: "出貨", th: "ส่งของ", cat: "work" },
  { zh: "原料", th: "วัตถุดิบ", cat: "work" },
  // --- 安全 ---
  { zh: "安全帽", th: "หมวกนิรภัย", cat: "safety" },
  { zh: "護目鏡", th: "แว่นตานิรภัย", cat: "safety" },
  { zh: "耳塞", th: "ที่อุดหู", cat: "safety" },
  { zh: "手套", th: "ถุงมือ", cat: "safety" },
  { zh: "安全鞋", th: "รองเท้าเซฟตี้", cat: "safety" },
  { zh: "小心燙", th: "ระวังร้อน", cat: "safety", core: true },
  { zh: "危險", th: "อันตราย", cat: "safety", core: true },
  { zh: "滅火器", th: "ถังดับเพลิง", cat: "safety" },
  { zh: "受傷", th: "บาดเจ็บ", cat: "safety" },
  { zh: "急救箱", th: "กล่องปฐมพยาบาล", cat: "safety" },
];

// ===== 常用句分類 =====
export const PHRASE_CATS = [
  { id: "safety", zh: "安全", th: "ความปลอดภัย", icon: "⛑️" },
  { id: "quality", zh: "品質", th: "คุณภาพ", icon: "🔍" },
  { id: "machine", zh: "機台", th: "เครื่องจักร", icon: "⚙️" },
  { id: "shift", zh: "排班加班", th: "กะ/โอที", icon: "🕐" },
  { id: "life", zh: "溝通生活", th: "ทั่วไป", icon: "💬" },
];

// ===== 常用句庫 PHRASES（預譯，0 API、可離線）=====
export const PHRASES = [
  // --- 安全 ---
  { cat: "safety", zh: "請戴安全帽", th: "กรุณาใส่หมวกนิรภัยครับ" },
  { cat: "safety", zh: "請戴手套", th: "ใส่ถุงมือด้วยครับ" },
  { cat: "safety", zh: "請戴護目鏡", th: "ใส่แว่นตานิรภัยด้วยครับ" },
  { cat: "safety", zh: "小心燙，不要碰", th: "ระวังร้อน อย่าจับครับ" },
  {
    cat: "safety",
    zh: "這裡危險，不要靠近",
    th: "ตรงนี้อันตราย อย่าเข้าใกล้ครับ",
  },
  { cat: "safety", zh: "地上有油，小心滑倒", th: "พื้นมีน้ำมัน ระวังลื่นครับ" },
  { cat: "safety", zh: "受傷了嗎？", th: "บาดเจ็บไหมครับ" },
  { cat: "safety", zh: "快去擦藥", th: "รีบไปทำแผลครับ" },
  { cat: "safety", zh: "有問題馬上停機", th: "มีปัญหาให้หยุดเครื่องทันทีครับ" },
  { cat: "safety", zh: "不要站在機器後面", th: "อย่ายืนหลังเครื่องครับ" },
  {
    cat: "safety",
    zh: "先關機再清理",
    th: "ปิดเครื่องก่อนแล้วค่อยทำความสะอาดครับ",
  },
  {
    cat: "safety",
    zh: "慢一點沒關係，安全第一",
    th: "ช้าหน่อยไม่เป็นไร ปลอดภัยไว้ก่อนครับ",
  },
  // --- 品質 ---
  {
    cat: "quality",
    zh: "這批有毛邊，要修掉",
    th: "ล็อตนี้มีครีบ ต้องตัดออกครับ",
  },
  {
    cat: "quality",
    zh: "這個有氣孔，是不良品",
    th: "ชิ้นนี้มีรูอากาศ เป็นงานเสียครับ",
  },
  {
    cat: "quality",
    zh: "尺寸不對，用卡尺量一下",
    th: "ขนาดไม่ได้ ลองวัดด้วยเวอร์เนียครับ",
  },
  { cat: "quality", zh: "這個可以，繼續做", th: "ชิ้นนี้ใช้ได้ ทำต่อเลยครับ" },
  { cat: "quality", zh: "不良品放紅箱", th: "งานเสียใส่กล่องแดงครับ" },
  { cat: "quality", zh: "良品放這邊", th: "งานดีวางฝั่งนี้ครับ" },
  { cat: "quality", zh: "每半小時抽檢一次", th: "สุ่มตรวจทุกครึ่งชั่วโมงครับ" },
  {
    cat: "quality",
    zh: "這批要全檢",
    th: "ล็อตนี้ต้องตรวจร้อยเปอร์เซ็นต์ครับ",
  },
  {
    cat: "quality",
    zh: "表面有刮傷，小心拿",
    th: "ผิวมีรอยขีดข่วน หยิบเบาๆ ครับ",
  },
  { cat: "quality", zh: "這個要重做", th: "ชิ้นนี้ต้องทำใหม่ครับ" },
  {
    cat: "quality",
    zh: "跟上一個比對看看",
    th: "ลองเทียบกับชิ้นก่อนหน้าดูครับ",
  },
  { cat: "quality", zh: "有不良品要馬上講", th: "เจองานเสียให้บอกทันทีนะครับ" },
  // --- 機台 ---
  { cat: "machine", zh: "準備開機", th: "เตรียมเปิดเครื่องครับ" },
  { cat: "machine", zh: "先停機", th: "หยุดเครื่องก่อนครับ" },
  { cat: "machine", zh: "機器怎麼了？", th: "เครื่องเป็นอะไรครับ" },
  { cat: "machine", zh: "叫技術員來看", th: "เรียกช่างมาดูครับ" },
  { cat: "machine", zh: "要換模具了", th: "จะเปลี่ยนแม่พิมพ์แล้วครับ" },
  { cat: "machine", zh: "加鋁錠", th: "เติมอลูมิเนียมแท่งครับ" },
  { cat: "machine", zh: "檢查鋁湯溫度", th: "เช็คอุณหภูมิน้ำอลูมิเนียมครับ" },
  {
    cat: "machine",
    zh: "脫模劑不夠了，去領",
    th: "น้ำยาถอดแบบใกล้หมด ไปเบิกมาครับ",
  },
  { cat: "machine", zh: "清一下模具", th: "ทำความสะอาดแม่พิมพ์หน่อยครับ" },
  {
    cat: "machine",
    zh: "這台今天要保養",
    th: "เครื่องนี้วันนี้ต้องซ่อมบำรุงครับ",
  },
  {
    cat: "machine",
    zh: "警報響了，去看一下",
    th: "สัญญาณเตือนดัง ไปดูหน่อยครับ",
  },
  { cat: "machine", zh: "今天目標八百個", th: "เป้าวันนี้แปดร้อยชิ้นครับ" },
  { cat: "machine", zh: "材料快用完了", th: "วัตถุดิบใกล้หมดครับ" },
  { cat: "machine", zh: "去倉庫領料", th: "ไปเบิกของที่คลังสินค้าครับ" },
  { cat: "machine", zh: "這箱搬去出貨區", th: "ยกกล่องนี้ไปโซนส่งของครับ" },
  // --- 排班/加班 ---
  { cat: "shift", zh: "今天要加班兩小時", th: "วันนี้โอทีสองชั่วโมงครับ" },
  { cat: "shift", zh: "明天要加班嗎？", th: "พรุ่งนี้มีโอทีไหมครับ" },
  { cat: "shift", zh: "今天不加班", th: "วันนี้ไม่มีโอทีครับ" },
  { cat: "shift", zh: "你這週上夜班", th: "อาทิตย์นี้คุณเข้ากะกลางคืนครับ" },
  { cat: "shift", zh: "交接班要講清楚", th: "ส่งกะต้องบอกให้ชัดเจนครับ" },
  {
    cat: "shift",
    zh: "先去吃飯，輪流休息",
    th: "ไปกินข้าวก่อน พักสลับกันครับ",
  },
  { cat: "shift", zh: "十分鐘後回來", th: "อีกสิบนาทีกลับมาครับ" },
  {
    cat: "shift",
    zh: "做完這批再下班",
    th: "ทำล็อตนี้เสร็จแล้วค่อยเลิกงานครับ",
  },
  { cat: "shift", zh: "請假要先填單", th: "ลางานต้องเขียนใบลาก่อนครับ" },
  { cat: "shift", zh: "發薪日是十號", th: "เงินเดือนออกวันที่สิบครับ" },
  { cat: "shift", zh: "加班費會算給你", th: "ค่าโอทีจะคิดให้ครับ" },
  { cat: "shift", zh: "今天提早下班", th: "วันนี้เลิกงานเร็วครับ" },
  { cat: "shift", zh: "週日不用上班", th: "วันอาทิตย์ไม่ต้องทำงานครับ" },
  { cat: "shift", zh: "辛苦了，做得很好", th: "เหนื่อยหน่อยนะ ทำได้ดีมากครับ" },
  // --- 溝通/生活 ---
  { cat: "life", zh: "我聽不懂", th: "ฟังไม่เข้าใจครับ" },
  { cat: "life", zh: "請再說一次", th: "พูดอีกครั้งได้ไหมครับ" },
  { cat: "life", zh: "我知道了", th: "เข้าใจแล้วครับ" },
  { cat: "life", zh: "做完了", th: "เสร็จแล้วครับ" },
  { cat: "life", zh: "有問題，請過來看", th: "มีปัญหา ช่วยมาดูหน่อยครับ" },
  { cat: "life", zh: "我想請假", th: "ขอลางานครับ" },
  { cat: "life", zh: "我不舒服，想去看醫生", th: "ไม่สบาย ขอไปหาหมอครับ" },
  { cat: "life", zh: "我可以先下班嗎？", th: "ขอเลิกงานก่อนได้ไหมครับ" },
  { cat: "life", zh: "需要幫忙嗎？", th: "ให้ช่วยไหมครับ" },
  { cat: "life", zh: "謝謝", th: "ขอบคุณครับ" },
  { cat: "life", zh: "沒問題", th: "ไม่มีปัญหาครับ" },
  { cat: "life", zh: "等一下", th: "รอสักครู่ครับ" },
  { cat: "life", zh: "吃飯了嗎？", th: "กินข้าวหรือยังครับ" },
  { cat: "life", zh: "宿舍有問題要講", th: "หอพักมีปัญหาให้บอกนะครับ" },
  { cat: "life", zh: "我先走了", th: "ขอตัวก่อนครับ" },
  { cat: "life", zh: "麻煩你了", th: "รบกวนด้วยครับ" },
];

// ===== 女性語尾轉換 =====
// 泰語規則：陳述句 ครับ→ค่ะ；疑問句或「นะ」語氣 ครับ→คะ
// ponytail: 只處理句尾 ครับ，資料層保證泰文都以男性語尾儲存
const QUESTION_TAIL =
  /(ไหม|หรือเปล่า|หรือยัง|อะไร|ที่ไหน|เมื่อไหร่|กี่โมง|ยังไง|อย่างไร|ใคร|เท่าไหร่|นะ)$/;

export function toFemaleThai(th) {
  if (!th.endsWith("ครับ")) return th;
  const stem = th.slice(0, -4); // 保留原空格（เบาๆ ครับ → เบาๆ ค่ะ）
  return stem + (QUESTION_TAIL.test(stem.trimEnd()) ? "คะ" : "ค่ะ");
}

// ===== 依輸入挑出相關術語（控制 prompt token）=====
const CORE = GLOSSARY.filter((g) => g.core);
const MAX_GLOSSARY = 30; // core + 命中總數上限

export function matchGlossary(text, fromLang) {
  const key = fromLang === "zh-TW" ? "zh" : "th";
  const hits = GLOSSARY.filter((g) => !g.core && text.includes(g[key]));
  return [...CORE, ...hits].slice(0, MAX_GLOSSARY);
}
