export type TimeRange = 'day' | 'week' | 'month' | 'quarter' | 'year';

/** 核心KPI指标项 */
export interface KpiItem {
  key: string;
  title: string;
  value: string;
  trend: number;
  trendLabel: string;
  isPositive: boolean;
  isWarning?: boolean;
}

/** 工单提效明细（同一工单：AI耗时 vs 人工耗时二选一对比） */
export interface OrderEfficiencyDetailItem {
  id: string;
  title: string;
  /** 走 AI 路径的实际耗时 */
  aiHours: number;
  /** 同一条工单改人工做的参考耗时 */
  manualHours: number;
}

export interface OrderEfficiencyDetailView extends OrderEfficiencyDetailItem {
  efficiencyGain: number;
}

/** 人员智能助手覆盖率明细 */
export interface PersonAiCoverageItem {
  name: string;
  totalOrders: number;
  aiOrders: number;
}

export interface PersonAiCoverageView extends PersonAiCoverageItem {
  manualOrders: number;
  coverageRate: number;
}

/** 需求工单覆盖 — 单模型消耗汇总（model + tokens + hours） */
export interface OrderCoverageModelUsage {
  model: string;
  tokens: number;
  hours: number;
}

/** 需求优先级（门户枚举 `1`~`4` 对应展示文案） */
export type DemandPriorityLevel = '较低' | '普通' | '紧急' | '非常紧急';

/** 需求工单覆盖明细 */
export interface OrderCoverageDetailItem {
  id: string;
  title: string;
  /** 有值时展示优先级圆点；未传则不显示 */
  priority?: DemandPriorityLevel;
  /** 是否被智能助手覆盖 */
  covered: boolean;
  /** 各模型消耗汇总（按 tokens 降序）；主展示取第一项 */
  modelUsages?: OrderCoverageModelUsage[];
}

/** 工单处理满意度明细 */
export interface OrderSatisfactionDetailItem {
  id: string;
  title: string;
  /** 有值时展示优先级圆点；未传则不显示 */
  priority?: DemandPriorityLevel;
  /** true=满意（reaction 非 2）；false=点踩（reaction=2） */
  liked?: boolean;
}

/** 模型 Token 消耗明细 */
export interface ModelTokenUsageItem {
  model: string;
  /** 定价：元/百万Token（由 model 静态映射表模糊匹配） */
  unitPrice: number;
  /** 使用量（Token 数） */
  tokens: number;
  /** 实际成本：tokens / 1_000_000 × unitPrice 累加 */
  cost: number;
}

export type ModelTokenUsageView = ModelTokenUsageItem;

/** 研发助手产出 - 按产品 */
export interface ProductAssistantOutputItem {
  productName: string;
  docCount: number;
  codeCount: number;
}

/** 人员工作量 - 水平堆叠柱状图 */
export interface PersonDemandItem {
  name: string;
  completed: number;
  inProgress: number;
  pending: number;
}

/** 需求状态分布 - 环形图 */
export interface DemandStatusItem {
  name: string;
  value: number;
  color: string;
}

/** 人员 Token 消耗与耗时 */
export interface PersonCostUsageItem {
  name: string;
  avgHours: number;
  avgUsage: number;
}

/** 需求状态 */
export type RequirementStatus = 'pending' | 'inProgress' | 'completed' | 'archived';

/** SOP 节点 run_status（与 rd_view_demand_save / owner_order_refresh._RUN_STATUS_TO_SLUG 一致） */
export type SopNodeRunStatus =
  | 'running'
  | 'human_intervention'
  | 'completed'
  | 'failed'
  | 'stopped'
  | 'pending'
  | 'full_manual'
  | 'archived';

/** 智能体对话 */
export interface SopDialogueMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  time: string;
}

/** SOP 节点产出物 */
export interface SopNodeOutput {
  type: 'document' | 'code' | 'artifact';
  label: string;
}

/** SOP 节点代码仓库产出 */
export interface SopNodeRepoOutput {
  repoName: string;
  repoUrl: string;
  branch: string;
  linesAdded: number;
  linesDeleted: number;
  commitCount: number;
}

/** 工单 SOP 节点（含对话与消耗） */
export interface WorkOrderSopNode {
  /** 小类键（sop_node_id） */
  key: string;
  name: string;
  /** SOP 阶段大类：analysis / design / environment / development / review */
  group: string;
  /** 同 group 内顺序，从 1 起 */
  seqId: number;
  status: RequirementStatus;
  runStatus: SopNodeRunStatus;
  hours: number;
  tokens: number;
  model: string;
  description: string;
  dialogues: SopDialogueMessage[];
  outputs: SopNodeOutput[];
  repoOutputs: SopNodeRepoOutput[];
}

/** 工单评论 */
export interface WorkOrderComment {
  author: string;
  time: string;
  content: string;
}

/** 工单表情评论（feedback_type JSON 数组元素） */
export interface DemandEnjoyComment {
  assignee: string;
  assigneeId: string;
  enjoyId: string;
}

/** 团队视图当前登录用户（来自 userinfo-summary） */
export interface RdViewCurrentUser {
  employeeId: string;
  name: string;
}

/** 工作内容 - 工单 */
export interface WorkOrderTicket {
  id: string;
  title: string;
  status: RequirementStatus;
  assignee: string;
  priority: '高' | '中' | '低';
  summary: string;
  content: string;
  createdAt: string;
  updatedAt: string;
  plannedEnd: string;
  comments: WorkOrderComment[];
  /** 表情评论；来自 feedback_type JSON，enjoyId 对应 enjoyEmojiCatalog 序号 */
  enjoyComments: DemandEnjoyComment[];
  sopNodes: WorkOrderSopNode[];
  /** 表1 local_process_state 原文（需求处理状态） */
  localProcessState?: string;
  /** 表1 当前 SOP 节点展示名（demand.name，在途时用于「在途 · xxx」） */
  currentNodeName?: string;
}