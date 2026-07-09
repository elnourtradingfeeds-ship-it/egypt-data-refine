
# خطة بناء "Sales & Collections Intelligence Platform"
منصة موحّدة تجمع CRM_Dashboard + Financial_Collections_Dashboard في مشروع Lovable الحالي، مبنية على TanStack Start + React + Tailwind + Recharts، مع مراجعة كاملة للكود القديم وتصليح الأخطاء الموثّقة أدناه.

---

## 1) مراجعة الكود الحالي — أهم الملاحظات

### 🔴 أخطاء جوهرية لازم تتصلح
| # | المشكلة | الملف | مكانها | التأثير |
|---|---------|--------|---------|---------|
| 1 | **بيانات وهمية مُولّدة عشوائياً** (`generateHistoricalData` بيضرب × scale + `Math.random`) | CRM | سطر 6542 | الإدارة بتاخد قرارات على أرقام مش حقيقية لسنين سابقة |
| 2 | **`importExcel` بيقرأ ملف واحد بس** رغم أن الـ input فيه `multiple` | CRM | سطر 7463 | مينفعش ترفع 3 سنوات مرة واحدة |
| 3 | **Tailwind CDN + inline scripts** — بطيء، مش قابل للنشر production، وبيتحذر في الكونسول | الاتنين | الهيدر | جودة إنتاجية ضعيفة |
| 4 | **مفيش ربط بين المبيعات والمقبوضات** (شيتات المقبوضات فيها اسم بس، والمبيعات فيها Code + اسم) | — | — | مستحيل تحسب رصيد أو DSO بدون matching |
| 5 | **`prevPage/nextPage` مقلوبين** (زر "التالي" بينده `nextPage` لكن السهم `chevron-right` وفي RTL ده رجوع) | CRM | 1668-1669 | زرار الباجينيشن مربكة |
| 6 | **`generateInsights` و `copyInsights` و AI chat مش متكاملين** مع فلترة الفترة/السنة | الاتنين | متعددة | نتايج AI بتخالف الأرقام الظاهرة |
| 7 | **تعريف "الراكد" غير موجود بشكل صريح** — بس ألوان في `analyzeOperationalStatus` | CRM | 6653 | مفيش criteria واضحة للإدارة |
| 8 | **`exportPDFReport` بيبني HTML كـ concatenation ضخم** (سطر 8025-8464) صعب صيانته وفيه مشاكل RTL | CRM | 8025 | تقرير الطباعة بيطلع مكسور أحياناً |
| 9 | **Financial dashboard مالوش تبويب Collections vs Sales موحد** | FIN | كامل | لازم يشتغل مع CRM في شاشتين منفصلتين |
| 10 | **الشيتات المصدرية أول 3 صفوف عناوين** (Print Date, تقرير…, صف رؤوس الأعمدة) — الكود بيبدأ من `r=3` وده صح، بس مفيش validation إن الصف فعلاً header |

### 🟡 مشاكل تصميم / UX
- خلط بين Cairo + Outfit + FontAwesome CDN، وبين glassmorphism (CRM) و flat blue (FIN) — مفيش هوية موحدة.
- KPI cards ألوانها مش semantic (نفس الأخضر لكل حاجة إيجابية بدون تدرّج).
- الجداول مفيهاش sticky header ولا virtualization — بطيئة مع 300 عميل.
- الـ Drawer (تفاصيل العميل) بيفتح على الشمال في RTL — الصح يمين.
- زرار "طباعة/تصدير" مبعثرة في 4 أماكن مختلفة بدون توحيد.

---

## 2) هيكل الداشبورد الجديد (7 صفحات)

```text
/                       صفحة رفع الملفات + validation + معاينة
/executive              Executive Summary — للإدارة العليا
/sales                  تحليل المبيعات (كل سنة + مجمّع)
/collections            تحليل المقبوضات
/customers              360° Customer View — رحلة العميل عبر 3 سنين
/stagnation             الراكدين — 3 مستويات (النشط/المتعثر/الراكد)
/reports                تصدير PDF/Excel احترافي
```

### الصفحات بالتفصيل

**1. Executive Summary** — لوحة الإدارة
- 8 KPIs: إجمالي مبيعات YTD، إجمالي مقبوضات YTD، نسبة التحصيل %، DSO (أيام التحصيل)، عدد نشطين، عدد راكدين، Top customer، YoY growth.
- 3 مخططات: Sales vs Collections شهري (bar + line)، Pareto (80/20)، Waterfall للنمو.
- تنبيهات ذكية (Alerts Board) بحد أقصى 10 حالات حرجة.

**2. Sales Analysis** — نفس منطق CRM لكن بدون بيانات مولّدة
- تبويبات: 2024 / 2025 / 2026 / Consolidated.
- جدول العملاء مع فلاتر (بحث، ABC، حالة) + sticky header + pagination صح.
- Heatmap شهري (12 شهر × Top 30 عميل).

**3. Collections Analysis** — نفس منطق Financial Dashboard
- نفس شكل Sales بس على المقبوضات.
- Aging analysis: 0–30 / 31–60 / 61–90 / 90+ يوم.

