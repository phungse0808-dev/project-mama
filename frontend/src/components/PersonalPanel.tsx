import { useEffect, useState } from "react";
import { api } from "../api";
import type { AppUser, PersonalSummary, RiskGroup } from "../api";

type Props = {
  user: AppUser;
  onProfileChange: (user: AppUser) => void;
};

/**
 * แผงคำแนะนำเฉพาะบุคคล
 *
 * เป็นส่วนที่ทำให้ระบบต่างจากเว็บรายงานค่าฝุ่นทั่วไป เพราะแสดงคำแนะนำ
 * ตามจังหวัดและกลุ่มเสี่ยงที่ผู้ใช้เป็น ไม่ใช่บอกตัวเลขแล้วให้ตีความเอง
 */
export function PersonalPanel({ user, onProfileChange }: Props) {
  const [summary, setSummary] = useState<PersonalSummary | null>(null);
  const [groups, setGroups] = useState<RiskGroup[]>([]);
  const [provinces, setProvinces] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    void (async () => {
      const [groupList, provinceList] = await Promise.all([
        api.riskGroups(),
        api.provinces(),
      ]);
      setGroups(groupList);
      setProvinces(provinceList);
    })();
  }, []);

  useEffect(() => {
    void (async () => {
      setSummary(await api.personalSummary(user.id));
    })();
  }, [user]);

  async function save(province: string | null, riskGroup: string | null) {
    setSaving(true);
    try {
      onProfileChange(await api.updateProfile(user.id, province, riskGroup));
    } finally {
      setSaving(false);
    }
  }

  if (!summary) {
    return (
      <section className="panel">
        <p className="empty">กำลังโหลดคำแนะนำ...</p>
      </section>
    );
  }

  const { standards, level, my_advice } = summary;

  return (
    <section className="panel personal" style={{ borderTopColor: level.color }}>
      <h2 className="panel-title">
        คำแนะนำสำหรับคุณ{user.display_name}
        <span className="panel-hint">
          พื้นที่{summary.scope} · {summary.station_count} สถานี
        </span>
      </h2>

      <div className="personal-top">
        <div className="personal-reading" style={{ backgroundColor: level.color }}>
          <p className="personal-value">{summary.pm25 ?? "-"}</p>
          <p className="personal-unit">µg/m³</p>
          <p className="personal-level">{level.label_th}</p>
        </div>

        <div className="personal-advice">
          {my_advice && (
            <>
              <p className="personal-group">
                กลุ่มของคุณ: <strong>{my_advice.label_th}</strong>
                {my_advice.sensitive && <span className="badge-sensitive">กลุ่มเปราะบาง</span>}
              </p>
              <p className="personal-text">{my_advice.advice_th}</p>
            </>
          )}

          <ul className="standard-list">
            <li>
              เทียบมาตรฐานไทย ({standards.thai_standard} µg/m³)
              <strong className={standards.over_thai_standard ? "over" : "under"}>
                {standards.over_thai_standard ? "เกินมาตรฐาน" : "ไม่เกิน"}
              </strong>
            </li>
            <li>
              เทียบค่าแนะนำ WHO ({standards.who_guideline} µg/m³)
              <strong className={standards.over_who_guideline ? "over" : "under"}>
                {standards.over_who_guideline
                  ? `เกิน ${standards.times_who} เท่า`
                  : "ไม่เกิน"}
              </strong>
            </li>
          </ul>
        </div>
      </div>

      <div className="personal-settings">
        <label>
          จังหวัดของคุณ
          <select
            value={user.province ?? ""}
            disabled={saving}
            onChange={(event) => void save(event.target.value || null, user.risk_group)}
          >
            <option value="">ทั้งประเทศ (ค่าเฉลี่ย)</option>
            {provinces.map((province) => (
              <option key={province} value={province}>
                {province}
              </option>
            ))}
          </select>
        </label>

        <label>
          กลุ่มเสี่ยงของคุณ
          <select
            value={user.risk_group ?? "general"}
            disabled={saving}
            onChange={(event) => void save(user.province, event.target.value)}
          >
            {groups.map((group) => (
              <option key={group.key} value={group.key}>
                {group.label_th}
              </option>
            ))}
          </select>
        </label>

        <button className="link-button" onClick={() => setShowAll((value) => !value)}>
          {showAll ? "ซ่อนคำแนะนำกลุ่มอื่น" : "ดูคำแนะนำของทุกกลุ่ม"}
        </button>
      </div>

      {showAll && (
        <ul className="group-list">
          {summary.all_groups.map((group) => (
            <li key={group.key}>
              <p className="group-name">
                {group.label_th}
                {group.sensitive && <span className="badge-sensitive">กลุ่มเปราะบาง</span>}
              </p>
              <p className="group-detail">{group.detail_th}</p>
              <p className="group-advice">{group.advice_th}</p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
