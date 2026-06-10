export type MeetingAgentProfile = {
  id: string;
  name: string;
  description?: string;
  icon: string;
  color: string;
  skills: string[];
  skills_mode: string;
};

export type RequiredSkillRule = {
  /** 展示用短名（与产品文档一致） */
  displayName: string;
  skillIds: string[];
};

export type SkillValidationIssue = {
  displayName: string;
  missingFromProfile: boolean;
};

export type SkillValidationResult = {
  ok: boolean;
  issues: SkillValidationIssue[];
};

export type MeetingSkillCard = {
  skillId: string;
  label: string;
  description: string;
  inProfile: boolean;
};

/** 主控（小鲸）必备技能 */
export const HOST_REQUIRED_SKILLS: RequiredSkillRule[] = [
  { displayName: '方案评审', skillIds: ['whalecloud-dev-tool-solution-review'] },
  { displayName: '人机问卷', skillIds: ['whalecloud-dev-tool-ask-user'] },
  { displayName: '文档生成', skillIds: ['whalecloud-dev-tool-doc-generate'] },
  { displayName: '研发工具共享脚本', skillIds: ['whalecloud-dev-tool-base-scripts'] },
  { displayName: 'C++代码阅读', skillIds: ['whalecloud-dev-tool-c-code-access'] },
  { displayName: '函数级方案技能', skillIds: ['whalecloud-dev-tool-function-solution'] },
];

/** 协作智能体 profile id → 必备技能 */
export const WORKER_REQUIRED_SKILLS_BY_PROFILE: Record<string, RequiredSkillRule[]> = {
  'whalecloud-requirement-expert': [
    { displayName: '需求澄清技能', skillIds: ['whalecloud-dev-tool-requirement-clarify'] },
    { displayName: '研发工具共享脚本', skillIds: ['whalecloud-dev-tool-base-scripts'] },
  ],
  'whalecloud-rd-expert': [
    { displayName: '模块功能技能', skillIds: ['whalecloud-dev-tool-module-function'] },
    { displayName: '研发工具共享脚本', skillIds: ['whalecloud-dev-tool-base-scripts'] },
    { displayName: 'C++代码阅读', skillIds: ['whalecloud-dev-tool-c-code-access'] },
  ],
  'whalecloud-design-expert': [
    { displayName: '函数级方案技能', skillIds: ['whalecloud-dev-tool-function-solution'] },
    { displayName: '文档生成', skillIds: ['whalecloud-dev-tool-doc-generate'] },
    { displayName: '研发工具共享脚本', skillIds: ['whalecloud-dev-tool-base-scripts'] },
    { displayName: 'C++代码阅读', skillIds: ['whalecloud-dev-tool-c-code-access'] },
  ],
};

const SKILL_DISPLAY_NAMES: Record<string, string> = (() => {
  const map: Record<string, string> = {};
  const ingest = (rules: RequiredSkillRule[]) => {
    for (const rule of rules) {
      for (const rawId of rule.skillIds) {
        const key = normalizeSkillKey(rawId);
        if (key) map[key] = rule.displayName;
      }
    }
  };
  ingest(HOST_REQUIRED_SKILLS);
  for (const rules of Object.values(WORKER_REQUIRED_SKILLS_BY_PROFILE)) {
    ingest(rules);
  }
  return map;
})();

function normalizeSkillKey(id: string): string {
  return id.trim().toLowerCase().replace(/_/g, '-');
}

function profileSkillSet(profile: MeetingAgentProfile): Set<string> {
  const out = new Set<string>();
  for (const raw of profile.skills ?? []) {
    const n = normalizeSkillKey(raw);
    if (n) out.add(n);
    const short = n.includes('@') ? n.split('@').pop()! : n;
    if (short) out.add(short);
  }
  return out;
}

function profileHasSkill(profile: MeetingAgentProfile, skillId: string): boolean {
  if ((profile.skills_mode || 'inclusive').toLowerCase() === 'all') return true;
  const want = normalizeSkillKey(skillId);
  const set = profileSkillSet(profile);
  if (set.has(want)) return true;
  const short = want.includes('@') ? want.split('@').pop()! : want;
  return set.has(short);
}

export function skillDisplayLabelForId(skillId: string): string {
  const key = normalizeSkillKey(skillId);
  return SKILL_DISPLAY_NAMES[key] || skillId;
}

/** 将 profile 上的 skill id 解析为展示卡片（仅依赖 Profile + 静态规则，不拉全局技能池）。 */
export function resolveProfileSkillCards(
  profile: MeetingAgentProfile,
  rules: RequiredSkillRule[] | null = null,
): MeetingSkillCard[] {
  const modeAll = (profile.skills_mode || '').toLowerCase() === 'all';
  const ids = modeAll
    ? (rules?.flatMap((r) => r.skillIds) ?? [...(profile.skills ?? [])])
    : [...(profile.skills ?? [])];

  const seen = new Set<string>();
  const cards: MeetingSkillCard[] = [];

  for (const rawId of ids) {
    const key = normalizeSkillKey(rawId);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    cards.push({
      skillId: key,
      label: skillDisplayLabelForId(key),
      description: modeAll ? '全部技能模式' : '已绑定到该智能体 Profile',
      inProfile: modeAll || profileHasSkill(profile, key),
    });
  }
  return cards;
}

/** 按 Profile 必备技能规则校验（不依赖全局 skills.json / /api/skills）。 */
export function validateRequiredSkills(
  profile: MeetingAgentProfile,
  rules: RequiredSkillRule[],
): SkillValidationResult {
  const issues: SkillValidationIssue[] = [];

  for (const rule of rules) {
    const anyOnProfile = rule.skillIds.some((id) => profileHasSkill(profile, id));
    if (!anyOnProfile) {
      issues.push({
        displayName: rule.displayName,
        missingFromProfile: true,
      });
    }
  }

  return { ok: issues.length === 0, issues };
}

export function workerRulesForProfile(profileId: string): RequiredSkillRule[] | null {
  return WORKER_REQUIRED_SKILLS_BY_PROFILE[profileId] ?? null;
}
