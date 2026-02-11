"use client";

import React, { useState } from "react";
import { motion } from "framer-motion";
import { BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, ResponsiveContainer } from "recharts";

function mean(arr) {
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

function std(arr) {
  const m = mean(arr);
  return Math.sqrt(arr.reduce((a, b) => a + Math.pow(b - m, 2), 0) / (arr.length - 1));
}

function pairedTTest(a, b) {
  const diffs = a.map((val, i) => val - b[i]);
  const mDiff = mean(diffs);
  const sdDiff = std(diffs);
  const t = mDiff / (sdDiff / Math.sqrt(diffs.length));
  const d = mDiff / sdDiff;
  return { t: t, d: d, df: diffs.length - 1 };
}

function oneSampleT(arr, mu) {
  const m = mean(arr);
  const s = std(arr);
  const t = (m - mu) / (s / Math.sqrt(arr.length));
  return { t: t, df: arr.length - 1 };
}

function parseCSV(text) {
  const lines = text.split(/
?
/).filter(l => l.trim().length > 0);
  const rows = lines.map(l => l.split(","));
  const headers = rows[0].map(h => h.trim());

  const lvfIndex = headers.indexOf("LVF");
  const rvfIndex = headers.indexOf("RVF");
  const liIndex = headers.indexOf("Lateralization Index");

  if (lvfIndex === -1 || rvfIndex === -1 || liIndex === -1) {
    throw new Error("CSV must contain LVF, RVF, and Lateralization Index columns.");
  }

  return rows.slice(1).map(row => ({
    LVF: Number(row[lvfIndex]),
    RVF: Number(row[rvfIndex]),
    LI: Number(row[liIndex])
  })).filter(d => !isNaN(d.LVF) && !isNaN(d.RVF) && !isNaN(d.LI));
}

export default function LateralizationWidget() {
  const [data, setData] = useState(null);
  const [analysis, setAnalysis] = useState("paired");
  const [error, setError] = useState("");

  const handleFile = (e) => {
    setError("");
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const text = String(evt.target.result || "");
        const cleaned = parseCSV(text);
        setData(cleaned);
      } catch (err) {
        setData(null);
        setError(err.message);
      }
    };
    reader.readAsText(file);
  };

  if (!data) {
    return (
      <div className="p-10">
        <div className="p-6 rounded-2xl shadow-lg bg-white max-w-xl mx-auto">
          <h1 className="text-2xl font-bold mb-4">Lateralization Lab Statistical Reporter</h1>
          <p className="text-sm text-gray-600 mb-3">
            Upload a CSV file exported from Excel (File → Save As → CSV).
          </p>
          <input type="file" accept=".csv" onChange={handleFile} />
          {error && <p className="text-red-600 text-sm mt-2">{error}</p>}
        </div>
      </div>
    );
  }

  const lvf = data.map(d => d.LVF);
  const rvf = data.map(d => d.RVF);
  const li = data.map(d => d.LI);

  const meanLVF = mean(lvf);
  const meanRVF = mean(rvf);
  const sdLVF = std(lvf);
  const sdRVF = std(rvf);

  const paired = pairedTTest(lvf, rvf);
  const liTest = oneSampleT(li, 0);

  const barData = [
    { name: "LVF", Mean: meanLVF },
    { name: "RVF", Mean: meanRVF }
  ];

  const apaPaired =
    "A paired-samples t-test compared LVF (M = " + meanLVF.toFixed(2) +
    ", SD = " + sdLVF.toFixed(2) +
    ") and RVF (M = " + meanRVF.toFixed(2) +
    ", SD = " + sdRVF.toFixed(2) +
    "). The analysis yielded t(" + paired.df +
    ") = " + paired.t.toFixed(2) +
    ", d = " + paired.d.toFixed(2) + ".";

  const apaLI =
    "A one-sample t-test evaluated whether the lateralization index differed from zero. The analysis yielded t(" +
    liTest.df + ") = " + liTest.t.toFixed(2) + ".";

  return (
    <div className="p-10 grid gap-6">
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
        <div className="p-6 rounded-2xl shadow-lg bg-white">
          <h2 className="text-xl font-semibold mb-4">Select Analysis</h2>
          <select
            className="border rounded px-3 py-2"
            value={analysis}
            onChange={(e) => setAnalysis(e.target.value)}
          >
            <option value="paired">Paired t-test (LVF vs RVF)</option>
            <option value="li">One-sample t-test (LI ≠ 0)</option>
          </select>
        </div>
      </motion.div>

      {analysis === "paired" && (
        <div className="p-6 rounded-2xl shadow-lg bg-white">
          <h2 className="text-xl font-semibold mb-4">Results</h2>
          <p className="mb-4">{apaPaired}</p>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={barData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" />
              <YAxis />
              <Tooltip />
              <Bar dataKey="Mean" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {analysis === "li" && (
        <div className="p-6 rounded-2xl shadow-lg bg-white">
          <h2 className="text-xl font-semibold mb-4">Results</h2>
          <p>{apaLI}</p>
        </div>
      )}
    </div>
  );
}
