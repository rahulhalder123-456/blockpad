/* Package Blockpad for one platform:  node tools/build.js <win32-x64|linux-x64|darwin-arm64|darwin-x64> [--out build/v1.5.0]
   Keeps only that platform's native modules (sodium/udx prebuilds) and AI engine, so each build is as small as it can be.
   Run it on Linux/macOS (or WSL) for linux/darwin targets: Windows cannot create the symlinks and executable bits those need. */
const path = require('path');
const fs = require('fs');
const root = path.join(__dirname, '..');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const target = process.argv[2];
if (!/^(win32-x64|linux-x64|darwin-arm64|darwin-x64)$/.test(target || '')) { console.error('usage: node tools/build.js <win32-x64|linux-x64|darwin-arm64|darwin-x64> [--out dir]'); process.exit(2); }
const [platform, arch] = target.split('-');
const oi = process.argv.indexOf('--out');
const out = path.resolve(root, oi > 0 ? process.argv[oi + 1] : 'build/v' + pkg.version);
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const ignore = [
  /^\/(replica|tools|dist|release|build|installer|site|android|ios|ios-xtool|web|capacitor.config.json|.gitignore|\.github|\.claude|README\.md|smoke.*)(\/|$)/,
  new RegExp('^/node_modules/[^/]+/prebuilds/(?!' + esc(target) + ')'),     // other platforms' native modules
  new RegExp('^/engine/(?!' + esc(target) + '(/|$))'),                       // other platforms' AI engines
  /^\/node_modules\/(electron|electron-builder|@electron\/packager|app-builder-bin|app-builder-lib)(\/|$)/,
];

(async () => {
  const mod = require('@electron/packager');
  const packager = typeof mod === 'function' ? mod : mod.packager || mod.default;
  const extra = { icon: path.join(root, 'assets', platform === 'win32' ? 'icon.ico' : platform === 'darwin' ? 'icon.icns' : 'icon.png') };
  if (platform === 'darwin' && !fs.existsSync(extra.icon)) delete extra.icon;          // packager would fail on a missing .icns; the default icon is used
  const paths = await packager(Object.assign({
    dir: root, name: 'Blockpad', platform, arch, out, overwrite: true, prune: true, asar: false, ignore,
    appBundleId: 'app.blockpad.desktop', appCategoryType: 'public.app-category.productivity',
    extendInfo: { CFBundleURLTypes: [{ CFBundleURLName: 'Blockpad share link', CFBundleURLSchemes: ['blockpad'] }] },
    protocols: [{ name: 'Blockpad share link', schemes: ['blockpad'] }],
  }, extra));
  if (platform === 'darwin' && extra.icon && fs.existsSync(extra.icon)) {
    // packager keeps Electron's default icon when run from Linux; put ours in and point the bundle at it
    for (const dir of paths) {
      const contents = path.join(dir, 'Blockpad.app', 'Contents');
      fs.copyFileSync(extra.icon, path.join(contents, 'Resources', 'Blockpad.icns'));
      const plist = path.join(contents, 'Info.plist');
      fs.writeFileSync(plist, fs.readFileSync(plist, 'utf8').replace(/(<key>CFBundleIconFile<\/key>\s*<string>)[^<]*(<\/string>)/, '$1Blockpad.icns$2'));
    }
  }
  console.log('built:', paths.join('\n       '));
})().catch((e) => { console.error(e); process.exit(1); });
