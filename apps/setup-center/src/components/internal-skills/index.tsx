// ─── InternalSkills: 内部技能主容器 ───

import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { safeFetch } from "@/providers";
import { RankingPanel } from "./RankingPanel";
import { SkillListPanel } from "./SkillListPanel";
import { InternalSkillDetail } from "./InternalSkillDetail";
import type { HotColumn, InternalSkill } from "./mockData";

export function InternalSkills({
  apiBaseUrl,
  serviceRunning = true,
}: {
  apiBaseUrl?: string;
  serviceRunning?: boolean;
}) {
  const { t } = useTranslation();
  const [subTab, setSubTab] = useState<"official" | "self_operated">("official");
  const [selectedSkill, setSelectedSkill] = useState<InternalSkill | null>(null);
  const [installingSet, setInstallingSet] = useState<Set<string>>(new Set());
  const [installError, setInstallError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [hotColumns, setHotColumns] = useState<HotColumn[]>([]);
  const [allSkills, setAllSkills] = useState<InternalSkill[]>([]);

  const loadSkills = useCallback(async () => {
    if (!serviceRunning || !apiBaseUrl) return;
    setLoading(true);
    setLoadError(null);
    try {
      const [hotRes, allRes] = await Promise.all([
        safeFetch(
          `${apiBaseUrl}/api/internal-skills/hot?skill_type=${encodeURIComponent(subTab)}`,
          { signal: AbortSignal.timeout(120_000), cache: "no-store" },
        ),
        safeFetch(
          `${apiBaseUrl}/api/internal-skills/all?skill_type=${encodeURIComponent(subTab)}`,
          { signal: AbortSignal.timeout(120_000), cache: "no-store" },
        ),
      ]);
      const hotData = await hotRes.json();
      const allData = await allRes.json();
      if (!hotRes.ok) {
        throw new Error(hotData?.detail || hotData?.error || `HTTP ${hotRes.status}`);
      }
      if (!allRes.ok) {
        throw new Error(allData?.detail || allData?.error || `HTTP ${allRes.status}`);
      }
      setHotColumns(Array.isArray(hotData?.columns) ? hotData.columns : []);
      setAllSkills(Array.isArray(allData?.skills) ? allData.skills : []);
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      setLoadError(message);
      setHotColumns([]);
      setAllSkills([]);
    } finally {
      setLoading(false);
    }
  }, [apiBaseUrl, serviceRunning, subTab]);

  useEffect(() => {
    void loadSkills();
  }, [loadSkills]);

  const handleInstall = async (skill: InternalSkill) => {
    const slug = skill.slug || skill.name.toLowerCase().replace(/[^a-z0-9]+/g, "-");
    if (!slug) {
      setInstallError(t("skills.missingSlug", "该技能缺少 slug，无法安装"));
      return;
    }
    if (!serviceRunning || !apiBaseUrl) {
      setInstallError(t("skills.serviceUnavailable", "后端服务未就绪，无法安装技能"));
      return;
    }

    setInstallingSet((prev) => new Set(prev).add(slug));
    setInstallError(null);
    try {
      const res = await safeFetch(`${apiBaseUrl}/api/internal-skills/install`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug }),
        signal: AbortSignal.timeout(180_000),
      });
      const data = await res.json();
      if (!res.ok || data?.error) {
        throw new Error(data?.error || data?.detail || `HTTP ${res.status}`);
      }
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      setInstallError(message);
    } finally {
      setInstallingSet((prev) => {
        const next = new Set(prev);
        next.delete(slug);
        return next;
      });
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <ToggleGroup
        type="single"
        value={subTab}
        onValueChange={(v) => { if (v) setSubTab(v as "official" | "self_operated"); }}
        variant="outline"
        className="justify-start"
      >
        <ToggleGroupItem
          value="official"
          className="text-sm min-w-[5.5rem] data-[state=on]:bg-primary data-[state=on]:text-primary-foreground data-[state=on]:border-primary"
        >
          {t("skills.official", "官方技能")}
        </ToggleGroupItem>
        <ToggleGroupItem
          value="self_operated"
          className="text-sm min-w-[5.5rem] data-[state=on]:bg-primary data-[state=on]:text-primary-foreground data-[state=on]:border-primary"
        >
          {t("skills.selfOperated", "自营技能")}
        </ToggleGroupItem>
      </ToggleGroup>

      {loadError && (
        <div className="p-3 rounded-lg bg-destructive/10 text-destructive text-sm border border-destructive/30">
          {loadError}
        </div>
      )}

      {installError && (
        <div className="p-3 rounded-lg bg-destructive/10 text-destructive text-sm border border-destructive/30">
          {installError}
        </div>
      )}

      {loading ? (
        <div className="py-10 text-center text-sm text-muted-foreground">
          {t("skills.loadingInternal", "正在加载内部技能...")}
        </div>
      ) : (
        <div className="flex flex-col gap-6">
          <RankingPanel
            columns={hotColumns}
            onSkillClick={setSelectedSkill}
            onInstall={handleInstall}
            installingSet={installingSet}
          />
          <SkillListPanel
            skills={allSkills}
            onSkillClick={setSelectedSkill}
            onInstall={handleInstall}
            installingSet={installingSet}
          />
        </div>
      )}

      {selectedSkill && (
        <InternalSkillDetail
          skill={selectedSkill}
          onClose={() => setSelectedSkill(null)}
          onInstall={handleInstall}
          installing={installingSet.has(selectedSkill.slug)}
        />
      )}
    </div>
  );
}
