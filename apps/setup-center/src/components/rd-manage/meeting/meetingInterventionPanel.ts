import { ALL_NODES, type NodeType } from '../../../rd-sop/constants';

export type InterventionPanelKind =
  | 'solution_review'
  | 'func_solution_review'
  | 'task_exec'
  | 'node_review'
  | 'leader_review_panel'
  | 'hitl'
  | 'prod_selection'
  | 'auto_split_choice';

/** 协同型（ai_human）节点完成门控使用的专用面板（与后端 intervention_panel 对齐） */
const COLLAB_DEDICATED_PANEL: Record<string, InterventionPanelKind> = {
  solution_review: 'solution_review',
  func_solution: 'func_solution_review',
  task_exec: 'task_exec',
  diff_analysis: 'task_exec',
  // leader_review 使用独立评审面板，区别于普通的 node_review 确认总结
  leader_review: 'leader_review_panel',
};

export function collabDedicatedPanel(nodeId: string): InterventionPanelKind | null {
  return COLLAB_DEDICATED_PANEL[(nodeId || '').trim()] ?? null;
}

export function nodeTypeForId(
  nodeId: string,
  explicit?: NodeType | string,
): NodeType | undefined {
  if (explicit) return explicit as NodeType;
  return ALL_NODES.find((n) => n.id === (nodeId || '').trim())?.type;
}

/** 协同型节点（ai_human）禁止配置协作智能体阵容。 */
export function collaborationWorkersConfigurable(
  nodeType: NodeType | string | undefined,
): boolean {
  return nodeType !== 'ai_human' && nodeType !== 'system';
}

/** 仅人工主导节点可在配置里开关「人工确认」。 */
export function humanConfirmSwitchVisible(nodeType: NodeType | string | undefined): boolean {
  return nodeType === 'human' || nodeType === 'human_start' || nodeType === 'human_multi' || nodeType === 'ai_exception';
}

/** 按 SOP 节点类型计算有效的人工确认（与后端 binding 对齐）。 */
export function effectiveHumanConfirmByType(
  nodeType: NodeType | string | undefined,
  override?: boolean | null,
  bindingDefault?: boolean,
): boolean {
  if (nodeType === 'system' || nodeType === 'ai') return false;
  if (nodeType === 'ai_human') return true;
  if (override !== undefined && override !== null) return Boolean(override);
  return Boolean(bindingDefault);
}

export type MeetingInterventionRoomSlice = {
  status?: string;
  currentNode?: string;
  interventionKind?: string | null;
  interventionPanel?: string | null;
  hitlFormSchema?: unknown;
  hitlLocked?: boolean;
  reviewPayload?: { node_id?: string } | null;
  solutionReviewPayload?: unknown;
  funcSolutionReviewPayload?: unknown;
  funcSolutionBlocked?: boolean;
  taskExecPayload?: unknown;
  autoSplitChoicePayload?: AutoSplitChoicePayload | null;
  /** pending_delivery.node_id：人工门控所属 SOP 节点（优先于 currentNode） */
  hitlPendingNodeId?: string | null;
};

export type AutoSplitChoicePayload = {
  demand_no?: string;
  existing_task_count?: number;
  existing_tasks?: Array<{
    task_no?: string;
    task_title?: string;
    sop_node?: string;
    local_process_state?: string;
    product_module_name?: string;
  }>;
};

const INTERVENTION_KIND_LABELS: Record<string, string> = {
  solution_review: '方案评审',
  func_solution_review: '函数级方案评审',
  task_exec: '任务执行评审',
  diff_analysis: '试飞优化评审',
  result_confirm: '结果确认',
  interactive: '会中澄清',
  exception: '异常裁决',
  gate: '流程门控',
  prod_selection: '选择产品',
  auto_split_choice: '拆单策略',
};

export function interventionKindLabel(kind: string | null | undefined): string {
  const k = (kind || '').trim().toLowerCase();
  return INTERVENTION_KIND_LABELS[k] || k || '人工处理';
}

/**
 * 人工确认 Tab / 高亮应绑定的 SOP 节点。
 * 方案评审必须用 pending_delivery.node_id，不能误用上一节点的 review_payload.node_id。
 */
