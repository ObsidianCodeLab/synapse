import { useState, type CSSProperties } from 'react';
import {
  RightOutlined,
  DownOutlined,
  FileTextOutlined,
  CodeOutlined,
  FolderOutlined,
} from '@ant-design/icons';
import { SOP_NODES } from '@rd-view/constants/sopNodes';
import { RD_VIEW_RUN_STATUS_LABEL } from '@rd-view/data/buildOrderEfficiencyDetail';
import type { RequirementStatus, SopNodeOutput, SopNodeRepoOutput, SopNodeRunStatus, WorkOrderSopNode } from '@rd-view/types';

const RUN_STATUS_CONFIG: Record<SopNodeRunStatus, { label: string; color: string }> = {
  running: { label: RD_VIEW_RUN_STATUS_LABEL.running, color: 'processing' },
  human_intervention: { label: RD_VIEW_RUN_STATUS_LABEL.human_intervention, color: 'warning' },
  failed: { label: RD_VIEW_RUN_STATUS_LABEL.failed, color: 'error' },
  stopped: { label: RD_VIEW_RUN_STATUS_LABEL.stopped, color: 'default' },
  completed: { label: RD_VIEW_RUN_STATUS_LABEL.completed, color: 'success' },
  pending: { label: RD_VIEW_RUN_STATUS_LABEL.pending, color: 'default' },
  full_manual: { label: RD_VIEW_RUN_STATUS_LABEL.full_manual, color: 'warning' },
  archived: { label: RD_VIEW_RUN_STATUS_LABEL.archived, color: 'default' },
  lost: { label: RD_VIEW_RUN_STATUS_LABEL.lost, color: 'warning' },
};

const SOP_GROUP_KEYS = SOP_NODES.map((node) => node.key);
const SOP_GROUP_LABELS = Object.fromEntries(SOP_NODES.map((node) => [node.key, node.label]));

const SOP_TIMELINE_COLORS = {
  success: '#00B42A',
  error: '#F53F3F',
  default: '#86909C',
} as const;

type SopTimelineTone = keyof typeof SOP_TIMELINE_COLORS;

function isNodeAbnormal(node: WorkOrderSopNode): boolean {
  return node.runStatus === 'failed';
}

function isNodeCompleted(node: WorkOrderSopNode): boolean {
  return node.runStatus === 'completed' || node.status === 'completed';
}

/** 小类圆点：看自身 status / runStatus */
function resolveNodeDotTone(node: WorkOrderSopNode): SopTimelineTone {
  if (isNodeAbnormal(node)) return 'error';
  if (isNodeCompleted(node)) return 'success';
  return 'default';
}

/** 大类圆点：汇总所有小类 */
function resolveGroupDotTone(nodes: WorkOrderSopNode[]): SopTimelineTone {
  if (nodes.some(isNodeAbnormal)) return 'error';
  if (nodes.length > 0 && nodes.every(isNodeCompleted)) return 'success';
  return 'default';
}

function buildTimelineStyle(
  dotTone: SopTimelineTone,
  connectorTone?: SopTimelineTone,
): CSSProperties {
  return {
    '--sop-node-color': SOP_TIMELINE_COLORS[dotTone],
    '--sop-connector-color': SOP_TIMELINE_COLORS[connectorTone ?? dotTone],
  } as CSSProperties;
}

function isValidSopGroup(group: string): group is (typeof SOP_GROUP_KEYS)[number] {
  return (SOP_GROUP_KEYS as readonly string[]).includes(group);
}

function groupSopNodesByCategory(nodes: WorkOrderSopNode[]) {
  const visible = nodes.filter((node) => node.status !== 'pending');
  const buckets = new Map<string, WorkOrderSopNode[]>();

  for (const node of visible) {
    const groupKey = node.group?.trim() ?? '';
    if (!isValidSopGroup(groupKey)) continue;
    const list = buckets.get(groupKey) ?? [];
    list.push(node);
    buckets.set(groupKey, list);
  }

  return SOP_GROUP_KEYS.filter((key) => buckets.has(key)).map((key) => ({
    key,
    label: SOP_GROUP_LABELS[key] ?? key,
    nodes: (buckets.get(key) ?? []).slice().sort((a, b) => a.seqId - b.seqId),
  }));
}

function formatHours(hours: number): string {
  if (!Number.isFinite(hours) || hours <= 0) return '0h';
  const rounded = Math.round(hours * 10) / 10;
  return `${rounded}h`;
}

function OutputIcon({ type }: { type: SopNodeOutput['type'] }) {
  if (type === 'code') return <CodeOutlined />;
  if (type === 'document') return <FileTextOutlined />;
  return <FolderOutlined />;
}

