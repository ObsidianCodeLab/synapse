import type { RequirementStatus, WorkOrderSopNode, WorkOrderTicket } from '@rd-view/types';

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

/** local_process_state → 工作内容卡片主状态文案（schema §1.4 + 已归档） */
const LOCAL_PROCESS_STATE_LABEL: Record<string, string> = {
  待处理: '待处理',
  预备中: '待处理',
  待定: '待处理',
  处理中: '在途',
  待人工: '在途',
  全人工: '在途',
  异常: '在途',
  已完成: '完成',
  已归档: '已归档',
  工单丢失: '工单丢失',
};

export type WorkOrderCardTone = RequirementStatus;
export type WorkOrderStatusTagVariant = WorkOrderCardTone;

export interface WorkOrderStatusPresentation {
  label: string;
  headerTagVariant: WorkOrderStatusTagVariant;
  cardTone: WorkOrderCardTone;
}

function resolveProcessLabel(localProcessState: string, status: RequirementStatus): string {
  const text = localProcessState.trim();
  if (text && LOCAL_PROCESS_STATE_LABEL[text]) {
    return LOCAL_PROCESS_STATE_LABEL[text];
  }
  if (status === 'completed') return '完成';
  if (status === 'archived') return '已归档';
  if (status === 'lost') return '工单丢失';
  if (status === 'pending') return '待处理';
  return '在途';
}

function appendInProgressSopNodeLabel(
  baseLabel: string,
  status: RequirementStatus,
  nodeName?: string,
): string {
  const node = String(nodeName ?? '').trim();
  if (status !== 'inProgress' || !node || baseLabel.includes(node)) {
    return baseLabel;
  }
  return `${baseLabel} · ${node}`;
}

/** 工作内容卡片状态：local_process_state + 在途时当前 SOP 节点名（demand.name） */
export function buildWorkOrderStatusPresentation(ticket: WorkOrderTicket): WorkOrderStatusPresentation {
  const cardTone = ticket.status;
  const baseLabel = resolveProcessLabel(ticket.localProcessState ?? '', ticket.status);
  const label = appendInProgressSopNodeLabel(baseLabel, ticket.status, ticket.currentNodeName);

  return {
    label,
    headerTagVariant: cardTone,
    cardTone,
  };
}

/** 工作内容卡片：取当前活跃 SOP 节点（详情抽屉等） */
export function getActiveSopNode(ticket: WorkOrderTicket): WorkOrderSopNode | undefined {
  if (ticket.status === 'pending') return undefined;
  if (ticket.status === 'completed' || ticket.status === 'archived') {
    return ticket.sopNodes[ticket.sopNodes.length - 1];
  }
  return (
    ticket.sopNodes.find((node) => node.status === 'inProgress')
    ?? ticket.sopNodes[ticket.sopNodes.length - 1]
  );
}
