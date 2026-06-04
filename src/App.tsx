/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo, useRef } from "react";
import {
  Search,
  MessageSquare,
  MapPin,
  RotateCcw,
  AlertCircle,
  Filter,
  ExternalLink,
  ChevronDown,
  ChevronUp,
  TrendingUp,
  Coins,
  Clock,
  Users,
  CheckCircle2,
  Building2,
  AlertTriangle,
  Info,
  Layers,
  Database,
  ArrowUpDown,
  Send,
  Sparkles,
  ShieldCheck,
  X,
  Plus,
  Settings
} from "lucide-react";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { Restaurant, HumanReviewFlag, ChatMessage } from "./types";
import {
  normalizeCategory,
  computeConfidence,
  computeScenarioScore,
  computeBudgetEfficiency,
  computeOperationalRisk,
  getHumanReviewFlags,
  scenarioLabel,
  safeNum,
  round
} from "./utils";

const SHEET_ID = "1ehO4liCpgW_txiVCWd_zn1nUm2naRkKMLk_m6Qkn7zM";
const SHEET_NAME = "List";
const OPENSHEET_BASE = `https://opensheet.elk.sh/${SHEET_ID}`;
const N8N_WEBHOOK_URL = "https://n8n-external.exservice.io/webhook/apify-googlemaps-receiver";

const RetroMarquee = "marquee" as any;

function getTopThreeReason(item: any, scenario: string, rank: number): string {
  const rating = item.rating || 0;
  const reviews = item.reviews || 0;
  const price = item.price || 0;
  const cat = (item.category || "อาหาร").trim();
  const area = item.area || "กรุงเทพฯ";
  const place = area === "ไม่ระบุ" ? "" : `ในย่าน${area}`;

  switch (scenario) {
    case "cheap":
      if (rank === 1) {
        return `🪙 คุ้มงบที่สุดในชุดนี้ ราคาเฉลี่ยอยู่ที่ ${item.display_price}/คน เหมาะกับวันที่อยากกินดีโดยไม่บานปลาย${place}`;
      } else if (rank === 2) {
        return `💸 ราคาเป็นมิตร ประมาณ ${price}฿ ต่อคน แต่ยังได้คะแนนรีวิวดี เหมาะกับคนที่อยากได้ร้าน${cat}แบบสบายกระเป๋า`;
      } else {
        return `🍛 เป็นตัวเลือกประหยัดที่ยังดูไว้ใจได้ เหมาะกับมื้อทั่วไปที่อยากจบง่ายและราคาไม่แรง`;
      }
    case "safe":
      if (rank === 1) {
        return `🛡️ รีวิวเยอะมากถึง ${reviews} ราย ทำให้ข้อมูลดูนิ่งกว่าเพื่อน เหมาะกับวันที่ไม่อยากเสี่ยงลองร้านใหม่แบบสุ่ม`;
      } else if (rank === 2) {
        return `✅ คะแนนเฉลี่ย ${rating}⭐ พร้อมจำนวนรีวิวที่น่าเชื่อถือ เป็นร้านที่เลือกได้แบบอุ่นใจ`;
      } else {
        return `💎 ข้อมูลโดยรวมดูสมดุล ทั้งคะแนนและฐานรีวิว เหมาะกับการเลือกร้านแบบเน้นความชัวร์`;
      }
    case "fast":
      if (rank === 1) {
        return `⚡ เหมาะกับมื้อเร่งด่วน หมวด${cat}มักกินง่าย ตัดสินใจเร็ว และไม่ต้องใช้เวลานั่งนาน`;
      } else if (rank === 2) {
        return `⏱️ เป็นตัวเลือกที่ดูจบไว เหมาะกับช่วงพักสั้นๆ หรือวันที่อยากกินแล้วไปต่อ`;
      } else {
        return `🍜 ร้านนี้เหมาะกับคนที่อยากได้มื้อสะดวก${place} ไม่ต้องวางแผนเยอะ`;
      }
    case "work":
      if (rank === 1) {
        return `💼 ภาพรวมเหมาะกับนัดคุยงานหรือรับแขก หมวด${cat}${place}ดูสุภาพและเลือกได้ง่าย`;
      } else if (rank === 2) {
        return `✨ คะแนน ${rating}⭐ ช่วยให้มั่นใจขึ้น เหมาะกับนัดที่อยากให้บรรยากาศดูดีแต่ไม่เยอะเกินไป`;
      } else {
        return `☕ เป็นร้านที่ดูเหมาะกับการนั่งคุยสบายๆ ระหว่างกินหรือดื่มกาแฟ ไม่ทางการจนเกินไป`;
      }
    case "large":
      if (rank === 1) {
        return `👥 เหมาะกับกลุ่ม 8-12 คน โดยเฉพาะหมวด${cat}ที่แชร์กันง่ายและช่วยให้ทุกคนเลือกเมนูร่วมกันได้สะดวก`;
      } else if (rank === 2) {
        return `🔥 เหมาะกับมื้อทีม เลี้ยงส่ง หรือกินกับเพื่อนร่วมงาน เพราะดูเป็นร้านที่แชร์อาหารและคุยกันได้ง่าย`;
      } else {
        return `🍲 เป็นตัวเลือกสำรองที่ยังลงตัวสำหรับกลุ่มใหญ่ คะแนนและราคาโดยรวมไม่สุดโต่งจนเลือกยาก`;
      }
    default:
    case "default":
      if (rank === 1) {
        return `⚖️ ตัวเลือกที่สมดุลที่สุดตอนนี้ ทั้งราคา คะแนน และจำนวนรีวิว ${reviews} ครั้ง เหมาะกับการเริ่มตัดสินใจ`;
      } else if (rank === 2) {
        return `⭐ คะแนน ${rating}⭐ และราคาต่อหัวอยู่ในจุดที่น่าสนใจ เป็นตัวเลือกที่คุ้มค่าแบบไม่ต้องคิดเยอะ`;
      } else {
        return `📊 ภาพรวมยังดีและดูคุ้มราคา เหมาะเก็บไว้เป็นตัวเลือกเผื่อร้านอันดับต้นๆ ไม่สะดวก`;
      }
  }
}

