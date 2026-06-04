/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Restaurant, HumanReviewFlag } from "./types";

export function normalizeCategory(cat: string): string {
  const mapping: { [key: string]: string } = { 
    'ญี่ปุ่น': 'อาหารญี่ปุ่น', 
    'Thai': 'อาหารไทย', 
    'BBQ': 'ปิ้งย่าง', 
    'ชาบู': 'ชาบู', 
    'Cafe': 'คาเฟ่', 
    'Italian': 'อิตาเลียน' 
  };
  for (const k in mapping) {
    if (cat.includes(k)) return mapping[k];
  }
  return cat.split(',')[0] || 'อื่นๆ';
}

export function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

export function safeNum(n: any, fallback = 0): number {
  const v = Number(n);
  return Number.isFinite(v) ? v : fallback;
}

export function round(n: number, d = 0): number {
  const p = Math.pow(10, d);
  return Math.round(n * p) / p;
}

export function formatPct(n: number): string {
  return `${clamp(Math.round(n), 0, 100)}%`;
}

// -------------------------------------------------------------
// Accuracy-First Human Review Detector (Rule-Based Dataset Verification)
// -------------------------------------------------------------
export function getHumanReviewFlags(item: Restaurant): HumanReviewFlag[] {
  const flags: HumanReviewFlag[] = [];
  const lowerCat = (item.category || "").toLowerCase();

  // 1. PERFECT SCORE SKEPTICISM (Rating == 5.0 with low review counts)
  if (item.rating === 5.0 && item.reviews > 0 && item.reviews < 15) {
    flags.push({
      restaurantName: item.name,
      area: item.area,
      type: "คะแนนเต็มแต่รีวิวยังน้อย",
      severity: "high",
      flagCode: "FLG-BIAS-01",
      metric: `Rating: ${item.rating}⭐, Reviews: ${item.reviews}`,
      reason: `ร้านได้ 5.0 ดาว แต่มีรีวิวเพียง ${item.reviews} ครั้ง คะแนนจึงยังอาจแกว่งง่ายและควรดูรีวิวจริงประกอบ`,
      action: "ตรวจรีวิวล่าสุดและรูปจาก Google Maps ก่อนใช้ร้านนี้เป็นตัวเลือกแนะนำอันดับต้นๆ"
    });
  }

  // 2. ULTRA-HIGH INITIAL RATING BIAS (Rating >= 4.7 with under 50 reviews)
  if (item.rating >= 4.7 && item.reviews < 50 && item.reviews > 0 && !(item.rating === 5.0 && item.reviews < 15)) {
    flags.push({
      restaurantName: item.name,
      area: item.area,
      type: "คะแนนสูงมากแต่ฐานรีวิวยังบาง",
      severity: "high",
      flagCode: "FLG-BIAS-02",
      metric: `Rating: ${item.rating}⭐, Reviews: ${item.reviews}`,
      reason: `คะแนน ${item.rating} ดาวถือว่าสูง แต่ยังมีรีวิวเพียง ${item.reviews} ครั้ง ทำให้ความมั่นใจของข้อมูลยังไม่แข็งแรง`,
      action: "แสดงเป็นร้านน่าลองได้ แต่ควรติดป้ายว่าข้อมูลรีวิวยังน้อย"
    });
  }

  // 3. MID-LEVEL SAMPLING SEGMENT ALERT (Rating >= 4.5 and Reviews under 120)
  if (item.rating >= 4.5 && item.reviews >= 50 && item.reviews < 120) {
    flags.push({
      restaurantName: item.name,
      area: item.area,
      type: "คะแนนดีแต่รีวิวยังไม่มาก",
      severity: "medium",
      flagCode: "FLG-BIAS-03",
      metric: `Rating: ${item.rating}⭐, Reviews: ${item.reviews}`,
      reason: `ร้านได้คะแนน ${item.rating} ดาวจากรีวิว ${item.reviews} ครั้ง ถือว่าน่าสนใจ แต่ยังควรติดตามรีวิวเพิ่มอีกสักระยะ`,
      action: "คงไว้ในรายการแนะนำได้ แต่ควรให้ผู้ใช้เห็นจำนวนรีวิวชัดเจน"
    });
  }

  // 4. CRITICAL MINOR REVIEW DEFICIENCY
  if (item.reviews > 0 && item.reviews < 30) {
    flags.push({
      restaurantName: item.name,
      area: item.area,
      type: "รีวิวน้อยมาก",
      severity: "high",
      flagCode: "FLG-STAT-01",
      metric: `Reviews: ${item.reviews}`,
      reason: `ร้านมีรีวิวเพียง ${item.reviews} ครั้ง ข้อมูลอาจยังไม่สะท้อนประสบการณ์จริงของลูกค้าส่วนใหญ่`,
      action: "ติดป้ายเตือนว่ารีวิวยังน้อย และแนะนำให้ผู้ใช้ตรวจรูป/คอมเมนต์ล่าสุดก่อนตัดสินใจ"
    });
  }

  // 5. ABSOLUTE ZERO REVIEW BASIS
  if (item.reviews === 0) {
    flags.push({
      restaurantName: item.name,
      area: item.area,
      type: "ยังไม่มีรีวิว",
      severity: "high",
      flagCode: "FLG-STAT-02",
      metric: `Reviews: 0`,
      reason: "ยังไม่พบรีวิวจาก Google Maps จึงยืนยันคุณภาพและสถานะร้านได้ยาก",
      action: "ตรวจว่าร้านเปิดจริงหรือไม่ และเพิ่มลิงก์ยืนยันจาก Google Maps หรือช่องทางร้าน"
    });
  }

  // 6. TOTAL SCALE MINORITY ALERT IN POPULAR DATASETS 
  if (item.reviews > 3000 && item.rating < 4.0) {
    flags.push({
      restaurantName: item.name,
      area: item.area,
      type: "รีวิวเยอะ แต่คะแนนต่ำ",
      severity: "medium",
      flagCode: "FLG-STAT-03",
      metric: `Rating: ${item.rating}⭐, Reviews: ${item.reviews}`,
      reason: `มีรีวิวมากถึง ${item.reviews} ครั้ง แต่คะแนนต่ำกว่า 4.0 อาจสะท้อนปัญหาที่เกิดซ้ำ เช่น รสชาติ บริการ หรือราคา`,
      action: "อ่านรีวิวคะแนนต่ำเพื่อดูประเด็นซ้ำก่อนนำไปแนะนำ"
    });
  }

  // 7. SUBSTANDARD QUALITY ALERTS
  if (item.rating > 0 && item.rating < 3.7) {
    flags.push({
      restaurantName: item.name,
      area: item.area,
      type: "คะแนนต่ำกว่ามาตรฐาน",
      severity: "high",
      flagCode: "FLG-QUAL-01",
      metric: `Rating: ${item.rating}⭐`,
      reason: `คะแนนเฉลี่ย ${item.rating} ดาวค่อนข้างต่ำเมื่อเทียบกับร้านทั่วไป อาจมีประเด็นเรื่องคุณภาพ บริการ หรือความคุ้มค่า`,
      action: "ไม่ควรดันเป็นร้านแนะนำหลักจนกว่าจะตรวจรีวิวล่าสุดเพิ่มเติม"
    });
  } else if (item.rating >= 3.7 && item.rating <= 3.9) {
    flags.push({
      restaurantName: item.name,
      area: item.area,
      type: "คะแนนค่อนข้างต่ำ",
      severity: "medium",
      flagCode: "FLG-QUAL-03",
      metric: `Rating: ${item.rating}⭐`,
      reason: `คะแนน ${item.rating} ดาวอยู่ในช่วงที่ควรอ่านรีวิวประกอบ เพราะประสบการณ์ลูกค้าอาจไม่สม่ำเสมอ`,
      action: "แนะนำให้ผู้ใช้เปิดดูรีวิวล่าสุดก่อนจองหรือเดินทาง"
    });
  }

  // 8. POLARIZED SENTIMENT ALERTS
  if (item.rating >= 4.0 && item.rating <= 4.2 && item.reviews >= 500) {
    flags.push({
      restaurantName: item.name,
      area: item.area,
      type: "รีวิวเยอะและความคิดเห็นค่อนข้างผสม",
      severity: "medium",
      flagCode: "FLG-QUAL-02",
      metric: `Rating: ${item.rating}⭐, Reviews: ${item.reviews}`,
      reason: `มีรีวิว ${item.reviews} ครั้ง แต่คะแนนอยู่ช่วงกลาง อาจหมายถึงบางคนชอบมากและบางคนไม่ประทับใจ`,
      action: "สรุปประเด็นรีวิวบวก/ลบให้ชัด เพื่อช่วยผู้ใช้ตัดสินใจตามความชอบของตัวเอง"
    });
  }

  // 9. OVERPRICED STREET FOOD MUTATION CHECK
  if ((lowerCat.includes("ไทย") || lowerCat.includes("ก๋วยเตี๋ยว") || lowerCat.includes("ตามสั่ง") || lowerCat.includes("ส้มตำ")) && item.price >= 350) {
    flags.push({
      restaurantName: item.name,
      area: item.area,
      type: "ราคาสูงกว่าปกติสำหรับหมวดนี้",
      severity: "medium",
      flagCode: "FLG-COST-03",
      metric: `Price: ${item.price}฿/คน, Cat: ${item.category}`,
      reason: `ร้านหมวดอาหารไทย/ก๋วยเตี๋ยว/ตามสั่งมีราคาเฉลี่ยประมาณ ${item.price}฿ ต่อคน ซึ่งสูงกว่าที่ผู้ใช้มักคาดหวัง`,
      action: "ตรวจว่าเป็นร้านพรีเมียมจริงหรือข้อมูลราคาในชีตสูงเกินไป"
    });
  }

  // 10. UNDERPRICED HEAVY BUFFETS (High-risk safety anomaly check)
  if ((lowerCat.includes("ชาบู") || lowerCat.includes("ปิ้งย่าง") || lowerCat.includes("บุฟเฟต์") || lowerCat.includes("shabu") || lowerCat.includes("bbq")) && item.price > 0 && item.price < 250) {
    flags.push({
      restaurantName: item.name,
      area: item.area,
      type: "บุฟเฟต์ราคาต่ำผิดปกติ",
      severity: "medium",
      flagCode: "FLG-COST-04",
      metric: `Price: ${item.price}฿/คน, Cat: ${item.category}`,
      reason: `ร้านชาบู/ปิ้งย่างมีราคาต่ำกว่า 250฿ ต่อคน ซึ่งอาจเป็นโปรโมชัน ข้อมูลเก่า หรือข้อมูลราคาที่ไม่ครบ`,
      action: "ตรวจเมนูและเงื่อนไขราคาจริงก่อนแสดงเป็นดีลคุ้มค่า"
    });
  }

  // 11. PRICE VALUE COMPLETE LOSS
  if (item.price <= 0) {
    flags.push({
      restaurantName: item.name,
      area: item.area,
      type: "ไม่มีข้อมูลราคา",
      severity: "high",
      flagCode: "FLG-COST-05",
      metric: `Price: 0`,
      reason: "ไม่พบตัวเลขราคาต่อคน ทำให้ตัวกรองงบประมาณและคะแนนความคุ้มค่าแม่นยำน้อยลง",
      action: "เติมราคาคร่าวๆ หรือช่วงราคาจากเมนู/รีวิวลงใน Google Sheet"
    });
  }

  // 12. HIGH END ESTIMATED PRICE VULNERABILITY
  if (item.isEstimatedPrice) {
    const isHighEndCategory = lowerCat.includes("ญี่ปุ่น") || lowerCat.includes("shabu") || lowerCat.includes("ชาบู") || lowerCat.includes("ปิ้งย่าง") || lowerCat.includes("bbq") || lowerCat.includes("อิตาเลียน") || lowerCat.includes("steak") || lowerCat.includes("สเต็ก") || item.price >= 600;
    
    if (isHighEndCategory) {
      flags.push({
        restaurantName: item.name,
        area: item.area,
        type: "ราคาโดยประมาณในหมวดพรีเมียม",
        severity: "medium",
        flagCode: "FLG-COST-01",
        metric: `Estimated: ~${item.price}฿, Cat: ${item.category}`,
        reason: `ราคา ~${item.price}฿ เป็นค่าประมาณสำหรับหมวด ${item.category} ซึ่งมักมีหลายเซ็ตและอาจมีค่าบริการเพิ่ม`,
        action: "ติดป้ายว่าเป็นราคาประมาณ และแนะนำให้ตรวจเมนูจริงก่อนจอง"
      });
    } else {
      flags.push({
        restaurantName: item.name,
        area: item.area,
        type: "ราคาเป็นค่าประมาณ",
        severity: "low",
        flagCode: "FLG-COST-02",
        metric: `Estimated: ~${item.price}฿`,
        reason: `ราคา ~${item.price}฿ เป็นการประมาณจากข้อมูลใกล้เคียง เพราะยังไม่มีราคาจริงในชีต`,
        action: "เมื่อเจอเมนูหรือบิลจริง ให้เติมราคาลง Google Sheet เพื่อแทนค่าประมาณ"
      });
    }
  }

  // 13. MISSING GEOCENTRIC AREA TAG
  if (!item.area || item.area === "ไม่ระบุ") {
    flags.push({
      restaurantName: item.name,
      area: "ไม่ระบุ",
      type: "ยังไม่ระบุย่าน",
      severity: "medium",
      flagCode: "FLG-GEOM-01",
      metric: `Area: ไม่ระบุ`,
      reason: "ร้านยังไม่มีย่านหลัก ทำให้ตัวกรองตามทำเลและสรุปภาพรวมย่านทำงานได้ไม่เต็มที่",
      action: "ดูที่อยู่ร้านแล้วเติมย่านหลัก เช่น สยาม อารีย์ ทองหล่อ อโศก หรือพร้อมพงษ์"
    });
  }

  // 14. INVALID / MISSING NAVIGATIONAL MAP LINK
  if (!item.map || item.map === "#" || item.map === "") {
    flags.push({
      restaurantName: item.name,
      area: item.area,
      type: "ไม่มีลิงก์ Google Maps",
      severity: "medium",
      flagCode: "FLG-LINK-02",
      metric: `Maps URL: ไม่มี`,
      reason: "ไม่มีลิงก์แผนที่ ทำให้ผู้ใช้เปิดนำทางหรือตรวจรูปสถานที่ล่าสุดไม่ได้",
      action: "เติมลิงก์ Google Maps ที่ถูกต้องลงในชีต"
    });
  } else if (!item.map.includes("google.com/maps") && !item.map.includes("maps.google") && !item.map.includes("goo.gl") && !item.map.includes("maps.app.goo.gl")) {
    flags.push({
      restaurantName: item.name,
      area: item.area,
      type: "ลิงก์แผนที่ไม่ใช่ Google Maps",
      severity: "medium",
      flagCode: "FLG-GEOM-03",
      metric: `Maps URL: ${item.map.slice(0, 30)}...`,
      reason: "ลิงก์ที่ใส่มาไม่ใช่รูปแบบ Google Maps โดยตรง อาจทำให้ปุ่มแผนที่พาผู้ใช้ไปผิดหน้า",
      action: "เปลี่ยนเป็นลิงก์ Google Maps หรือ maps.app.goo.gl ของร้านนั้น"
    });
  }

  // 15. CONTACT METADATA LOSS
  if (!item.source || item.source === "#" || item.source === "") {
    flags.push({
      restaurantName: item.name,
      area: item.area,
      type: "ไม่มีช่องทางติดต่อร้าน",
      severity: "low",
      flagCode: "FLG-LINK-01",
      metric: `Website: ไม่มี`,
      reason: "ยังไม่มีลิงก์เว็บไซต์ เพจ หรือช่องทางติดต่อ ทำให้ผู้ใช้จองโต๊ะหรือดูเมนูก่อนไปได้ยาก",
      action: "ค้นหาเพจหรือเว็บไซต์ทางการของร้าน แล้วเติมลิงก์ลงในชีต"
    });
  }

  // 16. GENERIC STOCK VISUAL TAG ALERT
  if (!item.image || item.image === "" || item.image.includes("picsum.photos")) {
    flags.push({
      restaurantName: item.name,
      area: item.area,
      type: "ยังใช้ภาพตัวอย่าง",
      severity: "low",
      flagCode: "FLG-INFO-04",
      metric: `Stock Image placeholder`,
      reason: "ยังไม่มีรูปจริงของร้านหรือเมนู จึงใช้ภาพตัวอย่างแทน",
      action: "เพิ่มรูปจริงจากร้านหรือ Google Maps เพื่อให้ผู้ใช้ตัดสินใจได้ดีขึ้น"
    });
  }

  return flags;
}

