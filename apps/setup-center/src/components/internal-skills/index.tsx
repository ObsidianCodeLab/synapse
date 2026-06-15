// ─── InternalSkills: 内部技能主容器 ───

import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { RankingPanel } from "./RankingPanel";
import { SkillListPanel } from "./SkillListPanel";
import { InternalSkillDetail } from "./InternalSkillDetail";
import { invoke } from "../../platform";
import {
  mockOfficialHotColumns,
  mockOfficialAllSkills,
  mockSelfHotColumns,
  mockSelfAllSkills,
} from "./mockData";
import type { InternalSkill } from "./mockData";

export function InternalSkills({ venvDir }: { venvDir: string }) {
  const { t } = useTranslation();
  const [subTab, setSubTab] = useState<"official" | "self_operated">("official");
  const [selectedSkill, setSelectedSkill] = useState<InternalSkill | null>(null);
  const [installingSet, setInstallingSet] = useState<Set<string>>(new Set());
  const [installError, setInstallError] = useState<string | null>(null);

  const handleInstall = async (skill: InternalSkill) => {
    const slug = skill.slug || skill.name.toLowerCase().replace(/[^a-z0-9]+/g, "-");
    setInstallingSet((prev) => new Set(prev).add(slug));
    setInstallError(null);
    try {
      await invoke("install_internal_skill", { venvDir, slug });
    } catch (e: any) {
      setInstallError(String(e?.message ?? e));
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
      {/* 子标签：官方技能 / 自营技能 */}
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

      {/* 安装错误提示 */}
      {installError && (
        <div className="p-3 rounded-lg bg-destructive/10 text-destructive text-sm border border-destructive/30">
          {installError}
        </div>
      )}

      {/* 官方技能 */}
      {subTab === "official" && (
        <div className="flex flex-col gap-6">
          <RankingPanel
            columns={mockOfficialHotColumns}
            onSkillClick={setSelectedSkill}
            onInstall={handleInstall}
            installingSet={installingSet}
          />
          <SkillListPanel
            skills={mockOfficialAllSkills}
            onSkillClick={setSelectedSkill}
            onInstall={handleInstall}
            installingSet={installingSet}
          />
        </div>
      )}

      {/* 自营技能 */}
      {subTab === "self_operated" && (
        <div className="flex flex-col gap-6">
          <RankingPanel
            columns={mockSelfHotColumns}
            onSkillClick={setSelectedSkill}
            onInstall={handleInstall}
            installingSet={installingSet}
          />
          <SkillListPanel
            skills={mockSelfAllSkills}
            onSkillClick={setSelectedSkill}
            onInstall={handleInstall}
            installingSet={installingSet}
          />
        </div>
      )}

      {/* 详情弹窗 */}
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
