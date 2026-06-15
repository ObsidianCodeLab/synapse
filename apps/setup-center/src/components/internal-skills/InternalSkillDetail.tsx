// ─── InternalSkillDetail: 内部技能详情弹窗 ───

import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { ModalOverlay } from "../ModalOverlay";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { IconX, IconDownload, IconStar, IconPackage, IconLoader } from "../../icons";
import type { InternalSkill } from "./mockData";

export function InternalSkillDetail({
  skill,
  onClose,
  onInstall,
  installing,
}: {
  skill: InternalSkill;
  onClose: () => void;
  onInstall?: (skill: InternalSkill) => void;
  installing?: boolean;
}) {
  const { t } = useTranslation();
  const tagList = skill.tags ? skill.tags.split(",").filter(Boolean) : [];

  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleEsc);
    return () => window.removeEventListener("keydown", handleEsc);
  }, [onClose]);

  const typeLabel = skill.skill_type === "official"
    ? t("skills.official", "官方技能")
    : t("skills.selfOperated", "自营技能");

  return (
    <ModalOverlay onClose={onClose}>
      <div
        className="modalContent"
        style={{
          maxWidth: 640,
          width: "90vw",
          maxHeight: "85vh",
          display: "flex",
          flexDirection: "column",
          padding: 0,
        }}
      >
        {/* Header */}
        <div style={{ padding: "18px 24px 14px", borderBottom: "1px solid var(--line)", flexShrink: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div
              style={{
                width: 32,
                height: 32,
                borderRadius: 8,
                background: skill.skill_type === "official"
                  ? "rgba(37,99,235,0.1)"
                  : "rgba(124,58,237,0.1)",
                display: "grid",
                placeItems: "center",
                flexShrink: 0,
              }}
            >
              <IconPackage size={16} />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 800, fontSize: 15 }}>{skill.name}</div>
              <div style={{ fontSize: 12, opacity: 0.6, marginTop: 2 }}>
                {skill.description}
              </div>
            </div>
            <Button
              size="xs"
              disabled={installing}
              className="h-7 px-3 text-xs bg-gradient-to-br from-indigo-500 to-purple-500 hover:from-indigo-600 hover:to-purple-600 text-white border-0 shadow-sm"
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
                <>
                  <IconDownload size={12} className="mr-1" />
                  {t("skills.install", "安装")}
                </>
              )}
            </Button>
            <Button variant="ghost" size="icon-xs" onClick={onClose}>
              <IconX size={18} />
            </Button>
          </div>

          {/* Meta info row */}
          <div style={{ display: "flex", gap: 16, marginTop: 12, fontSize: 12, opacity: 0.6, flexWrap: "wrap" }}>
            <span>
              <b>{t("skills.skillType", "技能类型")}:</b> {typeLabel}
            </span>
            <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <IconDownload size={12} />
              <b>{t("skills.downloadCount", "下载量")}:</b> {skill.downloads.toLocaleString()}
            </span>
            <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <IconStar size={12} />
              <b>{t("skills.starCount", "星标量")}:</b> {skill.stars.toLocaleString()}
            </span>
          </div>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflow: "auto", padding: "16px 24px" }}>
          {/* Tags */}
          {tagList.length > 0 && (
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 8, opacity: 0.7 }}>
                {t("skills.tags", "标签")}
              </div>
              <div className="flex flex-wrap gap-1.5">
                {tagList.map((tag) => (
                  <Badge
                    key={tag}
                    variant="secondary"
                    className="text-[11px] px-2 py-0.5 bg-blue-500/10 text-blue-600 dark:text-blue-400"
                  >
                    {tag}
                  </Badge>
                ))}
              </div>
            </div>
          )}

          {/* Description detail */}
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 8, opacity: 0.7 }}>
              {t("skills.description", "技能描述")}
            </div>
            <div
              style={{
                fontSize: 13,
                lineHeight: 1.7,
                padding: 12,
                background: "var(--panel2)",
                borderRadius: 8,
                border: "1px solid var(--line)",
                whiteSpace: "pre-wrap",
                wordBreak: "break-word",
              }}
            >
              {skill.description}
            </div>
          </div>
        </div>
      </div>
    </ModalOverlay>
  );
}
