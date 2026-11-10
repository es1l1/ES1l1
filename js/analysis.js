/**
 * ES1l1 — local analysis utilities.
 * Everything here is computed from prompt text or sampled pixels.
 * There is no object detection / ML inference.
 */

const scratch = document.createElement("canvas");
const scratchCtx = scratch.getContext("2d", { willReadFrequently: true });

export const OBJECT_KEYS = {
  trees: "scene.atmo.trees",
  buildings: "scene.atmo.buildings",
  streetlights: "scene.atmo.streetlights",
  boat: "scene.atmo.boat",
  birds: "scene.atmo.birds",
  waves: "scene.atmo.waves",
  clouds: "scene.atmo.clouds",
  rocks: "scene.atmo.rocks",
  campfire: "scene.atmo.fire",
  reflections: "scene.atmo.reflections",
  rain: "scene.atmo.rain",
  snow: "scene.atmo.snow",
  fog: "scene.atmo.fog",
  stars: "scene.atmo.stars",
  moon: "scene.atmo.moon",
  sun: "scene.atmo.sun",
  neon: "scene.atmo.neon",
  fireflies: "scene.fx.fireflies"
};

export function analyzePixels(source, maxSide = 160) {
  const width = source.videoWidth || source.naturalWidth || source.width;
  const height = source.videoHeight || source.naturalHeight || source.height;
  if (!width || !height) return null;

  const scale = Math.min(1, maxSide / Math.max(width, height));
  const sw = Math.max(2, Math.round(width * scale));
  const sh = Math.max(2, Math.round(height * scale));
  scratch.width = sw;
  scratch.height = sh;
  scratchCtx.clearRect(0, 0, sw, sh);
  scratchCtx.drawImage(source, 0, 0, sw, sh);

  let data;
  try {
    data = scratchCtx.getImageData(0, 0, sw, sh).data;
  } catch {
    return { width, height, aspect: width / height, sampled: false };
  }

  const total = sw * sh;
  let sumL = 0;
  let sumL2 = 0;
  let sumSat = 0;
  const buckets = new Map();
  const luma = new Float32Array(total);

  for (let y = 0; y < sh; y++) {
    for (let x = 0; x < sw; x++) {
      const p = y * sw + x;
      const i = p * 4;
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      const l = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
      luma[p] = l;
      sumL += l;
      sumL2 += l * l;
      const max = Math.max(r, g, b);
      const min = Math.min(r, g, b);
      sumSat += max === 0 ? 0 : (max - min) / max;

      const key = ((r >> 5) << 10) | ((g >> 5) << 5) | (b >> 5);
      let bucket = buckets.get(key);
      if (!bucket) {
        bucket = { r: 0, g: 0, b: 0, n: 0 };
        buckets.set(key, bucket);
      }
      bucket.r += r;
      bucket.g += g;
      bucket.b += b;
      bucket.n += 1;
    }
  }

  const brightness = sumL / total;
  const variance = Math.max(0, sumL2 / total - brightness * brightness);
  const contrast = Math.sqrt(variance);
  const saturation = sumSat / total;

  // Edge density from the sampled luminance grid.
  let edge = 0;
  for (let y = 1; y < sh; y++) {
    for (let x = 1; x < sw; x++) {
      const p = y * sw + x;
      const dx = Math.abs(luma[p] - luma[p - 1]);
      const dy = Math.abs(luma[p] - luma[p - sw]);
      edge += dx + dy;
    }
  }
  const edgeDensity = Math.min(1, edge / ((sw - 1) * (sh - 1) * 2) * 3.2);

  const colors = [...buckets.values()]
    .sort((a, b) => b.n - a.n)
    .slice(0, 5)
    .map((bucket) => ({
      r: Math.round(bucket.r / bucket.n),
      g: Math.round(bucket.g / bucket.n),
      b: Math.round(bucket.b / bucket.n),
      percent: bucket.n / total
    }))
    .map((color) => ({ ...color, hex: rgbToHex(color.r, color.g, color.b) }));

  return {
    width,
    height,
    aspect: width / height,
    orientation: width > height * 1.08 ? "landscape" : height > width * 1.08 ? "portrait" : "square",
    brightness,
    contrast,
    saturation,
    edgeDensity,
    colors,
    sampled: true,
    sampleWidth: sw,
    sampleHeight: sh
  };
}

