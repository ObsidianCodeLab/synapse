/**
 * 需求设计阶段产出物：顶部多文件切换 · 左侧 Markdown 文档目录 · 右侧可滚动正文
 */
import React, { useMemo } from 'react';

import { type SolutionReviewArtifactInput } from '../../../api/meetingRoomService';
import { MarkdownArtifactsPanel } from './MarkdownArtifactsPanel';

function fileNameFromPath(relativePath: string, fallback: string): string {
  const norm = relativePath.replace(/\\/g, '/').replace(/\/+/g, '/').replace(/^\/+/, '');
  const idx = norm.lastIndexOf('/');
  return idx < 0 ? norm || fallback : norm.slice(idx + 1) || fallback;
}

export const Stage2ArtifactsPanel: React.FC<{
  artifacts: SolutionReviewArtifactInput[] | undefined;
  synapseApiBase: string;
  roomId: string;
}> = ({ artifacts, synapseApiBase, roomId }) => {
  const files = useMemo(() => {
    const list = (artifacts ?? []).filter((a) => a.included !== false && a.relative_path);
    return list.map((meta) => {
      const relative_path = String(meta.relative_path).trim();
      return {
        relative_path,
        fileName: fileNameFromPath(relative_path, meta.artifact || relative_path),
      };
    });
  }, [artifacts]);

  return (
    <MarkdownArtifactsPanel
      files={files}
      synapseApiBase={synapseApiBase}
      roomId={roomId}
      emptyMessage="暂无已纳入评审的需求设计产出物"
    />
  );
};