export function computeConfidence(item: Restaurant) {
  const reviews = safeNum(item.reviews, 0);
  const rating = safeNum(item.rating, 0);
  const hasArea = !!(item.area && item.area !== 'ไม่ระบุ');
  const hasCategory = !!(item.category && item.category !== 'อื่นๆ');
  const hasMap = !!(item.map && item.map !== '#');
  const hasSource = !!(item.source && item.source !== '#');

  // Reviews statistical weight (0..55)
  const reviewsScore = clamp(Math.log10(reviews + 1) / Math.log10(5000 + 1), 0, 1) * 55;
  // Rating quality signal (0..20)
  const ratingScore = rating > 0 ? clamp((rating - 3.5) / (5.0 - 3.5), 0, 1) * 20 : 0;
  // Data completeness score (0..25)
  let completeness = 0;
  completeness += hasArea ? 6 : 0;
  completeness += hasCategory ? 6 : 0;
  completeness += hasMap ? 6 : 0;
  completeness += hasSource ? 4 : 0;
  completeness += item.isEstimatedPrice ? 0 : 3;

  const confidence = clamp(Math.round(reviewsScore + ratingScore + completeness), 10, 100);
  const reasons: string[] = [];
  if (reviews >= 500) reasons.push(`รีวิวสะสมสูง (${reviews} รีวิว) -> ข้อมูลค่อนข้างน่าเชื่อถือ`);
  else if (reviews >= 150) reasons.push(`รีวิวระดับกลาง (${reviews} รีวิว) -> ใช้ประกอบการตัดสินใจได้พอสมควร`);
  else reasons.push(`รีวิวยังน้อย (${reviews} รีวิว) -> คะแนนอาจแกว่งได้ ควรอ่านรีวิวจริงประกอบ`);
  if (item.isEstimatedPrice) reasons.push(`ราคาเป็นค่าประมาณ -> ความแม่นยำเรื่องงบประมาณลดลง`);
  if (!hasArea) reasons.push(`ยังไม่ระบุย่าน -> กรองตามทำเลได้ไม่แม่น`);
  if (!hasCategory) reasons.push(`ยังไม่ระบุประเภทอาหาร -> กรองตามหมวดได้ไม่แม่น`);
  if (!hasMap) reasons.push(`ขาดพิกัด Google Maps -> ยากต่อการตรวจสอบว่าปัจจุบันยังเปิดดำเนินการอยู่หรือไม่`);
  if (!hasSource) reasons.push(`ขาดช่องทางติดต่อ -> ตรวจเมนูหรือการจองล่วงหน้าได้ยาก`);

  return { confidence, reasons };
}

