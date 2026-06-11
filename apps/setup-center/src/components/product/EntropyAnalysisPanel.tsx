import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { GitBranch, Info, Loader2, AlertCircle, RefreshCw, Database } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { EntropyCard } from "./EntropyCard";
import { EntropyDetailDrawer } from "./EntropyDetailDrawer";
import {
  fetchEntropyAnalysis,
  type EntropyAnalysisData,
  type EntropyType,
  type RepoStats,
} from "@/api/entropyService";
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

function buildRepoStatsRows(stats: RepoStats) {
  return [
    { label: "分支", value: stats.branch },
    { label: "最后提交", value: stats.last_commit },
    { label: "提交总数", value: (stats.total_commits ?? 0).toLocaleString() },
    { label: "Java 文件数", value: (stats.java_files_count ?? 0).toLocaleString() },
    { label: "总方法数", value: (stats.total_methods ?? 0).toLocaleString() },
    { label: "平均方法行数", value: String(stats.avg_method_lines ?? "-") },
    { label: "最大方法行数", value: String(stats.max_method_lines ?? "-") },
    { label: "平均注释比例", value: ((stats.avg_comment_ratio ?? 0) * 100).toFixed(1) + "%" },
  ];
}

interface EntropyAnalysisPanelProps {
  product: Product;
  synapseApiBase: string;
}

export function EntropyAnalysisPanel({ product, synapseApiBase }: EntropyAnalysisPanelProps) {
  const { t } = useTranslation();
  const [detailType, setDetailType] = useState<string | null>(null);

  const defaultRepoIndex = useMemo(() => {
    const mainIdx = product.repositories.findIndex((r) => r.isMain);
    return mainIdx >= 0 ? mainIdx : 0;
  }, [product.repositories]);

  const [selectedRepoIndex, setSelectedRepoIndex] = useState<number>(defaultRepoIndex);
  const selectedRepo = product.repositories[selectedRepoIndex];

  // API state
  const [analysisData, setAnalysisData] = useState<EntropyAnalysisData | null>(null);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isEmpty, setIsEmpty] = useState(false);

  const fetchData = useCallback(() => {
    console.log("[entropy] fetchData called, product:", product.name, "repo:", selectedRepo?.branch, "prodBranch:", selectedRepo?.prodBranch);
    if (!product.name || !selectedRepo) return;
    let cancelled = false;
    setLoading(true);
    setErrorMsg(null);
    setIsEmpty(false);
    void (async () => {
      try {
        const data = await fetchEntropyAnalysis(synapseApiBase, {
          prod: product.name,
          repo_branch: selectedRepo.branch,
          prod_branch: selectedRepo.prodBranch || undefined,
        });
        if (!cancelled) {
          if (!data || !data.entropy || !data.dates) {
            setIsEmpty(true);
          } else {
            setAnalysisData(data);
          }
        }
      } catch (e) {
        if (!cancelled) {
          const msg = e instanceof Error ? e.message : String(e);
          // 后端返回无数据相关错误时视为空态
          if (msg.toLowerCase().includes("no data") || msg.toLowerCase().includes("not found") || msg.includes("暂无")) {
            setIsEmpty(true);
          } else {
            setErrorMsg(msg);
          }
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [product.name, selectedRepo?.branch, selectedRepo?.prodBranch, synapseApiBase]);

  useEffect(() => {
    const cancel = fetchData();
    return cancel;
  }, [fetchData]);

  const requestParams = useMemo(() => ({
    prod: product.name,
    repo_branch: selectedRepo?.branch ?? "",
    prod_branch: selectedRepo?.prodBranch || undefined,
  }), [product.name, selectedRepo?.branch, selectedRepo?.prodBranch]);

  const hasData = analysisData != null && !isEmpty;

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

        {/* 详细信息 — 有数据时才可点击 */}
        {hasData && (
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
                    {buildRepoStatsRows(analysisData.repo_stats).map((item) => (
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
        )}
      </div>

      {/* 内容区 */}
      <div className="p-6 flex-1 flex flex-col relative">
        {/* Loading */}
        {loading && !analysisData && (
          <div className="flex-1 flex flex-col items-center justify-center gap-3">
            <Loader2 size={36} className="text-emerald-500/60 animate-spin" />
            <p className="text-sm text-muted-foreground">加载中...</p>
          </div>
        )}

        {/* Error */}
        {!loading && errorMsg && (
          <div className="flex-1 flex flex-col items-center justify-center gap-3">
            <AlertCircle size={36} className="text-red-500/60" />
            <p className="text-sm text-red-600 dark:text-red-400 max-w-md text-center">{errorMsg}</p>
            <button
              type="button"
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md border border-border hover:bg-muted transition-colors"
              onClick={() => fetchData()}
            >
              <RefreshCw size={13} />
              重试
            </button>
          </div>
        )}

        {/* Empty */}
        {!loading && !errorMsg && isEmpty && (
          <div className="flex-1 flex flex-col items-center justify-center gap-3">
            <Database size={36} className="text-muted-foreground/40" />
            <p className="text-sm text-muted-foreground">该产品暂无熵分析数据</p>
          </div>
        )}

        {/* 卡片网格 */}
        {hasData && (
          <div className="grid grid-cols-2 gap-5 overflow-y-auto custom-scrollbar">
            {CARD_CONFIG.map((c) => {
              const entropyItem = analysisData.entropy[c.key];
              const rawScore = entropyItem.score;
              const score = Math.max(0, 100 - 100 * rawScore);
              console.log("[entropy] Card", c.key, "rawScore:", rawScore, "trend length:", entropyItem.trend?.length, "dates length:", analysisData.dates?.length);
              return (
                <EntropyCard
                  key={c.key}
                  label={t(c.labelKey, c.label)}
                  rawScore={rawScore}
                  description={getDescription(c.key, score)}
                  trendData={entropyItem.trend}
                  trendDates={analysisData.dates}
                  onDetail={() => setDetailType(c.key)}
                />
              );
            })}
          </div>
        )}
      </div>

      <EntropyDetailDrawer
        open={detailType !== null}
        onClose={() => setDetailType(null)}
        entropyType={detailType as EntropyType | null}
        synapseApiBase={synapseApiBase}
        requestParams={hasData ? requestParams : null}
      />
    </div>
  );
}