export function rgbToHex(r, g, b) {
  return "#" + [r, g, b].map((v) => Math.max(0, Math.min(255, v)).toString(16).padStart(2, "0")).join("");
}

export function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) return "—";
  const units = ["B", "KB", "MB", "GB"];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(value >= 10 || unit === 0 ? 0 : 1)} ${units[unit]}`;
}

export function formatDuration(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) return "00:00";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export function buildPromptAnalysis(spec) {
  if (!spec || !spec.raw) return null;
  const groupRows = [
    { group: "environment", key: "analysis.env", valueKey: spec.env ? `scene.env.${spec.env}` : null },
    { group: "subject", key: "analysis.subject", valueKey: spec.subject ? `scene.subject.${spec.subject}` : null },
    { group: "weather", key: "analysis.weather", valueKey: `scene.weather.${spec.weather}` },
    { group: "time", key: "analysis.time", valueKey: `scene.time.${spec.time}` },
    { group: "lighting", key: "analysis.light", valueKey: spec.lighting ? `scene.light.${spec.lighting}` : null },
    { group: "camera", key: "analysis.camera", valueKey: `scene.camera.${spec.camera}` },
    { group: "motion", key: "analysis.motion", valueKey: spec.motion ? `scene.motion.${spec.motion}` : null }
  ];

  const rows = groupRows
    .filter((row) => row.valueKey)
    .map((row) => ({
      labelKey: row.key,
      valueKey: row.valueKey,
      terms: (spec.matched[row.group] || []).flatMap((entry) => entry.terms)
    }));

  if (spec.fx.length) {
    rows.push({
      labelKey: "analysis.effects",
      valueKeys: spec.fx.map((fx) => `scene.fx.${fx}`),
      terms: (spec.matched.fx || []).flatMap((entry) => entry.terms)
    });
  }

  const objectKeys = [...new Set(spec.objects.map((object) => OBJECT_KEYS[object]).filter(Boolean))];
  if (objectKeys.length) {
    rows.push({
      labelKey: "analysis.atmosphere",
      valueKeys: objectKeys,
      terms: (spec.matched.objects || []).flatMap((entry) => entry.terms)
    });
  }

  return { rows, featureCount: spec.featureCount, unmatched: spec.unmatched, spec };
}

/**
 * Estimate real presentation frame rate using requestVideoFrameCallback.
 * Resolves null when the API is unavailable. Never throws.
 */
export function measureVideoFps(video, durationMs = 900) {
  return new Promise((resolve) => {
    if (!video || typeof video.requestVideoFrameCallback !== "function") {
      resolve(null);
      return;
    }
    let frames = 0;
    let firstMediaTime = null;
    let lastMediaTime = null;
    let done = false;
    const start = performance.now();
    let timer = 0;

    const finish = () => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      if (frames >= 3 && firstMediaTime !== null && lastMediaTime !== null && lastMediaTime > firstMediaTime) {
        resolve((frames - 1) / (lastMediaTime - firstMediaTime));
      } else {
        resolve(null);
      }
    };

    const onFrame = (_now, metadata) => {
      frames += 1;
      if (firstMediaTime === null) firstMediaTime = metadata.mediaTime;
      lastMediaTime = metadata.mediaTime;
      if (performance.now() - start >= durationMs) {
        finish();
      } else {
        video.requestVideoFrameCallback(onFrame);
      }
    };

    timer = setTimeout(finish, durationMs + 400);
    try {
      video.requestVideoFrameCallback(onFrame);
    } catch {
      finish();
    }
  });
}
