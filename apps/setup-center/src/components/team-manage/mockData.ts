export type Dimension = 'month' | 'week' | 'day';

export interface MetricValue {
  value: number;
  unit?: string;
  prevMonthComp: number;
  prevWeekComp: number;
  prevDayComp: number;
  trend: number[];
}

export interface KnowledgeMetric {
  total: number;
  prevMonthComp: number;
  prevWeekComp: number;
  prevDayComp: number;
  breakdown: { label: string; value: number; color: string }[];
  trend: number[];
}

export interface PersonnelItem {
  key: string;
  employeeId: string;
  name: string;
  role: string;
  avatarColor: string;
  tokens: number;
  tasks: number;
  requirements: number;
  docs: number;
  codeQuality: number;
  efficiency: number;
}

export interface AIInteraction {
  workSummary: string;
  personalNotes: string;
  screenshots?: string[];
}

export interface OutputItem {
  type: 'code' | 'doc';
  name: string;
  lines?: number;
  pages?: number;
  language?: string;
}

export interface WaterfallNode {
  id: string;
  product: string;
  productColor: string;
  workOrder: string;
  workOrderId: string;
  stage: string;
  stageColor: string;
  sopNode: string;
  startTime: string;
  duration: string;
  employeeId: string;
  name: string;
  avatarColor: string;
  role: string;
  tokensUsed: number;
  aiInteraction: AIInteraction;
  outputs: OutputItem[];
  dimension: Dimension[];
}

export interface SummaryData {
  requirements: MetricValue;
  tasks: MetricValue;
  modules: MetricValue;
  codeLines: MetricValue;
  totalTokens: MetricValue;
  knowledge: KnowledgeMetric;
  teamEfficiency: MetricValue;
}

// ============ 汇总指标数据 ============
export const summaryData: Record<Dimension, SummaryData> = {
  month: {
    requirements: {
      value: 128, unit: '项',
      prevMonthComp: 12.5, prevWeekComp: 8.3, prevDayComp: -2.1,
      trend: [95, 102, 108, 115, 119, 124, 128],
    },
    tasks: {
      value: 342, unit: '个',
      prevMonthComp: 18.2, prevWeekComp: 5.7, prevDayComp: 3.4,
      trend: [240, 268, 290, 310, 325, 337, 342],
    },
    modules: {
      value: 45, unit: '个',
      prevMonthComp: 7.1, prevWeekComp: 4.2, prevDayComp: 0,
      trend: [32, 35, 38, 40, 42, 44, 45],
    },
    codeLines: {
      value: 158320, unit: '行',
      prevMonthComp: 22.4, prevWeekComp: 11.8, prevDayComp: 5.2,
      trend: [98000, 112000, 124000, 135000, 145000, 153000, 158320],
    },
    totalTokens: {
      value: 28476500, unit: 'T',
      prevMonthComp: 35.6, prevWeekComp: 14.2, prevDayComp: 8.7,
      trend: [18000000, 20500000, 22800000, 24500000, 26000000, 27400000, 28476500],
    },
    knowledge: {
      total: 69,
      prevMonthComp: 28.3, prevWeekComp: 12.5, prevDayComp: 4.3,
      breakdown: [
        { label: '需求分析', value: 23, color: '#a855f7' },
        { label: '设计方案', value: 18, color: '#13c2c2' },
        { label: '产品架构', value: 7, color: '#722ed1' },
        { label: '使用手册', value: 12, color: '#52c41a' },
        { label: '产品交付', value: 9, color: '#fa8c16' },
      ],
      trend: [42, 48, 54, 58, 62, 66, 69],
    },
    teamEfficiency: {
      value: 87.3, unit: '%',
      prevMonthComp: 5.8, prevWeekComp: 2.1, prevDayComp: 0.3,
      trend: [76, 79, 81, 83, 85, 86, 87.3],
    },
  },
  week: {
    requirements: {
      value: 34, unit: '项',
      prevMonthComp: 8.2, prevWeekComp: 6.3, prevDayComp: -1.5,
      trend: [22, 25, 28, 30, 31, 33, 34],
    },
    tasks: {
      value: 87, unit: '个',
      prevMonthComp: 12.4, prevWeekComp: 9.1, prevDayComp: 2.8,
      trend: [58, 64, 70, 75, 80, 84, 87],
    },
    modules: {
      value: 12, unit: '个',
      prevMonthComp: 4.5, prevWeekComp: 9.1, prevDayComp: 0,
      trend: [7, 8, 9, 10, 11, 11, 12],
    },
    codeLines: {
      value: 42580, unit: '行',
      prevMonthComp: 15.8, prevWeekComp: 18.3, prevDayComp: 6.4,
      trend: [24000, 28000, 32000, 36000, 38500, 41000, 42580],
    },
    totalTokens: {
      value: 7234800, unit: 'T',
      prevMonthComp: 22.1, prevWeekComp: 16.7, prevDayComp: 9.2,
      trend: [3800000, 4500000, 5200000, 5800000, 6400000, 6900000, 7234800],
    },
    knowledge: {
      total: 18,
      prevMonthComp: 20.0, prevWeekComp: 12.5, prevDayComp: 5.9,
      breakdown: [
        { label: '需求分析', value: 6, color: '#a855f7' },
        { label: '设计方案', value: 4, color: '#13c2c2' },
        { label: '产品架构', value: 2, color: '#722ed1' },
        { label: '使用手册', value: 3, color: '#52c41a' },
        { label: '产品交付', value: 3, color: '#fa8c16' },
      ],
      trend: [8, 10, 12, 14, 15, 17, 18],
    },
    teamEfficiency: {
      value: 89.1, unit: '%',
      prevMonthComp: 4.2, prevWeekComp: 3.5, prevDayComp: 0.8,
      trend: [82, 84, 85, 87, 88, 88.5, 89.1],
    },
  },
  day: {
    requirements: {
      value: 7, unit: '项',
      prevMonthComp: 3.2, prevWeekComp: -1.5, prevDayComp: 16.7,
      trend: [4, 5, 6, 5, 6, 6, 7],
    },
    tasks: {
      value: 18, unit: '个',
      prevMonthComp: 6.7, prevWeekComp: 5.9, prevDayComp: 12.5,
      trend: [12, 13, 14, 15, 15, 16, 18],
    },
    modules: {
      value: 3, unit: '个',
      prevMonthComp: 0, prevWeekComp: -25.0, prevDayComp: 50.0,
      trend: [2, 3, 2, 3, 3, 2, 3],
    },
    codeLines: {
      value: 8924, unit: '行',
      prevMonthComp: 12.3, prevWeekComp: 8.7, prevDayComp: 22.1,
      trend: [5800, 6200, 7100, 6800, 7400, 8100, 8924],
    },
    totalTokens: {
      value: 1456300, unit: 'T',
      prevMonthComp: 18.5, prevWeekComp: 12.3, prevDayComp: 28.4,
      trend: [820000, 950000, 1050000, 1100000, 1200000, 1350000, 1456300],
    },
    knowledge: {
      total: 4,
      prevMonthComp: 33.3, prevWeekComp: 0, prevDayComp: 33.3,
      breakdown: [
        { label: '需求分析', value: 2, color: '#a855f7' },
        { label: '设计方案', value: 1, color: '#13c2c2' },
        { label: '产品架构', value: 0, color: '#722ed1' },
        { label: '使用手册', value: 1, color: '#52c41a' },
        { label: '产品交付', value: 0, color: '#fa8c16' },
      ],
      trend: [2, 2, 3, 3, 3, 3, 4],
    },
    teamEfficiency: {
      value: 91.2, unit: '%',
      prevMonthComp: 6.4, prevWeekComp: 4.2, prevDayComp: 2.1,
      trend: [84, 86, 87, 88, 89, 90, 91.2],
    },
  },
};

