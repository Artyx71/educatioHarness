import { spawnSync, execFileSync } from 'node:child_process';
import { access } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const triple = execFileSync('rustc', ['-vV'], { encoding: 'utf8' }).match(/^host: (.+)$/m)?.[1];
if (!triple) throw new Error('Unable to determine Rust host triple');

const extension = process.platform === 'win32' ? '.exe' : '';
const node = resolve(root, `src-tauri/binaries/educatioharness-node-${triple}${extension}`);
const codex = resolve(root, `src-tauri/binaries/educatioharness-codex-${triple}${extension}`);
const runtime = resolve(root, 'agent-runtime/bundle/main.mjs');
await Promise.all([access(node), access(codex), access(runtime)]);

function execute(binary, args, input) {
  const result = spawnSync(binary, args, {
    encoding: 'utf8',
    input,
    timeout: 30_000,
    maxBuffer: 1024 * 1024,
  });
  if (result.error) throw result.error;
  return result;
}

const nodeVersion = execute(node, ['--version']);
if (nodeVersion.status !== 0 || !/^v\d+\.\d+\.\d+/.test(nodeVersion.stdout.trim())) {
  throw new Error(`Bundled Node cannot start: ${nodeVersion.stderr || nodeVersion.stdout}`);
}

const codexVersion = execute(codex, ['--version']);
if (codexVersion.status !== 0 || !/codex-cli \d+\.\d+\.\d+/.test(codexVersion.stdout.trim())) {
  throw new Error(`Bundled Codex cannot start: ${codexVersion.stderr || codexVersion.stdout}`);
}

// Invalid input is rejected before any credential lookup or model request. This
// proves the copied Node binary can load the *bundled* runtime and its SDKs.
const protocol = execute(node, [runtime], '{}');
let message;
try { message = JSON.parse(protocol.stdout.trim()); }
catch { throw new Error(`Bundled runtime did not return JSON: ${protocol.stderr || protocol.stdout}`); }
if (protocol.status !== 1 || message.type !== 'result' || message.ok !== false || typeof message.error !== 'string') {
  throw new Error(`Bundled runtime did not reject invalid protocol input: ${protocol.stderr || protocol.stdout}`);
}

console.log(`Desktop sidecars start on ${triple}: Node ${nodeVersion.stdout.trim()}, ${codexVersion.stdout.trim()}, runtime protocol OK`);
