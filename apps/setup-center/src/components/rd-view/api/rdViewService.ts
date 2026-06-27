import { IS_TAURI } from '@/platform';
import {
  fetchIwhalecloudUserinfoSummary,
  fetchUserinfoForUnifiedService,
  getDevserviceHost,
  postRdUnifiedJson,
  RD_UNIFIED_PATHS,
  type DevServiceResponse,
  postRdViewUnifiedData,
} from '@/api/rdUnifiedService';
import {
  receiveRdViewDemandsPayload,
  type RdViewDemandsPayload,
} from '@rd-view/data/buildOrderEfficiencyDetail';
import type { DemandEnjoyComment, TimeRange } from '@rd-view/types';
import { serializeDemandEnjoyFeedback } from '@rd-view/utils/demandEnjoyFeedback';
import {
  getPreviousRdViewTimeRangeBounds,
  getRdViewTimeRangeBounds,
} from '@rd-view/utils/timeRangeBounds';

export interface RdViewQueryTimeBounds {
  begin_time: string;
  end_time: string;
}

/**
 * 团队视图数据拉取（自定义时间窗）：
 * 1. GET Synapse userinfo → userInfo 密文 + assignee_id（工号）
 * 2. POST 研发统一服务 `/dev/iwhalecloud/synapse/rd_view_query`
 */
export async function fetchRdViewDemands(
  synapseApiBase: string,
  bounds: RdViewQueryTimeBounds,
): Promise<RdViewDemandsPayload> {
  if (!IS_TAURI) {
    throw new Error('rd_view_tauri_only');
  }

  const host = await getDevserviceHost();
  if (!host) {
    throw new Error('missing_devservice_ip');
  }

  const [{ owner_info: userInfo }, summary] = await Promise.all([
    fetchUserinfoForUnifiedService(synapseApiBase),
    fetchIwhalecloudUserinfoSummary(synapseApiBase),
  ]);

  if (!userInfo?.trim()) {
    throw new Error('owner_info_missing');
  }

  const team = String(summary.team ?? '').trim();
  if (!summary.exists || !team) {
    throw new Error('department_missing');
  }

  const resp = await postRdUnifiedJson<DevServiceResponse>(
    host,
    RD_UNIFIED_PATHS.rdViewTeamQuery,
    {
      team: team,
      begin_time: bounds.begin_time,
      end_time: bounds.end_time,
    },
    120,
  );

  if (resp.code !== 0) {
    throw new Error(resp.message || 'rd_view_query_failed');
  }

  return receiveRdViewDemandsPayload(resp);
}

/** 按 Segmented 周期拉取本期工单 */
export async function fetchRdViewTeamOverview(
  synapseApiBase: string,
  timeRange: TimeRange,
): Promise<RdViewDemandsPayload> {
  return fetchRdViewDemands(synapseApiBase, getRdViewTimeRangeBounds(timeRange));
}

/** 并行拉取本期与上期工单（KPI 环比） */
export async function fetchRdViewTeamOverviewWithComparison(
  synapseApiBase: string,
  timeRange: TimeRange,
): Promise<{ current: RdViewDemandsPayload; previous: RdViewDemandsPayload }> {
  const [current, previous] = await Promise.all([
    fetchRdViewDemands(synapseApiBase, getRdViewTimeRangeBounds(timeRange)),
    fetchRdViewDemands(synapseApiBase, getPreviousRdViewTimeRangeBounds(timeRange)),
  ]);
  return { current, previous };
}

/** 保存工单表情反馈（仅更新 feedback_type JSON；comments 传空串） */
export async function updateRdViewDemandEnjoyFeedback(
  synapseApiBase: string,
  demandNo: string,
  enjoyComments: DemandEnjoyComment[],
): Promise<void> {
  await postRdViewUnifiedData(synapseApiBase, RD_UNIFIED_PATHS.rdViewDemandUpdateFeedback, {
    demand_no: demandNo,
    feedback_type: serializeDemandEnjoyFeedback(enjoyComments),
    comments: '',
  });
}
