import React, { useMemo, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  FolderGit2,
  FolderTree,
  GitBranch,
  ListTree,
  Package,
  Server,
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
  const ok = s === 'ok' || s === 'completed';
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

function MonoPath({ value }: { value?: string }) {
  const text = String(value || '—');
  return <span className="font-mono text-[10px] break-all text-muted-foreground">{text}</span>;
}

type RowRecord = Record<string, unknown>;

function asRows(value: unknown): RowRecord[] {
  return Array.isArray(value) ? value.filter((r): r is RowRecord => !!r && typeof r === 'object') : [];
}

export function SystemAutoSplitCard({ payload }: { payload: Record<string, unknown> }) {
  const display = (payload.display as Record<string, unknown>) || payload;
  const tasks = asRows(display.tasks?.length ? display.tasks : display.local_tasks);
  const splitPlan = asRows(display.split_plan_tasks);
  const createResults = asRows(display.create_task_results);
  const portalNos = Array.isArray(display.portal_task_nos) ? (display.portal_task_nos as string[]) : [];
  const onlyPortal = (display.only_in_portal as string[]) || [];
  const onlyLocal = (display.only_in_local as string[]) || [];
  const errors = (display.errors as string[]) || [];

  return (
    <div className="rd-chat-card rd-chat-card--meta">
      <SectionTitle icon={<ListTree className="w-4 h-4" />}>自动拆单 — 研发子单</SectionTitle>
      <dl className="rd-chat-card__kv">
        <dt>状态</dt>
        <dd>
          <StatusBadge status={String(display.status || payload.status || '—')} />
        </dd>
        <dt>需求单号</dt>
        <dd className="font-mono text-[11px]">{String(display.demand_no || '—')}</dd>
      </dl>

      {errors.length > 0 ? (
        <ul className="mt-2 space-y-1 text-[11px] text-red-400">
          {errors.map((err) => (
            <li key={err}>{err}</li>
          ))}
        </ul>
      ) : null}

      <div className="mt-3">
        <div className="rd-chat-card__label mb-1.5">研发子单 ({tasks.length})</div>
        {tasks.length === 0 ? (
          <p className="rd-chat-card__desc">暂无子单</p>
        ) : (
          <ul className="space-y-2">
            {tasks.map((task, idx) => {
              const taskNo = String(task.task_no || '—');
              const key = taskNo !== '—' ? taskNo : `task-${idx}`;
              return (
                <li
                  key={key}
                  className="rounded-lg border border-slate-700/60 bg-slate-900/40 px-3 py-2 text-[11px]"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-primary">{taskNo}</span>
                    <span className="text-slate-200">{String(task.task_title || '')}</span>
                    {task.product_module_name ? (
                      <span className="rd-chat-card__tag">{String(task.product_module_name)}</span>
                    ) : null}
                  </div>
                  <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-muted-foreground">
                    {task.branch_version ? <span>分支 {String(task.branch_version)}</span> : null}
                    {task.patch_name ? <span>补丁 {String(task.patch_name)}</span> : null}
                    {task.sop_node ? <span>SOP {String(task.sop_node)}</span> : null}
                    {task.local_process_state ? <span>{String(task.local_process_state)}</span> : null}
                    {task.create_status ? <StatusBadge status={String(task.create_status)} /> : null}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {splitPlan.length > 0 ? (
        <div className="mt-3">
          <div className="rd-chat-card__label mb-1.5">方案评审拆单计划</div>
          <ul className="space-y-1 text-[11px] text-muted-foreground">
            {splitPlan.map((row, idx) => (
              <li key={`plan-${idx}`} className="font-mono break-all">
                {String(row.taskTitle || '—')} · 模块 {String(row.productModuleName || '—')}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {createResults.length > 0 ? (
        <div className="mt-3">
          <div className="rd-chat-card__label mb-1.5">create_task 结果</div>
          <ul className="space-y-1 text-[11px]">
            {createResults.map((row, idx) => (
              <li key={`create-${idx}`} className="flex flex-wrap items-center gap-2">
                <StatusBadge status={String(row.status || '—')} />
                <span>{String(row.taskTitle || '—')}</span>
                <span className="font-mono text-muted-foreground">→ {String(row.task_no || '—')}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {(portalNos.length > 0 || onlyPortal.length > 0 || onlyLocal.length > 0) ? (
        <div className="mt-3 rd-chat-card__section">
          <div className="rd-chat-card__label mb-1.5">门户同步</div>
          <div className="rd-chat-card__meta-row">
            <span>门户 {portalNos.length} 单</span>
            {onlyPortal.length ? <span className="text-amber-400">仅门户 {onlyPortal.join(', ')}</span> : null}
            {onlyLocal.length ? <span className="text-amber-400">仅本地 {onlyLocal.join(', ')}</span> : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function SystemSandboxBuildCard({ payload }: { payload: Record<string, unknown> }) {
  const display = (payload.display as Record<string, unknown>) || payload;
  const bindings = asRows(display.task_bindings);
  const repos = asRows(display.repos);
  const errors = (display.errors as string[]) || [];

  return (
    <div className="rd-chat-card rd-chat-card--meta">
      <SectionTitle icon={<FolderGit2 className="w-4 h-4" />}>沙箱构建 — 子单与代码挂钩</SectionTitle>
      <dl className="rd-chat-card__kv">
        <dt>状态</dt>
        <dd>
          <StatusBadge status={String(display.status || payload.status || '—')} />
        </dd>
        <dt>沙箱目录</dt>
        <dd>
          <MonoPath value={String(display.sandbox_root || payload.sandbox_root || '')} />
        </dd>
        {display.prod || payload.prod ? (
          <>
            <dt>产品</dt>
            <dd>{String(display.prod || payload.prod)}</dd>
          </>
        ) : null}
      </dl>

      {errors.length > 0 ? (
        <ul className="mt-2 space-y-1 text-[11px] text-red-400">
          {errors.map((err) => (
            <li key={err}>{err}</li>
          ))}
        </ul>
      ) : null}

      <div className="mt-3">
        <div className="rd-chat-card__label mb-1.5">研发子单 → 沙箱代码</div>
        {bindings.length === 0 ? (
          <p className="rd-chat-card__desc">暂无子单挂钩（须先完成自动拆单）</p>
        ) : (
          <ul className="space-y-3">
            {bindings.map((binding, idx) => {
              const taskNo = String(binding.task_no || `binding-${idx}`);
              const matchedRepos = asRows(binding.repos);
              const unmatched = String(binding.match_status || '') === 'unmatched';
              return (
                <li
                  key={taskNo}
                  className="rounded-lg border border-slate-700/60 bg-slate-900/40 px-3 py-2"
                >
                  <div className="flex flex-wrap items-center gap-2 text-[11px]">
                    <Package className="h-3.5 w-3.5 text-indigo-400" />
                    <span className="font-mono text-primary">{taskNo}</span>
                    <span className="text-slate-200">{String(binding.task_title || '')}</span>
                    {binding.product_module_name ? (
                      <span className="rd-chat-card__tag">{String(binding.product_module_name)}</span>
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
                    <ul className="mt-2 space-y-1.5 border-l border-slate-700 pl-3">
                      {matchedRepos.map((repo, rIdx) => (
                        <li key={`${taskNo}-repo-${rIdx}`} className="text-[10px]">
                          <div className="flex flex-wrap items-center gap-2">
                            <GitBranch className="h-3 w-3 text-muted-foreground" />
                            <span className="font-medium text-slate-300">{String(repo.repo_name || 'repo')}</span>
                            <StatusBadge status={String(repo.git_status || repo.status || '—')} />
                          </div>
                          <div className="mt-0.5 text-muted-foreground">
                            模块 {String(repo.repo_module || '—')}
                            {repo.code_path ? ` · 代码路径 ${String(repo.code_path)}` : null}
                            {repo.repo_branch ? ` · ${String(repo.repo_branch)}` : null}
                          </div>
                          <MonoPath value={String(repo.local_path || '')} />
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {repos.length > 0 ? (
        <div className="mt-3">
          <div className="rd-chat-card__label mb-1.5">仓库落盘 ({repos.length})</div>
          <ul className="space-y-1 text-[11px] text-muted-foreground">
            {repos.map((row, idx) => (
              <li key={`repo-${idx}`} className="font-mono break-all">
                {String(row.repo_name || 'repo')} → {String(row.local_path || '—')} (
                {String(row.status || '—')})
              </li>
            ))}
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
  product_doc_mirror: '开门文档镜像',
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
          <MonoPath value={root} />
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
              <MonoPath value={String(entry.path || '')} />
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

  return (
    <div className="rd-chat-card rd-chat-card--meta">
      <SectionTitle icon={<Server className="w-4 h-4" />}>环境预生成 — 路径内容清单</SectionTitle>
      <dl className="rd-chat-card__kv">
        <dt>状态</dt>
        <dd>
          <StatusBadge status={String(display.status || payload.status || '—')} />
        </dd>
        <dt>环境目录</dt>
        <dd>
          <MonoPath value={String(display.env_root || payload.env_root || '')} />
        </dd>
        {display.prod || payload.prod ? (
          <>
            <dt>产品</dt>
            <dd>{String(display.prod || payload.prod)}</dd>
          </>
        ) : null}
      </dl>

      {errors.length > 0 ? (
        <ul className="mt-2 space-y-1 text-[11px] text-red-400">
          {errors.map((err) => (
            <li key={err}>{err}</li>
          ))}
        </ul>
      ) : null}

      <div className="mt-3">
        <div className="rd-chat-card__label mb-1.5">沙箱工程路径 · 预生成内容 ({pathGroups.length})</div>
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
            <MonoPath value={String(entropy.local_path || '')} />
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
        <dd className="font-mono text-[11px] break-all">{String(payload.sandbox_root || '—')}</dd>
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
        <ul className="text-[11px] text-muted-foreground space-y-1.5 mt-3 mb-0">
          {repos.map((row, idx) => (
            <li key={`${row.repo_name}-${idx}`} className="font-mono break-all">
              {String(row.repo_name || 'repo')} → {String(row.local_path || '—')} ({String(row.status || '—')})
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
