import React, { useMemo, useState } from 'react';
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
} from 'lucide-react';

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
  const ok = s === 'ok' || s === 'completed' || s === 'planned';
  const partial = s === 'partial';
  const cls = ok
    ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
    : partial
      ? 'bg-amber-500/15 text-amber-400 border-amber-500/30'
      : s === 'failed'
        ? 'bg-red-500/15 text-red-400 border-red-500/30'
        : 'bg-slate-500/15 text-slate-300 border-slate-500/30';
  return (
    <span className={`inline-flex items-center rounded border px-1.5 py-0.5 text-[10px] font-medium ${cls}`}>
      {s}
    </span>
  );
}

function CopyPath({ value, className = '' }: { value?: string; className?: string }) {
  const text = String(value || '').trim();
  const [copied, setCopied] = useState(false);
  if (!text) return <span className="text-muted-foreground">—</span>;

  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      /* ignore */
    }
  };

  return (
    <span className={`rd-system-path ${className}`}>
      <code className="rd-system-path__text">{text}</code>
      <button type="button" className="rd-system-path__copy" onClick={() => void onCopy()} title="复制路径">
        {copied ? <CheckCircle2 className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3" />}
      </button>
    </span>
  );
}

type RowRecord = Record<string, unknown>;

function asRows(value: unknown): RowRecord[] {
  return Array.isArray(value) ? value.filter((r): r is RowRecord => !!r && typeof r === 'object') : [];
}

const SOURCE_LABEL: Record<string, string> = {
  create_task: '门户创建',
  split_plan: '评审计划',
  userwork: '本地子单',
  local: '本地登记',
};

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

