/**
 * ES1l1 — application controller.
 * Static, client-side only. Ties the prompt interpreter, procedural scene
 * engine, ASCII renderer, media studios and local analysis together.
 */

import { initLanguage, setLang, getLang, t, onLanguageChange } from "./i18n.js";
import { interpretPrompt, SceneEngine } from "./scene.js";
import { AsciiRenderer, PALETTE_LABELS } from "./ascii.js";
import {
  analyzePixels,
  buildPromptAnalysis,
  formatBytes,
  formatDuration,
  measureVideoFps
} from "./analysis.js";

const $ = (id) => document.getElementById(id);
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

const SETTINGS_KEY = "es1l1.settings.v2";
const MAX_FILE = 150 * 1024 * 1024;
const ACCENTS = {
  green: "#8dffb0",
  cyan: "#6ee7ff",
  violet: "#b49bff",
  amber: "#ffcf8a",
  white: "#eafff4"
};

const reduceQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
const DEFAULT_SETTINGS = {
  palette: "standard",
  colorMode: "mono",
  accent: "green",
  fps: 20,
  density: 100,
  scanlines: true,
  reduceMotion: reduceQuery.matches
};

const settings = { ...DEFAULT_SETTINGS };
let currentView = "prompt";
let toastTimer = 0;

/* ------------------------------ small helpers ----------------------------- */

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function showToast(message) {
  const toast = $("toast");
  if (!toast) return;
  toast.textContent = message;
  toast.classList.add("is-visible");
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => toast.classList.remove("is-visible"), 3200);
}

function loadSettings() {
  try {
    const stored = JSON.parse(localStorage.getItem(SETTINGS_KEY) || "null");
    if (!stored || typeof stored !== "object") return;
    if (typeof stored.palette === "string") settings.palette = stored.palette;
    if (["mono", "color", "grayscale"].includes(stored.colorMode)) settings.colorMode = stored.colorMode;
    if (Object.hasOwn(ACCENTS, stored.accent)) settings.accent = stored.accent;
    if (Number.isFinite(stored.fps)) settings.fps = clamp(Math.round(stored.fps), 6, 30);
    if (Number.isFinite(stored.density)) settings.density = clamp(Math.round(stored.density), 48, 180);
    if (typeof stored.scanlines === "boolean") settings.scanlines = stored.scanlines;
    if (typeof stored.reduceMotion === "boolean") settings.reduceMotion = stored.reduceMotion;
  } catch {
    /* Corrupted or blocked storage: defaults are fine. */
  }
}

function saveSettings() {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    /* Storage can be unavailable in private modes; the app still works. */
  }
}

function setPill(el, key, { live = false, error = false } = {}) {
  if (!el) return;
  const text = el.querySelector("span");
  if (text) text.textContent = t(key);
  el.classList.toggle("is-live", live);
  el.classList.toggle("is-error", error);
}

function setPlayIcon(button, playing) {
  if (!button) return;
  const icon = button.querySelector(".icon");
  if (icon) icon.textContent = playing ? "Ⅱ" : "▶";
  button.setAttribute("aria-label", t(playing ? "common.pause" : "common.play"));
}

function blobDownload(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1200);
}

function canvasBlob(canvas) {
  return new Promise((resolve) => {
    if (!canvas || !canvas.width || !canvas.height) {
      resolve(null);
      return;
    }
    try {
      canvas.toBlob((blob) => resolve(blob), "image/png");
    } catch {
      resolve(null);
    }
  });
}

async function downloadCanvasPng(canvas, prefix) {
  const blob = await canvasBlob(canvas);
  if (!blob) {
    showToast(t("toast.noOutput"));
    return;
  }
  blobDownload(blob, `${prefix}-${new Date().toISOString().slice(0, 19).replaceAll(":", "-")}.png`);
  showToast(t("toast.pngSaved"));
}

function downloadText(renderer, prefix) {
  const text = renderer && renderer.getText();
  if (!text) {
    showToast(t("toast.noOutput"));
    return;
  }
  const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
  blobDownload(blob, `${prefix}-${new Date().toISOString().slice(0, 19).replaceAll(":", "-")}.txt`);
  showToast(t("toast.txtSaved"));
}

function accentHex() {
  return ACCENTS[settings.accent] || ACCENTS.green;
}

function asciiOptions(extra = {}) {
  return {
    palette: settings.palette,
    colorMode: settings.colorMode,
    accent: accentHex(),
    density: settings.density,
    brightness: 1,
    contrast: 1,
    invert: false,
    ...extra
  };
}

function requestedFullscreen(el) {
  if (!el || !el.requestFullscreen) {
    showToast(t("toast.exportError"));
    return;
  }
  const request = document.fullscreenElement ? document.exitFullscreen() : el.requestFullscreen();
  if (request && typeof request.catch === "function") {
    request.catch(() => showToast(t("toast.exportError")));
  }
}

/* -------------------------------- language ------------------------------- */

function refreshPaletteLabels() {
  const lang = getLang();
  document.querySelectorAll("select.q-palette, #setPalette").forEach((select) => {
    for (const option of select.options) {
      const label = PALETTE_LABELS[option.value];
      if (label) option.textContent = label[lang] || label.en;
    }
  });
}

function refreshExamples() {
  const host = $("promptExamples");
  if (!host) return;
  host.replaceChildren();
  for (let i = 1; i <= 10; i += 1) {
    const prompt = t(`examples.${i}`);
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "example-chip";
    chip.textContent = `${String(i).padStart(2, "0")} · ${prompt.slice(0, 42)}${prompt.length > 42 ? "…" : ""}`;
    chip.title = prompt;
    chip.addEventListener("click", () => {
      const input = $("promptInput");
      input.value = prompt;
      updatePromptCount();
      generateScene(prompt);
    });
    host.append(chip);
  }
}

function updateGenerateLabel(generated) {
  const label = $("generateBtn")?.querySelector("span");
  if (label) label.textContent = t(generated ? "prompt.regenerate" : "prompt.generate");
}

function refreshCanvasLabels() {
  $("sceneCanvas").setAttribute("aria-label", t("prompt.scene"));
  $("promptAscii").setAttribute("aria-label", t("prompt.terminal"));
  $("imageAscii").setAttribute("aria-label", t("image.ascii"));
  $("videoAscii").setAttribute("aria-label", t("video.preview"));
  $("imageOriginal").alt = t("image.original");
}

