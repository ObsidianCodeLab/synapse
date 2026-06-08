/**
 * SOP 节点会议目标（与后端 `synapse.rd_sop.manifest.NODE_INTENTS` 保持一致，前端只读展示）。
 */
export const NODE_INTENTS: Record<string, string> = {
  pending: '等待进入智能研发流水线。',
  req_clarify: '识别需求模糊点，交互式完善需求说明。',
  boundary: '识别跨产品边界，确保单需求单产品。',
  module_func: '功能模块拆分，为设计做准备。',
  acceptance: '为功能模块设定验收标准。',
  req_risk: '高风险需求人工评估影响与工作量。',
  func_assign: '按功能点分派给 Worker 并行处理。',
  history_solution: '检索历史方案并与当前需求映射。',
  module_confirm: '确认改造的代码模块范围。',
  func_solution:
    '功能方案定位到函数级，控制改造范围，小鲸只负责检查对应方案的合理性，而产品设计专家负责方案文档的生成。',
  entropy_gen: '生成 agent.md、rule.md 等控熵文件。',
  solution_review: '方案评审与可行性验证。',
  auto_split: '按需求与方案自动拆分研发子单。',
  sandbox_build: '构造研发沙箱基础环境。',
  env_pregen: '拉取文档与控熵文件，预生成开发环境。',
  task_exec: '人工确认后启动研发任务执行。',
  exception_check: '检测执行异常并决定是否升级人工。',
  task_feedback: '反馈执行进度供人工观察。',
  diff_analysis: '研发人员完成代码差异分析。',
  env_start: '启动环境并编译运行。',
  unit_test: '按验收标准生成并执行单元测试。',
  dev_process_review: '开发流程规范评审。',
  solution_consistency: '方案与实现一致性检查。',
  risk_review: '风险项评审。',
  entropy_review: '控熵文件合规评审。',
  leader_review: '研发组长综合审批。',
};

export function nodeIntentFor(nodeId: string): string {
  return NODE_INTENTS[nodeId]?.trim() ?? '';
}
