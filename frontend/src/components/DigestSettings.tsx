import { useState } from "react";
import {
  clearLastSent,
  permissionState,
  requestPermission,
  saveSettings,
  sendIfDue,
} from "../dailyDigest";
import type { DigestSettings as Settings } from "../dailyDigest";

type Props = {
  settings: Settings;
  onChange: (settings: Settings) => void;
  provinces: string[];
  /** จังหวัดที่ใช้เมื่อผู้ใช้ยังไม่ได้เลือกเจาะจง */
  fallbackProvince: string;
  userId: number | null;
};

/** ชั่วโมงที่ให้เลือกได้ ครอบคลุมช่วงที่คนตื่นอยู่จริง
 *
 * ไม่ให้เลือกกลางดึกเพราะการแจ้งเตือนตอนตีสามไม่มีใครอยากได้
 * และค่าฝุ่นของเมื่อคืนไม่ได้ช่วยตัดสินใจอะไรสำหรับวันใหม่
 */
const HOURS = [6, 7, 8, 9, 10, 11, 12, 15, 18];

/**
 * สวิตช์เปิดปิดสรุปประจำวัน
 *
 * วางไว้ในแผงคำแนะนำสำหรับคุณ เพราะเป็นการตั้งค่าส่วนตัวเหมือนกัน
 * และเนื้อหาที่แจ้งก็อ้างอิงกลุ่มเสี่ยงที่ตั้งไว้ในแผงเดียวกันนี้
 */
export function DigestSettings({
  settings,
  onChange,
  provinces,
  fallbackProvince,
  userId,
}: Props) {
  const [permission, setPermission] = useState(permissionState());
  const [sending, setSending] = useState(false);
  const [tested, setTested] = useState<string | null>(null);

  const update = (patch: Partial<Settings>) => {
    const next = { ...settings, ...patch };
    saveSettings(next);
    onChange(next);
  };

  const toggle = async () => {
    if (settings.enabled) {
      update({ enabled: false });
      return;
    }

    const ok = await requestPermission();
    setPermission(permissionState());
    if (!ok) return;

    // ล้างวันที่แจ้งล่าสุด เพื่อให้คนที่เพิ่งเปิดใช้งานตอนบ่ายได้เห็นทันที
    // ว่าหน้าตาเป็นอย่างไร ไม่ต้องรอถึงพรุ่งนี้แล้วลุ้นว่าตั้งถูกไหม
    clearLastSent();
    update({ enabled: true });
  };

  const testNow = async () => {
    setSending(true);
    setTested(null);
    clearLastSent();
    const sent = await sendIfDue(
      // บังคับให้ผ่านเงื่อนไขเวลา เพราะปุ่มนี้มีไว้ดูหน้าตาเดี๋ยวนี้
      { ...settings, enabled: true, hour: 0 },
      fallbackProvince,
      userId,
    );
    if (!sent) clearLastSent();
    setTested(sent ? "ส่งแล้ว ดูที่มุมจอ" : "ยังไม่มีข้อมูลพอจะสรุป ลองใหม่อีกครั้ง");
    setSending(false);
  };

  if (permission === "unsupported") {
    return (
      <p className="digest-note">
        เบราว์เซอร์นี้ไม่รองรับการแจ้งเตือน จึงตั้งสรุปประจำวันไม่ได้
      </p>
    );
  }

  return (
    <div className="digest">
      <div className="digest-head">
        {/* ใช้ปุ่มธรรมดาไม่ใช่ checkbox เพราะการกดต้องรอผลการขออนุญาต
            ซึ่งอาจถูกปฏิเสธ สถานะจึงไม่ได้เปลี่ยนตามการกดเสมอไป */}
        <button
          type="button"
          className={settings.enabled ? "digest-switch on" : "digest-switch"}
          onClick={() => void toggle()}
          aria-pressed={settings.enabled}
        >
          <span className="digest-knob" />
          <span className="sr-only">
            {settings.enabled ? "ปิดสรุปประจำวัน" : "เปิดสรุปประจำวัน"}
          </span>
        </button>
        <span className="digest-title">สรุปฝุ่นและอากาศประจำวัน</span>
      </div>

      {permission === "denied" && (
        <p className="digest-note warn">
          เบราว์เซอร์ถูกตั้งไม่ให้เว็บนี้แจ้งเตือน ต้องไปเปิดเองที่ตั้งค่าของเบราว์เซอร์
          เพราะหน้าเว็บขอซ้ำไม่ได้อีก
        </p>
      )}

      {settings.enabled && permission === "granted" && (
        <>
          <div className="digest-controls">
            <label>
              ตั้งแต่เวลา
              <select
                value={settings.hour}
                onChange={(event) => update({ hour: Number(event.target.value) })}
              >
                {HOURS.map((hour) => (
                  <option key={hour} value={hour}>
                    {String(hour).padStart(2, "0")}:00 น.
                  </option>
                ))}
              </select>
            </label>

            <label>
              พื้นที่
              <select
                value={settings.province}
                onChange={(event) => update({ province: event.target.value })}
              >
                <option value="">ตามจังหวัดของคุณ</option>
                {provinces.map((province) => (
                  <option key={province} value={province}>
                    {province}
                  </option>
                ))}
              </select>
            </label>

            <button
              type="button"
              className="digest-test"
              onClick={() => void testNow()}
              disabled={sending}
            >
              {sending ? "กำลังส่ง..." : "ลองดูตอนนี้"}
            </button>
          </div>

          <p className="digest-note">
            {tested ??
              "แจ้งครั้งเดียวต่อวัน ตอนที่เปิดเว็บครั้งแรกหลังเวลาที่ตั้งไว้ วันไหนไม่ได้เปิดเว็บก็ไม่แจ้ง"}
          </p>
        </>
      )}
    </div>
  );
}
