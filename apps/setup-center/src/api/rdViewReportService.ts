/**
 * 研发组长评审报告服务
 *
 * 与产品管理一致：评审报告 CRUD 直连研发统一服务（devservice.ip:10001），
 * 不经 Synapse serve 转发。仅 code_merge / task_complete 仍走本机 Synapse API。
 *
 * 后端字段说明（SynapseService 侧）：
 *   submitter_id / employee_id → 工号
 *   conclusion                 → pending / approved / rejected
 *   role                       → submitter / team_lead / product_lead / internal
 */
import {
  RD_UNIFIED_PATHS,
  postRdViewUnifiedData,
  syncRdViewAssigneeFromLocalUserinfo,
} from '@/api/rdUnifiedService';

// ── 角色常量 ──────────────────────────────────────────────────────────────────

export const REVIEWER_ROLE_LABEL: Record<string, string> = {
  submitter:    '开发者（自评）',
  team_lead:    '团队负责人',
  product_lead: '产品负责人',
  internal:     '系统内部评审员',
};

// ── 数据类型 ──────────────────────────────────────────────────────────────────

/** 单个评审人条目（来自后端） */
export interface Reviewer {
  id?:           number;
  report_id:     string;
  demand_no:     string;
  employee_id:   string;
  reviewer_name: string;
  /** submitter | team_lead | product_lead | internal */
  role:          string;
  /** pending | approved | rejected */
  conclusion:    'pending' | 'approved' | 'rejected';
  comments:      string | null;
  reviewed_at:   string | null;
}

/** 报告主体（来自后端） */
export interface ReportRecord {
  report_id:      string;
  demand_no:      string;
  submitter_id:   string;
  submitter_name: string;
  /** pending | approved | rejected */
  review_status:  'pending' | 'approved' | 'rejected';
  report_html:    string;
  diff_analysis:  unknown;
  created_at:     string;
  updated_at:     string;
  reviewers:      Reviewer[];
}

/** 提交报告时传入的评审人信息 */
export interface ReviewerInfo {
  employee_id:   string;
  reviewer_name: string;
  /** submitter | team_lead | product_lead | internal */
  role:          string;
}

export interface ReportSubmitResult {
  report_id:  string;
  demand_no:  string;
  reviewers:  Reviewer[];
}

export interface ReportSearchResult {
  /** null 表示尚未提交报告 */
  report:        ReportRecord | null;
  overall_state: 'not_submitted' | 'pending' | 'approved' | 'rejected';
}

export interface ReviewResult {
  report_id:     string;
  review_status: string;
  reviewers:     Reviewer[];
}

export interface AddReviewerResult {
  report_id:  string;
  reviewer:   Reviewer;
}

/** 审查人员解析结果（统一服务 DB 关联，非 AI 生成） */
export interface ReviewersResolveResult {
  submitter:         ReviewerInfo;
  team_lead:         ReviewerInfo | null;
  product_lead:      ReviewerInfo | null;
  internal_options:  ReviewerInfo[];
  default_reviewers: ReviewerInfo[];
}

function normalizeReviewerInfo(raw: Partial<ReviewerInfo>): ReviewerInfo {
  return {
    employee_id:   String(raw.employee_id ?? '').trim(),
    reviewer_name: String(raw.reviewer_name ?? raw.employee_id ?? '').trim(),
    role:          String(raw.role ?? 'internal').trim(),
  };
}

// ── 网络层 ────────────────────────────────────────────────────────────────────

type SynapseWire = {
  errorcode?: number;
  message?:   string;
  data?:      unknown;
};

async function postJson<T>(base: string, path: string, body: unknown): Promise<T> {
  const res = await fetch(`${base.replace(/\/$/, '')}${path}`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(body),
    signal:  AbortSignal.timeout(60_000),
  });
  const j = (await res.json()) as SynapseWire;
  if (j.errorcode !== 0 && j.errorcode !== undefined) {
    throw new Error(j.message || `request_failed_${path}`);
  }
  return (j.data ?? j) as T;
}

function normalizeReviewer(r: Partial<Reviewer>): Reviewer {
  return {
    id:            r.id,
    report_id:     r.report_id ?? '',
    demand_no:     r.demand_no ?? '',
    employee_id:   r.employee_id ?? '',
    reviewer_name: r.reviewer_name ?? r.employee_id ?? '',
    role:          r.role ?? 'internal',
    conclusion:    (r.conclusion as Reviewer['conclusion']) ?? 'pending',
    comments:      r.comments ?? null,
    reviewed_at:   r.reviewed_at ?? null,
  };
}

function normalizeReport(raw: Partial<ReportRecord>): ReportRecord {
  return {
    report_id:      raw.report_id ?? '',
    demand_no:      raw.demand_no ?? '',
    submitter_id:   raw.submitter_id ?? '',
    submitter_name: raw.submitter_name ?? '',
    review_status:  (raw.review_status as ReportRecord['review_status']) ?? 'pending',
    report_html:    raw.report_html ?? '',
    diff_analysis:  raw.diff_analysis ?? null,
    created_at:     raw.created_at ?? '',
    updated_at:     raw.updated_at ?? '',
    reviewers:      Array.isArray(raw.reviewers)
      ? (raw.reviewers as Partial<Reviewer>[]).map(normalizeReviewer)
      : [],
  };
}

