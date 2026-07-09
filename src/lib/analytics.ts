import type { Customer } from "./customer-model";
import { ARABIC_MONTHS } from "./format";

/** Sum monthly arrays element-wise. */
export function sumMonthly(arrays: number[][]): number[] {
  const out = Array<number>(12).fill(0);
  for (const a of arrays) for (let i = 0; i < 12; i++) out[i] += a[i] ?? 0;
  return out;
}

export type MonthPoint = { label: string; sales: number; collections: number; balance: number };

/** Monthly aggregate for a single year across all customers. */
export function monthlyAggregate(customers: Customer[], year: number): MonthPoint[] {
  const salesTotals = sumMonthly(customers.map((c) => c.sales[year] ?? Array(12).fill(0)));
  const colTotals = sumMonthly(customers.map((c) => c.collections[year] ?? Array(12).fill(0)));
  return ARABIC_MONTHS.map((label, i) => ({
    label,
    sales: salesTotals[i],
    collections: colTotals[i],
    balance: salesTotals[i] - colTotals[i],
  }));
}

/** Yearly totals across customers. */
export function yearlyTotals(customers: Customer[], years: number[]) {
  return years.map((year) => {
    let sales = 0,
      collections = 0,
      activeCustomers = 0;
    for (const c of customers) {
      const s = c.salesByYear[year] ?? 0;
      const col = c.collectionsByYear[year] ?? 0;
      sales += s;
      collections += col;
      if (s > 0) activeCustomers++;
    }
    return {
      year,
      sales,
      collections,
      balance: sales - collections,
      collectionRate: sales > 0 ? (collections / sales) * 100 : 0,
      activeCustomers,
    };
  });
}

/** Compute Pareto (cumulative %) for the given metric selector. */
export function paretoData(
  customers: Customer[],
  metric: (c: Customer) => number,
  top = 20,
) {
  const filtered = customers.map((c) => ({ c, v: metric(c) })).filter((x) => x.v > 0);
  filtered.sort((a, b) => b.v - a.v);
  const total = filtered.reduce((a, b) => a + b.v, 0);
  let cum = 0;
  return filtered.slice(0, top).map((item, i) => {
    cum += item.v;
    return {
      rank: i + 1,
      name: item.c.name,
      code: item.c.code,
      value: item.v,
      cumulativePct: total > 0 ? (cum / total) * 100 : 0,
    };
  });
}

/** DSO-lite estimate: rough weighted "days to collect" for the year using monthly cadence.
 *  Approach: weighted month lag of collections vs sales curve. Returns days (approx). */
export function estimateDSO(customers: Customer[], year: number): number {
  const sales = sumMonthly(customers.map((c) => c.sales[year] ?? Array(12).fill(0)));
  const cols = sumMonthly(customers.map((c) => c.collections[year] ?? Array(12).fill(0)));
  const sTotal = sales.reduce((a, b) => a + b, 0);
  const cTotal = cols.reduce((a, b) => a + b, 0);
  if (sTotal === 0 || cTotal === 0) return 0;
  const sMean = sales.reduce((acc, v, i) => acc + v * (i + 0.5), 0) / sTotal;
  const cMean = cols.reduce((acc, v, i) => acc + v * (i + 0.5), 0) / cTotal;
  const monthLag = Math.max(0, cMean - sMean);
  return Math.round(monthLag * 30);
}

/** Aging buckets: for open balances by year, approximate age of debt as (currentMonth - lastSaleMonth). */
export function agingBuckets(customers: Customer[], year: number, currentMonthIdx: number) {
  const buckets = { "0-30": 0, "31-60": 0, "61-90": 0, "90+": 0 };
  for (const c of customers) {
    const bal = c.balanceByYear[year] ?? 0;
    if (bal <= 0) continue;
    const last = c.lastSale && c.lastSale.year === year ? c.lastSale.month : currentMonthIdx;
    const monthsAgo = Math.max(0, currentMonthIdx - last);
    const days = monthsAgo * 30;
    if (days <= 30) buckets["0-30"] += bal;
    else if (days <= 60) buckets["31-60"] += bal;
    else if (days <= 90) buckets["61-90"] += bal;
    else buckets["90+"] += bal;
  }
  return buckets;
}
