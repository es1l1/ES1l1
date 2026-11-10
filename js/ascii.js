/**
 * ES1l1 — ASCII renderer.
 * Samples any drawable source (image / video / canvas) into a character grid
 * and paints it onto a canvas in one pass. No per-character DOM nodes.
 */

export const PALETTES = {
  standard: " .,:;i1tfLCG08@",
  detailed: " .'`^\",:;Il!i><~+_-?][}{1)(|\\/tfjrxnuvczXYUJCLQ0OZmwqpdbkhao*#MW&8%B@$",
  blocks: " ░▒▓█",
  binary: " 01",
  minimal: " .:-=+*#%@",
  matrix: " ｦｧｨｩｪｫｬｭｮｯｰｱｲｳｴｵｶｷｸｹｺｻｼｽｾｿﾀﾁﾂﾃﾄﾅﾆﾇﾈﾉﾊﾋﾌﾍﾎﾏﾐﾑﾒﾓﾔﾕﾖﾗﾘﾙﾚﾛﾜﾝ0123456789"
};

export const PALETTE_LABELS = {
  standard: { en: "Standard ASCII", ar: "ASCII قياسي" },
  detailed: { en: "Detailed ramp", ar: "تدرّج مفصّل" },
  blocks: { en: "Dense blocks", ar: "كتل كثيفة" },
  binary: { en: "Binary", ar: "ثنائي" },
  minimal: { en: "Minimal", ar: "بسيط" },
  matrix: { en: "Katakana", ar: "كاتاكانا" }
};

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

