#!/usr/bin/env node
// Custom pre-commit checks - scans staged TS/TSX files for forbidden patterns.
// Blocks commit on hit with line-precise error report.
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const FORBIDDEN = [
  {
    pattern: /^\s*console\.(log|info|debug)\s*\(/,
    message: 'console.log/info/debug forbidden (use logger or console.warn/error)',
  },
  {
    pattern: /^\s*debugger\s*;?\s*$/,
    message: 'debugger statement forbidden',
  },
  {
    pattern: /\bas\s+any\b/,
    message: '`as any` forbidden (use proper type or `as unknown as X`)',
  },
  {
    // Negative lookahead - matches `: any` not followed by word char
    // (catches: `: any}`, `: any|`, `: any[]`, `: any &`, `: any\n`, `: any,`, etc)
    pattern: /:\s*any(?![a-zA-Z0-9_$])/,
    message: '`: any` type annotation forbidden (use unknown + type guard)',
  },
];

const stagedFiles = execSync('git diff --cached --name-only --diff-filter=ACM', {
  encoding: 'utf8',
})
  .split('\n')
  .filter(f => /\.(ts|tsx)$/.test(f) && !f.includes('node_modules'));

let blocked = false;

for (const file of stagedFiles) {
  let content;
  try {
    content = readFileSync(file, 'utf8');
  } catch {
    continue;
  }
  const lines = content.split('\n');
  for (const { pattern, message } of FORBIDDEN) {
    lines.forEach((line, idx) => {
      if (pattern.test(line)) {
        console.error(`\u274c ${file}:${idx + 1}  ${message}`);
        console.error(`   ${line.trim()}`);
        blocked = true;
      }
    });
  }
}

if (blocked) {
  console.error('\nCommit blocked. Fix violations or switch console.log to logger / warn / error.');
  process.exit(1);
}
