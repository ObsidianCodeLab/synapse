/**
 * rd_view 团队视图 — 工单数据「接收 + 遍历 + 六指标派生」
 *
 * 流程：
 * 1. receiveRdViewDemandsPayload(raw)  接收并归一化工单列表
 * 2. traverseRdViewDemands(payload)    遍历工单，调用各指标 build 方法，返回 KPI 空壳 + 明细列表
 *
 * 六个指标（与团队 AI 提效总视图 KPI 卡片一一对应）：
 * - efficiencyGain   工单处理提效程度
 * - aiCoverage       智能研发覆盖率
 * - orderCoverage    需求工单覆盖率
 * - satisfaction     工单处理质量
 * - tokenConsumed    Token 总消耗
 * - assistantOutput  研发助手产出
 */

import type {
  KpiItem,
  DemandPriorityLevel,
  ModelTokenUsageItem,
  OrderCoverageDetailItem,
  OrderCoverageModelUsage,
  OrderEfficiencyDetailItem,
  OrderSatisfactionDetailItem,
  PersonAiCoverageItem,
  PersonDemandItem,
  PersonCostUsageItem,
  ProductAssistantOutputItem,
  DemandStatusItem,
  RequirementStatus,
  SopNodeRunStatus,
  WorkOrderComment,
  WorkOrderSopNode,
  WorkOrderTicket,
  TimeRange,
} from '@rd-view/types';
import { calcAverageAiCoverageRate } from '@rd-view/utils/aiCoverage';
import { calcAverageOrderEfficiencyGain } from '@rd-view/utils/orderEfficiency';
import { calcAverageOrderCoverageRate } from '@rd-view/utils/orderCoverage';
import {
  calcOrderSatisfactionScore,
  formatOrderSatisfactionScore,
} from '@rd-view/utils/orderSatisfaction';
import { calcModelTokenCost, calcTotalTokens, formatTotalTokens, resolveModelUnitPrice } from '@rd-view/utils/tokenConsumption';
import { parseDemandEnjoyFeedback } from '@rd-view/utils/demandEnjoyFeedback';
import { getTimeRangeTrendLabel, sumAssistantOutput } from '@rd-view/utils/assistantOutput';
import { RD_VIEW_CHART_SERIES } from '@rd-view/theme/palette';

// ---------------------------------------------------------------------------
// 类型定义（与 rd_view demands / team-overview 接口字段对齐）
// ---------------------------------------------------------------------------

/** 工单评论（comments 数组内单条） */
export interface RdViewDemandComment {
  author: string;
  author_id?: string;
  time: string;
  content: string;
}

/** 工单表情评论 wire 单条（feedback_type JSON 数组元素） */
export interface RdViewDemandEnjoyComment {
  assignee?: string;
  assignee_id?: string;
  enjoy_id?: string | number;
  [key: string]: unknown;
}

/** 单条 SOP 节点执行记录（demand.sop_nodes[] 元素） */
export interface RdViewSopNodeRecord {
  id?: number;
  demand_no?: string;
  sop_node_id?: string;
  group?: string;
  seqId?: number;
  name?: string;
  status?: string;
  run_status?: string;
  processing_mode?: string;
  started_at?: string | null;
  finished_at?: string | null;
  duration_hours?: number | null;
  tokens?: number | null;
  model?: string | null;
  /** 模型定价：元/百万 Token（历史字段，当前接口未返回） */
  model_price?: number | null;
  /** 节点产出文档列表（rd_view_node_artifact 嵌入） */
  artifact_files?: RdViewArtifactFileRecord[] | null;
  /** 节点代码仓库变更 */
  repo_outputs?: RdViewRepoOutputRecord[] | null;
  /** 节点代码仓库变更（部分接口单数 repo_output） */
  repo_output?: RdViewRepoOutputRecord | RdViewRepoOutputRecord[] | null;
}

/** SOP 节点产出文档（artifact_files[] 元素） */
export interface RdViewArtifactFileRecord {
  id?: number;
  demand_no?: string;
  node_id?: number;
  type?: string;
  label?: string;
  url?: string;
  [key: string]: unknown;
}

/** SOP 节点代码仓库产出 */
export interface RdViewRepoOutputRecord {
  repo_url?: string;
  repo_name?: string;
  branch?: string;
  lines_added?: number | null;
  lines_deleted?: number | null;
  commit_count?: number | null;
  [key: string]: unknown;
}

/** 单条需求工单（demands[] / data[] 元素） */
export interface RdViewDemandRecord {
  demand_no: string;
  demand_title: string;
  demand_desc?: string;
  demand_create_time?: string;
  demand_status?: string;
  priority?: string;
  assignee?: string;
  assignee_id?: string;
  product_name?: string;
  processing_mode?: string;
  llm_estimated_hours?: number | null;
  llm_estimate_model?: string | null;
  /** 表情反馈 JSON 串：[{ assignee, assignee_id, enjoy_id }, ...] */
  feedback_type?: string | null;
  feedback_at?: string | null;
  /** 点踩反馈：1=点赞，2=点踩 */
  reaction?: number | null;
  comments?: RdViewDemandComment[] | string | null;
  sop_nodes?: RdViewSopNodeRecord[] | null;
  local_process_state?: string;
  sop_node_id?: string;
  name?: string;
  group?: string;
  run_status?: string;
  seqId?: number;
  [key: string]: unknown;
}

/** receiveRdViewDemandsPayload 的返回值结构 */
export interface RdViewDemandsPayload {
  code?: number;
  message?: string;
  total?: number;
  data?: RdViewDemandRecord[];
}

/** 六个 KPI 指标 key（与 KpiCards 一致） */
export type RdViewKpiMetricKey =
  | 'efficiencyGain'
  | 'aiCoverage'
  | 'orderCoverage'
  | 'satisfaction'
  | 'tokenConsumed'
  | 'assistantOutput';

/** 六个指标的弹窗/明细数据结构 */
export interface RdViewMetricDetails {
  /** 1. 工单处理提效程度 */
  efficiencyGain: OrderEfficiencyDetailItem[];
  /** 2. 智能研发覆盖率（按人员） */
  aiCoverage: PersonAiCoverageItem[];
  /** 3. 需求工单覆盖率 */
  orderCoverage: OrderCoverageDetailItem[];
  /** 4. 工单处理质量 */
  satisfaction: OrderSatisfactionDetailItem[];
  /** 5. Token 总消耗（按模型） */
  tokenConsumed: ModelTokenUsageItem[];
  /** 6. 研发助手产出（按产品） */
  assistantOutput: ProductAssistantOutputItem[];
}

