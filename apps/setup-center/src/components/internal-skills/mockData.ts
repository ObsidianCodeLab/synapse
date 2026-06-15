// ─── 内部技能：类型定义 + Mock 数据 ───

export interface InternalSkill {
  id: number;
  name: string;
  slug: string;
  description: string;
  tags: string;               // 逗号分隔
  downloads: number;
  stars: number;
  skill_type: "official" | "self_operated";
  rank_downloads: number | null;
  rank_stars: number | null;
  rank_recent: number | null;
  record_date: string;
  fetched_At: string;
}

export interface HotColumn {
  code: "downloads" | "stars" | "recent";
  title: string;
  items: InternalSkill[];
}

// ---- 官方技能热榜数据 ----
export const mockOfficialHotColumns: HotColumn[] = [
  {
    code: "downloads",
    title: "下载热榜",
    items: [
      { id: 4751, name: "self-improving agent", slug: "self-improving-agent", description: "记录经验教训、错误及修正以实现持续改进。适用场景：（1）命令或操作意外失败，（2）用户纠正Claude...", tags: "", downloads: 460145, stars: 3767, skill_type: "official", rank_downloads: 1, rank_stars: null, rank_recent: null, record_date: "2026-06-12", fetched_At: "2026-04-02T19:40:47" },
      { id: 4752, name: "Skill Vetter", slug: "skill-vetter", description: "AI智能体技能安全预审工具。安装ClawdHub、GitHub等来源技能前，检查风险信号、权限范围及可疑模式。", tags: "", downloads: 257109, stars: 1197, skill_type: "official", rank_downloads: 2, rank_stars: null, rank_recent: null, record_date: "2026-06-12", fetched_At: "2026-04-02T19:40:50" },
      { id: 4762, name: "Polymarket", slug: "polymarket", description: "查询Polymarket预测市场：查看赔率、热门市场，搜索事件，追踪价格与势头。包含观察列表提醒、结算日历……", tags: "", downloads: 232533, stars: 145, skill_type: "official", rank_downloads: 3, rank_stars: null, rank_recent: null, record_date: "2026-06-12", fetched_At: "2026-04-02T19:41:19" },
      { id: 4763, name: "Cline", slug: "cline", description: "适用于Cline的高级技能组合——结构化模式、任务编排、代码质量保证。包含并行任务执行、防御性编码、上下文压缩。", tags: "", downloads: 205000, stars: 890, skill_type: "official", rank_downloads: 4, rank_stars: null, rank_recent: null, record_date: "2026-06-12", fetched_At: "2026-04-02T19:41:22" },
      { id: 4756, name: "Self-Improving + Proactive Agent", slug: "self-improving-proactive-agent", description: "Self-reflection + Self-criticism + Self-learning + Self-organizing memory.", tags: "", downloads: 198838, stars: 1202, skill_type: "official", rank_downloads: 5, rank_stars: null, rank_recent: null, record_date: "2026-06-12", fetched_At: "2026-04-02T19:41:01" },
      { id: 4765, name: "PDF Toolkit", slug: "pdf-toolkit", description: "全能PDF工具箱——读取、创建、合并、拆分、旋转、提取文本与表格、OCR识别。", tags: "", downloads: 185000, stars: 670, skill_type: "official", rank_downloads: 6, rank_stars: null, rank_recent: null, record_date: "2026-06-12", fetched_At: "2026-04-02T19:41:27" },
      { id: 4768, name: "Database Explorer", slug: "database-explorer", description: "数据库探索与分析——支持MySQL、PostgreSQL、SQLite等主流数据库的查询、ER图生成、表结构分析。", tags: "", downloads: 168000, stars: 520, skill_type: "official", rank_downloads: 7, rank_stars: null, rank_recent: null, record_date: "2026-06-12", fetched_At: "2026-04-02T19:41:35" },
      { id: 4770, name: "API Client Pro", slug: "api-client-pro", description: "API开发与测试工具——自动生成请求代码、环境变量管理、批量测试与性能监控。", tags: "", downloads: 152000, stars: 430, skill_type: "official", rank_downloads: 8, rank_stars: null, rank_recent: null, record_date: "2026-06-12", fetched_At: "2026-04-02T19:41:40" },
    ],
  },
  {
    code: "stars",
    title: "星标热榜",
    items: [
      { id: 4751, name: "self-improving agent", slug: "self-improving-agent", description: "记录经验教训、错误及修正以实现持续改进。适用场景：（1）命令或操作意外失败，（2）用户纠正Claude...", tags: "", downloads: 460145, stars: 3767, skill_type: "official", rank_downloads: null, rank_stars: 1, rank_recent: null, record_date: "2026-06-12", fetched_At: "2026-04-02T19:40:47" },
      { id: 4756, name: "Self-Improving + Proactive Agent", slug: "self-improving-proactive-agent", description: "Self-reflection + Self-criticism + Self-learning + Self-organizing memory.", tags: "", downloads: 198838, stars: 1202, skill_type: "official", rank_downloads: null, rank_stars: 2, rank_recent: null, record_date: "2026-06-12", fetched_At: "2026-04-02T19:41:01" },
      { id: 4752, name: "Skill Vetter", slug: "skill-vetter", description: "AI智能体技能安全预审工具。安装ClawdHub、GitHub等来源技能前，检查风险信号、权限范围及可疑模式。", tags: "", downloads: 257109, stars: 1197, skill_type: "official", rank_downloads: null, rank_stars: 3, rank_recent: null, record_date: "2026-06-12", fetched_At: "2026-04-02T19:40:50" },
      { id: 4763, name: "Cline", slug: "cline", description: "适用于Cline的高级技能组合——结构化模式、任务编排、代码质量保证。", tags: "", downloads: 205000, stars: 890, skill_type: "official", rank_downloads: null, rank_stars: 4, rank_recent: null, record_date: "2026-06-12", fetched_At: "2026-04-02T19:41:22" },
      { id: 4765, name: "PDF Toolkit", slug: "pdf-toolkit", description: "全能PDF工具箱——读取、创建、合并、拆分、旋转、提取文本与表格、OCR识别。", tags: "", downloads: 185000, stars: 670, skill_type: "official", rank_downloads: null, rank_stars: 5, rank_recent: null, record_date: "2026-06-12", fetched_At: "2026-04-02T19:41:27" },
      { id: 4768, name: "Database Explorer", slug: "database-explorer", description: "数据库探索与分析——支持MySQL、PostgreSQL、SQLite等主流数据库。", tags: "", downloads: 168000, stars: 520, skill_type: "official", rank_downloads: null, rank_stars: 6, rank_recent: null, record_date: "2026-06-12", fetched_At: "2026-04-02T19:41:35" },
      { id: 4770, name: "API Client Pro", slug: "api-client-pro", description: "API开发与测试工具——自动生成请求代码、环境变量管理。", tags: "", downloads: 152000, stars: 430, skill_type: "official", rank_downloads: null, rank_stars: 7, rank_recent: null, record_date: "2026-06-12", fetched_At: "2026-04-02T19:41:40" },
      { id: 4773, name: "Code Review Assistant", slug: "code-review-assistant", description: "智能代码审查——自动识别潜在bug、安全漏洞、性能问题，提供改进建议。", tags: "", downloads: 138000, stars: 380, skill_type: "official", rank_downloads: null, rank_stars: 8, rank_recent: null, record_date: "2026-06-12", fetched_At: "2026-04-02T19:41:47" },
    ],
  },
  {
    code: "recent",
    title: "最近更新",
    items: [
      { id: 4801, name: "Vue Component Generator", slug: "vue-component-generator", description: "Vue 3组件自动生成器——根据需求描述生成完整的Vue组件，包含Composition API、TypeScript类型。", tags: "前端开发规范,全产品通用", downloads: 12000, stars: 89, skill_type: "official", rank_downloads: null, rank_stars: null, rank_recent: 1, record_date: "2026-06-12", fetched_At: "2026-06-11T14:30:00" },
      { id: 4802, name: "AI Prompt Optimizer", slug: "ai-prompt-optimizer", description: "AI提示词优化器——自动分析用户提示词，提供改进建议和最佳实践，提高AI输出质量。", tags: "通用基础能力,全产品通用", downloads: 9800, stars: 75, skill_type: "official", rank_downloads: null, rank_stars: null, rank_recent: 2, record_date: "2026-06-12", fetched_At: "2026-06-11T10:15:00" },
      { id: 4803, name: "K8s Deployment Helper", slug: "k8s-deployment-helper", description: "Kubernetes部署助手——生成Deployment、Service、Ingress配置，支持多种云平台。", tags: "技术研发能力,全产品通用", downloads: 8500, stars: 62, skill_type: "official", rank_downloads: null, rank_stars: null, rank_recent: 3, record_date: "2026-06-12", fetched_At: "2026-06-10T18:20:00" },
      { id: 4804, name: "GraphQL Schema Builder", slug: "graphql-schema-builder", description: "GraphQL Schema设计与构建工具——可视化schema设计，自动生成resolver模板。", tags: "技术研发能力,全产品通用", downloads: 7200, stars: 48, skill_type: "official", rank_downloads: null, rank_stars: null, rank_recent: 4, record_date: "2026-06-12", fetched_At: "2026-06-10T09:00:00" },
      { id: 4805, name: "Dockerfile Generator", slug: "dockerfile-generator", description: "智能Dockerfile生成器——根据项目类型自动生成优化的Dockerfile，支持多阶段构建。", tags: "技术研发能力,全产品通用", downloads: 6500, stars: 41, skill_type: "official", rank_downloads: null, rank_stars: null, rank_recent: 5, record_date: "2026-06-12", fetched_At: "2026-06-09T16:45:00" },
      { id: 4806, name: "Microservice Design Pattern", slug: "microservice-design-pattern", description: "微服务设计模式库——包含常见微服务架构模式、最佳实践和反模式识别。", tags: "技术研发能力,全产品通用", downloads: 5100, stars: 35, skill_type: "official", rank_downloads: null, rank_stars: null, rank_recent: 6, record_date: "2026-06-12", fetched_At: "2026-06-09T11:30:00" },
      { id: 4807, name: "SEO Analyzer", slug: "seo-analyzer", description: "SEO分析与优化工具——扫描网页SEO问题，提供优化建议，生成SEO报告。", tags: "通用基础能力,全产品通用", downloads: 4300, stars: 28, skill_type: "official", rank_downloads: null, rank_stars: null, rank_recent: 7, record_date: "2026-06-12", fetched_At: "2026-06-08T14:00:00" },
      { id: 4808, name: "UI Component Library", slug: "ui-component-library", description: "通用UI组件库——提供常用前端组件模板、样式规范和可访问性检查。", tags: "前端开发规范,全产品通用", downloads: 3800, stars: 22, skill_type: "official", rank_downloads: null, rank_stars: null, rank_recent: 8, record_date: "2026-06-12", fetched_At: "2026-06-08T09:20:00" },
    ],
  },
];