function refreshDynamicLanguage() {
  refreshCanvasLabels();
  refreshPaletteLabels();
  refreshExamples();
  updateGenerateLabel(Boolean(promptSpec));
  renderPromptAnalysis(promptSpec);
  if (imageInfo) renderImageAnalysis();
  if (videoInfo) renderVideoAnalysis();
  renderSceneHud();
  refreshImageMeta();
  refreshVideoMeta();
  renderStates();
  updatePromptCount();
  updateGenerateLabel(Boolean(promptSpec));
  if (imageInfo) updateCompareLabel();
  setPlayIcon($("scenePlayBtn"), promptPlaying);
  setPlayIcon($("promptPlayBtn"), promptPlaying);
  setPlayIcon($("videoPlayBtn"), Boolean(videoInfo && !$("videoPreview").paused));
  refreshRecordButtons();
}

/* -------------------------------- state keys ----------------------------- */

let promptPillKey = "status.ready";
let promptPillLive = false;
let terminalKey = "status.waiting";
let imagePillKey = "status.noMedia";
let videoPillKey = "status.noMedia";
let videoPillLive = false;

function renderStates() {
  setPill($("sceneState"), promptPillKey, { live: promptPillLive });
  const terminal = $("promptTerminalState");
  if (terminal) terminal.textContent = t(terminalKey);
  setPill($("imageState"), imagePillKey, { live: imagePillKey === "status.imageReady" });
  setPill($("videoState"), videoPillKey, { live: videoPillLive });
}

/* -------------------------------- view tabs ------------------------------ */

function setView(view) {
  if (!["prompt", "image", "video"].includes(view)) return;
  currentView = view;
  document.querySelectorAll("[data-view-panel]").forEach((panel) => {
    const active = panel.dataset.viewPanel === view;
    panel.classList.toggle("is-active", active);
    panel.hidden = !active;
  });
  document.querySelectorAll("[data-view]").forEach((button) => {
    const active = button.dataset.view === view;
    button.classList.toggle("is-active", active);
    if (active) button.setAttribute("aria-current", "page");
    else button.removeAttribute("aria-current");
  });

  stopPromptLoop();
  stopVideoLoop();

  if (view === "prompt" && promptPlaying && !document.hidden) startPromptLoop();
  if (view === "video" && videoInfo && !$("videoPreview").paused && !document.hidden) startVideoLoop();
}

/* ================================ PROMPT ================================= */

const sceneCanvas = $("sceneCanvas");
const promptAsciiCanvas = $("promptAscii");
const sceneEngine = new SceneEngine(sceneCanvas);
sceneEngine.reduceMotion = settings.reduceMotion;
const promptRenderer = new AsciiRenderer(promptAsciiCanvas);

let promptSpec = null;
let promptPlaying = true;
let promptSpeed = 1;
let promptRaf = 0;
let lastPromptTs = 0;
let sceneAccum = 0;
let asciiAccum = 0;
let asciiFrames = 0;
let asciiFpsStart = 0;

function updatePromptCount() {
  const input = $("promptInput");
  const count = $("promptCount");
  if (input && count) count.textContent = t("prompt.count", { n: input.value.length });
}

function renderSceneHud() {
  const hud = $("sceneSpecHud");
  if (!hud) return;
  if (!promptSpec) {
    hud.textContent = "ENV — · SUBJECT —";
    return;
  }
  const env = t(`scene.env.${promptSpec.env}`).toUpperCase();
  const subject = t(`scene.subject.${promptSpec.subject}`).toUpperCase();
  const time = t(`scene.time.${promptSpec.time}`).toUpperCase();
  hud.textContent = `${env} · ${subject} · ${time}`;
}

function renderPromptAnalysis(spec) {
  const body = $("analysisBody");
  if (!body) return;
  if (!spec) {
    body.innerHTML = `<div class="analysis-empty">${escapeHtml(t("analysis.empty"))}</div>`;
    return;
  }
  const analysis = buildPromptAnalysis(spec);
  if (!analysis) return;

  const valueFor = (row) => {
    if (row.valueKey) return t(row.valueKey);
    return (row.valueKeys || []).map((key) => t(key)).join(" · ");
  };

  const rows = analysis.rows.map((row) => {
    const terms = row.terms.length
      ? `<div class="chips">${row.terms.slice(0, 6).map((term) => `<span class="chip">${escapeHtml(term)}</span>`).join("")}</div>`
      : "";
    return `<div class="analysis-row"><dt>${escapeHtml(t(row.labelKey))}</dt><dd>${escapeHtml(valueFor(row))}</dd></div>${terms}`;
  }).join("");

  const unmatched = spec.unmatched.length
    ? `<div class="analysis-group"><div class="analysis-group-title">${escapeHtml(t("analysis.unsupported"))}</div>
        <div class="chips">${spec.unmatched.slice(0, 14).map((word) => `<span class="chip muted">${escapeHtml(word)}</span>`).join("")}</div>
        <p class="tiny-note">${escapeHtml(t("analysis.unmatched", { words: spec.unmatched.length }))}</p></div>`
    : `<p class="tiny-note">${escapeHtml(t("analysis.noExtra"))}</p>`;

  body.innerHTML = `
    <div class="analysis-summary">
      <strong>${escapeHtml(t("analysis.interpretation"))}</strong>
      <p>${escapeHtml(t("analysis.summaryPrompt", {
        env: t(`scene.env.${spec.env}`),
        subject: t(`scene.subject.${spec.subject}`),
        time: t(`scene.time.${spec.time}`),
        weather: t(`scene.weather.${spec.weather}`)
      }))}</p>
      <div class="chips"><span class="chip">${escapeHtml(t("analysis.matches", { n: spec.featureCount }))}</span></div>
    </div>
    <div class="analysis-group">
      <div class="analysis-group-title">${escapeHtml(t("analysis.supported"))}</div>
      <dl class="analysis-rows">${rows}</dl>
    </div>
    <div class="analysis-group">${unmatched}</div>
    <div class="analysis-group">
      <div class="analysis-group-title">${escapeHtml(t("analysis.implementation"))}</div>
      <p class="tiny-note">${escapeHtml(t("analysis.localRender"))}</p>
      <p class="tiny-note">${escapeHtml(t("analysis.keywordNote"))}</p>
    </div>`;
}

function generateScene(raw, { initial = false } = {}) {
  const text = String(raw ?? $("promptInput").value ?? "").trim();
  if (!text) {
    showToast(t("toast.promptEmpty"));
    $("promptInput")?.focus();
    return;
  }

  promptSpec = interpretPrompt(text);
  sceneEngine.reduceMotion = settings.reduceMotion;
  sceneEngine.setSpec(promptSpec);
  sceneEngine.draw();

  promptPlaying = true;
  sceneAccum = 0;
  asciiAccum = 0;
  asciiFrames = 0;
  asciiFpsStart = performance.now();
  promptPillKey = "status.readyScene";
  promptPillLive = false;
  terminalKey = "status.readyScene";

  renderSceneHud();
  renderPromptAnalysis(promptSpec);
  renderStates();
  setPlayIcon($("scenePlayBtn"), true);
  setPlayIcon($("promptPlayBtn"), true);

  renderPromptAscii(true);
  if (currentView === "prompt" && !document.hidden) startPromptLoop();

  if (!initial) {
    showToast(t("prompt.done"));
    updateGenerateLabel(true);
  } else {
    updateGenerateLabel(false);
  }
}

