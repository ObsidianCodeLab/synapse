/**
 * 熵分析接口 — 研发统一服务（产品公共服务 IP + 端口 10001）。
 *
 * 接口一：POST /dev/iwhalecloud/synapse/entropy-analysis  总览（四类熵分 + 30 天趋势 + 仓库统计）
 * 接口二：POST /dev/iwhalecloud/synapse/entropy-detail     详情（按熵类型返回子指标 + 分析结论）
 */

import { IS_TAURI } from "@/platform";
import {
  getDevserviceHost,
  postRdUnifiedJson,
  RD_UNIFIED_PATHS,
} from "@/api/rdUnifiedService";

// ---------------------------------------------------------------------------
// Request types
// ---------------------------------------------------------------------------

export type EntropyAnalysisRequest = {
  prod: string;
  repo_branch: string;   // "repositoryId|destBranchName"
  prod_branch?: string;  // "branchVersionId|branchName"（可选）
};

export type EntropyDetailRequest = {
  prod: string;
  repo_branch: string;
  prod_branch?: string;
  entropy_type: "structural" | "semantic" | "behavioral" | "cognitive";
};

// ---------------------------------------------------------------------------
// Response types — interface 1
// ---------------------------------------------------------------------------

export type EntropyScoreItem = {
  score: number;    // raw entropy 0~1
  trend: number[];  // health scores 0~100, 30 days
};

export type EntropyType = "structural" | "semantic" | "behavioral" | "cognitive";

export type RepoStats = {
  branch: string;
  last_commit: string;       // ISO8601
  total_commits: number;
  java_files_count: number;
  total_methods: number;
  avg_method_lines: number;
  max_method_lines: number;
  avg_comment_ratio: number; // 0~1
};

export type EntropyAnalysisData = {
  entropy: Record<EntropyType, EntropyScoreItem>;
  dates: string[];           // MM-DD format
  repo_stats: RepoStats;
};

// ---------------------------------------------------------------------------
// Response types — interface 2
// ---------------------------------------------------------------------------

/** 按 entropy_type 返回不同字段，统一用 Record 承接 */
export type EntropyDetailData = Record<string, number | string>;

// ---------------------------------------------------------------------------
// Envelope
// ---------------------------------------------------------------------------

type ApiEnvelope<T> = {
  code: number;
  message: string;
  data: T;
};

// ---------------------------------------------------------------------------
// Fetch helpers
// ---------------------------------------------------------------------------

async function postEntropyApi<T>(
  path: string,
  body: unknown,
  timeoutSecs = 120,
): Promise<T> {
  if (!IS_TAURI) {
    throw new Error("rd_unified_tauri_only");
  }
  const host = await getDevserviceHost();
  if (!host) {
    throw new Error("missing_devservice_ip");
  }
  const parsed = await postRdUnifiedJson<ApiEnvelope<T>>(host, path, body, timeoutSecs);
  if (parsed.code !== 0) {
    throw new Error(parsed.message || "entropy_api_error");
  }
  if (parsed.data == null) {
    throw new Error("entropy_api_missing_data");
  }
  return parsed.data;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * 查询代码熵分析总分、30 天趋势和仓库统计。
 * 供产品详情页「熵分析」面板首屏展示。
 */
export async function fetchEntropyAnalysis(
  _synapseApiBase: string,
  body: EntropyAnalysisRequest,
): Promise<EntropyAnalysisData> {
  return postEntropyApi<EntropyAnalysisData>(RD_UNIFIED_PATHS.entropyAnalysis, body);
}

/**
 * 按熵类型查询单类子指标明细和分析结论。
 * 供详情抽屉按需加载。
 */
export async function fetchEntropyDetail(
  _synapseApiBase: string,
  body: EntropyDetailRequest,
): Promise<EntropyDetailData> {
  return postEntropyApi<EntropyDetailData>(RD_UNIFIED_PATHS.entropyDetail, body);
}
