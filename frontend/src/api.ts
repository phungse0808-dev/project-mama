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
  /** วิธีป้องกันตัวของระดับที่ค่าเฉลี่ยนี้ตกอยู่ ว่างแปลว่าไม่รู้ระดับ */
  protection: { icon: string; text_th: string }[];
  level_counts: Record<string, number>;
  /** ceiling เป็นค่าสูงสุดของระดับนั้น ระดับสุดท้ายไม่มีขอบบนจึงเป็นค่าว่าง */
  levels: { key: string; label_th: string; color: string; ceiling: number | null }[];
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


/** สรุปของสถานีเดียว ใช้ตอนผู้ใช้เจาะดูทีละสถานีในกลุ่มการ์ดฝุ่น
 *
 * ต่างจาก Summary ตรงที่ไม่มีค่าเฉลี่ยและไม่มีจำนวนสถานี เพราะมีสถานีเดียว
 * ต่ำสุดกับสูงสุดจึงมาจากชั่วโมงย้อนหลังของสถานีนั้น ไม่ใช่จากสถานีอื่นในจังหวัด
 */
export type StationSummary = {
  station_code: string;
  name_th: string;
  area_th: string;
  province: string;
  measured_at: string;
  minutes_behind: number | null;
  is_stale: boolean;
  pm25: number | null;
  pm10: number | null;
  aqi: number | null;
  level: AqiLevel;
  protection: { icon: string; text_th: string }[];
  pm25_min: number | null;
  pm25_max: number | null;
  /** ช่วงที่ขอไป เช่น 24 ชั่วโมง */
  hours_window: number;
  /** ชั่วโมงที่มีค่าจริงในช่วงนั้น มักน้อยกว่าที่ขอเพราะหลายสถานีส่งไม่ครบ */
  hours_with_data: number;
};


/** คำแนะนำสุขภาพของทุกกลุ่มเสี่ยง ตามค่าฝุ่นของพื้นที่ที่เลือก
 *
 * มีอยู่ในฝั่งหลังบ้านตั้งแต่ต้นแต่ไม่เคยมีหน้าไหนเรียกใช้
 * ข้อความเขียนไว้ครบ 5 ระดับ x 8 กลุ่มเสี่ยง รวม 40 ข้อความ
 */
export type HealthAdvice = {
  province: string | null;
  /** รหัสสถานีที่เจาะดู ว่างแปลว่าเป็นค่าของทั้งจังหวัดหรือทั้งประเทศ */
  station: string | null;
  scope: string;
  station_count: number;
  pm25: number | null;
  level: AqiLevel;
  groups: {
    key: string;
    label_th: string;
    detail_th: string;
    sensitive: boolean;
    advice_th: string;
  }[];
};


export type ProvinceRank = {
  province: string;
  pm25_avg: number;
  pm25_max: number;
  station_count: number;
  level: AqiLevel;
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
  /** สัดส่วนกลุ่มโรคแยกรายจังหวัด มีเฉพาะจังหวัดที่อยู่ในชุดข้อมูล */
  groups_by_province?: Record<string, { group: string; cases: number }[]>;
  /** ค่าความเสี่ยงจากงานวิจัยภายนอก แยกตามกลุ่มโรค ใช้คำนวณผู้ป่วยส่วนเกิน */
  risk_by_group?: Record<
    string,
    {
      relative_risk_per_10: number;
      ci_low: number;
      ci_high: number;
      outcome_th: string;
      source_th: string;
      evidence_th: string;
      /** ช่วงความเชื่อมั่นคร่อมเลขหนึ่ง ผลยังไม่ชัดเจนทางสถิติ */
      uncertain: boolean;
    }
  >;
  risk_note_th?: string;
};

