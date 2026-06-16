/** 任务执行节点 CLI 工具选项（与后端 synapse.rd_meeting.cli_tools 对齐） */

export type CliToolId = 'cursor_cli' | 'claude_code' | 'opencode';

export interface CliToolOption {
  id: CliToolId;
  label: string;
  description: string;
  implemented: boolean;
}

export const CLI_TOOL_OPTIONS: CliToolOption[] = [
  {
    id: 'cursor_cli',
    label: 'Cursor CLI',
    description: 'Cursor Agent CLI（agent）headless 模式，默认推荐',
    implemented: true,
  },
  {
    id: 'claude_code',
    label: 'Claude Code',
    description: 'Claude Code CLI（待接入）',
    implemented: false,
  },
  {
    id: 'opencode',
    label: 'OpenCode',
    description: 'OpenCode CLI（待接入）',
    implemented: false,
  },
];

export const DEFAULT_CLI_TOOL: CliToolId = 'cursor_cli';
/** 与后端 binding.DEFAULT_CLI_TIMEOUT_SECONDS 对齐 */
export const DEFAULT_CLI_TIMEOUT_SECONDS = 1800;

export function normalizeCliTool(value: string | undefined | null): CliToolId {
  const v = (value || '').trim() as CliToolId;
  return CLI_TOOL_OPTIONS.some((o) => o.id === v) ? v : DEFAULT_CLI_TOOL;
}
