/**
 * 方案评审面板：一次性完成评审（补丁选择 + 小鲸评分 + 产出物预览 + 拆单预览 + 人工意见）
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Button,
  Input,
  Progress,
  Tag,
  Tooltip,
  Typography,
  message,
} from 'antd';
import {
  CheckCircle2,
  FileText,
  GitBranch,
  Loader2,
  Package,
  Plus,
  Shield,
  Sparkles,
  XCircle,
} from 'lucide-react';

import {
  fetchPatchVersions,
  fetchSolutionReview,
  saveSolutionReviewTasks,
  submitSolutionReviewDecision,
  MAX_SPLIT_TASKS,
  type DemandFunctionItem,
  type PatchVersionItem,
  type SolutionReviewPayload,
  type SplitTaskDraft,
  type SolutionReviewRepoRow,
} from '../../../api/meetingRoomService';
import { ImpactAssessmentPanel } from './ImpactAssessmentPanel';
import {
  buildDemandFunctionRows,
  DemandFunctionMatrix,
  normalizeSplitTasksFromPayload,
  resolveDemandFunctionsForPanel,
  repoBranchId,
  SplitTaskEditorCard,
  validateFunctionPointAssignment,
} from './SolutionReviewSplitForms';
import {
  SearchableVirtualSelect,
  type SearchableOption,
} from '@/components/product/SearchableVirtualSelect';
import { ReviewMarkdown } from './ReviewMarkdown';
import { Stage2ArtifactsPanel } from './Stage2ArtifactsPanel';

const { TextArea } = Input;
const { Text } = Typography;

const MIN_HUMAN_REVIEW_COMMENT_LEN = 50;

interface Props {
  synapseApiBase: string;
  roomId: string;
  scopeId?: string;
  initialPayload?: SolutionReviewPayload | null;
  blocked?: boolean;
  onDecided?: () => void;
}

const SEVERITY_COLOR: Record<string, string> = {
  high: 'red',
  medium: 'orange',
  low: 'blue',
  info: 'default',
};

const SCORE_DIMENSION_LABEL: Record<string, string> = {
  reliability: '可靠性',
  security: '安全性',
  consistency: '需求一致性',
  entropy_compliance: '控熵合规',
};

const SEVERITY_LABEL: Record<string, string> = {
  high: '高',
  medium: '中',
  low: '低',
  info: '信息',
};

const VERDICT_LABEL: Record<string, string> = {
  pass: '通过',
  conditional_pass: '有条件通过',
  fail: '不通过',
  reject: '不通过',
};

function scoreDimensionLabel(key: string): string {
  const k = key.trim();
  return SCORE_DIMENSION_LABEL[k] ?? k.replace(/_/g, ' ');
}

function formatScoreBreakdownValue(value: unknown): string {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return `${Math.round(value)} 分`;
  }
  return String(value ?? '—');
}

function isUnnamedBranch(name: string): boolean {
  const n = name.trim();
  return !n || n === '未命名分支' || n === '—';
}

function repoNameFromUrl(repoUrl: string): string {
  const url = repoUrl.trim();
  if (!url) return '';
  const tail = url.split('/').pop() || '';
  return tail.replace(/\.git$/i, '').trim();
}

function repoDisplayLabel(row: SolutionReviewRepoRow): string {
  const mod = (row.product_module_name || '').trim();
  const branch = (row.branch_version_name || '').trim();
  const urlName = repoNameFromUrl(row.repo_url || '');
  if (mod && branch && !isUnnamedBranch(branch)) return `${mod} · ${branch}`;
  if (mod) return mod;
  if (urlName) return urlName;
  if (branch && !isUnnamedBranch(branch)) return branch;
  return '未命名仓库';
}

function deriveSplitStrategyRationale(
  payload: SolutionReviewPayload,
  repos: SolutionReviewRepoRow[],
  tasks: SplitTaskDraft[],
): string {
  const explicit = (
    payload.split_strategy_rationale ||
    payload.whale_review?.split_strategy_rationale ||
    ''
  ).trim();
  if (explicit) return explicit;

  const md = (payload.whale_review?.summary_markdown || '').trim();
  if (md) {
    const splitLines = md
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line && /拆单|拆分|子单|按仓库|按模块|单任务|并行开发|改造冲突/.test(line));
    if (splitLines.length) return splitLines.join('\n');
  }

  const repoCount = repos.length;
  const taskCount = tasks.length;
  const distinctRepos = new Set(
    tasks.map((t) => (t.branch_version_id || '').trim()).filter(Boolean),
  ).size;
  const distinctModules = new Set(
    tasks.map((t) => (t.productModuleName || '').trim()).filter(Boolean),
  ).size;

  if (taskCount <= 1) {
    if (repoCount <= 1) {
      return '方案涉及单仓库且改造范围可控，保持 1 条研发子单，便于统一交付与验收。';
    }
    return `函数级方案列出 ${repoCount} 个仓库，但当前仅生成 1 条子单；请在评审时确认是否需按仓库拆分。`;
  }

  if (repoCount >= 2 && distinctRepos >= 2) {
    return `方案涉及 ${repoCount} 个仓库，已按仓库边界拆分为 ${taskCount} 条子单，便于并行开发与降低跨库改造冲突。`;
  }

  if (distinctModules >= 2) {
    return `方案跨 ${distinctModules} 个应用模块且改造范围较大，已按模块独立性拆分为 ${taskCount} 条子单，避免多条任务交叉改造相同代码。`;
  }

  return `已按方案复杂度拆分为 ${taskCount} 条研发子单（上限 ${MAX_SPLIT_TASKS} 条），请核对每条任务的仓库归属与改造边界。`;
}

function patchItemToSearchableOption(p: PatchVersionItem): SearchableOption | null {
  const name = (p.patchName || '').trim();
  if (!name) return null;
  const meta: string[] = [];
  const state = (p.state || '').trim();
  if (state) meta.push(state);
  const close = (p.closingDate || '').trim();
  if (close) meta.push(close);
  return {
    value: name,
    label: meta.length ? `${name} · ${meta.join(' · ')}` : name,
  };
}

function patchOptionsToSearchable(
  patches: PatchVersionItem[],
  selected?: string,
): SearchableOption[] {
  const opts = patches
    .map(patchItemToSearchableOption)
    .filter((o): o is SearchableOption => o != null);
  const cur = (selected || '').trim();
  if (!cur || opts.some((o) => o.value === cur)) return opts;
  return [{ value: cur, label: cur }, ...opts];
}

function applyRepoToTask(task: SplitTaskDraft, repo: SolutionReviewRepoRow): SplitTaskDraft {
  return {
    ...task,
    productModuleName: repo.product_module_name || task.productModuleName,
    branchVersionName: repo.branch_version_name || task.branchVersionName,
    branch_version_id: repoBranchId(repo) || task.branch_version_id,
  };
}

function emptySplitTask(
  demandNo: string,
  requirementName: string,
  repos: SolutionReviewRepoRow[],
  demandFunctions: DemandFunctionItem[],
): SplitTaskDraft {
  const titleBase = (requirementName || demandNo || '研发子单').trim();
  const first = repos[0];
  const allFp = demandFunctions.map((f) => f.functionPoint.trim()).filter(Boolean);
  const base: SplitTaskDraft = {
    taskNo: demandNo,
    taskTitle: `${titleBase} — 研发子单`,
    comments: '',
    productModuleName: '',
    branchVersionName: '',
    patchName: '',
    taskImpactDesc: '',
    performanceImpact: '',
    functionalImpact: '',
    cfgChangeDescription: '',
    upgradeRisk: '',
    securityImpact: '',
    compatibilityImpact: '',
    branch_version_id: '',
    functionPoints: allFp.length === 1 ? allFp : [],
  };
  return first ? applyRepoToTask(base, first) : base;
}

// ─── 子组件：渐变章节头 ───────────────────────────────────────────────

const SectionHeader: React.FC<{
  icon: React.ReactNode;
  title: string;
  subtitle?: string;
  accent?: 'violet' | 'amber' | 'cyan' | 'emerald' | 'blue';
}> = ({ icon, title, subtitle, accent = 'violet' }) => {
  const ring: Record<string, string> = {
    violet: 'from-violet-500/20 to-fuchsia-500/10 border-violet-500/30 text-violet-300',
    amber: 'from-amber-500/20 to-orange-500/10 border-amber-500/30 text-amber-300',
    cyan: 'from-cyan-500/20 to-blue-500/10 border-cyan-500/30 text-cyan-300',
    emerald: 'from-emerald-500/20 to-teal-500/10 border-emerald-500/30 text-emerald-300',
    blue: 'from-blue-500/20 to-indigo-500/10 border-blue-500/30 text-blue-300',
  };
  return (
    <div className="flex items-start gap-3">
      <div
        className={`shrink-0 rounded-xl border bg-gradient-to-br p-2.5 shadow-lg shadow-black/20 ${ring[accent]}`}
      >
        {icon}
      </div>
      <div className="min-w-0">
        <h3 className="text-base font-semibold text-foreground tracking-tight">{title}</h3>
        {subtitle ? <p className="text-[12px] text-muted-foreground mt-0.5">{subtitle}</p> : null}
      </div>
    </div>
  );
};

// ─── 仓库 + 补丁卡片 ─────────────────────────────────────────────────

const RepoPatchCard: React.FC<{
  index: number;
  row: SolutionReviewRepoRow;
  patchOptions: PatchVersionItem[];
  patchLoading: boolean;
  patchFetched: boolean;
  selectedPatch?: string;
  readOnly: boolean;
  onPatchChange: (branchId: string, patch: string) => void;
}> = ({
  index,
  row,
  patchOptions,
  patchLoading,
  patchFetched,
  selectedPatch,
  readOnly,
  onPatchChange,
}) => {
  const bid = repoBranchId(row);
  const opts = patchOptionsToSearchable(patchOptions, selectedPatch);
  const empty = patchFetched && !patchLoading && opts.length === 0;
  const selectDisabled = readOnly || empty || !bid;

  return (
    <div
      className="group relative overflow-visible rounded-2xl border border-border/50 bg-gradient-to-br from-[#0c1018] via-[color:var(--panel,#0f0f12)] to-[#0a0e14] shadow-lg shadow-black/25 transition-all duration-300 hover:border-cyan-500/35 hover:shadow-[0_8px_32px_rgba(34,211,238,0.08)]"
    >
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-cyan-400/50 to-transparent opacity-60" />
      <div className="flex items-center gap-2 px-4 py-3 border-b border-border/40 bg-gradient-to-r from-cyan-500/[0.06] to-transparent">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-cyan-500/15 text-[11px] font-bold text-cyan-300 border border-cyan-500/25">
          {index + 1}
        </span>
        <div className="min-w-0 font-medium text-foreground truncate">{repoDisplayLabel(row)}</div>
      </div>
      <div className="p-4 space-y-3">
        {row.repo_url ? (
          <div>
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">仓库地址</div>
            <Tooltip title={row.repo_url}>
              <div className="font-mono text-[12px] text-cyan-200/90 truncate rounded-lg bg-black/30 px-2.5 py-1.5 border border-border/30">
                {row.repo_url}
              </div>
            </Tooltip>
          </div>
        ) : null}
        {row.change_summary ? (
          <div>
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">改造内容</div>
            <p className="text-[13px] leading-relaxed text-foreground/90 line-clamp-4">{row.change_summary}</p>
          </div>
        ) : null}
        <div className="relative z-10">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5">补丁计划</div>
          {bid ? (
            <SearchableVirtualSelect
              value={selectedPatch || ''}
              onValueChange={(v) => onPatchChange(bid, v)}
              options={opts}
              placeholder="选择补丁计划"
              searchPlaceholder="搜索补丁名称或状态…"
              emptyText={empty ? '暂无可用补丁计划' : patchLoading ? '' : '无匹配补丁'}
              disabled={selectDisabled}
              isLoading={patchLoading}
              itemHeight={40}
              className="patch-plan-select-trigger"
              popoverClassName="min-w-[min(100%,320px)]"
            />
          ) : (
            <Text type="secondary" className="text-xs">
              未关联产品分支，无法选择补丁
            </Text>
          )}
        </div>
      </div>
    </div>
  );
};

// ─── 主面板 ───────────────────────────────────────────────────────────

export function SolutionReviewPanel({
  synapseApiBase,
  roomId,
  initialPayload,
  blocked = false,
  onDecided,
}: Props) {
  const [payload, setPayload] = useState<SolutionReviewPayload | null>(initialPayload ?? null);
  const [loading, setLoading] = useState(!initialPayload);
  const [submitting, setSubmitting] = useState(false);
  const [humanComment, setHumanComment] = useState('');
  const [patchByBranch, setPatchByBranch] = useState<Record<string, string>>({});
  const [patchOptions, setPatchOptions] = useState<Record<string, PatchVersionItem[]>>({});
  const [patchLoading, setPatchLoading] = useState<Record<string, boolean>>({});
  const patchFetchedRef = useRef<Set<string>>(new Set());
  /** 本地拆单草案有未保存编辑时，禁止轮询 payload 覆盖 editableTasks */
  const tasksDirtyRef = useRef(false);
  const [projectId, setProjectId] = useState<number | null>(null);
  const [editableTasks, setEditableTasks] = useState<SplitTaskDraft[]>([]);
  const [savingTasks, setSavingTasks] = useState(false);

  const load = useCallback(async () => {
    if (!synapseApiBase || !roomId) return;
    setLoading(true);
    try {
      const res = await fetchSolutionReview(synapseApiBase, roomId);
      setPayload(res.payload);
      const pidRaw = (res.project_id ?? '').trim();
      const pidNum = pidRaw ? Number(pidRaw) : NaN;
      setProjectId(Number.isFinite(pidNum) ? pidNum : null);
      const hr = res.payload?.human_review;
      if (hr?.comment) setHumanComment(hr.comment);
      if (hr?.status === 'rejected') {
        message.warning('方案评审未通过，流程已阻断，请重新处理本节点');
      }
    } catch (e) {
      message.error(e instanceof Error ? e.message : '加载方案评审失败');
    } finally {
      setLoading(false);
    }
  }, [synapseApiBase, roomId]);

  useEffect(() => {
    tasksDirtyRef.current = false;
  }, [roomId]);

  useEffect(() => {
    void load();
  }, [load]);

  const repos = useMemo(
    () => payload?.func_solution_parsed?.repos ?? [],
    [payload?.func_solution_parsed?.repos],
  );
  const impact = payload?.func_solution_parsed?.impact_assessment;
  const whale = payload?.whale_review;
  const artifacts = payload?.inputs?.stage2_artifacts ?? [];
  const humanStatus = payload?.human_review?.status ?? 'pending';
  const readOnly = blocked || humanStatus !== 'pending';
  const demandNo = payload?.demand_no ?? '';
  const requirementName = payload?.requirement_name ?? '';
  const demandFunctionsFromPayload = useMemo(
    () =>
      resolveDemandFunctionsForPanel(payload?.demand_function, payload?.split_tasks_draft),
    [payload?.demand_function, payload?.split_tasks_draft],
  );
  const demandFunctions = useMemo(
    () =>
      resolveDemandFunctionsForPanel(
        payload?.demand_function,
        payload?.split_tasks_draft,
        editableTasks,
      ),
    [payload?.demand_function, payload?.split_tasks_draft, editableTasks],
  );
  const demandFunctionRows = useMemo(
    () => buildDemandFunctionRows(demandFunctions, editableTasks),
    [demandFunctions, editableTasks],
  );

  useEffect(() => {
    if (!payload || tasksDirtyRef.current) return;
    const draft = payload.split_tasks_draft ?? [];
    const normalized = normalizeSplitTasksFromPayload(draft, demandNo, demandFunctionsFromPayload);
    if (normalized.length > 0) {
      setEditableTasks(normalized);
      return;
    }
    setEditableTasks([emptySplitTask(demandNo, requirementName, repos, demandFunctionsFromPayload)]);
  }, [payload, demandNo, requirementName, repos, demandFunctionsFromPayload]);

  const branchIds = useMemo(() => {
    const fromTasks = editableTasks.map((t) => (t.branch_version_id || '').trim()).filter(Boolean);
    const fromRepos = repos.map((r) => repoBranchId(r)).filter(Boolean);
    return [...new Set([...fromTasks, ...fromRepos])];
  }, [editableTasks, repos]);
  const branchIdsKey = branchIds.join('|');

  useEffect(() => {
    patchFetchedRef.current.clear();
  }, [projectId]);

  useEffect(() => {
    const allowed = new Set(branchIds);
    for (const id of [...patchFetchedRef.current]) {
      if (!allowed.has(id)) patchFetchedRef.current.delete(id);
    }
  }, [branchIdsKey, branchIds]);

  useEffect(() => {
    if (!synapseApiBase || !roomId || readOnly || !branchIds.length) return;

    for (const bid of branchIds) {
      if (patchFetchedRef.current.has(bid)) continue;
      patchFetchedRef.current.add(bid);
      setPatchLoading((p) => ({ ...p, [bid]: true }));
      void fetchPatchVersions(synapseApiBase, roomId, [bid], projectId ?? undefined)
        .then((res) => {
          const list = Array.isArray(res?.patches) ? res.patches : [];
          setPatchOptions((p) => ({ ...p, [bid]: list }));
        })
        .catch((e) => {
          setPatchOptions((p) => ({ ...p, [bid]: [] }));
          const msg = e instanceof Error ? e.message : '加载补丁失败';
          const repo = repos.find((r) => repoBranchId(r) === bid);
          const label = repo ? repoDisplayLabel(repo) : bid;
          message.error(`${label}：${msg}`);
        })
        .finally(() => {
          setPatchLoading((p) => ({ ...p, [bid]: false }));
        });
    }
  }, [synapseApiBase, roomId, branchIdsKey, readOnly, branchIds, projectId, repos]);

  const markTasksDirty = () => {
    tasksDirtyRef.current = true;
  };

  const updateTask = (index: number, patch: Partial<SplitTaskDraft>) => {
    markTasksDirty();
    setEditableTasks((prev) => prev.map((t, i) => (i === index ? { ...t, ...patch } : t)));
  };

  const addTask = () => {
    if (editableTasks.length >= MAX_SPLIT_TASKS) {
      message.warning(`一个需求最多拆分 ${MAX_SPLIT_TASKS} 个任务`);
      return;
    }
    markTasksDirty();
    setEditableTasks((prev) => [
      ...prev,
      emptySplitTask(demandNo, requirementName, repos, demandFunctions),
    ]);
  };

  const removeTask = (index: number) => {
    if (editableTasks.length <= 1) {
      message.warning('至少保留 1 个研发子单');
      return;
    }
    markTasksDirty();
    setEditableTasks((prev) => prev.filter((_, i) => i !== index));
  };

  const saveTasksDraft = async () => {
    if (!synapseApiBase || !roomId) return;
    const fpErr = validateFunctionPointAssignment(editableTasks, demandFunctions);
    if (fpErr) {
      message.warning(fpErr);
      return;
    }
    for (let i = 0; i < editableTasks.length; i++) {
      if (!(editableTasks[i].taskTitle || '').trim()) {
        message.warning(`请填写第 ${i + 1} 个任务的标题`);
        return;
      }
    }
    setSavingTasks(true);
    try {
      const res = await saveSolutionReviewTasks(synapseApiBase, roomId, editableTasks);
      tasksDirtyRef.current = false;
      setPayload(res.payload);
      message.success('拆单草案已保存');
    } catch (e) {
      message.error(e instanceof Error ? e.message : '保存失败');
    } finally {
      setSavingTasks(false);
    }
  };

  const humanCommentLen = humanComment.trim().length;
  const humanCommentTooShort = humanCommentLen < MIN_HUMAN_REVIEW_COMMENT_LEN;

  const submit = async (decision: 'approve' | 'reject') => {
    if (humanCommentTooShort) {
      message.warning(
        `请填写不少于 ${MIN_HUMAN_REVIEW_COMMENT_LEN} 字的人工评审意见（当前 ${humanCommentLen} 字）`,
      );
      return;
    }
    const fpErr = validateFunctionPointAssignment(
      editableTasks,
      demandFunctions,
      decision === 'approve',
    );
    if (fpErr) {
      message.warning(fpErr);
      return;
    }
    for (let i = 0; i < editableTasks.length; i++) {
      if (!(editableTasks[i].taskTitle || '').trim()) {
        message.warning(`请填写第 ${i + 1} 个任务的标题`);
        return;
      }
    }
    if (editableTasks.length > MAX_SPLIT_TASKS) {
      message.warning(`拆单任务不得超过 ${MAX_SPLIT_TASKS} 个`);
      return;
    }
    if (decision === 'approve') {
      const taskBranchIds = [
        ...new Set(
          editableTasks.map((t) => (t.branch_version_id || '').trim()).filter(Boolean),
        ),
      ];
      for (const bid of taskBranchIds) {
        if (!patchByBranch[bid]?.trim()) {
          const repo = repos.find((r) => repoBranchId(r) === bid);
          const label = repo ? repoDisplayLabel(repo) : bid;
          message.warning(`请为「${label}」选择补丁计划`);
          return;
        }
      }
    }
    setSubmitting(true);
    try {
      const patches = branchIds.map((bid) => ({
        branch_version_id: bid,
        patch_name: patchByBranch[bid] || '',
      }));
      const tasksPayload = editableTasks.map((t) => {
        const bid = (t.branch_version_id || '').trim();
        return {
          ...t,
          taskNo: t.taskNo || demandNo,
          patchName: bid ? patchByBranch[bid] || t.patchName : t.patchName,
        };
      });
      await submitSolutionReviewDecision(synapseApiBase, roomId, {
        decision,
        comment: humanComment.trim(),
        patches: decision === 'approve' ? patches : undefined,
        split_tasks_draft: tasksPayload,
      });
      message.success(decision === 'approve' ? '评审通过，已落盘拆单计划并推进流程' : '评审未通过，已阻断流程');
      tasksDirtyRef.current = false;
      await load();
      onDecided?.();
    } catch (e) {
      message.error(e instanceof Error ? e.message : '提交失败');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading && !payload) {
    return (
      <div className="flex h-full items-center justify-center text-muted-foreground">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" />
        加载方案评审…
      </div>
    );
  }

  if (!payload) {
    return (
      <div className="flex h-full items-center justify-center p-8">
        <Alert type="warning" showIcon message="未找到 solution_review.json，请先完成小鲸方案评审技能产出" />
      </div>
    );
  }

  const score = whale?.score ?? 0;
  const splitStrategyRationale = deriveSplitStrategyRationale(payload, repos, editableTasks);

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <div className="min-h-0 flex-1 overflow-y-auto custom-scrollbar p-6 space-y-6">
        {blocked || humanStatus === 'rejected' ? (
          <Alert
            type="error"
            showIcon
            message="方案评审未通过 — 会议室已阻断"
            description="产出物已归档。请根据意见修订方案后，对本节点执行「重新处理」。"
          />
        ) : null}

        {humanStatus === 'approved' ? (
          <Alert type="success" showIcon message="方案评审已通过，拆单计划已落盘" />
        ) : null}

        {/* 小鲸评分 */}
        <section className="rounded-2xl border border-violet-500/25 bg-gradient-to-br from-violet-500/[0.06] via-[color:var(--panel)] to-fuchsia-500/[0.03] p-5 shadow-xl shadow-black/20">
          <SectionHeader
            icon={<Shield className="h-5 w-5" />}
            title="小鲸评分与建议"
            subtitle="综合可靠性、安全性、需求一致性与控熵合规"
            accent="violet"
          />
          <div className="mt-5 flex flex-wrap gap-6 items-center">
            <Progress
              type="circle"
              percent={Math.min(100, Math.max(0, score))}
              size={80}
              strokeColor={score >= 80 ? '#22c55e' : score >= 60 ? '#eab308' : '#ef4444'}
              format={(p) => <span className="text-lg font-bold">{p}</span>}
            />
            <div>
              <div className="text-xs uppercase tracking-wider text-muted-foreground">综合评分</div>
              <div className="text-3xl font-bold bg-gradient-to-r from-violet-200 to-fuchsia-200 bg-clip-text text-transparent">
                {score}
              </div>
              <Tag color={whale?.verdict === 'pass' ? 'green' : 'gold'} className="mt-1">
                {VERDICT_LABEL[whale?.verdict ?? ''] ?? whale?.verdict ?? '—'}
              </Tag>
            </div>
            {whale?.score_breakdown ? (
              <div className="flex flex-wrap gap-2 flex-1 min-w-[200px]">
                {Object.entries(whale.score_breakdown).map(([k, v]) => (
                  <span
                    key={k}
                    className="rounded-full border border-violet-500/25 bg-violet-500/10 px-3 py-1 text-xs text-violet-100"
                  >
                    {scoreDimensionLabel(k)} · {formatScoreBreakdownValue(v)}
                  </span>
                ))}
              </div>
            ) : null}
          </div>
          {whale?.summary_markdown ? (
            <div className="mt-4 rounded-xl border border-border/40 bg-black/20 p-4">
              <ReviewMarkdown content={whale.summary_markdown} />
            </div>
          ) : null}
          {(whale?.suggestions ?? []).length > 0 ? (
            <div className="mt-4 space-y-2">
              {(whale?.suggestions ?? []).map((s, i) => (
                <div
                  key={i}
                  className="rounded-xl border border-border/35 bg-gradient-to-r from-muted/10 to-transparent px-4 py-3 text-sm"
                >
                  <Tag color={SEVERITY_COLOR[s.severity || 'info'] || 'default'}>
                    {SEVERITY_LABEL[s.severity || 'info'] ?? s.severity ?? '信息'}
                  </Tag>
                  <span className="ml-2 font-medium">{s.title}</span>
                  <p className="mt-1.5 text-muted-foreground leading-relaxed">{s.detail}</p>
                </div>
              ))}
            </div>
          ) : null}
        </section>

        <ImpactAssessmentPanel impact={impact} />

        {/* 需求设计产出物（仅已纳入） */}
        <section className="rounded-2xl border border-border/50 p-5 bg-[color:var(--panel)]/80">
          <SectionHeader
            icon={<FileText className="h-5 w-5" />}
            title="需求设计阶段产出物"
            subtitle="顶部切换文档 · 左侧为 Markdown 目录 · 右侧滚动阅读"
            accent="cyan"
          />
          <div className="mt-4">
            <Stage2ArtifactsPanel artifacts={artifacts} synapseApiBase={synapseApiBase} roomId={roomId} />
          </div>
        </section>

        {/* 涉及仓库与补丁选择 — 紧邻拆单预览上方 */}
        <section className="space-y-4">
          <SectionHeader
            icon={<GitBranch className="h-5 w-5" />}
            title="涉及仓库与补丁选择"
            subtitle="按仓库逐条匹配补丁计划版本（卡片标题为仓库/分支名称）"
            accent="cyan"
          />
          {repos.length > 0 ? (
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
              {repos.map((row, i) => {
                const bid = repoBranchId(row);
                return (
                  <RepoPatchCard
                    key={`repo-${bid}-${i}`}
                    index={i}
                    row={row}
                    patchOptions={patchOptions[bid] ?? []}
                    patchLoading={Boolean(patchLoading[bid])}
                    patchFetched={patchFetchedRef.current.has(bid) && !patchLoading[bid]}
                    selectedPatch={bid ? patchByBranch[bid] : undefined}
                    readOnly={readOnly}
                    onPatchChange={(branchId, patch) =>
                      setPatchByBranch((m) => ({ ...m, [branchId]: patch }))
                    }
                  />
                );
              })}
            </div>
          ) : (
            <Alert type="info" showIcon message="函数级方案中未解析到涉及仓库表" className="mt-2" />
          )}
        </section>

        {/* 方案涉及功能 + 拆单任务 */}
        <section className="space-y-4 rounded-2xl border border-indigo-500/20 bg-gradient-to-br from-indigo-500/[0.03] via-[color:var(--panel)] to-emerald-500/[0.02] p-5 shadow-xl shadow-black/10">
          <SectionHeader
            icon={<Sparkles className="h-5 w-5" />}
            title="方案涉及功能与拆单"
            subtitle="功能点来自模块功能.md；每条研发子单须认领功能点且不可重复"
            accent="blue"
          />
          <DemandFunctionMatrix rows={demandFunctionRows} readOnly={readOnly} />

        {/* 拆单任务编辑 — 支持新增/修改，最多 5 条 */}
          <div className="flex flex-wrap items-start justify-between gap-3 pt-2">
            <SectionHeader
              icon={<Package className="h-5 w-5" />}
              title="拆单任务"
              subtitle={`关联仓库后自动填充模块/分支；1～${MAX_SPLIT_TASKS} 条，跨仓库必拆`}
              accent="emerald"
            />
            {!readOnly ? (
              <div className="flex gap-2 shrink-0">
                <Button
                  icon={<Plus className="h-4 w-4" />}
                  disabled={editableTasks.length >= MAX_SPLIT_TASKS}
                  onClick={addTask}
                >
                  新增任务
                </Button>
                <Button loading={savingTasks} onClick={() => void saveTasksDraft()}>
                  保存草案
                </Button>
              </div>
            ) : null}
          </div>
          <Alert
            type="info"
            showIcon
            message="自动拆单理由"
            description={
              <p className="text-[13px] leading-relaxed whitespace-pre-wrap m-0">{splitStrategyRationale}</p>
            }
            className="border-emerald-500/20 bg-emerald-500/[0.04]"
          />
          {editableTasks.length > 0 ? (
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
              {editableTasks.map((task, i) => {
                const bid = (task.branch_version_id || '').trim();
                return (
                  <SplitTaskEditorCard
                    key={`split-edit-${i}-${bid}`}
                    index={i}
                    task={task}
                    repos={repos}
                    demandFunctions={demandFunctions}
                    allTasks={editableTasks}
                    repoDisplayLabel={repoDisplayLabel}
                    patchName={bid ? patchByBranch[bid] : undefined}
                    readOnly={readOnly}
                    canDelete={editableTasks.length > 1}
                    onChange={updateTask}
                    onDelete={removeTask}
                  />
                );
              })}
            </div>
          ) : (
            <Alert type="info" showIcon message="暂无拆单任务，请点击「新增任务」或等待小鲸生成草案" />
          )}
          <p className="text-[11px] text-muted-foreground text-center">
            评审通过后将落盘 split_plan.json（含 demand_function 与 tasks.functionPoints），当前{' '}
            {editableTasks.length} / {MAX_SPLIT_TASKS} 条研发子单
          </p>
        </section>

        {/* 人工评审 */}
        <section className="rounded-2xl border border-border/50 p-5">
          <SectionHeader icon={<CheckCircle2 className="h-5 w-5" />} title="人工评审" accent="violet" />
          <div className="mt-4 mb-3 flex items-center gap-2">
            <span className="text-sm text-muted-foreground">状态</span>
            <Tag
              color={
                humanStatus === 'approved' ? 'green' : humanStatus === 'rejected' ? 'red' : 'processing'
              }
            >
              {humanStatus === 'approved' ? '通过' : humanStatus === 'rejected' ? '不通过' : '待评审'}
            </Tag>
          </div>
          <TextArea
            rows={4}
            placeholder={`填写人工评审意见（提交时必填，不少于 ${MIN_HUMAN_REVIEW_COMMENT_LEN} 字）`}
            value={humanComment}
            onChange={(e) => setHumanComment(e.target.value)}
            disabled={readOnly}
            status={!readOnly && humanComment.trim() && humanCommentTooShort ? 'warning' : undefined}
          />
          {!readOnly ? (
            <div className="mt-1 flex justify-end text-xs text-muted-foreground">
              <span className={humanCommentTooShort ? 'text-amber-500' : 'text-emerald-500'}>
                {humanCommentLen} / {MIN_HUMAN_REVIEW_COMMENT_LEN} 字
              </span>
            </div>
          ) : null}
        </section>
      </div>

      {!readOnly ? (
        <div className="shrink-0 border-t border-border/50 bg-[color:var(--panel)] px-6 py-4 flex justify-end gap-3">
          <Button
            danger
            icon={<XCircle className="h-4 w-4" />}
            loading={submitting}
            onClick={() => submit('reject')}
          >
            评审不通过
          </Button>
          <Button
            type="primary"
            icon={<CheckCircle2 className="h-4 w-4" />}
            loading={submitting}
            onClick={() => submit('approve')}
          >
            通过并确认拆单
          </Button>
        </div>
      ) : null}
    </div>
  );
}
