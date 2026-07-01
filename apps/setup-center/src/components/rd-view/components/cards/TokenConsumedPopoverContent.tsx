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
import { ModelAxisTick, MODEL_AXIS_LABEL_MAX_LEN } from '@rd-view/components/charts/ModelAxisTick';
import { useDashboard } from '@rd-view/context/DashboardContext';
import { useRdViewColors } from '@rd-view/theme';
import type { ModelTokenUsageView } from '@rd-view/types';
import {
  formatCostYuan,
  formatTokenTick,
  formatUnitPrice,
} from '@rd-view/utils/tokenConsumption';

/** 弹层宽度按 10 个模型一次性排开，超过才横向滚动 */
const POPOVER_TARGET_MODELS = 10;
const SCROLLABLE_MODEL_THRESHOLD = 11;
const CHART_PLOT_HEIGHT = 220;
const X_AXIS_HEIGHT = 88;
const CHART_HEIGHT = CHART_PLOT_HEIGHT + X_AXIS_HEIGHT;
const CHART_MARGIN = { top: 12, right: 16, left: 8, bottom: 4 };
const MODEL_LABEL_ANGLE = -42;
const COST_COLOR = '#165DFF';
const TOKEN_COLOR = '#FF7D00';
const DARK_TICK_FILL = '#F2F3F7';

function TokenTooltip({
  active,
  payload,
  tooltipStyle,
}: {
  active?: boolean;
  payload?: Array<{ payload?: ModelTokenUsageView }>;
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
      <div style={{ fontWeight: 600, marginBottom: 4, color: tooltipStyle.color }}>
        {row.model}
      </div>
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
  const scrollable = modelCount > SCROLLABLE_MODEL_THRESHOLD;
  const categoryWidth = scrollable
    ? 96
    : Math.floor(928 / POPOVER_TARGET_MODELS);
  const chartWidth = scrollable ? modelCount * categoryWidth : '100%';
  const xTickFontSize = modelCount > 8 ? 10 : 11;
  const barSize = Math.min(
    40,
    Math.max(22, Math.round(categoryWidth * 0.42)),
  );
  const barCategoryGap = modelCount > 8 ? '10%' : modelCount > 4 ? '14%' : '18%';

  return (
    <div className="efficiency-popover token-consumed-popover">
      <div className="efficiency-popover-header">Token消耗明细</div>
      <div className="token-consumed-plot">
        <div className="cost-analysis-axis-labels token-consumed-axis-labels">
          <span className="cost-analysis-axis-label cost-analysis-axis-label--cost">成本(¥)</span>
          <span className="cost-analysis-axis-label cost-analysis-axis-label--token">Token消耗</span>
        </div>
        <div
          className={`token-consumed-chart-wrap${scrollable ? ' token-consumed-chart-wrap--scroll' : ''}`}
          style={{ height: CHART_HEIGHT }}
        >
          <div
            className="token-consumed-chart-inner"
            style={scrollable ? { width: chartWidth } : undefined}
          >
            <ResponsiveContainer width={chartWidth} height={CHART_HEIGHT}>
              <ComposedChart
                data={chartData}
                margin={CHART_MARGIN}
                barCategoryGap={barCategoryGap}
              >
                <CartesianGrid strokeDasharray="3 3" stroke={chart.grid} vertical={false} />
                <XAxis
                  dataKey="model"
                  tick={(props) => (
                    <ModelAxisTick
                      {...props}
                      fill={tickFill}
                      fontSize={xTickFontSize}
                      textAnchor="end"
                      angle={MODEL_LABEL_ANGLE}
                      dx={0}
                      dy={12}
                      maxLabelLen={MODEL_AXIS_LABEL_MAX_LEN}
                    />
                  )}
                  axisLine={false}
                  tickLine={false}
                  interval={0}
                  height={X_AXIS_HEIGHT}
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
        实际成本 = 使用量 × 定价（元/百万Token），按实际成本从高到低排列
      </div>
    </div>
  );
}
