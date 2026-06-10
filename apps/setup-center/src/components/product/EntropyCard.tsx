import React from "react";
import { EntropyTrendChart } from "./EntropyTrendChart";

interface EntropyCardProps {
  label: string;
  /** 真实熵值，0–1 浮点数 */
  rawScore: number;
  description: string;
  /** 近 30 天该指标的分数数组（0–100） */
  trendData: number[];
  /** 近 30 天日期标签 */
  trendDates: string[];
  onDetail?: () => void;
}

function scoreColor(score: number): string {
  if (score <= 40) return "#ef4444";
  if (score <= 70) return "#f59e0b";
  return "#10b981";
}

export function EntropyCard({
  label,
  rawScore,
  description,
  trendData,
  trendDates,
  onDetail,
}: EntropyCardProps) {
  const score = Math.max(0, 100 - 100 * rawScore);
  const display = score.toFixed(1);
  const color = scoreColor(score);

  return (
    <div className="flex flex-col rounded-xl border bg-card text-card-foreground shadow-sm overflow-hidden">
      {/* 顶部彩色指示条 */}
      <div className="h-0.5 w-full shrink-0" style={{ backgroundColor: color }} />
      <div className="flex flex-col p-5 flex-1">
        {/* 顶部：名称 + 分数 */}
        <div className="flex items-baseline justify-between shrink-0">
          <span className="text-sm font-semibold text-foreground">{label}</span>
          <span className="tabular-nums" style={{ color }}>
            <span className="text-2xl font-bold">{display}</span>
            <span className="ml-0.5 text-[10px] text-muted-foreground">分</span>
          </span>
        </div>

        {/* 迷你折线图 — 撑满剩余空间 */}
        <div className="h-[250px] w-full my-2">
          <EntropyTrendChart data={trendData} dates={trendDates} color={color} />
        </div>

        {/* 底部：描述 + 查看详情 */}
        <div className="flex items-center justify-between shrink-0">
          <p className="text-xs text-foreground/70">{description}</p>
          <button
            type="button"
            className="text-[11px] text-muted-foreground/60 hover:text-foreground transition-colors shrink-0 ml-2"
            onClick={(e) => {
              e.stopPropagation();
              onDetail?.();
            }}
          >
            查看详情 &rarr;
          </button>
        </div>
      </div>
    </div>
  );
}