function renderPromptAscii(force = false) {
  if (!promptSpec) return;
  const result = promptRenderer.render(sceneCanvas, asciiOptions({
    density: settings.density,
    colorMode: settings.colorMode,
    brightness: 1.38,
    contrast: 1.12
  }));
  if (!result) return;
  const dims = $("promptAsciiDims");
  if (dims) dims.textContent = t("ascii.dims", { w: result.cols, h: result.rows });
  const mode = $("promptAsciiMode");
  if (mode) {
    mode.textContent = t(
      settings.colorMode === "color" ? "ascii.modeColor" : settings.colorMode === "grayscale" ? "ascii.modeGray" : "ascii.modeMono"
    );
  }
  if (force) asciiFrames += 1;
}

function startPromptLoop() {
  if (promptRaf || !promptPlaying) return;
  lastPromptTs = performance.now();
  asciiFpsStart = performance.now();
  asciiFrames = 0;

  const frame = (now) => {
    promptRaf = 0;
    if (currentView !== "prompt" || document.hidden || !promptPlaying) return;
    const dt = Math.min(0.05, (now - lastPromptTs) / 1000 || 0.016);
    lastPromptTs = now;

    sceneAccum += dt;
    asciiAccum += dt;

    if (sceneAccum >= 1 / 30) {
      const step = sceneAccum;
      sceneAccum = 0;
      sceneEngine.update(step * promptSpeed);
      sceneEngine.draw();
    }

    const interval = 1 / clamp(settings.fps, 6, 30);
    if (asciiAccum >= interval) {
      asciiAccum = 0;
      renderPromptAscii();
      asciiFrames += 1;
    }

    const elapsed = now - asciiFpsStart;
    if (elapsed >= 600) {
      const fps = Math.round((asciiFrames * 1000) / elapsed);
      const pill = $("promptFps");
      if (pill) pill.textContent = `${fps} FPS`;
      asciiFrames = 0;
      asciiFpsStart = now;
    }

    promptRaf = requestAnimationFrame(frame);
  };

  promptRaf = requestAnimationFrame(frame);
}

function stopPromptLoop() {
  if (promptRaf) cancelAnimationFrame(promptRaf);
  promptRaf = 0;
  const pill = $("promptFps");
  if (pill) pill.textContent = "— FPS";
}

function togglePromptPlaying() {
  promptPlaying = !promptPlaying;
  setPlayIcon($("scenePlayBtn"), promptPlaying);
  setPlayIcon($("promptPlayBtn"), promptPlaying);
  terminalKey = promptPlaying ? "status.live" : "status.paused";
  renderStates();
  if (promptPlaying && currentView === "prompt" && !document.hidden) {
    startPromptLoop();
  } else {
    stopPromptLoop();
    renderPromptAscii(true);
  }
}

function wirePrompt() {
  const input = $("promptInput");
  input.addEventListener("input", updatePromptCount);
  input.addEventListener("keydown", (event) => {
    if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
      event.preventDefault();
      generateScene();
    }
  });
  $("promptClearBtn").addEventListener("click", () => {
    input.value = "";
    updatePromptCount();
    input.focus();
  });
  $("generateBtn").addEventListener("click", () => generateScene());
  $("scenePlayBtn").addEventListener("click", togglePromptPlaying);
  $("promptPlayBtn").addEventListener("click", togglePromptPlaying);
  $("sceneSpeed").addEventListener("change", (event) => {
    promptSpeed = Number(event.target.value) || 1;
  });
  $("scenePngBtn").addEventListener("click", () => downloadCanvasPng(sceneCanvas, "es1l1-scene"));
  $("promptPngBtn").addEventListener("click", () => downloadCanvasPng(promptAsciiCanvas, "es1l1-ascii"));
  $("promptTxtBtn").addEventListener("click", () => downloadText(promptRenderer, "es1l1-ascii"));
  $("sceneFullBtn").addEventListener("click", () => requestedFullscreen($("sceneFrame")));
  $("promptFullBtn").addEventListener("click", () => requestedFullscreen($("promptTerminalWrap")));
}

/* =============================== RECORDING =============================== */

let promptRecorder = null;
let videoRecorder = null;
let recordingSupported = true;

function pickVideoMime() {
  if (typeof MediaRecorder === "undefined" || typeof MediaRecorder.isTypeSupported !== "function") return "";
  const candidates = ["video/webm;codecs=vp9", "video/webm;codecs=vp8", "video/webm"];
  return candidates.find((type) => MediaRecorder.isTypeSupported(type)) || "";
}

function recordingAvailable(canvas) {
  return typeof MediaRecorder !== "undefined" &&
    typeof canvas.captureStream === "function" &&
    Boolean(pickVideoMime());
}

function refreshRecordButtons() {
  const promptBtn = $("promptRecBtn");
  const videoBtn = $("videoRecBtn");
  if (promptBtn) {
    promptBtn.disabled = !recordingSupported;
    promptBtn.title = recordingSupported ? t("prompt.recordHint") : t("toast.recUnsupported");
    const span = promptBtn.querySelector("span");
    if (span) span.textContent = t(promptRecorder ? "common.stop" : "common.record");
    promptBtn.classList.toggle("is-recording", Boolean(promptRecorder));
  }
  if (videoBtn) {
    videoBtn.disabled = !recordingSupported || !videoInfo;
    videoBtn.title = recordingSupported ? t("prompt.recordHint") : t("toast.recUnsupported");
    const span = videoBtn.querySelector("span");
    if (span) span.textContent = t(videoRecorder ? "common.stop" : "video.record");
    videoBtn.classList.toggle("is-recording", Boolean(videoRecorder));
    videoBtn.classList.toggle("is-hidden", !recordingSupported && !videoInfo);
  }
}

