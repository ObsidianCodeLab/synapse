import type { TFunction } from "i18next";
import {
  Code,
  Database,
  FileText,
  Bug,
  type LucideIcon,
} from "lucide-react";

export type ItemStatus = "completed" | "processing" | "pending";

export interface PlanItem {
  id: number;
  name: string;
  tool: string;
  status: ItemStatus;
  duration: string;
}

export interface StepData {
  id: number;
  titleKey: string;
  status: ItemStatus;
  icon: LucideIcon;
  time: string;
  plan: PlanItem[];
}

export function buildInitialSteps(t: TFunction): StepData[] {
  return [
    {
      id: 1,
      titleKey: "rdProcess.flow.step1",
      status: "completed",
      icon: FileText,
      time: "2.4s",
      plan: [
        { id: 1, name: t("rdProcess.flow.plan1a"), tool: "text_parser", status: "completed", duration: "0.4s" },
        { id: 2, name: t("rdProcess.flow.plan1b"), tool: "doc_gen", status: "completed", duration: "0.8s" },
        { id: 3, name: t("rdProcess.flow.plan1c"), tool: "task_splitter", status: "completed", duration: "1.2s" },
      ],
    },
    {
      id: 2,
      titleKey: "rdProcess.flow.step2",
      status: "completed",
      icon: Database,
      time: "3.1s",
      plan: [
        { id: 1, name: t("rdProcess.flow.plan2a"), tool: "graph_db", status: "completed", duration: "0.2s" },
        { id: 2, name: t("rdProcess.flow.plan2b"), tool: "logic_analyzer", status: "completed", duration: "1.6s" },
        { id: 3, name: t("rdProcess.flow.plan2c"), tool: "spec_tool", status: "completed", duration: "1.3s" },
      ],
    },
    {
      id: 3,
      titleKey: "rdProcess.flow.step3",
      status: "processing",
      icon: Code,
      time: t("rdProcess.flow.inProgress"),
      plan: [
        { id: 1, name: t("rdProcess.flow.plan3a"), tool: "ast_loader", status: "completed", duration: "1.1s" },
        { id: 2, name: t("rdProcess.flow.plan3b"), tool: "logic_gen", status: "processing", duration: t("rdProcess.flow.inProgress") },
        { id: 3, name: t("rdProcess.flow.plan3c"), tool: "refactor_tool", status: "pending", duration: "-" },
        { id: 4, name: t("rdProcess.flow.plan3d"), tool: "test_sync", status: "pending", duration: "-" },
      ],
    },
    {
      id: 4,
      titleKey: "rdProcess.flow.step4",
      status: "pending",
      icon: Bug,
      time: "-",
      plan: [
        { id: 1, name: t("rdProcess.flow.plan4a"), tool: "jest_runner", status: "pending", duration: "-" },
        { id: 2, name: t("rdProcess.flow.plan4b"), tool: "security_scanner", status: "pending", duration: "-" },
        { id: 3, name: t("rdProcess.flow.plan4c"), tool: "report_gen", status: "pending", duration: "-" },
      ],
    },
  ];
}

export interface TopicRow {
  titleKey: string;
  status: "done" | "ongoing" | "todo";
  actionKey: string;
  goalKey: string;
}

export const TOPIC_ROWS: TopicRow[] = [
  { titleKey: "rdProcess.topic1", status: "done", actionKey: "rdProcess.topic1Action", goalKey: "rdProcess.topic1Goal" },
  { titleKey: "rdProcess.topic2", status: "done", actionKey: "rdProcess.topic2Action", goalKey: "rdProcess.topic2Goal" },
  { titleKey: "rdProcess.topic3", status: "ongoing", actionKey: "rdProcess.topic3Action", goalKey: "rdProcess.topic3Goal" },
  { titleKey: "rdProcess.topic4", status: "todo", actionKey: "rdProcess.topic4Action", goalKey: "rdProcess.topic4Goal" },
  { titleKey: "rdProcess.topic5", status: "todo", actionKey: "rdProcess.topic5Action", goalKey: "rdProcess.topic5Goal" },
];

