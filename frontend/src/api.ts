/**
 * ตัวเรียก REST API ของระบบเฝ้าระวังคุณภาพอากาศ
 *
 * รวมการเรียก API ไว้ที่เดียว เพื่อให้เวลาย้ายเซิร์ฟเวอร์ขึ้นออนไลน์
 * แก้ที่ตัวแปร BASE_URL จุดเดียวพอ
 */

/**
 * ที่อยู่ของ API
 *
 * ตอนพัฒนา หน้าเว็บรันที่พอร์ต 5173 แต่ API อยู่พอร์ต 8000 จึงต้องระบุที่อยู่เต็ม
 * ตอน build เป็นของจริง หน้าเว็บถูกเสิร์ฟจากเซิร์ฟเวอร์ API ตัวเดียวกัน
 * จึงใช้ที่อยู่ว่างเพื่อเรียกแบบ same-origin ทำให้ไม่ติดปัญหา CORS
 * และย้ายขึ้นออนไลน์ได้โดยไม่ต้องแก้โค้ด
 */
const BASE_URL =
  import.meta.env.VITE_API_URL ?? (import.meta.env.DEV ? "http://127.0.0.1:8000" : "");

export type AqiLevel = {
  key: string | null;
  label_th: string;
  color: string;
  advice_th: string;
};

export type StationReading = {
  station_code: string;
  name_th: string;
  province: string;
  latitude: number;
  longitude: number;
  measured_at: string;
  is_stale: boolean;
  pm25: number | null;
  pm10: number | null;
  o3: number | null;
  co: number | null;
  no2: number | null;
  so2: number | null;
  aqi: number | null;
  aqi_param: string | null;
  level: AqiLevel;
};

export type Summary = {
  /** ว่างแปลว่าทั้งประเทศ */
  province: string | null;
  measured_at: string | null;
  minutes_behind: number | null;
  stations_total: number;
  stations_reporting: number;
  stations_stale: number;
  pm25_avg: number | null;
  pm25_max: number | null;
  pm25_min: number | null;
  level: AqiLevel | null;
  level_counts: Record<string, number>;
  levels: { key: string; label_th: string; color: string }[];
  worst_station: StationReading | null;
  weather: {
    observed_on: string;
    days_behind: number;
    provinces: number;
    temp_avg: number | null;
    humidity: number | null;
    wind_speed: number | null;
    rainfall_mm: number | null;
    rain_area_pct: number | null;
  } | null;
};


export type ProvinceRank = {
  province: string;
  pm25_avg: number;
  pm25_max: number;
  station_count: number;
  level: AqiLevel;
};

export type HistoryPoint = {
  measured_at: string;
  label: string;
  pm25: number | null;
  pm10: number | null;
  aqi: number | null;
};

export type StationHistory = {
  station_code: string;
  name_th: string;
  province: string;
  points: HistoryPoint[];
};

export type DailyPoint = {
  observed_on: string;
  label: string;
  pm25_avg: number;
  pm25_min: number;
  pm25_max: number;
  hours: number;
  complete: boolean;
  over_thai_standard: boolean;
};

export type StationDaily = {
  station_code: string;
  name_th: string;
  province: string;
  thai_standard: number;
  min_hours_per_day: number;
  days_total: number;
  days_complete: number;
  days_over_standard: number;
  points: DailyPoint[];
};

export type WeatherPoint = {
  observed_on: string;
  label: string;
  temp_avg: number | null;
  temp_max: number | null;
  temp_min: number | null;
  rainfall_mm: number | null;
  humidity: number | null;
  wind_speed: number | null;
};

export type CollectionHealth = {
  readings_total: number;
  stations_total: number;
  weather_total: number;
  collection_started: string | null;
  first_reading: string | null;
  last_reading: string | null;
  expected_rows: number;
  completeness_pct: number | null;
  field_completeness: Record<string, number>;
  recent_runs: {
    source: string;
    started_at: string;
    success: boolean;
    records_new: number;
    records_duplicate: number;
    error_message: string | null;
  }[];
};

export type AppUser = {
  id: number;
  display_name: string;
  province: string | null;
  risk_group: string | null;
};

export type RiskGroup = {
  key: string;
  label_th: string;
  detail_th: string;
  sensitive: boolean;
};

export type GroupAdvice = RiskGroup & { advice_th: string };

export type Standards = {
  pm25: number | null;
  thai_standard: number;
  who_guideline: number;
  over_thai_standard: boolean;
  over_who_guideline: boolean;
  times_who: number | null;
};

export type PersonalSummary = {
  user: AppUser;
  scope: string;
  station_count: number;
  pm25: number | null;
  level: AqiLevel;
  standards: Standards;
  my_advice: GroupAdvice | null;
  all_groups: GroupAdvice[];
};

export type Alerts = {
  checked_at: string;
  stations_checked: number;
  thai_standard: number;
  who_guideline: number;
  over_thai_standard: StationReading[];
  over_who_guideline: StationReading[];
};

export type HealthThresholds = {
  thai_standard: number;
  who_guideline: number;
  levels: { key: string; label_th: string; color: string; floor: number }[];
  groups: {
    key: string;
    label_th: string;
    sensitive: boolean;
    onset_pm25: number;
    level_key: string;
    level_label_th: string | null;
    color: string | null;
  }[];
};

export type DiseaseMonth = {
  month: string;
  label: string;
  groups: Record<string, number>;
  total: number;
  rainfall_mm: number | null;
  wind_speed: number | null;
  humidity: number | null;
};

export type DiseaseSummary = {
  available: boolean;
  reason?: string;
  source?: string;
  provinces?: string[];
  groups?: string[];
  period?: { start: string; end: string };
  total_cases?: number;
  monthly: DiseaseMonth[];
  by_province?: { province: string; cases: number }[];
  by_group?: { group: string; cases: number }[];
};

