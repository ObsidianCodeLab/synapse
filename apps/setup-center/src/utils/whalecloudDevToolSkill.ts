import type { SkillInfo } from "../types";

/** 与研发统一服务 / 后端约定的「产品手册」doc_type 字面量 */
export const UNIFIED_SERVICE_DOC_TYPE_MANUAL = "产品手册";

/** 研发流程工具判定前缀（与 SKILL 声明的 tool_name 对齐，避免合并冲突） */
export const WHALECLOUD_DEV_TOOL_PREFIX = "whalecloud_dev_tool_" as const;

/** 与后端创建的目录名前缀一致（tool_name 缺失时仍可识别） */
export const WHALECLOUD_DEV_TOOL_DIR_PREFIX = "whalecloud-dev-tool-" as const;

/** 产品架构文档生成：推荐默认勾选的架构文档技能 */
export const RD_TOOL_ARCH_CREATE = "whalecloud-dev-tool-arch-create";
/** 产品开发手册生成（PRODUCT_DEV.md）：推荐与「产品手册」类 doc_type 搭配 */
export const RD_TOOL_DEVELOPMENT_MANUAL = "whalecloud-dev-tool-development-manual";
/** 产品架构配套的 Excalidraw 图示技能（默认生成流程不再勾选，用户可手动增选） */
export const RD_TOOL_EXCALIDRAW = "whalecloud-dev-tool-excalidraw";
/** 产品架构文档修改（refine）：推荐默认勾选的修改技能 */
export const RD_TOOL_ARCH_MODIFY = "whalecloud-dev-tool-arch-modify";
/** 产品开发手册修改（refine · PRODUCT_DEV.md） */
export const RD_TOOL_MANUAL_MODIFY = "whalecloud-dev-tool-manual-modify";
/** 研发工具共享脚本（GitNexus / Synapse 脚本包）：系统强制启用，不可卸载、不可从 allowlist 移除 */
export const RD_TOOL_BASE_SCRIPTS = "whalecloud-dev-tool-base-scripts";

/** 架构文档生成：推荐默认勾选的技能（仅架构生成；图示工具不在默认内，可另选） */
export const RD_TOOL_GENERATE_REQUIRED = [RD_TOOL_ARCH_CREATE] as const;

/** 产品开发手册生成：推荐默认勾选（不含 Excalidraw；产出为 PRODUCT_DEV.md） */
export const RD_TOOL_GENERATE_MANUAL_REQUIRED = [RD_TOOL_DEVELOPMENT_MANUAL] as const;

/** 架构文档 refine：推荐默认勾选的技能 */
export const RD_TOOL_REFINE_REQUIRED = [RD_TOOL_ARCH_MODIFY, RD_TOOL_EXCALIDRAW] as const;

/** 产品手册 refine：推荐默认勾选 */
export const RD_TOOL_REFINE_MANUAL_REQUIRED = [RD_TOOL_MANUAL_MODIFY] as const;

export const RD_TOOL_GENERATE_REQUIRED_SET = new Set<string>(RD_TOOL_GENERATE_REQUIRED);
export const RD_TOOL_GENERATE_MANUAL_REQUIRED_SET = new Set<string>(RD_TOOL_GENERATE_MANUAL_REQUIRED);
export const RD_TOOL_REFINE_REQUIRED_SET = new Set<string>(RD_TOOL_REFINE_REQUIRED);
export const RD_TOOL_REFINE_MANUAL_REQUIRED_SET = new Set<string>(RD_TOOL_REFINE_MANUAL_REQUIRED);

/** UI 兜底文案（catalog 尚未加载或无对应项时） */
export const RD_TOOL_FALLBACK_LABELS: Record<string, string> = {
  [RD_TOOL_ARCH_CREATE]: "产品架构文档生成工具",
  [RD_TOOL_DEVELOPMENT_MANUAL]: "产品开发手册生成工具",
  [RD_TOOL_EXCALIDRAW]: "设计画图工具",
  [RD_TOOL_ARCH_MODIFY]: "产品架构文档修改工具",
  [RD_TOOL_MANUAL_MODIFY]: "产品开发手册文档修改工具",
  [RD_TOOL_BASE_SCRIPTS]: "研发工具共享脚本",
};