// ---- 官方技能全量数据（48条，供分页演示） ----
function buildAllSkills(): InternalSkill[] {
  const skills: InternalSkill[] = [
    { id: 4751, name: "self-improving agent", slug: "self-improving-agent", description: "记录经验教训、错误及修正以实现持续改进。适用场景：（1）命令或操作意外失败，（2）用户纠正Claude...", tags: "", downloads: 460145, stars: 3767, skill_type: "official", rank_downloads: null, rank_stars: null, rank_recent: null, record_date: "2026-06-12", fetched_At: "2026-04-02T19:40:47" },
    { id: 4756, name: "Self-Improving + Proactive Agent", slug: "self-improving-proactive-agent", description: "Self-reflection + Self-criticism + Self-learning + Self-organizing memory.", tags: "", downloads: 198838, stars: 1202, skill_type: "official", rank_downloads: null, rank_stars: null, rank_recent: null, record_date: "2026-06-12", fetched_At: "2026-04-02T19:41:01" },
    { id: 4752, name: "Skill Vetter", slug: "skill-vetter", description: "AI智能体技能安全预审工具。安装ClawdHub、GitHub等来源技能前，检查风险信号、权限范围及可疑模式。", tags: "", downloads: 257109, stars: 1197, skill_type: "official", rank_downloads: null, rank_stars: null, rank_recent: null, record_date: "2026-06-12", fetched_At: "2026-04-02T19:40:50" },
    { id: 4763, name: "Cline", slug: "cline", description: "适用于Cline的高级技能组合——结构化模式、任务编排、代码质量保证。包含并行任务执行、防御性编码、上下文压缩。", tags: "", downloads: 205000, stars: 890, skill_type: "official", rank_downloads: null, rank_stars: null, rank_recent: null, record_date: "2026-06-12", fetched_At: "2026-04-02T19:41:22" },
    { id: 4765, name: "PDF Toolkit", slug: "pdf-toolkit", description: "全能PDF工具箱——读取、创建、合并、拆分、旋转、提取文本与表格、OCR识别。", tags: "", downloads: 185000, stars: 670, skill_type: "official", rank_downloads: null, rank_stars: null, rank_recent: null, record_date: "2026-06-12", fetched_At: "2026-04-02T19:41:27" },
    { id: 4768, name: "Database Explorer", slug: "database-explorer", description: "数据库探索与分析——支持MySQL、PostgreSQL、SQLite等主流数据库的查询、ER图生成、表结构分析。", tags: "", downloads: 168000, stars: 520, skill_type: "official", rank_downloads: null, rank_stars: null, rank_recent: null, record_date: "2026-06-12", fetched_At: "2026-04-02T19:41:35" },
    { id: 4770, name: "API Client Pro", slug: "api-client-pro", description: "API开发与测试工具——自动生成请求代码、环境变量管理、批量测试与性能监控。", tags: "", downloads: 152000, stars: 430, skill_type: "official", rank_downloads: null, rank_stars: null, rank_recent: null, record_date: "2026-06-12", fetched_At: "2026-04-02T19:41:40" },
    { id: 4773, name: "Code Review Assistant", slug: "code-review-assistant", description: "智能代码审查——自动识别潜在bug、安全漏洞、性能问题，提供改进建议并生成修复补丁。", tags: "技术研发能力", downloads: 138000, stars: 380, skill_type: "official", rank_downloads: null, rank_stars: null, rank_recent: null, record_date: "2026-06-12", fetched_At: "2026-04-02T19:41:47" },
    { id: 4775, name: "Git Workflow Helper", slug: "git-workflow-helper", description: "Git工作流助手——分支策略管理、冲突解决指导、PR模板生成、提交信息规范化。", tags: "技术研发能力,全产品通用", downloads: 125000, stars: 340, skill_type: "official", rank_downloads: null, rank_stars: null, rank_recent: null, record_date: "2026-06-12", fetched_At: "2026-04-02T19:41:52" },
    { id: 4778, name: "Testing Framework Setup", slug: "testing-framework-setup", description: "测试框架搭建向导——自动配置Jest、Vitest、Playwright等测试工具，生成测试模板。", tags: "测试验证规范,全产品通用", downloads: 110000, stars: 290, skill_type: "official", rank_downloads: null, rank_stars: null, rank_recent: null, record_date: "2026-06-12", fetched_At: "2026-04-02T19:41:58" },
    { id: 4780, name: "Dependency Updater", slug: "dependency-updater", description: "依赖更新管理——自动检查过时依赖、评估升级风险、生成更新PR。支持npm、pip、cargo等。", tags: "技术研发能力,全产品通用", downloads: 98000, stars: 250, skill_type: "official", rank_downloads: null, rank_stars: null, rank_recent: null, record_date: "2026-06-12", fetched_At: "2026-04-02T19:42:03" },
    { id: 4782, name: "Environment Config Manager", slug: "environment-config-manager", description: "环境配置管理器——统一管理开发、测试、生产环境配置，支持.env、YAML、TOML格式。", tags: "技术研发能力,全产品通用", downloads: 85000, stars: 210, skill_type: "official", rank_downloads: null, rank_stars: null, rank_recent: null, record_date: "2026-06-12", fetched_At: "2026-04-02T19:42:08" },
  ];

  // 扩展至48条，填充趋势递减的 mock 数据
  const baseNames = [
    "React Component Builder", "Python Script Generator", "Terraform Module Creator",
    "Ansible Playbook Helper", "Webpack Config Optimizer", "ESLint Rule Designer",
    "Swagger Doc Generator", "Docker Compose Builder", "Nginx Config Helper",
    "Redis Cache Manager", "RabbitMQ Queue Monitor", "Elasticsearch Index Manager",
    "Prometheus Alert Rules", "Grafana Dashboard Creator", "Jenkins Pipeline Builder",
    "GitLab CI Configurator", "Sentinel Rule Manager", "Nacos Config Helper",
    "Spring Boot Starter", "MyBatis Mapper Generator", "RESTful API Designer",
    "WebSocket Connection Manager", "OAuth2 Flow Implementer", "JWT Token Manager",
    "Rate Limiter Configurator", "Circuit Breaker Pattern", "Event Sourcing Guide",
    "CQRS Pattern Guide", "DDD Architecture Guide", "Clean Code Formatter",
    "Static Analysis Reporter", "Load Testing Script", "Performance Profiler",
    "Memory Leak Detector", "Log Aggregation Helper", "Error Tracking Setup",
  ];

  for (let i = 0; i < 36; i++) {
    const id = 5001 + i;
    const name = baseNames[i];
    skills.push({
      id,
      name,
      slug: name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""),
      description: `${name}——自动化工具，提供最佳实践配置、错误处理与性能优化建议。适用于日常开发场景。`,
      tags: i % 3 === 0 ? "技术研发能力,全产品通用" : i % 3 === 1 ? "前端开发规范" : "通用基础能力",
      downloads: Math.floor(80000 - i * 2000),
      stars: Math.floor(200 - i * 5),
      skill_type: "official",
      rank_downloads: null,
      rank_stars: null,
      rank_recent: null,
      record_date: "2026-06-12",
      fetched_At: `2026-04-${String(3 + Math.floor(i / 3)).padStart(2, "0")}T12:00:00`,
    });
  }

  return skills;
}