/** traverseRdViewDemands 的返回值：KPI 卡片空壳 + 各指标明细列表 + 饼图数据 */
export interface RdViewDashboardResult {
  kpiCards: KpiItem[];
  details: RdViewMetricDetails;
  /** 总需求状态分布（饼图） */
  demandStatus: DemandStatusItem[];
  /** 人员工作量（按 assignee 汇总，已完成 / 进行中 / 待开始） */
  personWorkload: PersonDemandItem[];
  /** 需求耗时 & 成本（按 assignee，各需求 SOP 均值再求平均） */
  personCostUsage: PersonCostUsageItem[];
  /** 工作内容滚动列表 */
  workOrders: WorkOrderTicket[];
}

/** local_process_state → 饼图三类桶 */
type DemandProcessBucketKey = 'pending' | 'inProgress' | 'completed';

/** userwork / 表1 `local_process_state` → rd-view 三态（schema §1.4 + 后端扩展） */
const LOCAL_PROCESS_STATE_BUCKET: Record<string, DemandProcessBucketKey> = {
  已完成: 'completed',
  已归档: 'completed',
  处理中: 'inProgress',
  全人工: 'inProgress',
  异常: 'inProgress',
  待人工: 'inProgress',
  待处理: 'pending',
  预备中: 'pending',
  待定: 'pending',
};

const DEFAULT_LOCAL_PROCESS_BUCKET: DemandProcessBucketKey = 'pending';

/** 与 owner_order_archive.is_archived_local_state 对齐 */
export function isArchivedLocalProcessState(state: unknown): boolean {
  return String(state ?? '').trim() === '已归档';
}

function classifyLocalProcessState(state: unknown): DemandProcessBucketKey {
  if (isArchivedLocalProcessState(state)) return 'completed';
  const text = String(state ?? '').trim();
  if (!text) return DEFAULT_LOCAL_PROCESS_BUCKET;
  return LOCAL_PROCESS_STATE_BUCKET[text] ?? DEFAULT_LOCAL_PROCESS_BUCKET;
}

function isCompletedLocalProcessState(state: unknown): boolean {
  if (isArchivedLocalProcessState(state)) return true;
  return classifyLocalProcessState(state) === 'completed';
}

const DEMAND_STATUS_META: Record<DemandProcessBucketKey, { name: string; color: string }> = {
  completed: { name: '已完成', color: RD_VIEW_CHART_SERIES.completed },
  inProgress: { name: '进行中', color: RD_VIEW_CHART_SERIES.inProgress },
  pending: { name: '待处理', color: RD_VIEW_CHART_SERIES.pending },
};

const DEMAND_STATUS_ORDER: DemandProcessBucketKey[] = ['completed', 'inProgress', 'pending'];

function createEmptyDemandStatusBucket(): Record<DemandProcessBucketKey, number> {
  return { pending: 0, inProgress: 0, completed: 0 };
}

function accumulateDemandStatusFromDemand(
  bucket: Record<DemandProcessBucketKey, number>,
  demand: RdViewDemandRecord,
): void {
  bucket[classifyLocalProcessState(demand.local_process_state)] += 1;
}

function buildDemandStatusDistribution(
  bucket: Record<DemandProcessBucketKey, number>,
): DemandStatusItem[] {
  return DEMAND_STATUS_ORDER.map((key) => ({
    name: DEMAND_STATUS_META[key].name,
    value: bucket[key],
    color: DEMAND_STATUS_META[key].color,
  }));
}

/** 人员工作量按 assignee_id 分组累加桶 */
interface PersonWorkloadBucket {
  name: string;
  completed: number;
  inProgress: number;
  pending: number;
}

function accumulatePersonWorkloadFromDemand(
  bucket: Map<string, PersonWorkloadBucket>,
  demand: RdViewDemandRecord,
): void {
  const assigneeId =
    String(demand.assignee_id ?? '').trim() ||
    String(demand.assignee ?? '').trim() ||
    'unknown';
  const assigneeName = String(demand.assignee ?? '').trim() || assigneeId;

  const entry = bucket.get(assigneeId) ?? {
    name: assigneeName,
    completed: 0,
    inProgress: 0,
    pending: 0,
  };

  if (assigneeName && (entry.name === assigneeId || !entry.name)) {
    entry.name = assigneeName;
  }

  const statusKey = classifyLocalProcessState(demand.local_process_state);
  if (statusKey === 'completed') {
    entry.completed += 1;
  } else if (statusKey === 'inProgress') {
    entry.inProgress += 1;
  } else {
    entry.pending += 1;
  }

  bucket.set(assigneeId, entry);
}

function buildPersonWorkloadList(bucket: Map<string, PersonWorkloadBucket>): PersonDemandItem[] {
  return Array.from(bucket.values())
    .map(({ name, completed, inProgress, pending }) => ({
      name,
      completed,
      inProgress,
      pending,
    }))
    .sort((a, b) => {
      const totalA = a.completed + a.inProgress + a.pending;
      const totalB = b.completed + b.inProgress + b.pending;
      if (totalB !== totalA) return totalB - totalA;
      return a.name.localeCompare(b.name, 'zh-CN');
    });
}

/** 单条需求：SOP 节点 duration_hours 平均值 */
function calcDemandAvgSopHours(
  sopNodes: RdViewSopNodeRecord[] | null | undefined,
): number | null {
  if (!Array.isArray(sopNodes) || sopNodes.length === 0) return null;

  const hours = sopNodes
    .map((node) => node.duration_hours)
    .filter((value): value is number => typeof value === 'number' && Number.isFinite(value) && value > 0);

  if (hours.length === 0) return null;
  return hours.reduce((sum, value) => sum + value, 0) / hours.length;
}

/** 单条需求：SOP 节点 tokens 平均值（图表「平均使用量」） */
function calcDemandAvgSopTokenUsage(
  sopNodes: RdViewSopNodeRecord[] | null | undefined,
): number | null {
  if (!Array.isArray(sopNodes) || sopNodes.length === 0) return null;

  const tokens = sopNodes
    .map((node) => node.tokens)
    .filter((value): value is number => typeof value === 'number' && Number.isFinite(value) && value > 0);

  if (tokens.length === 0) return null;
  return tokens.reduce((sum, value) => sum + value, 0) / tokens.length;
}

