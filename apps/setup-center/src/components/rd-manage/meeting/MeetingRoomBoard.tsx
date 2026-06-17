import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { ConfigProvider, theme, Avatar, Modal, Button, Tag, Badge, Tooltip, Progress, Input } from 'antd';
import {
  fetchMeetingRoomDetail,
  fetchMeetingRoomLive,
  fetchMeetingRoomNodeChat,
  fetchMeetingRooms,
  fetchMeetingNodeParticipants,
  fetchMeetingRoomConfig,
  interveneMeetingRoom,
  serializeHitlFormSubmission,
  fetchSoulInstruction,
  putSoulInstruction,
  reprocessMeetingRoom,
  recoverMeetingRoom,
  resetDemandToAudit,
  stopMeetingRoom,
  type MeetingNodeRecovery,
  type MeetingRoomChatLogWire,
  type MeetingRoomDetail,
  type MeetingRoomListItem,
  type MeetingRoomLivePayload,
  type MeetingRoomConfigPayload,
  type MeetingRoomParticipantWire,
} from '../../../api/meetingRoomService';
import {
  buildConfiguredRoomRoster,
  liveAgentsById,
  profilesToMap,
  type MeetingAgentProfileWire,
} from './meetingRoomRoster';
import { consumeMeetingRoomFocus } from '../../../rd-meeting/focus';
import { MeetingRoomConfigDrawer } from './MeetingRoomConfigDrawer';
import { MeetingHitlForm, type HitlFormSchema, type HitlFormValues } from './MeetingHitlForm';
import { SolutionReviewPanel } from './SolutionReviewPanel';
import { FuncSolutionReviewPanel } from './FuncSolutionReviewPanel';
import { TaskExecReviewPanel } from './TaskExecReviewPanel';
import { NodeReviewPanel } from './NodeReviewPanel';
import { MeetingProdSelectionPanel } from './panels/MeetingProdSelectionPanel';
import { MeetingAutoSplitChoicePanel } from './panels/MeetingAutoSplitChoicePanel';
import type {
  NodeReviewPayload,
  FuncSolutionReviewPayload,
  SolutionReviewPayload,
  TaskExecPayload,
} from '../../../api/meetingRoomService';
import {
  MeetingAgentContextDrawer,
  type AgentContextTarget,
} from './MeetingAgentContextDrawer';
import { toast } from 'sonner';
import {
  SOP_STAGES,
  ALL_NODES,
  stageIdForNodeId,
  stageNameForId,
  type NodeType,
  type SOPNode,
  type SOPStage,
} from '../../../rd-sop/constants';
import {
  buildDisabledSopNodeIds,
  getSopNodeTypeInfo,
  resolveSopPipelineNodeState,
  type SopPipelineNodeState,
} from '../../../rd-sop/nodePresentation';
import { MeetingNodeDetailPanel, type MeetingNodeVisualState } from './panels/MeetingNodeDetailPanel';
import { SYSTEM_STRUCTURED_NODE_IDS } from './SystemNodeCards';
import { CrossNodeReprocessIcon } from './CrossNodeReprocessIcon';
import { StopNodeRunIcon } from './StopNodeRunIcon';
import {
  effectiveHumanConfirmByType,
  resolveHitlTargetNodeId,
  resolveMeetingInterventionPanel,
  nodeTypeForId,
  type AutoSplitChoicePayload,
  type InterventionPanelKind,
} from './meetingInterventionPanel';
import { MeetingChatEmpty, MeetingChatMessage } from './MeetingChatMessage';
import {
  HOST_PROFILE_ID,
  MeetingAgentAvatar,
  resolveLogAgent,
  stubWorkerAgent,
  workerColor,
} from './MeetingAgentAvatar';
import {
  dedupeChatLogsById,
  filterLogsForNodeExact,
  mergeChatLogs,
  replaceNodeChatLogs,
  resolveChatSpeakerName,
  shouldShowChatAvatar,
  sopScopeKey,
  type MeetingChatLog,
} from './meetingChatUtils';
import { chatSpeakerAccentClass } from './chatRoleTheme';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Bot, Cpu, FileText, TerminalSquare, AlertTriangle, ShieldAlert, Sparkles, 
  Users, MessageSquare, CheckCircle2, ChevronRight, Hash, Activity, Zap, Settings2,
  Globe, Clock, Coins, MoreHorizontal, CircleDashed, 
  Terminal, Code2, GitBranch, FileCode2, Play, User, Info, Network, Code, 
  TestTube, CheckSquare, Flame, TrendingUp, Loader2, AlertCircle, MessageSquareText, ClipboardCheck,
  SkipForward, RotateCw, Undo2, ArrowLeft, Layers, Square,
  Search, PenLine, ShieldCheck, Check, Container,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

const { darkAlgorithm } = theme;

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

// --- Types for Meeting Room ---
type AgentRole = 'coordinator' | 'executor' | 'reviewer' | 'designer' | 'expert';

interface Agent {
  id: string;
  name: string;
  role: string;
  avatarColor: string;
  icon: React.ReactNode;
}

interface RoomAgent extends Agent {
  status: 'idle' | 'processing' | 'error';
  currentAction: string;
}

type LogEntry = MeetingChatLog;

interface MeetingRoom {
  id: string;
  ticketId: string;
  ticketTitle: string;
  branch: string;
  stageName: string;
  stageIndex: number;
  currentNode: string;
  totalStages: number;
  status: 'processing' | 'human_intervention' | 'completed' | 'failed' | 'stopped';
  stageDuration: string;
  meetingStartedAt?: string;
  tokenConsumed: number;
  tokenBudget: number | null;
  agents: RoomAgent[];
  /** 当前节点协作流快照（卡片预览用） */
  logs: LogEntry[];
  /** 全量协作流（按 nodeId 隔离展示） */
  allChatLogs: LogEntry[];
  brief: string;
  phase?: string;
  runInProgress?: boolean;
  hitlFormSchema?: HitlFormSchema | null;
  hitlPendingSummary?: string | null;
  reviewPayload?: NodeReviewPayload | null;
  interventionKind?: string | null;
  interventionPanel?: InterventionPanelKind | string | null;
  autoSplitChoicePayload?: AutoSplitChoicePayload | null;
  solutionReviewPayload?: SolutionReviewPayload | null;
  solutionReviewBlocked?: boolean;
  funcSolutionReviewPayload?: FuncSolutionReviewPayload | null;
  funcSolutionBlocked?: boolean;
  taskExecPayload?: TaskExecPayload | null;
  taskExecBlocked?: boolean;
  /** pending_delivery.node_id：当前人工门控所属节点 */
  hitlPendingNodeId?: string | null;
  hitlLocked?: boolean;
  hitlSubmission?: { values?: Record<string, unknown>; submitted_at?: string } | null;
  participants?: MeetingRoomParticipantWire[];
  scopeType?: 'demand' | 'task';
  scopeId?: string;
  /** 当前对话绑定的 SOP 作用域（stage:node） */
  chatSopKey?: string;
  skippedNodeIds?: string[];
  /** 正在发起重新处理的节点 ID；全屏遮罩展示重新处理中 */
  reprocessingNodeId?: string | null;
  /** 正在终止当前节点运行 */
  stoppingRun?: boolean;
  /** 正在发起处理恢复的节点 ID */
  recoveringNodeId?: string | null;
  /** 服务重启后是否可恢复人工门控（后端 node_recovery） */
  nodeRecovery?: MeetingNodeRecovery | null;
  /** live 轮询：当前节点结构化展示（代码提交进度等） */
  systemNodeDisplay?: Record<string, unknown> | null;
  /** 协作流全量刷新世代（重处理后递增，触发按节点 re-fetch） */
  chatEpoch?: number;
}


function participantToRoomAgent(p: MeetingRoomParticipantWire, status: RoomAgent['status'] = 'idle'): RoomAgent {
  const isHost = p.role === 'host' || p.profile_id === HOST_PROFILE_ID;
  const label = (p.display_name || '').trim();
  return {
    id: p.profile_id,
    name: label && label !== p.profile_id ? label : isHost ? '小鲸' : '协作智能体',
    role: isHost ? '会议主持' : '协作智能体',
    avatarColor: isHost ? 'bg-violet-500' : workerColor(p.profile_id),
    icon: isHost ? <Bot className="w-3 h-3" /> : <Cpu className="w-3 h-3" />,
    status,
    currentAction: isHost ? '主持本节点' : '待命',
  };
}

function buildAgentsFromDetail(item: MeetingRoomDetail): RoomAgent[] {
  const fromApi = item.participants;
  if (fromApi?.length) {
    const host = fromApi.find((p) => p.role === 'host') ?? fromApi[0];
    const workers = fromApi.filter((p) => p.profile_id !== host.profile_id);
    const runBusy = item.status === 'processing';
    return [
      participantToRoomAgent(host, runBusy ? 'processing' : 'idle'),
      ...workers.map((w) => participantToRoomAgent(w, runBusy ? 'processing' : 'idle')),
    ];
  }
  const rs = item.room_state;
  const active = Array.isArray(rs?.agents_active)
    ? (rs.agents_active as { profile_id?: string; role?: string; display_name?: string; status?: string }[])
    : [];
  if (active.length) {
    return active.map((a) =>
      participantToRoomAgent(
        {
          profile_id: String(a.profile_id || HOST_PROFILE_ID),
          role: String(a.role || 'worker'),
          display_name: String(a.display_name || a.profile_id || ''),
        },
        a.status === 'failed' ? 'error' : a.status === 'delegating' || a.status === 'running' ? 'processing' : 'idle',
      ),
    );
  }
  return [participantToRoomAgent({ profile_id: HOST_PROFILE_ID, role: 'host', display_name: '小鲸' }, 'processing')];
}

function mergeAgentsWithLive(roster: RoomAgent[], live: MeetingRoomLivePayload): RoomAgent[] {
  const liveAgents = mapLiveAgents(live, roster);
  if (!liveAgents.length) return roster;
  const byId = new Map(roster.map((a) => [a.id, a]));
  for (const la of liveAgents) {
    const prev = byId.get(la.id);
    if (prev) {
      byId.set(la.id, {
        ...prev,
        status: la.status,
        currentAction: la.currentAction || prev.currentAction,
      });
    } else if (la.id !== 'host') {
      byId.set(la.id, la);
    }
  }
  const host = byId.get(HOST_PROFILE_ID) ?? roster[0];
  if (host && live.run_in_progress) {
    byId.set(host.id, { ...host, status: 'processing', currentAction: '主持本节点' });
  }
  return Array.from(byId.values());
}

function resolveSpeakerName(room: MeetingRoom, agentId: string): string {
  if (agentId === 'user') return '我 (人类专家)';
  const hit = room.agents.find((a) => a.id === agentId);
  if (hit?.name && hit.name !== hit.id) return hit.name;
  const p = room.participants?.find((x) => x.profile_id === agentId);
  if (p?.display_name && p.display_name !== p.profile_id) return p.display_name;
  if (agentId === HOST_PROFILE_ID || agentId === 'host') return '小鲸';
  if (agentId === 'system') return '系统';
  return '小鲸';
}

function mapLiveAgents(live: MeetingRoomLivePayload, roster: RoomAgent[] = []): RoomAgent[] {
  const rosterById = new Map(roster.map((a) => [a.id, a]));
  // 按 profile_id 合并多次委派产生的多条 sub_agent 记录，避免「分身」
  const STATUS_RANK: Record<string, number> = {
    running: 3,
    delegating: 3,
    failed: 2,
    starting: 2,
    idle: 1,
    completed: 1,
    cancelled: 0,
    timeout: 2,
  };
  const merged = new Map<
    string,
    { name: string; status: string; current_tool_summary?: string }
  >();
  for (const [i, s] of (live.sub_agents || []).entries()) {
    const pid = String(s.profile_id || s.agent_id || `worker-${i}`);
    const st = String(s.status || 'idle').toLowerCase();
    const prev = merged.get(pid);
    const nextRank = STATUS_RANK[st] ?? 0;
    const prevRank = prev ? STATUS_RANK[prev.status] ?? 0 : -1;
    if (!prev || nextRank > prevRank) {
      merged.set(pid, {
        name: String(s.name || prev?.name || '').trim(),
        status: st,
        current_tool_summary: String(s.current_tool_summary || prev?.current_tool_summary || ''),
      });
    }
  }
  const workers: RoomAgent[] = Array.from(merged.entries()).map(([pid, info]) => {
    const uiStatus: RoomAgent['status'] =
      info.status === 'running' || info.status === 'delegating'
        ? 'processing'
        : info.status === 'failed' || info.status === 'timeout'
          ? 'error'
          : 'idle';
    const fromRoster = rosterById.get(pid);
    const name =
      (info.name && info.name !== pid && info.name) ||
      live.participants?.find((p) => p.profile_id === pid)?.display_name ||
      fromRoster?.name ||
      '协作智能体';
    return {
      id: pid,
      name,
      role: '协作智能体',
      avatarColor: fromRoster?.avatarColor || workerColor(pid),
      icon: fromRoster?.icon || <Cpu className="w-3 h-3" />,
      status: uiStatus,
      currentAction: info.current_tool_summary || info.status || '',
    };
  });
  const hostStatus: RoomAgent['status'] = live.run_in_progress ? 'processing' : 'idle';
  const hostRow =
    live.participants?.find((p) => p.role === 'host') ?? {
      profile_id: HOST_PROFILE_ID,
      role: 'host',
      display_name: '小鲸',
    };
  return [participantToRoomAgent(hostRow, hostStatus), ...workers];
}

function rosterFromLiveParticipants(live: MeetingRoomLivePayload): RoomAgent[] {
  const parts = live.participants || [];
  if (!parts.length) return [];
  const host = parts.find((p) => p.role === 'host') ?? parts[0];
  const workers = parts.filter((p) => p.profile_id !== host.profile_id);
  const runBusy = Boolean(live.run_in_progress);
  return [
    participantToRoomAgent(host, runBusy ? 'processing' : 'idle'),
    ...workers.map((w) => participantToRoomAgent(w, runBusy ? 'processing' : 'idle')),
  ];
}