function startCanvasRecording(canvas, onDone) {
  const mime = pickVideoMime();
  if (!recordingAvailable(canvas)) {
    showToast(t("toast.recUnsupported"));
    return null;
  }
  let stream;
  try {
    stream = canvas.captureStream(Math.max(12, Math.min(30, settings.fps)));
    const recorder = mime
      ? new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 2_400_000 })
      : new MediaRecorder(stream);
    const chunks = [];
    const fps = Math.max(12, Math.min(30, settings.fps));
    const videoTrack = stream.getVideoTracks()[0];
    let frameTimer = 0;
    // Force frames even when the canvas is static or rAF is throttled.
    if (videoTrack && typeof videoTrack.requestFrame === "function") {
      frameTimer = window.setInterval(() => {
        try { videoTrack.requestFrame(); } catch { /* track ended */ }
      }, 1000 / fps);
    }
    recorder.addEventListener("dataavailable", (event) => {
      if (event.data && event.data.size) chunks.push(event.data);
    });
    recorder.addEventListener("stop", () => {
      clearInterval(frameTimer);
      stream.getTracks().forEach((track) => track.stop());
      if (chunks.length) {
        const blob = new Blob(chunks, { type: mime || "video/webm" });
        blobDownload(blob, `es1l1-ascii-${new Date().toISOString().slice(0, 19).replaceAll(":", "-")}.webm`);
        showToast(t("toast.recSaved"));
      }
      onDone();
    });
    recorder.addEventListener("error", () => {
      clearInterval(frameTimer);
      stream.getTracks().forEach((track) => track.stop());
      showToast(t("toast.exportError"));
      onDone();
    });
    recorder.start();
    return recorder;
  } catch {
    stream?.getTracks().forEach((track) => track.stop());
    showToast(t("toast.recUnsupported"));
    return null;
  }
}

function togglePromptRecording() {
  if (promptRecorder) {
    promptRecorder.stop();
    promptRecorder = null;
    terminalKey = promptPlaying ? "status.live" : "status.paused";
    renderStates();
    refreshRecordButtons();
    return;
  }
  let recorder;
  recorder = startCanvasRecording(promptAsciiCanvas, () => {
    if (promptRecorder === recorder) promptRecorder = null;
    renderStates();
    refreshRecordButtons();
  });
  if (!recorder) return;
  promptRecorder = recorder;
  terminalKey = "status.recording";
  renderStates();
  refreshRecordButtons();
  showToast(t("toast.recStarted"));
}

function toggleVideoRecording() {
  if (videoRecorder) {
    videoRecorder.stop();
    videoRecorder = null;
    videoPillKey = $("videoPreview").paused ? "status.videoReady" : "status.live";
    renderStates();
    refreshRecordButtons();
    return;
  }
  let recorder;
  recorder = startCanvasRecording($("videoAscii"), () => {
    if (videoRecorder === recorder) videoRecorder = null;
    renderStates();
    refreshRecordButtons();
  });
  if (!recorder) return;
  videoRecorder = recorder;
  videoPillKey = "status.recording";
  renderStates();
  refreshRecordButtons();
  showToast(t("toast.recStarted"));
  const video = $("videoPreview");
  if (video.paused) video.play().catch(() => {});
}

function wireRecording() {
  const promptCanvas = promptAsciiCanvas;
  const videoCanvas = $("videoAscii");
  recordingSupported = recordingAvailable(promptCanvas) && recordingAvailable(videoCanvas);
  refreshRecordButtons();
  $("promptRecBtn").addEventListener("click", togglePromptRecording);
  $("videoRecBtn").addEventListener("click", toggleVideoRecording);
}

/* ================================= IMAGE ================================= */

const imageInput = $("imageInput");
const imageEl = $("imageOriginal");
const imageCanvas = $("imageAscii");
const imageRenderer = new AsciiRenderer(imageCanvas);
let imageInfo = null;
let imageUrl = null;
let imageRenderTimer = 0;

function refreshImageMeta() {
  const palette = $("imagePaletteLabel");
  if (!palette) return;
  const label = PALETTE_LABELS[settings.palette];
  palette.textContent = label ? label[getLang()] || label.en : settings.palette;
  if (imageInfo) updateCompareLabel();
}

function updateCompareLabel() {
  const slider = $("imageCompare");
  const label = $("imageCompareLabel");
  if (!slider || !label) return;
  label.textContent = t("image.compareLabel", { n: slider.value });
}

function applyImageCompare() {
  const slider = $("imageCompare");
  const value = Number(slider.value);
  imageCanvas.style.clipPath = `inset(0 0 0 ${value}%)`;
  const divider = $("compareDivider");
  if (divider) divider.style.left = `${value}%`;
  updateCompareLabel();
}

function renderImageAnalysis() {
  const host = $("imageAnalysis");
  if (!host || !imageInfo) return;
  const stats = analyzePixels(imageEl, 150);
  if (!stats || !stats.sampled) {
    host.innerHTML = `<div class="analysis-empty">${escapeHtml(t("analysis.empty"))}</div>`;
    return;
  }
  const orientation = t(`analysis.${stats.orientation}`);
  const colors = stats.colors || [];
  const swatches = colors.map((color) =>
    `<span class="swatch" style="background:${color.hex}" title="${color.hex} · ${Math.round(color.percent * 100)}%"></span>`
  ).join("");
  const hexes = colors.map((color) => `<span class="chip">${color.hex}</span>`).join("");

  const tile = (label, value) =>
    `<div class="analysis-tile"><span class="tile-label">${escapeHtml(label)}</span><span class="tile-value">${escapeHtml(value)}</span></div>`;

  host.innerHTML = `
    <div class="analysis-tiles">
      ${tile(t("analysis.dimensions"), `${stats.width} × ${stats.height}`)}
      ${tile(t("analysis.aspect"), `${stats.aspect.toFixed(2)} : 1`)}
      ${tile(t("analysis.orientation"), orientation)}
      ${tile(t("analysis.size"), formatBytes(imageInfo.file.size))}
      ${tile(t("analysis.brightness"), `${Math.round(stats.brightness * 100)}%`)}
      ${tile(t("analysis.contrast"), stats.contrast.toFixed(3))}
      ${tile(t("analysis.saturation"), `${Math.round(stats.saturation * 100)}%`)}
      ${tile(t("analysis.edges"), `${Math.round(stats.edgeDensity * 100)}%`)}
    </div>
    <div class="analysis-group">
      <div class="analysis-group-title">${escapeHtml(t("analysis.colors"))}</div>
      <div class="swatches">${swatches || ""}</div>
      <div class="chips">${hexes}</div>
    </div>
    <p class="tiny-note">${escapeHtml(t("analysis.pixelNote"))}</p>`;
}

function renderImage() {
  if (!imageInfo || !imageEl.complete || !imageEl.naturalWidth) return;
  const result = imageRenderer.render(imageEl, asciiOptions({
    density: settings.density,
    colorMode: settings.colorMode,
    brightness: Number($("imageBrightness").value),
    contrast: Number($("imageContrast").value),
    invert: $("imageInvert").checked
  }));
  if (!result) return;
  $("imageAsciiDims").textContent = t("ascii.dims", { w: result.cols, h: result.rows });
  $("imagePngBtn").disabled = false;
  $("imageTxtBtn").disabled = false;
  applyImageCompare();
  imagePillKey = "status.imageReady";
  renderStates();
}

