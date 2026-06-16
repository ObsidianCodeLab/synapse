import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'motion/react';
import {
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Copy,
  FolderGit2,
  FolderTree,
  GitBranch,
  Layers,
  ListTree,
  Package,
  Server,
  Sparkles,
  Tag,
  Terminal,
} from 'lucide-react';

import { EnvPregenDocsPanel } from './EnvPregenDocsPanel';
import { collectEnvPregenDocs } from './envPregenDocs';
import { CodeCommitFlightPanel } from './CodeCommitFlightPanel';
import { CodeCommitProgressSteps } from './CodeCommitProgressSteps';
import {
  codeCommitSummaryLine,
  collectCodeCommitFlights,
  resolveCodeCommitStepStates,
} from './codeCommitDisplay';

function SectionTitle({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="rd-chat-card__title">
      <span className="rd-chat-card__title-icon">{icon}</span>
      <span>{children}</span>
    </div>
  );
}

function StatusBadge({ status }: { status?: string }) {
  const s = String(status || '—');
  const ok = s === 'ok' || s === 'completed' || s === 'planned' || s === '成功';
  const partial = s === 'partial' || s === '部分成功';
  const failed = s === 'failed' || s === '失败';
  const label =
    s === 'ok' || s === '成功'
      ? '成功'
      : s === 'failed' || s === '失败'
        ? '失败'
        : s === 'planned'
          ? '已计划'
          : s;
  const cls = ok
    ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
    : partial
      ? 'bg-amber-500/15 text-amber-400 border-amber-500/30'
      : failed
        ? 'bg-red-500/15 text-red-400 border-red-500/30'
        : 'bg-slate-500/15 text-slate-300 border-slate-500/30';
  return (
    <span className={`inline-flex items-center rounded border px-1.5 py-0.5 text-[10px] font-medium ${cls}`}>
      {label}
    </span>
  );
}

function CopyPath({
  value,
  label,
  className = '',
  multiline = false,
  scrollable = false,
  copyTitle = '复制路径',
}: {
  value?: string;
  label?: string;
  className?: string;
  multiline?: boolean;
  scrollable?: boolean;
  copyTitle?: string;
}) {
  const text = String(value || '').trim();
  const [copied, setCopied] = useState(false);
  if (!text) {
    return (
      <div className={`rd-system-path-row ${className}`.trim()}>
        {label ? <span className="rd-system-path-row__label">{label}</span> : null}
        <span className="text-muted-foreground text-[11px]">—</span>
      </div>
    );
  }

  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      /* ignore */
    }
  };

  const textClass = [
    'rd-system-path-row__text',
    multiline ? 'rd-system-path-row__text--multiline' : '',
    scrollable ? 'rd-system-path-row__text--scroll custom-scrollbar' : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div className={`rd-system-path-row ${className}`.trim()}>
      {label ? <span className="rd-system-path-row__label">{label}</span> : null}
      <div className="rd-system-path-row__body">
        <code className={textClass} title={text}>
          {text}
        </code>
        <button
          type="button"
          className={`rd-system-path-row__btn${copied ? ' is-copied' : ''}`}
          onClick={() => void onCopy()}
          title={copyTitle}
        >
          {copied ? (
            <>
              <CheckCircle2 className="h-3 w-3" />
              已复制
            </>
          ) : (
            <>
              <Copy className="h-3 w-3" />
              复制
            </>
          )}
        </button>
      </div>
    </div>
  );
}

function truncateText(text: string, maxLen: number): string {
  const t = text.trim();
  if (t.length <= maxLen) return t;
  return `${t.slice(0, maxLen)}…`;
}

type RowRecord = Record<string, unknown>;

function asRows(value: unknown): RowRecord[] {
  return Array.isArray(value) ? value.filter((r): r is RowRecord => !!r && typeof r === 'object') : [];
}

