/** 环境预生成文档分类与路径工具 */

export type EnvDocCategoryId = 'agents' | 'spec' | 'process' | 'product';

export interface EnvDocCategoryMeta {
  id: EnvDocCategoryId;
  title: string;
  subtitle: string;
  purpose: string;
  gradient: string;
  accent: string;
}

export interface EnvPregenDocEntry {
  id: string;
  path: string;
  scopeRelativePath: string;
  fileName: string;
  label: string;
  category: EnvDocCategoryId;
  purpose: string;
  status: string;
  skipReason?: string;
  nodeId?: string;
  nodeName?: string;
  docType?: string;
  isMarkdown: boolean;
  module?: string;
  engineeringRoot?: string;
}

export const ENV_DOC_CATEGORIES: EnvDocCategoryMeta[] = [
  {
    id: 'agents',
    title: 'AGENTS.md 文档',
    subtitle: '研发助手上下文',
    purpose: '注入项目级行为约束、工具约定与工单目录，供 CLI / 智能体读取。',
    gradient: 'rd-env-pregen-card--agents',
    accent: 'text-violet-300',
  },
  {
    id: 'spec',
    title: '规范文档',
    subtitle: '产品规范 / 编码规范',
    purpose: '各语言研发规范与模板，统一代码风格、文档结构与提交要求。',
    gradient: 'rd-env-pregen-card--spec',
    accent: 'text-amber-300',
  },
  {
    id: 'process',
    title: '智能研发流程文档',
    subtitle: '需求分析 · 需求设计',
    purpose: 'SOP 各阶段归档产出（澄清、边界、方案等）；已关闭/跳过节点对应产出标记为 skipped。',
    gradient: 'rd-env-pregen-card--process',
    accent: 'text-cyan-300',
  },
  {
    id: 'product',
    title: '产品文档',
    subtitle: '产品知识体系',
    purpose: '产品架构（功能/技术架构）、产品研发手册等产品侧 Markdown 文档。',
    gradient: 'rd-env-pregen-card--product',
    accent: 'text-emerald-300',
  },
];

const FILE_PURPOSE: Record<string, string> = {
  'AGENTS.md': '研发助手项目上下文与协作规则',
  'FUNCTIONAL_ARCH.md': '产品功能架构与业务能力说明',
  'TECH_ARCH.md': '产品技术架构、分层与实现约束',
  '产品研发手册.md': '产品研发流程与交付指引',
  '需求澄清.md': '需求澄清阶段结论与待确认项',
  '边界确认说明.md': '需求边界与范围确认',
  '模块功能.md': '模块级功能拆分与改造范围',
  '验收标准.md': '验收标准与通过条件',
  '需求风险评估.md': '需求风险识别与应对',
  '功能点分派清单.md': '功能点分派与责任划分',
  '历史方案映射.md': '历史方案对照与复用建议',
  '模块范围确认.md': '模块改造范围确认',
  '函数级方案.md': '函数级改造方案与伪代码',
};

function fileNameFromPath(filePath: string): string {
  const norm = filePath.replace(/\\/g, '/').replace(/\/+/g, '/').replace(/^\/+/, '');
  const idx = norm.lastIndexOf('/');
  return idx < 0 ? norm : norm.slice(idx + 1);
}

export function toScopeRelativePath(absoluteOrRelative: string, scopeId: string): string {
  const raw = (absoluteOrRelative || '').trim();
  if (!raw) return '';
  const norm = raw.replace(/\\/g, '/');
  const workMatch = norm.match(/\/work\/[^/]+\/(.+)$/i);
  if (workMatch?.[1]) return workMatch[1].replace(/^\/+/, '');

  const sid = (scopeId || '').trim();
  if (sid) {
    const markers = [`/work/${sid}/`, `/work/${sid.toLowerCase()}/`];
    for (const marker of markers) {
      const idx = norm.toLowerCase().indexOf(marker.toLowerCase());
      if (idx >= 0) return norm.slice(idx + marker.length).replace(/^\/+/, '');
    }
  }
  if (!/^[a-zA-Z]:[/\\]/.test(raw) && !norm.startsWith('//')) {
    return norm.replace(/^\/+/, '');
  }
  return '';
}

