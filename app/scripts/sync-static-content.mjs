// Copies the Book I content and workspace seeds into src/static-content so
// the app directory is self-contained for static deployment (Vercel uploads
// only app/). Source of truth stays in ../content and ../server/seeds.
import { cpSync, existsSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const appRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const dest = join(appRoot, 'src', 'static-content');
const contentSrc = join(appRoot, '..', 'content', 'book1');
const seedsSrc = join(appRoot, '..', 'server', 'seeds');

if (!existsSync(contentSrc)) {
  // Deploy builds (Vercel) upload only app/ — the sources are not there.
  // Fall back to the committed copy under src/static-content.
  console.log('content sources not present — keeping committed src/static-content');
  process.exit(0);
}

rmSync(dest, { recursive: true, force: true });
cpSync(contentSrc, join(dest, 'book1'), { recursive: true });
cpSync(seedsSrc, join(dest, 'seeds'), { recursive: true });

console.log('static content synced → src/static-content');