export default function App() {
  // --- STATE DECLARATIONS ---
  const [rawData, setRawData] = useState<any[]>([]);
  const [processedData, setProcessedData] = useState<Restaurant[]>([]);
  
  // Filtering & Sorting
  const [selectedArea, setSelectedArea] = useState<string>("all");
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [selectedScenario, setSelectedScenario] = useState<string>("default");
  const [searchQuery, setSearchQuery] = useState<string>(" ");
  const [sortField, setSortField] = useState<keyof Restaurant>("base_score");
  const [sortAscending, setSortAscending] = useState<boolean>(false);
  const [showMobileFilters, setShowMobileFilters] = useState<boolean>(false);
  
  // Scraper & Loader Polling Lock Controls
  const [isScraping, setIsScraping] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [loadingProgress, setLoadingProgress] = useState<number>(0);
  const [loadingText, setLoadingText] = useState<string>("กำลังโหลดฐานข้อมูลร้านอาหาร...");
  const [lastUpdatedTime, setLastUpdatedTime] = useState<string>("-");
  const [dataSource, setDataSource] = useState<string>("");

  // Human Review Filtering and UI State
  const [flagFilterSeverity, setFlagFilterSeverity] = useState<string>("all");
  const [flagSearchQuery, setFlagSearchQuery] = useState<string>("");
  const [expandedFlagIndex, setExpandedFlagIndex] = useState<number | null>(null);

  // Windows 95 Styled Custom Modals
  const [alertState, setAlertState] = useState<{
    show: boolean;
    title: string;
    message: string;
    desc: string;
    isError: boolean;
    details: string;
  }>({
    show: false,
    title: "",
    message: "",
    desc: "",
    isError: false,
    details: ""
  });

  // Selected restaurant details modal
  const [selectedRestaurant, setSelectedRestaurant] = useState<Restaurant | null>(null);

  // Chat Widget State
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([
    {
      id: "init",
      role: "ai",
      text: "สวัสดีครับ ผมคือ <b>AI Food Assistant</b> ช่วยค้นหาร้าน ดูงบต่อคน เช็กย่าน และเทียบตัวเลือกจากข้อมูลในตารางได้เลย ลองพิมพ์สิ่งที่อยากกินหรือย่านที่สนใจมาได้ครับ"
    }
  ]);
  const [chatInput, setChatInput] = useState<string>("");
  const [isChatOpen, setIsChatOpen] = useState<boolean>(true);

  // AI Cleaning & Sync Settings
  const [geminiApiKey, setGeminiApiKey] = useState<string>(localStorage.getItem("ai_food_gemini_api_key") || "");
  const [geminiModel, setGeminiModel] = useState<string>(localStorage.getItem("ai_food_gemini_model") || "gemini-2.0-flash");
  const [googleScriptUrl, setGoogleScriptUrl] = useState<string>(localStorage.getItem("ai_food_google_script_url") || "https://script.google.com/macros/s/AKfycby9kvXskLoYF9EquSu_uerQ0tnk61c9-9jtdFEfh1HG1gF-u2aTDf8IYRIwmg5Y6boXQQ/exec");
  const [autoSync, setAutoSync] = useState<boolean>(localStorage.getItem("ai_food_auto_sync") === "true");
  const [showSettings, setShowSettings] = useState<boolean>(false);
  const [isCleaning, setIsCleaning] = useState<boolean>(false);

  // Poll Interval Ref to protect from memory leaks and multiple overlapping timers
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const isScrapingRef = useRef<boolean>(false);

  // --- GOOGLE SHEETS FETCH FALLBACK PIPELINE ---
  const fetchJsonWithDiagnostics = async (url: string): Promise<any> => {
    const res = await fetch(url, { cache: "no-store" });
    const contentType = (res.headers.get("content-type") || "").toLowerCase();
    
    if (!res.ok) {
      let bodyText = "";
      try {
        bodyText = await res.text();
      } catch (_) {}
      throw new Error(`HTTP ${res.status} ${res.statusText}\nURL: ${url}\nContent-Type: ${contentType}\nBody (first 250 chars):\n${bodyText.slice(0, 250)}`);
    }

    if (!contentType.includes("application/json") && !contentType.includes("text/json")) {
      let bodyText = "";
      try {
        bodyText = await res.text();
      } catch (_) {}
      try {
        return JSON.parse(bodyText);
      } catch (e) {
        throw new Error(`Response is not JSON\nURL: ${url}\nContent-Type: ${contentType}\nBody (first 250 chars):\n${bodyText.slice(0, 250)}`);
      }
    }
    return await res.json();
  };

  const fetchFromGviz = async (sheetName: string): Promise<any[]> => {
    const url = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:json&sheet=${encodeURIComponent(sheetName)}`;
    const res = await fetch(url, { cache: "no-store" });
    
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`GVIZ HTTP ${res.status} ${res.statusText}\nURL: ${url}\nBody (first 250 chars):\n${text.slice(0, 250)}`);
    }
    
    const text = await res.text();
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    
    if (start < 0 || end < 0 || end <= start) {
      throw new Error(`GVIZ invalid payload\nURL: ${url}\nBody (first 250 chars):\n${text.slice(0, 250)}`);
    }
    
    const payload = JSON.parse(text.slice(start, end + 1));
    const table = payload?.table;
    if (!table?.rows || !table?.cols) return [];

    let headers: string[] = [];
    let dataRows: any[] = [];
    
    const hasColLabels = table.cols.some((c: any) => c && c.label && c.label.trim() !== "");
    if (hasColLabels) {
      headers = table.cols.map((col: any, idx: number) => {
        const label = col?.label;
        return (label === null || label === undefined || `${label}`.trim() === '') ? `col_${idx}` : `${label}`.trim();
      });
      dataRows = table.rows;
    } else {
      const headerRow = table.rows[0]?.c || [];
      headers = headerRow.map((cell: any, idx: number) => {
        const v = cell?.v;
        return (v === null || v === undefined || `${v}`.trim() === '') ? `col_${idx}` : `${v}`.trim();
      });
      dataRows = table.rows.slice(1);
    }

    return dataRows.map((r: any) => {
      const obj: any = {};
      const cells = r.c || [];
      headers.forEach((h: string, i: number) => {
        const cell = cells[i];
        obj[h] = (cell && cell.v !== undefined) ? cell.v : '';
      });
      return obj;
    });
  };

  const fetchFromCsv = async (sheetName: string): Promise<any[]> => {
    const url = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=csv&sheet=${encodeURIComponent(sheetName)}`;
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) throw new Error(`CSV HTTP status ${res.status}`);
    const text = await res.text();
    
    const parseCsvLines = (csvText: string): string[][] => {
      const lines: string[][] = [];
      let row: string[] = [];
      let inQuotes = false;
      let currentValue = "";
      
      for (let i = 0; i < csvText.length; i++) {
        const char = csvText[i];
        const nextChar = csvText[i + 1];
        
        if (char === '"') {
          if (inQuotes && nextChar === '"') {
            currentValue += '"';
            i++; 
          } else {
            inQuotes = !inQuotes;
          }
        } else if (char === ',' && !inQuotes) {
          row.push(currentValue);
          currentValue = "";
        } else if ((char === '\r' || char === '\n') && !inQuotes) {
          row.push(currentValue);
          currentValue = "";
          if (row.length > 0 && (row.length > 1 || row[0] !== "")) {
            lines.push(row);
          }
          row = [];
          if (char === '\r' && nextChar === '\n') {
            i++; 
          }
        } else {
          currentValue += char;
        }
      }
      
      if (currentValue !== "" || row.length > 0) {
        row.push(currentValue);
        lines.push(row);
      }
      return lines;
    };

    const rows = parseCsvLines(text);
    if (rows.length === 0) return [];
    
    const headers = rows[0].map((h, idx) => {
      const name = h.trim();
      return name === "" ? `col_${idx}` : name;
    });

    const result = [];
    for (let r = 1; r < rows.length; r++) {
      const obj: any = {};
      const cells = rows[r];
      headers.forEach((h, colIdx) => {
        obj[h] = cells[colIdx] !== undefined ? cells[colIdx].trim() : '';
      });
      result.push(obj);
    }
    return result;
  };

  const fetchSheetDataPreferred = async (sheetName: string): Promise<{ source: string; data: any[] }> => {
    try {
      const url = `${OPENSHEET_BASE}/${encodeURIComponent(sheetName)}`;
      const json = await fetchJsonWithDiagnostics(url);
      const data = json?.value || json;
      if (Array.isArray(data)) {
        return { source: "opensheet", data };
      }
      if (data && typeof data === "object" && data.error) {
        throw new Error(`opensheet error object: ${JSON.stringify(data).slice(0, 200)}`);
      }
      throw new Error(`opensheet non-array: ${Object.prototype.toString.call(data)}`);
    } catch (e) {
      console.warn("opensheet failed, trying gviz fallback...", e);
      try {
        const data = await fetchFromGviz(sheetName);
        if (Array.isArray(data) && data.length > 0) {
          return { source: "gviz-fallback", data };
        }
        throw new Error("Gviz returned empty or invalid rows");
      } catch (e2) {
        console.warn("gviz fallback failed, trying direct CSV download fallback...", e2);
        const data = await fetchFromCsv(sheetName);
        return { source: "csv-export-fallback", data };
      }
    }
  };

  const resolveWorkingSheet = async (): Promise<{ sheetName: string; data: any[]; source: string }> => {
    const candidates = [SHEET_NAME, "List", "Sheet1", "Data", "1"];
    const errors: string[] = [];
    
    for (const name of candidates) {
      try {
        const result = await fetchSheetDataPreferred(name);
        if (Array.isArray(result.data)) {
          return { sheetName: name, data: result.data, source: result.source };
        }
      } catch (err: any) {
        errors.push(`${name}: ${err.message || err}`);
      }
    }
    // Final attempt with primary default
    const result = await fetchSheetDataPreferred(SHEET_NAME);
    return { sheetName: SHEET_NAME, data: result.data, source: result.source };
  };

  const loadData = async (shouldShowToast = false, forceFresh = false) => {
    setIsLoading(true);
    setLoadingProgress(15);
    setLoadingText("กำลังตรวจสอบฐานข้อมูลแคขท้องถิ่น...");
    
    // Check local storage cache first
    if (!forceFresh) {
      try {
        const cachedData = localStorage.getItem("ai_food_assistant_cached_data");
        const cachedSource = localStorage.getItem("ai_food_assistant_cached_source");
        const cachedTime = localStorage.getItem("ai_food_assistant_cached_time");
        if (cachedData) {
          const parsed = JSON.parse(cachedData);
          if (Array.isArray(parsed) && parsed.length > 0) {
            setRawData(parsed);
            setDataSource(cachedSource || "Local Cache");
            setLastUpdatedTime(cachedTime || new Date().toLocaleString("th-TH"));
            // Fast skip to complete
            setLoadingProgress(100);
            setIsLoading(false);
            return;
          }
        }
      } catch (cacheErr) {
        console.warn("Could not load food assistant data from cache:", cacheErr);
      }
    }

    setLoadingProgress(35);
    setLoadingText("กำลังสืบค้นและระบุข้อมูล Google Sheet...");
    
    try {
      const resolved = await resolveWorkingSheet();
      setRawData(resolved.data);
      setDataSource(resolved.source);
      
      const updateTimeString = new Date().toLocaleString("th-TH");
      setLastUpdatedTime(updateTimeString);

      // Save to localStorage
      try {
        localStorage.setItem("ai_food_assistant_cached_data", JSON.stringify(resolved.data));
        localStorage.setItem("ai_food_assistant_cached_source", resolved.source);
        localStorage.setItem("ai_food_assistant_cached_time", updateTimeString);
      } catch (saveErr) {
        console.warn("Could not write to localStorage cache:", saveErr);
      }
      
      setLoadingProgress(80);
      setLoadingText("กำลังสกัดวิเคราะห์คะแนนโหวตและจำลองงบประมาณ AI 2.0...");
      
      if (shouldShowToast) {
        triggerWin95Alert(
          "ข้อมูลถูกดึงสำเร็จ",
          `เชื่อมต่อกับ Google Sheet สำเร็จผ่าน API [${resolved.source}]`,
          `นำข้อมูลเข้ามาวิเคราะห์เรียบร้อย ตรวจพบร้านอาหารจำนวน ${resolved.data.length} รายการ`,
          false
        );
      }
    } catch (e: any) {
      console.error("Database initialization failed:", e);
      triggerWin95Alert(
        "ข้อผิดพลาดการดึงตารางข้อมูล",
        "ไม่สามารถเข้าถึง Google Sheet ได้ในเวลานี้",
        `โปรดเช็คให้แน่ใจว่าอินเทอร์เน็ตยังเชื่อมต่อ และพิกัด Google Sheet ID มีสิทธิ์เข้าถึงเสถียรทั่วไป: ${e.message || e}`,
        true
      );
    } finally {
      setIsLoading(false);
    }
  };

  // --- RAW DATA PROCESSOR ---
  useEffect(() => {
    if (!rawData || rawData.length === 0) {
      setProcessedData([]);
      return;
    }

    const uniqueMap = new Map<string, any>();
    rawData.forEach(item => {
      const name = item['title'] || item['Name'] || item['ชื่อร้าน'] || '';
      if (!name) return;
      const key = `${name.trim().toLowerCase()}`;
      if (!uniqueMap.has(key)) {
        uniqueMap.set(key, item);
      }
    });

    const parsed = Array.from(uniqueMap.values()).map(item => {
      const foundTitle = item['title'] || item['Name'] || item['ชื่อร้าน'] || 'ไม่ระบุชื่อร้าน';
      const cat = normalizeCategory(item['categoryName'] || item['ประเภท'] || 'อื่นๆ');
      
      // 1. Check for manual strict-pricing columns for 100% accuracy (e.g. ราคาจริง, ราคาต่อหัว, BudgetPerHead)
      const manualPriceRaw = (item['ราคาจริง'] || item['ราคาต่อหัว'] || item['BudgetPerHead'] || item['PricePerPerson'] || item['pricePerPerson'] || '').toString().trim();
      let priceValue = 0;
      let displayPrice = '';
      let isEstimatedPrice = false;

      if (manualPriceRaw && manualPriceRaw !== '0' && manualPriceRaw !== '-') {
        const manualNum = parseInt(manualPriceRaw.replace(/[^0-9]/g, ''));
        if (Number.isFinite(manualNum) && manualNum > 0) {
          priceValue = manualNum;
          displayPrice = `${priceValue}฿`;
          isEstimatedPrice = false;
        }
      }

      // If no manual price, fall back to standard price string parsing
      if (priceValue === 0) {
        const priceRaw = (
          item['priceRange'] || 
          item['price_range'] || 
          item['priceRangeText'] || 
          item['price'] || 
          item['ราคา'] || 
          item['priceLevel'] || 
          item['price_level'] || 
          ''
        ).toString().trim();
        const isPriceMissing = !priceRaw || priceRaw.toLowerCase() === 'n/a' || priceRaw === 'ไม่ระบุ' || priceRaw === '-' || priceRaw === '0';

        if (!isPriceMissing) {
          const numbers = priceRaw.match(/[0-9,]+/g);
          if (numbers && numbers.length > 0) {
            const parsedNums = numbers.map((n: string) => parseInt(n.replace(/,/g, '')));
            if (parsedNums.length >= 2) {
              priceValue = (parsedNums[0] + parsedNums[1]) / 2;
            } else {
              priceValue = parsedNums[0];
            }
          } else {
            // Fallback $ or ฿ logic
            const count = (priceRaw.match(/[\$\฿]/g) || []).length;
            if (count >= 4) priceValue = 1500;
            else if (count === 3) priceValue = 850;
            else if (count === 2) priceValue = 450;
            else if (count === 1) priceValue = 250;
          }
        }

        if (isPriceMissing || priceValue === 0) {
          isEstimatedPrice = true;
          let basePrice = 250;
          const lowerCat = cat.toLowerCase();
          const titleLower = foundTitle.toLowerCase();
          
          if (lowerCat.includes('ญี่ปุ่น') || lowerCat.includes('ซูชิ') || lowerCat.includes('ราเมง') || lowerCat.includes('japanese')) {
            basePrice = 450;
          } else if (lowerCat.includes('ชาบู') || lowerCat.includes('ปิ้งย่าง') || lowerCat.includes('บุฟเฟต์') || lowerCat.includes('shabu') || lowerCat.includes('bbq')) {
            basePrice = 590;
          } else if (lowerCat.includes('คาเฟ่') || lowerCat.includes('เบเกอรี่') || lowerCat.includes('ของหวาน') || lowerCat.includes('cafe') || lowerCat.includes('กาแฟ')) {
            basePrice = 180;
          } else if (lowerCat.includes('อิตาเลียน') || lowerCat.includes('สเต็ก') || lowerCat.includes('steak') || lowerCat.includes('italian')) {
            basePrice = 750;
          } else if (lowerCat.includes('ไทย') || lowerCat.includes('ก๋วยเตี๋ยว') || lowerCat.includes('ตามสั่ง') || lowerCat.includes('ส้มตำ')) {
            basePrice = 150;
          } else if (lowerCat.includes('จีน') || lowerCat.includes('ติ่มซำ')) {
            basePrice = 350;
          } else if (lowerCat.includes('เกาหลี') || lowerCat.includes('korean')) {
            basePrice = 400;
          }

          // Smart semantic adjustments based on keywords in the restaurant name
          if (titleLower.includes('omakase') || titleLower.includes('fine dining') || titleLower.includes('chef table') || titleLower.includes('chef\'s table')) {
            basePrice = Math.max(basePrice, 1500);
          } else if (titleLower.includes('premium') || titleLower.includes('พรีเมียม') || titleLower.includes('wagyu') || titleLower.includes('วากิว') || titleLower.includes('black angus') || titleLower.includes('steakhouse')) {
            basePrice = Math.max(basePrice, 890);
          } else if (titleLower.includes('buffet') || titleLower.includes('บุฟเฟ่ต์') || titleLower.includes('บุฟเฟต์')) {
            if (lowerCat.includes('ชาบู') || lowerCat.includes('ปิ้งย่าง')) {
              basePrice = 499;
            } else if (lowerCat.includes('ญี่ปุ่น')) {
              basePrice = 599;
            } else {
              basePrice = 399;
            }
          } else if (titleLower.includes('หมูกระทะ') || titleLower.includes('หมูทะ')) {
            basePrice = 250;
          } else if (titleLower.includes('ก๋วยเตี๋ยว') || titleLower.includes('บะหมี่') || titleLower.includes('ส้มตำ')) {
            basePrice = 70;
          }

          // Apply Premium Area markup
          const areaText = (item['neighborhood'] || item['address'] || '').toString().toLowerCase();
          let markup = 1.0;
          if (areaText.includes('สยาม') || areaText.includes('siam') || areaText.includes('ปทุมวัน') || 
              areaText.includes('ทองหล่อ') || areaText.includes('thong lo') || areaText.includes('พร้อมพงษ์') || areaText.includes('phrom phong')) {
            markup = 1.15;
          } else if (areaText.includes('อารีย์') || areaText.includes('ari') || areaText.includes('อโศก') || areaText.includes('asoke')) {
            markup = 1.05;
          }

          priceValue = Math.round(basePrice * markup);
          displayPrice = `~${priceValue}฿`;
        } else {
          displayPrice = `${priceValue}฿`;
        }
      }

      const rating = parseFloat(item['totalScore'] || item['rating'] || item['คะแนน'] || 4.0);
      const reviews = parseInt(item['reviewsCount'] || item['reviews'] || item['จำนวนรีวิว'] || 0);
      
      const ratingWeight = rating * 20;
      const progressWeight = Math.min(100, (reviews / 500) * 100);
      const compositeScore = (ratingWeight * 0.6) + (progressWeight * 0.3) + 10;

      const processedObj: Restaurant = {
        name: foundTitle,
        area: item['neighborhood'] || item['ย่าน'] || 'ไม่ระบุ',
        address: item['address'] || item['ที่อยู่'] || '',
        category: cat,
        price: priceValue,
        display_price: displayPrice,
        isEstimatedPrice: isEstimatedPrice,
        rating: rating,
        reviews: reviews,
        base_score: Math.round(compositeScore),
        image: item['imageUrl'] || item['image'] || `https://picsum.photos/seed/${encodeURIComponent(foundTitle)}/400/300`,
        map: item['url'] || item['map'] || item['mapUrl'] || '#',
        source: item['website'] || item['web'] || '#',
        isTrusted: rating >= 4.4 && reviews >= 300,
        pros: rating >= 4.4 && reviews >= 300 
          ? "ข้อมูลน่าเชื่อถือสูงในเชิงสถิติประจักษ์" 
          : isEstimatedPrice 
            ? "ข้อมูลราคาจำลองโดยโมเดล AI (ไม่มีช่วงใบเสร็จระบุหน้าร้าน)" 
            : "ระดับคะแนนสมดุลทั่วไป"
      };

      return processedObj;
    });

    setProcessedData(parsed);
  }, [rawData]);

  // --- INITIAL AUTO LOAD ON MOUNT ---
  useEffect(() => {
    loadData(false);
  }, []);

  // --- AUTOMATIC CATEGORY LIST EXTRACTOR ---
  const availableCategories = useMemo(() => {
    const cats = new Set<string>();
    processedData.forEach(item => {
      if (item.category) cats.add(item.category);
    });
    return Array.from(cats).sort();
  }, [processedData]);

  // --- WEBHOOK TRIGGER WITH ROBUST CONCURRENT scrapers BLOCKING ---
  const triggerScrape = async () => {
    // 1. Double Click / Concurrent Scraper check using synchronous ref and state locks
    if (isScrapingRef.current || isScraping) {
      triggerWin95Alert(
        "สกัดกั้นการทำงานซ้ำซ้อน",
        "⚠️ อัลกอริทึมกำลังเฝ้าตรวจจับข้อมูลอยู่แล้ว!",
        "ระบบกำลังดำเนินงานโต้ตอบกระบวนการ Scraper และตรวจสอบความเสถียรของ Google Sheets อยู่ กรุณารอจนกว่าแผงงานรอบแรกจะประมวลผลเสร็จสิ้น",
        true
      );
      return;
    }

    if (!confirm("ต้องการดึงข้อมูลร้านอาหารชุดใหม่ใช่ไหม?\n\nระบบจะเรียก n8n เพื่อดึงและจัดข้อมูลจากแหล่งเดิม ใช้เวลาประมาณ 1-2 นาที ระหว่างนี้แนะนำให้เปิดหน้านี้ค้างไว้จนกว่าจะเสร็จครับ")) {
      return;
    }

    // Lock Scraping State immediately - disables interface buttons and displays processing indicators
    isScrapingRef.current = true;
    setIsScraping(true);
    setIsLoading(true);
    setLoadingProgress(10);
    setLoadingText("กำลังส่งคำขอไปยัง n8n Webhook...");

    const initialDataString = JSON.stringify(rawData);
    const initialCount = rawData.length;

    // Clear any loose intervals from memory
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }

    try {
      // Trigger Webhook directly. Keep CORS clean.
      await fetch(N8N_WEBHOOK_URL, {
        method: "POST",
        mode: "no-cors",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "start_scrape",
          timestamp: new Date().toISOString(),
          source: "AI_FOOD_DASHBOARD_REACT_V2"
        })
      });

      // Enter the Polling Process immediately
      runPollingProcess(initialDataString, initialCount);
    } catch (e: any) {
      console.error("Webhook trigger failed:", e);
      isScrapingRef.current = false;
      setIsScraping(false);
      setIsLoading(false);
      setLoadingProgress(0);
      triggerWin95Alert(
        "เริ่มดึงข้อมูลไม่สำเร็จ",
        "ยังเชื่อมต่อไปยัง n8n ไม่ได้",
        `เบราว์เซอร์หรือเครือข่ายอาจบล็อกการส่งคำขอไปยัง n8n\n\nรายละเอียด:\n${e.message || e}`,
        true,
        e.stack || ""
      );
    }
  };

  const runPollingProcess = (initialDataString: string, initialCount: number) => {
    let elapsedSeconds = 0;
    const maxSeconds = 90; // Wait up to 90 seconds
    let progress = 15;

    setLoadingProgress(progress);
    setLoadingText(`เริ่มตรวจสอบการคืบหน้าข้อมูลในคลาวด์... (0/${maxSeconds} วินาที)`);

    pollIntervalRef.current = setInterval(async () => {
      elapsedSeconds += 5;
      progress = Math.min(92, 15 + Math.round((elapsedSeconds / maxSeconds) * 77));

      setLoadingProgress(progress);
      setLoadingText(`กำลังรอข้อมูลใหม่จาก Google Maps... (${elapsedSeconds}/${maxSeconds} วินาที)\nn8n กำลังอัปเดตข้อมูลลง Google Sheet...`);

      try {
        const result = await fetchSheetDataPreferred(SHEET_NAME);
        
        if (result && Array.isArray(result.data)) {
          const currentFetchedData = result.data;
          const currentDataString = JSON.stringify(currentFetchedData);

          // If row count or sheet signature changes, we have detected n8n writing new data!
          if (currentDataString !== initialDataString || currentFetchedData.length !== initialCount) {
            if (pollIntervalRef.current) {
              clearInterval(pollIntervalRef.current);
              pollIntervalRef.current = null;
            }

            setLoadingProgress(96);
            setLoadingText("พบข้อมูลใหม่ใน Google Sheets แล้ว กำลังรอให้ระบบเขียนข้อมูลให้ครบอีกสักครู่...");

            // Cooldown delay for n8n to finish writing all rows
            setTimeout(async () => {
              let latestData = currentFetchedData;
              try {
                const finalResult = await fetchSheetDataPreferred(SHEET_NAME);
                setRawData(finalResult.data);
                setDataSource(finalResult.source);
                latestData = finalResult.data;
              } catch (err) {
                setRawData(currentFetchedData);
              }

              setLastUpdatedTime(new Date().toLocaleString("th-TH"));
              isScrapingRef.current = false;
              setIsScraping(false);
              setIsLoading(false);
              setLoadingProgress(0);

              triggerWin95Alert(
                "อัปเดตข้อมูลสำเร็จ",
                "✨ ดึงข้อมูลใหม่และคำนวณคะแนนเรียบร้อยแล้ว",
                `ตอนนี้มีร้านอาหารในระบบ ${latestData.length} ร้าน และระบบได้ตรวจข้อมูลที่ควรทบทวนใหม่แล้วครับ`,
                false
              );

              // Auto Sync Trigger
              if (autoSync) {
                setTimeout(() => cleanDataWithAI(latestData, true), 2000);
              }
            }, 10000);
            return;
          }
        }
      } catch (err) {
        console.warn("Polling request failed in this interval timer cycle. Retrying on next round...", err);
      }

      // Max seconds reached
      if (elapsedSeconds >= maxSeconds) {
        if (pollIntervalRef.current) {
          clearInterval(pollIntervalRef.current);
          pollIntervalRef.current = null;
        }

        // Final pull as fallback
        try {
          const fallbackResult = await fetchSheetDataPreferred(SHEET_NAME);
          setRawData(fallbackResult.data);
        } catch (e) {
          console.error("Final recovery pull failed:", e);
        }

        isScrapingRef.current = false;
        setIsScraping(false);
        setIsLoading(false);
        setLoadingProgress(0);

        triggerWin95Alert(
          "ใช้เวลารอนานกว่าที่กำหนด",
          "⏱️ ระบบหยุดรอข้อมูลใหม่ชั่วคราว",
          `รอครบ ${maxSeconds} วินาทีแล้ว ระบบจึงดึงข้อมูลล่าสุดที่มีมาแสดงให้ก่อน (ตอนนี้มี ${rawData.length} ร้าน) คุณใช้งานต่อได้ทันทีครับ`,
          false
        );
      }
    }, 5000);
  };

  // --- WINDOWS 95 ALERT CONTROL ---
  const triggerWin95Alert = (title: string, msg: string, desc: string, isError = false, details = "") => {
    setAlertState({
      show: true,
      title,
      message: msg,
      desc,
      isError,
      details
    });
  };

  // --- AI DATA CLEANING & SYNC ---
  const saveSettings = (apiKey: string, scriptUrl: string, auto: boolean, model: string) => {
    setGeminiApiKey(apiKey);
    setGeminiModel(model);
    setGoogleScriptUrl(scriptUrl);
    setAutoSync(auto);
    localStorage.setItem("ai_food_gemini_api_key", apiKey);
    localStorage.setItem("ai_food_gemini_model", model);
    localStorage.setItem("ai_food_google_script_url", scriptUrl);
    localStorage.setItem("ai_food_auto_sync", auto.toString());
    setShowSettings(false);
    triggerWin95Alert("บันทึกการตั้งค่า", "✅ บันทึกข้อมูลการตั้งค่าเรียบร้อยแล้ว", "ระบบจะใช้ข้อมูลนี้ในการ Clean ข้อมูลครั้งถัดไปครับ", false);
  };

  const testGeminiConnection = async () => {
    if (!geminiApiKey) {
      triggerWin95Alert("API Key Missing", "⚠️ กรุณาใส่ API Key ก่อนทดสอบ", "", true);
      return;
    }
    
    setIsLoading(true);
    setLoadingText("กำลังทดสอบการเชื่อมต่อกับ Google AI...");
    
    try {
      // Direct fetch to test the key and see available models
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${geminiApiKey}`);
      const data = await response.json();
      
      if (response.ok) {
        const modelNames = data.models ? data.models.map((m: any) => m.name.replace('models/', '')).join(', ') : "No models found";
        triggerWin95Alert(
          "เชื่อมต่อสำเร็จ!", 
          "✅ API Key ของคุณใช้งานได้", 
          `โมเดลที่รองรับในบัญชีของคุณ:\n${modelNames.slice(0, 300)}...`, 
          false
        );
      } else {
        throw new Error(data.error?.message || "Unknown API Error");
      }
    } catch (e: any) {
      triggerWin95Alert("การเชื่อมต่อล้มเหลว", "❌ ตรวจพบข้อผิดพลาดจาก Google API", e.message, true);
    } finally {
      setIsLoading(false);
    }
  };

  const cleanDataWithAI = async (dataToClean: any[] = rawData, skipConfirm: boolean = false) => {
    if (!skipConfirm && !confirm(`✨ คุณต้องการเริ่มกระบวนการ AI Cleaning & Sync ใช่หรือไม่?\n\nระบบจะใช้โมเดล ${geminiModel} ในการประมวลผลข้อมูลดิบทั้งหมด ซึ่งอาจใช้เวลาประมาณ 30-60 วินาทีครับ`)) {
      return;
    }

    if (!geminiApiKey) {
      triggerWin95Alert("ขาดการตั้งค่า API", "⚠️ ไม่พบ Gemini API Key", "กรุณาตั้งค่า API Key ในเมนู Settings ก่อนเริ่มกระบวนการ AI Cleaning ครับ", true);
      setShowSettings(true);
      return;
    }

    if (!googleScriptUrl) {
      triggerWin95Alert("ขาดการตั้งค่า Script", "⚠️ ไม่พบ Google Script URL", "กรุณาตั้งค่า Web App URL ในเมนู Settings เพื่อใช้ในการ Sync ข้อมูลกลับไปยัง Google Sheets ครับ", true);
      setShowSettings(true);
      return;
    }

    if (!dataToClean || dataToClean.length === 0) {
      triggerWin95Alert("ไม่มีข้อมูล", "❌ ไม่พบข้อมูลสำหรับประมวลผล", "กรุณาดึงข้อมูลจากตารางหลักก่อนเริ่ม AI Cleaning ครับ", true);
      return;
    }

    setIsCleaning(true);
    setIsLoading(true);
    setLoadingProgress(10);
    setLoadingText(`AI Gemini กำลังเตรียมข้อมูลดิบ ${dataToClean.length} รายการ...`);

    try {
      const genAI = new GoogleGenerativeAI(geminiApiKey);
      const model = genAI.getGenerativeModel({ model: geminiModel });

      // Batching Configuration for Raw Data
      const BATCH_SIZE = 100; // Larger batches for raw data
      const allCleanedData: any[] = [];
      const totalItems = dataToClean.length;
      const totalBatches = Math.ceil(totalItems / BATCH_SIZE);

      for (let i = 0; i < totalBatches; i++) {
        const start = i * BATCH_SIZE;
        const end = Math.min(start + BATCH_SIZE, totalItems);
        const batchData = dataToClean.slice(start, end);

        setLoadingProgress(10 + Math.round((i / totalBatches) * 75));
        setLoadingText(`AI Gemini กำลังคลีนและคัดร้านซ้ำ Batch ${i + 1}/${totalBatches} (${start + 1}-${end})...`);

        const simplifiedBatch = batchData.map(item => ({
          "title": item['title'] || item['Name'] || item['ชื่อร้าน'] || '',
          "category": item['categoryName'] || item['ประเภท'] || '',
          "price": item['priceRange'] || item['price'] || '',
          "neighborhood": item['neighborhood'] || item['ย่าน'] || '',
          "address": item['address'] || item['ที่อยู่'] || '',
          "score": item['totalScore'] || item['rating'] || '',
          "reviews": item['reviewsCount'] || item['reviews'] || '',
          "mapUrl": item['url'] || item['map'] || item['mapUrl'] || ''
        }));

        const prompt = `You are an AI Data Cleaner. Clean this Thai restaurant list. 
        1. DEDUPLICATE: If multiple entries have the same name, merge them into one.
        2. STANDARDIZE: Categories should be like 'อาหารญี่ปุ่น', 'คาเฟ่', 'ปิ้งย่าง'.
        3. EXTRACT: Price per person as a single number (integer).
        4. FORMAT: Return a JSON array of objects with these keys:
        "ชื่อร้าน", "ประเภท", "ราคาต่อหัว", "ย่าน", "ที่อยู่", "คะแนน", "จำนวนรีวิว", "ลิงก์แผนที่".
        
        IMPORTANT: Use the "title" field for "ชื่อร้าน" and "mapUrl" field for "ลิงก์แผนที่".
        Return ONLY the JSON array.
        
        DATA: ${JSON.stringify(simplifiedBatch)}`;

        const result = await model.generateContent(prompt);
        const response = await result.response;
        const text = response.text();
        
        const jsonMatch = text.match(/\[[\s\S]*\]/);
        if (jsonMatch) {
          const cleanedBatch = JSON.parse(jsonMatch[0]);
          allCleanedData.push(...cleanedBatch);
        }
      }

      // Final Deduplication at the app level to be safe
      const uniqueFinal = new Map();
      allCleanedData.forEach(item => {
        if (item["ชื่อร้าน"]) {
          uniqueFinal.set(item["ชื่อร้าน"], item);
        }
      });
      const finalCleanedData = Array.from(uniqueFinal.values());

      setLoadingProgress(90);
      setLoadingText(`ส่งข้อมูลที่คลีนและคัดออกแล้ว ${finalCleanedData.length} ร้านไปยัง Google Sheets...`);

      // POST to Google Apps Script
      await fetch(googleScriptUrl, {
        method: "POST",
        mode: "no-cors",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(finalCleanedData)
      });

      setLoadingProgress(100);
      setIsCleaning(false);
      setIsLoading(false);

      triggerWin95Alert(
        "AI Sync ข้อมูลดิบสำเร็จ",
        "✨ คลีนและคัดแยกข้อมูล 1,000+ รายการเรียบร้อย",
        `AI ประมวลผลและคัดร้านที่ซ้ำออก เหลือร้านที่สมบูรณ์ ${finalCleanedData.length} ร้าน บันทึกลงชีตเรียบร้อยครับ`,
        false
      );

    } catch (e: any) {
      console.error("AI Cleaning failed:", e);
      setIsCleaning(false);
      setIsLoading(false);
      triggerWin95Alert(
        "AI Cleaning ขัดข้อง",
        "ไม่สามารถประมวลผลข้อมูลดิบได้",
        `รายละเอียด: ${e.message || e}`,
        true
      );
    }
  };

  const closeWin95Alert = () => {
    setAlertState(prev => ({ ...prev, show: false }));
  };

  // --- MULTIDIMENSIONAL FILTER PIPELINE ---
  const areaMapping: { [key: string]: string[] } = {
    'สยาม': ['ปทุมวัน', 'siam', 'pathum wan', 'สยาม', 'ปทุมวัน', 'มาบุญครอง', 'mbk'],
    'อารีย์': ['พญาไท', 'ari', 'phaya thai', 'สามเสน', 'อารีย์'],
    'ทองหล่อ': ['ทองหล่อ', 'thong lo', 'thonglor', 'สุขุมวิท 55'],
    'อโศก': ['อโศก', 'asoke', 'คลองเตยเหนือ', 'terminal 21', 'สุขุมวิท 21'],
    'พร้อมพงษ์': ['พร้อมพงษ์', 'phrom phong', 'สุขุมวิท 39', 'emquartier', 'mquartier']
  };

  const filteredRestaurants = useMemo(() => {
    return processedData.filter(item => {
      // Area mapping match
      let matchArea = selectedArea === "all";
      if (!matchArea && areaMapping[selectedArea]) {
        const keys = areaMapping[selectedArea];
        const content = `${item.area} ${item.name} ${item.address}`.toLowerCase();
        matchArea = keys.some(key => content.includes(key.toLowerCase()));
      }

      // Category match
      const matchCat = selectedCategory === "all" || item.category === selectedCategory;

      // Search match
      const search = searchQuery.toLowerCase().trim();
      const matchSearch = !search || item.name.toLowerCase().includes(search) || 
                          item.category.toLowerCase().includes(search) || 
                          item.area.toLowerCase().includes(search);

      return matchArea && matchCat && matchSearch;
    });
  }, [processedData, selectedArea, selectedCategory, searchQuery]);

  // Scenario Scoring Calculation
  const scenarioFilteredList = useMemo(() => {
    return filteredRestaurants.map(item => {
      const sc = computeScenarioScore(item, selectedScenario);
      return {
        ...item,
        scenario_score: sc.score,
        scenario_parts: sc.parts
      };
    }).sort((a, b) => (b.scenario_score || 0) - (a.scenario_score || 0));
  }, [filteredRestaurants, selectedScenario]);

  // Final rendering list with sorting applied
  const sortedRestaurantsList = useMemo(() => {
    const list = [...scenarioFilteredList];
    list.sort((a, b) => {
      let aVal = a[sortField];
      let bVal = b[sortField];

      if (sortField === "scenario_score") {
        aVal = a.scenario_score || 0;
        bVal = b.scenario_score || 0;
      }

      if (typeof aVal === "string") {
        return sortAscending 
          ? (aVal as string).localeCompare(bVal as string)
          : (bVal as string).localeCompare(aVal as string);
      } else {
        return sortAscending
          ? (aVal as number) - (bVal as number)
          : (bVal as number) - (aVal as number);
      }
    });
    return list;
  }, [scenarioFilteredList, sortField, sortAscending]);

  // Compute stats on filtered list
  const systemStats = useMemo(() => {
    const total = filteredRestaurants.length;
    const avgPrice = total ? Math.round(filteredRestaurants.reduce((sum, item) => sum + item.price, 0) / total) : 0;
    const avgScore = total ? Math.round(filteredRestaurants.reduce((sum, item) => sum + item.base_score, 0) / total) : 0;
    const trustedCount = filteredRestaurants.filter(item => item.isTrusted).length;
    return { total, avgPrice, avgScore, trustedCount };
  }, [filteredRestaurants]);

  // Top 3 Recommendations
  const topThreeRecommendations = useMemo(() => {
    return scenarioFilteredList.slice(0, 3);
  }, [scenarioFilteredList]);

  // --- DETAILED HUMAN REVIEW FLAGS (LOW CONFIDENCE) AGGREGATOR ---
  // Calculates flags dynamically across all matched/filtered restaurants
  const allHumanReviewFlags = useMemo(() => {
    const list: HumanReviewFlag[] = [];
    filteredRestaurants.forEach(item => {
      const itemFlags = getHumanReviewFlags(item);
      list.push(...itemFlags);
    });
    return list;
  }, [filteredRestaurants]);

  // Apply flags filter search and severity
  const filteredHumanReviewFlags = useMemo(() => {
    return allHumanReviewFlags.filter(flag => {
      const matchSeverity = flagFilterSeverity === "all" || flag.severity === flagFilterSeverity;
      const search = flagSearchQuery.toLowerCase().trim();
      const matchSearch = !search || 
                          flag.restaurantName.toLowerCase().includes(search) || 
                          flag.type.toLowerCase().includes(search) || 
                          flag.reason.toLowerCase().includes(search) ||
                          flag.flagCode.toLowerCase().includes(search);
      return matchSeverity && matchSearch;
    }).sort((a, b) => {
      // Sort in order of Severity hierarchy: High -> Medium -> Low
      const weight: { [key: string]: number } = { high: 3, medium: 2, low: 1 };
      return weight[b.severity] - weight[a.severity];
    });
  }, [allHumanReviewFlags, flagFilterSeverity, flagSearchQuery]);

  // --- MARKET INSIGHTS COMPILER ---
  const marketInsights = useMemo(() => {
    if (filteredRestaurants.length === 0) return null;

    const prices = filteredRestaurants.map(x => x.price).filter(x => x > 0).sort((a, b) => a - b);
    const avgPriceValue = systemStats.avgPrice;
    
    // Percentile thresholds
    const getPercentile = (pct: number) => {
      if (!prices.length) return 0;
      const idx = Math.floor((prices.length - 1) * pct);
      return prices[idx];
    };
    
    const p25 = getPercentile(0.25);
    const p50 = getPercentile(0.50);
    const p75 = getPercentile(0.75);

    // Categories Breakdown
    const catCounts: { [key: string]: number } = {};
    filteredRestaurants.forEach(x => {
      catCounts[x.category] = (catCounts[x.category] || 0) + 1;
    });
    const sortedCats = Object.entries(catCounts).sort((a, b) => b[1] - a[1]).slice(0, 5);

    // Target areas mapping statistics
    const targetAreas = ['สยาม', 'อารีย์', 'ทองหล่อ', 'อโศก', 'พร้อมพงษ์'];
    const areaStats = targetAreas.map(a => {
      const keys = areaMapping[a] || [a];
      const itemsInArea = filteredRestaurants.filter(it => {
        const content = `${it.area} ${it.address} ${it.name}`.toLowerCase();
        return keys.some(key => content.includes(key.toLowerCase()));
      });
      const areaPrices = itemsInArea.map(x => x.price).filter(x => x > 0);
      const sumPrices = areaPrices.reduce((s, x) => s + x, 0);
      
      return {
        area: a,
        count: itemsInArea.length,
        avgRating: itemsInArea.length ? round(itemsInArea.reduce((s, x) => s + x.rating, 0) / itemsInArea.length, 2) : 0,
        avgPrice: areaPrices.length ? Math.round(sumPrices / areaPrices.length) : 0
      };
    }).sort((a, b) => b.count - a.count);

    // Balanced candidates
    const balancedSpec = [...filteredRestaurants].sort((a, b) => {
      const scB = computeScenarioScore(b, "default").score;
      const scA = computeScenarioScore(a, "default").score;
      return scB - scA;
    }).slice(0, 5);

    // Safe (trusted reviews) and Hidden Gems (high rating, few reviews)
    const safestList = [...filteredRestaurants].sort((a, b) => b.reviews - a.reviews).slice(0, 5);
    const hiddenGemsList = [...filteredRestaurants]
      .filter(x => x.rating >= 4.5 && x.reviews > 0 && x.reviews < 150)
      .sort((a, b) => b.rating - a.rating)
      .slice(0, 5);

    // Budget Efficiency & Overpriced Warning Threshold
    const budgetValueBest = [...filteredRestaurants].sort((a, b) => computeBudgetEfficiency(b) - computeBudgetEfficiency(a)).slice(0, 5);
    const overpricedWarning = [...filteredRestaurants]
      .filter(x => x.price >= p75)
      .sort((a, b) => {
        const costWeightB = b.price - b.base_score;
        const costWeightA = a.price - a.base_score;
        return costWeightB - costWeightA;
      })
      .slice(0, 5);

    // Advanced Extra metrics calculation
    const totalReviews = filteredRestaurants.reduce((sum, r) => sum + (r.reviews || 0), 0);
    const avgRatingRaw = filteredRestaurants.length ? (filteredRestaurants.reduce((sum, r) => sum + (r.rating || 0), 0) / filteredRestaurants.length) : 0;
    const avgRating = round(avgRatingRaw, 2);

    const pricedRestaurants = filteredRestaurants.filter(x => x.price > 0).sort((a, b) => a.price - b.price);
    const cheapestEst = pricedRestaurants.length > 0 ? pricedRestaurants[0] : null;
    const expensiveEst = pricedRestaurants.length > 0 ? pricedRestaurants[pricedRestaurants.length - 1] : null;

    const topRatedEst = [...filteredRestaurants]
      .filter(x => x.reviews >= 50)
      .sort((a, b) => {
        if (b.rating !== a.rating) return b.rating - a.rating;
        return b.reviews - a.reviews;
      })[0] || [...filteredRestaurants].sort((a, b) => b.rating - a.rating)[0];

    return {
      p25, p50, p75,
      sortedCats,
      areaStats,
      balancedSpec,
      safestList,
      hiddenGemsList,
      budgetValueBest,
      overpricedWarning,
      totalReviews,
      avgRating,
      cheapestEst,
      expensiveEst,
      topRatedEst
    };
  }, [filteredRestaurants, systemStats]);

  // --- VINTAGE CHAT BOT CONVERSATIONAL ENGINE ---
  const handleChatSend = () => {
    const inputClean = chatInput.trim();
    if (!inputClean) return;

    // Append user message immediately
    const userMsg: ChatMessage = {
      id: `user-${Date.now()}`,
      role: "user",
      text: inputClean
    };

    setChatMessages(prev => [...prev, userMsg]);
    setChatInput("");

    // Thinking Cooldown to feel human
    setTimeout(() => {
      const query = inputClean.toLowerCase();
      let reply = "";

      // Simple greetings match
      const greetings = ["สวัสดี", "ทักทาย", "hello", "hi", "ดีครับ", "ดีค่ะ", "หวัดดี"];
      const isGreeting = greetings.some(g => query === g || query.startsWith(g + " ") || query.endsWith(" " + g));

      if (isGreeting) {
        reply = `สวัสดีครับ! ผมช่วยค้นหาร้านจากข้อมูลในระบบนี้ได้ เช่นดูร้านตามย่าน ตามประเภทอาหาร หรืองบต่อคน<br><br>ลองถามประมาณนี้ได้เลย:<br>• <i>"มีร้านเนื้อย่างแถวสยามไหม"</i><br>• <i>"แนะนำคาเฟ่สำหรับวันหยุด"</i><br>• <i>"หาร้านประหยัดแถวอารีย์"</i>`;
      } else {
        // Detect Area Key
        let matchedAreaKey: string | null = null;
        const areasToCheck = {
          "สยาม": ["สยาม", "siam", "ปทุมวัน", "ปทุมวัน", "มาบุญครอง"],
          "อารีย์": ["อารีย์", "ari", "พญาไท", "สามเสน"],
          "ทองหล่อ": ["ทองหล่อ", "thong lo", "thonglor", "สุขุมวิท 55"],
          "อโศก": ["อโศก", "asoke", "สุขุมวิท 21", "terminal 21"],
          "พร้อมพงษ์": ["พร้อมพงษ์", "phrom phong", "สุขุมวิท 39", "emquartier"]
        };

        for (const [key, aliases] of Object.entries(areasToCheck)) {
          if (aliases.some(alias => query.includes(alias))) {
            matchedAreaKey = key;
            break;
          }
        }

        // Detect Category Key
        let matchedCategoryKey: string | null = null;
        const categoriesToCheck = {
          "อาหารญี่ปุ่น": ["ญี่ปุ่น", "japanese", "ซูชิ", "sushi", "ราเมง", "ramen"],
          "อาหารไทย": ["ไทย", "thai", "ส้มตำ", "ก๋วยเตี๋ยว", "ต้มยำ", "ตามสั่ง"],
          "ปิ้งย่าง": ["ปิ้งย่าง", "bbq", "หมูกระทะ", "yakiniku"],
          "ชาบู": ["ชาบู", "shabu", "สุกี้", "หม้อไฟ"],
          "คาเฟ่": ["คาเฟ่", "cafe", "กาแฟ", "coffee", "เบเกอรี่", "ของหวาน"],
          "อิตาเลียน": ["อิตาเลียน", "italian", "สเต็ก", "steak", "พาสต้า"]
        };

        for (const [key, aliases] of Object.entries(categoriesToCheck)) {
          if (aliases.some(alias => query.includes(alias))) {
            matchedCategoryKey = key;
            break;
          }
        }

        // Detect specific restaurants in memory
        const matchedItem = processedData.find(item => query.includes(item.name.toLowerCase()));

        // Chatter Deflection Guard: Filter out general social chit-chat to keep search focused strictly on data
        const isRecommendationQuery = query.includes("แนะนำ") || query.includes("มีร้าน") || query.includes("หาร้าน") || query.includes("ไหนดี") || query.includes("ขอร้าน") || query.includes("ค้นหา");
        
        if (!matchedAreaKey && !matchedCategoryKey && !matchedItem && !isRecommendationQuery) {
          reply = `ตอนนี้ผมตอบได้ดีที่สุดเมื่อถามเรื่องร้านอาหารในฐานข้อมูลนี้ครับ<br><br>ลองใส่ชื่อย่าน ประเภทอาหาร หรือชื่อร้าน เช่น:<br>• <i>"แนะนำร้านเด็ดทองหล่อ"</i><br>• <i>"ชาบูแถวอโศก"</i><br>• <i>"หาร้านประหยัดพร้อมพงษ์"</i>`;
        } else if (matchedItem) {
          const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(matchedItem.name + ' ราคา เมนู อาหาร')}`;
          const isEstimateMsg = matchedItem.isEstimatedPrice 
            ? `~${matchedItem.price}฿/คน (ประมาณการโดย AI) <a href="${searchUrl}" target="_blank" class="text-blue-700 underline text-[10px] ml-1">🔍 ตรวจสอบรูปภาพเมนูจริง</a>` 
            : `${matchedItem.price}฿/คน`;

          reply = `🤖 <b>พบร้าน "${matchedItem.name}" ในระบบครับ</b><br><br>
                   📍 <b>ย่าน:</b> ${matchedItem.area}<br>
                   🍲 <b>ประเภทอาหาร:</b> ${matchedItem.category}<br>
                   ⭐ <b>เรตติ้งปัจจุบัน:</b> ${matchedItem.rating} ดาว (${matchedItem.reviews} รีวิวสะสม)<br>
                   💰 <b>งบคร่าวๆ:</b> ${isEstimateMsg}<br>
                   🎯 <b>AI Decision Score:</b> ${matchedItem.base_score}% คะแนนความคุ้มค่าโดยรวม<br>
                   ⚡ <b>จุดวิเคราะห์:</b> ${matchedItem.pros}<br><br>
                   <div class="flex gap-2.5 mt-2">
                     <a href="${matchedItem.map}" target="_blank" class="win95-button text-[9px] font-bold text-center inline-block">🗺️ พิกัด Google Maps</a>
                     <a href="${matchedItem.source}" target="_blank" class="win95-button text-[9px] text-center inline-block">🌐 ช่องทางติดต่อร้าน</a>
                   </div>`;
        } else {
          // General search matching combinations
          let candidates = [...processedData];
          
          if (matchedAreaKey) {
            const keys = areaMapping[matchedAreaKey] || [matchedAreaKey];
            candidates = candidates.filter(item => {
              const content = `${item.area} ${item.address} ${item.name}`.toLowerCase();
              return keys.some(key => content.includes(key.toLowerCase()));
            });
          }

          if (matchedCategoryKey) {
            candidates = candidates.filter(item => item.category.includes(matchedCategoryKey!));
          }

          // Sort by base score and return top results
          candidates.sort((a, b) => b.base_score - a.base_score);

          if (candidates.length > 0) {
            const resultsSlice = candidates.slice(0, 3);
            let responseTitle = "✨ <b>ร้านที่น่าสนใจตามสิ่งที่คุณถาม:</b><br>";
            
            if (matchedAreaKey && matchedCategoryKey) {
              responseTitle = `✨ <b>ร้าน${matchedCategoryKey}แถว${matchedAreaKey}ที่น่าสนใจ:</b><br>`;
            } else if (matchedAreaKey) {
              responseTitle = `✨ <b>ร้านเด่นแถว${matchedAreaKey}:</b><br>`;
            } else if (matchedCategoryKey) {
              responseTitle = `✨ <b>ร้านหมวด${matchedCategoryKey}ที่น่าลอง:</b><br>`;
            }

            reply = responseTitle + "<div class='flex flex-col gap-2 mt-2'>";
            resultsSlice.forEach((item, idx) => {
              const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(item.name + ' ราคา เมนู อาหาร')}`;
              const pStr = item.isEstimatedPrice 
                ? `~${item.price}฿ (AI ประมาณการ) <a href="${searchUrl}" target="_blank" class="text-blue-700 underline text-[10px] ml-0.5">🔍</a>` 
                : `${item.price}฿`;

              reply += `
                <div class="border-b border-gray-400 pb-2 mb-1 last:border-b-0 last:pb-0 font-sans">
                  <b>${idx + 1}. ⭐ ${item.name}</b> (ย่าน${item.area})<br>
                  <span class="text-[10px] text-gray-700">หมวด: ${item.category} | รีวิวสะสม: ${item.reviews} ครั้ง</span><br>
                  <span class="text-[10px] text-gray-800">เรตติ้ง: <b>${item.rating}</b>⭐ | บิลเฉลี่ย: <b>${pStr}</b> | AI Score: <b>${item.base_score}%</b></span><br>
                  💡 <span class="text-[10px] italic text-amber-900">${item.pros}</span>
                  <div class="flex gap-1.5 mt-1.5">
                    <a href="${item.map}" target="_blank" class="win95-button text-[8px] py-0 px-1 inline-block font-bold">🗺️ Maps</a>
                    <a href="${item.source}" target="_blank" class="win95-button text-[8px] py-0 px-1 inline-block">🌐 Web</a>
                  </div>
                </div>
              `;
            });
            reply += "</div>";

            if (candidates.length > 3) {
              reply += `<p class="text-[9px] text-gray-600 text-right mt-1">*ยังมีร้านที่เข้าเงื่อนไขอีก ${candidates.length - 3} ร้าน ดูต่อได้ในตารางหลักครับ</p>`;
            }
          } else {
            reply = `😅 ยังไม่พบร้านที่ตรงกับเงื่อนไข <b>${matchedAreaKey || ""}</b> <b>${matchedCategoryKey || ""}</b> ในข้อมูลชุดนี้ครับ<br><br>ลองเปลี่ยนคำค้น เลือกย่านกว้างขึ้น หรือดูจากตัวกรองด้านซ้ายได้เลย`;
          }
        }
      }

      setChatMessages(prev => [...prev, {
        id: `ai-${Date.now()}`,
        role: "ai",
        text: reply
      }]);
    }, 850);
  };

  return (
    <div className="p-2 md:p-4 min-h-screen">
      {/* --- RETRO PROGRESS LOADER OVERLAY --- */}
      {isLoading && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-70">
          <div className="win95-window p-4 w-72 md:w-96 select-none animate-fade-in">
            <div className="win95-title-bar mb-4">
              <span>AI System Processing Control 2.0</span>
            </div>
            <p className="text-xs font-bold leading-tight mb-3 text-black whitespace-pre-line">
              {loadingText}
            </p>
            <div className="win95-inset h-5 w-full bg-gray-200 overflow-hidden relative">
              <div 
                className="h-full bg-[#000080] transition-all duration-300"
                style={{ width: `${loadingProgress}%` }}
              />
              <span className="absolute inset-0 flex items-center justify-center text-[10px] font-black text-black select-none">
                {loadingProgress}%
              </span>
            </div>
            {isScraping && (
              <div className="mt-3 text-[9.5px] text-red-800 font-extrabold text-center uppercase space-y-1.5 leading-relaxed bg-red-50 p-1.5 border border-red-300">
                <div className="animate-pulse">🚨 ห้ามกดสแปมทริกเกอร์เด็ดขาด / ระบบคลาวด์ n8n กำลังทำงาน</div>
                <div className="text-gray-900 border-t border-red-200 pt-1 text-[8.5px] font-bold normal-case">
                  ⚠️ คำเตือน: กรุณาอย่ารีเฟรชหน้าเว็บ หรือสลับหน้าต่างเบราเซอร์กะทันหันขณะระบบกำลังดึงข้อมูลและคลีนเซ็ตข้อมูล เพื่อป้องกันการขัดข้อง
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* --- WINDOWS 95 MICROSOFT ALERT MODAL --- */}
      {alertState.show && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-60">
          <div className="win95-window w-80 md:w-110 p-1 max-w-[95vw] win95-shake relative">
            <div className={`win95-title-bar ${alertState.isError ? "bg-red-700" : "bg-blue-800"} text-white font-bold p-1 text-xs`}>
              <span>{alertState.title}</span>
              <button 
                onClick={closeWin95Alert}
                className="control-btn"
              >
                X
              </button>
            </div>
            <div className="p-4 flex gap-3 items-start bg-[#c0c0c0]">
              <div className={`flex-shrink-0 w-9 h-9 ${alertState.isError ? "bg-red-600" : "bg-blue-600"} rounded-full border-2 border-white flex items-center justify-center text-white font-black text-lg shadow-md`}>
                {alertState.isError ? "✕" : "ℹ️"}
              </div>
              <div className="flex-1 text-xs text-black leading-normal font-sans">
                <p className="font-bold text-sm mb-1.5">{alertState.message}</p>
                <p className="text-gray-800 mb-2 whitespace-pre-line text-[11px] leading-relaxed">{alertState.desc}</p>
                
                {alertState.details && (
                  <div className="mt-2.5">
                    <span className="text-[9px] uppercase font-bold text-gray-700 block mb-1">Technical Debug Params:</span>
                    <textarea 
                      readOnly 
                      value={alertState.details}
                      className="w-full h-24 p-1.5 bg-white border border-gray-400 font-mono text-[9px] text-red-700 resize-none win95-inset"
                    />
                  </div>
                )}
              </div>
            </div>
            <div className="p-2 flex justify-end gap-2 bg-[#c0c0c0] border-t border-gray-400 pt-3">
              <button 
                onClick={closeWin95Alert}
                className="win95-button font-bold text-xs min-w-[70px]"
              >
                OK
              </button>
            </div>
          </div>
        </div>
      )}

      {/* --- WINDOWS 95 SETTINGS MODAL --- */}
      {showSettings && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="win95-window w-96 p-1 max-w-[95vw]">
            <div className="win95-title-bar bg-blue-800 text-white font-bold p-1 text-xs flex justify-between items-center">
              <span>⚙️ AI Cleaning Settings</span>
              <button 
                onClick={() => setShowSettings(false)}
                className="control-btn"
              >
                X
              </button>
            </div>
            <div className="p-4 bg-[#c0c0c0] space-y-4">
              <div className="space-y-1.5">
                <label className="text-[11px] font-bold text-black flex items-center gap-1">
                  <Sparkles className="w-3 h-3 text-amber-700" />
                  <span>Google Gemini API Key:</span>
                </label>
                <div className="flex gap-2">
                  <input 
                    type="password"
                    value={geminiApiKey}
                    onChange={(e) => setGeminiApiKey(e.target.value)}
                    placeholder="Paste your API Key here..."
                    className="flex-1 win95-inset bg-white p-1.5 text-xs outline-none focus:border-blue-800"
                  />
                  <button 
                    onClick={testGeminiConnection}
                    className="win95-button text-[10px] px-2 font-bold whitespace-nowrap"
                  >
                    Test Key
                  </button>
                </div>
                <p className="text-[9px] text-gray-700">Get your key from <a href="https://aistudio.google.com/app/apikey" target="_blank" className="text-blue-700 underline">Google AI Studio</a></p>
              </div>

              <div className="space-y-1.5">
                <label className="text-[11px] font-bold text-black flex items-center gap-1">
                  <Sparkles className="w-3 h-3 text-purple-700" />
                  <span>AI Model (เลือกเพื่อแก้ปัญหา 404):</span>
                </label>
                <select 
                  value={geminiModel}
                  onChange={(e) => setGeminiModel(e.target.value)}
                  className="w-full win95-inset bg-white p-1.5 text-xs outline-none focus:border-blue-800 font-bold"
                >
                  <option value="gemini-2.0-flash">gemini-2.0-flash (แนะนำ - ล่าสุด)</option>
                  <option value="gemini-2.5-flash">gemini-2.5-flash (ทรงพลังที่สุด)</option>
                  <option value="gemini-2.0-flash-lite">gemini-2.0-flash-lite (ประหยัดพลังงาน)</option>
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="text-[11px] font-bold text-black flex items-center gap-1">
                  <Database className="w-3 h-3 text-green-700" />
                  <span>Google Apps Script URL:</span>
                </label>
                <input 
                  type="text"
                  value={googleScriptUrl}
                  onChange={(e) => setGoogleScriptUrl(e.target.value)}
                  placeholder="https://script.google.com/macros/s/.../exec"
                  className="w-full win95-inset bg-white p-1.5 text-xs outline-none focus:border-blue-800"
                />
              </div>

              <div className="flex items-center gap-2 select-none">
                <input 
                  type="checkbox"
                  id="autoSyncCheck"
                  checked={autoSync}
                  onChange={(e) => setAutoSync(e.target.checked)}
                  className="w-4 h-4 cursor-pointer"
                />
                <label htmlFor="autoSyncCheck" className="text-[11px] font-bold text-black cursor-pointer">
                  เปิดระบบ AI Sync อัตโนมัติหลังจาก Scrape เสร็จ
                </label>
              </div>

              <div className="p-2 bg-yellow-100 border border-yellow-500 text-[10px] text-gray-800 leading-tight">
                💡 ข้อมูล API Key จะถูกเก็บไว้ในเครื่องของคุณ (LocalStorage) เพื่อความปลอดภัย และจะไม่ถูกส่งไปยังเซิร์ฟเวอร์อื่นๆ ยกเว้น Google Gemini API
              </div>
            </div>
            <div className="p-2 flex justify-end gap-2 bg-[#c0c0c0] border-t border-gray-400 pt-3">
              <button 
                onClick={() => setShowSettings(false)}
                className="win95-button font-bold text-xs min-w-[70px]"
              >
                Cancel
              </button>
              <button 
                onClick={() => saveSettings(geminiApiKey, googleScriptUrl, autoSync, geminiModel)}
                className="win95-button bg-blue-700 text-white font-bold text-xs min-w-[80px]"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      {/* --- WINDOWS 95 RETRO RESTAURANT DETAILS MODAL --- */}
      {selectedRestaurant && (() => {
        const customScenarioScoreValue = selectedRestaurant.scenario_score || selectedRestaurant.base_score;
        const confidenceObject = computeConfidence(selectedRestaurant);
        const operationalRiskObject = computeOperationalRisk(selectedRestaurant);
        const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(selectedRestaurant.name + ' ราคา เมนู อาหาร')}`;
        
        return (
          <div 
            className="fixed inset-0 bg-black/60 flex items-center justify-center z-55 p-4"
            onClick={() => setSelectedRestaurant(null)}
          >
            <div 
              className="win95-window w-full max-w-lg p-1 relative shadow-2xl animate-in fade-in duration-100"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Title Bar */}
              <div className="win95-title-bar bg-[#000080] text-white font-bold p-1 px-2 text-xs flex justify-between items-center select-none gap-2">
                <div className="flex items-center gap-1.5 font-black min-w-0 flex-1">
                  <Sparkles className="w-3.5 h-3.5 text-yellow-300 fill-yellow-300 animate-pulse flex-shrink-0" />
                  <span className="truncate">📋 แฟ้มข้อมูลร้านค้า: {selectedRestaurant.name}</span>
                </div>
                <button 
                  onClick={() => setSelectedRestaurant(null)}
                  className="control-btn"
                >
                  X
                </button>
              </div>

              {/* Contents Area */}
              <div className="p-3 bg-[#c0c0c0] text-black font-sans text-xs space-y-3.5 max-h-[85vh] overflow-y-auto scroll-win95">
                
                {/* Header Section with Name / Address */}
                <div className="flex justify-between items-start border-b border-gray-400 pb-2 gap-2">
                  <div className="flex-1 min-w-0">
                    <h2 className="text-sm font-black text-gray-900 tracking-tight uppercase break-words leading-tight">{selectedRestaurant.name}</h2>
                    <span className="text-[10px] text-gray-700 font-mono mt-0.5 block break-words">📍 ที่อยู่ค้า: {selectedRestaurant.address || "ดูพิกัดได้ในแผนที่ด้านล่าง"}</span>
                  </div>
                  <span className="text-[10px] bg-white text-[#000080] border border-gray-400 px-1.5 py-0.5 font-black shrink-0 shadow">
                    AI SCORE: {customScenarioScoreValue}%
                  </span>
                </div>

                {/* Hero Image Frame */}
                {selectedRestaurant.image && (
                  <div className="h-44 win95-inset overflow-hidden relative bg-black select-none">
                    <img 
                      src={selectedRestaurant.image} 
                      alt={selectedRestaurant.name} 
                      className="w-full h-full object-cover filter grayscale-[0.05]"
                      referrerPolicy="no-referrer"
                    />
                    <div className="absolute top-2 left-2 flex gap-1.5">
                      {selectedRestaurant.isTrusted && (
                        <span className="badge bg-purple-600 text-white font-bold border-white">High Trust Verified</span>
                      )}
                      {selectedRestaurant.isEstimatedPrice && (
                        <span className="badge bg-yellow-400 text-black border-black font-bold">AI Price Estimator</span>
                      )}
                    </div>
                  </div>
                )}

                {/* Mini Grid Stats (Rating, Price, Match Score) */}
                <div className="grid grid-cols-3 gap-2">
                  <div className="win95-inset bg-blue-50/70 p-2 text-center select-none">
                    <div className="text-[7.5px] uppercase text-gray-500 font-bold mb-0.5">Rating (คะแนน)</div>
                    <div className="text-[11px] font-black text-blue-800">{selectedRestaurant.rating} ⭐</div>
                    <div className="text-[9px] text-gray-500">({selectedRestaurant.reviews} รีวิว)</div>
                  </div>
                  <div className="win95-inset bg-green-50/70 p-2 text-center select-none">
                    <div className="text-[7.5px] uppercase text-gray-500 font-bold mb-0.5">Price Range (ราคา)</div>
                    <div className="text-[11px] font-black text-green-800 flex justify-center items-center gap-0.5">
                      <span>{selectedRestaurant.display_price}</span>
                      {selectedRestaurant.isEstimatedPrice && (
                        <a 
                          href={searchUrl} 
                          target="_blank" 
                          rel="noopener noreferrer" 
                          className="text-blue-600 font-normal hover:underline text-[10px]" 
                          title="ค้นหาราคาและเมนูจริง"
                          onClick={(e) => e.stopPropagation()}
                        >
                          🔍
                        </a>
                      )}
                    </div>
                    <div className="text-[9px] text-gray-500">(ต่อคน/Person)</div>
                  </div>
                  <div className="win95-inset bg-amber-50/70 p-2 text-center select-none">
                    <div className="text-[7.5px] uppercase text-gray-500 font-bold mb-0.5">Base score</div>
                    <div className="text-[11px] font-black text-amber-800">{selectedRestaurant.base_score}%</div>
                    <div className="text-[9px] text-gray-500">(Standard Index)</div>
                  </div>
                </div>

                {/* Metadata Column Area */}
                <div className="bg-gray-100 border border-gray-400 p-2 space-y-1.5 text-xs text-gray-800">
                  <p className="flex items-center gap-1.5 border-b border-gray-200 pb-1">
                    <span className="text-[#000080] font-black">📍 พิกัดย่าน (Area):</span> 
                    <span className="font-extrabold text-gray-900 underline">{selectedRestaurant.area}</span>
                  </p>
                  <p className="flex items-center gap-1.5 border-b border-gray-200 pb-1">
                    <span className="text-gray-800 font-black">🍲 ประเภทอาหาร (Category):</span> 
                    <span className="badge bg-slate-200 text-gray-900 font-bold">{selectedRestaurant.category}</span>
                  </p>
                  <p className="flex items-center gap-1.5">
                    <span className="text-amber-900 font-bold">💡 จุดเด่นจุดประสงค์ (Pros):</span> 
                    <span className="font-medium text-amber-950 italic">{selectedRestaurant.pros || "ผ่านการประเมินจากระบบ AI แนะนำสโมสรผู้บริโภค"}</span>
                  </p>
                </div>

                {/* Operational Safety and Technical Indices */}
                <div className="flex flex-wrap gap-1.5 py-0.5 select-none">
                  <span className={`badge px-2 py-0.5 border text-[10px] font-bold leading-none ${confidenceObject.confidence >= 75 ? "bg-green-100 text-green-800 border-green-500" : confidenceObject.confidence >= 50 ? "bg-orange-100 text-orange-850 border-orange-500" : "bg-red-100 text-red-800 border-red-500"}`} title={confidenceObject.reasons.join('\n')}>
                    🛡️ ดัชนีความเสถียร (Confidence): {confidenceObject.confidence}%
                  </span>
                  <span className={`badge px-2 py-0.5 border text-[10px] font-bold leading-none ${operationalRiskObject.level === "ต่ำ" ? "bg-green-100 text-green-800 border-green-500" : operationalRiskObject.level === "กลาง" ? "bg-orange-100 text-orange-855 border-orange-500" : "bg-red-100 text-red-800 border-red-500"}`}>
                    ⚠️ ระดับความเสี่ยง (Risk): {operationalRiskObject.level}
                  </span>
                </div>

                {/* DEEP WHY DETAILED SCORES ACCORDION */}
                <div className="win95-inset bg-white p-2 text-xs space-y-2 text-gray-800 leading-relaxed">
                  <span className="font-black text-[#000080] block mb-1">
                    🔬 รายละเอียดสัดส่วนคะแนนแยกตามหัวข้อ ({selectedScenario}):
                  </span>
                  <div className="grid grid-cols-2 gap-1 text-[9.5px]">
                    <div className="bg-blue-50/50 p-1 win95-inset">คะแนนรีวิวร้าน (Quality): {(selectedRestaurant.scenario_parts?.quality || 0).toFixed(0)}%</div>
                    <div className="bg-purple-50/50 p-1 win95-inset">คะแนนความนิยม (Popularity): {(selectedRestaurant.scenario_parts?.popularity || 0).toFixed(0)}%</div>
                    <div className="bg-green-50/50 p-1 win95-inset">คะแนนความคุ้มค่าเงิน (Budget): {(selectedRestaurant.scenario_parts?.budget || 0).toFixed(0)}%</div>
                    <div className="bg-amber-50/50 p-1 win95-inset">ความสอดคล้องประเภท (Category Fit): {(selectedRestaurant.scenario_parts?.categoryFit || 0).toFixed(0)}%</div>
                  </div>
                  <div className="win95-inset p-1.5 bg-gray-50 text-[10px] text-gray-600 mt-1">
                    📃 ข้อมูลดิบยืนยัน: ย่าน {selectedRestaurant.area} | คะแนน {selectedRestaurant.rating}⭐ | ผู้รีวิว {selectedRestaurant.reviews} บัญชี
                  </div>
                </div>

                {/* External Action Links (Buttons style retro) */}
                <div className="flex flex-col sm:flex-row gap-2 pt-1">
                  {selectedRestaurant.map ? (
                    <a 
                      href={selectedRestaurant.map} 
                      target="_blank" 
                      rel="noopener noreferrer" 
                      className="win95-button py-1.5 px-3 text-xs flex-1 text-center font-black flex items-center justify-center gap-1 bg-gray-200 hover:bg-gray-300"
                    >
                      <MapPin className="w-3.5 h-3.5 text-red-600" />
                      <span>เปิดนำทางด่าน Google Map 🗺️</span>
                    </a>
                  ) : null}
                  {selectedRestaurant.source && selectedRestaurant.source.startsWith('http') ? (
                    <a 
                      href={selectedRestaurant.source} 
                      target="_blank" 
                      rel="noopener noreferrer" 
                      className="win95-button py-1.5 px-3 text-xs flex-1 text-center font-black flex items-center justify-center gap-1 bg-gray-200 hover:bg-gray-300"
                    >
                      <ExternalLink className="w-3.5 h-3.5 text-blue-900" />
                      <span>เปิดชมเว็ปไซต์หลัก / เพจร้าน 🌐</span>
                    </a>
                  ) : null}
                </div>

                {/* Close modal controller button footer */}
                <div className="flex justify-end pt-1 bg-transparent">
                  <button 
                    onClick={() => setSelectedRestaurant(null)}
                    className="win95-button px-5 py-1 text-xs font-bold active:translate-y-0.5"
                  >
                    ปิด (Close File)
                  </button>
                </div>

              </div>
            </div>
          </div>
        );
      })()}

      {/* --- MAIN RETRO CONTAINER --- */}
      <div className="max-w-7xl mx-auto win95-window">
        {/* HEADER SECTION */}
        <header className="win95-title-bar flex flex-col md:flex-row gap-4 py-4 px-6 border-b-2 border-black">
          <div className="flex flex-col justify-center">
            <h1 className="text-xl md:text-3xl font-black tracking-tight select-none flex items-center gap-2">
              <span>AI FOOD ASSISTANT</span>
              <span className="bg-red-600 text-white text-[10px] md:text-xs font-black px-2 py-0.5 border border-white rounded shadow-sm align-middle animate-pulse">
                AI
              </span>
            </h1>
          </div>
          <div className="flex flex-col items-end gap-1.5 text-right md:ml-auto">
            <div className="flex flex-wrap gap-1 mb-1 justify-end">
              <span className="badge bg-blue-105 text-blue-850 border-blue-400 font-bold select-none text-[10px]">n8n</span>
              <span className="badge bg-amber-105 text-amber-900 border-amber-600 font-bold select-none text-[10px]">Apify</span>
              <span className="badge bg-orange-105 text-orange-850 border-orange-400 font-bold select-none text-[10px]">Google Sheet</span>
              <span className="badge bg-purple-105 text-purple-800 border-purple-400 font-bold select-none text-[10px]">Google Gemini CLI</span>
              <span className="badge bg-green-105 text-green-800 border-green-400 font-bold select-none text-[10px]">Antigravity IDE</span>
            </div>
            <p className="text-xs font-bold text-white">ผู้จัดทำ: นาย ธีรเมธ แซ่เบ้</p>
            <p className="text-xs font-bold text-white">วันที่จัดทำ: 28/05/2026</p>

            {/* Scrape trigger button with disabled control locks and styling states */}
            <div className="flex flex-wrap gap-2 mt-1 w-full md:w-auto justify-end">
              <button
                onClick={() => setShowSettings(true)}
                className="win95-button bg-gray-200 text-black font-bold text-xs flex items-center justify-center gap-1 leading-none"
                title="ตั้งค่า API และ Webhook"
              >
                <Settings className="w-3.5 h-3.5" />
                <span>⚙️ ตั้งค่า</span>
              </button>

              <button
                onClick={() => cleanDataWithAI()}
                disabled={isCleaning || isLoading || isScraping}
                className={`win95-button bg-purple-700 text-white font-bold text-xs flex items-center justify-center gap-1 leading-none ${isCleaning ? "opacity-60" : "hover:bg-purple-800"}`}
                title="ทำความสะอาดข้อมูลด้วย AI และส่งไปยัง Google Sheet"
              >
                {isCleaning ? (
                  <>
                    <span className="inline-block w-2.5 h-2.5 rounded-full bg-white animate-ping mr-1" />
                    <span>AI กำลังประมวลผล...</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>✨ AI Clean & Sync</span>
                  </>
                )}
              </button>

              <button
                onClick={triggerScrape}
                disabled={isScraping || isLoading || isCleaning}
                className={`win95-button bg-yellow-400 text-black font-bold text-xs flex items-center justify-center gap-1 leading-none ${isScraping ? "opacity-60 cursor-not-allowed" : "hover:scale-102"}`}
              >
                {isScraping ? (
                  <>
                    <span className="inline-block w-2.5 h-2.5 rounded-full bg-red-600 animate-ping mr-1" />
                    <span>กำลังดึงข้อมูลผ่าน n8n...</span>
                  </>
                ) : (
                  <>
                    <RotateCcw className="w-3.5 h-3.5 animate-spin-slow" />
                    <span>🔄 ดึงข้อมูลร้านใหม่</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </header>

        {/* RETRO ANNOUNCEMENT TICKER */}
        <div className="bg-[#c0c0c0] px-4 pt-3 pb-1 border-b border-gray-400">
          <div className="win95-inset bg-[#ffffe1] text-xs py-1.5 px-3 flex items-center justify-between gap-3 overflow-hidden shadow-inner select-none border border-gray-500">
            <span className="font-extrabold text-[#000080] shrink-0 flex items-center gap-1.5 border-r border-gray-400 pr-3 bg-yellow-300 px-1 border border-black shadow">
              📢 ประกาศ / BULLETIN:
            </span>
            <div className="flex-1 min-w-0 overflow-hidden">
              <RetroMarquee scrollamount="3" behavior="scroll" direction="left" className="font-extrabold text-gray-900 block">
                แหล่งข้อมูล: <span className="text-[#000080] uppercase font-black underline decoration-double">{dataSource || "กำลังดึงข้อมูล..."}</span> &nbsp;&nbsp;&nbsp;&nbsp;•&nbsp;&nbsp;&nbsp;&nbsp; อัปเดตล่าสุด: <span className="text-red-700 font-extrabold">{lastUpdatedTime || "ไม่มีข้อมูล"}</span> &nbsp;&nbsp;&nbsp;&nbsp;•&nbsp;&nbsp;&nbsp;&nbsp; เลือกร้านจากย่าน ประเภทอาหาร ราคา รีวิว และคะแนนแนะนำได้ในหน้าเดียว
              </RetroMarquee>
            </div>
          </div>
        </div>

        {/* CONTROLS & MAIN DATABASE CONTAINER AND DOCK */}
        <div className="p-4 bg-[#c0c0c0] grid grid-cols-1 lg:grid-cols-12 gap-4">
          
          {/* SIDEBAR FILTERS CLOUD */}
          <aside className="lg:col-span-3 flex flex-col gap-4">
            
            {/* Mobile collapsible Toggle Header */}
            <div className="lg:hidden win95-window p-1">
              <button
                onClick={() => setShowMobileFilters(!showMobileFilters)}
                className="w-full win95-button bg-blue-800 text-white font-bold text-xs py-2 px-3 flex items-center justify-between gap-2 select-none"
              >
                <div className="flex items-center gap-1.5 text-left text-white">
                  <Filter className="w-3.5 h-3.5" />
                  <span>📍 ตั้งค่าตัวกรองและดึงข้อมูล</span>
                </div>
                <span className="bg-gray-300 text-black px-1.5 border border-black text-[10px] uppercase font-black">
                  {showMobileFilters ? "ปิดตัวกรอง ▲" : "เปิดตัวกรอง ▼"}
                </span>
              </button>
            </div>

            <div className={`${showMobileFilters ? "flex" : "hidden"} lg:flex flex-col gap-4`}>
              {/* AREA FILTER */}
              <div className="win95-window p-3">
                <div className="win95-title-bar mb-2 select-none">
                  <div className="flex items-center gap-1.5">
                    <MapPin className="w-3.5 h-3.5" />
                   <span>📍 เลือกย่าน</span>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2 p-2 win95-inset bg-gray-50 max-h-56 overflow-y-auto scroll-win95">
                  <button
                    onClick={() => setSelectedArea("all")}
                    className={`win95-button text-xs font-bold flex-1 text-center py-1 min-w-[70px] ${selectedArea === "all" ? "win95-active font-black bg-[#e0e0e0]" : ""}`}
                  >
                    ทั้งหมด ({processedData.length})
                  </button>
                  {Object.keys(areaMapping).map(area => {
                    const countInArea = processedData.filter(item => {
                      const keys = areaMapping[area];
                      const content = `${item.area} ${item.name} ${item.address}`.toLowerCase();
                      return keys.some(key => content.includes(key.toLowerCase()));
                    }).length;
                    
                    return (
                      <button
                        key={area}
                        onClick={() => setSelectedArea(area)}
                        className={`win95-button text-xs font-bold py-1 px-1.5 min-w-[85px] truncate text-center ${selectedArea === area ? "win95-active font-black bg-[#e0e0e0]" : ""}`}
                      >
                        {area} ({countInArea})
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* CATEGORY SELECTOR */}
              <div className="win95-window p-3">
                <div className="win95-title-bar mb-2 select-none">
                  <div className="flex items-center gap-1.5">
                    <Layers className="w-3.5 h-3.5" />
                    <span>📊 ประเภทอาหาร</span>
                  </div>
                </div>
                <div className="p-1">
                  <select
                    value={selectedCategory}
                    onChange={(e) => setSelectedCategory(e.target.value)}
                    className="w-full p-1.5 font-bold win95-inset text-xs bg-white text-black outline-none focus:border-amber-600"
                  >
                    <option value="all">แสดงทุกประเภท ({availableCategories.length})</option>
                    {availableCategories.map(cat => {
                      const countInCat = processedData.filter(item => item.category === cat).length;
                      return (
                        <option key={cat} value={cat}>
                          {cat} ({countInCat})
                        </option>
                      );
                    })}
                  </select>
                </div>
              </div>

              {/* QUICK SEED METADATA */}
              <div className="win95-window p-3 select-none">
                <div className="win95-title-bar mb-2">
                  <div className="flex items-center gap-1.5">
                    <Database className="w-3.5 h-3.5" />
                    <span>🗄️ ข้อมูลที่ระบบจัดให้</span>
                  </div>
                </div>
                <div className="win95-inset p-2.5 bg-white text-[11px] leading-relaxed text-gray-800 space-y-1">
                  <p>• <b>ตัดรายชื่อซ้ำ:</b> แสดงร้านแต่ละแห่งเพียงครั้งเดียว</p>
                  <p>• <b>จัดตามย่าน:</b> อ่านทำเลได้ง่ายขึ้นจากข้อมูลที่อยู่</p>
                  <p>• <b>เตือนข้อมูลน้อย:</b> ช่วยบอกว่าร้านไหนควรตรวจเพิ่ม</p>
                  <p>• <b>ประมาณราคา:</b> เติมช่วงราคาคร่าวๆ เมื่อในชีตยังไม่มีข้อมูล</p>
                </div>
              </div>

              {/* GOOGLE SHEETS REFRESH BUTTON */}
              <div className="win95-window p-3">
                <div className="win95-title-bar mb-2 select-none">
                  <div className="flex items-center gap-1.5">
                    <Database className="w-3.5 h-3.5" />
                    <span>🔄 จัดการข้อมูล Google Sheet</span>
                  </div>
                </div>
                <button
                  onClick={() => loadData(true, true)}
                  disabled={isLoading || isScraping}
                  className="w-full win95-button bg-green-700 text-white font-bold text-xs py-2 px-3 hover:bg-green-800 disabled:opacity-50 select-none flex items-center justify-center gap-2"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>รีเฟรชข้อมูลจาก Google Sheet</span>
                </button>
              </div>
            </div>

          </aside>

          {/* MAIN COLUMN RESULTS FIELD */}
          <main className="lg:col-span-9 flex flex-col gap-4">
            
            {/* COMPACT METRIC CARDS */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5">
              <div className="win95-window p-2.5 text-center select-none shadow">
                <div className="text-[10px] uppercase font-black text-gray-600 flex items-center justify-center gap-1 mb-1">
                  <Building2 className="w-3 h-3 text-blue-700" />
                  <span>ร้านที่พบ</span>
                </div>
                <div className="text-2xl font-black text-blue-800 tracking-tight">
                  {systemStats.total} <span className="text-[10px] text-gray-500 font-normal">ร้าน</span>
                </div>
              </div>

              <div className="win95-window p-2.5 text-center select-none shadow">
                <div className="text-[10px] uppercase font-black text-gray-600 flex items-center justify-center gap-1 mb-1">
                  <Coins className="w-3 h-3 text-green-700" />
                  <span>ราคาเฉลี่ย/คน</span>
                </div>
                <div className="text-2xl font-black text-green-700 tracking-tight">
                  {systemStats.avgPrice}฿ <span className="text-[10px] text-gray-500 font-normal">โดยประมาณ</span>
                </div>
              </div>

              <div className="win95-window p-2.5 text-center select-none shadow">
                <div className="text-[10px] uppercase font-black text-gray-600 flex items-center justify-center gap-1 mb-1">
                  <Sparkles className="w-3 h-3 text-amber-700" />
                  <span>คะแนนเฉลี่ย</span>
                </div>
                <div className="text-2xl font-black text-amber-800 tracking-tight">
                  {systemStats.avgScore}% <span className="text-[10px] text-gray-500 font-normal">เกรดเฉลี่ย</span>
                </div>
              </div>

              <div className="win95-window p-2.5 text-center select-none shadow">
                <div className="text-[10px] uppercase font-black text-gray-600 flex items-center justify-center gap-1 mb-1">
                  <ShieldCheck className="w-3 h-3 text-purple-700" />
                  <span>ร้านที่น่าเชื่อถือ</span>
                </div>
                <div className="text-2xl font-black text-purple-800 tracking-tight">
                  {systemStats.trustedCount} <span className="text-[10px] text-gray-500 font-normal">ร้าน</span>
                </div>
              </div>
            </div>

            {/* TOP 3 INTELLIGENT EXPERT DECISIONS RECOMMENDATION PANEL */}
            <div className="win95-window overflow-hidden shadow-md">
              <div className="win95-title-bar bg-[#000080] select-none">
                <div className="flex items-center gap-1.5 font-black">
                  <Sparkles className="w-4 h-4 text-yellow-300 fill-yellow-300 animate-pulse" />
                  <span>⭐ ร้านแนะนำ 3 อันดับแรก</span>
                </div>
              </div>
              
              {/* Situational Scenarios Switch Bar */}
              <div className="bg-gray-200 p-2 border-b border-black flex flex-wrap gap-x-4 gap-y-1.5 items-center text-xs">
                <span className="font-bold border-r border-gray-400 pr-2 block select-none">🎯 เลือกตามโอกาส:</span>
                <div className="flex flex-wrap gap-2 md:gap-3">
                  {[
                    { val: "default", label: "⚖️ สมดุล", hint: "ดูราคา คะแนน และจำนวนรีวิวร่วมกัน" },
                    { val: "safe", label: "🛡️ รีวิวเยอะ", hint: "เน้นร้านที่มีฐานรีวิวมากและข้อมูลนิ่ง" },
                    { val: "cheap", label: "💰 ประหยัด", hint: "ให้ความสำคัญกับราคาต่อคน" },
                    { val: "fast", label: "⚡ กินไว", hint: "เหมาะกับมื้อที่ต้องรีบ" },
                    { val: "work", label: "💼 คุยงาน", hint: "เหมาะกับนัดคุยงานหรือรับแขก" },
                    { val: "large", label: "👥 กลุ่มใหญ่", hint: "เหมาะกับมื้อ 8-12 คนหรืออาหารแชร์กัน" }
                  ].map(scenario => (
                    <label key={scenario.val} className="flex items-center gap-1 cursor-pointer select-none font-bold" title={scenario.hint}>
                      <input 
                        type="radio" 
                        name="scenario" 
                        value={scenario.val}
                        checked={selectedScenario === scenario.val}
                        onChange={() => {
                          setSelectedScenario(scenario.val);
                        }}
                        className="cursor-pointer"
                      /> 
                      <span>{scenario.label}</span>
                    </label>
                  ))}
                </div>
              </div>

              {/* Rendering list containing cards */}
              <div className="p-4 grid grid-cols-1 md:grid-cols-3 gap-4 bg-gray-100 min-h-[300px]">
                {topThreeRecommendations.length === 0 ? (
                  <div className="col-span-3 text-center py-10 font-bold text-gray-500 flex flex-col items-center justify-center gap-2">
                    <AlertCircle className="w-8 h-8 text-red-700" />
                    <span>ไม่พบร้านค้าในย่านเมืองหลวงหรือตามเงื่อนไขที่คุณเลือกปรับกรองเลยครับ</span>
                  </div>
                ) : (
                  topThreeRecommendations.map((item, idx) => {
                    const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(item.name + ' ราคา เมนู อาหาร')}`;
                    const customScenarioScoreValue = item.scenario_score || item.base_score;
                    const confidenceObject = computeConfidence(item);
                    const operationalRiskObject = computeOperationalRisk(item);
                    
                    return (
                      <div 
                        key={item.name} 
                        className={`win95-window flex flex-col p-0.5 transition-all duration-300 relative ${idx === 0 ? "premium-rank-1 border-[#000080] border-4 scale-[1.01]" : ""}`}
                      >
                        {/* Title Bar Card */}
                        <div className={`win95-title-bar ${idx === 0 ? "bg-[#000080]" : "bg-[#4a505a]"} select-none`}>
                          <span className="font-black text-xs">#{idx + 1} แนะนำ</span>
                          <span className="text-[10px] bg-white text-black px-1 border border-black font-black">
                            {customScenarioScoreValue}% คะแนน
                          </span>
                        </div>

                        {/* Image Frame */}
                        <div className="h-32 win95-inset m-1 overflow-hidden relative group bg-black">
                          <img 
                            src={item.image} 
                            alt={item.name} 
                            className="w-full h-full object-cover filter transition-all duration-350 grayscale-[0.1]"
                            referrerPolicy="no-referrer"
                          />
                          <div className="absolute top-1 left-1 flex gap-1">
                            {item.isTrusted && (
                              <span className="badge bg-purple-600 text-white border-white scale-90">รีวิวแน่น</span>
                            )}
                            {item.isEstimatedPrice && (
                              <span className="badge bg-yellow-400 text-black border-black scale-90" title="ราคานี้เป็นการประมาณจากระบบ">ราคาโดยประมาณ</span>
                            )}
                          </div>
                        </div>

                        {/* Body Details Card */}
                        <div className="p-2 flex-1 flex flex-col">
                          <h3 className="font-extrabold text-[13px] text-gray-900 truncate uppercase" title={item.name}>
                            {item.name}
                          </h3>
                          
                          {/* Mini Grid Stats */}
                          <div className="grid grid-cols-3 gap-1 my-2">
                            <div className="win95-inset bg-blue-50/50 p-1 text-center select-none">
                              <div className="text-[7px] uppercase text-gray-500 font-bold">รีวิว</div>
                              <div className="text-[10px] font-black text-blue-800">{item.rating} ⭐</div>
                            </div>
                            <div className="win95-inset bg-green-50/50 p-1 text-center select-none">
                              <div className="text-[7px] uppercase text-gray-500 font-bold">ราคา</div>
                              <div className="text-[10px] font-black text-green-800 flex justify-center items-center gap-0.5">
                                <span>{item.display_price}</span>
                                {item.isEstimatedPrice && (
                                  <a href={searchUrl} target="_blank" rel="noopener noreferrer" className="text-blue-600 font-normal hover:underline text-[9px]" title="ค้นราคาและเมนูจริง">🔍</a>
                                )}
                              </div>
                            </div>
                            <div className="win95-inset bg-amber-50/50 p-1 text-center select-none">
                              <div className="text-[7px] uppercase text-gray-500 font-bold">คะแนน</div>
                              <div className="text-[10px] font-black text-amber-800">{item.base_score}%</div>
                            </div>
                          </div>

                          {/* Quick details */}
                          <div className="text-[10px] text-gray-700 space-y-1.5 flex-1">
                            <p className="flex items-center gap-1">
                              <span className="text-blue-900 font-black">📍 ย่าน:</span> <span className="font-bold underline">{item.area}</span>
                            </p>
                            <p className="flex items-center gap-1">
                              <span className="text-gray-800 font-black">🍲 ประเภท:</span> <span className="badge bg-slate-100">{item.category}</span>
                            </p>
                            
                            {/* Technical Badges indicators for High Trust, Low stats, Risk levels */}
                            <div className="flex flex-wrap gap-1.5 pt-1">
                              <span className={`badge ${confidenceObject.confidence >= 75 ? "bg-green-100 text-green-800 border-green-500" : confidenceObject.confidence >= 50 ? "bg-orange-100 text-orange-850 border-orange-500" : "bg-red-100 text-red-800 border-red-500"}`} title={confidenceObject.reasons.join('\n')}>
                                ความน่าเชื่อถือ: {confidenceObject.confidence}%
                              </span>
                              <span className={`badge ${operationalRiskObject.level === "ต่ำ" ? "bg-green-100 text-green-800 border-green-500" : operationalRiskObject.level === "กลาง" ? "bg-orange-100 text-orange-855 border-orange-500" : "bg-red-100 text-red-800 border-red-500"}`}>
                                ความเสี่ยง: {operationalRiskObject.level}
                              </span>
                            </div>
                          </div>

                          {/* Highly Accurate Situational Reason Box */}
                          <div className="mt-2.5 win95-inset bg-[#ffffe1] p-2 border border-gray-450 text-gray-900 leading-normal shadow-inner">
                            <div className="flex items-center gap-1 font-extrabold text-[#000080] text-[9.5px] border-b border-gray-300 pb-0.5 mb-1.5 uppercase select-none">
                              <Sparkles className="w-3 h-3 text-amber-500 fill-amber-500 animate-pulse" />
                               <span>💡 ทำไมถึงแนะนำร้านนี้</span>
                            </div>
                            <p className="font-extrabold text-[10px] leading-relaxed text-gray-800">
                              {getTopThreeReason(item, selectedScenario, idx + 1)}
                            </p>
                          </div>

                          {/* DEEP WHY UNDERSTAND ACCORDION */}
                          <div className="mt-3.5 pt-2 border-t border-dashed border-gray-400">
                            <details className="win95-inset p-1.5 bg-white text-[10px] leading-tight text-gray-800">
                              <summary className="cursor-pointer font-black text-blue-900 hover:underline select-none outline-none">
                                🔬 ดูที่มาของคะแนน
                              </summary>
                              
                              <div className="mt-2 text-[10px] space-y-2 leading-relaxed">
                                {/* Competitor delta comparison */}
                                <div className="win95-inset p-1.5 bg-gray-50">
                                  <span className="font-bold text-gray-700 block mb-1">📊 เปรียบเทียบกับร้านอื่น:</span>
                                  {idx === 0 ? (
                                  <span>ได้คะแนนรวมสูงสุดในกลุ่มที่กำลังกรองอยู่</span>
                                  ) : (
                                     <span>เป็นตัวเลือกถัดมาที่คะแนนยังดีและความคุ้มค่าใกล้เคียงอันดับแรก</span>
                                  )}
                                </div>

                                {/* Dataset constraints honesty declaration */}
                                <div className="win95-inset p-1.5 bg-gray-50">
                                   <span className="font-bold text-gray-700 block mb-1">📃 ข้อมูลอ้างอิงจาก Google Sheet:</span>
                                   <span>ย่าน {item.area} | คะแนน {item.rating} ดาว | รีวิว {item.reviews} ครั้ง <i>(*คำนวณจากข้อมูลล่าสุดใน Google Sheet)</i></span>
                                </div>

                                {/* Score components breakdown */}
                                <div className="space-y-1">
                                   <span className="font-bold text-gray-700 block">📐 คะแนนแยกตามหัวข้อ ({scenarioLabel(selectedScenario)}):</span>
                                  <div className="grid grid-cols-2 gap-1 text-[9px]">
                                    <div className="bg-blue-50/50 p-1 win95-inset">คะแนนรีวิวร้าน: {(item.scenario_parts?.quality || 0).toFixed(0)}%</div>
                                    <div className="bg-purple-50/50 p-1 win95-inset">คะแนนความนิยม: {(item.scenario_parts?.popularity || 0).toFixed(0)}%</div>
                                    <div className="bg-green-50/50 p-1 win95-inset">คะแนนความคุ้มค่าเงิน: {(item.scenario_parts?.budget || 0).toFixed(0)}%</div>
                                    <div className="bg-amber-50/50 p-1 win95-inset">ความสอดคล้องประเภท: {(item.scenario_parts?.categoryFit || 0).toFixed(0)}%</div>
                                  </div>
                                </div>
                              </div>
                            </details>
                          </div>

                          <div className="flex gap-1.5 mt-3 pt-2">
                            <a 
                              href={item.map} 
                              target="_blank" 
                              rel="noopener noreferrer" 
                              className="win95-button text-[9px] flex-1 text-center font-bold flex items-center justify-center gap-0.5"
                            >
                              <MapPin className="w-2.5 h-2.5 text-red-700" />
                              <span>แผนที่</span>
                            </a>
                            {item.source && item.source.startsWith('http') ? (
                              <a 
                                href={item.source} 
                                target="_blank" 
                                rel="noopener noreferrer" 
                                className="win95-button text-[9px] flex-1 text-center flex items-center justify-center gap-0.5"
                              >
                                <ExternalLink className="w-2.5 h-2.5" />
                                <span>เพจร้าน</span>
                              </a>
                            ) : null}
                          </div>
                        </div>

                      </div>
                    );
                  })
                )}
              </div>
            </div>


            {/* RESTAURANT SEARCHABLE MAIN DATABASE TABLE */}
            <div className="win95-window">
              <div className="win95-title-bar">
                <div className="flex items-center gap-1.5 select-none">
                  <Database className="w-3.5 h-3.5" />
                  <span>📂 รายชื่อร้านทั้งหมด</span>
                </div>
                
                {/* Search Bar DB */}
                <div className="relative">
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="ค้นหาชื่อร้าน..."
                    className="text-black bg-white px-2 py-0.5 text-xs w-44 win95-inset outline-none focus:border-amber-600"
                    id="table-search-input"
                  />
                  {searchQuery ? (
                    <button 
                      onClick={() => setSearchQuery("")}
                      className="absolute right-1 text-black font-black text-xs hover:text-red-700 leading-none top-1"
                    >
                      ✕
                    </button>
                  ) : null}
                </div>
              </div>

              {/* Table wrapper scrolls retro */}
              <div className="max-h-[380px] overflow-y-auto overflow-x-auto scroll-win95 bg-white">
                <table className="w-full text-left text-[10px] md:text-xs border-collapse">
                  <thead className="sticky top-0 bg-gray-200 z-10 select-none">
                    <tr className="border-b-2 border-black">
                      {[
                        { field: "name", label: "ชื่อร้าน ↕" },
                        { field: "price", label: "งบประมาณ/คน ↕", align: "text-center" },
                        { field: "rating", label: "คะแนน (รีวิว) ↕", align: "text-center" },
                        { field: "base_score", label: "คะแนนแนะนำ ↕", align: "text-center" },
                        { field: "category", label: "ประเภท" },
                        { field: "area", label: "ทำเล" }
                      ].map(col => {
                        const isSortActive = sortField === col.field;
                        return (
                          <th
                            key={col.field}
                            onClick={() => {
                              if (col.field) {
                                if (sortField === col.field) {
                                  setSortAscending(!sortAscending);
                                } else {
                                  setSortField(col.field as any);
                                  setSortAscending(false);
                                }
                              }
                            }}
                            className={`p-1.5 md:p-2 border-r border-gray-400 cursor-pointer hover:bg-gray-300 font-bold text-[9px] md:text-xs ${col.align || ""} ${isSortActive ? "bg-gray-300 font-black text-amber-900" : ""}`}
                          >
                            <div className="flex items-center gap-0.5 md:gap-1 justify-center whitespace-nowrap">
                              <span>{col.label}</span>
                              {isSortActive && <ArrowUpDown className="w-2.5 h-2.5 shrink-0" />}
                            </div>
                          </th>
                        );
                      })}
                    </tr>
                  </thead>
                  
                  <tbody className="divide-y divide-gray-300">
                    {sortedRestaurantsList.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="p-8 text-center text-gray-500 font-bold">
                          ไม่พบรายการร้านตรงความต้องการของคุณเลย
                        </td>
                      </tr>
                    ) : (
                      sortedRestaurantsList.map((item, idx) => {
                        const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(item.name + ' ราคา เมนู อาหาร')}`;
                        
                        return (
                          <tr 
                            key={`${item.name}-${idx}`} 
                            className="hover:bg-blue-100/90 hover:text-[#000080] cursor-pointer bg-white transition-all duration-150 border-b border-gray-200"
                            onClick={() => setSelectedRestaurant(item)}
                            title="คลิกเพื่อดูรายละเอียดร้านนี้"
                          >
                            <td className="p-1.5 md:p-2 text-[9.5px] md:text-xs font-bold max-w-[110px] md:max-w-[150px] truncate underline decoration-dashed decoration-blue-400 group-hover:text-blue-900" title={item.name}>
                              {item.name}
                            </td>
                            <td className="p-1.5 md:p-2 text-[9.5px] md:text-xs text-center font-bold whitespace-nowrap">
                              {item.isEstimatedPrice ? (
                                <span className="text-green-700/80" title="ค่าสถิติจำลองโดย AI">
                                  {item.display_price}
                                  <a 
                                    href={searchUrl} 
                                    target="_blank" 
                                    rel="noopener noreferrer" 
                                    className="ml-1 text-[8.5px] md:text-[10px] text-blue-600 hover:underline inline-block"
                                    onClick={(e) => e.stopPropagation()}
                                  >
                                    🔍
                                  </a>
                                </span>
                              ) : (
                                <span className="text-green-800">{item.display_price}</span>
                              )}
                            </td>
                            <td className="p-1.5 md:p-2 text-[9.5px] md:text-xs text-center text-blue-800 font-bold whitespace-nowrap">
                              {item.rating} <span className="text-[8px] md:text-[9px] text-gray-500 font-normal">({item.reviews})</span>
                            </td>
                            <td className="p-1.5 md:p-2 text-[9.5px] md:text-xs text-center font-black text-[#000080]">{item.base_score}%</td>
                            <td className="p-1.5 md:p-2 text-[8px] md:text-xs"><span className="badge bg-slate-100 px-1 py-0.5 text-[8.5px] md:text-[10px]">{item.category}</span></td>
                            <td className="p-1.5 md:p-2 text-[8.5px] md:text-[10px] font-mono leading-none">{item.area}</td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* AI ANALYTICAL REPORT INSIGHTS 2.0 PANEL */}
            <div className="win95-window">
              <div className="win95-title-bar bg-[#0a246a] select-none">
                <div className="flex items-center gap-1.5 font-bold">
                  <TrendingUp className="w-4 h-4 text-yellow-300" />
                  <span>🤖 สรุปภาพรวมร้านในข้อมูลชุดนี้</span>
                </div>
              </div>

              <div id="ai-insights-block" className="p-3 bg-[#e0e0e0] win95-inset m-2 space-y-4">
                {marketInsights ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 font-sans">
                    
                    {/* General Market parameters */}
                    <div className="win95-window p-2 bg-white flex flex-col justify-between">
                      <div>
                        <div className="win95-title-bar bg-[#104c8a] select-none">
                          <span>1) ภาพรวมราคาและจำนวนร้าน</span>
                        </div>
                        <div className="p-2 text-xs text-gray-800 space-y-1.5 leading-relaxed">
                          <p>• <b>จำนวนร้านที่นำมาคำนวณ:</b> {filteredRestaurants.length} ร้าน</p>
                          <p>• <b>ราคาเฉลี่ยโดยประมาณ:</b> ~{systemStats.avgPrice}฿ ต่อคน</p>
                          <p>• <b>รวมจำนวนรีวิวทั้งหมด (Total Reviews Cohort):</b> {marketInsights.totalReviews ? marketInsights.totalReviews.toLocaleString() : 0} รีวิว (Reviews)</p>
                          <p>• <b>คะแนนเฉลี่ยทั้งกลุ่ม (Cohort Avg Rating):</b> {marketInsights.avgRating} ⭐</p>
                          <p>• <b>ขอบเขตราคา Quartile เปรียบเทียบ (Price Distribution):</b></p>
                          <div className="win95-inset p-2 bg-gray-50 text-[11px] grid grid-cols-3 gap-1 divide-x divide-gray-300">
                            <div className="text-center"><b>P25 (ราคาเริ่มต้น):</b><br/>{marketInsights.p25}฿</div>
                            <div className="text-center pl-1"><b>P50 (มัธยฐาน/Median):</b><br/>{marketInsights.p50}฿</div>
                            <div className="text-center pl-1"><b>P75 (ราคาพรีเมียม):</b><br/>{marketInsights.p75}฿</div>
                          </div>
                        </div>
                      </div>
                      
                      {marketInsights.sortedCats && marketInsights.sortedCats.length > 0 && (
                        <div className="p-2 border-t border-dashed border-gray-300 text-xs">
                          <p className="font-bold mb-1 text-[11px] text-gray-700">• สัดส่วนประเภทยอดยอดนิยม (Top Categories):</p>
                          <div className="flex flex-wrap gap-1">
                            {marketInsights.sortedCats.slice(0, 3).map(([cat, count]) => (
                              <span key={cat} className="badge bg-slate-100 text-[10px] px-1 border border-gray-300">
                                {cat} ({count} ร้าน / {Math.round((count / filteredRestaurants.length) * 100)}%)
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Dominant Categories & Area Comparison */}
                    <div className="win95-window p-2 bg-white flex flex-col justify-between">
                      <div>
                        <div className="win95-title-bar bg-[#104c8a] select-none">
                          <span>2) เปรียบเทียบศักยภาพย่านและการกระจายตัว (Location & Extreme Analysis)</span>
                        </div>
                        <div className="p-2 text-xs text-gray-800 space-y-1.5 leading-relaxed">
                          <div className="max-h-[100px] overflow-y-auto scroll-win95 space-y-1 border-b border-dashed border-gray-200 pb-1.5">
                            {marketInsights.areaStats.map(stat => (
                              <div key={stat.area} className="flex justify-between items-center text-[11px] border-b border-gray-150 pb-0.5 last:border-0 last:pb-0">
                                <span className="font-bold underline">{stat.area}</span>
                                <span className="text-gray-600">มี ({stat.count} ร้าน) | เรตเฉลี่ย: <b>{stat.avgRating}</b>⭐ | บิลเฉลี่ย: <b>{stat.avgPrice}฿</b></span>
                              </div>
                            ))}
                          </div>
                          
                          <div className="text-[10.5px] text-gray-700 space-y-1 mt-1">
                        <p>• <b>ราคาดีที่สุด:</b> <span className="text-green-800 font-bold">{marketInsights.cheapestEst ? `${marketInsights.cheapestEst.name} (~${marketInsights.cheapestEst.price}฿/คน ย่าน${marketInsights.cheapestEst.area})` : "N/A"}</span></p>
                        <p>• <b>ราคาสูงที่สุดในชุดนี้:</b> <span className="text-red-800 font-bold">{marketInsights.expensiveEst ? `${marketInsights.expensiveEst.name} (~${marketInsights.expensiveEst.price}฿/คน ย่าน${marketInsights.expensiveEst.area})` : "N/A"}</span></p>
                        <p>• <b>คะแนนรีวิวเด่น:</b> <span className="text-blue-900 font-bold">{marketInsights.topRatedEst ? `${marketInsights.topRatedEst.name} (${marketInsights.topRatedEst.rating}⭐ / ${marketInsights.topRatedEst.reviews} รีวิว)` : "N/A"}</span></p>
                          </div>
                        </div>
                      </div>

                      {marketInsights.areaStats && marketInsights.areaStats.filter(s => s.count > 0).length > 0 && (
                        <div className="p-2 bg-indigo-50/50 text-[10.5px] border-t border-indigo-100 text-gray-800 space-y-0.5">
                          {(() => {
                            const validAreas = marketInsights.areaStats.filter(s => s.count > 0);
                            const bestRated = [...validAreas].sort((a, b) => b.avgRating - a.avgRating)[0];
                            const lowestPrice = [...validAreas].sort((a, b) => a.avgPrice - b.avgPrice)[0];
                            return (
                              <>
                                <p>• <b>⭐ Best Rated Area:</b> ย่าน <b>{bestRated ? bestRated.area : "N/A"}</b> มีคะแนนรีวิวสูงสุดเฉลี่ย {bestRated ? bestRated.avgRating : 0}⭐</p>
                                <p>• <b>💰 Cost-Effective Area:</b> ย่าน <b>{lowestPrice ? lowestPrice.area : "N/A"}</b> มีค่าใช้จ่ายเฉลี่ยประหยัดที่สุด ~{lowestPrice ? lowestPrice.avgPrice : 0}฿/คน</p>
                              </>
                            );
                          })()}
                        </div>
                      )}
                    </div>

                    {/* Hidden Gems and Risky warn indicators */}
                    <div className="win95-window p-2 bg-white col-span-1 md:col-span-2">
                      <div className="win95-title-bar bg-[#3e4450] select-none">
                        <span>3) ร้านน่าลองและร้านที่ควรเช็กราคาเพิ่ม</span>
                      </div>
                      <div className="p-2.5 grid grid-cols-1 md:grid-cols-2 gap-3.5">
                        
                        {/* Hidden Gems Column */}
                        <div className="space-y-1.5">
                          <span className="font-extrabold text-[12px] text-green-800 block">✨ ร้านน่าลองที่คนยังรีวิวน้อย</span>
                          <span className="text-[10px] text-gray-500 block leading-tight">คะแนนตั้งแต่ 4.5⭐ ขึ้นไป แต่รีวิวยังน้อยกว่า 150 ครั้ง เหมาะกับคนที่ชอบลองร้านใหม่</span>
                          <div className="space-y-1.5">
                            {marketInsights.hiddenGemsList.length === 0 ? (
                              <span className="text-[11px] text-gray-400 block italic">ยังไม่พบร้านที่เข้าเกณฑ์นี้</span>
                            ) : (
                              marketInsights.hiddenGemsList.map(gem => (
                                <div key={gem.name} className="win95-inset p-1 bg-white text-[10.5px] flex justify-between gap-1">
                                  <span className="font-bold text-gray-900 truncate">{gem.name}</span>
                                  <span className="text-blue-900 font-bold whitespace-nowrap">{gem.rating}⭐ ({gem.reviews} รีวิว)</span>
                                </div>
                              ))
                            )}
                          </div>
                        </div>

                        {/* Potentially overpriced Column */}
                        <div className="space-y-1.5">
                          <span className="font-extrabold text-[12px] text-red-800 block">⚠️ ร้านราคาสูงที่ควรเช็กก่อนจอง</span>
                          <span className="text-[10px] text-gray-500 block leading-tight">ราคาอยู่ในกลุ่มสูงกว่า {marketInsights.p75}฿ ต่อคน แต่คะแนนความคุ้มค่ายังไม่เด่นเท่าราคา</span>
                          <div className="space-y-1.5">
                            {marketInsights.overpricedWarning.length === 0 ? (
                              <span className="text-[11px] text-gray-400 block italic">ยังไม่มีร้านที่ต้องเตือนเรื่องราคาในรอบนี้</span>
                            ) : (
                              marketInsights.overpricedWarning.slice(0, 3).map(warn => (
                                <div key={warn.name} className="win95-inset p-1 bg-white text-[10.5px] flex justify-between gap-1">
                                  <span className="font-bold text-red-800 truncate">{warn.name}</span>
                                  <span className="font-bold whitespace-nowrap">{warn.price}฿ | คะแนน: {warn.base_score}%</span>
                                </div>
                              ))
                            )}
                          </div>
                        </div>

                      </div>
                    </div>

                    {/* Top Picks Recommendations */}
                    <div className="win95-window p-2 bg-white col-span-1 md:col-span-2">
                      <div className="win95-title-bar bg-green-900 select-none">
                        <span>4) ร้านเด่นจากคะแนนรวม</span>
                      </div>
                      <div className="p-2.5 grid grid-cols-1 md:grid-cols-2 gap-4">
                        {/* Best Budget Value Options */}
                        <div className="space-y-1.5">
                          <span className="font-extrabold text-[12px] text-green-800 block">⭐ ตัวเลือกคุ้มราคา</span>
                          <span className="text-[10px] text-gray-500 block leading-tight">คัดจากร้านที่คะแนนดีและราคาไม่แรง เหมาะกับการเริ่มดูตัวเลือก</span>
                          <div className="space-y-1.5">
                            {marketInsights.budgetValueBest && marketInsights.budgetValueBest.length > 0 ? (
                              marketInsights.budgetValueBest.slice(0, 3).map(item => (
                                <div key={item.name} className="win95-inset p-1 bg-white text-[10.5px] flex justify-between gap-1 items-center">
                                  <span className="font-bold text-gray-900 truncate">{item.name}</span>
                                  <span className="text-green-700 font-bold whitespace-nowrap text-[10px]">{item.display_price} | คะแนน {item.base_score}%</span>
                                </div>
                              ))
                            ) : (
                              <span className="text-[11px] text-gray-400 block italic">ยังไม่มีร้านที่เข้าเกณฑ์นี้</span>
                            )}
                          </div>
                        </div>

                        {/* Safest / Most Established Picks */}
                        <div className="space-y-1.5">
                          <span className="font-extrabold text-[12px] text-blue-800 block">👑 ร้านที่รีวิวแน่นที่สุด</span>
                          <span className="text-[10px] text-gray-500 block leading-tight">ดูจากจำนวนรีวิวสูงและคะแนนค่อนข้างนิ่ง เหมาะกับคนที่อยากเลือกแบบมั่นใจ</span>
                          <div className="space-y-1.5">
                            {marketInsights.safestList && marketInsights.safestList.length > 0 ? (
                              marketInsights.safestList.slice(0, 3).map(item => (
                                <div key={item.name} className="win95-inset p-1 bg-white text-[10.5px] flex justify-between gap-1 items-center">
                                  <span className="font-bold text-gray-900 truncate">{item.name}</span>
                                  <span className="text-indigo-800 font-bold whitespace-nowrap text-[10px]">⭐ {item.rating} ({item.reviews} รีวิว)</span>
                                </div>
                              ))
                            ) : (
                              <span className="text-[11px] text-gray-400 block italic">ไม่มีรายการที่ผ่านเกณฑ์ปริมาณรีวิว</span>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>

                  </div>
                ) : (
                  <div className="text-center text-xs text-gray-500 py-6 font-bold">
                    กรุณารอประมวลสถิติกลุ่มตัวอย่างจาก Google Sheet...
                  </div>
                )}
              </div>
            </div>

            {/* HIGH-PRECISION DETAILED HUMAN REVIEW FLAGS (LOW CONFIDENCE) PANEL */}
            {/* Relocated and Renamed to Human Review Queue */}
            <div className="win95-window border-4 border-slate-700 shadow">
              <div className="win95-title-bar bg-slate-700 select-none">
                <div className="flex justify-between items-center w-full">
                  <div className="flex items-center gap-1.5 font-bold">
                    <AlertTriangle className="w-4 h-4 text-yellow-300 fill-yellow-300 animate-pulse" />
                    <span>🚩 รายการที่ควรตรวจเพิ่ม</span>
                  </div>
                  <span className="text-[10px] bg-red-700 text-white font-black px-1.5 py-0.5 border border-white">
                    {flagFilterSeverity === "all" ? allHumanReviewFlags.length : filteredHumanReviewFlags.length} รายการ
                  </span>
                </div>
              </div>

              {/* High Control Flags Dashboard Section */}
              <div className="p-3 bg-gray-200 border-b border-gray-400">
                <div className="flex flex-col md:flex-row gap-3 items-stretch md:items-center">
                  
                  {/* Severity buttons filters */}
                  <div className="flex items-center gap-1.5 text-xs">
                    <span className="font-bold select-none">ระดับความสำคัญ:</span>
                    <div className="flex gap-1">
                      {[
                        { val: "all", label: "ทั้งหมด", color: "bg-gray-100" },
                        { val: "high", label: "🔴 High", color: "bg-red-100 text-red-800" },
                        { val: "medium", label: "🟡 Medium", color: "bg-yellow-100 text-yellow-850" },
                        { val: "low", label: "🟢 Low", color: "bg-green-100 text-green-800" }
                      ].map(sev => (
                        <button
                          key={sev.val}
                          onClick={() => setFlagFilterSeverity(sev.val)}
                          className={`win95-button text-[10px] font-bold py-0.5 px-2 ${flagFilterSeverity === sev.val ? "win95-active font-black bg-[#d4d4d4]" : ""}`}
                        >
                          {sev.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Flag Search Input */}
                  <div className="flex-1 flex gap-1.5 items-center">
                    <span className="text-xs font-bold whitespace-nowrap select-none">ค้นหารายการ:</span>
                    <div className="relative flex-1">
                      <input 
                        type="text"
                        value={flagSearchQuery}
                        onChange={(e) => setFlagSearchQuery(e.target.value)}
                        placeholder="ค้นหาตามชื่อร้าน, รหัสสาเหตุ..."
                        className="w-full text-xs p-1 px-2.5 pr-8 bg-white text-black outline-none win95-inset focus:border-amber-700"
                        id="flag-search-queue-field"
                      />
                      {flagSearchQuery ? (
                        <button 
                          onClick={() => setFlagSearchQuery("")}
                          className="absolute right-1 top-1 text-gray-500 hover:text-black font-black text-xs"
                        >
                          ✕
                        </button>
                      ) : (
                        <Search className="w-3 h-3 text-gray-500 absolute right-2.5 top-2" />
                      )}
                    </div>
                  </div>

                </div>
              </div>

              {/* Dynamic rendering of detailed Flags items */}
              <div className="p-3 bg-white win95-inset m-2 max-h-72 overflow-y-auto scroll-win95">
                {filteredHumanReviewFlags.length === 0 ? (
                  <div className="py-8 text-center text-xs text-green-700 font-bold select-none flex flex-col items-center justify-center gap-1">
                    <CheckCircle2 className="w-6 h-6 text-green-600" />
                    <span>ไม่พบรายการที่ต้องตรวจเพิ่มตามตัวเลือกนี้ครับ</span>
                  </div>
                ) : (
                  <div className="space-y-2.5">
                    {filteredHumanReviewFlags.map((flag, idx) => {
                      const isExpanded = expandedFlagIndex === idx;
                      
                      let sevBadgeColor = "bg-green-100 text-green-800 border-green-500";
                      if (flag.severity === "high") sevBadgeColor = "bg-red-100 text-red-800 border-red-500";
                      else if (flag.severity === "medium") sevBadgeColor = "bg-yellow-105 text-yellow-850 border-yellow-500";

                      return (
                        <div 
                          key={`${flag.restaurantName}-${flag.flagCode}-${idx}`}
                          className="border border-gray-300 win95-inset bg-gray-50/50 overflow-hidden"
                        >
                          {/* Flag Header Line */}
                          <div 
                            onClick={() => setExpandedFlagIndex(isExpanded ? null : idx)}
                            className="p-2 cursor-pointer flex justify-between gap-2.5 items-center hover:bg-gray-100 select-none bg-gray-100/60"
                          >
                            <div className="flex items-center gap-2">
                              <span className={`badge ${sevBadgeColor} font-black text-[9px] tracking-wider`}>
                                {flag.flagCode}
                              </span>
                              <span className="font-extrabold text-[11px] text-gray-900 leading-none">
                                {flag.restaurantName} <span className="text-gray-500 text-[10px] font-normal">({flag.area})</span>
                              </span>
                            </div>
                            
                            <div className="flex items-center gap-2 flex-shrink-0">
                              <span className="text-[9px] text-gray-600 font-mono hidden md:inline">
                                {flag.metric}
                              </span>
                              {isExpanded ? (
                                <ChevronUp className="w-4 h-4 text-gray-600" />
                              ) : (
                                <ChevronDown className="w-4 h-4 text-gray-600" />
                              )}
                            </div>
                          </div>

                          {/* Expanded Detailed Flag Information */}
                          {isExpanded && (
                            <div className="p-3 bg-white border-t border-gray-300 text-xs space-y-2.5 leading-relaxed font-sans">
                              {/* Warning Category Line */}
                              <div>
                                <span className="text-gray-500 font-bold block text-[9px] uppercase tracking-wider">ประเภทข้อสงสัย:</span>
                                <span className="text-red-900 font-extrabold text-[12px] flex items-center gap-1">
                                  <span>{flag.type}</span>
                                  <span className="text-[10px] text-gray-600 font-mono">({flag.metric})</span>
                                </span>
                              </div>

                              {/* Detailed Behavioral Reason explanation */}
                              <div>
                                <span className="text-gray-500 font-bold block text-[9px] uppercase tracking-wider">เหตุผลที่ควรตรวจ:</span>
                                <p className="text-gray-800 text-[11px]">
                                  {flag.reason}
                                </p>
                              </div>

                              {/* Target Action Guidelines */}
                              <div className="bg-orange-50/50 p-2 border-l-4 border-orange-500 win95-inset">
                                <span className="text-orange-950 font-black text-[10px] uppercase block mb-0.5">📋 สิ่งที่แนะนำให้ตรวจ:</span>
                                <p className="text-orange-900 text-[10px] font-medium leading-relaxed">
                                  {flag.action}
                                </p>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
              
              <div className="p-1 px-3 bg-gray-200 text-[9.5px] text-gray-700 font-bold select-none border-t border-gray-300">
                ℹ️ ระบบจะแสดงร้านที่ข้อมูลยังน่าสงสัย เช่น รีวิวเยอะ/น้อยผิดปกติ ราคาไม่ชัด หรือไม่มีลิงก์ยืนยัน เพื่อให้ตรวจซ้ำก่อนนำไปใช้จริง
              </div>
            </div>

          </main>
        </div>

        {/* METADATA STATUS BAR */}
        <footer className="win95-inset m-1 p-1 flex justify-between text-[10px]/none bg-gray-200 font-bold uppercase select-none">
          <div>System Registry: ONLINE | Connection: Ready</div>
          <div>WINDOWS 95 FOOD DECISION v2.0 AI LABS EDITION</div>
        </footer>
      </div>

      {/* --- FLOATING VINTAGE CHAT WIDGET CONTROL --- */}
      {isChatOpen && (
        <div 
          className="fixed bottom-4 right-4 w-[calc(100vw-32px)] md:w-96 max-w-[380px] win95-window z-40 shadow-2xl animate-fade-in"
          id="chat-assistant-panel"
        >
          {/* Header Dragbar */}
          <div className="win95-title-bar select-none cursor-pointer" onClick={() => setIsChatOpen(false)}>
            <div className="flex items-center gap-2">
              <span className="w-4 h-4 bg-white rounded-full flex items-center justify-center text-[10px] text-amber-800 font-black animate-bounce">AI</span>
              <span className="font-extrabold text-xs">Food System Chat Assistant 2.0</span>
            </div>
            <button className="control-btn font-extrabold">X</button>
          </div>

          {/* Messages Body */}
          <div className="p-2 bg-[#c0c0c0]">
            <div 
              className="win95-inset h-64 md:h-72 overflow-y-auto p-2.5 mb-2 bg-white text-xs flex flex-col gap-2.5 scroll-win95"
              id="messages-scroll-frame"
            >
              {chatMessages.map(msg => (
                <div 
                  key={msg.id}
                  className={`${msg.role === "user" ? "self-end bg-blue-100 p-2 border border-blue-400 text-black max-w-[85%]" : "bg-gray-100 p-2 border border-gray-400 text-black max-w-[85%]"} font-sans leading-relaxed`}
                >
                  <span className="font-black text-[10px] uppercase text-gray-600 block mb-1">
                    {msg.role === "user" ? "คุณ (User)" : "ผู้ส่ง (AI Assistant)"}
                  </span>
                  <div 
                    className="text-[11px]"
                    dangerouslySetInnerHTML={{ __html: msg.text }}
                  />
                </div>
              ))}
            </div>

            {/* Form Dock */}
            <div className="flex gap-1">
              <input
                type="text"
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleChatSend();
                }}
                placeholder="สอบถามชื่อร้าน ย่าน หรือจำลองช่วงราคาได้..."
                className="flex-1 p-1.5 text-xs win95-inset bg-white text-black outline-none outline-0"
              />
              <button 
                onClick={handleChatSend}
                className="win95-button text-xs font-bold flex items-center gap-0.5"
              >
                <Send className="w-3 h-3" />
                <span>ส่ง</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Floating Mini chat launcher if closed */}
      {!isChatOpen && (
        <button
          onClick={() => setIsChatOpen(true)}
          className="fixed bottom-4 right-4 win95-button bg-yellow-400 text-black font-bold p-3 rounded-none shadow-2xl flex items-center gap-1.5 hover:scale-105 z-40 border-2 select-none"
        >
          <MessageSquare className="w-4 h-4 fill-black" />
          <span>💬 ปรึกษาผู้ช่วย AI</span>
        </button>
      )}
    </div>
  );
}