/** 需求耗时 & 成本：按 assignee_id 累加各需求的 SOP 均值样本 */
interface PersonCostUsageBucket {
  name: string;
  avgHourSamples: number[];
  avgUsageSamples: number[];
}

function accumulatePersonCostUsageFromDemand(
  bucket: Map<string, PersonCostUsageBucket>,
  demand: RdViewDemandRecord,
): void {
  const assigneeId =
    String(demand.assignee_id ?? '').trim() ||
    String(demand.assignee ?? '').trim() ||
    'unknown';
  const assigneeName = String(demand.assignee ?? '').trim() || assigneeId;

  const demandAvgHours = calcDemandAvgSopHours(demand.sop_nodes);
  const demandAvgUsage = calcDemandAvgSopTokenUsage(demand.sop_nodes);
  if (demandAvgHours == null && demandAvgUsage == null) return;

  const entry = bucket.get(assigneeId) ?? {
    name: assigneeName,
    avgHourSamples: [],
    avgUsageSamples: [],
  };

  if (assigneeName && (entry.name === assigneeId || !entry.name)) {
    entry.name = assigneeName;
  }

  if (demandAvgHours != null) entry.avgHourSamples.push(demandAvgHours);
  if (demandAvgUsage != null) entry.avgUsageSamples.push(demandAvgUsage);

  bucket.set(assigneeId, entry);
}

function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function buildPersonCostUsageList(
  bucket: Map<string, PersonCostUsageBucket>,
): PersonCostUsageItem[] {
  return Array.from(bucket.values())
    .map(({ name, avgHourSamples, avgUsageSamples }) => ({
      name,
      avgHours: roundHours(mean(avgHourSamples)),
      /** 各需求 SOP 节点 tokens 均值的再平均 */
      avgUsage: Math.round(mean(avgUsageSamples)),
    }))
    .filter((item) => item.avgHours > 0 || item.avgUsage > 0)
    .sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'));
}

function mapLocalProcessStateToRequirementStatus(state: unknown): RequirementStatus {
  if (isArchivedLocalProcessState(state)) return 'archived';
  return classifyLocalProcessState(state);
}

function mapWorkOrderPriority(priority: unknown): WorkOrderTicket['priority'] {
  const level = parseDemandPriority(priority);
  if (level === '非常紧急' || level === '紧急') return '高';
  if (level === '普通') return '中';
  if (level === '较低') return '低';

  const text = String(priority ?? '').trim();
  if (text === '高' || text === '中' || text === '低') return text;
  return '中';
}

function parseDemandDateTime(value: unknown): string {
  const text = String(value ?? '').trim();
  if (!text) return new Date().toISOString();

  const date = new Date(text.includes('T') ? text : text.replace(' ', 'T'));
  return Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString();
}

function parseDemandComments(
  comments: RdViewDemandComment[] | string | null | undefined,
): WorkOrderComment[] {
  if (comments == null || comments === '') return [];

  if (Array.isArray(comments)) {
    return comments
      .map((item) => ({
        author: String(item.author ?? '').trim(),
        time: String(item.time ?? '').trim(),
        content: String(item.content ?? '').trim(),
      }))
      .filter((item) => item.author || item.content);
  }

  const text = String(comments).trim();
  if (!text || text === '[]') return [];

  try {
    const parsed: unknown = JSON.parse(text);
    if (Array.isArray(parsed)) {
      return parsed
        .filter(isRecord)
        .map((item) => ({
          author: String(item.author ?? '').trim(),
          time: String(item.time ?? '').trim(),
          content: String(item.content ?? '').trim(),
        }))
        .filter((item) => item.author || item.content);
    }
    if (isRecord(parsed)) {
      const comment = {
        author: String(parsed.author ?? '').trim(),
        time: String(parsed.time ?? '').trim(),
        content: String(parsed.content ?? '').trim(),
      };
      return comment.author || comment.content ? [comment] : [];
    }
    return [];
  } catch {
    return [];
  }
}

/** sop_nodes[].status → 节点进度三态（rd-view-demands-api §5.2：pending / inProgress / completed） */
function mapSopNodeStatus(status: unknown): RequirementStatus {
  const text = String(status ?? '').trim();
  const lower = text.toLowerCase();
  if (lower === 'completed') return 'completed';
  if (lower === 'pending') return 'pending';
  if (lower === 'inprogress') return 'inProgress';
  return 'pending';
}

/** owner_order_refresh._RUN_STATUS_TO_SLUG 写入统一服务的 run_status */
const RD_VIEW_RUN_STATUS_SLUGS: readonly SopNodeRunStatus[] = [
  'running',
  'human_intervention',
  'completed',
  'failed',
  'stopped',
  'pending',
  'full_manual',
  'archived',
];

const RUN_STATUS_SLUG_SET = new Set<string>(RD_VIEW_RUN_STATUS_SLUGS);

export const RD_VIEW_RUN_STATUS_LABEL: Record<SopNodeRunStatus, string> = {
  running: '运行中',
  human_intervention: '人工介入',
  completed: '已完成',
  failed: '异常',
  stopped: '已停止',
  pending: '未开始',
  full_manual: '全人工',
  archived: '已归档',
};

function mapRdViewRunStatus(raw: unknown): SopNodeRunStatus {
  const text = String(raw ?? '').trim().toLowerCase();
  if (RUN_STATUS_SLUG_SET.has(text)) {
    return text as SopNodeRunStatus;
  }
  return 'pending';
}

function mapArtifactOutputs(
  files: RdViewArtifactFileRecord[] | null | undefined,
): WorkOrderSopNode['outputs'] {
  if (!Array.isArray(files)) return [];

  return files
    .map((file) => {
      const label = String(file.label ?? '').trim();
      if (!label) return null;

      const typeRaw = String(file.type ?? '').trim();
      const type: WorkOrderSopNode['outputs'][number]['type'] =
        typeRaw === 'document' ? 'document' : typeRaw === 'code' ? 'code' : 'artifact';

      return { type, label };
    })
    .filter((item): item is WorkOrderSopNode['outputs'][number] => item != null);
}

