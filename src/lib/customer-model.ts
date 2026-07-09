import type { SalesRow, CollectionRow } from "./parser";
import { nameKey as normalizeName } from "./name-key";

export type StatusKey = "active" | "atrisk" | "stagnant" | "inactive";

export const STATUS_LABEL: Record<StatusKey, string> = {
  active: "نشط",
  atrisk: "متعثر",
  stagnant: "راكد",
  inactive: "لا يوجد نشاط",
};

export type Customer = {
  code: string;
  name: string;
  nameKey: string;
  sales: Record<number, number[]>;       // year -> 12 months
  collections: Record<number, number[]>; // year -> 12 months
  salesByYear: Record<number, number>;
  collectionsByYear: Record<number, number>;
  balanceByYear: Record<number, number>; // sales - collections
  salesAll: number;
  collectionsAll: number;
  balanceAll: number;
  collectionRateByYear: Record<number, number>; // % 0-100
  collectionRateAll: number;
  statusByYear: Record<number, StatusKey>;
  statusOverall: StatusKey;
  abc: "A" | "B" | "C"; // Pareto on latest available year
  lastSale: { year: number; month: number } | null;
  lastCollection: { year: number; month: number } | null;
  trendScore: number; // -100..+100
  years: number[];
};

export type Meta = {
  years: number[];
  currentYear: number;
  partialMonths: Record<number, number>; // year -> months with actual data (12 for closed)
};

const EMPTY = () => Array<number>(12).fill(0);

function findLastNonZero(monthly: number[]): number {
  for (let i = 11; i >= 0; i--) if (monthly[i] > 0) return i;
  return -1;
}

function actualMonthsFor(year: number, monthly: number[], meta: Meta): number {
  const partial = meta.partialMonths[year];
  if (partial && partial < 12) return partial;
  // find last non-zero as actual months lower bound; else 12 for closed year
  const last = findLastNonZero(monthly);
  return year === meta.currentYear ? Math.max(last + 1, partial ?? 0) : 12;
}

/**
 * 3-tier stagnation classification per year.
 * - inactive: zero across the year (or across all recorded activity range).
 * - stagnant: >=3 consecutive zero months at end, OR last-3-month avg < 30% of historical avg.
 * - atrisk:   last-3-month avg in [30%, 60%) of historical average.
 * - active:   otherwise (default).
 */
export function classifyYear(
  monthly: number[],
  historicalMonthlyAvg: number | null,
  actualMonths: number,
): StatusKey {
  const activeSlice = monthly.slice(0, Math.max(1, actualMonths));
  const sum = activeSlice.reduce((a, b) => a + b, 0);
  if (sum === 0) return "inactive";

  // consecutive zeros ending at actualMonths-1
  let zeros = 0;
  for (let i = actualMonths - 1; i >= 0; i--) {
    if (monthly[i] === 0) zeros++;
    else break;
  }
  if (zeros >= 3) return "stagnant";

  const lastN = Math.min(3, actualMonths);
  const last3 = activeSlice.slice(Math.max(0, actualMonths - 3));
  const last3Avg = last3.reduce((a, b) => a + b, 0) / lastN;

  if (historicalMonthlyAvg && historicalMonthlyAvg > 0) {
    const ratio = last3Avg / historicalMonthlyAvg;
    if (ratio < 0.3) return "stagnant";
    if (ratio < 0.6) return "atrisk";
    if (ratio < 0.7) return "atrisk"; // still concerning
  }

  return "active";
}

function historicalAvg(prevYearsMonthly: number[][], prevActualMonths: number[]): number | null {
  const totalMonths = prevActualMonths.reduce((a, b) => a + b, 0);
  if (totalMonths === 0) return null;
  const totalSum = prevYearsMonthly.reduce(
    (s, arr, i) => s + arr.slice(0, prevActualMonths[i]).reduce((a, b) => a + b, 0),
    0,
  );
  return totalSum / totalMonths;
}

function computeTrend(monthlyByYear: Record<number, number[]>, years: number[], meta: Meta): number {
  // compare last-6-months average vs preceding 6 months average (rolling across years)
  const flat: number[] = [];
  for (const y of years) {
    const arr = monthlyByYear[y] ?? EMPTY();
    const am = actualMonthsFor(y, arr, meta);
    for (let i = 0; i < am; i++) flat.push(arr[i]);
  }
  if (flat.length < 6) return 0;
  const last = flat.slice(-6);
  const prev = flat.slice(-12, -6);
  const la = last.reduce((a, b) => a + b, 0) / Math.max(1, last.length);
  const pa = prev.reduce((a, b) => a + b, 0) / Math.max(1, prev.length);
  if (pa === 0) return la > 0 ? 100 : 0;
  const pct = ((la - pa) / pa) * 100;
  return Math.max(-100, Math.min(100, Math.round(pct)));
}

