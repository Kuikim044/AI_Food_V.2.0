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
      type: "คะแนนไร้ที่ติบนตัวแทนสถิติแคบขั้นวิกฤต (Perfect Score with Sparse Reviews Bias)",
      severity: "high",
      flagCode: "FLG-BIAS-01",
      metric: `Rating: ${item.rating}⭐, Reviews: ${item.reviews}`,
      reason: `ระดับความน่าเชื่อถือไม่นิ่งประจักษ์: ทางร้านประคองเกรดสมบูรณ์แบบ 5.0 ดาวอย่างงดงาม ทว่าถูกค้ำยันโดยผู้โหวตขนาดมินิมอลเพียง ${item.reviews} บัญชี ซึ่งสุ่มเสี่ยงเกิดจากกลุ่มเครือญาติหรือพนักงานป้อนสแตติกเชิงบวก (Staff & Friend Positive Bias) ในสภาพการณ์จำใจ และยังไม่มีมวลชนเฉลี่ยมาช่วยพิสูจน์ถ่วงจริง`,
      action: "ดึงคะแนนของทางร้านออกจากการจัดอันดับระดับยอดลำดับต้นสูงสุดชั่วคราว หรือส่งเจ้าหน้าที่ผู้ตรวจเยี่ยมไร้ตัวตน (Mystery Shoppers) ไปวัดรสชาติเพื่อตรวจสอบดัชนีคะแนนจริง"
    });
  }

  // 2. ULTRA-HIGH INITIAL RATING BIAS (Rating >= 4.7 with under 50 reviews)
  if (item.rating >= 4.7 && item.reviews < 50 && item.reviews > 0 && !(item.rating === 5.0 && item.reviews < 15)) {
    flags.push({
      restaurantName: item.name,
      area: item.area,
      type: "ช่วงเรตติ้งลอยตัวสูงสวนทางประชากรพยาน (Suspicious Initial Rating Bias)",
      severity: "high",
      flagCode: "FLG-BIAS-02",
      metric: `Rating: ${item.rating}⭐, Reviews: ${item.reviews}`,
      reason: `แกนสถิติยังอ่อนแอกลับรันเรตสูงลอย: เรตติ้งทะยานขึ้นถึง ${item.rating} ดาว ภายใต้จำนวนกลุ่มผู้วิจารณ์สะสมต่ำเตี้ยเพียง ${item.reviews} ครั้ง ตัวแปรสถิติจึงมีสัดส่วนคลาดเคลื่อนที่คาดการณ์ได้สูง (Sampling Error Margins) ทำให้ระดับความปลอดภัยไม่นิ่งพอสำหรับกลุ่มผู้ใช้ทั่วไป`,
      action: "ทำเครื่องหมายเตือนความผันผวนของความเห็นผู้ใช้ในหน้าต่างจัดเก็บ พร้อมร่วมรณรงค์กระตุ้นให้นักชิมในแอปเข้าไปเขียนคอมเมนต์เพิ่มจำนวนประชากรวิจัย"
    });
  }

  // 3. MID-LEVEL SAMPLING SEGMENT ALERT (Rating >= 4.5 and Reviews under 120)
  if (item.rating >= 4.5 && item.reviews >= 50 && item.reviews < 120) {
    flags.push({
      restaurantName: item.name,
      area: item.area,
      type: "ความเห็นอิ่มตัวช่วงเริ่มสะสมประชากรพยาน (High Rating Sparse Sample)",
      severity: "medium",
      flagCode: "FLG-BIAS-03",
      metric: `Rating: ${item.rating}⭐, Reviews: ${item.reviews}`,
      reason: `กลุ่มข้อจำกัดช่วงเปลี่ยนรอยต่อข้อมูล: ได้รับเรตติ้งที่สง่างาม (${item.rating} ดาว) ถ่วงคะแนนด้วยพยานวิจารณ์ ${item.reviews} ราย ซึ่งเป็นตัวอย่างสถิติตอนต้น (Initial Buffer Sample) ยังยากที่จะยืนยันคุณภาพคงเส้นคงวารอบด้านเมื่อคิวเต็มพิกัด`,
      action: "คอยติดตามวิเคราะห์อัตราการเติบโตของรีวิวเฉลี่ยรายปักษ์ผ่านบอร์ดระบบวิเคราะห์ข้อมูล และตรึงป้ายเตือนช่วงงวดพ้นผ่านชั่วคราว"
    });
  }

  // 4. CRITICAL MINOR REVIEW DEFICIENCY
  if (item.reviews > 0 && item.reviews < 30) {
    flags.push({
      restaurantName: item.name,
      area: item.area,
      type: "สถิติผู้ร่วมประเมินต่ำวิกฤตปฏิเสธนัยสำคัญ (Severe Review Deficiency)",
      severity: "high",
      flagCode: "FLG-STAT-01",
      metric: `Reviews: ${item.reviews}`,
      reason: `จุดบอดทางคณิตศาสตร์สากล: ร้านค้ามียอดรีวิวรวมต่ำเพียง ${item.reviews} รีวิว เป็นค่าเฉลี่ยสุ่มที่ปราศจากความสำคัญเชิงสถิติ (Statistically Insignificant) ไม่อาจสะท้อนความสม่ำเสมอของเนื้อแท้วัตถุดิบ ความสุภาพ หรือสภาพดักแอร์ภายในร้านในทุกมิติเวลาได้`,
      action: "แนบท้ายเตือนกลุ่มผู้ทาน '🚩 ความเห็นข้างน้อยมาก' ในระนาบกล่อง UI ทุกหน้าต่าง เพื่อปะปนจุดตรวจเช็คความเสี่ยง"
    });
  }

  // 5. ABSOLUTE ZERO REVIEW BASIS
  if (item.reviews === 0) {
    flags.push({
      restaurantName: item.name,
      area: item.area,
      type: "ขาดหลักประจักษ์ฐานรีวิวอย่างสิ้นเชิง (Zero Google Review Basis)",
      severity: "high",
      flagCode: "FLG-STAT-02",
      metric: `Reviews: 0`,
      reason: `สุญญากาศแผนที่ความคิดเห็นผู้ใช้งาน: ไม่มีประวัติร่องรอยการโหวตคะแนนหรือคะแนนดิบบนคลาวด์ Google Maps เลย อาจเป็นผู้ผลิตหน้าร้านรายย่อยที่จดทะเบียนผิดพิกัด หรือเพิ่งตั้งต้นทดลองสร้างธุรกิจแบบ Soft Launch`,
      action: "ประสานงานกับโมเดอเรเตอร์เพื่อค้นหาช่องทางยืนยันที่อยู่ผ่านไลน์ หรือเช็คเฟซบุ๊กเพื่อยืนยันว่าเปิดร้านทำการจริงพิกัดนี้ก่อนอนุมัติติดป้าย"
    });
  }

  // 6. TOTAL SCALE MINORITY ALERT IN POPULAR DATASETS 
  if (item.reviews > 3000 && item.rating < 4.0) {
    flags.push({
      restaurantName: item.name,
      area: item.area,
      type: "นัยสำคัญความไม่พอใจสูงเชิงสถิติมวลรวม (Large Scale Quality Alert)",
      severity: "medium",
      flagCode: "FLG-STAT-03",
      metric: `Rating: ${item.rating}⭐, Reviews: ${item.reviews}`,
      reason: `ฐานความผิดหวังคงที่ในกลุ่มมวลชนขนาดมหึมา: แม้ร้านค้ามีกลุ่มทดลองกินมหาศาลถึง ${item.reviews} คน แต่ขอบเขตเกรดเฉลี่ยร่วงหล่นต่ำกว่า 4.0 ซึ่งบ่งชี้ปัญหาวงกว้างถาวรเชิงทัศนคติบริการหรือปัญหาคุณภาพสัดส่วนเมนูขัดต่อกระบวนการ`,
      action: "ตรวจสอบวิเคราะห์เชิงลึกสกัดคีย์เวิร์ดของกลุ่มคะแนนรีวิว 1-2 ดาวเพื่อดักหาประเด็นขัดข้องยอดนิยมที่เป็นปัญหาของแอป"
    });
  }

  // 7. SUBSTANDARD QUALITY ALERTS
  if (item.rating > 0 && item.rating < 3.7) {
    flags.push({
      restaurantName: item.name,
      area: item.area,
      type: "คะแนนด่ำดิ่งต่ำเกณฑ์ความปลอดภัยมาตรฐาน (Substandard Rating Alert)",
      severity: "high",
      flagCode: "FLG-QUAL-01",
      metric: `Rating: ${item.rating}⭐`,
      reason: `สัญญาณเสี่ยงภัยเชิงพฤติกรรมการทานระดับ Red Flag: ธุรกิจอาหารที่พยุงคะแนนเฉลี่ยหลุดต่ำกว่า 3.7 ดาว ถือเป็นการถดถอยอย่างร้ายแรง คณะประเมินมักชี้นำถึงปัญหาปนเปื้อนในเศษจานคริสตัล คิวล่าช้าจราจรพินาศ หรือการสื่อสารที่มีประเด็นความรุนแรงสะสม`,
      action: "ระงับการติดมุดป้ายดาวบนหน้าร้านแนะนำเด็ดของระบบทันที พร้อมพิจารณาปิดบังฟังก์ชันกดแม็กดาวชั่วคราวจนกว่าจะมีการรีโนเวทคุณภาพดี"
    });
  } else if (item.rating >= 3.7 && item.rating <= 3.9) {
    flags.push({
      restaurantName: item.name,
      area: item.area,
      type: "คะแนนต่ำก้ำกึ่งต่ำกว่าเกณฑ์ความพึงพอใจกลาง (Moderate Quality Warning)",
      severity: "medium",
      flagCode: "FLG-QUAL-03",
      metric: `Rating: ${item.rating}⭐`,
      reason: `คาบเกี่ยวระดับเสถียรอาหารผันแปรง่าย: เรตติ้งแกว่งตัวอยู่ที่ ${item.rating} ดาวสะสม บ่งบอกจุดชำรุดในความประณีตของผลิตภัณฑ์ อาจเด่นทางของแห้งแต่สูตรน้ำแกงผิดพลาด หรือบริการดีแต่ชงเครื่องดื่มเสิร์ฟสลับสอดส่องบ่อยครั้ง`,
      action: "แนะให้ลูกค้าผู้ใช้ระบบตรวจสอบคอมเมนต์แย้งจาก Google Maps ก่อนจองที่นั่งเพื่อเฝ้าระวังไม่ให้ผิดหวังงบ"
    });
  }

  // 8. POLARIZED SENTIMENT ALERTS
  if (item.rating >= 4.0 && item.rating <= 4.2 && item.reviews >= 500) {
    flags.push({
      restaurantName: item.name,
      area: item.area,
      type: "ฐานประชากรเสียงแตกแยกสายรุนแรง (Polarized Sentiment Profile)",
      severity: "medium",
      flagCode: "FLG-QUAL-02",
      metric: `Rating: ${item.rating}⭐, Reviews: ${item.reviews}`,
      reason: `กลุ่มคนรักเท่าผืนหนังคนชังเท่าผืนเสื่อ: จำนวนผู้อัดคะแนนปริมาณหนาแน่นสะสมจำนวน ${item.reviews} บัญชี แต่ดัชนีเกาะตำแหน่งกลางค่อนแย่ 4.0 - 4.2 สะท้อนเสียงความเห็นหักเหสองขั้วอย่างชัดเจน (อาจชื่นชอบเรื่องบรรยากาศเกลียดเรื่องราคา หรือรักรสเผ็ดรังเกียจพริกไทยกระป๋อง)`,
      action: "จัดทำป้ายเตือนลักษณะ 'เสียงวิจารณ์แตกแยกขัดแย้ง' ในระบบเพื่อเตือนผู้บริโภคให้พิจารณารูปหน้าเมนูอย่างถี่ถ้วน"
    });
  }

  // 9. OVERPRICED STREET FOOD MUTATION CHECK
  if ((lowerCat.includes("ไทย") || lowerCat.includes("ก๋วยเตี๋ยว") || lowerCat.includes("ตามสั่ง") || lowerCat.includes("ส้มตำ")) && item.price >= 350) {
    flags.push({
      restaurantName: item.name,
      area: item.area,
      type: "ระดับเรตงบประมาณผิดแผกหมวดอาหารท้องถิ่น (Street Food Budget Outlier)",
      severity: "medium",
      flagCode: "FLG-COST-03",
      metric: `Price: ${item.price}฿/คน, Cat: ${item.category}`,
      reason: `งบต่อหัวหมวดอาหารริมทางกระโดดพุ่งผิดสัดส่วน: ร้านหมวดส้มตำ ก๋วยเตี๋ยว หรือตามสั่งสตรีทฟู้ด ตรวจพบหัวบิลสะสมถึง ~${item.price}฿ ต่อคน ซึ่งพุ่งแหลกกิฟท์เซ็ตปกติกว่ามาตรฐานอุตสาหกรรมสี่เท่าตัว เสี่ยงต่อความไม่พึงพอใจของงบกระเป๋า`,
      action: "วิเคราะห์ภาพถ่ายเลย์เอาต์โต๊ะว่าเข้าข่ายเป็นระดับร้านห้างเช่าหรูหราอลังการ (Luxury Boutique Street) หรือเป็นราคาฉกฉวยนักเดินทางเกรดโก่งราคา"
    });
  }

  // 10. UNDERPRICED HEAVY BUFFETS (High-risk safety anomaly check)
  if ((lowerCat.includes("ชาบู") || lowerCat.includes("ปิ้งย่าง") || lowerCat.includes("บุฟเฟต์") || lowerCat.includes("shabu") || lowerCat.includes("bbq")) && item.price > 0 && item.price < 250) {
    flags.push({
      restaurantName: item.name,
      area: item.area,
      type: "บุฟเฟต์ราคาประต่ำผิดนิสัยตลาดสุขสัญจร (Buffet Underpriced Risk)",
      severity: "medium",
      flagCode: "FLG-COST-04",
      metric: `Price: ${item.price}฿/คน, Cat: ${item.category}`,
      reason: `ระดับราคาถูกผิดวิสัยโครงสร้างเศรษฐศาสตร์ต้นทุน: งานชาบูปิ้งย่างเนื้อเสิร์ฟจานไม่อั้นที่มีระดับราคาต่ำกว้า 250 บาทต่อหัว ย่อมกระตุ้นดัชนีตรวจสุขอนามัยต่ำ บ่งชี้ความเสี่ยงวัตถุดิบขาดตกความสด ปัญหาการแช่แข็งเสื่อมถอย หรือเนื้อแต่งแต่งสีเลียนแบบ`,
      action: "แจ้งเตือน 'เฝ้าระวังประเด็นความสะอาดและการปรุงสุกถั่วฝาน' บนหน้ารายละเอียดร้านเพื่อปกป้องชีวิตสุขภาวะผู้ชิม"
    });
  }

  // 11. PRICE VALUE COMPLETE LOSS
  if (item.price <= 0) {
    flags.push({
      restaurantName: item.name,
      area: item.area,
      type: "ข้อมูลโครงสร้างราคาสูญหายถาวร (Missing Rate/Price Matrix)",
      severity: "high",
      flagCode: "FLG-COST-05",
      metric: `Price: 0`,
      reason: `บ้อมูลร่วงหายจากแผ่นประเมิน: ไม่มีฟิลด์ตัวเลขค่าเงินแสดงช่วงอาหารเลย ระบบบีบใช้ตารางประมวลไม่ได้ เสี่ยงปิดกั้นฟิลเตอร์จำลองงบผู้ใช้กลุ่มใหญ่`,
      action: "เร่งรีบเข้าไปค้นหาแผ่นที่ระบุป้ายแทง หรือกระตุ้นปุ่มสำรวจบิลสัญจรกรอกข้อมูลตัวเลขกลับเข้าไปในพิกัดเซลล์"
    });
  }

  // 12. HIGH END ESTIMATED PRICE VULNERABILITY
  if (item.isEstimatedPrice) {
    const isHighEndCategory = lowerCat.includes("ญี่ปุ่น") || lowerCat.includes("shabu") || lowerCat.includes("ชาบู") || lowerCat.includes("ปิ้งย่าง") || lowerCat.includes("bbq") || lowerCat.includes("อิตาเลียน") || lowerCat.includes("steak") || lowerCat.includes("สเต็ก") || item.price >= 600;
    
    if (isHighEndCategory) {
      flags.push({
        restaurantName: item.name,
        area: item.area,
        type: "ราคาจำลองกลุ่มเมนูหรูผันผวนสูง (High-Budget Price Estimation Risk)",
        severity: "medium",
        flagCode: "FLG-COST-01",
        metric: `Estimated: ~${item.price}฿, Cat: ${item.category}`,
        reason: `งบต่อหัวผันผวนขอบเขตกว้างพิเศษ: อาหารกลุ่มเด่นพรีเมียมหมูพาย ${item.category} ใช้ระบบประเมินจำลองไว้ที่ประมาณ ~${item.price}฿ ทว่าลักษณะกลุ่มนี้มักมีราคาขั้นบันไดและค่าบริการเสริม (Service Charges/VAT/Beverage margins) ปะปนมาสูงปรี๊ดหน้างานจริง`,
        action: "สลักข้อความแจ้งคำพูดกำกับ 'เรตราคานี้อาจปะปนขึ้นผันผวนสูงตามเซ็ตระดับเนื้อที่ลูกค้ากดสั่ง' ในส่วนตาราง"
      });
    } else {
      flags.push({
        restaurantName: item.name,
        area: item.area,
        type: "ระดับราคาเป็นการประมาณการจากแบบจำลอง AI (AI Budget Approximation)",
        severity: "low",
        flagCode: "FLG-COST-02",
        metric: `Estimated: ~${item.price}฿`,
        reason: `ประมาณการตามดัชนีแผงทำเล: ข้อมูลใบเสร็จบิลอาหารตัวจริงขาดฟิลด์ในเซลล์พาส ระบบสุ่มวิจัย (Data Interpolation System) จึงป้อนเกรดราคากลาง ~${item.price}฿ โดยคำนวณจากค่าเฉลี่ยสถิติกลุ่มย่านหลัก และลักษณะร้านค้าทดสอบข้างเคียง`,
        action: "ส่งเสริมให้ผู้ตรวจเยี่ยมหน้าเพจพกตั๋วบิลเช็คยอดอัปเดตลงตัวแปรดิบ Google Sheets เพื่อทดแทนที่แบบถาวร"
      });
    }
  }

  // 13. MISSING GEOCENTRIC AREA TAG
  if (!item.area || item.area === "ไม่ระบุ") {
    flags.push({
      restaurantName: item.name,
      area: "ไม่ระบุ",
      type: "ขาดการระบุพื้นที่เขตพิกัดย่านหลัก (Missing Geocentric Area Tag)",
      severity: "medium",
      flagCode: "FLG-GEOM-01",
      metric: `Area: ไม่ระบุ`,
      reason: `พิกัดตกสำรวจเชิงพื้นที่: เขตพื้นที่ตีกรอบภูมิภาค (Neighborhood Area) อยู่ในหมวดไม่ระบุ ส่งผลให้ฟิลเตอร์จัดย่านบนแถบ Dashboard มองไม่เห็นร้านค้า และตกโครงสร้างเมื่อกรองแผนภูมิมาร์เก็ตอินไซต์`,
      action: "แยกแยะคีย์เวิร์ดที่อยู่ (Address Details) บนตารางร้าน หาจุดตัดเขตและปรับเปลี่ยนค่าจากว่างเปล่าให้เข้ากรอบเขตหลัก"
    });
  }

  // 14. INVALID / MISSING NAVIGATIONAL MAP LINK
  if (!item.map || item.map === "#" || item.map === "") {
    flags.push({
      restaurantName: item.name,
      area: item.area,
      type: "ขาดพิกัดทางนำทาง Google Maps แสตนด์อะโลน (Missing Navigational Maps URL)",
      severity: "medium",
      flagCode: "FLG-LINK-02",
      metric: `Maps URL: ไม่มี`,
      reason: `อัมพาตการเชื่อมโยงระบบวิจัย: ไม่มีลิงก์พิกัดนำทางระบุลงแถบแถวอาหาร ทำให้ผู้กดใช้งานมองไม่เห็นเส้นทางจราจลจริง ลานจอดรถ หรือเช็คดูรูปถ่ายล่าสุดผ่านดาวเทียมกูเกิลไม่ได้`,
      action: "เร่งรีบนำยูอาร์แอลพิกัด Maps ที่ถูกต้องพร้อมหมุดจระเข้มาคัดลอกทับที่แทนเพื่อแก้ปัญหาเดธลิงก์ในการนำทาง"
    });
  } else if (!item.map.includes("google.com/maps") && !item.map.includes("maps.google") && !item.map.includes("goo.gl") && !item.map.includes("maps.app.goo.gl")) {
    flags.push({
      restaurantName: item.name,
      area: item.area,
      type: "รูปแบบสะพานแผนที่ผิดข้อกำหนดพิกัดกูเกิล (Non-Google Maps Link Format)",
      severity: "medium",
      flagCode: "FLG-GEOM-03",
      metric: `Maps URL: ${item.map.slice(0, 30)}...`,
      reason: `โครงสร้างจุดปักแผนที่ไม่ตรงรูปแบบ API สากล: ตัวลิงก์มีลักษณะเชื่อมต่อไปสื่อรีวิวอื่นๆ หรือเป็นเว็บไซต์หน้าหลักที่ยังไม่ปรากฏโค้ดแผนเส้นทางคมนาคม (Naviglational Coordinates System)`,
      action: "แปลงค่าสะพาน URL ให้เข้าแบบฟอร์แมตหมุดปักสากลของกูเกิลเพื่อการเรียกใช้ Widget แผนที่อย่างราบรื่น"
    });
  }

  // 15. CONTACT METADATA LOSS
  if (!item.source || item.source === "#" || item.source === "") {
    flags.push({
      restaurantName: item.name,
      area: item.area,
      type: "ลิงก์เว็บไซต์อ้างอิงช่องทางติดต่อขาดหาย (Missing Contact link/Reference)",
      severity: "low",
      flagCode: "FLG-LINK-01",
      metric: `Website: ไม่มี`,
      reason: `ช่องทางสำรองที่นั่งห่างขาดพินารักษ์: ไร่ท่อเชื่อมต่อไปยังช่องติดต่อตรง เช่น สื่อแฟนเพจ เฟซบุ๊กหรือไลน์ทางการ ส่งผลให้ผู้ใช้มองหาช่องทางทำการจองล่วงหน้าหรือศึกษาเมนูก่อนเดินเดินทางลำบาก`,
      action: "ตรวจสอบพอร์ทัลร้านบนเครื่องสืบค้น และนำเศษช่องทางอารักขาล่าสุดมาแมปประกอบเซลล์ติดต่อ"
    });
  }

  // 16. GENERIC STOCK VISUAL TAG ALERT
  if (!item.image || item.image === "" || item.image.includes("picsum.photos")) {
    flags.push({
      restaurantName: item.name,
      area: item.area,
      type: "ใช้ภาพอาหารสต็อกสตูดิโอระบบจำลองชั่วคราว (Generic Stock Visual Tag)",
      severity: "low",
      flagCode: "FLG-INFO-04",
      metric: `Stock Image placeholder`,
      reason: `ขาดองค์ประกอบภาพพิสูจน์รสจริงหน้าเตา: ระบบจำลองภาพสต็อกธรรมชาติ picsum.photos เนื่องจากชีตข้อมูลละเลยการแนบลิงก์รูปถ่ายพอร์ทัลรูปจริงของจานอาหาร`,
      action: "ดาวน์โหลดรูปเมนูเด่นของร้านค้าจากรีวิว Google Maps อัปขึ้นเซิร์ฟเวอร์ และนำลิงก์ปลายทางตรงมาป้อนแทนที่สต็อกปลอม"
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
  if (reviews >= 500) reasons.push(`รีวิวสะสมสูง (${reviews} รีวิว) -> ข้อมูลมีความเสถียรเชิงสถิติชั้นยอด ปราศจากค่าสุ่มเบี่ยงเบน`);
  else if (reviews >= 150) reasons.push(`รีวิวระดับกลาง (${reviews} รีวิว) -> ความน่าเชื่อถือสถิติคงตัวสว่างสดใส`);
  else reasons.push(`รีวิวน้อยเข้าขั้นจำกัด (${reviews} รีวิว) -> ความเสี่ยงเชิงความไม่รอบคอบของคะแนนคละสายสูง`);
  if (item.isEstimatedPrice) reasons.push(`ระดับราคาเป็นมูลฐาน AI ประมาณการเนื่องจากไม่ระบุบิลหน้าร้าน -> ความมั่นใจเรื่องงบประมาณลดลง`);
  if (!hasArea) reasons.push(`พิกัดย่านยังคงค้างไม่ระบุ -> ขัดข้องในการแมปเพื่อความเหมาะสมตามขอบเขตพื้นที่ตั้งยอด`);
  if (!hasCategory) reasons.push(`ประเภทไม่ส่องสว่าง -> หมวดหมู่อาหารคลุมเครือขัดขวางสมการการกรองเชิงลึก`);
  if (!hasMap) reasons.push(`ขาดพิกัด Google Maps -> ยากต่อการตรวจสอบว่าปัจจุบันยังเปิดดำเนินการอยู่หรือไม่`);
  if (!hasSource) reasons.push(`ขาดพอร์ทัลลิงก์ติดต่อ -> ไม่ระบุเพจส่งอ้างอิงตรวจสอบย้ำเพื่อยืนยันสถานะโปรโมโมชั่นล่าสุด`);

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
    default: 'สมดุลทั่วไป',
    safe: '🛡️ เมนูชัวร์ (รีวิวเยอะ)',
    cheap: '💰 ประหยัดงบประมูลเลอ',
    fast: '⚡ รีบด่วน (เสิร์ฟทันดัด)',
    work: '💼 คุยธุรกิจหรู (คุยงาน)',
    large: '👥 สระความสุขทีมใหญ่ 8-12 คน',
  };
  return map[s] || s;
}
