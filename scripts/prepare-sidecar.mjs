import { build } from 'esbuild';
import { copyFile, mkdir, chmod } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const triple = execFileSync('rustc',['-vV'],{encoding:'utf8'}).match(/^host: (.+)$/m)?.[1];
if (!triple) throw new Error('Unable to determine Rust host triple');
await mkdir(resolve(root,'agent-runtime/bundle'),{recursive:true});
await build({entryPoints:[resolve(root,'agent-runtime/dist/main.js')],outfile:resolve(root,'agent-runtime/bundle/main.mjs'),bundle:true,platform:'node',format:'esm',target:'node22',external:['@openai/codex-linux-x64','@openai/codex-linux-arm64','@openai/codex-darwin-x64','@openai/codex-darwin-arm64','@openai/codex-windows-x64','@openai/codex-windows-arm64'],define:{'process.env.NODE_ENV':'"production"'}});
const binary = resolve(root,`src-tauri/binaries/educatioharness-node-${triple}`);
await mkdir(resolve(root,'src-tauri/binaries'),{recursive:true});
await copyFile(process.execPath,binary);
await chmod(binary,0o755);
console.log(`Prepared Node sidecar for ${triple}`);
