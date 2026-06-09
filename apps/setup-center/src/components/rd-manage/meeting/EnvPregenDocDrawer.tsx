/**
 * 环境预生成 · 单文档预览抽屉（复用方案评审 Markdown + 目录跳转）
 */
import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Drawer, message } from 'antd';
import { FileText, ListOrdered, Loader2, X } from 'lucide-react';

import { fetchArtifactFile } from '../../../api/meetingRoomService';
import {
  collectMarkdownHeadingsFromDom,
  ReviewMarkdown,
  type MarkdownHeading,
} from './ReviewMarkdown';
import type { EnvPregenDocEntry } from './envPregenDocs';

const MarkdownDocToc: React.FC<{
  headings: MarkdownHeading[];
  onJump: (heading: MarkdownHeading) => void;
}> = ({ headings, onJump }) => {
  const items = headings.filter((h) => h.level >= 1 && h.level <= 6);
  if (!items.length) {
    return (
      <p className="px-3 py-6 text-[12px] text-muted-foreground leading-relaxed">
        当前文档未解析到标题，无法生成目录。
      </p>
    );
  }
  return (
    <ul className="rd-stage2-toc__list">
      {items.map((h, i) => (
        <li key={`${h.slug}-${i}`}>
          <button
            type="button"
            className="rd-stage2-toc__item"
            style={{ paddingLeft: `${8 + (h.level - 1) * 12}px` }}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onJump(h);
            }}
            title={h.text}
          >
            <span className="rd-stage2-toc__level">H{h.level}</span>
            <span className="truncate">{h.text}</span>
          </button>
        </li>
      ))}
    </ul>
  );
};

