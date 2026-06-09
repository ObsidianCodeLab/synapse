/**
 * 方案评审 · 需求功能矩阵与研发子单编辑表单
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Button, Input, Tag, Tooltip } from 'antd';
import {
  Activity,
  AlertTriangle,
  Boxes,
  CheckCircle2,
  GitBranch,
  Layers,
  Lock,
  ChevronDown,
  Plus,
  Search,
  Shield,
  Sparkles,
  Trash2,
  X,
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

const IMPACT_INPUT_CLASS =
  '!bg-black/15 !border-border/30 text-[13px] placeholder:text-muted-foreground/50';

/** 兼容 camelCase / snake_case / 中文表头 */
export function normalizeDemandFunctions(raw: unknown): DemandFunctionItem[] {
  if (!Array.isArray(raw)) return [];
  const out: DemandFunctionItem[] = [];
  for (let i = 0; i < raw.length; i++) {
    const row = raw[i];
    if (!row || typeof row !== 'object') continue;
    const r = row as Record<string, unknown>;
    const functionPoint = String(
      r.functionPoint ??
        r.function_point ??
        r.point ??
        r.name ??
        r.title ??
        r['功能点'] ??
        r['功能点名称'] ??
        '',
    ).trim();
    if (!functionPoint) continue;
    const idRaw = String(r.id ?? '').trim();
    out.push({
      id: idRaw || `fp-${i + 1}`,
      functionPoint,
      functionDesc:
        String(r.functionDesc ?? r.function_desc ?? r['功能描述'] ?? r['说明'] ?? '').trim() ||
        undefined,
      assignedTaskTitle:
        String(r.assignedTaskTitle ?? r.assigned_task_title ?? '').trim() || undefined,
    });
  }
  return out;
}

function mergeDemandFunctionItems(sources: DemandFunctionItem[][]): DemandFunctionItem[] {
  const merged = new Map<string, DemandFunctionItem>();
  const order: string[] = [];
  for (const list of sources) {
    for (const item of list) {
      const point = item.functionPoint.trim();
      if (!point) continue;
      const existing = merged.get(point);
      if (!existing) {
        merged.set(point, { ...item, functionPoint: point });
        order.push(point);
        continue;
      }
      if (!existing.functionDesc?.trim() && item.functionDesc?.trim()) {
        merged.set(point, { ...existing, functionDesc: item.functionDesc });
      }
    }
  }
  return order.map((point) => merged.get(point)!);
}

function demandFunctionsFromSplitTasks(tasks: SplitTaskDraft[] | undefined): DemandFunctionItem[] {
  const seen = new Set<string>();
  const out: DemandFunctionItem[] = [];
  for (const task of tasks ?? []) {
    for (const fp of task.functionPoints ?? []) {
      const p = fp.trim();
      if (!p || seen.has(p)) continue;
      seen.add(p);
      out.push({ id: `fp-${out.length + 1}`, functionPoint: p });
    }
  }
  return out;
}

/** 合并 payload.demand_function、拆单草案与当前编辑态中的功能点 */
export function resolveDemandFunctionsForPanel(
  demandFunctionRaw: unknown,
  splitTasksDraft: SplitTaskDraft[] | undefined,
  editableTasks?: SplitTaskDraft[],
): DemandFunctionItem[] {
  return mergeDemandFunctionItems([
    normalizeDemandFunctions(demandFunctionRaw),
    demandFunctionsFromSplitTasks(splitTasksDraft),
    demandFunctionsFromSplitTasks(editableTasks),
  ]);
}

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

type FunctionPointOption = {
  value: string;
  label: string;
  desc?: string;
  disabled?: boolean;
  takenBy?: number;
};

