import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const outDir = path.join(rootDir, 'hosting-dist');

execSync('npm --prefix client run build', { cwd: rootDir, stdio: 'inherit' });
execSync('npm --prefix cpanel run build', {
  cwd: rootDir,
  stdio: 'inherit',
  env: { ...process.env, VITE_BASE: '/cpanel/' }
});

fs.rmSync(outDir, { recursive: true, force: true });
fs.cpSync(path.join(rootDir, 'client', 'dist'), outDir, { recursive: true });
fs.cpSync(path.join(rootDir, 'cpanel', 'dist'), path.join(outDir, 'cpanel'), { recursive: true });

console.log('Build Firebase Hosting prêt : / (Client) et /cpanel (C-Panel)');
