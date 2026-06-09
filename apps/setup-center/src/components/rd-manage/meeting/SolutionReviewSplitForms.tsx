/**
 * 方案评审 · 需求功能矩阵与研发子单编辑表单
 */
import React, { useMemo } from 'react';
import { Button, Input, Select, Tag, Tooltip } from 'antd';
import {
  Activity,
  AlertTriangle,
  Boxes,
  CheckCircle2,
  GitBranch,
  Layers,
  Lock,
  Shield,
  Sparkles,
  Trash2,
  Zap,
} from 'lucide-react';

import {
  SPLIT_TASK_IMPACT_FIELDS,
  type DemandFunctionItem,
  type SplitTaskDraft,
  type SolutionReviewRepoRow,
} from '../../../api/meetingRoomService';
import {
  SearchableVirtualSelect,
  type SearchableOption,
} from '@/components/product/SearchableVirtualSelect';

const { TextArea } = Input;

const IMPACT_ICONS: Record<string, React.ReactNode> = {
  performanceImpact: <Zap className="h-3.5 w-3.5" />,
  functionalImpact: <Layers className="h-3.5 w-3.5" />,
  cfgChangeDescription: <Boxes className="h-3.5 w-3.5" />,
  upgradeRisk: <AlertTriangle className="h-3.5 w-3.5" />,
  securityImpact: <Shield className="h-3.5 w-3.5" />,
  compatibilityImpact: <Activity className="h-3.5 w-3.5" />,
};

const IMPACT_ACCENT: Record<string, string> = {
  sky: 'border-sky-500/25 bg-sky-500/[0.06] text-sky-200',
  violet: 'border-violet-500/25 bg-violet-500/[0.06] text-violet-200',
  amber: 'border-amber-500/25 bg-amber-500/[0.06] text-amber-200',
  orange: 'border-orange-500/25 bg-orange-500/[0.06] text-orange-200',
  rose: 'border-rose-500/25 bg-rose-500/[0.06] text-rose-200',
  teal: 'border-teal-500/25 bg-teal-500/[0.06] text-teal-200',
};

export function repoBranchId(row: SolutionReviewRepoRow): string {
  return (row.branch_version_id || '').trim();
}

export function validateFunctionPointAssignment(
  tasks: SplitTaskDraft[],
  demandFunctions: DemandFunctionItem[],
  requireFull = false,
): string | null {
  const known = new Set(demandFunctions.map((f) => f.functionPoint.trim()).filter(Boolean));
  const seen = new Map<string, number>();
  for (let i = 0; i < tasks.length; i++) {
    for (const fp of tasks[i].functionPoints ?? []) {
      const p = fp.trim();
      if (!p) continue;
      if (known.size && !known.has(p)) return `功能点「${p}」不在需求功能清单中`;
      if (seen.has(p)) {
        return `功能点「${p}」已被研发子单 ${seen.get(p)! + 1} 认领，不可重复分派`;
      }
      seen.set(p, i);
    }
  }
  if (requireFull && known.size) {
    const missing = [...known].filter((p) => !seen.has(p));
    if (missing.length) return `以下功能点尚未分派到任何研发子单：${missing.join('、')}`;
  }
  return null;
}

export function buildDemandFunctionRows(
  demandFunctions: DemandFunctionItem[],
  tasks: SplitTaskDraft[],
): DemandFunctionItem[] {
  const fpToTitle = new Map<string, string>();
  for (const task of tasks) {
    const title = (task.taskTitle || '').trim();
    for (const fp of task.functionPoints ?? []) {
      const p = fp.trim();
      if (p) fpToTitle.set(p, title);
    }
  }
  return demandFunctions.map((f) => ({
    ...f,
    assignedTaskTitle: fpToTitle.get(f.functionPoint.trim()) || f.assignedTaskTitle || '',
  }));
}

