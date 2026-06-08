import React, { useState } from 'react';
import { Table, Progress, Typography, Tooltip, Avatar } from 'antd';
import { TrophyOutlined, CaretUpOutlined, CaretDownOutlined } from '@ant-design/icons';
import { PersonnelItem, Dimension } from "./mockData";

const { Text } = Typography;

interface PersonnelTableProps {
  data: PersonnelItem[];
  dimension: Dimension;
}

const formatTokens = (v: number) => {
  if (v >= 1000000) return (v / 1000000).toFixed(2) + 'M';
  if (v >= 1000) return (v / 1000).toFixed(1) + 'K';
  return String(v);
};

const QualityBar: React.FC<{ value: number }> = ({ value }) => {
  const color = value >= 95 ? '#52c41a' : value >= 88 ? '#13c2c2' : value >= 80 ? '#1677ff' : '#fa8c16';
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 80 }}>
      <Progress
        percent={value}
        size="small"
        strokeColor={color}
        trailColor="var(--bg-subtle)"
        showInfo={false}
        style={{ flex: 1, margin: 0 }}
      />
      <span style={{ color, fontSize: 11, fontWeight: 600, width: 28 }}>{value}</span>
    </div>
  );
};

const RankBadge: React.FC<{ rank: number }> = ({ rank }) => {
  if (rank === 1) return <TrophyOutlined style={{ color: '#fadb14', fontSize: 14 }} />;
  if (rank === 2) return <TrophyOutlined style={{ color: '#c0c0c0', fontSize: 13 }} />;
  if (rank === 3) return <TrophyOutlined style={{ color: '#cd7f32', fontSize: 12 }} />;
  return <span style={{ color: 'var(--muted2)', fontSize: 11 }}>{rank}</span>;
};

export const PersonnelTable: React.FC<PersonnelTableProps> = ({ data, dimension }) => {
  const [sortKey, setSortKey] = useState<string>('efficiency');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  const sorted = [...data].sort((a, b) => {
    const av = (a as any)[sortKey];
    const bv = (b as any)[sortKey];
    return sortDir === 'desc' ? bv - av : av - bv;
  });

  const handleSort = (key: string) => {
    if (sortKey === key) setSortDir(d => d === 'desc' ? 'asc' : 'desc');
    else { setSortKey(key); setSortDir('desc'); }
  };

  const SortHeader: React.FC<{ label: string; k: string }> = ({ label, k }) => (
    <div
      style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 2, userSelect: 'none' }}
      onClick={() => handleSort(k)}
    >
      <span style={{ color: sortKey === k ? 'var(--primary)' : 'var(--muted)', fontSize: 11 }}>{label}</span>
      <div style={{ display: 'flex', flexDirection: 'column', gap: -2 }}>
        <CaretUpOutlined style={{ fontSize: 8, color: sortKey === k && sortDir === 'asc' ? 'var(--primary)' : 'var(--muted2)' }} />
        <CaretDownOutlined style={{ fontSize: 8, color: sortKey === k && sortDir === 'desc' ? 'var(--primary)' : 'var(--muted2)', marginTop: -4 }} />
      </div>
    </div>
  );

  const columns = [
    {
      title: <span style={{ color: 'var(--muted)', fontSize: 11 }}>排名</span>,
      key: 'rank',
      width: 40,
      render: (_: any, __: any, index: number) => <RankBadge rank={index + 1} />,
    },
    {
      title: <span style={{ color: 'var(--muted)', fontSize: 11 }}>姓名</span>,
      key: 'name',
      render: (_: any, record: PersonnelItem) => (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Avatar size={26} style={{ background: record.avatarColor, fontSize: 12, flexShrink: 0 }}>
            {record.name[0]}
          </Avatar>
          <div>
            <div style={{ color: 'var(--text)', fontSize: 12, fontWeight: 500 }}>{record.name}</div>
            <div style={{ color: 'var(--muted2)', fontSize: 10 }}>{record.employeeId}</div>
          </div>
        </div>
      ),
    },
    {
      title: <SortHeader label="Token" k="tokens" />,
      key: 'tokens',
      render: (_: any, record: PersonnelItem) => (
        <Tooltip title={record.tokens.toLocaleString()}>
          <span style={{ color: 'var(--warning)', fontSize: 12, fontWeight: 500 }}>
            {formatTokens(record.tokens)}
          </span>
        </Tooltip>
      ),
    },
    {
      title: <SortHeader label="任务" k="tasks" />,
      key: 'tasks',
      render: (_: any, record: PersonnelItem) => (
        <span style={{ color: 'var(--brand2)', fontSize: 12 }}>{record.tasks}</span>
      ),
    },
    {
      title: <SortHeader label="需求" k="requirements" />,
      key: 'requirements',
      render: (_: any, record: PersonnelItem) => (
        <span style={{ color: 'var(--primary)', fontSize: 12 }}>{record.requirements}</span>
      ),
    },
    {
      title: <SortHeader label="文档" k="docs" />,
      key: 'docs',
      render: (_: any, record: PersonnelItem) => (
        <span style={{ color: 'var(--brand)', fontSize: 12 }}>{record.docs}</span>
      ),
    },
    {
      title: <SortHeader label="代码质量" k="codeQuality" />,
      key: 'codeQuality',
      width: 100,
      render: (_: any, record: PersonnelItem) => <QualityBar value={record.codeQuality} />,
    },
    {
      title: <SortHeader label="能效" k="efficiency" />,
      key: 'efficiency',
      width: 90,
      render: (_: any, record: PersonnelItem) => <QualityBar value={record.efficiency} />,
    },
  ];

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14, marginTop: 20 }}>
        <div style={{ width: 3, height: 16, background: 'linear-gradient(to bottom, var(--primary), var(--brand2))', borderRadius: 2 }} />
        <Text style={{ color: 'var(--text)', fontSize: 13, fontWeight: 600, letterSpacing: 1 }}>人员横比</Text>
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
      </div>
      <Table
        dataSource={sorted}
        columns={columns}
        pagination={false}
        size="small"
        rowKey="key"
        style={{ background: 'transparent' }}
        scroll={{ x: true }}
        rowClassName={(_, index) => index % 2 === 0 ? 'row-even' : 'row-odd'}
      />
    </div>
  );
};
