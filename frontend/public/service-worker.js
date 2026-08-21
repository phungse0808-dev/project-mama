/* ตัวช่วยให้แอปเปิดได้แม้เน็ตไม่ติด
 *
 * เก็บไฟล์หน้าเว็บไว้ในเครื่องหลังเปิดครั้งแรก คราวหน้าจึงเปิดได้ทันที
 * ไม่ต้องรอโหลดใหม่ และเปิดได้แม้ไม่มีสัญญาณ
 *
 * ไม่เก็บข้อมูลจาก API ไว้เลย
 *     ค่าฝุ่นและสภาพอากาศต้องเป็นค่าล่าสุดเสมอ
 *     การเก็บไว้ใช้ซ้ำจะทำให้ผู้ใช้เห็นค่าเก่าโดยไม่รู้ตัว
 *     ซึ่งอันตรายกว่าการไม่เห็นอะไรเลย เพราะเป็นข้อมูลที่ใช้ตัดสินใจเรื่องสุขภาพ
 */

const CACHE = "pm25-shell-v1";

// เก็บเฉพาะโครงของหน้าเว็บ ไฟล์ที่เหลือจะถูกเก็บตอนถูกเรียกใช้จริง
const SHELL = ["/", "/index.html", "/app-icon.svg", "/manifest.webmanifest"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  // ลบของเก่าที่ค้างจากรุ่นก่อน ไม่งั้นพื้นที่จะบวมขึ้นเรื่อยๆ ทุกครั้งที่อัปเดต
  event.waitUntil(
    caches
      .keys()
      .then((names) => Promise.all(names.filter((n) => n !== CACHE).map((n) => caches.delete(n))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;

  if (request.method !== "GET") return;

  const url = new URL(request.url);

  // ข้อมูลจาก API ต้องไปเอาจากเซิร์ฟเวอร์เสมอ ห้ามใช้ของเก่าที่เก็บไว้
  if (url.pathname.startsWith("/api/")) return;

  // ไฟล์จากที่อื่น เช่น ฟอนต์และภาพแผนที่ ปล่อยให้เบราว์เซอร์จัดการเอง
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    caches.match(request).then((hit) => {
      // มีในเครื่องก็ใช้เลย แล้วค่อยไปดึงรุ่นใหม่มาเก็บไว้ใช้คราวหน้า
      const fresh = fetch(request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(CACHE).then((cache) => cache.put(request, copy));
          }
          return response;
        })
        .catch(() => hit);

      return hit || fresh;
    }),
  );
});