export type RainChance = {
  available: boolean;
  reason?: string;
  province?: string;
  for_date?: string;
  chance_pct?: number;
  rain_days?: number;
  samples?: number;
  years?: number[];
  window_days?: number;
  threshold_mm?: number;
  rainfall_avg_mm?: number;
  this_month?: number;
  latest?: {
    observed_on: string;
    days_behind: number;
    temp_avg: number | null;
    temp_max: number | null;
    temp_min: number | null;
    rainfall_mm: number | null;
    humidity: number | null;
    wind_speed: number | null;
    pressure: number | null;
  };
  normal?: {
    temp_avg: number | null;
    temp_max: number | null;
    temp_min: number | null;
    humidity: number | null;
    wind_speed: number | null;
  };
  monthly?: { month: number; label: string; chance_pct: number; rainfall_avg_mm: number }[];
};

export type ForecastAccuracy = {
  available: boolean;
  reason?: string;
  hours?: number;
  hours_needed?: number;
  province?: string;
  model_avg?: number;
  measured_avg?: number;
  mae?: number;
  bias?: number;
  can_adjust?: boolean;
  station_count?: number;
  stations?: { station_code: string; name_th: string; hours: number; pm25_avg: number }[];
};

export type Pm25Forecast = {
  available: boolean;
  reason?: string;
  province?: string;
  station_code?: string | null;
  source?: string;
  standard_th?: number;
  guideline_who?: number;
  adjusted?: boolean;
  accuracy?: ForecastAccuracy;
  days?: {
    pm25_avg_raw: number;
    measured_hours: number;
    is_measured: boolean;
    day: string;
    is_today: boolean;
    pm25_avg: number;
    pm25_max: number;
    pm25_min: number;
    peak_at: string;
    hours: number;
    level: AqiLevel;
  }[];
};

export type WeatherNow = {
  available: boolean;
  reason?: string;
  province?: string;
  source?: string;
  observed_at?: string;
  minutes_behind?: number | null;
  temperature?: number | null;
  humidity?: number | null;
  precipitation?: number | null;
  wind_speed?: number | null;
  weather_code?: number | null;
  condition?: string;
  rain_chance_pct?: number | null;
  temp_max?: number | null;
  temp_min?: number | null;
  rain_today_mm?: number | null;
};

async function get<T>(path: string): Promise<T> {
  const response = await fetch(`${BASE_URL}${path}`);
  if (!response.ok) {
    throw new Error(`เรียก ${path} ไม่สำเร็จ (สถานะ ${response.status})`);
  }
  return response.json() as Promise<T>;
}

async function send<T>(path: string, method: string, body: unknown): Promise<T> {
  const response = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const detail = await response.json().catch(() => null);
    throw new Error(detail?.detail ?? `เรียก ${path} ไม่สำเร็จ (สถานะ ${response.status})`);
  }
  return response.json() as Promise<T>;
}

export const api = {
  // ไม่ส่งจังหวัดแปลว่าทั้งประเทศ
    //
    // เข้ารหัสชื่อจังหวัดก่อนต่อเข้า URL เพราะเป็นภาษาไทยและมีอักขระอย่างจุด
    // เช่น กรุงเทพฯ ซึ่งถ้าใส่ดิบ ๆ เบราว์เซอร์บางตัวจะตัดทิ้ง
    summary: (province?: string | null) =>
      get<Summary>(
        province ? `/api/summary?province=${encodeURIComponent(province)}` : "/api/summary",
      ),
  signIn: (name: string) => send<AppUser>("/api/users/sign-in", "POST", { name }),
  updateProfile: (id: number, province: string | null, riskGroup: string | null) =>
    send<AppUser>(`/api/users/${id}`, "PATCH", { province, risk_group: riskGroup }),
  personalSummary: (id: number) => get<PersonalSummary>(`/api/users/${id}/summary`),
  riskGroups: () => get<RiskGroup[]>("/api/risk-groups"),
  provinces: () => get<string[]>("/api/provinces"),
  pm25Forecast: (province: string, station?: string | null) =>
    get<Pm25Forecast>(
      "/api/pm25-forecast/" +
        encodeURIComponent(province) +
        (station ? "?station=" + encodeURIComponent(station) : ""),
    ),
  weatherNow: (province: string) =>
    get<WeatherNow>("/api/weather-now/" + encodeURIComponent(province)),
  rainChance: (province: string) =>
    get<RainChance>("/api/rain-chance/" + encodeURIComponent(province)),
  alerts: () => get<Alerts>("/api/alerts"),
  healthThresholds: () => get<HealthThresholds>("/api/health-thresholds"),
  disease: () => get<DiseaseSummary>("/api/disease"),
  stations: () => get<StationReading[]>("/api/stations"),
  provinceRanking: () => get<ProvinceRank[]>("/api/provinces/ranking"),
  stationDaily: (code: string, days = 30) =>
    get<StationDaily>(`/api/stations/${code}/daily?days=${days}`),
  stationHistory: (code: string, hours = 48) =>
    get<StationHistory>(`/api/stations/${code}/history?hours=${hours}`),
  weather: (province: string, days = 30) =>
    get<{ province: string; points: WeatherPoint[] }>(
      `/api/weather/${encodeURIComponent(province)}?days=${days}`,
    ),
  collectionHealth: () => get<CollectionHealth>("/api/collection/health"),
};

/** จัดรูปแบบวันเวลาให้อ่านง่ายแบบไทย */
export function formatThaiDateTime(iso: string | null): string {
  if (!iso) return "ไม่มีข้อมูล";
  const date = new Date(iso);
  return date.toLocaleString("th-TH", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