function buildWorkOrderSopNodesFromDemand(demand: RdViewDemandRecord): WorkOrderSopNode[] {
  if (!isCompletedLocalProcessState(demand.local_process_state)) return [];
  if (!Array.isArray(demand.sop_nodes) || demand.sop_nodes.length === 0) return [];

  return demand.sop_nodes.map((node, index) => {
    const hours = node.duration_hours;
    const tokens = node.tokens;
    const nodeStatus = mapSopNodeStatus(node.status);

    return {
      key: String(node.sop_node_id ?? `node-${index}`),
      name: String(node.name ?? node.sop_node_id ?? `节点${index + 1}`),
      group: String(node.group ?? '').trim(),
      seqId:
        typeof node.seqId === 'number' && Number.isFinite(node.seqId)
          ? node.seqId
          : index + 1,
      status: nodeStatus,
      runStatus: mapRdViewRunStatus(node.run_status),
      hours: typeof hours === 'number' && Number.isFinite(hours) ? hours : 0,
      tokens: typeof tokens === 'number' && Number.isFinite(tokens) ? tokens : 0,
      model: String(node.model ?? '').trim(),
      description: String(node.name ?? '').trim(),
      dialogues: [],
      outputs: mapArtifactOutputs(node.artifact_files),
      repoOutputs: mapRepoOutputsFromSopNode(node),
    };
  });
}

function buildWorkContentSummary(_title: string, content: string): string {
  return content.replace(/\s+/g, ' ').trim();
}

/** 工作内容：单条 demand → WorkOrderTicket */
function buildWorkOrderTicketFromDemand(demand: RdViewDemandRecord): WorkOrderTicket {
  const title = demand.demand_title;
  const content = String(demand.demand_desc ?? '').trim();
  const createdAt = parseDemandDateTime(demand.demand_create_time);
  const updatedAt = parseDemandDateTime(demand.feedback_at ?? demand.demand_create_time);

  return {
    id: demand.demand_no,
    title,
    status: mapLocalProcessStateToRequirementStatus(demand.local_process_state),
    assignee: String(demand.assignee ?? '').trim() || '未分配',
    priority: mapWorkOrderPriority(demand.priority),
    summary: buildWorkContentSummary(title, content),
    content,
    createdAt,
    updatedAt,
    plannedEnd: '',
    comments: parseDemandComments(demand.comments),
    enjoyComments: parseDemandEnjoyFeedback(demand.feedback_type),
    sopNodes: buildWorkOrderSopNodesFromDemand(demand),
    localProcessState: String(demand.local_process_state ?? '').trim() || undefined,
    currentNodeName: String(demand.name ?? '').trim() || undefined,
  };
}

function buildWorkOrderList(items: WorkOrderTicket[]): WorkOrderTicket[] {
  const statusWeight: Record<RequirementStatus, number> = {
    inProgress: 0,
    pending: 1,
    completed: 2,
    archived: 3,
  };

  return [...items].sort((a, b) => {
    const weightDiff = statusWeight[a.status] - statusWeight[b.status];
    if (weightDiff !== 0) return weightDiff;
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });
}

const KPI_CARD_SHELLS: Omit<KpiItem, 'value'>[] = [
  { key: 'efficiencyGain', title: '工单处理提效程度', trend: 0, trendLabel: '', isPositive: true },
  { key: 'aiCoverage', title: '智能研发覆盖率', trend: 0, trendLabel: '', isPositive: true },
  { key: 'orderCoverage', title: '需求工单覆盖率', trend: 0, trendLabel: '', isPositive: true },
  { key: 'satisfaction', title: '工单处理质量', trend: 0, trendLabel: '', isPositive: true },
  { key: 'tokenConsumed', title: 'Token总消耗', trend: 0, trendLabel: '', isPositive: false },
  { key: 'assistantOutput', title: '研发助手产出', trend: 0, trendLabel: '', isPositive: true },
];

function roundHours(value: number): number {
  return Math.round(value * 100) / 100;
}

function sumSopNodeDurationHours(sopNodes: RdViewSopNodeRecord[] | null | undefined): number {
  if (!Array.isArray(sopNodes)) return 0;
  return sopNodes.reduce((sum, node) => {
    const hours = node.duration_hours;
    if (typeof hours === 'number' && Number.isFinite(hours) && hours > 0) {
      return sum + hours;
    }
    return sum;
  }, 0);
}

/** 遍历 sop_nodes，按 model 累加 tokens / hours，按 tokens 降序返回 */
function aggregateSopNodeUsageByModel(
  sopNodes: RdViewSopNodeRecord[] | null | undefined,
): OrderCoverageModelUsage[] {
  if (!Array.isArray(sopNodes)) return [];

  const bucket = new Map<string, { tokens: number; hours: number }>();
  for (const node of sopNodes) {
    const model = String(node.model ?? '').trim();
    if (!model) continue;

    const entry = bucket.get(model) ?? { tokens: 0, hours: 0 };

    const tokens = node.tokens;
    if (typeof tokens === 'number' && Number.isFinite(tokens) && tokens > 0) {
      entry.tokens += tokens;
    }

    const hours = node.duration_hours;
    if (typeof hours === 'number' && Number.isFinite(hours) && hours > 0) {
      entry.hours += hours;
    }

    bucket.set(model, entry);
  }

  return Array.from(bucket.entries())
    .map(([model, usage]) => ({
      model,
      tokens: usage.tokens,
      hours: roundHours(usage.hours),
    }))
    .filter((usage) => usage.tokens > 0)
    .sort((a, b) => b.tokens - a.tokens);
}

interface TokenUsageBucket {
  tokens: number;
  costSum: number;
  /** 展示参考：按 model 静态映射模糊匹配得到的单价（元/百万Token） */
  unitPrice: number;
}

function accumulateTokenUsageBucket(
  bucket: Map<string, TokenUsageBucket>,
  model: string,
  tokens: number,
): void {
  const unitPrice = resolveModelUnitPrice(model);
  const entry = bucket.get(model) ?? { tokens: 0, costSum: 0, unitPrice: 0 };
  entry.tokens += tokens;

  if (unitPrice > 0) {
    entry.costSum += calcModelTokenCost(tokens, unitPrice);
  }

  if (entry.unitPrice === 0 && unitPrice > 0) {
    entry.unitPrice = unitPrice;
  }

  bucket.set(model, entry);
}

