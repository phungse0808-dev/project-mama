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
} from "./api";
import { api } from "./api";
import { AlertPanel } from "./components/AlertPanel";
import { DataHealth } from "./components/DataHealth";
import { Landing } from "./components/Landing";
import type { EnterOptions } from "./components/Landing";
import { NavBar } from "./components/NavBar";
import { PersonalPanel } from "./components/PersonalPanel";
import { ProvinceRanking } from "./components/ProvinceRanking";
import { SignIn } from "./components/SignIn";
import { StationMap } from "./components/StationMap";
import { StationTrend } from "./components/StationTrend";
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
  // หน้าแรกแสดงก่อนเสมอ ผู้ใช้ต้องกดเข้าใช้งานเองจึงจะเข้าสู่ระบบ
  // หน้าแรกแสดงก่อนเสมอ ผู้ใช้ต้องกดเข้าใช้งานเองจึงจะเข้าแดชบอร์ด
  const [entered, setEntered] = useState(false);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [stations, setStations] = useState<StationReading[]>([]);
  const [ranking, setRanking] = useState<ProvinceRank[]>([]);
  const [health, setHealth] = useState<CollectionHealth | null>(null);
  const [alertData, setAlertData] = useState<Alerts | null>(null);
  const [provinces, setProvinces] = useState<string[]>([]);
  const [history, setHistory] = useState<StationHistory | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

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
    setEntered(false);
  }, []);

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

  const handleEnter = useCallback(
    (options?: EnterOptions) => {
      setEntered(true);
      if (options?.stationCode) {
        void selectStation(options.stationCode);
      }
    },
    [selectStation],
  );

  // เลือกสถานีที่ค่าฝุ่นสูงสุดให้อัตโนมัติ ผู้ใช้จะได้เห็นกราฟทันทีโดยไม่ต้องคลิก
  useEffect(() => {
    if (!history && stations.length > 0) {
      void selectStation(stations[0].station_code);
    }
  }, [stations, history, selectStation]);

  // ขั้นที่ 1 กรอกชื่อเพื่อระบุตัวตนก่อน
  if (!user) {
    return <SignIn onSignedIn={handleSignedIn} />;
  }

  // ขั้นที่ 2 หน้าแรก บอกว่าระบบคืออะไรและมีข้อมูลเท่าไร ก่อนเข้าแดชบอร์ด
  if (!entered) {
    return <Landing user={user} onEnter={handleEnter} onSignOut={handleSignOut} />;
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
      <NavBar onHome={() => setEntered(false)} />

      <main className="app">
        {/* รวมทุกส่วนไว้ในหน้าเดียว เรียงจากภาพรวมปัจจุบันไปหาข้อมูลย้อนหลัง
            และปิดท้ายด้วยคุณภาพของข้อมูล ตามลำดับที่ผู้ใช้ต้องการรู้ */}
        {summary && <SummaryCards summary={summary} />}
        {summary && <LevelBar summary={summary} />}

        <PersonalPanel user={user} onProfileChange={handleProfileChange} />

        {alertData && <AlertPanel alerts={alertData} />}

        <div className="two-column">
          <StationMap stations={stations} onSelect={selectStation} />
          <ProvinceRanking ranking={ranking} />
        </div>

        <StationTrend
          history={history}
          loading={historyLoading}
          stations={stations}
          onSelectStation={selectStation}
        />

        {provinces.length > 0 && (
          <WeatherPanel provinces={provinces} defaultProvince={user.province} />
        )}

        {health && <DataHealth health={health} />}

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
