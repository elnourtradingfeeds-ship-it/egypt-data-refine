import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Line,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useCustomers, useDataStore } from "@/lib/store";
import { fmtCompact, fmtEGP, fmtInt, fmtPct, ARABIC_MONTHS } from "@/lib/format";
import { Section } from "@/components/Section";
import { KpiCard } from "@/components/KpiCard";
import { agingBuckets, monthlyAggregate, paretoData, yearlyTotals } from "@/lib/analytics";
import { tooltipEGP, tooltipMulti } from "@/lib/recharts-format";
import { cn } from "@/lib/utils";
import { Wallet, TrendingDown, Percent, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { printHtml, escapeHtml } from "@/lib/print";

export const Route = createFileRoute("/collections")({
  head: () => ({
    meta: [
      { title: "تحليل المقبوضات — منصّة المبيعات والمقبوضات" },
      { name: "description", content: "تحصيلات العملاء وأعمار الأرصدة." },
    ],
  }),
  component: CollectionsPage,
});

type YearSel = "all" | number;

function CollectionsPage() {
  const customers = useCustomers();
  const meta = useDataStore((s) => s.meta);
  const [year, setYear] = useState<YearSel>(meta.currentYear);

  const totals = useMemo(() => yearlyTotals(customers, meta.years), [customers, meta.years]);
  const monthly = useMemo(() => {
    if (year === "all") {
      return ARABIC_MONTHS.map((label, i) => {
        let sales = 0, collections = 0;
        for (const y of meta.years) for (const c of customers) {
          sales += c.sales[y]?.[i] ?? 0;
          collections += c.collections[y]?.[i] ?? 0;
        }
        return { label, sales, collections, balance: sales - collections };
      });
    }
    return monthlyAggregate(customers, year);
  }, [customers, meta.years, year]);

  const cur = year === "all"
    ? {
        sales: customers.reduce((a, c) => a + c.salesAll, 0),
        collections: customers.reduce((a, c) => a + c.collectionsAll, 0),
        balance: customers.reduce((a, c) => a + c.balanceAll, 0),
        collectionRate: (() => {
          const s = customers.reduce((a, c) => a + c.salesAll, 0);
          const co = customers.reduce((a, c) => a + c.collectionsAll, 0);
          return s > 0 ? (co / s) * 100 : 0;
        })(),
      }
    : totals.find((t) => t.year === year) ?? { sales: 0, collections: 0, balance: 0, collectionRate: 0 };

  const partialMonths = year === "all" ? 12 : meta.partialMonths[year] ?? 12;
  const currentMonthIdx = Math.max(0, partialMonths - 1);
  const aging = useMemo(() => {
    if (year === "all") {
      const combined = { "0-30": 0, "31-60": 0, "61-90": 0, "90+": 0 };
      for (const y of meta.years) {
        const cmi = Math.max(0, (meta.partialMonths[y] ?? 12) - 1);
        const b = agingBuckets(customers, y, cmi);
        combined["0-30"] += b["0-30"]; combined["31-60"] += b["31-60"];
        combined["61-90"] += b["61-90"]; combined["90+"] += b["90+"];
      }
      return combined;
    }
    return agingBuckets(customers, year, currentMonthIdx);
  }, [customers, year, currentMonthIdx, meta.years, meta.partialMonths]);
  const totalDebt = Object.values(aging).reduce((a, b) => a + b, 0);

  const balFor = (c: (typeof customers)[number]) =>
    year === "all" ? c.balanceAll : (c.balanceByYear[year as number] ?? 0);
  const colFor = (c: (typeof customers)[number]) =>
    year === "all" ? c.collectionsAll : (c.collectionsByYear[year as number] ?? 0);
  const rateFor = (c: (typeof customers)[number]) =>
    year === "all" ? c.collectionRateAll : (c.collectionRateByYear[year as number] ?? 0);
  const salesFor = (c: (typeof customers)[number]) =>
    year === "all" ? c.salesAll : (c.salesByYear[year as number] ?? 0);

  const topDebtors = useMemo(
    () =>
      customers
        .map((c) => ({ c, bal: balFor(c) }))
        .filter((r) => r.bal > 0)
        .sort((a, b) => b.bal - a.bal)
        .slice(0, 15),
    [customers, year], // eslint-disable-line react-hooks/exhaustive-deps
  );

  const bestPayers = useMemo(
    () =>
      customers
        .map((c) => ({ c, rate: rateFor(c), sales: salesFor(c) }))
        .filter((r) => r.sales > 100_000)
        .sort((a, b) => b.rate - a.rate)
        .slice(0, 10),
    [customers, year], // eslint-disable-line react-hooks/exhaustive-deps
  );

  // Pareto on collections
  const paretoCollections = useMemo(
    () => paretoData(customers, (c) => colFor(c), 15),
    [customers, year], // eslint-disable-line react-hooks/exhaustive-deps
  );

  // 70% of debt customers
  const debt70 = useMemo(() => {
    const rows = customers
      .map((c) => ({ c, bal: balFor(c) }))
      .filter((r) => r.bal > 0)
      .sort((a, b) => b.bal - a.bal);
    const total = rows.reduce((a, b) => a + b.bal, 0);
    const target = total * 0.7;
    let cum = 0;
    const picked: Array<{ c: (typeof customers)[number]; bal: number; cumPct: number }> = [];
    for (const r of rows) {
      cum += r.bal;
      picked.push({ c: r.c, bal: r.bal, cumPct: total > 0 ? (cum / total) * 100 : 0 });
      if (cum >= target) break;
    }
    return { rows: picked, total, target, count: picked.length };
  }, [customers, year]); // eslint-disable-line react-hooks/exhaustive-deps

  const label = year === "all" ? "كل السنوات" : String(year);

  function printPage() {
    const debtRows = debt70.rows
      .map(
        (r, i) => `<tr>
          <td class="num">${i + 1}</td>
          <td>${escapeHtml(r.c.name)}<div class="muted">${escapeHtml(r.c.code)}</div></td>
          <td class="num">${fmtInt(r.bal)}</td>
          <td class="num">${r.cumPct.toFixed(1)}%</td>
          <td class="num">${fmtPct(rateFor(r.c))}</td>
        </tr>`,
      )
      .join("");
    const debtorRows = topDebtors
      .map(
        (r, i) => `<tr>
          <td class="num">${i + 1}</td>
          <td>${escapeHtml(r.c.name)}<div class="muted">${escapeHtml(r.c.code)}</div></td>
          <td class="num">${fmtInt(r.bal)}</td>
          <td class="num">${fmtPct(rateFor(r.c))}</td>
        </tr>`,
      )
      .join("");
    const paretoRows = paretoCollections
      .map(
        (r) => `<tr>
          <td class="num">${r.rank}</td>
          <td>${escapeHtml(r.name)}</td>
          <td class="num">${fmtInt(r.value)}</td>
          <td class="num">${r.cumulativePct.toFixed(1)}%</td>
        </tr>`,
      )
      .join("");
    const html = `
      <div class="header">
        <div>
          <div class="brand">تقرير المقبوضات — ${label}</div>
          <div class="muted">إجمالي المقبوضات: ${fmtInt(cur.collections)} ج.م · نسبة التحصيل: ${fmtPct(cur.collectionRate)}</div>
        </div>
        <div class="muted">${new Date().toLocaleDateString("ar-EG")}</div>
      </div>
      <h2>العملاء الذين يشكّلون 70% من المديونية (${debt70.count} عميل من إجمالي ${fmtInt(debt70.total)} ج.م)</h2>
      <table><thead><tr><th>#</th><th>العميل</th><th>الرصيد المستحق</th><th>التراكمي %</th><th>التحصيل %</th></tr></thead><tbody>${debtRows}</tbody></table>
      <h2>Pareto — أعلى 15 عميل بالمقبوضات</h2>
      <table><thead><tr><th>#</th><th>العميل</th><th>المقبوضات</th><th>التراكمي %</th></tr></thead><tbody>${paretoRows}</tbody></table>
      <h2>أعلى المديونين</h2>
      <table><thead><tr><th>#</th><th>العميل</th><th>الرصيد</th><th>التحصيل %</th></tr></thead><tbody>${debtorRows}</tbody></table>
    `;
    printHtml(`تقرير المقبوضات — ${label}`, html, { orientation: "landscape" });
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">تحليل المقبوضات</h1>
          <p className="mt-1 text-sm text-muted-foreground">نسب التحصيل، أعمار الأرصدة، تركّز الإيرادات، والمديونية.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex rounded-lg border border-border bg-card p-1 shadow-sm">
            {(["all", ...meta.years] as YearSel[]).map((y) => (
              <button
                key={String(y)}
                onClick={() => setYear(y)}
                className={cn(
                  "rounded-md px-3 py-1.5 text-xs font-bold transition",
                  year === y ? "bg-primary text-primary-foreground shadow" : "text-muted-foreground hover:text-foreground",
                )}
              >
                {y === "all" ? "كل السنوات" : y}
              </button>
            ))}
          </div>
          <Button variant="outline" size="sm" onClick={printPage}>
            <Printer className="ms-1 h-4 w-4" /> طباعة
          </Button>
        </div>
      </header>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard label="إجمالي المقبوضات" value={fmtEGP(cur.collections)} icon={<Wallet className="h-5 w-5" />} tone="info" />
        <KpiCard
          label="نسبة التحصيل"
          value={fmtPct(cur.collectionRate)}
          icon={<Percent className="h-5 w-5" />}
          tone={cur.collectionRate >= 80 ? "success" : cur.collectionRate >= 60 ? "warning" : "destructive"}
        />
        <KpiCard
          label="الرصيد المستحق"
          value={fmtEGP(cur.balance)}
          icon={<TrendingDown className="h-5 w-5" />}
          tone={cur.balance > 0 ? "destructive" : "success"}
        />
        <KpiCard
          label="عدد العملاء بمقبوضات"
          value={fmtInt(customers.filter((c) => colFor(c) > 0).length)}
          tone="muted"
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Section title="المقبوضات شهرياً" className="lg:col-span-2">
          <div className="h-72 w-full">
            <ResponsiveContainer>
              <BarChart data={monthly}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                <XAxis dataKey="label" tick={{ fontSize: 12 }} />
                <YAxis tickFormatter={(v: number) => fmtCompact(v)} tick={{ fontSize: 11 }} />
                <Tooltip
                  formatter={tooltipEGP}
                  contentStyle={{ background: "var(--color-card)", border: "1px solid var(--color-border)", borderRadius: 8 }}
                />
                <Bar dataKey="collections" name="مقبوضات" fill="var(--color-status-active)" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Section>

        <Section title="أعمار الأرصدة" description="تقريبي بناءً على آخر عملية بيع">
          <div className="space-y-3">
            {Object.entries(aging).map(([bucket, val]) => {
              const pct = totalDebt > 0 ? (val / totalDebt) * 100 : 0;
              const color =
                bucket === "0-30"
                  ? "var(--color-status-active)"
                  : bucket === "31-60"
                    ? "var(--color-info)"
                    : bucket === "61-90"
                      ? "var(--color-status-atrisk)"
                      : "var(--color-status-stagnant)";
              return (
                <div key={bucket}>
                  <div className="mb-1 flex items-center justify-between text-xs">
                    <span className="font-semibold">{bucket} يوم</span>
                    <span className="text-muted-foreground">
                      {fmtEGP(val)} ({fmtPct(pct)})
                    </span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-muted">
                    <div className="h-full" style={{ width: `${pct}%`, background: color }} />
                  </div>
                </div>
              );
            })}
            <div className="mt-3 border-t border-border pt-3 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">إجمالي الرصيد المدين</span>
                <span className="font-bold">{fmtEGP(totalDebt)}</span>
              </div>
            </div>
          </div>
        </Section>
      </div>

      <Section title={`تحليل باريتو — تمركز المقبوضات (80/20) · ${label}`}>
        <div className="h-80 w-full">
          <ResponsiveContainer>
            <ComposedChart data={paretoCollections}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
              <XAxis dataKey="rank" tick={{ fontSize: 11 }} />
              <YAxis yAxisId="left" tickFormatter={(v: number) => fmtCompact(v)} tick={{ fontSize: 11 }} />
              <YAxis yAxisId="right" orientation="right" tickFormatter={(v: number) => `${v.toFixed(0)}%`} tick={{ fontSize: 11 }} domain={[0, 100]} />
              <Tooltip
                formatter={tooltipMulti((v, name) => (name === "المقبوضات" ? fmtEGP(v) : `${v.toFixed(1)}%`))}
                labelFormatter={(l) => paretoCollections[Number(l) - 1]?.name ?? ""}
                contentStyle={{ background: "var(--color-card)", border: "1px solid var(--color-border)", borderRadius: 8 }}
              />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar yAxisId="left" name="المقبوضات" dataKey="value" fill="var(--color-status-active)" radius={[6, 6, 0, 0]}>
                {paretoCollections.map((_p, i) => (
                  <Cell key={i} fill={i < 5 ? "var(--color-status-active)" : i < 10 ? "var(--color-info)" : "var(--color-primary)"} />
                ))}
              </Bar>
              <Line yAxisId="right" name="التراكمي %" type="monotone" dataKey="cumulativePct" stroke="var(--color-status-stagnant)" strokeWidth={2} dot={{ r: 3 }} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </Section>

      <Section
        title={`العملاء الذين يشكّلون 70% من المديونية · ${label}`}
        description={`${fmtInt(debt70.count)} عميل يمثّلون ${fmtEGP(debt70.rows.reduce((a, b) => a + b.bal, 0))} من إجمالي ${fmtEGP(debt70.total)}`}
      >
        <div className="overflow-x-auto scrollbar-thin">
          <table className="w-full text-sm">
            <thead className="border-b border-border text-xs text-muted-foreground">
              <tr>
                <th className="px-2 py-2 text-right font-semibold">#</th>
                <th className="px-2 py-2 text-right font-semibold">الكود</th>
                <th className="px-2 py-2 text-right font-semibold">اسم العميل</th>
                <th className="px-2 py-2 text-right font-semibold">الرصيد</th>
                <th className="px-2 py-2 text-right font-semibold">التراكمي %</th>
                <th className="px-2 py-2 text-right font-semibold">التحصيل %</th>
              </tr>
            </thead>
            <tbody>
              {debt70.rows.map((r, i) => (
                <tr key={r.c.code} className="border-b border-border/50 hover:bg-muted/40">
                  <td className="px-2 py-2 num text-xs text-muted-foreground">{i + 1}</td>
                  <td className="px-2 py-2 num text-xs text-muted-foreground">{r.c.code}</td>
                  <td className="px-2 py-2 font-medium">{r.c.name}</td>
                  <td className="px-2 py-2 num font-semibold text-status-stagnant">{fmtInt(r.bal)}</td>
                  <td className="px-2 py-2 num">{r.cumPct.toFixed(1)}%</td>
                  <td className="px-2 py-2 num">{fmtPct(rateFor(r.c))}</td>
                </tr>
              ))}
              {debt70.rows.length === 0 && (
                <tr><td colSpan={6} className="px-3 py-8 text-center text-sm text-muted-foreground">لا توجد مديونية</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Section>

      <div className="grid gap-4 lg:grid-cols-2">
        <Section title={`أعلى 15 مديون · ${label}`}>
          <RankedTable
            columns={["الكود", "الاسم", "الرصيد", "التحصيل %"]}
            rows={topDebtors.map((r) => [r.c.code, r.c.name, fmtEGP(r.bal), fmtPct(rateFor(r.c))])}
          />
        </Section>

        <Section title={`أفضل 10 ملتزمين · ${label}`} description="نسبة تحصيل عالية على مبيعات > 100 ألف">
          <RankedTable
            columns={["الكود", "الاسم", "المبيعات", "التحصيل %"]}
            rows={bestPayers.map((r) => [r.c.code, r.c.name, fmtEGP(r.sales), fmtPct(r.rate)])}
          />
        </Section>
      </div>
    </div>
  );
}

function RankedTable({ columns, rows }: { columns: string[]; rows: (string | number)[][] }) {
  if (rows.length === 0) return <div className="py-6 text-center text-sm text-muted-foreground">لا توجد بيانات</div>;
  return (
    <div className="overflow-x-auto scrollbar-thin">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border text-xs text-muted-foreground">
            <th className="px-2 py-2 text-right font-semibold">#</th>
            {columns.map((c) => (
              <th key={c} className="px-2 py-2 text-right font-semibold">{c}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-b border-border/50 hover:bg-muted/40">
              <td className="px-2 py-2 num text-xs text-muted-foreground">{i + 1}</td>
              {r.map((cell, j) => (
                <td key={j} className={cn("px-2 py-2", j === 1 ? "font-medium" : "num")}>
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
