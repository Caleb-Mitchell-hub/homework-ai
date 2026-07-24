'use client';

export interface BarItem {
  label: string;
  value: number;        // 0~1
  display: string;      // 例 "3/4 (75%)"
}

export default function ReportBarChart({ items }: { items: BarItem[] }) {
  if (items.length === 0) {
    return <div className="text-[12px] text-slate-400 italic">（无数据）</div>;
  }
  return (
    <div className="space-y-2">
      {items.map((it) => (
        <div key={it.label} className="flex items-center gap-3 text-[12px]">
          <span className="w-16 text-slate-500 flex-shrink-0">{it.label}</span>
          <div className="flex-1 h-5 bg-slate-100 rounded-full overflow-hidden relative">
            <div
              className={`h-full transition-all ${
                it.value >= 0.8
                  ? 'bg-gradient-to-r from-emerald-300 to-emerald-400'
                  : it.value >= 0.5
                  ? 'bg-gradient-to-r from-sky-300 to-sky-400'
                  : 'bg-gradient-to-r from-rose-300 to-rose-400'
              }`}
              style={{ width: `${Math.round(it.value * 100)}%` }}
            />
          </div>
          <span className="w-24 text-slate-600 text-right font-mono flex-shrink-0">
            {it.display}
          </span>
        </div>
      ))}
    </div>
  );
}