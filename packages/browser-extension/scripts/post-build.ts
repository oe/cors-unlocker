import path from 'path';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { zip } from 'zip-a-folder';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const requestedTarget = process.argv[2];
if (requestedTarget && !['chrome', 'firefox'].includes(requestedTarget)) throw new Error('Unsupported browser target.');
const browserTargets = requestedTarget ? [requestedTarget] : ['chrome', 'firefox'];

const ROOT_DIR = path.resolve(__dirname, '..');
const buildDir = path.resolve(ROOT_DIR, 'dist');
const { version } = JSON.parse(readFileSync(path.join(ROOT_DIR, 'package.json'), 'utf8'));

function zipBuild(target: string) {
  return zip(
    path.join(buildDir, target),
    path.resolve(buildDir, `forth-intercept-${target}-v${version}.zip`),
  );
}

async function main() {
  await Promise.all(browserTargets.map(zipBuild));
  console.log(`Packaged ${browserTargets.join(', ')}`);
}

void main();
