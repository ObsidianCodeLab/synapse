import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { toast } from 'sonner';
import { ConfigProvider, theme, Badge, Avatar, Button, Drawer, Modal, Tag, Progress, Tabs, Popover, Tooltip, Collapse, Input } from 'antd';
import { motion, AnimatePresence } from 'motion/react';
import {
  GitBranch,
  Bot,
  User,
  AlertTriangle,
  CheckCircle2,
  CircleDashed,
  Play,
  TerminalSquare,
  Clock,
  Zap,
  ShieldAlert,
  MessageSquareText,
  FileCode2,
  Cpu,
  Info,
  Coins,
  FileText,
  Network,
  Code,
  TestTube,
  CheckSquare,
  Activity,
  ClipboardList,
  Flame,
  TrendingUp,
  Loader2,
  AlertCircle,
  Search,
  RefreshCw,
  ExternalLink,
  SkipForward,
} from 'lucide-react';
import {
  fetchRdManageDemands,
  syncRdManageDemandsFromDevCloud,
  fetchWorkOrderDbMetrics,
  fetchHumanInLoopFlags,
  type DemandListItem,
  type OwnedWorkItem,
  type OwnedWorkItemState,
  type RdManageDemandsPayload,
  type WorkOrderDbMetricsPayload,
} from '../../api/rdManageService';
import { markDemandMergeComplete } from '../../api/rdViewReportService';
import {
  fetchMeetingRooms,
  fetchMeetingSummary,
  fetchMeetingRoomConfig,
  fetchMeetingRoomLive,
  openMeetingRoom,
  fetchSoulInstruction,
  type MeetingRoomArchiveEntry,
  type MeetingRoomConfigPayload,
  type MeetingRoomListItem,
  type MeetingSummaryPayload,
} from '../../api/meetingRoomService';
import { setMeetingRoomFocus } from '../../rd-meeting/focus';
import {
  fetchLlmEndpointsCatalog,
  getProdInfo,
  type LlmEndpointCatalogItem,
} from '@/api/rdUnifiedService';
import type { ProdInfoWireItem, ProdProcessDataPayload } from '@/api/rdUnifiedService';
import { IS_TAURI } from '@/platform';
import { ProductDetail } from '@/components/product/ProductDetail';
import {
  Product,
  applyProcessPayloadToProduct,
  patchProductKnowledgeSlots,
  prodInfoWireToProduct,
  prodWireMatchesWorkItemModuleName,
  displayIdPipeName,
  type ProductKnowledgePatch,
} from '@/components/product/types';
import { ViewId } from '../../types';
import { CollabHumanReviewConclusionCard } from './meeting/panels/CollabHumanReviewConclusionCard';
import { MeetingNodeDetailPanel, type MeetingNodeVisualState } from './meeting/panels/MeetingNodeDetailPanel';
import { LeaderReviewSopPanel } from './LeaderReviewSopPanel';
import { Label } from '@/components/ui/label';
import { SearchableVirtualSelect } from '@/components/product/SearchableVirtualSelect';
import {
  SOP_STAGES,
  ALL_NODES,
  LAST_PIPELINE_STAGE_ID,
  LAST_PIPELINE_NODE_ID,
  resolveSopRawToNodeId,
  stageIdForNodeId,
  type NodeType,
  type SOPNode,
  type SOPStage,
} from '../../rd-sop/constants';
import {
  buildDisabledSopNodeIds,
  getSopNodeTypeInfo,
  pickSopNodePipelineMetrics,
  resolveSopNodeModelDisplay,
  resolveSopPipelineNodeState,
  sopNodeShowsLlmMetrics,
  SOP_NODE_SKIPPED_CARD_CLASS,
  type SopPipelineRunStatus,
} from '../../rd-sop/nodePresentation';

// --- Types & Data ---

export interface Ticket {
  id: string;
  branch: string;
  title: string;
  currentStage: number;
  currentNode: string;
  status:
    | 'processing'
    | 'full_manual'
    | 'pending'
    | 'completed'
    | 'error'
    | 'prepare';
  /** 需求单维度（无研发子单展示行）：处理中且本地库该 order 最新 sop 轨迹需人工；非工单 status */
  sopAwaitingHuman: boolean;
  owner: string;
  urgency: 'low' | 'medium' | 'high';
  tokens: number;
  runTime: string;
  description: string;
  createdAt: string;
  ownedWorkItems: OwnedWorkItem[];
  /** userwork.json 中的 prod（统一服务产品标识） */
  prod?: string;
  /** userwork.json 中的 local_process_state（智能研发完成 / 智能归档完成筛选） */
  localProcessState?: string;
}

/** 工单卡片 / SOP 顶栏：有 prod 显示产品名，否则「未指定产品」 */
function ProductProdTag({ prod, className }: { prod?: string; className?: string }) {
  const { t } = useTranslation();
  const trimmed = (prod || '').trim();
  const hasProd = Boolean(trimmed);
  const label = hasProd ? trimmed : t('rdManageOrder.productUnspecified');
  return (
    <Tag bordered={false} className={className} color={hasProd ? 'processing' : 'warning'}>
      {label}
    </Tag>
  );
}

function focusNodeIdForTicket(ticket: Ticket): string {
  if (ticket.status === 'completed') return LAST_PIPELINE_NODE_ID;
  return ticket.currentNode;
}

/** 当前节点圆点中心相对 canvas 的 X（与进度条 `left-16` 同一坐标系，单位 px） */
function getNodeCenterXInCanvas(nodeEl: HTMLElement, canvasEl: HTMLElement): number {
  let x = 0;
  let el: HTMLElement | null = nodeEl;
  while (el && el !== canvasEl) {
    x += el.offsetLeft;
    el = el.offsetParent as HTMLElement | null;
  }
  if (el === canvasEl) {
    return x + nodeEl.offsetWidth / 2;
  }
  // offsetParent 链未落到 canvas（部分布局下会断链）：用视口几何 + 横向缩放还原到布局宽度坐标
  const nr = nodeEl.getBoundingClientRect();
  const cr = canvasEl.getBoundingClientRect();
  const scaleX = cr.width > 1 ? canvasEl.scrollWidth / cr.width : 1;
  return (nr.left + nr.width / 2 - cr.left) * scaleX;
}

/** 主轨道起点与 `left-16` / `px-16` 一致 */
const BUS_LINE_START_PX = 64;

/** Ant Design 与当前 data-theme 同步（避免浅色主题下仍强制暗色算法） */
function useAntThemeDark() {
  const [dark, setDark] = useState(() => {
    if (typeof document === 'undefined') return false;
    const t = document.documentElement.getAttribute('data-theme') || 'light';
    return t === 'dark' || t === 'daltonized-dark' || t === 'high-contrast';
  });
  useEffect(() => {
    const read = () => {
      const t = document.documentElement.getAttribute('data-theme') || 'light';
      setDark(t === 'dark' || t === 'daltonized-dark' || t === 'high-contrast');
    };
    read();
    const m = new MutationObserver(read);
    m.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    return () => m.disconnect();
  }, []);
  return dark;
}

type NodeState =
  | 'completed'
  | 'processing'
  | 'error'
  | 'awaiting_human'
  | 'full_manual'
  | 'pending'
  | 'skipped';

function ticketStatusToPipeline(ticket: Ticket): SopPipelineRunStatus {
  switch (ticket.status) {
    case 'completed':
      return 'completed';
    case 'prepare':
      return 'prepare';
    case 'full_manual':
      return 'full_manual';
    case 'pending':
      return 'pending';
    case 'processing':
      return ticket.sopAwaitingHuman ? 'human_intervention' : 'processing';
    case 'error':
      return 'failed';
    default:
      return 'pending';
  }
}

function mapNodeStateForPanel(state: NodeState): MeetingNodeVisualState {
  if (state === 'skipped') return 'pending';
  if (state === 'awaiting_human') return 'human_intervention';
  if (state === 'full_manual') return 'pending';
  if (state === 'completed' || state === 'processing' || state === 'error') return state;
  return 'pending';
}

// --- Subcomponents for Outputs ---

const TerminalOutput = ({ lines }: { lines: string[] }) => (
  <div className="max-h-64 overflow-y-auto rounded-lg border border-border bg-[color-mix(in_srgb,var(--background)_88%,#0a0a12)] p-3 font-mono text-xs custom-scrollbar dark:bg-[color-mix(in_srgb,var(--background)_40%,#020617)]">
    {lines.map((line, i) => (
      <div key={i} className="mb-1">
        <span className="mr-2 text-emerald-600 dark:text-emerald-400">$</span>
        <span className={line.includes('Error') ? 'text-red-500 dark:text-red-400' : line.includes('Warning') ? 'text-amber-600 dark:text-amber-400' : 'text-foreground/85'}>
          {line}
        </span>
      </div>
    ))}
  </div>
);

const JsonOutput = ({ data }: { data: any }) => (
  <div className="max-h-64 overflow-auto rounded-lg border border-border bg-[color-mix(in_srgb,var(--background)_88%,#0a0a12)] p-4 font-mono text-xs text-blue-600 custom-scrollbar dark:bg-[color-mix(in_srgb,var(--background)_40%,#020617)] dark:text-blue-300">
    <pre>{JSON.stringify(data, null, 2)}</pre>
  </div>
);

/** 仅「处理中」需求单查轨迹人工介入（order_id = demand_no）。 */
function collectOrderIdsForHitlFlags(list: DemandListItem[]): string[] {
  const ids = new Set<string>();
  for (const d of list) {
    const base = deriveBaseTicketStatus(d);
    if (base !== "processing") continue;
    const dn = (d.demand_no || "").trim();
    if (dn) ids.add(dn);
  }
  return Array.from(ids);
}

/**
 * 基础态（不含「人工介入」）：人工介入仍仅由「处理中 + sop_trajectories」叠加。
 * 「全人工」表示走外部人工、不进本系统智能流水线，由 local_process_state 单独标识。
 */
function deriveBaseTicketStatus(d: DemandListItem): Ticket["status"] {
  const local = effectiveLocalProcessState(d);
  if (local === "archived") return "completed";
  const isCompleted =
    local === "已完成" ||
    (d.demand_status || "").trim() === "已完成" ||
    (d.demand_status || "").trim() === "completed";
  if (isCompleted) return "completed";
  if (local === "预备中") return "prepare";
  if (local === "待处理") return "pending";
  if (local === "处理中") return "processing";
  if (local === "全人工") return "full_manual";
  if (["需求开发", "开发中", "测试中"].some((x) => (d.demand_status || "").includes(x))) {
    return "processing";
  }
  return "pending";
}

/** 接口可能省略 local_process_state，用需求状态兜底「待处理」 */
function effectiveLocalProcessState(d: DemandListItem): string {
  const s = (d.local_process_state || "").trim();
  if (s) return s;
  if ((d.demand_status || "").trim() === "待处理") return "待处理";
  return "";
}

function mapDemandListItemToTicket(d: DemandListItem, flags: Record<string, boolean>): Ticket {
  const local = effectiveLocalProcessState(d);
  const baseStatus = deriveBaseTicketStatus(d);
  const owned = d.owned_work_items || [];
  const dn = (d.demand_no || "").trim();

  const status: Ticket["status"] = baseStatus;
  const sopAwaitingHuman = baseStatus === "processing" && Boolean(dn && flags[dn]);

  let demandNodeId = "pending";
  if (status === "completed") {
    demandNodeId = LAST_PIPELINE_NODE_ID;
  } else if (local === "待处理") {
    // 契约：待处理时需求单一定在「等待调度」，与接口 sop_node 文案无关
    demandNodeId = "pending";
  } else if (local === "预备中") {
    // 契约：预备中时 sop_node 必为空，不解析接口 sop
    demandNodeId = "pending";
  } else if (status === "full_manual") {
    const sop = (d.sop_node || "").trim();
    demandNodeId = resolveSopRawToNodeId(sop) ?? "pending";
  } else if (status === "processing") {
    const sop = (d.sop_node || "").trim();
    demandNodeId = resolveSopRawToNodeId(sop) ?? "pending";
  }

  const runTime =
    (d.demand_deal_time || "").trim() ||
    (d.demand_finish_time || "").trim() ||
    "0h";

  return {
    id: d.demand_no || `TICKET-${Math.random().toString(36).slice(2, 9)}`,
    title: d.demand_title || "未知需求",
    description: d.demand_desc || "",
    createdAt: d.demand_create_time || new Date().toISOString(),
    runTime,
    tokens: d.demand_sccb_work_minutes || 0,
    status,
    sopAwaitingHuman,
    owner: d.demand_designer || "未知",
    branch: d.product_version_code || "master",
    urgency: "medium",
    currentNode: demandNodeId,
    currentStage: 0,
    ownedWorkItems: owned,
    prod: (d.prod || '').trim() || undefined,
    localProcessState: local || undefined,
  };
}

/** demand_impact：JSON 数组时仅展示各条 impactDesc，否则原样返回 */
function formatDemandImpactDisplay(raw: string): string {
  const trimmed = (raw || '').trim();
  if (!trimmed) return '';
  if (!trimmed.startsWith('[')) return trimmed;
  try {
    const parsed = JSON.parse(trimmed) as unknown;
    if (!Array.isArray(parsed)) return trimmed;
    const descs = parsed
      .map((item) => {
        if (item && typeof item === 'object' && 'impactDesc' in item) {
          const desc = (item as { impactDesc?: unknown }).impactDesc;
          return typeof desc === 'string' ? desc.trim() : '';
        }
        return '';
      })
      .filter(Boolean);
    return descs.length > 0 ? descs.join('\n') : trimmed;
  } catch {
    return trimmed;
  }
}

/** 秒 → 可读时长（优先小时/分钟） */
function formatDurationSeconds(totalSec: number, tFormat: (k: string, o?: Record<string, unknown>) => string): string {
  const s = Math.max(0, Math.floor(totalSec));
  if (s < 60) return tFormat('rdManageOrder.seconds', { count: s });
  const m = Math.floor(s / 60);
  if (m < 60) return tFormat('rdManageOrder.minutes', { count: m });
  const h = Math.floor(m / 60);
  const remM = m % 60;
  if (remM === 0) return tFormat('rdManageOrder.hours', { count: h });
  return tFormat('rdManageOrder.hoursMinutes', { hours: h, minutes: remM });
}

function formatTokenCount(tokens: number): string {
  if (tokens >= 1_000_000) return `${(tokens / 1_000_000).toFixed(1)}M`;
  if (tokens >= 1000) return `${(tokens / 1000).toFixed(1)}k`;
  return String(tokens);
}

function demandItemFallbackFromTicket(ticket: Ticket): DemandListItem {
  return {
    demand_no: ticket.id,
    demand_title: ticket.title,
    demand_desc: ticket.description,
    demand_create_time: ticket.createdAt,
    demand_finish_time: '',
    demand_sccb_work_minutes: ticket.tokens,
    demand_status: '',
    demand_impact: '',
    demand_designer: ticket.owner,
    product_version_id: null,
    product_version_code: ticket.branch,
    prod: ticket.prod,
    sop_node: '',
    local_process_state: '',
    owned_work_items: ticket.ownedWorkItems,
  };
}

