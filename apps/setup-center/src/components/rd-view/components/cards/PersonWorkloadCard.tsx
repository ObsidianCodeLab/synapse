import { useMemo, useState } from 'react';
import { Card, Drawer, Button } from 'antd';
import { BarChartOutlined } from '@ant-design/icons';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { useDashboard } from '@rd-view/context/DashboardContext';
import type { PersonDemandItem } from '@rd-view/types';
import {
  CHART_CARD_BODY_PADDING,
  PERSON_WORKLOAD_DISPLAY_LIMIT,
  getPersonWorkloadBarGap,
  getPersonWorkloadBarSize,
  calcChartPairLayoutRowCount,
  calcPersonWorkloadChartHeight,
} from '@rd-view/constants/chartLayout';
import {
  chartCardTitleIconStyle,
  chartCardTitleStyle,
  chartCardTitleTextStyle,
  dashboardCardStyle,
} from '@rd-view/constants/dashboardTheme';
import { useRdViewColors } from '@rd-view/theme';
import { PersonAxisTick } from '@rd-view/components/charts/PersonAxisTick';

const cardStyle = dashboardCardStyle;

const cardBodyStyle = {
  padding: CHART_CARD_BODY_PADDING,
  flex: 1,
  minHeight: 0,
  display: 'flex',
  flexDirection: 'column' as const,
};

function WorkloadLegend() {
  const { chart } = useRdViewColors();
  const legendItems = [
    { label: '已完成', color: chart.series.completed },
    { label: '进行中', color: chart.series.inProgress },
    { label: '待开始', color: chart.series.pending },
  ];

  return (
    <div className="chart-pair-legend chart-pair-legend--inline">
      {legendItems.map((item) => (
        <div key={item.label} className="chart-pair-legend-item">
          <span className="chart-pair-legend-bar" style={{ background: item.color }} />
          {item.label}
        </div>
      ))}
    </div>
  );
}

interface PersonWorkloadChartProps {
  data: PersonDemandItem[];
  height: number;
}

function PersonWorkloadChart({ data, height }: PersonWorkloadChartProps) {
  const { chart, isDark } = useRdViewColors();
  const rowCount = data.length;
  const barSize = getPersonWorkloadBarSize(rowCount);
  const barGap = getPersonWorkloadBarGap(rowCount);
  const tooltipCursor = isDark
    ? { fill: chart.hoverRow, opacity: 1 }
    : { fill: chart.hoverRow };

  const xMax = useMemo(() => {
    const max = Math.max(...data.map((p) => p.completed + p.inProgress + p.pending), 1);
    return max + 1;
  }, [data]);

  return (
    <div className="chart-pair-chart-block person-workload-chart" style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          layout="vertical"
          data={data}
          barSize={barSize}
          barCategoryGap={barGap}
          margin={{ top: 4, right: 8, left: 0, bottom: 0 }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke={chart.grid} horizontal={false} />
          <XAxis
            type="number"
            domain={[0, xMax]}
            tick={{ fontSize: rowCount > 8 ? 8 : 10, fill: chart.axisTick }}
            axisLine={false}
            tickLine={false}
            allowDecimals={false}
            tickCount={Math.min(xMax + 1, 6)}
          />
          <YAxis
            type="category"
            dataKey="name"
            tick={(props) => (
              <PersonAxisTick
                {...props}
                fill={chart.axisTick}
                fontSize={rowCount > 8 ? 9 : 11}
                textAnchor="end"
                dx={-4}
                dy={4}
              />
            )}
            axisLine={false}
            tickLine={false}
            width={42}
            interval={0}
          />
          <Tooltip
            cursor={tooltipCursor}
            contentStyle={{
              borderRadius: 6,
              border: `1px solid ${chart.tooltip.border}`,
              fontSize: 10,
              background: chart.tooltip.background,
              color: chart.tooltip.color,
            }}
          />
          <Bar dataKey="completed" name="已完成" stackId="stack" fill={chart.series.completed} />
          <Bar dataKey="inProgress" name="进行中" stackId="stack" fill={chart.series.inProgress} />
          <Bar dataKey="pending" name="待开始" stackId="stack" fill={chart.series.pending} radius={[0, 3, 3, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function PersonWorkloadCard() {
  const { dashboard } = useDashboard();
  const personDemandData = dashboard.personWorkload;
  const personDemandPreviewData = useMemo(
    () => personDemandData.slice(0, PERSON_WORKLOAD_DISPLAY_LIMIT),
    [personDemandData],
  );
  const [drawerOpen, setDrawerOpen] = useState(false);
  const totalCount = personDemandData.length;
  const layoutRowCount = calcChartPairLayoutRowCount(personDemandPreviewData.length);
  const previewHeight = calcPersonWorkloadChartHeight(layoutRowCount);
  const fullHeight = calcPersonWorkloadChartHeight(calcChartPairLayoutRowCount(totalCount));
  const showViewAll = totalCount > personDemandPreviewData.length;

  return (
    <>
      <Card
        className="dashboard-card chart-pair-card"
        title={
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
            <div style={chartCardTitleStyle}>
              <BarChartOutlined style={chartCardTitleIconStyle} />
              <span style={chartCardTitleTextStyle}>人员工作量</span>
              <span style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 400 }}>
                Top {personDemandPreviewData.length}
              </span>
            </div>
            {showViewAll && (
              <Button
                type="link"
                size="small"
                style={{ fontSize: 10, padding: 0, height: 'auto' }}
                onClick={() => setDrawerOpen(true)}
              >
                查看全部 ({totalCount})
              </Button>
            )}
          </div>
        }
        styles={{ body: cardBodyStyle }}
        style={cardStyle}
      >
        <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}>
          <PersonWorkloadChart data={personDemandPreviewData} height={previewHeight} />
        </div>
        <WorkloadLegend />
      </Card>

      <Drawer
        title={`人员工作量（共 ${totalCount} 人）`}
        placement="right"
        width={480}
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        rootClassName="person-workload-drawer"
        styles={{ body: { padding: '12px 16px' } }}
      >
        <div className="person-workload-drawer-scroll">
          <PersonWorkloadChart data={personDemandData} height={fullHeight} />
        </div>
        <div style={{ marginTop: 12 }}>
          <WorkloadLegend />
        </div>
      </Drawer>
    </>
  );
}
