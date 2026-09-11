import { useCallback, useEffect, useState } from "react";
import "leaflet/dist/leaflet.css";
import "./App.css";

import type {
  Alerts,
  AppUser,
  CollectionHealth,
  ProvinceRank,
  StationHistory,
  StationReading,
  StationSummary,
  Summary,
  WeatherNow,
} from "./api";
import { api } from "./api";
import { AlertPanel } from "./components/AlertPanel";
import { DataHealth } from "./components/DataHealth";
import { DiseaseRisk } from "./components/DiseaseRisk";
import { HomePage } from "./components/HomePage";
import { NavBar } from "./components/NavBar";
import type { SectionKey } from "./components/NavBar";
import { ProvinceRanking } from "./components/ProvinceRanking";
import { ForecastPanel } from "./components/ForecastPanel";
import { RainPanel } from "./components/RainPanel";
import { SignIn } from "./components/SignIn";
import { SearchOverlay } from "./components/SearchOverlay";
import { StationMap } from "./components/StationMap";
import { StationTrend } from "./components/StationTrend";
import { LevelBar, SummaryCards } from "./components/SummaryCards";
import { loadSettings, sendIfDue } from "./dailyDigest";
import { recordAlerts } from "./noticeRecorder";
import { WeatherPanel } from "./components/WeatherPanel";

// เก็บผู้ใช้ไว้ในเบราว์เซอร์ เพื่อไม่ต้องกรอกชื่อใหม่ทุกครั้งที่เปิดโปรแกรม
const USER_KEY = "pm25_user";

/** โหมดสีที่ผู้ใช้เลือกไว้ */
const THEME_KEY = "pm25_theme";

/** อ่านโหมดที่เลือกไว้ ถ้ายังไม่เคยเลือกให้ตามค่าที่ตั้งไว้ในเครื่อง
 *
 * ตามเครื่องเป็นค่าตั้งต้นที่ดีกว่าบังคับสว่างเสมอ
 * คนที่ตั้งเครื่องเป็นโหมดมืดไว้แล้วมักตั้งใจให้ทุกอย่างเป็นมืด
 * แต่พอกดปุ่มเองครั้งแรก จะยึดตามที่กดตลอดไป ไม่กลับไปตามเครื่องอีก
 */
