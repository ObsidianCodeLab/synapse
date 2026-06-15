// ─── SkillListPanel: 全量技能列表（搜索 + 分页 + 卡片列表） ───

import { useState, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { IconSearch, IconDownload, IconStar, IconPackage, IconLoader } from "../../icons";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { InternalSkill } from "./mockData";

const PAGE_SIZE = 12;

function SkillCard({
  skill,
  onClick,
  onInstall,
  installing,
}: {
  skill: InternalSkill;
  onClick?: () => void;
  onInstall?: (skill: InternalSkill) => void;
  installing?: boolean;
}) {
  const { t } = useTranslation();
  const tagList = skill.tags ? skill.tags.split(",").filter(Boolean) : [];

  return (
    <Card
      className="gap-0 overflow-hidden border-border/80 py-0 shadow-sm transition-all hover:shadow-md cursor-pointer"
      onClick={onClick}
    >
      <CardContent className="p-4">
        <div className="flex flex-col sm:flex-row sm:items-center gap-4">
          {/* 左侧：图标 + 信息 */}
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-purple-500/10 text-purple-600 dark:text-purple-400 flex items-center justify-center shrink-0">
              <IconPackage size={20} />
            </div>
            <div className="flex flex-col min-w-0 flex-1">
              {/* 名称行 */}
              <div className="flex items-center gap-2 flex-wrap mb-1">
                <span className="font-bold text-[15px] text-foreground">
                  {skill.name}
                </span>
                {skill.downloads > 0 && (
                  <span className="text-[11px] text-muted-foreground flex items-center gap-1">
                    <IconDownload size={10} />
                    {skill.downloads.toLocaleString()}
                  </span>
                )}
                {skill.stars > 0 && (
                  <span className="text-[11px] text-muted-foreground flex items-center gap-1">
                    <IconStar size={11} />
                    {skill.stars.toLocaleString()}
                  </span>
                )}
              </div>

              {/* 描述 */}
              <div className="text-xs text-muted-foreground line-clamp-2">
                {skill.description}
              </div>

              {/* 更新时间 */}
              {skill.fetched_At && (
                <div className="text-[11px] text-muted-foreground/60 mt-1">
                  {skill.fetched_At}
                </div>
              )}

              {/* 标签 */}
              {tagList.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {tagList.map((tag) => (
                    <Badge
                      key={tag}
                      variant="secondary"
                      className="text-[10px] px-1.5 py-0 bg-blue-500/10 text-blue-600 hover:bg-blue-500/20 dark:text-blue-400"
                    >
                      {tag}
                    </Badge>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* 右侧：下载按钮 */}
          <div className="shrink-0 ml-12 sm:ml-0">
            <Button
              size="sm"
              disabled={installing}
              className="bg-gradient-to-br from-indigo-500 to-purple-500 hover:from-indigo-600 hover:to-purple-600 text-white border-0 shadow-md shadow-indigo-500/20"
              onClick={(e) => {
                e.stopPropagation();
                onInstall?.(skill);
              }}
            >
              {installing ? (
                <>
                  <IconLoader size={12} className="animate-spin mr-1" />
                  {t("skills.installing", "安装中...")}
                </>
              ) : (
                t("skills.download", "下载")
              )}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export function SkillListPanel({
  skills,
  onSkillClick,
  onInstall,
  installingSet,
}: {
  skills: InternalSkill[];
  onSkillClick?: (skill: InternalSkill) => void;
  onInstall?: (skill: InternalSkill) => void;
  installingSet?: Set<string>;
}) {
  const { t } = useTranslation();
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);

  // 前端搜索过滤
  const filtered = useMemo(() => {
    if (!search.trim()) return skills;
    const q = search.toLowerCase();
    return skills.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        s.description.toLowerCase().includes(q)
    );
  }, [skills, search]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages - 1);
  const pageItems = filtered.slice(
    safePage * PAGE_SIZE,
    (safePage + 1) * PAGE_SIZE
  );

  // 搜索变化时重置页码
  const handleSearch = (val: string) => {
    setSearch(val);
    setPage(0);
  };

  return (
    <div className="flex flex-col gap-4">
      {/* 标题 + 搜索 */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <h3 className="text-base font-bold text-foreground">
          {t("skills.allSkills", "全部技能")}
        </h3>
        <div className="flex-1" />
        <div className="relative w-full sm:w-[600px]">
          <IconSearch
            size={14}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none"
          />
          <Input
            value={search}
            onChange={(e) => handleSearch(e.target.value)}
            placeholder={t("skills.searchInternal", "搜索技能...")}
            className="pl-9 h-9 text-sm"
          />
        </div>
      </div>

      {/* 技能列表 */}
      {pageItems.length === 0 ? (
        <Card className="border-dashed border-border/80 shadow-sm">
          <CardContent className="flex flex-col items-center justify-center py-14">
            <IconSearch size={32} className="text-muted-foreground/30 mb-3" />
            <p className="text-sm text-muted-foreground">
              {t("skills.noResults", "无匹配结果")}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="flex flex-col gap-3">
          {pageItems.map((skill) => (
            <SkillCard key={skill.id} skill={skill} onClick={() => onSkillClick?.(skill)} onInstall={onInstall} installing={installingSet?.has(skill.slug)} />
          ))}
        </div>
      )}

      {/* 分页 */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between gap-2 flex-wrap pt-2">
          <span className="text-muted-foreground text-xs">
            {t("skills.pageInfo", {
              page: safePage + 1,
              total: totalPages,
              count: filtered.length,
            }).replace("{{page}}", String(safePage + 1))
              .replace("{{total}}", String(totalPages))
              .replace("{{count}}", String(filtered.length))}
          </span>
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="sm"
              disabled={safePage <= 0}
              onClick={() => setPage((p) => p - 1)}
            >
              <ChevronLeft size={14} />
              {t("common.prev", "上一页")}
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={safePage >= totalPages - 1}
              onClick={() => setPage((p) => p + 1)}
            >
              {t("common.next", "下一页")}
              <ChevronRight size={14} />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
