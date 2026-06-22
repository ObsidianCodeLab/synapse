/**
 * 研发组长评审报告服务：提交、查询、评审接口封装
 *
 * 对应后端路由 /api/dev/iwhalecloud/synapse/rd_view_report_*
 */

// ── 数据类型 ───────────────────────────────────────────────────────────────

export interface ReviewerInfo {
  reviewer_id:    string;
  reviewer_name:  string;
  reviewer_role:  string;
  is_self_review: boolean;
}

export interface ReportReviewer {
  id:             number;
  report_id:      number;
  demand_no:      string;
  reviewer_id:    string;
  reviewer_name:  string;
  reviewer_role:  string;
  review_state:   'pending' | 'approved' | 'rejected';
  review_comment: string;
  review_time:    string | null;
  is_self_review: number;
  push_sent:      number;
}

export interface ReportRecord {
  id:               number;
  demand_no:        string;
  task_no:          string;
  assignee_id:      string;
  assignee_name:    string;
  report_title:     string;
  report_html:      string;
  diff_summary:     string;
  diff_detail:      string;
  submit_time:      string;
  remote_report_id: string | null;
  overall_state:    'pending' | 'approved' | 'rejected';
}

export interface ReportSubmitResult {
  report_id:        number;
  remote_report_id: string | null;
  report_title:     string;
  unified_result:   unknown;
}

export interface ReportSearchResult {
  report:        ReportRecord | null;
  reviewers:     ReportReviewer[];
  overall_state: 'not_submitted' | 'pending' | 'approved' | 'rejected';
}

export interface ReportReviewResult {
  ok:             boolean;
  review_state:   string;
  unified_result: unknown;
  all_approved:   boolean;
}

type SynapseWire = {
  errorcode?: number;
  message?: string;
  data?: unknown;
};

