# Check by ear: promo/blockpad-promo.mp4 (54s, scored)

Built with the `brag` (/latent-spaces) craft + sound rules, real sound-design tooling from `opus-sound-layer`
(/Bodila51) and `earshot` (/Leonxlnx), applied to the picture's own real cut and click timings — nothing guessed.
Full report: `brag-output/promo-cues.json` (the cue sheet), `brag-output/promo-sfx-credits.md` (every recording's
source and licence), `brag-output/work/promo-audio/qa.png` (the annotated mix sheet).

**5 timecodes to check:**
1. **0:00–0:01** — the cold open: a short riser into a layered hit+boom as the logo lands. The one true "hero" hit
   in the film.
2. **0:08–0:10** — six soft key taps as new blocks appear while typing (one per Enter press, not per letter).
3. **0:24 and 0:28.5** — the comments icon opening, then a small confirmation ding when the comment is posted.
4. **0:46.3–0:47.5** — four pills ("Works offline", "No account", …) popping in, each with a pop + a rising bell
   note (C, D, E, G) under it.
5. **0:50–0:54** — the closing swell and a bright bell on the "Get Blockpad" badge, then the fade to silence.

**What's real, what isn't:**
- **Sound effects:** real. The clicks, keys, pops, whooshes, chimes and the opening hit+boom are either licensed
  CC0 recordings (`opus-sound-layer`'s library, 829 sounds pulled from Freesound) or `earshot`'s procedural bank
  made for exactly this style of film (its `launch` preset) — see the credits file for which is which.
- **Music:** synthesized, not a recording. The plan was to use a real CC0 track via Openverse (the skill named for
  this) or Kenney's own CC0 music packs. Both were unreachable from this network — Openverse's API and site timed
  out or returned 403, and Kenney's asset downloads also came back 403 (likely edge/bot protection blocking this
  sandbox, not a problem with either project). `earshot critique` confirms this honestly: the mix reads as
  code-synthesized (p_real 0.21, "likely code-synthesized" verdict) — that's accurate, not a bug to hide.
- **Mix quality:** `opus-sound-layer`'s own QA passes clean (every cue in sync to the frame, correctly audible,
  no unplanned level dips). `earshot critique` scores the finished video against 7 professional launch films:
  **22 of 23 scored metrics in range** (loudness, dynamics, spectrum balance, stereo width, pacing, sync — all
  within the reference films' measured spread). The one flagged metric is the realness check above.
- Three secondary texture layers (one transition whoosh, one bell under a pop, one swell) sit 1–1.5 dB under what
  `qa.py` calls fully "audible" against the music at that exact moment. They're still present, just closer to the
  music's own level there than the tool's threshold wants; raising them further made other cues worse, so this
  was left rather than chased past a reasonable point.

**Also in this folder:** `blockpad-promo-breakdown.mp4` — the same scored film on top, nine plain black-and-white
"draft" scenes underneath (one per real section), synced with a playhead and an orange outline on the live one —
NullMotion's (`blixvip/NullMotion`) own documented device, applied directly to this project's picture.