export function SystemAutoSplitCard({ payload }: { payload: Record<string, unknown> }) {
  const display = (payload.display as Record<string, unknown>) || payload;
  const tasks = asRows(display.tasks?.length ? display.tasks : display.local_tasks);
  const errors = (display.errors as string[]) || [];
  const demandNo = String(display.demand_no || '—');
  const status = String(display.status || payload.status || '—');
  const okCount = tasks.filter((t) => ['ok', 'planned', 'local'].includes(String(t.create_status || ''))).length;

  const summaryLine = useMemo(() => {
    if (!tasks.length) return '尚未生成研发子单，请确认方案评审拆单计划与 create_task 是否成功。';
    const modules = [...new Set(tasks.map((t) => String(t.product_module_name || '').trim()).filter(Boolean))];
    const modHint = modules.length ? `，覆盖 ${modules.length} 个应用模块` : '';
    return `已从需求单 ${demandNo !== '—' ? demandNo : '（当前工单）'} 拆出 ${tasks.length} 张研发子单${modHint}。`;
  }, [tasks, demandNo]);

  return (
    <div className="rd-chat-card rd-chat-card--system-split">
      <HeroBanner
        gradient="rd-system-hero--split"
        icon={<ListTree className="h-6 w-6" />}
        title="自动拆单完成"
        subtitle={summaryLine}
        stats={[
          { label: '子单数', value: tasks.length },
          { label: '就绪', value: okCount },
          { label: '状态', value: status },
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

      <div className="mt-4">
        {tasks.length === 0 ? (
          <p className="rd-chat-card__desc text-center py-6">暂无子单数据</p>
        ) : (
          <div className="rd-system-task-grid">
            {tasks.map((task, idx) => {
              const taskNo = String(task.task_no || '—');
              const key = taskNo !== '—' ? taskNo : `task-${idx}`;
              const source = String(task.source || task.create_status || '');
              const sourceLabel = SOURCE_LABEL[source] || (source && source !== '—' ? source : '拆单');
              const isOk = ['ok', 'planned', 'local'].includes(String(task.create_status || ''));
              return (
                <motion.div
                  key={key}
                  className="rd-system-task-card"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: idx * 0.05, duration: 0.25 }}
                >
                  <div className="rd-system-task-card__head">
                    <span className="rd-system-task-card__no">{taskNo}</span>
                    <span className={`rd-system-task-card__status ${isOk ? 'is-ok' : ''}`}>
                      {isOk ? <CheckCircle2 className="h-3.5 w-3.5" /> : <AlertCircle className="h-3.5 w-3.5" />}
                      <StatusBadge status={String(task.create_status || source)} />
                    </span>
                  </div>
                  <p className="rd-system-task-card__title">{String(task.task_title || '（无标题）')}</p>
                  <div className="rd-system-task-card__tags">
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
                    <span className="rd-system-chip rd-system-chip--muted">{sourceLabel}</span>
                  </div>
                  {task.sop_node || task.local_process_state ? (
                    <div className="rd-system-task-card__meta">
                      {task.sop_node ? <span>SOP · {String(task.sop_node)}</span> : null}
                      {task.local_process_state ? <span>{String(task.local_process_state)}</span> : null}
                    </div>
                  ) : null}
                </motion.div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function RepoRow({ repo, index }: { repo: RowRecord; index: number }) {
  const status = String(repo.git_status || repo.status || '—');
  const ok = status === 'ok';
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
          {repo.code_path ? <span>工程路径 /{String(repo.code_path)}</span> : null}
        </div>
        {repo.repo_url ? (
          <p className="mt-1 truncate text-[10px] text-slate-500">{String(repo.repo_url)}</p>
        ) : null}
        <div className="mt-1.5">
          <CopyPath value={String(repo.local_path || '')} />
        </div>
        {repo.error ? <p className="mt-1 text-[10px] text-red-400">{String(repo.error)}</p> : null}
      </div>
    </motion.li>
  );
}

export function SystemSandboxBuildCard({ payload }: { payload: Record<string, unknown> }) {
  const display = (payload.display as Record<string, unknown>) || payload;
  const bindings = asRows(display.task_bindings);
  const repos = asRows(display.repos);
  const errors = (display.errors as string[]) || [];
  const sandboxRoot = String(display.sandbox_root || payload.sandbox_root || '');
  const status = String(display.status || payload.status || '—');
  const prod = String(display.prod || payload.prod || '');
  const okRepos = repos.filter((r) => String(r.status) === 'ok').length;

  const summaryLine = useMemo(() => {
    if (!repos.length) return '尚未拉取沙箱代码，请确认产品 catalog 与 git 远程配置。';
    return `已将 ${okRepos}/${repos.length} 个代码仓库落盘至沙箱，并与 ${bindings.length} 张研发子单完成挂钩。`;
  }, [repos.length, okRepos, bindings.length]);

  return (
    <div className="rd-chat-card rd-chat-card--system-sandbox">
      <HeroBanner
        gradient="rd-system-hero--sandbox"
        icon={<FolderGit2 className="h-6 w-6" />}
        title="沙箱构建完成"
        subtitle={summaryLine}
        stats={[
          { label: '仓库', value: `${okRepos}/${repos.length}` },
          { label: '子单挂钩', value: bindings.length },
          { label: '状态', value: status },
        ]}
      />

      <div className="mt-3 rounded-xl border border-cyan-500/20 bg-cyan-500/[0.06] px-3 py-2.5">
        <div className="text-[10px] font-semibold uppercase tracking-wider text-cyan-300/80">沙箱根目录</div>
        <CopyPath value={sandboxRoot} className="mt-1" />
        {prod ? <div className="mt-1.5 text-[10px] text-muted-foreground">产品 · {prod}</div> : null}
      </div>

      {errors.length > 0 ? (
        <ul className="mt-3 space-y-1 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-[11px] text-red-300">
          {errors.map((err) => (
            <li key={err}>{err}</li>
          ))}
        </ul>
      ) : null}

      {repos.length > 0 ? (
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

      {bindings.length > 0 ? (
        <div className="mt-4">
          <div className="mb-2 flex items-center gap-2 text-[11px] font-semibold text-foreground/90">
            <Package className="h-3.5 w-3.5 text-indigo-400" />
            研发子单 → 沙箱路径
          </div>
          <ul className="space-y-2">
            {bindings.map((binding, idx) => {
              const taskNo = String(binding.task_no || `binding-${idx}`);
              const matchedRepos = asRows(binding.repos);
              const unmatched = String(binding.match_status || '') === 'unmatched';
              return (
                <li key={taskNo} className="rd-system-binding-card">
                  <div className="flex flex-wrap items-center gap-2 text-[11px]">
                    <span className="font-mono text-sm font-semibold text-indigo-300">{taskNo}</span>
                    <span className="text-slate-200">{String(binding.task_title || '')}</span>
                    {binding.product_module_name ? (
                      <span className="rd-system-chip rd-system-chip--module">{String(binding.product_module_name)}</span>
                    ) : null}
                    {unmatched ? (
                      <span className="inline-flex items-center gap-1 text-amber-400">
                        <AlertCircle className="h-3 w-3" /> 未匹配代码库
                      </span>
                    ) : (
                      <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
                    )}
                  </div>
                  {matchedRepos.length > 0 ? (
                    <ul className="mt-2 space-y-1.5 border-l-2 border-indigo-500/30 pl-3">
                      {matchedRepos.map((repo, rIdx) => (
                        <li key={`${taskNo}-repo-${rIdx}`} className="text-[10px]">
                          <div className="flex flex-wrap items-center gap-2 text-slate-300">
                            <GitBranch className="h-3 w-3" />
                            <span className="font-medium">{String(repo.repo_name || 'repo')}</span>
                            {repo.repo_branch ? <span className="text-muted-foreground">{String(repo.repo_branch)}</span> : null}
                            <StatusBadge status={String(repo.git_status || repo.status || '—')} />
                          </div>
                          {repo.code_path ? (
                            <div className="mt-0.5 text-muted-foreground">工程 /{String(repo.code_path)}</div>
                          ) : null}
                          <CopyPath value={String(repo.local_path || '')} />
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </div>
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

export function SystemEnvPregenCard({ payload }: { payload: Record<string, unknown> }) {
  const display = (payload.display as Record<string, unknown>) || payload;
  const pathGroups = useMemo(() => {
    const grouped = asRows(display.path_groups);
    if (grouped.length) return grouped;
    const flat = asRows(display.path_entries);
    if (!flat.length) return [];
    const map = new Map<string, RowRecord>();
    for (const entry of flat) {
      const root =
        String(entry.engineering_root || '').trim() ||
        String(entry.path || '').replace(/[/\\][^/\\]+$/, '') ||
        '—';
      const bucket = map.get(root) || {
        engineering_root: root,
        module: entry.module || '',
        code_path: entry.code_path || '',
        entries: [] as RowRecord[],
      };
      bucket.entries.push(entry);
      map.set(root, bucket);
    }
    return Array.from(map.values());
  }, [display.path_groups, display.path_entries]);

  const errors = (display.errors as string[]) || [];
  const entropy = (display.entropy as RowRecord) || {};
  const fileCount = pathGroups.reduce((n, g) => n + asRows(g.entries).length, 0);

  return (
    <div className="rd-chat-card rd-chat-card--meta">
      <HeroBanner
        gradient="rd-system-hero--env"
        icon={<Server className="h-6 w-6" />}
        title="环境预生成"
        subtitle={`已在 ${pathGroups.length} 个工程路径下预生成 ${fileCount} 项文档与模板。`}
        stats={[
          { label: '工程路径', value: pathGroups.length },
          { label: '文件项', value: fileCount },
          { label: '状态', value: String(display.status || '—') },
        ]}
      />

      {errors.length > 0 ? (
        <ul className="mt-2 space-y-1 text-[11px] text-red-400">
          {errors.map((err) => (
            <li key={err}>{err}</li>
          ))}
        </ul>
      ) : null}

      <div className="mt-3">
        {pathGroups.length === 0 ? (
          <p className="rd-chat-card__desc">暂无工程路径预生成记录</p>
        ) : (
          <ul className="space-y-2">
            {pathGroups.map((group, idx) => (
              <PathGroupBlock key={`${String(group.engineering_root)}-${idx}`} group={group} />
            ))}
          </ul>
        )}
      </div>

      {entropy.status ? (
        <div className="mt-3 rd-chat-card__section">
          <div className="rd-chat-card__label mb-1">控熵归档</div>
          <div className="rd-chat-card__meta-row">
            <StatusBadge status={String(entropy.status)} />
            <CopyPath value={String(entropy.local_path || '')} />
            {Array.isArray(entropy.files) ? <span>{entropy.files.length} 个文件</span> : null}
          </div>
        </div>
      ) : null}
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

export const SYSTEM_STRUCTURED_NODE_IDS = ['auto_split', 'sandbox_build', 'env_pregen'] as const;

export function SystemNodeDetailCard({
  nodeId,
  display,
}: {
  nodeId: string;
  display: Record<string, unknown>;
}) {
  const payload = { ...display, display };
  switch (nodeId) {
    case 'auto_split':
      return <SystemAutoSplitCard payload={payload} />;
    case 'sandbox_build':
      return <SystemSandboxBuildCard payload={payload} />;
    case 'env_pregen':
      return <SystemEnvPregenCard payload={payload} />;
    default:
      return <SystemExecCard payload={payload} />;
  }
}
