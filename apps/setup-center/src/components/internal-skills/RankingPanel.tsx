// ─── RankingPanel: 三列排行榜（下载热榜 / 星标热榜 / 最近更新） ───

import { useTranslation } from "react-i18next";
import { IconStar, IconDownload, IconClock, IconLoader } from "../../icons";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { HotColumn, InternalSkill } from "./mockData";

export function RankingPanel({
  columns,
  onSkillClick,
  onInstall,
  installingSet,
}: {
  columns: HotColumn[];
  onSkillClick?: (skill: InternalSkill) => void;
  onInstall?: (skill: InternalSkill) => void;
  installingSet?: Set<string>;
}) {
  const { t } = useTranslation();

  const isInstalling = (slug: string) => installingSet?.has(slug);

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      {columns.map((col) => (
        <div
          key={col.code}
          className="rounded-xl border border-border/80 bg-card shadow-sm overflow-hidden"
        >
          {/* 列标题 */}
          <div className="px-4 py-3 border-b border-border/50 bg-muted/30">
            <div className="flex items-center gap-2">
              {col.code === "downloads" ? (
                <IconDownload size={16} className="shrink-0 text-primary" />
              ) : col.code === "stars" ? (
                <IconStar size={16} className="shrink-0 text-amber-500" />
              ) : (
                <IconClock size={16} className="shrink-0 text-emerald-500" />
              )}
              <span className="font-semibold text-sm text-foreground">
                {col.code === "downloads"
                  ? t("skills.downloadRank", "下载热榜")
                  : col.code === "stars"
                    ? t("skills.starRank", "星标热榜")
                    : t("skills.recentRank", "最近更新")}
              </span>
            </div>
            <p className="text-[11px] text-muted-foreground mt-1">
              {col.code === "downloads"
                ? t("skills.downloadRankDesc", "按下载量排序")
                : col.code === "stars"
                  ? t("skills.starRankDesc", "按星标量排序")
                  : t("skills.recentRankDesc", "按最近抓取时间排序")}
            </p>
          </div>

          {/* 技能列表 */}
          <div className="divide-y divide-border/30">
            {col.items.map((skill, idx) => (
              <div
                key={skill.id}
                className="flex items-start gap-2 px-3 py-2.5 hover:bg-muted/20 transition-colors cursor-pointer"
                onClick={() => onSkillClick?.(skill)}
              >
                {/* 排名序号 */}
                <span
                  className={`shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-[11px] font-bold ${
                    idx < 3
                      ? "bg-orange-500 text-white"
                      : "bg-muted text-muted-foreground"
                  }`}
                >
                  {idx + 1}
                </span>

                {/* 信息 */}
                <div className="flex-1 min-w-0">
                  <div className="text-[13px] font-medium text-foreground truncate">
                    {skill.name}
                  </div>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div className="text-[11px] text-muted-foreground truncate mt-0.5 cursor-default">
                        {skill.description}
                      </div>
                    </TooltipTrigger>
                    <TooltipContent side="bottom" className="max-w-[280px] text-xs text-wrap">
                      {skill.description}
                    </TooltipContent>
                  </Tooltip>
                </div>

                {/* 下载量 / 星标量 + 下载按钮 */}
                <div className="flex flex-col items-end gap-1 shrink-0">
                  <div className="flex items-center gap-1.5">
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span className="text-[11px] text-muted-foreground flex items-center gap-0.5 cursor-default">
                          <IconDownload size={10} />
                          {skill.downloads.toLocaleString()}
                        </span>
                      </TooltipTrigger>
                      <TooltipContent side="bottom" className="text-xs">
                        {t("skills.downloadCount", "下载量")}
                      </TooltipContent>
                    </Tooltip>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span className="text-[11px] text-muted-foreground flex items-center gap-0.5 cursor-default">
                          <IconStar size={10} />
                          {skill.stars.toLocaleString()}
                        </span>
                      </TooltipTrigger>
                      <TooltipContent side="bottom" className="text-xs">
                        {t("skills.starCount", "星标量")}
                      </TooltipContent>
                    </Tooltip>
                  </div>
                  <Button
                    size="xs"
                    disabled={isInstalling(skill.slug)}
                    className="h-6 px-2 text-[10px] bg-gradient-to-br from-indigo-500 to-purple-500 hover:from-indigo-600 hover:to-purple-600 text-white border-0 shadow-sm shadow-indigo-500/20"
                    onClick={(e) => {
                      e.stopPropagation();
                      onInstall?.(skill);
                    }}
                  >
                    {isInstalling(skill.slug) ? (
                      <IconLoader size={10} className="animate-spin" />
                    ) : (
                      t("skills.download", "下载")
                    )}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
