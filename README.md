# ES1l1 — ASCII & Scene Studio

A bilingual, client-side creative studio that turns **English or Arabic scene descriptions**, **images**, and **videos** into animated ASCII art. Everything runs in the browser: no backend, no accounts, no API keys, and no uploads.

ES1l1 v2.0 keeps the original neon-terminal identity while adding a procedural scene engine, a canvas-based ASCII renderer, local media analysis, and real PNG / TXT / WebM exports.

> **Honest scope:** prompt mode is a rule-based keyword interpreter plus a procedural renderer. It is **not** a neural image generator, diffusion model, or semantic vision system. The analysis panel reports keyword matches and pixel statistics, not object recognition.

---

## Features

### Prompt studio (Arabic + English)
- Bilingual descriptions with Arabic normalization (diacritics, alef/ya/ta variants) and synonym matching.
- Interprets environment, subject, weather, time of day, lighting, camera, motion, effects, and atmosphere.
- Procedural environments: forest, city, road, ocean, mountains, space, desert, and open plain.
- Subjects: human, car, astronaut, cat, deer, bird, and fish, with small procedural rigs and motion.
- Weather and light: rain, snow, fog, storms, lightning, neon, moonlight, firelight, sunsets, aurora, fireflies, embers, and shooting stars.
- Seeded procedural generation for stable scenes from the same description.
- Live scene canvas plus an animated canvas-rendered ASCII terminal.
- Scene speed, play/pause, PNG, TXT, fullscreen, and WebM recording.

### Image studio
- Drag-and-drop or browse for PNG, JPG, WEBP, GIF, and BMP files.
- Full-color, grayscale, or monochrome ASCII.
- Character density, palette, brightness, contrast, and luminance inversion.
- Before/after comparison slider.
- Local pixel analysis: dimensions, aspect ratio, orientation, file size, mean brightness, contrast, saturation, edge density, and dominant color clusters.
- PNG canvas export and plain-text ASCII export.

### Video studio
- Local video upload (browser-supported formats such as MP4/WebM/MOV).
- Original and live ASCII panes.
- Play/pause, seek, playback speed, ASCII frame-rate control, density, palette, color mode, brightness, contrast, and inversion.
- Duration, resolution, measured presentation FPS (where the browser exposes frame callbacks), sampled frame statistics, and dominant colors.
- PNG frame export, TXT export, and WebM recording of the ASCII canvas.

### Interface
- Dark studio design with neon green, cyan, and violet accents.
- English LTR and Arabic RTL layouts with proper Arabic typography.
- Responsive three-column desktop, two-column tablet, and single-column mobile layouts.
- Settings dialog with language, terminal color, palette, color mode, FPS, density, scanlines, and reduced camera motion.
- Settings and language persist in `localStorage`.
- Keyboard shortcuts: `Space` play/pause, `1`/`2`/`3` switch studios, `F` fullscreen, `Esc` close dialog / exit fullscreen.
- Animation loops stop when the tab is hidden or another studio is active; object URLs and media elements are cleaned up when media is cleared or replaced.

---

## Limits and browser behavior

- **No AI generation.** Prompt interpretation is deterministic and keyword-based; the visual result is drawn procedurally on a canvas.
- **No object recognition.** Image/video analysis measures pixel statistics and color clusters only.
- The renderer is deliberately conservative for low-memory devices: the scene canvas is 1280×720, ASCII output is capped near 1280–1800 px wide, and sampling resolution is bounded.
- Uploads are limited to **150 MB per file**; larger files are rejected with a message.
- WebM recording requires `MediaRecorder`, `canvas.captureStream`, and WebM support. When unavailable, recording buttons are clearly disabled rather than pretending to work. Safari may record a non-WebM codec, so recording is only offered where WebM is actually supported.
- Video frame-rate measurement depends on `requestVideoFrameCallback`; otherwise the panel shows an estimate/unavailable state.
- Some videos (especially browser-generated WebM files without a duration header) report an unknown duration until playback begins; seeking is disabled until a finite duration is known.
- Google Fonts are requested when online for Fira Code, Space Grotesk, and Noto Kufi Arabic. The app falls back to system fonts if the request fails. No other network requests are made.
- The UI is designed for current evergreen browsers. Very old browsers without ES modules, Canvas, or `MediaRecorder` will have reduced functionality.

---

## Project structure

```
ES1l1/
├── index.html                 # application shell, all studio views
├── css/
│   └── style.css              # design system, RTL, responsive layouts
├── js/
│   ├── app.js                 # controller: views, media, exports, settings
│   ├── i18n.js                # English/Arabic dictionaries and RTL handling
│   ├── scene.js               # prompt interpreter + procedural scene engine
│   ├── ascii.js               # canvas ASCII renderer and palettes
│   └── analysis.js            # pixel/media analysis helpers
├── .nojekyll                  # disable Jekyll processing on GitHub Pages
├── .github/workflows/pages.yml
├── README.md
├── script.js                  # original v1 script (unused, retained for reference)
└── style.css                  # original v1 stylesheet (unused, retained)
```

`script.js` and the root `style.css` are the original v1 files. They are **not loaded** by the v2 shell and are kept only for reference.

---

## Run locally

The app uses ES modules, so it must be served over HTTP rather than opened with `file://`.

```bash
# from the repository root, using Python 3
python3 -m http.server 3000
```

Open <http://localhost:3000/>.

No install, build step, package manager, backend, or environment variables are required.

---

## Publish with GitHub Pages

The site is completely static and `index.html` is at the repository root.

### Option A — deploy from a branch
1. Push the finished site to the `main` branch.
2. In the repository, open **Settings → Pages**.
3. Under **Build and deployment**, choose **Deploy from a branch**.
4. Select branch **main** and folder **/(root)**, then **Save**.
5. The site will be available at `https://<user>.github.io/ES1l1/`.

The included `.nojekyll` prevents Jekyll from processing the site.

### Option B — GitHub Actions
The workflow at `.github/workflows/pages.yml` deploys the repository root with the official Pages actions.

1. Open **Settings → Pages** and set **Source** to **GitHub Actions**.
2. Push to `main`, or run the workflow manually from the **Actions** tab.
3. The deployment URL appears in the workflow run and in the Pages settings.

All asset paths in `index.html` are relative, so the site works from a repository subpath as well as a custom domain.

---

## Verification performed

Browser checks were run against a local static server:

- All five JavaScript modules pass `node --check` syntax validation.
- All CSS/JS referenced by `index.html` return HTTP 200; no missing assets.
- No duplicate HTML IDs; every ID referenced by `app.js` exists.
- English/Arabic switching updates direction, typography, examples, analysis, and palette labels.
- Arabic and English prompts generate the expected environments/subjects (tested: Arabic mountain/deer/dawn/snow, English city/car/night).
- Image upload, compare slider, local analysis, PNG export, TXT export, and clearing were exercised.
- Video upload, playback, seeking, measured FPS, live ASCII, analysis, PNG/TXT exports, and WebM recording were exercised with a locally generated WebM.
- Prompt WebM recording produced a valid non-empty WebM.
- Responsive checks at 1440, 1180, 1024, 768, and 432 px showed no horizontal overflow.
- Fullscreen was verified in the browser; the browser console showed no application errors.

Known test limitation: automated interaction cannot fully simulate every OS/browser combination. Test exports and video playback in your target browsers.

---

## Privacy

Images, videos, prompts, and settings stay in the browser. Object URLs are revoked when media is cleared or replaced. The only optional network request is the Google Fonts stylesheet; remove the font links in `index.html` for a fully offline-first build.
