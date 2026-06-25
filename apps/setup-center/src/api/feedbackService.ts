/**
 * 反馈接口 — 研发统一服务（产品公共服务 IP + 端口 10001）。
 *
 * POST /dev/iwhalecloud/synapse/feedback/submit  提交反馈（bug / feature）
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

export type FeedbackSubmitRequest = {
  type: "bug" | "feature";
  title: string;
  description: string;
  steps?: string;
  contact_email?: string;
  contact_wechat?: string;
  system_info?: string;
  upload_logs?: number;
  upload_debug?: number;
  images?: string;
  /** base64 图片数据，每条包含文件名和 base64 数据 */
  images_base64?: { name: string; data: string }[];
  /** 诊断日志包的 base64 数据 */
  log_zip_data?: string;
  log_zip_path?: string;
  debug_zip_path?: string;
  assignee_id: string;
};

// ---------------------------------------------------------------------------
// Response types
// ---------------------------------------------------------------------------

export type FeedbackSubmitResult = {
  id: string;
  status: string;
  created_at: string;
};

// ---------------------------------------------------------------------------
// API 封装
// ---------------------------------------------------------------------------

type ApiEnvelope<T> = {
  code: number;
  message: string;
  data: T;
};

async function postFeedbackApi<T>(
  path: string,
  body: unknown,
  timeoutSecs = 60,
  allowNullData = false,
): Promise<T> {
  if (!IS_TAURI) {
    throw new Error("rd_unified_tauri_only");
  }
  const host = await getDevserviceHost();
  if (!host) {
    throw new Error("missing_devservice_ip");
  }
  const parsed = await postRdUnifiedJson<ApiEnvelope<T>>(
    host, path, body, timeoutSecs,
  );
  if (parsed.code !== 0) {
    throw new Error(parsed.message || "feedback_api_error");
  }
  if (!allowNullData && parsed.data == null) {
    throw new Error("feedback_api_missing_data");
  }
  return parsed.data;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function submitFeedback(
  _synapseApiBase: string,
  body: FeedbackSubmitRequest,
): Promise<FeedbackSubmitResult> {
  return postFeedbackApi<FeedbackSubmitResult>(
    RD_UNIFIED_PATHS.submitFeedback, body,
  );
}

// ---------------------------------------------------------------------------
// Query types
// ---------------------------------------------------------------------------

export type FeedbackQueryRequest = {
  assignee_id: string;
};

export type FeedbackRecord = {
  id: string;
  type: "bug" | "feature";
  title: string;
  description: string;
  steps?: string;
  contact_email: string;
  contact_wechat: string;
  system_info?: string;
  upload_logs: number;
  upload_debug: number;
  images: string;
  log_zip_path?: string;
  debug_zip_path?: string;
  assignee_id: string;
  assignee_name?: string;
  status: string;
  created_at: string;
  updated_at: string;
  resolved_at?: string;
};

export async function queryFeedback(
  _synapseApiBase: string,
  body: FeedbackQueryRequest,
): Promise<FeedbackRecord[]> {
  return postFeedbackApi<FeedbackRecord[]>(
    RD_UNIFIED_PATHS.queryFeedback, body,
  );
}

// ---------------------------------------------------------------------------
// Delete
// ---------------------------------------------------------------------------

export type FeedbackDeleteRequest = {
  id: string;
  assignee_id: string;
};

export async function deleteFeedback(
  _synapseApiBase: string,
  body: FeedbackDeleteRequest,
): Promise<void> {
  return postFeedbackApi<void>(
    RD_UNIFIED_PATHS.deleteFeedback, body, 60, true,
  );
}

// ---------------------------------------------------------------------------
// Team query
// ---------------------------------------------------------------------------

export type FeedbackTeamQueryRequest = {
  assignee_id: string;
};

export async function teamQueryFeedback(
  _synapseApiBase: string,
  body: FeedbackTeamQueryRequest,
): Promise<FeedbackRecord[]> {
  return postFeedbackApi<FeedbackRecord[]>(
    RD_UNIFIED_PATHS.teamQueryFeedback, body,
  );
}