// ============ 人员数据 ============
export const personnelData: Record<Dimension, PersonnelItem[]> = {
  month: [
    { key: '0027006948', employeeId: '0027006948', name: '汲洋弘康', role: '研发经理', avatarColor: '#1677ff', tokens: 5824600, tasks: 68, requirements: 28, docs: 20, codeQuality: 96, efficiency: 96 },
    { key: '0027005981', employeeId: '0027005981', name: '林李杰', role: 'C++研发工程师', avatarColor: '#13c2c2', tokens: 4267400, tasks: 52, requirements: 20, docs: 16, codeQuality: 92, efficiency: 89 },
    { key: '0027014051', employeeId: '0027014051', name: '王荣中', role: 'C++研发工程师', avatarColor: '#722ed1', tokens: 3845200, tasks: 48, requirements: 18, docs: 14, codeQuality: 90, efficiency: 88 },
    { key: '0027011230', employeeId: '0027011230', name: '李静', role: 'C++研发工程师', avatarColor: '#52c41a', tokens: 3124800, tasks: 44, requirements: 15, docs: 10, codeQuality: 89, efficiency: 87 },
    { key: '3027005584', employeeId: '3027005584', name: '林鑫', role: 'JAVA研发工程师', avatarColor: '#fa8c16', tokens: 2947600, tasks: 42, requirements: 14, docs: 9, codeQuality: 88, efficiency: 86 },
    { key: '0027010191', employeeId: '0027010191', name: '兰锦鸿', role: 'C++研发工程师', avatarColor: '#f5222d', tokens: 3567200, tasks: 50, requirements: 17, docs: 11, codeQuality: 90, efficiency: 88 },
    { key: '0027011165', employeeId: '0027011165', name: '梁会当', role: 'JAVA研发工程师', avatarColor: '#eb2f96', tokens: 2945100, tasks: 40, requirements: 13, docs: 8, codeQuality: 87, efficiency: 85 },
    { key: '0027008730', employeeId: '0027008730', name: '叶彬彬', role: 'C++研发工程师', avatarColor: '#faad14', tokens: 3855500, tasks: 55, requirements: 22, docs: 14, codeQuality: 93, efficiency: 91 },
  ],
  week: [
    { key: '0027006948', employeeId: '0027006948', name: '汲洋弘康', role: '研发经理', avatarColor: '#1677ff', tokens: 1445600, tasks: 17, requirements: 7, docs: 5, codeQuality: 96, efficiency: 97 },
    { key: '0027005981', employeeId: '0027005981', name: '林李杰', role: 'C++研发工程师', avatarColor: '#13c2c2', tokens: 1067400, tasks: 13, requirements: 5, docs: 4, codeQuality: 92, efficiency: 89 },
    { key: '0027014051', employeeId: '0027014051', name: '王荣中', role: 'C++研发工程师', avatarColor: '#722ed1', tokens: 945200, tasks: 12, requirements: 4, docs: 3, codeQuality: 90, efficiency: 88 },
    { key: '0027011230', employeeId: '0027011230', name: '李静', role: 'C++研发工程师', avatarColor: '#52c41a', tokens: 824800, tasks: 11, requirements: 4, docs: 3, codeQuality: 89, efficiency: 87 },
    { key: '3027005584', employeeId: '3027005584', name: '林鑫', role: 'JAVA研发工程师', avatarColor: '#fa8c16', tokens: 747600, tasks: 10, requirements: 3, docs: 2, codeQuality: 88, efficiency: 86 },
    { key: '0027010191', employeeId: '0027010191', name: '兰锦鸿', role: 'C++研发工程师', avatarColor: '#f5222d', tokens: 867200, tasks: 12, requirements: 4, docs: 3, codeQuality: 90, efficiency: 88 },
    { key: '0027011165', employeeId: '0027011165', name: '梁会当', role: 'JAVA研发工程师', avatarColor: '#eb2f96', tokens: 745100, tasks: 10, requirements: 3, docs: 2, codeQuality: 87, efficiency: 85 },
    { key: '0027008730', employeeId: '0027008730', name: '叶彬彬', role: 'C++研发工程师', avatarColor: '#faad14', tokens: 955500, tasks: 14, requirements: 6, docs: 4, codeQuality: 93, efficiency: 91 },
  ],
  day: [
    { key: '0027006948', employeeId: '0027006948', name: '汲洋弘康', role: '研发经理', avatarColor: '#1677ff', tokens: 282600, tasks: 3, requirements: 2, docs: 1, codeQuality: 96, efficiency: 97 },
    { key: '0027005981', employeeId: '0027005981', name: '林李杰', role: 'C++研发工程师', avatarColor: '#13c2c2', tokens: 224700, tasks: 3, requirements: 1, docs: 1, codeQuality: 92, efficiency: 89 },
    { key: '0027014051', employeeId: '0027014051', name: '王荣中', role: 'C++研发工程师', avatarColor: '#722ed1', tokens: 198200, tasks: 2, requirements: 1, docs: 1, codeQuality: 90, efficiency: 88 },
    { key: '0027011230', employeeId: '0027011230', name: '李静', role: 'C++研发工程师', avatarColor: '#52c41a', tokens: 167800, tasks: 2, requirements: 1, docs: 0, codeQuality: 89, efficiency: 87 },
    { key: '3027005584', employeeId: '3027005584', name: '林鑫', role: 'JAVA研发工程师', avatarColor: '#fa8c16', tokens: 152600, tasks: 2, requirements: 1, docs: 0, codeQuality: 88, efficiency: 86 },
    { key: '0027010191', employeeId: '0027010191', name: '兰锦鸿', role: 'C++研发工程师', avatarColor: '#f5222d', tokens: 178200, tasks: 3, requirements: 1, docs: 1, codeQuality: 90, efficiency: 88 },
    { key: '0027011165', employeeId: '0027011165', name: '梁会当', role: 'JAVA研发工程师', avatarColor: '#eb2f96', tokens: 145100, tasks: 2, requirements: 1, docs: 0, codeQuality: 87, efficiency: 85 },
    { key: '0027008730', employeeId: '0027008730', name: '叶彬彬', role: 'C++研发工程师', avatarColor: '#faad14', tokens: 195500, tasks: 3, requirements: 1, docs: 1, codeQuality: 93, efficiency: 91 },
  ],
};

