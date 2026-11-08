import fs from 'fs';
import { execSync } from 'child_process';

console.log('[AppHub] Checking platform-specific native dependencies...');

const pkgsToInstall = ['@typescript/typescript-win32-x64', '@esbuild/win32-x64'];

try {
  const rolldownPkgPath = './node_modules/rolldown/package.json';
  if (fs.existsSync(rolldownPkgPath)) {
    const rolldownJson = JSON.parse(fs.readFileSync(rolldownPkgPath, 'utf8'));
    if (rolldownJson.version) {
      pkgsToInstall.push(`@rolldown/binding-win32-x64-msvc@${rolldownJson.version}`);
    }
  }
} catch (err) {
  console.warn('[AppHub] Note: rolldown not found or could not read version:', err);
}

if (process.platform === 'win32') {
  console.log(`[AppHub] Detected Windows runner (win32). Installing native bindings: ${pkgsToInstall.join(', ')}`);
  try {
    execSync(`npm install --no-save ${pkgsToInstall.join(' ')}`, { stdio: 'inherit' });
    console.log('[AppHub] Native Windows packages installed successfully.');
  } catch (err) {
    console.error('[AppHub] Error installing native Windows packages:', err);
    process.exit(1);
  }
} else {
  console.log(`[AppHub] Current platform is ${process.platform}. Windows native bindings are not required on this platform.`);
}