const OWNED_STATE_CLASS: Record<OwnedWorkItemState, string> = {
  待处理: 'rd-order-owned-state--pending',
  开发完成: 'rd-order-owned-state--active',
  提交完成: 'rd-order-owned-state--active',
  已完成: 'rd-order-owned-state--done',
};

function OwnedWorkItemStateBadge({ state }: { state: OwnedWorkItemState }) {
  return (
    <span className={`rd-order-owned-state ${OWNED_STATE_CLASS[state]}`}>
      {state}
    </span>
  );
}

function OwnedWorkItemsScrollList({ items }: { items: OwnedWorkItem[] }) {
  const loopItems = items.length > 1 ? [...items, ...items] : items;
  return (
    <div className="rd-order-owned-popover">
      <div className="rd-order-owned-popover__header">
        <GitBranch className="h-3.5 w-3.5 text-primary" />
        <span className="text-xs font-semibold text-foreground">研发子单</span>
        <span className="font-mono text-[10px] text-muted-foreground">{items.length}</span>
      </div>
      <div
        className={`rd-order-owned-popover__viewport ${items.length >= 2 ? 'rd-order-owned-popover__viewport--scroll' : ''}`}
      >
        <div
          className="rd-order-owned-popover__track"
          style={{ ['--rd-owned-count' as string]: String(items.length) }}
        >
          {loopItems.map((wi, idx) => (
            <div key={`${wi.task_no}-${idx}`} className="rd-order-owned-popover__row">
              <span className="rd-order-owned-popover__title" title={wi.task_title}>
                {wi.task_title}
              </span>
              <OwnedWorkItemStateBadge state={wi.state} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function OwnedWorkItemsCardHover({
  items,
  children,
}: {
  items: OwnedWorkItem[];
  children: React.ReactElement;
}) {
  return (
    <Popover
      trigger="hover"
      placement="rightTop"
      mouseEnterDelay={0.08}
      mouseLeaveDelay={0.1}
      arrow={false}
      getPopupContainer={() => document.body}
      destroyOnHidden
      zIndex={1200}
      classNames={{ root: 'rd-order-owned-popover-overlay' }}
      styles={{
        container: {
          padding: 0,
          overflow: 'hidden',
          borderRadius: 12,
          background: 'var(--panel2)',
          boxShadow: '0 20px 50px rgba(0, 0, 0, 0.38)',
        },
      }}
      content={<OwnedWorkItemsScrollList items={items} />}
    >
      <div className="rd-order-ticket-hover-anchor relative mb-1 block w-full shrink-0">
        {children}
        <div
          className="rd-order-owned-chip pointer-events-none absolute bottom-2 right-2 z-[5] flex items-center gap-1 rounded-full border border-primary/40 bg-primary/12 px-1.5 py-0.5 text-[10px] font-medium text-primary shadow-[0_0_12px_color-mix(in_srgb,var(--primary)_22%,transparent)]"
          aria-hidden
        >
          <GitBranch className="h-3 w-3 shrink-0" />
          <span className="font-mono">{items.length}</span>
          <span>研发单</span>
        </div>
      </div>
    </Popover>
  );
}

/** 工单弹窗内：研发子单属性区（与「处理汇总」同款大卡分栏，含仓库） */
function TaskModalWorkItemStats({
  wi,
  tm,
  dbMetricsLoading,
  t,
  onOpenProductModule,
}: {
  wi: OwnedWorkItem;
  tm: { deal_seconds: number; deal_tokens: number } | undefined;
  dbMetricsLoading: boolean;
  t: (key: string, options?: Record<string, unknown>) => string;
  onOpenProductModule: () => void;
}) {
  const repo = (wi.repo_url || '').trim();
  const isHttp = /^https?:\/\//i.test(repo);
  const stateText = wi.state;

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-3">
        <div className="relative overflow-hidden rounded-xl border border-border/50 bg-gradient-to-br from-background/60 to-muted/20 p-4">
          <div className="relative z-10 text-[10px] font-medium uppercase text-muted-foreground">
            {t('rdManageOrder.taskDealTime')}
          </div>
          <div className="relative z-10 mt-1 font-mono text-xl font-bold text-foreground sm:text-2xl">
            {dbMetricsLoading && !tm ? '…' : formatDurationSeconds(tm?.deal_seconds ?? 0, t)}
          </div>
          <Clock className="absolute -bottom-2 -right-2 h-14 w-14 text-primary/5 sm:h-16 sm:w-16" />
        </div>
        <div className="relative overflow-hidden rounded-xl border border-border/50 bg-gradient-to-br from-background/60 to-muted/20 p-4">
          <div className="relative z-10 text-[10px] font-medium uppercase text-muted-foreground">
            {t('rdManageOrder.taskDealToken')}
          </div>
          <div className="relative z-10 mt-1 font-mono text-xl font-bold text-foreground sm:text-2xl">
            {dbMetricsLoading && !tm ? '…' : (tm?.deal_tokens ?? 0).toLocaleString()}
          </div>
          <Coins className="absolute -bottom-2 -right-2 h-14 w-14 text-primary/5 sm:h-16 sm:w-16" />
        </div>
        <div className="relative overflow-hidden rounded-xl border border-border/50 bg-gradient-to-br from-background/60 to-muted/20 p-4">
          <div className="relative z-10 text-[10px] font-medium uppercase text-muted-foreground">
            {t('rdManageOrder.taskCreated')}
          </div>
          <div className="relative z-10 mt-1 text-xs font-medium leading-snug text-foreground sm:text-sm">
            {wi.created_date || '—'}
          </div>
          <ClipboardList className="absolute -bottom-2 -right-2 h-14 w-14 text-primary/5 sm:h-16 sm:w-16" />
        </div>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="relative overflow-hidden rounded-xl border border-border/50 bg-gradient-to-br from-background/60 to-muted/20 p-4">
          <div className="relative z-10 text-[10px] font-medium uppercase text-muted-foreground">
            {t('rdManageOrder.taskState', { defaultValue: '子单状态' })}
          </div>
          <div className="relative z-10 mt-2">
            <OwnedWorkItemStateBadge state={stateText} />
          </div>
          <Code className="absolute -bottom-3 -right-2 h-16 w-16 text-primary/5" />
        </div>
        <div className="relative overflow-hidden rounded-xl border border-border/50 bg-gradient-to-br from-background/60 to-muted/20 p-4">
          <div className="relative z-10 text-[10px] font-medium uppercase text-muted-foreground">
            {t('rdManageOrder.productModule')}
          </div>
          <div className="relative z-10 mt-2">
            {(wi.product_module_name || '').trim() ? (
              <button
                type="button"
                className="inline-flex items-center gap-1 text-left text-sm font-medium text-primary underline decoration-primary/40 underline-offset-2 transition-colors hover:text-primary/90"
                title={t('rdManageOrder.openProductModule')}
                onClick={(e) => {
                  e.stopPropagation();
                  onOpenProductModule();
                }}
              >
                {wi.product_module_name}
                <ExternalLink className="h-3.5 w-3.5 shrink-0" />
              </button>
            ) : (
              <span className="text-sm text-foreground/80">—</span>
            )}
          </div>
          <Network className="absolute -bottom-3 -right-2 h-16 w-16 text-primary/5" />
        </div>
      </div>
      <div className="relative overflow-hidden rounded-xl border border-border/50 bg-gradient-to-br from-background/60 to-muted/20 p-4">
        <div className="relative z-10 text-[10px] font-medium uppercase text-muted-foreground">
          {t('rdManageOrder.repoUrl')}
        </div>
        <div className="relative z-10 mt-2 break-all font-mono text-xs leading-relaxed text-foreground/90">
          {!repo ? (
            <span className="text-muted-foreground">—</span>
          ) : isHttp ? (
            <a href={repo} target="_blank" rel="noopener noreferrer" className="text-primary underline">
              {repo}
            </a>
          ) : (
            repo
          )}
        </div>
        <Network className="absolute -bottom-4 -right-2 h-20 w-20 text-primary/5" />
      </div>
    </div>
  );
}

// --- Main Components ---

export const OrderManagement: React.FC<{
  synapseApiBase?: string;
  onViewChange?: (view: ViewId) => void;
}> = ({ synapseApiBase = "http://127.0.0.1:18900", onViewChange }) => {
  const { t } = useTranslation();
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [demandListRaw, setDemandListRaw] = useState<DemandListItem[]>([]);
  const [activeTicketId, setActiveTicketId] = useState<string>('');
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selectedNode, setSelectedNode] = useState<SOPNode | null>(null);
  const [ticketModalOpen, setTicketModalOpen] = useState(false);
  const [selectedTicketForModal, setSelectedTicketForModal] = useState<Ticket | null>(null);
  const [modalDemand, setModalDemand] = useState<DemandListItem | null>(null);
  const [dbMetrics, setDbMetrics] = useState<WorkOrderDbMetricsPayload | null>(null);
  const [dbMetricsLoading, setDbMetricsLoading] = useState(false);
  const [dbMetricsErr, setDbMetricsErr] = useState<string | null>(null);
  const [detailProduct, setDetailProduct] = useState<Product | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [ticketFilter, setTicketFilter] = useState<
    | 'prepare'
    | 'pending'
    | 'processing'
    | 'full_manual'
    | 'rd_completed'
    | 'archived'
    | 'all'
  >('all');
  const [searchQuery, setSearchQuery] = useState('');
  /** 看板数据是否已完成首次拉取（用于区分「加载中」与「快照为空」） */
  const [boardDataInitialized, setBoardDataInitialized] = useState(false);
  const [boardRefreshBusy, setBoardRefreshBusy] = useState(false);
  const [openingMeetingKey, setOpeningMeetingKey] = useState<string | null>(null);
  const [prodCatalog, setProdCatalog] = useState<ProdInfoWireItem[]>([]);
  const [prodCatalogLoading, setProdCatalogLoading] = useState(false);
  const [openMeetingPickerOpen, setOpenMeetingPickerOpen] = useState(false);
  const [openMeetingPending, setOpenMeetingPending] = useState<{
    ticket: Ticket;
    scopeId: string;
  } | null>(null);
  const [selectedProdKey, setSelectedProdKey] = useState('');
  const [soulInstructionDraft, setSoulInstructionDraft] = useState('');
  const [meetingSummary, setMeetingSummary] = useState<MeetingSummaryPayload | null>(null);
  const [meetingSummaryLoading, setMeetingSummaryLoading] = useState(false);
  const [meetingSummaryErr, setMeetingSummaryErr] = useState<string | null>(null);
  const [roomScopeIndex, setRoomScopeIndex] = useState<Map<string, string>>(new Map());
  const [roomMetricsByScope, setRoomMetricsByScope] = useState<
    Map<
      string,
      {
        tokens: number;
        stageDuration: string;
        meetingStartedAt?: string;
        status?: MeetingRoomListItem['status'];
      }
    >
  >(new Map());
  const [disabledSopNodeIds, setDisabledSopNodeIds] = useState<Set<string>>(() => new Set());
  const [meetingRoomConfig, setMeetingRoomConfig] = useState<MeetingRoomConfigPayload | null>(null);
  const [runtimeSkippedNodeIds, setRuntimeSkippedNodeIds] = useState<string[]>([]);
  const [llmEndpointCatalog, setLlmEndpointCatalog] = useState<LlmEndpointCatalogItem[]>(
    [],
  );
  const [collapsedStages, setCollapsedStages] = useState<Record<number, boolean>>({});
  const [transform, setTransform] = useState({ x: 0, y: 0, scale: 1 });
  const isDragging = useRef(false);
  const lastMousePos = useRef({ x: 0, y: 0 });
  const canvasRef = useRef<HTMLDivElement>(null);
  const [activeLineWidth, setActiveLineWidth] = useState<number>(0);

  const containerRef = useRef<HTMLDivElement>(null);
  const antDark = useAntThemeDark();

  useEffect(() => {
    if (!IS_TAURI) return;
    let cancelled = false;
    setProdCatalogLoading(true);
    void getProdInfo(synapseApiBase)
      .then((resp) => {
        if (cancelled) return;
        const raw = Array.isArray(resp.data) ? resp.data : [];
        setProdCatalog(raw.filter((row): row is ProdInfoWireItem => row != null));
      })
      .catch((e) => {
        if (cancelled) return;
        const msg = e instanceof Error ? e.message : String(e);
        if (msg === 'missing_devservice_ip') {
          toast.error(t('workbench.products.createMissingDevservice'));
        } else {
          toast.error(t('rdManageOrder.prodCatalogLoadFailed', { message: msg }));
        }
        setProdCatalog([]);
      })
      .finally(() => {
        if (!cancelled) setProdCatalogLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [synapseApiBase, t]);

  const prodSelectOptions = useMemo(
    () =>
      prodCatalog
        .map((row) => {
          const prod = (row.prod || '').trim();
          if (!prod) return null;
          const version = displayIdPipeName(row.version ?? '') || (row.version ?? '');
          const space = (row.space || '').trim();
          const label = [prod, version, space].filter(Boolean).join(' · ');
          return { value: prod, label };
        })
        .filter((x): x is { value: string; label: string } => x != null),
    [prodCatalog],
  );

  useEffect(() => {
    if (!ticketModalOpen || !modalDemand) return;
    let cancelled = false;
    setDbMetricsLoading(true);
    setDbMetricsErr(null);
    setDbMetrics(null);
    const taskNos = (modalDemand.owned_work_items || []).map((w) => w.task_no).filter(Boolean);
    void fetchWorkOrderDbMetrics(synapseApiBase, {
      demand_no: modalDemand.demand_no,
      task_nos: taskNos,
    })
      .then((data) => {
        if (!cancelled) setDbMetrics(data);
      })
      .catch((e) => {
        if (!cancelled) {
          const msg = e instanceof Error ? e.message : String(e);
          setDbMetricsErr(msg);
          toast.error(t("rdManageOrder.metricsLoadFailed", { message: msg }));
        }
      })
      .finally(() => {
        if (!cancelled) setDbMetricsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [ticketModalOpen, modalDemand, synapseApiBase, t]);

  const sopMeetingScope = useMemo(() => {
    const sid = activeTicketId.trim();
    if (!sid) return null;
    return { scopeType: 'demand' as const, scopeId: sid };
  }, [activeTicketId]);

  useEffect(() => {
    if (!sopMeetingScope?.scopeId) {
      setMeetingSummary(null);
      setMeetingSummaryErr(null);
      return;
    }
    let cancelled = false;
    setMeetingSummaryLoading(true);
    setMeetingSummaryErr(null);
    void fetchMeetingSummary(synapseApiBase, sopMeetingScope.scopeType, sopMeetingScope.scopeId)
      .then((data) => {
        if (!cancelled) setMeetingSummary(data);
      })
      .catch((e) => {
        if (!cancelled) {
          const msg = e instanceof Error ? e.message : String(e);
          setMeetingSummaryErr(msg);
          setMeetingSummary(null);
        }
      })
      .finally(() => {
        if (!cancelled) setMeetingSummaryLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [sopMeetingScope, synapseApiBase]);

  const refreshRoomMetricsIndex = useCallback(() => {
    const base = (synapseApiBase || '').trim();
    if (!base) return Promise.resolve();
    return fetchMeetingRooms(base)
      .then((list) => {
        const m = new Map<string, string>();
        const metrics = new Map<
          string,
          {
            tokens: number;
            stageDuration: string;
            meetingStartedAt?: string;
            status?: MeetingRoomListItem['status'];
          }
        >();
        for (const r of list) {
          const key = `${r.scope_type}:${r.scope_id}`;
          if (r.room_id) m.set(key, r.room_id);
          metrics.set(key, {
            tokens: r.tokenConsumed ?? 0,
            stageDuration: r.stageDuration || '—',
            meetingStartedAt: r.meetingStartedAt,
            status: r.status,
          });
        }
        setRoomScopeIndex(m);
        setRoomMetricsByScope(metrics);
      })
      .catch(() => {
        setRoomScopeIndex(new Map());
        setRoomMetricsByScope(new Map());
      });
  }, [synapseApiBase]);

  useEffect(() => {
    if (!boardDataInitialized) return;
    void refreshRoomMetricsIndex();
  }, [boardDataInitialized, refreshRoomMetricsIndex]);

  /** 左侧任务卡片总 token / 耗时：进行中等状态轮询 room_state.metrics */
  const hasActiveMeetingTickets = useMemo(
    () =>
      tickets.some(
        (t) =>
          t.status === 'processing' ||
          t.status === 'error' ||
          t.sopAwaitingHuman,
      ),
    [tickets],
  );

  const hasActiveRoomScopes = useMemo(() => {
    for (const m of roomMetricsByScope.values()) {
      if (m.status === 'processing') return true;
    }
    return false;
  }, [roomMetricsByScope]);

  useEffect(() => {
    if (!hasActiveMeetingTickets && !hasActiveRoomScopes) return;
    const timer = window.setInterval(() => {
      void refreshRoomMetricsIndex();
    }, 8000);
    return () => window.clearInterval(timer);
  }, [hasActiveMeetingTickets, hasActiveRoomScopes, refreshRoomMetricsIndex]);

  const activeMeetingRoomId = useMemo(() => {
    if (!sopMeetingScope?.scopeId) return '';
    const key = `${sopMeetingScope.scopeType}:${sopMeetingScope.scopeId}`;
    return (roomScopeIndex.get(key) || meetingSummary?.room_id || '').trim();
  }, [sopMeetingScope, roomScopeIndex, meetingSummary?.room_id]);

  useEffect(() => {
    const base = (synapseApiBase || '').trim();
    if (!base) return;
    let cancelled = false;
    void Promise.all([
      fetchMeetingRoomConfig(base),
      fetchLlmEndpointsCatalog(base).catch((e: unknown) => {
        console.warn('[OrderManagement] fetchLlmEndpointsCatalog failed:', e);
        return [] as LlmEndpointCatalogItem[];
      }),
    ])
      .then(([cfg, catalog]) => {
        if (!cancelled) {
          setMeetingRoomConfig(cfg);
          setDisabledSopNodeIds(buildDisabledSopNodeIds(cfg.node_overrides));
          setLlmEndpointCatalog(catalog);
        }
      })
      .catch((e: unknown) => {
        console.warn('[OrderManagement] meeting room config load failed:', e);
        if (!cancelled) {
          setMeetingRoomConfig(null);
          setDisabledSopNodeIds(new Set());
          setLlmEndpointCatalog([]);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [synapseApiBase]);

  const meetingNodeMetricsById = useMemo(() => {
    const m = new Map<string, { deal_seconds: number; tokens: number }>();
    for (const n of meetingSummary?.nodes ?? []) {
      m.set(n.node_id, n.metrics);
    }
    return m;
  }, [meetingSummary]);

  const meetingArchiveByNodeId = useMemo(() => {
    const m = new Map<string, MeetingRoomArchiveEntry['files']>();
    for (const entry of meetingSummary?.archive_index ?? []) {
      const prev = m.get(entry.node_id) ?? [];
      m.set(entry.node_id, [...prev, ...entry.files]);
    }
    return m;
  }, [meetingSummary]);

  const mergeProcessIntoProduct = useCallback((productId: string, payload: ProdProcessDataPayload) => {
    setDetailProduct((p) => (p && p.id === productId ? applyProcessPayloadToProduct(p, payload) : p));
  }, []);

  const patchProductKnowledge = useCallback((productId: string, patch: ProductKnowledgePatch) => {
    setDetailProduct((sp) =>
      sp && sp.id === productId
        ? { ...sp, knowledge: patchProductKnowledgeSlots(sp.knowledge, patch) }
        : sp,
    );
  }, []);

  const openProductDetailForWorkItem = useCallback(
    async (wi: OwnedWorkItem) => {
      if (!IS_TAURI) {
        toast.message(t("rdManageOrder.productOpenTauriOnly"));
        return;
      }
      const modName = (wi.product_module_name || "").trim();
      const repoUrl = (wi.repo_url || "").trim();
      try {
        const resp = await getProdInfo(synapseApiBase);
        const raw = Array.isArray(resp.data) ? resp.data : [];
        const rows = raw.filter((row): row is ProdInfoWireItem => row != null);
        const hit =
          (modName && rows.find((r) => prodWireMatchesWorkItemModuleName(r, modName))) ||
          (repoUrl
            ? rows.find(
                (r) =>
                  Array.isArray(r.repo_info) &&
                  r.repo_info.some((repo) => (repo?.repo_url || "").trim() === repoUrl),
              )
            : undefined);
        if (!hit) {
          toast.error(t("rdManageOrder.productNotFound"));
          return;
        }
        setDetailProduct(prodInfoWireToProduct(hit));
        setDetailOpen(true);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        toast.error(`${t("rdManageOrder.productNotFound")} (${msg})`);
      }
    },
    [synapseApiBase, t],
  );

  const applyBoardPayload = useCallback(
    async (data: RdManageDemandsPayload) => {
      setDemandListRaw(data.list || []);
      const list = data.list || [];
      const orderIds = collectOrderIdsForHitlFlags(list);
      let flags: Record<string, boolean> = {};
      try {
        flags = await fetchHumanInLoopFlags(synapseApiBase, orderIds);
      } catch {
        flags = {};
      }
      const allTickets = list.map((d) => mapDemandListItemToTicket(d, flags));

      allTickets.forEach((tk) => {
        if (tk.status === "completed") {
          tk.currentNode = LAST_PIPELINE_NODE_ID;
          tk.currentStage = LAST_PIPELINE_STAGE_ID;
        } else {
          const stage = SOP_STAGES.find((s) => s.nodes.some((n) => n.id === tk.currentNode));
          tk.currentStage = stage ? stage.id : 0;
        }
      });

      setTickets(allTickets);
      if (allTickets.length > 0) {
        setActiveTicketId(allTickets[0].id);
      } else {
        setActiveTicketId("");
      }
    },
    [synapseApiBase],
  );

  const refreshWorkOrdersFromDevCloud = useCallback(async () => {
    setBoardRefreshBusy(true);
    try {
      const data = await syncRdManageDemandsFromDevCloud(synapseApiBase);
      await applyBoardPayload(data);
      toast.success(t("rdManageOrder.refreshSuccess"));
    } catch (e) {
      const raw = e instanceof Error ? e.message : String(e);
      const msg = raw === "owner_info_missing" ? t("rdManageOrder.userinfoMissing") : raw;
      toast.error(t("rdManageOrder.refreshFailed", { message: msg }));
    } finally {
      setBoardRefreshBusy(false);
    }
  }, [synapseApiBase, t, applyBoardPayload]);

  // Load Data：`GET owner_order_snapshot`；无快照时列表为空；异常时 rdManageService 可回退 Mock
  useEffect(() => {
    let cancelled = false;
    setBoardDataInitialized(false);
    async function loadData() {
      try {
        const data = await fetchRdManageDemands(synapseApiBase);
        if (cancelled) return;
        await applyBoardPayload(data);
      } catch (err) {
        if (!cancelled) console.error("Failed to load demands:", err);
      } finally {
        if (!cancelled) setBoardDataInitialized(true);
      }
    }
    loadData();
    return () => {
      cancelled = true;
    };
  }, [synapseApiBase, applyBoardPayload]);

  const filteredTickets = useMemo(() => {
    return tickets.filter(t => {
      const q = searchQuery.trim().toLowerCase();
      if (q && !(
        t.id.toLowerCase().includes(q) || 
        t.title.toLowerCase().includes(q) || 
        t.description.toLowerCase().includes(q) ||
        t.ownedWorkItems.some(
          (w) =>
            w.task_no.toLowerCase().includes(q) ||
            w.task_title.toLowerCase().includes(q) ||
            (w.task_desc || '').toLowerCase().includes(q),
        )
      )) {
        return false;
      }
      if (ticketFilter === 'pending') return t.status === 'pending';
      if (ticketFilter === 'processing') return t.status === 'processing' || t.status === 'error';
      if (ticketFilter === 'full_manual') return t.status === 'full_manual';
      if (ticketFilter === 'prepare') return t.status === 'prepare';
      if (ticketFilter === 'rd_completed') return (t.localProcessState || '').trim() === '已完成';
      if (ticketFilter === 'archived') return (t.localProcessState || '').trim() === 'archived';
      return true;
    });
  }, [tickets, ticketFilter, searchQuery]);

  const pendingCount = useMemo(() => tickets.filter(t => t.status === 'pending').length, [tickets]);
  const processingCount = useMemo(() => tickets.filter(t => t.status === 'processing' || t.status === 'error').length, [tickets]);
  const prepareCount = useMemo(() => tickets.filter(t => t.status === 'prepare').length, [tickets]);
  const fullManualCount = useMemo(() => tickets.filter((t) => t.status === 'full_manual').length, [tickets]);
  const rdCompletedCount = useMemo(
    () => tickets.filter((t) => (t.localProcessState || '').trim() === '已完成').length,
    [tickets],
  );
  const archivedCount = useMemo(
    () => tickets.filter((t) => (t.localProcessState || '').trim() === 'archived').length,
    [tickets],
  );

  const activeTicket = useMemo(() => tickets.find(t => t.id === activeTicketId) || tickets[0] || null, [activeTicketId, tickets]);

  const modalOwnedWorkItems = useMemo(
    () => modalDemand?.owned_work_items ?? [],
    [modalDemand],
  );

  const getNodeStateGlobal = useCallback(
    (ticket: Ticket | null, nodeId: string): NodeState => {
      if (!ticket) return 'pending';
      if (!ALL_NODES.some((n) => n.id === nodeId)) return 'pending';

      const pipeline = resolveSopPipelineNodeState(
        {
          currentNodeId: ticket.currentNode,
          status: ticketStatusToPipeline(ticket),
          skippedNodeIds: runtimeSkippedNodeIds,
          disabledNodeIds: disabledSopNodeIds,
        },
        nodeId,
      );

      if (pipeline === 'skipped') return 'skipped';
      if (pipeline === 'human_intervention') {
        const node = ALL_NODES.find((n) => n.id === nodeId);
        if (
          node &&
          (node.type.includes('human') ||
            node.type === 'human_multi' ||
            node.type === 'human_start' ||
            node.type === 'ai_exception')
        ) {
          return 'awaiting_human';
        }
        return 'error';
      }
      if (pipeline === 'completed') return 'completed';
      if (pipeline === 'processing') return 'processing';
      if (pipeline === 'error') return 'error';
      return 'pending';
    },
    [disabledSopNodeIds, runtimeSkippedNodeIds],
  );

  useEffect(() => {
    const base = (synapseApiBase || '').trim();
    const roomId = activeMeetingRoomId;
    if (!base || !roomId) {
      setRuntimeSkippedNodeIds([]);
      return;
    }
    let cancelled = false;
    void fetchMeetingRoomLive(base, roomId)
      .then((live) => {
        if (!cancelled) setRuntimeSkippedNodeIds(live.skipped_node_ids ?? []);
      })
      .catch(() => {
        if (!cancelled) setRuntimeSkippedNodeIds([]);
      });
    return () => {
      cancelled = true;
    };
  }, [synapseApiBase, activeMeetingRoomId, activeTicket?.currentNode]);

  const shouldPollMeetingSummary = useMemo(() => {
    if (!activeTicket) return false;
    return (
      activeTicket.status === 'processing' ||
      activeTicket.status === 'error' ||
      activeTicket.sopAwaitingHuman
    );
  }, [activeTicket]);

  useEffect(() => {
    if (!sopMeetingScope?.scopeId || !shouldPollMeetingSummary) return;
    const base = (synapseApiBase || '').trim();
    if (!base) return;
    let cancelled = false;
    const poll = () => {
      void fetchMeetingSummary(base, sopMeetingScope.scopeType, sopMeetingScope.scopeId)
        .then((data) => {
          if (!cancelled) setMeetingSummary(data);
        })
        .catch(() => {});
    };
    poll();
    const timer = window.setInterval(poll, 5000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [
    sopMeetingScope?.scopeId,
    sopMeetingScope?.scopeType,
    shouldPollMeetingSummary,
    synapseApiBase,
  ]);

  // Simulate real-time token consumption for processing tickets — removed; 总 token 取自 room_state.metrics.tokens

  /** SOP 顶栏 / 左侧卡片：总耗时（stage_started_at 墙钟）超过 4 小时标红 */
  const MEETING_DURATION_WARN_MS = 4 * 60 * 60 * 1000;
  const isStageDurationHot = useCallback((startedAt?: string, nowMs = Date.now()) => {
    const raw = startedAt?.trim();
    if (!raw) return false;
    const start = new Date(raw);
    if (Number.isNaN(start.getTime())) return false;
    return nowMs - start.getTime() > MEETING_DURATION_WARN_MS;
  }, []);

  const sopTopStageSeconds = meetingSummary?.summary_metrics?.stage_seconds;
  const sopTopStageStartedAt = meetingSummary?.summary_metrics?.stage_started_at;
  const sopTopRunTimeLabel =
    sopTopStageSeconds != null
      ? formatDurationSeconds(sopTopStageSeconds, t)
      : activeTicket?.runTime ?? '—';
  const sopTopDurationHot = isStageDurationHot(sopTopStageStartedAt);

  // Handle auto-scroll to current / 已完成时最后一个 SOP 节点
  useEffect(() => {
    if (!activeTicket || !canvasRef.current || !containerRef.current) return;
    if (
      activeTicket.status === 'prepare' ||
      activeTicket.status === 'full_manual'
    )
      return;
    const timeoutId = setTimeout(() => {
      const focusId = focusNodeIdForTicket(activeTicket);
      const activeNodeElement = document.getElementById(`node-${focusId}`);
      if (activeNodeElement) {
        const nodeRect = activeNodeElement.getBoundingClientRect();
        const canvasRect = canvasRef.current!.getBoundingClientRect();
        const containerRect = containerRef.current!.getBoundingClientRect();
        
        // Calculate node center relative to canvas (unscaled)
        const nodeCenterX = (nodeRect.left - canvasRect.left + nodeRect.width / 2) / transform.scale;
        
        const targetX = containerRect.width / 2 - nodeCenterX * transform.scale;
        
        setTransform(prev => ({
          ...prev,
          x: targetX,
          y: 0 // keep Y at 0 for horizontal pipeline
        }));
      }
    }, 150);
    return () => clearTimeout(timeoutId);
  }, [activeTicket?.id, activeTicket?.currentNode, activeTicket?.status]);

  // 切换工单时清空阶段折叠状态；不再自动折叠已完成阶段（避免节点卡片被收成竖条、看不清）
  useEffect(() => {
    setCollapsedStages({});
  }, [activeTicket?.id]);

  // Calculate Active Line Width based on DOM elements
  const measureActiveLineWidth = useCallback(() => {
    const canvas = canvasRef.current;
    if (!activeTicket || !canvas) return;

    if (activeTicket.status === 'completed') {
      const nodeEl = document.getElementById(`node-${LAST_PIPELINE_NODE_ID}`);
      if (nodeEl) {
        const centerX = getNodeCenterXInCanvas(nodeEl, canvas);
        const maxW = Math.max(0, canvas.scrollWidth - BUS_LINE_START_PX * 2);
        setActiveLineWidth(Math.min(Math.max(0, centerX - BUS_LINE_START_PX), maxW));
      } else {
        setActiveLineWidth(Math.max(0, canvas.scrollWidth - BUS_LINE_START_PX * 2));
      }
      return;
    }
    if (activeTicket.status === 'prepare') {
      setActiveLineWidth(0);
      return;
    }
    if (activeTicket.status === 'full_manual') {
      setActiveLineWidth(0);
      return;
    }
    if (activeTicket.status === 'pending') {
      const nodeEl = document.getElementById('node-pending');
      if (nodeEl) {
        const centerX = getNodeCenterXInCanvas(nodeEl, canvas);
        const maxW = Math.max(0, canvas.scrollWidth - BUS_LINE_START_PX * 2);
        setActiveLineWidth(Math.min(Math.max(0, centerX - BUS_LINE_START_PX), maxW));
      } else {
        setActiveLineWidth(0);
      }
      return;
    }

    const nodeEl = document.getElementById(`node-${activeTicket.currentNode}`);
    if (!nodeEl) return;

    const centerX = getNodeCenterXInCanvas(nodeEl, canvas);
    const maxW = Math.max(0, canvas.scrollWidth - BUS_LINE_START_PX * 2);
    setActiveLineWidth(Math.min(Math.max(0, centerX - BUS_LINE_START_PX), maxW));
  }, [activeTicket]);

  useEffect(() => {
    let raf = 0;
    const run = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        requestAnimationFrame(measureActiveLineWidth);
      });
    };
    run();
    const t = window.setTimeout(run, 80);
    return () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(t);
    };
  }, [activeTicket, collapsedStages, measureActiveLineWidth]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ro = new ResizeObserver(() => measureActiveLineWidth());
    ro.observe(canvas);
    return () => ro.disconnect();
  }, [measureActiveLineWidth]);

  // Canvas Pan & Zoom
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    
    const handleWheel = (e: WheelEvent) => {
      const target = e.target as HTMLElement;
      const onSopStrip = Boolean(
        target.closest('.node-card') ||
          target.closest('.rd-order-sop-canvas') ||
          target.closest('.stage-collapse-btn'),
      );
      e.preventDefault();
      if (e.ctrlKey || e.metaKey) {
        const zoomSensitivity = 0.002;
        const delta = -e.deltaY * zoomSensitivity;
        setTransform((prev) => {
          const newScale = Math.min(Math.max(0.2, prev.scale * (1 + delta)), 3);
          const rect = container.getBoundingClientRect();
          const mouseX = e.clientX - rect.left;
          const canvasX = (mouseX - prev.x) / prev.scale;
          return { x: mouseX - canvasX * newScale, y: 0, scale: newScale };
        });
      } else {
        const horizontal = e.deltaX !== 0 ? e.deltaX : e.deltaY;
        const gain = onSopStrip ? 1.2 : 1;
        setTransform((prev) => ({
          ...prev,
          x: prev.x - horizontal * gain,
          y: 0,
        }));
      }
    };
    
    container.addEventListener('wheel', handleWheel, { passive: false });
    return () => container.removeEventListener('wheel', handleWheel);
  }, []);

  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button === 0 || e.button === 1 || e.button === 2) {
      if ((e.target as HTMLElement).closest('.node-card') || (e.target as HTMLElement).closest('.stage-collapse-btn')) return;
      isDragging.current = true;
      lastMousePos.current = { x: e.clientX, y: e.clientY };
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging.current) return;
    const dx = e.clientX - lastMousePos.current.x;
    setTransform(prev => ({
      ...prev,
      x: prev.x + dx,
      y: 0
    }));
    lastMousePos.current = { x: e.clientX, y: e.clientY };
  };

  const handleMouseUp = () => {
    isDragging.current = false;
  };

  const handleNodeClick = (node: SOPNode) => {
    setSelectedNode(node);
    setDrawerOpen(true);
  };

  const handleShowTicketDetails = (e: React.MouseEvent, ticket: Ticket) => {
    e.stopPropagation();
    const raw = demandListRaw.find((d) => (d.demand_no || "").trim() === ticket.id.trim());
    setModalDemand(raw ?? demandItemFallbackFromTicket(ticket));
    setSelectedTicketForModal(ticket);
    setTicketModalOpen(true);
  };

  const handleJumpToMeeting = useCallback(
    (roomId?: string, scopeType?: 'demand' | 'task', scopeId?: string) => {
      const rid = (roomId || meetingSummary?.room_id || '').trim();
      const st = scopeType ?? sopMeetingScope?.scopeType;
      const sid = (scopeId ?? sopMeetingScope?.scopeId ?? '').trim();
      if (rid) {
        setMeetingRoomFocus({ roomId: rid, scopeType: st, scopeId: sid || undefined });
      }
      if (onViewChange) {
        onViewChange('workbench_meeting');
      } else {
        window.dispatchEvent(new CustomEvent('changeView', { detail: 'workbench_meeting' }));
      }
    },
    [meetingSummary?.room_id, onViewChange, sopMeetingScope],
  );

  const navigateToMeetingRoom = useCallback(
    async (scopeType: 'demand' | 'task', scopeId: string) => {
      const sid = scopeId.trim();
      if (!sid) return;
      let roomId = roomScopeIndex.get(`${scopeType}:${sid}`);
      if (!roomId) {
        try {
          const summary = await fetchMeetingSummary(synapseApiBase, scopeType, sid);
          roomId = (summary.room_id || '').trim() || undefined;
        } catch {
          /* fallback below */
        }
      }
      if (roomId) {
        handleJumpToMeeting(roomId, scopeType, sid);
        return;
      }
      toast.message(t('rdManageOrder.meetingRoomNotFound', { defaultValue: '未找到活跃会议室，请先一键开会' }));
    },
    [handleJumpToMeeting, roomScopeIndex, synapseApiBase, t],
  );

  const handleOneClickOpenMeeting = useCallback(
    (e: React.MouseEvent, ticket: Ticket) => {
      e.stopPropagation();
      if (!IS_TAURI) {
        toast.message(t('rdManageOrder.productOpenTauriOnly'));
        return;
      }
      if (prodCatalogLoading) {
        toast.message(t('rdManageOrder.prodCatalogLoading'));
        return;
      }
      if (!prodCatalog.length) {
        toast.error(t('rdManageOrder.prodCatalogEmpty'));
        return;
      }
      const scopeId = ticket.id.trim();
      if (!scopeId) return;
      const raw = demandListRaw.find((d) => (d.demand_no || '').trim() === ticket.id.trim());
      const preProd = String((raw as { prod?: string } | undefined)?.prod || '').trim();
      setSelectedProdKey(preProd);
      setOpenMeetingPending({ ticket, scopeId });
      setOpenMeetingPickerOpen(true);
      void fetchSoulInstruction(synapseApiBase, scopeId)
        .then((payload) => {
          setSoulInstructionDraft(String(payload.instruction || '').trim());
        })
        .catch(() => {
          setSoulInstructionDraft('');
        });
    },
    [demandListRaw, prodCatalog.length, prodCatalogLoading, synapseApiBase, t],
  );

  const confirmOpenMeetingWithProd = useCallback(async () => {
    const pending = openMeetingPending;
    const prod = selectedProdKey.trim();
    if (!pending || !prod) {
      toast.error(t('rdManageOrder.selectProductRequired'));
      return;
    }
    const { ticket, scopeId } = pending;
    const busyKey = `demand:${scopeId}`;
    setOpeningMeetingKey(busyKey);
    try {
      const detail = await openMeetingRoom(synapseApiBase, 'demand', scopeId, {
        prod,
        promoteToProcessing: true,
        soulInstruction: soulInstructionDraft.trim() || undefined,
      });
      setOpenMeetingPickerOpen(false);
      setOpenMeetingPending(null);
      setMeetingRoomFocus({
        roomId: detail.room_id,
        scopeType: 'demand',
        scopeId,
      });
      setActiveTicketId(ticket.id);
      toast.success(
        detail.recoveredFromTimeout
          ? t('rdManageOrder.openMeetingRecovered')
          : t('rdManageOrder.openMeetingSuccess'),
      );
      if (onViewChange) {
        onViewChange('workbench_meeting');
      } else {
        window.dispatchEvent(new CustomEvent('changeView', { detail: 'workbench_meeting' }));
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error(t('rdManageOrder.openMeetingFailed', { message: msg }));
    } finally {
      setOpeningMeetingKey(null);
    }
  }, [openMeetingPending, selectedProdKey, soulInstructionDraft, synapseApiBase, t, onViewChange]);

  const renderMeetingArchiveOutput = (nodeId: string) => {
    const files = meetingArchiveByNodeId.get(nodeId);
    if (!files?.length) return null;
    return (
      <div className="space-y-3">
        <h4 className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
          <FileText className="h-4 w-4" />
          {t('rdManageOrder.nodeArchiveTitle', { defaultValue: '归档产物' })}
        </h4>
        <motion.div className="grid grid-cols-1 gap-2">
          {files.map((f) => (
            <div
              key={`${f.relative_path}-${f.name}`}
              className="flex items-center justify-between gap-3 rounded-lg border border-border bg-muted/30 p-3"
            >
              <div className="flex min-w-0 items-center gap-3">
                <FileCode2 className="h-5 w-5 shrink-0 text-primary" />
                <span className="truncate font-mono text-sm text-foreground">{f.name}</span>
              </div>
              <span className="shrink-0 font-mono text-[10px] text-muted-foreground">
                {(f.size / 1024).toFixed(1)} KB
              </span>
            </div>
          ))}
        </motion.div>
        <p className="font-mono text-[10px] text-muted-foreground">{files[0]?.relative_path}</p>
      </div>
    );
  };

  // Render varied output based on node type/id
  const renderNodeOutput = (node: SOPNode, ticket: Ticket) => {
    const state = getNodeStateGlobal(ticket, node.id);
    if (state === 'pending') {
      return (
        <div className="flex h-40 flex-col items-center justify-center text-muted-foreground">
          <CircleDashed className="mb-3 h-10 w-10 opacity-50" />
          <p>节点未开始执行，暂无输出产物</p>
        </div>
      );
    }

    const archiveUi = renderMeetingArchiveOutput(node.id);
    if (archiveUi) return archiveUi;

    switch (node.id) {
      case 'req_clarify':
        return (
          <div className="flex flex-col border border-slate-800 rounded-xl overflow-hidden h-[300px]">
            <div className="bg-slate-900 p-3 border-b border-slate-800 text-sm font-medium text-slate-300 flex items-center gap-2">
              <MessageSquareText className="w-4 h-4" /> AI 澄清会话记录
            </div>
            <div className="flex-1 bg-[#0a0a0a] p-4 flex flex-col gap-4 overflow-y-auto">
              <div className="self-start bg-slate-800 text-slate-200 p-3 rounded-2xl rounded-tl-sm max-w-[85%] text-sm">
                发现需求中关于“实时同步”的具体延迟要求不明确，请问期望的同步延迟是在毫秒级还是秒级？
              </div>
              <div className="self-end bg-blue-600 text-white p-3 rounded-2xl rounded-tr-sm max-w-[85%] text-sm">
                期望在500ms以内完成双向同步。
              </div>
            </div>
          </div>
        );
      case 'boundary':
        return (
          <div className="space-y-3">
            <h4 className="text-sm font-medium text-slate-400">领域边界分析图谱</h4>
            <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-6 flex flex-col items-center gap-4">
              <div className="px-4 py-2 bg-indigo-900/40 border border-indigo-500/50 rounded-lg text-indigo-300 text-sm">
                知识库同步模块 (Core)
              </div>
              <div className="h-6 w-0.5 bg-slate-700" />
              <div className="flex gap-4">
                <div className="px-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-slate-400 text-xs">文档解析服务</div>
                <div className="px-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-slate-400 text-xs">向量检索引擎</div>
              </div>
            </div>
            <p className="text-xs text-green-400 mt-2 flex items-center gap-1"><CheckCircle2 className="w-3 h-3" /> 已确认边界独立，无跨产品影响</p>
          </div>
        );
      case 'module_func':
      case 'func_assign':
      case 'auto_split':
        return (
          <div className="space-y-3">
            <h4 className="text-sm font-medium text-slate-400 flex items-center gap-2"><Network className="w-4 h-4" /> 结构拆分结果</h4>
            <JsonOutput data={{
              modules: [
                { id: "mod_1", name: "Sync Listener", agent: "Agent-Alpha", status: "assigned" },
                { id: "mod_2", name: "Vector Indexer", agent: "Agent-Beta", status: "assigned" }
              ]
            }} />
          </div>
        );
      case 'entropy_gen':
        return (
          <div className="space-y-3">
            <h4 className="text-sm font-medium text-slate-400">生成的控熵文件</h4>
            <div className="grid grid-cols-2 gap-3">
              {['agent.md', 'rule.md', 'skills.md', 'tools.md'].map(file => (
                <div key={file} className="flex items-center gap-3 p-3 bg-slate-900 border border-slate-800 rounded-lg hover:border-blue-500/50 cursor-pointer transition-colors">
                  <FileCode2 className="w-5 h-5 text-blue-400" />
                  <span className="text-sm text-slate-300 font-mono">{file}</span>
                </div>
              ))}
            </div>
          </div>
        );
      case 'exception_check':
        return (
          <div className="space-y-3">
            <h4 className="text-sm font-medium text-slate-400 flex items-center gap-2"><GitBranch className="w-4 h-4" /> 代码提交与试飞</h4>
            <TerminalOutput lines={[
              "[INFO] git add -A && git commit -m 'feat: auto commit'",
              "[INFO] git push origin feature/" + ticket.branch,
              "[INFO] Polling flight build status...",
              state === 'awaiting_human' ? "[WARN] Flight build failed — see task check for redirect." : "[INFO] Flight build succeeded.",
            ]} />
          </div>
        );
      case 'task_feedback':
        return (
          <div className="space-y-3">
            <h4 className="text-sm font-medium text-slate-400">试飞优化方案</h4>
            <div className="bg-slate-900 border border-slate-800 rounded-lg p-4 text-sm text-slate-300">
              基于特性分支试飞结果生成优化建议，并与研发人员评估方案可靠性。
            </div>
          </div>
        );
      case 'diff_analysis':
        return (
          <div className="space-y-3">
            <h4 className="text-sm font-medium text-slate-400">试飞优化执行</h4>
            <div className="bg-slate-900 border border-slate-800 rounded-lg p-4 text-sm text-slate-300">
              根据已评估的试飞优化方案协同修改代码并准备再次提交。
            </div>
          </div>
        );
      case 'sandbox_build':
      case 'env_pregen':
        return (
          <div className="space-y-3">
            <h4 className="text-sm font-medium text-slate-400 flex items-center gap-2"><TerminalSquare className="w-4 h-4" /> 环境执行日志</h4>
            <TerminalOutput lines={[
              "Downloading base image ubuntu:22.04...",
              "Extracting layer 1/5...",
              "Extracting layer 5/5...",
              "Cloning repository branch " + ticket.branch + "...",
              "Applying entropy rules: agent.md, rule.md...",
              "Environment setup completed successfully in 12s."
            ]} />
          </div>
        );
      case 'env_start':
        return (
          <div className="space-y-3">
            <h4 className="text-sm font-medium text-slate-400 flex items-center gap-2"><ShieldAlert className="w-4 h-4" /> 任务检查</h4>
            <div className="bg-slate-900 border border-slate-800 rounded-lg p-4 text-sm text-slate-300 space-y-2">
              <p>试飞级与需求方案级分析：对照任务执行产出、试飞优化产出与试飞结果。</p>
              {state === 'awaiting_human' ? (
                <p className="text-amber-400">检查未通过，将引导回试飞方案或任务执行节点继续处理。</p>
              ) : (
                <p className="text-green-400">检查通过，可进入测试案例节点。</p>
              )}
            </div>
          </div>
        );
      case 'task_exec':
        return (
          <div className="space-y-3">
            <h4 className="text-sm font-medium text-slate-400">协同开发</h4>
            <div className="text-sm text-slate-400 bg-slate-900 p-4 rounded-lg">
              基于函数级方案和工单，人机协同完成功能点自动化开发。
            </div>
          </div>
        );
      case 'unit_test':
        return (
          <div className="space-y-3">
            <h4 className="text-sm font-medium text-slate-400 flex items-center gap-2"><TestTube className="w-4 h-4" /> 测试案例</h4>
            <div className="bg-slate-900 border border-slate-800 rounded-lg p-4 text-sm text-slate-300 space-y-2">
              <p>功能案例：覆盖本次研发涉及的核心场景与边界条件。</p>
              <p>单元测试文件：<code className="text-cyan-400">tests/unit/test_feature_x.py</code></p>
              <p>当前结果：通过 12 / 12</p>
            </div>
          </div>
        );
      case 'leader_review':
        return (
          <LeaderReviewSopPanel
            synapseApiBase={synapseApiBase || ''}
            ticket={ticket}
            prod={ticket.prod}
            currentUser={{ employee_id: 'local', name: '当前用户' }}
            onOpenReviewCenter={onViewChange ? () => onViewChange('workbench_sandbox') : undefined}
            onTaskComplete={async ({ demandNo, taskNos }) => {
              const base = (synapseApiBase || '').trim();
              if (base) {
                await markDemandMergeComplete(base, { demand_no: demandNo, task_nos: taskNos });
              }
              const taskSet = new Set(taskNos);
              setTickets((prev) =>
                prev.map((t) => {
                  if (t.id !== ticket.id) return t;
                  return {
                    ...t,
                    status: 'completed' as const,
                    ownedWorkItems: (t.ownedWorkItems ?? []).map((wi) => (
                      taskSet.size === 0 || taskSet.has(wi.task_no)
                        ? { ...wi, state: '已完成' as OwnedWorkItemState }
                        : wi
                    )),
                  };
                }),
              );
            }}
          />
        );
      default:
        // Generic fallback for AI nodes
        if (node.type === 'ai') {
          return (
            <div className="space-y-3">
              <h4 className="text-sm font-medium text-slate-400 flex items-center gap-2"><Activity className="w-4 h-4" /> AI 处理分析报告</h4>
              <div className="bg-slate-900 border border-slate-800 rounded-lg p-4 text-sm text-slate-300 leading-relaxed">
                <p>模块 [{node.name}] 处理完成。</p>
                <p className="mt-2 text-slate-500">该环节由智能体自动分析完成，已生成标准结构化输出并传递给下游节点。详细日志已归档至系统存储区。</p>
              </div>
            </div>
          );
        }
        return (
          <div className="text-sm text-slate-400 bg-slate-900 p-4 rounded-lg">
            人工或系统节点已处理完成。
          </div>
        );
    }
  };

  if (!activeTicket) {
    if (!boardDataInitialized) {
      return (
        <div className="flex h-full min-h-0 flex-1 items-center justify-center text-muted-foreground">
          {t("rdManageOrder.loadingBoard")}
        </div>
      );
    }
    return (
      <div className="flex h-full min-h-0 flex-1 flex-col items-center justify-center gap-4 bg-background px-6 text-center text-muted-foreground">
        <FileText className="h-10 w-10 opacity-40" />
        <p className="max-w-md text-sm leading-relaxed">{t("rdManageOrder.emptySnapshot")}</p>
        <Button
          type="primary"
          onClick={() => void refreshWorkOrdersFromDevCloud()}
          disabled={boardRefreshBusy}
          icon={
            boardRefreshBusy ? (
              <Loader2 className="h-4 w-4 animate-spin app-loading-spin" aria-hidden />
            ) : undefined
          }
        >
          {t("rdManageOrder.refresh")}
        </Button>
      </div>
    );
  }

  const showTicketModalPipelineLayers =
    !!selectedTicketForModal &&
    !['prepare', 'pending', 'full_manual'].includes(selectedTicketForModal.status);
  const modalDemandMetrics = dbMetrics?.demand_metrics;
  const modalSummaryMetrics = dbMetrics?.summary;

  return (
    <ConfigProvider theme={{ algorithm: antDark ? theme.darkAlgorithm : theme.defaultAlgorithm }}>
      <div className="flex h-full min-h-0 w-full min-w-0 flex-1 overflow-hidden bg-background font-sans text-foreground">
        
        {/* Left Panel: 与会话列表同宽 */}
        <div className="z-20 flex w-[340px] min-w-[340px] shrink-0 flex-col border-r border-border bg-[color:var(--panel)]">
          <div className="convSidebarHeader">
            <div className="flex items-start justify-between gap-2">
              <h2 className="flex min-w-0 flex-1 items-center gap-2 text-sm font-semibold text-foreground">
              <FileText className="h-4 w-4 shrink-0 text-primary" />
              智能任务看板
              <Tooltip
                title="研发云工单请先进入需求设计环节，才能使用智能研发助手进行处理！"
                placement="topLeft"
                overlayStyle={{ maxWidth: 280 }}
              >
                <span className="inline-flex shrink-0 cursor-help text-muted-foreground transition-colors hover:text-foreground">
                  <Info className="h-3.5 w-3.5" aria-hidden />
                </span>
              </Tooltip>
              </h2>
              <Button
                type="text"
                size="small"
                className="shrink-0 !text-muted-foreground hover:!text-foreground"
                disabled={boardRefreshBusy}
                icon={
                  boardRefreshBusy ? (
                    <Loader2 className="h-4 w-4 animate-spin app-loading-spin" aria-hidden />
                  ) : (
                    <RefreshCw className="h-4 w-4" aria-hidden />
                  )
                }
                onClick={() => void refreshWorkOrdersFromDevCloud()}
                aria-label={t("rdManageOrder.refresh")}
                title={t("rdManageOrder.refresh")}
              />
            </div>
            
            <div className="mt-2 flex items-center rounded-lg border border-border bg-background px-2.5 py-1.5 focus-within:ring-1 focus-within:ring-primary/50">
              <Search className="h-3.5 w-3.5 opacity-70 text-muted-foreground" />
              <input 
                type="text" 
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="搜索工单ID、名称或描述..." 
                className="ml-2 flex-1 bg-transparent text-xs text-foreground placeholder:text-muted-foreground/60 focus:outline-none"
              />
            </div>

            <div className="mt-2 flex w-full min-w-0 flex-wrap items-center justify-between gap-1">
              {([
                { id: 'prepare' as const, label: '预备中', count: prepareCount, color: 'text-blue-400' },
                { id: 'pending' as const, label: '待处理', count: pendingCount, color: 'text-muted-foreground' },
                { id: 'processing' as const, label: '处理中', count: processingCount, color: 'text-primary' },
                {
                  id: 'full_manual' as const,
                  label: t('rdManageOrder.boardFilterFullManual'),
                  count: fullManualCount,
                  color: 'text-violet-500 dark:text-violet-400',
                },
              ]).map((filter) => (
                <button
                  key={filter.id}
                  onClick={() => setTicketFilter(prev => (prev === filter.id ? 'all' : filter.id))}
                  className={`group relative flex min-w-0 flex-1 shrink items-center justify-center gap-0.5 rounded-full px-1.5 py-1 transition-all duration-200 ${
                    ticketFilter === filter.id 
                      ? 'bg-muted/50 shadow-sm ring-1 ring-border/50' 
                      : 'hover:bg-muted/30'
                  }`}
                >
                  <span className={`whitespace-nowrap text-xs font-medium transition-colors ${ticketFilter === filter.id ? filter.color : 'text-muted-foreground group-hover:text-foreground/80'}`}>
                    {filter.label}
                  </span>
                  <span className={`rounded-full px-1.5 py-0.5 font-mono text-[10px] transition-colors ${
                    ticketFilter === filter.id 
                      ? 'bg-background text-foreground shadow-sm' 
                      : 'bg-muted/40 text-muted-foreground/70'
                  }`}>
                    {filter.count}
                  </span>
                </button>
              ))}
            </div>
            <div className="mt-1 flex w-full min-w-0 flex-wrap items-center justify-between gap-1">
              {([
                {
                  id: 'rd_completed' as const,
                  label: t('rdManageOrder.boardFilterRdCompleted'),
                  count: rdCompletedCount,
                  color: 'text-emerald-600 dark:text-emerald-400',
                },
                {
                  id: 'archived' as const,
                  label: t('rdManageOrder.boardFilterArchived'),
                  count: archivedCount,
                  color: 'text-slate-600 dark:text-slate-400',
                },
              ]).map((filter) => (
                <button
                  key={filter.id}
                  onClick={() => setTicketFilter(prev => (prev === filter.id ? 'all' : filter.id))}
                  className={`group relative flex min-w-0 flex-1 shrink items-center justify-center gap-0.5 rounded-full px-1.5 py-1 transition-all duration-200 ${
                    ticketFilter === filter.id
                      ? 'bg-muted/50 shadow-sm ring-1 ring-border/50'
                      : 'hover:bg-muted/30'
                  }`}
                >
                  <span className={`whitespace-nowrap text-xs font-medium transition-colors ${ticketFilter === filter.id ? filter.color : 'text-muted-foreground group-hover:text-foreground/80'}`}>
                    {filter.label}
                  </span>
                  <span className={`rounded-full px-1.5 py-0.5 font-mono text-[10px] transition-colors ${
                    ticketFilter === filter.id
                      ? 'bg-background text-foreground shadow-sm'
                      : 'bg-muted/40 text-muted-foreground/70'
                  }`}>
                    {filter.count}
                  </span>
                </button>
              ))}
            </div>
          </div>
          <div className="rd-order-ticket-list convSidebarList flex flex-1 flex-col gap-1 overflow-y-auto p-1">
            {filteredTickets.map((ticket) => {
              const isDone = ticket.status === 'completed';
              const currentNodeObj = ALL_NODES.find((n) => n.id === ticket.currentNode);
              const progressPercent = Math.round((ticket.currentStage / (SOP_STAGES.length - 1)) * 100);
              const rowHitl = ticket.sopAwaitingHuman;
              const rowPendingOpen = ticket.status === 'pending';
              const rowActionOverlay = rowPendingOpen || rowHitl;
              const openMeetingBusyKey = `demand:${ticket.id}`;
              const cardScopeMetrics = roomMetricsByScope.get(`demand:${ticket.id}`);
              const rowTokenAnimating = cardScopeMetrics?.status === 'processing';
              const progressBarWidth =
                ticket.status === 'completed'
                  ? '100%'
                  : ticket.status === 'pending' ||
                      ticket.status === 'prepare' ||
                      ticket.status === 'full_manual'
                    ? rowTokenAnimating
                      ? '12%'
                      : '0%'
                    : rowTokenAnimating
                      ? `${Math.max(progressPercent, 8)}%`
                      : `${progressPercent}%`;
              const cardTotalTokens = cardScopeMetrics?.tokens ?? 0;
              const cardTokenLabel =
                cardTotalTokens >= 1_000_000
                  ? `${(cardTotalTokens / 1_000_000).toFixed(1)}M`
                  : cardTotalTokens >= 1000
                    ? `${(cardTotalTokens / 1000).toFixed(1)}k`
                    : String(cardTotalTokens);
              const rowFullManual = ticket.status === 'full_manual';
              const hidePipelineNodeLabel =
                ticket.status === 'prepare' || ticket.status === 'full_manual';
              const statusBorderColor = rowHitl
                ? 'bg-destructive'
                : rowFullManual
                  ? 'bg-violet-500 dark:bg-violet-400'
                  : ticket.status === 'processing'
                    ? 'bg-primary'
                    : ticket.status === 'completed'
                      ? 'bg-green-600 dark:bg-green-500'
                      : 'bg-muted-foreground/40';
              const isActive = activeTicketId === ticket.id;

              const ticketCard = (
                <motion.div
                  whileHover={{ scale: 1.01 }}
                  whileTap={{ scale: 0.99 }}
                  onClick={() => {
                    setActiveTicketId(ticket.id);
                    const shouldJumpMeeting =
                      !rowActionOverlay &&
                      (ticket.status === 'processing' || ticket.status === 'error' || rowHitl);
                    if (shouldJumpMeeting) {
                      void navigateToMeetingRoom('demand', ticket.id);
                    }
                  }}
                  className={`rd-order-ticket-card group relative shrink-0 cursor-pointer overflow-hidden rounded-[10px] px-2.5 py-3 transition-[background,box-shadow] duration-150 ${
                    ticket.ownedWorkItems.length > 0 ? 'pb-9 ' : ''
                  }${
                    isActive
                      ? 'bg-[rgba(37,99,235,0.09)] ring-1 ring-border'
                      : 'hover:bg-[rgba(37,99,235,0.05)]'
                  } ${!rowActionOverlay && (ticket.status === 'processing' || ticket.status === 'error' || rowHitl) ? 'hover:ring-1 hover:ring-primary/30' : ''}`}
                  title={
                    ticket.ownedWorkItems.length > 0
                      ? t('rdManageOrder.hoverOwnedWorkItems', { defaultValue: '悬停查看研发子单' })
                      : !rowActionOverlay && (ticket.status === 'processing' || ticket.status === 'error' || rowHitl)
                        ? t('rdManageOrder.clickToOpenMeeting', { defaultValue: '点击进入研发会议室' })
                        : undefined
                  }
                >
                  <div className={`absolute bottom-0 left-0 top-0 w-1 ${statusBorderColor}`} />

                  {rowActionOverlay && (
                    <div className="absolute inset-0 z-30 flex items-center justify-center bg-background/40 opacity-0 backdrop-blur-[2px] transition-opacity duration-300 group-hover:opacity-100">
                      <Button
                        type="primary"
                        size="small"
                        loading={openingMeetingKey === openMeetingBusyKey}
                        className={`h-8 rounded-full border-none px-5 font-medium shadow-lg ${
                          rowPendingOpen
                            ? 'bg-primary text-primary-foreground hover:bg-primary/90'
                            : 'bg-destructive text-destructive-foreground hover:bg-destructive/90'
                        }`}
                        onClick={(e) => {
                          e.stopPropagation();
                          if (rowHitl) {
                            setOpeningMeetingKey(openMeetingBusyKey);
                            void navigateToMeetingRoom('demand', ticket.id).finally(() => {
                              setOpeningMeetingKey(null);
                            });
                            return;
                          }
                          void handleOneClickOpenMeeting(e, ticket);
                        }}
                      >
                        {rowPendingOpen ? t('rdManageOrder.oneClickOpenMeeting') : t('rdManageOrder.actNow')}
                      </Button>
                    </div>
                  )}

                  <div
                    className={`absolute right-2 top-2 flex items-center gap-2 ${rowActionOverlay ? 'z-40' : 'z-20'}`}
                  >
                    <Button
                      type="text"
                      size="small"
                      icon={<Info className="h-3.5 w-3.5" />}
                      className="z-10 flex h-6 w-6 items-center justify-center p-0 text-muted-foreground hover:text-primary"
                      title="工单信息"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleShowTicketDetails(e, ticket);
                      }}
                    />
                  </div>

                  <div className="mb-2 flex flex-wrap items-center gap-1.5 pl-2 pr-10">
                    <span className="flex items-center gap-1 font-mono text-[10px] text-muted-foreground/80">
                      <Clock className="h-3 w-3 opacity-70" />
                      {ticket.createdAt.replace('T', ' ').substring(0, 16)}
                    </span>
                    <ProductProdTag prod={ticket.prod} className="!m-0 text-[10px]" />
                  </div>

                  <h3
                    className={`mb-3 line-clamp-3 flex items-start gap-1.5 pl-2 pr-10 text-sm font-medium leading-snug ${isActive ? 'text-primary' : 'text-foreground'}`}
                  >
                    {ticket.urgency === 'high' && (
                      <Flame className="mt-0.5 h-3.5 w-3.5 shrink-0 animate-pulse text-destructive" />
                    )}
                    {ticket.title}
                  </h3>

                  <div className="flex items-center justify-between pl-2 pr-2 text-xs text-muted-foreground">
                    <div className="flex min-w-0 flex-1 items-center gap-1.5">
                      {isDone ? (
                        <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-green-600 dark:text-green-400" />
                      ) : currentNodeObj?.type.includes('human') ? (
                        <User className="h-3.5 w-3.5 shrink-0 text-amber-500" />
                      ) : currentNodeObj?.type.includes('system') ? (
                        <TerminalSquare className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                      ) : (
                        <Bot className="h-3.5 w-3.5 shrink-0 text-primary" />
                      )}
                      <span
                        className={`truncate ${isDone ? 'text-green-700 dark:text-green-400' : 'text-foreground/90'}`}
                      >
                        {isDone
                          ? '研发完成'
                          : hidePipelineNodeLabel
                            ? '待处理'
                            : currentNodeObj?.name || '未知节点'}
                      </span>
                    </div>

                    <div className="flex shrink-0 items-center gap-2 font-mono text-[10px]">
                      <span className="relative flex items-center gap-1">
                        <Coins
                          className={`h-3 w-3 ${ticket.status === 'processing' || rowHitl ? 'text-amber-500' : 'text-amber-500/70'}`}
                        />
                        <span
                          className={
                            ticket.status === 'processing' || rowHitl
                              ? 'text-amber-500'
                              : 'text-amber-600/70 dark:text-amber-400/70'
                          }
                        >
                          {cardTokenLabel}
                        </span>
                        {rowTokenAnimating && (
                          <motion.div
                            initial={{ y: 5, opacity: 0 }}
                            animate={{ y: -10, opacity: [0, 1, 0] }}
                            transition={{ repeat: Infinity, duration: 1.5 }}
                            className="absolute -right-3 -top-1 text-green-500"
                          >
                            <TrendingUp className="h-2.5 w-2.5" />
                          </motion.div>
                        )}
                      </span>
                    </div>
                  </div>

                  <div className="rd-order-ticket-progress-track" aria-hidden>
                    <div
                      className={`rd-order-ticket-progress-fill ${
                        ticket.status === 'completed'
                          ? 'rd-order-ticket-progress-fill--done'
                          : rowTokenAnimating
                            ? 'rd-order-ticket-progress-fill--shimmer'
                            : 'rd-order-ticket-progress-fill--idle'
                      }`}
                      style={{ width: progressBarWidth }}
                    />
                  </div>
                </motion.div>
              );

              if (ticket.ownedWorkItems.length > 0) {
                return (
                  <OwnedWorkItemsCardHover key={ticket.id} items={ticket.ownedWorkItems}>
                    {ticketCard}
                  </OwnedWorkItemsCardHover>
                );
              }

              return <React.Fragment key={ticket.id}><div className="mb-1 shrink-0">{ticketCard}</div></React.Fragment>;
            })}
          </div>
        </div>

        {/* Right: 流水线（背景与主内容区一致，仅轨道区略提亮） */}
        <div className="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-background">
          
          <div className="chatTopBar z-20 min-h-[4.25rem] flex-wrap gap-y-2">
            <div className="min-w-0 flex-1">
              <div className="mb-1 flex flex-wrap items-center gap-2">
                <h1 className="max-w-[min(100%,52rem)] truncate text-base font-semibold tracking-tight text-foreground md:text-lg">
                  {activeTicket.title}
                </h1>
                <span className="shrink-0 rounded border border-border bg-muted/40 px-2 py-0.5 font-mono text-[10px] text-primary">
                  {activeTicket.id}
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                <span className="flex items-center gap-1.5">
                  <Clock className={`h-3.5 w-3.5 shrink-0 ${sopTopDurationHot ? 'text-red-400' : ''}`} />
                  持续运行:{' '}
                  <span className={`font-mono ${sopTopDurationHot ? 'text-red-400' : 'text-foreground/90'}`}>
                    {meetingSummaryLoading ? '…' : sopTopRunTimeLabel}
                  </span>
                </span>
                <span className="flex items-center gap-1.5">
                  <Coins className="h-3.5 w-3.5 shrink-0 text-amber-500/80" /> 消耗 Token:{' '}
                  <span className="font-mono text-foreground/90">
                    {meetingSummaryLoading
                      ? '…'
                      : (meetingSummary?.summary_metrics?.tokens ?? activeTicket.tokens).toLocaleString()}
                  </span>
                </span>
                {meetingSummaryErr && (
                  <span className="text-[10px] text-destructive/80" title={meetingSummaryErr}>
                    {t('rdManageOrder.meetingMetricsUnavailable', { defaultValue: '会议室指标暂不可用' })}
                  </span>
                )}
              </div>
            </div>
            
            <motion.div className="flex shrink-0 flex-wrap items-center gap-2">
              <ProductProdTag prod={activeTicket.prod} />
              {activeTicket.status === 'full_manual' && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="flex items-center gap-2 rounded-lg border border-violet-500/40 bg-violet-500/10 px-3 py-1.5 text-xs font-medium text-violet-700 shadow-sm dark:text-violet-200"
                >
                  <User className="h-4 w-4 shrink-0" />
                  {t('rdManageOrder.badgeFullManual')}
                </motion.div>
              )}
              {activeTicket.sopAwaitingHuman && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="flex items-center gap-2 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-1.5 text-xs font-medium text-destructive shadow-sm"
                >
                  <ShieldAlert className="h-4 w-4 shrink-0" />
                  {t('rdManageOrder.badgeHitl')}
                </motion.div>
              )}
            </motion.div>
          </div>

          <div
            ref={containerRef}
            className="rd-order-sop-viewport relative min-h-0 flex-1 overflow-hidden bg-muted/10 cursor-grab active:cursor-grabbing"
            title="滚轮左右滑动浏览 SOP 节点；Ctrl + 滚轮缩放"
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
          >
            
            {activeTicket.status === 'prepare' ? (
              <div className="flex h-full items-center justify-center p-8">
                <div className="max-w-md rounded-xl border border-blue-500/25 bg-blue-500/5 p-6 text-center shadow-sm">
                  <Info className="mx-auto mb-4 h-12 w-12 text-blue-500/90" />
                  <h3 className="mb-2 text-lg font-medium text-foreground">预备中</h3>
                  <p className="text-sm leading-relaxed text-muted-foreground">
                    请先将工单手动处理至需求设计阶段，才能开始智能研发助手自动化处理。
                  </p>
                </div>
              </div>
            ) : activeTicket.status === 'full_manual' ? (
              <div className="flex h-full items-center justify-center p-8">
                <div className="max-w-md rounded-xl border border-violet-500/25 bg-violet-500/5 p-6 text-center shadow-sm">
                  <User className="mx-auto mb-4 h-12 w-12 text-violet-600 dark:text-violet-400" />
                  <h3 className="mb-2 text-lg font-medium text-foreground">{t('rdManageOrder.panelFullManualTitle')}</h3>
                  <p className="text-sm leading-relaxed text-muted-foreground">{t('rdManageOrder.panelFullManualBody')}</p>
                </div>
              </div>
            ) : (
            <div
              ref={canvasRef}
              className="rd-order-sop-canvas absolute flex h-full min-h-0 min-w-max items-center px-16 origin-left"
              style={{ transform: `translate(${transform.x}px, ${transform.y}px) scale(${transform.scale})` }}
            >
              {/* Background Central Data Bus Line */}
              <div className="absolute left-0 right-0 top-1/2 z-0 mx-16 h-1.5 -translate-y-1/2 rounded-full bg-border shadow-inner" />
              
              {/* Active Central Data Bus Line */}
              <motion.div 
                className="absolute left-16 top-1/2 z-0 h-1.5 -translate-y-1/2 rounded-full bg-primary shadow-[0_0_15px_color-mix(in_srgb,var(--primary)_55%,transparent)]"
                initial={{ width: 0 }}
                animate={{ width: activeLineWidth }}
                transition={{ duration: 0.8, ease: "easeOut" }}
              />

              {SOP_STAGES.map((stage, sIdx) => {
                const isStagePast = activeTicket.currentStage > stage.id;
                const isStageActive = activeTicket.currentStage === stage.id;
                const isStageFuture = activeTicket.currentStage < stage.id;
                const isCollapsed = collapsedStages[stage.id];

                if (isCollapsed) {
                  return (
                    <div key={stage.id} className="relative z-20 flex h-full min-h-0 border-l border-dashed border-border/60 px-6">
                      {/* 折叠合并标签抬到「画布顶 ↔ 中央进度线」的中段，避免与蓝色进度条重叠 */}
                      <motion.div 
                        whileHover={{ scale: 1.05 }}
                        onClick={() => setCollapsedStages(prev => ({ ...prev, [stage.id]: false }))}
                        className="stage-collapse-btn absolute left-1/2 top-[25%] z-20 flex -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-3 rounded-full border border-green-500/30 bg-green-500/10 px-2 py-6 shadow-sm transition-colors hover:bg-green-500/20 cursor-pointer"
                      >
                        <CheckCircle2 className="w-5 h-5 text-green-500" />
                        <div className="text-xs text-green-600 dark:text-green-400 font-medium tracking-widest" style={{ writingMode: 'vertical-rl' }}>{stage.name}</div>
                        <div className="text-[10px] text-green-500/70 font-mono">{stage.nodes.length}</div>
                      </motion.div>
                    </div>
                  );
                }

                return (
                  <div key={stage.id} className="relative z-10 flex h-full min-h-0 border-l border-dashed border-border/60 px-6">
                    
                    {/* Stage Label on the Line — 最后一阶段不折叠 */}
                    <div 
                      className={`stage-collapse-btn absolute left-0 top-1/2 flex -translate-x-1/2 -translate-y-1/2 flex-col items-center transition-transform ${
                        stage.id === LAST_PIPELINE_STAGE_ID
                          ? 'cursor-default'
                          : 'cursor-pointer hover:scale-110'
                      }`}
                      onClick={
                        stage.id === LAST_PIPELINE_STAGE_ID
                          ? undefined
                          : () => setCollapsedStages(prev => ({ ...prev, [stage.id]: true }))
                      }
                      title={stage.id === LAST_PIPELINE_STAGE_ID ? undefined : '点击折叠该阶段'}
                    >
                       <div className={`z-10 flex h-8 w-8 items-center justify-center rounded-full border-[3px] bg-background text-xs font-bold ${
                         isStagePast || activeTicket.status === 'completed' ? 'border-green-500 text-green-500 shadow-[0_0_10px_color-mix(in_srgb,var(--success)_30%,transparent)]' :
                         isStageActive && activeTicket.status !== 'prepare' ? 'border-primary text-primary shadow-[0_0_14px_color-mix(in_srgb,var(--primary)_30%,transparent)]' :
                         'border-muted text-muted-foreground'
                       }`}>
                         {isStagePast || activeTicket.status === 'completed' ? <CheckCircle2 className="h-5 w-5" /> : stage.id}
                       </div>
                       <div className={`absolute top-10 whitespace-nowrap text-xs font-medium tracking-widest ${isStageActive && activeTicket.status !== 'prepare' ? 'text-primary' : isStagePast || activeTicket.status === 'completed' ? 'text-muted-foreground' : 'text-muted-foreground/50'}`}>
                         {stage.name}
                       </div>
                    </div>

                    {/* Nodes Array */}
                    <div className="ml-16 flex h-full min-h-0 items-center">
                      {stage.nodes.map((node, nIdx) => {
                        const globalIndex = ALL_NODES.findIndex(n => n.id === node.id);
                        const isTop = globalIndex % 2 === 0;
                        const state = getNodeStateGlobal(activeTicket, node.id);
                        const isSkipped = state === 'skipped';
                        const typeInfo = getSopNodeTypeInfo(node.type);

                        const isHuman = node.type.includes('human') || node.type === 'ai_exception';
                        const nextNode = stage.nodes[nIdx + 1];
                        const isNextHuman = nextNode && (nextNode.type.includes('human') || nextNode.type === 'ai_exception');
                        
                        // Group AI nodes highly compressed (-mr-12 for horizontal overlapping), separate human intervention/wait nodes heavily (mr-32)
                        const marginClass = nIdx === stage.nodes.length - 1 ? 'mr-16' : (isHuman || isNextHuman ? 'mr-32' : '-mr-12');
                        
                        const hasMeetingSummary = Boolean(meetingSummary);
                        const runtimeMetrics = pickSopNodePipelineMetrics(
                          meetingNodeMetricsById.get(node.id),
                          hasMeetingSummary,
                          state,
                        );
                        const metricsLoading = meetingSummaryLoading;
                        const modelStr = resolveSopNodeModelDisplay(
                          node.type,
                          node.id,
                          meetingRoomConfig,
                          llmEndpointCatalog,
                        );
                        const timeStr =
                          runtimeMetrics != null
                            ? formatDurationSeconds(runtimeMetrics.deal_seconds, t)
                            : metricsLoading || meetingSummaryLoading
                              ? '…'
                              : '—';
                        const tokenStr =
                          runtimeMetrics != null
                            ? formatTokenCount(runtimeMetrics.tokens)
                            : metricsLoading || meetingSummaryLoading
                              ? '…'
                              : '—';
                        const showNodeMetricsRow =
                          !isSkipped && sopNodeShowsLlmMetrics(node.type);
                        
                        let cardClass = "min-h-[9rem] h-auto border-border bg-card/60 text-muted-foreground";
                        let iconClass = "text-muted-foreground";
                        let dotClass = "bg-border border-background";
                        let lineClass = "bg-border";
                        let hoverClass = "hover:border-primary/35 hover:bg-muted/30";

                        if (isSkipped) {
                          cardClass = `min-h-[9rem] h-auto border ${SOP_NODE_SKIPPED_CARD_CLASS}`;
                          iconClass = 'text-slate-400';
                          dotClass = 'bg-slate-500/50 border-background';
                          lineClass = 'bg-slate-600/40';
                          hoverClass = '';
                        } else if (state === 'completed') {
                          cardClass = "min-h-[9.5rem] h-auto border-green-500/35 bg-card/90 text-foreground";
                          iconClass = "text-green-500";
                          dotClass = "bg-green-500 border-background";
                          lineClass = "bg-green-500/50";
                          hoverClass = "hover:border-green-500/50 hover:bg-muted/25";
                        } else if (state === 'processing') {
                          cardClass = "min-h-[9rem] h-auto border-primary/45 bg-primary/10 text-foreground shadow-[0_0_18px_color-mix(in_srgb,var(--primary)_12%,transparent)]";
                          iconClass = "text-primary";
                          dotClass = "bg-primary border-background shadow-[0_0_10px_color-mix(in_srgb,var(--primary)_55%,transparent)]";
                          lineClass = "bg-primary/75";
                          hoverClass = "hover:border-primary hover:bg-primary/15";
                        } else if (state === 'error') {
                          cardClass = "min-h-[9rem] h-auto border-destructive/55 bg-destructive/10 text-destructive-foreground shadow-[0_0_16px_color-mix(in_srgb,var(--destructive)_14%,transparent)]";
                          iconClass = "text-destructive";
                          dotClass = "bg-destructive border-background shadow-[0_0_10px_color-mix(in_srgb,var(--destructive)_45%,transparent)] animate-pulse";
                          lineClass = "bg-destructive/75";
                          hoverClass = "hover:border-destructive hover:bg-destructive/15";
                        } else if (state === 'awaiting_human') {
                          cardClass = "min-h-[9rem] h-auto border-amber-500/55 bg-amber-500/10 text-amber-950 shadow-[0_0_16px_rgba(245,158,11,0.12)] dark:text-amber-50";
                          iconClass = "text-amber-600 dark:text-amber-400";
                          dotClass = "bg-amber-500 border-background shadow-[0_0_10px_rgba(245,158,11,0.45)] animate-pulse";
                          lineClass = "bg-amber-500/75";
                          hoverClass = "hover:border-amber-500 hover:bg-amber-500/15";
                        }

                        const renderPopoverContent = () => {
                          if (isSkipped) {
                            return (
                              <div className="max-w-xs p-2 text-xs text-muted-foreground">
                                该节点未在会议室配置中开启，流程将自动跳过。
                              </div>
                            );
                          }
                          return (
                            <div className="w-72 p-3 text-xs">
                              <div className="mb-2 font-medium text-foreground">{node.name}</div>
                              <dl className="space-y-1.5 text-muted-foreground">
                                <div className="flex justify-between gap-3">
                                  <dt>模型</dt>
                                  <dd className="font-mono text-foreground/90">{modelStr}</dd>
                                </div>
                                <div className="flex justify-between gap-3">
                                  <dt>耗时</dt>
                                  <dd className="font-mono text-foreground/90">{timeStr}</dd>
                                </div>
                                <div className="flex justify-between gap-3">
                                  <dt>Token</dt>
                                  <dd className="font-mono text-amber-500/90">{tokenStr}</dd>
                                </div>
                              </dl>
                              {!activeMeetingRoomId && !meetingSummaryLoading ? (
                                <p className="mt-2 text-[10px] text-muted-foreground/80">
                                  开会后将与节点处理详情一致，从 activity 汇总指标。
                                </p>
                              ) : null}
                            </div>
                          );
                        };

                        return (
                          <div id={`node-${node.id}`} key={node.id} className={`relative flex h-full min-h-0 w-[17.5rem] flex-col items-center justify-center self-stretch ${marginClass}`}>
                            {/* Stem connecting card to central bus */}
                            <div className={`absolute left-1/2 w-0.5 -translate-x-1/2 ${lineClass} z-0 ${
                              isTop ? 'bottom-[calc(50%+3px)] h-[37px]' : 'top-[calc(50%+3px)] h-[37px]'
                            }`} />

                            {/* Node Point on Data Bus */}
                            <div className={`absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-3.5 h-3.5 rounded-full border-[3px] z-10 ${dotClass}`} />

                            {/* Node Card */}
                            <Popover 
                              content={renderPopoverContent()} 
                              placement={isTop ? "top" : "bottom"} 
                              mouseEnterDelay={0.6}
                              overlayInnerStyle={{ 
                                background: 'rgba(15, 23, 42, 0.75)', 
                                backdropFilter: 'blur(16px)', 
                                border: '1px solid rgba(255,255,255,0.1)',
                                boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
                                borderRadius: '12px'
                              }}
                            >
                              <motion.div
                                whileHover={
                                  isSkipped ? undefined : { scale: 1.05, y: isTop ? -5 : 5 }
                                }
                                onClick={() => handleNodeClick(node)}
                                className={`node-card absolute left-0 z-20 flex w-full shrink-0 cursor-pointer flex-col rounded-xl border p-4 backdrop-blur-sm transition-all duration-300 ${cardClass} ${hoverClass} ${isTop ? 'bottom-[calc(50%+40px)]' : 'top-[calc(50%+40px)]'}`}
                              >
                                <div className="mb-2 flex items-start justify-between gap-2">
                                  <div className="rounded-lg bg-muted/40 p-1.5">
                                    {isSkipped ? (
                                      <SkipForward className={`h-4 w-4 ${iconClass}`} />
                                    ) : state === 'completed' ? (
                                      <CheckCircle2 className={`w-4 h-4 ${iconClass}`} />
                                    ) : state === 'processing' ? (
                                      <Loader2 className={`w-4 h-4 ${iconClass} animate-spin`} />
                                    ) : state === 'error' ? (
                                      <AlertCircle className={`w-4 h-4 ${iconClass} animate-pulse`} />
                                    ) : state === 'awaiting_human' ? (
                                      <AlertTriangle className={`w-4 h-4 ${iconClass} animate-pulse`} />
                                    ) : (
                                      <CircleDashed className={`w-4 h-4 ${iconClass}`} />
                                    )}
                                  </div>
                                  <div className="flex shrink-0 flex-col items-end gap-1">
                                    {isSkipped ? (
                                      <span className="rd-meeting-node-card__skip-badge">已跳过</span>
                                    ) : null}
                                    <div
                                      className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 font-mono text-[10px] ${typeInfo.bg}`}
                                    >
                                      <Zap className={`h-3 w-3 ${typeInfo.color}`} />
                                      <span className={`font-medium ${typeInfo.color}`}>{typeInfo.label}</span>
                                    </div>
                                  </div>
                                </div>
                                <h4
                                  className={`mb-1 text-sm font-medium ${isSkipped ? 'text-slate-400' : ''}`}
                                >
                                  {node.name}
                                </h4>
                                <p className="line-clamp-3 min-h-[2.75rem] text-[11px] leading-relaxed opacity-80">{node.desc}</p>
                                
                                {showNodeMetricsRow ? (
                                  <div
                                    className="mt-2 flex w-full items-center gap-2 border-t border-border/60 pt-2 font-mono text-[9px] leading-none text-muted-foreground"
                                    title={`模型 ${modelStr} · 耗时 ${timeStr} · Token ${tokenStr}`}
                                  >
                                    <span className="flex min-w-0 flex-1 items-center gap-1 truncate opacity-90">
                                      <Cpu className="h-3 w-3 shrink-0 text-primary/70" />
                                      <span className="truncate text-foreground/85">{modelStr}</span>
                                    </span>
                                    <span className="inline-flex shrink-0 items-center gap-0.5 opacity-85">
                                      <Clock className="h-3 w-3" />
                                      {timeStr}
                                    </span>
                                    <span className="inline-flex shrink-0 items-center gap-0.5 text-amber-500/90">
                                      <Coins className="h-3 w-3" />
                                      {tokenStr}
                                    </span>
                                  </div>
                                ) : null}
                              </motion.div>
                            </Popover>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
            )}
          </div>
        </div>
      </div>

      {/* Node Details Drawer */}
      <Drawer
        className="rd-order-node-drawer"
        title={
          selectedNode ? (
            <div className="rd-order-node-drawer__title-row relative z-[1] flex min-w-0 items-center gap-2.5 text-foreground">
              {getNodeStateGlobal(activeTicket, selectedNode.id) === 'skipped' ? (
                <div className="shrink-0 rounded-lg border border-slate-500/30 bg-slate-500/10 p-1.5">
                  <SkipForward className="h-4 w-4 text-slate-400" />
                </div>
              ) : (
                <div
                  className={`shrink-0 rounded-lg border p-1.5 ${getSopNodeTypeInfo(selectedNode.type).bg}`}
                >
                  <Zap className={`h-4 w-4 ${getSopNodeTypeInfo(selectedNode.type).color}`} />
                </div>
              )}
              <span className="min-w-0 truncate text-sm font-semibold tracking-tight md:text-base">
                {selectedNode.name}
              </span>
              <span className="shrink-0 text-border/80" aria-hidden>
                ·
              </span>
              <span
                className={`shrink-0 rounded border border-current/20 bg-current/5 px-1.5 py-0.5 text-[11px] font-medium leading-none ${getSopNodeTypeInfo(selectedNode.type).color}`}
              >
                {getSopNodeTypeInfo(selectedNode.type).label}
              </span>
              <span className="shrink-0 font-mono text-[11px] text-muted-foreground/85">
                {selectedNode.id}
              </span>
              {(() => {
                const st = getNodeStateGlobal(activeTicket, selectedNode.id);
                if (st === 'processing') {
                  return (
                    <span className="rd-order-node-drawer__status-pill rd-order-node-drawer__status-pill--processing ml-auto shrink-0">
                      <Loader2 className="h-3 w-3 animate-spin" /> 进行中
                    </span>
                  );
                }
                if (st === 'completed') {
                  return (
                    <span className="rd-order-node-drawer__status-pill rd-order-node-drawer__status-pill--completed ml-auto shrink-0">
                      <CheckCircle2 className="h-3 w-3" /> 已完成
                    </span>
                  );
                }
                if (st === 'skipped') {
                  return (
                    <span className="rd-order-node-drawer__status-pill rd-order-node-drawer__status-pill--skipped ml-auto shrink-0">
                      <SkipForward className="h-3 w-3" /> 已跳过
                    </span>
                  );
                }
                return null;
              })()}
            </div>
          ) : null
        }
        placement="right"
        closable={false}
        onClose={() => setDrawerOpen(false)}
        open={drawerOpen}
        width={Math.min(620, typeof window !== 'undefined' ? window.innerWidth * 0.92 : 620)}
        styles={{
          header: {
            background: 'var(--panel2)',
            borderBottom: 'none',
            padding: '14px 20px',
          },
          body: {
            background: 'var(--bg-app)',
            padding: 0,
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
          },
          mask: { backdropFilter: 'blur(6px)', background: 'rgba(0,0,0,0.52)' },
        }}
      >
        {selectedNode && (
          <div className="rd-order-node-drawer__shell flex h-full min-h-0 flex-col">
            <div className="rd-order-node-drawer__glow" aria-hidden />
            <div className="rd-order-node-drawer__desc">
              <h4 className="mb-2 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                <Info className="h-3 w-3 text-primary/80" />
                节点说明
              </h4>
              <p className="text-sm leading-relaxed text-foreground/92">{selectedNode.desc}</p>
            </div>
            {selectedNode.type === 'ai_human' && meetingSummary?.room_id ? (
              <CollabHumanReviewConclusionCard
                synapseApiBase={synapseApiBase}
                roomId={meetingSummary.room_id}
                nodeId={selectedNode.id}
                nodeState={mapNodeStateForPanel(getNodeStateGlobal(activeTicket, selectedNode.id))}
                archiveFiles={meetingArchiveByNodeId.get(selectedNode.id)}
                recentHistory={meetingSummary.recent_history}
                solutionReviewBlocked={Boolean(
                  (meetingSummary.room_state as { solution_review_blocked?: boolean } | undefined)
                    ?.solution_review_blocked,
                )}
                onOpenMeeting={() => handleJumpToMeeting()}
              />
            ) : null}
            <div className="rd-order-node-drawer__content">
              <h4 className="mb-3 flex items-center justify-between gap-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                <span className="flex items-center gap-1.5">
                  <Activity className="h-3 w-3 text-violet-400" />
                  执行产物 / 实况
                </span>
                <span className="normal-case tracking-normal text-[10px] font-normal text-muted-foreground/70">
                  Tab 栏可滚轮左右切换
                </span>
              </h4>
              <div className="min-h-0 flex-1 rounded-xl border border-border/50 bg-[color-mix(in_srgb,var(--panel2)_55%,transparent)] p-1 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
                {meetingSummary?.room_id && selectedNode ? (
                  <MeetingNodeDetailPanel
                    variant="orderDrawer"
                    synapseApiBase={synapseApiBase}
                    roomId={meetingSummary.room_id}
                    scopeType={sopMeetingScope?.scopeType}
                    scopeId={sopMeetingScope?.scopeId}
                    nodeId={selectedNode.id}
                    nodeName={selectedNode.name}
                    nodeState={mapNodeStateForPanel(getNodeStateGlobal(activeTicket, selectedNode.id))}
                    pollMs={activeTicket.status === 'processing' ? 5000 : 0}
                  />
                ) : (
                  <div className="custom-scrollbar max-h-[min(58vh,560px)] overflow-y-auto p-4">
                    {renderNodeOutput(selectedNode, activeTicket)}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </Drawer>

      {/* Ticket Details Modal */}
      <Modal
        closable={false}
        title={
          modalDemand ? (
            <div className="flex min-w-0 items-center gap-3 border-b border-border pb-3 text-foreground">
              <div className="flex min-w-0 flex-1 items-center gap-2 text-base font-semibold leading-snug">
                <FileText className="h-5 w-5 shrink-0 text-primary" />
                <span className="line-clamp-1" title={modalDemand.demand_title}>
                  {modalDemand.demand_title}
                </span>
              </div>
              <Tag color="blue" bordered={false} className="m-0 shrink-0 font-mono text-xs">
                #{modalDemand.demand_no}
              </Tag>
            </div>
          ) : (
            <div className="flex items-center gap-2 border-b border-border pb-3 text-foreground">
              <FileText className="h-5 w-5 text-primary" />
              <span className="text-lg">—</span>
            </div>
          )
        }
        open={ticketModalOpen}
        onCancel={() => {
          setTicketModalOpen(false);
          setSelectedTicketForModal(null);
          setModalDemand(null);
          setDbMetrics(null);
          setDbMetricsErr(null);
        }}
        footer={null}
        width={720}
        styles={{
          root: { background: 'var(--panel2)', border: '1px solid var(--line)', color: 'var(--text)' },
          body: { paddingTop: 0, paddingBottom: 16, maxHeight: 'min(85vh, 860px)', overflowY: 'auto' },
          header: { background: 'transparent' },
          mask: { backdropFilter: 'blur(4px)' },
        }}
      >
        {selectedTicketForModal && modalDemand && (
          <Tabs
            key={`ticket-modal-${modalDemand.demand_no}`}
            defaultActiveKey="overview"
            items={[
              {
                key: 'overview',
                label: t('rdManageOrder.tabOverview'),
                children: (
                  <div className="space-y-5 pt-2">
                    {showTicketModalPipelineLayers && (
                      <section>
                        <h3 className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                          <Activity className="h-4 w-4 text-primary" />
                          {t('rdManageOrder.sectionSummary')}
                        </h3>
                        {dbMetricsLoading ? (
                          <div className="flex items-center gap-2 text-sm text-muted-foreground">
                            <Loader2 className="h-4 w-4 animate-spin" />
                            {t('rdManageOrder.loadingMetrics')}
                          </div>
                        ) : (
                          <div className="grid grid-cols-3 gap-3">
                            <div className="relative overflow-hidden rounded-xl border border-border/50 bg-gradient-to-br from-background/60 to-muted/20 p-4">
                              <div className="relative z-10 text-[10px] font-medium uppercase text-muted-foreground">
                                {t('rdManageOrder.processDuration')}
                              </div>
                              <div className="relative z-10 mt-1 font-mono text-2xl font-bold text-foreground">
                                {formatDurationSeconds(modalSummaryMetrics?.process_seconds ?? 0, t)}
                              </div>
                              <Clock className="absolute -bottom-2 -right-2 h-16 w-16 text-primary/5" />
                            </div>
                            <div className="relative overflow-hidden rounded-xl border border-border/50 bg-gradient-to-br from-background/60 to-muted/20 p-4">
                              <div className="relative z-10 text-[10px] font-medium uppercase text-muted-foreground">
                                {t('rdManageOrder.totalTokens')}
                              </div>
                              <div className="relative z-10 mt-1 font-mono text-2xl font-bold text-foreground">
                                {(modalSummaryMetrics?.total_tokens ?? 0).toLocaleString()}
                              </div>
                              <Coins className="absolute -bottom-2 -right-2 h-16 w-16 text-primary/5" />
                            </div>
                            <div className="relative overflow-hidden rounded-xl border border-border/50 bg-gradient-to-br from-background/60 to-muted/20 p-4">
                              <div className="relative z-10 text-[10px] font-medium uppercase text-muted-foreground">
                                {t('rdManageOrder.humanInterventions')}
                              </div>
                              <div className="relative z-10 mt-1 font-mono text-2xl font-bold text-foreground">
                                {modalSummaryMetrics?.human_interventions ?? 0}
                              </div>
                              <User className="absolute -bottom-2 -right-2 h-16 w-16 text-primary/5" />
                            </div>
                            <div className="col-span-3 relative overflow-hidden rounded-xl border border-border/50 bg-gradient-to-br from-background/60 to-muted/20 p-4">
                              <div className="relative z-10 text-[10px] font-medium uppercase text-muted-foreground">
                                {t('rdManageOrder.artifacts')}
                              </div>
                              <div className="relative z-10 mt-2 flex flex-wrap gap-1.5">
                                {(modalSummaryMetrics?.artifacts?.length ?? 0) === 0 ? (
                                  <span className="text-xs text-muted-foreground">{t('rdManageOrder.noArtifacts')}</span>
                                ) : (
                                  (modalSummaryMetrics?.artifacts ?? []).map((a, i) => (
                                    <Tag color="purple" bordered={false} key={`${a}-${i}`} className="m-0 max-w-full truncate text-xs">
                                      {a}
                                    </Tag>
                                  ))
                                )}
                              </div>
                              <FileCode2 className="absolute -bottom-4 -right-2 h-20 w-20 text-primary/5" />
                            </div>
                          </div>
                        )}
                        {dbMetricsErr && !dbMetricsLoading ? (
                          <p className="mt-2 text-xs text-destructive/90">{dbMetricsErr}</p>
                        ) : null}
                      </section>
                    )}

                    <section>
                      <h3 className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        <ClipboardList className="h-4 w-4 text-primary" />
                        {t('rdManageOrder.sectionDemand')}
                      </h3>
                      <div className="mb-4 grid grid-cols-1 gap-x-4 gap-y-3 rounded-xl border border-border/50 bg-muted/10 p-4 sm:grid-cols-2">
                        <div className="flex items-center justify-between text-sm sm:block">
                          <span className="text-xs text-muted-foreground">
                            {t('rdManageOrder.labelColon', { label: t('rdManageOrder.demandCreateTime') })}
                          </span>
                          <span className="font-mono text-foreground/90">{modalDemand.demand_create_time || '—'}</span>
                        </div>
                        <div className="flex items-center justify-between text-sm sm:block">
                          <span className="text-xs text-muted-foreground">
                            {t('rdManageOrder.labelColon', { label: t('rdManageOrder.demandStatus') })}
                          </span>
                          <Badge 
                            status={modalDemand.demand_status?.includes('完成') || modalDemand.demand_status?.includes('Done') ? 'success' : 'processing'} 
                            text={
                              <span className="font-medium text-foreground/90">{(modalDemand.demand_status || '—').trim() || '—'}</span>
                            } 
                          />
                        </div>
                        <div className="flex items-center justify-between text-sm sm:block">
                          <span className="text-xs text-muted-foreground">
                            {t('rdManageOrder.labelColon', { label: t('rdManageOrder.demandImpact') })}
                          </span>
                          <span className="whitespace-pre-line text-foreground/90">
                            {formatDemandImpactDisplay(modalDemand.demand_impact || '') || '—'}
                          </span>
                        </div>
                        <div className="flex items-center justify-between text-sm sm:block">
                          <span className="text-xs text-muted-foreground">
                            {t('rdManageOrder.labelColon', { label: t('rdManageOrder.productVersion') })}
                          </span>
                          <Tag bordered={false} className="m-0 font-mono">
                            {(modalDemand.product_version_code || '—').trim() || '—'}
                          </Tag>
                        </div>
                        <div className="flex items-center justify-between text-sm sm:block">
                          <span className="text-xs text-muted-foreground">
                            {t('rdManageOrder.labelColon', { label: t('rdManageOrder.demandDealTime') })}
                          </span>
                          <span className="font-mono text-foreground/90">
                            {dbMetricsLoading && !modalDemandMetrics
                              ? '…'
                              : formatDurationSeconds(modalDemandMetrics?.deal_seconds ?? 0, t)}
                          </span>
                        </div>
                        <div className="flex items-center justify-between text-sm sm:block">
                          <span className="text-xs text-muted-foreground">
                            {t('rdManageOrder.labelColon', { label: t('rdManageOrder.demandDealToken') })}
                          </span>
                          <span className="font-mono text-foreground/90">
                            {dbMetricsLoading && !modalDemandMetrics
                              ? '…'
                              : (modalDemandMetrics?.deal_tokens ?? 0).toLocaleString()}
                          </span>
                        </div>
                      </div>
                      
                      <div className="mb-2 text-[10px] font-semibold uppercase text-muted-foreground">
                        {t('rdManageOrder.demandDesc')}
                      </div>
                      <div className="rounded-lg border border-border/60 bg-background/50 p-4 text-sm">
                        {(modalDemand.demand_desc || '').trim() ? (
                          <div className="prose prose-sm dark:prose-invert max-w-none text-foreground/90 prose-pre:border prose-pre:border-border/50 prose-pre:bg-muted/30 prose-a:text-primary">
                            <ReactMarkdown
                              remarkPlugins={[remarkGfm]}
                              components={{
                                a: ({ ...props }) => (
                                  <a {...props} className="underline" target="_blank" rel="noopener noreferrer" />
                                ),
                              }}
                            >
                              {modalDemand.demand_desc || ''}
                            </ReactMarkdown>
                          </div>
                        ) : (
                          <span className="text-muted-foreground">{t('rdManageOrder.markdownEmpty')}</span>
                        )}
                      </div>
                    </section>
                    
                    <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border/70 pt-4 text-xs text-muted-foreground">
                      <div className="flex items-center gap-1.5">
                        <span>{t('rdManageOrder.labelColon', { label: t('rdManageOrder.designer') })}</span>
                        <Avatar size={18} className="bg-primary/20 text-xs font-semibold text-primary">
                          {(modalDemand.demand_designer || selectedTicketForModal.owner || '?').charAt(0)}
                        </Avatar>
                        <span className="font-medium text-foreground/80">
                          {(modalDemand.demand_designer || selectedTicketForModal.owner || '—').trim()}
                        </span>
                      </div>
                    </div>
                  </div>
                )
              },
              ...(showTicketModalPipelineLayers && modalOwnedWorkItems.length > 0
                ? [
                    {
                      key: 'tasks',
                      label: t('rdManageOrder.tabTasksWithCount', {
                        count: modalOwnedWorkItems.length,
                      }),
                      children: (
                        <div className="space-y-4 pt-2">
                          <Collapse
                            className="bg-transparent"
                            bordered={false}
                            expandIconPosition="end"
                            items={modalOwnedWorkItems.map((wi) => {
                              const tm = dbMetrics?.task_metrics?.[wi.task_no];
                              return {
                                key: wi.task_no,
                                style: {
                                  marginBottom: 12,
                                  background: 'var(--panel2)',
                                  borderRadius: 8,
                                  border: '1px solid var(--line)',
                                  overflow: 'hidden',
                                },
                                label: (
                                  <div className="flex flex-col gap-1.5 pr-2">
                                    <div className="flex min-w-0 items-center gap-2">
                                      <Tag color="processing" bordered={false} className="m-0 shrink-0 font-mono text-[10px]">
                                        {wi.task_no}
                                      </Tag>
                                      <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground" title={wi.task_title}>
                                        {wi.task_title}
                                      </span>
                                    </div>
                                    <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                                      <OwnedWorkItemStateBadge state={wi.state} />
                                      <div className="flex items-center gap-1">
                                        <Clock className="h-3 w-3" />
                                        <span>
                                          {dbMetricsLoading && !tm
                                            ? '…'
                                            : formatDurationSeconds(tm?.deal_seconds ?? 0, t)}
                                        </span>
                                      </div>
                                    </div>
                                  </div>
                                ),
                                children: (
                                  <div className="border-t border-border/50 pt-4">
                                    <TaskModalWorkItemStats
                                      wi={wi}
                                      tm={tm}
                                      dbMetricsLoading={dbMetricsLoading}
                                      t={t}
                                      onOpenProductModule={() => void openProductDetailForWorkItem(wi)}
                                    />
                                    <div className="mt-6 rounded-lg border border-border/50 bg-muted/10 p-3 text-xs">
                                      <div className="mb-3 border-b border-border/40 pb-2 text-[10px] font-semibold uppercase text-muted-foreground">
                                        {t('rdManageOrder.taskDescription')}
                                      </div>
                                      {(wi.task_desc || '').trim() ? (
                                        <div className="prose prose-sm dark:prose-invert max-w-none text-foreground/85 prose-pre:border prose-pre:border-border/50 prose-pre:bg-muted/30 prose-a:text-primary">
                                          <ReactMarkdown
                                            remarkPlugins={[remarkGfm]}
                                            components={{
                                              a: ({ ...props }) => (
                                                <a
                                                  {...props}
                                                  className="underline"
                                                  target="_blank"
                                                  rel="noopener noreferrer"
                                                />
                                              ),
                                            }}
                                          >
                                            {wi.task_desc}
                                          </ReactMarkdown>
                                        </div>
                                      ) : (
                                        <span className="text-muted-foreground">{t('rdManageOrder.markdownEmpty')}</span>
                                      )}
                                    </div>
                                  </div>
                                ),
                              };
                            })}
                          />
                        </div>
                      ),
                    },
                  ]
                : [])
            ]}
          />
        )}
      </Modal>

      <Modal
        title={t('rdManageOrder.selectProductForMeeting')}
        open={openMeetingPickerOpen}
        onCancel={() => {
          setOpenMeetingPickerOpen(false);
          setOpenMeetingPending(null);
          setSoulInstructionDraft('');
        }}
        onOk={() => void confirmOpenMeetingWithProd()}
        okText={t('rdManageOrder.oneClickOpenMeeting')}
        cancelText={t('common.cancel', { defaultValue: '取消' })}
        confirmLoading={Boolean(openingMeetingKey)}
        destroyOnClose
      >
        <p className="mb-3 text-sm text-foreground/80">
          {t('rdManageOrder.selectProductForMeetingHint')}
        </p>
        <div className="space-y-2">
          <Label className="text-foreground">
            {t('rdManageOrder.selectProductForMeeting')}{' '}
            <span className="text-destructive">*</span>
          </Label>
          <SearchableVirtualSelect
            value={selectedProdKey}
            onValueChange={setSelectedProdKey}
            options={prodSelectOptions}
            placeholder={t('rdManageOrder.selectProductPlaceholder')}
            searchPlaceholder={t('workbench.products.modal.searchFilterPlaceholder')}
            emptyText={
              prodCatalogLoading
                ? t('rdManageOrder.prodCatalogLoading')
                : t('rdManageOrder.prodCatalogEmpty')
            }
            disabled={prodCatalogLoading || prodSelectOptions.length === 0}
            isLoading={prodCatalogLoading}
          />
        </div>
        <div className="space-y-2 mt-4">
          <Label className="text-foreground">
            {t('rdManageOrder.soulInstructionLabel', { defaultValue: '灵魂建议' })}
            <span className="ml-1 text-xs font-normal text-muted-foreground">
              ({t('common.optional', { defaultValue: '可选' })})
            </span>
          </Label>
          <Input.TextArea
            value={soulInstructionDraft}
            onChange={(e) => setSoulInstructionDraft(e.target.value)}
            placeholder={t('rdManageOrder.soulInstructionPlaceholder', {
              defaultValue: '辅助工单处理：指明关键流程、模块与注意事项（写入本工单 work/<单号>/SOUL_INSTRUCTION.json）',
            })}
            autoSize={{ minRows: 3, maxRows: 8 }}
            className="text-sm"
          />
        </div>
      </Modal>

      <ProductDetail
        product={detailProduct}
        open={detailOpen}
        onClose={() => {
          setDetailOpen(false);
          setDetailProduct(null);
        }}
        synapseApiBase={synapseApiBase}
        onProcessPayload={mergeProcessIntoProduct}
        onPatchProductKnowledge={patchProductKnowledge}
      />

    </ConfigProvider>
  );
};
