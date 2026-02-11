"use client";

import React, { useMemo, useState, useEffect } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ResponsiveContainer,
  ScatterChart,
  Scatter,
  Legend,
  ErrorBar,
} from "recharts";
import { motion } from "framer-motion";

type RowAny = Record<string, string>;
type AnalysisType = "paired" | "onesample" | "independent" | "correlation";

type NumericSummary = { n: number; mean: number; sd: number; se: number };

function mean(arr: number[]) {
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}
function varianceSample(arr: number[]) {
  const m = mean(arr);
  return arr.reduce((acc, v) => acc + (v - m) ** 2, 0) / (arr.length - 1);
}
function sd(arr: number[]) {
  return Math.sqrt(varianceSample(arr));
}
function summarize(arr: number[]): NumericSummary {
  const n = arr.length;
  const m = mean(arr);
  const s = sd(arr);
  const se = s / Math.sqrt(n);
  return { n, mean: m, sd: s, se };
}
function clamp(x: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, x));
}
function titleCase(s: string) {
  return s
    .split(/\s+/)
    .map((w) => (w.length ? w[0].toUpperCase() + w.slice(1).toLowerCase() : w))
    .join(" ");
}

// ---- Student t CDF (for p-values), no external stats dependency ----
function logGamma(z: number): number {
  // Lanczos approximation
  const p = [
    676.5203681218851,
    -1259.1392167224028,
    771.3234287776531,
    -176.6150291621406,
    12.507343278686905,
    -0.13857109526572012,
    9.984369578019572e-6,
    1.5056327351493116e-7,
  ];
  if (z < 0.5) {
    return (
      Math.log(Math.PI) -
      Math.log(Math.sin(Math.PI * z)) -
      logGamma(1 - z)
    );
  }
  z -= 1;
  let x = 0.9999999999998099;
  for (let i = 0; i < p.length; i++) x += p[i] / (z + i + 1);
  const t = z + p.length - 0.5;
  return (
    0.5 * Math.log(2 * Math.PI) +
    (z + 0.5) * Math.log(t) -
    t +
    Math.log(x)
  );
}
function betacf(a: number, b: number, x: number): number {
  const MAX_ITER = 200;
  const EPS = 3e-12;
  const FPMIN = 1e-30;

  const qab = a + b;
  const qap = a + 1;
  const qam = a - 1;

  let c = 1;
  let d = 1 - (qab * x) / qap;
  if (Math.abs(d) < FPMIN) d = FPMIN;
  d = 1 / d;
  let h = d;

  for (let m = 1; m <= MAX_ITER; m++) {
    const m2 = 2 * m;

    let aa = (m * (b - m) * x) / ((qam + m2) * (a + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < FPMIN) d = FPMIN;
    c = 1 + aa / c;
    if (Math.abs(c) < FPMIN) c = FPMIN;
    d = 1 / d;
    h *= d * c;

    aa = (-(a + m) * (qab + m) * x) / ((a + m2) * (qap + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < FPMIN) d = FPMIN;
    c = 1 + aa / c;
    if (Math.abs(c) < FPMIN) c = FPMIN;
    d = 1 / d;
    const del = d * c;
    h *= del;

    if (Math.abs(del - 1) < EPS) break;
  }
  return h;
}
function regIncompleteBeta(a: number, b: number, x: number): number {
  const xx = clamp(x, 0, 1);
  if (xx === 0) return 0;
  if (xx === 1) return 1;

  const bt =
    Math.exp(
      logGamma(a + b) -
        logGamma(a) -
        logGamma(b) +
        a * Math.log(xx) +
        b * Math.log(1 - xx)
    ) || 0;

  if (xx < (a + 1) / (a + b + 2)) return (bt * betacf(a, b, xx)) / a;
  return 1 - (bt * betacf(b, a, 1 - xx)) / b;
}
function studentTCdf(t: number, df: number): number {
  const x = df / (df + t * t);
  const a = df / 2;
  const b = 0.5;
  const ib = regIncompleteBeta(a, b, x);
  return t >= 0 ? 1 - 0.5 * ib : 0.5 * ib;
}
function pTwoSidedFromT(t: number, df: number): number {
  const cdf = studentTCdf(Math.abs(t), df);
  return clamp(2 * (1 - cdf), 0, 1);
}

// ---- Analyses ----
function pairedTTest(a: number[], b: number[]) {
  const diffs = a.map((v, i) => v - b[i]);
  const s = summarize(diffs);
  const t = s.mean / (s.sd / Math.sqrt(s.n));
  const df = s.n - 1;
  const p = pTwoSidedFromT(t, df);
  const d = s.mean / s.sd; // Cohen's dz
  return { t, df, p, d };
}
function oneSampleT(arr: number[], mu = 0) {
  const s = summarize(arr);
  const t = (s.mean - mu) / (s.sd / Math.sqrt(s.n));
  const df = s.n - 1;
  const p = pTwoSidedFromT(t, df);
  const d = (s.mean - mu) / s.sd;
  return { t, df, p, d, s };
}
function welchTTest(a: number[], b: number[]) {
  const sa = summarize(a);
  const sb = summarize(b);
  const va = sa.sd ** 2;
  const vb = sb.sd ** 2;

  const t = (sa.mean - sb.mean) / Math.sqrt(va / sa.n + vb / sb.n);

  const num = (va / sa.n + vb / sb.n) ** 2;
  const den =
    (va ** 2) / (sa.n ** 2 * (sa.n - 1)) +
    (vb ** 2) / (sb.n ** 2 * (sb.n - 1));
  const df = num / den;

  const p = pTwoSidedFromT(t, df);

  const sp = Math.sqrt(((sa.n - 1) * va + (sb.n - 1) * vb) / (sa.n + sb.n - 2));
  const d = (sa.mean - sb.mean) / sp;
  const J = 1 - 3 / (4 * (sa.n + sb.n) - 9);
  const g = d * J;

  return { t, df, p, g, sa, sb };
}
function pearsonCorrelation(x: number[], y: number[]) {
  const n = x.length;
  const mx = mean(x);
  const my = mean(y);
  let num = 0,
    dx = 0,
    dy = 0;
  for (let i = 0; i < n; i++) {
    const vx = x[i] - mx;
    const vy = y[i] - my;
    num += vx * vy;
    dx += vx * vx;
    dy += vy * vy;
  }
  const r = num / Math.sqrt(dx * dy);
  const df = n - 2;
  const t = r * Math.sqrt(df / (1 - r * r));
  const p = pTwoSidedFromT(t, df);
  return { r, t, df, p };
}

// ---- CSV parsing ----
function parseCSV(text: string): RowAny[] {
  // Assumes Excel "CSV (Comma delimited)" export (no quoted commas).
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  const raw = lines.map((l) => l.split(","));
  const headers = raw[0].map((h) => h.trim());
  return raw.slice(1).map((cells) => {
    const row: RowAny = {};
    headers.forEach((h, i) => (row[h] = (cells[i] ?? "").trim()));
    return row;
  });
}
function toNumberMaybe(v: string): number | null {
  const s = (v ?? "").trim();
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}
function uniqueNonEmpty(values: string[]) {
  const set = new Set(values.map((v) => (v ?? "").trim()).filter(Boolean));
  return Array.from(set).sort((a, b) => a.localeCompare(b));
}

export default function Page() {
  const [rows, setRows] = useState<RowAny[]>([]);
  const [err, setErr] = useState<string>("");

  const [analysis, setAnalysis] = useState<AnalysisType>("paired");

  const [pairedA, setPairedA] = useState("LVF");
  const [pairedB, setPairedB] = useState("RVF");

  const [oneVar, setOneVar] = useState("Lateralization Index");
  const [oneMu, setOneMu] = useState("0");

  const [groupOutcome, setGroupOutcome] = useState("Lateralization Index");
  const [groupVar, setGroupVar] = useState("Gender");
  const [groupA, setGroupA] = useState("");
  const [groupB, setGroupB] = useState("");

  const [corrX, setCorrX] = useState("Age");
  const [corrY, setCorrY] = useState("Lateralization Index");

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    setErr("");
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const text = String(evt.target?.result ?? "");
        const parsed = parseCSV(text);
        if (parsed.length === 0) throw new Error("No data rows found.");
        setRows(parsed);
      } catch (ex: any) {
        setRows([]);
        setErr(ex?.message ?? "Could not read CSV.");
      }
    };
    reader.readAsText(file);
  };

  const reset = () => {
    setRows([]);
    setErr("");
  };

  const columns = useMemo(() => {
    if (rows.length === 0) return [];
    const set = new Set<string>();
    rows.slice(0, 50).forEach((r) => Object.keys(r).forEach((k) => set.add(k)));
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [rows]);

  const numericColumns = useMemo(() => {
    if (rows.length === 0) return [];
    return columns.filter((c) => {
      const vals = rows.map((r) => r[c] ?? "").filter((v) => v.trim() !== "");
      if (vals.length < 5) return false;
      const numericCount = vals.map(toNumberMaybe).filter((n) => n !== null).length;
      return numericCount / vals.length >= 0.7;
    });
  }, [rows, columns]);

  const categoricalColumns = useMemo(() => {
    if (rows.length === 0) return [];
    return columns.filter((c) => {
      if (numericColumns.includes(c)) return false;
      const levels = uniqueNonEmpty(rows.map((r) => r[c] ?? ""));
      return levels.length >= 2 && levels.length <= Math.min(20, Math.floor(rows.length * 0.5));
    });
  }, [rows, columns, numericColumns]);

  const levels = useMemo(() => {
    if (!groupVar || rows.length === 0) return [];
    return uniqueNonEmpty(rows.map((r) => r[groupVar] ?? ""));
  }, [rows, groupVar]);

  useEffect(() => {
    if (levels.length >= 2) {
      if (!levels.includes(groupA)) setGroupA(levels[0]);
      if (!levels.includes(groupB)) setGroupB(levels[1] ?? levels[0]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [levels]);

  const fmt = (x: number) => (Number.isFinite(x) ? x.toFixed(2) : "NA");
  const fmtP = (p: number) => {
    if (!Number.isFinite(p)) return "NA";
    if (p < 0.001) return "< .001";
    return p.toFixed(3).replace(/^0/, "");
  };

  const output = useMemo(() => {
    if (rows.length === 0) return null;

    const getVector = (col: string) =>
      rows.map((r) => toNumberMaybe(r[col] ?? "")).filter((v): v is number => v !== null);

    const getPaired = (aCol: string, bCol: string) => {
      const a: number[] = [];
      const b: number[] = [];
      rows.forEach((r) => {
        const va = toNumberMaybe(r[aCol] ?? "");
        const vb = toNumberMaybe(r[bCol] ?? "");
        if (va !== null && vb !== null) {
          a.push(va);
          b.push(vb);
        }
      });
      return { a, b };
    };

    const getGrouped = (outcome: string, gVar: string, A: string, B: string) => {
      const a: number[] = [];
      const b: number[] = [];
      rows.forEach((r) => {
        const g = String(r[gVar] ?? "").trim();
        const v = toNumberMaybe(r[outcome] ?? "");
        if (v === null) return;
        if (g === A) a.push(v);
        if (g === B) b.push(v);
      });
      return { a, b };
    };

    try {
      if (analysis === "paired") {
        const { a, b } = getPaired(pairedA, pairedB);
        if (a.length < 3) throw new Error("Not enough paired rows.");
        const sa = summarize(a);
        const sb = summarize(b);
        const res = pairedTTest(a, b);
        const barData = [
          { name: pairedA, Mean: sa.mean, SE: sa.se },
          { name: pairedB, Mean: sb.mean, SE: sb.se },
        ];
        const apa =
          "A paired-samples t-test compared " +
          pairedA +
          " (M = " +
          fmt(sa.mean) +
          ", SD = " +
          fmt(sa.sd) +
          ") and " +
          pairedB +
          " (M = " +
          fmt(sb.mean) +
          ", SD = " +
          fmt(sb.sd) +
          "). The analysis yielded t(" +
          res.df +
          ") = " +
          res.t.toFixed(2) +
          ", p = " +
          fmtP(res.p) +
          ", d = " +
          res.d.toFixed(2) +
          ".";
        return { kind: "paired" as const, barData, apa };
      }

      if (analysis === "onesample") {
        const vec = getVector(oneVar);
        if (vec.length < 3) throw new Error("Not enough numeric rows.");
        const mu = Number(oneMu);
        if (!Number.isFinite(mu)) throw new Error("μ0 must be a number.");
        const res = oneSampleT(vec, mu);
        const apa =
          "A one-sample t-test evaluated whether " +
          oneVar +
          " differed from " +
          mu +
          ". The analysis yielded t(" +
          res.df +
          ") = " +
          res.t.toFixed(2) +
          ", p = " +
          fmtP(res.p) +
          ", d = " +
          res.d.toFixed(2) +
          ".";
        return { kind: "onesample" as const, apa };
      }

      if (analysis === "independent") {
        if (!groupVar || !groupA || !groupB || groupA === groupB)
          throw new Error("Select two different groups.");
        const { a, b } = getGrouped(groupOutcome, groupVar, groupA, groupB);
        if (a.length < 2 || b.length < 2)
          throw new Error("Each group needs at least 2 observations.");
        const res = welchTTest(a, b);
        const barData = [
          { name: groupA, Mean: res.sa.mean, SE: res.sa.se },
          { name: groupB, Mean: res.sb.mean, SE: res.sb.se },
        ];
        const apa =
          "An independent-samples t-test (Welch) compared " +
          groupOutcome +
          " between " +
          titleCase(groupA) +
          " (M = " +
          fmt(res.sa.mean) +
          ", SD = " +
          fmt(res.sa.sd) +
          ") and " +
          titleCase(groupB) +
          " (M = " +
          fmt(res.sb.mean) +
          ", SD = " +
          fmt(res.sb.sd) +
          "). The analysis yielded t(" +
          res.df.toFixed(1) +
          ") = " +
          res.t.toFixed(2) +
          ", p = " +
          fmtP(res.p) +
          ", g = " +
          res.g.toFixed(2) +
          ".";
        return { kind: "independent" as const, barData, apa };
      }

      if (analysis === "correlation") {
        const pts: { x: number; y: number }[] = [];
        rows.forEach((r) => {
          const x = toNumberMaybe(r[corrX] ?? "");
          const y = toNumberMaybe(r[corrY] ?? "");
          if (x !== null && y !== null) pts.push({ x, y });
        });
        if (pts.length < 4) throw new Error("Not enough paired rows for correlation.");
        const x = pts.map((p) => p.x);
        const y = pts.map((p) => p.y);
        const res = pearsonCorrelation(x, y);
        const apa =
          "A Pearson correlation examined the association between " +
          corrX +
          " and " +
          corrY +
          ". The correlation was r(" +
          res.df +
          ") = " +
          res.r.toFixed(2) +
          ", p = " +
          fmtP(res.p) +
          ".";
        return { kind: "correlation" as const, pts, apa };
      }

      return null;
    } catch (e: any) {
      return { kind: "error" as const, message: e?.message ?? "Error computing results." };
    }
  }, [rows, analysis, pairedA, pairedB, oneVar, oneMu, groupOutcome, groupVar, groupA, groupB, corrX, corrY]);

  if (rows.length === 0) {
    return (
      <main className="min-h-screen p-10 flex items-start justify-center bg-gray-50">
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-2xl">
          <div className="rounded-2xl bg-white shadow-lg p-8 space-y-4">
            <h1 className="text-3xl font-bold">Lateralization Lab Statistical Reporter</h1>
            <p className="text-gray-600">Upload a <b>CSV</b> exported from Excel (File → Save As → CSV).</p>
            <input type="file" accept=".csv" onChange={handleFile} />
            {err && <p className="text-red-600 text-sm">{err}</p>}
          </div>
        </motion.div>
      </main>
    );
  }

  return (
    <main className="min-h-screen p-10 bg-gray-50 flex items-start justify-center">
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-5xl space-y-6">
        <div className="rounded-2xl bg-white shadow-lg p-8 flex items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold">Lateralization Lab Statistical Reporter</h1>
            <p className="text-gray-600 mt-1">Rows loaded: {rows.length}</p>
          </div>
          <button className="px-4 py-2 border rounded-lg" onClick={reset}>
            Upload new file
          </button>
        </div>

        <div className="rounded-2xl bg-white shadow-lg p-6 space-y-5">
          <div className="flex flex-wrap gap-3 items-end">
            <div className="min-w-[220px]">
              <label className="text-sm text-gray-600">Analysis</label>
              <select className="mt-1 w-full border rounded-lg px-3 py-2" value={analysis} onChange={(e) => setAnalysis(e.target.value as AnalysisType)}>
                <option value="paired">Paired t-test</option>
                <option value="onesample">One-sample t-test</option>
                <option value="independent">Independent t-test (Welch)</option>
                <option value="correlation">Correlation (Pearson)</option>
              </select>
            </div>

            {analysis === "paired" && (
              <>
                <div className="min-w-[220px]">
                  <label className="text-sm text-gray-600">Variable A</label>
                  <select className="mt-1 w-full border rounded-lg px-3 py-2" value={pairedA} onChange={(e) => setPairedA(e.target.value)}>
                    {numericColumns.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div className="min-w-[220px]">
                  <label className="text-sm text-gray-600">Variable B</label>
                  <select className="mt-1 w-full border rounded-lg px-3 py-2" value={pairedB} onChange={(e) => setPairedB(e.target.value)}>
                    {numericColumns.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
              </>
            )}

            {analysis === "onesample" && (
              <>
                <div className="min-w-[260px]">
                  <label className="text-sm text-gray-600">Variable</label>
                  <select className="mt-1 w-full border rounded-lg px-3 py-2" value={oneVar} onChange={(e) => setOneVar(e.target.value)}>
                    {numericColumns.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div className="min-w-[160px]">
                  <label className="text-sm text-gray-600">μ0</label>
                  <input className="mt-1 w-full border rounded-lg px-3 py-2" value={oneMu} onChange={(e) => setOneMu(e.target.value)} />
                </div>
              </>
            )}

            {analysis === "independent" && (
              <>
                <div className="min-w-[260px]">
                  <label className="text-sm text-gray-600">Outcome</label>
                  <select className="mt-1 w-full border rounded-lg px-3 py-2" value={groupOutcome} onChange={(e) => setGroupOutcome(e.target.value)}>
                    {numericColumns.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div className="min-w-[240px]">
                  <label className="text-sm text-gray-600">Group variable</label>
                  <select className="mt-1 w-full border rounded-lg px-3 py-2" value={groupVar} onChange={(e) => setGroupVar(e.target.value)}>
                    {categoricalColumns.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div className="min-w-[200px]">
                  <label className="text-sm text-gray-600">Group A</label>
                  <select className="mt-1 w-full border rounded-lg px-3 py-2" value={groupA} onChange={(e) => setGroupA(e.target.value)}>
                    {levels.map((g) => <option key={g} value={g}>{g}</option>)}
                  </select>
                </div>
                <div className="min-w-[200px]">
                  <label className="text-sm text-gray-600">Group B</label>
                  <select className="mt-1 w-full border rounded-lg px-3 py-2" value={groupB} onChange={(e) => setGroupB(e.target.value)}>
                    {levels.map((g) => <option key={g} value={g}>{g}</option>)}
                  </select>
                </div>
              </>
            )}

            {analysis === "correlation" && (
              <>
                <div className="min-w-[240px]">
                  <label className="text-sm text-gray-600">X</label>
                  <select className="mt-1 w-full border rounded-lg px-3 py-2" value={corrX} onChange={(e) => setCorrX(e.target.value)}>
                    {numericColumns.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div className="min-w-[240px]">
                  <label className="text-sm text-gray-600">Y</label>
                  <select className="mt-1 w-full border rounded-lg px-3 py-2" value={corrY} onChange={(e) => setCorrY(e.target.value)}>
                    {numericColumns.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
              </>
            )}
          </div>

          <div className="border-t pt-5">
            {output?.kind === "error" && <p className="text-red-600 text-sm">{output.message}</p>}

            {output && output.kind !== "error" && (
              <div className="space-y-4">
                <div className="rounded-xl bg-gray-50 p-4">
                  <p className="text-gray-800">{output.apa}</p>
                </div>

                {(output.kind === "paired" || output.kind === "independent") && (
                  <div className="rounded-xl bg-white border p-4">
                    <h3 className="font-semibold mb-2">Plot (means ± 1 SE)</h3>
                    <ResponsiveContainer width="100%" height={280}>
                      <BarChart data={output.barData}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="name" />
                        <YAxis />
                        <Tooltip />
                        <Bar dataKey="Mean">
                          <ErrorBar dataKey="SE" width={4} />
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )}

                {output.kind === "correlation" && (
                  <div className="rounded-xl bg-white border p-4">
                    <h3 className="font-semibold mb-2">Scatter</h3>
                    <ResponsiveContainer width="100%" height={280}>
                      <ScatterChart>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis type="number" dataKey="x" name={corrX} />
                        <YAxis type="number" dataKey="y" name={corrY} />
                        <Tooltip cursor={{ strokeDasharray: "3 3" }} />
                        <Legend />
                        <Scatter name="Data" data={output.pts} />
                      </ScatterChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="text-xs text-gray-500 px-1">
          Quick recipe: Gender/handedness differences → <b>Independent t-test (Welch)</b> → Outcome: <b>Lateralization Index</b> → Group variable: <b>Gender</b> or <b>Handedness</b>.
        </div>
      </motion.div>
    </main>
  );
}
