import type { RequirementStatus, SopNodeRunStatus, WorkOrderSopNode, WorkOrderTicket } from '@rd-view/types';
import {
  RD_VIEW_RUN_STATUS_LABEL,
  isInProgressAccentRunStatus,
} from '@rd-view/data/buildOrderEfficiencyDetail';
/** 工单至今经过的时间文案 */
export function formatElapsedSince(isoDate: string): string {
  const diffMs = Math.max(0, Date.now() - new Date(isoDate).getTime());
  const hours = Math.floor(diffMs / (1000 * 60 * 60));

  if (hours < 1) {
    const minutes = Math.max(1, Math.floor(diffMs / (1000 * 60)));
    return `${minutes}分钟`;
  }
  if (hours < 24) {
    return `${hours}小时`;
  }

  const days = Math.floor(hours / 24);
  const remainHours = hours % 24;
  if (remainHours === 0) {
    return `${days}天`;
  }
  return `${days}天${remainHours}小时`;
}

export function formatDateTime(isoDate: string): string {
  const date = new Date(isoDate);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** local_process_state → 卡片主状态文案（schema §1.4） */
const LOCAL_PROCESS_STATE_LABEL: Record<string, string> = {
  待处理: '待处理',
  预备中: '待处理',
  待定: '待处理',
  处理中: '在途',
  待人工: '在途',
  全人工: '在途',
  异常: '在途',
  已完成: '完成',
};

export type WorkOrderCardTone = RequirementStatus | 'error' | 'manual' | 'stopped';
export type WorkOrderStatusTagVariant = WorkOrderCardTone;

export type WorkOrderNodeTagVariant = 'manual' | 'error' | 'stopped';

export interface WorkOrderStatusPresentation {
  /** 顶部状态标签 */
  label: string;
  headerTagVariant: WorkOrderStatusTagVariant;
  cardTone: WorkOrderCardTone;
  currentNodeTag?: {
    variant: WorkOrderNodeTagVariant;
    runStatusLabel: string;
  };
}

function resolveBaseProcessLabel(localProcessState: string, status: RequirementStatus): string {
  const text = localProcessState.trim();
  if (text && LOCAL_PROCESS_STATE_LABEL[text]) {
    return LOCAL_PROCESS_STATE_LABEL[text];
  }
  if (status === 'completed') return '完成';
  if (status === 'pending') return '待处理';
  return '在途';
}

function resolveHeaderLabel(
  localProcessState: string,
  status: RequirementStatus,
  runStatus?: SopNodeRunStatus,
): string {
  if (status === 'inProgress' && isInProgressAccentRunStatus(runStatus)) {
    return RD_VIEW_RUN_STATUS_LABEL[runStatus];
  }
  return resolveBaseProcessLabel(localProcessState, status);
}

function resolveCardTone(
  status: RequirementStatus,
  runStatus?: SopNodeRunStatus,
): WorkOrderCardTone {
  if (status === 'completed') return 'completed';
  if (status === 'pending') return 'pending';
  if (status !== 'inProgress' || !runStatus) return 'inProgress';

  if (runStatus === 'failed') return 'error';
  if (runStatus === 'human_intervention') return 'manual';
  if (runStatus === 'stopped') return 'stopped';
  return 'inProgress';
}

function resolveNodeTagVariant(runStatus: SopNodeRunStatus): WorkOrderNodeTagVariant {
  if (runStatus === 'failed') return 'error';
  if (runStatus === 'stopped') return 'stopped';
  return 'manual';
}

function shouldShowCurrentNodeTag(
  status: RequirementStatus,
  runStatus?: SopNodeRunStatus,
): runStatus is 'human_intervention' | 'failed' | 'stopped' {
  return status === 'inProgress' && isInProgressAccentRunStatus(runStatus);
}

/** 由需求表1 local_process_state + run_status 映射卡片状态展示 */
export function buildWorkOrderStatusPresentation(ticket: WorkOrderTicket): WorkOrderStatusPresentation {
  const runStatus = ticket.currentRunStatus;
  const cardTone = resolveCardTone(ticket.status, runStatus);
  const label = resolveHeaderLabel(ticket.localProcessState ?? '', ticket.status, runStatus);

  const currentNodeTag =
    shouldShowCurrentNodeTag(ticket.status, runStatus) && ticket.currentNodeName
      ? {
          variant: resolveNodeTagVariant(runStatus),
          runStatusLabel: RD_VIEW_RUN_STATUS_LABEL[runStatus],
        }
      : undefined;

  return {
    label,
    headerTagVariant: cardTone,
    cardTone,
    currentNodeTag: currentNodeTag?.runStatusLabel ? currentNodeTag : undefined,
  };
}

/** 工作内容卡片：取当前活跃 SOP 节点（详情抽屉等） */
export function getActiveSopNode(ticket: WorkOrderTicket): WorkOrderSopNode | undefined {
  if (ticket.status === 'pending') return undefined;
  if (ticket.status === 'completed') {
    return ticket.sopNodes[ticket.sopNodes.length - 1];
  }
  return (
    ticket.sopNodes.find((node) => node.status === 'inProgress')
    ?? ticket.sopNodes[ticket.sopNodes.length - 1]
  );
}