// ============ 阶段配置 ============
export const STAGE_COLORS: Record<string, string> = {
  '需求分析': '#a855f7',
  /* 茶青：浅/深色主题下对比度优于紫色 */
  '需求设计': '#0d9488',
  '需求研发': '#13c2c2',
  '开发中':   '#52c41a',
  '代码走查': '#fa8c16',
};

// ============ 瀑布流节点（20条） ============
export const waterfallNodes: WaterfallNode[] = [
  // ── 本日 · 本周 · 本月 ──────────────────────────────────────
  {
    id: 'wf001',
    product: '计费', productColor: '#13c2c2',
    workOrder: 'WO-2025-0312', workOrderId: 'JIRA-2025-0312',
    stage: '开发中', stageColor: '#52c41a', sopNode: '任务执行',
    startTime: '2025-03-23 09:15', duration: '2h 35m',
    employeeId: '0027008730', name: '叶彬彬', avatarColor: '#faad14', role: 'C++研发工程师',
    tokensUsed: 68500,
    aiInteraction: {
      workSummary: 'AI辅助完成计费模块阶梯计费逻辑的核心代码实现，针对预付费与后付费两种账户类型的计量逻辑进行了差异化处理，AI生成了账单聚合函数及边界值校验代码，当前任务节点已完成3个子任务单元。',
      personalNotes: '阶梯计费的边界场景比预期复杂，AI辅助生成的校验逻辑覆盖了大多数边界，剩余的跨月账单场景需手工补充后再自测。',
    },
    outputs: [
      { type: 'code', name: 'billing_meter.cpp', lines: 234, language: 'C++' },
      { type: 'code', name: 'billing_validator.h', lines: 87, language: 'C++' },
    ],
    dimension: ['month', 'week', 'day'],
  },
  {
    id: 'wf002',
    product: 'ZMDB(内存数据库)', productColor: '#1677ff',
    workOrder: 'WO-2025-0287', workOrderId: 'JIRA-2025-0287',
    stage: '需求设计', stageColor: '#0d9488', sopNode: '函数级方案',
    startTime: '2025-03-23 10:30', duration: '3h 10m',
    employeeId: '0027006948', name: '汲洋弘康', avatarColor: '#1677ff', role: '研发经理',
    tokensUsed: 124800,
    aiInteraction: {
      workSummary: '主导ZMDB核心查询接口的函数级设计，与AI协作完成btree_search、hash_lookup等6个关键函数的参数规范、返回值定义及异常处理策略，AI辅助生成了伪代码框架和接口注释模板，同步确认了内存对齐要求。',
      personalNotes: 'AI对函数级设计辅助效果显著，但内存对齐细节需结合硬件平台特性手动校验，已将对齐策略补充进设计规范文档。',
      screenshots: ['https://picsum.photos/seed/zmdb001/400/200'],
    },
    outputs: [
      { type: 'doc', name: 'ZMDB查询接口函数级设计规范v1.0.md', pages: 16 },
    ],
    dimension: ['month', 'week', 'day'],
  },
  {
    id: 'wf003',
    product: '认证', productColor: '#fa8c16',
    workOrder: 'WO-2025-0298', workOrderId: 'JIRA-2025-0298',
    stage: '代码走查', stageColor: '#fa8c16', sopNode: '方案一致性',
    startTime: '2025-03-23 08:30', duration: '1h 45m',
    employeeId: '0027011165', name: '梁会当', avatarColor: '#eb2f96', role: 'JAVA研发工程师',
    tokensUsed: 42300,
    aiInteraction: {
      workSummary: '对认证模块Token刷新机制的实现代码进行方案一致性审查，AI辅助比对代码实现与设计方案的偏差，发现JWT签名算法实现与方案设计存在2处不一致，生成了偏差分析报告及修改建议。',
      personalNotes: 'AI在代码与设计一致性比对上表现出色，能快速定位细微差异。建议将关键算法的实现约束提前纳入代码模板以减少走查返工。',
    },
    outputs: [
      { type: 'doc', name: '认证模块方案一致性审查报告.md', pages: 7 },
    ],
    dimension: ['month', 'week', 'day'],
  },
  {
    id: 'wf004',
    product: 'ZMDB(内存数据库)', productColor: '#1677ff',
    workOrder: 'WO-2025-0303', workOrderId: 'JIRA-2025-0303',
    stage: '开发中', stageColor: '#52c41a', sopNode: '单元自测',
    startTime: '2025-03-23 11:00', duration: '2h 20m',
    employeeId: '0027011230', name: '李静', avatarColor: '#52c41a', role: 'C++研发工程师',
    tokensUsed: 55700,
    aiInteraction: {
      workSummary: '对ZMDB内存索引重建模块完成单元自测，AI辅助生成了覆盖正常流程、异常恢复和并发场景的测试用例集，自测覆盖率达到91.3%，发现并修复了2个边界条件缺陷。',
      personalNotes: 'AI生成的并发测试场景覆盖了大多数竞态条件，但数据库崩溃恢复的极端测试场景仍需人工补充，后续将重点补全。',
      screenshots: ['https://picsum.photos/seed/zmdb_test/400/200'],
    },
    outputs: [
      { type: 'code', name: 'index_rebuild_test.cpp', lines: 412, language: 'C++' },
      { type: 'doc', name: '单元自测报告_WO0303.md', pages: 4 },
    ],
    dimension: ['month', 'week', 'day'],
  },
  {
    id: 'wf005',
    product: '计费', productColor: '#13c2c2',
    workOrder: 'WO-2025-0276', workOrderId: 'JIRA-2025-0276',
    stage: '需求分析', stageColor: '#a855f7', sopNode: '边界确认',
    startTime: '2025-03-23 08:00', duration: '1h 50m',
    employeeId: '0027014051', name: '王荣中', avatarColor: '#722ed1', role: 'C++研发工程师',
    tokensUsed: 38900,
    aiInteraction: {
      workSummary: 'AI辅助梳理计费规则引擎的边界条件，针对负数账单余额、超时账单关闭、并发充值冲突等7类边界场景进行了逐一确认，生成了边界确认清单和对应的处理策略说明文档。',
      personalNotes: '计费边界条件多且复杂，AI能高效整理出潜在遗漏场景。跨天账单结算的边界逻辑需要与产品经理再次确认后补充。',
    },
    outputs: [
      { type: 'doc', name: '计费规则引擎边界确认文档v1.1.md', pages: 9 },
    ],
    dimension: ['month', 'week', 'day'],
  },
  {
    id: 'wf006',
    product: '安全加固', productColor: '#a855f7',
    workOrder: 'WO-2025-0319', workOrderId: 'JIRA-2025-0319',
    stage: '需求研发', stageColor: '#13c2c2', sopNode: '沙箱构建',
    startTime: '2025-03-23 09:45', duration: '2h 05m',
    employeeId: '3027005584', name: '林鑫', avatarColor: '#fa8c16', role: 'JAVA研发工程师',
    tokensUsed: 73200,
    aiInteraction: {
      workSummary: '为安全加固模块的权限校验功能搭建隔离沙箱环境，AI辅助生成了沙箱配置脚本和依赖隔离方案，完成了多租户权限验证场景的沙箱构建，已通过环境验证测试。',
      personalNotes: 'AI辅助生成的沙箱配置脚本节省了大量手工配置时间，多租户场景的隔离需要特别关注网络策略配置，已记录为经验条目。',
    },
    outputs: [
      { type: 'code', name: 'sandbox_setup.sh', lines: 156, language: 'Shell' },
      { type: 'code', name: 'permission_sandbox.xml', lines: 89, language: 'XML' },
    ],
    dimension: ['month', 'week', 'day'],
  },

  // ── 本周 · 本月 ─────────────────────────────────────────────
  {
    id: 'wf007',
    product: '计费', productColor: '#13c2c2',
    workOrder: 'WO-2025-0264', workOrderId: 'JIRA-2025-0264',
    stage: '代码走查', stageColor: '#fa8c16', sopNode: '控熵评审',
    startTime: '2025-03-21 14:20', duration: '1h 30m',
    employeeId: '0027010191', name: '兰锦鸿', avatarColor: '#f5222d', role: 'C++研发工程师',
    tokensUsed: 48600,
    aiInteraction: {
      workSummary: '对计费结算引擎进行控熵评审，AI辅助分析代码复杂度分布，发现billing_engine.cpp中3个函数圈复杂度超过阈值(>15)，AI生成了重构建议方案，对高熵代码段进行了标注和风险评级。',
      personalNotes: '控熵评审中AI识别高复杂度代码段的准确率较高，但对业务逻辑合理性的最终判断仍需结合人工经验。下次可尝试提前引入SonarQube做辅助。',
      screenshots: ['https://picsum.photos/seed/entropy001/400/200'],
    },
    outputs: [
      { type: 'doc', name: '计费引擎控熵评审报告.md', pages: 8 },
    ],
    dimension: ['month', 'week'],
  },
  {
    id: 'wf008',
    product: 'ZMDB(内存数据库)', productColor: '#1677ff',
    workOrder: 'WO-2025-0258', workOrderId: 'JIRA-2025-0258',
    stage: '需求设计', stageColor: '#0d9488', sopNode: '控熵生成',
    startTime: '2025-03-21 10:00', duration: '3h 25m',
    employeeId: '0027005981', name: '林李杰', avatarColor: '#13c2c2', role: 'C++研发工程师',
    tokensUsed: 98400,
    aiInteraction: {
      workSummary: '完成ZMDB事务处理模块的控熵生成，AI辅助识别模块内高复杂度设计节点，对事务回滚、锁争用处理等4个高熵设计点生成了结构化的熵控方案，有效降低了事务模块整体设计复杂度。',
      personalNotes: 'AI提供的结构化控熵建议对锁策略设计帮助很大，但MVCC并发控制的控熵方案还需进一步讨论，计划安排专项技术讨论会。',
    },
    outputs: [
      { type: 'doc', name: 'ZMDB事务模块控熵设计方案.md', pages: 14 },
      { type: 'code', name: 'transaction_scaffold.cpp', lines: 178, language: 'C++' },
    ],
    dimension: ['month', 'week'],
  },
  {
    id: 'wf009',
    product: '安全加固', productColor: '#a855f7',
    workOrder: 'WO-2025-0247', workOrderId: 'JIRA-2025-0247',
    stage: '代码走查', stageColor: '#fa8c16', sopNode: '研发组长评审',
    startTime: '2025-03-20 15:00', duration: '2h 40m',
    employeeId: '0027006948', name: '汲洋弘康', avatarColor: '#1677ff', role: '研发经理',
    tokensUsed: 85200,
    aiInteraction: {
      workSummary: '对安全加固模块加密算法实现进行研发组长终评，AI辅助完成代码风格、安全合规及性能指标的综合评审，汇总了本轮走查15个问题单，其中3个须在提测前必须修复，生成了最终评审总结报告。',
      personalNotes: '组长评审环节AI能高效聚合多维度评审意见，但最终优先级排序仍需结合研发经验人工决策。组长评审前建议开发人员先完成自查。',
      screenshots: [
        'https://picsum.photos/seed/secreview01/400/200',
        'https://picsum.photos/seed/secreview02/400/200',
      ],
    },
    outputs: [
      { type: 'doc', name: '安全加固加密模块研发组长评审报告.md', pages: 11 },
    ],
    dimension: ['month', 'week'],
  },
  {
    id: 'wf010',
    product: '计费', productColor: '#13c2c2',
    workOrder: 'WO-2025-0271', workOrderId: 'JIRA-2025-0271',
    stage: '开发中', stageColor: '#52c41a', sopNode: '差异分析',
    startTime: '2025-03-22 09:30', duration: '1h 55m',
    employeeId: '0027008730', name: '叶彬彬', avatarColor: '#faad14', role: 'C++研发工程师',
    tokensUsed: 62100,
    aiInteraction: {
      workSummary: '对计费快照功能代码进行差异分析，AI辅助比对当前实现与基线版本的差异，发现快照序列化逻辑存在性能回退，AI提供了优化对比方案，完成了差异分析报告并标注了高风险变更点。',
      personalNotes: 'AI的差异分析覆盖了代码层和接口层，对快照序列化性能问题定位很准确，后续需重点关注大对象序列化场景的性能表现。',
    },
    outputs: [
      { type: 'doc', name: '计费快照差异分析报告.md', pages: 6 },
      { type: 'code', name: 'snapshot_optimized.cpp', lines: 198, language: 'C++' },
    ],
    dimension: ['month', 'week'],
  },
  {
    id: 'wf011',
    product: '认证', productColor: '#fa8c16',
    workOrder: 'WO-2025-0255', workOrderId: 'JIRA-2025-0255',
    stage: '需求设计', stageColor: '#0d9488', sopNode: '方案评审',
    startTime: '2025-03-22 14:00', duration: '2h 30m',
    employeeId: '0027011165', name: '梁会当', avatarColor: '#eb2f96', role: 'JAVA研发工程师',
    tokensUsed: 76800,
    aiInteraction: {
      workSummary: '主持认证模块OAuth2.0单点登录方案评审，AI辅助生成了评审清单并提供了方案对比分析，针对token存储策略、刷新机制等5个核心设计决策进行了深度评审，形成了最终评审结论和后续优化建议。',
      personalNotes: 'OAuth2.0方案评审AI提供了很好的对比分析框架，但安全策略的最终选型需要结合运维和安全团队的实际意见综合决策。',
    },
    outputs: [
      { type: 'doc', name: '认证模块OAuth2.0方案评审纪要.md', pages: 10 },
    ],
    dimension: ['month', 'week'],
  },
  {
    id: 'wf012',
    product: 'ZMDB(内存数据库)', productColor: '#1677ff',
    workOrder: 'WO-2025-0243', workOrderId: 'JIRA-2025-0243',
    stage: '需求分析', stageColor: '#a855f7', sopNode: '需求风险',
    startTime: '2025-03-21 09:00', duration: '1h 40m',
    employeeId: '0027011230', name: '李静', avatarColor: '#52c41a', role: 'C++研发工程师',
    tokensUsed: 41500,
    aiInteraction: {
      workSummary: '对ZMDB持久化存储需求进行风险识别，AI辅助分析了大数据量场景下的性能风险、持久化一致性风险和存储扩展性风险，生成了风险评估矩阵，标注了5个高优先级风险项及对应的缓解措施。',
      personalNotes: 'AI在需求风险识别阶段能有效覆盖技术风险维度，但业务连续性风险需要更多业务上下文才能准确评估，后续将补充业务侧访谈记录。',
    },
    outputs: [
      { type: 'doc', name: 'ZMDB持久化需求风险评估.md', pages: 8 },
    ],
    dimension: ['month', 'week'],
  },

  // ── 仅本月 ──────────────────────────────────────────────────
  {
    id: 'wf013',
    product: '安全加固', productColor: '#a855f7',
    workOrder: 'WO-2025-0229', workOrderId: 'JIRA-2025-0229',
    stage: '需求设计', stageColor: '#0d9488', sopNode: '方案评审',
    startTime: '2025-03-18 10:00', duration: '2h 50m',
    employeeId: '0027014051', name: '王荣中', avatarColor: '#722ed1', role: 'C++研发工程师',
    tokensUsed: 91200,
    aiInteraction: {
      workSummary: '参与安全加固模块漏洞修复方案评审，AI协助分析了缓冲区溢出修复、输入校验加固两类方案的可行性，对方案的安全等级、实现复杂度和回归风险进行了全面评估，生成了评审意见汇总。',
      personalNotes: '安全方案评审AI对缓冲区溢出风险的分析很专业，但对具体CVE漏洞的修复方案需查阅最新安全公告后再做最终确认。',
    },
    outputs: [
      { type: 'doc', name: '安全加固漏洞修复方案评审意见.md', pages: 12 },
    ],
    dimension: ['month'],
  },
  {
    id: 'wf014',
    product: '安全加固', productColor: '#a855f7',
    workOrder: 'WO-2025-0217', workOrderId: 'JIRA-2025-0217',
    stage: '开发中', stageColor: '#52c41a', sopNode: '环境启动',
    startTime: '2025-03-15 09:00', duration: '1h 20m',
    employeeId: '3027005584', name: '林鑫', avatarColor: '#fa8c16', role: 'JAVA研发工程师',
    tokensUsed: 33400,
    aiInteraction: {
      workSummary: '完成安全加固模块集成测试环境的启动部署，AI辅助生成了环境启动检查清单和服务健康检测脚本，排查了3个服务依赖启动顺序问题，确认各服务就绪状态均达到100%。',
      personalNotes: '环境启动脚本化AI能显著提升效率，但服务启动顺序依赖关系需整理成文档，避免后续每次排查都重复踩坑。',
    },
    outputs: [
      { type: 'code', name: 'env_startup.sh', lines: 223, language: 'Shell' },
      { type: 'doc', name: '安全加固测试环境部署说明.md', pages: 5 },
    ],
    dimension: ['month'],
  },
  {
    id: 'wf015',
    product: '计费', productColor: '#13c2c2',
    workOrder: 'WO-2025-0205', workOrderId: 'JIRA-2025-0205',
    stage: '需求研发', stageColor: '#13c2c2', sopNode: '自动拆单',
    startTime: '2025-03-12 10:30', duration: '2h 15m',
    employeeId: '0027010191', name: '兰锦鸿', avatarColor: '#f5222d', role: 'C++研发工程师',
    tokensUsed: 67800,
    aiInteraction: {
      workSummary: '基于需求分析结果对计费扣费功能进行自动拆单，AI辅助将需求分解为12个开发子任务，生成了各子任务的验收标准和工时估算，完成了任务优先级排序和依赖关系梳理。',
      personalNotes: 'AI在自动拆单阶段能快速生成结构化任务树，但任务工时估算需结合开发人员实际经验进行人工校正，当前估算偏乐观约20%。',
    },
    outputs: [
      { type: 'doc', name: '计费扣费功能开发任务分解.md', pages: 7 },
    ],
    dimension: ['month'],
  },
  {
    id: 'wf016',
    product: 'ZMDB(内存数据库)', productColor: '#1677ff',
    workOrder: 'WO-2025-0196', workOrderId: 'JIRA-2025-0196',
    stage: '代码走查', stageColor: '#fa8c16', sopNode: '风险评审',
    startTime: '2025-03-10 14:00', duration: '1h 55m',
    employeeId: '0027005981', name: '林李杰', avatarColor: '#13c2c2', role: 'C++研发工程师',
    tokensUsed: 55300,
    aiInteraction: {
      workSummary: '对ZMDB内存分配模块进行风险评审，AI辅助扫描了内存泄漏隐患、越界访问风险和空指针引用场景，发现高风险问题2处、中风险4处，生成了风险评审报告及修复优先级建议。',
      personalNotes: 'AI在内存安全风险识别上效率很高，但复杂内存管理逻辑的风险判断仍需结合Valgrind等工具的实际检测结果进行二次验证。',
      screenshots: ['https://picsum.photos/seed/memleak01/400/200'],
    },
    outputs: [
      { type: 'doc', name: 'ZMDB内存分配模块风险评审报告.md', pages: 9 },
    ],
    dimension: ['month'],
  },
  {
    id: 'wf017',
    product: '计费', productColor: '#13c2c2',
    workOrder: 'WO-2025-0183', workOrderId: 'JIRA-2025-0183',
    stage: '需求分析', stageColor: '#a855f7', sopNode: '模块功能',
    startTime: '2025-03-08 09:00', duration: '2h 10m',
    employeeId: '0027008730', name: '叶彬彬', avatarColor: '#faad14', role: 'C++研发工程师',
    tokensUsed: 48700,
    aiInteraction: {
      workSummary: 'AI辅助完成计费账单汇总模块的功能梳理，对账单查询、账单导出、账单推送三个子模块的功能点进行了详细拆解，生成了功能点清单和各功能的优先级评定，确认了与其他模块的接口依赖关系。',
      personalNotes: '功能梳理阶段AI能快速生成完整功能点列表，但账单推送的实时性需求需要进一步澄清，已提出疑问待产品回复。',
    },
    outputs: [
      { type: 'doc', name: '计费账单汇总模块功能分析文档.md', pages: 11 },
    ],
    dimension: ['month'],
  },
  {
    id: 'wf018',
    product: 'ZMDB(内存数据库)', productColor: '#1677ff',
    workOrder: 'WO-2025-0174', workOrderId: 'JIRA-2025-0174',
    stage: '需求研发', stageColor: '#13c2c2', sopNode: '环境预生成',
    startTime: '2025-03-05 10:00', duration: '2h 30m',
    employeeId: '0027006948', name: '汲洋弘康', avatarColor: '#1677ff', role: '研发经理',
    tokensUsed: 76500,
    aiInteraction: {
      workSummary: '主导ZMDB高可用集群需求的开发环境预生成，AI辅助生成了Paxos共识模块和主备切换组件的代码骨架，完成了开发环境依赖配置，并对骨架代码进行了编译和接口联通性预验证。',
      personalNotes: '环境预生成阶段AI生成的代码骨架质量较高、接口定义完整，但共识算法骨架的实现细节仍需深入设计，不可直接复用。',
    },
    outputs: [
      { type: 'code', name: 'zmdb_ha_scaffold.cpp', lines: 312, language: 'C++' },
      { type: 'code', name: 'failover_stub.h', lines: 94, language: 'C++' },
      { type: 'doc', name: 'ZMDB高可用开发环境说明.md', pages: 6 },
    ],
    dimension: ['month'],
  },
  {
    id: 'wf019',
    product: '计费', productColor: '#13c2c2',
    workOrder: 'WO-2025-0162', workOrderId: 'JIRA-2025-0162',
    stage: '代码走查', stageColor: '#fa8c16', sopNode: '开发流程评审',
    startTime: '2025-03-05 14:00', duration: '1h 40m',
    employeeId: '0027014051', name: '王荣中', avatarColor: '#722ed1', role: 'C++研发工程师',
    tokensUsed: 44800,
    aiInteraction: {
      workSummary: '对计费模块本轮迭代的开发流程进行评审，AI辅助分析了流程规范遵从度、代码提交记录合规性和任务完成节点的闭环情况，发现2个流程节点未按规范执行，生成了流程改进建议清单。',
      personalNotes: '开发流程评审AI能快速整理流程合规数据，但流程改进建议需结合团队实际协作模式制定，不宜照单全收。',
    },
    outputs: [
      { type: 'doc', name: '计费模块开发流程评审报告.md', pages: 5 },
    ],
    dimension: ['month'],
  },
  {
    id: 'wf020',
    product: '认证', productColor: '#fa8c16',
    workOrder: 'WO-2025-0153', workOrderId: 'JIRA-2025-0153',
    stage: '开发中', stageColor: '#52c41a', sopNode: '任务反馈',
    startTime: '2025-03-03 15:30', duration: '1h 10m',
    employeeId: '0027011165', name: '梁会当', avatarColor: '#eb2f96', role: 'JAVA研发工程师',
    tokensUsed: 28900,
    aiInteraction: {
      workSummary: '完成认证模块短信验证码功能的任务反馈，AI辅助整理了本次任务的完成情况、遗留问题和测试建议，对验证码生命周期管理和发送频率限制的实现进行了说明，提交了任务完成报告。',
      personalNotes: '任务反馈环节AI能快速生成结构化报告，但对遗留问题的影响面评估需要手动补充更多细节，尤其是跨服务影响范围的说明。',
    },
    outputs: [
      { type: 'doc', name: '认证模块短信验证码任务完成报告.md', pages: 4 },
    ],
    dimension: ['month'],
  },
];

