# Blockpad launch cut (tone: default, 24 s, 1920x1080, 30 fps, 120 BPM)

**Angle:** your notes never leave your device, and it still works on a phone and shares with a link.
**Hook (0-2 s):** the app being typed into, caption "Your notes. Your device. / No cloud. No account."
**Reveal (2-5.5 s):** logo pops in, "Blockpad", "Notes, wiki and databases that live on your device".
**Highlights (5.5-17.5 s, 4 s each):** write with blocks (live typing), databases built in (a real click on the Board tab), made for your phone (the phone layout, drawer, comments sheet).
**Punchline (17.5-20 s):** "Yours. Private. Everywhere." with Works offline / No account / Peer-to-peer sharing / Free.
**End card (20-24 s):** Get Blockpad, the platforms, blockpad-umber.vercel.app.

Every cut is on the beat grid (cuts at 2, 5.5, 9.5, 13.5, 17.5, 20 s). Footage is the real Blockpad web app, recorded frame by frame (tools/make-promo.js). Soundtrack is synthesized on the same grid (tools/make-brag-music.py): riser into the reveal, four-on-the-floor groove in A minor, an impact and a whoosh on every cut, a click on the Board tab click, final chord. Poster frame (the settled Board view) is baked in as frame 0 and saved as brag.jpg.
No real names, emails or secrets appear: the only text typed is "Weekend trip" and a sample comment.

## Breakdown cut (tools/make-breakdown.js, brag-breakdown.mp4, 1920x1320, 24s)
Applies NullMotion's (github.com/blixvip/NullMotion) own documented technique directly to this project's own launch cut: the finished film plays on top, full width; a plain black-and-white "draft" scene for each of the 7 storyboard sections sits in a row underneath (flat shapes, Arial, one idea each — a sketch of the section before the polish); a playhead sweeps the row in sync with the film's clock, and the live section's draft gets an orange outline. Built with this project's own ffmpeg pipeline rather than running NullMotion's server, because its importer expects another tool's export format and its own export drives a live Chromium tab — this project's renderer already covers frame-accurate, scene-synced export without that dependency. No NullMotion code ships in this repo.
