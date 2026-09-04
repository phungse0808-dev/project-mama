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
  Summary,
  WeatherNow,
} from "./api";
import { api } from "./api";
import { AlertPanel } from "./components/AlertPanel";
import { DataHealth } from "./components/DataHealth";
import { HomePage } from "./components/HomePage";
import { NavBar } from "./components/NavBar";
import type { SectionKey } from "./components/NavBar";
import { PersonalPanel } from "./components/PersonalPanel";
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
      void sendIfDue(loadSettings(), user.province ?? "", user.id);
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

  const handleProfileChange = useCallback((updated: AppUser) => {
    localStorage.setItem(USER_KEY, JSON.stringify(updated));
    setUser(updated);
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
              />
            )}
            {summary && <LevelBar summary={summary} />}

            <PersonalPanel user={user} onProfileChange={handleProfileChange} />

            <h2 className="section-heading">
              สถานการณ์ตอนนี้
              <span>ค่าฝุ่นล่าสุดและพื้นที่ที่ควรระวัง</span>
            </h2>

            <div className="two-column">
              <StationMap stations={stations} onSelect={selectStation} ranking={ranking} />
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

        {active === "home" && (
          <HomePage
            summary={summary}
            onOpenAir={() => goTo("air")}
            province={user.province}
            provinces={provinces}
            area={dustProvince}
            onAreaChange={setDustProvince}
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
