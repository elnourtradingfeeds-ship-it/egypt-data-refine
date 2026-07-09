import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { AlertTriangle, ChevronLeft, ChevronRight } from "lucide-react";
import { useCustomers, useDataStore } from "@/lib/store";
import { STATUS_LABEL, type StatusKey } from "@/lib/customer-model";
import { Section } from "@/components/Section";
import { KpiCard } from "@/components/KpiCard";
import { StatusBadge } from "@/components/StatusBadge";
import { fmtEGP, fmtInt, fmtPct } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export const Route = createFileRoute("/stagnation")({
  head: () => ({
    meta: [
      { title: "تحليل الراكدين — منصّة المبيعات والمقبوضات" },
      { name: "description", content: "تصنيف العملاء (نشط/متعثر/راكد) عبر السنوات بمعايير واضحة." },
    ],
  }),
  component: StagnationPage,
});

function StagnationPage() {
  const customers = useCustomers();
  const meta = useDataStore((s) => s.meta);
  const [statusFilter, setStatusFilter] = useState<"all" | StatusKey>("all");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const perPage = 20;

  const overall = useMemo(() => {
    const counts: Record<StatusKey, number> = { active: 0, atrisk: 0, stagnant: 0, inactive: 0 };
    const values: Record<StatusKey, number> = { active: 0, atrisk: 0, stagnant: 0, inactive: 0 };
    for (const c of customers) {
      counts[c.statusOverall]++;
      values[c.statusOverall] += c.salesAll;
    }
    return { counts, values };
  }, [customers]);

  const filtered = useMemo(
    () =>
      customers
        .filter((c) => c.salesAll > 0)
        .filter((c) => (statusFilter === "all" ? true : c.statusOverall === statusFilter))
        .filter((c) => (q ? c.name.includes(q) || c.code.includes(q) : true))
        .sort((a, b) => b.salesAll - a.salesAll),
    [customers, statusFilter, q],
  );

  const pages = Math.max(1, Math.ceil(filtered.length / perPage));
  const rows = filtered.slice((page - 1) * perPage, page * perPage);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold tracking-tight">تحليل الراكدين</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          تصنيف كل عميل بمعايير مركّبة عبر 3 مستويات، لكل سنة على حدة ولرحلة العميل ككل.
        </p>
      </header>

      <Section title="التعريف المعتمد" description="القواعد التي تُطبَّق على كل عميل لكل سنة">
        <div className="grid gap-3 md:grid-cols-3">
          <RuleCard
            status="active"
            title="🟢 نشط"
            desc="آخر شهرين فيهما مبيعات، ومتوسط آخر 3 شهور ≥ 70% من المتوسط التاريخي."
          />
          <RuleCard
            status="atrisk"
            title="🟡 متعثر"
            desc="متوسط آخر 3 شهور بين 30% و 60% من المتوسط التاريخي."
          />
          <RuleCard
            status="stagnant"
            title="🔴 راكد"
            desc="3 شهور صفر متتالية، أو هبوط >70% لأكثر من 3 شهور."
          />
        </div>
      </Section>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          label="نشطين"
          value={fmtInt(overall.counts.active)}
          hint={`قيمة ${fmtEGP(overall.values.active)}`}
          icon={<span className="text-lg">🟢</span>}
          tone="success"
        />
        <KpiCard
          label="متعثرين"
          value={fmtInt(overall.counts.atrisk)}
          hint={`قيمة ${fmtEGP(overall.values.atrisk)}`}
          icon={<span className="text-lg">🟡</span>}
          tone="warning"
        />
        <KpiCard
          label="راكدين"
          value={fmtInt(overall.counts.stagnant)}
          hint={`قيمة ${fmtEGP(overall.values.stagnant)}`}
          icon={<AlertTriangle className="h-5 w-5" />}
          tone="destructive"
        />
        <KpiCard
          label="بدون نشاط"
          value={fmtInt(overall.counts.inactive)}
          hint={`قيمة ${fmtEGP(overall.values.inactive)}`}
          tone="muted"
        />
      </div>

      <Section
        title="مصفوفة العملاء عبر السنوات"
        description="لون الحالة لكل سنة + الحالة الإجمالية"
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Input
              value={q}
              onChange={(e) => { setQ(e.target.value); setPage(1); }}
              placeholder="ابحث…"
              className="w-48"
            />
            <div className="inline-flex rounded-lg border border-border bg-card p-1">
              {(["all", "active", "atrisk", "stagnant"] as const).map((s) => (
                <button
                  key={s}
                  onClick={() => { setStatusFilter(s); setPage(1); }}
                  className={cn(
                    "rounded-md px-2.5 py-1 text-xs font-bold transition",
                    statusFilter === s ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {s === "all" ? "الكل" : STATUS_LABEL[s]}
                </button>
              ))}
            </div>
          </div>
        }
      >
        <div className="overflow-x-auto scrollbar-thin">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-muted text-xs text-muted-foreground">
              <tr>
                <th className="px-3 py-2 text-right font-semibold">#</th>
                <th className="px-3 py-2 text-right font-semibold">اسم العميل</th>
                {meta.years.map((y) => (
                  <th key={y} className="px-3 py-2 text-center font-semibold">
                    {y}
                  </th>
                ))}
                <th className="px-3 py-2 text-center font-semibold">الحالة الإجمالية</th>
                <th className="px-3 py-2 text-right font-semibold">إجمالي البيع</th>
                <th className="px-3 py-2 text-right font-semibold">التحصيل %</th>
                <th className="px-3 py-2 text-center font-semibold"></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((c, i) => (
                <tr key={c.code} className="border-t border-border hover:bg-muted/40">
                  <td className="px-3 py-2 num text-xs text-muted-foreground">{(page - 1) * perPage + i + 1}</td>
                  <td className="px-3 py-2 font-medium">
                    <div>{c.name}</div>
                    <div className="text-[10px] text-muted-foreground">{c.code}</div>
                  </td>
                  {meta.years.map((y) => (
                    <td key={y} className="px-3 py-2 text-center">
                      <StatusBadge status={c.statusByYear[y] ?? "inactive"} size="xs" />
                    </td>
                  ))}
                  <td className="px-3 py-2 text-center">
                    <StatusBadge status={c.statusOverall} size="xs" />
                  </td>
                  <td className="px-3 py-2 num">{fmtInt(c.salesAll)}</td>
                  <td className="px-3 py-2 num">{fmtPct(c.collectionRateAll)}</td>
                  <td className="px-3 py-2 text-center">
                    <Link to="/customers" search={{ code: c.code }} className="text-xs font-semibold text-primary hover:underline">
                      تفاصيل
                    </Link>
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={meta.years.length + 6} className="px-3 py-8 text-center text-sm text-muted-foreground">
                    لا نتائج
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        {pages > 1 && (
          <div className="mt-4 flex items-center justify-center gap-2">
            <Button variant="outline" size="sm" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1}>
              <ChevronRight className="h-4 w-4" /> السابق
            </Button>
            <div className="text-xs text-muted-foreground">صفحة {page} من {pages}</div>
            <Button variant="outline" size="sm" onClick={() => setPage((p) => Math.min(pages, p + 1))} disabled={page >= pages}>
              التالي <ChevronLeft className="h-4 w-4" />
            </Button>
          </div>
        )}
      </Section>
    </div>
  );
}

function RuleCard({ status, title, desc }: { status: StatusKey; title: string; desc: string }) {
  const border =
    status === "active"
      ? "border-status-active/40 bg-status-active/5"
      : status === "atrisk"
        ? "border-status-atrisk/40 bg-status-atrisk/5"
        : status === "stagnant"
          ? "border-status-stagnant/40 bg-status-stagnant/5"
          : "border-border bg-muted/40";
  return (
    <div className={cn("rounded-lg border p-4", border)}>
      <div className="font-bold">{title}</div>
      <p className="mt-1 text-xs text-muted-foreground">{desc}</p>
    </div>
  );
}