export const getWaterfallByDimension = (dimension: Dimension): WaterfallNode[] => {
  return waterfallNodes.filter(n => n.dimension.includes(dimension));
};

// ============ 对话数据 ============
export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
}

export const initialChatMessages: ChatMessage[] = [
  {
    id: 'msg001',
    role: 'assistant',
    content: '您好！我是研发AI助手。我已读取团队当前研发活动数据，可以帮您分析团队成员的工作情况、AI交互效果、代码质量等信息。请问有什么需要了解的？',
    timestamp: '10:00:00',
  },
  {
    id: 'msg002',
    role: 'user',
    content: '帮我分析本周各成员的AI使用效率，重点关注token消耗和产出比。',
    timestamp: '10:01:23',
  },
  {
    id: 'msg003',
    role: 'assistant',
    content: '根据本周数据分析：\n\n**Token效率排行：**\n1. 🥇 汲洋弘康（研发经理）：Token产出比最高，1.45M token统筹完成17个任务+5篇设计文档，效率指数97\n2. 🥈 叶彬彬（C++）：0.96M token完成14个任务，代码质量93分\n3. 🥉 林李杰（C++）：1.07M token完成13个任务，控熵设计文档质量突出\n\n**需关注：**\n- 林鑫本周token消耗相对任务量略高，沙箱构建属于基础设施类工作，投入偏高属正常\n- 梁会当方案评审效率稳定，建议分享OAuth2.0评审经验给团队',
    timestamp: '10:01:45',
  },
];