function scheduleImageRender() {
  clearTimeout(imageRenderTimer);
  imageRenderTimer = window.setTimeout(renderImage, 90);
}

function updateImageLabels() {
  $("imageBrightnessVal").textContent = Number($("imageBrightness").value).toFixed(2);
  $("imageContrastVal").textContent = Number($("imageContrast").value).toFixed(2);
}

function loadImageFile(file) {
  if (!file) return;
  if (!file.type.startsWith("image/")) {
    showToast(t("toast.invalidFile"));
    return;
  }
  if (file.size > MAX_FILE) {
    showToast(t("toast.tooLarge"));
    return;
  }

  clearImage({ silent: true });
  imageUrl = URL.createObjectURL(file);
  imageInfo = { file };

  $("imageName").textContent = file.name;
  $("imageName").classList.add("has-file");
  $("imageState").classList.remove("is-error");
  imagePillKey = "status.analyzing";
  renderStates();

  imageEl.onload = () => {
    $("imageEmpty").classList.add("is-hidden");
    $("imageFrame").classList.remove("is-hidden");
    $("imageEmpty").hidden = true;
    $("imageFrame").hidden = false;
    $("imageFullBtn").disabled = false;
    $("imagePngBtn").disabled = false;
    $("imageTxtBtn").disabled = false;
    renderImage();
    renderImageAnalysis();
    refreshImageMeta();
    showToast(t("image.ready"));
  };
  imageEl.onerror = () => {
    showToast(t("toast.imageError"));
    imagePillKey = "status.error";
    renderStates();
    clearImage({ silent: true });
  };
  imageEl.src = imageUrl;
}

function clearImage({ silent = false } = {}) {
  clearTimeout(imageRenderTimer);
  if (imageUrl) URL.revokeObjectURL(imageUrl);
  imageUrl = null;
  imageInfo = null;
  imageEl.onload = null;
  imageEl.onerror = null;
  imageEl.removeAttribute("src");
  const ctx = imageCanvas.getContext("2d");
  ctx.clearRect(0, 0, imageCanvas.width, imageCanvas.height);
  imageCanvas.width = 0;
  imageCanvas.height = 0;
  $("imageName").textContent = t("image.none");
  $("imageName").classList.remove("has-file");
  $("imageEmpty").classList.remove("is-hidden");
  $("imageEmpty").hidden = false;
  $("imageFrame").classList.add("is-hidden");
  $("imageFrame").hidden = true;
  $("imageFullBtn").disabled = true;
  $("imagePngBtn").disabled = true;
  $("imageTxtBtn").disabled = true;
  $("imageAsciiDims").textContent = t("ascii.dims", { w: 0, h: 0 });
  $("imageAnalysis").innerHTML = `<div class="analysis-empty">${escapeHtml(t("analysis.empty"))}</div>`;
  imagePillKey = "status.noMedia";
  renderStates();
  if (!silent) {
    showToast(t("toast.imageCleared"));
    imageInput.value = "";
  }
}

function wireImage() {
  imageInput.addEventListener("change", (event) => {
    loadImageFile(event.target.files && event.target.files[0]);
    event.target.value = "";
  });

  ["dragenter", "dragover"].forEach((type) => {
    $("imageDrop").addEventListener(type, (event) => {
      event.preventDefault();
      $("imageDrop").classList.add("is-dragover");
    });
  });
  ["dragleave", "dragend"].forEach((type) => {
    $("imageDrop").addEventListener(type, () => $("imageDrop").classList.remove("is-dragover"));
  });
  $("imageDrop").addEventListener("drop", (event) => {
    event.preventDefault();
    $("imageDrop").classList.remove("is-dragover");
    loadImageFile(event.dataTransfer.files && event.dataTransfer.files[0]);
  });

  $("imageClearBtn").addEventListener("click", () => clearImage());
  $("imagePngBtn").addEventListener("click", () => downloadCanvasPng(imageCanvas, "es1l1-image-ascii"));
  $("imageTxtBtn").addEventListener("click", () => downloadText(imageRenderer, "es1l1-image-ascii"));
  $("imageFullBtn").addEventListener("click", () => requestedFullscreen($("imageFrame")));
  $("imageCompare").addEventListener("input", applyImageCompare);

  ["imageBrightness", "imageContrast"].forEach((id) => {
    $(id).addEventListener("input", () => {
      updateImageLabels();
      scheduleImageRender();
    });
  });
  $("imageInvert").addEventListener("change", renderImage);

  updateImageLabels();
  applyImageCompare();
  refreshImageMeta();
}

/* ================================= VIDEO ================================= */

const videoInput = $("videoInput");
const videoEl = $("videoPreview");
const videoCanvas = $("videoAscii");
const videoRenderer = new AsciiRenderer(videoCanvas);
let videoInfo = null;
let videoUrl = null;
let videoRaf = 0;
let lastVideoTs = 0;
let videoAccum = 0;
let videoFrames = 0;
let videoFpsStart = 0;
let lastVideoAnalysis = 0;
let videoStats = null;
let measuredVideoFps = null;
let fpsProbeStarted = false;

function refreshVideoMeta() {
  const inline = $("videoMetaInline");
  if (!inline) return;
  if (!videoInfo) {
    inline.textContent = "—";
    return;
  }
  inline.textContent = t("video.meta", {
    d: formatDuration(videoEl.duration || 0),
    w: videoEl.videoWidth || videoInfo.width || 0,
    h: videoEl.videoHeight || videoInfo.height || 0
  });
}

function renderVideoAnalysis() {
  const host = $("videoAnalysis");
  if (!host || !videoInfo) return;
  const stats = videoStats;
  const width = videoEl.videoWidth || videoInfo.width || 0;
  const height = videoEl.videoHeight || videoInfo.height || 0;
  const tile = (label, value) =>
    `<div class="analysis-tile"><span class="tile-label">${escapeHtml(label)}</span><span class="tile-value">${escapeHtml(value)}</span></div>`;

  let statsHtml = `<div class="analysis-empty">${escapeHtml(t("analysis.empty"))}</div>`;
  if (stats && stats.sampled) {
    statsHtml = `
      <div class="analysis-tiles">
        ${tile(t("analysis.brightness"), `${Math.round(stats.brightness * 100)}%`)}
        ${tile(t("analysis.contrast"), stats.contrast.toFixed(3))}
        ${tile(t("analysis.saturation"), `${Math.round(stats.saturation * 100)}%`)}
        ${tile(t("analysis.edges"), `${Math.round(stats.edgeDensity * 100)}%`)}
      </div>
      <div class="swatches">${(stats.colors || []).map((color) =>
        `<span class="swatch" style="background:${color.hex}" title="${color.hex} · ${Math.round(color.percent * 100)}%"></span>`
      ).join("")}</div>`;
  }

  const fps = measuredVideoFps
    ? `${measuredVideoFps.toFixed(1)} fps`
    : t("analysis.videoUnknownFps");

  host.innerHTML = `
    <div class="analysis-tiles">
      ${tile(t("analysis.duration"), formatDuration(videoEl.duration || 0))}
      ${tile(t("analysis.resolution"), `${width} × ${height}`)}
      ${tile(t("analysis.size"), formatBytes(videoInfo.file.size))}
      ${tile(t("analysis.framerate"), fps)}
    </div>
    <p class="tiny-note">${escapeHtml(videoInfo.file.name)}</p>
    <div class="analysis-group">
      <div class="analysis-group-title">${escapeHtml(t("analysis.frameStats"))}</div>
      ${statsHtml}
    </div>`;
}

