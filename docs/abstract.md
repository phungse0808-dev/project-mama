# บทคัดย่อ

**ชื่อโครงงาน** ระบบแสดงค่าฝุ่น PM2.5 และคำแนะนำสุขภาพ
**Project Title** PM2.5 Monitoring and Health Advisory System

**คำสำคัญ** ฝุ่น PM2.5, คุณภาพอากาศ, คำแนะนำสุขภาพรายโรค, การพยากรณ์ค่าฝุ่น,
Python, FastAPI, React, SQLite

> ตัวเลขทั้งหมดดึงจากฐานข้อมูลจริงของระบบ ณ 24 กันยายน 2569
> ก่อนส่งเล่มต้องนับใหม่อีกครั้ง เพราะระบบเก็บข้อมูลเพิ่มทุกชั่วโมง

## บทคัดย่อ

โครงงานนี้พัฒนาระบบเว็บแสดงค่าฝุ่น PM2.5 และคำแนะนำสุขภาพ เพื่อให้ประชาชนทราบว่า
พื้นที่ของตนมีค่าฝุ่นเท่าใด อยู่ในระดับใดตามมาตรฐานของประเทศไทย และผู้ที่มีโรคประจำตัว
ควรปฏิบัติตัวอย่างไร เนื่องจากระบบรายงานค่าฝุ่นที่มีอยู่เก็บข้อมูลย้อนหลังไว้
ให้เรียกดูเพียงประมาณ 3 เดือน และแบ่งคำแนะนำการปฏิบัติตัวเพียงประชาชนทั่วไป
กับกลุ่มเสี่ยง ยังไม่แยกตามโรคประจำตัวรายโรค

ระบบพัฒนาด้วยภาษา Python ร่วมกับ FastAPI และฐานข้อมูล SQLite ส่วนหน้าเว็บใช้ React
และ TypeScript ข้อมูลที่ใช้เป็นข้อมูลจริงทั้งหมด ได้แก่ ค่าฝุ่นรายชั่วโมงจากระบบ
Air4Thai ของกรมควบคุมมลพิษ 174 สถานี ใน 74 จังหวัด ข้อมูลอุตุนิยมวิทยาจาก NASA POWER
และ Open-Meteo และจำนวนผู้ป่วยกลุ่มโรคที่เกี่ยวข้องกับการรับสัมผัสฝุ่นระดับจังหวัด
รายเดือน ครบทั้ง 77 จังหวัด ปี 2565 ถึง 2568 จากกรมควบคุมโรค เนื่องจากต้นทาง
เก็บข้อมูลย้อนหลังไว้เพียงระยะสั้น ระบบจึงเก็บค่าฝุ่นอัตโนมัติทุกชั่วโมง
ปัจจุบันสะสมแล้ว 72,871 ค่า

ผลการพัฒนาพบว่าระบบใช้งานได้ตามที่ออกแบบไว้ ผู้ใช้ดูค่าฝุ่นรายจังหวัดและรายสถานี
แผนที่คุณภาพอากาศ อันดับจังหวัด และคำแนะนำการปฏิบัติตัวที่แยกตามระดับฝุ่นและโรคประจำตัว
7 โรค พร้อมอาการที่ต้องเฝ้าดูและเกณฑ์ที่ควรไปพบแพทย์ ส่วนการพยากรณ์ ระบบออกค่าวันละ
หนึ่งรอบแล้วเก็บไว้เทียบกับค่าที่สถานีวัดได้จริง ผลการย้อนทดสอบ 484 กรณี ได้ค่า
คลาดเคลื่อนเฉลี่ย 1.85 ไมโครกรัมต่อลูกบาศก์เมตร ดีกว่าการใช้ค่าของวันก่อนหน้าซึ่งได้
1.94 ส่วนการวิเคราะห์ความสัมพันธ์ระหว่างค่าฝุ่นกับจำนวนผู้ป่วยจาก 3,157 คู่จังหวัด-เดือน
พบว่าเมื่อวัดด้วยจำนวนผู้ป่วยไม่พบความสัมพันธ์ เพราะจำนวนผู้ป่วยที่บันทึกไว้ขึ้นกับ
ปฏิทินการศึกษาและวันหยุดมากกว่าขึ้นกับฝุ่น แต่เมื่อเปลี่ยนไปวัดด้วยสัดส่วนผู้ป่วยรายโรค
ต่อผู้ป่วยทั้งหมด โรคแยกตัวเองเป็นสองกลุ่ม คือโรคที่ฝุ่นกระตุ้นให้กำเริบหกโรค
มีสัดส่วนสูงกว่าค่าปกติราว 7–11% ในเดือนถัดจากเดือนที่ฝุ่นเกิน 25 ไมโครกรัมต่อลูกบาศก์เมตร
เทียบกับราว 1–4% ในเดือนที่อากาศดี ส่วนโรคติดต่อหนึ่งโรคลดลง 4% ข้อเสนอแนะสำหรับ
การพัฒนาต่อคือเก็บข้อมูลค่าฝุ่นให้ครบทุกฤดูกาลแล้วปรับสูตรพยากรณ์ใหม่
และขอข้อมูลผู้ป่วยรายวันเพื่อวิเคราะห์ผลกระทบระยะสั้น

---

## Abstract

This project develops a web-based PM2.5 monitoring and health advisory system that
lets the public see the current PM2.5 level in their province, how it is classified
under the Thai standard, and what people with pre-existing conditions should do.
Existing air-quality services retain only about three months of history and
separate advice into "general public" and "sensitive groups" rather than by
specific disease.

The server side uses Python with FastAPI and SQLite; the client side uses React
with TypeScript. All data is real: hourly PM2.5 from the Pollution Control
Department's Air4Thai network (174 stations across 74 provinces), weather data from
NASA POWER and Open-Meteo, and monthly province-level counts of dust-related
illnesses for all 77 provinces from 2022 to 2025, obtained from the Department of
Disease Control. Because the source retains only a short window of history, the system
collects and stores readings itself every hour, accumulating 72,871 readings to date.

The system performs as designed. Users can view PM2.5 by province and station, an
air-quality map, provincial rankings, and advice tailored to the air-quality level
and to seven selectable pre-existing conditions, including symptoms to watch for and
when to see a doctor. The forecast component issues one prediction per day and
compares it against measured values; back-testing on 484 cases gave a mean absolute
error of 1.85 µg/m³, better than the 1.94 of the persistence baseline. Analysis of
3,157 province-month pairs found no relationship when measured by patient counts,
because recorded counts track the school calendar and public holidays more than they
track dust. Measured instead as each disease's share of all patients, the diseases
separate into two groups: the six dust-aggravated conditions all rise, to roughly
7–11% above their seasonal norm in the month following a month above 25 µg/m³,
against roughly 1–4% after clean months, while the one communicable disease falls by
4%. Future work should collect a full year of readings before recalibrating the
forecast, and request daily patient data for short-term analysis.
