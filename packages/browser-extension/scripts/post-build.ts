import path from 'path';
import { zip } from 'zip-a-folder';

const __dirname = path.dirname(new URL(import.meta.url).pathname);

const requestedTarget = process.argv[2];
const browserTargets = requestedTarget ? [requestedTarget] : ['chrome', 'firefox'];

const ROOT_DIR = path.resolve(__dirname, '..');
const buildDir = path.resolve(ROOT_DIR, 'dist');

function zipBuild(target: string) {
  return zip(
    path.join(buildDir, target),
    path.resolve(buildDir, `browser-proxy-${target}-v2.0.0.zip`),
  );
}

async function main() {
  await Promise.all(browserTargets.map(zipBuild));
  console.log(`Packaged ${browserTargets.join(', ')}`);
}

void main();
