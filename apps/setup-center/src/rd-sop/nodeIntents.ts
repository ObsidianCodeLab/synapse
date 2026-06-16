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
    '函数级方案：总分 Mermaid 架构 + 需求-模块-改造方案逐条设计，专用面板协同评审。',
  entropy_gen: '生成 agent.md、rule.md 等控熵文件。',
  solution_review: '方案评审与可行性验证。',
  auto_split: '按需求与方案自动拆分研发子单。',
  sandbox_build: '构造研发沙箱基础环境。',
  env_pregen: '拉取文档与控熵文件，预生成开发环境。',
  task_exec: '基于函数级方案和工单进行功能点的自动化开发。',
  exception_check: '自动触发特性分支代码提交并等待和收集试飞结果。',
  task_feedback: '基于特性分支试飞结果生成试飞优化方案，确保不引入新的试飞问题，同时解决所有已识别问题。',
  diff_analysis: '根据试飞优化方案执行并提交代码。',
  env_start: '对试飞优化节点与任务执行节点的产出进行试飞级、需求方案级分析；试飞未通过时覆盖代码提交输出并引导至试飞方案，功能不完整时引导至任务执行；同一子单连续三次未通过则禁止 AI 继续处理。',
  unit_test: '说明本次研发任务涉及的功能测试案例、单元测试文件路径与测试结果，辅助后续自动化测试。',
  dev_process_review: '开发流程规范评审。',
  solution_consistency: '方案与实现一致性检查。',
  risk_review: '风险项评审。',
  entropy_review: '控熵文件合规评审。',
  leader_review: '研发组长综合审批。',
};

export function nodeIntentFor(nodeId: string): string {
  return NODE_INTENTS[nodeId]?.trim() ?? '';
}