function inferPurpose(
  fileName: string,
  label: string,
  category: EnvDocCategoryId,
  nodeName?: string,
): string {
  if (FILE_PURPOSE[fileName]) return FILE_PURPOSE[fileName];
  if (fileName.endsWith('研发规范.md')) return `${fileName.replace('.md', '')}编写约束`;
  if (category === 'process') {
    const tail = label.split('/').pop() || fileName;
    const base = FILE_PURPOSE[tail] || FILE_PURPOSE[fileName] || tail.replace('.md', '');
    return nodeName ? `${nodeName} · ${base}` : `流程归档：${base}`;
  }
  if (category === 'product') return FILE_PURPOSE[fileName] || `产品文档：${fileName.replace('.md', '')}`;
  return '环境预生成落盘文档';
}

export function envDocStatusLabel(doc: EnvPregenDocEntry): string {
  if (doc.status === 'ok') return '已落盘';
  if (doc.status === 'skipped') return doc.skipReason || '已跳过';
  if (doc.status === 'missing') return '未归档';
  return doc.status;
}

export function classifyEnvEntry(
  entry: Record<string, unknown>,
  scopeId: string,
): EnvPregenDocEntry | null {
  const path = String(entry.path || '').trim();
  if (!path) return null;

  const categoryRaw = String(entry.category || '');
  const label = String(entry.label || fileNameFromPath(path));
  const fileName = String(entry.file_name || entry.fileName || fileNameFromPath(path));
  const norm = path.replace(/\\/g, '/');
  const nodeName = String(entry.node_name || entry.nodeName || '').trim() || undefined;
  const skipReason = String(entry.skip_reason || entry.skipReason || '').trim() || undefined;

  let category: EnvDocCategoryId;
  if (categoryRaw === 'dev_template' && fileName === 'AGENTS.md') {
    category = 'agents';
  } else if (categoryRaw === 'dev_template') {
    category = 'spec';
  } else if (categoryRaw === 'sop_artifact' || categoryRaw === 'work_order_doc') {
    category =
      norm.includes('/产品架构/') || norm.includes('/产品手册/') ? 'product' : 'process';
  } else if (categoryRaw === 'catalog_doc' || categoryRaw === 'product_doc') {
    category = 'product';
  } else if (categoryRaw === 'entropy') {
    return null;
  } else {
    return null;
  }

  if (categoryRaw === 'catalog_doc' && !/\.(md|markdown)$/i.test(fileName)) {
    return null;
  }

  const scopeRelativePath = toScopeRelativePath(path, scopeId);
  const isMarkdown = /\.(md|markdown)$/i.test(fileName);
  const status = String(entry.status || 'ok');

  return {
    id: `${category}:${scopeRelativePath || path}:${fileName}`,
    path,
    scopeRelativePath,
    fileName,
    label,
    category,
    purpose: inferPurpose(fileName, label, category, nodeName),
    status,
    skipReason,
    nodeId: String(entry.node_id || entry.nodeId || '').trim() || undefined,
    nodeName,
    docType: String(entry.doc_type || entry.docType || '').trim() || undefined,
    isMarkdown,
    module: String(entry.module || '').trim() || undefined,
    engineeringRoot: String(entry.engineering_root || '').trim() || undefined,
  };
}

export function collectEnvPregenDocs(
  display: Record<string, unknown>,
  scopeId: string,
): EnvPregenDocEntry[] {
  const flat = Array.isArray(display.path_entries)
    ? (display.path_entries as Record<string, unknown>[])
    : [];
  const groups = Array.isArray(display.path_groups)
    ? (display.path_groups as Record<string, unknown>[])
    : [];

  const rows: Record<string, unknown>[] = [...flat];
  if (!rows.length && groups.length) {
    for (const group of groups) {
      const entries = group.entries;
      if (Array.isArray(entries)) {
        rows.push(...(entries as Record<string, unknown>[]));
      }
    }
  }

  const seen = new Set<string>();
  const docs: EnvPregenDocEntry[] = [];
  for (const row of rows) {
    const doc = classifyEnvEntry(row, scopeId);
    if (!doc || seen.has(doc.id)) continue;
    seen.add(doc.id);
    docs.push(doc);
  }
  return docs;
}

export function groupDocsByCategory(
  docs: EnvPregenDocEntry[],
): Record<EnvDocCategoryId, EnvPregenDocEntry[]> {
  const out: Record<EnvDocCategoryId, EnvPregenDocEntry[]> = {
    agents: [],
    spec: [],
    process: [],
    product: [],
  };
  for (const doc of docs) {
    out[doc.category].push(doc);
  }
  for (const key of Object.keys(out) as EnvDocCategoryId[]) {
    out[key].sort((a, b) => a.fileName.localeCompare(b.fileName, 'zh-CN'));
  }
  return out;
}