export interface TicketRecord {
  key: string;
  id: string;
  title: string;
  description: string;
  matchRate: number;
  type: "bug" | "feature";
  assignee: string;
  product: string;
  modules: string[];
  effort: string;
  devTickets: number;
  complexity: "low" | "medium" | "high";
}

export const RELATED_TICKETS: TicketRecord[] = [
  {
    key: "1",
    id: "ISSUE-2024",
    title: "购物车计算折扣时偶发的精度丢失问题",
    description:
      "用户在结算时，购物车内含有折扣商品（如 9折、满减）时，前端展示金额与后端计算金额出现 ±0.01 元的尾差。经排查，根因为 JavaScript 浮点数精度问题，折扣率与单价相乘时未做精度截断处理。需在结算模块统一使用整数分（×100）或引入 Decimal.js 进行精确计算，并在单元测试中覆盖边界场景。",
    matchRate: 94,
    type: "bug",
    assignee: "李明",
    product: "电商平台",
    modules: ["购物车", "结算"],
    effort: "3人天",
    devTickets: 4,
    complexity: "high",
  },
  {
    key: "2",
    id: "ISSUE-1988",
    title: "订单金额统计报表尾差修复",
    description:
      "财务报表在汇总当日订单总金额时，与订单明细加总结果存在最高 ¥0.5 的差异。原因为数据库聚合查询使用 FLOAT 类型字段，累计误差在大数据量下被放大。需将 order_amount 字段类型由 FLOAT 改为 DECIMAL(12,2)，并对历史数据进行回刷校正。",
    matchRate: 81,
    type: "bug",
    assignee: "张三",
    product: "数据报表",
    modules: ["订单", "报表"],
    effort: "2人天",
    devTickets: 2,
    complexity: "medium",
  },
  {
    key: "3",
    id: "FEAT-3012",
    title: "支持使用大数对象处理所有的资金计算逻辑",
    description:
      "当前系统在涉及资金计算的多个模块（支付、账单、风控）中混用 number 与 string 类型，存在潜在精度风险。本需求要求引入统一的 BigDecimal 工具类，封装加减乘除与格式化方法，替换全量资金计算逻辑，并编写迁移文档，确保各模块平滑过渡，回归测试通过率 100%。",
    matchRate: 67,
    type: "feature",
    assignee: "王五",
    product: "基础平台",
    modules: ["支付", "账单", "风控"],
    effort: "8人天",
    devTickets: 7,
    complexity: "high",
  },
  {
    key: "4",
    id: "ISSUE-2102",
    title: "Redis 分布式锁在高并发续约场景下的偶发失效",
    description:
      "在双十一压测期间，发现部分秒杀订单出现了超卖现象。经日志分析，当 Redis 负载极高导致网络抖动时，Redisson 的看门狗续约机制可能因为超时而未能及时续约，导致锁提前释放。需优化续约重试策略，并增加本地二级锁作为兜底保障。",
    matchRate: 89,
    type: "bug",
    assignee: "赵六",
    product: "中间件",
    modules: ["缓存", "分布式锁"],
    effort: "4人天",
    devTickets: 3,
    complexity: "high",
  },
  {
    key: "5",
    id: "FEAT-3045",
    title: "自动化对账引擎性能优化与索引重建",
    description:
      "随着日订单量突破千万级，当前的对账任务耗时从 2小时增加到了 6小时，影响了次日的报表生成。本方案计划将单线程对账升级为基于分片的并行对账模式，并对核心流水表进行分区处理及覆盖索引优化，目标将耗时降低至 1.5小时以内。",
    matchRate: 78,
    type: "feature",
    assignee: "陈七",
    product: "支付结算",
    modules: ["对账", "性能"],
    effort: "5人天",
    devTickets: 5,
    complexity: "medium",
  },
];
