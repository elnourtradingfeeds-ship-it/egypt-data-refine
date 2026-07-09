import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import {
  ShoppingCart,
  Wallet,
  Users,
  AlertTriangle,
  Percent,
  Trophy,
  Timer,
  Printer,
  FileText,
} from "lucide-react";
import {
  BarChart,
  Bar,
  ComposedChart,
  Line,
  Cell,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  CartesianGrid,
} from "recharts";
import { useCustomers, useDataStore } from "@/lib/store";
import { fmtCompact, fmtEGP, fmtInt, fmtPct, ARABIC_MONTHS } from "@/lib/format";
import { KpiCard } from "@/components/KpiCard";
import { Section } from "@/components/Section";
import { estimateDSO, paretoData, yearlyTotals } from "@/lib/analytics";
import { tooltipEGP, tooltipMulti } from "@/lib/recharts-format";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { printHtml, escapeHtml } from "@/lib/print";
import type { Customer } from "@/lib/customer-model";

export const Route = createFileRoute("/executive")({
  head: () => ({
    meta: [
      { title: "الملخّص التنفيذي — منصّة المبيعات والمقبوضات" },
      { name: "description", content: "لوحة قرار الإدارة: مبيعات، مقبوضات، DSO، ونسبة تحصيل عبر السنوات." },
    ],
  }),
  component: Executive,
});

function sumRange(monthly: number[] | undefined, from: number, to: number): number {
  if (!monthly) return 0;
  let s = 0;
  for (let i = from; i <= to && i < monthly.length; i++) s += monthly[i] ?? 0;
  return s;
}

function aggForYearRange(customers: Customer[], year: number, from: number, to: number) {
  let sales = 0, collections = 0, active = 0;
  for (const c of customers) {
    const s = sumRange(c.sales[year], from, to);
    const col = sumRange(c.collections[year], from, to);
    sales += s;
    collections += col;
    if (s > 0) active++;
  }
  return { sales, collections, active, balance: sales - collections, rate: sales > 0 ? (collections / sales) * 100 : 0 };
}

function monthsSince(last: { year: number; month: number } | null, refYear: number, refMonth: number): number | null {
  if (!last) return null;
  return (refYear - last.year) * 12 + (refMonth - last.month);
}

