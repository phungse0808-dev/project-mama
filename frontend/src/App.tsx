import { useCallback, useEffect, useState } from "react";
import "leaflet/dist/leaflet.css";
import "./App.css";

import type {
  Alerts,
  AppUser,
  CollectionHealth,
  ProvinceRank,
  StationReading,
  StationSummary,
  Summary,
  WeatherNow,
} from "./api";
import { api } from "./api";
import { AlertPanel } from "./components/AlertPanel";
import { DataHealth } from "./components/DataHealth";
import { DiseaseAdvice } from "./components/DiseaseAdvice";
import { DustCases } from "./components/DustCases";
import { NavBar } from "./components/NavBar";
import type { AirTab } from "./components/NavBar";
import { TAB_GROUPS } from "./components/NavBar";
import { ProvinceRanking } from "./components/ProvinceRanking";
import { ForecastDemo } from "./components/ForecastDemo";
import { RainPanel } from "./components/RainPanel";
import { SignIn } from "./components/SignIn";
import { SearchOverlay } from "./components/SearchOverlay";
import { StationMap } from "./components/StationMap";
import { LevelBar, SummaryCards } from "./components/SummaryCards";
import { TodayAdvice } from "./components/TodayAdvice";
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
  // ค่าสรุปทั้งประเทศ แยกจาก summary ที่เปลี่ยนตามพื้นที่ที่เลือก
  // ใช้กับแถบสัดส่วนสถานีซึ่งเป็นภาพรวมของทั้งเครือข่ายเสมอ
  const [nationalSummary, setNationalSummary] = useState<Summary | null>(null);
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

  // จังหวัดที่ใช้ดึงสภาพอากาศ มาจากช่องเลือกเดียวกับค่าฝุ่น
  //
  // ทำไมต้องมีตัวสำรอง
  //     ช่องเลือกมีตัวเลือกทั้งประเทศ ซึ่งใช้กับค่าฝุ่นได้เพราะค่าเฉลี่ยรวมมีความหมาย
  //     แต่ใช้กับอากาศไม่ได้ อุณหภูมิเฉลี่ยของทั้งประเทศไม่ได้บอกอะไรกับใคร
  //     เมื่อเลือกทั้งประเทศจึงตกไปใช้จังหวัดในโปรไฟล์ แล้วค่อยตกไปที่ค่าตั้งต้น
  const weatherTarget = dustProvince || user?.province || "กรุงเทพฯ";
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [searching, setSearching] = useState(false);
  // หัวข้อที่เปิดอยู่ในแถบด้านขวา ทั้งเว็บมีที่กดที่เดียวคือแถบนี้
  const [homeTab, setHomeTab] = useState<AirTab>("overview");


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

  // ภาพรวมทั้งประเทศสำหรับแถบสัดส่วนสถานี ไม่ขึ้นกับพื้นที่ที่เลือก
  //
  // แถบนี้ตอบว่าตอนนี้ทั้งเครือข่ายอยู่ระดับไหนกันบ้าง ถ้าเปลี่ยนตามจังหวัด
  // จังหวัดที่มีสถานีเดียวจะได้แถบสีเดียวเต็มแถว ซึ่งไม่ได้บอกอะไรเพิ่มจากการ์ดข้างบน
  useEffect(() => {
    if (!user) return;
    let cancelled = false;

    const load = async () => {
      try {
        const result = await api.summary(null);
        if (!cancelled) setNationalSummary(result);
      } catch {
        // ดึงไม่สำเร็จก็แค่ไม่ขึ้นแถบ ข้อผิดพลาดหลักแจ้งจากค่าสรุปของพื้นที่อยู่แล้ว
      }
    };

    void load();
    const timer = setInterval(() => void load(), 5 * 60 * 1000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [user]);

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
  }, []);

  /** เปลี่ยนหัวข้อที่กำลังดู และเริ่มอ่านจากบนสุดเสมอ */
  const goTab = useCallback((key: AirTab) => {
    setHomeTab(key);
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

  // เปิดดูสถานีที่กดจากแผนที่หรือช่องค้นหา
  //
  // เดิมพาไปโหลดกราฟแนวโน้มย้อนหลังของสถานีนั้น ซึ่งเอาออกจากหน้าไปแล้ว
  // ถ้าปล่อยไว้แบบเดิม กดชื่อสถานีแล้วจะไม่มีอะไรเกิดขึ้นบนจอเลย
  //
  // จึงเปลี่ยนมาตั้งช่องเลือกจังหวัดกับสถานีของการ์ดฝุ่นบนสุดแทน
  // การ์ดนั้นเจาะดูสถานีเดียวได้อยู่แล้ว ทั้งค่าล่าสุด ช่วง 24 ชั่วโมง และดัชนี
  // แล้วเลื่อนขึ้นไปบนสุดให้เห็นการ์ดทันที
  const showStation = useCallback(
    (code: string) => {
      const found = stations.find((item) => item.station_code === code);
      if (!found) return;
      setDustProvince(found.province);
      setDustStation(found.station_code);
      // การ์ดฝุ่นของสถานีอยู่ในหัวข้อภาพรวม ต้องสลับไปที่นั่นก่อนถึงจะเห็น
      setHomeTab("overview");
      window.scrollTo({ top: 0, behavior: "smooth" });
    },
    [stations]
  );

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
        onSearch={() => setSearching(true)}
        onHome={() => goTab("overview")}
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
            goTab("map");
            showStation(code);
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
        {/* หน้าแรก กล่องเนื้อหาด้านซ้ายกับแถบหัวข้อสีดำด้านขวา
            กดหัวข้อในแถบขวา กล่องซ้ายเปลี่ยนเป็นหัวข้อนั้น โดยยังอยู่ในหน้าแรก
            ภาพรวมเป็นการ์ดค่าฝุ่นกับสภาพอากาศแบบย่อ */}
        <div className="air-layout">
            <div className="air-main">
              {homeTab === "overview" && summary && (
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
                  detailedWeather
                />
              )}
              {/* ใช้ค่าของสถานีเฉพาะตอนที่โหลดของสถานีที่เลือกไว้มาแล้ว ให้ตรงกับการ์ดฝุ่นข้างบน */}
              {homeTab === "overview" && summary && (
                <TodayAdvice
                  summary={summary}
                  stationSummary={dustStation ? stationSummary : null}
                  weatherNow={weatherNow}
                  weatherProvince={weatherTarget}
                  area={dustProvince}
                />
              )}

              {homeTab === "map" && (
                <StationMap
                  stations={stations}
                  onSelect={showStation}
                  ranking={ranking}
                  picked={pickedProvince}
                  onPick={setPickedProvince}
                  levels={summary?.levels ?? []}
                />
              )}

              {homeTab === "ranking" && (
                <>
                  {nationalSummary && <LevelBar summary={nationalSummary} stations={stations} />}
                  <ProvinceRanking ranking={ranking} />
                </>
              )}

              {homeTab === "alerts" && alertData && <AlertPanel alerts={alertData} />}

              {homeTab === "forecast" && provinces.length > 0 && (
                <ForecastDemo provinces={provinces} defaultProvince={weatherTarget} />
              )}

              {homeTab === "rain" && provinces.length > 0 && (
                <RainPanel provinces={provinces} defaultProvince={user.province} />
              )}

              {homeTab === "history" && provinces.length > 0 && (
                <WeatherPanel provinces={provinces} defaultProvince={user.province} />
              )}


              {homeTab === "data" && health && <DataHealth health={health} />}

              {homeTab === "disease" && (
                <DiseaseAdvice
                  provinces={provinces}
                  area={dustProvince}
                  onAreaChange={setDustProvince}
                />
              )}

              {/* ผลการวิเคราะห์ของระบบเอง ว่าฝุ่นกับจำนวนผู้ป่วยจริงสัมพันธ์กันหรือไม่ */}
              {homeTab === "impact" && <DustCases />}
            </div>

            <aside className="air-side" aria-label="หัวข้อทั้งหมด">
              {TAB_GROUPS.map((group) => (
                <div
                  className={group.demo ? "air-side-group demo" : "air-side-group"}
                  key={group.title}
                >
                  <p className="air-side-head">
                    {group.title}
                    {group.note && <span>{group.note}</span>}
                  </p>
                  {group.items.map((item) => (
                    <button
                      key={item.key}
                      className={homeTab === item.key ? "air-side-btn active" : "air-side-btn"}
                      aria-current={homeTab === item.key ? "page" : undefined}
                      onClick={() => goTab(item.key)}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              ))}
            </aside>
          </div>

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
