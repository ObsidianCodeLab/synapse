import React, { useState } from 'react';
import { Tag, Avatar, Tooltip, Typography, Badge } from 'antd';
import {
  ClockCircleOutlined,
  CodeOutlined,
  FileTextOutlined,
  MessageOutlined,
  BookOutlined,
  ThunderboltOutlined,
  CaretRightOutlined,
  CameraOutlined,
} from '@ant-design/icons';
import { WaterfallNode, Dimension } from "./mockData";

const { Text } = Typography;

interface WaterfallFlowProps {
  nodes: WaterfallNode[];
  dimension: Dimension;
}

const OutputChip: React.FC<{ output: WaterfallNode['outputs'][0] }> = ({ output }) => {
  const isCode = output.type === 'code';
  const color = isCode ? 'var(--brand2)' : 'var(--primary)';
  const bg = isCode ? 'color-mix(in srgb, var(--brand2) 12%, transparent)' : 'color-mix(in srgb, var(--primary) 12%, transparent)';
  const border = isCode ? 'color-mix(in srgb, var(--brand2) 28%, transparent)' : 'color-mix(in srgb, var(--primary) 28%, transparent)';
  return (
    <Tooltip title={isCode ? `${output.language} · ${output.lines} 行` : `${output.pages} 页`}>
      <span style={{
        display: 'inline-flex', alignItems: 'center', gap: 4,
        padding: '2px 8px', borderRadius: 6, fontSize: 11,
        background: bg, border: `1px solid ${border}`, color, cursor: 'default',
      }}>
        {isCode ? <CodeOutlined style={{ fontSize: 10 }} /> : <FileTextOutlined style={{ fontSize: 10 }} />}
        {output.name}
      </span>
    </Tooltip>
  );
};

const SopChip: React.FC<{ sopNode: string }> = ({ sopNode }) => (
  <span style={{
    display: 'inline-flex', alignItems: 'center', gap: 4,
    padding: '1px 8px', borderRadius: 4, fontSize: 10,
    background: 'var(--warn-bg)', border: '1px solid color-mix(in srgb, var(--warning) 35%, transparent)',
    color: 'var(--warning)', flexShrink: 0,
  }}>
    <span style={{
      width: 5, height: 5, borderRadius: '50%', background: 'var(--warning)',
      display: 'inline-block', boxShadow: '0 0 4px color-mix(in srgb, var(--warning) 50%, transparent)',
    }} />
    {sopNode}
  </span>
);

