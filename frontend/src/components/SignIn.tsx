import { AppIcon } from "./AppIcon";
import { useState } from "react";
import { api } from "../api";
import "./SignIn.css";
import type { AppUser } from "../api";

type Props = {
  onSignedIn: (user: AppUser) => void;
};

/**
 * หน้าเข้าใช้งานด้วยชื่อ
 *
 * ไม่มีรหัสผ่านโดยเจตนา ระบบใช้ชื่อเพื่อจำค่าที่ผู้ใช้ตั้งไว้เท่านั้น
 * จึงต้องบอกผู้ใช้ให้ชัดว่าไม่ใช่ระบบรักษาความปลอดภัย
 */
export function SignIn({ onSignedIn }: Props) {
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!name.trim()) {
      setError("กรุณากรอกชื่อ");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      onSignedIn(await api.signIn(name));
    } catch (err) {
      setError(err instanceof Error ? err.message : "เข้าใช้งานไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="signin-page">
      <form className="signin-card" onSubmit={handleSubmit}>
        <div className="signin-logo">
          <AppIcon size={74} />
        </div>

        <label className="signin-label" htmlFor="name">
          กรอกชื่อของคุณเพื่อเข้าใช้งาน
        </label>
        <input
          id="name"
          className="signin-input"
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="เช่น สมชาย ใจดี"
          maxLength={60}
          autoFocus
          autoComplete="off"
        />

        {error && <p className="signin-error">{error}</p>}

        <button className="signin-button" type="submit" disabled={busy}>
          {busy ? "กำลังเข้าใช้งาน..." : "เข้าใช้งาน"}
        </button>

        <p className="signin-note">
          ระบบนี้ใช้ชื่อเพื่อจำจังหวัดและกลุ่มเสี่ยงที่คุณตั้งไว้
          สำหรับแสดงคำแนะนำสุขภาพให้ตรงกับตัวคุณ
          <br />
          <strong>ไม่ต้องใช้รหัสผ่าน และไม่ควรกรอกข้อมูลที่เป็นความลับ</strong>
        </p>
      </form>
    </main>
  );
}