function renderVideoFrame(updateAnalysis = false) {
  if (!videoInfo || videoEl.readyState < 2) return;
  const result = videoRenderer.render(videoEl, asciiOptions({
    density: settings.density,
    colorMode: settings.colorMode,
    brightness: Number($("videoBrightness").value),
    contrast: Number($("videoContrast").value),
    invert: $("videoInvert").checked
  }));
  if (!result) return;
  $("videoAsciiDims").textContent = t("ascii.dims", { w: result.cols, h: result.rows });
  $("videoPngBtn").disabled = false;
  $("videoTxtBtn").disabled = false;
  if (updateAnalysis) {
    videoStats = analyzePixels(videoEl, 140);
    renderVideoAnalysis();
  }
}

function updateVideoClock() {
  if (!videoInfo) return;
  const duration = Number.isFinite(videoEl.duration) ? videoEl.duration : 0;
  $("videoTime").textContent = `${formatDuration(videoEl.currentTime)} / ${formatDuration(duration)}`;
  const seek = $("videoSeek");
  if (duration && document.activeElement !== seek) {
    seek.value = String(Math.round((videoEl.currentTime / duration) * 1000));
  }
}

function startVideoLoop() {
  if (videoRaf || !videoInfo) return;
  lastVideoTs = performance.now();
  videoFpsStart = performance.now();
  videoFrames = 0;

  const frame = (now) => {
    videoRaf = 0;
    if (currentView !== "video" || document.hidden || videoEl.paused) return;
    const dt = Math.min(0.12, (now - lastVideoTs) / 1000 || 0.016);
    lastVideoTs = now;
    videoAccum += dt;

    const interval = 1 / clamp(Number($("videoFps").value) || 18, 6, 30);
    if (videoAccum >= interval) {
      videoAccum = 0;
      renderVideoFrame(false);
      videoFrames += 1;
    }

    const elapsed = now - videoFpsStart;
    if (elapsed >= 700) {
      $("videoFpsLive").textContent = `${Math.round((videoFrames * 1000) / elapsed)} FPS`;
      videoFrames = 0;
      videoFpsStart = now;
    }

    if (now - lastVideoAnalysis > 2000) {
      lastVideoAnalysis = now;
      videoStats = analyzePixels(videoEl, 130);
      renderVideoAnalysis();
    }

    updateVideoClock();
    videoRaf = requestAnimationFrame(frame);
  };

  videoRaf = requestAnimationFrame(frame);
}

function stopVideoLoop() {
  if (videoRaf) cancelAnimationFrame(videoRaf);
  videoRaf = 0;
  $("videoFpsLive").textContent = "— FPS";
}

function toggleVideoPlayback() {
  if (!videoInfo) return;
  if (videoEl.paused) {
    videoEl.play().catch(() => showToast(t("toast.videoError")));
  } else {
    videoEl.pause();
  }
}

function loadVideoFile(file) {
  if (!file) return;
  const valid = file.type.startsWith("video/") || /\.(mp4|webm|mov|m4v|ogv)$/i.test(file.name);
  if (!valid) {
    showToast(t("toast.invalidFile"));
    return;
  }
  if (file.size > MAX_FILE) {
    showToast(t("toast.tooLarge"));
    return;
  }

  clearVideo({ silent: true });
  videoUrl = URL.createObjectURL(file);
  videoInfo = { file, width: 0, height: 0 };

  $("videoName").textContent = file.name;
  $("videoName").classList.add("has-file");
  videoPillKey = "status.analyzing";
  renderStates();

  videoEl.onloadedmetadata = () => {
    if (!videoInfo) return;
    videoInfo.width = videoEl.videoWidth;
    videoInfo.height = videoEl.videoHeight;
    $("videoEmpty").classList.add("is-hidden");
    $("videoEmpty").hidden = true;
    $("videoPanes").classList.remove("is-hidden");
    $("videoPanes").hidden = false;
    $("videoPlayBtn").disabled = false;
    $("videoSeek").disabled = false;
    $("videoPngBtn").disabled = true;
    $("videoTxtBtn").disabled = true;
    $("videoRecBtn").disabled = !recordingSupported;
    $("videoSeek").disabled = !Number.isFinite(videoEl.duration);
    videoPillKey = "status.videoReady";
    renderStates();
    refreshVideoMeta();
    refreshRecordButtons();
    updateVideoClock();
    renderVideoFrame(true);
    renderVideoAnalysis();
    showToast(t("video.ready"));

    // A paused video at t=0 may not have presented a decodable frame yet.
    // Nudge it slightly so the ASCII pane and exports never start blank.
    if (videoEl.currentTime < 0.01) {
      const duration = videoEl.duration;
      const target = Number.isFinite(duration) && duration > 0.12
        ? Math.min(0.05, duration / 2)
        : 0.05;
      try { videoEl.currentTime = target; } catch { /* seek not ready yet */ }
    }
  };

  videoEl.onloadeddata = () => {
    if (!videoInfo) return;
    renderVideoFrame(true);
    updateVideoClock();
    refreshVideoMeta();
  };

  videoEl.ondurationchange = () => {
    if (!videoInfo) return;
    $("videoSeek").disabled = !Number.isFinite(videoEl.duration);
    refreshVideoMeta();
    updateVideoClock();
  };

  videoEl.onerror = () => {
    showToast(t("toast.videoError"));
    videoPillKey = "status.error";
    renderStates();
    clearVideo({ silent: true });
  };

  videoEl.onplay = () => {
    videoPillKey = "status.live";
    videoPillLive = true;
    renderStates();
    setPlayIcon($("videoPlayBtn"), true);
    startVideoLoop();
    if (!fpsProbeStarted) {
      fpsProbeStarted = true;
      measureVideoFps(videoEl, 900).then((fps) => {
        if (fps) {
          measuredVideoFps = fps;
          renderVideoAnalysis();
        }
      }).catch(() => {});
    }
  };

  videoEl.onpause = () => {
    videoPillKey = "status.videoReady";
    videoPillLive = false;
    renderStates();
    setPlayIcon($("videoPlayBtn"), false);
    stopVideoLoop();
    updateVideoClock();
    renderVideoFrame(true);
  };

  videoEl.onended = () => {
    videoPillKey = "status.ended";
    videoPillLive = false;
    renderStates();
    setPlayIcon($("videoPlayBtn"), false);
    stopVideoLoop();
    updateVideoClock();
    if (videoRecorder) toggleVideoRecording();
  };

  videoEl.onseeked = () => {
    updateVideoClock();
    if (videoEl.paused) renderVideoFrame(true);
  };

  videoEl.src = videoUrl;
  videoEl.load();
}