function tokenUsageBucketToItems(bucket: Map<string, TokenUsageBucket>): ModelTokenUsageItem[] {
  return Array.from(bucket.entries())
    .map(([model, usage]) => ({
      model,
      tokens: usage.tokens,
      unitPrice: usage.unitPrice,
      cost: Math.round(usage.costSum * 100) / 100,
    }))
    .filter((item) => item.tokens > 0)
    .sort((a, b) => b.tokens - a.tokens);
}

/** 从 sop_nodes 提取各 model 的 tokens，单价由 model 静态映射 */
function extractTokenUsageFromSopNodes(
  sopNodes: RdViewSopNodeRecord[] | null | undefined,
): ModelTokenUsageItem[] {
  if (!Array.isArray(sopNodes)) return [];

  const bucket = new Map<string, TokenUsageBucket>();
  for (const node of sopNodes) {
    const model = String(node.model ?? '').trim();
    const tokens = node.tokens;
    if (!model || typeof tokens !== 'number' || !Number.isFinite(tokens) || tokens <= 0) {
      continue;
    }
    accumulateTokenUsageBucket(bucket, model, tokens);
  }

  return tokenUsageBucketToItems(bucket);
}

/** 跨工单按 model 合并：Token 累加，成本按映射单价重算 */
function mergeTokenUsageByModel(items: ModelTokenUsageItem[]): ModelTokenUsageItem[] {
  const bucket = new Map<string, TokenUsageBucket>();
  for (const item of items) {
    accumulateTokenUsageBucket(bucket, item.model, item.tokens);
  }
  return tokenUsageBucketToItems(bucket);
}

const PRIORITY_SORT_WEIGHT: Record<DemandPriorityLevel, number> = {
  非常紧急: 0,
  紧急: 1,
  普通: 2,
  较低: 3,
};

const NO_PRIORITY_SORT_WEIGHT = 4;

/** 门户 priority 仅返回 `1`~`4`；其它值不展示优先级圆点 */
function parseDemandPriority(priority: unknown): DemandPriorityLevel | undefined {
  if (priority == null || priority === '') return undefined;

  const code = typeof priority === 'number' ? String(priority) : String(priority).trim();
  switch (code) {
    case '1':
      return '较低';
    case '2':
      return '普通';
    case '3':
      return '紧急';
    case '4':
      return '非常紧急';
    default:
      return undefined;
  }
}

function prioritySortWeight(priority?: DemandPriorityLevel): number {
  if (!priority) return NO_PRIORITY_SORT_WEIGHT;
  return PRIORITY_SORT_WEIGHT[priority];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === 'object' && !Array.isArray(value);
}

function normalizeDemandRecord(raw: unknown): RdViewDemandRecord | null {
  if (!isRecord(raw)) return null;

  const demandNo = String(raw.demand_no ?? '').trim();
  const demandTitle = String(raw.demand_title ?? '').trim();
  if (!demandNo || !demandTitle) return null;

  const sopRaw = raw.sop_nodes;
  const sop_nodes = Array.isArray(sopRaw)
    ? sopRaw.filter(isRecord).map((node) => ({ ...node } as RdViewSopNodeRecord))
    : [];

  return {
    ...raw,
    demand_no: demandNo,
    demand_title: demandTitle,
    sop_nodes,
  } as RdViewDemandRecord;
}

function createEmptyKpiCards(): KpiItem[] {
  return KPI_CARD_SHELLS.map((shell) => ({
    ...shell,
    value: shell.key === 'assistantOutput' ? '' : '--',
  }));
}

function createEmptyMetricDetails(): RdViewMetricDetails {
  return {
    efficiencyGain: [],
    aiCoverage: [],
    orderCoverage: [],
    satisfaction: [],
    tokenConsumed: [],
    assistantOutput: [],
  };
}

// ---------------------------------------------------------------------------
// 接收数据
// ---------------------------------------------------------------------------

/**
 * 【接收数据】把 rd_view 接口原始 JSON 转为统一的工单列表结构。
 * 支持 `data[]` 与 `data.demands[]` 两种响应形状。
 */
export function receiveRdViewDemandsPayload(raw: unknown): RdViewDemandsPayload {
  if (!isRecord(raw)) {
    return { code: -1, message: 'invalid payload', data: [] };
  }

  const nested = raw.data;
  let listRaw: unknown[] = [];

  if (Array.isArray(nested)) {
    listRaw = nested;
  } else if (isRecord(nested) && Array.isArray(nested.demands)) {
    listRaw = nested.demands;
  }

  const data = listRaw
    .map(normalizeDemandRecord)
    .filter((item): item is RdViewDemandRecord => item != null);

  return {
    code: typeof raw.code === 'number' ? raw.code : 0,
    message: typeof raw.message === 'string' ? raw.message : '',
    total: typeof raw.total === 'number' ? raw.total : data.length,
    data,
  };
}

// ---------------------------------------------------------------------------
// 六个指标：单条工单 → 明细项（各指标独立方法，取值规则后续填充）
// ---------------------------------------------------------------------------

/**
 * 指标 1 — 工单处理提效程度
 * 已实现：local_process_state=已完成；manualHours=llm_estimated_hours；aiHours=Σ duration_hours
 */
function buildEfficiencyGainItemFromDemand(
  demand: RdViewDemandRecord,
): OrderEfficiencyDetailItem | null {
  if (!isCompletedLocalProcessState(demand.local_process_state)) {
    return null;
  }

  const manualHours = demand.llm_estimated_hours ?? 0;
  const aiHours = sumSopNodeDurationHours(demand.sop_nodes);

  if (manualHours <= 0 || aiHours <= 0) {
    return null;
  }

  return {
    id: demand.demand_no,
    title: demand.demand_title,
    aiHours: roundHours(aiHours),
    manualHours: roundHours(manualHours),
  };
}

/** 指标 2 按 assignee_id 分组时的累加桶 */
interface AiCoverageBucket {
  name: string;
  totalOrders: number;
  aiOrders: number;
}

function isAiProcessingMode(mode: unknown): boolean {
  return String(mode ?? '').trim().toLowerCase() === 'ai';
}

/** 除「智能助手使用率」外，其余 KPI / 饼图仅统计 AI 工单 */
function isAiDemand(demand: RdViewDemandRecord): boolean {
  return isAiProcessingMode(demand.processing_mode);
}

