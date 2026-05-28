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
  Plus
} from "lucide-react";
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

  // Chat Widget State
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([
    {
      id: "init",
      role: "ai",
      text: "สวัสดี! ฉันคือ <b>AI Food Data Assistant 2.0</b> ถามเจาะจงรายชื่อร้านค้า เช็คข้อมูลสถิติตามย่าน หรือจำลองงบประมาณที่มีได้เลย พิมพ์อะไรก็ได้เพื่อปรึกษาครับ 🤖"
    }
  ]);
  const [chatInput, setChatInput] = useState<string>("");
  const [isChatOpen, setIsChatOpen] = useState<boolean>(true);

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

    const headerRow = table.rows[0]?.c || [];
    const headers = headerRow.map((cell: any, idx: number) => {
      const v = cell?.v;
      return (v === null || v === undefined || `${v}`.trim() === '') ? `col_${idx}` : `${v}`.trim();
    });

    const dataRows = table.rows.slice(1);
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
      const data = await fetchFromGviz(sheetName);
      return { source: "gviz-fallback", data };
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

  const loadData = async (shouldShowToast = false) => {
    setIsLoading(true);
    setLoadingProgress(25);
    setLoadingText("กำลังสืบค้นและระบุแผ่นงาน Google Sheets...");
    
    try {
      const resolved = await resolveWorkingSheet();
      setRawData(resolved.data);
      setDataSource(resolved.source);
      setLastUpdatedTime(new Date().toLocaleTimeString());
      
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
        "ไม่สามารถเข้าถึงแผ่นงาน Google Sheets ได้ในเวลานี้",
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

    if (!confirm("ต้องการยิงสัญญาณเริ่มต้นระบบ AI Scraper ตัวใหม่ใช่หรือไม่? (การดึงข้อมูลสดผ่านพนักงานหน้างานร่วมกับ n8n ใช้เวลาประมาณ 1-2 นาที)")) {
      return;
    }

    // Lock Scraping State immediately - disables interface buttons and displays processing indicators
    isScrapingRef.current = true;
    setIsScraping(true);
    setIsLoading(true);
    setLoadingProgress(10);
    setLoadingText("กำลังยิงสัญญาณทริกเกอร์ไปยังระบบสตรีม n8n Webhook...");

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
        "การส่งนสัญญาณล้มเหลว",
        "ไม่สามารถเริ่มต้นสัญญาณ Webhook ได้เนื่องจากข้อจำกัดเครือข่าย",
        `ทางหน้าบราว์เซอร์ปฏิเสธหรือขวางกั้นสัญญาณส่งออกไปยัง n8n\n\nรายละเอียดวิเคราะห์:\n${e.message || e}`,
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
      setLoadingText(`ระบบกำลังดำเนินกระบวนการจำลองและสแกนพิกัด Google Maps... (${elapsedSeconds}/${maxSeconds} วินาที)\nสัญญาณเชื่อมต่อสดกับ n8n กำลังแก้ไขแผ่นงาน...`);

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
            setLoadingText("ตรวจพบพฤติกรรมการเพิ่มข้อมูลใหม่ใน Google Sheets! กำลังคอยคูลดาวน์แถวอาหารที่ค้าง (10 วินาที)...");

            // Cooldown delay for n8n to finish writing all rows
            setTimeout(async () => {
              try {
                const finalResult = await fetchSheetDataPreferred(SHEET_NAME);
                setRawData(finalResult.data);
                setDataSource(finalResult.source);
              } catch (err) {
                setRawData(currentFetchedData);
              }

              setLastUpdatedTime(new Date().toLocaleTimeString());
              isScrapingRef.current = false;
              setIsScraping(false);
              setIsLoading(false);
              setLoadingProgress(0);

              triggerWin95Alert(
                "อัปเดตข้อมูลเมนูสำเร็จ!",
                "✨ ตรวจพบล้านและประมวลผลคะแนน AI เสร็จสิ้นเรียบร้อย!",
                `อัลกอริทึมนวัตกรรมสามารถประมวลผลเพิ่มรายชื่อร้านเข้ามาใหม่ จำนวนร้านอาหารรวมในระบบขณะนี้คือ ${rawData.length} ร้านค้า ดัชนี AI Low Confidence ได้รับการคำนวณใหม่แล้วครับ`,
                false
              );
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
          "ครบรอบขีดจำกัดรอนำเข้า",
          "⏱️ สิ้นสุดระยะเวลาการเฝ้ามองข้อมูลสด",
          `ระบบใช้เวลาค้นหาครอบคลุม ${maxSeconds} วินาทีแล้ว คณะทำงานจำต้องหยุดการสแกนและดึงข้อมูลรอบล่าสุดมาแสดงผลให้คุณแทน (สถิติล่าสุด: ${rawData.length} ร้าน) คุณสามารถใช้งานระบบต่อได้ทันทีครับ`,
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

    return {
      p25, p50, p75,
      sortedCats,
      areaStats,
      balancedSpec,
      safestList,
      hiddenGemsList,
      budgetValueBest,
      overpricedWarning
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
        reply = `สวัสดีครับ! ผมคือ <b>AI Food Data Assistant 2.0</b> แผงผู้ช่วยตัดสินใจคัดกรองร้านอาหารย้อนยุควิเคราะห์สูงครับ 🤖<br><br>ผมได้รับการป้อนชุดแผนงานและข้อมูลสถิติของร้านอาหารต่างๆ ไว้ในสมอง คุณสามารถพิมพ์เจาะจงมองหาร้านอาหารได้หลากหลายความประสงค์ เช่น:<br>• <i>"มีร้านเนื้อย่างสยามแนะนำไหม"</i><br>• <i>"แนะนำคาเฟ่ยามวันหยุด"</i><br>• <i>"ช่วยสแกนหาร้านประหยัดอารีย์"</i>`;
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
          reply = `🤖 ขออภัยครับคุณผู้ใช้งาน ผมเป็น <b>AI Food Data Assistant</b> ที่ได้รับการตั้งโปรแกรมให้อนุเคราะห์ข้อมูลเฉพาะ <b>ฐานข้อมูลร้านอาหารภายในระบบของระบบ</b> เท่านั้นครับ<br><br>ผมไม่ได้รับการอนุญาตให้คุยเรื่องสภาพดินฟ้าอากาศ การเมือง มุกตลกสัพเพเหระ หรือสานสัมพันธ์พูดคุยทั่วไปได้เนื่องจากความเสี่ยงทางข้อมูลมั่วซั่ว (Hallucination) ครับ<br><br>กรุณาระบุคีย์เวิร์ดพิกัดหลักเพื่อค้นหา เช่น:<br>• <i>"แนะนำร้านเด็ดทองหล่อ"</i><br>• <i>"ชาบูพรีเมียมอโศก"</i><br>• <i>"สแกนข้อมูลร้านประหยัดพร้อมพงษ์"</i>`;
        } else if (matchedItem) {
          const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(matchedItem.name + ' ราคา เมนู อาหาร')}`;
          const isEstimateMsg = matchedItem.isEstimatedPrice 
            ? `~${matchedItem.price}฿/คน (ประมาณการโดย AI) <a href="${searchUrl}" target="_blank" class="text-blue-700 underline text-[10px] ml-1">🔍 ตรวจสอบรูปภาพเมนูจริง</a>` 
            : `${matchedItem.price}฿/คน`;

          reply = `🤖 <b>พบรายชื่อร้าน "${matchedItem.name}" ในระบบประวรรตนาการครับ:</b><br><br>
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
            let responseTitle = "✨ <b>ร้านอาหารแนะนำระดับคัดเกรดสูงสุดในระบบตามที่คุณขอดินัง:</b><br>";
            
            if (matchedAreaKey && matchedCategoryKey) {
              responseTitle = `✨ <b>แนะนำกลุ่มอาหาร [${matchedCategoryKey}] บนย่าน [${matchedAreaKey}] ที่ดีที่สุดตามกฎสถิติ:</b><br>`;
            } else if (matchedAreaKey) {
              responseTitle = `✨ <b>แนะนำร้านเด่นน่าสนใจบนทำเล [${matchedAreaKey}] คัดเกรนดาวค้างฟ้า:</b><br>`;
            } else if (matchedCategoryKey) {
              responseTitle = `✨ <b>สแกนร้านหมวดหมู่ [${matchedCategoryKey}] ท็อปแชนแนลเรตติ้งสูงสุด:</b><br>`;
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
              reply += `<p class="text-[9px] text-gray-600 text-right mt-1">*ยังมีร้านค้าตรงขอบข่ายรอคุณเทียบวิเคราะห์ในแผงหลักอีก ${candidates.length - 3} ร้านครับ</p>`;
            }
          } else {
            reply = `😅 ขออภัยปัญหาระดับเซ็กเมนต์ครับ! คณะประมวลผลไม่พบร้านค้าในภูมิภาค <b>${matchedAreaKey || ""}</b> ที่ตีกรอบด้วยของหวานอาหารคัดยศ <b>${matchedCategoryKey || ""}</b> ตามที่คุณร้องขอเลยครับ<br><br>กรุณาตรวจสอบชื่อตัวละครสเกลร้านค้า หรือเปลี่ยนพิกัดขยายวงจุดตรวจสแกนอีกครั้งในปุ่มแผงควบคุมด้านบนครับ`;
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
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
          <div className="win95-window p-4 w-72 md:w-96 select-none animate-fade-in">
            <div className="win95-title-bar mb-4">
              <span>AI System Processing Control 2.0</span>
            </div>
            <p className="text-xs font-bold leading-tight mb-3 text-black whitespace-pre-line">
              {loadingText}
            </p>
            <div className="win95-inset h-5 w-full bg-gray-200 overflow-hidden relative">
              <div 
                className="h-full bg-amber-800 transition-all duration-300"
                style={{ width: `${loadingProgress}%` }}
              />
              <span className="absolute inset-0 flex items-center justify-center text-[10px] font-black text-black select-none">
                {loadingProgress}%
              </span>
            </div>
            {isScraping && (
              <div className="mt-3 text-[9px] text-red-800 font-bold text-center uppercase animate-pulse">
                🚨 ห้ามกดสแปมทริกเกอร์เด็ดขาด / ระบบคลาวด์ n8n กำลังตอบรับตามใบสั่ง
              </div>
            )}
          </div>
        </div>
      )}

      {/* --- WINDOWS 95 MICROSOFT ALERT MODAL --- */}
      {alertState.show && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
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

      {/* --- MAIN RETRO CONTAINER --- */}
      <div className="max-w-7xl mx-auto win95-window">
        {/* HEADER SECTION */}
        <header className="win95-title-bar flex flex-col md:flex-row gap-4 py-4 px-6 border-b-2 border-black">
          <div className="flex flex-col">
            <div className="flex items-center gap-2">
              <span className="bg-yellow-400 text-black text-xs font-black px-1.5 py-0.5 border border-black shadow">SYSTEM</span>
              <h1 className="text-xl md:text-3xl font-black tracking-tight select-none">AI FOOD ASSISTANT</h1>
            </div>
            <p className="text-xs font-normal opacity-90 mt-1 dark:text-gray-100">
              ⚡ Deep Decision Scoring Engine - รายการคัดสรรสโมสรผู้บริโภคประเมินสถิติสูงสุด
            </p>
          </div>
          <div className="flex flex-col items-end gap-1.5 text-right md:ml-auto">
            <div className="flex flex-wrap gap-1 mb-1 justify-end">
              <span className="badge bg-blue-105 text-blue-850 border-blue-400 font-bold select-none text-[10px]">n8n</span>
              <span className="badge bg-amber-105 text-amber-900 border-amber-600 font-bold select-none text-[10px]">Apify</span>
              <span className="badge bg-orange-105 text-orange-850 border-orange-400 font-bold select-none text-[10px]">Google Sheet</span>
              <span className="badge bg-purple-105 text-purple-800 border-purple-400 font-bold select-none text-[10px]">Google Gemini CLI</span>
              <span className="badge bg-green-105 text-green-800 border-green-400 font-bold select-none text-[10px]">Antigravity IDE</span>
            </div>
            <p className="text-xs font-bold text-gray-800">ผู้จัดทำ: นาย ธีรเมธ แซ่เบ้</p>
            <div className="flex flex-wrap gap-x-2 items-center text-[10px] text-gray-700 justify-end">
              <span>ข้อมูลจาก: <b className="uppercase">{dataSource || "กำลังสแกน"}</b></span>
              <span>•</span>
              <span>Updated: <b className="text-blue-900 font-black">{lastUpdatedTime}</b></span>
            </div>

            {/* Scrape trigger button with disabled control locks and styling states */}
            <button
              onClick={triggerScrape}
              disabled={isScraping || isLoading}
              className={`win95-button bg-yellow-400 text-black font-bold text-xs mt-1 w-full md:w-auto flex items-center justify-center gap-1 leading-none ${isScraping ? "opacity-60 cursor-not-allowed" : "hover:scale-102"}`}
            >
              {isScraping ? (
                <>
                  <span className="inline-block w-2.5 h-2.5 rounded-full bg-red-600 animate-ping mr-1" />
                  <span>กำลังดำเนินการสแกนผ่าน n8n...</span>
                </>
              ) : (
                <>
                  <RotateCcw className="w-3.5 h-3.5 animate-spin-slow" />
                  <span>🔄 เริ่มบังคับระบบ Scrape ใหม่</span>
                </>
              )}
            </button>
          </div>
        </header>

        {/* CONTROLS & MAIN DATABASE CONTAINER AND DOCK */}
        <div className="p-4 bg-[#c0c0c0] grid grid-cols-1 lg:grid-cols-12 gap-4">
          
          {/* SIDEBAR FILTERS CLOUD */}
          <aside className="lg:col-span-3 flex flex-col gap-4">
            
            {/* AREA FILTER */}
            <div className="win95-window p-3">
              <div className="win95-title-bar mb-2 select-none">
                <div className="flex items-center gap-1.5">
                  <MapPin className="w-3.5 h-3.5" />
                  <span>📍 พิกัดย่านหลัก (Mapping 2.0)</span>
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
                  <span>📊 ประเภทอาหารการเสิร์ฟ</span>
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
                  <span>🗄️ ความเรียบร้อยชีตข้อมูล</span>
                </div>
              </div>
              <div className="win95-inset p-2.5 bg-white text-[11px] leading-relaxed text-gray-800 space-y-1">
                <p>• <b>บีบอัดชื่อซ้ำ:</b> คัดแยกเฉพาะร้านไม่พิมพ์ทับกัน</p>
                <p>• <b>คัดกรองพิกัด:</b> แปลงค่าที่อยู่ดิบเป็นเขตย่านภูมิภาค</p>
                <p>• <b>ป้ายเตือน Confidence:</b> ดัชนีประเมินรอบทอยสถิติต่ำ</p>
                <p>• <b>แบบจำลองงบประมาณ:</b> ถักทอช่วงราคากรณีขาดตก</p>
              </div>
            </div>

            {/* GOOGLE SHEETS REFRESH BUTTON */}
            <div className="win95-window p-3">
              <div className="win95-title-bar mb-2 select-none">
                <div className="flex items-center gap-1.5">
                  <Database className="w-3.5 h-3.5" />
                  <span>🔄 ดึงข้อมูลความปลอดภัยล่าสุด</span>
                </div>
              </div>
              <button
                onClick={() => loadData(true)}
                disabled={isLoading || isScraping}
                className="w-full win95-button bg-green-700 text-white font-bold text-xs py-2 px-3 hover:bg-green-800 disabled:opacity-50 select-none flex items-center justify-center gap-2"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>รีเฟรชข้อมูลจาก Google Sheet</span>
              </button>
            </div>

          </aside>

          {/* MAIN COLUMN RESULTS FIELD */}
          <main className="lg:col-span-9 flex flex-col gap-4">
            
            {/* COMPACT METRIC CARDS */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5">
              <div className="win95-window p-2.5 text-center select-none shadow">
                <div className="text-[10px] uppercase font-black text-gray-600 flex items-center justify-center gap-1 mb-1">
                  <Building2 className="w-3 h-3 text-blue-700" />
                  <span>TOTAL MATChes</span>
                </div>
                <div className="text-2xl font-black text-blue-800 tracking-tight">
                  {systemStats.total} <span className="text-[10px] text-gray-500 font-normal">ร้าน</span>
                </div>
              </div>

              <div className="win95-window p-2.5 text-center select-none shadow">
                <div className="text-[10px] uppercase font-black text-gray-600 flex items-center justify-center gap-1 mb-1">
                  <Coins className="w-3 h-3 text-green-700" />
                  <span>AVG PRICE/HEAD</span>
                </div>
                <div className="text-2xl font-black text-green-700 tracking-tight">
                  {systemStats.avgPrice}฿ <span className="text-[10px] text-gray-500 font-normal">โดยประมาณ</span>
                </div>
              </div>

              <div className="win95-window p-2.5 text-center select-none shadow">
                <div className="text-[10px] uppercase font-black text-gray-600 flex items-center justify-center gap-1 mb-1">
                  <Sparkles className="w-3 h-3 text-amber-700" />
                  <span>AVG DECISION SCORE</span>
                </div>
                <div className="text-2xl font-black text-amber-800 tracking-tight">
                  {systemStats.avgScore}% <span className="text-[10px] text-gray-500 font-normal">เกรดเฉลี่ย</span>
                </div>
              </div>

              <div className="win95-window p-2.5 text-center select-none shadow">
                <div className="text-[10px] uppercase font-black text-gray-600 flex items-center justify-center gap-1 mb-1">
                  <ShieldCheck className="w-3 h-3 text-purple-700" />
                  <span>HIGH-TRUST STORES</span>
                </div>
                <div className="text-2xl font-black text-purple-800 tracking-tight">
                  {systemStats.trustedCount} <span className="text-[10px] text-gray-500 font-normal">พาส</span>
                </div>
              </div>
            </div>

            {/* TOP 3 INTELLIGENT EXPERT DECISIONS RECOMMENDATION PANEL */}
            <div className="win95-window overflow-hidden shadow-md">
              <div className="win95-title-bar bg-amber-800 select-none">
                <div className="flex items-center gap-1.5 font-black">
                  <Sparkles className="w-4 h-4 text-yellow-300 fill-yellow-300 animate-pulse" />
                  <span>⭐ TOP 3 AI INTELLIGENCE SELECTION (ระดับยอดมงกุฎพรีเมียม)</span>
                </div>
              </div>
              
              {/* Situational Scenarios Switch Bar */}
              <div className="bg-gray-200 p-2 border-b border-black flex flex-wrap gap-x-4 gap-y-1.5 items-center text-xs">
                <span className="font-bold border-r border-gray-400 pr-2 block select-none">🎯 ถ่วงน้ำหนักตามสถานการณ์:</span>
                <div className="flex flex-wrap gap-2 md:gap-3">
                  {[
                    { val: "default", label: "⚖️ สมดุลความคุ้มค่า", hint: "คํานวณเรตติ้ง ยอดรีวิว และราคา อย่างกลมกลืน" },
                    { val: "safe", label: "🛡️ เลี่ยงคนไม่รู้ (ยอดรีวิวสูงสุด)", hint: "เน้นร้านขนาดใหญ่ที่มีฐานพยานยืนยันมากเป็นหลัก" },
                    { val: "cheap", label: "💰 คืนงบกระเป๋า (ประหยัดค่าใช้จ่าย)", hint: "ปรับเพิ่มน้ำหนักเมนูราคาประหยัดต่อคน" },
                    { val: "fast", label: "⚡ ด่วนจี๋สี่คู่ (อาหารกินไว)", hint: "คัดกรองกลุ่มราเมง/ตามสั่ง/คาเฟ่ ที่รอบสลับโต๊ะไว" },
                    { val: "work", label: "💼 คุยธุรกิจหรู (คุยงาน)", hint: "ถ่วงน้ำหนักคาเฟ่เบเกอรี่หรืองานสเต็กเป็นองค์กรหลัก" },
                    { val: "large", label: "👥 ทีมใหญ่สังสรรค์ (8-12 คน)", hint: "เจาะจงกลุ่มชาบูปิ้งย่างสำหรับเลี้ยงเปิดใจพนักงาน" }
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
                        className={`win95-window flex flex-col p-0.5 transition-all duration-300 relative ${idx === 0 ? "premium-rank-1 border-amber-700 border-4 scale-[1.01]" : ""}`}
                      >
                        {/* Title Bar Card */}
                        <div className={`win95-title-bar ${idx === 0 ? "bg-amber-800" : "bg-gray-700"} select-none`}>
                          <span className="font-black text-xs">#{idx + 1} AI CHOICE</span>
                          <span className="text-[10px] bg-white text-black px-1 border border-black font-black">
                            {customScenarioScoreValue}% SCORE
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
                              <span className="badge bg-purple-600 text-white border-white scale-90">High Trust</span>
                            )}
                            {item.isEstimatedPrice && (
                              <span className="badge bg-yellow-400 text-black border-black scale-90" title="คำนวณถ่วงประเมินราคาโดย AI">AI-Est Price</span>
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
                              <div className="text-[7px] uppercase text-gray-500 font-bold">Rating</div>
                              <div className="text-[10px] font-black text-blue-800">{item.rating} ⭐</div>
                            </div>
                            <div className="win95-inset bg-green-50/50 p-1 text-center select-none">
                              <div className="text-[7px] uppercase text-gray-500 font-bold">Price Range</div>
                              <div className="text-[10px] font-black text-green-800 flex justify-center items-center gap-0.5">
                                <span>{item.display_price}</span>
                                {item.isEstimatedPrice && (
                                  <a href={searchUrl} target="_blank" rel="noopener noreferrer" className="text-blue-600 font-normal hover:underline text-[9px]" title="แคนเมนูราคาจริง">🔍</a>
                                )}
                              </div>
                            </div>
                            <div className="win95-inset bg-amber-50/50 p-1 text-center select-none">
                              <div className="text-[7px] uppercase text-gray-500 font-bold">Base score</div>
                              <div className="text-[10px] font-black text-amber-800">{item.base_score}%</div>
                            </div>
                          </div>

                          {/* Quick details */}
                          <div className="text-[10px] text-gray-700 space-y-1.5 flex-1">
                            <p className="flex items-center gap-1">
                              <span className="text-blue-900 font-black">📍 ย่านพื้นที่:</span> <span className="font-bold underline">{item.area}</span>
                            </p>
                            <p className="flex items-center gap-1">
                              <span className="text-gray-800 font-black">🍲 แนวจานอาหาร:</span> <span className="badge bg-slate-100">{item.category}</span>
                            </p>
                            
                            {/* Technical Badges indicators for High Trust, Low stats, Risk levels */}
                            <div className="flex flex-wrap gap-1.5 pt-1">
                              <span className={`badge ${confidenceObject.confidence >= 75 ? "bg-green-100 text-green-800 border-green-500" : confidenceObject.confidence >= 50 ? "bg-orange-100 text-orange-850 border-orange-500" : "bg-red-100 text-red-800 border-red-500"}`} title={confidenceObject.reasons.join('\n')}>
                                Confidence: {confidenceObject.confidence}%
                              </span>
                              <span className={`badge ${operationalRiskObject.level === "ต่ำ" ? "bg-green-100 text-green-800 border-green-500" : operationalRiskObject.level === "กลาง" ? "bg-orange-100 text-orange-855 border-orange-500" : "bg-red-100 text-red-800 border-red-500"}`}>
                                Risk: {operationalRiskObject.level}
                              </span>
                            </div>
                          </div>

                          {/* DEEP WHY UNDERSTAND ACCORDION */}
                          <div className="mt-3.5 pt-2 border-t border-dashed border-gray-400">
                            <details className="win95-inset p-1.5 bg-white text-[10px] leading-tight text-gray-800">
                              <summary className="cursor-pointer font-black text-blue-900 hover:underline select-none outline-none">
                                🔬 วิเคราะห์เชิงสถิติเบื้องหลัง (Deep Reason)
                              </summary>
                              
                              <div className="mt-2 text-[10px] space-y-2 leading-relaxed">
                                {/* Competitor delta comparison */}
                                <div className="win95-inset p-1.5 bg-gray-50">
                                  <span className="font-bold text-gray-700 block mb-1">📊 เปรียบเทียบกับคู่แข่งขัน:</span>
                                  {idx === 0 ? (
                                    <span>ยึดหัวหาดอันดับหนึ่งในตระกูลสถิติย่าน ริมเส้นถ่วงดุลราคาเสถียรที่สุดในหมวดผลลัพธ์</span>
                                  ) : (
                                    <span>เป็นตัวเลือกสำรองที่ได้แต้มเฉือนต่ำกว่าข้อเสนอลำดับก่อนหน้าเล็กน้อยที่พิกัดงบการเฉลี่ย</span>
                                  )}
                                </div>

                                {/* Dataset constraints honesty declaration */}
                                <div className="win95-inset p-1.5 bg-gray-50">
                                  <span className="font-bold text-gray-700 block mb-1">📃 หลักฐานดิบที่มีการป้อน (Grounded Evidence):</span>
                                  <span>พิกัด {item.area} เรตโหวต {item.rating} ดาว ฐานผู้ส่งคำร้องจอดค้าง {item.reviews} บัญชี <i>(*ระบบไม่ประเมินเรื่องคุณภาพคิวหน้าร้านจริงเนื่องจาก Google Sheet ไม่มีช่องระบุตัวแปร)</i></span>
                                </div>

                                {/* Score components breakdown */}
                                <div className="space-y-1">
                                  <span className="font-bold text-gray-700 block">📐 องค์ประกอบคะแนน {selectedScenario} Scenario:</span>
                                  <div className="grid grid-cols-2 gap-1 text-[9px]">
                                    <div className="bg-blue-50/50 p-1 win95-inset">เรตติ้งสัมผัส: {(item.scenario_parts?.quality || 0).toFixed(0)}%</div>
                                    <div className="bg-purple-50/50 p-1 win95-inset">ฐานหงายไพ่: {(item.scenario_parts?.popularity || 0).toFixed(0)}%</div>
                                    <div className="bg-green-50/50 p-1 win95-inset">สิทธิคุ้มเงิน: {(item.scenario_parts?.budget || 0).toFixed(0)}%</div>
                                    <div className="bg-amber-50/50 p-1 win95-inset">กลุ่มจำแนกประเภท: {(item.scenario_parts?.categoryFit || 0).toFixed(0)}%</div>
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
                              <span>MAP ลิงก์</span>
                            </a>
                            <a 
                              href={item.source} 
                              target="_blank" 
                              rel="noopener noreferrer" 
                              className="win95-button text-[9px] flex-1 text-center flex items-center justify-center gap-0.5"
                            >
                              <ExternalLink className="w-2.5 h-2.5" />
                              <span>เพจร้าน</span>
                            </a>
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
                  <span>📂 RESTAURANT DATABASE (รวมบัญชีรายชื่อร้านทั้งหมด)</span>
                </div>
                
                {/* Search Bar DB */}
                <div className="relative">
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="สกรีนชื่อร้านย่อ..."
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
              <div className="max-h-[380px] overflow-y-auto scroll-win95 bg-white">
                <table className="w-full text-left text-xs border-collapse">
                  <thead className="sticky top-0 bg-gray-200 z-10 select-none">
                    <tr className="border-b-2 border-black">
                      {[
                        { field: "name", label: "ชื่อร้านค้า ↕" },
                        { field: "price", label: "งบประมาณ/คน ↕", align: "text-center" },
                        { field: "rating", label: "เรตติ้งโหวต (รีวิว) ↕", align: "text-center" },
                        { field: "base_score", label: "AI Score ↕", align: "text-center" },
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
                            className={`p-2 border-r border-gray-400 cursor-pointer hover:bg-gray-300 font-bold ${col.align || ""} ${isSortActive ? "bg-gray-300 font-black text-amber-900" : ""}`}
                          >
                            <div className="flex items-center gap-1 justify-center">
                              <span>{col.label}</span>
                              {isSortActive && <ArrowUpDown className="w-2.5 h-2.5" />}
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
                          <tr key={`${item.name}-${idx}`} className="hover:bg-blue-50/50 bg-white">
                            <td className="p-2 font-bold max-w-[150px] truncate">{item.name}</td>
                            <td className="p-2 text-center font-bold">
                              {item.isEstimatedPrice ? (
                                <span className="text-green-700/80" title="ค่าสถิติจำลองโดย AI">
                                  {item.display_price}
                                  <a href={searchUrl} target="_blank" rel="noopener noreferrer" className="ml-1 text-[10px] text-blue-600 hover:underline">🔍</a>
                                </span>
                              ) : (
                                <span className="text-green-800">{item.display_price}</span>
                              )}
                            </td>
                            <td className="p-2 text-center text-blue-800 font-bold">
                              {item.rating} <span className="text-[9px] text-gray-500 font-normal">({item.reviews})</span>
                            </td>
                            <td className="p-2 text-center font-black text-amber-800">{item.base_score}%</td>
                            <td className="p-2"><span className="badge bg-slate-100">{item.category}</span></td>
                            <td className="p-2 text-[10px] font-mono">{item.area}</td>
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
              <div className="win95-title-bar bg-amber-950 select-none">
                <div className="flex items-center gap-1.5 font-bold">
                  <TrendingUp className="w-4 h-4 text-yellow-300" />
                  <span>🤖 แฟ้มรายงาน AI ANALYSIS & INSIGHTS 2.0 (วิเคราะห์ตลาดและพฤติกรรมผู้บริโภค)</span>
                </div>
              </div>

              <div id="ai-insights-block" className="p-3 bg-[#e0e0e0] win95-inset m-2 space-y-4">
                {marketInsights ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 font-sans">
                    
                    {/* General Market parameters */}
                    <div className="win95-window p-2 bg-white">
                      <div className="win95-title-bar bg-blue-800 select-none">
                        <span>1) ข้อมูลภาพรวมตลาดและระดับราคาเฉลี่ย</span>
                      </div>
                      <div className="p-2 text-xs text-gray-800 space-y-1.5 leading-relaxed">
                        <p>• <b>กลุ่มตัวอย่างทั้งหมด:</b> มีความหนาแน่นร้านค้ารองรับ {filteredRestaurants.length} รายการในการคำนวณเบลนด์</p>
                        <p>• <b>งบประมาณประเมินเฉลี่ย:</b>ตกอยู่ที่ ~{systemStats.avgPrice}฿ ต่อคน</p>
                        <p>• <b>ขอบเขต Quartile เปรียบเทียบ:</b></p>
                        <div className="win95-inset p-2 bg-gray-50 text-[11px] grid grid-cols-3 gap-1 divide-x divide-gray-300">
                          <div className="text-center"><b>P25 (ราคาเริ่มต้น):</b><br/>{marketInsights.p25}฿</div>
                          <div className="text-center pl-1"><b>P50 (มัธยฐาน):</b><br/>{marketInsights.p50}฿</div>
                          <div className="text-center pl-1"><b>P75 (ค่าพรีเมียม):</b><br/>{marketInsights.p75}฿</div>
                        </div>
                      </div>
                    </div>

                    {/* Dominant Categories & Area Comparison */}
                    <div className="win95-window p-2 bg-white">
                      <div className="win95-title-bar bg-purple-800 select-none">
                        <span>2) เปรียบเทียบศักยภาพย่านความนิยมหลัก</span>
                      </div>
                      <div className="p-2 text-xs text-gray-800 space-y-2 max-h-[160px] overflow-y-auto scroll-win95">
                        {marketInsights.areaStats.map(stat => (
                          <div key={stat.area} className="flex justify-between items-center text-[11px] border-b border-gray-200 pb-1 last:border-0 last:pb-0">
                            <span className="font-bold underline">{stat.area}</span>
                            <span className="text-gray-600">มี ({stat.count} ร้าน) | เรตเฉลี่ย: <b>{stat.avgRating}</b>⭐ | บิลเฉลี่ย: <b>{stat.avgPrice}฿</b></span>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Hidden Gems and Risky warn indicators */}
                    <div className="win95-window p-2 bg-white col-span-1 md:col-span-2">
                      <div className="win95-title-bar bg-[#3e4450] select-none">
                        <span>3) หมวดคัดเลือกพิเศษ (Hidden Gems และ ความไม่แน่ใจของสถิติ)</span>
                      </div>
                      <div className="p-2.5 grid grid-cols-1 md:grid-cols-2 gap-3.5">
                        
                        {/* Hidden Gems Column */}
                        <div className="space-y-1.5">
                          <span className="font-extrabold text-[12px] text-green-800 block">✨ อันดับวัตถุดิบซ่อนหา (Hidden Gems)</span>
                          <span className="text-[10px] text-gray-500 block leading-tight">เงื่อนไข: เรตติ้งสูงกว่าหรือเท่ากับ 4.5⭐ แต่ประวัติคนโหวตน้อยกว่า 150 คน (พิกัดป้ายอันดับน่าหลงใหลแต่คุณอาจต้องพรูฟเสถียรความรสชาติคนเดียว)</span>
                          <div className="space-y-1.5">
                            {marketInsights.hiddenGemsList.length === 0 ? (
                              <span className="text-[11px] text-gray-400 block italic">ไม่พบร้านเข้าแก๊ปกลุ่มซ่อนพิเศษ</span>
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
                          <span className="font-extrabold text-[12px] text-red-800 block">⚠️ ร้านเสี่ยงใช้คัดถอดสมรสราคา (Overpriced Outlier Profile)</span>
                          <span className="text-[10px] text-gray-500 block leading-tight">เกณฑ์: ราคาสูงเกินขอบเขต P75 {marketInsights.p75}฿ แต่คะแนน AI Decision ต่ำกว่ามาตรฐานความคุ้มทุน</span>
                          <div className="space-y-1.5">
                            {marketInsights.overpricedWarning.length === 0 ? (
                              <span className="text-[11px] text-gray-400 block italic">ไม่มีรายการร้านโพล่งราคาขัดประสิทธิภาพ</span>
                            ) : (
                              marketInsights.overpricedWarning.slice(0, 3).map(warn => (
                                <div key={warn.name} className="win95-inset p-1 bg-white text-[10.5px] flex justify-between gap-1">
                                  <span className="font-bold text-red-800 truncate">{warn.name}</span>
                                  <span className="font-bold whitespace-nowrap">{warn.price}฿ | AI: {warn.base_score}%</span>
                                </div>
                              ))
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
            <div className="win95-window border-4 border-orange-950 shadow">
              <div className="win95-title-bar bg-orange-950 select-none">
                <div className="flex justify-between items-center w-full">
                  <div className="flex items-center gap-1.5 font-bold">
                    <AlertTriangle className="w-4 h-4 text-yellow-300 fill-yellow-300 animate-pulse" />
                    <span>🚩 Human Review Queue</span>
                  </div>
                  <span className="text-[10px] bg-red-700 text-white font-black px-1.5 py-0.5 border border-white">
                    {flagFilterSeverity === "all" ? allHumanReviewFlags.length : filteredHumanReviewFlags.length} รายการตรวจสอบค้างคา
                  </span>
                </div>
              </div>

              {/* High Control Flags Dashboard Section */}
              <div className="p-3 bg-gray-200 border-b border-gray-400">
                <div className="flex flex-col md:flex-row gap-3 items-stretch md:items-center">
                  
                  {/* Severity buttons filters */}
                  <div className="flex items-center gap-1.5 text-xs">
                    <span className="font-bold select-none">ระดับเตือนภัย:</span>
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
                    <span className="text-xs font-bold whitespace-nowrap select-none">ค้นร้านปัญหารายการ:</span>
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
                    <span>ไม่พบธงข้อพิพาทหรือปัญหาสถิติ Low Confidence เจาะจงตามตัวเลือกนี้ครับ</span>
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
                                <span className="text-gray-500 font-bold block text-[9px] uppercase tracking-wider">บทวิเคราะห์สัญญาณปัญหา (Detailed Reason):</span>
                                <p className="text-gray-800 text-[11px]">
                                  {flag.reason}
                                </p>
                              </div>

                              {/* Target Action Guidelines */}
                              <div className="bg-orange-50/50 p-2 border-l-4 border-orange-500 win95-inset">
                                <span className="text-orange-950 font-black text-[10px] uppercase block mb-0.5">📋 แนะนำคำสั่งปฏิบัติการแก้ใขข้อมูลสำหรับแอดมิน:</span>
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
                ℹ️ คำจำกัดความความน่าเชื่อถือสถิติ: คะแนนโหวตและราคาที่ไม่น่าไว้วางใจจะถูกแสดงที่นี่เพื่อคัดกรองเนื้อหาไม่สมเหตุสมผลออก
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
          className="fixed bottom-4 right-4 w-80 md:w-96 win95-window z-40 shadow-2xl animate-fade-in"
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