function hexToRgb(hex) {
  const clean = String(hex || "#8dffb0").replace("#", "");
  const full = clean.length === 3 ? clean.split("").map((c) => c + c).join("") : clean;
  const n = parseInt(full, 16) || 0;
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

function mix(a, b, amount) {
  return {
    r: Math.round(a.r + (b.r - a.r) * amount),
    g: Math.round(a.g + (b.g - a.g) * amount),
    b: Math.round(a.b + (b.b - a.b) * amount)
  };
}

export class AsciiRenderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d", { alpha: false });
    this.sample = document.createElement("canvas");
    this.sampleCtx = this.sample.getContext("2d", { willReadFrequently: true });
    this.lastText = "";
    this.cols = 0;
    this.rows = 0;
    this.cellW = 0;
    this.cellH = 0;
    this.fontSize = 12;
    this.lastPalette = "standard";
    this.lastColorMode = "mono";
    this.frameCount = 0;
  }

  /**
   * @param {CanvasImageSource} source
   * @param {object} opts
   * @param {number} opts.density target column count
   * @param {string} opts.palette palette key
   * @param {string} opts.colorMode mono | color | grayscale
   * @param {string} opts.accent hex color
   * @param {number} opts.brightness
   * @param {number} opts.contrast
   * @param {boolean} opts.invert
   * @param {boolean} opts.textOnly skip painting
   */
  render(source, opts = {}) {
    const srcW = source.videoWidth || source.naturalWidth || source.width;
    const srcH = source.videoHeight || source.naturalHeight || source.height;
    if (!srcW || !srcH) return null;

    const density = clamp(Math.round(opts.density || 100), 20, 240);
    const paletteKey = PALETTES[opts.palette] ? opts.palette : "standard";
    const palette = PALETTES[paletteKey];
    const colorMode = ["mono", "color", "grayscale"].includes(opts.colorMode) ? opts.colorMode : "mono";
    const brightness = clamp(Number(opts.brightness ?? 1), 0.1, 3);
    const contrast = clamp(Number(opts.contrast ?? 1), 0.1, 3);
    const invert = Boolean(opts.invert);
    const accent = hexToRgb(opts.accent || "#8dffb0");

    // Typography metrics: aim at a crisp ~1280px wide character field.
    const targetWidth = 1280;
    const approxCellW = targetWidth / density;
    const fontSize = Math.max(6, Math.min(42, approxCellW / 0.6));
    const font = `600 ${fontSize}px "Fira Code", "SFMono-Regular", Consolas, monospace`;
    const ctx = this.ctx;
    ctx.font = font;
    const charW = Math.max(3, ctx.measureText("M").width);
    const cellH = Math.max(4, fontSize * 1.16);
    const cols = density;
    const rows = Math.max(2, Math.round(cols * (srcH / srcW) * (charW / cellH)));

    // Keep the output resolution bounded on very wide/dense renders.
    const maxWidth = 1800;
    let outW = Math.ceil(cols * charW);
    let scaleFactor = 1;
    if (outW > maxWidth) {
      scaleFactor = maxWidth / outW;
      outW = maxWidth;
    }
    const outH = Math.ceil(rows * cellH * scaleFactor);

    if (this.canvas.width !== outW || this.canvas.height !== outH) {
      this.canvas.width = outW;
      this.canvas.height = outH;
    }

    this.sample.width = cols;
    this.sample.height = rows;
    const sctx = this.sampleCtx;
    sctx.clearRect(0, 0, cols, rows);
    sctx.imageSmoothingEnabled = true;
    sctx.drawImage(source, 0, 0, cols, rows);
    let pixels;
    try {
      pixels = sctx.getImageData(0, 0, cols, rows).data;
    } catch {
      // Tainted canvas (never expected for local media) — draw a safe notice.
      ctx.fillStyle = "#04080a";
      ctx.fillRect(0, 0, outW, outH);
      return null;
    }

    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = "#04080a";
    ctx.fillRect(0, 0, outW, outH);
    ctx.scale(scaleFactor, scaleFactor);
    ctx.font = font;
    ctx.textBaseline = "middle";
    ctx.textAlign = "left";
    ctx.fillStyle = "#8dffb0";

    const textLines = [];
    let currentLine = "";
    const rampMax = palette.length - 1;
    const white = { r: 255, g: 255, b: 255 };

    // We draw row by row; color mode sets fillStyle per character.
    for (let y = 0; y < rows; y++) {
      let lastStyle = "";
      for (let x = 0; x < cols; x++) {
        const i = (y * cols + x) * 4;
        const alpha = pixels[i + 3] / 255;
        let r = pixels[i];
        let g = pixels[i + 1];
        let b = pixels[i + 2];

        if (alpha < 0.02) {
          currentLine += " ";
          continue;
        }

        // Luminance with brightness/contrast (Rec.709).
        let lum = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
        lum *= alpha;
        lum = ((lum - 0.5) * contrast + 0.5) * brightness;
        lum = clamp(lum, 0, 1);
        if (invert) lum = 1 - lum;

        const idx = Math.min(rampMax, Math.floor(lum * rampMax));
        const ch = palette[idx];
        currentLine += ch;

        if (opts.textOnly || ch === " ") continue;

        let style;
        if (colorMode === "color") {
          const adj = (c) => clamp(((c / 255 - 0.5) * contrast + 0.5) * brightness * 255, 0, 255);
          r = adj(r);
          g = adj(g);
          b = adj(b);
          const sat = clamp(1.12, 1, 1.6);
          const avg = (r + g + b) / 3;
          r = clamp(avg + (r - avg) * sat, 0, 255);
          g = clamp(avg + (g - avg) * sat, 0, 255);
          b = clamp(avg + (b - avg) * sat, 0, 255);
          style = `rgb(${r | 0},${g | 0},${b | 0})`;
        } else if (colorMode === "grayscale") {
          const v = Math.round(clamp(lum * 255 * 1.06, 0, 255));
          style = `rgb(${v},${v},${v})`;
        } else {
          const tinted = mix(accent, white, Math.pow(lum, 1.5) * 0.5);
          const a = 0.5 + lum * 0.5;
          style = `rgba(${tinted.r},${tinted.g},${tinted.b},${a.toFixed(3)})`;
        }

        if (style !== lastStyle) {
          ctx.fillStyle = style;
          lastStyle = style;
        }
        ctx.fillText(ch, x * charW, y * cellH + cellH / 2 + fontSize * 0.03);
      }
      textLines.push(currentLine);
      currentLine = "";
    }

    ctx.restore();
    this.lastText = textLines.join("\n");
    this.cols = cols;
    this.rows = rows;
    this.cellW = charW * scaleFactor;
    this.cellH = cellH * scaleFactor;
    this.fontSize = fontSize * scaleFactor;
    this.lastPalette = paletteKey;
    this.lastColorMode = colorMode;
    this.frameCount += 1;
    return { cols, rows, text: this.lastText, width: outW, height: outH };
  }

  getText() {
    return this.lastText;
  }
}