/**
 * 指标 2 — 智能研发覆盖率：单条工单累加到按 assignee_id 分组的分桶。
 *
 * - 分组键：`assignee_id`（缺省则回退 assignee / unknown）
 * - `name`：`assignee` 展示名
 * - `processing_mode === 'ai'` → aiOrders + 1
 * - `processing_mode === 'manual'` → 仅 totalOrders + 1（人工单，UI 侧 manualOrders = total - ai）
 * - 每条工单 totalOrders 均 + 1
 */
function accumulateAiCoverageFromDemand(
  bucket: Map<string, AiCoverageBucket>,
  demand: RdViewDemandRecord,
): void {
  const assigneeId =
    String(demand.assignee_id ?? '').trim() ||
    String(demand.assignee ?? '').trim() ||
    'unknown';
  const assigneeName = String(demand.assignee ?? '').trim() || assigneeId;

  const entry = bucket.get(assigneeId) ?? {
    name: assigneeName,
    totalOrders: 0,
    aiOrders: 0,
  };

  if (assigneeName && (entry.name === assigneeId || !entry.name)) {
    entry.name = assigneeName;
  }

  entry.totalOrders += 1;
  if (isAiProcessingMode(demand.processing_mode)) {
    entry.aiOrders += 1;
  }

  bucket.set(assigneeId, entry);
}

/**
 * 指标 3 — 需求工单覆盖率（单条工单层）
 *
 * - 仅 `local_process_state === '已完成'` 的工单进入明细
 * - `covered`：`processing_mode === 'ai'`
 * - 遍历全部 sop_nodes，按 model 聚合 tokens / hours → `modelUsages`
 * - 主展示取 tokens 最高的一项；hover 展示全部
 */
function buildOrderCoverageItemFromDemand(
  demand: RdViewDemandRecord,
): OrderCoverageDetailItem | null {
  if (!isCompletedLocalProcessState(demand.local_process_state)) {
    return null;
  }

  const covered = isAiProcessingMode(demand.processing_mode);
  const modelUsages = covered ? aggregateSopNodeUsageByModel(demand.sop_nodes) : [];

  const item: OrderCoverageDetailItem = {
    id: demand.demand_no,
    title: demand.demand_title,
    covered,
  };

  const priority = parseDemandPriority(demand.priority);
  if (priority) {
    item.priority = priority;
  }

  if (modelUsages.length > 0) {
    item.modelUsages = modelUsages;
  }

  return item;
}

/** `reaction` → 是否点踩；2=点踩，其余/空视为满意 */
function isReactionDisliked(reaction: unknown): boolean {
  if (reaction == null || reaction === '') return false;
  const num = typeof reaction === 'number' ? reaction : Number(String(reaction).trim());
  return Number.isFinite(num) && num === 2;
}

/**
 * 指标 4 — 工单处理质量（单条工单层）
 *
 * - 仅 `local_process_state === '已完成'` 的工单进入明细
 * - 仅读 `reaction`：2=点踩，无点踩（含未评价、点赞）均计为满意
 */
function buildSatisfactionItemFromDemand(
  demand: RdViewDemandRecord,
): OrderSatisfactionDetailItem | null {
  if (!isCompletedLocalProcessState(demand.local_process_state)) {
    return null;
  }

  const item: OrderSatisfactionDetailItem = {
    id: demand.demand_no,
    title: demand.demand_title,
    liked: !isReactionDisliked(demand.reaction),
  };

  const priority = parseDemandPriority(demand.priority);
  if (priority) {
    item.priority = priority;
  }

  return item;
}

/**
 * 指标 5 — Token 总消耗（单条工单层）
 *
 * - 仅 `local_process_state === '已完成'`
 * - 遍历 sop_nodes，按 model 聚合 tokens；单价由 MODEL_UNIT_PRICE_CATALOG 映射
 */
function buildTokenConsumedItemsFromDemand(demand: RdViewDemandRecord): ModelTokenUsageItem[] {
  if (!isCompletedLocalProcessState(demand.local_process_state)) {
    return [];
  }
  return extractTokenUsageFromSopNodes(demand.sop_nodes);
}

function parseNonNegativeInt(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value) && value >= 0) {
    return Math.floor(value);
  }
  const text = String(value ?? '').trim();
  if (!text) return 0;
  const num = Number(text);
  if (Number.isFinite(num) && num >= 0) return Math.floor(num);
  return 0;
}

function countArtifactDocuments(files: unknown): number {
  if (!Array.isArray(files)) return 0;

  return files.filter((raw) => {
    if (!isRecord(raw)) return false;
    const type = String(raw.type ?? 'document').trim().toLowerCase();
    return type === 'document';
  }).length;
}

function collectRepoOutputsFromNode(node: RdViewSopNodeRecord): RdViewRepoOutputRecord[] {
  const list: RdViewRepoOutputRecord[] = [];

  if (Array.isArray(node.repo_outputs)) {
    list.push(...node.repo_outputs);
  }

  const single = node.repo_output;
  if (Array.isArray(single)) {
    list.push(...single);
  } else if (single != null && isRecord(single)) {
    list.push(single as RdViewRepoOutputRecord);
  }

  return list;
}

function mapRepoOutputsFromSopNode(
  node: RdViewSopNodeRecord,
): WorkOrderSopNode['repoOutputs'] {
  return collectRepoOutputsFromNode(node)
    .map((output) => {
      const repoName = String(output.repo_name ?? '').trim();
      const repoUrl = String(output.repo_url ?? '').trim();
      if (!repoName && !repoUrl) return null;

      return {
        repoName: repoName || repoUrl,
        repoUrl,
        branch: String(output.branch ?? '').trim(),
        linesAdded: parseNonNegativeInt(output.lines_added),
        linesDeleted: parseNonNegativeInt(output.lines_deleted),
        commitCount: parseNonNegativeInt(output.commit_count),
      };
    })
    .filter((item): item is WorkOrderSopNode['repoOutputs'][number] => item != null);
}

function sumRepoOutputLineChanges(outputs: RdViewRepoOutputRecord[]): number {
  return outputs.reduce((sum, output) => {
    const added = parseNonNegativeInt(output.lines_added);
    const deleted = parseNonNegativeInt(output.lines_deleted);
    return sum + added + deleted;
  }, 0);
}