export const mockOfficialAllSkills: InternalSkill[] = buildAllSkills();

// ---- 自营技能热榜数据 ----
export const mockSelfHotColumns: HotColumn[] = [
  {
    code: "downloads",
    title: "下载热榜",
    items: [
      { id: 1153, name: "git-commit", slug: "git-commit", description: "规范化 Git 提交信息生成技能。支持 Conventional Commits 规范，自动分析代码变更生成符合团队规范的提交信息。", tags: "技术研发能力,全省份通用,研发,Cursor", downloads: 44, stars: 3, skill_type: "self_operated", rank_downloads: 1, rank_stars: null, rank_recent: null, record_date: "2026-06-12", fetched_At: "2026-06-05T10:15:00" },
      { id: 1062, name: "code-quality-review", slug: "code-quality-review", description: "集成 PMD、Checkstyle、SpotBugs 等 6 种增量检查工具的代码静态检查技能。发现问题后默认自动修复并复验。", tags: "CI/CD 流程,全产品通用,全省份通用,研发", downloads: 32, stars: 0, skill_type: "self_operated", rank_downloads: 2, rank_stars: null, rank_recent: null, record_date: "2026-06-12", fetched_At: "2026-05-28T14:00:00" },
      { id: 1221, name: "SDD规范编程技能", slug: "sdd", description: "浩鲸SDD规约驱动开发技能体系。L1基线（7维度186条规则强制）+ L2产品线扩展 + L3项目特化。支持CodeSpec生码约束规范。", tags: "Java 开发规范,前端开发规范,通用受理,全省份通用,需求,研发", downloads: 31, stars: 0, skill_type: "self_operated", rank_downloads: 3, rank_stars: null, rank_recent: null, record_date: "2026-06-12", fetched_At: "2026-06-05T12:05:00" },
      { id: 1147, name: "ai-code-entropy-check", slug: "ai-code-entropy-check", description: "对 AI Coding（Cursor/大模型）生成的代码进行代码熵增约束校验，防止AI代码引入过度的复杂性、耦合和失控风险。", tags: "全产品通用,全省份通用,研发,Cursor", downloads: 12, stars: 0, skill_type: "self_operated", rank_downloads: 4, rank_stars: null, rank_recent: null, record_date: "2026-06-12", fetched_At: "2026-04-20T10:12:00" },
      { id: 1211, name: "memory-leak-detect", slug: "memory-leak-detect", description: "系统化诊断 Java 17 / Spring Boot 3 服务及 Vue 前端的 JVM 与浏览器内存泄漏。适用于 OOM、堆增长、GC 抖动等场景。", tags: "全产品通用,全省份通用,研发,Cursor", downloads: 10, stars: 0, skill_type: "self_operated", rank_downloads: 5, rank_stars: null, rank_recent: null, record_date: "2026-06-12", fetched_At: "2026-05-28T09:45:00" },
      { id: 1230, name: "design-doc-to-code", slug: "design-doc-to-code", description: "以专题设计方案为入口（支持 .md / .doc / .docx），完成需求理解、代码对照、任务清单确认与分模块改造。", tags: "技术研发能力,Java 开发规范,全产品通用,全省份通用,研发", downloads: 6, stars: 1, skill_type: "self_operated", rank_downloads: 6, rank_stars: null, rank_recent: null, record_date: "2026-06-12", fetched_At: "2026-06-11T11:35:00" },
      { id: 1216, name: "dm-to-doris", slug: "dm-to-doris", description: "达梦(DM)数据库迁移到Apache Doris的通用指南——类型映射、DDL自动生成、SQL语法转换(Oracle模式→MySQL协议)、同步策略。", tags: "通用问题排查,全产品通用,全省份通用,全环节通用,Claude", downloads: 4, stars: 0, skill_type: "self_operated", rank_downloads: 7, rank_stars: null, rank_recent: null, record_date: "2026-06-12", fetched_At: "2026-06-03T13:44:00" },
      { id: 1213, name: "web-playwright-e2e", slug: "web-playwright-e2e", description: "使用 Playwright 探索 Web 界面，编写场景测试计划和带 UTF-8 BOM 的 CSV 数据，生成数据驱动的 TypeScript 测试规格文件。", tags: "测试验证规范,全产品通用,全省份通用,测试", downloads: 3, stars: 0, skill_type: "self_operated", rank_downloads: 8, rank_stars: null, rank_recent: null, record_date: "2026-06-12", fetched_At: "2026-05-29T14:38:00" },
    ],
  },
  {
    code: "stars",
    title: "星标热榜",
    items: [
      { id: 1153, name: "git-commit", slug: "git-commit", description: "规范化 Git 提交信息生成技能。支持 Conventional Commits 规范，自动分析代码变更生成符合团队规范的提交信息。", tags: "技术研发能力,全省份通用,研发,Cursor", downloads: 44, stars: 3, skill_type: "self_operated", rank_downloads: null, rank_stars: 1, rank_recent: null, record_date: "2026-06-12", fetched_At: "2026-06-05T10:15:00" },
      { id: 1217, name: "移动集团COSMIC生成", slug: "cosmic", description: "生成和编辑 COSMIC 功能点 CSV 文件，适用于集团/六期文档编写。支持生成、补充、拆分或修订 COSMIC 功能点和数据移动。", tags: "通用规范常识,产品设计规范,全产品通用,全省份通用,需求,设计", downloads: 2, stars: 1, skill_type: "self_operated", rank_downloads: null, rank_stars: 2, rank_recent: null, record_date: "2026-06-12", fetched_At: "2026-06-03T14:58:00" },
      { id: 1230, name: "design-doc-to-code", slug: "design-doc-to-code", description: "以专题设计方案为入口（支持 .md / .doc / .docx），完成需求理解、代码对照、任务清单确认与分模块改造。", tags: "技术研发能力,Java 开发规范,全产品通用,全省份通用,研发", downloads: 6, stars: 1, skill_type: "self_operated", rank_downloads: null, rank_stars: 3, rank_recent: null, record_date: "2026-06-12", fetched_At: "2026-06-11T11:35:00" },
      { id: 1212, name: "bss30-business-rule-generator", slug: "bss30-business-rule-generator", description: "自动生成BSS3.0受理中心业务规则Java类代码。根据规则类型和业务描述，生成继承ServiceOfferRule的完整规则类。", tags: "通用受理,甘肃,研发,Cursor,IDEA,OpenCode", downloads: 3, stars: 1, skill_type: "self_operated", rank_downloads: null, rank_stars: 4, rank_recent: null, record_date: "2026-06-12", fetched_At: "2026-05-28T21:27:00" },
      { id: 1062, name: "code-quality-review", slug: "code-quality-review", description: "集成 PMD、Checkstyle、SpotBugs 等 6 种增量检查工具的代码静态检查技能。", tags: "CI/CD 流程,全产品通用,全省份通用,研发", downloads: 32, stars: 0, skill_type: "self_operated", rank_downloads: null, rank_stars: 5, rank_recent: null, record_date: "2026-06-12", fetched_At: "2026-05-28T14:00:00" },
      { id: 1221, name: "SDD规范编程技能", slug: "sdd", description: "浩鲸SDD规约驱动开发技能体系。L1基线（7维度186条规则强制）+ L2产品线扩展 + L3项目特化。", tags: "Java 开发规范,前端开发规范,通用受理,全省份通用", downloads: 31, stars: 0, skill_type: "self_operated", rank_downloads: null, rank_stars: 6, rank_recent: null, record_date: "2026-06-12", fetched_At: "2026-06-05T12:05:00" },
      { id: 1147, name: "ai-code-entropy-check", slug: "ai-code-entropy-check", description: "对 AI Coding 生成的代码进行代码熵增约束校验，防止AI代码引入过度的复杂性。", tags: "全产品通用,全省份通用,研发,Cursor", downloads: 12, stars: 0, skill_type: "self_operated", rank_downloads: null, rank_stars: 7, rank_recent: null, record_date: "2026-06-12", fetched_At: "2026-04-20T10:12:00" },
      { id: 1211, name: "memory-leak-detect", slug: "memory-leak-detect", description: "系统化诊断 Java 17 / Spring Boot 3 服务及 Vue 前端的 JVM 与浏览器内存泄漏。", tags: "全产品通用,全省份通用,研发,Cursor", downloads: 10, stars: 0, skill_type: "self_operated", rank_downloads: null, rank_stars: 8, rank_recent: null, record_date: "2026-06-12", fetched_At: "2026-05-28T09:45:00" },
    ],
  },
  {
    code: "recent",
    title: "最近更新",
    items: [
      { id: 1230, name: "design-doc-to-code", slug: "design-doc-to-code", description: "以专题设计方案为入口（支持 .md / .doc / .docx），完成需求理解、代码对照、任务清单确认与分模块改造。", tags: "技术研发能力,Java 开发规范,全产品通用", downloads: 6, stars: 1, skill_type: "self_operated", rank_downloads: null, rank_stars: null, rank_recent: 1, record_date: "2026-06-12", fetched_At: "2026-06-11T14:07:00" },
      { id: 1229, name: "代码分析技能", slug: "", description: "代码静态检查主 Skill，集成 PMD、Checkstyle、SpotBugs、JavaNCSS/Lizard 等检查工具。", tags: "产品事业部,国内BSS产品线,BSS产品研发四部", downloads: 0, stars: 0, skill_type: "self_operated", rank_downloads: null, rank_stars: null, rank_recent: 2, record_date: "2026-06-12", fetched_At: "2026-06-11T10:20:00" },
      { id: 1228, name: "制作HTML为载体的PPT的技能", slug: "html-ppt", description: "制作以 HTML 为载体的幻灯片演示文稿（代替传统 PPT/PPTX）。每张幻灯片严格遵循 16:9 比例，使用 CSS scroll-snap 实现翻页。", tags: "通用基础能力,全产品通用,全省份通用,需求,设计", downloads: 0, stars: 0, skill_type: "self_operated", rank_downloads: null, rank_stars: null, rank_recent: 3, record_date: "2026-06-12", fetched_At: "2026-06-11T09:45:00" },
      { id: 1227, name: "kettle快速配置", slug: "kettle", description: "Kettle 配置专家。将 Oracle 存储过程 SQL 转换为面向 PostgreSQL 的 Kettle 作业/转换配置。", tags: "业务领域能力,技术研发能力,全产品通用,全省份通用,全环节通用", downloads: 0, stars: 0, skill_type: "self_operated", rank_downloads: null, rank_stars: null, rank_recent: 4, record_date: "2026-06-12", fetched_At: "2026-06-10T11:48:00" },
      { id: 1221, name: "SDD规范编程技能", slug: "sdd", description: "浩鲸SDD规约驱动开发技能体系。L1基线（7维度186条规则强制）+ L2产品线扩展 + L3项目特化。", tags: "Java 开发规范,前端开发规范,通用受理,全省份通用", downloads: 31, stars: 0, skill_type: "self_operated", rank_downloads: null, rank_stars: null, rank_recent: 5, record_date: "2026-06-12", fetched_At: "2026-06-10T20:02:00" },
      { id: 1226, name: "generate-test-template", slug: "generate-test-template", description: "生成可复用的前端测试 Markdown 文档：正式逐用例纵向表格，或紧凑的开发自测报告。", tags: "产品事业部,国内BSS产品线,BSS产品研发三部", downloads: 0, stars: 0, skill_type: "self_operated", rank_downloads: null, rank_stars: null, rank_recent: 6, record_date: "2026-06-12", fetched_At: "2026-06-08T19:14:00" },
      { id: 1225, name: "skill-vetter", slug: "skill-vetter", description: "Security-first skill vetting for AI agents. Use before installing any skill from ClawdHub, GitHub, or other sources. Checks for red flags and suspicious patterns.", tags: "产品事业部,国内BSS产品线,BSS产品研发三部", downloads: 0, stars: 0, skill_type: "self_operated", rank_downloads: null, rank_stars: null, rank_recent: 7, record_date: "2026-06-12", fetched_At: "2026-06-08T19:04:00" },
      { id: 1223, name: "自动整理周报", slug: "", description: "钉钉周报整理与发送技能。用于持续收集碎片工作记录，生成结构化正式周报，并同步生成钉钉群摘要。", tags: "全省份通用,全环节通用,Claude", downloads: 0, stars: 0, skill_type: "self_operated", rank_downloads: null, rank_stars: null, rank_recent: 8, record_date: "2026-06-12", fetched_At: "2026-06-08T17:09:00" },
    ],
  },
];