function clearVideo({ silent = false } = {}) {
  stopVideoLoop();
  if (videoRecorder) {
    try { videoRecorder.stop(); } catch { /* already stopped */ }
    videoRecorder = null;
  }
  if (videoUrl) URL.revokeObjectURL(videoUrl);
  videoUrl = null;
  videoInfo = null;
  videoStats = null;
  measuredVideoFps = null;
  fpsProbeStarted = false;
  videoEl.onloadedmetadata = null;
  videoEl.onerror = null;
  videoEl.onplay = null;
  videoEl.onpause = null;
  videoEl.onended = null;
  videoEl.onseeked = null;
  videoEl.onloadeddata = null;
  videoEl.ondurationchange = null;
  videoEl.pause();
  videoEl.removeAttribute("src");
  videoEl.load();

  $("videoName").textContent = t("video.none");
  $("videoName").classList.remove("has-file");
  $("videoEmpty").classList.remove("is-hidden");
  $("videoEmpty").hidden = false;
  $("videoPanes").classList.add("is-hidden");
  $("videoPanes").hidden = true;
  $("videoPlayBtn").disabled = true;
  $("videoSeek").disabled = true;
  $("videoPngBtn").disabled = true;
  $("videoTxtBtn").disabled = true;
  $("videoRecBtn").disabled = true;
  $("videoAsciiDims").textContent = t("ascii.dims", { w: 0, h: 0 });
  $("videoMetaInline").textContent = "—";
  $("videoTime").textContent = "00:00 / 00:00";
  $("videoFpsLive").textContent = "— FPS";
  $("videoSeek").value = "0";
  $("videoAnalysis").innerHTML = `<div class="analysis-empty">${escapeHtml(t("analysis.empty"))}</div>`;
  videoPillKey = "status.noMedia";
  videoPillLive = false;
  renderStates();
  refreshRecordButtons();
  if (!silent) {
    showToast(t("toast.videoCleared"));
    videoInput.value = "";
  }
}

function wireVideo() {
  videoInput.addEventListener("change", (event) => {
    loadVideoFile(event.target.files && event.target.files[0]);
    event.target.value = "";
  });

  ["dragenter", "dragover"].forEach((type) => {
    $("videoDrop").addEventListener(type, (event) => {
      event.preventDefault();
      $("videoDrop").classList.add("is-dragover");
    });
  });
  ["dragleave", "dragend"].forEach((type) => {
    $("videoDrop").addEventListener(type, () => $("videoDrop").classList.remove("is-dragover"));
  });
  $("videoDrop").addEventListener("drop", (event) => {
    event.preventDefault();
    $("videoDrop").classList.remove("is-dragover");
    loadVideoFile(event.dataTransfer.files && event.dataTransfer.files[0]);
  });

  $("videoClearBtn").addEventListener("click", () => clearVideo());
  $("videoPlayBtn").addEventListener("click", toggleVideoPlayback);
  $("videoSeek").addEventListener("input", (event) => {
    if (!videoInfo || !Number.isFinite(videoEl.duration)) return;
    videoEl.currentTime = (Number(event.target.value) / 1000) * videoEl.duration;
  });
  $("videoSpeed").addEventListener("change", (event) => {
    videoEl.playbackRate = Number(event.target.value) || 1;
  });
  $("videoPngBtn").addEventListener("click", () => downloadCanvasPng(videoCanvas, "es1l1-video-ascii"));
  $("videoTxtBtn").addEventListener("click", () => downloadText(videoRenderer, "es1l1-video-ascii"));

  ["videoBrightness", "videoContrast"].forEach((id) => {
    $(id).addEventListener("input", () => {
      if (id === "videoBrightness") $("videoBrightnessVal").textContent = Number($(id).value).toFixed(2);
      else $("videoContrastVal").textContent = Number($(id).value).toFixed(2);
      if (videoInfo && videoEl.paused) renderVideoFrame(false);
    });
  });
  $("videoInvert").addEventListener("change", () => {
    if (videoInfo && videoEl.paused) renderVideoFrame(false);
  });

  $("videoBrightnessVal").textContent = Number($("videoBrightness").value).toFixed(2);
  $("videoContrastVal").textContent = Number($("videoContrast").value).toFixed(2);
}

/* ================================ SETTINGS =============================== */

function syncStudioControls() {
  document.querySelectorAll(".q-palette").forEach((select) => { select.value = settings.palette; });
  document.querySelectorAll(".q-color").forEach((select) => { select.value = settings.colorMode; });
  document.querySelectorAll(".q-density").forEach((input) => { input.value = String(settings.density); });
  document.querySelectorAll(".q-density-value").forEach((output) => { output.textContent = String(settings.density); });
  document.querySelectorAll("input[type=range].seek, input[type=range].q-density").forEach((input) => {
    if (input.classList.contains("q-density")) input.value = String(settings.density);
  });
  const videoFps = $("videoFps");
  if (videoFps) videoFps.value = String(settings.fps);
  const videoFpsVal = $("videoFpsVal");
  if (videoFpsVal) videoFpsVal.textContent = String(settings.fps);
}

function applySettingsToUI() {
  document.body.dataset.accent = settings.accent;
  document.body.classList.toggle("no-scanlines", !settings.scanlines);
  const setPalette = $("setPalette");
  const setColorMode = $("setColorMode");
  const setAccent = $("setAccent");
  const setFps = $("setFps");
  const setFpsVal = $("setFpsVal");
  const setDensity = $("setDensity");
  const setDensityVal = $("setDensityVal");
  const setScanlines = $("setScanlines");
  const setReduceMotion = $("setReduceMotion");
  if (setPalette) setPalette.value = settings.palette;
  if (setColorMode) setColorMode.value = settings.colorMode;
  if (setAccent) setAccent.value = settings.accent;
  if (setFps) setFps.value = String(settings.fps);
  if (setFpsVal) setFpsVal.textContent = String(settings.fps);
  if (setDensity) setDensity.value = String(settings.density);
  if (setDensityVal) setDensityVal.textContent = String(settings.density);
  if (setScanlines) setScanlines.checked = settings.scanlines;
  if (setReduceMotion) setReduceMotion.checked = settings.reduceMotion;
  sceneEngine.reduceMotion = settings.reduceMotion;
  syncStudioControls();
  refreshPaletteLabels();
}

