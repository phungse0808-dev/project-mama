import type { CollectionHealth } from "../api";
import { formatThaiDateTime } from "../api";

type Props = { health: CollectionHealth };

/**
 * แผงคุณภาพข้อมูล
 *
 * ส่วนนี้ไม่ใช่ของตกแต่ง แต่เป็นหลักฐานว่าข้อมูลในระบบมาจากการเก็บจริง
 * และบอกได้ว่าเก็บได้ครบแค่ไหน ซึ่งเป็นข้อมูลที่ต้องรายงานในบทที่ 4
 */
export function DataHealth({ health }: Props) {
  return (
    <section className="panel">
      <h2 className="panel-title">
        คุณภาพและความครบถ้วนของข้อมูล
        <span className="panel-hint">ข้อมูลจริงที่ระบบเก็บสะสมเอง</span>
      </h2>

      <div className="health-grid">
        <div className="health-stat">
          <p className="health-value">{health.readings_total.toLocaleString("th-TH")}</p>
          <p className="health-label">ค่าตรวจวัดรายชั่วโมง</p>
        </div>
        <div className="health-stat">
          <p className="health-value">{health.weather_total.toLocaleString("th-TH")}</p>
          <p className="health-label">ข้อมูลอากาศรายวัน</p>
        </div>
        <div className="health-stat">
          <p className="health-value">{health.stations_total}</p>
          <p className="health-label">สถานีตรวจวัด</p>
        </div>
        <div className="health-stat">
          <p className="health-value">
            {health.completeness_pct !== null ? `${health.completeness_pct}%` : "-"}
          </p>
          <p className="health-label">ความครบถ้วนเทียบกับที่ควรได้</p>
        </div>
      </div>

      <div className="health-columns">
        <div>
          <h3 className="health-subtitle">ความครบถ้วนของแต่ละสารมลพิษ</h3>
          <ul className="field-list">
            {Object.entries(health.field_completeness).map(([field, pct]) => (
              <li key={field}>
                <span>{field}</span>
                <span className="field-track">
                  <span
                    className="field-fill"
                    style={{
                      width: `${pct}%`,
                      background: pct > 80 ? "#00b050" : pct > 40 ? "#ffd400" : "#ff7e00",
                    }}
                  />
                </span>
                <span className="field-pct">{pct}%</span>
              </li>
            ))}
          </ul>
          <p className="health-note">
            มีเพียง PM2.5 ที่ทุกสถานีวัดครบ สารอื่นวัดเฉพาะบางสถานี
            จึงกำหนดให้ PM2.5 เป็นตัวแปรหลักของระบบ
          </p>
        </div>

        <div>
          <h3 className="health-subtitle">ประวัติการเก็บข้อมูลล่าสุด</h3>
          <table className="runs-table">
            <thead>
              <tr>
                <th>เวลา</th>
                <th>แหล่ง</th>
                <th>ใหม่</th>
                <th>ซ้ำ</th>
                <th>ผล</th>
              </tr>
            </thead>
            <tbody>
              {health.recent_runs.map((run, index) => (
                <tr key={`${run.started_at}-${index}`}>
                  <td>{formatThaiDateTime(run.started_at)}</td>
                  <td>{run.source === "air4thai" ? "Air4Thai" : "NASA POWER"}</td>
                  <td>{run.records_new.toLocaleString("th-TH")}</td>
                  <td>{run.records_duplicate.toLocaleString("th-TH")}</td>
                  <td>
                    <span className={run.success ? "badge-ok" : "badge-fail"}>
                      {run.success ? "สำเร็จ" : "ล้มเหลว"}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
