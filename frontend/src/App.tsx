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
import { DiseasePanel } from "./components/DiseasePanel";
import { HivRegionChart } from "./components/HivRegionChart";
import { HivDataNotice } from "./components/HivDataNotice";
import { HivSearchPanel } from "./components/HivSearchPanel";
import { HomePage } from "./components/HomePage";
import { NavBar } from "./components/NavBar";
import type { SectionKey } from "./components/NavBar";
import { PersonalPanel } from "./components/PersonalPanel";
import { ProvinceRanking } from "./components/ProvinceRanking";
import { RainPanel } from "./components/RainPanel";
import { RegionPanel } from "./components/RegionPanel";
import { SignIn } from "./components/SignIn";
import { SearchOverlay } from "./components/SearchOverlay";
import { StationMap } from "./components/StationMap";
import { StationTrend } from "./components/StationTrend";
import { VulnerabilityPanel } from "./components/VulnerabilityPanel";
import { LevelBar, SummaryCards } from "./components/SummaryCards";
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
  const [weatherProvince, setWeatherProvince] = useState<string | null>(null);
  const [history, setHistory] = useState<StationHistory | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [searching, setSearching] = useState(false);
  // หน้าแรกที่เห็นหลังกรอกชื่อ คือหน้าหลักเดียวกับที่ปุ่มกลับพากลับมา
  const [active, setActive] = useState<SectionKey>("home");


  const loadAll = useCallback(async () => {
    try {
      setError(null);
      const [summaryData, stationData, rankingData, healthData, alertResult, provinceList] =
        await Promise.all([
          api.summary(),
          api.stations(),
          api.provinceRanking(),
          api.collectionHealth(),
          api.alerts(),
          api.provinces(),
        ]);
      setSummary(summaryData);
      setStations(stationData);
      setRanking(rankingData);
      setHealth(healthData);
      setAlertData(alertResult);
      setProvinces(provinceList);
    } catch (err) {
      setError(err instanceof Error ? err.message : "เกิดข้อผิดพลาดที่ไม่ทราบสาเหตุ");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!user) return;
    void loadAll();
    // ข้อมูลต้นทางอัปเดตรายชั่วโมง ดึงซ้ำทุก 5 นาทีก็เพียงพอ
    const timer = setInterval(() => void loadAll(), 5 * 60 * 1000);
    return () => clearInterval(timer);
  }, [loadAll, user]);


  // สภาพอากาศปัจจุบันของจังหวัดที่กำลังดูอยู่
  //
  // แยกออกมาจากการโหลดชุดใหญ่ เพราะมาจากคนละแหล่งและเปลี่ยนตามจังหวัดที่เลือก
  // ต้นทางอัปเดตทุก 15 นาที จึงดึงซ้ำทุก 10 นาทีก็เพียงพอ
  useEffect(() => {
    if (!user) return;
    const province = weatherProvince ?? user.province ?? "กรุงเทพฯ";
    let cancelled = false;

    const load = async () => {
      try {
        const result = await api.weatherNow(province);
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
  }, [user, weatherProvince]);

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
                weatherProvince={weatherProvince ?? user.province ?? "กรุงเทพฯ"}
                onWeatherProvinceChange={setWeatherProvince}
              />
            )}
            {summary && <LevelBar summary={summary} />}

            <PersonalPanel user={user} onProfileChange={handleProfileChange} />

            <h2 className="section-heading">
              สถานการณ์ตอนนี้
              <span>ค่าฝุ่นล่าสุดและพื้นที่ที่ควรระวัง</span>
            </h2>

            <div className="two-column">
              <StationMap stations={stations} onSelect={selectStation} />
              <ProvinceRanking ranking={ranking} />
            </div>

            <RegionPanel />

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

            <DiseasePanel />

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

        {active === "hiv" && (
          <>
            <HivDataNotice />
            <HivRegionChart />
            <HivSearchPanel />
            <VulnerabilityPanel />
          </>
        )}

        {active === "home" && (
          <HomePage
            summary={summary}
            onOpenAir={() => goTo("air")}
            onOpenHiv={() => goTo("hiv")}
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
