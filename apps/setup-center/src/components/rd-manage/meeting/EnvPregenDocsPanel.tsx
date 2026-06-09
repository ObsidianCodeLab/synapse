/**
 * 环境预生成 · 四类文档卡片面板
 */
import React, { useMemo, useState } from 'react';
import {
  BookOpen,
  Bot,
  ChevronRight,
  FileCode2,
  FileText,
  Layers,
  Sparkles,
} from 'lucide-react';

import { EnvPregenDocDrawer } from './EnvPregenDocDrawer';
import {
  collectEnvPregenDocs,
  ENV_DOC_CATEGORIES,
  envDocStatusLabel,
  groupDocsByCategory,
  type EnvDocCategoryId,
  type EnvPregenDocEntry,
} from './envPregenDocs';

const CATEGORY_ICONS: Record<EnvDocCategoryId, React.ReactNode> = {
  agents: <Bot className="h-5 w-5" />,
  spec: <FileCode2 className="h-5 w-5" />,
  process: <Layers className="h-5 w-5" />,
  product: <BookOpen className="h-5 w-5" />,
};

export const EnvPregenDocsPanel: React.FC<{
  display: Record<string, unknown>;
  scopeId?: string;
  roomId?: string;
  synapseApiBase?: string;
}> = ({ display, scopeId = '', roomId, synapseApiBase }) => {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [activeDoc, setActiveDoc] = useState<EnvPregenDocEntry | null>(null);
  const [activeCategoryDocs, setActiveCategoryDocs] = useState<EnvPregenDocEntry[]>([]);

  const docs = useMemo(
    () => collectEnvPregenDocs(display, scopeId),
    [display, scopeId],
  );
  const grouped = useMemo(() => groupDocsByCategory(docs), [docs]);

  const openDoc = (doc: EnvPregenDocEntry, categoryDocs: EnvPregenDocEntry[]) => {
    setActiveCategoryDocs(categoryDocs);
    setActiveDoc(doc);
    setDrawerOpen(true);
  };

  if (!docs.length) {
    return (
      <div className="rd-env-pregen-empty">
        <Sparkles className="h-5 w-5 text-muted-foreground/60" />
        <p>暂无已落盘的预生成文档，请等待环境预生成完成。</p>
      </div>
    );
  }

  return (
    <>
      <div className="rd-env-pregen-grid">
        {ENV_DOC_CATEGORIES.map((cat) => {
          const items = grouped[cat.id];
          const count = items.length;
          const okCount = items.filter((d) => d.status === 'ok').length;

          return (
            <article
              key={cat.id}
              className={`rd-env-pregen-card ${cat.gradient} ${count ? '' : 'rd-env-pregen-card--empty'}`}
            >
              <div className="rd-env-pregen-card__glow" aria-hidden />
              <header className="rd-env-pregen-card__header">
                <div className={`rd-env-pregen-card__icon ${cat.accent}`}>{CATEGORY_ICONS[cat.id]}</div>
                <div className="min-w-0 flex-1">
                  <h4 className="rd-env-pregen-card__title">{cat.title}</h4>
                  <p className="rd-env-pregen-card__subtitle">{cat.subtitle}</p>
                </div>
                <div className="rd-env-pregen-card__count">
                  <span className="rd-env-pregen-card__count-num">{count}</span>
                  <span className="rd-env-pregen-card__count-label">篇</span>
                </div>
              </header>

              <p className="rd-env-pregen-card__purpose">{cat.purpose}</p>

              {count > 0 ? (
                <ul className="rd-env-pregen-card__list custom-scrollbar">
                  {items.map((doc) => (
                    <li key={doc.id}>
                      <button
                        type="button"
                        className="rd-env-pregen-doc-row"
                        onClick={() => openDoc(doc, items)}
                        title={doc.fileName}
                      >
                        <span className="rd-env-pregen-doc-row__icon">
                          <FileText className="h-3.5 w-3.5" />
                        </span>
                        <span className="rd-env-pregen-doc-row__main">
                          <span className="rd-env-pregen-doc-row__name">
                            {doc.nodeName ? `${doc.nodeName} · ${doc.fileName}` : doc.fileName}
                          </span>
                          <span className="rd-env-pregen-doc-row__desc">{doc.purpose}</span>
                        </span>
                        <span
                          className={`rd-env-pregen-doc-row__status ${
                            doc.status === 'ok' ? 'rd-env-pregen-doc-row__status--ok' : ''
                          } ${
                            doc.status === 'skipped' ? 'rd-env-pregen-doc-row__status--skipped' : ''
                          } ${
                            doc.status === 'missing' ? 'rd-env-pregen-doc-row__status--missing' : ''
                          }`}
                        >
                          {envDocStatusLabel(doc)}
                        </span>
                        <ChevronRight className="h-4 w-4 shrink-0 opacity-40" />
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="rd-env-pregen-card__empty-hint">本类暂无文档</p>
              )}

              {count > 0 && okCount < count ? (
                <footer className="rd-env-pregen-card__footer">
                  {okCount}/{count} 已成功落盘
                </footer>
              ) : null}
            </article>
          );
        })}
      </div>

      <EnvPregenDocDrawer
        open={drawerOpen}
        doc={activeDoc}
        docs={activeCategoryDocs}
        synapseApiBase={synapseApiBase}
        roomId={roomId}
        onClose={() => {
          setDrawerOpen(false);
          setActiveDoc(null);
        }}
        onSelectDoc={setActiveDoc}
      />
    </>
  );
};