/** 去重、去空白，保持首次出现顺序 */
export function uniqueRdSkillIds(ids: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of ids) {
    const id = raw.trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

/** 无显式入参时：为生成任务提供「推荐默认」技能集（与 UI 首次打开一致） */
export function buildRdSkillIdsForGenerate(optionalSkillIds: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const id of RD_TOOL_GENERATE_REQUIRED) {
    if (!seen.has(id)) {
      seen.add(id);
      out.push(id);
    }
  }
  for (const raw of optionalSkillIds) {
    const id = raw.trim();
    if (!id || RD_TOOL_GENERATE_REQUIRED_SET.has(id)) continue;
    if (!seen.has(id)) {
      seen.add(id);
      out.push(id);
    }
  }
  return withRdBaseScriptsSkillIds(out);
}

/** 「产品手册」生成弹窗：默认勾选产品开发手册技能（可增选其它） */
export function buildRdSkillIdsForGenerateManual(optionalSkillIds: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const id of RD_TOOL_GENERATE_MANUAL_REQUIRED) {
    if (!seen.has(id)) {
      seen.add(id);
      out.push(id);
    }
  }
  for (const raw of optionalSkillIds) {
    const id = raw.trim();
    if (!id || RD_TOOL_GENERATE_MANUAL_REQUIRED_SET.has(id)) continue;
    if (!seen.has(id)) {
      seen.add(id);
      out.push(id);
    }
  }
  return withRdBaseScriptsSkillIds(out);
}

/** refine：按 doc_type 推荐默认 + 额外可选 */
export function buildRdSkillIdsForRefine(
  optionalSkillIds: string[],
  docType: string,
): string[] {
  const manual = docType.trim() === UNIFIED_SERVICE_DOC_TYPE_MANUAL;
  const primary = manual ? RD_TOOL_REFINE_MANUAL_REQUIRED : RD_TOOL_REFINE_REQUIRED;
  const primarySet = manual ? RD_TOOL_REFINE_MANUAL_REQUIRED_SET : RD_TOOL_REFINE_REQUIRED_SET;
  const seen = new Set<string>();
  const out: string[] = [];
  for (const id of primary) {
    if (!seen.has(id)) {
      seen.add(id);
      out.push(id);
    }
  }
  for (const raw of optionalSkillIds) {
    const id = raw.trim();
    if (!id || primarySet.has(id)) continue;
    if (!seen.has(id)) {
      seen.add(id);
      out.push(id);
    }
  }
  return withRdBaseScriptsSkillIds(out);
}

export function isUnifiedManualDocType(docType: string): boolean {
  return docType.trim() === UNIFIED_SERVICE_DOC_TYPE_MANUAL;
}

/** 是否为强制启用的研发工具共享脚本技能 id */
export function isWhalecloudBaseScriptsSkillId(skillId: string): boolean {
  return skillId.trim().toLowerCase().replace(/_/g, "-") === RD_TOOL_BASE_SCRIPTS;
}

/** 在任意研发工具技能列表中保证包含共享脚本技能（去重保持顺序） */
export function withRdBaseScriptsSkillIds(ids: string[]): string[] {
  const u = uniqueRdSkillIds(ids);
  return u.includes(RD_TOOL_BASE_SCRIPTS) ? u : [...u, RD_TOOL_BASE_SCRIPTS];
}

export function isWhalecloudDevToolSkill(skill: SkillInfo): boolean {
  const tn = skill.toolName ?? "";
  if (tn.startsWith(WHALECLOUD_DEV_TOOL_PREFIX)) return true;
  if (skill.skillId.startsWith(WHALECLOUD_DEV_TOOL_DIR_PREFIX)) return true;
  const cat = skill.category ?? "";
  if (cat === "研发工具") return true;
  return false;
}

/** 研发工具等在列表/选择器中的展示名：`label` 优先，否则 name_i18n / name（调用 API 仍用 skillId） */
export function rdToolDisplayLabel(skill: SkillInfo, lang?: string): string {
  const lab = skill.label?.replace(/\r/g, "").trim();
  if (lab) return lab;
  const key = !lang || lang.startsWith("zh") ? "zh" : lang;
  return skill.name_i18n?.[key] || skill.name_i18n?.en || skill.name;
}
