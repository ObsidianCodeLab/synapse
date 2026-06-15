/**
 * 节点 / 评审产出物 Markdown 阅读器：多文件切换 · 左侧目录 · 右侧可滚动正文
 * （与方案评审 Stage2ArtifactsPanel 同源，供函数级方案等节点产出复用）
 */
import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { message } from 'antd';
import { FileText, ListOrdered, Loader2 } from 'lucide-react';

import {
  fetchArtifactFile,
  fetchFuncSolutionReview,
  type FuncSolutionReviewPayload,
} from '../../../api/meetingRoomService';
import {
  FuncSolutionReviewPreview,
  isFuncSolutionReviewArtifact,
} from './FuncSolutionReviewPreview';
import {
  collectMarkdownHeadingsFromDom,
  jumpToMarkdownHeading,
  MarkdownToc,
  ReviewMarkdown,
  type MarkdownHeading,
} from './ReviewMarkdown';

export interface MarkdownArtifactFile {
  relative_path: string;
  fileName: string;
}

function fileNameFromPath(relativePath: string, fallback: string): string {
  const norm = relativePath.replace(/\\/g, '/').replace(/\/+/g, '/').replace(/^\/+/, '');
  const idx = norm.lastIndexOf('/');
  return idx < 0 ? norm || fallback : norm.slice(idx + 1) || fallback;
}

export function toMarkdownArtifactFiles(
  files: { relative_path: string; name?: string }[],
): MarkdownArtifactFile[] {
  return files
    .filter((f) => f.relative_path)
    .map((f) => {
      const relative_path = String(f.relative_path).trim();
      return {
        relative_path,
        fileName: f.name?.trim() || fileNameFromPath(relative_path, relative_path),
      };
    });
}