// ---- 自营技能全量数据（36条，供分页演示） ----
export const mockSelfAllSkills: InternalSkill[] = [
  { id: 1232, name: "create-mdb-cfg", slug: "create-mdb-cfg", description: "MySQL 数据库配置文件自动生成技能，根据项目需求生成标准化的数据库连接配置文件。", tags: "产品事业部,国内BSS产品线,BSS产品研发三部", downloads: 0, stars: 0, skill_type: "self_operated", rank_downloads: null, rank_stars: null, rank_recent: null, record_date: "2026-06-12", fetched_At: "2026-06-11T17:30:00" },
  { id: 1231, name: "mysql-to-zmdb", slug: "mysql-to-zmdb", description: "MySQL 到 ZMDB 数据库迁移工具，支持表结构转换、数据迁移、索引优化等自动化操作。", tags: "产品事业部,国内BSS产品线,BSS产品研发三部", downloads: 0, stars: 0, skill_type: "self_operated", rank_downloads: null, rank_stars: null, rank_recent: null, record_date: "2026-06-12", fetched_At: "2026-06-11T17:00:00" },
  { id: 1230, name: "design-doc-to-code", slug: "design-doc-to-code", description: "以专题设计方案为入口（支持 .md / .doc / .docx），完成需求理解、代码对照、任务清单确认与分模块改造。", tags: "技术研发能力,Java 开发规范,全产品通用,全省份通用,研发,Cursor", downloads: 6, stars: 1, skill_type: "self_operated", rank_downloads: null, rank_stars: null, rank_recent: null, record_date: "2026-06-12", fetched_At: "2026-06-11T14:07:00" },
  { id: 1229, name: "代码分析技能", slug: "", description: "代码静态检查主 Skill，集成 PMD、Checkstyle、SpotBugs、JavaNCSS/Lizard、Simian（Java）和 Fish ESLint（JavaScript）共 6 种增量检查工具。", tags: "产品事业部,国内BSS产品线,BSS产品研发四部", downloads: 0, stars: 0, skill_type: "self_operated", rank_downloads: null, rank_stars: null, rank_recent: null, record_date: "2026-06-12", fetched_At: "2026-06-11T10:20:00" },
  { id: 1228, name: "制作HTML为载体的PPT的技能", slug: "html-ppt", description: "制作以 HTML 为载体的幻灯片演示文稿（代替传统 PPT/PPTX）。每张幻灯片严格遵循 16:9 比例，使用 CSS scroll-snap 实现翻页。", tags: "通用基础能力,全产品通用,全省份通用,需求,设计,售前", downloads: 0, stars: 0, skill_type: "self_operated", rank_downloads: null, rank_stars: null, rank_recent: null, record_date: "2026-06-12", fetched_At: "2026-06-11T09:45:00" },
  { id: 1227, name: "kettle快速配置", slug: "kettle", description: "Kettle 配置专家。将 Oracle 存储过程 SQL 转换为面向 PostgreSQL 的 Kettle 作业/转换配置。", tags: "业务领域能力,技术研发能力,全产品通用,全省份通用,全环节通用", downloads: 0, stars: 0, skill_type: "self_operated", rank_downloads: null, rank_stars: null, rank_recent: null, record_date: "2026-06-12", fetched_At: "2026-06-10T11:48:00" },
  { id: 1226, name: "generate-test-template", slug: "generate-test-template", description: "生成可复用的前端测试 Markdown 文档：正式逐用例纵向表格，或紧凑的开发自测报告。适用于测试用例、自测报告、冒烟检查清单。", tags: "产品事业部,国内BSS产品线,BSS产品研发三部", downloads: 0, stars: 0, skill_type: "self_operated", rank_downloads: null, rank_stars: null, rank_recent: null, record_date: "2026-06-12", fetched_At: "2026-06-08T19:14:00" },
  { id: 1225, name: "skill-vetter", slug: "skill-vetter", description: "Security-first skill vetting for AI agents. Use before installing any skill from ClawdHub, GitHub, or other sources. Checks for red flags and suspicious patterns.", tags: "产品事业部,国内BSS产品线,BSS产品研发三部", downloads: 0, stars: 0, skill_type: "self_operated", rank_downloads: null, rank_stars: null, rank_recent: null, record_date: "2026-06-12", fetched_At: "2026-06-08T19:04:00" },
  { id: 1223, name: "自动整理周报", slug: "", description: "钉钉周报整理与发送技能。用于持续收集碎片工作记录，生成结构化正式周报，并同步生成钉钉群摘要。", tags: "全省份通用,全环节通用,Claude", downloads: 0, stars: 0, skill_type: "self_operated", rank_downloads: null, rank_stars: null, rank_recent: null, record_date: "2026-06-12", fetched_At: "2026-06-08T17:09:00" },
  { id: 1222, name: "Doris快速迁移导入导出自动化", slug: "doris", description: "提供两个 Python 脚本，通过 Apache Doris 的 MySQL 协议端口连接 FE，完成数据库级别的 DDL + 数据导出与导入，适用于集群迁移、备份恢复。", tags: "数据库与中间件,全产品通用,全省份通用,全环节通用,Cursor", downloads: 0, stars: 0, skill_type: "self_operated", rank_downloads: null, rank_stars: null, rank_recent: null, record_date: "2026-06-12", fetched_At: "2026-06-08T11:41:00" },
  { id: 1221, name: "SDD规范编程技能", slug: "sdd", description: "浩鲸SDD规约驱动开发技能体系。L1基线（7维度186条规则强制）+ L2产品线扩展 + L3项目特化。支持CodeSpec生码约束规范，集成SDD合规检查流水线。", tags: "Java 开发规范,前端开发规范,通用受理,全省份通用,需求,研发,全环节通用,Cursor,Claude", downloads: 31, stars: 0, skill_type: "self_operated", rank_downloads: null, rank_stars: null, rank_recent: null, record_date: "2026-06-12", fetched_At: "2026-06-10T20:02:00" },
  { id: 1220, name: "快速克隆网站获得静态页面", slug: "", description: "使用 wget 克隆网站——下载 HTML、CSS、JS、图片，并进行正确的离线链接处理。对做系统原型有帮助。", tags: "通用基础能力,全产品通用,全省份通用,设计,Cursor,IDEA,Codex", downloads: 0, stars: 0, skill_type: "self_operated", rank_downloads: null, rank_stars: null, rank_recent: null, record_date: "2026-06-12", fetched_At: "2026-06-05T10:57:00" },
  { id: 1217, name: "移动集团COSMIC生成", slug: "cosmic", description: "生成和编辑 COSMIC 功能点 CSV 文件，适用于集团/六期文档编写。支持生成、补充、拆分或修订 COSMIC 功能点和数据移动。", tags: "通用规范常识,产品设计规范,全产品通用,全省份通用,需求,设计,Cursor,Claude,Codex", downloads: 2, stars: 1, skill_type: "self_operated", rank_downloads: null, rank_stars: null, rank_recent: null, record_date: "2026-06-12", fetched_At: "2026-06-05T15:43:00" },
  { id: 1216, name: "dm-to-doris", slug: "dm-to-doris", description: "达梦(DM)数据库迁移到Apache Doris的通用指南——类型映射、DDL自动生成、SQL语法转换(Oracle模式→MySQL协议)、同步策略、CLOB处理。", tags: "通用问题排查,全产品通用,全省份通用,全环节通用,Claude", downloads: 4, stars: 0, skill_type: "self_operated", rank_downloads: null, rank_stars: null, rank_recent: null, record_date: "2026-06-12", fetched_At: "2026-06-03T14:32:00" },
  { id: 1215, name: "techdesign", slug: "techdesign", description: "专题设计方案撰写技能。产出符合浩鲸/大厂技术文档标准的专题设计方案，含编写目的、设计依据、系统需求、总体方案、系统改造等章节，最终交付 .docx 格式。", tags: "需求分析与管理,产品设计规范,全产品通用,全省份通用,需求,设计", downloads: 2, stars: 0, skill_type: "self_operated", rank_downloads: null, rank_stars: null, rank_recent: null, record_date: "2026-06-12", fetched_At: "2026-06-03T15:12:00" },
  { id: 1214, name: "apipost-local-api", slug: "apipost-local-api", description: "从任意 Spring Boot 项目的 Controller / Feign 接口源码生成 Postman Collection v2.1，供 ApiPost 导入本地联调。自动发现端口、context-path 与 API 前缀。", tags: "Java 开发规范,全产品通用,全省份通用,研发,Cursor,Claude,Codex", downloads: 0, stars: 0, skill_type: "self_operated", rank_downloads: null, rank_stars: null, rank_recent: null, record_date: "2026-06-12", fetched_At: "2026-05-29T16:56:00" },
  { id: 1213, name: "web-playwright-e2e", slug: "web-playwright-e2e", description: "使用 Playwright 探索 Web 界面，编写场景测试计划和带 UTF-8 BOM 的 CSV 数据，生成数据驱动的 Playwright TypeScript 测试规格文件，支持可选的数据库清理。", tags: "测试验证规范,全产品通用,全省份通用,测试,Cursor,Claude,OpenCode", downloads: 3, stars: 0, skill_type: "self_operated", rank_downloads: null, rank_stars: null, rank_recent: null, record_date: "2026-06-12", fetched_At: "2026-06-03T11:05:00" },
  { id: 1212, name: "bss30-business-rule-generator", slug: "bss30-business-rule-generator", description: "自动生成BSS3.0受理中心业务规则Java类代码。根据规则类型（校验规则CheckRule、处理规则DealRule）、规则时机和业务描述，生成完整的规则类。", tags: "通用受理,甘肃,研发,Cursor,IDEA,OpenCode", downloads: 3, stars: 1, skill_type: "self_operated", rank_downloads: null, rank_stars: null, rank_recent: null, record_date: "2026-06-12", fetched_At: "2026-06-01T19:56:00" },
  { id: 1211, name: "memory-leak-detect", slug: "memory-leak-detect", description: "系统化诊断 Java 17 / Spring Boot 3 服务及 Vue 前端的 JVM 与浏览器内存泄漏。适用于 OOM、堆增长、GC 抖动、Metaspace 增长等场景。", tags: "全产品通用,全省份通用,研发,Cursor", downloads: 10, stars: 0, skill_type: "self_operated", rank_downloads: null, rank_stars: null, rank_recent: null, record_date: "2026-06-12", fetched_At: "2026-06-03T14:25:00" },
  { id: 1210, name: "电信铁塔租用git add", slug: "git-add", description: "将 Agent 在本仓库新建的业务代码、DDL、脚本、前端模块等文件自动执行 git add 暂存（不 commit）。仅修改已有文件不触发。", tags: "通用受理,全省份通用,研发,Cursor,Claude,Codex,OpenCode", downloads: 0, stars: 0, skill_type: "self_operated", rank_downloads: null, rank_stars: null, rank_recent: null, record_date: "2026-06-12", fetched_At: "2026-05-28T09:05:00" },
  { id: 1153, name: "git-commit", slug: "git-commit", description: "规范化 Git 提交信息生成技能。支持 Conventional Commits 规范，自动分析代码变更生成符合团队规范的提交信息，提升代码管理效率。", tags: "技术研发能力,全省份通用,研发,Cursor,产品事业部,国内资源产品线,资源产品研发一部", downloads: 44, stars: 3, skill_type: "self_operated", rank_downloads: null, rank_stars: null, rank_recent: null, record_date: "2026-06-12", fetched_At: "2026-06-05T10:15:00" },
  { id: 1147, name: "ai-code-entropy-check", slug: "ai-code-entropy-check", description: "对 AI Coding（Cursor/大模型）生成的代码进行代码熵增约束校验，防止AI代码引入过度的复杂性、耦合和失控风险。", tags: "全产品通用,全省份通用,研发,Cursor,产品事业部,国内资源产品线,资源产品研发一部", downloads: 12, stars: 0, skill_type: "self_operated", rank_downloads: null, rank_stars: null, rank_recent: null, record_date: "2026-06-12", fetched_At: "2026-06-10T14:59:00" },
  { id: 1062, name: "code-quality-review", slug: "code-quality-review", description: "集成 PMD、Checkstyle、SpotBugs、JavaNCSS/Lizard、Simian 和 Fish ESLint 共 6 种增量检查工具。发现问题后默认自动修复并复验。", tags: "CI/CD 流程,全产品通用,全省份通用,研发,产品事业部,国内资源产品线,资源产品研发一部", downloads: 32, stars: 0, skill_type: "self_operated", rank_downloads: null, rank_stars: null, rank_recent: null, record_date: "2026-06-12", fetched_At: "2026-05-28T14:00:00" },
  { id: 1063, name: "weekly-report-summary", slug: "weekly-report-summary", description: "自动汇总团队成员一周工作内容，生成格式统一的工作周报。支持从 Git、Jira、钉钉等来源聚合数据。", tags: "通用基础能力,全产品通用,全省份通用,全环节通用", downloads: 28, stars: 5, skill_type: "self_operated", rank_downloads: null, rank_stars: null, rank_recent: null, record_date: "2026-06-12", fetched_At: "2026-05-25T09:30:00" },
  { id: 1064, name: "api-doc-generator", slug: "api-doc-generator", description: "根据代码注解自动生成 RESTful API 文档，支持 Swagger/OpenAPI 3.0 格式导出，支持 Java/Go/Python 多语言后端。", tags: "技术研发能力,全产品通用,全省份通用,研发,设计", downloads: 22, stars: 3, skill_type: "self_operated", rank_downloads: null, rank_stars: null, rank_recent: null, record_date: "2026-06-12", fetched_At: "2026-05-22T16:00:00" },
  { id: 1065, name: "env-config-checker", slug: "env-config-checker", description: "环境配置一致性检查工具——对比开发/测试/生产环境的配置文件差异，发现遗漏的配置项和环境特有风险。", tags: "技术研发能力,全产品通用,全省份通用,研发,测试", downloads: 18, stars: 2, skill_type: "self_operated", rank_downloads: null, rank_stars: null, rank_recent: null, record_date: "2026-06-12", fetched_At: "2026-05-20T11:00:00" },
  { id: 1066, name: "sql-formatter-optimizer", slug: "sql-formatter-optimizer", description: "SQL 格式化与优化建议工具。支持多种 SQL 方言（MySQL、PostgreSQL、Oracle、达梦），自动格式化并提供索引优化、查询改写建议。", tags: "数据库与中间件,全产品通用,全省份通用,研发,测试", downloads: 15, stars: 2, skill_type: "self_operated", rank_downloads: null, rank_stars: null, rank_recent: null, record_date: "2026-06-12", fetched_At: "2026-05-18T14:00:00" },
  { id: 1067, name: "redis-ops-helper", slug: "redis-ops-helper", description: "Redis 运维助手——常用命令速查、慢查询分析、内存优化建议、集群拓扑可视化、数据迁移指导。", tags: "数据库与中间件,全产品通用,全省份通用,全环节通用", downloads: 12, stars: 1, skill_type: "self_operated", rank_downloads: null, rank_stars: null, rank_recent: null, record_date: "2026-06-12", fetched_At: "2026-05-15T10:00:00" },
  { id: 1068, name: "deploy-checklist", slug: "deploy-checklist", description: "上线部署检查清单生成器——根据项目特征自动生成上线检查项，覆盖代码审查、配置检查、数据库变更、回滚预案等环节。", tags: "技术研发能力,CI/CD 流程,全产品通用,全省份通用,全环节通用", downloads: 10, stars: 1, skill_type: "self_operated", rank_downloads: null, rank_stars: null, rank_recent: null, record_date: "2026-06-12", fetched_At: "2026-05-12T08:00:00" },
  { id: 1069, name: "log-pattern-analyzer", slug: "log-pattern-analyzer", description: "日志模式分析工具——自动识别常见错误日志模式，提取关键堆栈信息，关联历史已知问题库，快速定位根因。", tags: "通用问题排查,全产品通用,全省份通用,研发,测试", downloads: 8, stars: 0, skill_type: "self_operated", rank_downloads: null, rank_stars: null, rank_recent: null, record_date: "2026-06-12", fetched_At: "2026-05-10T15:00:00" },
  { id: 1070, name: "nginx-config-builder", slug: "nginx-config-builder", description: "Nginx 配置搭建向导——交互式生成反向代理、负载均衡、SSL 终止、缓存策略等常见场景的 Nginx 配置。", tags: "技术研发能力,全产品通用,全省份通用,研发", downloads: 7, stars: 0, skill_type: "self_operated", rank_downloads: null, rank_stars: null, rank_recent: null, record_date: "2026-06-12", fetched_At: "2026-05-08T12:00:00" },
  { id: 1071, name: "docker-cleanup", slug: "docker-cleanup", description: "Docker 资源清理工具——清理未使用的镜像、容器、卷、网络，回收磁盘空间。提供安全模式和激进模式可选。", tags: "技术研发能力,全产品通用,全省份通用,研发", downloads: 6, stars: 0, skill_type: "self_operated", rank_downloads: null, rank_stars: null, rank_recent: null, record_date: "2026-06-12", fetched_At: "2026-05-05T09:00:00" },
  { id: 1072, name: "maven-dependency-scanner", slug: "maven-dependency-scanner", description: "Maven 依赖冲突扫描与解决工具。自动检测依赖版本冲突，分析传递依赖，给出安全的版本升级建议。", tags: "Java 开发规范,全产品通用,全省份通用,研发", downloads: 5, stars: 0, skill_type: "self_operated", rank_downloads: null, rank_stars: null, rank_recent: null, record_date: "2026-06-12", fetched_At: "2026-05-02T10:00:00" },
  { id: 1073, name: "jwt-debugger", slug: "jwt-debugger", description: "JWT Token 在线调试工具——解码、验证签名、检查过期时间、分析 claims 内容。支持 RS256/HS256 等多种算法。", tags: "通用问题排查,全产品通用,全省份通用,研发,测试", downloads: 4, stars: 0, skill_type: "self_operated", rank_downloads: null, rank_stars: null, rank_recent: null, record_date: "2026-06-12", fetched_At: "2026-04-28T11:00:00" },
  { id: 1074, name: "openapi-merge", slug: "openapi-merge", description: "多个 OpenAPI 规范文件合并工具——将微服务中的多个 API 文档合并为统一的 API 规范，消除重复 schema。", tags: "技术研发能力,全产品通用,全省份通用,设计", downloads: 3, stars: 1, skill_type: "self_operated", rank_downloads: null, rank_stars: null, rank_recent: null, record_date: "2026-06-12", fetched_At: "2026-04-25T16:00:00" },
  { id: 1075, name: "jenkins-job-migrator", slug: "jenkins-job-migrator", description: "Jenkins Job 迁移工具——支持跨服务器迁移 Jenkins Job 配置，自动处理凭证、节点标签、参数化构建等迁移细节。", tags: "CI/CD 流程,全产品通用,全省份通用,研发", downloads: 2, stars: 0, skill_type: "self_operated", rank_downloads: null, rank_stars: null, rank_recent: null, record_date: "2026-06-12", fetched_At: "2026-04-22T14:00:00" },
  { id: 1076, name: "feign-client-generator", slug: "feign-client-generator", description: "Spring Cloud Feign 客户端代码生成器——根据 Swagger/OpenAPI 文档自动生成 Feign 接口定义、熔断回退和配置类。", tags: "Java 开发规范,全产品通用,全省份通用,研发", downloads: 1, stars: 0, skill_type: "self_operated", rank_downloads: null, rank_stars: null, rank_recent: null, record_date: "2026-06-12", fetched_At: "2026-04-20T10:00:00" },
];
