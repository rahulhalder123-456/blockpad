/* Copies the web app and the icon into ios-xtool/Resources (run before `xtool dev`):  node tools/prepare-ios.js */
const fs = require('fs'); const path = require('path'); const { execFileSync } = require('child_process');
const root = path.join(__dirname, '..');
execFileSync(process.execPath, [path.join(__dirname, 'build-web.js')], { stdio: 'inherit' });
const dest = path.join(root, 'ios-xtool', 'Resources', 'web');
fs.rmSync(dest, { recursive: true, force: true });
fs.cpSync(path.join(root, 'site', 'app'), dest, { recursive: true });
['sw.js', 'pwa.js'].forEach((f) => fs.rmSync(path.join(dest, f), { force: true }));        // no service worker inside the native shell: the files are already local
const html = path.join(dest, 'index.html');
fs.writeFileSync(html, fs.readFileSync(html, 'utf8').replace('  <script src="pwa.js"></script>\n', ''));
// 1024 px App Store icon (iOS rounds the corners itself)
const gen = fs.readFileSync(path.join(__dirname, 'make-pwa-icons.js'), 'utf8');
console.log('web app copied to', dest, '| for the 1024 px icon run: node tools/make-pwa-icons.js (writes assets/icons/appstore-1024.png)');
if (fs.existsSync(path.join(root, 'assets', 'icons', 'appstore-1024.png'))) fs.copyFileSync(path.join(root, 'assets', 'icons', 'appstore-1024.png'), path.join(root, 'ios-xtool', 'Resources', 'AppIcon.png'));
