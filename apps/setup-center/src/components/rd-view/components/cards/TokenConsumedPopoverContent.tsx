import { useMemo } from 'react';
import {
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { useDashboard } from '@rd-view/context/DashboardContext';
import { useRdViewColors } from '@rd-view/theme';
import type { ModelTokenUsageView } from '@rd-view/types';
import {
  formatCostYuan,
  formatTokenTick,
  formatUnitPrice,
} from '@rd-view/utils/tokenConsumption';

const CHART_HEIGHT = 220;
const CHART_MARGIN = { top: 4, right: 8, left: 4, bottom: 6 };
const COST_COLOR = '#165DFF';
const TOKEN_COLOR = '#FF7D00';
const DARK_TICK_FILL = '#F2F3F7';

function TokenTooltip({
  active,
  payload,
  label,
  tooltipStyle,
}: {
  active?: boolean;
  payload?: Array<{ payload?: ModelTokenUsageView }>;
  label?: string | number;
  tooltipStyle: { background: string; border: string; color: string };
}) {
  if (!active || !payload?.length) return null;

  const row = payload[0]?.payload as ModelTokenUsageView | undefined;
  if (!row) return null;

  return (
    <div
      style={{
        background: tooltipStyle.background,
        border: `1px solid ${tooltipStyle.border}`,
        borderRadius: 6,
        padding: '8px 10px',
        fontSize: 10,
      }}
    >
      <div style={{ fontWeight: 600, marginBottom: 4, color: tooltipStyle.color }}>{label}</div>
      <div style={{ color: tooltipStyle.color, opacity: 0.85, marginTop: 2 }}>
        定价：{formatUnitPrice(row.unitPrice)}
      </div>
      <div style={{ color: TOKEN_COLOR, marginTop: 2 }}>
        使用量：{row.tokens.toLocaleString()} Token
      </div>
      <div style={{ color: COST_COLOR, marginTop: 2 }}>
        实际成本：{formatCostYuan(row.cost)}
      </div>
    </div>
  );
}

export function TokenConsumedPopoverContent() {
  const { dashboard } = useDashboard();
  const { chart, palette, isDark } = useRdViewColors();
  const tickFill = isDark ? DARK_TICK_FILL : palette.textSecondary;
  const dotStroke = isDark ? palette.bgCard : '#fff';

  const chartData = useMemo<ModelTokenUsageView[]>(() => (
    dashboard.details.tokenConsumed
      .slice()
      .sort((a, b) => b.cost - a.cost)
  ), [dashboard.details.tokenConsumed]);

  const modelCount = chartData.length;
  const barSize = Math.min(42, Math.max(28, Math.round(CHART_HEIGHT * 0.14)));

  return (
    <div className="efficiency-popover token-consumed-popover">
      <div className="efficiency-popover-header">Token消耗明细</div>
      <div className="token-consumed-plot">
        <div className="cost-analysis-axis-labels token-consumed-axis-labels">
          <span className="cost-analysis-axis-label cost-analysis-axis-label--cost">成本(¥)</span>
          <span className="cost-analysis-axis-label cost-analysis-axis-label--token">Token消耗</span>
        </div>
        <div className="token-consumed-chart-wrap" style={{ height: CHART_HEIGHT }}>
          <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
            <ComposedChart data={chartData} margin={CHART_MARGIN} barCategoryGap={modelCount > 4 ? '12%' : '18%'}>
              <CartesianGrid strokeDasharray="3 3" stroke={chart.grid} vertical={false} />
              <XAxis
                dataKey="model"
                tick={{ fontSize: 11, fill: tickFill }}
                axisLine={false}
                tickLine={false}
                interval={0}
                height={30}
              />
              <YAxis
                yAxisId="cost"
                orientation="left"
                tick={{ fontSize: 10, fill: tickFill, fontWeight: 500 }}
                axisLine={false}
                tickLine={false}
                width={40}
                domain={[0, (max: number) => Math.ceil(max * 1.15 * 100) / 100]}
                tickFormatter={(value) => `${value}`}
              />
              <YAxis
                yAxisId="token"
                orientation="right"
                tick={{ fontSize: 10, fill: tickFill, fontWeight: 500 }}
                tickFormatter={formatTokenTick}
                axisLine={false}
                tickLine={false}
                width={44}
                domain={[0, (max: number) => Math.ceil(max * 1.15)]}
              />
              <Tooltip content={<TokenTooltip tooltipStyle={chart.tooltip} />} />
              <Bar
                yAxisId="cost"
                dataKey="cost"
                name="实际成本"
                fill={COST_COLOR}
                barSize={barSize}
                radius={[3, 3, 0, 0]}
                legendType="none"
              />
              <Line
                yAxisId="token"
                type="monotone"
                dataKey="tokens"
                name="Token消耗"
                stroke="none"
                dot={{ r: 5, fill: TOKEN_COLOR, stroke: dotStroke, strokeWidth: 2 }}
                activeDot={{ r: 6, fill: TOKEN_COLOR, stroke: dotStroke, strokeWidth: 2 }}
                legendType="none"
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
        <div className="cost-analysis-legend">
          <span className="cost-analysis-legend-item cost-analysis-legend-item--cost">
            <span className="cost-analysis-legend-bar" />
            实际成本
          </span>
          <span className="cost-analysis-legend-item cost-analysis-legend-item--token">
            <span className="cost-analysis-legend-dot" />
            Token消耗
          </span>
        </div>
      </div>
      <div className="efficiency-popover-formula">
        实际成本 = 使用量 / 1000 × 定价，按实际成本从高到低排列
      </div>
    </div>
  );
}