/** ค่าฝุ่นรายชั่วโมงย้อนหลังของพื้นที่ที่เลือก */
export type Pm25HourlyPoint = {
  measured_at: string;
  label: string;
  pm25: number;
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

export type WindLevel = { key: string; label_th: string };

export type WindHour = {
  time: string;
  label: string;
  wind_speed: number;
  wind_direction: number | null;
  /** ลมต่ำกว่าเกณฑ์ที่ถือว่าอากาศแทบไม่ถ่ายเท */
  calm: boolean;
};

export type Wind = {
  available: boolean;
  reason?: string;
  province?: string;
  source?: string;
  observed_at?: string;
  minutes_behind?: number | null;
  wind_speed?: number | null;
  /** องศาที่ลมพัดมาจาก ศูนย์คือทิศเหนือ */
  wind_direction?: number | null;
  wind_direction_th?: string | null;
  wind_gusts?: number | null;
  level?: WindLevel | null;
  levels?: { key: string; label_th: string; upper_kmh: number | null }[];
  calm_threshold_kmh?: number;
  /** จำนวนชั่วโมงที่ลมสงบทั้งหมด อาจกระจายอยู่หลายช่วง */
  calm_hours?: number;
  /** ช่วงที่ลมสงบติดกันยาวที่สุด ต่างจาก calm_hours เมื่อสงบหลายช่วง */
  calm_run_hours?: number;
  calm_from?: string | null;
  calm_to?: string | null;
  hourly?: WindHour[];
};

/** ค่าเฉลี่ย PM2.5 ช่วง 24 ชั่วโมงหนึ่งช่วงในหน้าพยากรณ์เดโม */
export type ForecastDemoWindow = {
  /** ชั่วโมงแรกของช่วง เวลาไทย เช่น 2026-09-16T13:00 */
  start: string;
  end: string;
  pm25: number | null;
  readings: number;
  /** จำนวนสถานีที่ส่งค่าในช่วงนี้ */
  stations: number;
  level: AqiLevel | null;
};

/** ค่าพยากรณ์ของวันข้างหน้าหนึ่งวันในหน้าพยากรณ์เดโม */
export type ForecastDemoAhead = {
  /** ช่วง 24 ชม. ที่พยากรณ์ ต่อจากช่วงก่อนหน้าพอดี เวลาไทย */
  start: string;
  end: string;
  pm25: number;
  /** ส่วนต่างจากช่วงก่อนหน้า */
  change: number;
  level: AqiLevel | null;
  rain_chance_pct: number | null;
  wind_max_kmh: number | null;
  humidity_mean_pct: number | null;
  temp_max_c: number | null;
};

/** ขั้นหนึ่งของสูตรพยากรณ์เดโม แบบอ่านง่าย */
export type ForecastDemoStep = {
  icon: "base" | "trend" | "rain" | "wind" | "humidity" | "heat";
  title: string;
  detail: string;
  /** ผลของขั้น เช่น +0.3 หรือ −20% ว่างสำหรับขั้นแรก */
  effect: string;
  /** วิธีคำนวณด้วยตัวเลขจริง เช่น 10.6 × (1 − 0.20 × 99/100) = 10.6 × 0.802 = 8.5 */
  calc: string;
  /** ค่าฝุ่นหลังผ่านขั้นนี้ */
  value: number;
  /** research มีงานวิจัยรองรับ · direction งานวิจัยรองรับแค่ทิศทาง · assumption ผู้จัดทำกำหนด */
  evidence: "research" | "direction" | "assumption";
  /** เลขเอกสารอ้างอิงใน references */
  refs: number[];
};

/** พยากรณ์ค่าฝุ่นแบบเดโม ดูสูตรและที่มาใน backend/app/forecast_demo.py */
export type ForecastDemo = {
  province: string;
  available: boolean;
  reason?: string;
  latest?: ForecastDemoWindow;
  previous?: ForecastDemoWindow;
  pm25_source: string;
  weather_source: string;
  formula: string[];
  references: { id: number; text: string; url: string }[];
  /** ผลย้อนทดสอบความแม่นของสูตร เทียบกับวิธีพื้นฐาน */
  accuracy?: {
    tested_at_th: string;
    provinces: number;
    cases: number;
    readings: number;
    period_th: string;
    /** ทายระดับคุณภาพอากาศถูกกี่เปอร์เซ็นต์ และถ้าเดาด้วยค่าวันก่อนหน้าจะได้เท่าไร */
    level_hit_pct: number;
    level_hit_base_pct: number;
    rows: { name_th: string; mae: number; bias: number; current: boolean }[];
    note_th: string;
  };
  /** หน่วยงานที่พยากรณ์ฝุ่น พร้อมวิธีของแต่ละแห่ง use บอกว่าระบบนี้ใช้ข้อมูลหรือไม่ */
  agencies?: {
    name_th: string;
    system_th: string;
    method_th: string;
    use: "use" | "ref" | "none";
    use_th: string;
    /** สมการที่หน่วยงานนั้นใช้ เป็นข้อความเมื่อไม่เปิดเผยสูตร */
    formula: string;
    formula_note_th: string;
    url: string;
  }[];
  /** สรุปวิธีและสูตรของระบบนี้ วางท้ายรายการเพื่อให้เทียบกันได้ */
  our_method_th?: string;
  our_formula?: string;
  mass_balance_note_th?: string;
  tomorrow?: ForecastDemoAhead;
  /** คิดต่อจากพรุ่งนี้ ความคลาดเคลื่อนสะสม change เทียบกับพรุ่งนี้ */
  day_after?: ForecastDemoAhead;
  steps?: ForecastDemoStep[];
  day_after_steps?: ForecastDemoStep[];
};

/** คำแนะนำสำหรับผู้มีโรคประจำตัว ดูถ้อยคำและที่มาใน backend/app/disease_advice.py */
export type DiseaseAdvice = {
  province: string | null;
  pm25: number | null;
  level: AqiLevel | null;
  level_key: string | null;
  source_th: string;
  source_url: string;
  /** แหล่งอ้างอิงทั้งหมดที่ใช้เขียนถ้อยคำ หน้าเว็บแสดงครบทุกแหล่ง */
  sources?: { name_th: string; detail_th: string; url: string }[];
  disclaimer_th: string;
  diseases: {
    name: string;
    icon: string;
    /** คำแนะนำเป็นข้อสั้น ๆ รายการว่างเมื่อยังไม่มีค่าฝุ่นล่าสุดของพื้นที่ */
    advice: string[];
    warning_th: string;
    /** ตัวอย่างอาการเริ่มต้นของโรคนี้ */
    early_th?: string;
    /** true เมื่อใช้คำแนะนำของประชาชนทั่วไป เพราะไม่มีคำแนะนำเฉพาะโรค */
    general: boolean;
  }[];
};

/** ผลวิเคราะห์ฝุ่นกับจำนวนผู้ป่วย ดูวิธีคำนวณใน backend/app/dust_cases.py
 *
 * ค่าสหสัมพันธ์เป็น null ได้เมื่อข้อมูลน้อยเกินไป หน้าเว็บต้องเผื่อกรณีนั้นไว้
 */
export type DustCases = {
  available: boolean;
  reason?: string;
  /** จำนวนจังหวัดและเดือนที่มีทั้งค่าฝุ่นและจำนวนผู้ป่วย */
  provinces?: number;
  months?: number;
  start?: string;
  end?: string;
  pairs?: number;
  total_cases?: number;
  main_disease?: string;
  buckets?: {
    label_th: string;
    range_th: string;
    months: number;
    cases_per_month: number;
  }[];
  correlations?: {
    group: string;
    /** รวมทุกจังหวัด · เทียบในจังหวัดเดียวกัน · ตัดฤดูกาลออก */
    pooled: number | null;
    within: number | null;
    deseasonal: number | null;
  }[];
  /** รูปแบบตามเดือนปฏิทิน ใช้อธิบายว่าฤดูฝุ่นกับฤดูป่วยไม่ตรงกัน */
  seasonal?: { month_th: string; pm25: number; cases: number; years: number }[];
  /** ช่วงอายุที่พบผู้ป่วยมากที่สุดของแต่ละโรค */
  age_top?: {
    disease: string;
    age_group: string;
    persons: number;
    share_pct: number;
    total: number;
  }[];
  /** ผลเจาะเฉพาะภาคเหนือช่วงเผา ซึ่งเป็นพื้นที่ที่ฝุ่นรุนแรงที่สุด */
  focus?: {
    name_th: string;
    provinces: string[];
    months_th: string;
    pm25_north: number;
    pm25_north_burn: number;
    pm25_north_max: number;
    pm25_country: number;
    pm25_country_max: number;
    rows: { group: string; all_year: number | null; burning: number | null }[];
    caveat_th: string;
  };
  note_th?: string;
  disease_source_th?: string;
  pm25_source_th?: string;
};

/** ค่าพยากรณ์ที่ระบบออกไว้เป็นรอบ ต่างจาก ForecastDemo ที่คำนวณสดทุกครั้ง */
export type ForecastIssue = {
  available: boolean;
  reason?: string;
  issued_on?: string;
  issued_at?: string;
  issue_hour?: number;
  targets?: Record<string, { pm25: number; start: string; end: string }>;
  /** ค่าที่วัดได้จริงสองช่วงก่อนหน้า ณ เวลาที่ออกค่า ใช้ให้การ์ดทั้งสี่ใบเป็นรอบเดียวกัน */
  observed?: {
    previous: { pm25: number; start: string; end: string; level: AqiLevel };
    latest: { pm25: number; start: string; end: string; level: AqiLevel };
  } | null;
  /** รอบก่อนหน้าที่มีค่าจริงมาเทียบแล้ว */
  last_checked?: {
    issued_on: string;
    predicted: number;
    actual: number;
    error: number;
  } | null;
  scoreboard?: {
    available: boolean;
    reason?: string;
    checked?: number;
    provinces?: number;
    mae?: number;
    days?: number;
  };
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
  /** องศาที่ลมพัดมาจาก ศูนย์คือทิศเหนือ */
  wind_direction?: number | null;
  wind_direction_th?: string | null;
  wind_gusts?: number | null;
  wind_level?: WindLevel | null;
  weather_code?: number | null;
  condition?: string;
  rain_chance_pct?: number | null;
  temp_max?: number | null;
  temp_min?: number | null;
  rain_today_mm?: number | null;
  /** ฝนชั่วโมงล่าสุดจากเครื่องวัดรอบจุดกลางจังหวัด null เมื่อเรียกต้นทางไม่สำเร็จ */
  measured_rain?: MeasuredRain | null;
  /** true เมื่อคำบอกสภาพอากาศถูกเปลี่ยนตามเครื่องวัด ไม่ใช่คำของแบบจำลอง */
  condition_measured?: boolean;
  /** คำของแบบจำลองก่อนถูกเปลี่ยน มีเฉพาะตอน condition_measured เป็น true */
  model_condition?: string;
};

export type MeasuredRain = {
  radius_km: number;
  stations: number;
  raining: number;
  hour_start?: string;
  hour_end?: string;
  measured_at?: string;
  max_mm?: number;
  max_station?: string | null;
  max_amphoe?: string | null;
  source: string;
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
  forecastDemo: (province: string) =>
    get<ForecastDemo>("/api/forecast-demo/" + encodeURIComponent(province)),
  wind: (province: string, hours = 24) =>
    get<Wind>(`/api/wind/${encodeURIComponent(province)}?hours=${hours}`),
  rainChance: (province: string) =>
    get<RainChance>("/api/rain-chance/" + encodeURIComponent(province)),
  alerts: () => get<Alerts>("/api/alerts"),
  disease: () => get<DiseaseSummary>("/api/disease"),
  dustCases: () => get<DustCases>("/api/dust-cases"),
  forecastIssue: (province: string) =>
    get<ForecastIssue>(`/api/forecast-issue/${encodeURIComponent(province)}`),
  diseaseAdvice: (province?: string | null) =>
    get<DiseaseAdvice>(
      "/api/disease-advice" + (province ? `?province=${encodeURIComponent(province)}` : "")
    ),
  pm25Hourly: (province: string | null, hours = 24) =>
    get<Pm25HourlyPoint[]>(
      `/api/pm25-hourly?hours=${hours}` +
        (province ? `&province=${encodeURIComponent(province)}` : "")
    ),
  stations: () => get<StationReading[]>("/api/stations"),
  healthAdvice: (province?: string | null, station?: string | null) => {
    // ระบุสถานีแล้วไม่ต้องส่งจังหวัดไปด้วย เพราะสถานีเจาะจงกว่าอยู่แล้ว
    // ฝั่งหลังบ้านก็ข้ามเงื่อนไขจังหวัดเมื่อมีสถานี ส่งไปก็ไม่ได้ใช้
    const query = station
      ? `?station=${encodeURIComponent(station)}`
      : province
        ? `?province=${encodeURIComponent(province)}`
        : "";
    return get<HealthAdvice>(`/api/health-advice${query}`);
  },
  provinceRanking: () => get<ProvinceRank[]>("/api/provinces/ranking"),
  stationSummary: (code: string, hours = 24) =>
    get<StationSummary>(`/api/stations/${code}/summary?hours=${hours}`),
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