// ── 接口函数 ──────────────────────────────────────────────────────────────────

/**
 * 提交研发报告（首次自评触发）
 * 同时批量录入初始评审人（开发者 + 产品负责人 + 团队负责人）
 */
export async function submitRdViewReport(
  apiBase: string,
  params: {
    demand_no:      string;
    submitter_id:   string;
    submitter_name: string;
    report_html:    string;
    diff_analysis?: unknown;
    reviewers:      ReviewerInfo[];
  },
): Promise<ReportSubmitResult> {
  const raw = await postRdViewUnifiedData<Partial<ReportSubmitResult>>(
    apiBase,
    RD_UNIFIED_PATHS.rdViewReportSubmit,
    params,
  );
  return {
    report_id: raw.report_id ?? '',
    demand_no: raw.demand_no ?? params.demand_no,
    reviewers: Array.isArray(raw.reviewers)
      ? (raw.reviewers as Partial<Reviewer>[]).map(normalizeReviewer)
      : [],
  };
}

/**
 * 查询报告及评审人状态
 * 返回 null report 表示尚未提交
 */
export async function searchRdViewReport(
  apiBase:   string,
  demand_no: string,
): Promise<ReportSearchResult> {
  type RawSearch = { report_id?: string; [k: string]: unknown } | null;
  const raw = await postRdViewUnifiedData<RawSearch>(
    apiBase,
    RD_UNIFIED_PATHS.rdViewReportSearch,
    { demand_no },
  );
  if (!raw || !raw.report_id) {
    return { report: null, overall_state: 'not_submitted' };
  }
  const report = normalizeReport(raw as Partial<ReportRecord>);
  const status = report.review_status;
  const overall: ReportSearchResult['overall_state'] =
    status === 'approved' ? 'approved'
    : status === 'rejected' ? 'rejected'
    : report.reviewers.length === 0 ? 'not_submitted'
    : 'pending';
  return { report, overall_state: overall };
}

/**
 * 提交单个评审人的评审结论（自评 / 其他评审人）
 */
export async function reviewRdViewReport(
  apiBase: string,
  params: {
    report_id:   string;
    demand_no:   string;
    employee_id: string;
    conclusion:  'approved' | 'rejected';
    comments?:   string;
  },
): Promise<ReviewResult> {
  const raw = await postRdViewUnifiedData<Partial<ReviewResult>>(
    apiBase,
    RD_UNIFIED_PATHS.rdViewReportReview,
    params,
  );
  return {
    report_id:     raw.report_id ?? params.report_id,
    review_status: raw.review_status ?? 'pending',
    reviewers:     Array.isArray(raw.reviewers)
      ? (raw.reviewers as Partial<Reviewer>[]).map(normalizeReviewer)
      : [],
  };
}

/**
 * 追加评审人（动态添加）
 * 对应新接口 /api/dev/iwhalecloud/synapse/rd_view_report_reviewer_add
 */
export async function addReviewer(
  apiBase: string,
  params: {
    report_id:     string;
    demand_no:     string;
    employee_id:   string;
    reviewer_name: string;
    role:          string;
  },
): Promise<AddReviewerResult> {
  const raw = await postRdViewUnifiedData<Partial<AddReviewerResult>>(
    apiBase,
    RD_UNIFIED_PATHS.rdViewReportReviewerAdd,
    params,
  );
  return {
    report_id: raw.report_id ?? params.report_id,
    reviewer:  raw.reviewer ? normalizeReviewer(raw.reviewer as Partial<Reviewer>) : normalizeReviewer(params),
  };
}

/**
 * 解析审查人员：团队负责人 / 产品负责人 / 可选内部人员（非 AI 生成）
 */
export async function resolveReportReviewers(
  apiBase: string,
  params: {
    assignee_id: string;
    prod?:       string;
  },
): Promise<ReviewersResolveResult> {
  await syncRdViewAssigneeFromLocalUserinfo(apiBase);
  const raw = await postRdViewUnifiedData<Partial<ReviewersResolveResult>>(
    apiBase,
    RD_UNIFIED_PATHS.rdViewReportReviewersResolve,
    params,
  );
  const submitter = normalizeReviewerInfo(raw.submitter ?? {
    employee_id: params.assignee_id,
    reviewer_name: params.assignee_id,
    role: 'submitter',
  });
  const teamLead = raw.team_lead ? normalizeReviewerInfo(raw.team_lead) : null;
  const productLead = raw.product_lead ? normalizeReviewerInfo(raw.product_lead) : null;
  const internalOptions = Array.isArray(raw.internal_options)
    ? raw.internal_options.map((item) => normalizeReviewerInfo(item as Partial<ReviewerInfo>))
    : [];
  const defaultReviewers = Array.isArray(raw.default_reviewers)
    ? raw.default_reviewers.map((item) => normalizeReviewerInfo(item as Partial<ReviewerInfo>))
    : [submitter, ...(teamLead ? [teamLead] : []), ...(productLead ? [productLead] : [])];
  return {
    submitter,
    team_lead: teamLead,
    product_lead: productLead,
    internal_options: internalOptions,
    default_reviewers: defaultReviewers,
  };
}

