import path from 'path';
import { zip } from 'zip-a-folder'

const __dirname = path.dirname(new URL(import.meta.url).pathname);

const browserTargets = ['chrome', 'firefox'];

const ROOT_DIR = path.resolve(__dirname, '..');
const buildDir = path.resolve(ROOT_DIR, 'dist');

function zipBuild(target: string) {
  return zip(
    path.join(buildDir, target),
    path.resolve(buildDir, `extension-${target}.zip`)
  );
}

async function main() {
  await Promise.all(browserTargets.map(zipBuild));
  console.log('All builds zipped');
}

main();