function rerenderEverything() {
  if (promptSpec) {
    sceneEngine.draw();
    renderPromptAscii(true);
    renderPromptAnalysis(promptSpec);
  }
  if (imageInfo) {
    renderImage();
    renderImageAnalysis();
  }
  if (videoInfo) {
    if (videoEl.paused) renderVideoFrame(false);
    renderVideoAnalysis();
  }
  refreshImageMeta();
}

let rerenderTimer = 0;

function scheduleRerender() {
  clearTimeout(rerenderTimer);
  rerenderTimer = window.setTimeout(rerenderEverything, 110);
}

function updateSetting(key, value) {
  settings[key] = value;
  saveSettings();
  applySettingsToUI();
  scheduleRerender();
}

function wireSettings() {
  $("settingsBtn").addEventListener("click", () => {
    const dialog = $("settingsDialog");
    if (typeof dialog.showModal === "function") dialog.showModal();
    else dialog.setAttribute("open", "");
  });

  $("settingsDialog").addEventListener("click", (event) => {
    if (event.target === $("settingsDialog")) $("settingsDialog").close();
  });

  $("setLang").addEventListener("change", (event) => setLang(event.target.value));
  $("setPalette").addEventListener("change", (event) => updateSetting("palette", event.target.value));
  $("setColorMode").addEventListener("change", (event) => updateSetting("colorMode", event.target.value));
  $("setAccent").addEventListener("change", (event) => updateSetting("accent", event.target.value));
  $("setFps").addEventListener("input", (event) => {
    $("setFpsVal").textContent = event.target.value;
    updateSetting("fps", Number(event.target.value));
  });
  $("setDensity").addEventListener("input", (event) => {
    $("setDensityVal").textContent = event.target.value;
    updateSetting("density", Number(event.target.value));
  });
  $("setScanlines").addEventListener("change", (event) => updateSetting("scanlines", event.target.checked));
  $("setReduceMotion").addEventListener("change", (event) => updateSetting("reduceMotion", event.target.checked));

  $("resetSettings").addEventListener("click", () => {
    Object.assign(settings, DEFAULT_SETTINGS);
    saveSettings();
    applySettingsToUI();
    rerenderEverything();
    showToast(t("toast.resetDone"));
  });
}

/* --------------------- shared studio quick controls ---------------------- */

function wireStudioControls() {
  document.querySelectorAll(".q-palette").forEach((select) => {
    select.addEventListener("change", (event) => updateSetting("palette", event.target.value));
  });
  document.querySelectorAll(".q-color").forEach((select) => {
    select.addEventListener("change", (event) => updateSetting("colorMode", event.target.value));
  });
  document.querySelectorAll(".q-density").forEach((input) => {
    input.addEventListener("input", (event) => {
      const value = clamp(Number(event.target.value), 48, 180);
      $("setDensity").value = String(value);
      $("setDensityVal").textContent = String(value);
      updateSetting("density", value);
    });
  });
  $("videoFps").addEventListener("input", (event) => {
    const value = clamp(Number(event.target.value), 6, 30);
    $("videoFpsVal").textContent = String(value);
    $("setFps").value = String(value);
    $("setFpsVal").textContent = String(value);
    updateSetting("fps", value);
  });
}

/* ---------------------------- language & globals -------------------------- */

function wireLanguage() {
  document.querySelectorAll("[data-lang]").forEach((button) => {
    button.addEventListener("click", () => setLang(button.dataset.lang));
  });

  setLang(getLang(), { persist: false });
  $("setLang").value = getLang();

  onLanguageChange(() => {
    $("setLang").value = getLang();
    refreshDynamicLanguage();
    updateImageLabels();
    if (imageInfo) updateCompareLabel();
  });
}

function wireKeyboard() {
  document.addEventListener("keydown", (event) => {
    const tag = event.target?.tagName;
    if (["INPUT", "TEXTAREA", "SELECT"].includes(tag) || event.target?.isContentEditable) return;
    if ($("settingsDialog").open) return;

    if (event.code === "Space") {
      event.preventDefault();
      if (currentView === "prompt") togglePromptPlaying();
      if (currentView === "video") toggleVideoPlayback();
    } else if (event.key === "1") {
      setView("prompt");
    } else if (event.key === "2") {
      setView("image");
    } else if (event.key === "3") {
      setView("video");
    } else if (event.key.toLowerCase() === "f") {
      if (currentView === "prompt") requestedFullscreen($("sceneFrame"));
      else if (currentView === "image" && imageInfo) requestedFullscreen($("imageFrame"));
      else if (currentView === "video" && videoInfo) requestedFullscreen($("videoPanes"));
    }
  });
}

function wireVisibility() {
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      stopPromptLoop();
      stopVideoLoop();
    } else {
      if (currentView === "prompt" && promptPlaying) startPromptLoop();
      if (currentView === "video" && videoInfo && !videoEl.paused) startVideoLoop();
    }
  });
}

function wireTabs() {
  document.querySelectorAll("[data-view]").forEach((button) => {
    button.addEventListener("click", () => setView(button.dataset.view));
  });
}

/* ---------------------------------- boot --------------------------------- */

function boot() {
  loadSettings();
  initLanguage();
  applySettingsToUI();
  refreshPaletteLabels();

  wireLanguage();
  wireTabs();
  wirePrompt();
  wireImage();
  wireVideo();
  wireRecording();
  wireSettings();
  wireStudioControls();
  wireKeyboard();
  wireVisibility();

  refreshCanvasLabels();

  updatePromptCount();
  updateImageLabels();
  refreshImageMeta();
  applyImageCompare();
  updateGenerateLabel(false);

  // A default procedural scene makes the studio legible before the first prompt.
  generateScene(t("prompt.defaultScene"), { initial: true });
  setView("prompt");
  renderStates();

  requestAnimationFrame(() => {
    if (currentView === "prompt" && promptPlaying) startPromptLoop();
  });
}

boot();

window.addEventListener("beforeunload", () => {
  stopPromptLoop();
  stopVideoLoop();
  if (imageUrl) URL.revokeObjectURL(imageUrl);
  if (videoUrl) URL.revokeObjectURL(videoUrl);
});