/**
 * 代码合并
 */
export async function triggerCodeMerge(
  apiBase: string,
  params: {
    username: string;
    password: string;
    taskNo:   string;
  },
): Promise<{ success: boolean; message: string }> {
  type MergeWire = { errorcode?: number; message?: string };
  const res = await fetch(`${apiBase.replace(/\/$/, '')}/api/dev/iwhalecloud/code_merge`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(params),
    signal:  AbortSignal.timeout(180_000),
  });
  const j = (await res.json()) as MergeWire;
  if (j.errorcode !== 0 && j.errorcode !== undefined) {
    return { success: false, message: j.message || 'code_merge_failed' };
  }
  return { success: true, message: '合并成功' };
}

/**
 * 任务完成（代码合并成功后更新 userwork.json 状态）
 */
export async function markTaskComplete(
  apiBase: string,
  params: { demand_no: string; task_nos: string[] },
): Promise<{ ok: boolean }> {
  return postJson(apiBase, '/api/dev/iwhalecloud/rd_view_report_task_complete', params);
}

// ── HTML 报告生成器 ───────────────────────────────────────────────────────────

export interface SopNodeStat {
  nodeId:          string;
  nodeName:        string;
  stageName:       string;
  summary:         string;
  /** 研发质量评分 0-100 */
  qualityScore:    number;
  /** 需求一致性评分 0-100 */
  consistencyScore: number;
  /** 人工介入次数 */
  humanIntervCount: number;
  /** 重试次数 */
  retryCount:       number;
  /** passed | warning | failed | skipped */
  status:          'passed' | 'warning' | 'failed' | 'skipped';
  artifacts:       string[];
}

export interface DiffFileEntry {
  path:       string;
  insertions: number;
  deletions:  number;
  /** added | modified | deleted */
  changeType: 'added' | 'modified' | 'deleted';
}

export interface RdReportData {
  demandNo:      string;
  demandTitle:   string;
  taskNos:       string[];
  assigneeName:  string;
  generateTime:  string;
  /** 研发质量总分 0-100 */
  overallScore:  number;
  /** low | medium | high */
  riskLevel:     'low' | 'medium' | 'high';
  riskSummary:   string;
  sopNodes:      SopNodeStat[];
  diffSummary:   string;
  diffFiles:     DiffFileEntry[];
  diffStats: {
    filesChanged: number;
    insertions:   number;
    deletions:    number;
  };
  testCases: Array<{
    name:   string;
    result: 'passed' | 'failed' | 'skipped';
  }>;
  entropyStats: {
    avgComplexity:  number;
    maxComplexity:  number;
    duplicateLines: number;
    newWarnings:    number;
  };
}

function esc(s: string | number): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** 与 setup-center 全局 custom-scrollbar 一致的滚动条样式（iframe 内无法继承外层 CSS） */
const REPORT_SCROLLBAR_STYLE = `<style id="synapse-report-scrollbar">
*{scrollbar-width:thin;scrollbar-color:transparent transparent}
*:hover{scrollbar-color:rgba(255,255,255,0.12) transparent}
*::-webkit-scrollbar{width:6px;height:6px}
*::-webkit-scrollbar-track{background:transparent}
*::-webkit-scrollbar-thumb{background:transparent;border-radius:3px}
*:hover::-webkit-scrollbar-thumb{background:rgba(255,255,255,0.12)}
*::-webkit-scrollbar-thumb:hover{background:rgba(255,255,255,0.35)}
</style>`;

/** 将旧版/归档报告标题统一为「自动化研发报告」 */
export function patchReportHtmlTitle(html: string): string {
  if (!html?.trim()) return html;
  let result = html;
  result = result.replace(
    /<title>\s*研发组长评审报告([^<]*)<\/title>/gi,
    '<title>自动化研发报告$1</title>',
  );
  result = result.replace(
    /(<h1[^>]*>)\s*研发组长评审报告\s*(<\/h1>)/gi,
    '$1自动化研发报告$2',
  );
  return result;
}

/** 向 iframe 报告 HTML 注入与下方评审面板一致的滚动条样式 */
export function injectReportHtmlScrollbarStyles(html: string): string {
  if (!html?.trim() || html.includes('synapse-report-scrollbar')) return html;
  if (html.includes('</head>')) {
    return html.replace('</head>', `${REPORT_SCROLLBAR_STYLE}\n</head>`);
  }
  return `${REPORT_SCROLLBAR_STYLE}${html}`;
}

/** 回填报告 §6「评审人员」章节的条目（与 fill_leader_review.py 结构对齐，并含评审结论） */
export type ReportReviewerPatchItem = {
  employee_id?:   string;
  reviewer_name:  string;
  role:             string;
  conclusion?:      Reviewer['conclusion'];
  comments?:        string | null;
};

const REVIEWER_AVATAR_COLOR: Record<string, string> = {
  submitter:    '#6366f1',
  team_lead:    '#3b82f6',
  product_lead: '#f59e0b',
  internal:     '#8b5cf6',
};

const REVIEWER_CONCLUSION_STYLE: Record<
  NonNullable<ReportReviewerPatchItem['conclusion']>,
  { text: string; color: string }
