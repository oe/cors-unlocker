import path from 'path';
import { zip } from 'zip-a-folder'

const __dirname = path.dirname(new URL(import.meta.url).pathname);

const ROOT_DIR = path.resolve(__dirname, '..');
const buildDir = path.resolve(ROOT_DIR, 'dist');

zip(buildDir, path.resolve(ROOT_DIR, 'extension.zip'))
  .then(() => console.log('extension.zip created'))
  .catch((err) => console.error('Error creating zip', err));
 
 