export const MarkdownArtifactsPanel: React.FC<{
  files: MarkdownArtifactFile[];
  synapseApiBase: string;
  roomId: string;
  emptyMessage?: string;
}> = ({
  files,
  synapseApiBase,
  roomId,
  emptyMessage = '暂无可预览的 Markdown 产出物',
}) => {
  const entries = useMemo(() => files.filter((f) => f.relative_path), [files]);
  const filesKey = useMemo(() => entries.map((e) => e.relative_path).join('\0'), [entries]);

  const [activePath, setActivePath] = useState<string | null>(null);
  const [contentByPath, setContentByPath] = useState<Record<string, string>>({});
  const [missingPaths, setMissingPaths] = useState<Set<string>>(() => new Set());
  const [loadingPath, setLoadingPath] = useState<string | null>(null);
  const [funcSolutionPayload, setFuncSolutionPayload] = useState<FuncSolutionReviewPayload | null>(
    null,
  );
  const [funcSolutionMissing, setFuncSolutionMissing] = useState(false);
  const funcSolutionLoadedPathRef = useRef<string | null>(null);
  const previewRef = useRef<HTMLDivElement>(null);

  const activeIsFuncSolutionJson = useMemo(
    () => Boolean(activePath && isFuncSolutionReviewArtifact(activePath)),
    [activePath],
  );

  const content = activePath ? (contentByPath[activePath] ?? '') : '';
  const activeMissing = Boolean(
    activePath &&
      (missingPaths.has(activePath) || (activeIsFuncSolutionJson && funcSolutionMissing)),
  );
  const loading = Boolean(activePath && loadingPath === activePath && !activeMissing);
  const [tocHeadings, setTocHeadings] = useState<MarkdownHeading[]>([]);

  useEffect(() => {
    setContentByPath({});
    setMissingPaths(new Set());
    setFuncSolutionPayload(null);
    setFuncSolutionMissing(false);
    funcSolutionLoadedPathRef.current = null;
  }, [filesKey]);

  useEffect(() => {
    if (!entries.length) {
      setActivePath(null);
      return;
    }
    if (!activePath || !entries.some((e) => e.relative_path === activePath)) {
      setActivePath(entries[0].relative_path);
    }
  }, [entries, activePath]);

  useEffect(() => {
    if (!activePath || !synapseApiBase || !roomId) return;

    if (activeIsFuncSolutionJson) {
      if (funcSolutionLoadedPathRef.current === activePath) return;

      let cancelled = false;
      setLoadingPath(activePath);
      setFuncSolutionPayload(null);
      setFuncSolutionMissing(false);

      void fetchFuncSolutionReview(synapseApiBase, roomId)
        .then((res) => {
          if (cancelled) return;
          funcSolutionLoadedPathRef.current = activePath;
          setFuncSolutionPayload(res.payload);
        })
        .catch(async (err) => {
          if (cancelled) return;
          const msg = err instanceof Error ? err.message : String(err);
          if (msg.includes('func_solution_review_not_found')) {
            try {
              const file = await fetchArtifactFile(synapseApiBase, roomId, activePath);
              const parsed = JSON.parse(file.content) as FuncSolutionReviewPayload;
              if (cancelled) return;
              funcSolutionLoadedPathRef.current = activePath;
              setFuncSolutionPayload(parsed);
              return;
            } catch {
              // fall through to missing
            }
          }
          setFuncSolutionMissing(true);
          if (!msg.includes('func_solution_review_not_found') && !msg.includes('artifact_not_found')) {
            message.error('无法读取函数级方案评审数据');
          }
        })
        .finally(() => {
          if (!cancelled) setLoadingPath(null);
        });
      return () => {
        cancelled = true;
      };
    }

    if (contentByPath[activePath] !== undefined || missingPaths.has(activePath)) return;

    let cancelled = false;
    setLoadingPath(activePath);
    void fetchArtifactFile(synapseApiBase, roomId, activePath)
      .then((file) => {
        if (!cancelled) {
          setContentByPath((prev) => ({ ...prev, [activePath]: file.content }));
        }
      })
      .catch((err) => {
        if (cancelled) return;
        setMissingPaths((prev) => {
          const next = new Set(prev);
          next.add(activePath);
          return next;
        });
        const msg = err instanceof Error ? err.message : String(err);
        if (!msg.includes('artifact_not_found')) {
          message.error('无法读取产出物');
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingPath(null);
      });
    return () => {
      cancelled = true;
    };
  }, [
    activePath,
    activeIsFuncSolutionJson,
    synapseApiBase,
    roomId,
    contentByPath,
    missingPaths,
  ]);

  useLayoutEffect(() => {
    if (loading || activeIsFuncSolutionJson) {
      setTocHeadings([]);
      return;
    }
    const root = previewRef.current;
    if (!root) return;
    const refreshToc = () => setTocHeadings(collectMarkdownHeadingsFromDom(root));
    refreshToc();
    const frame = requestAnimationFrame(refreshToc);
    return () => cancelAnimationFrame(frame);
  }, [content, loading, activePath, activeIsFuncSolutionJson]);

  const jumpToHeading = useCallback((heading: MarkdownHeading) => {
    const container = previewRef.current;
    if (!container) return;
    jumpToMarkdownHeading(container, heading);
  }, []);

  if (!entries.length) {
    return (
      <div className="rounded-xl border border-dashed border-border/50 px-6 py-10 text-center text-muted-foreground text-sm">
        {emptyMessage}
      </div>
    );
  }

  return (
    <div className="rd-stage2-artifacts">
      <header className="rd-stage2-artifacts__file-tabs-wrap">
        <span className="rd-stage2-artifacts__file-tabs-label">文档</span>
        <div className="rd-stage2-artifacts__file-tabs custom-scrollbar">
          {entries.map((e) => {
            const selected = e.relative_path === activePath;
            return (
              <button
                key={e.relative_path}
                type="button"
                className={`rd-stage2-artifacts__file-tab ${selected ? 'rd-stage2-artifacts__file-tab--active' : ''}`}
                onClick={() => setActivePath(e.relative_path)}
                title={e.relative_path}
              >
                <FileText className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate max-w-[200px]">{e.fileName}</span>
              </button>
            );
          })}
        </div>
      </header>

      <div
        className={`rd-stage2-artifacts__body${activeIsFuncSolutionJson ? ' rd-stage2-artifacts__body--structured' : ''}`}
      >
        {activeIsFuncSolutionJson ? null : (
          <aside className="rd-stage2-artifacts__sidebar">
            <div className="rd-stage2-artifacts__sidebar-label">
              <ListOrdered className="h-3.5 w-3.5 inline mr-1 opacity-70" />
              文档目录
            </div>
            <div className="rd-stage2-artifacts__toc custom-scrollbar">
              {loading ? (
                <p className="px-3 py-8 text-center text-[12px] text-muted-foreground">加载目录中…</p>
              ) : (
                <MarkdownToc headings={tocHeadings} onJump={jumpToHeading} />
              )}
            </div>
          </aside>
        )}

        <main className="rd-stage2-artifacts__preview">
          <div className="rd-stage2-artifacts__preview-label">
            {activeIsFuncSolutionJson ? '结构化预览' : '正文'}
          </div>
          <div ref={previewRef} className="rd-stage2-artifacts__preview-body custom-scrollbar">
            {loading ? (
              <div className="flex min-h-[240px] items-center justify-center gap-2 text-muted-foreground">
                <Loader2 className="h-5 w-5 animate-spin text-cyan-400" />
                正在加载…
              </div>
            ) : activeMissing ? (
              <div className="flex min-h-[240px] items-center justify-center px-6 text-center text-sm text-muted-foreground">
                产出物已清理或尚未就绪，请稍候刷新
              </div>
            ) : activeIsFuncSolutionJson && funcSolutionPayload ? (
              <FuncSolutionReviewPreview payload={funcSolutionPayload} />
            ) : (
              <ReviewMarkdown key={activePath ?? 'doc'} content={content} compact normalizeTables />
            )}
          </div>
        </main>
      </div>
    </div>
  );
};