/** Build unified customer map from sales + collections rows. */
export function buildCustomers(
  sales: SalesRow[],
  collections: CollectionRow[],
  meta: Meta,
  manualLinks?: Record<string, string>, // nameKey(collection) -> customer code
): Customer[] {
  // 1) group sales by code (source of truth for identity)
  const byCode = new Map<string, Customer>();
  for (const s of sales) {
    let c = byCode.get(s.code);
    if (!c) {
      c = {
        code: s.code,
        name: s.name,
        nameKey: s.nameKey,
        sales: {},
        collections: {},
        salesByYear: {},
        collectionsByYear: {},
        balanceByYear: {},
        salesAll: 0,
        collectionsAll: 0,
        balanceAll: 0,
        collectionRateByYear: {},
        collectionRateAll: 0,
        statusByYear: {},
        statusOverall: "inactive",
        abc: "C",
        lastSale: null,
        lastCollection: null,
        trendScore: 0,
        years: [],
      };
      byCode.set(s.code, c);
    }
    c.sales[s.year] = s.monthly.slice();
    c.salesByYear[s.year] = s.total;
    c.salesAll += s.total;
    const lastM = findLastNonZero(s.monthly);
    if (lastM >= 0) {
      if (!c.lastSale || s.year > c.lastSale.year || (s.year === c.lastSale.year && lastM > c.lastSale.month)) {
        c.lastSale = { year: s.year, month: lastM };
      }
    }
  }

  // 2) build nameKey lookup on customers
  const byNameKey = new Map<string, Customer>();
  for (const c of byCode.values()) {
    if (!byNameKey.has(c.nameKey)) byNameKey.set(c.nameKey, c);
  }

  // 3) attach collections
  const unmatched: CollectionRow[] = [];
  for (const col of collections) {
    const key = normalizeName(col.name);
    let cust: Customer | undefined;

    if (manualLinks && manualLinks[key]) {
      cust = byCode.get(manualLinks[key]);
    }
    if (!cust) cust = byNameKey.get(key);
    // fallback fuzzy: contained substring
    if (!cust) {
      for (const c of byNameKey.values()) {
        if (c.nameKey && (c.nameKey.includes(key) || key.includes(c.nameKey))) {
          cust = c;
          break;
        }
      }
    }
    if (!cust) {
      unmatched.push(col);
      continue;
    }
    cust.collections[col.year] = col.monthly.slice();
    cust.collectionsByYear[col.year] = (cust.collectionsByYear[col.year] ?? 0) + col.total;
    cust.collectionsAll += col.total;
    const lastM = findLastNonZero(col.monthly);
    if (lastM >= 0) {
      if (
        !cust.lastCollection ||
        col.year > cust.lastCollection.year ||
        (col.year === cust.lastCollection.year && lastM > cust.lastCollection.month)
      ) {
        cust.lastCollection = { year: col.year, month: lastM };
      }
    }
  }

  // 4) finalize computed fields
  const customers = Array.from(byCode.values());
  for (const c of customers) {
    c.years = Array.from(new Set([...Object.keys(c.sales), ...Object.keys(c.collections)].map(Number))).sort();
    for (const y of meta.years) {
      const s = c.salesByYear[y] ?? 0;
      const col = c.collectionsByYear[y] ?? 0;
      c.balanceByYear[y] = s - col;
      c.collectionRateByYear[y] = s > 0 ? (col / s) * 100 : 0;
    }
    c.balanceAll = c.salesAll - c.collectionsAll;
    c.collectionRateAll = c.salesAll > 0 ? (c.collectionsAll / c.salesAll) * 100 : 0;

    // per-year status using previous years as history
    const sortedYears = meta.years.slice().sort();
    for (let i = 0; i < sortedYears.length; i++) {
      const y = sortedYears[i];
      const monthly = c.sales[y] ?? EMPTY();
      const am = actualMonthsFor(y, monthly, meta);
      const prevMonthly: number[][] = [];
      const prevAm: number[] = [];
      for (let j = 0; j < i; j++) {
        const py = sortedYears[j];
        prevMonthly.push(c.sales[py] ?? EMPTY());
        prevAm.push(actualMonthsFor(py, c.sales[py] ?? EMPTY(), meta));
      }
      const hist = historicalAvg(prevMonthly, prevAm);
      c.statusByYear[y] = classifyYear(monthly, hist, am);
    }

    // overall status: based on latest year with any activity
    const latestActive = [...sortedYears].reverse().find((y) => (c.salesByYear[y] ?? 0) > 0);
    if (latestActive) {
      // if last year was inactive but earlier years had activity → stagnant (churned)
      const latestYear = sortedYears[sortedYears.length - 1];
      if (latestActive !== latestYear) c.statusOverall = "stagnant";
      else c.statusOverall = c.statusByYear[latestYear];
    } else {
      c.statusOverall = "inactive";
    }

    c.trendScore = computeTrend(c.sales, sortedYears, meta);
  }

  // 5) ABC classification on latest year with sales (Pareto 80/15/5)
  const latestYear = meta.currentYear;
  const salesSorted = customers
    .map((c) => ({ c, v: c.salesByYear[latestYear] ?? 0 }))
    .filter((x) => x.v > 0)
    .sort((a, b) => b.v - a.v);
  const total = salesSorted.reduce((a, b) => a + b.v, 0);
  let cum = 0;
  for (const item of salesSorted) {
    cum += item.v;
    const pct = total > 0 ? cum / total : 0;
    item.c.abc = pct <= 0.8 ? "A" : pct <= 0.95 ? "B" : "C";
  }

  // attach unmatched to a synthetic "شركة غير مطابقة" bucket? No — keep for reconciliation UI.
  (customers as Customer[] & { __unmatched?: CollectionRow[] }).__unmatched = unmatched;
  return customers;
}

export function getUnmatched(customers: Customer[]): CollectionRow[] {
  return (customers as Customer[] & { __unmatched?: CollectionRow[] }).__unmatched ?? [];
}