function normalizeTasksWithFunctions(
  draft: SplitTaskDraft[],
  demandFunctions: DemandFunctionItem[],
  demandNo: string,
): SplitTaskDraft[] {
  const tasks = draft.map((t) => ({ ...t, taskNo: t.taskNo || demandNo }));
  const allFp = demandFunctions.map((f) => f.functionPoint.trim()).filter(Boolean);
  if (tasks.length === 1 && allFp.length) {
    const cur = tasks[0].functionPoints ?? [];
    if (!cur.length) tasks[0] = { ...tasks[0], functionPoints: allFp };
  }
  return tasks;
}

export function normalizeSplitTasksFromPayload(
  draft: SplitTaskDraft[],
  demandNo: string,
  demandFunctions: DemandFunctionItem[],
): SplitTaskDraft[] {
  if (draft.length > 0) return normalizeTasksWithFunctions(draft, demandFunctions, demandNo);
  return [];
}

// ─── 需求功能矩阵 ─────────────────────────────────────────────────────

export const DemandFunctionMatrix: React.FC<{
  rows: DemandFunctionItem[];
  readOnly?: boolean;
}> = ({ rows }) => {
  const assigned = rows.filter((r) => (r.assignedTaskTitle || '').trim()).length;
  const total = rows.length;

  if (!total) {
    return (
      <p className="text-sm text-muted-foreground italic py-2">
        未解析到需求功能点，请检查「模块功能.md」需求功能拆分表或小鲸 solution_review.json
      </p>
    );
  }

  return (
    <div className="mt-4 overflow-hidden rounded-2xl border border-indigo-500/20 bg-gradient-to-br from-indigo-500/[0.05] via-[color:var(--panel)] to-blue-500/[0.03] shadow-xl shadow-black/15">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-indigo-500/15 bg-indigo-500/[0.06] px-4 py-3">
        <div className="flex items-center gap-2 text-sm font-medium text-indigo-100">
          <Sparkles className="h-4 w-4 text-indigo-300" />
          方案涉及功能
          <span className="text-[11px] font-normal text-muted-foreground">
            共 {total} 项 · 已分派 {assigned}
          </span>
        </div>
        <div className="h-1.5 w-32 overflow-hidden rounded-full bg-black/30">
          <div
            className="h-full rounded-full bg-gradient-to-r from-indigo-400 to-cyan-400 transition-all duration-500"
            style={{ width: `${total ? (assigned / total) * 100 : 0}%` }}
          />
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-left text-[13px]">
          <thead>
            <tr className="border-b border-border/40 text-[10px] uppercase tracking-wider text-muted-foreground">
              <th className="px-4 py-2.5 font-medium w-[22%]">功能点</th>
              <th className="px-4 py-2.5 font-medium w-[38%]">功能描述</th>
              <th className="px-4 py-2.5 font-medium w-[40%]">对应研发单标题</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => {
              const title = (row.assignedTaskTitle || '').trim();
              const done = Boolean(title);
              return (
                <tr
                  key={`${row.functionPoint}-${i}`}
                  className="border-b border-border/25 transition-colors hover:bg-indigo-500/[0.04] last:border-0"
                >
                  <td className="px-4 py-3 align-top">
                    <span className="inline-flex items-center gap-1.5 font-medium text-foreground">
                      {done ? (
                        <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-400" />
                      ) : (
                        <span className="h-2 w-2 shrink-0 rounded-full bg-amber-400/80" />
                      )}
                      {row.functionPoint}
                    </span>
                  </td>
                  <td className="px-4 py-3 align-top text-foreground/85 leading-relaxed">
                    {row.functionDesc || '—'}
                  </td>
                  <td className="px-4 py-3 align-top">
                    {title ? (
                      <Tag
                        bordered={false}
                        className="m-0 max-w-full truncate bg-emerald-500/15 text-emerald-200 border border-emerald-500/25"
                      >
                        {title}
                      </Tag>
                    ) : (
                      <span className="text-xs text-amber-400/90">待分派</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};

// ─── 研发子单编辑卡片 ─────────────────────────────────────────────────

export const SplitTaskEditorCard: React.FC<{
  index: number;
  task: SplitTaskDraft;
  repos: SolutionReviewRepoRow[];
  demandFunctions: DemandFunctionItem[];
  allTasks: SplitTaskDraft[];
  patchName?: string;
  repoDisplayLabel: (row: SolutionReviewRepoRow) => string;
  readOnly: boolean;
  canDelete: boolean;
  onChange: (index: number, patch: Partial<SplitTaskDraft>) => void;
  onDelete: (index: number) => void;
}> = ({
  index,
  task,
  repos,
  demandFunctions,
  allTasks,
  patchName,
  repoDisplayLabel,
  readOnly,
  canDelete,
  onChange,
  onDelete,
}) => {
  const repoOptions: SearchableOption[] = repos
    .filter((r) => repoBranchId(r))
    .map((r) => ({
      value: repoBranchId(r),
      label: repoDisplayLabel(r),
    }));

  const selectedBranch = (task.branch_version_id || '').trim();
  const selectedRepo = repos.find((r) => repoBranchId(r) === selectedBranch);

  const functionSelectOptions = useMemo(() => {
    const taken = new Set<string>();
    allTasks.forEach((t, i) => {
      if (i === index) return;
      (t.functionPoints ?? []).forEach((fp) => taken.add(fp.trim()));
    });
    return demandFunctions
      .map((f) => f.functionPoint.trim())
      .filter(Boolean)
      .map((fp) => ({
        value: fp,
        label: fp,
        disabled: taken.has(fp) && !(task.functionPoints ?? []).includes(fp),
      }));
  }, [allTasks, demandFunctions, index, task.functionPoints]);

  const applyRepo = (repo: SolutionReviewRepoRow) => {
    onChange(index, {
      productModuleName: repo.product_module_name || '',
      branchVersionName: repo.branch_version_name || '',
      branch_version_id: repoBranchId(repo),
    });
  };

  return (
    <div className="relative overflow-hidden rounded-2xl border border-emerald-500/25 bg-gradient-to-br from-emerald-500/[0.05] via-[color:var(--panel,#0f0f12)] to-[#0a1018] shadow-lg shadow-black/20 transition-all duration-300 hover:border-emerald-400/40 hover:shadow-emerald-500/10">
      <div className="absolute left-0 top-4 bottom-4 w-1 rounded-r-full bg-gradient-to-b from-emerald-400/90 to-teal-500/50" />
      <div className="pl-5 pr-4 py-4 space-y-3.5">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-500/25 to-teal-500/15 text-[11px] font-bold text-emerald-200 border border-emerald-500/30 shadow-inner">
              {index + 1}
            </span>
            <div>
              <div className="text-[11px] text-muted-foreground">研发子单 {index + 1}</div>
              {(task.functionPoints ?? []).length > 0 ? (
                <div className="mt-1 flex flex-wrap gap-1">
                  {(task.functionPoints ?? []).map((fp) => (
                    <Tag
                      key={fp}
                      bordered={false}
                      className="m-0 text-[10px] bg-indigo-500/15 text-indigo-200 border-indigo-500/25"
                    >
                      {fp}
                    </Tag>
                  ))}
                </div>
              ) : null}
            </div>
          </div>
          {!readOnly && canDelete ? (
            <Button
              type="text"
              size="small"
              danger
              icon={<Trash2 className="h-3.5 w-3.5" />}
              onClick={() => onDelete(index)}
            >
              删除
            </Button>
          ) : null}
        </div>

        <div>
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">标题</div>
          <Input
            value={task.taskTitle || ''}
            onChange={(e) => onChange(index, { taskTitle: e.target.value })}
            disabled={readOnly}
            placeholder="研发单标题"
          />
        </div>

        {repoOptions.length > 0 ? (
          <div>
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1 flex items-center gap-1">
              <GitBranch className="h-3 w-3" />
              关联仓库/分支
            </div>
            <SearchableVirtualSelect
              value={selectedBranch}
              onValueChange={(bid) => {
                const repo = repos.find((r) => repoBranchId(r) === bid);
                if (repo) applyRepo(repo);
                else onChange(index, { branch_version_id: bid });
              }}
              options={repoOptions}
              placeholder="选择仓库以匹配补丁与模块信息"
              searchPlaceholder="搜索仓库或分支…"
              disabled={readOnly}
              itemHeight={40}
            />
          </div>
        ) : null}

        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-lg border border-border/30 bg-black/20 px-2.5 py-2">
            <div className="text-[10px] text-muted-foreground flex items-center gap-1">
              <Lock className="h-3 w-3" />
              应用模块
            </div>
            <div className="mt-0.5 text-[13px] text-foreground/90 truncate">
              {task.productModuleName || selectedRepo?.product_module_name || '选择仓库后自动填充'}
            </div>
          </div>
          <div className="rounded-lg border border-border/30 bg-black/20 px-2.5 py-2">
            <div className="text-[10px] text-muted-foreground flex items-center gap-1">
              <Lock className="h-3 w-3" />
              产品分支
            </div>
            <div className="mt-0.5 text-[13px] text-foreground/90 truncate">
              {task.branchVersionName || selectedRepo?.branch_version_name || '选择仓库后自动填充'}
            </div>
          </div>
        </div>

        {demandFunctions.length > 0 ? (
          <div>
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1 flex items-center gap-1">
              <Sparkles className="h-3 w-3 text-indigo-300" />
              需求功能匹配
              <span className="normal-case text-[9px] text-muted-foreground/80">（多选 · 不可重复）</span>
            </div>
            <Select
              mode="multiple"
              allowClear
              className="w-full"
              placeholder="选择本研发子单实现的功能点"
              value={task.functionPoints ?? []}
              onChange={(vals) => onChange(index, { functionPoints: vals as string[] })}
              options={functionSelectOptions}
              disabled={readOnly}
              maxTagCount="responsive"
              optionFilterProp="label"
            />
          </div>
        ) : null}

        <div>
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">研发单描述</div>
          <TextArea
            rows={2}
            value={task.comments || ''}
            onChange={(e) => onChange(index, { comments: e.target.value })}
            disabled={readOnly}
            placeholder="本任务改造范围与交付说明"
          />
        </div>

        <div className="rounded-xl border border-amber-500/20 bg-amber-500/[0.04] p-3">
          <div className="text-[10px] uppercase tracking-wider text-amber-200/90 mb-1.5">
            确认需求影响
          </div>
          <TextArea
            rows={2}
            value={task.taskImpactDesc || ''}
            onChange={(e) => onChange(index, { taskImpactDesc: e.target.value })}
            disabled={readOnly}
            placeholder="确认本研发子单对需求的影响范围与验收要点"
          />
        </div>

        <div>
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">
            研发单影响（六维）
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {SPLIT_TASK_IMPACT_FIELDS.map((field) => (
              <div
                key={field.key}
                className={`rounded-lg border px-2.5 py-2 ${IMPACT_ACCENT[field.accent]}`}
              >
                <div className="text-[10px] mb-1 flex items-center gap-1 opacity-90">
                  {IMPACT_ICONS[field.key]}
                  {field.label}
                </div>
                <TextArea
                  rows={2}
                  value={(task[field.key as keyof SplitTaskDraft] as string) || ''}
                  onChange={(e) => onChange(index, { [field.key]: e.target.value })}
                  disabled={readOnly}
                  placeholder={`${field.label}说明`}
                  className="!bg-black/20 !border-border/30 text-[12px]"
                />
              </div>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 text-[12px]">
          <div className="rounded-lg bg-black/25 px-2.5 py-2 border border-border/30">
            <div className="text-[10px] text-muted-foreground">需求单号</div>
            <div className="font-mono text-foreground/90 mt-0.5">{task.taskNo || '—'}</div>
          </div>
          <div className="rounded-lg bg-black/25 px-2.5 py-2 border border-border/30">
            <div className="text-[10px] text-muted-foreground">补丁计划</div>
            <Tooltip title={patchName || task.patchName || '请在上方仓库卡片选择补丁'}>
              <div
                className={`mt-0.5 font-medium truncate ${patchName ? 'text-emerald-300' : 'text-amber-400/90'}`}
              >
                {patchName || task.patchName || '待选择'}
              </div>
            </Tooltip>
          </div>
        </div>
      </div>
    </div>
  );
};
