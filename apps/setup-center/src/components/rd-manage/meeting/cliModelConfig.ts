/** Cursor CLI 模型选项（与后端 synapse.rd_meeting.cli_models 对齐） */

import type { CliToolId } from './cliToolConfig';

export type CursorCliModelId = 'composer-2.5' | 'auto' | 'custom';

export interface CliModelOption {
  id: CursorCliModelId;
  label: string;
  description: string;
  default?: boolean;
  requiresInput?: boolean;
}

export const CURSOR_CLI_MODEL_OPTIONS: CliModelOption[] = [
  {
    id: 'composer-2.5',
    label: 'Composer 2.5',
    description: 'Cursor Composer 2.5，任务执行默认模型',
    default: true,
  },
  {
    id: 'auto',
    label: 'Auto',
    description: '由 Cursor Agent CLI 自动选择模型',
  },
  {
    id: 'custom',
    label: 'Custom',
    description: '自定义模型 ID，原样传给 agent --model',
    requiresInput: true,
  },
];

export const DEFAULT_CURSOR_CLI_MODEL: CursorCliModelId = 'composer-2.5';

export function normalizeCursorCliModel(value: string | undefined | null): CursorCliModelId {
  const v = (value || '').trim() as CursorCliModelId;
  return CURSOR_CLI_MODEL_OPTIONS.some((o) => o.id === v) ? v : DEFAULT_CURSOR_CLI_MODEL;
}

/** 按 CLI 工具返回可选模型列表；未接入的工具返回空数组。 */
export function cliModelOptionsForTool(cliTool: CliToolId): CliModelOption[] {
  if (cliTool === 'cursor_cli') {
    return CURSOR_CLI_MODEL_OPTIONS;
  }
  return [];
}

export function displayCliModelLabel(
  cliTool: CliToolId,
  preset: string | undefined | null,
  custom?: string | undefined | null,
): string {
  if (cliTool !== 'cursor_cli') return '—';
  const mode = normalizeCursorCliModel(preset);
  if (mode === 'custom') {
    return (custom || '').trim() || DEFAULT_CURSOR_CLI_MODEL;
  }
  if (mode === 'auto') return 'Auto';
  return CURSOR_CLI_MODEL_OPTIONS.find((o) => o.id === mode)?.label || mode;
}
