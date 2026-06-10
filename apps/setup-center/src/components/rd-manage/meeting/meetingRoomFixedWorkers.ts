/** 与后端 synapse.rd_sop.manifest.FIXED_WORKER_PROFILE_IDS 对齐 */
export const FUNC_SOLUTION_NODE_ID = 'func_solution';
export const FUNC_SOLUTION_FIXED_WORKER_PROFILE_ID = 'whalecloud-design-expert';

const FIXED_WORKER_PROFILE_IDS: Record<string, string[]> = {
  [FUNC_SOLUTION_NODE_ID]: [FUNC_SOLUTION_FIXED_WORKER_PROFILE_ID],
};

export function fixedWorkerProfileIds(nodeId: string): string[] {
  return [...(FIXED_WORKER_PROFILE_IDS[nodeId] ?? [])];
}

export function hasFixedWorkerRoster(nodeId: string): boolean {
  return fixedWorkerProfileIds(nodeId).length > 0;
}
