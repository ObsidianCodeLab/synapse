/**
 * Unit smoke: parseCursorAgentInstallPercent reads the latest (xx%) from Rust install logs.
 * Logic must stay in sync with src/components/cursor-agent/parseCursorAgentInstallPercent.ts
 * Run: npm run test:cursor-agent-percent
 */

/** @param {string} log */
function parseCursorAgentInstallPercent(log) {
  const matches = [...log.matchAll(/\((\d+(?:\.\d+)?)%\)/g)];
  if (matches.length === 0) return null;
  const raw = matches[matches.length - 1]?.[1];
  if (!raw) return null;
  const n = Number.parseFloat(raw);
  if (!Number.isFinite(n)) return null;
  return Math.min(100, Math.max(0, n));
}

function assertEqual(actual, expected, label) {
  if (actual !== expected) {
    console.error(`FAIL ${label}: expected ${expected}, got ${actual}`);
    process.exit(1);
  }
}

assertEqual(parseCursorAgentInstallPercent(''), null, 'empty log');
assertEqual(parseCursorAgentInstallPercent('no percent here'), null, 'missing percent');
assertEqual(
  parseCursorAgentInstallPercent('  已下载 12.0 / 50.0 MB (45.0%)\n'),
  45,
  'single percent',
);
assertEqual(
  parseCursorAgentInstallPercent(
    '  已下载 1.0 / 50.0 MB (10%)\n  已下载 25.0 / 50.0 MB (50.0%)\n  已下载 49.0 / 50.0 MB (99.9%)\n',
  ),
  99.9,
  'latest percent wins',
);
assertEqual(parseCursorAgentInstallPercent('overflow (150%)'), 100, 'clamped max');
assertEqual(parseCursorAgentInstallPercent('start (0%)'), 0, 'zero percent');

console.log('parse-cursor-agent-install-percent passed');