> = {
  approved: { text: '已通过', color: '#22c55e' },
  rejected: { text: '已驳回', color: '#ef4444' },
  pending:  { text: '待评审', color: '#94a3b8' },
};

/** 生成与归档 HTML 模板一致的 reviewer-chip 列表（含评审状态） */
export function buildReviewersSectionHtml(reviewers: ReportReviewerPatchItem[]): string {
  return reviewers.map((rv) => {
    const name = (rv.reviewer_name || rv.employee_id || '').trim() || '—';
    const role = rv.role || 'internal';
    const roleLabel = REVIEWER_ROLE_LABEL[role] ?? role;
    const color = REVIEWER_AVATAR_COLOR[role] ?? '#64748b';
    const initial = esc(name.slice(0, 1) || '?');
    const conclusion = rv.conclusion ?? 'pending';
    const status = REVIEWER_CONCLUSION_STYLE[conclusion];
    const comment = (rv.comments || '').trim();
    const titleAttr = comment ? ` title="${esc(comment)}"` : '';
    const commentLine = comment
      ? `<div class="review-comment" style="margin-top:4px;font-size:.68rem;color:#64748b;max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${esc(comment)}</div>`
      : '';
    return `
        <div class="reviewer-chip"${titleAttr}>
          <div class="reviewer-avatar" style="background:${color}">${initial}</div>
          <div class="reviewer-info">
            <div class="name">${esc(name)}</div>
            <div class="role">${esc(roleLabel)}</div>
            <div class="review-status" style="margin-top:3px;font-size:.68rem;font-weight:600;color:${status.color};">${esc(status.text)}</div>
            ${commentLine}
          </div>
        </div>`;
  }).join('\n');
}

/**
 * 将评审人员及评审结论回填进报告 HTML 的「§6 评审人员」章节。
 * 在每次 search/resolve 刷新后调用，使 iframe 与下方评审表保持一致。
 */
export function patchReportHtmlReviewers(html: string, reviewers: ReportReviewerPatchItem[]): string {
  if (!html?.trim()) return html;
  const inner = reviewers.length > 0
    ? buildReviewersSectionHtml(reviewers)
    : '<p style="margin:0;font-size:.8rem;color:#64748b;">暂无评审人员</p>';

  const reviewerListRe = /(<div class="reviewer-list"\s*>)([\s\S]*?)(<\/div>)/i;
  if (reviewerListRe.test(html)) {
    return html.replace(reviewerListRe, `$1\n${inner}\n      $3`);
  }
  if (html.includes('{{REVIEWERS_HTML}}')) {
    return html.replace(/\{\{REVIEWERS_HTML\}\}/g, inner);
  }
  return html;
}

/** 展示前统一处理归档/远程 HTML（标题、研发单号、评审人员、滚动条） */
export function prepareReportHtmlForDisplay(
  html: string,
  taskNos: string[],
  reviewers?: ReportReviewerPatchItem[],
): string {
  if (!html?.trim()) return html;
  let result = patchReportHtmlTitle(patchReportHtmlTaskNos(html, taskNos));
  if (reviewers !== undefined) {
    result = patchReportHtmlReviewers(result, reviewers);
  }
  return injectReportHtmlScrollbarStyles(result);
}

/** 向已有 HTML 报告补写研发单号（模板或旧版报告可能缺失该字段） */
export function patchReportHtmlTaskNos(html: string, taskNos: string[]): string {
  if (!html?.trim()) return html;
  const label = taskNos.map((t) => t.trim()).filter(Boolean).join(', ') || '-';
  const safe = esc(label);

  // 已有非空研发单号则跳过
  const hasTaskNo = /研发单(?:号)?[^<]{0,24}<[^>]*>\s*[^<\-\s][^<]*/.test(html)
    || /🔧 研发单 <strong[^>]*>[^<-][^<]*/.test(html);
  if (hasTaskNo) return html;

  if (html.includes('🔧 研发单')) {
    return html.replace(
      new RegExp('(<span>🔧 研发单 <strong[^>]*>)[^<]*(</strong></span>)'),
      `$1${safe}$2`,
    );
  }
  if (html.includes('{{TASK_NOS}}')) {
    return html.replace(/\{\{TASK_NOS\}\}/g, safe);
  }
  if (html.includes('<strong>研发单号</strong>')) {
    return html.replace(
      /(<p><strong>研发单号<\/strong>\s*[^<]*<\/p>)/,
      `<p><strong>研发单号</strong>　${safe}</p>`,
    );
  }
  if (html.includes('<strong>需求编号</strong>')) {
    return html.replace(
      /(<p><strong>需求编号<\/strong>[^<]*<\/p>)/,
      `$1\n      <p><strong>研发单号</strong>　${safe}</p>`,
    );
  }
  return html;
}

function scoreColor(score: number): string {
  if (score >= 85) return '#22c55e';
  if (score >= 70) return '#f59e0b';
  return '#ef4444';
}

function scoreGrade(score: number): string {
  if (score >= 90) return 'A';
  if (score >= 80) return 'B';
  if (score >= 70) return 'C';
  if (score >= 60) return 'D';
  return 'F';
}

