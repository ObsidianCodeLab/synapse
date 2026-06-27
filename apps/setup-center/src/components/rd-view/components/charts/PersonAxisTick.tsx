import { formatPersonDisplayName } from '@rd-view/utils/personName';

interface PersonAxisTickProps {
  x?: number;
  y?: number;
  payload?: { value?: string };
  fill?: string;
  fontSize?: number;
  textAnchor?: 'end' | 'middle' | 'start';
  dx?: number;
  dy?: number;
  angle?: number;
}

/** Recharts 坐标轴：姓名仅展示末 2 字，SVG title 悬停显示全名 */
export function PersonAxisTick({
  x = 0,
  y = 0,
  payload,
  fill = 'currentColor',
  fontSize = 11,
  textAnchor = 'end',
  dx = -4,
  dy = 4,
  angle = 0,
}: PersonAxisTickProps) {
  const full = String(payload?.value ?? '').trim() || '—';
  const short = formatPersonDisplayName(full);
  const rotate = angle ? ` rotate(${angle})` : '';

  return (
    <g transform={`translate(${x},${y})${rotate}`}>
      <title>{full}</title>
      <text dx={dx} dy={dy} textAnchor={textAnchor} fill={fill} fontSize={fontSize}>
        {short}
      </text>
    </g>
  );
}