const WaterfallCard: React.FC<{ node: WaterfallNode; index: number }> = ({ node }) => {
  const [expanded, setExpanded] = useState(false);

  return (
    <div style={{
      background: 'var(--card-bg)',
      border: '1px solid var(--border)',
      borderLeft: `3px solid ${node.stageColor}`,
      borderRadius: 12,
      overflow: 'hidden',
      boxShadow: 'var(--shadow)',
    }}>
      {/* Card Header: Product + WorkOrder + Stage */}
      <div style={{
        padding: '10px 14px',
        borderBottom: '1px solid var(--border)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        flexWrap: 'wrap', gap: 6,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          <span style={{
            display: 'inline-flex', alignItems: 'center',
            padding: '2px 9px', borderRadius: 6, fontSize: 11, fontWeight: 600,
            background: '#13c2c222', border: '1px solid #13c2c244',
            color: '#13c2c2',
          }}>
            {node.product}
          </span>
          <span style={{ color: 'var(--muted2)', fontSize: 10 }}>{node.workOrder}</span>
          <span style={{
            padding: '2px 8px', borderRadius: 5, fontSize: 11,
            background: `${node.stageColor}18`, border: `1px solid ${node.stageColor}35`,
            color: node.stageColor,
          }}>
            {node.stage}
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ color: 'var(--muted2)', fontSize: 10 }}>
            <ClockCircleOutlined style={{ marginRight: 3, fontSize: 10 }} />
            {node.startTime}
          </span>
          <span style={{
            padding: '1px 7px', borderRadius: 5, fontSize: 10,
            background: 'var(--bg-subtle)', border: '1px solid var(--border)',
            color: 'var(--muted)',
          }}>
            {node.duration}
          </span>
        </div>
      </div>

      {/* Developer Info Row */}
      <div style={{ padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 10 }}>
        <Avatar size={32} style={{ background: node.avatarColor, fontSize: 12, flexShrink: 0 }}>
          {node.name[0]}
        </Avatar>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap' }}>
            <span style={{ color: 'var(--text)', fontSize: 13, fontWeight: 500 }}>{node.name}</span>
            <span style={{ color: 'var(--muted2)', fontSize: 10 }}>{node.employeeId}</span>
            <span style={{
              padding: '1px 6px', borderRadius: 4, fontSize: 10,
              background: 'var(--nav-hover)', color: 'var(--muted)',
            }}>
              {node.role}
            </span>
            <SopChip sopNode={node.sopNode} />
          </div>
        </div>
        <Tooltip title="本次AI消耗Token">
          <span style={{
            display: 'flex', alignItems: 'center', gap: 3,
            padding: '3px 9px', borderRadius: 8, fontSize: 11,
            background: 'color-mix(in srgb, var(--warning) 14%, transparent)', border: '1px solid color-mix(in srgb, var(--warning) 30%, transparent)',
            color: 'var(--warning)', fontWeight: 600, flexShrink: 0,
          }}>
            <ThunderboltOutlined style={{ fontSize: 10 }} />
            {node.tokensUsed >= 1000
              ? `${(node.tokensUsed / 1000).toFixed(1)}K`
              : String(node.tokensUsed)}
          </span>
        </Tooltip>
      </div>

      {/* Work Summary */}
      <div style={{ padding: '0 14px 10px' }}>
        <div style={{
          background: 'var(--nav-hover)',
          border: '1px solid var(--nav-active-border)',
          borderRadius: 8, padding: '9px 12px',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 6 }}>
            <MessageOutlined style={{ color: 'var(--primary)', fontSize: 11 }} />
            <span style={{ color: 'var(--primary)', fontSize: 11, fontWeight: 600 }}>工作摘要</span>
            {node.aiInteraction.screenshots && node.aiInteraction.screenshots.length > 0 && (
              <span style={{
                display: 'inline-flex', alignItems: 'center', gap: 3,
                marginLeft: 4, padding: '1px 6px', borderRadius: 4, fontSize: 10,
                background: 'var(--ok-bg)', border: '1px solid color-mix(in srgb, var(--success) 30%, transparent)',
                color: 'var(--success)',
              }}>
                <CameraOutlined style={{ fontSize: 9 }} />
                {node.aiInteraction.screenshots.length} 张截图
              </span>
            )}
          </div>
          <Text style={{ color: 'var(--text-secondary)', fontSize: 11.5, lineHeight: 1.65, display: 'block' }}>
            {node.aiInteraction.workSummary}
          </Text>
          {node.aiInteraction.screenshots && node.aiInteraction.screenshots.length > 0 && (
            <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 6 }}>
              {node.aiInteraction.screenshots.map((src, idx) => (
                <img
                  key={idx}
                  src={src}
                  alt={`工作截图 ${idx + 1}`}
                  style={{
                    width: '100%', borderRadius: 6,
                    maxHeight: 150, objectFit: 'cover',
                    border: '1px solid var(--border)',
                    display: 'block',
                  }}
                  onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Personal Notes - Expandable */}
      <div
        style={{ padding: '0 14px', cursor: 'pointer', borderTop: '1px solid var(--border)' }}
        onClick={() => setExpanded(!expanded)}
      >
        <div style={{
          display: 'flex', alignItems: 'center', gap: 5, padding: '7px 0',
          color: expanded ? 'var(--success)' : 'var(--muted)', fontSize: 11,
        }}>
          <CaretRightOutlined style={{
            transform: expanded ? 'rotate(90deg)' : 'none',
            transition: 'transform 0.2s', fontSize: 9,
          }} />
          <BookOutlined style={{ fontSize: 10 }} />
          <span>个人经验笔记</span>
        </div>
        {expanded && (
          <div style={{
            background: 'var(--ok-bg)',
            border: '1px solid color-mix(in srgb, var(--success) 22%, transparent)',
            borderRadius: 8, padding: '9px 12px', marginBottom: 10,
          }}>
            <Text style={{ color: 'var(--success)', fontSize: 11.5, lineHeight: 1.7, display: 'block' }}>
              {node.aiInteraction.personalNotes}
            </Text>
          </div>
        )}
      </div>

      {/* Outputs */}
      <div style={{ padding: '8px 14px 12px', borderTop: '1px solid var(--border)' }}>
        <div style={{ color: 'var(--muted2)', fontSize: 10, marginBottom: 6 }}>📎 输出物</div>
        <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
          {node.outputs.map((out, i) => (
            <OutputChip key={i} output={out} />
          ))}
        </div>
      </div>
    </div>
  );
};

export const WaterfallFlow: React.FC<WaterfallFlowProps> = ({ nodes, dimension }) => {
  if (nodes.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--muted)', fontSize: 14 }}>
        暂无研发活动记录
      </div>
    );
  }

  return (
    <div style={{ padding: '0 16px 16px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
        <div style={{ width: 3, height: 16, background: 'linear-gradient(to bottom, var(--primary), var(--brand2))', borderRadius: 2 }} />
        <Typography.Text style={{ color: 'var(--text)', fontSize: 13, fontWeight: 600, letterSpacing: 1 }}>
          研发活动瀑布流
        </Typography.Text>
        <span style={{
          borderRadius: 8, fontSize: 10, marginLeft: 4,
          padding: '1px 8px',
          background: 'var(--nav-active)',
          border: '1px solid var(--nav-active-border)',
          color: 'var(--primary)',
          fontWeight: 600,
        }}>
          {dimension === 'month' ? '本月' : dimension === 'week' ? '本周' : '本日'}
        </span>
        <Badge
          count={nodes.length}
          style={{ background: 'var(--nav-active)', color: 'var(--primary)', boxShadow: 'none', border: '1px solid var(--nav-active-border)' }}
          showZero
        />
      </div>

      <div className="teamManageMasonry">
        {nodes.map((node, index) => (
          <div key={node.id} className="teamManageMasonryItem">
            <WaterfallCard node={node} index={index} />
          </div>
        ))}
      </div>
    </div>
  );
};