function applyLivePatch(room: MeetingRoom, live: MeetingRoomLivePayload): MeetingRoom {
  const uiStatus = live.status as MeetingRoom['status'] | undefined;
  const nextNodeId = (live.current_node_id || '').trim() || room.currentNode;
  const nodeChanged = nextNodeId !== room.currentNode;
  const nextStageIndex =
    live.stage_id != null && Number(live.stage_id) > 0
      ? Number(live.stage_id)
      : nodeChanged
        ? stageIdForNodeId(nextNodeId)
        : room.stageIndex;
  const nextStageName =
    (live.stage_name || '').trim() || stageNameForId(nextStageIndex) || room.stageName;
  const nextSopKey = sopScopeKey(nextStageIndex, nextNodeId);

  let allChatLogs = room.allChatLogs?.length ? room.allChatLogs : room.logs;
  if (live.recent_chat && live.recent_chat.length > 0) {
    allChatLogs = mergeChatLogs(allChatLogs, live.recent_chat.map(mapChatWireToLog));
  }

  const rosterFromLive = rosterFromLiveParticipants(live);
  const roster = nodeChanged && rosterFromLive.length > 0
    ? rosterFromLive
    : room.agents.length > 0
      ? room.agents
      : rosterFromLive.length > 0
        ? rosterFromLive
        : (live.participants || []).map((p) => participantToRoomAgent(p, 'idle'));
  const agents = mergeAgentsWithLive(roster, live);
  const localState = room.brief.split(' · ')[0] || room.brief;
  const nextBrief = live.current_node_name
    ? `${localState} · ${live.current_node_name}`
    : room.brief;
  const displayLogs = filterLogsForNodeExact(allChatLogs, nextNodeId);
  const nextSystemNodeDisplay =
    live.system_node_display !== undefined
      ? live.system_node_display
      : nodeChanged
        ? null
        : room.systemNodeDisplay;
  const pendingDelivery = live.pending_delivery as
    | {
        node_id?: string;
        review_payload?: NodeReviewPayload;
        solution_review_payload?: SolutionReviewPayload;
        func_solution_review_payload?: FuncSolutionReviewPayload;
        task_exec_payload?: TaskExecPayload;
        diff_analysis_payload?: TaskExecPayload;
        report_body?: string;
      }
    | undefined;
  const interventionKind =
    'intervention_kind' in live
      ? (live.intervention_kind ?? null)
      : (room.interventionKind ?? null);
  const likelySolutionReview =
    interventionKind === 'solution_review' ||
    Boolean(pendingDelivery?.solution_review_payload) ||
    room.interventionPanel === 'solution_review' ||
    Boolean(room.solutionReviewPayload);
  const hitlPanelNodeId =
    String(pendingDelivery?.node_id ?? '').trim() || nextNodeId;
  const hitlPanelNodeType = nodeTypeForId(hitlPanelNodeId);
  const interventionPanel =
    (live.intervention_panel as InterventionPanelKind | undefined) ??
    room.interventionPanel ??
    resolveMeetingInterventionPanel(
      {
        status: uiStatus && ['processing', 'human_intervention', 'completed', 'failed', 'stopped'].includes(uiStatus)
          ? uiStatus
          : room.status,
        currentNode: nextNodeId,
        interventionKind,
        interventionPanel: room.interventionPanel,
        hitlFormSchema:
          live.hitl_form_schema !== undefined
            ? live.hitl_form_schema
            : room.hitlFormSchema,
        hitlLocked: live.hitl_locked ?? room.hitlLocked,
        reviewPayload: likelySolutionReview
          ? null
          : pendingDelivery?.review_payload ?? room.reviewPayload,
        solutionReviewPayload:
          pendingDelivery?.solution_review_payload ?? room.solutionReviewPayload,
        funcSolutionReviewPayload:
          pendingDelivery?.func_solution_review_payload ?? room.funcSolutionReviewPayload,
        autoSplitChoicePayload:
          (live.auto_split_choice_payload as AutoSplitChoicePayload | undefined) ??
          room.autoSplitChoicePayload,
        hitlPendingNodeId:
          pendingDelivery?.node_id != null
            ? String(pendingDelivery.node_id)
            : room.hitlPendingNodeId,
      },
      hitlPanelNodeType,
      hitlPanelNodeId,
    );
  const isSolutionReview =
    interventionKind === 'solution_review' || interventionPanel === 'solution_review';
  const hasCliExecPayload = Boolean(
    pendingDelivery?.diff_analysis_payload ||
      pendingDelivery?.task_exec_payload ||
      room.taskExecPayload,
  );
  const isFuncSolutionReview =
    interventionKind === 'func_solution_review' || interventionPanel === 'func_solution_review';
  return {
    ...room,
    currentNode: nextNodeId,
    stageIndex: nextStageIndex,
    stageName: nextStageName,
    status: uiStatus &&
      ['processing', 'human_intervention', 'completed', 'failed', 'stopped'].includes(uiStatus)
      ? uiStatus
      : room.status,
    phase: live.phase || room.phase,
    runInProgress: live.run_in_progress ?? room.runInProgress,
    allChatLogs,
    logs: displayLogs,
    agents,
    tokenConsumed: live.view_node_id
      ? (typeof live.view_node_token === 'number' ? live.view_node_token : room.tokenConsumed)
      : (live.tokenConsumed ?? room.tokenConsumed),
    tokenBudget: live.view_node_id
      ? (typeof live.tokenBudget === 'number' ? live.tokenBudget : null)
      : (typeof live.tokenBudget === 'number' ? live.tokenBudget : room.tokenBudget ?? 0),
    stageDuration: live.stageDuration || room.stageDuration,
    meetingStartedAt: live.meetingStartedAt || room.meetingStartedAt,
    hitlFormSchema:
      live.hitl_form_schema !== undefined
        ? ((live.hitl_form_schema as HitlFormSchema | null) ?? null)
        : room.hitlFormSchema,
    hitlLocked: live.hitl_locked ?? room.hitlLocked,
    hitlSubmission:
      (live.hitl_submission as MeetingRoom['hitlSubmission']) ?? room.hitlSubmission ?? null,
    hitlPendingSummary: pendingDelivery?.report_body ?? room.hitlPendingSummary ?? null,
    hitlPendingNodeId:
      pendingDelivery?.node_id != null
        ? String(pendingDelivery.node_id)
        : room.hitlPendingNodeId ?? null,
    reviewPayload: isSolutionReview || isFuncSolutionReview || hasCliExecPayload
      ? null
      : ((pendingDelivery?.review_payload as NodeReviewPayload | undefined) ??
        (live.pending_delivery !== undefined ? null : room.reviewPayload ?? null)),
    interventionKind,
    interventionPanel,
    autoSplitChoicePayload:
      (live.auto_split_choice_payload as AutoSplitChoicePayload | undefined) ??
      room.autoSplitChoicePayload ??
      null,
    solutionReviewPayload: isSolutionReview
      ? ((pendingDelivery?.solution_review_payload as SolutionReviewPayload | undefined) ??
        (live.pending_delivery !== undefined ? null : room.solutionReviewPayload ?? null))
      : live.pending_delivery !== undefined
        ? null
        : room.solutionReviewPayload ?? null,
    funcSolutionReviewPayload: isFuncSolutionReview
      ? ((pendingDelivery?.func_solution_review_payload as FuncSolutionReviewPayload | undefined) ??
        (live.pending_delivery !== undefined ? null : room.funcSolutionReviewPayload ?? null))
      : live.pending_delivery !== undefined
        ? null
        : room.funcSolutionReviewPayload ?? null,
    solutionReviewBlocked: Boolean(
      live.solution_review_blocked ?? room.solutionReviewBlocked,
    ),
    funcSolutionBlocked: Boolean(live.func_solution_blocked ?? room.funcSolutionBlocked),
    taskExecPayload:
      (pendingDelivery?.diff_analysis_payload as TaskExecPayload | undefined) ??
      (pendingDelivery?.task_exec_payload as TaskExecPayload | undefined) ??
      room.taskExecPayload ??
      null,
    taskExecBlocked: Boolean(
      live.diff_analysis_blocked ?? live.task_exec_blocked ?? room.taskExecBlocked,
    ),
    brief: live.phase ? `${nextBrief.split(' · ')[0] || nextBrief} · ${live.phase}` : nextBrief,
    chatSopKey: nextSopKey,
    participants: live.participants?.length ? live.participants : room.participants,
    skippedNodeIds: live.skipped_node_ids?.length
      ? live.skipped_node_ids
      : room.skippedNodeIds,
    reprocessingNodeId: room.reprocessingNodeId ?? null,
    stoppingRun: room.stoppingRun ?? false,
    recoveringNodeId: room.recoveringNodeId ?? null,
    nodeRecovery:
      (live.node_recovery as MeetingNodeRecovery | undefined) ?? room.nodeRecovery ?? null,
    systemNodeDisplay: nextSystemNodeDisplay ?? null,
  };
}

