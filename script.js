(() => {
  "use strict";
  const $ = (id) => document.getElementById(id);
  const imageTab = $("imageTab"), textTab = $("textTab");
  const imagePanel = $("imagePanel"), textPanel = $("textPanel");
  const imageInput = $("imageInput"), dropzone = $("dropzone");
  const renderBtn = $("renderBtn"), promptBtn = $("promptBtn");
  const asciiOutput = $("asciiOutput"), welcome = $("welcome");
  const canvas = $("workCanvas"), ctx = canvas.getContext("2d", { willReadFrequently: true });
  const video = $("sourceVideo");
  const mediaControls = $("mediaControls");
  const palettes = {
    standard: " .'`^\",:;Il!i><~+_-?][}{1)(|\\\\/*tfjrxnuvczXYUJCLQ0OZmwqpdbkhao*#MW&8%B@$",
    blocks: " ░▒▓█",
    binary: " 01",
    minimal: " .:-=+*#%@"
  };
  let currentImage = null, latestArt = "", currentMode = "image";
  let mediaType = null, mediaUrl = null, animationFrame = 0, lastFrameTime = 0;
  let isSeeking = false, renderedFrames = 0, fpsWindowStart = 0;

  function toast(message) {
    const el = $("toast"); el.textContent = message; el.classList.add("show");
    clearTimeout(toast.timer); toast.timer = setTimeout(() => el.classList.remove("show"), 2200);
  }
  function setMode(mode) {
    currentMode = mode;
    const isImage = mode === "image";
    imagePanel.classList.toggle("hidden", !isImage);
    textPanel.classList.toggle("hidden", isImage);
    imageTab.classList.toggle("active", isImage); textTab.classList.toggle("active", !isImage);
    imageTab.setAttribute("aria-selected", String(isImage));
    textTab.setAttribute("aria-selected", String(!isImage));
  }
  imageTab.addEventListener("click", () => setMode("image"));
  textTab.addEventListener("click", () => setMode("text"));

  function stopAnimation() {
    if (animationFrame) cancelAnimationFrame(animationFrame);
    animationFrame = 0;
  }
  function resetMedia() {
    stopAnimation();
    currentImage = null;
    if (mediaUrl) URL.revokeObjectURL(mediaUrl);
    mediaUrl = null;
    video.pause();
    video.removeAttribute("src");
    video.load();
    mediaControls.classList.add("hidden");
    $("fpsStatus").textContent = "— FPS";
  }
  function loadFile(file) {
    if (!file) return;
    if (!(file.type.startsWith("image/") || file.type.startsWith("video/"))) {
      toast("Choose an image or a supported video."); return;
    }
    if (file.size > 100 * 1024 * 1024) { toast("Maximum file size is 100 MB."); return; }
    resetMedia();
    mediaUrl = URL.createObjectURL(file);
    $("fileInfo").textContent = `${file.name} · ${(file.size / 1024 / 1024).toFixed(1)} MB`;
    setMode("image");
    if (file.type.startsWith("image/")) {
      const img = new Image();
      img.onload = () => {
        currentImage = img; mediaType = "image";
        renderBtn.disabled = false;
        $("terminalState").textContent = "IMAGE LOADED";
        renderImage();
      };
      img.onerror = () => toast("Could not read this image.");
      img.src = mediaUrl;
    } else {
      mediaType = "video";
      video.src = mediaUrl;
      video.onloadedmetadata = () => {
        renderBtn.disabled = false;
        mediaControls.classList.remove("hidden");
        $("terminalState").textContent = "VIDEO READY";
        $("mediaTime").textContent = `00:00 / ${formatTime(video.duration)}`;
        video.currentTime = 0;
        renderVideoFrame();
        playVideo();
      };
      video.onerror = () => toast("This video format is not supported by your browser. Try MP4 or WebM.");
      video.load();
    }
  }
  imageInput.addEventListener("change", e => loadFile(e.target.files[0]));
  ["dragenter", "dragover"].forEach(type => dropzone.addEventListener(type, e => {
    e.preventDefault(); dropzone.classList.add("dragover");
  }));
  ["dragleave", "drop"].forEach(type => dropzone.addEventListener(type, e => {
    e.preventDefault(); dropzone.classList.remove("dragover");
  }));
  dropzone.addEventListener("drop", e => loadFile(e.dataTransfer.files[0]));

  $("widthRange").addEventListener("input", e => {
    $("widthValue").value = e.target.value;
    if (currentImage) renderImage();
    if (mediaType === "video") renderVideoFrame();
  });
  $("contrastRange").addEventListener("input", e => {
    $("contrastValue").value = Number(e.target.value).toFixed(1);
    if (currentImage) renderImage();
    if (mediaType === "video") renderVideoFrame();
  });
  $("paletteSelect").addEventListener("change", () => {
    if (currentImage) renderImage();
    if (mediaType === "video") renderVideoFrame();
  });
  $("colorSelect").addEventListener("change", applyColor);
  renderBtn.addEventListener("click", () => {
    if (mediaType === "video") renderVideoFrame();
    else if (currentImage) renderImage();
  });
  promptBtn.addEventListener("click", renderPrompt);

  function drawAscii(source, sourceWidth, sourceHeight) {
    const width = Number($("widthRange").value);
    const ratio = sourceHeight / sourceWidth;
    const height = Math.max(1, Math.round(width * ratio * 0.48));
    canvas.width = width; canvas.height = height;
    ctx.drawImage(source, 0, 0, width, height);
    const pixels = ctx.getImageData(0, 0, width, height).data;
    const chars = palettes[$("paletteSelect").value];
    const contrast = Number($("contrastRange").value);
    let output = "";
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const i = (y * width + x) * 4;
        const alpha = pixels[i + 3] / 255;
        let lum = (0.2126 * pixels[i] + 0.7152 * pixels[i + 1] + 0.0722 * pixels[i + 2]) * alpha;
        lum = Math.max(0, Math.min(255, (lum - 128) * contrast + 128));
        const index = Math.min(chars.length - 1, Math.floor((lum / 255) * (chars.length - 1)));
        output += chars[index];
      }
      output += "\n";
    }
    showOutput(output, width, height);
  }
  function renderImage() {
    if (!currentImage) return;
    drawAscii(currentImage, currentImage.naturalWidth, currentImage.naturalHeight);
    $("terminalState").textContent = "IMAGE RENDERED";
    $("outputStatus").textContent = "STATIC FRAME";
  }

  function renderVideoFrame() {
    if (video.readyState < 2 || !video.videoWidth) return;
    drawAscii(video, video.videoWidth, video.videoHeight);
    $("terminalState").textContent = video.paused ? "VIDEO PAUSED" : "LIVE VIDEO FRAME";
    $("outputStatus").textContent = "VIDEO STREAM";
    $("mediaTime").textContent = `${formatTime(video.currentTime)} / ${formatTime(video.duration)}`;
    $("videoSeek").value = video.duration ? Math.round(video.currentTime / video.duration * 1000) : 0;
  }
  function videoLoop(timestamp) {
    if (video.paused || video.ended) { animationFrame = 0; return; }
    // Limit conversion workload to about 15 frames per second.
    if (timestamp - lastFrameTime >= 66) {
      renderVideoFrame();
      lastFrameTime = timestamp;
      renderedFrames++;
      if (!fpsWindowStart) fpsWindowStart = timestamp;
      if (timestamp - fpsWindowStart >= 1000) {
        $("fpsStatus").textContent = `${renderedFrames} FPS`;
        renderedFrames = 0; fpsWindowStart = timestamp;
      }
    }
    animationFrame = requestAnimationFrame(videoLoop);
  }
  function playVideo() {
    if (mediaType !== "video") return;
    video.playbackRate = Number($("speedSelect").value);
    video.play().then(() => {
      $("playBtn").textContent = "Ⅱ PAUSE";
      $("terminalState").textContent = "PLAYING";
      stopAnimation(); lastFrameTime = 0; animationFrame = requestAnimationFrame(videoLoop);
    }).catch(() => toast("Press Play to start the video."));
  }
  function pauseVideo() {
    video.pause(); stopAnimation();
    $("playBtn").textContent = "▶ PLAY";
    renderVideoFrame();
    $("terminalState").textContent = "VIDEO PAUSED";
  }
  $("playBtn").addEventListener("click", () => {
    if (video.paused) playVideo(); else pauseVideo();
  });
  $("speedSelect").addEventListener("change", () => { video.playbackRate = Number($("speedSelect").value); });
  $("videoSeek").addEventListener("input", e => {
    if (!video.duration) return;
    isSeeking = true;
    video.currentTime = Number(e.target.value) / 1000 * video.duration;
    renderVideoFrame();
  });
  $("videoSeek").addEventListener("change", () => { isSeeking = false; renderVideoFrame(); });
  video.addEventListener("timeupdate", () => {
    if (!isSeeking && video.duration) {
      $("videoSeek").value = Math.round(video.currentTime / video.duration * 1000);
      $("mediaTime").textContent = `${formatTime(video.currentTime)} / ${formatTime(video.duration)}`;
    }
  });
  video.addEventListener("ended", () => {
    stopAnimation(); $("playBtn").textContent = "▶ REPLAY";
    $("terminalState").textContent = "VIDEO ENDED";
  });
  function formatTime(seconds) {
    if (!Number.isFinite(seconds)) return "00:00";
    const m = Math.floor(seconds / 60), s = Math.floor(seconds % 60);
    return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }

  const art = {
    cat: [" /\\_/\\\\","( o.o )"," > ^ <"],
    house: ["       /\\\\","      /  \\\\","     /____\\\\","     | [] |","     |    |","  ___|____|___"],
    car: ["       ______","  ____/|_||_\\`.__"," (   _    _ _  _\\"," =`-(_)--(_)-' "],
    tree: ["       /\\\\","      /**\\\\","     /****\\\\","    /******\\\\","       ||","       ||"],
    moon: ["       _.._","    .-'    '-.","   /  .--.    \\","  |  /    \\    |","   \\  '.__.'  /","    '-.____.-'"],
    mountain: ["          /\\","         /  \\       /\\","        / /\\ \\     /  \\","       / /  \\ \\   / /\\ \\","      /_/____\\_\\ /_/  \\_\\","    ~~~~~~~~~~~~~~~~~~~~~~~"],
    city: ["     | [] |       | [] |","  ___|____|___ ___|____|___"," |  _   _   | |  _   _   |"," | |_| |_|  | | |_| |_|  |"," |__________| |__________|","    ||  ||       ||  ||"]
  };
  function renderPrompt() {
    const prompt = $("promptInput").value.trim();
    if (!prompt) { toast("Write a short description first."); return; }
    const lower = prompt.toLowerCase();
    let key = "default";
    if (/cat|kitten|قطة|قط/.test(lower)) key = "cat";
    else if (/house|home|بيت|منزل/.test(lower)) key = "house";
    else if (/car|vehicle|سيارة|مركبة/.test(lower)) key = "car";
    else if (/tree|شجرة|غابة|forest/.test(lower)) key = "tree";
    else if (/moon|قمر|ليل|night/.test(lower)) key = "moon";
    else if (/mountain|جبل|جبال/.test(lower)) key = "mountain";
    else if (/city|مدينة|buildings/.test(lower)) key = "city";
    let output;
    if (key === "default") {
      const title = prompt.toUpperCase();
      const boxWidth = Math.min(52, Math.max(12, title.length + 4));
      const border = "+" + "-".repeat(boxWidth) + "+";
      const inner = "|  " + title.slice(0, boxWidth - 4).padEnd(boxWidth - 4) + "  |";
      output = ["  ES1l1 / PROMPT INTERPRETER","  " + "_".repeat(30),"","       .------------.","      /              \\","     |   YOUR IDEA    |","      \\              /","       '------------'","","  " + border,"  " + inner,"  " + border,"","  [ PROMPT ] " + prompt,"","  Try: cat, house, car, tree, moon, city or mountain."].join("\n");
    } else output = ["  ES1l1 / SCENE TEMPLATE","  PROMPT: " + prompt,"",...art[key],"","  [ locally generated ASCII pattern ]"].join("\n");
    showOutput(output, Math.max(...output.split("\n").map(line => line.length)), output.split("\n").length);
    $("terminalState").textContent = "PROMPT RENDERED";
    $("outputStatus").textContent = "STATIC PATTERN";
  }
  function showOutput(text, width, height) {
    latestArt = text;
    welcome.classList.add("hidden"); asciiOutput.classList.remove("hidden");
    asciiOutput.textContent = text;
    $("outputDimensions").textContent = `${width} × ${height} CHARS`;
    $("copyBtn").disabled = false; $("downloadBtn").disabled = false;
    applyColor();
  }
  function applyColor() {
    const colors = { green: "#71f5a5", white: "#dcebe1", amber: "#ffc56b", cyan: "#71e7f5" };
    asciiOutput.style.color = colors[$("colorSelect").value] || colors.green;
  }
  $("copyBtn").addEventListener("click", async () => {
    if (!latestArt) return;
    try { await navigator.clipboard.writeText(latestArt); toast("ASCII art copied."); }
    catch { toast("Clipboard unavailable. Select and copy the output."); }
  });
  $("downloadBtn").addEventListener("click", () => {
    if (!latestArt) return;
    const blob = new Blob([latestArt], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = "es1l1-ascii-art.txt";
    document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
    toast("TXT file saved.");
  });
  window.addEventListener("beforeunload", () => { stopAnimation(); if (mediaUrl) URL.revokeObjectURL(mediaUrl); });
})();