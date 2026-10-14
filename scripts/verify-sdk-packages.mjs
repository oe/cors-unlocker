/** Verify exact npm archives in a clean consumer; never publish. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const output = path.join(root, 'artifacts/sdk-preflight');
mkdirSync(output, { recursive: true });
const run = (program, args, cwd = root) => execFileSync(program, args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
const spec = JSON.parse(readFileSync(path.join(root, 'release/legacy-sdk/source.json')));
const sourceArchive = path.join(output, 'cors-unlocker-0.1.0.tgz');
run('python3', ['-c', 'import pathlib,sys,urllib.request; pathlib.Path(sys.argv[2]).write_bytes(urllib.request.urlopen(sys.argv[1],timeout=30).read())', spec.tarball, sourceArchive]);
const original = readFileSync(sourceArchive);
assert.equal(`sha512-${createHash('sha512').update(original).digest('base64')}`, spec.integrity);
writeFileSync(sourceArchive, original);
run('python3', ['scripts/prepare-legacy-sdk-patch.py', '--source', sourceArchive, '--output', output]);
const pkg = JSON.parse(readFileSync(path.join(root, 'packages/npm/package.json')));
run('pnpm', ['--dir', 'packages/npm', 'pack', '--pack-destination', '../../artifacts/sdk-preflight']);
const archives = [
  ['new', `wireflip-${pkg.version}.tgz`],
  ['legacy-0.1.0', 'cors-unlocker-0.1.0.tgz'],
  ['legacy-0.1.1', 'cors-unlocker-0.1.1.tgz'],
];
const records = [];
for (const [label, file] of archives) {
  const archive = path.join(output, file);
  const destination = path.join(output, label);
  rmSync(destination, { recursive: true, force: true });
  mkdirSync(destination);
  run('tar', ['-xzf', archive, '-C', destination]);
  const packed = JSON.parse(readFileSync(path.join(destination, 'package/package.json')));
  assert.equal(packed.name, label === 'new' ? 'wireflip' : 'cors-unlocker');
  assert.equal(packed.version, label === 'new' ? pkg.version : label.replace('legacy-', ''));
  for (const entry of [packed.main, packed.module, packed.types]) assert(readFileSync(path.join(destination, 'package', entry)).length);
  const outputJson = JSON.parse(run('npm', [label === 'legacy-0.1.0' ? 'pack' : 'publish', archive, '--dry-run', '--ignore-scripts', '--json']));
  const listing = Array.isArray(outputJson) ? outputJson[0] : outputJson;
  assert.equal(listing.name, packed.name);
  assert.equal(listing.version, packed.version);
  const files = listing.files.map(item => item.path);
  assert(files.includes('readme.md'), 'README must be included');
  assert(!files.some(file => /(^|\/)(src|node_modules|tests)\//.test(file) || /\.map$|\.test\./.test(file)), 'No development-only files');
  records.push({ label, name: packed.name, version: packed.version, archive: file, sha256: createHash('sha256').update(readFileSync(archive)).digest('hex'), files });
}
const consumer = mkdtempSync(path.join(tmpdir(), 'wireflip-npm-consumer-'));
try {
  writeFileSync(path.join(consumer, 'package.json'), JSON.stringify({ name: 'wireflip-release-consumer', version: '1.0.0', private: true, type: 'module' }));
  run('npm', ['install', '--offline', '--ignore-scripts', '--no-audit', '--no-fund', path.join(output, archives[0][1])], consumer);
  const checks = `const names=['connect','isAvailable','openStorePage']; for(const name of names) assert.equal(typeof sdk.intercept[name],'function'); assert.equal(sdk.default,sdk.intercept); assert.equal(typeof sdk.InterceptError,'function');`;
  writeFileSync(path.join(consumer, 'esm.mjs'), `import assert from 'node:assert/strict'; import * as sdk from 'wireflip'; ${checks}`);
  writeFileSync(path.join(consumer, 'cjs.cjs'), `const assert=require('node:assert/strict'); const sdk=require('wireflip'); ${checks}`);
  run(process.execPath, ['esm.mjs'], consumer);
  run(process.execPath, ['cjs.cjs'], consumer);
  writeFileSync(path.join(consumer, 'consumer.mts'), `import wireflip, { intercept, InterceptError, type InterceptCapabilities, type DraftRuleInput } from 'wireflip';\nconst draft: DraftRuleInput = {name:'Consumer',urlPattern:'*',actions:[{type:'delay',milliseconds:800}]};\nasync function check(){const session=await intercept.connect();const capabilities: InterceptCapabilities=session.capabilities;await session.createRuleDraft(draft,{openWorkspace:false});await session.requestCors({credentials:false});await session.disableCors();await session.openWorkspace();return [capabilities,await wireflip.isAvailable(),new InterceptError({type:'user-cancel',message:'Cancelled'})];}\nvoid check;`);
  writeFileSync(path.join(consumer, 'consumer.cts'), `import sdk = require('wireflip');\nasync function check(){const session=await sdk.intercept.connect();await session.requestCors({credentials:false});return session.capabilities.browser;}\nvoid check;`);
  const require = createRequire(path.join(root, 'packages/browser-extension/package.json'));
  run(process.execPath, [require.resolve('typescript/bin/tsc'), '--strict', '--noEmit', '--module', 'nodenext', '--moduleResolution', 'nodenext', '--target', 'ES2022', '--lib', 'ES2022,DOM', 'consumer.mts', 'consumer.cts'], consumer);
} finally { rmSync(consumer, { recursive: true, force: true }); }
writeFileSync(path.join(output, 'packages.json'), JSON.stringify({ commit: run('git', ['rev-parse', 'HEAD']).trim(), worktreeDirty: Boolean(run('git', ['status', '--porcelain']).trim()), archives: records, consumer: { esm: 'passed', commonjs: 'passed', types: 'passed', dryRun: 'passed' } }, null, 2) + '\n');
console.log('SDK archives verified: SHA-512 pinned legacy source, unchanged legacy runtime, new/patch publish dry-runs and original archive inspection, clean ESM/CommonJS/types consumer.');
console.log(`Browser fixtures and archive hashes: ${output}`);