function accumulateOutputFromSopNodes(
  sopNodes: RdViewSopNodeRecord[] | null | undefined,
): { docCount: number; codeCount: number } {
  if (!Array.isArray(sopNodes)) {
    return { docCount: 0, codeCount: 0 };
  }

  let docCount = 0;
  let codeCount = 0;

  for (const node of sopNodes) {
    docCount += countArtifactDocuments(node.artifact_files);
    codeCount += sumRepoOutputLineChanges(collectRepoOutputsFromNode(node));
  }

  return { docCount, codeCount };
}

/**
 * 指标 6 — 研发助手产出（单条工单层 → 按 product_name 贡献）
 *
 * - 仅 `local_process_state === '已完成'`
 * - 遍历 sop_nodes：`artifact_files` 累加文档数量（type=document）
 * - `repo_outputs` / `repo_output` 累加 lines_added + lines_deleted
 */
function buildAssistantOutputContributionFromDemand(
  demand: RdViewDemandRecord,
): ProductAssistantOutputItem | null {
  if (!isCompletedLocalProcessState(demand.local_process_state)) {
    return null;
  }

  const productName = String(demand.product_name ?? '').trim();
  if (!productName) return null;

  const { docCount, codeCount } = accumulateOutputFromSopNodes(demand.sop_nodes);
  if (docCount <= 0 && codeCount <= 0) return null;

  return { productName, docCount, codeCount };
}

// ---------------------------------------------------------------------------
// 六个指标：明细列表汇总（遍历结果 → list，TODO：部分指标需二次聚合）
// ---------------------------------------------------------------------------

function buildEfficiencyGainDetailList(items: OrderEfficiencyDetailItem[]): OrderEfficiencyDetailItem[] {
  return items;
}

function buildAiCoverageDetailList(bucket: Map<string, AiCoverageBucket>): PersonAiCoverageItem[] {
  return Array.from(bucket.values()).sort((a, b) => b.aiOrders - a.aiOrders);
}


function buildOrderCoverageDetailList(items: OrderCoverageDetailItem[]): OrderCoverageDetailItem[] {
  return [...items].sort((a, b) => {
    // 按照优先级进行排序
    const priorityDiff = prioritySortWeight(a.priority) - prioritySortWeight(b.priority);
    if (priorityDiff !== 0) return priorityDiff;
    return a.title.localeCompare(b.title, 'zh-CN');
  });
}

function buildSatisfactionDetailList(items: OrderSatisfactionDetailItem[]): OrderSatisfactionDetailItem[] {
  return [...items].sort((a, b) => {
    const priorityDiff = prioritySortWeight(a.priority) - prioritySortWeight(b.priority);
    if (priorityDiff !== 0) return priorityDiff;
    return a.title.localeCompare(b.title, 'zh-CN');
  });
}

function buildTokenConsumedDetailList(items: ModelTokenUsageItem[]): ModelTokenUsageItem[] {
  return mergeTokenUsageByModel(items);
}

function buildAssistantOutputDetailList(items: ProductAssistantOutputItem[]): ProductAssistantOutputItem[] {
  const bucket = new Map<string, { docCount: number; codeCount: number }>();

  for (const item of items) {
    const entry = bucket.get(item.productName) ?? { docCount: 0, codeCount: 0 };
    entry.docCount += item.docCount;
    entry.codeCount += item.codeCount;
    bucket.set(item.productName, entry);
  }

  return Array.from(bucket.entries())
    .map(([productName, counts]) => ({
      productName,
      docCount: counts.docCount,
      codeCount: counts.codeCount,
    }))
    .sort((a, b) => a.productName.localeCompare(b.productName, 'zh-CN'));
}

// ---------------------------------------------------------------------------
// 六个指标：KPI 卡片 value / trend
// ---------------------------------------------------------------------------

/** 从明细聚合可比较的 KPI 数值（本期/上期共用） */
export interface RdViewKpiMetricValues {
  efficiencyGain: number;
  aiCoverage: number;
  orderCoverage: number;
  satisfaction: number;
  tokenConsumed: number;
  assistantOutputTotal: number;
}

export function extractKpiMetricValues(details: RdViewMetricDetails): RdViewKpiMetricValues {
  const output = sumAssistantOutput(details.assistantOutput);
  return {
    efficiencyGain: calcAverageOrderEfficiencyGain(details.efficiencyGain),
    aiCoverage: calcAverageAiCoverageRate(details.aiCoverage),
    orderCoverage: calcAverageOrderCoverageRate(details.orderCoverage),
    satisfaction: calcOrderSatisfactionScore(details.satisfaction),
    tokenConsumed: calcTotalTokens(details.tokenConsumed),
    assistantOutputTotal: output.docCount + output.codeCount,
  };
}

function calcRelativePercentTrend(current: number, previous: number): number {
  if (previous === 0) return current > 0 ? 100 : 0;
  return Math.round(((current - previous) / previous) * 100);
}

function applyKpiTrends(
  cards: KpiItem[],
  current: RdViewKpiMetricValues,
  previous: RdViewKpiMetricValues,
  timeRange: TimeRange,
): void {
  const trendLabel = getTimeRangeTrendLabel(timeRange);
  const updates: Array<{ key: RdViewKpiMetricKey; trend: number }> = [
    { key: 'efficiencyGain', trend: current.efficiencyGain - previous.efficiencyGain },
    { key: 'aiCoverage', trend: current.aiCoverage - previous.aiCoverage },
    { key: 'orderCoverage', trend: current.orderCoverage - previous.orderCoverage },
    {
      key: 'satisfaction',
      trend: Math.round((current.satisfaction - previous.satisfaction) * 10) / 10,
    },
    { key: 'tokenConsumed', trend: calcRelativePercentTrend(current.tokenConsumed, previous.tokenConsumed) },
    { key: 'assistantOutput', trend: current.assistantOutputTotal - previous.assistantOutputTotal },
  ];

  for (const { key, trend } of updates) {
    const card = cards.find((item) => item.key === key);
    if (!card) continue;
    card.trend = trend;
    card.trendLabel = trendLabel;
  }
}