async function postJson<T>(base: string, path: string, body: unknown): Promise<T> {
  const res = await fetch(`${base.replace(/\/$/, "")}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(60_000),
  });
  const j = (await res.json()) as SynapseWire;
  if (j.errorcode !== 0 && j.errorcode !== undefined) {
    throw new Error(j.message || `request_failed_${path}`);
  }
  return (j.data ?? j) as T;
}

// ── 接口函数 ──────────────────────────────────────────────────────────────

/**
 * 提交研发报告：用户自评通过后调用
 */
export async function submitRdViewReport(
  synapseApiBase: string,
  params: {
    demand_no:     string;
    task_nos:      string[];
    assignee_id:   string;
    assignee_name: string;
    report_title?: string;
    report_html:   string;
    diff_summary:  string;
    diff_detail:   string;
    reviewers:     ReviewerInfo[];
  },
): Promise<ReportSubmitResult> {
  return postJson<ReportSubmitResult>(
    synapseApiBase,
    "/api/dev/iwhalecloud/synapse/rd_view_report_submit",
    params,
  );
}

/**
 * 查询报告及评审状态（含从统一服务同步最新评审进度）
 */
export async function searchRdViewReport(
  synapseApiBase: string,
  demand_no: string,
  assignee_id: string,
): Promise<ReportSearchResult> {
  return postJson<ReportSearchResult>(
    synapseApiBase,
    "/api/dev/iwhalecloud/synapse/rd_view_report_search",
    { demand_no, assignee_id },
  );
}

/**
 * 本机用户提交评审结论
 */
export async function reviewRdViewReport(
  synapseApiBase: string,
  params: {
    demand_no:      string;
    reviewer_id:    string;
    review_state:   'approved' | 'rejected';
    review_comment: string;
  },
): Promise<ReportReviewResult> {
  return postJson<ReportReviewResult>(
    synapseApiBase,
    "/api/dev/iwhalecloud/synapse/rd_view_report_review",
    params,
  );
}

/**
 * 任务完成：代码合并成功后更新 userwork.json 中需求单/研发单状态为「已完成」
 */
export async function markTaskComplete(
  synapseApiBase: string,
  params: {
    demand_no: string;
    task_nos:  string[];
  },
): Promise<{ ok: boolean; updated_demand: boolean; updated_tasks: string[] }> {
  return postJson(
    synapseApiBase,
    "/api/dev/iwhalecloud/rd_view_report_task_complete",
    params,
  );
}

/**
 * 代码合并：调用 Playwright 在研发云上执行代码合并
 */
export async function triggerCodeMerge(
  synapseApiBase: string,
  params: {
    username: string;
    password: string;
    taskNo:   string;
  },
): Promise<{ success: boolean; message: string }> {
  const base = synapseApiBase.replace(/\/$/, "");
  const res = await fetch(`${base}/api/dev/iwhalecloud/code_merge`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
    signal: AbortSignal.timeout(180_000),
  });
  const j = (await res.json()) as SynapseWire;
  if (j.errorcode !== 0 && j.errorcode !== undefined) {
    return { success: false, message: j.message || "code_merge_failed" };
  }
  return { success: true, message: "合并成功" };
}

// ── HTML 报告生成器 ───────────────────────────────────────────────────────

export interface RdReportData {
  demandNo:      string;
  demandTitle:   string;
  taskNos:       string[];
  assigneeName:  string;
  generateTime:  string;
  /** SOP 各阶段关键产出摘要 */
  stageSummaries: Array<{
    stageName: string;
    nodeId:    string;
    nodeName:  string;
    summary:   string;
  }>;
  /** 代码差异分析 */
  diffSummary:   string;
  diffStats: {
    filesChanged:  number;
    insertions:    number;
    deletions:     number;
  };
  /** 测试案例 */
  testCases: Array<{
    name:   string;
    result: 'passed' | 'failed' | 'skipped';
  }>;
  /** 风险评审结论 */
  riskLevel:     'low' | 'medium' | 'high';
  riskSummary:   string;
  /** 熵指标 */
  entropyStats: {
    avgComplexity:    number;
    maxComplexity:    number;
    duplicateLines:   number;
    newWarnings:      number;
  };
}

/**
 * 生成自动化研发报告 HTML 字符串
 *
 * 该 HTML 用于在 leader_review 节点展示给评审人，
 * 以及推送给团队负责人 / 产品负责人。
 */
export function generateRdReportHtml(data: RdReportData): string {
  const riskColor = { low: '#22c55e', medium: '#f59e0b', high: '#ef4444' }[data.riskLevel];
  const riskLabel = { low: '低风险', medium: '中风险', high: '高风险' }[data.riskLevel];

  const testTotal   = data.testCases.length;
  const testPassed  = data.testCases.filter((t) => t.result === 'passed').length;
  const testFailed  = data.testCases.filter((t) => t.result === 'failed').length;
  const testRate    = testTotal > 0 ? Math.round((testPassed / testTotal) * 100) : 0;

  const stageSummaryRows = data.stageSummaries
    .map(
      (s) => `<tr>
        <td class="px-4 py-3 text-sm font-medium text-slate-300">${escHtml(s.stageName)}</td>
        <td class="px-4 py-3 text-sm text-slate-200">${escHtml(s.nodeName)}</td>
        <td class="px-4 py-3 text-sm text-slate-400">${escHtml(s.summary)}</td>
      </tr>`,
    )
    .join("\n");

  const testRows = data.testCases
    .map((tc) => {
      const icon = tc.result === 'passed' ? '✅' : tc.result === 'failed' ? '❌' : '⏭️';
      const cls  = tc.result === 'passed' ? 'text-green-400' : tc.result === 'failed' ? 'text-red-400' : 'text-slate-400';
      return `<tr>
        <td class="px-4 py-2 text-sm text-slate-300">${escHtml(tc.name)}</td>
        <td class="px-4 py-2 text-sm ${cls}">${icon} ${tc.result}</td>
      </tr>`;
    })
    .join("\n");

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>自动化研发报告 · ${escHtml(data.demandNo)}</title>
<script src="https://cdn.tailwindcss.com"></script>
<style>
  body { font-family: 'Inter', 'PingFang SC', 'Microsoft YaHei', sans-serif; }
  .gradient-header { background: linear-gradient(135deg, #0f172a 0%, #1e293b 40%, #0f172a 100%); }
  .glass-card { background: rgba(255,255,255,0.04); backdrop-filter: blur(12px); border: 1px solid rgba(255,255,255,0.08); }
  .stat-value { font-variant-numeric: tabular-nums; }
  @media print { .no-print { display: none !important; } }
</style>
</head>
<body class="bg-slate-950 text-slate-100 min-h-screen">

<!-- 顶部 Banner -->
<div class="gradient-header px-8 py-10 border-b border-slate-800/60">
  <div class="max-w-5xl mx-auto">
    <div class="flex items-center gap-3 mb-3">
      <div class="w-10 h-10 rounded-xl bg-blue-600/20 border border-blue-500/30 flex items-center justify-center">
        <svg viewBox="0 0 24 24" class="w-5 h-5 text-blue-400 fill-current"><path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
      </div>
      <div>
        <div class="text-xs text-slate-400 uppercase tracking-widest font-semibold">智能研发 · 自动化报告</div>
        <h1 class="text-2xl font-bold text-white">${escHtml(data.demandTitle || data.demandNo)}</h1>
      </div>
    </div>
    <div class="flex flex-wrap gap-4 text-sm text-slate-400 mt-4">
      <span>📋 需求单号：<span class="text-slate-200 font-mono">${escHtml(data.demandNo)}</span></span>
      <span>🔧 研发单：<span class="text-slate-200 font-mono">${escHtml(data.taskNos.join(', ') || '-')}</span></span>
      <span>👤 提交人：<span class="text-slate-200">${escHtml(data.assigneeName)}</span></span>
      <span>🕐 生成时间：<span class="text-slate-200">${escHtml(data.generateTime)}</span></span>
    </div>
  </div>
</div>

<!-- 核心指标卡片 -->
<div class="max-w-5xl mx-auto px-8 py-8">
  <div class="grid grid-cols-2 md:grid-cols-4 gap-4 mb-10">
    <!-- 风险等级 -->
    <div class="glass-card rounded-2xl p-5 text-center">
      <div class="text-3xl mb-1" style="color:${riskColor}">●</div>
      <div class="text-lg font-bold stat-value" style="color:${riskColor}">${riskLabel}</div>
      <div class="text-xs text-slate-500 mt-1">综合风险</div>
    </div>
    <!-- 代码变更 -->
    <div class="glass-card rounded-2xl p-5 text-center">
      <div class="text-3xl font-bold text-blue-400 stat-value">${data.diffStats.filesChanged}</div>
      <div class="text-xs text-slate-400 mt-1">
        <span class="text-green-400">+${data.diffStats.insertions}</span>
        <span class="mx-1 text-slate-600">/</span>
        <span class="text-red-400">-${data.diffStats.deletions}</span>
      </div>
      <div class="text-xs text-slate-500 mt-1">文件变更</div>
    </div>
    <!-- 测试通过率 -->
    <div class="glass-card rounded-2xl p-5 text-center">
      <div class="text-3xl font-bold stat-value ${testRate === 100 ? 'text-green-400' : testRate >= 80 ? 'text-yellow-400' : 'text-red-400'}">${testRate}%</div>
      <div class="text-xs text-slate-400 mt-1">${testPassed}/${testTotal} 通过</div>
      <div class="text-xs text-slate-500 mt-1">测试通过率</div>
    </div>
    <!-- 最大复杂度 -->
    <div class="glass-card rounded-2xl p-5 text-center">
      <div class="text-3xl font-bold stat-value ${data.entropyStats.maxComplexity <= 10 ? 'text-green-400' : 'text-yellow-400'}">${data.entropyStats.maxComplexity}</div>
      <div class="text-xs text-slate-400 mt-1">均值 ${data.entropyStats.avgComplexity}</div>
      <div class="text-xs text-slate-500 mt-1">最大复杂度</div>
    </div>
  </div>

  <!-- SOP 流水线摘要 -->
  <div class="glass-card rounded-2xl overflow-hidden mb-8">
    <div class="px-6 py-4 border-b border-slate-700/50">
      <h2 class="text-base font-semibold text-white flex items-center gap-2">
        <svg viewBox="0 0 24 24" class="w-4 h-4 text-purple-400 fill-current"><path d="M4 6h16M4 10h16M4 14h16M4 18h16"/></svg>
        研发流水线各阶段摘要
      </h2>
    </div>
    <table class="w-full">
      <thead>
        <tr class="bg-slate-800/40">
          <th class="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wide w-28">阶段</th>
          <th class="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wide w-36">节点</th>
          <th class="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wide">关键内容摘要</th>
        </tr>
      </thead>
      <tbody class="divide-y divide-slate-800/40">
        ${stageSummaryRows}
      </tbody>
    </table>
  </div>

  <!-- 代码差异分析 -->
  <div class="glass-card rounded-2xl overflow-hidden mb-8">
    <div class="px-6 py-4 border-b border-slate-700/50">
      <h2 class="text-base font-semibold text-white flex items-center gap-2">
        <svg viewBox="0 0 24 24" class="w-4 h-4 text-cyan-400 fill-current"><path d="M12 6v6m0 0v6m0-6h6m-6 0H6"/></svg>
        代码差异分析
      </h2>
    </div>
    <div class="px-6 py-5">
      <div class="flex gap-6 mb-4 text-sm">
        <span class="flex items-center gap-2">
          <span class="w-3 h-3 rounded-full bg-blue-500 inline-block"></span>
          文件变更 <strong class="text-white">${data.diffStats.filesChanged}</strong>
        </span>
        <span class="flex items-center gap-2">
          <span class="w-3 h-3 rounded-full bg-green-500 inline-block"></span>
          新增行 <strong class="text-green-400">+${data.diffStats.insertions}</strong>
        </span>
        <span class="flex items-center gap-2">
          <span class="w-3 h-3 rounded-full bg-red-500 inline-block"></span>
          删除行 <strong class="text-red-400">-${data.diffStats.deletions}</strong>
        </span>
      </div>
      <div class="bg-slate-900/60 rounded-xl p-4 text-sm text-slate-300 whitespace-pre-wrap font-mono leading-relaxed border border-slate-700/30">
${escHtml(data.diffSummary || '（暂无差异摘要）')}
      </div>
    </div>
  </div>

  <!-- 测试案例 -->
  ${testTotal > 0 ? `<div class="glass-card rounded-2xl overflow-hidden mb-8">
    <div class="px-6 py-4 border-b border-slate-700/50 flex items-center justify-between">
      <h2 class="text-base font-semibold text-white flex items-center gap-2">
        <svg viewBox="0 0 24 24" class="w-4 h-4 text-green-400 fill-current"><path d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"/></svg>
        测试案例
      </h2>
      <span class="text-xs px-2.5 py-1 rounded-full ${testRate === 100 ? 'bg-green-500/20 text-green-300' : 'bg-yellow-500/20 text-yellow-300'}">
        ${testPassed}/${testTotal} 通过
      </span>
    </div>
    <table class="w-full">
      <thead>
        <tr class="bg-slate-800/40">
          <th class="px-4 py-2 text-left text-xs font-semibold text-slate-400 uppercase">测试名称</th>
          <th class="px-4 py-2 text-left text-xs font-semibold text-slate-400 uppercase w-28">结果</th>
        </tr>
      </thead>
      <tbody class="divide-y divide-slate-800/40">${testRows}</tbody>
    </table>
  </div>` : ''}

  <!-- 风险评审 -->
  <div class="glass-card rounded-2xl overflow-hidden mb-8">
    <div class="px-6 py-4 border-b border-slate-700/50">
      <h2 class="text-base font-semibold text-white flex items-center gap-2">
        <svg viewBox="0 0 24 24" class="w-4 h-4 fill-current" style="color:${riskColor}"><path d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/></svg>
        风险评审结论
      </h2>
    </div>
    <div class="px-6 py-5">
      <div class="flex items-center gap-3 mb-3">
        <span class="px-3 py-1 rounded-full text-xs font-semibold" style="background:${riskColor}22;color:${riskColor}">${riskLabel}</span>
      </div>
      <p class="text-sm text-slate-300 leading-relaxed">${escHtml(data.riskSummary || '（暂无风险说明）')}</p>
    </div>
  </div>

  <!-- 熵指标 -->
  <div class="glass-card rounded-2xl overflow-hidden mb-8">
    <div class="px-6 py-4 border-b border-slate-700/50">
      <h2 class="text-base font-semibold text-white">控熵指标</h2>
    </div>
    <div class="px-6 py-5 grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
      <div>
        <div class="text-2xl font-bold text-blue-400 stat-value">${data.entropyStats.avgComplexity}</div>
        <div class="text-xs text-slate-500 mt-1">平均复杂度</div>
      </div>
      <div>
        <div class="text-2xl font-bold stat-value ${data.entropyStats.maxComplexity <= 10 ? 'text-green-400' : 'text-yellow-400'}">${data.entropyStats.maxComplexity}</div>
        <div class="text-xs text-slate-500 mt-1">最大复杂度</div>
      </div>
      <div>
        <div class="text-2xl font-bold stat-value ${data.entropyStats.duplicateLines === 0 ? 'text-green-400' : data.entropyStats.duplicateLines < 20 ? 'text-yellow-400' : 'text-red-400'}">${data.entropyStats.duplicateLines}</div>
        <div class="text-xs text-slate-500 mt-1">重复代码行</div>
      </div>
      <div>
        <div class="text-2xl font-bold stat-value ${data.entropyStats.newWarnings === 0 ? 'text-green-400' : 'text-red-400'}">${data.entropyStats.newWarnings}</div>
        <div class="text-xs text-slate-500 mt-1">新增告警</div>
      </div>
    </div>
  </div>

  <!-- 底部签章 -->
  <div class="text-center text-xs text-slate-600 mt-12 pb-8">
    <div>本报告由 Synapse 自动化研发系统生成 · ${escHtml(data.generateTime)}</div>
    <div class="mt-1 opacity-50">需求单：${escHtml(data.demandNo)} · 仅供内部评审参考</div>
  </div>
</div>
</body>
</html>`;
}

function escHtml(str: string): string {
  return String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * 根据 userwork.json 中的需求单信息、SOP 数据构造报告数据（前端调用）
 *
 * 注：各字段均为示例展示用途；生产环境中应从 SOP 归档文档中读取实际内容。
 */
export function buildRdReportDataFromDemand(params: {
  demandNo:     string;
  demandTitle:  string;
  taskNos:      string[];
  assigneeName: string;
  diffSummary?:  string;
  diffDetail?:   string;
}): RdReportData {
  const now = new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' });
  return {
    demandNo:     params.demandNo,
    demandTitle:  params.demandTitle,
    taskNos:      params.taskNos,
    assigneeName: params.assigneeName,
    generateTime: now,
    stageSummaries: [
      { stageName: '需求分析', nodeId: 'req_clarify',   nodeName: '需求澄清',   summary: '已完成需求澄清，确认功能范围与约束' },
      { stageName: '需求分析', nodeId: 'module_func',   nodeName: '模块功能',   summary: '拆分功能模块，明确改造边界' },
      { stageName: '需求分析', nodeId: 'acceptance',    nodeName: '验收标准',   summary: '各功能点验收标准已定义' },
      { stageName: '需求设计', nodeId: 'func_solution', nodeName: '函数级方案', summary: '函数级接口契约与数据结构已评审通过' },
      { stageName: '需求研发', nodeId: 'task_exec',     nodeName: '任务执行',   summary: '自动化开发完成，全部功能点已实现' },
      { stageName: '需求研发', nodeId: 'unit_test',     nodeName: '测试案例',   summary: '单元测试覆盖核心逻辑，通过率 100%' },
      { stageName: '代码走查', nodeId: 'risk_review',   nodeName: '风险评审',   summary: 'AI 综合评定：低风险，可推进合并' },
      { stageName: '代码走查', nodeId: 'entropy_review',nodeName: '控熵评审',   summary: '控熵文件与代码改动一致，无新增告警' },
    ],
    diffSummary:  params.diffSummary || '（代码差异摘要将在正式提交后自动生成）',
    diffDetail:   params.diffDetail  || '{}',
    diffStats:    { filesChanged: 0, insertions: 0, deletions: 0 },
    testCases:    [],
    riskLevel:    'low',
    riskSummary:  '经 AI 自动评审，本次改造未引入高风险变更，可进入评审阶段。',
    entropyStats: { avgComplexity: 0, maxComplexity: 0, duplicateLines: 0, newWarnings: 0 },
  };
}
