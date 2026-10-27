# Blockpad website (download page + share-link page)

Two static pages, no backend, no analytics, no cookies:

- `/` — landing page with the **Download** button.
- `/join` — the page a **share link** opens. The invite is in the URL after `#`, which browsers never send to a server, so this site (and Vercel) never sees it. The page shows what you were invited to, tries to open Blockpad, and walks a new person through installing it.

## 1. Host the installer (it is ~131 MB, Vercel's limit is 100 MB per file)

Put `installer/Blockpad-Setup.exe` somewhere with a stable direct-download link. Easiest and free: a **GitHub Release**.

1. Create a GitHub repository (it can be empty or private-source; the release asset is what matters. For anyone to download it, the repo must be public).
2. Releases → *Draft a new release* → tag `v1.5.0` → attach `Blockpad-Setup.exe` → publish.
3. The permanent link is `https://github.com/<you>/<repo>/releases/latest/download/Blockpad-Setup.exe`.

(Any file host works if it gives a direct link: Cloudflare R2, Backblaze B2, Vercel Blob...)

## 2. Point the site at it

```
node tools/make-site-config.js https://github.com/<you>/<repo>/releases/latest/download/Blockpad-Setup.exe
```

This writes `site/config.js` with the link, the version, the size and the installer's SHA-256 (shown in the page footer so people can check their download).

## 3. Deploy to Vercel

From the `site` folder: `npx vercel --prod` (or import the folder / repo in the Vercel dashboard and set **Root Directory** to `site`, Framework preset **Other**, no build command).

## 4. Tell Blockpad your address

In Blockpad: **Settings → Sharing → Your Blockpad website** → `https://your-project.vercel.app`.
From then on **Share** creates links like `https://your-project.vercel.app/join#d=…`, which WhatsApp and Telegram make clickable.

## Updating Blockpad later

Rebuild (`npm run package`, `npm run installer`), upload the new `Blockpad-Setup.exe` to a new GitHub Release, run `node tools/make-site-config.js <url>` again and redeploy.

## Notes

- The installer is not code-signed, so Windows SmartScreen shows "Windows protected your PC" (More info → Run anyway). A code-signing certificate removes that; it is a paid item and not part of this setup.
- Anyone with a share link can join that page, so people should share links only with people they trust.