function buildKpiCardsFromDetails(details: RdViewMetricDetails): KpiItem[] {
  const cards = createEmptyKpiCards();
  const efficiencyGainCard = cards.find((item) => item.key === 'efficiencyGain');
  if (efficiencyGainCard && details.efficiencyGain.length > 0) {
    efficiencyGainCard.value = `${calcAverageOrderEfficiencyGain(details.efficiencyGain)}%`;
  }
  const aiCoverageCard = cards.find((item) => item.key === 'aiCoverage');
  if (aiCoverageCard && details.aiCoverage.length > 0) {
    aiCoverageCard.value = `${calcAverageAiCoverageRate(details.aiCoverage)}%`;
  }
  const orderCoverageCard = cards.find((item) => item.key === 'orderCoverage');
  if (orderCoverageCard && details.orderCoverage.length > 0) {
    orderCoverageCard.value = `${calcAverageOrderCoverageRate(details.orderCoverage)}%`;
  }
  const satisfactionCard = cards.find((item) => item.key === 'satisfaction');
  if (satisfactionCard && details.satisfaction.length > 0) {
    satisfactionCard.value = formatOrderSatisfactionScore(
      calcOrderSatisfactionScore(details.satisfaction),
    );
  }
  const tokenConsumedCard = cards.find((item) => item.key === 'tokenConsumed');
  if (tokenConsumedCard && details.tokenConsumed.length > 0) {
    tokenConsumedCard.value = formatTotalTokens(calcTotalTokens(details.tokenConsumed));
  }
  const assistantOutputCard = cards.find((item) => item.key === 'assistantOutput');
  if (assistantOutputCard && details.assistantOutput.length > 0) {
    const summary = sumAssistantOutput(details.assistantOutput);
    assistantOutputCard.value = `${summary.docCount}/${summary.codeCount}`;
  }
  return cards;
}

// ---------------------------------------------------------------------------
// 遍历入口
// ---------------------------------------------------------------------------

/**
 * 【遍历数据】遍历 payload 中全部工单，调用六个指标的 build 方法，返回 KPI 空壳 + 明细列表。
 *
 * @example
 * const payload = await fetchRdViewTeamOverview(synapseApiBase, 'week');
 * const result = buildRdViewDashboardFromRaw(payload);
 * result.kpiCards;           // 6 张 KPI 卡片
 * result.details.efficiencyGain; // 提效明细（已实现）
 */
export function traverseRdViewDemands(payload: RdViewDemandsPayload): RdViewDashboardResult {
  const list = payload.data ?? [];

  const efficiencyGainRaw: OrderEfficiencyDetailItem[] = [];
  const aiCoverageBucket = new Map<string, AiCoverageBucket>();
  const orderCoverageRaw: OrderCoverageDetailItem[] = [];
  const satisfactionRaw: OrderSatisfactionDetailItem[] = [];
  const tokenConsumedRaw: ModelTokenUsageItem[] = [];
  const assistantOutputRaw: ProductAssistantOutputItem[] = [];
  const demandStatusBucket = createEmptyDemandStatusBucket();
  const personWorkloadBucket = new Map<string, PersonWorkloadBucket>();
  const personCostUsageBucket = new Map<string, PersonCostUsageBucket>();
  const workOrdersRaw: WorkOrderTicket[] = [];

  for (const demand of list) {
    // 指标 2 — 智能助手使用率：全部工单（含人工）参与统计
    accumulateAiCoverageFromDemand(aiCoverageBucket, demand);

    // 指标 1/3/4/5/6 及饼图：仅 processing_mode === 'ai'
    if (!isAiDemand(demand)) continue;

    // 工单提效明细
    const efficiencyItem = buildEfficiencyGainItemFromDemand(demand);
    if (efficiencyItem) efficiencyGainRaw.push(efficiencyItem);

    // 需求工单覆盖明细
    const orderCoverageItem = buildOrderCoverageItemFromDemand(demand);
    if (orderCoverageItem) orderCoverageRaw.push(orderCoverageItem);

    // 工单处理满意度明细
    const satisfactionItem = buildSatisfactionItemFromDemand(demand);
    if (satisfactionItem) satisfactionRaw.push(satisfactionItem);

    // token消耗
    const tokenItems = buildTokenConsumedItemsFromDemand(demand);
    if (tokenItems.length > 0) tokenConsumedRaw.push(...tokenItems);

    // 研发助手产出
    const outputItem = buildAssistantOutputContributionFromDemand(demand);
    if (outputItem) assistantOutputRaw.push(outputItem);

    // 总需求状态分布（饼图）
    accumulateDemandStatusFromDemand(demandStatusBucket, demand);

    // 人员工作量
    accumulatePersonWorkloadFromDemand(personWorkloadBucket, demand);

    // 需求耗时 & 成本
    accumulatePersonCostUsageFromDemand(personCostUsageBucket, demand);

    // 工作内容
    workOrdersRaw.push(buildWorkOrderTicketFromDemand(demand));
  }

  const details: RdViewMetricDetails = {
    efficiencyGain: buildEfficiencyGainDetailList(efficiencyGainRaw),
    aiCoverage: buildAiCoverageDetailList(aiCoverageBucket),
    orderCoverage: buildOrderCoverageDetailList(orderCoverageRaw),
    satisfaction: buildSatisfactionDetailList(satisfactionRaw),
    tokenConsumed: buildTokenConsumedDetailList(tokenConsumedRaw),
    assistantOutput: buildAssistantOutputDetailList(assistantOutputRaw),
  };

  return {
    kpiCards: buildKpiCardsFromDetails(details),
    details,
    demandStatus: buildDemandStatusDistribution(demandStatusBucket),
    personWorkload: buildPersonWorkloadList(personWorkloadBucket),
    personCostUsage: buildPersonCostUsageList(personCostUsageBucket),
    workOrders: buildWorkOrderList(workOrdersRaw),
  };
}

/** 接收 + 遍历一步完成 */
export function buildRdViewDashboardFromRaw(raw: unknown): RdViewDashboardResult {
  return traverseRdViewDemands(receiveRdViewDemandsPayload(raw));
}

/** 本期数据 + 上期数据 → 仪表盘（含 KPI 环比） */
export function buildRdViewDashboardWithTrend(
  currentRaw: unknown,
  previousRaw: unknown,
  timeRange: TimeRange,
): RdViewDashboardResult {
  const result = buildRdViewDashboardFromRaw(currentRaw);
  const previousDetails = traverseRdViewDemands(receiveRdViewDemandsPayload(previousRaw)).details;
  applyKpiTrends(
    result.kpiCards,
    extractKpiMetricValues(result.details),
    extractKpiMetricValues(previousDetails),
    timeRange,
  );
  return result;
}