**4. Customer 360° View** — الميزة الجديدة الأهم
- Drawer/Page لكل عميل فيه:
  - Timeline 36 شهر (Sales + Collections سايد باي سايد).
  - رصيد جاري = Σ(Sales) − Σ(Collections) لكل سنة + إجمالي.
  - Collection Ratio لكل سنة، ونسبة التحصيل التراكمية.
  - Trend Score (نمو/ثابت/انحدار) مع سبب.
  - تصنيف ABC للسنة الحالية + تاريخ آخر فاتورة + آخر تحصيل.

**5. Stagnation Analysis** — تعريف مركّب صريح (3 مستويات)
```text
🟢 نشط:    آخر شهرين فيهم مبيعات، ومتوسط آخر 3 شهور ≥ 70% من متوسطه السنوي التاريخي.
🟡 متعثر:  آخر 3 شهور فيهم مبيعات لكن متوسطها هبط 40–70% مقارنة بمتوسط الـ 12 شهر قبلها.
🔴 راكد:   صفر مبيعات لـ 3 شهور متتالية، أو هبوط >70% لأكتر من 3 شهور.
```
- الحساب على 3 مستويات: (أ) كل سنة على حدة، (ب) مجمّع 3 سنين، (ج) رحلة العميل (كان راكد سنة ورجع نشط سنة تانية).
- Matrix view: عميل × سنة، بلون الحالة، مع سهم اتجاه.

**6. Reports** — تصدير احترافي
- زر واحد يصدّر PDF (react-pdf) موحّد بهوية الشركة.
- Export Excel (xlsx) بكل الجداول.

---

## 3) حل مشكلة ربط المبيعات بالمقبوضات

الشيتات:
- **المبيعات:** `Code | البيان | 12 شهر | مجموع` — فيها كود العميل.
- **المقبوضات:** `الاسم | 12 شهر` — **مفيهاش كود**.

**الحل المقترح (3 طبقات):**
1. **Exact match** على الاسم بعد تنظيف (إزالة مسافات/شرطات/تشكيل/تطبيع الألف والياء).
2. **Fuzzy match** (Levenshtein + token-based) لأن الأسماء فيها اختلافات زي "ا/خليل عبد العزيز" vs "خليل عبد العزيز".
3. **شاشة Reconciliation manual**: العملاء اللي match confidence < 85% تظهر في جدول والمستخدم يربطهم يدوياً مرة، والربط يتحفظ في localStorage (أو Lovable Cloud لو حبيت).

---

## 4) Tech Stack والتنفيذ

**داخل مشروع Lovable الحالي (TanStack Start):**
- **Parsing:** `xlsx` (SheetJS) في server function عشان الـ file حجم كبير.
- **Charts:** Recharts (متوافق React + خفيف). ECharts لو احتجنا heatmap/sunburst.
- **UI:** shadcn (موجود) + Cairo font عبر `<link>` في `__root.tsx`.
- **State:** TanStack Query + Zustand للفلاتر.
- **Storage:** localStorage للـ dataset (client-side كامل زي القديم — بدون backend).
- **RTL:** `dir="rtl"` على `<html>` + Tailwind logical properties.
- **PDF Export:** `@react-pdf/renderer` بدل concatenation HTML.
- **Design tokens:** OKLCH في `src/styles.css` — Deep Blue #1e3a8a للـ primary، تدرّج 3 ألوان للحالات.

---

## 5) خطوات التنفيذ (بترتيب)

1. تجهيز design system (styles.css + tailwind theme + Cairo font).
2. صفحة `/` رفع 6 ملفات (3 مبيعات + 3 مقبوضات) مع validation ومعاينة + storage محلي.
3. Parser موحد + Reconciliation engine للـ name matching.
4. Customer 360 core: بنية بيانات موحدة `Customer { code, name, years: { sales, collections } }`.
5. Executive + Sales + Collections pages.
6. Stagnation engine بالتعريف الـ 3 مستويات.
7. Reports (PDF + Excel).
8. مراجعة UX نهائية + تصليح كل الأزرار المذكورة في الجدول أعلاه.

---

## 6) نقاط تحسين إضافية مقترحة (اختيارية — أوافق قبل التنفيذ)

- **Predictive:** توقع مبيعات الشهر الجاي لكل عميل (moving average بسيط).
- **Cash-flow forecast:** بناءً على DSO التاريخي لكل عميل.
- **Segment analysis:** توزيع جغرافي لو الاسم فيه منطقة (مثل "أحمد القصاص - حلوان").
- **Alerts email:** يوم 1 كل شهر يبعت تقرير للإدارة (يحتاج Lovable Cloud).

---

## ⚠️ ملاحظة مهمة قبل ما نبدأ

الكود القديم في `generateHistoricalData` كان **بيولّد أرقام سنوات 2024 و 2025 عشوائياً** لو الملف الحقيقي مش موجود. أنا هستخدم **بس الأرقام الحقيقية** من الشيتات اللي رفعتها. لو في شهور صفر في نص السنة (زي 2026 من يوليو لديسمبر) هيتعامل معاها كـ "لسه ما حصلتش" مش كـ "صفر مبيعات".