export function computeScenarioScore(item: Restaurant, scenario: string) {
  const rating = safeNum(item.rating, 0);
  const reviews = safeNum(item.reviews, 0);
  const price = safeNum(item.price, 0);

  const ratingNorm = clamp((rating - 3.0) / 2.0, 0, 1); // Normalize 3.0..5.0 down to 0..1 scale
  const popNorm = clamp(Math.log10(reviews + 1) / Math.log10(3000 + 1), 0, 1);
  const priceNorm = clamp((900 - price) / 900, 0, 1); // Cheaper meals -> closer to 1

  const cat = (item.category || '').toLowerCase();
  
  // Categorical keyword matching factors
  const catHints: { [key: string]: number } = {
    large: (cat.includes('ชาบู') || cat.includes('ปิ้งย่าง') || cat.includes('อาหารไทย') || cat.includes('buffet') || cat.includes('บุฟเฟต์')) ? 1 : 0,
    work: (cat.includes('คาเฟ่') || cat.includes('อิตาเลียน') || cat.includes('กาแฟ') || cat.includes('steak') || cat.includes('ของหวาน')) ? 1 : 0,
    fast: (cat.includes('ราเมง') || cat.includes('ก๋วยเตี๋ยว') || cat.includes('คาเฟ่') || cat.includes('ตามสั่ง')) ? 1 : 0,
    cheap: (cat.includes('อาหารไทย') || cat.includes('ก๋วยเตี๋ยว') || cat.includes('ตามสั่ง') || cat.includes('ส้มตำ')) ? 1 : 0,
    safe: 0
  };

  // Base weighting coefficient models depending on situational needs
  let w = { q: 0.55, pop: 0.25, price: 0.20, cat: 0.00 };
  if (scenario === 'safe') w = { q: 0.55, pop: 0.40, price: 0.05, cat: 0.00 };
  else if (scenario === 'cheap') w = { q: 0.35, pop: 0.20, price: 0.45, cat: 0.00 };
  else if (scenario === 'fast') w = { q: 0.45, pop: 0.25, price: 0.20, cat: 0.10 };
  else if (scenario === 'work') w = { q: 0.50, pop: 0.20, price: 0.20, cat: 0.10 };
  else if (scenario === 'large') w = { q: 0.45, pop: 0.25, price: 0.15, cat: 0.15 };

  const catBonus = w.cat > 0 ? (catHints[scenario] || 0) : 0;
  
  // Add estimation risk penalties when scenario demands budget exactness
  const priceReliabilityPenalty = (item.isEstimatedPrice && (scenario === 'cheap' || scenario === 'default' || scenario === 'large')) ? 0.05 : 0;

  const raw = (ratingNorm * w.q) + (popNorm * w.pop) + (priceNorm * w.price) + (catBonus * w.cat) - priceReliabilityPenalty;
  const score = clamp(Math.round(raw * 100), 10, 100);

  const parts = {
    quality: round(ratingNorm * w.q * 100, 1),
    popularity: round(popNorm * w.pop * 100, 1),
    budget: round(priceNorm * w.price * 100, 1),
    categoryFit: round(catBonus * w.cat * 100, 1),
    penalties: round(priceReliabilityPenalty * 100, 1),
  };

  return { score, parts };
}