function Executive() {
  const customers = useCustomers();
  const meta = useDataStore((s) => s.meta);
  const [selectedYear, setSelectedYear] = useState<number>(meta.currentYear);
  const [compareYear, setCompareYear] = useState<number>(Math.max(meta.years[0], meta.currentYear - 1));
  const partialMonthsSel = meta.partialMonths[selectedYear] ?? 12;
  const [monthFrom, setMonthFrom] = useState<number>(0);
  const [monthTo, setMonthTo] = useState<number>(Math.max(0, partialMonthsSel - 1));

  const totalsAllYears = useMemo(() => yearlyTotals(customers, meta.years), [customers, meta.years]);

  const cur = useMemo(() => aggForYearRange(customers, selectedYear, monthFrom, monthTo), [customers, selectedYear, monthFrom, monthTo]);
  const prev = useMemo(() => aggForYearRange(customers, compareYear, monthFrom, monthTo), [customers, compareYear, monthFrom, monthTo]);

  const dso = useMemo(() => estimateDSO(customers, selectedYear), [customers, selectedYear]);

  const monthly = useMemo(() => {
    return ARABIC_MONTHS.slice(monthFrom, monthTo + 1).map((label, idx) => {
      const i = monthFrom + idx;
      let sales = 0, collections = 0;
      for (const c of customers) {
        sales += c.sales[selectedYear]?.[i] ?? 0;
        collections += c.collections[selectedYear]?.[i] ?? 0;
      }
      return { label, sales, collections, balance: sales - collections };
    });
  }, [customers, selectedYear, monthFrom, monthTo]);

  const pareto = useMemo(
    () => paretoData(customers, (c) => sumRange(c.sales[selectedYear], monthFrom, monthTo), 15),
    [customers, selectedYear, monthFrom, monthTo],
  );

  const stagnantCount = customers.filter((c) => c.statusOverall === "stagnant").length;
  const atRiskCount = customers.filter((c) => c.statusOverall === "atrisk").length;
  const activeCount = customers.filter((c) => c.statusOverall === "active").length;

  const topCustomer = [...customers]
    .map((c) => ({ c, v: sumRange(c.sales[selectedYear], monthFrom, monthTo) }))
    .filter((x) => x.v > 0)
    .sort((a, b) => b.v - a.v)[0];

  const yoyGrowth = prev.sales > 0 ? ((cur.sales - prev.sales) / prev.sales) * 100 : 0;

  const rangeLabel = `${ARABIC_MONTHS[monthFrom]} – ${ARABIC_MONTHS[monthTo]}`;

  function printExecutive() {
    const rows = totalsAllYears
      .map((t) => `<tr><td class="num">${t.year}</td><td class="num">${fmtInt(t.sales)}</td><td class="num">${fmtInt(t.collections)}</td><td class="num">${fmtInt(t.balance)}</td><td class="num">${fmtPct(t.collectionRate)}</td></tr>`)
      .join("");
    const html = `
      <div class="header">
        <div>
          <div class="brand">الملخّص التنفيذي</div>
          <div class="muted">مقارنة ${selectedYear} (${rangeLabel}) مقابل ${compareYear} — نفس الفترة</div>
        </div>
        <div class="muted">${new Date().toLocaleDateString("ar-EG")}</div>
      </div>
      <div class="grid-2">
        <div class="card"><div class="k">نسبة التحصيل — ${selectedYear}</div><div class="v">${fmtPct(cur.rate)}</div></div>
        <div class="card"><div class="k">نسبة التحصيل — ${compareYear}</div><div class="v">${fmtPct(prev.rate)}</div></div>
        <div class="card"><div class="k">متوسط أيام التحصيل (DSO)</div><div class="v">${dso > 0 ? dso + " يوم" : "—"}</div></div>
        <div class="card"><div class="k">عملاء نشطين / متعثرين / راكدين</div><div class="v">${activeCount} / ${atRiskCount} / ${stagnantCount}</div></div>
      </div>
      <h2>نظرة عبر السنوات — نسبة التحصيل والرصيد</h2>
      <table>
        <thead><tr><th>السنة</th><th>المبيعات</th><th>المقبوضات</th><th>الرصيد</th><th>التحصيل %</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
      <div class="muted" style="margin-top:10px">* إجمالي مبيعات السنة الحالية غير مدرج في هذه النسخة (سرّي).</div>
    `;
    printHtml(`الملخّص التنفيذي — ${selectedYear}`, html);
  }

  function printStagnationReport() {
    const refYear = meta.currentYear;
    const refMonth = Math.max(0, (meta.partialMonths[refYear] ?? 12) - 1);
    const stagnant = customers
      .filter((c) => c.statusOverall === "stagnant" || (c.salesAll > 0 && c.statusOverall === "atrisk"))
      .map((c) => {
        const gap = monthsSince(c.lastSale, refYear, refMonth) ?? 999;
        // Severity: recently churned = HIGH (most actionable), then MED, then LOW (long-lost)
        let severity: "high" | "med" | "low";
        if (gap <= 6) severity = "high";
        else if (gap <= 18) severity = "med";
        else severity = "low";
        return { c, gap, severity };
      })
      .sort((a, b) => a.gap - b.gap); // recent first

    const gapText = (g: number) => {
      if (g >= 12) {
        const y = Math.floor(g / 12);
        const m = g % 12;
        return `${y} سنة${m ? ` و${m} شهر` : ""}`;
      }
      return `${g} شهر`;
    };

    const groups = { high: [] as typeof stagnant, med: [] as typeof stagnant, low: [] as typeof stagnant };
    for (const s of stagnant) groups[s.severity].push(s);

    const renderRows = (list: typeof stagnant) =>
      list
        .map(
          (r, i) => `<tr class="sev-${r.severity}">
            <td class="num">${i + 1}</td>
            <td>${escapeHtml(r.c.name)}<div class="muted">${escapeHtml(r.c.code)}</div></td>
            <td class="num">${fmtInt(r.c.salesAll)}</td>
            <td class="num">${fmtInt(r.c.balanceAll)}</td>
            <td>${r.c.lastSale ? `${ARABIC_MONTHS[r.c.lastSale.month]} ${r.c.lastSale.year}` : "—"}</td>
            <td>${r.gap === 999 ? "—" : gapText(r.gap)}</td>
            <td>${fmtPct(r.c.collectionRateAll)}</td>
          </tr>`,
        )
        .join("");

    const section = (title: string, color: string, list: typeof stagnant) => {
      if (list.length === 0) return "";
      const total = list.reduce((a, b) => a + b.c.salesAll, 0);
      return `<h2 style="color:${color};border-color:${color}">${title} (${list.length} عميل — إجمالي تاريخي ${fmtInt(total)} ج.م)</h2>
      <table>
        <thead><tr><th>#</th><th>العميل</th><th>إجمالي البيع التاريخي</th><th>الرصيد المستحق</th><th>آخر بيع</th><th>مدة التوقف</th><th>التحصيل %</th></tr></thead>
        <tbody>${renderRows(list)}</tbody>
      </table>`;
    };

    const html = `
      <div class="header">
        <div>
          <div class="brand">تقرير العملاء الراكدين والمتعثرين</div>
          <div class="muted">مرتب حسب الأولوية: من ساب التعامل مؤخراً (قابل للاسترجاع) إلى الأقدم</div>
        </div>
        <div class="muted">${new Date().toLocaleDateString("ar-EG")}</div>
      </div>
      <div class="grid-2">
        <div class="card"><div class="k">إجمالي حالات</div><div class="v">${stagnant.length}</div></div>
        <div class="card"><div class="k">أولوية عالية (خلال 6 شهور)</div><div class="v" style="color:#991b1b">${groups.high.length}</div></div>
        <div class="card"><div class="k">أولوية متوسطة (6–18 شهر)</div><div class="v" style="color:#92400e">${groups.med.length}</div></div>
        <div class="card"><div class="k">أولوية منخفضة (>18 شهر)</div><div class="v" style="color:#374151">${groups.low.length}</div></div>
      </div>
      ${section("🔴 أولوية عالية — عملاء ساب التعامل مؤخراً (خلال آخر 6 شهور)", "#b91c1c", groups.high)}
      ${section("🟡 أولوية متوسطة — انقطاع من 6 إلى 18 شهر", "#b45309", groups.med)}
      ${section("⚪ أولوية منخفضة — انقطاع لأكثر من 18 شهر", "#374151", groups.low)}
    `;
    printHtml("تقرير العملاء الراكدين", html, { orientation: "landscape" });
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">الملخّص التنفيذي</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {selectedYear} · الفترة: {rangeLabel} — مقارنة مع {compareYear} في نفس الفترة.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={printExecutive}>
            <Printer className="ms-1 h-4 w-4" /> طباعة الملخّص
          </Button>
          <Button variant="outline" size="sm" onClick={printStagnationReport}>
            <FileText className="ms-1 h-4 w-4" /> تقرير الراكدين
          </Button>
        </div>
      </header>

      {/* Filters bar */}
      <div className="grid gap-4 rounded-xl border border-border bg-card p-4 shadow-sm md:grid-cols-3">
        <div>
          <div className="mb-2 text-xs font-bold text-muted-foreground">السنة الرئيسية</div>
          <YearPills years={meta.years} value={selectedYear} onChange={(y) => {
            setSelectedYear(y);
            const pm = meta.partialMonths[y] ?? 12;
            setMonthTo((m) => Math.min(m, pm - 1));
          }} />
        </div>
        <div>
          <div className="mb-2 text-xs font-bold text-muted-foreground">سنة المقارنة</div>
          <YearPills years={meta.years.filter((y) => y !== selectedYear)} value={compareYear} onChange={setCompareYear} />
        </div>
        <div>
          <div className="mb-2 text-xs font-bold text-muted-foreground">فترة المقارنة (من – إلى)</div>
          <div className="flex items-center gap-2 text-xs">
            <select
              value={monthFrom}
              onChange={(e) => { const v = Number(e.target.value); setMonthFrom(v); if (v > monthTo) setMonthTo(v); }}
              className="rounded-md border border-border bg-background px-2 py-1.5 font-semibold"
            >
              {ARABIC_MONTHS.map((m, i) => <option key={i} value={i}>{m}</option>)}
            </select>
            <span className="text-muted-foreground">إلى</span>
            <select
              value={monthTo}
              onChange={(e) => { const v = Number(e.target.value); setMonthTo(v); if (v < monthFrom) setMonthFrom(v); }}
              className="rounded-md border border-border bg-background px-2 py-1.5 font-semibold"
            >
              {ARABIC_MONTHS.map((m, i) => <option key={i} value={i}>{m}</option>)}
            </select>
          </div>
          <div className="mt-1 text-[10px] text-muted-foreground">
            المقارنة تعتمد نفس الفترة من {compareYear} لضمان عدالة المقارنة.
          </div>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          label={`المبيعات — ${selectedYear} (${rangeLabel})`}
          value={fmtEGP(cur.sales)}
          icon={<ShoppingCart className="h-5 w-5" />}
          trend={{ delta: yoyGrowth, label: `مقابل ${compareYear}` }}
          tone="primary"
        />
        <KpiCard
          label={`المقبوضات — ${selectedYear}`}
          value={fmtEGP(cur.collections)}
          icon={<Wallet className="h-5 w-5" />}
          hint={`رصيد الفترة: ${fmtEGP(cur.balance)}`}
          tone="info"
        />
        <KpiCard
          label="نسبة التحصيل"
          value={fmtPct(cur.rate)}
          icon={<Percent className="h-5 w-5" />}
          hint={`${compareYear}: ${fmtPct(prev.rate)}`}
          tone={cur.rate >= 80 ? "success" : cur.rate >= 60 ? "warning" : "destructive"}
        />
        <KpiCard
          label="متوسط أيام التحصيل (DSO)"
          value={dso > 0 ? `${dso} يوم` : "—"}
          icon={<Timer className="h-5 w-5" />}
          hint="على مدار السنة الكاملة"
          tone={dso <= 45 ? "success" : dso <= 90 ? "warning" : "destructive"}
        />
        <KpiCard label="عملاء نشطين" value={fmtInt(activeCount)} icon={<Users className="h-5 w-5" />} tone="success" />
        <KpiCard label="عملاء متعثرين" value={fmtInt(atRiskCount)} icon={<AlertTriangle className="h-5 w-5" />} tone="warning" />
        <KpiCard label="عملاء راكدين" value={fmtInt(stagnantCount)} icon={<AlertTriangle className="h-5 w-5" />} tone="destructive" />
        <KpiCard
          label={`أعلى عميل ${selectedYear}`}
          value={topCustomer ? topCustomer.c.name : "—"}
          icon={<Trophy className="h-5 w-5" />}
          hint={topCustomer ? fmtEGP(topCustomer.v) : ""}
          tone="primary"
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Section title={`المبيعات مقابل المقبوضات — ${rangeLabel} ${selectedYear}`} className="lg:col-span-2">
          <div className="h-72 w-full">
            <ResponsiveContainer>
              <ComposedChart data={monthly}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                <XAxis dataKey="label" tick={{ fontSize: 12 }} />
                <YAxis tickFormatter={(v: number) => fmtCompact(v)} tick={{ fontSize: 11 }} />
                <Tooltip
                  formatter={tooltipEGP}
                  contentStyle={{ background: "var(--color-card)", border: "1px solid var(--color-border)", borderRadius: 8 }}
                />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar name="مبيعات" dataKey="sales" fill="var(--color-primary)" radius={[6, 6, 0, 0]} />
                <Bar name="مقبوضات" dataKey="collections" fill="var(--color-status-active)" radius={[6, 6, 0, 0]} />
                <Line name="الرصيد" type="monotone" dataKey="balance" stroke="var(--color-status-atrisk)" strokeWidth={2} dot={{ r: 3 }} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </Section>

        <div className="lg:sticky lg:top-4 lg:self-start">
          <Section title="نظرة عبر السنوات">
            <div className="space-y-3">
              {totalsAllYears.map((t) => (
                <div key={t.year} className={cn("rounded-lg border p-3", t.year === selectedYear ? "border-primary bg-primary/5" : "border-border")}>
                  <div className="flex items-center justify-between">
                    <div className="text-sm font-bold">{t.year}</div>
                    <div className="text-xs text-muted-foreground">{fmtInt(t.activeCustomers)} عميل نشط</div>
                  </div>
                  <div className="mt-2 grid grid-cols-3 gap-2 text-xs">
                    <div>
                      <div className="text-muted-foreground">مبيعات</div>
                      <div className="font-semibold text-primary">{fmtCompact(t.sales)}</div>
                    </div>
                    <div>
                      <div className="text-muted-foreground">مقبوضات</div>
                      <div className="font-semibold text-status-active">{fmtCompact(t.collections)}</div>
                    </div>
                    <div>
                      <div className="text-muted-foreground">تحصيل</div>
                      <div className="font-semibold">{fmtPct(t.collectionRate)}</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </Section>
        </div>
      </div>

      <Section title={`Pareto — أعلى 15 عميل ${selectedYear} (${rangeLabel})`}>
        <div className="h-80 w-full">
          <ResponsiveContainer>
            <ComposedChart data={pareto}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
              <XAxis dataKey="rank" tick={{ fontSize: 11 }} />
              <YAxis yAxisId="left" tickFormatter={(v: number) => fmtCompact(v)} tick={{ fontSize: 11 }} />
              <YAxis yAxisId="right" orientation="right" tickFormatter={(v: number) => `${v.toFixed(0)}%`} tick={{ fontSize: 11 }} domain={[0, 100]} />
              <Tooltip
                formatter={tooltipMulti((v, name) => (name === "المبيعات" ? fmtEGP(v) : `${v.toFixed(1)}%`))}
                labelFormatter={(l) => pareto[Number(l) - 1]?.name ?? ""}
                contentStyle={{ background: "var(--color-card)", border: "1px solid var(--color-border)", borderRadius: 8 }}
              />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar yAxisId="left" name="المبيعات" dataKey="value" fill="var(--color-primary)" radius={[6, 6, 0, 0]}>
                {pareto.map((_p, i) => (
                  <Cell key={i} fill={i < 5 ? "var(--color-status-active)" : i < 10 ? "var(--color-primary)" : "var(--color-status-atrisk)"} />
                ))}
              </Bar>
              <Line yAxisId="right" name="التراكمي %" type="monotone" dataKey="cumulativePct" stroke="var(--color-status-stagnant)" strokeWidth={2} dot={{ r: 3 }} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </Section>

      <Section
        title="تنبيهات ذكية للإدارة"
        description="مرتّبة حسب الأولوية: من ساب مؤخراً (يمكن استرجاعه) إلى الأقدم"
        actions={
          <Button variant="outline" size="sm" onClick={printStagnationReport}>
            <Printer className="ms-1 h-4 w-4" /> طباعة تقرير كامل
          </Button>
        }
      >
        <AlertsList customers={customers} refYear={meta.currentYear} refMonth={Math.max(0, (meta.partialMonths[meta.currentYear] ?? 12) - 1)} />
      </Section>
    </div>
  );
}

function YearPills({ years, value, onChange }: { years: number[]; value: number; onChange: (y: number) => void }) {
  return (
    <div className="inline-flex rounded-lg border border-border bg-background p-1">
      {years.map((y) => (
        <button
          key={y}
          onClick={() => onChange(y)}
          className={cn(
            "rounded-md px-3 py-1.5 text-xs font-bold transition",
            value === y ? "bg-primary text-primary-foreground shadow" : "text-muted-foreground hover:text-foreground",
          )}
        >
          {y}
        </button>
      ))}
    </div>
  );
}

function AlertsList({ customers, refYear, refMonth }: { customers: Customer[]; refYear: number; refMonth: number }) {
  const alerts = useMemo(() => {
    const list: Array<{ severity: "high" | "med" | "low"; title: string; detail: string; code: string; gap: number }> = [];
    const stagnantOrRisk = customers
      .filter((c) => (c.statusOverall === "stagnant" || c.statusOverall === "atrisk") && c.salesAll > 0)
      .map((c) => {
        const gap = monthsSince(c.lastSale, refYear, refMonth) ?? 999;
        const severity: "high" | "med" | "low" = gap <= 6 ? "high" : gap <= 18 ? "med" : "low";
        return { c, gap, severity };
      })
      .sort((a, b) => a.gap - b.gap);

    for (const r of stagnantOrRisk.slice(0, 10)) {
      const gapText = r.gap === 999
        ? "لا يوجد سجل بيع"
        : r.gap >= 12
        ? `متوقف ${Math.floor(r.gap / 12)} سنة${r.gap % 12 ? ` و${r.gap % 12} شهر` : ""}`
        : r.gap === 0
        ? "توقف هذا الشهر"
        : `متوقف ${r.gap} شهر`;
      list.push({
        severity: r.severity,
        title: r.c.name,
        detail: `إجمالي ${fmtEGP(r.c.salesAll)} · ${gapText}`,
        code: r.c.code,
        gap: r.gap,
      });
    }
    return list;
  }, [customers, refYear, refMonth]);

  if (alerts.length === 0) return <div className="text-sm text-muted-foreground">لا توجد تنبيهات حالياً.</div>;

  const styleFor = (s: "high" | "med" | "low") =>
    s === "high"
      ? "border-status-stagnant/30 bg-status-stagnant/5 text-status-stagnant"
      : s === "med"
      ? "border-status-atrisk/30 bg-status-atrisk/5 text-status-atrisk"
      : "border-border bg-muted/40 text-muted-foreground";

  return (
    <ul className="space-y-2">
      {alerts.map((a, i) => (
        <li key={i} className={cn("flex items-start gap-3 rounded-lg border p-3 text-sm", styleFor(a.severity))}>
          <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-background text-xs font-bold">
            {i + 1}
          </div>
          <div className="flex-1">
            <div className="font-semibold text-foreground">{a.title}</div>
            <div className="text-xs text-muted-foreground">{a.detail}</div>
          </div>
          <span className="rounded-full bg-background px-2 py-0.5 text-[10px] font-bold">
            {a.severity === "high" ? "أولوية عالية" : a.severity === "med" ? "متوسطة" : "منخفضة"}
          </span>
        </li>
      ))}
    </ul>
  );
}

void BarChart;
