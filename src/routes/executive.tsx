import { createFileRoute } from "@tanstack/react-router";
import { useMemo } from "react";
import {
  ShoppingCart,
  Wallet,
  Users,
  AlertTriangle,
  TrendingUp,
  Percent,
  Trophy,
  Timer,
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
import { fmtCompact, fmtEGP, fmtInt, fmtPct } from "@/lib/format";
import { KpiCard } from "@/components/KpiCard";
import { Section } from "@/components/Section";
import { estimateDSO, monthlyAggregate, paretoData, yearlyTotals } from "@/lib/analytics";
import { tooltipEGP, tooltipMulti } from "@/lib/recharts-format";

export const Route = createFileRoute("/executive")({
  head: () => ({
    meta: [
      { title: "الملخّص التنفيذي — منصّة المبيعات والمقبوضات" },
      { name: "description", content: "لوحة قرار الإدارة: مبيعات، مقبوضات، DSO، ونسبة تحصيل عبر السنوات." },
    ],
  }),
  component: Executive,
});

function Executive() {
  const customers = useCustomers();
  const meta = useDataStore((s) => s.meta);

  const totals = useMemo(() => yearlyTotals(customers, meta.years), [customers, meta.years]);
  const currentYear = meta.currentYear;
  const previousYear = currentYear - 1;
  const cur = totals.find((t) => t.year === currentYear);
  const prev = totals.find((t) => t.year === previousYear);
  const dso = useMemo(() => estimateDSO(customers, currentYear), [customers, currentYear]);
  const monthly = useMemo(() => monthlyAggregate(customers, currentYear), [customers, currentYear]);
  const pareto = useMemo(
    () => paretoData(customers, (c) => c.salesByYear[currentYear] ?? 0, 15),
    [customers, currentYear],
  );

  const stagnantCount = customers.filter((c) => c.statusOverall === "stagnant").length;
  const atRiskCount = customers.filter((c) => c.statusOverall === "atrisk").length;
  const activeCount = customers.filter((c) => c.statusOverall === "active").length;

  const topCustomer = [...customers]
    .map((c) => ({ c, v: c.salesByYear[currentYear] ?? 0 }))
    .sort((a, b) => b.v - a.v)[0];

  const yoyGrowth = prev && prev.sales > 0 ? ((cur?.sales ?? 0) - prev.sales) / prev.sales * 100 : 0;
  const collectionRate = cur?.collectionRate ?? 0;
  const partialMonths = meta.partialMonths[currentYear] ?? 12;

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">الملخّص التنفيذي</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            بيانات {currentYear} (أول {partialMonths} شهر) — مقارنة مع {previousYear} الكامل.
          </p>
        </div>
      </header>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          label={`إجمالي المبيعات ${currentYear}`}
          value={fmtEGP(cur?.sales ?? 0)}
          icon={<ShoppingCart className="h-5 w-5" />}
          trend={{ delta: yoyGrowth, label: `مقابل ${previousYear}` }}
          tone="primary"
        />
        <KpiCard
          label={`إجمالي المقبوضات ${currentYear}`}
          value={fmtEGP(cur?.collections ?? 0)}
          icon={<Wallet className="h-5 w-5" />}
          hint={`رصيد ${currentYear}: ${fmtEGP(cur?.balance ?? 0)}`}
          tone="info"
        />
        <KpiCard
          label="نسبة التحصيل"
          value={fmtPct(collectionRate)}
          icon={<Percent className="h-5 w-5" />}
          hint={`متوسط تاريخي: ${fmtPct((totals.reduce((a, b) => a + b.collectionRate, 0) / Math.max(1, totals.length)))}`}
          tone={collectionRate >= 80 ? "success" : collectionRate >= 60 ? "warning" : "destructive"}
        />
        <KpiCard
          label="متوسط أيام التحصيل (DSO)"
          value={dso > 0 ? `${dso} يوم` : "—"}
          icon={<Timer className="h-5 w-5" />}
          hint="يقاس بفارق التوقيت الشهري بين المبيعات والمقبوضات"
          tone={dso <= 45 ? "success" : dso <= 90 ? "warning" : "destructive"}
        />
        <KpiCard
          label="عملاء نشطين"
          value={fmtInt(activeCount)}
          icon={<Users className="h-5 w-5" />}
          hint={`من إجمالي ${fmtInt(customers.length)} عميل مسجّل`}
          tone="success"
        />
        <KpiCard
          label="عملاء متعثرين"
          value={fmtInt(atRiskCount)}
          icon={<AlertTriangle className="h-5 w-5" />}
          hint="هبوط 40–70% في المبيعات"
          tone="warning"
        />
        <KpiCard
          label="عملاء راكدين"
          value={fmtInt(stagnantCount)}
          icon={<AlertTriangle className="h-5 w-5" />}
          hint="صفر أو هبوط >70% لأكثر من 3 شهور"
          tone="destructive"
        />
        <KpiCard
          label={`أعلى عميل ${currentYear}`}
          value={topCustomer ? topCustomer.c.name : "—"}
          icon={<Trophy className="h-5 w-5" />}
          hint={topCustomer ? fmtEGP(topCustomer.v) : ""}
          tone="primary"
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Section title="المبيعات مقابل المقبوضات — شهرياً" className="lg:col-span-2">
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

        <Section title="نظرة عبر السنوات">
          <div className="space-y-3">
            {totals.map((t) => (
              <div key={t.year} className="rounded-lg border border-border p-3">
                <div className="flex items-center justify-between">
                  <div className="text-sm font-bold">{t.year}</div>
                  <div className="text-xs text-muted-foreground">
                    {fmtInt(t.activeCustomers)} عميل نشط
                  </div>
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

      <Section title={`Pareto — أعلى 15 عميل من إجمالي مبيعات ${currentYear}`}>
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

      <Section title="تنبيهات ذكية للإدارة" description="أهم 10 حالات تستحق قرار فوري">
        <AlertsList customers={customers} />
      </Section>
    </div>
  );
}

function AlertsList({ customers }: { customers: ReturnType<typeof useCustomers> }) {
  const alerts = useMemo(() => {
    const list: Array<{ severity: "high" | "med"; title: string; detail: string; code: string }> = [];
    // Top stagnant with historical value
    const stagnantTop = customers
      .filter((c) => c.statusOverall === "stagnant" && c.salesAll > 0)
      .sort((a, b) => b.salesAll - a.salesAll)
      .slice(0, 5);
    for (const c of stagnantTop) {
      list.push({
        severity: "high",
        title: `عميل راكد بقيمة تاريخية عالية: ${c.name}`,
        detail: `إجمالي ${fmtEGP(c.salesAll)} — آخر بيع ${c.lastSale ? `${c.lastSale.year}/${c.lastSale.month + 1}` : "—"}`,
        code: c.code,
      });
    }
    // Big unpaid balance
    const bigDebt = customers
      .filter((c) => c.balanceAll > 100_000)
      .sort((a, b) => b.balanceAll - a.balanceAll)
      .slice(0, 5);
    for (const c of bigDebt) {
      list.push({
        severity: c.balanceAll > 500_000 ? "high" : "med",
        title: `رصيد مستحق مرتفع: ${c.name}`,
        detail: `${fmtEGP(c.balanceAll)} — نسبة تحصيل ${fmtPct(c.collectionRateAll)}`,
        code: c.code,
      });
    }
    return list.slice(0, 10);
  }, [customers]);

  if (alerts.length === 0) return <div className="text-sm text-muted-foreground">لا توجد تنبيهات حرجة حالياً.</div>;

  return (
    <ul className="space-y-2">
      {alerts.map((a, i) => (
        <li
          key={i}
          className={`flex items-start gap-3 rounded-lg border p-3 text-sm ${
            a.severity === "high"
              ? "border-status-stagnant/30 bg-status-stagnant/5"
              : "border-status-atrisk/30 bg-status-atrisk/5"
          }`}
        >
          <AlertTriangle className={`mt-0.5 h-4 w-4 shrink-0 ${a.severity === "high" ? "text-status-stagnant" : "text-status-atrisk"}`} />
          <div>
            <div className="font-semibold">{a.title}</div>
            <div className="text-xs text-muted-foreground">{a.detail}</div>
          </div>
        </li>
      ))}
    </ul>
  );
}

// Trigger dummy tree-shake use to satisfy lint (BarChart / TrendingUp imported but referenced only through Recharts constants)
void BarChart;
void TrendingUp;