export function computeBudgetEfficiency(item: Restaurant): number {
  const price = Math.max(1, safeNum(item.price, 1));
  const base = safeNum(item.base_score, 0);
  return round((base / price) * 100, 2);
}

export function computeOperationalRisk(item: Restaurant) {
  const reviews = safeNum(item.reviews, 0);
  const rating = safeNum(item.rating, 0);

  let risk = 0;
  // Crowd estimation risk proxy based on reviewer density
  if (reviews >= 1200) risk += 35;
  else if (reviews >= 600) risk += 25;
  else if (reviews >= 250) risk += 15;
  else risk += 8;

  // Information gap vulnerability risk scale
  if (reviews < 80) risk += 30;
  else if (reviews < 150) risk += 18;
  else if (reviews < 300) risk += 10;

  if (item.isEstimatedPrice) risk += 12;
  if (rating > 0 && rating < 4.0) risk += 10;

  risk = clamp(Math.round(risk), 0, 100);
  const level = risk >= 70 ? 'สูง' : risk >= 40 ? 'กลาง' : 'ต่ำ';
  const peakHour = reviews >= 800 ? 'สูง' : reviews >= 300 ? 'กลาง' : 'ต่ำ';
  return { risk, level, peakHour };
}

export function scenarioLabel(s: string): string {
  const map: { [key: string]: string } = {
    default: 'สมดุล',
    safe: '🛡️ รีวิวเยอะ เลือกง่าย',
    cheap: '💰 ประหยัดงบ',
    fast: '⚡ กินไว',
    work: '💼 เหมาะคุยงาน',
    large: '👥 กลุ่มใหญ่ 8-12 คน',
  };
  return map[s] || s;
}
