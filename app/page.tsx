"use client";

import React, { useState } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ResponsiveContainer,
} from "recharts";
import { motion } from "framer-motion";

type Row = { LVF: number; RVF: number; LI: number };

function mean(arr: number[]) {
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}
function std(arr: number[]) {
  const m = mean(arr);
  return Math.sqrt(arr.reduce((a, b) => a + (b - m) ** 2, 0) / (arr.length - 1));
}
function pairedTTest(a: number[], b: number[]) {
  const diffs = a.map((v, i) => v - b[i]);
  const mDiff = mean(diffs);
  const sdDiff = std(diffs);
  const t = mDiff / (sdDiff / Math.sqrt(diffs.length));
  const d = mDiff / sdDiff;
  return { t, d, df: diffs.length - 1 };
}
function oneSampleT(arr: number[], mu = 0) {
  const m = mean(arr);
  const s = std(arr);
  const t = (m - mu) / (s / Math.sqrt(arr.length));
  return { t, df: arr.length - 1 };
}

function parseCSV(text: string): Row[] {
  const lines = text.split(/\r?\n/).filter(Boolean);
  const rows = lines.map((l) => l.split(","));

  const headers = rows[0].map((h) => h.trim());
  const lvfIndex = headers.indexOf("LVF");
  const rvfIndex = headers.indexOf("RVF");
  const liIndex = headers.indexOf("Lateralization Index");

  if (lvfIndex === -1 || rvfIndex === -1) {
    throw new Error('CSV must include columns named "LVF" and "RVF".');
  }
  if (liIndex === -1) {
    throw new Error('CSV must include column named "Lateralization Index".');
  }

  return rows
    .slice(1)
    .map((r) => ({
      LVF: Number(r[lvfIndex]),
      RVF: Number(r[rvfIndex]),
      LI: Number(r[liIndex]),
    }))
    .filter((d) => Number.isFinite(d.LVF) && Number.isFinite(d.RVF) && Number.isFinite(d.LI));
}

export default function Home() {
  const [data, setData] = useState<Row[]>([]);
  const [analysis, setAnalysis] = useState<"paired" | "li">("paired");
  const [err, setErr] = useState<string>("");

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    setErr("");
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const text = String(evt.target?.result ?? "");
        const cleaned = parseCSV(text);
        setData(cleaned);
      } catch (ex: any) {
        setData([]);
        setErr(ex?.message ?? "Could not read file.");
      }
    };
    reader.readAsText(file);
  };

  const reset = () => {
    setData([]);
    setErr("");
  };

  if (data.length === 0) {
    return (
      <main className="min-h-screen p-10 flex items-start justify-center bg-gray-50">
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-2xl">
          <div className="rounded-2xl bg-white shadow-lg p-8 space-y-4">
            <h1 className="text-3xl font-bold">Lateralization Lab Statistical Reporter</h1>
            <p className="text-gray-600">
              Upload a <b>CSV</b> exported from Excel that includes columns: <b>LVF</b>, <b>RVF</b>, <b>Lateralization Index</b>.
            </p>
            <input type="file" accept=".csv" onChange={handleFile} />
            {err && <p className="text-red-600 text-sm">{err}</p>}
            <p className="text-sm text-gray-500">
              Excel → File → Save As → CSV (Comma delimited)
            </p>
          </div>
        </motion.div>
      </main>
    );
  }

  const lvf = data.map((d) => d.LVF);
  const rvf = data.map((d) => d.RVF);
  const li = data.map((d) => d.LI);

  const meanLVF = mean(lvf);
  const meanRVF = mean(rvf);
  const sdLVF = std(lvf);
  const sdRVF = std(rvf);

  const paired = pairedTTest(lvf, rvf);
  const liTest = oneSampleT(li, 0);

  const barData = [
    { name: "LVF", Mean: meanLVF },
    { name: "RVF", Mean: meanRVF },
  ];

  const apaPaired = `A paired-samples t-test compared LVF (M = ${meanLVF.toFixed(2)}, SD = ${sdLVF.toFixed(
    2
  )}) and RVF (M = ${meanRVF.toFixed(2)}, SD = ${sdRVF.toFixed(2)}). The analysis yielded t(${paired.df}) = ${paired.t.toFixed(
    2
  )}, d = ${paired.d.toFixed(2)}.`;

  const apaLI = `A one-sample t-test evaluated whether the lateralization index differed from zero. The analysis yielded t(${liTest.df}) = ${liTest.t.toFixed(
    2
  )}.`;

  return (
    <main className="min-h-screen p-10 bg-gray-50 flex items-start justify-center">
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-4xl space-y-6">
        <div className="rounded-2xl bg-white shadow-lg p-8 flex items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold">Lateralization Lab Statistical Reporter</h1>
            <p className="text-gray-600 mt-1">n = {data.length}</p>
          </div>
          <button className="px-4 py-2 border rounded-lg" onClick={reset}>
            Upload new file
          </button>
        </div>

        <div className="rounded-2xl bg-white shadow-lg p-6">
          <div className="flex gap-3 flex-wrap">
            <button
              className={`px-4 py-2 border rounded-lg ${analysis === "paired" ? "bg-gray-100" : ""}`}
              onClick={() => setAnalysis("paired")}
            >
              Paired t-test (LVF vs RVF)
            </button>
            <button
              className={`px-4 py-2 border rounded-lg ${analysis === "li" ? "bg-gray-100" : ""}`}
              onClick={() => setAnalysis("li")}
            >
              One-sample t-test (LI ≠ 0)
            </button>
          </div>

          <div className="mt-5">
            {analysis === "paired" ? (
              <>
                <p className="text-gray-800">{apaPaired}</p>
                <div className="mt-6">
                  <ResponsiveContainer width="100%" height={320}>
                    <BarChart data={barData}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="name" />
                      <YAxis />
                      <Tooltip />
                      <Bar dataKey="Mean" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </>
            ) : (
              <p className="text-gray-800">{apaLI}</p>
            )}
          </div>
        </div>
      </motion.div>
    </main>
  );
}
