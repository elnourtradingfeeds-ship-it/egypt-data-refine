import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useCustomers, useDataStore } from "@/lib/store";
import { fmtCompact, fmtEGP, fmtInt, fmtPct } from "@/lib/format";
import { Section } from "@/components/Section";
import { KpiCard } from "@/components/KpiCard";
import { agingBuckets, monthlyAggregate, yearlyTotals } from "@/lib/analytics";
import { tooltipEGP } from "@/lib/recharts-format";
import { cn } from "@/lib/utils";
import { Wallet, TrendingDown, Percent } from "lucide-react";

export const Route = createFileRoute("/collections")({
  head: () => ({
    meta: [
      { title: "تحليل المقبوضات — منصّة المبيعات والمقبوضات" },
      { name: "description", content: "تحصيلات العملاء وأعمار الأرصدة." },
    ],
  }),
  component: CollectionsPage,
});

function CollectionsPage() {
  const customers = useCustomers();
  const meta = useDataStore((s) => s.meta);
  const [year, setYear] = useState<number>(meta.currentYear);

  const monthly = useMemo(() => monthlyAggregate(customers, year), [customers, year]);
  const totals = useMemo(() => yearlyTotals(customers, meta.years), [customers, meta.years]);
  const cur = totals.find((t) => t.year === year);
  const partialMonths = meta.partialMonths[year] ?? 12;
  const currentMonthIdx = Math.max(0, partialMonths - 1);
  const aging = useMemo(() => agingBuckets(customers, year, currentMonthIdx), [customers, year, currentMonthIdx]);
  const totalDebt = Object.values(aging).reduce((a, b) => a + b, 0);

  const topDebtors = useMemo(
    () =>
      customers
        .map((c) => ({ c, bal: c.balanceByYear[year] ?? 0 }))
        .filter((r) => r.bal > 0)
        .sort((a, b) => b.bal - a.bal)
        .slice(0, 15),
    [customers, year],
  );

  const bestPayers = useMemo(
    () =>
      customers
        .map((c) => ({ c, rate: c.collectionRateByYear[year] ?? 0, sales: c.salesByYear[year] ?? 0 }))
        .filter((r) => r.sales > 100_000)
        .sort((a, b) => b.rate - a.rate)
        .slice(0, 10),
    [customers, year],
  );

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">تحليل المقبوضات</h1>
          <p className="mt-1 text-sm text-muted-foreground">نسب التحصيل، أعمار الأرصدة، وأفضل/أسوأ الملتزمين.</p>
        </div>
        <div className="inline-flex rounded-lg border border-border bg-card p-1 shadow-sm">
          {meta.years.map((y) => (
            <button
              key={y}
              onClick={() => setYear(y)}
              className={cn(
                "rounded-md px-3 py-1.5 text-xs font-bold transition",
                year === y ? "bg-primary text-primary-foreground shadow" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {y}
            </button>
          ))}
        </div>
      </header>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard label="إجمالي المقبوضات" value={fmtEGP(cur?.collections ?? 0)} icon={<Wallet className="h-5 w-5" />} tone="info" />
        <KpiCard
          label="نسبة التحصيل"
          value={fmtPct(cur?.collectionRate ?? 0)}
          icon={<Percent className="h-5 w-5" />}
          tone={(cur?.collectionRate ?? 0) >= 80 ? "success" : (cur?.collectionRate ?? 0) >= 60 ? "warning" : "destructive"}
        />
        <KpiCard
          label="الرصيد المستحق للسنة"
          value={fmtEGP(cur?.balance ?? 0)}
          icon={<TrendingDown className="h-5 w-5" />}
          tone={(cur?.balance ?? 0) > 0 ? "destructive" : "success"}
        />
        <KpiCard label="عدد العملاء بمقبوضات" value={fmtInt(customers.filter((c) => (c.collectionsByYear[year] ?? 0) > 0).length)} tone="muted" />
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

        <Section title="أعمار الأرصدة" description="حساب تقريبي بناءً على آخر عملية بيع">
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

      <div className="grid gap-4 lg:grid-cols-2">
        <Section title={`أعلى 15 مديون في ${year}`}>
          <RankedTable
            columns={["الكود", "الاسم", "الرصيد", "التحصيل %"]}
            rows={topDebtors.map((r) => [
              r.c.code,
              r.c.name,
              fmtEGP(r.bal),
              fmtPct(r.c.collectionRateByYear[year] ?? 0),
            ])}
          />
        </Section>

        <Section title={`أفضل 10 ملتزمين في ${year}`} description="نسبة تحصيل عالية على مبيعات > 100 ألف">
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
              <th key={c} className="px-2 py-2 text-right font-semibold">
                {c}
              </th>
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