function SopRepoOutputList({ repos }: { repos: SopNodeRepoOutput[] }) {
  return (
    <div className="work-order-sop-repo-outputs">
      {repos.map((repo, index) => (
        <div key={`${repo.repoName}-${repo.branch}-${index}`} className="work-order-sop-repo-output">
          <div className="work-order-sop-repo-output-header">
            <CodeOutlined className="work-order-sop-repo-output-icon" />
            <span className="work-order-sop-repo-output-name" title={repo.repoName}>
              {repo.repoName}
            </span>
            {repo.branch ? (
              <span className="work-order-sop-repo-output-branch">{repo.branch}</span>
            ) : null}
          </div>
          <div className="work-order-sop-repo-output-stats">
            <span className="work-order-sop-repo-stat work-order-sop-repo-stat--added">
              新增 {repo.linesAdded}
            </span>
            <span className="work-order-sop-repo-stat work-order-sop-repo-stat--deleted">
              删除 {repo.linesDeleted}
            </span>
            <span className="work-order-sop-repo-stat work-order-sop-repo-stat--commits">
              提交 {repo.commitCount} 次
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}

interface SopSubNodeItemProps {
  node: WorkOrderSopNode;
  dotTone: SopTimelineTone;
}

function SopSubNodeItem({ node, dotTone }: SopSubNodeItemProps) {
  const documents = node.outputs.filter((output) => output.type === 'document');
  const displayOutputs = documents.length > 0 ? documents : node.outputs;
  const hasDocuments = displayOutputs.length > 0;
  const hasRepoOutputs = node.repoOutputs.length > 0;
  const hasAnyOutput = hasDocuments || hasRepoOutputs;

  return (
    <div
      className={`work-order-sop-sub-node work-order-sop-sub-node--${dotTone}`}
      style={buildTimelineStyle(dotTone)}
    >
      <span className="work-order-sop-sub-node-branch" aria-hidden />
      <div className="work-order-sop-sub-node-body">
        <div className="work-order-sop-sub-node-header">
          <span className="work-order-sop-sub-node-name">{node.name}</span>
          <span className="work-order-sop-sub-node-meta">
            <span className="work-order-sop-sub-node-model">{node.model || '—'}</span>
            <span className="work-order-sop-sub-node-hours">{formatHours(node.hours)}</span>
          </span>
        </div>
        {hasAnyOutput ? (
          <div className="work-order-sop-sub-node-outputs">
            {hasDocuments && (
              <div className="work-order-sop-outputs">
                {displayOutputs.map((output) => (
                  <button
                    key={output.label}
                    type="button"
                    className="work-order-sop-output"
                    title={output.label}
                  >
                    <OutputIcon type={output.type} />
                    <span className="work-order-sop-output-label">{output.label}</span>
                  </button>
                ))}
              </div>
            )}
            {hasRepoOutputs && <SopRepoOutputList repos={node.repoOutputs} />}
          </div>
        ) : (
          <div className="work-order-sop-sub-node-empty-docs">暂无产出</div>
        )}
      </div>
    </div>
  );
}

interface SopGroupSectionProps {
  groupKey: string;
  label: string;
  nodes: WorkOrderSopNode[];
  expanded: boolean;
  isLast: boolean;
  dotTone: SopTimelineTone;
  connectorTone?: SopTimelineTone;
  onToggle: () => void;
}

function SopGroupSection({
  groupKey,
  label,
  nodes,
  expanded,
  isLast,
  dotTone,
  connectorTone,
  onToggle,
}: SopGroupSectionProps) {
  return (
    <div
      className={`work-order-sop-group-node work-order-sop-group-node--${dotTone}${isLast ? '' : ' work-order-sop-group-node--connected'}${connectorTone ? ` work-order-sop-group-node--connector-${connectorTone}` : ''}`}
      style={buildTimelineStyle(dotTone, connectorTone)}
      data-group={groupKey}
    >
      <div className={`work-order-sop-group${expanded ? ' work-order-sop-group--expanded' : ''}`}>
        <button
          type="button"
          className="work-order-sop-group-header"
          onClick={onToggle}
          aria-expanded={expanded}
        >
          <span className="work-order-sop-group-header-icon">
            {expanded ? <DownOutlined /> : <RightOutlined />}
          </span>
          <span className="work-order-sop-group-header-label">{label}</span>
          <span className="work-order-sop-group-header-count">{nodes.length} 项</span>
        </button>
        {expanded && (
          <div className="work-order-sop-group-items">
            {nodes.map((node) => (
              <SopSubNodeItem
                key={node.key}
                node={node}
                dotTone={resolveNodeDotTone(node)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

interface SopCompletionNodeProps {
  completed: boolean;
}

function SopCompletionNode({ completed }: SopCompletionNodeProps) {
  const dotTone: SopTimelineTone = completed ? 'success' : 'default';

  return (
    <div
      className={`work-order-sop-completion-node work-order-sop-completion-node--${dotTone}`}
      style={buildTimelineStyle(dotTone)}
    >
      <span className="work-order-sop-completion-label">完成</span>
    </div>
  );
}

interface WorkOrderSopTimelineProps {
  nodes: WorkOrderSopNode[];
  orderStatus?: RequirementStatus;
}

export function WorkOrderSopTimeline({ nodes, orderStatus }: WorkOrderSopTimelineProps) {
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(() => new Set());
  const groups = groupSopNodesByCategory(nodes);
  const isOrderCompleted = orderStatus === 'completed';
  const completionTone: SopTimelineTone = isOrderCompleted ? 'success' : 'default';

  if (groups.length === 0) {
    return <div className="work-order-sop-empty">未完成整个 SOP 流程 不展示</div>;
  }

  const toggleGroup = (groupKey: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(groupKey)) {
        next.delete(groupKey);
      } else {
        next.add(groupKey);
      }
      return next;
    });
  };

  return (
    <div className="work-order-sop-timeline">
      {groups.map((group, index) => (
        <SopGroupSection
          key={group.key}
          groupKey={group.key}
          label={group.label}
          nodes={group.nodes}
          expanded={expandedGroups.has(group.key)}
          isLast={false}
          dotTone={resolveGroupDotTone(group.nodes)}
          connectorTone={
            index < groups.length - 1
              ? resolveGroupDotTone(groups[index + 1].nodes)
              : completionTone
          }
          onToggle={() => toggleGroup(group.key)}
        />
      ))}
      <SopCompletionNode completed={isOrderCompleted} />
    </div>
  );
}

export { RUN_STATUS_CONFIG };
