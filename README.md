# ES1l1 — ASCII Studio

A static ASCII-art generator for GitHub Pages. It converts uploaded images into character art in the browser and offers a small built-in prompt-to-pattern mode.

## Features
- Upload PNG, JPG, WEBP and other browser-supported image formats.
- Drag and drop support.
- Image-to-ASCII conversion runs locally in the browser; images are not sent to a server.
- Adjustable character width, contrast, character palette and terminal color.
- Built-in prompt patterns for cat, house, car, tree, moon, city and mountain.
- Copy output or download it as a `.txt` file.
- Responsive terminal-inspired interface.

## Important note about prompt mode
Prompt mode is intentionally offline and rule-based. It recognizes a handful of keywords and displays built-in ASCII patterns. It is **not** an AI image generator and does not interpret arbitrary descriptions semantically. A future version can connect a text-to-image or text-to-ASCII service through a secure backend.

## Run locally
Open `index.html` in a modern browser. No build tools or package installation are required.

## Publish with GitHub Pages
1. Create a new public repository named `ES1l1` (or another name).
2. Upload `index.html`, `style.css`, `script.js`, and `README.md` to the repository root.
3. Open **Settings → Pages**.
4. Under **Build and deployment**, choose **Deploy from a branch**.
5. Select branch **main** and folder **/(root)**, then click **Save**.
6. Wait for GitHub Pages to publish the site. The address will look like `https://YOUR-USERNAME.github.io/ES1l1/`.

## Notes
- Keep all three application files in the repository root.
- The Google Fonts import is optional; the site falls back to monospace/system fonts if unavailable.
- Very wide images may create long text output. Reduce Character Width for smaller output.