export function resolveHitlTargetNodeId(room: MeetingInterventionRoomSlice): string {
  const pendingNid = (room.hitlPendingNodeId || '').trim();
  const current = (room.currentNode || '').trim();
  const kind = (room.interventionKind || '').trim().toLowerCase();
  const panel = (room.interventionPanel || '').trim();

  if (kind === 'prod_selection' || panel === 'prod_selection') {
    return current || 'pending';
  }

  if (kind === 'auto_split_choice' || panel === 'auto_split_choice') {
    return current || 'auto_split';
  }

  if (
    kind === 'task_exec' ||
    panel === 'task_exec' ||
    pendingNid === 'diff_analysis' ||
    current === 'diff_analysis'
  ) {
    return pendingNid === 'diff_analysis' || current === 'diff_analysis'
      ? 'diff_analysis'
      : pendingNid || current || 'task_exec';
  }

  if (
    kind === 'solution_review' ||
    panel === 'solution_review' ||
    room.solutionReviewPayload
  ) {
    return pendingNid || current || 'solution_review';
  }

  if (
    kind === 'func_solution_review' ||
    panel === 'func_solution_review' ||
    room.funcSolutionReviewPayload
  ) {
    return pendingNid || current || 'func_solution';
  }

  if (
    kind === 'interactive' ||
    kind === 'exception' ||
    room.hitlFormSchema
  ) {
    return pendingNid || current;
  }

  if (panel === 'node_review' || kind === 'result_confirm') {
    const fromReview = (room.reviewPayload?.node_id || '').trim();
    return fromReview || pendingNid || current;
  }

  if (kind === 'interactive' || kind === 'exception' || room.hitlFormSchema) {
    return pendingNid || current;
  }

  const fromReview = (room.reviewPayload?.node_id || '').trim();
  return pendingNid || fromReview || current;
}

function resolveCollabDedicatedPanel(
  nodeType: NodeType | string | undefined,
  nodeId: string,
  kind: string,
): InterventionPanelKind | null {
  if (nodeType !== 'ai_human') return null;
  if (kind === 'interactive' || kind === 'exception') return null;
  return collabDedicatedPanel(nodeId);
}

/**
 * 中栏「人工确认」Tab 应渲染的面板。
 * 优先使用 live 下发的 intervention_panel；否则按节点类型 + intervention_kind 推断。
 */
export function resolveMeetingInterventionPanel(
  room: MeetingInterventionRoomSlice,
  nodeType: NodeType | string | undefined,
  nodeId: string,
): InterventionPanelKind | null {
  if (room.status !== 'human_intervention' || room.hitlLocked) return null;

  const panel = (room.interventionPanel || '').trim();
  if (
    panel === 'solution_review' ||
    panel === 'func_solution_review' ||
    panel === 'task_exec' ||
    panel === 'node_review' ||
    panel === 'leader_review_panel' ||
    panel === 'hitl' ||
    panel === 'prod_selection' ||
    panel === 'auto_split_choice'
  ) {
    return panel as InterventionPanelKind;
  }

  const kind = (room.interventionKind || '').toLowerCase();
  if (kind === 'prod_selection') {
    return 'prod_selection';
  }
  if (kind === 'auto_split_choice') {
    return 'auto_split_choice';
  }
  const nid = (nodeId || room.currentNode || '').trim();
  const pendingNid = (room.hitlPendingNodeId || '').trim();
  const resolvedType = nodeTypeForId(nid, nodeType);

  if (
    kind === 'task_exec' ||
    room.taskExecPayload ||
    nid === 'diff_analysis' ||
    pendingNid === 'diff_analysis'
  ) {
    return 'task_exec';
  }

  if (kind === 'solution_review' || room.solutionReviewPayload) {
    return 'solution_review';
  }
  if (kind === 'func_solution_review' || room.funcSolutionReviewPayload) {
    return 'func_solution_review';
  }

  const collabPanel = resolveCollabDedicatedPanel(resolvedType, nid, kind);
  if (collabPanel) {
    return collabPanel;
  }

  if (
    (kind === 'interactive' || kind === 'exception' || room.hitlFormSchema) &&
    humanConfirmSwitchVisible(resolvedType)
  ) {
    return 'hitl';
  }

  if (kind === 'result_confirm' || room.reviewPayload) {
    return 'node_review';
  }

  if (resolvedType === 'ai_human') {
    if (room.reviewPayload) return 'node_review';
  }

  if (room.hitlFormSchema && resolvedType !== 'ai_human' && resolvedType !== 'ai') {
    return 'hitl';
  }

  return null;
}
