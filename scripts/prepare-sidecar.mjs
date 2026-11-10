import { build } from 'esbuild';
import { copyFile, mkdir, chmod, access } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const triple = execFileSync('rustc',['-vV'],{encoding:'utf8'}).match(/^host: (.+)$/m)?.[1];
if (!triple) throw new Error('Unable to determine Rust host triple');
const extension = process.platform === 'win32' ? '.exe' : '';
const platformPackage = process.platform === 'win32' ? 'win32' : process.platform === 'darwin' ? 'darwin' : 'linux';
const architecture = process.arch === 'arm64' ? 'arm64' : process.arch === 'x64' ? 'x64' : null;
if (!architecture || !['win32','darwin','linux'].includes(process.platform)) throw new Error(`Unsupported host: ${process.platform}/${process.arch}`);
if (!triple.startsWith(architecture === 'arm64' ? 'aarch64-' : 'x86_64-')) throw new Error(`Node and Rust architectures differ: ${process.arch} / ${triple}`);
const codexTriple = process.platform === 'linux' ? `${architecture === 'arm64' ? 'aarch64' : 'x86_64'}-unknown-linux-musl` : triple;
const codexSource = resolve(root,`node_modules/@openai/codex-${platformPackage}-${architecture}/vendor/${codexTriple}/bin/codex${extension}`);
await access(codexSource).catch(() => { throw new Error(`Official Codex binary missing: ${codexSource}. Run npm ci with optional dependencies.`); });
await mkdir(resolve(root,'agent-runtime/bundle'),{recursive:true});
await build({entryPoints:[resolve(root,'agent-runtime/dist/main.js')],outfile:resolve(root,'agent-runtime/bundle/main.mjs'),bundle:true,platform:'node',format:'esm',target:'node22',external:['@openai/codex-linux-x64','@openai/codex-linux-arm64','@openai/codex-darwin-x64','@openai/codex-darwin-arm64','@openai/codex-windows-x64','@openai/codex-windows-arm64'],define:{'process.env.NODE_ENV':'"production"'}});
const binary = resolve(root,`src-tauri/binaries/educatioharness-node-${triple}${extension}`);
const codexBinary = resolve(root,`src-tauri/binaries/educatioharness-codex-${triple}${extension}`);
await mkdir(resolve(root,'src-tauri/binaries'),{recursive:true});
await copyFile(process.execPath,binary);
await copyFile(codexSource,codexBinary);
if (process.platform !== 'win32') { await chmod(binary,0o755); await chmod(codexBinary,0o755); }
console.log(`Prepared Node and official Codex sidecars for ${triple}`);
