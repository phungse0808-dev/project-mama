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

const CACHE = "pm25-shell-v2";

// เก็บเฉพาะโครงของหน้าเว็บ ไฟล์ที่เหลือจะถูกเก็บตอนถูกเรียกใช้จริง
const SHELL = ["/", "/index.html", "/app-icon.svg", "/manifest.webmanifest"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((names) => {
        // จำไว้ว่ามีของรุ่นก่อนค้างอยู่หรือไม่ ก่อนจะลบทิ้ง
        const hadOld = names.some((n) => n !== CACHE);
        // ลบของเก่าที่ค้างจากรุ่นก่อน ไม่งั้นพื้นที่จะบวมขึ้นเรื่อย ๆ ทุกครั้งที่อัปเดต
        return Promise.all(names.filter((n) => n !== CACHE).map((n) => caches.delete(n)))
          .then(() => self.clients.claim())
          .then(() => hadOld && refreshOpenPages());
      }),
  );
});

/** สั่งให้หน้าที่เปิดค้างอยู่โหลดตัวเองใหม่ หลังเปลี่ยนมาใช้รุ่นนี้
 *
 * ทำไมต้องมี
 *     รุ่นก่อนหน้าตั้งให้หยิบ index.html จากในเครื่องก่อนเสมอ
 *     คนที่เคยเปิดเว็บไปแล้วจึงติดอยู่กับหน้าเก่าที่ชี้ไปยังโค้ดรุ่นเก่า
 *     และโค้ดที่แก้ปัญหานี้ก็อยู่ในไฟล์ที่เขาไม่มีวันโหลด กลายเป็นวงจรที่หลุดเองไม่ได้
 *
 *     ไฟล์ตัวช่วยนี้เป็นไฟล์เดียวที่เบราว์เซอร์ไปดึงจากเซิร์ฟเวอร์เสมอ
 *     ทางออกจึงต้องอยู่ในไฟล์นี้ คือพอรุ่นใหม่เริ่มทำงานก็สั่งให้หน้าโหลดใหม่
 *     รอบนั้นจะได้ index.html สดจากเซิร์ฟเวอร์ตามกติกาใหม่
 *
 *     สั่งเฉพาะตอนพบว่ามีของรุ่นก่อนค้างอยู่ ผู้ใช้ใหม่จึงไม่โดนโหลดซ้ำโดยไม่จำเป็น
 */
function refreshOpenPages() {
  return self.clients.matchAll({ type: "window" }).then((pages) => {
    pages.forEach((page) => {
      if ("navigate" in page) page.navigate(page.url).catch(() => {});
    });
  });
}

self.addEventListener("fetch", (event) => {
  const { request } = event;

  if (request.method !== "GET") return;

  const url = new URL(request.url);

  // ข้อมูลจาก API ต้องไปเอาจากเซิร์ฟเวอร์เสมอ ห้ามใช้ของเก่าที่เก็บไว้
  if (url.pathname.startsWith("/api/")) return;

  // ไฟล์จากที่อื่น เช่น ฟอนต์และภาพแผนที่ ปล่อยให้เบราว์เซอร์จัดการเอง
  if (url.origin !== self.location.origin) return;

  // ตัวหน้าเว็บต้องไปเอาจากเซิร์ฟเวอร์ก่อนเสมอ ใช้ของในเครื่องเฉพาะตอนเน็ตไม่ติด
  //
  // ทำไมต้องแยกกรณีนี้ออกมา
  //     index.html เป็นตัวชี้ว่าให้โหลดไฟล์โค้ดชื่ออะไร ซึ่งชื่อเปลี่ยนทุกครั้งที่อัปเดต
  //     ถ้าหยิบ index.html เก่าในเครื่องมาใช้ มันจะชี้ไปยังไฟล์โค้ดรุ่นเก่า
  //     ผู้ใช้จึงเห็นเว็บรุ่นเก่าทั้งที่เซิร์ฟเวอร์มีของใหม่รออยู่แล้ว
  //     และจะเห็นของใหม่ก็ต่อเมื่อเปิดซ้ำอีกรอบ ซึ่งไม่มีใครรู้ว่าต้องทำแบบนั้น
  const wantsPage =
    request.mode === "navigate" ||
    url.pathname === "/" ||
    url.pathname === "/index.html";

  if (wantsPage) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(CACHE).then((cache) => cache.put(request, copy));
          }
          return response;
        })
        .catch(() => caches.match(request).then((hit) => hit || caches.match("/index.html"))),
    );
    return;
  }

  // ไฟล์โค้ดกับรูปภาพใช้ของในเครื่องก่อนได้ เพราะชื่อไฟล์มีรหัสรุ่นติดอยู่แล้ว
  // ไฟล์ชื่อเดิมจึงมีเนื้อหาเดิมเสมอ ไม่มีทางได้ของเก่าผิดรุ่น
  event.respondWith(
    caches.match(request).then((hit) => {
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