function statusBadge(status: SopNodeStat['status']): string {
  const map = {
    passed:  ['✅', '#22c55e', '#052e16'],
    warning: ['⚠️', '#f59e0b', '#1c1108'],
    failed:  ['❌', '#ef4444', '#1c0505'],
    skipped: ['⏭️', '#64748b', '#0f172a'],
  };
  const [icon, color, bg] = map[status] ?? map.skipped;
  return `<span style="background:${bg};color:${color};border:1px solid ${color}44;padding:2px 8px;border-radius:999px;font-size:11px;white-space:nowrap">${icon} ${status}</span>`;
}

export function generateRdReportHtml(data: RdReportData): string {
  const riskColor = { low: '#22c55e', medium: '#f59e0b', high: '#ef4444' }[data.riskLevel];
  const riskLabel = { low: '低风险', medium: '中风险', high: '高风险' }[data.riskLevel];
  const gradeColor = scoreColor(data.overallScore);

  const testTotal  = data.testCases.length;
  const testPassed = data.testCases.filter((t) => t.result === 'passed').length;
  const testRate   = testTotal > 0 ? Math.round((testPassed / testTotal) * 100) : 0;
  const testRateColor = testRate === 100 ? '#22c55e' : testRate >= 80 ? '#f59e0b' : '#ef4444';

  // SOP 节点行
  const sopRows = data.sopNodes.map((n, i) => `
    <tr style="border-bottom:1px solid #1e293b;${i % 2 === 1 ? 'background:rgba(255,255,255,0.015)' : ''}">
      <td style="padding:12px 16px;font-size:12px;color:#94a3b8;white-space:nowrap">${esc(n.stageName)}</td>
      <td style="padding:12px 16px">
        <div style="font-size:13px;font-weight:600;color:#e2e8f0">${esc(n.nodeName)}</div>
        <div style="font-size:11px;color:#64748b;margin-top:2px;font-family:monospace">${esc(n.nodeId)}</div>
      </td>
      <td style="padding:12px 16px;font-size:12px;color:#94a3b8;line-height:1.6">${esc(n.summary)}</td>
      <td style="padding:12px 16px;text-align:center">
        <div style="font-size:20px;font-weight:700;color:${scoreColor(n.qualityScore)};font-variant-numeric:tabular-nums">${n.qualityScore}</div>
        <div style="font-size:10px;color:#64748b;margin-top:1px">质量</div>
      </td>
      <td style="padding:12px 16px;text-align:center">
        <div style="font-size:20px;font-weight:700;color:${scoreColor(n.consistencyScore)};font-variant-numeric:tabular-nums">${n.consistencyScore}</div>
        <div style="font-size:10px;color:#64748b;margin-top:1px">一致性</div>
      </td>
      <td style="padding:12px 16px;text-align:center">
        ${n.humanIntervCount > 0
          ? `<span style="background:#1c1108;color:#f59e0b;border:1px solid #f59e0b44;padding:2px 8px;border-radius:999px;font-size:11px">${n.humanIntervCount}次介入</span>`
          : `<span style="color:#334155;font-size:12px">—</span>`}
        ${n.retryCount > 0
          ? `<div style="margin-top:4px"><span style="background:#1c0505;color:#ef4444;border:1px solid #ef444444;padding:2px 8px;border-radius:999px;font-size:11px">${n.retryCount}次重试</span></div>`
          : ''}
      </td>
      <td style="padding:12px 16px;text-align:center">${statusBadge(n.status)}</td>
    </tr>`).join('');

  // 代码文件行
  const diffRows = data.diffFiles.map((f) => {
    const typeColor = f.changeType === 'added' ? '#22c55e' : f.changeType === 'deleted' ? '#ef4444' : '#f59e0b';
    const typeLabel = f.changeType === 'added' ? '新增' : f.changeType === 'deleted' ? '删除' : '修改';
    return `
    <tr style="border-bottom:1px solid #1e293b">
      <td style="padding:8px 16px;font-family:monospace;font-size:12px;color:#cbd5e1">${esc(f.path)}</td>
      <td style="padding:8px 16px;text-align:center">
        <span style="background:${typeColor}18;color:${typeColor};border:1px solid ${typeColor}44;padding:1px 6px;border-radius:4px;font-size:11px">${typeLabel}</span>
      </td>
      <td style="padding:8px 16px;text-align:right;color:#22c55e;font-family:monospace;font-size:12px">+${f.insertions}</td>
      <td style="padding:8px 16px;text-align:right;color:#ef4444;font-family:monospace;font-size:12px">-${f.deletions}</td>
    </tr>`;
  }).join('');

  // 测试行
  const testRows = data.testCases.map((tc) => {
    const [icon, color] = tc.result === 'passed' ? ['✅', '#22c55e'] : tc.result === 'failed' ? ['❌', '#ef4444'] : ['⏭️', '#64748b'];
    return `<tr style="border-bottom:1px solid #1e293b">
      <td style="padding:8px 16px;font-size:13px;color:#cbd5e1">${esc(tc.name)}</td>
      <td style="padding:8px 16px;color:${color};font-size:12px">${icon} ${tc.result}</td>
    </tr>`;
  }).join('');

  // 综合评分环形图 SVG（纯 CSS 模拟）
  const scoreArc = Math.round(data.overallScore * 2.83); // circumference ≈ 283

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>自动化研发报告 · ${esc(data.demandNo)}</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:'PingFang SC','Microsoft YaHei','Inter',sans-serif;background:#060d1a;color:#e2e8f0;min-height:100vh;font-size:14px;line-height:1.6}
.glass{background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.07);backdrop-filter:blur(12px)}
.section{margin-bottom:24px;border-radius:16px;overflow:hidden}
.section-head{padding:16px 24px;border-bottom:1px solid rgba(255,255,255,0.07);display:flex;align-items:center;gap:10px}
.section-head h2{font-size:15px;font-weight:600;color:#f1f5f9}
.tag{display:inline-flex;align-items:center;gap:4px;padding:2px 10px;border-radius:999px;font-size:11px;font-weight:600;border:1px solid}
table{width:100%;border-collapse:collapse}
th{font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.05em;color:#475569;padding:10px 16px;text-align:left;background:rgba(0,0,0,0.3)}
.stat-card{border-radius:16px;padding:20px 24px;display:flex;flex-direction:column;gap:6px}
.ring-wrap{position:relative;width:90px;height:90px;flex-shrink:0}
.ring-wrap svg{transform:rotate(-90deg)}
.ring-label{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;font-variant-numeric:tabular-nums}
@media print{body{background:#fff;color:#111}.glass{border:1px solid #e5e7eb}}
*{scrollbar-width:thin;scrollbar-color:transparent transparent}
*:hover{scrollbar-color:rgba(255,255,255,0.12) transparent}
*::-webkit-scrollbar{width:6px;height:6px}
*::-webkit-scrollbar-track{background:transparent}
*::-webkit-scrollbar-thumb{background:transparent;border-radius:3px}
*:hover::-webkit-scrollbar-thumb{background:rgba(255,255,255,0.12)}
*::-webkit-scrollbar-thumb:hover{background:rgba(255,255,255,0.35)}
</style>
</head>
<body>

<!-- ── Banner ─────────────────────────────────────────────────────────────── -->
<div style="background:linear-gradient(135deg,#0a0f1e 0%,#0d1b3e 45%,#070f1f 100%);padding:40px 40px 32px;border-bottom:1px solid #1e3a5f">
  <div style="max-width:1100px;margin:0 auto">
    <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:24px;flex-wrap:wrap">
      <div>
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:12px">
          <div style="width:40px;height:40px;border-radius:12px;background:linear-gradient(135deg,#1d4ed8,#7c3aed);display:flex;align-items:center;justify-content:center;flex-shrink:0">
            <svg viewBox="0 0 24 24" width="20" height="20" fill="white"><path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
          </div>
          <div>
            <div style="font-size:11px;text-transform:uppercase;letter-spacing:.1em;color:#4a8fc4;font-weight:600">Synapse · 自动化研发报告</div>
            <h1 style="font-size:24px;font-weight:700;color:#f0f9ff;margin-top:2px">${esc(data.demandTitle || data.demandNo)}</h1>
          </div>
        </div>
        <div style="display:flex;flex-wrap:wrap;gap:16px;font-size:12px;color:#64748b">
          <span>📋 需求单 <strong style="color:#94a3b8;font-family:monospace">${esc(data.demandNo)}</strong></span>
          <span>🔧 研发单 <strong style="color:#94a3b8;font-family:monospace">${esc(data.taskNos.join(', ') || '-')}</strong></span>
          <span>👤 提交人 <strong style="color:#94a3b8">${esc(data.assigneeName)}</strong></span>
          <span>🕐 生成时间 <strong style="color:#94a3b8">${esc(data.generateTime)}</strong></span>
        </div>
      </div>

      <!-- 综合评分环 -->
      <div style="text-align:center;flex-shrink:0">
        <div class="ring-wrap" style="width:110px;height:110px">
          <svg width="110" height="110" viewBox="0 0 110 110">
            <circle cx="55" cy="55" r="45" fill="none" stroke="#1e293b" stroke-width="10"/>
            <circle cx="55" cy="55" r="45" fill="none" stroke="${gradeColor}" stroke-width="10"
              stroke-dasharray="${scoreArc} 283" stroke-linecap="round" style="transition:stroke-dasharray .6s ease"/>
          </svg>
          <div class="ring-label">
            <div style="font-size:26px;font-weight:800;color:${gradeColor};line-height:1">${data.overallScore}</div>
            <div style="font-size:11px;color:#64748b;margin-top:2px">综合评分</div>
          </div>
        </div>
        <div style="margin-top:8px">
          <span class="tag" style="color:${gradeColor};border-color:${gradeColor}44;background:${gradeColor}12;font-size:14px">
            Grade ${scoreGrade(data.overallScore)}
          </span>
        </div>
      </div>
    </div>
  </div>
</div>

<!-- ── 核心指标卡 ──────────────────────────────────────────────────────────── -->
<div style="max-width:1100px;margin:0 auto;padding:28px 40px 0">
  <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:16px;margin-bottom:28px">

    <div class="glass stat-card">
      <div style="font-size:11px;text-transform:uppercase;letter-spacing:.07em;color:#475569">综合风险</div>
      <div style="font-size:28px;font-weight:800;color:${riskColor}">${riskLabel}</div>
      <div style="font-size:12px;color:#64748b">${esc(data.riskSummary || '—').substring(0, 40)}${data.riskSummary?.length > 40 ? '…' : ''}</div>
    </div>

    <div class="glass stat-card">
      <div style="font-size:11px;text-transform:uppercase;letter-spacing:.07em;color:#475569">代码变更</div>
      <div style="font-size:28px;font-weight:800;color:#60a5fa;font-variant-numeric:tabular-nums">${data.diffStats.filesChanged}</div>
      <div style="font-size:12px;color:#64748b">
        <span style="color:#34d399">+${data.diffStats.insertions}</span>
        <span style="color:#475569;margin:0 4px">/</span>
        <span style="color:#f87171">-${data.diffStats.deletions}</span>
        &nbsp;行
      </div>
    </div>

    <div class="glass stat-card">
      <div style="font-size:11px;text-transform:uppercase;letter-spacing:.07em;color:#475569">测试通过率</div>
      <div style="font-size:28px;font-weight:800;color:${testRateColor};font-variant-numeric:tabular-nums">${testRate}%</div>
      <div style="font-size:12px;color:#64748b">${testPassed} / ${testTotal} 用例通过</div>
    </div>

    <div class="glass stat-card">
      <div style="font-size:11px;text-transform:uppercase;letter-spacing:.07em;color:#475569">最大代码复杂度</div>
      <div style="font-size:28px;font-weight:800;color:${data.entropyStats.maxComplexity <= 10 ? '#34d399' : '#f59e0b'};font-variant-numeric:tabular-nums">${data.entropyStats.maxComplexity}</div>
      <div style="font-size:12px;color:#64748b">均值 ${data.entropyStats.avgComplexity} · 新增告警 ${data.entropyStats.newWarnings}</div>
    </div>

    <div class="glass stat-card">
      <div style="font-size:11px;text-transform:uppercase;letter-spacing:.07em;color:#475569">重复代码行</div>
      <div style="font-size:28px;font-weight:800;color:${data.entropyStats.duplicateLines === 0 ? '#34d399' : data.entropyStats.duplicateLines < 20 ? '#f59e0b' : '#ef4444'};font-variant-numeric:tabular-nums">${data.entropyStats.duplicateLines}</div>
      <div style="font-size:12px;color:#64748b">阈值 ≤ 20 行</div>
    </div>

  </div>

  <!-- ── SOP 节点评审明细 ───────────────────────────────────────────────── -->
  <div class="section glass" style="margin-bottom:24px">
    <div class="section-head">
      <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="#818cf8" stroke-width="2"><path d="M4 6h16M4 12h16M4 18h7"/></svg>
      <h2>SOP 研发流水线 · 节点评审明细</h2>
      <span class="tag" style="color:#818cf8;border-color:#818cf844;background:#818cf812;margin-left:auto">${data.sopNodes.length} 节点</span>
    </div>
    <div style="overflow-x:auto">
      <table>
        <thead>
          <tr>
            <th>阶段</th><th>节点</th><th>关键摘要</th>
            <th style="text-align:center;width:80px">质量分</th>
            <th style="text-align:center;width:80px">一致性</th>
            <th style="text-align:center;width:110px">人工介入</th>
            <th style="text-align:center;width:90px">状态</th>
          </tr>
        </thead>
        <tbody>${sopRows || '<tr><td colspan="7" style="padding:24px;text-align:center;color:#475569">（暂无节点数据）</td></tr>'}</tbody>
      </table>
    </div>
  </div>

  <!-- ── 代码差异分析 ───────────────────────────────────────────────────── -->
  <div class="section glass" style="margin-bottom:24px">
    <div class="section-head">
      <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="#22d3ee" stroke-width="2"><path d="M12 6v6m0 0v6m0-6h6m-6 0H6"/></svg>
      <h2>代码差异分析</h2>
      <div style="margin-left:auto;display:flex;gap:12px;font-size:12px">
        <span><span style="color:#22c55e">+${data.diffStats.insertions}</span> 新增</span>
        <span><span style="color:#ef4444">-${data.diffStats.deletions}</span> 删除</span>
        <span style="color:#60a5fa">${data.diffStats.filesChanged} 文件</span>
      </div>
    </div>
    ${data.diffSummary ? `<div style="padding:16px 24px">
      <div style="background:rgba(0,0,0,0.4);border:1px solid #1e293b;border-radius:10px;padding:16px;font-family:monospace;font-size:12px;color:#94a3b8;white-space:pre-wrap;line-height:1.7">${esc(data.diffSummary)}</div>
    </div>` : ''}
    ${data.diffFiles.length > 0 ? `<table>
      <thead><tr><th>文件路径</th><th style="width:80px">变更类型</th><th style="width:80px;text-align:right">新增</th><th style="width:80px;text-align:right">删除</th></tr></thead>
      <tbody>${diffRows}</tbody>
    </table>` : ''}
  </div>

  <!-- ── 测试案例 ────────────────────────────────────────────────────────── -->
  ${testTotal > 0 ? `<div class="section glass" style="margin-bottom:24px">
    <div class="section-head">
      <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="#4ade80" stroke-width="2"><path d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"/></svg>
      <h2>测试案例</h2>
      <span class="tag" style="color:${testRateColor};border-color:${testRateColor}44;background:${testRateColor}12;margin-left:auto">${testPassed}/${testTotal} 通过</span>
    </div>
    <table>
      <thead><tr><th>测试名称</th><th style="width:120px">结果</th></tr></thead>
      <tbody>${testRows}</tbody>
    </table>
  </div>` : ''}

  <!-- ── 底部签章 ────────────────────────────────────────────────────────── -->
  <div style="text-align:center;padding:32px 0 48px;font-size:11px;color:#1e3a5f">
    <div>本报告由 <strong style="color:#334155">Synapse 自动化研发系统</strong> 生成 · ${esc(data.generateTime)}</div>
    <div style="margin-top:4px;opacity:.6">需求单：${esc(data.demandNo)} · 仅供内部评审参考，请勿对外发布</div>
  </div>
</div>
</body>
</html>`;
}

/** 构造示例报告数据（正式生产中应从 SOP 归档读取） */
export function buildRdReportDataFromDemand(params: {
  demandNo:      string;
  demandTitle:   string;
  taskNos:       string[];
  assigneeName:  string;
  diffSummary?:  string;
  diffFiles?:    DiffFileEntry[];
  sopNodes?:     SopNodeStat[];
}): RdReportData {
  const now = new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' });
  const defaultNodes: SopNodeStat[] = [
    { nodeId: 'req_clarify',   nodeName: '需求澄清',   stageName: '需求分析', summary: '已完成需求澄清，确认功能范围与约束',     qualityScore: 90, consistencyScore: 92, humanIntervCount: 0, retryCount: 0, status: 'passed',  artifacts: ['需求澄清.md'] },
    { nodeId: 'module_func',   nodeName: '模块功能',   stageName: '需求分析', summary: '功能模块拆分完成，改造边界清晰',         qualityScore: 88, consistencyScore: 90, humanIntervCount: 0, retryCount: 0, status: 'passed',  artifacts: ['模块功能.md'] },
    { nodeId: 'acceptance',    nodeName: '验收标准',   stageName: '需求分析', summary: '验收标准已定义，覆盖核心功能点',         qualityScore: 85, consistencyScore: 87, humanIntervCount: 0, retryCount: 0, status: 'passed',  artifacts: ['验收标准.md'] },
    { nodeId: 'func_solution', nodeName: '函数级方案', stageName: '需求设计', summary: '接口契约与数据结构经人工评审通过',       qualityScore: 87, consistencyScore: 89, humanIntervCount: 1, retryCount: 0, status: 'passed',  artifacts: ['函数级方案.md'] },
    { nodeId: 'task_exec',     nodeName: '任务执行',   stageName: '研发实施', summary: '自动化开发完成，全部功能点已实现',       qualityScore: 82, consistencyScore: 85, humanIntervCount: 2, retryCount: 1, status: 'passed',  artifacts: ['任务执行记录.md'] },
    { nodeId: 'unit_test',     nodeName: '测试案例',   stageName: '研发实施', summary: '单元测试覆盖核心逻辑，通过率 100%',      qualityScore: 95, consistencyScore: 93, humanIntervCount: 0, retryCount: 0, status: 'passed',  artifacts: ['测试案例说明.md'] },
    { nodeId: 'risk_review',   nodeName: '风险评审',   stageName: '代码走查', summary: 'AI 综合评定：低风险，可推进合并',         qualityScore: 88, consistencyScore: 86, humanIntervCount: 0, retryCount: 0, status: 'passed',  artifacts: ['风险评审.md'] },
    { nodeId: 'entropy_review',nodeName: '控熵评审',   stageName: '代码走查', summary: '控熵指标合规，无新增告警',               qualityScore: 90, consistencyScore: 88, humanIntervCount: 0, retryCount: 0, status: 'passed',  artifacts: ['控熵评审.md'] },
  ];
  const nodes = params.sopNodes ?? defaultNodes;
  const avgScore = Math.round(nodes.reduce((s, n) => s + (n.qualityScore + n.consistencyScore) / 2, 0) / Math.max(nodes.length, 1));
  return {
    demandNo:     params.demandNo,
    demandTitle:  params.demandTitle,
    taskNos:      params.taskNos,
    assigneeName: params.assigneeName,
    generateTime: now,
    overallScore: avgScore,
    riskLevel:    'low',
    riskSummary:  '经 AI 自动评审，本次改造未引入高风险变更，可进入评审阶段。',
    sopNodes:     nodes,
    diffSummary:  params.diffSummary ?? '（代码差异摘要将在正式提交后自动生成）',
    diffFiles:    params.diffFiles ?? [],
    diffStats:    { filesChanged: (params.diffFiles ?? []).length, insertions: 0, deletions: 0 },
    testCases:    [],
    entropyStats: { avgComplexity: 0, maxComplexity: 0, duplicateLines: 0, newWarnings: 0 },
  };
}

// 保留旧别名兼容 OrderManagement.tsx
export type { ReportRecord as LegacyReportRecord };
export type { Reviewer as ReportReviewer };
export type { ReviewerInfo as LegacyReviewerInfo };
