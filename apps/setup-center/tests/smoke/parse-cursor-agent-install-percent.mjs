/**
 * Unit smoke: parseCursorAgentInstallPercent reads the latest (xx%) from Rust install logs.
 * Run: node tests/smoke/parse-cursor-agent-install-percent.mjs
 */
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const { parseCursorAgentInstallPercent } = await import(
  pathToFileURL(
    path.resolve('src/components/cursor-agent/parseCursorAgentInstallPercent.ts'),
  ).href
);

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
assertEqual(parseCursorAgentInstallPercent('underflow (-5%)'), 0, 'clamped min');

console.log('parse-cursor-agent-install-percent passed');
