// ─── Shared constants for Setup Center ───

import type { ProviderInfo } from "./types";
import SHARED_PROVIDERS from "@shared/providers.json";
import IWHALECLOUD_ONBOARDING from "./config/iwhalecloud-onboarding.json";

// 内置 Provider 列表（打包模式下 venv 不可用时作为回退）
// 数据来源：@shared/providers.json（与 Python 后端共享同一份文件）
// registry_class 字段仅 Python 使用，前端忽略
export const BUILTIN_PROVIDERS: ProviderInfo[] = SHARED_PROVIDERS as ProviderInfo[];

export const WEB_SEARCH_ENV_KEYS = [
  "WEB_SEARCH_PROVIDER",
  "BOCHA_API_KEY",
  "TAVILY_API_KEY",
  "JINA_API_KEY",
  "SEARXNG_BASE_URL",
];

/** 中国区提供商 slug（与 wizard constants 一致） */
export const CHINA_SLUGS = new Set([
  "dashscope", "kimi-cn", "minimax-cn", "siliconflow",
  "volcengine", "zhipu-cn", "qianfan", "hunyuan", "yunwu",
  "longcat", "iflow",
]);

/** 公司内部提供商 slug（与 wizard constants 一致） */
export const WHALECLOUD_SLUGS = new Set(["iwhalecloud"]);

/** 提示词编译器公司内部默认配置（与 wizard _configure_compiler 一致） */
export const COMPILER_COMPANY_DEFAULTS = {
  provider: "iwhalecloud",
  baseUrl: "https://lab.iwhalecloud.com/gpt-proxy/v1",
  apiKeyEnv: "IWHALECLOUD_API_KEY",
  model: "gpt-4o-mini",
} as const;

/**
 * 浩鲸研发云 onboarding「验证」：为 true 时前端 mock 直接通过（不调后端，仅本地调试）。
 * 正式流程应走 POST /api/dev/iwhalecloud/login（purpose=guide）。
 */
export const IWHALECLOUD_ONBOARDING_VALIDATION_MOCK = false;

/** 浩鲸研发云引导：部门 → 团队（配置见 config/iwhalecloud-onboarding.json） */
export const IWHALECLOUD_DEPARTMENT_TEAMS: Record<string, readonly string[]> =
  IWHALECLOUD_ONBOARDING.departmentTeams;

export const IWHALECLOUD_DEPARTMENTS = Object.keys(IWHALECLOUD_DEPARTMENT_TEAMS);

/** 浩鲸研发云引导：职位选项 */
export const IWHALECLOUD_POSITIONS = ["开发", "团队负责人", "部门领导"] as const;

/** Windows 本地受控安装的 Claude Code 版本（与 `main.rs` 中 bundled 路径一致） */
export const CLAUDE_CODE_BUNDLED_VERSION = "2.1.81";

/**
 * 按 公司内部 → 本地 → 国际 → 中国区 顺序排序，用于下拉展示（与 wizard _pick_provider 顺序一致）
 */
export function sortProvidersForDisplay(providers: ProviderInfo[]): ProviderInfo[] {
  const whalecloud: ProviderInfo[] = [];
  const local: ProviderInfo[] = [];
  const intl: ProviderInfo[] = [];
  const china: ProviderInfo[] = [];
  for (const p of providers) {
    if (p.is_local) local.push(p);
    else if (WHALECLOUD_SLUGS.has(p.slug)) whalecloud.push(p);
    else if (CHINA_SLUGS.has(p.slug)) china.push(p);
    else intl.push(p);
  }
  return [...whalecloud, ...local, ...intl, ...china];
}

/** STT 推荐模型（按 provider slug 索引） */
export const STT_RECOMMENDED_MODELS: Record<string, { id: string; note: string }[]> = {
  "openai":          [{ id: "gpt-4o-transcribe", note: "推荐" }, { id: "whisper-1", note: "" }],
  "dashscope":       [{ id: "qwen3-asr-flash", note: "推荐 (文件识别 ≤5min)" }],
  "dashscope-intl":  [{ id: "qwen3-asr-flash", note: "recommended (file ≤5min)" }],
  "groq":            [{ id: "whisper-large-v3-turbo", note: "推荐" }, { id: "whisper-large-v3", note: "" }],
  "siliconflow":     [{ id: "FunAudioLLM/SenseVoiceSmall", note: "推荐" }, { id: "TeleAI/TeleSpeechASR", note: "" }],
  "siliconflow-intl":[{ id: "FunAudioLLM/SenseVoiceSmall", note: "推荐" }, { id: "TeleAI/TeleSpeechASR", note: "" }],
};

/** 产品文档（钉钉文档）；Sidebar「文档」与 #docs 深链均指向此外部地址 */
export const USER_DOCS_URL =
  "https://alidocs.dingtalk.com/i/nodes/QOG9lyrgJP3Oaxg5uvgz2lnyVzN67Mw4?corpId=dingd60496d6e52565fa35c2f4657eb6378f&utm_scene=team_space";

export const PIP_INDEX_PRESETS: { id: "official" | "tuna" | "aliyun" | "custom"; label: string; url: string }[] = [
  { id: "aliyun", label: "阿里云（默认）", url: "https://mirrors.aliyun.com/pypi/simple/" },
  { id: "tuna", label: "清华 TUNA", url: "https://pypi.tuna.tsinghua.edu.cn/simple" },
  { id: "official", label: "官方 PyPI", url: "https://pypi.org/simple/" },
  { id: "custom", label: "自定义…", url: "" },
];