const FunctionPointMultiPicker: React.FC<{
  options: FunctionPointOption[];
  value: string[];
  onChange: (next: string[]) => void;
  readOnly: boolean;
}> = ({ options, value, onChange, readOnly }) => {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const rootRef = useRef<HTMLDivElement>(null);

  const selectedSet = useMemo(() => new Set(value), [value]);
  const descByValue = useMemo(() => {
    const map = new Map<string, string>();
    for (const opt of options) {
      if (opt.desc) map.set(opt.value, opt.desc);
    }
    return map;
  }, [options]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter(
      (o) =>
        o.value.toLowerCase().includes(q) ||
        o.label.toLowerCase().includes(q) ||
        (o.desc || '').toLowerCase().includes(q),
    );
  }, [options, query]);

  const addable = filtered.filter((o) => !o.disabled && !selectedSet.has(o.value));

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      const el = rootRef.current;
      if (el && !el.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  useEffect(() => {
    if (!open) setQuery('');
  }, [open]);

  const toggle = (fp: string) => {
    if (readOnly) return;
    if (selectedSet.has(fp)) {
      onChange(value.filter((v) => v !== fp));
      return;
    }
    onChange([...value, fp]);
  };

  return (
    <div ref={rootRef} className="space-y-2">
      <div className="min-h-[2.25rem] rounded-xl border border-border/40 bg-black/15 px-2.5 py-2">
        {value.length > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            {value.map((fp) => {
              const desc = descByValue.get(fp);
              return (
                <span
                  key={fp}
                  className="inline-flex max-w-full items-start gap-1 rounded-lg border border-indigo-500/30 bg-indigo-500/15 px-2 py-1 text-[12px] text-indigo-100 shadow-sm"
                >
                  <span className="min-w-0">
                    <span className="font-medium text-foreground/95">{fp}</span>
                    {desc ? (
                      <span className="mt-0.5 block text-[10px] leading-snug text-muted-foreground line-clamp-2">
                        {desc}
                      </span>
                    ) : null}
                  </span>
                  {!readOnly ? (
                    <button
                      type="button"
                      className="mt-0.5 shrink-0 rounded p-0.5 text-indigo-200/80 transition-colors hover:bg-indigo-500/25 hover:text-foreground"
                      aria-label={`移除 ${fp}`}
                      onClick={() => toggle(fp)}
                    >
                      <X className="h-3 w-3" />
                    </button>
                  ) : null}
                </span>
              );
            })}
          </div>
        ) : (
          <p className="text-[12px] text-muted-foreground/60 py-0.5">尚未选择功能点</p>
        )}
      </div>

      {!readOnly && options.length > 0 ? (
        <div className="relative">
          <button
            type="button"
            className="flex h-9 w-full items-center justify-between gap-2 rounded-xl border border-indigo-500/25 bg-indigo-500/[0.08] px-3 text-[13px] text-indigo-100 transition-colors hover:border-indigo-400/40 hover:bg-indigo-500/[0.12]"
            aria-expanded={open}
            onClick={() => setOpen((o) => !o)}
          >
            <span className="inline-flex items-center gap-1.5">
              <Plus className="h-3.5 w-3.5" />
              添加功能点
            </span>
            <ChevronDown className={`h-4 w-4 opacity-60 transition-transform ${open ? 'rotate-180' : ''}`} />
          </button>

          {open ? (
            <div className="absolute left-0 right-0 top-full z-[120] mt-1 overflow-hidden rounded-xl border border-border/60 bg-[color:var(--panel,#0f0f12)] shadow-xl shadow-black/30">
              <div className="flex items-center gap-2 border-b border-border/40 px-3 py-2">
                <Search className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="搜索功能点或描述…"
                  className="w-full bg-transparent text-[13px] text-foreground outline-none placeholder:text-muted-foreground/50"
                />
              </div>
              <div className="max-h-56 overflow-y-auto custom-scrollbar p-2 space-y-1.5">
                {filtered.length === 0 ? (
                  <p className="px-2 py-6 text-center text-[12px] text-muted-foreground">无匹配功能点</p>
                ) : (
                  filtered.map((opt) => {
                    const picked = selectedSet.has(opt.value);
                    const blocked = opt.disabled && !picked;
                    return (
                      <button
                        key={opt.value}
                        type="button"
                        disabled={blocked}
                        className={`w-full rounded-lg border px-3 py-2 text-left transition-colors ${
                          picked
                            ? 'border-emerald-500/35 bg-emerald-500/10'
                            : blocked
                              ? 'cursor-not-allowed border-border/20 bg-black/10 opacity-45'
                              : 'border-border/30 bg-black/20 hover:border-indigo-400/35 hover:bg-indigo-500/[0.08]'
                        }`}
                        onClick={() => {
                          if (blocked) return;
                          toggle(opt.value);
                        }}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <span className="text-[13px] font-medium text-foreground">{opt.value}</span>
                          {picked ? (
                            <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-400" />
                          ) : blocked ? (
                            <span className="text-[10px] text-amber-400/90 shrink-0">
                              子单 {opt.takenBy} 已认领
                            </span>
                          ) : null}
                        </div>
                        {opt.desc ? (
                          <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground line-clamp-2">
                            {opt.desc}
                          </p>
                        ) : null}
                      </button>
                    );
                  })
                )}
              </div>
              {addable.length === 0 && filtered.length > 0 ? (
                <p className="border-t border-border/30 px-3 py-2 text-[11px] text-muted-foreground">
                  可选功能点均已被其他研发子单认领
                </p>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
};

function ImpactFieldRow({
  label,
  icon,
  value,
  onChange,
  readOnly,
  placeholder,
}: {
  label: string;
  icon?: React.ReactNode;
  value: string;
  onChange: (next: string) => void;
  readOnly: boolean;
  placeholder: string;
}) {
  return (
    <div className="space-y-1">
      <div className="flex items-center gap-1 text-[10px] uppercase tracking-wider text-muted-foreground">
        {icon}
        {label}
      </div>
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={readOnly}
        placeholder={placeholder}
        className={IMPACT_INPUT_CLASS}
      />
    </div>
  );
}

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
    const takenBy = new Map<string, number>();
    allTasks.forEach((t, i) => {
      if (i === index) return;
      (t.functionPoints ?? []).forEach((fp) => {
        const p = fp.trim();
        if (p && !takenBy.has(p)) takenBy.set(p, i + 1);
      });
    });
    const selected = new Set(
      (task.functionPoints ?? []).map((fp) => fp.trim()).filter(Boolean),
    );
    return demandFunctions
      .filter((f) => f.functionPoint.trim())
      .map((f) => {
        const fp = f.functionPoint.trim();
        const desc = (f.functionDesc || '').trim();
        const takenTask = takenBy.get(fp);
        return {
          value: fp,
          label: desc ? `${fp} — ${desc}` : fp,
          desc: desc || undefined,
          disabled: Boolean(takenTask) && !selected.has(fp),
          takenBy: takenTask,
        };
      });
  }, [allTasks, demandFunctions, index, task.functionPoints]);

  const selectedFunctionPoints = useMemo(
    () => (task.functionPoints ?? []).map((fp) => fp.trim()).filter(Boolean),
    [task.functionPoints],
  );

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
            <div className="text-[11px] text-muted-foreground">研发子单 {index + 1}</div>
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
          <div className="mb-1.5 flex items-center gap-1 text-[10px] uppercase tracking-wider text-muted-foreground">
            <Sparkles className="h-3 w-3 text-indigo-300" />
            需求功能匹配
            <span className="normal-case text-[9px] text-muted-foreground/80">（多选 · 不可重复）</span>
          </div>
          {functionSelectOptions.length > 0 ? (
            <FunctionPointMultiPicker
              options={functionSelectOptions}
              value={selectedFunctionPoints}
              onChange={(vals) =>
                onChange(index, {
                  functionPoints: vals.map((v) => v.trim()).filter(Boolean),
                })
              }
              readOnly={readOnly}
            />
          ) : (
            <p className="text-xs italic text-amber-400/90">
              暂无需求功能点，请确认「模块功能.md」已写入需求功能拆分表或小鲸 solution_review.json
            </p>
          )}
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

        <div>
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">研发单描述</div>
          <TextArea
            rows={3}
            value={task.comments || ''}
            onChange={(e) => onChange(index, { comments: e.target.value })}
            disabled={readOnly}
            placeholder="本任务改造范围与交付说明"
            className={IMPACT_INPUT_CLASS}
          />
        </div>

        <div className="space-y-3 border-t border-border/25 pt-3">
          <ImpactFieldRow
            label="确认需求影响"
            value={task.taskImpactDesc || ''}
            onChange={(v) => onChange(index, { taskImpactDesc: v })}
            readOnly={readOnly}
            placeholder="确认本研发子单对需求的影响范围与验收要点"
          />
          {SPLIT_TASK_IMPACT_FIELDS.map((field) => (
            <ImpactFieldRow
              key={field.key}
              label={field.label}
              icon={IMPACT_ICONS[field.key]}
              value={(task[field.key as keyof SplitTaskDraft] as string) || ''}
              onChange={(v) => onChange(index, { [field.key]: v })}
              readOnly={readOnly}
              placeholder={`${field.label}说明`}
            />
          ))}
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
