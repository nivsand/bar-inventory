"use client";
import React from "react";

export type Slice = { label: string; value: number };

const COLORS = [
  "#CE7A22", "#25794D", "#6B4A9C", "#BE4335", "#215F8C", "#9C5B15",
  "#4C9C7A", "#A66A1F", "#7C3F55", "#3F8F79", "#C2761F", "#8C826E",
];

// Dependency-free, responsive SVG pie chart with a wrapping legend.
export function PieChart({ data }: { data: Slice[] }) {
  const slices = data.filter((d) => d.value > 0);
  const total = slices.reduce((s, d) => s + d.value, 0);

  if (total <= 0) return <p className="p-4 text-gray-400 text-sm">No chartable data.</p>;

  const R = 100, C = 110; // radius, center
  let angle = -Math.PI / 2; // start at top
  const arcs = slices.map((d, i) => {
    const frac = d.value / total;
    const start = angle;
    const end = angle + frac * 2 * Math.PI;
    angle = end;
    const x1 = C + R * Math.cos(start), y1 = C + R * Math.sin(start);
    const x2 = C + R * Math.cos(end), y2 = C + R * Math.sin(end);
    const large = frac > 0.5 ? 1 : 0;
    // full-circle guard (single slice)
    const path = slices.length === 1
      ? `M ${C - R} ${C} a ${R} ${R} 0 1 0 ${R * 2} 0 a ${R} ${R} 0 1 0 ${-R * 2} 0`
      : `M ${C} ${C} L ${x1} ${y1} A ${R} ${R} 0 ${large} 1 ${x2} ${y2} Z`;
    return { path, color: COLORS[i % COLORS.length], pct: Math.round(frac * 100), label: d.label, value: d.value };
  });

  return (
    <div className="flex flex-col md:flex-row items-center gap-6 p-5">
      <svg viewBox="0 0 220 220" className="w-56 max-w-full shrink-0" role="img" aria-label="Pie chart">
        {arcs.map((a, i) => <path key={i} d={a.path} fill={a.color} stroke="#fff" strokeWidth={2} />)}
      </svg>
      <ul className="w-full grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2 text-sm">
        {arcs.map((a, i) => (
          <li key={i} className="flex items-center gap-2.5 min-w-0">
            <span className="inline-block h-2.5 w-2.5 rounded-[3px] shrink-0" style={{ background: a.color }} />
            <span className="truncate flex-1 font-medium text-gray-700">{a.label}</span>
            <span className="text-gray-500 whitespace-nowrap tabular-nums">{a.value} · {a.pct}%</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
