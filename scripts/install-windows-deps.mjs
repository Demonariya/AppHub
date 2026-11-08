import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

console.log('[AppHub] Scanning for platform-specific native dependencies...');

// Map package name -> version (or null if unversioned fallback)
const win32Pkgs = new Map([
  ['@typescript/typescript-win32-x64', '7.0.2'],
  ['@esbuild/win32-x64', '0.25.12'],
  ['lightningcss-win32-x64-msvc', '1.33.0'],
  ['@tailwindcss/oxide-win32-x64-msvc', '4.3.5'],
  ['@rolldown/binding-win32-x64-msvc', '1.2.16'],
]);

function scan(dir) {
  if (!fs.existsSync(dir)) return;
  for (const item of fs.readdirSync(dir)) {
    if (item.startsWith('.')) continue;
    const full = path.join(dir, item);
    if (item.startsWith('@')) {
      scan(full);
      continue;
    }
    const pkgPath = path.join(full, 'package.json');
    if (fs.existsSync(pkgPath)) {
      try {
        const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
        const opt = pkg.optionalDependencies || {};
        for (const [name, version] of Object.entries(opt)) {
          if (name.includes('win32-x64') || name.includes('win32_x64')) {
            const cleanVer = version.replace(/^[~^>=< ]+/, '');
            win32Pkgs.set(name, cleanVer);
          }
        }
      } catch (e) {}
    }
  }
}

scan('node_modules');

const packagesList = Array.from(win32Pkgs.entries()).map(([name, ver]) =>
  ver ? `${name}@${ver}` : name
);
console.log('[AppHub] Resolved Windows native packages to install:', packagesList);

if (process.platform === 'win32') {
  console.log('[AppHub] Detected Windows runner (win32). Installing native packages...');
  try {
    execSync(`npm install --no-save ${packagesList.join(' ')}`, { stdio: 'inherit' });
    console.log('[AppHub] All native Windows packages installed successfully.');
  } catch (err) {
    console.error('[AppHub] Failed to install Windows native binaries:', err);
    process.exit(1);
  }
} else {
  console.log(`[AppHub] Current platform is ${process.platform}. Skipping win32 installation.`);
}