export const EnvPregenDocDrawer: React.FC<{
  open: boolean;
  doc: EnvPregenDocEntry | null;
  docs: EnvPregenDocEntry[];
  synapseApiBase?: string;
  roomId?: string;
  onClose: () => void;
  onSelectDoc: (doc: EnvPregenDocEntry) => void;
}> = ({ open, doc, docs, synapseApiBase, roomId, onClose, onSelectDoc }) => {
  const previewRef = useRef<HTMLDivElement>(null);
  const [content, setContent] = useState('');
  const [loading, setLoading] = useState(false);
  const [tocHeadings, setTocHeadings] = useState<MarkdownHeading[]>([]);

  const mdDocs = useMemo(
    () => docs.filter((d) => d.isMarkdown),
    [docs],
  );
  const canLoadContent = Boolean(
    doc?.status === 'ok' && doc.isMarkdown && doc.scopeRelativePath && synapseApiBase && roomId,
  );

  useEffect(() => {
    if (!open || !canLoadContent || !doc?.scopeRelativePath) {
      setContent('');
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    void fetchArtifactFile(synapseApiBase, roomId, doc.scopeRelativePath)
      .then((file) => {
        if (!cancelled) setContent(file.content ?? '');
      })
      .catch(() => {
        if (!cancelled) message.error('无法读取文档内容');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, doc, synapseApiBase, roomId, canLoadContent]);

  useLayoutEffect(() => {
    if (loading || !open) {
      setTocHeadings([]);
      return;
    }
    const root = previewRef.current;
    if (!root) return;
    const refresh = () => setTocHeadings(collectMarkdownHeadingsFromDom(root));
    refresh();
    const frame = requestAnimationFrame(refresh);
    return () => cancelAnimationFrame(frame);
  }, [content, loading, open, doc?.id]);

  const jumpToHeading = useCallback((heading: MarkdownHeading) => {
    const container = previewRef.current;
    if (!container) return;
    const headingNodes = container.querySelectorAll('h1,h2,h3,h4,h5,h6');
    let el: HTMLElement | null = null;
    if (heading.index >= 0 && heading.index < headingNodes.length) {
      el = headingNodes[heading.index] as HTMLElement;
    }
    if (!el && heading.slug) {
      try {
        el = container.querySelector(`#${CSS.escape(heading.slug)}`) as HTMLElement | null;
      } catch {
        el = null;
      }
    }
    if (!el) return;
    const top =
      el.getBoundingClientRect().top -
      container.getBoundingClientRect().top +
      container.scrollTop -
      12;
    container.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });
  }, []);

  return (
    <Drawer
      title={null}
      placement="right"
      width="min(920px, 92vw)"
      open={open}
      onClose={onClose}
      destroyOnClose
      closable={false}
      className="rd-env-pregen-drawer"
      styles={{
        wrapper: { height: '100vh' },
        content: { height: '100vh', display: 'flex', flexDirection: 'column' },
        body: {
          padding: 0,
          background: 'transparent',
          flex: 1,
          minHeight: 0,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        },
      }}
    >
      <div className="rd-env-pregen-drawer__shell">
        <header className="rd-env-pregen-drawer__header">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <FileText className="h-4 w-4 text-cyan-400" />
              <span className="truncate">{doc?.fileName || '文档预览'}</span>
            </div>
            <p className="mt-1 text-[11px] text-muted-foreground line-clamp-2">{doc?.purpose}</p>
          </div>
          <button type="button" className="rd-env-pregen-drawer__close" onClick={onClose} aria-label="关闭">
            <X className="h-4 w-4" />
          </button>
        </header>

        {mdDocs.length > 1 ? (
          <div className="rd-stage2-artifacts__file-tabs-wrap rd-env-pregen-drawer__tabs">
            <span className="rd-stage2-artifacts__file-tabs-label">同组文档</span>
            <div className="rd-stage2-artifacts__file-tabs custom-scrollbar">
              {mdDocs.map((item) => {
                const active = item.id === doc?.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    className={`rd-stage2-artifacts__file-tab ${active ? 'rd-stage2-artifacts__file-tab--active' : ''}`}
                    onClick={() => onSelectDoc(item)}
                    title={item.fileName}
                  >
                    <FileText className="h-3.5 w-3.5 shrink-0" />
                    <span className="truncate max-w-[180px]">{item.fileName}</span>
                  </button>
                );
              })}
            </div>
          </div>
        ) : null}

        <div className="rd-stage2-artifacts rd-env-pregen-drawer__preview">
          <div className="rd-stage2-artifacts__body rd-env-pregen-drawer__body">
            <aside className="rd-stage2-artifacts__sidebar">
              <div className="rd-stage2-artifacts__sidebar-label">
                <ListOrdered className="h-3.5 w-3.5 inline mr-1 opacity-70" />
                文档目录
              </div>
              <div className="rd-stage2-artifacts__toc custom-scrollbar">
                {loading ? (
                  <p className="px-3 py-8 text-center text-[12px] text-muted-foreground">加载目录中…</p>
                ) : (
                  <MarkdownDocToc headings={tocHeadings} onJump={jumpToHeading} />
                )}
              </div>
            </aside>
            <main className="rd-stage2-artifacts__preview">
              <div className="rd-stage2-artifacts__preview-label">正文</div>
              <div ref={previewRef} className="rd-stage2-artifacts__preview-body custom-scrollbar">
                {!synapseApiBase || !roomId ? (
                  <p className="px-4 py-8 text-sm text-muted-foreground">缺少会议室上下文，无法加载文档正文。</p>
                ) : doc?.status === 'skipped' ? (
                  <p className="px-4 py-8 text-sm text-muted-foreground">
                    {doc.skipReason || '该产出所属 SOP 环节已关闭或已跳过，无文档内容。'}
                  </p>
                ) : doc?.status === 'missing' ? (
                  <p className="px-4 py-8 text-sm text-muted-foreground">
                    {doc.skipReason || '该产出尚未归档，暂无文档内容。'}
                  </p>
                ) : loading ? (
                  <div className="flex min-h-[280px] items-center justify-center gap-2 text-muted-foreground">
                    <Loader2 className="h-5 w-5 animate-spin text-cyan-400" />
                    正在加载…
                  </div>
                ) : doc?.isMarkdown && content ? (
                  <ReviewMarkdown key={doc.id} content={content} />
                ) : doc?.isMarkdown ? (
                  <p className="px-4 py-8 text-sm text-muted-foreground">无法读取文档内容，请确认文件已落盘。</p>
                ) : (
                  <p className="px-4 py-8 text-sm text-muted-foreground">当前文件非 Markdown，暂不支持预览。</p>
                )}
              </div>
            </main>
          </div>
        </div>
      </div>
    </Drawer>
  );
};