function loadTheme(): "light" | "dark" {
  try {
    const saved = localStorage.getItem(THEME_KEY);
    if (saved === "light" || saved === "dark") return saved;
  } catch {
    // เบราว์เซอร์บางตัวปิดที่เก็บข้อมูลไว้ ถือว่ายังไม่เคยเลือก
  }
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function loadSavedUser(): AppUser | null {
  try {
    const raw = localStorage.getItem(USER_KEY);
    return raw ? (JSON.parse(raw) as AppUser) : null;
  } catch {
    return null;
  }
}

export default function App() {
  const [user, setUser] = useState<AppUser | null>(loadSavedUser);
  const [theme, setTheme] = useState<"light" | "dark">(loadTheme);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [stations, setStations] = useState<StationReading[]>([]);
  const [ranking, setRanking] = useState<ProvinceRank[]>([]);
  const [health, setHealth] = useState<CollectionHealth | null>(null);
  const [alertData, setAlertData] = useState<Alerts | null>(null);
  const [weatherNow, setWeatherNow] = useState<WeatherNow | null>(null);
  const [provinces, setProvinces] = useState<string[]>([]);
  // จังหวัดที่กำลังดูสภาพอากาศ แยกจากจังหวัดที่ผู้ใช้ตั้งไว้ในโปรไฟล์
  // เพราะผู้ใช้อาจอยากดูที่อื่นชั่วคราวโดยไม่ต้องไปแก้โปรไฟล์ตัวเอง
  // จังหวัดที่กำลังดูค่าฝุ่น ค่าว่างแปลว่าทั้งประเทศ
  //
  // แยกจากจังหวัดของสภาพอากาศ เพราะสองเรื่องนี้คนละขอบเขตกันโดยธรรมชาติ
  // ค่าฝุ่นดูภาพรวมทั้งประเทศได้และเป็นค่าตั้งต้นที่มีความหมาย
  // ส่วนสภาพอากาศต้องเจาะจงจังหวัดเสมอ เพราะอุณหภูมิเฉลี่ยทั้งประเทศไม่มีความหมาย
  const [dustProvince, setDustProvince] = useState<string>("");

  // สถานีที่เจาะดูในกลุ่มการ์ดฝุ่น ค่าว่างแปลว่าดูรวมทั้งจังหวัด
  //
  // ขอบเขตนี้แคบกว่าจังหวัด แต่มีผลเฉพาะกลุ่มการ์ดฝุ่นเท่านั้น
  // ส่วนแถบสัดส่วนระดับ แผนที่ และแผงโรคยังเป็นของทั้งจังหวัดเหมือนเดิม
  // เพราะสัดส่วนของสถานีเดียวคือแท่งเดียวเต็มความกว้าง ซึ่งไม่บอกอะไร
  const [dustStation, setDustStation] = useState<string>("");
  const [stationSummary, setStationSummary] = useState<StationSummary | null>(null);

  // จังหวัดที่กดเลือกบนแผนที่ เก็บไว้ที่นี่ไม่ใช่ในแผนที่
  // เพราะต้องล้างทิ้งเมื่อสลับหน้า ไม่งั้นกลับมาแล้วแผงยังค้างอยู่
  const [pickedProvince, setPickedProvince] = useState<string | null>(null);

  // โรคที่เลือกดูในหน้าโรคจากฝุ่น ค่าว่างแปลว่าดูทุกโรค
  //
  // เก็บเป็นชื่อเต็มตามที่เซิร์ฟเวอร์ส่งมา ไม่ใช่ชื่อย่อที่ตัดคำนำหน้าออกแล้ว
  // เพราะต้องเอาไปเทียบกับกุญแจในตารางค่าเสี่ยงและกลุ่มโรคของกรมควบคุมโรค
  const [pickedDisease, setPickedDisease] = useState<string>("");

  // รายชื่อโรคสำหรับช่องเลือก อ่านจากตารางค่าเสี่ยงที่เซิร์ฟเวอร์ส่งมา
  //
  // ไม่เขียนรายชื่อไว้ในหน้าเว็บ เพราะถ้าฝั่งหลังบ้านเพิ่มหรือตัดโรค
  // ช่องเลือกจะไม่ตรงกับสิ่งที่แสดงจริง และไม่มีใครรู้ตัวจนกว่าจะมีคนสังเกต
  const [diseaseNames, setDiseaseNames] = useState<string[]>([]);

  // จังหวัดที่ใช้ดึงสภาพอากาศ มาจากช่องเลือกเดียวกับค่าฝุ่น
  //
  // ทำไมต้องมีตัวสำรอง
  //     ช่องเลือกมีตัวเลือกทั้งประเทศ ซึ่งใช้กับค่าฝุ่นได้เพราะค่าเฉลี่ยรวมมีความหมาย
  //     แต่ใช้กับอากาศไม่ได้ อุณหภูมิเฉลี่ยของทั้งประเทศไม่ได้บอกอะไรกับใคร
  //     เมื่อเลือกทั้งประเทศจึงตกไปใช้จังหวัดในโปรไฟล์ แล้วค่อยตกไปที่ค่าตั้งต้น
  const weatherTarget = dustProvince || user?.province || "กรุงเทพฯ";
  const [history, setHistory] = useState<StationHistory | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [searching, setSearching] = useState(false);
  // หน้าแรกที่เห็นหลังกรอกชื่อ คือหน้าหลักเดียวกับที่ปุ่มกลับพากลับมา
  const [active, setActive] = useState<SectionKey>("home");


  // ข้อมูลชุดที่ไม่ขึ้นกับพื้นที่ที่เลือก
  //
  // แยกออกจากการดึงค่าสรุปโดยตั้งใจ เพราะห้าเส้นทางนี้ให้คำตอบเดิมเสมอ
  // ไม่ว่าผู้ใช้จะเลือกจังหวัดไหน ถ้ารวมไว้ด้วยกัน การกดเปลี่ยนจังหวัดหนึ่งครั้ง
  // จะยิงคำขอที่รู้คำตอบอยู่แล้วเพิ่มอีกห้าครั้งโดยไม่ได้อะไรกลับมา
  // ดึงครั้งเดียวตอนเข้าระบบ รายชื่อโรคไม่เปลี่ยนระหว่างใช้งาน
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    void (async () => {
      try {
        const result = await api.disease();
        if (!cancelled) setDiseaseNames(Object.keys(result.risk_by_group ?? {}));
      } catch {
        if (!cancelled) setDiseaseNames([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user]);

  // ใส่โหมดที่เลือกไว้ที่ธาตุรากของหน้า แล้วจำไว้ในเครื่อง
  //
  // ใส่ที่ธาตุรากไม่ใช่ที่ body เพราะตัวแปรสีประกาศไว้ที่ :root
  // ใส่โหมดลงหน้าเว็บก่อนสั่งให้ React วาดใหม่ ไม่ใช่ทำใน useEffect
  //
  // เพราะ levelInk กับ levelColor อ่านโหมดจาก data-theme ตอนที่ถูกเรียก
  // ซึ่งเกิดขึ้นระหว่างวาด ถ้าไปตั้งค่าใน useEffect ที่ทำงานหลังวาดเสร็จ
  // รอบนั้นจะได้สีของโหมดเก่า แล้วไม่มีรอบวาดถัดไปมาแก้ให้ ค่าจึงค้างผิดตลอด
  //
  // ปิดทรานซิชันชั่วขณะด้วย เพราะปุ่มหลายตัวตั้ง transition ไว้ที่ color
  // พอค่าตัวแปรสีเปลี่ยนทั้งหน้าพร้อมกัน เบราว์เซอร์จะค้างค่าที่คำนวณไว้เดิม
  // ต้องบังคับให้คำนวณสไตล์ใหม่คั่นกลาง ไม่งั้นสองบรรทัดถูกรวบเป็นครั้งเดียว
  // แล้วกฎปิดทรานซิชันจะไม่ทันมีผลตอนที่สีเปลี่ยน ซึ่งเป็นตอนที่ต้องการมันพอดี
  const applyTheme = useCallback((next: "light" | "dark") => {
    const root = document.documentElement;
    root.dataset.themeSwitching = "1";
    void root.offsetHeight;
    root.dataset.theme = next;
    void root.offsetHeight;
    window.setTimeout(() => {
      delete root.dataset.themeSwitching;
    }, 60);

    try {
      localStorage.setItem(THEME_KEY, next);
    } catch {
      // จำไม่ได้ก็ไม่เป็นไร โหมดยังใช้ได้จนกว่าจะปิดหน้า
    }
    setTheme(next);
  }, []);

  // ตั้งค่าครั้งแรกตอนเปิดหน้า
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    // ตั้งใจไม่ใส่ theme ใน dependency เพราะการสลับทีหลังทำผ่าน applyTheme แล้ว
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadAll = useCallback(async () => {
    try {
      setError(null);
      const [stationData, rankingData, healthData, alertResult, provinceList] =
        await Promise.all([
          api.stations(),
          api.provinceRanking(),
          api.collectionHealth(),
          api.alerts(),
          api.provinces(),
        ]);
      setStations(stationData);
      setRanking(rankingData);
      setHealth(healthData);
      setAlertData(alertResult);
      setProvinces(provinceList);

      // เก็บสถานการณ์ของชั่วโมงนี้ไว้ให้ย้อนดูในระฆัง
      // ตัวมันกันซ้ำเองด้วยเวลาระดับชั่วโมง จึงเรียกทุกรอบได้โดยไม่บวม
      recordAlerts(alertResult);
    } catch (err) {
      setError(err instanceof Error ? err.message : "เกิดข้อผิดพลาดที่ไม่ทราบสาเหตุ");
    }
  }, []);

  useEffect(() => {
    if (!user) return;
    void loadAll();
    // ข้อมูลต้นทางอัปเดตรายชั่วโมง ดึงซ้ำทุก 5 นาทีก็เพียงพอ
    const timer = setInterval(() => void loadAll(), 5 * 60 * 1000);
    return () => clearInterval(timer);
  }, [loadAll, user]);

  // ค่าสรุปของพื้นที่ที่เลือก ดึงใหม่เมื่อเปลี่ยนพื้นที่
  //
  // ไม่ล้างค่าเดิมทิ้งระหว่างรอคำตอบใหม่ ตัวเลขของพื้นที่เดิมจึงค้างอยู่ครู่หนึ่ง
  // ซึ่งดีกว่าให้การ์ดว่างแล้วเด้งกลับมา และป้ายกำกับอ่านขอบเขตจากคำตอบจริง
  // ป้ายกับตัวเลขจึงตรงกันเสมอแม้ในจังหวะที่ยังเปลี่ยนไม่เสร็จ
  useEffect(() => {
    if (!user) return;
    let cancelled = false;

    const load = async () => {
      try {
        const result = await api.summary(dustProvince || null);
        if (!cancelled) setSummary(result);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "เกิดข้อผิดพลาดที่ไม่ทราบสาเหตุ");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void load();
    const timer = setInterval(() => void load(), 5 * 60 * 1000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [user, dustProvince]);

  // ล้างสถานีที่เลือกไว้เมื่อสถานีนั้นไม่ได้อยู่ในจังหวัดที่เลือก
  //
  // ถ้าไม่ล้าง สถานีของจังหวัดเดิมจะค้างอยู่ แล้วการ์ดจะแสดงค่าของคนละจังหวัด
  // กับชื่อที่เขียนอยู่ในช่องเลือกข้างบน ซึ่งอ่านแล้วเข้าใจผิดทันที
  //
  // เดิมล้างทุกครั้งที่จังหวัดเปลี่ยน ซึ่งพอหน้าหลักรวมจังหวัดกับสถานีไว้ในช่องเดียว
  // การเลือกสถานีข้ามจังหวัดจะตั้งค่าทั้งสองอย่างพร้อมกัน แล้วโดนล้างทิ้งทันที
  // จึงเปลี่ยนมาตรวจว่าสถานีอยู่ในจังหวัดที่เลือกหรือไม่ ซึ่งตรงกับเหตุผลเดิมกว่า
  useEffect(() => {
    if (!dustStation) return;
    const picked = stations.find((item) => item.station_code === dustStation);
    if (picked && (!dustProvince || picked.province === dustProvince)) return;
    setDustStation("");
  }, [dustProvince, dustStation, stations]);

  // ค่าของสถานีที่เจาะดู ดึงใหม่เมื่อเปลี่ยนสถานี
  //
  // ล้างค่าเดิมทิ้งทันทีที่เปลี่ยน ต่างจากค่าสรุปของจังหวัดที่จงใจปล่อยให้ค้างไว้
  // เพราะการ์ดชุดนี้เขียนชื่อสถานีกำกับอยู่ในตัว ถ้าค้างของเดิมไว้ระหว่างรอ
  // จะเห็นชื่อสถานีใหม่คู่กับตัวเลขของสถานีเก่าอยู่ครู่หนึ่ง ซึ่งผิดโดยตรง
  useEffect(() => {
    if (!user || !dustStation) {
      setStationSummary(null);
      return;
    }
    let cancelled = false;
    setStationSummary(null);

    const load = async () => {
      try {
        const result = await api.stationSummary(dustStation);
        if (!cancelled) setStationSummary(result);
      } catch {
        // สถานีอาจถูกถอดออกไปแล้ว ถอยกลับไปแสดงค่าของทั้งจังหวัดแทน
        // ดีกว่าขึ้นข้อความผิดพลาดคาดทั้งหน้าเพราะการ์ดกลุ่มเดียว
        if (!cancelled) setDustStation("");
      }
    };

    void load();
    const timer = setInterval(() => void load(), 5 * 60 * 1000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [user, dustStation]);

  // ตรวจว่าถึงเวลาส่งสรุปประจำวันหรือยัง
  //
  // เกาะไปกับรอบดึงข้อมูลที่มีอยู่แล้วทุกห้านาที แทนการตั้งนาฬิกาแยกของตัวเอง
  // ได้สองอย่างพร้อมกัน คือคนที่เพิ่งเปิดเว็บได้รับทันทีถ้าเลยเวลามาแล้ว
  // และคนที่เปิดค้างไว้ก็ได้รับภายในห้านาทีหลังถึงเวลาที่ตั้ง
  //
  // เรียกซ้ำได้ปลอดภัย เพราะตัวมันเช็ควันที่แจ้งล่าสุดก่อนเสมอ
  useEffect(() => {
    if (!user) return;
    const check = () => {
      void sendIfDue(loadSettings(), user.province ?? "");
    };
    check();
    const timer = setInterval(check, 5 * 60 * 1000);
    return () => clearInterval(timer);
  }, [user]);


  // สภาพอากาศปัจจุบันของจังหวัดที่กำลังดูอยู่
  //
  // แยกออกมาจากการโหลดชุดใหญ่ เพราะมาจากคนละแหล่งและเปลี่ยนตามจังหวัดที่เลือก
  // ต้นทางอัปเดตทุก 15 นาที จึงดึงซ้ำทุก 10 นาทีก็เพียงพอ
  useEffect(() => {
    if (!user) return;
    let cancelled = false;

    const load = async () => {
      try {
        const result = await api.weatherNow(weatherTarget);
        if (!cancelled) setWeatherNow(result);
      } catch {
        if (!cancelled) setWeatherNow(null);
      }
    };

    void load();
    const timer = setInterval(() => void load(), 10 * 60 * 1000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [user, weatherTarget]);

  const handleSignedIn = useCallback((signed: AppUser) => {
    localStorage.setItem(USER_KEY, JSON.stringify(signed));
    setUser(signed);
  }, []);

  const handleSignOut = useCallback(() => {
    localStorage.removeItem(USER_KEY);
    setUser(null);
    setHistory(null);
  }, []);

  // หน้าหลักที่ปุ่มกลับพากลับมา
  const HOME: SectionKey = "home";

  const goTo = useCallback((key: SectionKey) => {
    setActive(key);
    // เริ่มอ่านจากบนสุดเสมอเมื่อเปลี่ยนหน้า ไม่งั้นจะค้างอยู่ตำแหน่งเดิมของหน้าก่อน
    window.scrollTo({ top: 0 });
  }, []);

  // ตรวจว่าผู้ใช้ที่จำไว้ในเบราว์เซอร์ยังมีอยู่จริงในฐานข้อมูล
  //
  // จำเป็นเพราะระบบออกแบบให้สร้างฐานข้อมูลใหม่จากไฟล์ CSV ได้ตลอด
  // เมื่อสร้างใหม่ ผู้ใช้ทุกคนจะหายไป แต่เบราว์เซอร์ยังจำชื่อเดิมไว้
  // ถ้าไม่ตรวจ กล่องคำแนะนำจะหายไปเงียบๆ โดยผู้ใช้ไม่รู้ว่าเพราะอะไร
  // และแก้เองไม่ได้เพราะดูเหมือนเข้าสู่ระบบอยู่แล้ว
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    void (async () => {
      try {
        await api.personalSummary(user.id);
      } catch {
        if (!cancelled) handleSignOut();
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user, handleSignOut]);

  const selectStation = useCallback(async (code: string) => {
    setHistoryLoading(true);
    try {
      setHistory(await api.stationHistory(code, 48));
    } catch {
      setHistory(null);
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  // เลือกสถานีที่ค่าฝุ่นสูงสุดให้อัตโนมัติ ผู้ใช้จะได้เห็นกราฟทันทีโดยไม่ต้องคลิก
  useEffect(() => {
    if (!history && stations.length > 0) {
      void selectStation(stations[0].station_code);
    }
  }, [stations, history, selectStation]);

  // กรอกชื่อเพื่อระบุตัวตนก่อน จากนั้นเข้าหน้าข้อมูลทันที
  if (!user) {
    return <SignIn onSignedIn={handleSignedIn} />;
  }

  if (loading) {
    return (
      <main className="app">
        <p className="empty">กำลังโหลดข้อมูล...</p>
      </main>
    );
  }

  if (error) {
    return (
      <main className="app">
        <div className="error-box">
          <h2>เชื่อมต่อ API ไม่ได้</h2>
          <p>{error}</p>
          <p className="error-hint">
            ตรวจสอบว่าเซิร์ฟเวอร์ทำงานอยู่ที่ http://127.0.0.1:8000 หรือไม่
            <br />
            สั่งรันด้วยคำสั่ง <code>uvicorn app.main:app --reload</code> ในโฟลเดอร์ backend
          </p>
          <button onClick={() => void loadAll()}>ลองใหม่</button>
        </div>
      </main>
    );
  }

  return (
    <>
      <NavBar
        active={active}
        onGoTo={goTo}
        onSearch={() => setSearching(true)}
        onHome={() => goTo(HOME)}
        onSignOut={handleSignOut}
        provinces={provinces}
        fallbackProvince={user.province ?? ""}
        theme={theme}
        onToggleTheme={() => applyTheme(theme === "dark" ? "light" : "dark")}
      />

      {searching && (
        <SearchOverlay
          stations={stations}
          onSelect={(code) => {
            setSearching(false);
            void selectStation(code);
            goTo("air");
          }}
          onClose={() => setSearching(false)}
        />
      )}

      <main className="app">
        {/* แบ่งเป็นส่วนตามเมนูด้านบน แต่ยังอยู่หน้าเดียวกัน กดเมนูแล้วเลื่อนไปหา
            ผู้ใช้จึงเลื่อนดูต่อเนื่องได้ด้วย ไม่ถูกบังคับให้เลือกทีละหน้า */}
        {/* สองหน้าที่ตอบคนละคำถาม จึงไม่เอามาต่อกันในหน้าเดียว
            หน้าฝุ่นรวมทุกอย่างที่เกี่ยวกับฝุ่นไว้ครบ เรียงจากสถานการณ์ตอนนี้
            ไปหาสิ่งที่ควรทำ ผลกระทบที่ตามมา ปัจจัยแวดล้อม และปิดท้ายด้วย
            คุณภาพของข้อมูลเอง ตามลำดับที่ผู้ใช้อยากรู้ */}
        {active === "air" && (
          <>
            {summary && (
              <SummaryCards
                summary={summary}
                weatherNow={weatherNow}
                provinces={provinces}
                weatherProvince={weatherTarget}
                dustProvince={dustProvince}
                onDustProvinceChange={setDustProvince}
                stations={stations}
                dustStation={dustStation}
                onDustStationChange={setDustStation}
                stationSummary={stationSummary}
              />
            )}
            {summary && <LevelBar summary={summary} />}

            <h2 className="section-heading">
              สถานการณ์ตอนนี้
              <span>ค่าฝุ่นล่าสุดและพื้นที่ที่ควรระวัง</span>
            </h2>

            <div className="two-column">
              <StationMap
                stations={stations}
                onSelect={selectStation}
                ranking={ranking}
                picked={pickedProvince}
                onPick={setPickedProvince}
                levels={summary?.levels ?? []}
              />
              <ProvinceRanking ranking={ranking} />
            </div>


            <h2 className="section-heading">
              ย้อนหลังและปัจจัยแวดล้อม
              <span>แนวโน้ม สภาพอากาศ และผลกระทบต่อสุขภาพ</span>
            </h2>

            <StationTrend
              history={history}
              loading={historyLoading}
              stations={stations}
              onSelectStation={selectStation}
            />

            {alertData && <AlertPanel alerts={alertData} />}

            {provinces.length > 0 && (
              <ForecastPanel provinces={provinces} defaultProvince={user.province} />
            )}

            {provinces.length > 0 && (
              <RainPanel provinces={provinces} defaultProvince={user.province} />
            )}

            {provinces.length > 0 && (
              <WeatherPanel provinces={provinces} defaultProvince={user.province} />
            )}

            <h2 className="section-heading">
              คุณภาพของข้อมูลเอง
              <span>ตรวจสอบย้อนกลับได้ว่าข้อมูลมาจากไหนและขาดช่วงใด</span>
            </h2>

            {health && <DataHealth health={health} />}
          </>
        )}

        {/* หน้าโรคจากฝุ่น แยกออกมาเพราะตอบคนละคำถามกับหน้าวัดคุณภาพอากาศ
            ส่วนบนคือความเสี่ยงที่คำนวณจากค่าฝุ่นตอนนี้
            ส่วนล่างคือจำนวนผู้ป่วยจริงที่กรมควบคุมโรคเผยแพร่
            สองส่วนนี้มาคนละแหล่งและคนละช่วงเวลา จึงต้องแยกให้เห็นชัดว่าอะไรเป็นอะไร */}
        {active === "disease" && (
          <>
            {/* ช่องเลือกอยู่บนสุดของหน้า มีผลกับทั้งสองส่วนพร้อมกัน
                ไม่แยกช่องของใครของมัน เพราะคนอ่านคาดว่าเลือกครั้งเดียวแล้วทั้งหน้าเปลี่ยนตาม

                ใช้ช่องพื้นที่ตัวเดียวกับหน้าอื่น จึงจำค่าข้ามหน้าได้
                เลือกเชียงใหม่ในหน้าวัดคุณภาพอากาศแล้วมาหน้านี้ ยังเป็นเชียงใหม่อยู่ */}
            <div className="dfilter">
              <label>
                พื้นที่
                <select
                  value={dustProvince}
                  onChange={(event) => setDustProvince(event.target.value)}
                >
                  <option value="">ทั้งประเทศ</option>
                  {provinces.map((item) => (
                    <option key={item} value={item}>
                      {item}
                    </option>
                  ))}
                </select>
              </label>

              <label>
                โรค
                <select
                  value={pickedDisease}
                  onChange={(event) => setPickedDisease(event.target.value)}
                >
                  <option value="">ทุกโรค</option>
                  {diseaseNames.map((item) => (
                    <option key={item} value={item}>
                      {item.replace(/^(กลุ่มโรค|โรค)/, "")}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <DiseaseRisk summary={summary} ring only={pickedDisease} />
          </>
        )}

        {active === "home" && (
          <HomePage
            summary={summary}
            onOpenAir={() => goTo("air")}
            province={user.province}
            provinces={provinces}
            area={dustProvince}
            stations={stations}
            station={dustStation}
            stationSummary={stationSummary}
            onScopeChange={(nextProvince, nextStation) => {
              setDustProvince(nextProvince);
              setDustStation(nextStation);
            }}
            riskGroup={user.risk_group}
          />
        )}

        <footer className="footer">
          <p>
            โปรเจคจบ · ข้อมูลคุณภาพอากาศจาก Air4Thai กรมควบคุมมลพิษ
            และข้อมูลอุตุนิยมวิทยาจาก NASA POWER
          </p>
        </footer>
      </main>
    </>
  );
}
