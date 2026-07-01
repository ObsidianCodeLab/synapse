/** 坐标轴展示：保留完整路径前缀，超长从尾部省略（保留开头）；maxLen 为可见字符上限（含省略号） */
export function formatModelAxisLabel(model: string, maxLen = 18): string {
  const raw = String(model ?? '').trim();
  if (!raw) return '—';
  if (maxLen <= 0 || raw.length <= maxLen) return raw;
  return `${raw.slice(0, maxLen - 1)}…`;
}

interface ModelAxisTickProps {
  x?: number;
  y?: number;
  payload?: { value?: string };
  fill?: string;
  fontSize?: number;
  textAnchor?: 'end' | 'middle' | 'start';
  dx?: number;
  dy?: number;
  angle?: number;
  /** 可见字符上限（含省略号）；≤0 不截断 */
  maxLabelLen?: number;
}

export const MODEL_AXIS_LABEL_MAX_LEN = 18;

/** Recharts X 轴：完整路径前缀 + 超长尾部省略，悬停 title 见全名 */
export function ModelAxisTick({
  x = 0,
  y = 0,
  payload,
  fill = 'currentColor',
  fontSize = 10,
  textAnchor = 'end',
  dx = -4,
  dy = 8,
  angle = -38,
  maxLabelLen = MODEL_AXIS_LABEL_MAX_LEN,
}: ModelAxisTickProps) {
  const full = String(payload?.value ?? '').trim() || '—';
  const label = formatModelAxisLabel(full, maxLabelLen);
  const rotate = angle ? ` rotate(${angle})` : '';

  return (
    <g transform={`translate(${x},${y})${rotate}`}>
      <title>{full}</title>
      <text dx={dx} dy={dy} textAnchor={textAnchor} fill={fill} fontSize={fontSize}>
        {label}
      </text>
    </g>
  );
}