function HeroBanner({
  gradient,
  icon,
  title,
  subtitle,
  stats,
}: {
  gradient: string;
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  stats: { label: string; value: string | number }[];
}) {
  return (
    <div className={`rd-system-hero ${gradient}`}>
      <div className="rd-system-hero__glow" />
      <div className="rd-system-hero__body">
        <div className="rd-system-hero__icon">{icon}</div>
        <div className="min-w-0 flex-1">
          <h3 className="rd-system-hero__title">{title}</h3>
          <p className="rd-system-hero__subtitle">{subtitle}</p>
        </div>
      </div>
      {stats.length > 0 ? (
        <div className="rd-system-hero__stats">
          {stats.map((s) => (
            <div key={s.label} className="rd-system-hero__stat">
              <span className="rd-system-hero__stat-value">{s.value}</span>
              <span className="rd-system-hero__stat-label">{s.label}</span>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

const SPLIT_STATUS_LABEL: Record<string, string> = {
  ok: '成功',
  failed: '失败',
  skipped: '跳过',
  pending: '待执行',
  partial: '部分成功',
};

export function SystemAutoSplitCard({
  payload,
  variant = 'summary',
}: {
  payload: Record<string, unknown>;
  /** summary：协作会议流仅展示执行摘要；detail：节点详情展示完整拆单明细 */
  variant?: 'summary' | 'detail';
}) {
  const display = (payload.display as Record<string, unknown>) || payload;
  const tasks = asRows(display.tasks);
  const errors = (display.errors as string[]) || [];
  const status = String(display.status || payload.status || '—');
  const planCount = Number(display.plan_count ?? tasks.length);
  const okCount = Number(
    display.ok_count ?? tasks.filter((t) => String(t.create_status || '') === 'ok').length,
  );
  const failCount = Number(
    display.fail_count
      ?? tasks.filter((t) => ['failed', 'skipped'].includes(String(t.create_status || ''))).length,
  );
  const createdTaskNos = useMemo(
    () =>
      tasks
        .filter((t) => String(t.create_status || '') === 'ok')
        .map((t) => String(t.task_no || '').trim())
        .filter(Boolean),
    [tasks],
  );

  const heroTitle =
    status === 'failed'
      ? '自动拆单失败'
      : status === 'partial'
        ? '自动拆单部分成功'
        : status === 'ok'
          ? '自动拆单成功'
          : '自动拆单';

  const summaryLine = useMemo(() => {
    if (variant === 'summary') {
      if (!planCount) return '未找到方案评审拆单计划，无法执行自动拆单。';
      if (status === 'failed') return `计划 ${planCount} 条研发子单，均未创建成功。`;
      if (status === 'partial') {
        return `计划 ${planCount} 条研发子单，成功 ${okCount} 条，失败 ${failCount} 条。`;
      }
      return `已按计划创建 ${okCount} 条研发子单，拆单明细见方案评审或节点详情。`;
    }
    if (!planCount) return '未找到方案评审拆单计划。';
    if (status === 'failed') return `计划 ${planCount} 条研发子单，均未创建成功。`;
    if (status === 'partial') {
      return `计划 ${planCount} 条研发子单，成功 ${okCount} 条，失败 ${failCount} 条。`;
    }
    return `已按计划创建 ${okCount} 条研发子单。`;
  }, [planCount, okCount, failCount, status, variant]);

  return (
    <div className="rd-chat-card rd-chat-card--system-split">
      <HeroBanner
        gradient="rd-system-hero--split"
        icon={<ListTree className="h-6 w-6" />}
        title={heroTitle}
        subtitle={summaryLine}
        stats={[
          { label: '计划', value: planCount },
          { label: '成功', value: okCount },
          { label: '失败', value: failCount },
        ]}
      />

      {errors.length > 0 ? (
        <ul className="mt-3 space-y-1 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-[11px] text-red-300">
          {errors.map((err) => (
            <li key={err} className="flex items-start gap-2">
              <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              {err}
            </li>
          ))}
        </ul>
      ) : null}

      {variant === 'summary' && createdTaskNos.length > 0 ? (
        <p className="mt-3 text-[11px] text-muted-foreground">
          研发子单号：
          <span className="ml-1 font-mono text-indigo-300">{createdTaskNos.join('、')}</span>
        </p>
      ) : null}

      {variant === 'detail' ? (
      <div className="mt-4">
        {tasks.length === 0 ? (
          <p className="rd-chat-card__desc text-center py-6">暂无拆单任务</p>
        ) : (
          <>
            <div className="mb-2 flex items-center gap-2 text-[11px] font-semibold text-foreground/90">
              <ListTree className="h-3.5 w-3.5 text-indigo-400" />
              拆单详情
            </div>
            <ul className="rd-system-sandbox-list">
              {tasks.map((task, idx) => (
                <SplitTaskDetailRow key={`plan-${String(task.plan_index ?? idx)}`} task={task} index={idx} />
              ))}
            </ul>
          </>
        )}
      </div>
      ) : null}
    </div>
  );
}

function asStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((x) => String(x).trim()).filter(Boolean);
}

function FunctionPointsHoverBlock({
  points,
  moduleName,
  branchVersion,
  patchName,
}: {
  points: string[];
  moduleName?: string;
  branchVersion?: string;
  patchName?: string;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const offsetRef = useRef(0);
  const rafRef = useRef(0);
  const runningRef = useRef(false);
  const lastTsRef = useRef<number | null>(null);
  const loopItems = useMemo(() => [...points, ...points], [points]);
  const loopDurationSec = Math.max(points.length * 2.6, 10);
  const pointsKey = useMemo(() => points.join('\u0000'), [points]);
  const loopHalfRef = useRef(0);

  const applyTransform = useCallback(() => {
    const track = trackRef.current;
    if (!track) return;
    track.style.transform = `translate3d(0, ${-offsetRef.current}px, 0)`;
  }, []);

  const measureLoopHalf = useCallback(() => {
    const track = trackRef.current;
    if (!track) return loopHalfRef.current;
    const half = track.scrollHeight / 2;
    if (half > 0) loopHalfRef.current = half;
    return loopHalfRef.current;
  }, []);

  const tick = useCallback(
    (ts: number) => {
      if (!runningRef.current) return;
      const half = measureLoopHalf();
      if (half > 0) {
        const last = lastTsRef.current ?? ts;
        const dt = Math.min((ts - last) / 1000, 0.05);
        lastTsRef.current = ts;
        const speed = half / loopDurationSec;
        offsetRef.current += speed * dt;
        if (offsetRef.current >= half) offsetRef.current -= half;
        const track = trackRef.current;
        if (track) {
          track.style.transform = `translate3d(0, ${-offsetRef.current}px, 0)`;
        }
      }
      rafRef.current = requestAnimationFrame(tick);
    },
    [loopDurationSec, measureLoopHalf],
  );

  useEffect(() => {
    offsetRef.current = 0;
    loopHalfRef.current = 0;
    applyTransform();
  }, [pointsKey, applyTransform]);

  useEffect(() => {
    return () => {
      runningRef.current = false;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  const onEnter = () => {
    runningRef.current = true;
    lastTsRef.current = null;
    applyTransform();
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(() => {
      measureLoopHalf();
      applyTransform();
      rafRef.current = requestAnimationFrame(tick);
    });
  };

  const onLeave = () => {
    runningRef.current = false;
    lastTsRef.current = null;
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
  };

  return (
    <div
      className="rd-system-fp-hover-block mt-2"
      onMouseEnter={onEnter}
      onMouseLeave={onLeave}
    >
      <div className="rd-system-split-table__chips">
        {moduleName ? (
          <span className="rd-system-chip rd-system-chip--module">
            <Layers className="h-3 w-3" />
            {moduleName}
          </span>
        ) : null}
        {branchVersion ? (
          <span className="rd-system-chip">
            <GitBranch className="h-3 w-3" />
            {branchVersion}
          </span>
        ) : null}
        {patchName ? (
          <span className="rd-system-chip">
            <Tag className="h-3 w-3" />
            {patchName}
          </span>
        ) : null}
        <span className="rd-system-chip rd-system-chip--muted rd-system-fp-chip">
          {points.length} 个功能点
        </span>
      </div>
      <div className="rd-system-fp-ticker-slot">
        <div className="rd-system-fp-ticker">
          <div className="rd-system-fp-ticker__viewport">
            <div ref={trackRef} className="rd-system-fp-ticker__track">
              {loopItems.map((fp, i) => (
                <div key={`${i}-${fp}`} className="rd-system-fp-ticker__item">
                  <span className="rd-system-fp-ticker__index">{(i % points.length) + 1}</span>
                  <span className="rd-system-fp-ticker__text">{fp}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function SplitTaskDetailRow({ task, index }: { task: RowRecord; index: number }) {
  const createStatus = String(task.create_status || 'pending');
  const portalNo = String(task.task_no || '').trim();
  const isOk = createStatus === 'ok';
  const isFailed = createStatus === 'failed';
  const statusLabel = SPLIT_STATUS_LABEL[createStatus] || createStatus;
  const taskError = String(task.error || '').trim();
  const description = String(task.comments || task.task_desc || '').trim();
  const functionPoints = useMemo(() => asStringList(task.function_points), [task.function_points]);

  return (
    <motion.li
      className={`rd-system-sandbox-row${isOk ? ' is-ok' : isFailed ? ' is-warn' : ''}`}
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.04 }}
    >
      <div className="rd-system-sandbox-row__head">
        <span className="rd-system-sandbox-row__index">{index + 1}</span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h4 className="rd-system-sandbox-row__title">{String(task.task_title || '（无标题）')}</h4>
            {portalNo ? <span className="rd-system-sandbox-row__task-no">{portalNo}</span> : null}
          </div>
          {functionPoints.length > 0 ? (
            <FunctionPointsHoverBlock
              points={functionPoints}
              moduleName={String(task.product_module_name || '').trim() || undefined}
              branchVersion={String(task.branch_version || '').trim() || undefined}
              patchName={String(task.patch_name || '').trim() || undefined}
            />
          ) : (
            <div className="mt-2">
              <div className="rd-system-split-table__chips">
                {task.product_module_name ? (
                  <span className="rd-system-chip rd-system-chip--module">
                    <Layers className="h-3 w-3" />
                    {String(task.product_module_name)}
                  </span>
                ) : null}
                {task.branch_version ? (
                  <span className="rd-system-chip">
                    <GitBranch className="h-3 w-3" />
                    {String(task.branch_version)}
                  </span>
                ) : null}
                {task.patch_name ? (
                  <span className="rd-system-chip">
                    <Tag className="h-3 w-3" />
                    {String(task.patch_name)}
                  </span>
                ) : null}
              </div>
            </div>
          )}
          {description ? (
            <p className="rd-system-sandbox-row__desc whitespace-pre-wrap mt-2">{description}</p>
          ) : null}
        </div>
        <div className="rd-system-sandbox-row__status">
          <span className={`inline-flex items-center gap-1 text-[11px] ${isOk ? 'text-emerald-400' : isFailed ? 'text-red-400' : 'text-amber-400'}`}>
            {isOk ? <CheckCircle2 className="h-3.5 w-3.5" /> : <AlertCircle className="h-3.5 w-3.5" />}
            <StatusBadge status={statusLabel} />
          </span>
        </div>
      </div>
      {!portalNo ? (
        <p className="rd-system-sandbox-row__empty">尚未生成研发子单号</p>
      ) : null}
      {task.sop_node || task.local_process_state ? (
        <div className="rd-system-split-table__meta mt-2">
          {task.sop_node ? <span>SOP · {String(task.sop_node)}</span> : null}
          {task.local_process_state ? <span>{String(task.local_process_state)}</span> : null}
        </div>
      ) : null}
      {taskError ? <p className="rd-system-split-table__error mt-2">{taskError}</p> : null}
    </motion.li>
  );
}

function RepoRow({ repo, index }: { repo: RowRecord; index: number }) {
  const status = String(repo.git_status || repo.status || '—');
  const ok = status === 'ok';
  const engineeringPath = String(repo.engineering_path || repo.local_path || '');
  const repoRoot = String(repo.local_path || '');
  return (
    <motion.li
      className="rd-system-repo-card"
      initial={{ opacity: 0, x: -6 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: index * 0.04 }}
    >
      <div className="rd-system-repo-card__icon">
        <FolderGit2 className="h-5 w-5" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="rd-system-repo-card__name">{String(repo.repo_name || 'repository')}</span>
          <StatusBadge status={status} />
          {ok ? <Sparkles className="h-3.5 w-3.5 text-emerald-400" /> : null}
        </div>
        <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[10px] text-muted-foreground">
          {repo.repo_module ? <span>模块 {String(repo.repo_module)}</span> : null}
          {repo.repo_branch ? <span>分支 {String(repo.repo_branch)}</span> : null}
          {repo.code_path ? <span>工程 /{String(repo.code_path)}</span> : null}
        </div>
        {repo.repo_url ? (
          <p className="mt-1 truncate text-[10px] text-slate-500">{String(repo.repo_url)}</p>
        ) : null}
        {engineeringPath ? (
          <div className="mt-2">
            <CopyPath value={engineeringPath} label="工程路径" />
          </div>
        ) : null}
        {repoRoot && repoRoot !== engineeringPath ? (
          <div className="mt-1.5">
            <CopyPath value={repoRoot} label="仓库根目录" />
          </div>
        ) : null}
        {repo.error ? <p className="mt-1 text-[10px] text-red-400">{String(repo.error)}</p> : null}
      </div>
    </motion.li>
  );
}

function SandboxTaskRow({ binding, index }: { binding: RowRecord; index: number }) {
  const matchedRepos = asRows(binding.repos);
  const unmatched = String(binding.match_status || '') === 'unmatched';
  const noModule = String(binding.match_status || '') === 'no_module';
  const taskNo = String(binding.task_no || '').trim();
  const comments = String(binding.comments || '').trim();
  const fpCount = Number(binding.function_point_count || 0);
  const key = `plan-${String(binding.plan_index ?? index)}`;

  return (
    <motion.li
      className={`rd-system-sandbox-row${unmatched || noModule ? ' is-warn' : ' is-ok'}`}
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.04 }}
    >
      <div className="rd-system-sandbox-row__head">
        <span className="rd-system-sandbox-row__index">{index + 1}</span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h4 className="rd-system-sandbox-row__title">{String(binding.task_title || '（无标题）')}</h4>
            {taskNo ? <span className="rd-system-sandbox-row__task-no">{taskNo}</span> : null}
          </div>
          <div className="rd-system-split-table__chips mt-2">
            {binding.product_module_name ? (
              <span className="rd-system-chip rd-system-chip--module">
                <Layers className="h-3 w-3" />
                {String(binding.product_module_name)}
              </span>
            ) : null}
            {binding.branch_version ? (
              <span className="rd-system-chip">
                <GitBranch className="h-3 w-3" />
                {String(binding.branch_version)}
              </span>
            ) : null}
            {binding.patch_name ? (
              <span className="rd-system-chip">
                <Tag className="h-3 w-3" />
                {String(binding.patch_name)}
              </span>
            ) : null}
            {fpCount > 0 ? (
              <span className="rd-system-chip rd-system-chip--muted">{fpCount} 个功能点</span>
            ) : null}
          </div>
          {comments ? <p className="rd-system-sandbox-row__desc">{truncateText(comments, 180)}</p> : null}
        </div>
        <div className="rd-system-sandbox-row__status">
          {unmatched || noModule ? (
            <span className="inline-flex items-center gap-1 text-amber-400 text-[11px]">
              <AlertCircle className="h-3.5 w-3.5" />
              {noModule ? '缺少模块' : '未匹配代码库'}
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 text-emerald-400 text-[11px]">
              <CheckCircle2 className="h-3.5 w-3.5" />
              已挂钩
            </span>
          )}
        </div>
      </div>

      {matchedRepos.length > 0 ? (
        <ul className="rd-system-sandbox-row__repos">
          {matchedRepos.map((repo, rIdx) => {
            const engPath = String(repo.engineering_path || repo.local_path || '');
            return (
              <li key={`${key}-repo-${rIdx}`} className="rd-system-sandbox-row__repo">
                <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-200">
                  <FolderGit2 className="h-3.5 w-3.5 text-cyan-400" />
                  <span className="font-medium">{String(repo.repo_name || 'repo')}</span>
                  {repo.repo_branch ? <span className="text-muted-foreground">{String(repo.repo_branch)}</span> : null}
                  <StatusBadge status={String(repo.git_status || repo.status || '—')} />
                </div>
                {engPath ? <CopyPath value={engPath} label="工程路径" /> : null}
                {repo.code_path ? (
                  <p className="text-[10px] text-muted-foreground mt-1">相对路径 /{String(repo.code_path)}</p>
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="rd-system-sandbox-row__empty">未找到与该任务模块匹配的沙箱代码仓库</p>
      )}
    </motion.li>
  );
}

export function SystemSandboxBuildCard({
  payload,
  variant = 'summary',
}: {
  payload: Record<string, unknown>;
  /** summary：协作会议流仅展示执行摘要；detail：节点详情展示完整挂钩与路径 */
  variant?: 'summary' | 'detail';
}) {
  const display = (payload.display as Record<string, unknown>) || payload;
  const bindings = asRows(display.task_bindings);
  const repos = asRows(display.repos);
  const errors = (display.errors as string[]) || [];
  const sandboxRoot = String(display.sandbox_root || payload.sandbox_root || '');
  const status = String(display.status || payload.status || '—');
  const prod = String(display.prod || payload.prod || '');
  const planCount = Number(display.plan_count ?? bindings.length);
  const okRepos = repos.filter((r) => String(r.status) === 'ok').length;
  const linkedCount = bindings.filter((b) => String(b.match_status) === 'ok').length;

  const heroTitle =
    status === 'failed' ? '沙箱构建失败' : status === 'partial' ? '沙箱构建部分成功' : '沙箱构建完成';

  const summaryLine = useMemo(() => {
    if (variant === 'summary') {
      if (!planCount && !repos.length) return '尚未拉取沙箱代码，请确认产品 catalog 与 git 远程配置。';
      if (status === 'failed') return '沙箱代码未全部落盘，请查看错误信息或节点详情。';
      if (status === 'partial') {
        return `代码仓库 ${okRepos}/${repos.length} 个落盘成功；子单挂钩 ${linkedCount}/${planCount || bindings.length} 条。明细见节点详情。`;
      }
      if (planCount) {
        return `已将 ${okRepos} 个代码仓库落盘至沙箱，${linkedCount} 条研发子单已挂钩工程路径。明细见节点详情。`;
      }
      return `已将 ${okRepos}/${repos.length} 个代码仓库落盘至沙箱，工程路径见节点详情。`;
    }
    if (!planCount && !repos.length) return '尚未拉取沙箱代码，请确认产品 catalog 与 git 远程配置。';
    if (planCount) {
      return `split_plan ${planCount} 条任务，${linkedCount}/${planCount} 条已挂钩沙箱工程路径；代码仓库 ${okRepos}/${repos.length} 个落盘成功。`;
    }
    return `已将 ${okRepos}/${repos.length} 个代码仓库落盘至沙箱。`;
  }, [planCount, linkedCount, okRepos, repos.length, status, variant, bindings.length]);

  return (
    <div className="rd-chat-card rd-chat-card--system-sandbox">
      <HeroBanner
        gradient="rd-system-hero--sandbox"
        icon={<FolderGit2 className="h-6 w-6" />}
        title={heroTitle}
        subtitle={summaryLine}
        stats={[
          { label: '计划', value: planCount || bindings.length },
          { label: '已挂钩', value: linkedCount },
          { label: '仓库', value: `${okRepos}/${repos.length}` },
        ]}
      />

      {variant === 'summary' && sandboxRoot ? (
        <div className="mt-3 rd-system-sandbox-root">
          <CopyPath value={sandboxRoot} label="沙箱根目录" />
          {prod ? <div className="mt-1.5 text-[10px] text-muted-foreground">产品 · {prod}</div> : null}
        </div>
      ) : null}

      {variant === 'detail' ? (
        <>
          <div className="mt-3 rd-system-sandbox-root">
            <CopyPath value={sandboxRoot} label="沙箱根目录" />
            {prod ? <div className="mt-1.5 text-[10px] text-muted-foreground">产品 · {prod}</div> : null}
          </div>

          {errors.length > 0 ? (
            <ul className="mt-3 space-y-1 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-[11px] text-red-300">
              {errors.map((err) => (
                <li key={err}>{err}</li>
              ))}
            </ul>
          ) : null}

          {bindings.length > 0 ? (
            <div className="mt-4">
              <div className="mb-2 flex items-center gap-2 text-[11px] font-semibold text-foreground/90">
                <Package className="h-3.5 w-3.5 text-indigo-400" />
                split_plan 任务 → 沙箱工程路径
              </div>
              <ul className="rd-system-sandbox-list">
                {bindings.map((binding, idx) => (
                  <SandboxTaskRow
                    key={`sandbox-plan-${String(binding.plan_index ?? idx)}`}
                    binding={binding}
                    index={idx}
                  />
                ))}
              </ul>
            </div>
          ) : repos.length > 0 ? (
            <div className="mt-4">
              <div className="mb-2 flex items-center gap-2 text-[11px] font-semibold text-foreground/90">
                <FolderGit2 className="h-3.5 w-3.5 text-cyan-400" />
                已下载代码仓库
              </div>
              <ul className="space-y-2">
                {repos.map((row, idx) => (
                  <RepoRow key={`${String(row.repo_name)}-${idx}`} repo={row} index={idx} />
                ))}
              </ul>
            </div>
          ) : null}
        </>
      ) : null}

      {variant === 'summary' && errors.length > 0 ? (
        <ul className="mt-3 space-y-1 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-[11px] text-red-300">
          {errors.map((err) => (
            <li key={err}>{err}</li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

const CATEGORY_LABEL: Record<string, string> = {
  dev_template: 'dev 模板/规范',
  work_order_doc: '工单归档文档',
  catalog_doc: 'catalog 文档',
  entropy: '控熵文件',
  product_doc: '产品文档',
};

function PathGroupBlock({ group }: { group: RowRecord }) {
  const [open, setOpen] = useState(true);
  const entries = asRows(group.entries);
  const root = String(group.engineering_root || '—');
  const module = String(group.module || '');
  const codePath = String(group.code_path || '');

  return (
    <li className="rounded-lg border border-slate-700/60 bg-slate-900/40 overflow-hidden">
      <button
        type="button"
        className="flex w-full items-start gap-2 px-3 py-2 text-left text-[11px] hover:bg-slate-800/50"
        onClick={() => setOpen((v) => !v)}
      >
        {open ? (
          <ChevronDown className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        ) : (
          <ChevronRight className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        )}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <FolderTree className="h-3.5 w-3.5 text-indigo-400" />
            {module ? <span className="rd-chat-card__tag">{module}</span> : null}
            {codePath ? <span className="text-muted-foreground">/{codePath}</span> : null}
            <span className="text-muted-foreground">({entries.length} 项)</span>
          </div>
          <CopyPath value={root} />
        </div>
      </button>
      {open ? (
        <ul className="border-t border-slate-700/50 px-3 py-2 space-y-1.5">
          {entries.map((entry, idx) => (
            <li key={`${root}-${idx}`} className="text-[10px]">
              <div className="flex flex-wrap items-center gap-2">
                <StatusBadge status={String(entry.status || 'ok')} />
                <span className="text-slate-400">
                  {CATEGORY_LABEL[String(entry.category || '')] || String(entry.category || '文件')}
                </span>
                <span className="text-slate-300">{String(entry.label || '')}</span>
              </div>
              <CopyPath value={String(entry.path || '')} />
            </li>
          ))}
        </ul>
      ) : null}
    </li>
  );
}

export function SystemEnvPregenCard({
  payload,
  roomId,
  scopeId,
  synapseApiBase,
  variant = 'summary',
}: {
  payload: Record<string, unknown>;
  roomId?: string;
  scopeId?: string;
  synapseApiBase?: string;
  /** summary：协作会议流仅展示摘要卡片；detail：节点详情展示四类文档与预览 */
  variant?: 'summary' | 'detail';
}) {
  const display = (payload.display as Record<string, unknown>) || payload;
  const docs = useMemo(() => collectEnvPregenDocs(display, scopeId || ''), [display, scopeId]);
  const errors = useMemo(
    () =>
      ((display.errors as string[]) || []).filter(
        (err) => err && !String(err).startsWith('控熵'),
      ),
    [display.errors],
  );
  const okCount = docs.filter((d) => d.status === 'ok').length;
  const status = String(display.status || '—');

  const summaryLine = useMemo(() => {
    if (!docs.length) return '暂无预生成文档，请等待环境预生成完成。';
    if (status === 'failed') return `预生成失败，共 ${docs.length} 项文档未全部落盘。`;
    if (status === 'partial') return `已预生成 ${okCount}/${docs.length} 篇文档，明细见节点详情。`;
    return `已完成 ${docs.length} 篇文档预生成，明细见节点详情。`;
  }, [docs.length, okCount, status]);

  return (
    <div className="rd-chat-card rd-chat-card--meta">
      <HeroBanner
        gradient="rd-system-hero--env"
        icon={<Server className="h-6 w-6" />}
        title="环境预生成"
        subtitle={summaryLine}
        stats={[
          { label: '文档总数', value: docs.length },
          { label: '已落盘', value: okCount },
          { label: '状态', value: status },
        ]}
      />

      {errors.length > 0 ? (
        <ul className="mt-2 space-y-1 text-[11px] text-red-400">
          {errors.map((err) => (
            <li key={err}>{err}</li>
          ))}
        </ul>
      ) : null}

      {variant === 'detail' ? (
        <div className="mt-4">
          <EnvPregenDocsPanel
            display={display}
            scopeId={scopeId}
            roomId={roomId}
            synapseApiBase={synapseApiBase}
          />
        </div>
      ) : null}
    </div>
  );
}

export function SystemCodeCommitCard({
  payload,
  variant = 'summary',
}: {
  payload: Record<string, unknown>;
  /** summary：协作会议流仅展示摘要；detail：节点详情展示进度与试飞明细 */
  variant?: 'summary' | 'detail';
}) {
  const display = (payload.display as Record<string, unknown>) || payload;
  const tasks = asRows(display.tasks);
  const flight = (display.flight as RowRecord) || {};
  const summary = (display.summary as RowRecord) || {};
  const errors = (display.errors as string[]) || [];
  const progress = (display.progress as RowRecord) || {};
  const stepStates = useMemo(() => resolveCodeCommitStepStates(display), [display]);
  const summaryLine = useMemo(() => codeCommitSummaryLine(display), [display]);
  const status = String(display.status || '—');
  const flights = useMemo(() => collectCodeCommitFlights(display), [display]);
  const flightDoneCount = flights.filter((f) =>
    ['ok', 'failed', 'timeout', 'skipped'].includes(f.flightStatus),
  ).length;

  return (
    <div className="rd-chat-card rd-chat-card--meta">
      <HeroBanner
        gradient="rd-system-hero--sandbox"
        icon={<GitBranch className="h-6 w-6" />}
        title="代码提交"
        subtitle={summaryLine}
        stats={[
          { label: '子单', value: String(summary.total ?? tasks.length) },
          { label: '提交', value: String(summary.commit_ok ?? '—') },
          { label: '试飞', value: String(flight.status || status || '—') },
        ]}
      />

      <CodeCommitProgressSteps stepStates={stepStates} />

      {progress.message ? (
        <p className="mt-2 mb-0 text-[11px] text-primary/80">{String(progress.message)}</p>
      ) : null}

      {errors.length > 0 && variant === 'summary' ? (
        <ul className="mt-2 space-y-1 text-[11px] text-red-400">
          {errors.map((err) => (
            <li key={err}>{err}</li>
          ))}
        </ul>
      ) : null}

      {variant === 'summary' && tasks.length > 0 ? (
        <p className="mt-2 mb-0 text-[10px] text-muted-foreground">
          试飞进度 {flightDoneCount}/{flights.length || tasks.length} · 明细见节点详情
        </p>
      ) : null}

      {variant === 'detail' ? (
        <div className="mt-4">
          <CodeCommitFlightPanel display={display} />
        </div>
      ) : null}
    </div>
  );
}

const TASK_EXEC_PHASE_LABEL: Record<string, string> = {
  develop: '开发轮',
  verify: '完成检测轮',
};

export function SystemTaskExecCard({ payload }: { payload: Record<string, unknown> }) {
  const phase = String(payload.phase || 'develop');
  const phaseLabel = TASK_EXEC_PHASE_LABEL[phase] || phase;
  const taskNo = String(payload.task_no || '—');
  const taskTitle = String(payload.task_title || '').trim();
  const taskIndex = Number(payload.task_index || 0);
  const taskTotal = Number(payload.task_total || 0);
  const progress =
    taskIndex > 0 && taskTotal > 0 ? `${taskIndex}/${taskTotal}` : '—';

  return (
    <div className="rd-chat-card rd-chat-card--meta">
      <HeroBanner
        gradient="rd-system-hero--split"
        icon={<Terminal className="h-6 w-6" />}
        title={`Cursor Agent · ${phaseLabel}`}
        subtitle="任务执行节点 Cursor Agent 开发轮启动信息。"
        stats={[
          { label: '工单', value: taskNo },
          { label: '进度', value: progress },
          { label: '模型', value: String(payload.cli_model || '—') },
        ]}
      />
      {taskTitle ? (
        <p className="text-[11px] text-muted-foreground mt-2 mb-0 truncate" title={taskTitle}>
          {taskTitle}
        </p>
      ) : null}
      <div className="mt-3 space-y-1">
        <CopyPath label="工作区" value={String(payload.sandbox_path || '')} />
        {payload.func_doc ? <CopyPath label="函数级方案" value={String(payload.func_doc)} /> : null}
        {payload.acceptance_doc ? (
          <CopyPath label="验收标准" value={String(payload.acceptance_doc)} />
        ) : null}
      </div>
    </div>
  );
}

export function SystemTaskCheckCard({ payload }: { payload: Record<string, unknown> }) {
  const display = (payload.display as Record<string, unknown>) || payload;
  const analysis = (display.analysis as RowRecord) || {};
  const errors = (display.errors as string[]) || [];
  const blocked = Boolean(display.ai_processing_blocked);

  return (
    <div className="rd-chat-card rd-chat-card--meta">
      <HeroBanner
        gradient={blocked ? 'rd-system-hero--split' : 'rd-system-hero--env'}
        icon={<AlertCircle className="h-6 w-6" />}
        title="任务检查"
        subtitle="试飞级与需求方案级分析结果。"
        stats={[
          { label: '结论', value: String(display.outcome || '—') },
          { label: '未通过次数', value: String(display.fail_count ?? 0) },
          { label: '状态', value: String(display.status || '—') },
        ]}
      />
      {display.redirect_to_node ? (
        <div className="mt-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[11px] text-amber-200">
          引导至节点：<span className="font-medium">{String(display.redirect_to_node)}</span>
          {display.redirect_reason ? <p className="mt-1 text-amber-100/90">{String(display.redirect_reason)}</p> : null}
        </div>
      ) : null}
      {blocked ? (
        <div className="mt-2 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-[11px] text-red-300">
          同一子单任务检查已连续三次未通过，AI 处理已禁止，请人工介入。
        </div>
      ) : null}
      {errors.length > 0 ? (
        <ul className="mt-2 space-y-1 text-[11px] text-red-400">
          {errors.map((err) => (
            <li key={err}>{err}</li>
          ))}
        </ul>
      ) : null}
      <dl className="rd-chat-card__kv mt-3">
        <dt>功能完整</dt>
        <dd>{analysis.feature_complete ? '是' : '否'}</dd>
        <dt>试飞通过</dt>
        <dd>{analysis.flight_ok ? '是' : '否'}</dd>
      </dl>
    </div>
  );
}

export function SystemExecCard({ payload }: { payload: Record<string, unknown> }) {
  const repos = (payload.repos as Record<string, unknown>[]) || [];
  return (
    <div className="rd-chat-card rd-chat-card--meta">
      <SectionTitle icon={<Server className="w-4 h-4" />}>系统节点执行结果</SectionTitle>
      <dl className="rd-chat-card__kv">
        <dt>状态</dt>
        <dd>{String(payload.status || '—')}</dd>
        <dt>沙箱目录</dt>
        <dd>
          <CopyPath value={String(payload.sandbox_root || '')} />
        </dd>
        {payload.prod ? (
          <>
            <dt>产品</dt>
            <dd>{String(payload.prod)}</dd>
          </>
        ) : null}
        {payload.error ? (
          <>
            <dt>错误</dt>
            <dd className="text-red-400">{String(payload.error)}</dd>
          </>
        ) : null}
      </dl>
      {repos.length > 0 ? (
        <ul className="space-y-2 mt-3 mb-0">
          {repos.map((row, idx) => (
            <RepoRow key={`${row.repo_name}-${idx}`} repo={row} index={idx} />
          ))}
        </ul>
      ) : null}
    </div>
  );
}

export const SYSTEM_STRUCTURED_NODE_IDS = [
  'auto_split',
  'sandbox_build',
  'env_pregen',
  'exception_check',
  'env_start',
] as const;

export function SystemNodeDetailCard({
  nodeId,
  display,
  roomId,
  scopeId,
  synapseApiBase,
}: {
  nodeId: string;
  display: Record<string, unknown>;
  roomId?: string;
  scopeId?: string;
  synapseApiBase?: string;
}) {
  const payload = { ...display, display };
  switch (nodeId) {
    case 'auto_split':
      return <SystemAutoSplitCard payload={payload} variant="detail" />;
    case 'sandbox_build':
      return <SystemSandboxBuildCard payload={payload} variant="detail" />;
    case 'env_pregen':
      return (
        <SystemEnvPregenCard
          payload={payload}
          roomId={roomId}
          scopeId={scopeId}
          synapseApiBase={synapseApiBase}
          variant="detail"
        />
      );
    case 'exception_check':
      return <SystemCodeCommitCard payload={payload} variant="detail" />;
    case 'env_start':
      return <SystemTaskCheckCard payload={payload} />;
    default:
      return <SystemExecCard payload={payload} />;
  }
}
