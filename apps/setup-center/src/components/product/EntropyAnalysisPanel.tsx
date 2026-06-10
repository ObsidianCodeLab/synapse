import React, { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { GitBranch, Info } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { EntropyCard } from "./EntropyCard";
import { EntropyDetailDrawer } from "./EntropyDetailDrawer";
import type { Product } from "./types";

const CARD_CONFIG = [
  { key: "structural", labelKey: "workbench.products.detail.entropyStructural", label: "结构熵" },
  { key: "semantic",   labelKey: "workbench.products.detail.entropySemantic",   label: "语义熵" },
  { key: "behavioral", labelKey: "workbench.products.detail.entropyBehavioral", label: "行为熵" },
  { key: "cognitive",  labelKey: "workbench.products.detail.entropyCognitive",  label: "认知熵" },
] as const;

type EntropyKey = typeof CARD_CONFIG[number]["key"];

function getDescription(key: EntropyKey, score: number): string {
  if (score <= 40) {
    const map: Record<EntropyKey, string> = {
      structural: "分层倒置，改动易崩",
      semantic: "命名混乱，严重漂移",
      behavioral: "校验缺失，行为不可预期",
      cognitive: "单点依赖，风险极高",
    };
    return map[key];
  }
  if (score <= 70) {
    const map: Record<EntropyKey, string> = {
      structural: "局部耦合，边界模糊",
      semantic: "少量混用，可推断",
      behavioral: "部分缺失，习惯飘忽",
      cognitive: "局部单点，需交叉审阅",
    };
    return map[key];
  }
  const map: Record<EntropyKey, string> = {
    structural: "依赖清晰，分层合规",
    semantic: "命名统一，术语对齐",
    behavioral: "契约规范，行为一致",
    cognitive: "知识分散，交接成本低",
  };
  return map[key];
}

const MOCK_RAW_SCORES: Record<string, number> = {
  structural: 0.175,
  semantic:   0.93,
  behavioral: 0.242,
  cognitive:  0.276,
};

const MOCK_DATES = Array.from({ length: 30 }, (_, i) => {
  const d = new Date(Date.now() - (29 - i) * 86400000);
  return `${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
});

function mockTrend(baseRaw: number): number[] {
  const base = 100 - 100 * baseRaw;
  return Array.from({ length: 30 }, () =>
    Math.round(Math.max(0, Math.min(100, base + (Math.random() - 0.5) * 20)))
  );
}

const MOCK_TRENDS: Record<string, number[]> = {
  structural: mockTrend(0.175),
  semantic:   mockTrend(0.93),
  behavioral: mockTrend(0.242),
  cognitive:  mockTrend(0.276),
};

interface RepoStats {
  branch: string;
  lastCommit: string;
  commitCount: number;
  javaFileCount: number;
  totalMethodCount: number;
  avgMethodLines: number;
  maxMethodLines: number;
  avgCommentRatio: number; // 0~1
}

const MOCK_REPO_STATS: RepoStats = {
  branch: "main",
  lastCommit: "2026-06-09 14:32:10",
  commitCount: 1247,
  javaFileCount: 386,
  totalMethodCount: 4210,
  avgMethodLines: 34.6,
  maxMethodLines: 312,
  avgCommentRatio: 0.18,
};

interface EntropyAnalysisPanelProps {
  product: Product;
  synapseApiBase: string;
}

export function EntropyAnalysisPanel({ product, synapseApiBase: _synapseApiBase }: EntropyAnalysisPanelProps) {
  const { t } = useTranslation();
  const [detailType, setDetailType] = useState<string | null>(null);

  const defaultRepoIndex = useMemo(() => {
    const mainIdx = product.repositories.findIndex((r) => r.isMain);
    return mainIdx >= 0 ? mainIdx : 0;
  }, [product.repositories]);

  const [selectedRepoIndex, setSelectedRepoIndex] = useState<number>(defaultRepoIndex);
  const selectedRepo = product.repositories[selectedRepoIndex];

  return (
    <div className="relative flex flex-col h-full">
      {/* 科技感点阵背景 */}
      <div className="absolute inset-0 bg-[radial-gradient(theme(colors.emerald.500)_1px,transparent_1px)] [background-size:28px_28px] opacity-[0.04] pointer-events-none" />

      {/* 仓库选择器 */}
      <div className="px-6 pt-4 pb-3 flex items-center gap-3 relative">
        <div className="flex items-center gap-2 shrink-0">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500/80 animate-pulse" />
          <span className="text-sm font-medium text-muted-foreground">分析仓库:</span>
        </div>
        <Select
          value={String(selectedRepoIndex)}
          onValueChange={(val) => setSelectedRepoIndex(Number(val))}
        >
          <SelectTrigger className="w-[360px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent align="start">
            {product.repositories.map((repo, idx) => (
              <SelectItem key={repo.url || idx} value={String(idx)}>
                <div className="flex items-center gap-2 min-w-0">
                  <GitBranch size={14} className="text-muted-foreground shrink-0" />
                  <span className="font-medium truncate">{repo.branch}</span>
                  {repo.isMain && (
                    <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4 shrink-0">
                      main
                    </Badge>
                  )}
                </div>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* 详细信息 */}
        <div className="ml-auto flex items-center">
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-emerald-500/20 bg-emerald-500/5 hover:bg-emerald-500/10 hover:border-emerald-500/40 transition-all text-sm text-foreground shadow-sm"
                >
                  <Info size={15} className="text-emerald-500/80" />
                  <span>详细信息</span>
                </button>
              </TooltipTrigger>
              <TooltipContent side="left" align="start" sideOffset={6} className="z-[1250] w-[340px] p-5 !rounded-xl !border !border-border !bg-popover !text-popover-foreground !shadow-lg">
                <div className="flex items-center gap-2 mb-4">
                  <Info size={16} className="text-primary" />
                  <span className="text-sm font-bold text-popover-foreground">仓库统计</span>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  {[
                    { label: "分支", value: MOCK_REPO_STATS.branch },
                    { label: "最后提交", value: MOCK_REPO_STATS.lastCommit },
                    { label: "提交总数", value: MOCK_REPO_STATS.commitCount.toLocaleString() },
                    { label: "Java 文件数", value: MOCK_REPO_STATS.javaFileCount.toLocaleString() },
                    { label: "总方法数", value: MOCK_REPO_STATS.totalMethodCount.toLocaleString() },
                    { label: "平均方法行数", value: String(MOCK_REPO_STATS.avgMethodLines) },
                    { label: "最大方法行数", value: String(MOCK_REPO_STATS.maxMethodLines) },
                    { label: "平均注释比例", value: (MOCK_REPO_STATS.avgCommentRatio * 100).toFixed(1) + "%" },
                  ].map((item) => (
                    <div
                      key={item.label}
                      className="flex flex-col gap-1 rounded-lg border border-border/70 bg-muted/40 px-3 py-2.5"
                    >
                      <span className="text-[11px] text-muted-foreground leading-none">{item.label}</span>
                      <span className="text-[13px] font-semibold text-foreground leading-tight break-all">
                        {item.value}
                      </span>
                    </div>
                  ))}
                </div>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
      </div>

      <div className="p-6 grid grid-cols-2 gap-5 overflow-y-auto custom-scrollbar relative">
        {CARD_CONFIG.map((c) => {
          const rawScore = MOCK_RAW_SCORES[c.key];
          const score = Math.max(0, 100 - 100 * rawScore);
          return (
            <EntropyCard
              key={c.key}
              label={t(c.labelKey, c.label)}
              rawScore={rawScore}
              description={getDescription(c.key, score)}
              trendData={MOCK_TRENDS[c.key]}
              trendDates={MOCK_DATES}
              onDetail={() => setDetailType(c.key)}
            />
          );
        })}
      </div>

      <EntropyDetailDrawer
        open={detailType !== null}
        onClose={() => setDetailType(null)}
        entropyType={detailType as "structural" | "semantic" | "behavioral" | "cognitive" | null}
      />
    </div>
  );
}
