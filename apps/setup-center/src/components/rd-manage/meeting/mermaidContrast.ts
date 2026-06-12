/**
 * Mermaid 对比度修正：处理源码内联 style 浅色节点 + 渲染后 SVG 文字/底色不匹配。
 */

/** 暗色主题下将常见浅色高亮底替换为可读深色底（保留色相） */
const DARK_STYLE_FILL_REMAP: Record<string, string> = {
  '#fff4e1': '#4a3520',
  '#fff9c4': '#4a4220',
  '#e1f5ff': '#1a3d5c',
  '#e8f5e9': '#1a3d28',
  '#fce4ec': '#4a2030',
  '#f3e5f5': '#3d2048',
  '#ffffff': '#334155',
  '#f5f5f5': '#334155',
  '#fafafa': '#334155',
};

const STYLE_LINE_RE =
  /^\s*style\s+(\S+)\s+fill:(#[0-9a-fA-F]{3,8})(.*)$/i;

function expandHex(hex: string): string {
  const h = hex.replace('#', '').toLowerCase();
  if (h.length === 3) {
    return `#${h[0]}${h[0]}${h[1]}${h[1]}${h[2]}${h[2]}`;
  }
  return `#${h.slice(0, 6)}`;
}

/** 暗色 UI 下改写 Mermaid 源码中的浅色 style fill，避免浅底+浅字 */
export function adaptMermaidSourceForTheme(source: string, isDark: boolean): string {
  if (!isDark || !source.trim()) return source;
  return source
    .split('\n')
    .map((line) => {
      const m = STYLE_LINE_RE.exec(line);
      if (!m) return line;
      const [, node, rawFill, rest] = m;
      const key = expandHex(rawFill);
      const mapped = DARK_STYLE_FILL_REMAP[key] || '#334155';
      return `    style ${node} fill:${mapped}${rest}`;
    })
    .join('\n');
}

function parseRgb(raw: string | null | undefined): { r: number; g: number; b: number } | null {
  if (!raw) return null;
  const v = raw.trim();
  if (!v || v === 'none' || v === 'transparent') return null;
  if (v.startsWith('#')) {
    const hex = expandHex(v);
    const n = parseInt(hex.slice(1), 16);
    if (Number.isNaN(n)) return null;
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
  }
  const rgb = /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)/i.exec(v);
  if (rgb) {
    return {
      r: Math.min(255, Math.round(Number(rgb[1]))),
      g: Math.min(255, Math.round(Number(rgb[2]))),
      b: Math.min(255, Math.round(Number(rgb[3]))),
    };
  }
  return null;
}

function luminance(rgb: { r: number; g: number; b: number }): number {
  const f = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * f(rgb.r) + 0.7152 * f(rgb.g) + 0.0722 * f(rgb.b);
}

function textColorForBackground(raw: string | null | undefined): string | null {
  const rgb = parseRgb(raw);
  if (!rgb) return null;
  return luminance(rgb) > 0.52 ? '#0f172a' : '#f8fafc';
}

function shapeFill(el: Element | null): string | null {
  if (!el) return null;
  const attr = el.getAttribute('fill');
  if (attr && attr !== 'none') return attr;
  const style = el.getAttribute('style') || '';
  const m = /fill:\s*([^;]+)/i.exec(style);
  return m ? m[1].trim() : null;
}

function applyTextColor(root: Element, color: string) {
  root.querySelectorAll('text, tspan').forEach((el) => {
    el.setAttribute('fill', color);
    el.removeAttribute('style');
  });
  root.querySelectorAll('foreignObject *').forEach((el) => {
    const node = el as HTMLElement;
    node.style.color = color;
  });
  root.querySelectorAll('.nodeLabel, .edgeLabel, .label').forEach((el) => {
    if (el.tagName.toLowerCase() === 'text' || el.tagName.toLowerCase() === 'tspan') {
      el.setAttribute('fill', color);
    }
  });
}

/** 按节点/标签底色相对亮度修正 SVG 内文字颜色 */
export function fixMermaidSvgContrast(svg: string): string {
  if (typeof DOMParser === 'undefined' || typeof XMLSerializer === 'undefined') {
    return svg;
  }
  const doc = new DOMParser().parseFromString(svg, 'image/svg+xml');
  if (doc.querySelector('parsererror')) return svg;

  const groups = doc.querySelectorAll(
    'g.node, g.cluster, g.edgeLabel, g.label, g.actor, g.activation0, g.activation1, g.activation2, g.note',
  );
  groups.forEach((group) => {
    const shape =
      group.querySelector('rect, polygon, path, circle, ellipse') ||
      group.querySelector('line');
    const fill = shapeFill(shape);
    const color = textColorForBackground(fill);
    if (color) applyTextColor(group, color);
  });

  // sequenceDiagram：participant 框与消息文字
  doc.querySelectorAll('text.messageText, text.loopText, text.altText, text.actor').forEach((textEl) => {
    let fill: string | null = null;
    let p: Element | null = textEl.parentElement;
    for (let i = 0; i < 6 && p; i += 1) {
      const rect = p.querySelector('rect');
      fill = shapeFill(rect) || fill;
      p = p.parentElement;
    }
    const color = textColorForBackground(fill) || textColorForBackground('#1e293b');
    if (color) {
      textEl.setAttribute('fill', color);
      textEl.querySelectorAll('tspan').forEach((t) => t.setAttribute('fill', color));
    }
  });

  return new XMLSerializer().serializeToString(doc.documentElement);
}
