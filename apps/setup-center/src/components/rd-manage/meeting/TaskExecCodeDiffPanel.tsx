/**
 * 任务执行评审 · 代码差异（Monaco 单窗 inline diff：全量文件 + 红删绿增高亮）
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Segmented } from 'antd';
import { DiffEditor } from '@monaco-editor/react';
import { GitBranch, Loader2, Plus, Minus } from 'lucide-react';
import {
  fetchTaskExecCodeDiffs,
  type TaskExecCodeDiffFile,
} from '../../../api/meetingRoomService';
import { useAntThemeDark } from '../../rd-view/useAntThemeDark';
import {
  decodeDiffFileText,
  DIFF_TEXT_ENCODINGS,
  type DiffTextEncoding,
} from './taskExecDiffEncoding';

const TASK_EXEC_DIFF_THEME_DARK = 'synapse-task-exec-diff-dark';
const TASK_EXEC_DIFF_THEME_LIGHT = 'synapse-task-exec-diff-light';

type MonacoModule = typeof import('monaco-editor');

let diffThemesRegistered = false;

function registerTaskExecDiffThemes(monaco: MonacoModule) {
  if (diffThemesRegistered) return;
  diffThemesRegistered = true;

  // 暗红删、淡绿增 — 通过 Monaco 主题色定义，避免 CSS 类名覆盖搞反
  monaco.editor.defineTheme(TASK_EXEC_DIFF_THEME_DARK, {
    base: 'vs-dark',
    inherit: true,
    rules: [],
    colors: {
      'diffEditor.removedTextBackground': '#8b303040',
      'diffEditor.removedLineBackground': '#8b303028',
      'diffEditor.insertedTextBackground': '#3d6b4530',
      'diffEditor.insertedLineBackground': '#3d6b4520',
      'diffEditorGutter.removedLineBackground': '#8b303028',
      'diffEditorGutter.insertedLineBackground': '#3d6b4520',
    },
  });

  monaco.editor.defineTheme(TASK_EXEC_DIFF_THEME_LIGHT, {
    base: 'vs',
    inherit: true,
    rules: [],
    colors: {
      'diffEditor.removedTextBackground': '#c5303028',
      'diffEditor.removedLineBackground': '#c5303018',
      'diffEditor.insertedTextBackground': '#2f855a24',
      'diffEditor.insertedLineBackground': '#2f855a16',
      'diffEditorGutter.removedLineBackground': '#c5303018',
      'diffEditorGutter.insertedLineBackground': '#2f855a16',
    },
  });
}

function taskExecDiffTheme(isDark: boolean) {
  return isDark ? TASK_EXEC_DIFF_THEME_DARK : TASK_EXEC_DIFF_THEME_LIGHT;
}

interface Props {
  synapseApiBase: string;
  roomId: string;
}

type DiffEditorInstance = {
  getLineChanges?: () => Array<{
    modifiedStartLineNumber: number;
    modifiedEndLineNumber: number;
    originalStartLineNumber: number;
    originalEndLineNumber: number;
  }> | null;
  getModifiedEditor?: () => {
    revealLinesInCenter?: (start: number, end: number) => void;
    updateOptions?: (opts: Record<string, unknown>) => void;
  };
  getOriginalEditor?: () => {
    updateOptions?: (opts: Record<string, unknown>) => void;
  };
  revealFirstDiff?: () => unknown;
  onDidUpdateDiff?: (listener: () => void) => { dispose?: () => void };
  getContainerDomNode?: () => HTMLElement;
};

function statusLabel(status: string | undefined): string {
  const key = String(status || '').toLowerCase();
  if (key === 'added') return '新增';
  if (key === 'deleted') return '删除';
  return '修改';
}

function fileBaseName(path: string | undefined): string {
  const norm = String(path || '').replace(/\\/g, '/');
  const idx = norm.lastIndexOf('/');
  return idx >= 0 ? norm.slice(idx + 1) : norm;
}

function fileTooltip(file: TaskExecCodeDiffFile): string {
  const parts = [file.path];
  if (file.task_no) parts.push(`子单 ${file.task_no}`);
  return parts.filter(Boolean).join(' · ');
}

function centerOnFirstChange(editor: DiffEditorInstance) {
  const changes = editor.getLineChanges?.();
  if (!changes?.length) {
    editor.revealFirstDiff?.();
    return;
  }
  const first = changes[0];
  const start = first.modifiedStartLineNumber || first.originalStartLineNumber;
  const end = Math.max(
    start,
    first.modifiedEndLineNumber || first.originalEndLineNumber || start,
  );
  const modified = editor.getModifiedEditor?.();
  if (start > 0 && modified?.revealLinesInCenter) {
    modified.revealLinesInCenter(start, end);
    return;
  }
  editor.revealFirstDiff?.();
}

function bindDiffCenterScroll(editor: DiffEditorInstance) {
  const scroll = () => {
    requestAnimationFrame(() => centerOnFirstChange(editor));
  };
  scroll();
  return editor.onDidUpdateDiff?.(scroll);
}

const EDITOR_HEIGHT = 460;

const DIFF_EDITOR_OPTIONS = {
  renderSideBySide: false,
  readOnly: true,
  originalEditable: false,
  wordWrap: 'off' as const,
  diffWordWrap: 'off' as const,
  minimap: { enabled: false },
  fontSize: 12,
  scrollBeyondLastLine: false,
  renderIndicators: true,
  renderMarginRevertIcon: false,
  automaticLayout: true,
  renderOverviewRuler: true,
  ignoreTrimWhitespace: false,
  hideUnchangedRegions: {
    enabled: false,
  },
};

export function TaskExecCodeDiffPanel({ synapseApiBase, roomId }: Props) {
  const isDark = useAntThemeDark();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [files, setFiles] = useState<TaskExecCodeDiffFile[]>([]);
  const [summary, setSummary] = useState<{ file_count?: number; additions?: number; deletions?: number }>(
    {},
  );
  const [activeId, setActiveId] = useState('');
  const [textEncoding, setTextEncoding] = useState<DiffTextEncoding>('utf-8');
  const diffEditorRef = useRef<DiffEditorInstance | null>(null);
  const diffUpdateDisposableRef = useRef<{ dispose?: () => void } | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetchTaskExecCodeDiffs(synapseApiBase, roomId);
      const rows = Array.isArray(res.files) ? res.files : [];
      setFiles(rows);
      setSummary(res.summary || {});
      setActiveId((prev) => {
        if (prev && rows.some((f) => f.id === prev)) return prev;
        return rows[0]?.id || '';
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : '加载代码差异失败');
      setFiles([]);
      setSummary({});
      setActiveId('');
    } finally {
      setLoading(false);
    }
  }, [roomId, synapseApiBase]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(
    () => () => {
      diffUpdateDisposableRef.current?.dispose?.();
      diffUpdateDisposableRef.current = null;
    },
    [],
  );

  const activeFile = useMemo(
    () => files.find((f) => f.id === activeId) || files[0] || null,
    [activeId, files],
  );

  const activeDiffText = useMemo(() => {
    if (!activeFile) return { original: '', modified: '' };
    return decodeDiffFileText(activeFile, textEncoding);
  }, [activeFile, textEncoding]);

  const modifiedMissing =
    Boolean(activeFile) &&
    String(activeFile?.status || '').toLowerCase() !== 'deleted' &&
    !activeDiffText.modified.trim();

  return (
    <div className="relative overflow-hidden rounded-2xl border border-cyan-500/25 bg-gradient-to-br from-slate-900/90 via-slate-900/70 to-cyan-950/20 p-4 shadow-[0_8px_32px_rgba(34,211,238,0.08)]">
      <div className="pointer-events-none absolute -right-6 -top-6 h-24 w-24 rounded-full bg-cyan-400/10 blur-2xl" />
      <div className="relative mb-3 flex items-center justify-between gap-3">
        <p className="mb-0 text-[11px] text-muted-foreground">
          基于 git diff（相对 HEAD），已过滤测试文件、synapse_archive 与 AGENTS.md
        </p>
        <div className="flex shrink-0 items-center gap-3 text-[11px] text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            <GitBranch className="h-3 w-3 text-cyan-400" />
            {summary.file_count ?? files.length} 个文件
          </span>
          <span className="inline-flex items-center gap-1 text-emerald-300">
            <Plus className="h-3 w-3" />
            {summary.additions ?? 0}
          </span>
          <span className="inline-flex items-center gap-1 text-rose-300">
            <Minus className="h-3 w-3" />
            {summary.deletions ?? 0}
          </span>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center gap-2 py-16 text-muted-foreground text-sm">
          <Loader2 className="h-4 w-4 animate-spin" />
          正在采集 git diff…
        </div>
      ) : error ? (
        <Alert type="error" showIcon message={error} className="text-[11px]" />
      ) : files.length === 0 ? (
        <Alert type="info" showIcon message="未检测到可展示的代码变更" className="text-[11px]" />
      ) : (
        <div className="relative flex min-h-[520px] flex-col gap-2">
          <div className="overflow-x-auto custom-scrollbar rounded-xl border border-white/10 bg-black/25 px-2 py-1.5">
            <div className="flex min-w-max items-center gap-1.5">
              {files.map((file) => {
                const active = file.id === activeFile?.id;
                const name = fileBaseName(file.path);
                return (
                  <button
                    key={file.id}
                    type="button"
                    title={fileTooltip(file)}
                    className={`inline-flex shrink-0 items-center gap-1.5 rounded-md border px-2 py-0.5 text-left transition-colors ${
                      active
                        ? 'border-cyan-400/35 bg-cyan-500/15'
                        : 'border-white/10 bg-black/20 hover:bg-white/5'
                    }`}
                    onClick={() => setActiveId(file.id)}
                  >
                    <span className="max-w-[12rem] truncate text-[11px] font-medium text-foreground">
                      {name}
                    </span>
                    <span className="text-[10px] text-muted-foreground">{statusLabel(file.status)}</span>
                    <span className="text-[10px] text-emerald-300/90">+{file.additions ?? 0}</span>
                    <span className="text-[10px] text-rose-300/90">-{file.deletions ?? 0}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="min-h-0 flex flex-1 flex-col rounded-xl border border-white/10 bg-black/25 overflow-hidden">
            {activeFile ? (
              <>
                <div className="flex items-center justify-between gap-2 border-b border-white/10 px-3 py-2">
                  <code className="min-w-0 flex-1 truncate text-[11px] text-cyan-100/90" title={activeFile.path}>
                    {activeFile.path}
                  </code>
                  <div className="flex shrink-0 items-center gap-2">
                    <div className="inline-flex items-center gap-1.5">
                      <span className="text-[10px] text-muted-foreground">字符集</span>
                      <Segmented
                        size="small"
                        className="rd-task-exec-encoding-segmented"
                        value={textEncoding}
                        options={DIFF_TEXT_ENCODINGS.map((item) => ({
                          label: item.label,
                          value: item.value,
                        }))}
                        onChange={(value) => setTextEncoding(value as DiffTextEncoding)}
                      />
                    </div>
                    <span className="rounded-full border border-white/10 px-2 py-0.5 text-[10px] text-muted-foreground">
                      {statusLabel(activeFile.status)}
                    </span>
                  </div>
                </div>

                {modifiedMissing ? (
                  <Alert
                    type="warning"
                    showIcon
                    className="mx-3 mt-2 text-[11px]"
                    message="未读取到变更后内容，可切换字符集；若仍为空请确认后端已重启并检查沙箱 git 状态"
                  />
                ) : null}

                <div className="flex shrink-0 items-center gap-3 border-b border-white/10 bg-black/20 px-3 py-1.5 text-[10px] text-muted-foreground">
                  <span className="inline-flex items-center gap-1.5">
                    <span className="inline-block h-2.5 w-2.5 rounded-sm bg-[#8b3030]/80" />
                    红色 = 删除
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <span className="inline-block h-2.5 w-2.5 rounded-sm bg-[#3d6b45]/70" />
                    绿色 = 新增 / 变更
                  </span>
                </div>

                <div className="rd-task-exec-diff-editor rd-task-exec-diff-inline min-h-[460px] flex-1">
                  <DiffEditor
                    key={`${activeFile.id}-${textEncoding}`}
                    original={activeDiffText.original}
                    modified={activeDiffText.modified}
                    language={activeFile.language || 'plaintext'}
                    theme={taskExecDiffTheme(isDark)}
                    originalEditable={false}
                    beforeMount={registerTaskExecDiffThemes}
                    loading={
                      <div
                        className="flex items-center justify-center gap-2 text-muted-foreground text-sm"
                        style={{ height: EDITOR_HEIGHT }}
                      >
                        <Loader2 className="h-4 w-4 animate-spin" />
                        加载差异对比…
                      </div>
                    }
                    onMount={(editor) => {
                      const diffEditor = editor as DiffEditorInstance;
                      diffEditorRef.current = diffEditor;
                      diffUpdateDisposableRef.current?.dispose?.();

                      const noWrap = { readOnly: true, wordWrap: 'off' as const };
                      diffEditor.getOriginalEditor?.()?.updateOptions?.(noWrap);
                      diffEditor.getModifiedEditor?.()?.updateOptions?.(noWrap);

                      diffUpdateDisposableRef.current = bindDiffCenterScroll(diffEditor) ?? null;
                    }}
                    options={DIFF_EDITOR_OPTIONS}
                    height={`${EDITOR_HEIGHT}px`}
                  />
                </div>
              </>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
}