function mapChatWireToLog(w: MeetingRoomChatLogWire): LogEntry {
  const rich =
    Boolean(w.rich) ||
    w.displayKind === 'work_plan' ||
    /^(【步骤|\*\*流程迁移|# 工作安排计划)/.test((w.text || '').trim());
  return {
    id: w.id,
    agentId: w.agentId,
    text: w.text,
    timestamp: w.timestamp,
    type: w.type,
    rich,
    nodeId: w.nodeId,
    event: w.event,
    speakerRole: w.speakerRole,
    displayKind: w.displayKind,
    payload: w.payload,
  };
}

/** live 轮询会重建 logs 数组；用尾部指纹判断是否有新消息，避免无变化时反复滚到底。 */
function getLogsTailKey(logs: LogEntry[]): string {
  if (!logs.length) return '';
  const last = logs[logs.length - 1];
  return `${logs.length}:${last.id}:${last.timestamp}:${last.text.length}`;
}

function chatLogPreviewText(log: LogEntry): string {
  const t = (log.text || '').trim();
  if (t) {
    const line = t.split('\n').find((l) => l.trim()) || t;
    return line.length > 160 ? `${line.slice(0, 160)}…` : line;
  }
  if (log.displayKind) return '协作消息';
  return '…';
}

function RoomCardChatLogRow({
  log,
  index,
  room,
}: {
  log: LogEntry;
  index: number;
  room: MeetingRoom;
}) {
  const agent = room.agents.find((a) => a.id === log.agentId);
  const speaker = resolveChatSpeakerName(
    log,
    agent?.name || resolveSpeakerName(room, log.agentId),
  );
  const role = log.speakerRole || (log.agentId === 'system' ? 'system' : 'host');
  return (
    <div className="min-w-0">
      <div className="mb-0.5 flex items-center gap-1.5 text-[9px] leading-none">
        <span className={`truncate font-medium ${chatSpeakerAccentClass(role)}`}>{speaker}</span>
        <span className="shrink-0 font-mono text-muted-foreground/70">{log.timestamp}</span>
      </div>
      <p className="line-clamp-2 text-[11px] leading-snug text-foreground/85">
        {chatLogPreviewText(log)}
      </p>
    </div>
  );
}

const ROOM_CARD_CHAT_LOOP_GAP_PX = 8;

function RoomCardChatStreamMarker({ kind }: { kind: 'start' | 'end' }) {
  const label = kind === 'start' ? '起始' : '结束';
  return (
    <div
      className="flex items-center gap-2 py-0.5"
      aria-label={kind === 'start' ? '会议进度起始' : '会议进度结束'}
    >
      <span className="h-px flex-1 bg-border/70" aria-hidden />
      <span className="shrink-0 rounded-full border border-border/60 bg-background/80 px-2 py-0.5 font-mono text-[8px] tracking-wider text-muted-foreground">
        {label}
      </span>
      <span className="h-px flex-1 bg-border/70" aria-hidden />
    </div>
  );
}

/** 卡片预览：当前节点协作会议流；悬停时自动滚动，非悬停时保持当前位置 */
const RoomCardChatStream = ({
  room,
  logs,
}: {
  room: MeetingRoom;
  logs: LogEntry[];
}) => {
  const viewportRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const scrollOffsetRef = useRef(0);
  const trackHeightRef = useRef(0);
  const loopSegmentRef = useRef(0);
  const prevTailKeyRef = useRef('');
  const [hovered, setHovered] = useState(false);
  const [loopSegment, setLoopSegment] = useState(0);
  const logsTailKey = getLogsTailKey(logs);

  const normalizeScrollOffset = useCallback((offset: number) => {
    const segment = loopSegmentRef.current;
    if (segment <= 0) return Math.max(0, offset);
    let next = offset;
    while (next >= segment) next -= segment;
    while (next < 0) next += segment;
    return next;
  }, []);

  const syncLoopMetrics = useCallback(() => {
    const track = trackRef.current;
    const viewport = viewportRef.current;
    if (!track || !viewport) return;
    const trackHeight = track.offsetHeight;
    trackHeightRef.current = trackHeight;
    const canLoop = trackHeight > viewport.clientHeight + 1 && logs.length > 0;
    const segment = canLoop ? trackHeight + ROOM_CARD_CHAT_LOOP_GAP_PX : 0;
    loopSegmentRef.current = segment;
    setLoopSegment(segment);
  }, [logs.length]);

  const syncScrollOffset = useCallback(() => {
    const el = viewportRef.current;
    if (!el) return;
    const maxScroll = Math.max(0, el.scrollHeight - el.clientHeight);
    const normalized = Math.min(normalizeScrollOffset(el.scrollTop), maxScroll);
    el.scrollTop = normalized;
    scrollOffsetRef.current = normalized;
  }, [normalizeScrollOffset]);

  useEffect(() => {
    syncLoopMetrics();
    const track = trackRef.current;
    const viewport = viewportRef.current;
    if (!track || !viewport) return;
    const ro = new ResizeObserver(() => {
      syncLoopMetrics();
      window.requestAnimationFrame(() => syncScrollOffset());
    });
    ro.observe(track);
    ro.observe(viewport);
    return () => ro.disconnect();
  }, [logsTailKey, syncLoopMetrics, syncScrollOffset]);

  useEffect(() => {
    const el = viewportRef.current;
    if (!el || hovered) return;

    const trackHeight = trackHeightRef.current;
    const maxScroll = Math.max(0, el.scrollHeight - el.clientHeight);
    const bottomOfFirstCopy = Math.max(0, trackHeight - el.clientHeight);
    const isFirstPaint = prevTailKeyRef.current === '';
    const wasAtBottom =
      loopSegmentRef.current > 0
        ? normalizeScrollOffset(el.scrollTop) >= bottomOfFirstCopy - 4
        : maxScroll - el.scrollTop <= 4;
    prevTailKeyRef.current = logsTailKey;

    if (isFirstPaint || wasAtBottom) {
      const target = loopSegmentRef.current > 0 ? bottomOfFirstCopy : maxScroll;
      el.scrollTop = target;
      scrollOffsetRef.current = target;
    } else {
      const clamped = Math.min(normalizeScrollOffset(el.scrollTop), maxScroll);
      el.scrollTop = clamped;
      scrollOffsetRef.current = clamped;
    }
  }, [logsTailKey, hovered, normalizeScrollOffset]);

  useEffect(() => {
    if (!hovered) return;
    const el = viewportRef.current;
    if (!el) return;

    let raf = 0;
    let pausedAtBottomUntil = 0;
    const speed = 0.4;
    const bottomPauseMs = 2800;

    const step = () => {
      const maxScroll = Math.max(0, el.scrollHeight - el.clientHeight);
      if (maxScroll <= 0) return;

      const segment = loopSegmentRef.current;
      const now = performance.now();

      if (segment > 0) {
        scrollOffsetRef.current += speed;
        if (scrollOffsetRef.current >= segment) {
          scrollOffsetRef.current -= segment;
        }
        el.scrollTop = scrollOffsetRef.current;
        raf = requestAnimationFrame(step);
        return;
      }

      if (scrollOffsetRef.current >= maxScroll - 0.5) {
        scrollOffsetRef.current = maxScroll;
        el.scrollTop = maxScroll;
        if (pausedAtBottomUntil === 0) {
          pausedAtBottomUntil = now + bottomPauseMs;
        }
        if (now < pausedAtBottomUntil) {
          raf = requestAnimationFrame(step);
          return;
        }
        pausedAtBottomUntil = 0;
        scrollOffsetRef.current = 0;
        el.scrollTop = 0;
        raf = requestAnimationFrame(step);
        return;
      }

      pausedAtBottomUntil = 0;
      scrollOffsetRef.current += speed;
      el.scrollTop = scrollOffsetRef.current;
      raf = requestAnimationFrame(step);
    };

    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [hovered, logsTailKey, loopSegment]);

  useEffect(() => {
    const resetInteraction = () => {
      setHovered(false);
      syncScrollOffset();
    };
    const onVisible = () => {
      if (document.visibilityState !== 'visible') {
        resetInteraction();
        return;
      }
      syncLoopMetrics();
      window.requestAnimationFrame(() => syncScrollOffset());
    };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('pagehide', resetInteraction);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('pagehide', resetInteraction);
    };
  }, [syncLoopMetrics, syncScrollOffset]);

  const renderLogRows = (idPrefix: string) =>
    logs.map((log, index) => (
      <RoomCardChatLogRow
        key={`${idPrefix}-${log.id || index}`}
        log={log}
        index={index}
        room={room}
      />
    ));

  const renderLogTrack = (idPrefix: string) => (
    <>
      <RoomCardChatStreamMarker kind="start" />
      {renderLogRows(idPrefix)}
      <RoomCardChatStreamMarker kind="end" />
    </>
  );

  return (
    <div
      className="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-xl border border-border/50 bg-muted/40 p-3 transition-colors group-hover:border-border"
      onMouseEnter={() => {
        syncScrollOffset();
        setHovered(true);
      }}
      onMouseLeave={() => {
        syncScrollOffset();
        setHovered(false);
      }}
    >
      <div className="mb-1 flex shrink-0 items-center gap-1 font-mono text-[9px] text-muted-foreground">
        <TrendingUp className="h-3 w-3" /> 会议进度
      </div>
      <div
        ref={viewportRef}
        className="rd-meeting-room-card-chat__viewport min-h-0 flex-1 overflow-hidden"
      >
        {logs.length === 0 ? (
          <div className="flex h-full items-center justify-center text-[10px] italic text-muted-foreground/60">
            暂无会议进度
          </div>
        ) : (
          <div className="flex flex-col gap-2 pr-0.5">
            <div ref={trackRef} className="flex flex-col gap-2">
              {renderLogTrack('a')}
            </div>
            {loopSegment > 0 ? (
              <div className="flex flex-col gap-2" aria-hidden>
                {renderLogTrack('b')}
              </div>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
};

function mapDetailToRoom(item: MeetingRoomDetail): MeetingRoom {
  const timeStr = new Date().toLocaleTimeString('zh-CN', { hour12: false });
  const nodeId = item.current_node_id || 'pending';
  const allChatLogs = dedupeChatLogsById((item.chat_logs || []).map(mapChatWireToLog));
  const logs =
    filterLogsForNodeExact(allChatLogs, nodeId).length > 0
      ? filterLogsForNodeExact(allChatLogs, nodeId)
      : [
          {
            id: 'boot',
            agentId: 'system',
            text: `工单 ${item.scope_id} · ${item.stage_name} / ${item.current_node_name}（${item.local_process_state}）`,
            timestamp: timeStr,
            type: 'info' as const,
          },
        ];
  return {
    id: item.room_id || `${item.scope_type}-${item.scope_id}`,
    ticketId: item.ticket_id || item.scope_id,
    ticketTitle: item.ticket_title || item.scope_id,
    branch: item.branch || '—',
    stageName: item.stage_name || '',
    stageIndex: item.stage_id ?? 0,
    currentNode: item.current_node_id || 'pending',
    totalStages: SOP_STAGES.length,
    status: item.status,
    stageDuration: item.stageDuration || '—',
    meetingStartedAt: item.meetingStartedAt,
    tokenConsumed: item.tokenConsumed ?? 0,
    tokenBudget: item.tokenBudget ?? 0,
    agents: buildAgentsFromDetail(item),
    allChatLogs: allChatLogs.length ? allChatLogs : logs,
    logs,
    brief: `${item.local_process_state} · ${item.current_node_name || item.current_node_id}`,
    hitlFormSchema: (item.room_state?.hitl_form_schema as HitlFormSchema | undefined) ?? null,
    hitlLocked: Boolean(item.room_state?.hitl_locked),
    hitlSubmission:
      (item.room_state?.hitl_submission as MeetingRoom['hitlSubmission']) ?? null,
    hitlPendingSummary:
      (item.room_state?.pending_delivery as { report_body?: string } | undefined)?.report_body ?? null,
    hitlPendingNodeId: String(
      (item.room_state?.pending_delivery as { node_id?: string } | undefined)?.node_id ||
        item.current_node_id ||
        '',
    ),
    reviewPayload:
      (item.room_state?.intervention_kind as string) === 'solution_review'
        ? null
        : (((item.room_state?.pending_delivery as { review_payload?: NodeReviewPayload } | undefined)
            ?.review_payload as NodeReviewPayload | undefined) ?? null),
    interventionKind: (item.room_state?.intervention_kind as string | undefined) ?? null,
    interventionPanel: resolveMeetingInterventionPanel(
      {
        status: item.status,
        currentNode: item.current_node_id,
        interventionKind: item.room_state?.intervention_kind as string | undefined,
        hitlFormSchema: item.room_state?.hitl_form_schema,
        hitlLocked: Boolean(item.room_state?.hitl_locked),
        autoSplitChoicePayload: item.room_state?.auto_split_choice_payload as AutoSplitChoicePayload | undefined,
        reviewPayload: (item.room_state?.pending_delivery as { review_payload?: unknown })
          ?.review_payload as { node_id?: string } | null,
        solutionReviewPayload: (item.room_state?.pending_delivery as {
          solution_review_payload?: unknown;
        })?.solution_review_payload,
        funcSolutionReviewPayload: (item.room_state?.pending_delivery as {
          func_solution_review_payload?: unknown;
        })?.func_solution_review_payload,
        hitlPendingNodeId: (item.room_state?.pending_delivery as { node_id?: string })?.node_id,
      },
      nodeTypeForId(
        String(
          (item.room_state?.pending_delivery as { node_id?: string } | undefined)?.node_id ||
            item.current_node_id ||
            '',
        ),
      ),
      String(
        (item.room_state?.pending_delivery as { node_id?: string } | undefined)?.node_id ||
          item.current_node_id ||
          '',
      ),
    ),
    solutionReviewPayload:
      ((item.room_state?.pending_delivery as { solution_review_payload?: SolutionReviewPayload })
        ?.solution_review_payload as SolutionReviewPayload | undefined) ?? null,
    solutionReviewBlocked: Boolean(item.room_state?.solution_review_blocked),
    funcSolutionReviewPayload:
      ((item.room_state?.pending_delivery as { func_solution_review_payload?: FuncSolutionReviewPayload })
        ?.func_solution_review_payload as FuncSolutionReviewPayload | undefined) ?? null,
    funcSolutionBlocked: Boolean(item.room_state?.func_solution_blocked),
    taskExecPayload:
      ((item.room_state?.pending_delivery as { diff_analysis_payload?: TaskExecPayload; task_exec_payload?: TaskExecPayload })
        ?.diff_analysis_payload as TaskExecPayload | undefined) ??
      ((item.room_state?.pending_delivery as { task_exec_payload?: TaskExecPayload })
        ?.task_exec_payload as TaskExecPayload | undefined) ??
      null,
    taskExecBlocked: Boolean(
      item.room_state?.diff_analysis_blocked ?? item.room_state?.task_exec_blocked,
    ),
    autoSplitChoicePayload:
      (item.room_state?.auto_split_choice_payload as AutoSplitChoicePayload | undefined) ?? null,
    participants: item.participants,
    scopeType: item.scope_type,
    scopeId: item.scope_id,
    chatSopKey: sopScopeKey(item.stage_id ?? 0, item.current_node_id || 'pending'),
    skippedNodeIds: item.skipped_node_ids ?? [],
    nodeRecovery: item.node_recovery ?? null,
  };
}

function mapListItemToRoom(item: MeetingRoomListItem): MeetingRoom {
  return mapDetailToRoom(item as MeetingRoomDetail);
}

const getNodeStateGlobal = (
  room: MeetingRoom,
  nodeId: string,
  disabledNodeIds?: ReadonlySet<string>,
): SopPipelineNodeState =>
  resolveSopPipelineNodeState(
    {
      currentNodeId: room.currentNode,
      status: room.status,
      skippedNodeIds: room.skippedNodeIds,
      disabledNodeIds,
    },
    nodeId,
  );

type NodeDetailViewMode = 'live' | 'review' | 'skipped';

function isStructuredSystemNode(nodeId: string, nodeType: string): boolean {
  return (
    nodeType === 'system' &&
    SYSTEM_STRUCTURED_NODE_IDS.includes(nodeId as (typeof SYSTEM_STRUCTURED_NODE_IDS)[number])
  );
}

function resolveNodeDetailViewMode(
  state: ReturnType<typeof getNodeStateGlobal>,
  nodeId: string,
  nodeType: string,
): NodeDetailViewMode {
  if (state === 'skipped') return 'skipped';
  if (state === 'completed') {
    // 系统节点（拆单/沙箱/环境预生成）用结构化产出面板，不走 node-review Markdown
    if (isStructuredSystemNode(nodeId, nodeType)) return 'live';
    return 'review';
  }
  return 'live';
}

function toMeetingNodeVisualState(
  state: ReturnType<typeof getNodeStateGlobal>,
): MeetingNodeVisualState {
  if (state === 'skipped' || state === 'stopped') return 'pending';
  return state;
}

function pickDefaultNodeForStage(
  room: MeetingRoom,
  stage: SOPStage,
  disabledNodeIds: ReadonlySet<string>,
): string | null {
  const currentInStage = stage.nodes.find((n) => n.id === room.currentNode);
  if (currentInStage) return currentInStage.id;
  const completed = stage.nodes.find(
    (n) => getNodeStateGlobal(room, n.id, disabledNodeIds) === 'completed',
  );
  if (completed) return completed.id;
  return stage.nodes[0]?.id ?? null;
}

const SkippedNodeDetailPanel = ({ nodeName }: { nodeName: string }) => (
  <div className="rd-meeting-skipped-detail">
    <div className="rd-meeting-skipped-detail__panel">
      <SkipForward className="rd-meeting-skipped-detail__icon h-14 w-14 text-slate-400" />
      <h3 className="rd-meeting-skipped-detail__title">{nodeName}</h3>
      <p className="rd-meeting-skipped-detail__desc">
        该节点未开启，流程已自动跳过，无节点处理详情。
      </p>
    </div>
  </div>
);

// --- Sub-components (AgentAvatar → MeetingAgentAvatar.tsx) ---

/** 看板卡片用：不含「待处理」的流水线阶段 */
const MEETING_PIPELINE_STAGES = SOP_STAGES.filter((s) => s.id > 0);

/** 左侧 SOP 节点列表：类型标签图标（按处理方式区分，替代统一的 Zap） */
const SOP_NODE_TYPE_ICON: Record<NodeType, LucideIcon> = {
  ai: Bot,
  human: User,
  human_start: User,
  ai_human: Users,
  human_multi: Users,
  system: TerminalSquare,
  ai_exception: ShieldAlert,
};

/** 主页面会议室列表自动刷新间隔（会中弹窗打开时不启用，由 live 轮询负责） */
const LIST_AUTO_REFRESH_MS = 60_000;
/** 主页面卡片会议进度 live 轮询（弹窗关闭时启用） */
const LIST_LIVE_POLL_MS = 3_000;

function roomCardLogsNeedHydrate(room: MeetingRoom): boolean {
  const nodeId = (room.currentNode || '').trim();
  if (!nodeId) return false;
  const logs = filterLogsForNodeExact(room.allChatLogs ?? room.logs, nodeId);
  if (!logs.length) return true;
  if (logs.length === 1 && logs[0]?.id === 'boot') return true;
  return false;
}

/** 列表刷新时保留卡片已累积的协作流，避免 silent reload 把会议进度打回占位文案 */
function mergeListRoomWithExisting(fresh: MeetingRoom, existing?: MeetingRoom): MeetingRoom {
  if (!existing || existing.id !== fresh.id) return fresh;
  const allChatLogs = existing.allChatLogs?.length ? existing.allChatLogs : existing.logs;
  const hasPreservableChat =
    allChatLogs.length > 0 && !(allChatLogs.length === 1 && allChatLogs[0]?.id === 'boot');
  if (!hasPreservableChat) return fresh;

  const logs = filterLogsForNodeExact(allChatLogs, fresh.currentNode);
  return {
    ...fresh,
    allChatLogs,
    logs: logs.length > 0 ? logs : fresh.logs,
    agents: existing.agents.length > 0 ? existing.agents : fresh.agents,
    chatEpoch: existing.chatEpoch,
    reprocessingNodeId: existing.reprocessingNodeId ?? fresh.reprocessingNodeId ?? null,
    stoppingRun: existing.stoppingRun ?? fresh.stoppingRun ?? false,
    recoveringNodeId: existing.recoveringNodeId ?? fresh.recoveringNodeId ?? null,
  };
}

function mergeListRoomsWithExisting(freshRooms: MeetingRoom[], prevRooms: MeetingRoom[]): MeetingRoom[] {
  const prevByScope = new Map(prevRooms.map((room) => [meetingRoomScopeKey(room), room]));
  return dedupeMeetingRooms(
    freshRooms.map((room) => mergeListRoomWithExisting(room, prevByScope.get(meetingRoomScopeKey(room)))),
  );
}

function meetingRoomScopeKey(room: Pick<MeetingRoom, 'scopeType' | 'scopeId'>): string {
  return `${room.scopeType || 'demand'}:${room.scopeId}`;
}

/** 列表按工单 scope 去重；同一 room_id 撞车时保留 updated 较新的条目（后端已过滤错位目录）。 */
function dedupeMeetingRooms(rooms: MeetingRoom[]): MeetingRoom[] {
  const byScope = new Map<string, MeetingRoom>();
  for (const room of rooms) {
    byScope.set(meetingRoomScopeKey(room), room);
  }
  return Array.from(byScope.values());
}

/** 会议室弹窗 SOP 阶段导航主题（与配置抽屉色系对齐，增强对比与光效） */
type StageNavTheme = {
  accent: string;
  badge: string;
  panel: string;
  dot: string;
  ring: string;
  glow: string;
  gradient: string;
  iconBg: string;
  iconBorder: string;
  bar: string;
  short: string;
  Icon: LucideIcon;
};

const STAGE_NAV_THEME: Record<number, StageNavTheme> = {
  1: {
    accent: 'text-sky-300',
    badge: 'bg-sky-500/20 text-sky-200 border-sky-400/40',
    panel: 'border-sky-400/45 bg-sky-500/15',
    dot: 'bg-sky-400 shadow-[0_0_10px_rgba(56,189,248,0.85)]',
    ring: 'ring-sky-400/55',
    glow: 'shadow-[0_0_20px_rgba(56,189,248,0.35),inset_0_1px_0_rgba(255,255,255,0.08)]',
    gradient: 'bg-gradient-to-b from-sky-500/25 via-sky-500/12 to-sky-950/20',
    iconBg: 'bg-sky-500/25',
    iconBorder: 'border-sky-400/50',
    bar: 'bg-sky-400 shadow-[0_0_8px_rgba(56,189,248,0.55)]',
    short: '分析',
    Icon: Search,
  },
  2: {
    accent: 'text-violet-300',
    badge: 'bg-violet-500/20 text-violet-200 border-violet-400/40',
    panel: 'border-violet-400/45 bg-violet-500/15',
    dot: 'bg-violet-400 shadow-[0_0_10px_rgba(167,139,250,0.85)]',
    ring: 'ring-violet-400/55',
    glow: 'shadow-[0_0_20px_rgba(167,139,250,0.35),inset_0_1px_0_rgba(255,255,255,0.08)]',
    gradient: 'bg-gradient-to-b from-violet-500/25 via-violet-500/12 to-violet-950/20',
    iconBg: 'bg-violet-500/25',
    iconBorder: 'border-violet-400/50',
    bar: 'bg-violet-400 shadow-[0_0_8px_rgba(167,139,250,0.55)]',
    short: '设计',
    Icon: PenLine,
  },
  3: {
    accent: 'text-indigo-300',
    badge: 'bg-indigo-500/20 text-indigo-200 border-indigo-400/40',
    panel: 'border-indigo-400/45 bg-indigo-500/15',
    dot: 'bg-indigo-400 shadow-[0_0_10px_rgba(129,140,248,0.85)]',
    ring: 'ring-indigo-400/55',
    glow: 'shadow-[0_0_20px_rgba(129,140,248,0.35),inset_0_1px_0_rgba(255,255,255,0.08)]',
    gradient: 'bg-gradient-to-b from-indigo-500/25 via-indigo-500/12 to-indigo-950/20',
    iconBg: 'bg-indigo-500/25',
    iconBorder: 'border-indigo-400/50',
    bar: 'bg-indigo-400 shadow-[0_0_8px_rgba(129,140,248,0.55)]',
    short: '环境',
    Icon: Container,
  },
  4: {
    accent: 'text-amber-300',
    badge: 'bg-amber-500/20 text-amber-200 border-amber-400/40',
    panel: 'border-amber-400/45 bg-amber-500/15',
    dot: 'bg-amber-400 shadow-[0_0_10px_rgba(251,191,36,0.85)]',
    ring: 'ring-amber-400/55',
    glow: 'shadow-[0_0_20px_rgba(251,191,36,0.35),inset_0_1px_0_rgba(255,255,255,0.08)]',
    gradient: 'bg-gradient-to-b from-amber-500/25 via-amber-500/12 to-amber-950/20',
    iconBg: 'bg-amber-500/25',
    iconBorder: 'border-amber-400/50',
    bar: 'bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.55)]',
    short: '开发',
    Icon: Terminal,
  },
  5: {
    accent: 'text-rose-300',
    badge: 'bg-rose-500/20 text-rose-200 border-rose-400/40',
    panel: 'border-rose-400/45 bg-rose-500/15',
    dot: 'bg-rose-400 shadow-[0_0_10px_rgba(251,113,133,0.85)]',
    ring: 'ring-rose-400/55',
    glow: 'shadow-[0_0_20px_rgba(251,113,133,0.35),inset_0_1px_0_rgba(255,255,255,0.08)]',
    gradient: 'bg-gradient-to-b from-rose-500/25 via-rose-500/12 to-rose-950/20',
    iconBg: 'bg-rose-500/25',
    iconBorder: 'border-rose-400/50',
    bar: 'bg-rose-400 shadow-[0_0_8px_rgba(251,113,133,0.55)]',
    short: '走查',
    Icon: ShieldCheck,
  },
};

const DEFAULT_STAGE_THEME = STAGE_NAV_THEME[1];

/** 会议室 UI 阶段展示名（步进器/标题；与 SOP 全名解耦，如 需求研发 → 环境） */
function meetingStageNavLabel(stageId: number, fallback?: string): string {
  return STAGE_NAV_THEME[stageId]?.short ?? fallback ?? stageNameForId(stageId);
}

/** 会议室侧栏：SOP 流水线阶段步进器（高对比 + 滑动光晕指示） */
function MeetingSopStageStepper({
  viewStageId,
  pipelineStageId,
  roomCompleted,
  roomProcessing,
  onSelect,
}: {
  viewStageId: number;
  pipelineStageId: number;
  roomCompleted: boolean;
  roomProcessing: boolean;
  onSelect: (stageId: number) => void;
}) {
  const stages = MEETING_PIPELINE_STAGES;
  const pipelineIdx = roomCompleted
    ? Math.max(0, stages.length - 1)
    : Math.max(0, stages.findIndex((s) => s.id === pipelineStageId));

  return (
    <div
      className="relative rounded-xl border border-border/50 bg-gradient-to-b from-muted/35 via-background/80 to-muted/25 p-1.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]"
      role="tablist"
      aria-label="SOP 阶段切换"
    >
      {/* 底部流水线轨道 */}
      <div
        className="pointer-events-none absolute left-[10%] right-[10%] top-[1.15rem] h-[2px] rounded-full bg-border/50"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute left-[10%] top-[1.15rem] h-[2px] rounded-full transition-all duration-700 ease-out"
        style={{
          width:
            stages.length > 1
              ? `${(pipelineIdx / (stages.length - 1)) * 80}%`
              : '0%',
        }}
        aria-hidden
      >
        <div
          className={`h-full w-full rounded-full ${
            STAGE_NAV_THEME[stages[pipelineIdx]?.id ?? 1]?.bar ?? 'bg-emerald-400'
          }`}
        />
      </div>

      <div className="relative flex items-stretch gap-0.5">
        {stages.map((stage, idx) => {
          const theme = STAGE_NAV_THEME[stage.id] ?? DEFAULT_STAGE_THEME;
          const active = viewStageId === stage.id;
          const isPipeline = !roomCompleted && pipelineStageId === stage.id;
          const isPast = pipelineStageId > stage.id || roomCompleted;
          const isFuture = !isPast && !isPipeline;
          const StageIcon = theme.Icon;

          return (
            <React.Fragment key={stage.id}>
              {idx > 0 ? (
                <span
                  className={`mt-[1.1rem] h-px w-1 shrink-0 self-start transition-colors duration-300 ${
                    isPast || active ? 'bg-emerald-500/50' : 'bg-border/40'
                  }`}
                  aria-hidden
                />
              ) : null}
              <Tooltip title={`${stage.name}${isPipeline ? ' · 流水线当前' : isPast ? ' · 已完成' : ''}`}>
                <button
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => onSelect(stage.id)}
                  className={`group relative flex min-w-0 flex-1 flex-col items-center rounded-lg px-0.5 py-2 transition-all duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 focus-visible:ring-offset-background ${
                    active ? `z-10 scale-[1.04] ${theme.ring}` : 'hover:scale-[1.02] hover:bg-foreground/[0.04]'
                  }`}
                >
                  {active ? (
                    <motion.span
                      layoutId="meeting-room-sop-stage-active"
                      className={`absolute inset-0 rounded-lg border ring-1 ${theme.panel} ${theme.ring} ${theme.glow} ${theme.gradient}`}
                      transition={{ type: 'spring', stiffness: 420, damping: 32 }}
                    />
                  ) : null}

                  <span className="relative z-10 flex flex-col items-center gap-1 w-full">
                    <span
                      className={`relative flex h-8 w-8 items-center justify-center rounded-full border-2 transition-all duration-300 ${
                        active
                          ? `${theme.iconBg} ${theme.iconBorder} ${theme.glow}`
                          : isPast
                            ? 'border-emerald-500/45 bg-emerald-500/15'
                            : isPipeline
                              ? `${theme.iconBg} ${theme.iconBorder} shadow-[0_0_12px_rgba(255,255,255,0.06)]`
                              : 'border-border/55 bg-muted/30 group-hover:border-border/80 group-hover:bg-muted/45'
                      }`}
                    >
                      {isPast && !active ? (
                        <Check className="h-3.5 w-3.5 text-emerald-400" strokeWidth={2.5} aria-hidden />
                      ) : (
                        <StageIcon
                          className={`h-3.5 w-3.5 ${
                            active
                              ? theme.accent
                              : isPipeline
                                ? theme.accent
                                : isFuture
                                  ? 'text-foreground/45 group-hover:text-foreground/65'
                                  : 'text-foreground/55 group-hover:text-foreground/75'
                          }`}
                          aria-hidden
                        />
                      )}
                      {isPipeline ? (
                        <span
                          className={`absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full border-2 border-background ${theme.dot} ${
                            roomProcessing ? 'animate-pulse' : ''
                          }`}
                          aria-label="流水线当前阶段"
                        />
                      ) : null}
                    </span>

                    <span
                      className={`w-full truncate text-center text-[10px] font-bold leading-tight tracking-tight ${
                        active
                          ? theme.accent
                          : isPast
                            ? 'text-emerald-400/90'
                            : isPipeline
                              ? theme.accent
                              : 'text-foreground/55 group-hover:text-foreground/75'
                      }`}
                    >
                      {meetingStageNavLabel(stage.id, theme.short)}
                    </span>

                    <span
                      className={`rounded px-1 py-px text-[9px] font-bold tabular-nums leading-none ${
                        active ? theme.badge : 'text-foreground/40 bg-muted/30'
                      }`}
                    >
                      {stage.id}
                    </span>
                  </span>
                </button>
              </Tooltip>
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
}

function resolveSopNodeName(nodeId: string): string {
  const n = ALL_NODES.find((x) => x.id === nodeId);
  return n?.name || nodeId;
}

/** 会议卡片：累计时长超过 4 小时高亮警示 */
const MEETING_CARD_DURATION_WARN_MS = 4 * 60 * 60 * 1000;

function isMeetingDurationHot(meetingStartedAt?: string, nowMs: number = Date.now()): boolean {
  const raw = meetingStartedAt?.trim();
  if (!raw) return false;
  const start = new Date(raw);
  if (Number.isNaN(start.getTime())) return false;
  return nowMs - start.getTime() > MEETING_CARD_DURATION_WARN_MS;
}

function formatMeetingStartedAt(raw?: string): string {
  if (!raw?.trim()) return '—';
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return raw.trim();
  return d.toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

function formatTokenAmount(n: number): string {
  if (n >= 1_000_000) {
    const m = n / 1_000_000;
    return m >= 10 ? `${Math.round(m)}M` : `${m.toFixed(1)}M`;
  }
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}

function formatTokenConsumed(consumed: number, budget: number): string {
  return `${formatTokenAmount(consumed)} / ${formatTokenAmount(budget)}`;
}

/** 与中栏 Tab（人工确认等）同高 */
const MEETING_TAB_BAR_HEIGHT = 'inline-flex h-9 items-center gap-2 rounded-lg px-4 text-sm';
const MEETING_TAB_BAR_ANT_BTN = '!inline-flex !h-9 !items-center !gap-2 !rounded-lg !px-4 !text-sm';

/** 终止运行 / 重处理等长耗时操作：遮罩阻断交互并提示状态 */
function MeetingBusyOverlay({ label }: { label: string }) {
  return (
    <div
      className="absolute inset-0 z-30 flex items-center justify-center bg-background/75 backdrop-blur-[2px]"
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <div className="flex max-w-[min(20rem,90vw)] flex-col items-center gap-2.5 rounded-xl border border-border/60 bg-[color:var(--panel)]/95 px-6 py-5 shadow-lg">
        <Loader2 className="h-6 w-6 animate-spin text-primary" aria-hidden />
        <p className="text-center text-sm text-foreground/90">{label}</p>
      </div>
    </div>
  );
}

function meetingStatusTagColor(status: MeetingRoom['status']): string {
  switch (status) {
    case 'human_intervention':
      return 'error';
    case 'failed':
      return 'error';
    case 'stopped':
      return 'default';
    case 'completed':
      return 'success';
    default:
      return 'processing';
  }
}

/** 会议室全宽顶栏：工单信息 + 运行指标（跨左/中/右三栏） */
const MeetingRoomTitleBar = ({
  room,
  viewNodeId,
  viewNodeName,
  viewNodeToken,
  viewNodeBudget,
  onBack,
  onResetInitSuccess,
  synapseApiBase,
}: {
  room: MeetingRoom;
  /** 当前 SOP 卡片选中的节点（顶栏指标随其切换） */
  viewNodeId: string;
  viewNodeName: string;
  viewNodeToken: number;
  /** 当前查看节点的 Token 预算（非系统节点；与 live 轮询 node_id 对齐） */
  viewNodeBudget: number | null;
  onBack: () => void;
  /** 工单处理初始化成功后：关闭弹窗并从会议室主列表移除 */
  onResetInitSuccess?: (roomId: string) => void;
  synapseApiBase?: string;
}) => {
  const [soulModalOpen, setSoulModalOpen] = useState(false);
  const [soulDraft, setSoulDraft] = useState('');
  const [soulLoading, setSoulLoading] = useState(false);
  const [soulSaving, setSoulSaving] = useState(false);
  const [resetInitLoading, setResetInitLoading] = useState(false);
  const soulHasContent = soulDraft.trim().length > 0;

  useEffect(() => {
    const base = (synapseApiBase || '').trim();
    const scopeId = (room.ticketId || '').trim();
    if (!base || !scopeId) return;
    let cancelled = false;
    void fetchSoulInstruction(base, scopeId)
      .then((payload) => {
        if (cancelled) return;
        setSoulDraft(String(payload.instruction || ''));
      })
      .catch(() => {
        if (!cancelled) setSoulDraft('');
      });
    return () => {
      cancelled = true;
    };
  }, [room.ticketId, synapseApiBase]);

  const openSoulModal = useCallback(() => {
    const base = (synapseApiBase || '').trim();
    const scopeId = (room.ticketId || '').trim();
    setSoulModalOpen(true);
    if (!base || !scopeId) {
      setSoulDraft('');
      return;
    }
    setSoulLoading(true);
    void fetchSoulInstruction(base, scopeId)
      .then((payload) => {
        setSoulDraft(String(payload.instruction || ''));
      })
      .catch(() => {
        toast.error('加载灵魂建议失败');
        setSoulDraft('');
      })
      .finally(() => {
        setSoulLoading(false);
      });
  }, [room.ticketId, synapseApiBase]);

  const saveSoulInstruction = useCallback(async () => {
    const base = (synapseApiBase || '').trim();
    const scopeId = (room.ticketId || '').trim();
    if (!base || !scopeId) {
      toast.message('当前环境无法保存灵魂建议');
      return;
    }
    setSoulSaving(true);
    try {
      await putSoulInstruction(base, scopeId, soulDraft.trim());
      toast.success('灵魂建议已保存');
      setSoulModalOpen(false);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error(`保存失败：${msg}`);
    } finally {
      setSoulSaving(false);
    }
  }, [room.ticketId, soulDraft, synapseApiBase]);

  const handleResetToAudit = useCallback(() => {
    const base = (synapseApiBase || '').trim();
    if (!base || !room.id) {
      toast.message('当前环境无法执行工单处理初始化');
      return;
    }
    Modal.confirm({
      title: '工单处理初始化',
      content:
        '将停止当前会议、删除本地工单目录，并把研发云需求单回退到「需求评审」。本地流水线产物将全部清除，之后需重新「一键开会」。',
      okText: '确认初始化',
      cancelText: '取消',
      okButtonProps: { danger: true },
      onOk: async () => {
        setResetInitLoading(true);
        try {
          await resetDemandToAudit(base, room.id);
          toast.success('工单已初始化，研发云状态已回退至需求评审');
          if (onResetInitSuccess) {
            onResetInitSuccess(room.id);
          } else {
            onBack();
          }
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          toast.error(`初始化失败：${msg}`);
        } finally {
          setResetInitLoading(false);
        }
      },
    });
  }, [onBack, onResetInitSuccess, room.id, synapseApiBase]);

  const isPipelineCurrent = viewNodeId === room.currentNode;
  const tokenBudget = viewNodeBudget;
  const tokenConsumed = viewNodeToken;
  const tokenPct = tokenBudget != null && tokenBudget > 0
    ? Math.min(100, (tokenConsumed / tokenBudget) * 100)
    : 0;
  const tokenHot = tokenBudget != null && tokenBudget > 0 && tokenConsumed > tokenBudget * 0.9;

  return (
    <header className="shrink-0 border-b border-border/60 bg-gradient-to-r from-[color:var(--panel)] via-[color:var(--panel2)] to-[color:var(--panel)] px-4 py-3">
      <div className="flex items-center gap-4 min-w-0">
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <Button
            size="small"
            icon={<ArrowLeft className="w-3.5 h-3.5" />}
            onClick={onBack}
            className="shrink-0 border-border/60"
          >
            返回看板
          </Button>
          <div className="h-8 w-px bg-border/50 shrink-0" aria-hidden />
          <div className="min-w-0 flex flex-col gap-0.5">
            <div className="flex items-center gap-2 min-w-0">
              <Sparkles className="w-4 h-4 text-violet-400 shrink-0" />
              <h2
                className="text-sm font-semibold text-foreground truncate"
                title={room.ticketTitle}
              >
                {room.ticketTitle}
              </h2>
              <Tag
                color={meetingStatusTagColor(room.status)}
                className={`m-0 shrink-0 border-0 ${MEETING_TAB_BAR_HEIGHT}`}
              >
                {roomCardStatusLabel(room.status)}
              </Tag>
            </div>
            <div
              className="flex items-center gap-1.5 text-[11px] text-muted-foreground font-mono pl-6 min-w-0"
              title={room.ticketId}
            >
              <GitBranch className="w-3 h-3 shrink-0" />
              <span className="truncate">{room.ticketId}</span>
              {room.branch && room.branch !== '—' ? (
                <>
                  <span className="text-muted-foreground/40">·</span>
                  <span className="truncate">{room.branch}</span>
                </>
              ) : null}
            </div>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 min-w-0 shrink-0 flex-wrap">
          <div className="rd-meeting-soul-cluster">
            <Tooltip title="工单处理初始化">
              <button
                type="button"
                className="rd-meeting-soul-alert"
                aria-label="工单处理初始化"
                onClick={handleResetToAudit}
                disabled={resetInitLoading}
              >
                <svg
                  className="rd-meeting-soul-alert__svg"
                  viewBox="0 0 24 24"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                  aria-hidden
                >
                  <defs>
                    <linearGradient
                      id={`rd-meeting-soul-alert-grad-${room.ticketId}`}
                      x1="12"
                      y1="3"
                      x2="12"
                      y2="20"
                      gradientUnits="userSpaceOnUse"
                    >
                      <stop offset="0%" stopColor="#fca5a5" />
                      <stop offset="50%" stopColor="#ef4444" />
                      <stop offset="100%" stopColor="#dc2626" />
                    </linearGradient>
                  </defs>
                  <path
                    className="rd-meeting-soul-alert__triangle"
                    d="M12 3.2L20.66 19.2H3.34L12 3.2Z"
                    fill={`url(#rd-meeting-soul-alert-grad-${room.ticketId})`}
                  />
                  <path
                    className="rd-meeting-soul-alert__mark-line"
                    d="M12 9v5.2"
                    strokeLinecap="round"
                  />
                  <circle className="rd-meeting-soul-alert__mark-dot" cx="12" cy="16.6" r="1.05" />
                </svg>
              </button>
            </Tooltip>
            <Tooltip title={`编辑本工单灵魂建议（work/${room.ticketId}/SOUL_INSTRUCTION.json）`}>
              <button
                type="button"
                className={`rd-meeting-soul-btn${soulHasContent ? ' rd-meeting-soul-btn--filled' : ''}`}
                onClick={openSoulModal}
                aria-label="编辑灵魂建议"
              >
                <span className="rd-meeting-soul-btn__aura" aria-hidden />
                <span className="rd-meeting-soul-btn__icon-wrap" aria-hidden>
                  <Flame className="rd-meeting-soul-btn__flame w-3.5 h-3.5" />
                </span>
                <span className="rd-meeting-soul-btn__label">灵魂建议</span>
                {soulHasContent ? <span className="rd-meeting-soul-btn__dot" aria-hidden /> : null}
              </button>
            </Tooltip>
          </div>
          <Tooltip title={`会议开始于 ${formatMeetingStartedAt(room.meetingStartedAt)} · 累计处理 ${room.stageDuration}`}>
            <div className="inline-flex items-center gap-2 rounded-lg border border-border/50 bg-muted/25 px-3 py-1.5 text-[11px] text-muted-foreground">
              <Clock className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
              <span className="text-foreground/80 whitespace-nowrap">开始</span>
              <span className="font-mono text-foreground whitespace-nowrap">
                {formatMeetingStartedAt(room.meetingStartedAt)}
              </span>
            </div>
          </Tooltip>
          <Tooltip title={`${isPipelineCurrent ? '流水线当前' : '查看'}节点 · ${viewNodeName}`}>
            <div className="inline-flex items-center gap-2 rounded-lg border border-blue-500/25 bg-blue-500/8 px-3 py-1.5 text-[11px] max-w-[280px]">
              <Activity className="w-3.5 h-3.5 text-blue-400 shrink-0" />
              <span className="text-muted-foreground whitespace-nowrap">
                {isPipelineCurrent ? '当前节点' : '节点'}
              </span>
              <span className="font-medium text-blue-300 truncate">{viewNodeName}</span>
            </div>
          </Tooltip>
          {tokenBudget != null && tokenBudget > 0 ? (
          <Tooltip title={`节点 Token 消耗 ${tokenConsumed.toLocaleString()} / 预算 ${tokenBudget.toLocaleString()}`}>
            <div className="inline-flex items-center gap-2 rounded-lg border border-amber-500/25 bg-amber-500/8 px-3 py-1.5 text-[11px] min-w-[140px]">
              <Coins className="w-3.5 h-3.5 text-amber-400 shrink-0" />
              <span className="text-muted-foreground whitespace-nowrap">Token</span>
              <span className={`font-mono whitespace-nowrap ${tokenHot ? 'text-red-400' : 'text-amber-200/90'}`}>
                {formatTokenConsumed(tokenConsumed, tokenBudget)}
              </span>
              <Progress
                percent={tokenPct}
                showInfo={false}
                size="small"
                strokeColor={tokenHot ? '#ef4444' : '#f59e0b'}
                trailColor="rgba(255,255,255,0.08)"
                className="!mb-0 min-w-[48px] max-w-[72px]"
              />
            </div>
          </Tooltip>
          ) : null}
        </div>
      </div>
      <Modal
        title="灵魂建议（SOUL_INSTRUCTION）"
        open={soulModalOpen}
        onCancel={() => setSoulModalOpen(false)}
        onOk={() => void saveSoulInstruction()}
        okText="保存"
        cancelText="取消"
        confirmLoading={soulSaving}
        destroyOnClose
      >
        <p className="mb-3 text-xs text-muted-foreground leading-relaxed">
          辅助工单处理，指明关键流程与模块；保存至本工单目录{' '}
          <code className="text-[10px]">work/{room.ticketId}/SOUL_INSTRUCTION.json</code>
          ，并注入 Host/Worker 系统提示词与 CLI 开发/检测指令。
        </p>
        <Input.TextArea
          value={soulDraft}
          onChange={(e) => setSoulDraft(e.target.value)}
          placeholder="例如：本工单涉及账务中心限流模块，优先查阅 MDB 配置与 REST 接入文档…"
          autoSize={{ minRows: 4, maxRows: 12 }}
          disabled={soulLoading}
        />
      </Modal>
    </header>
  );
};

function roomCardStatusLabel(status: MeetingRoom['status']): string {
  switch (status) {
    case 'human_intervention':
      return '待介入';
    case 'processing':
      return '进行中';
    case 'completed':
      return '已完成';
    case 'failed':
      return '异常';
    case 'stopped':
      return '已停止';
    default:
      return '';
  }
}

/** 会议室阶段进度：与标题分行，圆点+文案强制单行（必要时横向滚动） */
const RoomCardStageProgress = ({ room }: { room: MeetingRoom }) => {
  const statusTone =
    room.status === 'human_intervention'
      ? 'text-red-400'
      : room.status === 'processing'
        ? 'text-blue-400'
        : room.status === 'failed'
          ? 'text-red-400'
          : 'text-green-400';

  const statusDot =
    room.status === 'human_intervention'
      ? 'bg-red-500 shadow-[0_0_6px_rgba(239,68,68,0.8)]'
      : room.status === 'processing'
        ? 'bg-blue-500 shadow-[0_0_6px_rgba(59,130,246,0.8)] animate-pulse'
        : room.status === 'failed'
          ? 'bg-red-500'
          : 'bg-green-500';

  const currentStageLabel = room.stageName || stageNameForId(room.stageIndex);

  return (
    <div className="flex w-full min-w-0 items-center gap-2">
      <div
        className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto flex-nowrap [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        aria-label="SOP 阶段进度"
      >
        {MEETING_PIPELINE_STAGES.map((stage, idx) => {
          const isPast = room.stageIndex > stage.id || room.status === 'completed';
          const isActive = room.stageIndex === stage.id && room.status !== 'completed';
          const dotCls = isPast
            ? 'bg-emerald-500 shadow-[0_0_4px_rgba(16,185,129,0.5)]'
            : isActive
              ? room.status === 'human_intervention'
                ? 'bg-amber-500 shadow-[0_0_6px_rgba(245,158,11,0.7)]'
                : 'bg-blue-500 shadow-[0_0_6px_rgba(59,130,246,0.8)]'
              : 'bg-muted-foreground/35';
          const textCls = isPast
            ? 'text-emerald-600/90 dark:text-emerald-400/90'
            : isActive
              ? room.status === 'human_intervention'
                ? 'text-amber-400'
                : 'text-blue-400'
              : 'text-muted-foreground/50';

          return (
            <React.Fragment key={stage.id}>
              {idx > 0 ? (
                <span
                  className={`h-px w-2 shrink-0 ${isPast || isActive ? 'bg-emerald-500/40' : 'bg-border/50'}`}
                  aria-hidden
                />
              ) : null}
              <Tooltip title={stage.name}>
                <span className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap">
                  <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${dotCls}`} aria-hidden />
                  <span className={`text-[9px] font-medium leading-none ${textCls}`}>{stage.name}</span>
                </span>
              </Tooltip>
            </React.Fragment>
          );
        })}
      </div>
      <span
        className={`inline-flex shrink-0 items-center gap-1 whitespace-nowrap text-[10px] font-medium ${statusTone}`}
      >
        <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${statusDot}`} aria-hidden />
        [{room.stageIndex}/{room.totalStages}] {currentStageLabel}
        <span className="text-muted-foreground/60">·</span>
        {roomCardStatusLabel(room.status)}
      </span>
    </div>
  );
};

const RoomCard = ({
  room,
  onClick,
}: {
  room: MeetingRoom;
  onClick: (r: MeetingRoom) => void;
}) => {
  const [nowTick, setNowTick] = useState(() => Date.now());

  useEffect(() => {
    if (!room.meetingStartedAt) return;
    const timer = window.setInterval(() => setNowTick(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, [room.meetingStartedAt]);

  const durationHot = isMeetingDurationHot(room.meetingStartedAt, nowTick);

  const borderColor = 
    room.status === 'human_intervention' ? 'border-red-500/50 hover:border-red-400' :
    room.status === 'processing' ? 'border-blue-500/50 hover:border-blue-400' :
    'border-border hover:border-muted-foreground';

  const glowColor =
    room.status === 'human_intervention' ? 'shadow-[0_0_15px_rgba(239,68,68,0.15)]' :
    room.status === 'processing' ? 'shadow-[0_0_15px_rgba(59,130,246,0.15)]' :
    'shadow-none';

  return (
    <div
      onClick={() => onClick(room)}
      className={`cursor-pointer bg-card border ${borderColor} ${glowColor} rounded-2xl overflow-hidden flex flex-col h-[320px] transition-colors duration-300 relative group`}
    >
      <div className="shrink-0 border-b border-border/50 bg-muted/10 p-3 flex flex-col gap-2">
        <Tooltip title={`${room.ticketId} · ${room.ticketTitle}`}>
          <div className="flex min-w-0 items-center gap-2 whitespace-nowrap">
            <Hash className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            <span className="shrink-0 font-mono text-xs text-muted-foreground">{room.ticketId}</span>
            <span className="shrink-0 text-muted-foreground/40">|</span>
            <h3 className="min-w-0 flex-1 truncate text-sm font-semibold text-foreground">
              {room.ticketTitle}
            </h3>
          </div>
        </Tooltip>
        <RoomCardStageProgress room={room} />

        <div className="flex items-center gap-3 text-xs">
          <div
            className={`flex items-center gap-1.5 px-2 py-1 rounded-md border ${
              durationHot
                ? 'text-red-400 bg-red-500/10 border-red-500/40'
                : 'text-muted-foreground bg-muted/40 border-border/50'
            }`}
          >
            <Clock className={`w-3 h-3 shrink-0 ${durationHot ? 'text-red-400' : 'text-indigo-400'}`} />
            <span className={`font-mono ${durationHot ? 'text-red-300' : ''}`}>{room.stageDuration}</span>
          </div>
          <div className="flex items-center gap-1.5 text-muted-foreground bg-muted/40 px-2 py-1 rounded-md border border-border/50 flex-1">
            <Coins className="w-3 h-3 text-amber-400" />
            <div className="flex-1 flex items-center gap-2">
              <span className="font-mono">{(room.tokenConsumed / 1000).toFixed(1)}k</span>
              <Progress 
                percent={
                  room.tokenBudget != null && room.tokenBudget > 0
                    ? Math.min(100, (room.tokenConsumed / room.tokenBudget) * 100)
                    : 0
                } 
                showInfo={false} 
                size="small"
                strokeColor={
                  room.tokenBudget != null &&
                  room.tokenBudget > 0 &&
                  room.tokenConsumed > room.tokenBudget * 0.9
                    ? '#ef4444'
                    : '#3b82f6'
                }
                trailColor="rgba(255,255,255,0.1)"
                style={{ marginBottom: 0, minWidth: '40px' }}
              />
            </div>
          </div>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col p-3">
        <RoomCardChatStream room={room} logs={room.logs} />
      </div>

      {/* Footer Action */}
      <div className={`p-3 flex items-center justify-between border-t border-border/50 ${
        room.status === 'human_intervention' ? 'bg-red-950/20' : 'bg-muted/30'
      }`}>
        <span className={`text-xs font-medium line-clamp-1 flex-1 pr-2 ${
          room.status === 'human_intervention' ? 'text-red-400 flex items-center gap-1' : 'text-muted-foreground'
        }`}>
          {room.status === 'human_intervention' && <AlertTriangle className="w-3.5 h-3.5 shrink-0" />}
          {room.brief}
        </span>
        <Button 
          type="primary" 
          size="small" 
          className={`shrink-0 flex items-center gap-1 text-[11px] h-7 px-3 border-none ${
            room.status === 'human_intervention' 
              ? 'bg-red-600 hover:bg-red-500 shadow-[0_0_10px_rgba(239,68,68,0.4)]' 
              : 'bg-blue-600 hover:bg-blue-500 shadow-[0_0_10px_rgba(37,99,235,0.4)] opacity-0 group-hover:opacity-100 transition-opacity'
          }`}
        >
          介入会议 <ChevronRight className="w-3 h-3" />
        </Button>
      </div>
    </div>
  );
};


const InterventionDialog = ({ 
  room, 
  open, 
  onClose,
  onHitlSubmit,
  onReprocess,
  onRecover,
  onStopRun,
  onMergeNodeChat,
  onProdSubmitted,
  onResetInitSuccess,
  onViewNodeChange,
  synapseApiBase,
}: { 
  room: MeetingRoom | null; 
  open: boolean; 
  onClose: () => void;
  /** 弹窗内选中的 SOP 节点（供外层 live 轮询带 node_id） */
  onViewNodeChange?: (nodeId: string) => void;
  /** 仅中栏人工确认表单提交时使用，协作流只读 */
  onHitlSubmit?: (text: string, values: HitlFormValues) => void;
  onReprocess?: (nodeId: string, reason?: string) => void;
  onRecover?: (nodeId: string) => void;
  onStopRun?: () => void;
  /** 按 SOP 节点合并协作流（来自 agents/<node_id>/room_history.jsonl） */
  onMergeNodeChat?: (nodeId: string, logs: LogEntry[]) => void;
  onProdSubmitted?: (detail: MeetingRoomDetail) => void;
  onResetInitSuccess?: (roomId: string) => void;
  synapseApiBase?: string;
}) => {
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [viewStageId, setViewStageId] = useState<number | null>(null);
  const [centerTab, setCenterTab] = useState<'detail' | 'hitl'>('detail');
  const [selectedNodeParticipants, setSelectedNodeParticipants] = useState<MeetingRoomParticipantWire[]>([]);
  const [disabledSopNodeIds, setDisabledSopNodeIds] = useState<Set<string>>(() => new Set());
  const [contextOpen, setContextOpen] = useState(false);
  const [contextAgent, setContextAgent] = useState<AgentContextTarget | null>(null);
  const [reprocessModalOpen, setReprocessModalOpen] = useState(false);
  const [reprocessTargetNodeId, setReprocessTargetNodeId] = useState<string | null>(null);
  const [reprocessReason, setReprocessReason] = useState('');

  const openReprocessModal = (nodeId: string) => {
    setReprocessTargetNodeId(nodeId);
    setReprocessReason('');
    setReprocessModalOpen(true);
  };

  const confirmReprocess = () => {
    const nodeId = (reprocessTargetNodeId || '').trim();
    if (!nodeId) return;
    setReprocessModalOpen(false);
    onReprocess?.(nodeId, reprocessReason.trim() || undefined);
    setReprocessTargetNodeId(null);
    setReprocessReason('');
  };

  const [viewNodeToken, setViewNodeToken] = useState(0);
  const [viewNodeBudget, setViewNodeBudget] = useState<number | null>(null);
  const logsEndRef = useRef<HTMLDivElement>(null);
  const lastLogKeyRef = useRef('');
  const interventionRoomIdRef = useRef<string | null>(null);
  const lastFollowedNodeRef = useRef<string | null>(null);
  const hitlAutoFocusRef = useRef<string | null>(null);
  /** 用户手动点选 SOP 节点后，禁止 live/HITL 副作用把选中态拉回流水线当前节点 */
  const userPinnedNodeRef = useRef(false);

  const chatNodeId = selectedNodeId || room?.currentNode || 'pending';

  useEffect(() => {
    onViewNodeChange?.(chatNodeId);
  }, [chatNodeId, onViewNodeChange]);
  /** 人工确认表单/结果确认仅归属当前流水线节点（或 review_payload 指定节点） */
  const hitlTargetNodeId = room ? resolveHitlTargetNodeId(room) : '';
  const isViewingHitlNode = Boolean(hitlTargetNodeId && chatNodeId === hitlTargetNodeId);

  const hitlLocked = Boolean(room?.hitlLocked);
  const hitlNodeType = useMemo((): NodeType => {
    const nid = hitlTargetNodeId || room?.currentNode || '';
    return (ALL_NODES.find((n) => n.id === nid)?.type ?? 'ai') as NodeType;
  }, [hitlTargetNodeId, room?.currentNode]);
  const interventionPanel = useMemo(
    () =>
      room
        ? resolveMeetingInterventionPanel(room, hitlNodeType, hitlTargetNodeId)
        : null,
    [room, hitlNodeType, hitlTargetNodeId],
  );
  const prodSelectionActive =
    interventionPanel === 'prod_selection' ||
    (room?.interventionKind || '').toLowerCase() === 'prod_selection';
  const autoSplitChoiceActive =
    interventionPanel === 'auto_split_choice' ||
    (room?.interventionKind || '').toLowerCase() === 'auto_split_choice';
  const hitlAvailable = Boolean(
    interventionPanel &&
      room?.status === 'human_intervention' &&
      !hitlLocked &&
      (prodSelectionActive || autoSplitChoiceActive || isViewingHitlNode),
  );
  const hitlBadgeText = useMemo(() => {
    if (interventionPanel === 'prod_selection') return '选择产品';
    if (interventionPanel === 'auto_split_choice') return '拆单策略';
    if (interventionPanel === 'solution_review') return '方案评审';
    if (interventionPanel === 'func_solution_review') return '函数级方案评审';
    if (interventionPanel === 'task_exec') {
      const nid = (room.hitlPendingNodeId || room.currentNode || 'task_exec').trim();
      return nid === 'diff_analysis' ? '试飞优化评审' : '任务执行评审';
    }
    if (interventionPanel === 'node_review') return '结果待确认';
    const k = (room?.interventionKind || '').toLowerCase();
    if (k === 'exception') return '异常待裁决';
    if (k === 'interactive') return '澄清待回复';
    return '待人工确认';
  }, [interventionPanel, room?.interventionKind, room?.hitlPendingNodeId, room?.currentNode]);

  const cliExecNodeId = useMemo((): 'task_exec' | 'diff_analysis' => {
    const nid = (room?.hitlPendingNodeId || room?.currentNode || 'task_exec').trim();
    return nid === 'diff_analysis' ? 'diff_analysis' : 'task_exec';
  }, [room?.hitlPendingNodeId, room?.currentNode]);

  const hitlFocusKey = useMemo(() => {
    if (!hitlAvailable || !room) return null;
    const gateNode = hitlTargetNodeId || room.currentNode;
    const schema = room.hitlFormSchema as { title?: string; questions?: unknown[] } | null | undefined;
    const schemaSig = schema
      ? `${schema.title ?? ''}:${schema.questions?.length ?? 0}`
      : interventionPanel
        ? `${interventionPanel}:${gateNode}`
        : 'hitl';
    return `${room.id}:${gateNode}:${schemaSig}`;
  }, [hitlAvailable, room, interventionPanel, hitlTargetNodeId]);

  const displayChatLogs = useMemo(
    () => (room ? filterLogsForNodeExact(room.allChatLogs ?? room.logs, chatNodeId) : []),
    [room, chatNodeId],
  );

  const effectiveViewStageId =
    viewStageId ?? (room ? stageIdForNodeId(room.currentNode) || room.stageIndex : 0);
  const currentStage = room
    ? MEETING_PIPELINE_STAGES.find((s) => s.id === effectiveViewStageId) ??
      SOP_STAGES.find((s) => s.id === effectiveViewStageId)
    : undefined;
  const pipelineStageId = room ? stageIdForNodeId(room.currentNode) || room.stageIndex : 0;
  const stageNodes = currentStage?.nodes || [];
  const resolvedSelectedNodeId = selectedNodeId || room?.currentNode || stageNodes[0]?.id || null;
  const selectedNode =
    (resolvedSelectedNodeId
      ? ALL_NODES.find((n) => n.id === resolvedSelectedNodeId)
      : undefined) ||
    stageNodes.find((n) => n.id === room?.currentNode) ||
    stageNodes[0];

  const reprocessableRoomStatus =
    room?.status === 'failed' ||
    room?.status === 'human_intervention' ||
    room?.status === 'stopped';

  const canReprocessCodeCommitNode = (nodeId: string) => {
    if (!room || nodeId !== 'exception_check') return false;
    if (room.runInProgress || room.reprocessingNodeId || room.stoppingRun) return false;
    if (stageIdForNodeId(nodeId) !== stageIdForNodeId(room.currentNode)) return false;
    if (!['processing', 'failed', 'stopped', 'human_intervention'].includes(room.status)) return false;
    const nodeState = getNodeStateGlobal(room, nodeId, disabledSopNodeIds);
    if (nodeId === room.currentNode) return true;
    return nodeState === 'completed';
  };

  const canReprocessHistoricalNode = (nodeId: string, nodeType: string) =>
    canReprocessCodeCommitNode(nodeId) ||
    Boolean(
      room &&
      reprocessableRoomStatus &&
      !room.runInProgress &&
      !room.reprocessingNodeId &&
      !room.stoppingRun &&
      nodeId !== room.currentNode &&
      nodeType !== 'system' &&
      stageIdForNodeId(nodeId) === stageIdForNodeId(room.currentNode) &&
      getNodeStateGlobal(room, nodeId, disabledSopNodeIds) === 'completed',
    );

  const canReprocess = Boolean(
    room &&
    selectedNode &&
    !room.runInProgress &&
    !room.reprocessingNodeId &&
    !room.stoppingRun &&
    (canReprocessCodeCommitNode(selectedNode.id) ||
      (reprocessableRoomStatus &&
        (selectedNode.id === room.currentNode ||
          canReprocessHistoricalNode(selectedNode.id, selectedNode.type)))),
  );

  const canRecover = Boolean(
    room &&
    selectedNode &&
    selectedNode.id === room.currentNode &&
    room.status === 'stopped' &&
    !room.runInProgress &&
    !room.reprocessingNodeId &&
    !room.stoppingRun &&
    room.nodeRecovery?.recoverable,
  );

  const canStopNodeRun = Boolean(
    room &&
    room.status === 'processing' &&
    room.runInProgress &&
    !room.stoppingRun &&
    !room.reprocessingNodeId,
  );

  const roomBusyOverlayLabel = room?.stoppingRun
    ? '正在终止当前节点运行…'
    : room?.reprocessingNodeId
      ? `正在重新处理「${resolveSopNodeName(room.reprocessingNodeId)}」…`
      : '';
  const showRoomBusyOverlay = Boolean(roomBusyOverlayLabel);

  const displayAgents = useMemo((): RoomAgent[] => {
    if (!room) return [];
    const parts =
      selectedNodeParticipants.length > 0
        ? selectedNodeParticipants
        : chatNodeId === room.currentNode
          ? room.participants || []
          : [];
    const isCurrentNode = chatNodeId === room.currentNode;
    return parts.map((p) => {
      if (isCurrentNode) {
        const live = room.agents.find((a) => a.id === p.profile_id);
        if (live) return live;
      }
      return participantToRoomAgent(
        p,
        isCurrentNode && room.runInProgress ? 'processing' : 'idle',
      );
    });
  }, [room, selectedNodeParticipants, chatNodeId]);

  useEffect(() => {
    if (!open) {
      setDisabledSopNodeIds(new Set());
      return;
    }
    const base = (synapseApiBase || '').trim();
    if (!base) return;
    let cancelled = false;
    void fetchMeetingRoomConfig(base)
      .then((cfg) => {
        if (!cancelled) setDisabledSopNodeIds(buildDisabledSopNodeIds(cfg.node_overrides));
      })
      .catch(() => {
        if (!cancelled) setDisabledSopNodeIds(new Set());
      });
    return () => {
      cancelled = true;
    };
  }, [open, synapseApiBase]);

  useEffect(() => {
    if (!open || !room?.id || !chatNodeId) {
      setSelectedNodeParticipants([]);
      return;
    }
    const base = (synapseApiBase || '').trim();
    if (!base) return;
    let cancelled = false;
    void fetchMeetingNodeParticipants(base, room.id, chatNodeId)
      .then((res) => {
        if (!cancelled) setSelectedNodeParticipants(res.participants || []);
      })
      .catch(() => {
        if (!cancelled) setSelectedNodeParticipants([]);
      });
    return () => {
      cancelled = true;
    };
  }, [open, room?.id, chatNodeId, synapseApiBase]);

  /** 顶栏节点 Token：已完成用 node_metrics 静态值；进行中从 activity.jsonl 动态轮询 */
  const viewNodePipelineState = room
    ? getNodeStateGlobal(room, chatNodeId, disabledSopNodeIds)
    : 'pending';
  useEffect(() => {
    if (!open || !room?.id || !chatNodeId) {
      setViewNodeToken(0);
      setViewNodeBudget(null);
      return;
    }
    const base = (synapseApiBase || '').trim();
    if (!base) return;
    const roomId = room.id;
    const nodeId = chatNodeId;
    const isLiveNode = viewNodePipelineState === 'processing';
    let cancelled = false;
    const poll = () => {
      void fetchMeetingRoomLive(base, roomId, nodeId)
        .then((live) => {
          if (cancelled) return;
          if (live.view_node_id && live.view_node_id !== nodeId) return;
          const tok =
            typeof live.view_node_token === 'number'
              ? live.view_node_token
              : live.tokenConsumed;
          setViewNodeToken(typeof tok === 'number' ? tok : 0);
          setViewNodeBudget(
            typeof live.tokenBudget === 'number' ? live.tokenBudget : null,
          );
        })
        .catch(() => {
          /* 静默 */
        });
    };
    poll();
    if (!isLiveNode) {
      return () => {
        cancelled = true;
      };
    }
    const timer = window.setInterval(poll, 3000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [open, room?.id, chatNodeId, synapseApiBase, viewNodePipelineState]);

  useEffect(() => {
    if (!open || !room?.id || !chatNodeId || !onMergeNodeChat) return;
    const base = (synapseApiBase || '').trim();
    if (!base) return;
    let cancelled = false;
    void fetchMeetingRoomNodeChat(base, room.id, chatNodeId)
      .then((payload) => {
        if (cancelled) return;
        const logs = (payload.chat_logs || []).map(mapChatWireToLog);
        // 空响应不覆盖已合并的全量 history，避免历史系统节点卡片被误清空
        if (!logs.length) return;
        onMergeNodeChat(chatNodeId, logs);
      })
      .catch(() => {
        /* 节点 chat 拉取失败时保留已有缓存 */
      });
    return () => {
      cancelled = true;
    };
  }, [open, room?.id, room?.chatEpoch, chatNodeId, synapseApiBase, onMergeNodeChat]);

  const scrollLogsToBottom = useCallback(() => {
    setTimeout(() => {
      logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, 100);
  }, []);

  const selectSopNode = useCallback((nodeId: string) => {
    const nid = (nodeId || '').trim();
    if (!nid) return;
    userPinnedNodeRef.current = true;
    setSelectedNodeId(nid);
    const sid = stageIdForNodeId(nid);
    if (sid) setViewStageId(sid);
  }, []);

  const handleStageSelect = useCallback(
    (stageId: number) => {
      if (!room) return;
      userPinnedNodeRef.current = true;
      setViewStageId(stageId);
      const stage = MEETING_PIPELINE_STAGES.find((s) => s.id === stageId);
      if (!stage) return;
      setSelectedNodeId(pickDefaultNodeForStage(room, stage, disabledSopNodeIds));
      setCenterTab('detail');
    },
    [room, disabledSopNodeIds],
  );

  useEffect(() => {
    if (!open) {
      setSelectedNodeId(null);
      setViewStageId(null);
      setCenterTab('detail');
      interventionRoomIdRef.current = null;
      lastFollowedNodeRef.current = null;
      hitlAutoFocusRef.current = null;
      userPinnedNodeRef.current = false;
      return;
    }
    if (!room?.currentNode) return;
    if (interventionRoomIdRef.current !== room.id) {
      interventionRoomIdRef.current = room.id;
      userPinnedNodeRef.current = false;
    }
    if (lastFollowedNodeRef.current !== room.currentNode) {
      lastFollowedNodeRef.current = room.currentNode;
      userPinnedNodeRef.current = false;
      setSelectedNodeId(room.currentNode);
      setViewStageId(stageIdForNodeId(room.currentNode) || room.stageIndex);
    }
  }, [open, room?.id, room?.currentNode, room?.stageIndex]);

  /** 人工确认触发或待办更新时，自动切到「人工确认」并聚焦当前节点 */
  useEffect(() => {
    if (!open) return;
    if (!hitlAvailable || !hitlFocusKey) {
      hitlAutoFocusRef.current = null;
      setCenterTab((tab) => (tab === 'hitl' ? 'detail' : tab));
      return;
    }
    if (hitlAutoFocusRef.current === hitlFocusKey) return;
    hitlAutoFocusRef.current = hitlFocusKey;
    setCenterTab('hitl');
    if (!userPinnedNodeRef.current && room) {
      const target = resolveHitlTargetNodeId(room);
      if (target) {
        setSelectedNodeId(target);
        setViewStageId(stageIdForNodeId(target) || room.stageIndex);
      }
    }
  }, [open, hitlAvailable, hitlFocusKey, room]);

  /** 切换到历史节点时离开「人工确认」Tab，避免在非待确认节点展示表单 */
  useEffect(() => {
    if (!open) return;
    if (centerTab === 'hitl' && !isViewingHitlNode) {
      setCenterTab('detail');
    }
  }, [open, centerTab, isViewingHitlNode]);

  useEffect(() => {
    if (!open || !room?.reprocessingNodeId) return;
    selectSopNode(room.reprocessingNodeId);
  }, [open, room?.reprocessingNodeId, selectSopNode]);

  useEffect(() => {
    if (!open) return;
    lastLogKeyRef.current = '';
    const pane = logsEndRef.current?.parentElement;
    if (pane) pane.scrollTop = 0;
  }, [open, chatNodeId, room?.id]);

  /** 仅当尾部指纹变化（有新消息）时滚到底；live 轮询会重建 room 但不会改 logs 内容 */
  useEffect(() => {
    if (!open || !room) return;
    const key = getLogsTailKey(displayChatLogs);
    if (key === lastLogKeyRef.current) return;
    lastLogKeyRef.current = key;
    scrollLogsToBottom();
  }, [open, room, displayChatLogs, scrollLogsToBottom]);

  if (!room) return null;

  const openAgentContext = (agent: RoomAgent) => {
    setContextAgent({
      profileId: agent.id,
      name: agent.name,
      role: agent.role,
      avatarColor: agent.avatarColor,
      isHost: agent.id === HOST_PROFILE_ID || agent.role === '会议主持',
      nodeId: chatNodeId,
    });
    setContextOpen(true);
  };

  return (
    <Modal
      title={null}
      open={open}
      footer={null}
      width={1840}
      style={{ maxWidth: '96vw' }}
      centered
      closable={false}
      maskClosable={false}
      keyboard={false}
      className="intervention-modal"
      classNames={{
        // antd v5: 部分版本不在 ModalClassNamesType 中暴露 content；通过 className 兜底
        ...({
          content: 'bg-[color:var(--panel)] p-0 overflow-hidden border border-border/50 rounded-2xl shadow-2xl',
          mask: 'backdrop-blur-sm bg-black/70',
        } as Record<string, string>),
      }}
    >
      <div className="flex h-[min(92vh,960px)] flex-col overflow-hidden">
        <MeetingRoomTitleBar
          room={room}
          viewNodeId={chatNodeId}
          viewNodeName={selectedNode?.name || resolveSopNodeName(chatNodeId)}
          viewNodeToken={viewNodeToken}
          viewNodeBudget={viewNodeBudget}
          onBack={onClose}
          onResetInitSuccess={onResetInitSuccess}
          synapseApiBase={synapseApiBase}
        />

        <div className="relative flex min-h-0 flex-1">
        {showRoomBusyOverlay ? <MeetingBusyOverlay label={roomBusyOverlayLabel} /> : null}
        {/* 左栏：SOP 阶段 + 议题清单 */}
        <div className="w-[320px] bg-[color:var(--panel)] flex flex-col shrink-0 min-h-0 border-r border-border/60">
          {/* SOP Stage Navigator */}
          <div className="px-3 py-3 border-b border-border/40 bg-gradient-to-b from-muted/25 to-background/60 shrink-0">
            <div className="flex items-center justify-between gap-2 mb-2.5">
              <div className="flex items-center gap-1.5 min-w-0">
                <Layers className="w-3.5 h-3.5 text-foreground/70 shrink-0" />
                <span className="text-[11px] font-semibold text-foreground/90 tracking-wide">
                  SOP 流水线
                </span>
              </div>
              <span
                className={`shrink-0 rounded-md border px-1.5 py-0.5 text-[9px] font-bold tabular-nums ${
                  (STAGE_NAV_THEME[pipelineStageId] ?? DEFAULT_STAGE_THEME).badge
                }`}
              >
                {pipelineStageId}/{MEETING_PIPELINE_STAGES.length}
              </span>
            </div>
            <MeetingSopStageStepper
              viewStageId={effectiveViewStageId}
              pipelineStageId={pipelineStageId}
              roomCompleted={room.status === 'completed'}
              roomProcessing={room.status === 'processing'}
              onSelect={handleStageSelect}
            />
          </div>

          {/* 议题节点列表 */}
          <div className="flex-1 overflow-y-auto custom-scrollbar p-3 space-y-2">
            {stageNodes.map((node, idx) => {
              const state = getNodeStateGlobal(room, node.id, disabledSopNodeIds);
              const typeInfo = getSopNodeTypeInfo(node.type);
              const isSelected = resolvedSelectedNodeId === node.id;
              const isCurrentNode = node.id === room.currentNode;
              const isSkipped = state === 'skipped';
              const hasCornerAction =
                (canStopNodeRun && isCurrentNode) ||
                canReprocessHistoricalNode(node.id, node.type);

              return (
                <motion.div
                  key={node.id}
                  whileHover={isSkipped ? undefined : { x: 2 }}
                  onClick={() => {
                    selectSopNode(node.id);
                    if (node.id !== hitlTargetNodeId) setCenterTab('detail');
                  }}
                  className={`relative cursor-pointer rounded-xl px-3 pt-3 ${
                    hasCornerAction ? 'pb-8' : 'pb-3'
                  } border transition-all duration-200 ${
                    isSkipped
                      ? `rd-meeting-node-card--skipped${isSelected ? ' rd-meeting-node-card--skipped-selected' : ''}`
                      : isSelected
                        ? 'bg-blue-950/30 border-blue-700/60 shadow-[0_0_12px_rgba(59,130,246,0.1)]'
                        : state === 'error'
                          ? 'bg-red-950/20 border-red-900/40 hover:border-red-700/50'
                          : state === 'human_intervention'
                            ? 'bg-amber-950/20 border-amber-900/40 hover:border-amber-700/50'
                            : state === 'completed'
                              ? 'bg-emerald-950/10 border-emerald-900/30 hover:border-emerald-700/40'
                              : state === 'processing'
                                ? 'bg-blue-950/15 border-blue-900/30 hover:border-blue-700/50'
                                : state === 'stopped'
                                  ? 'bg-slate-900/25 border-slate-600/45 hover:border-slate-500/55'
                                  : 'bg-muted/40 border-border/50 hover:border-border'
                  }`}
                >
                  {canStopNodeRun && isCurrentNode ? (
                    <Tooltip title={room.stoppingRun ? '正在终止…' : '终止本节点运行'}>
                      <button
                        type="button"
                        disabled={Boolean(room.stoppingRun)}
                        aria-busy={room.stoppingRun}
                        className="rd-meeting-node-stop-btn absolute bottom-2 right-2 z-10 flex h-7 w-7 items-center justify-center rounded-full text-red-400 disabled:cursor-not-allowed disabled:opacity-60"
                        onClick={(e) => {
                          e.stopPropagation();
                          if (room.stoppingRun) return;
                          onStopRun?.();
                        }}
                      >
                        {room.stoppingRun ? (
                          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                        ) : (
                          <StopNodeRunIcon className="h-5 w-5" />
                        )}
                      </button>
                    </Tooltip>
                  ) : null}
                  {canReprocessHistoricalNode(node.id, node.type) && !room.reprocessingNodeId ? (
                    <Tooltip
                      title={
                        node.id === 'exception_check'
                          ? '重新执行代码提交与试飞（清理本节点及后续产出）'
                          : '跨节点重新处理（清理本节点至当前节点之间的过程数据后，从本节点重跑）'
                      }
                    >
                      <button
                        type="button"
                        className="rd-meeting-node-reprocess-btn absolute bottom-2 right-2 z-10 flex h-7 w-7 items-center justify-center rounded-full text-amber-400"
                        onClick={(e) => {
                          e.stopPropagation();
                          openReprocessModal(node.id);
                        }}
                      >
                        <CrossNodeReprocessIcon className="h-5 w-5" />
                      </button>
                    </Tooltip>
                  ) : null}
                  {/* Node Header Row：节点名 + 类型同一行，减少卡片高度 */}
                  <div className="flex items-center justify-between gap-2 mb-1.5">
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      <span className="text-[10px] font-mono text-muted-foreground/80 shrink-0">#{String(idx + 1).padStart(2, '0')}</span>
                      <div className="flex items-center gap-1.5 min-w-0">
                        {state === 'completed' && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />}
                        {state === 'skipped' && (
                          <Tooltip title="未开启，已跳过">
                            <SkipForward className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                          </Tooltip>
                        )}
                        {state === 'processing' && <Loader2 className="w-3.5 h-3.5 text-blue-400 animate-spin shrink-0" />}
                        {state === 'error' && <AlertCircle className="w-3.5 h-3.5 text-red-500 animate-pulse shrink-0" />}
                        {state === 'human_intervention' && <AlertTriangle className="w-3.5 h-3.5 text-amber-500 animate-pulse shrink-0" />}
                        {state === 'pending' && <CircleDashed className="w-3.5 h-3.5 text-muted-foreground/80 shrink-0" />}
                        {state === 'stopped' && <Square className="w-3.5 h-3.5 text-slate-400 shrink-0" />}
                        <span className={`text-xs font-medium truncate min-w-0 ${
                          isSelected ? 'text-blue-300' :
                          state === 'error' ? 'text-red-400' :
                          state === 'human_intervention' ? 'text-amber-400' :
                          state === 'processing' ? 'text-blue-300' :
                          state === 'stopped' ? 'text-slate-400' :
                          state === 'skipped' ? 'text-slate-400' :
                          state === 'completed' ? 'text-foreground/90' : 'text-muted-foreground'
                        }`}>
                          {node.name}
                        </span>
                        <span
                          className={`inline-flex items-center gap-[3px] rounded-full border px-1.5 py-[2px] shrink-0 ${typeInfo.bg} ${
                            isSkipped ? 'opacity-50 saturate-50' : ''
                          }`}
                        >
                          {(() => {
                            const TypeIcon = SOP_NODE_TYPE_ICON[node.type] ?? Zap;
                            return <TypeIcon className={`w-2.5 h-2.5 ${typeInfo.color}`} />;
                          })()}
                          <span className={`text-[9px] font-semibold leading-none tracking-wide ${typeInfo.color}`}>
                            {typeInfo.label}
                          </span>
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      {isSkipped && !isCurrentNode ? (
                        <span className="rd-meeting-node-card__skip-badge">已跳过</span>
                      ) : null}
                      {isCurrentNode ? (
                        <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-blue-900/40 border border-blue-700/50 text-blue-400 whitespace-nowrap">
                          当前
                        </span>
                      ) : null}
                    </div>
                  </div>

                  {/* 会议目标 */}
                  <p
                    className={`text-[10px] text-muted-foreground leading-relaxed line-clamp-2 ${
                      hasCornerAction ? 'pr-8' : ''
                    }`}
                  >
                    {node.desc}
                  </p>
                </motion.div>
              );
            })}
          </div>
        </div>

        {/* 中栏：节点详情 / 人工确认 */}
        <div className="flex-1 bg-background flex flex-col relative overflow-hidden min-h-0 min-w-0">
          <div className="h-14 border-b border-border/60 px-5 flex items-center justify-between bg-[color:var(--panel)] shrink-0">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setCenterTab('detail')}
                className={`${MEETING_TAB_BAR_HEIGHT} transition-all border ${
                  centerTab === 'detail'
                    ? 'bg-blue-500/15 border-blue-500/40 text-blue-300 shadow-[0_0_12px_rgba(59,130,246,0.18)]'
                    : 'bg-transparent border-transparent text-muted-foreground hover:text-foreground hover:bg-muted/40'
                }`}
              >
                <FileText className="w-4 h-4" />
                节点处理详情
                {selectedNode ? (
                  <span className="text-[10px] text-muted-foreground/70 font-mono">· {selectedNode.name}</span>
                ) : null}
              </button>
              <button
                type="button"
                onClick={() => hitlAvailable && setCenterTab('hitl')}
                disabled={!hitlAvailable}
                className={`${MEETING_TAB_BAR_HEIGHT} transition-all border relative ${
                  centerTab === 'hitl'
                    ? 'bg-amber-500/15 border-amber-500/45 text-amber-300 shadow-[0_0_14px_rgba(245,158,11,0.22)]'
                    : hitlAvailable
                      ? 'bg-transparent border-transparent text-amber-400 hover:bg-amber-500/10'
                      : 'bg-transparent border-transparent text-muted-foreground/40 cursor-not-allowed'
                }`}
              >
                <ClipboardCheck className="w-4 h-4" />
                人工确认
                {hitlAvailable ? (
                  <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-amber-500/25 text-amber-200 border border-amber-500/40">
                    {hitlBadgeText}
                  </span>
                ) : null}
                {hitlAvailable && centerTab !== 'hitl' ? (
                  <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-amber-400 animate-ping" />
                ) : null}
              </button>
            </div>
            <div className="flex items-center gap-2">
              {canRecover ? (
                <Tooltip title="恢复服务重启前的人工门控状态，不清理已产出内容">
                  <Button
                    type="primary"
                    disabled={Boolean(room.recoveringNodeId || room.reprocessingNodeId || room.stoppingRun)}
                    loading={room.recoveringNodeId === selectedNode?.id}
                    icon={<Undo2 className="w-4 h-4" />}
                    onClick={() => onRecover?.(selectedNode!.id)}
                    className={MEETING_TAB_BAR_ANT_BTN}
                  >
                    处理恢复
                  </Button>
                </Tooltip>
              ) : null}
              {canReprocess ? (
                <Button
                  type="primary"
                  danger={room.status === 'failed'}
                  disabled={Boolean(room.reprocessingNodeId || room.recoveringNodeId || room.stoppingRun)}
                  loading={room.reprocessingNodeId === selectedNode?.id}
                  icon={<RotateCw className="w-4 h-4" />}
                  onClick={() => selectedNode && openReprocessModal(selectedNode.id)}
                  className={MEETING_TAB_BAR_ANT_BTN}
                >
                  重新处理
                </Button>
              ) : null}
            </div>
          </div>

          {/* Tab Body */}
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
            {centerTab === 'hitl' && hitlAvailable && interventionPanel === 'prod_selection' ? (
              <div className="min-h-0 flex-1 overflow-y-auto custom-scrollbar">
                <MeetingProdSelectionPanel
                  synapseApiBase={synapseApiBase || ''}
                  roomId={room.id}
                  onSubmitted={(detail) => {
                    setCenterTab('detail');
                    onProdSubmitted?.(detail);
                  }}
                />
              </div>
            ) : centerTab === 'hitl' && hitlAvailable && interventionPanel === 'auto_split_choice' ? (
              <div className="min-h-0 flex-1 overflow-y-auto custom-scrollbar">
                <MeetingAutoSplitChoicePanel
                  synapseApiBase={synapseApiBase || ''}
                  roomId={room.id}
                  payload={room.autoSplitChoicePayload ?? null}
                  onSubmitted={() => setCenterTab('detail')}
                />
              </div>
            ) : centerTab === 'hitl' && hitlAvailable && interventionPanel === 'task_exec' ? (
              <div className="min-h-0 flex-1 overflow-hidden">
                <TaskExecReviewPanel
                  synapseApiBase={synapseApiBase || ''}
                  roomId={room.id}
                  scopeId={room.scopeId}
                  nodeId={cliExecNodeId}
                  initialPayload={room.taskExecPayload ?? null}
                  blocked={room.taskExecBlocked}
                  onDecided={() => setCenterTab('detail')}
                />
              </div>
            ) : centerTab === 'hitl' && hitlAvailable && interventionPanel === 'func_solution_review' ? (
              <div className="min-h-0 flex-1 overflow-hidden">
                <FuncSolutionReviewPanel
                  synapseApiBase={synapseApiBase || ''}
                  roomId={room.id}
                  scopeId={room.scopeId}
                  initialPayload={room.funcSolutionReviewPayload ?? null}
                  blocked={room.funcSolutionBlocked}
                  onDecided={() => setCenterTab('detail')}
                />
              </div>
            ) : centerTab === 'hitl' && hitlAvailable && interventionPanel === 'solution_review' ? (
              <div className="min-h-0 flex-1 overflow-hidden">
                <SolutionReviewPanel
                  synapseApiBase={synapseApiBase || ''}
                  roomId={room.id}
                  scopeId={room.scopeId}
                  initialPayload={room.solutionReviewPayload ?? null}
                  blocked={room.solutionReviewBlocked}
                  onDecided={() => setCenterTab('detail')}
                />
              </div>
            ) : centerTab === 'hitl' && hitlAvailable && interventionPanel === 'node_review' ? (
              <div className="min-h-0 flex-1 overflow-hidden">
                <NodeReviewPanel
                  synapseApiBase={synapseApiBase || ''}
                  roomId={room.id}
                  nodeId={room.currentNode}
                  initialPayload={room.reviewPayload ?? null}
                  onDecided={() => setCenterTab('detail')}
                />
              </div>
            ) : centerTab === 'hitl' && hitlAvailable && interventionPanel === 'hitl' && room.hitlFormSchema ? (
              <div className="h-full min-h-0 overflow-y-auto custom-scrollbar bg-[color:var(--panel)] p-6">
                <div className="max-w-[920px] mx-auto">
                  <MeetingHitlForm
                    key={`hitl-${room.id}-${room.hitlFormSchema.title ?? ''}-${room.hitlFormSchema.questions?.length ?? 0}`}
                    schema={room.hitlFormSchema}
                    summaryMarkdown={
                      room.hitlPendingSummary ??
                      room.hitlFormSchema.summary_markdown ??
                      undefined
                    }
                    submitLabel="提交并继续处理"
                    onSubmit={(values) => {
                      setCenterTab('detail');
                      onHitlSubmit?.(serializeHitlFormSubmission(values), values);
                    }}
                  />
                </div>
              </div>
            ) : selectedNode ? (
              (() => {
                const selectedNodeState = getNodeStateGlobal(room, selectedNode.id, disabledSopNodeIds);
                const detailViewMode = resolveNodeDetailViewMode(
                  selectedNodeState,
                  selectedNode.id,
                  selectedNode.type,
                );
                const typeInfo = getSopNodeTypeInfo(selectedNode.type);

                return (
                  <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
                    {/* Node sub-header（节点名 / 状态） */}
                    <div
                      className={`shrink-0 border-b px-6 pb-3 pt-4 ${
                        selectedNodeState === 'skipped'
                          ? 'border-slate-700/25 bg-slate-900/15 opacity-75 saturate-50'
                          : 'border-border/40 bg-[color:var(--panel)]/40'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <div className={`rounded-lg p-2 ${
                          selectedNodeState === 'skipped'
                            ? 'bg-slate-500/15 text-slate-400'
                            : selectedNode.type.includes('ai')
                              ? 'bg-blue-500/20 text-blue-400'
                              : selectedNode.type === 'system'
                                ? 'bg-muted/20 text-muted-foreground'
                                : 'bg-amber-500/20 text-amber-500'
                        }`}>
                          {selectedNode.type.includes('ai') ? <Bot className="h-5 w-5" /> :
                           selectedNode.type === 'system' ? <TerminalSquare className="h-5 w-5" /> :
                           <User className="h-5 w-5" />}
                        </div>
                        <div>
                          <h3 className="flex items-center gap-2.5 text-base font-semibold text-foreground">
                            {selectedNode.name}
                            {selectedNode.id === room.currentNode ? (
                              <Badge
                                status={room.status === 'human_intervention' ? 'error' : 'processing'}
                                text={
                                  <span className={`text-xs ${room.status === 'human_intervention' ? 'text-red-400' : 'text-blue-400'}`}>
                                    {room.status === 'human_intervention' ? '等待人工干预' : '智能体处理中'}
                                  </span>
                                }
                              />
                            ) : selectedNodeState === 'completed' ? (
                              <Badge status="success" text={<span className="text-xs text-green-400">已完成</span>} />
                            ) : selectedNodeState === 'skipped' ? (
                              <Badge status="default" text={<span className="text-xs text-slate-400">未开启</span>} />
                            ) : selectedNodeState === 'pending' ? (
                              <Badge status="default" text={<span className="text-xs text-muted-foreground">待执行</span>} />
                            ) : null}
                          </h3>
                          <p className="mt-0.5 text-[10px] text-muted-foreground">{selectedNode.desc}</p>
                        </div>
                      </div>
                    </div>

                    {detailViewMode === 'skipped' ? (
                      <SkippedNodeDetailPanel nodeName={selectedNode.name} />
                    ) : detailViewMode === 'review' &&
                      (selectedNode.id === 'task_exec' || selectedNode.id === 'diff_analysis') ? (
                      <div className="min-h-0 flex-1 overflow-hidden">
                        <TaskExecReviewPanel
                          key={`detail-te-${room.id}-${selectedNode.id}`}
                          synapseApiBase={synapseApiBase || ''}
                          roomId={room.id}
                          scopeId={room.scopeId}
                          nodeId={selectedNode.id === 'diff_analysis' ? 'diff_analysis' : 'task_exec'}
                          initialPayload={room.taskExecPayload ?? null}
                          blocked={room.taskExecBlocked}
                        />
                      </div>
                    ) : (selectedNode.id === 'task_exec' || selectedNode.id === 'diff_analysis') &&
                      (selectedNodeState === 'processing' || room.status === 'processing') ? (
                      <div className="min-h-0 flex-1 overflow-hidden">
                        <TaskExecReviewPanel
                          key={`detail-te-live-${room.id}-${selectedNode.id}`}
                          synapseApiBase={synapseApiBase || ''}
                          roomId={room.id}
                          scopeId={room.scopeId}
                          nodeId={selectedNode.id === 'diff_analysis' ? 'diff_analysis' : 'task_exec'}
                          initialPayload={room.taskExecPayload ?? null}
                          blocked={room.taskExecBlocked}
                          live
                        />
                      </div>
                    ) : detailViewMode === 'review' && selectedNode.id === 'solution_review' ? (
                      <div className="min-h-0 flex-1 overflow-hidden">
                        <SolutionReviewPanel
                          key={`detail-sr-${room.id}`}
                          synapseApiBase={synapseApiBase || ''}
                          roomId={room.id}
                          scopeId={room.scopeId}
                          blocked={room.solutionReviewBlocked}
                        />
                      </div>
                    ) : detailViewMode === 'review' && selectedNode.id === 'func_solution' ? (
                      <div className="min-h-0 flex-1 overflow-hidden">
                        <FuncSolutionReviewPanel
                          key={`detail-fs-${room.id}`}
                          synapseApiBase={synapseApiBase || ''}
                          roomId={room.id}
                          scopeId={room.scopeId}
                          initialPayload={room.funcSolutionReviewPayload ?? null}
                          blocked={room.funcSolutionBlocked}
                          readOnly
                        />
                      </div>
                    ) : detailViewMode === 'review' ? (
                      <div className="min-h-0 flex-1 overflow-hidden">
                        <NodeReviewPanel
                          key={`detail-${room.id}-${selectedNode.id}`}
                          synapseApiBase={synapseApiBase || ''}
                          roomId={room.id}
                          nodeId={selectedNode.id}
                          readOnly
                          title="节点处理详情"
                        />
                      </div>
                    ) : (
                      <div className="min-h-0 flex-1 overflow-hidden p-5">
                        <MeetingNodeDetailPanel
                          synapseApiBase={synapseApiBase || ''}
                          roomId={room.id}
                          scopeType={room.scopeType}
                          scopeId={room.scopeId}
                          nodeId={selectedNode.id}
                          nodeName={selectedNode.name}
                          nodeState={toMeetingNodeVisualState(selectedNodeState)}
                          liveSystemDisplay={
                            selectedNode.id === 'exception_check' ? room.systemNodeDisplay ?? null : null
                          }
                          pollMs={
                            selectedNodeState === 'processing' ||
                            (room.runInProgress &&
                              selectedNode.id === 'exception_check' &&
                              selectedNode.id === room.currentNode)
                              ? selectedNode.id === 'exception_check'
                                ? 2500
                                : 4000
                              : 0
                          }
                        />
                      </div>
                    )}
                  </div>
                );
              })()
            ) : (
              <div className="flex flex-col items-center justify-center h-full text-muted-foreground/80">
                <CircleDashed className="w-12 h-12 mb-3 opacity-30" />
                <p className="text-sm">请从左侧选择议题节点</p>
              </div>
            )}
          </div>
        </div>

        {/* 右栏：协作会议流 */}
        <div className="w-[440px] flex flex-col min-h-0 bg-[color:var(--panel)] shrink-0 border-l border-border/60">
          <div className="h-14 shrink-0 flex items-center border-b border-border/60 px-4 bg-gradient-to-b from-muted/25 to-background/60">
            <div className="flex items-center gap-3 min-w-0 w-full">
              <div className="flex items-center gap-1.5 shrink-0">
                <MessageSquare className="w-3.5 h-3.5 text-violet-400 shrink-0" />
                <span className="text-[11px] font-semibold text-foreground/90 tracking-wide whitespace-nowrap">
                  协作会议流
                </span>
              </div>
              <span className="h-4 w-px bg-border/50 shrink-0" aria-hidden />
              <div className="flex flex-1 items-center gap-1.5 min-w-0 overflow-x-auto [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                <Avatar size="small" className="bg-muted text-[9px] ring-2 ring-background shrink-0">我</Avatar>
                {displayAgents.map((a) => (
                  <MeetingAgentAvatar
                    key={a.id}
                    agent={a}
                    size="small"
                    showStatusBadge={false}
                    showHoverName
                    onClick={() => openAgentContext(a)}
                  />
                ))}
              </div>
            </div>
          </div>

          {/* Chat Logs */}
          <div className="flex-1 overflow-y-auto px-4 py-4 custom-scrollbar scroll-smooth">
            <div className="rd-meeting-chat-stream">
              {displayChatLogs.length === 0 ? <MeetingChatEmpty /> : null}
              {displayChatLogs.map((log, index) => {
                const agent = resolveLogAgent(displayAgents, log.agentId, log);
                const speaker = resolveChatSpeakerName(
                  log,
                  agent?.name || resolveSpeakerName(room, log.agentId),
                );
                const showAvatar = shouldShowChatAvatar(log);
                const avatarAgent =
                  agent ??
                  (log.speakerRole === 'worker'
                    ? stubWorkerAgent(log.agentId, speaker)
                    : undefined);
                return (
                  <motion.div
                    key={log.id || `log-${index}`}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.22 }}
                  >
                    <MeetingChatMessage
                      log={log}
                      speakerName={speaker}
                      agent={showAvatar ? avatarAgent : undefined}
                      showAvatar={showAvatar}
                      roomId={room.id}
                      scopeId={room.scopeId}
                      synapseApiBase={synapseApiBase || ''}
                      onAvatarClick={
                        showAvatar && avatarAgent && log.speakerRole !== 'system'
                          ? () => openAgentContext(avatarAgent)
                          : undefined
                      }
                    />
                  </motion.div>
                );
              })}
            </div>
            <div ref={logsEndRef} className="h-2" />
          </div>
        </div>

        </div>
      </div>

      <MeetingAgentContextDrawer
        open={contextOpen}
        onClose={() => setContextOpen(false)}
        synapseApiBase={synapseApiBase || ''}
        roomId={room.id}
        agent={contextAgent}
      />

      <Modal
        title="重新处理"
        open={reprocessModalOpen}
        onCancel={() => {
          setReprocessModalOpen(false);
          setReprocessTargetNodeId(null);
          setReprocessReason('');
        }}
        onOk={confirmReprocess}
        okText="开始重新处理"
        cancelText="取消"
        okButtonProps={{ disabled: Boolean(room.reprocessingNodeId || room.stoppingRun) }}
        destroyOnClose
        centered
        width={520}
      >
        <p className="text-sm text-muted-foreground mb-3">
          将清理目标节点的过程数据后从节点初始化重跑。可填写本次重处理的原因与处理要求，系统会一次性注入智能体提示词。
        </p>
        <Input.TextArea
          value={reprocessReason}
          onChange={(e) => setReprocessReason(e.target.value)}
          placeholder="例如：上次遗漏了 XX 模块边界，请重新梳理并补充接口契约…（可选）"
          autoSize={{ minRows: 4, maxRows: 10 }}
          disabled={Boolean(room.reprocessingNodeId || room.stoppingRun)}
          className="!bg-black/30 !text-foreground !border-border/60"
        />
      </Modal>
    </Modal>
  );
};

export const MeetingRoomBoard = ({ synapseApiBase }: { synapseApiBase?: string }) => {
  const antDark = useAntThemeDark();
  const [rooms, setRooms] = useState<MeetingRoom[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [activeRoom, setActiveRoom] = useState<MeetingRoom | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogViewNodeId, setDialogViewNodeId] = useState<string | undefined>();
  const [configOpen, setConfigOpen] = useState(false);
  const [roomConfig, setRoomConfig] = useState<MeetingRoomConfigPayload | null>(null);
  const [agentProfiles, setAgentProfiles] = useState<Map<string, MeetingAgentProfileWire>>(
    () => new Map(),
  );
  const configOpenPrev = useRef(false);
  const roomsRef = useRef<MeetingRoom[]>([]);
  roomsRef.current = rooms;

  const loadMeetingConfig = useCallback(async () => {
    const base = (synapseApiBase || '').trim();
    if (!base) {
      setRoomConfig(null);
      setAgentProfiles(new Map());
      return;
    }
    try {
      const [cfg, profilesRes] = await Promise.all([
        fetchMeetingRoomConfig(base),
        fetch(`${base}/api/agents/profiles?include_hidden=true`).then((r) => r.json()),
      ]);
      setRoomConfig(cfg);
      setAgentProfiles(profilesToMap((profilesRes?.profiles as MeetingAgentProfileWire[]) || []));
    } catch {
      /* 配置拉取失败时卡片仍用 API 参会人兜底 */
    }
  }, [synapseApiBase]);

  useEffect(() => {
    void loadMeetingConfig();
  }, [loadMeetingConfig]);

  useEffect(() => {
    if (configOpenPrev.current && !configOpen) void loadMeetingConfig();
    configOpenPrev.current = configOpen;
  }, [configOpen, loadMeetingConfig]);

  const rosterForRoom = useCallback(
    (room: MeetingRoom): RoomAgent[] => {
      const configured = buildConfiguredRoomRoster(room.currentNode, roomConfig, agentProfiles, {
        roomStatus: room.status,
        liveById: liveAgentsById(room.agents),
      });
      if (roomConfig) return configured;
      return room.agents.length > 0 ? room.agents : configured;
    },
    [roomConfig, agentProfiles],
  );
  const reloadRooms = useCallback(async (options?: { silent?: boolean }) => {
    const silent = options?.silent ?? false;
    const base = (synapseApiBase || '').trim();
    if (!base) {
      if (!silent) {
        setLoadError('未配置 Synapse API 地址');
        setRooms([]);
      }
      return;
    }
    if (!silent) {
      setLoading(true);
      setLoadError(null);
    }
    try {
      const list = await fetchMeetingRooms(base);
      setRooms((prev) => mergeListRoomsWithExisting(list.map(mapListItemToRoom), prev));
      if (silent) setLoadError(null);
    } catch (e) {
      if (!silent) {
        setLoadError(e instanceof Error ? e.message : String(e));
        setRooms([]);
      }
    } finally {
      if (!silent) setLoading(false);
    }
  }, [synapseApiBase]);

  const hydrateBoardNodeChats = useCallback(async () => {
    const base = (synapseApiBase || '').trim();
    const snapshot = roomsRef.current;
    if (!base || snapshot.length === 0) return;

    await Promise.all(
      snapshot.map(async (room) => {
        const nodeId = (room.currentNode || '').trim();
        if (!nodeId || !roomCardLogsNeedHydrate(room)) return;
        try {
          const payload = await fetchMeetingRoomNodeChat(base, room.id, nodeId);
          const nodeLogs = (payload.chat_logs || []).map(mapChatWireToLog);
          if (!nodeLogs.length) return;
          setRooms((prev) =>
            prev.map((item) => {
              if (item.id !== room.id) return item;
              const merged = replaceNodeChatLogs(item.allChatLogs ?? item.logs, nodeId, nodeLogs);
              return {
                ...item,
                allChatLogs: merged,
                logs: filterLogsForNodeExact(merged, item.currentNode),
              };
            }),
          );
        } catch {
          /* 节点 chat 拉取失败时保留 live 增量 */
        }
      }),
    );
  }, [synapseApiBase]);

  const pollBoardLive = useCallback(async () => {
    const base = (synapseApiBase || '').trim();
    const snapshot = roomsRef.current;
    if (!base || snapshot.length === 0) return;

    const patches = await Promise.all(
      snapshot.map(async (room) => {
        try {
          const live = await fetchMeetingRoomLive(base, room.id);
          return { id: room.id, live };
        } catch {
          return null;
        }
      }),
    );

    setRooms((prev) =>
      prev.map((room) => {
        const hit = patches.find((patch) => patch?.id === room.id);
        return hit ? applyLivePatch(room, hit.live) : room;
      }),
    );
    window.setTimeout(() => {
      void hydrateBoardNodeChats();
    }, 0);
  }, [synapseApiBase, hydrateBoardNodeChats]);

  useEffect(() => {
    void reloadRooms();
  }, [reloadRooms]);

  useEffect(() => {
    if (dialogOpen) return;
    const base = (synapseApiBase || '').trim();
    if (!base) return;
    const timer = window.setInterval(() => {
      void reloadRooms({ silent: true });
    }, LIST_AUTO_REFRESH_MS);
    return () => window.clearInterval(timer);
  }, [dialogOpen, synapseApiBase, reloadRooms]);

  useEffect(() => {
    if (dialogOpen) return;
    const base = (synapseApiBase || '').trim();
    if (!base || rooms.length === 0) return;

    void pollBoardLive();
    void hydrateBoardNodeChats();

    const timer = window.setInterval(() => {
      void pollBoardLive();
    }, LIST_LIVE_POLL_MS);
    return () => window.clearInterval(timer);
  }, [dialogOpen, synapseApiBase, rooms.length, pollBoardLive, hydrateBoardNodeChats]);

  useEffect(() => {
    if (!dialogOpen || !activeRoom?.id) return;
    const base = (synapseApiBase || '').trim();
    if (!base) return;
    const roomId = activeRoom.id;
    const viewNodeId = (dialogViewNodeId || '').trim() || undefined;
    const poll = () => {
      void fetchMeetingRoomLive(base, roomId, viewNodeId)
        .then((live) => {
          setActiveRoom((prev) => {
            if (!prev || prev.id !== roomId) return prev;
            const merged = applyLivePatch(prev, live);
            return merged;
          });
          if (!viewNodeId) {
            setRooms((prev) =>
              prev.map((r) => (r.id === roomId ? applyLivePatch(r, live) : r)),
            );
          }
        })
        .catch(() => {
          /* 轮询失败静默，避免打断会中操作 */
        });
    };
    poll();
    const timer = window.setInterval(poll, 3000);
    return () => window.clearInterval(timer);
  }, [dialogOpen, activeRoom?.id, dialogViewNodeId, synapseApiBase]);

  useEffect(() => {
    const focus = consumeMeetingRoomFocus();
    if (!focus?.roomId) return;
    const base = (synapseApiBase || '').trim();
    if (!base) return;
    void fetchMeetingRoomDetail(base, focus.roomId)
      .then((detail) => {
        const merged = mapDetailToRoom(detail);
        const focusScopeId = (focus.scopeId || '').trim();
        if (focusScopeId && merged.scopeId !== focusScopeId) {
          return;
        }
        setActiveRoom(merged);
        setDialogOpen(true);
        setRooms((prev) => {
          const scopeKey = meetingRoomScopeKey(merged);
          const rest = prev.filter((r) => meetingRoomScopeKey(r) !== scopeKey);
          return dedupeMeetingRooms([merged, ...rest]);
        });
      })
      .catch(() => {
        /* 列表刷新后用户可手动点开 */
      });
  }, [synapseApiBase]);

  const humanCount = rooms.filter((r) => r.status === 'human_intervention').length;
  const processingCount = rooms.filter((r) => r.status === 'processing').length;

  const patchMeetingRoomState = useCallback((roomId: string, patch: Partial<MeetingRoom>) => {
    setActiveRoom((prev) => (prev && prev.id === roomId ? { ...prev, ...patch } : prev));
    setRooms((prev) => prev.map((r) => (r.id === roomId ? { ...r, ...patch } : r)));
  }, []);

  const handleOpenRoom = (room: MeetingRoom) => {
    const base = (synapseApiBase || '').trim();
    setActiveRoom(room);
    setDialogOpen(true);
    if (!base || !room.id) return;
    void fetchMeetingRoomDetail(base, room.id)
      .then((detail) => {
        const merged = mapDetailToRoom(detail);
        setActiveRoom(merged);
        setRooms((prev) =>
          dedupeMeetingRooms(prev.map((r) => (meetingRoomScopeKey(r) === meetingRoomScopeKey(merged) ? merged : r))),
        );
      })
      .catch(() => {
        /* 保留列表态数据 */
      });
  };

  const handleProdSubmitted = (detail: MeetingRoomDetail) => {
    const updatedRoom = mapDetailToRoom(detail);
    setActiveRoom(updatedRoom);
    setRooms((prev) => prev.map((r) => (r.id === updatedRoom.id ? updatedRoom : r)));
  };

  const handleHitlSubmit = (text: string, values: HitlFormValues) => {
    if (!activeRoom) return;
    const base = (synapseApiBase || '').trim();
    if (!base) return;

    void interveneMeetingRoom(base, activeRoom.id, text, 'instruction', {
      resumeRun: true,
      formValues: values,
    })
      .then((detail) => {
        const updatedRoom = mapDetailToRoom(detail);
        updatedRoom.brief = Boolean(detail.room_state?.hitl_locked)
          ? '表单已提交并锁定，系统正在继续处理…'
          : updatedRoom.brief;
        setActiveRoom(updatedRoom);
        setRooms((prev) => prev.map((r) => (r.id === updatedRoom.id ? updatedRoom : r)));
        if ((detail as { resume_run_started?: boolean }).resume_run_started) {
          toast.success('已提交，后台已继续执行当前节点');
        }
      })
      .catch((e) => {
        toast.error(e instanceof Error ? e.message : String(e));
      });
  };

  const handleMergeNodeChat = useCallback((nodeId: string, logs: LogEntry[]) => {
    const apply = (room: MeetingRoom): MeetingRoom => {
      const merged = replaceNodeChatLogs(room.allChatLogs ?? room.logs, nodeId, logs);
      return {
        ...room,
        allChatLogs: merged,
        logs: filterLogsForNodeExact(merged, room.currentNode),
      };
    };
    setActiveRoom((prev) => {
      if (!prev) return prev;
      const next = apply(prev);
      setRooms((rooms) => rooms.map((r) => (r.id === prev.id ? next : r)));
      return next;
    });
  }, []);

  const handleReprocess = (nodeId: string, reason?: string) => {
    if (!activeRoom || activeRoom.reprocessingNodeId || activeRoom.stoppingRun) return;
    const base = (synapseApiBase || '').trim();
    if (!base) return;

    const roomId = activeRoom.id;
    const chatEpoch = Date.now();
    const cleared = replaceNodeChatLogs(activeRoom.allChatLogs ?? activeRoom.logs, nodeId, []);
    patchMeetingRoomState(roomId, {
      reprocessingNodeId: nodeId,
      status: 'processing',
      runInProgress: true,
      interventionKind: null,
      interventionPanel: null,
      hitlFormSchema: null,
      hitlLocked: false,
      hitlSubmission: null,
      hitlPendingSummary: null,
      reviewPayload: null,
      allChatLogs: cleared,
      logs: filterLogsForNodeExact(cleared, activeRoom.currentNode),
      chatEpoch,
    });
    void reprocessMeetingRoom(base, roomId, nodeId, reason)
      .then((detail) => {
        const updatedRoom = mapDetailToRoom(detail);
        updatedRoom.brief = '正在重新处理节点…';
        updatedRoom.chatEpoch = chatEpoch;
        // 保留乐观清空的协作流；新事件由 live 轮询 / chatEpoch 拉取补齐
        updatedRoom.allChatLogs = cleared;
        updatedRoom.logs = filterLogsForNodeExact(cleared, updatedRoom.currentNode);
        updatedRoom.reprocessingNodeId = null;
        setActiveRoom(updatedRoom);
        setRooms((prev) => prev.map((r) => (r.id === updatedRoom.id ? updatedRoom : r)));
        toast.success('已清理过程数据，正在从节点初始化重跑');
      })
      .catch((e) => {
        patchMeetingRoomState(roomId, { reprocessingNodeId: null });
        const msg = e instanceof Error ? e.message : String(e);
        if (msg.includes('cross_stage_reprocess_forbidden')) {
          toast.error('不允许跨阶段重新处理');
        } else if (msg.includes('code_commit_reprocess_invalid')) {
          toast.error('当前流程尚未到达代码提交节点，无法重处理');
        } else if (msg.includes('system_node') && !msg.includes('code_commit')) {
          toast.error('该系统节点不允许重新处理');
        } else if (msg.includes('invalid_reprocess_target')) {
          toast.error('只能重新处理当前阶段内已完成的历史节点');
        } else if (msg.includes('room_completed')) {
          toast.error('会议室已结束，无法重新处理');
        } else {
          toast.error(msg);
        }
      });
  };

  const handleRecover = (nodeId: string) => {
    if (!activeRoom) return;
    const base = (synapseApiBase || '').trim();
    if (!base) return;

    setActiveRoom((prev) =>
      prev ? { ...prev, recoveringNodeId: nodeId, status: 'human_intervention' } : prev,
    );
    void recoverMeetingRoom(base, activeRoom.id, nodeId)
      .then((detail) => {
        const updatedRoom = mapDetailToRoom(detail);
        updatedRoom.brief = '已恢复人工门控，可继续处理';
        updatedRoom.recoveringNodeId = null;
        setActiveRoom(updatedRoom);
        setRooms((prev) => prev.map((r) => (r.id === updatedRoom.id ? updatedRoom : r)));
        toast.success('已恢复服务重启前的人工处理状态');
      })
      .catch((e) => {
        setActiveRoom((prev) =>
          prev ? { ...prev, recoveringNodeId: null, status: 'stopped' } : prev,
        );
        const msg = e instanceof Error ? e.message : String(e);
        if (msg.includes('agent_still_running')) {
          toast.error('重启前智能体仍在执行，请使用「重新处理」');
        } else if (msg.includes('not_server_restart')) {
          toast.error('仅服务重启导致的停止可恢复处理');
        } else if (msg.includes('no_gate_state')) {
          toast.error('缺少可恢复的人工门控状态');
        } else {
          toast.error(msg);
        }
      });
  };

  const handleResetInitSuccess = useCallback(
    (roomId: string) => {
      setDialogOpen(false);
      setActiveRoom(null);
      setRooms((prev) => prev.filter((r) => r.id !== roomId));
      void reloadRooms({ silent: true });
    },
    [reloadRooms],
  );

  const handleStopRun = () => {
    if (!activeRoom || activeRoom.stoppingRun || activeRoom.reprocessingNodeId) return;
    const base = (synapseApiBase || '').trim();
    if (!base) return;
    const roomId = activeRoom.id;
    patchMeetingRoomState(roomId, { stoppingRun: true });
    void stopMeetingRoom(base, roomId)
      .then((detail) => {
        const updatedRoom = mapDetailToRoom(detail);
        updatedRoom.brief = '已终止当前节点运行';
        updatedRoom.stoppingRun = false;
        setActiveRoom(updatedRoom);
        setRooms((prev) => prev.map((r) => (r.id === updatedRoom.id ? updatedRoom : r)));
        toast.success('已终止当前节点运行');
      })
      .catch((e) => {
        patchMeetingRoomState(roomId, { stoppingRun: false });
        toast.error(e instanceof Error ? e.message : String(e));
      });
  };

  return (
    <ConfigProvider theme={{ algorithm: antDark ? theme.darkAlgorithm : theme.defaultAlgorithm }}>
      <div className="rdMeetingRoot flex flex-col h-full w-full bg-background text-foreground overflow-hidden font-sans">
        
        {/* Header */}
        <div className="h-16 px-8 flex items-center justify-between border-b border-border/60 bg-[color:var(--panel)]/80 backdrop-blur-md z-10 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-indigo-500/20 border border-indigo-500/30 flex items-center justify-center text-indigo-400 shadow-[0_0_15px_rgba(99,102,241,0.2)]">
              <Users className="w-4 h-4" />
            </div>
            <div>
              <h1 className="text-base font-semibold text-foreground tracking-wide">多智能体研发会议室</h1>
              <p className="text-[10px] text-muted-foreground mt-0.5">实时监控、干预多个工单阶段的 AI 协作过程</p>
            </div>
          </div>
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-2 bg-red-950/30 px-3 py-1.5 rounded-full border border-red-900/50">
              <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse shadow-[0_0_8px_rgba(239,68,68,0.8)]" />
              <span className="text-xs text-red-700 dark:text-red-200 font-medium">{humanCount} 会议待介入</span>
            </div>
            <div className="flex items-center gap-2 bg-blue-950/30 px-3 py-1.5 rounded-full border border-blue-900/50">
              <span className="w-2 h-2 rounded-full bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.8)]" />
              <span className="text-xs text-blue-700 dark:text-blue-200 font-medium">{processingCount} 会议进行中</span>
            </div>
            <Button size="small" icon={<Settings2 className="h-3.5 w-3.5" />} onClick={() => setConfigOpen(true)}>
              阵容配置
            </Button>
            <Button size="small" onClick={() => void reloadRooms()} loading={loading}>
              刷新
            </Button>
          </div>
        </div>

        {/* Board Grid */}
        <div className="flex-1 overflow-y-auto p-8 custom-scrollbar relative">
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-indigo-900/10 via-background/0 to-background/0 pointer-events-none" />
          {loadError ? (
            <div className="relative z-10 text-center text-red-400 text-sm py-12">{loadError}</div>
          ) : null}
          {!loadError && !loading && rooms.length === 0 ? (
            <div className="relative z-10 text-center text-muted-foreground text-sm py-12 max-w-lg mx-auto">
              暂无活跃会议室。请在 work 目录下为工单创建 dev.status，或调用开会接口。
            </div>
          ) : null}
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6 max-w-[1600px] mx-auto relative z-10">
            <AnimatePresence>
              {rooms.map((room) => (
                <RoomCard
                  key={meetingRoomScopeKey(room)}
                  room={room}
                  onClick={handleOpenRoom}
                />
              ))}
            </AnimatePresence>
          </div>
        </div>

        {/* Intervention Dialog */}
        <InterventionDialog
          room={activeRoom}
          open={dialogOpen}
          onClose={() => {
            setDialogOpen(false);
            setDialogViewNodeId(undefined);
          }}
          onViewNodeChange={setDialogViewNodeId}
          onHitlSubmit={handleHitlSubmit}
          onReprocess={handleReprocess}
          onRecover={handleRecover}
          onStopRun={handleStopRun}
          onMergeNodeChat={handleMergeNodeChat}
          onProdSubmitted={handleProdSubmitted}
          onResetInitSuccess={handleResetInitSuccess}
          synapseApiBase={synapseApiBase}
        />

        <MeetingRoomConfigDrawer
          open={configOpen}
          onClose={() => setConfigOpen(false)}
          synapseApiBase={synapseApiBase || ''}
        />
        
      </div>
    </ConfigProvider>
  );
};