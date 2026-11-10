/**
 * ES1l1 — prompt interpreter + procedural scene engine.
 *
 * Honest scope: this is a deterministic, rule-based text-to-scene interpreter
 * drawing reusable Canvas layers. No neural model is involved.
 */

/* ------------------------------------------------------------------ */
/* Text utilities                                                     */
/* ------------------------------------------------------------------ */

export function normalizeText(input) {
  return String(input || "")
    .toLowerCase()
    .replace(/[\u064B-\u0652\u0670\u0640\u06D6-\u06ED]/g, "") // Arabic diacritics + tatweel
    .replace(/[أإآٱ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/ؤ/g, "و")
    .replace(/ئ/g, "ي")
    .replace(/[^\p{L}\p{N}\s'-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function escapeRe(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function containsTerm(hay, term) {
  if (!term) return false;
  if (/[\u0600-\u06FF]/.test(term)) return hay.includes(normalizeText(term));
  const re = new RegExp(`(^|[^a-z0-9])${escapeRe(term)}([^a-z0-9]|$)`, "i");
  return re.test(hay);
}

const STOP_WORDS = new Set([
  "a", "an", "the", "and", "with", "under", "over", "through", "in", "on", "of", "at", "to", "from",
  "into", "between", "while", "as", "is", "are", "was", "were", "be", "being", "by", "for", "that",
  "this", "its", "it", "very", "some", "there", "their", "his", "her", "they", "he", "she", "camera",
  "moving", "slowly", "slow", "light", "لكن", "مع", "في", "على", "تحت", "فوق", "من", "الى", "إلى",
  "عبر", "بين", "وهو", "وهي", "الذي", "التي", "ثم", "كما", "هناك", "هذا", "هذه", "ذلك", "تلك", "قد",
  "كان", "كانت", "ضوء", "مع", "دون", "كل", "بعض", "عن", "او", "أو", "و"
]);

/* ------------------------------------------------------------------ */
/* Bilingual lexicon                                                  */
/* ------------------------------------------------------------------ */

const LEXICON = {
  environment: [
    { value: "space", words: ["space", "outer space", "galaxy", "cosmos", "alien planet", "planet", "nebula", "فضاء", "الفضاء", "كوكب", "كواكب", "مجرة", "مجره", "غلاف جوي", "عالم فضائي"] },
    { value: "ocean", words: ["ocean", "sea", "beach", "coast", "seaside", "underwater", "reef", "محيط", "البحر", "بحر", "شاطئ", "ساحل", "تحت الماء", "شعاب"] },
    { value: "city", words: ["city", "town", "skyline", "downtown", "metropolis", "neon city", "urban", "مدينة", "المدينة", "مدن", "حي", "أبراج", "ابراج", "شوارع المدينة"] },
    { value: "forest", words: ["forest", "woods", "woodland", "jungle", "pine forest", "trees", "tree", "غابة", "الغابة", "أشجار", "اشجار", "شجر", "صنوبر", "أدغال", "ادغال", "بستان"] },
    { value: "mountain", words: ["mountain", "mountains", "peak", "valley", "canyon", "cliff", "جبال", "جبل", "وادي", "واد", "قمة", "جرف", "تل"] },
    { value: "road", words: ["road", "highway", "street", "route", "freeway", "motorway", "tunnel", "طريق", "الطريق", "شارع", "طريق سريع", "أنفاق", "نفق"] },
    { value: "desert", words: ["desert", "dunes", "sand", "sahara", "صحراء", "الصحراء", "رمال", "كثبان", "كثبان رملية"] },
    { value: "plain", words: ["plain", "field", "meadow", "grassland", "countryside", "سهل", "حقل", "مرج", "ريف", "برية"] }
  ],
  subject: [
    { value: "astronaut", words: ["astronaut", "spaceman", "cosmonaut", "space explorer", "رائد فضاء", "رائد الفضاء", "رجل فضاء", "مستكشف فضاء"] },
    { value: "car", words: ["car", "sports car", "vehicle", "racing car", "supercar", "auto", "سيارة", "السيارة", "مركبة", "سيارات", "سباق سيارات", "سيارة رياضية"] },
    { value: "cat", words: ["cat", "kitten", "feline", "قطة", "القطة", "قط", "هر", "هرة"] },
    { value: "deer", words: ["deer", "stag", "elk", "reindeer", "غزال", "الغزال", "ظبي", "أيل", "ايل"] },
    { value: "bird", words: ["bird", "seagull", "eagle", "crow", "raven", "falcon", "owl", "طائر", "الطائر", "طيور", "نورس", "عصفور", "نسر", "غراب"] },
    { value: "fish", words: ["fish", "whale", "shark", "dolphin", "سمكة", "السمكة", "سمك", "حوت", "قرش", "دلفين"] },
    { value: "human", words: ["man", "woman", "person", "traveler", "traveller", "wanderer", "walker", "figure", "human", "boy", "girl", "warrior", "nomad", "رجل", "الرجل", "امرأة", "امراه", "شخص", "مسافر", "مشاة", "فتاة", "ولد", "محارب", "بدوي", "انسام", "إنسان"] }
  ],
  weather: [
    { value: "storm", words: ["storm", "thunder", "thunderstorm", "lightning storm", "tempest", "عاصفة", "العاصفة", "رعد", "برق", "صاعقة", "زوبعة"] },
    { value: "rain", words: ["rain", "raining", "rainy", "drizzle", "downpour", "showers", "مطر", "المطر", "ممطر", "أمطار", "امطار", "زخات", "رذاذ"] },
    { value: "snow", words: ["snow", "snowy", "snowfall", "blizzard", "ثلج", "الثلج", "ثلوج", "مثلج", "عاصفة ثلجية"] },
    { value: "fog", words: ["fog", "foggy", "mist", "misty", "haze", "hazy", "ضباب", "الضباب", "ضبابي", "غيوم", "شبورة", "بخار"] }
  ],
  time: [
    { value: "dawn", words: ["dawn", "sunrise", "daybreak", "early morning", "first light", "فجر", "الفجر", "شروق", "الشروق", "صباح باكر"] },
    { value: "sunset", words: ["sunset", "sundown", "golden hour", "غروب", "الغروب", "مغرب", "المغرب", "ساعة ذهبية"] },
    { value: "dusk", words: ["dusk", "twilight", "evening", "غسق", "الغسق", "شفق", "الشفق", "مساء", "المساء"] },
    { value: "day", words: ["day", "daytime", "morning", "noon", "midday", "sunny", "نهار", "النهار", "صباح", "الصباح", "ظهر", "الظهر", "مشمس"] },
    { value: "night", words: ["night", "midnight", "nighttime", "dark", "darkness", "after dark", "ليل", "الليل", "ليلة", "منتصف الليل", "ظلام", "مظلم", "مظلمة"] }
  ],
  lighting: [
    { value: "neon", words: ["neon", "neon light", "neon lights", "fluorescent", "نيون", "النيون", "أضواء نيون", "اضواء نيون"] },
    { value: "fire", words: ["firelight", "campfire", "fire", "torch", "lantern", "نار", "النار", "نار المخيم", "مشعل", "فانوس", "شمعة"] },
    { value: "moonlit", words: ["moonlight", "moonlit", "moon light", "ضوء القمر", "ضوء قمر", "قمر", "القمر"] },
    { value: "sunset", words: ["golden light", "sunset light", "golden hour", "ضوء الغروب", "ضوء ذهبي"] },
    { value: "daylight", words: ["sunlight", "daylight", "sunshine", "bright sun", "ضوء الشمس", "أشعة الشمس", "اشعه الشمس", "شمس", "الشمس"] },
    { value: "dark", words: ["low light", "dim light", "shadowy", "إضاءة خافتة", "خافت", "معتم"] }
  ],
  camera: [
    { value: "follow", words: ["follow", "following", "tracks the", "tracking shot", "camera follows", "camera follow", "تتبع", "تتبعه", "يتبع", "الكاميرا تتبع", "كاميرا تتبع", "ملاحقة"] },
    { value: "orbit", words: ["orbit", "orbiting", "rotating camera", "camera rotates", "circular", "دوران", "يدور", "تدور", "الكاميرا تدور", "دائرية"] },
    { value: "zoom", words: ["zoom", "zooming", "close-up", "closeup", "push in", "تقريب", "تقريب بطيء", "زوم", "لقطة قريبة"] },
    { value: "pan", words: ["pan", "panning", "panoramic", "panorama", "sweeping shot", "تحريك", "تحريك افقي", "بانوراما", "مسح"] },
    { value: "static", words: ["static", "still camera", "fixed camera", "locked off", "ثابتة", "كاميرا ثابتة", "ثابت"] }
  ],
  motion: [
    { value: "run", words: ["run", "running", "sprint", "sprinting", "chase", "chasing", "يجري", "جري", "يركض", "مسرع", "مطاردة"] },
    { value: "walk", words: ["walk", "walking", "stroll", "strolling", "wander", "wandering", "يمشي", "مشي", "يتجول", "تجول", "يسير"] },
    { value: "drive", words: ["drive", "driving", "race", "racing", "speeding", "cruising", "تسابق", "سباق", "يقود", "قيادة", "ينطلق", "مسرعة"] },
    { value: "fly", words: ["fly", "flying", "soar", "soaring", "glide", "hover", "يطير", "طيران", "يحلق", "تحلق", "يحوم"] },
    { value: "swim", words: ["swim", "swimming", "float", "drifting in water", "يسبح", "سباحة", "تعوم", "يطفو في الماء"] },
    { value: "float", words: ["float", "floating", "weightless", "hovering", "يطفو", "طفو", "عائم", "بلا وزن"] }
  ],
  fx: [
    { value: "lightning", words: ["lightning", "thunderbolt", "برق", "البرق", "صاعقة"] },
    { value: "embers", words: ["embers", "ember", "sparks", "spark", "ember rain", "جمر", "جمرات", "شرر", "شظايا نار"] },
    { value: "aurora", words: ["aurora", "northern lights", "southern lights", "شفق قطبي", "الشفق القطبي", "أضواء الشمال"] },
    { value: "fireflies", words: ["fireflies", "firefly", "glowworms", "يراعات", "اليراعات", "حشرات مضيئة"] },
    { value: "glow", words: ["glow", "glowing", "glowing lights", "halo", "توهج", "يتوهج", "هالة"] },
    { value: "shootingStar", words: ["shooting star", "meteor", "meteors", "comet", "شهاب", "الشهب", "نيزك", "مذنب"] }
  ],
  objects: [
    { value: "moon", words: ["moon", "moons", "crescent", "full moon", "قمر", "القمر", "أقمار", "اقمار", "هلال", "بدر"] },
    { value: "sun", words: ["sun", "شمس", "الشمس"] },
    { value: "trees", words: ["tree", "trees", "pine", "pines", "oak", "palms", "شجرة", "أشجار", "اشجار", "صنوبر", "نخيل"] },
    { value: "buildings", words: ["building", "buildings", "skyscraper", "skyscrapers", "tower", "towers", "مبنى", "مبانٍ", "أبراج", "ابراج", "ناطحات سحاب"] },
    { value: "streetlights", words: ["streetlight", "streetlights", "lamp post", "lamp posts", "lamppost", "neon signs", "أعمدة إضاءة", "إنارة", "لافتات نيون", "أضواء الشارع"] },
    { value: "boat", words: ["boat", "ship", "sailboat", "canoe", "قارب", "القارب", "سفينة", "زورق", "مركب"] },
    { value: "birds", words: ["birds", "seagulls", "flock", "طيور", "الطيور", "نوارس", "سرب"] },
    { value: "waves", words: ["waves", "tides", "أمواج", "امواج", "الموج", "مد وجزر"] },
    { value: "clouds", words: ["cloud", "clouds", "overcast", "غيوم", "السحاب", "سحاب"] },
    { value: "rocks", words: ["rock", "rocks", "boulder", "stones", "صخور", "صخرة", "حجارة"] },
    { value: "campfire", words: ["campfire", "bonfire", "fire pit", "نار المخيم", "حطب", "مشعل نار"] },
    { value: "reflections", words: ["reflection", "reflections", "reflecting", "wet road", "انعكاس", "انعكاسات", "طريق مبلل", "أرض مبللة"] }
  ]
};

const FEATURE_GROUPS = ["environment", "subject", "weather", "time", "lighting", "camera", "motion", "fx", "objects"];

export function interpretPrompt(rawInput) {
  const raw = String(rawInput || "").trim();
  const norm = normalizeText(raw);
  const lang = /[\u0600-\u06FF]/.test(raw) ? "ar" : "en";
  const matched = {};
  const words = [];
  FEATURE_GROUPS.forEach((group) => { matched[group] = []; });

  for (const group of FEATURE_GROUPS) {
    for (const entry of LEXICON[group]) {
      const hits = entry.words.filter((word) => containsTerm(norm, word));
      if (hits.length) {
        matched[group].push({ value: entry.value, terms: hits });
        words.push(...hits);
      }
    }
  }

  const values = (group) => matched[group].map((m) => m.value);
  const envs = values("environment");
  const subjects = values("subject");
  let weathers = values("weather");
  let times = values("time");

  // Environment priority: the most specific/staged environment wins.
  const envPriority = ["space", "ocean", "city", "forest", "mountain", "desert", "road", "plain"];
  let env = envPriority.find((value) => envs.includes(value)) || null;

  let subject = subjects[0] || null;
  if (subject === "bird") subject = "bird";
  if (subject === "fish" && !env) env = "ocean";

  if (!env) {
    if (subject === "astronaut") env = "space";
    else if (subject === "fish") env = "ocean";
    else if (subject === "car") env = "road";
    else if (subject === "deer") env = "mountain";
    else if (subject === "cat") env = "forest";
    else if (subject === "bird") env = "ocean";
    else env = "plain";
  }

  if (!subject) {
    if (env === "city") subject = "none";
    else if (env === "space") subject = "astronaut";
    else if (env === "ocean") subject = "none";
    else subject = "none";
  }

  // Weather inference: a storm implies rain if no explicit rain word.
  let weather = weathers[0] || "clear";
  if (weathers.includes("storm") && !weathers.includes("rain") && !weathers.includes("snow")) weather = "storm";
  if (weather === "storm" && weathers.includes("snow")) weather = "snow";

  let time = times[0] || null;
  if (!time) {
    if (values("objects").includes("moon") || matched.fx.some((f) => f.value === "shootingStar")) time = "night";
    else if (values("objects").includes("sun") || values("lighting").includes("daylight")) time = "day";
    else if (["space", "city", "forest"].includes(env)) time = "night";
    else if (env === "ocean") time = "sunset";
    else if (env === "desert") time = "day";
    else time = "dusk";
  }

  let lighting = null;
  const lights = values("lighting");
  if (lights.includes("neon") || (env === "city" && time === "night")) lighting = "neon";
  else if (lights.includes("fire")) lighting = "fire";
  else if (lights.includes("moonlit") || (time === "night" && !lights.length)) lighting = "moonlit";
  else if (lights.includes("sunset") || time === "sunset") lighting = "sunset";
  else if (lights.includes("daylight") || time === "day") lighting = "daylight";
  else if (lights.includes("dark")) lighting = "dark";
  else if (time === "night") lighting = "moonlit";
  else lighting = time === "dawn" ? "sunset" : "daylight";

  let camera = values("camera")[0] || "pan";
  if (camera === "static" && matched.camera.length === 1 && !raw) camera = "pan";
  if (!values("camera").length) camera = ["zoom", "orbit"].includes(camera) ? camera : "pan";

  let motion = values("motion")[0] || null;
  if (!motion) {
    if (subject === "car") motion = "drive";
    else if (subject === "astronaut") motion = "float";
    else if (subject === "bird") motion = "fly";
    else if (subject === "fish") motion = "swim";
    else if (subject === "human") motion = "walk";
    else motion = "idle";
  }
  if (subject === "deer" && motion === "idle") motion = "idle";

  const fx = [...new Set(values("fx"))];
  const objects = [...new Set(values("objects"))];
  if (weather === "rain" || weather === "storm") {
    if (!objects.includes("rain")) objects.push("rain");
  }
  if (weather === "snow") objects.push("snow");
  if (weather === "fog") objects.push("fog");
  if (time === "night" || env === "space") objects.push("stars");
  if (["night", "dusk", "dawn", "sunset"].includes(time)) objects.push("moon");
  if (time === "day" || time === "sunset") objects.push("sun");
  if (env === "forest" || env === "mountain" || env === "plain") objects.push("trees");
  if (env === "city") objects.push("buildings", "streetlights");
  if (env === "ocean") objects.push("waves");
  if (env === "space") objects.push("stars");

  const normalizedObjects = [...new Set(objects)];

  // Build unmatched content-word report (honest capability boundary).
  const allTerms = words.map(normalizeText);
  const tokens = norm.split(" ").filter((token) => token.length > 2 && !STOP_WORDS.has(token));
  const unmatched = tokens.filter((token) => !allTerms.some((term) => term === token || term.includes(token) || token.includes(term))).slice(0, 18);

  const featureCount = FEATURE_GROUPS.reduce((sum, group) => sum + matched[group].length, 0);

  return {
    raw,
    lang,
    env,
    subject,
    weather,
    time,
    lighting,
    camera,
    motion,
    fx,
    objects: normalizedObjects,
    matched,
    unmatched,
    featureCount,
    empty: !raw
  };
}

/* ------------------------------------------------------------------ */
/* Small math / color helpers                                         */
/* ------------------------------------------------------------------ */

const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
const lerp = (a, b, t) => a + (b - a) * t;

function hashString(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry32(seed) {
  let a = seed >>> 0;
  return function random() {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), 1 | t);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function rgba(hex, alpha = 1) {
  if (hex.startsWith("rgba") || hex.startsWith("rgb")) return hex;
  const clean = hex.replace("#", "");
  const full = clean.length === 3 ? clean.split("").map((c) => c + c).join("") : clean;
  const n = parseInt(full, 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

const SKY = {
  night: { top: "#02040b", mid: "#071226", bottom: "#0d1d33", haze: "#12283f", ground: "#050b0d", accent: "#8fb6ff" },
  sunset: { top: "#150628", mid: "#451a57", bottom: "#f2794a", haze: "#8a3c56", ground: "#1a0f16", accent: "#ffc07a" },
  dawn: { top: "#0b1e34", mid: "#365b7d", bottom: "#f3ad8d", haze: "#8a7b92", ground: "#15202d", accent: "#ffd1ad" },
  day: { top: "#2c78b9", mid: "#6bb4e5", bottom: "#d6eefb", haze: "#b9d8e8", ground: "#1b2b23", accent: "#fff6d2" },
  dusk: { top: "#080c26", mid: "#291a52", bottom: "#84416f", haze: "#4c2c58", ground: "#0c0a17", accent: "#d5b3ff" }
};

const RIM = {
  moonlit: "#cfe0ff",
  neon: "#7df7ff",
  sunset: "#ffcf8a",
  daylight: "#fff4d6",
  fire: "#ffb066",
  dark: "#9aa8c7"
};

/* ------------------------------------------------------------------ */
/* Scene engine                                                       */
/* ------------------------------------------------------------------ */

export class SceneEngine {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d", { alpha: false });
    this.width = canvas.width;
    this.height = canvas.height;
    this.spec = null;
    this.time = 0;
    this.seed = 1;
    this.rng = mulberry32(1);
    this.stars = [];
    this.rain = [];
    this.snow = [];
    this.clouds = [];
    this.trees = [];
    this.buildings = [];
    this.ridges = [];
    this.fireflies = [];
    this.embers = [];
    this.grain = null;
    this.lastDrawn = null;
  }

  setSpec(spec) {
    this.spec = spec;
    this.seed = hashString(`${spec.raw}|${spec.env}|${spec.time}|${spec.weather}|${spec.subject}|${spec.camera}`);
    this.time = 0;
    this.build();
  }

  build() {
    const spec = this.spec;
    if (!spec) return;
    const rand = mulberry32(this.seed);
    this.rng = rand;
    const w = this.width;
    const h = this.height;
    const night = ["night", "dusk", "dawn"].includes(spec.time) || spec.env === "space";

    this.stars = Array.from({ length: spec.env === "space" ? 260 : night ? 150 : 26 }, () => ({
      x: rand() * w,
      y: rand() * h * 0.72,
      r: rand() * 1.6 + 0.35,
      phase: rand() * Math.PI * 2,
      speed: 0.4 + rand() * 1.8,
      warmth: rand()
    }));

    this.clouds = Array.from({ length: 7 }, () => ({
      x: rand() * w,
      y: 70 + rand() * 210,
      scale: 0.5 + rand() * 1.5,
      alpha: 0.05 + rand() * 0.16,
      speed: 4 + rand() * 10,
      phase: rand() * 10
    }));

    this.ridges = Array.from({ length: 3 }, (_, layer) => {
      const points = [];
      const count = 14;
      for (let i = 0; i <= count; i++) {
        points.push({
          x: (i / count) * w,
          y: h * (0.34 + layer * 0.08) + rand() * h * (0.09 + layer * 0.03)
        });
      }
      return points;
    });

    this.trees = Array.from({ length: 34 }, () => ({
      x: rand() * w,
      h: 70 + rand() * 220,
      layer: rand() > 0.55 ? 1 : 0,
      lean: (rand() - 0.5) * 0.16,
      tone: rand()
    })).sort((a, b) => a.h - b.h);

    this.buildings = [];
    let bx = -30;
    while (bx < w + 60) {
      const bw = 44 + rand() * 110;
      this.buildings.push({
        x: bx,
        w: bw,
        h: h * (0.14 + rand() * 0.36),
        layer: rand() > 0.6 ? 1 : 0,
        seed: Math.floor(rand() * 1e6),
        neon: rand() > 0.45,
        antenna: rand() > 0.65
      });
      bx += bw + 8 + rand() * 30;
    }

    this.rain = Array.from({ length: 170 }, () => ({
      x: rand() * (w + 200),
      phase: rand(),
      speed: 0.55 + rand() * 0.9,
      length: 10 + rand() * 22,
      alpha: 0.15 + rand() * 0.45
    }));

    this.snow = Array.from({ length: 140 }, () => ({
      x: rand() * w,
      phase: rand(),
      speed: 0.05 + rand() * 0.1,
      radius: 0.8 + rand() * 2.4,
      sway: 10 + rand() * 30
    }));

    this.fireflies = Array.from({ length: spec.env === "forest" ? 26 : 12 }, () => ({
      x: rand() * w,
      y: h * (0.35 + rand() * 0.4),
      phase: rand() * 10,
      speed: 0.4 + rand() * 0.8,
      radius: 1 + rand() * 2.2
    }));

    this.embers = Array.from({ length: 40 }, () => ({
      x: rand() * w,
      phase: rand(),
      speed: 0.04 + rand() * 0.1,
      drift: (rand() - 0.5) * 40,
      radius: 0.8 + rand() * 2
    }));

    this.grain = null;
    this.lastDrawn = null;
  }

  update(dt) {
    this.time += dt;
  }

  has(value) {
    return Boolean(this.spec && this.spec.objects.includes(value));
  }

  rgb(key, alpha = 1) {
    return rgba(key, alpha);
  }

  /* ------------------------------ frame ------------------------------ */

  draw() {
    const ctx = this.ctx;
    const spec = this.spec;
    if (!spec) return;
    const w = this.width;
    const h = this.height;
    const t = this.time;
    const sky = SKY[spec.time] || SKY.night;
    const reduce = this.reduceMotion;
    const shake = spec.weather === "storm" && !reduce
      ? Math.sin(t * 31) * 1.2 + Math.sin(t * 17.3) * 0.8
      : 0;

    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "source-over";

    // Camera: slow zoom / orbit drift.
    let zoom = 1;
    if (!reduce && (spec.camera === "zoom" || spec.camera === "orbit")) {
      zoom = 1.035 + Math.sin(t * 0.13) * (spec.camera === "orbit" ? 0.022 : 0.014);
    }
    ctx.translate(w / 2 + shake, h / 2);
    ctx.scale(zoom, zoom);
    ctx.translate(-w / 2, -h / 2);

    this.drawSky(sky, t);
    this.drawCelestial(sky, t);
    this.drawAurora(t);
    this.drawClouds(t);
    this.drawBackground(sky, t);
    this.drawMidground(sky, t);
    this.drawGround(sky, t);
    this.drawObjectLayers(t);
    this.drawWeatherBack(t);
    this.drawSubject(t);
    this.drawWeatherFront(t);
    this.drawForeground(sky, t);
    this.drawLightning(t);
    ctx.restore();

    this.drawPost(sky, t);
  }

  drawSky(sky, t) {
    const ctx = this.ctx;
    const w = this.width;
    const h = this.height;
    const g = ctx.createLinearGradient(0, 0, 0, h * 0.82);
    g.addColorStop(0, sky.top);
    g.addColorStop(0.45, sky.mid);
    g.addColorStop(1, sky.bottom);
    ctx.fillStyle = g;
    ctx.fillRect(-40, -40, w + 80, h + 80);

    // Milky-way style atmospheric band for night/space.
    if (["night", "dusk", "dawn"].includes(this.spec.time) || this.spec.env === "space") {
      const band = ctx.createLinearGradient(0, h * 0.1, w, h * 0.55);
      band.addColorStop(0, "rgba(40,70,140,0)");
      band.addColorStop(0.45, "rgba(70,100,180,0.12)");
      band.addColorStop(0.6, "rgba(130,120,200,0.10)");
      band.addColorStop(1, "rgba(30,40,90,0)");
      ctx.fillStyle = band;
      ctx.fillRect(0, 0, w, h * 0.8);
    }

    // Stars.
    if (this.stars.length) {
      for (const star of this.stars) {
        const twinkle = 0.55 + 0.45 * Math.sin(t * star.speed + star.phase);
        ctx.fillStyle = `rgba(${star.warmth > 0.7 ? "255,225,180" : "210,230,255"},${0.16 + twinkle * 0.7})`;
        ctx.beginPath();
        ctx.arc(star.x, star.y, star.r * (0.7 + twinkle * 0.5), 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // Shooting stars.
    if (this.has("stars") && (this.spec.fx.includes("shootingStar") || this.spec.env === "space")) {
      const cycle = (t * 0.19) % 1;
      if (cycle < 0.055) {
        const p = cycle / 0.055;
        const x = w * (0.2 + p * 0.5);
        const y = h * (0.08 + p * 0.2);
        ctx.strokeStyle = `rgba(220,240,255,${0.85 * (1 - p)})`;
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x - 90, y - 34);
        ctx.stroke();
      }
    }
  }

  drawCelestial(sky, t) {
    const ctx = this.ctx;
    const spec = this.spec;
    const w = this.width;
    const h = this.height;
    const isNight = ["night", "dusk", "dawn"].includes(spec.time);
    const celestial = spec.time === "day" || spec.time === "sunset" ? "sun" : "moon";
    const x = celestial === "sun" ? w * 0.76 : w * 0.73;
    const y = celestial === "sun"
      ? h * (spec.time === "sunset" ? 0.42 : 0.2)
      : h * (spec.time === "dusk" ? 0.26 : 0.22);
    const radius = celestial === "sun" ? 46 : 38;

    if (celestial === "moon" && !isNight) return;

    const glowColor = celestial === "sun" ? sky.accent : "#cfe0ff";
    const glow = ctx.createRadialGradient(x, y, radius * 0.3, x, y, radius * 6);
    glow.addColorStop(0, rgba(glowColor, 0.55));
    glow.addColorStop(0.35, rgba(glowColor, 0.12));
    glow.addColorStop(1, rgba(glowColor, 0));
    ctx.fillStyle = glow;
    ctx.fillRect(x - radius * 6, y - radius * 6, radius * 12, radius * 12);

    ctx.save();
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.clip();
    if (celestial === "sun") {
      const g = ctx.createLinearGradient(x, y - radius, x, y + radius);
      g.addColorStop(0, spec.time === "sunset" ? "#fff0bd" : "#fffdf0");
      g.addColorStop(1, spec.time === "sunset" ? "#ff9a4d" : "#ffd878");
      ctx.fillStyle = g;
      ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2);
    } else {
      const g = ctx.createLinearGradient(x - radius, y - radius, x + radius, y + radius);
      g.addColorStop(0, "#ffffff");
      g.addColorStop(0.55, "#dbe6f5");
      g.addColorStop(1, "#a9b8cf");
      ctx.fillStyle = g;
      ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2);
      // Craters.
      ctx.fillStyle = "rgba(120,140,170,0.35)";
      [[-12, -8, 8], [10, 6, 6], [-4, 16, 4], [14, -14, 3.5]].forEach(([cx, cy, cr]) => {
        ctx.beginPath();
        ctx.arc(x + cx, y + cy, cr, 0, Math.PI * 2);
        ctx.fill();
      });
    }
    ctx.restore();
  }

  drawAurora(t) {
    if (!this.spec.fx.includes("aurora") && this.spec.env !== "space") return;
    const ctx = this.ctx;
    const w = this.width;
    const h = this.height;
    ctx.save();
    ctx.globalCompositeOperation = "screen";
    for (let band = 0; band < 3; band++) {
      const grad = ctx.createLinearGradient(0, h * 0.1, 0, h * 0.55);
      grad.addColorStop(0, "rgba(60,255,190,0)");
      grad.addColorStop(0.35, band % 2 ? "rgba(90,200,255,0.12)" : "rgba(120,255,190,0.14)");
      grad.addColorStop(1, "rgba(160,120,255,0)");
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.moveTo(-40, h * 0.3);
      for (let x = -40; x <= w + 40; x += 40) {
        const yy = h * 0.2 + Math.sin(x * 0.006 + t * 0.35 + band * 1.7) * 40 + band * 26;
        ctx.lineTo(x, yy);
      }
      ctx.lineTo(w + 40, h * 0.5);
      ctx.lineTo(-40, h * 0.5);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  }

  drawClouds(t) {
    const spec = this.spec;
    if (!["fog", "storm", "rain", "snow"].includes(spec.weather) && !this.has("clouds") && spec.time !== "sunset") return;
    const ctx = this.ctx;
    const w = this.width;
    const h = this.height;
    ctx.save();
    ctx.globalCompositeOperation = "screen";
    for (const cloud of this.clouds) {
      const drift = spec.camera === "static" ? 0 : t * cloud.speed * 0.5;
      const x = ((cloud.x + drift) % (w + 320)) - 160;
      const y = cloud.y;
      const scale = cloud.scale;
      const alpha = spec.weather === "storm" ? cloud.alpha * 1.8 : cloud.alpha;
      const g = ctx.createLinearGradient(x, y - 40 * scale, x, y + 40 * scale);
      g.addColorStop(0, `rgba(190,215,240,${alpha})`);
      g.addColorStop(1, `rgba(60,80,110,${alpha * 0.2})`);
      ctx.fillStyle = g;
      for (let i = 0; i < 4; i++) {
        const rx = x + i * 44 * scale;
        const ry = y + Math.sin(i * 1.7 + cloud.phase) * 10;
        ctx.beginPath();
        ctx.ellipse(rx, ry, 58 * scale, 20 * scale, 0, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.restore();
  }

  drawBackground(sky, t) {
    const env = this.spec.env;
    const ctx = this.ctx;
    const w = this.width;
    const h = this.height;
    const far = SKY[this.spec.time].haze;

    if (env === "mountain" || env === "forest" || env === "plain" || env === "desert") {
      this.ridges.forEach((points, layer) => {
        ctx.beginPath();
        ctx.moveTo(-40, h * 0.8);
        points.forEach((p) => {
          const parallax = layer * 12 + (this.spec.camera === "pan" ? Math.sin(t * 0.05 + layer) * 20 : 0);
          ctx.lineTo(p.x + parallax, p.y + layer * 10);
        });
        ctx.lineTo(w + 40, h * 0.8);
        ctx.closePath();
        if (env === "desert") {
          ctx.fillStyle = layer === 0 ? rgba("#2a1a2a", 0.8) : layer === 1 ? "#3b2430" : "#4a2c32";
        } else {
          ctx.fillStyle = layer === 0
            ? rgba(far, 0.55)
            : layer === 1 ? rgba(far, 0.8) : rgba("#0b1a1a", 0.92);
        }
        ctx.fill();
      });
      if (env === "mountain") this.drawSnowCaps(ctx, t);
    }

    if (env === "space") {
      // Nebula clouds.
      const spots = [
        [w * 0.2, h * 0.3, 320, "rgba(80,60,180,0.16)"],
        [w * 0.8, h * 0.25, 260, "rgba(30,140,170,0.12)"],
        [w * 0.55, h * 0.55, 380, "rgba(150,50,140,0.08)"]
      ];
      ctx.save();
      ctx.globalCompositeOperation = "screen";
      spots.forEach(([x, y, r, color]) => {
        const g = ctx.createRadialGradient(x, y, 0, x, y, r);
        g.addColorStop(0, color);
        g.addColorStop(1, "rgba(0,0,0,0)");
        ctx.fillStyle = g;
        ctx.fillRect(x - r, y - r, r * 2, r * 2);
      });
      ctx.restore();
      // Distant planet.
      const px = w * 0.28;
      const py = h * 0.3;
      const pr = 62;
      const pg = ctx.createLinearGradient(px - pr, py - pr, px + pr, py + pr);
      pg.addColorStop(0, "#8f6f48");
      pg.addColorStop(0.5, "#4b3c5e");
      pg.addColorStop(1, "#161a30");
      ctx.fillStyle = pg;
      ctx.beginPath();
      ctx.arc(px, py, pr, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "rgba(190,210,255,0.22)";
      ctx.lineWidth = 2;
      ctx.save();
      ctx.translate(px, py);
      ctx.rotate(-0.32);
      ctx.beginPath();
      ctx.ellipse(0, 0, pr * 1.7, pr * 0.38, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    if (env === "ocean") {
      const g = ctx.createLinearGradient(0, h * 0.52, 0, h);
      g.addColorStop(0, rgba(sky.haze, 0.85));
      g.addColorStop(0.2, "#071827");
      g.addColorStop(1, "#020811");
      ctx.fillStyle = g;
      ctx.fillRect(0, h * 0.52, w, h * 0.48);
      // Moon / sun glitter path.
      const lightX = this.spec.time === "sunset" || this.spec.time === "day" ? w * 0.76 : w * 0.73;
      for (let i = 0; i < 46; i++) {
        const yy = h * 0.55 + i * 6;
        const spread = 10 + i * 4.5;
        const alpha = 0.28 * (1 - i / 50);
        const offset = Math.sin(t * 0.6 + i * 0.7) * 12;
        ctx.fillStyle = rgba(sky.accent, alpha);
        ctx.fillRect(lightX - spread / 2 + offset, yy, spread, 1.6);
      }
    }
  }

  drawSnowCaps(ctx) {
    const w = this.width;
    const h = this.height;
    const points = this.ridges[1];
    ctx.save();
    ctx.fillStyle = "rgba(225,238,252,0.7)";
    for (let i = 1; i < points.length - 1; i += 2) {
      const p = points[i];
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(p.x - 18, p.y + 34);
      ctx.lineTo(p.x + 4, p.y + 24);
      ctx.lineTo(p.x + 16, p.y + 32);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  }

  drawMidground(sky, t) {
    const env = this.spec.env;
    const ctx = this.ctx;
    const w = this.width;
    const h = this.height;
    const scroll = this.spec.camera === "follow" ? t * 26 : this.spec.camera === "pan" ? Math.sin(t * 0.07) * 30 : 0;

    if (env === "forest") {
      for (const tree of this.trees) {
        if (tree.layer !== 0) continue;
        this.drawPine(ctx, ((tree.x - scroll * 0.6) % (w + 80) + w + 80) % (w + 80) - 40, h * 0.78, tree.h, "#08110f", 0.9);
      }
    }

    if (env === "city") {
      for (const building of this.buildings) {
        if (building.layer !== 0) continue;
        const x = ((building.x - scroll * 0.5) % (w + 160) + w + 160) % (w + 160) - 80;
        this.drawBuilding(ctx, x, h * 0.8, building, "#070d16", t, 0.7);
      }
    }

    if (env === "road") {
      // Hills beside the road.
      ctx.fillStyle = rgba(sky.haze, 0.25);
      ctx.beginPath();
      ctx.moveTo(0, h * 0.66);
      for (let x = 0; x <= w; x += 40) ctx.lineTo(x, h * 0.6 + Math.sin(x * 0.01) * 22);
      ctx.lineTo(w, h);
      ctx.lineTo(0, h);
      ctx.fill();
    }
  }

  drawGround(sky, t) {
    const env = this.spec.env;
    const ctx = this.ctx;
    const w = this.width;
    const h = this.height;

    if (env === "city") {
      this.drawCityGround(sky, t);
      return;
    }
    if (env === "road") {
      this.drawRoad(t);
      return;
    }
    if (env === "ocean") {
      this.drawOceanWaves(t);
      return;
    }
    if (env === "space") return;

    const g = ctx.createLinearGradient(0, h * 0.66, 0, h);
    if (env === "desert") {
      g.addColorStop(0, "#402a30");
      g.addColorStop(1, "#1a1114");
    } else if (env === "snow" || this.spec.weather === "snow") {
      g.addColorStop(0, "#2a3a48");
      g.addColorStop(1, "#111a22");
    } else {
      g.addColorStop(0, rgba(sky.ground, 0.92));
      g.addColorStop(1, "#030608");
    }
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(0, h * 0.7);
    ctx.quadraticCurveTo(w * 0.5, h * 0.64, w, h * 0.7);
    ctx.lineTo(w, h);
    ctx.lineTo(0, h);
    ctx.closePath();
    ctx.fill();

    if (this.spec.weather === "snow") {
      ctx.fillStyle = "rgba(200,222,240,0.5)";
      ctx.beginPath();
      ctx.moveTo(0, h * 0.7);
      ctx.quadraticCurveTo(w * 0.5, h * 0.64, w, h * 0.7);
      ctx.lineTo(w, h * 0.73);
      ctx.quadraticCurveTo(w * 0.5, h * 0.675, 0, h * 0.735);
      ctx.closePath();
      ctx.fill();
    }

    // Ground texture strokes.
    ctx.strokeStyle = rgba(sky.accent, 0.06);
    ctx.lineWidth = 1;
    for (let i = 0; i < 26; i++) {
      const y = h * 0.73 + i * 7;
      const offset = ((t * 8 + i * 40) % (w + 100)) - 50;
      ctx.beginPath();
      ctx.moveTo(offset, y);
      ctx.lineTo(offset + 60 + i * 6, y);
      ctx.stroke();
    }
  }

  drawCityGround(sky, t) {
    const ctx = this.ctx;
    const w = this.width;
    const h = this.height;
    const g = ctx.createLinearGradient(0, h * 0.66, 0, h);
    g.addColorStop(0, "#050a12");
    g.addColorStop(0.4, "#070d17");
    g.addColorStop(1, "#02050a");
    ctx.fillStyle = g;
    ctx.fillRect(0, h * 0.68, w, h * 0.32);

    // Wet reflection streaks.
    ctx.save();
    ctx.globalCompositeOperation = "screen";
    const colors = ["#28e6c8", "#ff3f9a", "#6c7bff", "#ffb347"];
    for (let i = 0; i < 46; i++) {
      const x = (i * 97 + Math.sin(t * 0.6 + i) * 18) % w;
      const y = h * 0.7 + ((i * 53) % (h * 0.28));
      const color = colors[i % colors.length];
      const grad = ctx.createLinearGradient(x, y, x, y + 30);
      grad.addColorStop(0, rgba(color, 0.16));
      grad.addColorStop(1, rgba(color, 0));
      ctx.fillStyle = grad;
      ctx.fillRect(x, y, 2 + (i % 4), 30);
    }
    ctx.restore();

    // Puddle glow.
    const puddle = ctx.createRadialGradient(w * 0.5, h * 0.92, 20, w * 0.5, h * 0.92, w * 0.42);
    puddle.addColorStop(0, "rgba(30,120,160,0.12)");
    puddle.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = puddle;
    ctx.fillRect(0, h * 0.75, w, h * 0.25);
  }

  drawRoad(t) {
    const ctx = this.ctx;
    const w = this.width;
    const h = this.height;
    const horizon = h * 0.58;
    ctx.fillStyle = "#101016";
    ctx.beginPath();
    ctx.moveTo(w * 0.47, horizon);
    ctx.lineTo(w * 0.53, horizon);
    ctx.lineTo(w * 0.98, h);
    ctx.lineTo(w * 0.02, h);
    ctx.closePath();
    ctx.fill();

    ctx.strokeStyle = "rgba(180,205,225,0.35)";
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(w * 0.47, horizon);
    ctx.lineTo(w * 0.02, h);
    ctx.moveTo(w * 0.53, horizon);
    ctx.lineTo(w * 0.98, h);
    ctx.stroke();

    // Moving lane dashes in perspective.
    const offset = (t * 0.55) % 1;
    for (let i = 0; i < 14; i++) {
      const p = ((i + offset) / 14) ** 2;
      const y = horizon + p * (h - horizon);
      const half = lerp(1.2, 120, p);
      const len = lerp(2, 26, p);
      ctx.fillStyle = `rgba(255,220,140,${0.15 + p * 0.55})`;
      ctx.fillRect(w * 0.5 - half / 2, y, half, len);
    }

    // Roadside posts.
    for (let i = 0; i < 8; i++) {
      const p = ((i + offset * 0.5) / 8) ** 1.8;
      const y = horizon + p * (h - horizon);
      const x = lerp(w * 0.49, -40, p);
      const near = lerp(1, 8, p);
      ctx.fillStyle = "rgba(5,8,12,0.95)";
      ctx.fillRect(x, y - 70 * p, near * 1.4, 70 * p);
      ctx.fillStyle = `rgba(255,180,90,${0.4 + p * 0.4})`;
      ctx.fillRect(x - 2, y - 70 * p - 3, near * 2, 3);
    }
  }

  drawOceanWaves(t) {
    const ctx = this.ctx;
    const w = this.width;
    const h = this.height;
    for (let i = 0; i < 16; i++) {
      const y = h * 0.58 + i * 18;
      const alpha = 0.05 + (i / 16) * 0.16;
      ctx.strokeStyle = `rgba(150,210,255,${alpha})`;
      ctx.lineWidth = 1 + (i / 16) * 1.4;
      ctx.beginPath();
      for (let x = 0; x <= w; x += 18) {
        const yy = y + Math.sin(x * 0.014 + t * (0.5 + i * 0.04) + i) * (2 + i * 0.5);
        if (x === 0) ctx.moveTo(x, yy);
        else ctx.lineTo(x, yy);
      }
      ctx.stroke();
    }
  }

  drawObjectLayers(t) {
    const spec = this.spec;
    const ctx = this.ctx;
    const w = this.width;
    const h = this.height;
    const scroll = spec.camera === "follow" ? t * 30 : spec.camera === "pan" ? Math.sin(t * 0.06) * 34 : 0;

    if (spec.env === "forest" || spec.env === "mountain" || spec.env === "plain" || spec.env === "desert") {
      // Mid and foreground trees / cacti.
      for (const tree of this.trees) {
        if (tree.layer !== 1) continue;
        const x = ((tree.x - scroll * 0.9) % (w + 140) + w + 140) % (w + 140) - 70;
        if (spec.env === "desert") this.drawCactus(ctx, x, h * 0.86, tree.h * 0.35);
        else if (spec.env === "forest" || tree.tone > 0.35) this.drawPine(ctx, x, h * 0.86, tree.h * 0.7, "#06110e", 1);
      }
    }

    if (spec.env === "city") {
      for (const building of this.buildings) {
        if (building.layer !== 1) continue;
        const x = ((building.x - scroll * 0.9) % (w + 200) + w + 200) % (w + 200) - 100;
        this.drawBuilding(ctx, x, h * 0.84, building, "#050a12", t, 1);
      }
      this.drawCityDetails(t);
    }

    if (this.has("rock") || this.has("rocks")) {
      for (let i = 0; i < 5; i++) {
        const x = w * (0.1 + i * 0.2) + Math.sin(i * 3.3) * 40;
        ctx.fillStyle = "rgba(8,12,16,0.95)";
        ctx.beginPath();
        ctx.ellipse(x, h * 0.88, 30 + i * 4, 12 + i, 0, Math.PI, 0);
        ctx.fill();
      }
    }

    if (this.has("boat")) {
      const x = w * 0.6 + Math.sin(t * 0.2) * 14;
      const y = h * 0.66 + Math.sin(t * 0.9) * 4;
      ctx.fillStyle = "rgba(4,8,12,0.95)";
      ctx.beginPath();
      ctx.moveTo(x - 46, y);
      ctx.lineTo(x + 46, y);
      ctx.lineTo(x + 30, y + 17);
      ctx.lineTo(x - 32, y + 17);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = "rgba(8,12,18,0.95)";
      ctx.lineWidth = 2.4;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x - 4, y - 62);
      ctx.stroke();
      ctx.fillStyle = "rgba(225,235,250,0.85)";
      ctx.beginPath();
      ctx.moveTo(x + 2, y - 58);
      ctx.lineTo(x + 40, y - 8);
      ctx.lineTo(x + 4, y - 6);
      ctx.closePath();
      ctx.fill();
      if (spec.time === "night") {
        ctx.fillStyle = "rgba(255,200,120,0.9)";
        ctx.beginPath();
        ctx.arc(x - 10, y - 16, 2.2, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    if (this.has("campfire")) {
      const x = w * 0.22;
      const y = h * 0.84;
      const flicker = 1 + Math.sin(t * 12) * 0.12;
      const g = ctx.createRadialGradient(x, y, 4, x, y, 120 * flicker);
      g.addColorStop(0, "rgba(255,200,90,0.55)");
      g.addColorStop(0.4, "rgba(255,110,40,0.18)");
      g.addColorStop(1, "rgba(255,80,20,0)");
      ctx.fillStyle = g;
      ctx.fillRect(x - 140, y - 140, 280, 220);
      ctx.fillStyle = "#ff9a3c";
      ctx.beginPath();
      ctx.moveTo(x - 12, y);
      ctx.quadraticCurveTo(x - 22, y - 30 * flicker, x, y - 42 * flicker);
      ctx.quadraticCurveTo(x + 22, y - 30 * flicker, x + 12, y);
      ctx.fill();
      ctx.fillStyle = "#ffe6a0";
      ctx.beginPath();
      ctx.moveTo(x - 5, y);
      ctx.quadraticCurveTo(x - 10, y - 18, x, y - 26);
      ctx.quadraticCurveTo(x + 10, y - 18, x + 5, y);
      ctx.fill();
    }

    if (this.has("birds")) this.drawBirdFlock(t);
  }

  drawCityDetails(t) {
    const ctx = this.ctx;
    const w = this.width;
    const h = this.height;
    // Streetlights.
    for (let i = 0; i < 4; i++) {
      const x = w * (0.12 + i * 0.26);
      const baseY = h * 0.92;
      ctx.strokeStyle = "rgba(4,8,12,0.95)";
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(x, baseY);
      ctx.lineTo(x, h * 0.66);
      ctx.quadraticCurveTo(x, h * 0.63, x + 26, h * 0.63);
      ctx.stroke();
      const g = ctx.createRadialGradient(x + 26, h * 0.635, 2, x + 26, h * 0.635, 72);
      g.addColorStop(0, "rgba(160,235,255,0.42)");
      g.addColorStop(1, "rgba(80,180,255,0)");
      ctx.fillStyle = g;
      ctx.fillRect(x - 50, h * 0.55, 160, 160);
      ctx.fillStyle = "rgba(220,250,255,0.9)";
      ctx.beginPath();
      ctx.arc(x + 26, h * 0.635, 2.4, 0, Math.PI * 2);
      ctx.fill();
    }

    // Foreground pedestrian silhouettes on the far sidewalk.
    for (let i = 0; i < 3; i++) {
      const x = w * (0.75 + i * 0.06) + Math.sin(t * 0.4 + i) * 4;
      const s = 0.4;
      this.drawHuman(ctx, x, h * 0.73, s, t + i * 2.1, { run: false, rim: "rgba(150,240,255,0.5)", facing: i % 2 ? -1 : 1 });
    }
  }

  drawPine(ctx, x, groundY, height, color, alpha) {
    const width = height * 0.36;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(x, groundY - height);
    for (let tier = 0; tier < 4; tier++) {
      const p = tier / 4;
      const tw = width * (1 - p * 0.55);
      const ty = groundY - height + height * p * 0.78;
      ctx.lineTo(x + tw / 2, ty + height * 0.24);
      ctx.lineTo(x + tw * 0.18, ty + height * 0.24);
      ctx.lineTo(x + width * 0.42, ty + height * 0.36);
      ctx.lineTo(x - width * 0.42, ty + height * 0.36);
      ctx.lineTo(x - tw * 0.18, ty + height * 0.24);
      ctx.lineTo(x - tw / 2, ty + height * 0.24);
    }
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "#04090a";
    ctx.fillRect(x - width * 0.035, groundY - 8, width * 0.07, 12);
    ctx.restore();
  }

  drawCactus(ctx, x, groundY, height) {
    ctx.save();
    ctx.fillStyle = "rgba(5,10,8,0.95)";
    ctx.fillRect(x - 6, groundY - height, 12, height);
    ctx.fillRect(x - 22, groundY - height * 0.7, 10, height * 0.36);
    ctx.fillRect(x - 22, groundY - height * 0.7, 20, 8);
    ctx.fillRect(x + 12, groundY - height * 0.52, 8, height * 0.26);
    ctx.fillRect(x + 2, groundY - height * 0.52, 18, 8);
    ctx.restore();
  }

  drawBuilding(ctx, x, groundY, building, color, t, alpha) {
    const top = groundY - building.h;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = color;
    ctx.fillRect(x, top, building.w, building.h);
    ctx.strokeStyle = "rgba(120,170,220,0.14)";
    ctx.lineWidth = 1;
    ctx.strokeRect(x + 0.5, top + 0.5, building.w - 1, building.h - 1);

    const rand = mulberry32(building.seed);
    const cols = Math.max(2, Math.floor(building.w / 14));
    const rows = Math.max(3, Math.floor(building.h / 20));
    for (let c = 0; c < cols; c++) {
      for (let r = 0; r < rows; r++) {
        const lit = rand() > 0.62;
        if (!lit) continue;
        const flicker = rand() > 0.92 ? (Math.sin(t * 6 + c + r) > 0 ? 0.6 : 0.08) : 1;
        const warm = rand() > 0.55;
        ctx.fillStyle = warm
          ? `rgba(255,200,120,${0.5 * flicker})`
          : `rgba(120,220,255,${0.38 * flicker})`;
        ctx.fillRect(x + 6 + c * (building.w / cols), top + 12 + r * ((building.h - 20) / rows), 3.2, 4.2);
      }
    }

    if (building.neon) {
      const hue = building.seed % 3;
      const color = hue === 0 ? "255,60,150" : hue === 1 ? "80,255,230" : "150,120,255";
      const y = top + 18 + (building.seed % 40);
      ctx.fillStyle = `rgba(${color},0.8)`;
      ctx.shadowColor = `rgba(${color},0.9)`;
      ctx.shadowBlur = 14;
      ctx.fillRect(x + building.w * 0.2, y, building.w * 0.6, 2.4);
      ctx.shadowBlur = 0;
    }
    if (building.antenna) {
      ctx.strokeStyle = "rgba(120,150,180,0.5)";
      ctx.beginPath();
      ctx.moveTo(x + building.w * 0.5, top);
      ctx.lineTo(x + building.w * 0.5, top - 24);
      ctx.stroke();
      const blink = Math.sin(t * 2.4 + building.seed) > 0;
      if (blink) {
        ctx.fillStyle = "rgba(255,80,90,0.9)";
        ctx.beginPath();
        ctx.arc(x + building.w * 0.5, top - 25, 2, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.restore();
  }

  drawBirdFlock(t) {
    const ctx = this.ctx;
    const w = this.width;
    const h = this.height;
    ctx.strokeStyle = "rgba(5,10,14,0.85)";
    ctx.lineWidth = 2;
    for (let i = 0; i < 7; i++) {
      const x = ((i * 83 + t * (this.spec.motion === "fly" ? 20 : 6)) % (w + 120)) - 60;
      const y = h * (0.22 + (i % 3) * 0.045) + Math.sin(t * 0.8 + i) * 8;
      const flap = Math.sin(t * 4 + i * 1.4) * 6;
      ctx.beginPath();
      ctx.moveTo(x - 9, y + flap * 0.2);
      ctx.quadraticCurveTo(x - 4, y - flap, x, y);
      ctx.quadraticCurveTo(x + 4, y - flap, x + 9, y + flap * 0.2);
      ctx.stroke();
    }
  }

  drawWeatherBack(t) {
    const spec = this.spec;
    const ctx = this.ctx;
    const w = this.width;
    const h = this.height;
    if (spec.weather === "rain" || spec.weather === "storm") {
      ctx.strokeStyle = "rgba(175,210,240,0.5)";
      ctx.lineWidth = 1;
      for (const drop of this.rain) {
        const p = (drop.phase + t * drop.speed * 0.35) % 1;
        const x = drop.x - p * 120;
        const y = p * (h + 80) - 40;
        ctx.globalAlpha = drop.alpha;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x - 8, y + drop.length);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }
    if (spec.weather === "fog") this.drawFog(t, 0.09);
  }

  drawWeatherFront(t) {
    const spec = this.spec;
    const ctx = this.ctx;
    const w = this.width;
    const h = this.height;
    if (spec.weather === "snow") {
      ctx.save();
      ctx.fillStyle = "rgba(230,244,255,0.8)";
      for (const flake of this.snow) {
        const p = (flake.phase + t * flake.speed) % 1;
        const x = flake.x + Math.sin(t * 0.5 + flake.phase * 10) * flake.sway;
        const y = p * (h + 40) - 20;
        ctx.globalAlpha = 0.35 + (1 - p) * 0.55;
        ctx.beginPath();
        ctx.arc(x, y, flake.radius, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }
    if (spec.weather === "fog" || this.spec.env === "forest") this.drawFog(t, 0.06);
    if (spec.weather === "storm") this.drawFog(t, 0.04);

    if (this.spec.fx.includes("embers") || this.has("campfire")) {
      ctx.save();
      ctx.globalCompositeOperation = "screen";
      for (const ember of this.embers) {
        const p = (ember.phase + t * ember.speed) % 1;
        const x = ember.x + Math.sin(t * 0.7 + ember.phase * 8) * 22 + ember.drift * p;
        const y = h * 0.9 - p * h * 0.6;
        ctx.fillStyle = `rgba(255,${130 + Math.floor(p * 90)},60,${(1 - p) * 0.75})`;
        ctx.beginPath();
        ctx.arc(x, y, ember.radius, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }

    if (this.spec.fx.includes("fireflies") || (this.spec.env === "forest" && ["night", "dusk"].includes(this.spec.time))) {
      ctx.save();
      ctx.globalCompositeOperation = "screen";
      for (const fly of this.fireflies) {
        const x = fly.x + Math.sin(t * fly.speed + fly.phase) * 28;
        const y = fly.y + Math.cos(t * fly.speed * 0.7 + fly.phase) * 16;
        const alpha = 0.35 + 0.65 * (0.5 + Math.sin(t * 2 + fly.phase) * 0.5);
        const g = ctx.createRadialGradient(x, y, 0, x, y, fly.radius * 8);
        g.addColorStop(0, `rgba(215,255,150,${alpha})`);
        g.addColorStop(0.3, `rgba(160,255,120,${alpha * 0.35})`);
        g.addColorStop(1, "rgba(120,255,100,0)");
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(x, y, fly.radius * 8, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }
  }

  drawFog(t, alpha) {
    const ctx = this.ctx;
    const w = this.width;
    const h = this.height;
    ctx.save();
    ctx.globalCompositeOperation = "screen";
    for (let i = 0; i < 4; i++) {
      const y = h * (0.55 + i * 0.11);
      const offset = Math.sin(t * 0.08 + i * 1.9) * 120;
      const g = ctx.createLinearGradient(0, y - 70, 0, y + 60);
      g.addColorStop(0, "rgba(150,180,200,0)");
      g.addColorStop(0.5, `rgba(150,185,205,${alpha * (0.7 + i * 0.12)})`);
      g.addColorStop(1, "rgba(120,150,175,0)");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.ellipse(w * 0.5 + offset, y, w * 0.85, 60 + i * 10, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  drawSubject(t) {
    const spec = this.spec;
    if (!spec || spec.subject === "none") return;
    const ctx = this.ctx;
    const w = this.width;
    const h = this.height;
    const rim = RIM[spec.lighting] || RIM.moonlit;
    const motion = spec.motion;
    const speedFactor = motion === "run" ? 9 : motion === "drive" ? 7 : motion === "walk" ? 5 : 2;
    const phase = t * speedFactor;

    if (spec.subject === "human") {
      const x = spec.camera === "follow" ? w * 0.5 : w * 0.42 + Math.sin(t * 0.12) * 8;
      const gy = h * 0.88;
      ctx.fillStyle = "rgba(0,0,0,0.35)";
      ctx.beginPath();
      ctx.ellipse(x, gy + 5, 34, 8, 0, 0, Math.PI * 2);
      ctx.fill();
      this.drawHuman(ctx, x, gy, 1.05, phase, { run: motion === "run", rim, facing: 1 });
    } else if (spec.subject === "car") {
      const x = spec.camera === "follow" ? w * 0.5 : w * 0.55 + Math.sin(t * 0.25) * 24;
      const gy = spec.env === "city" ? h * 0.87 : h * 0.86;
      this.drawCar(ctx, x, gy, 1.15, t, { neon: spec.lighting === "neon", speed: motion === "drive" ? 1 : 0.2, rim });
    } else if (spec.subject === "astronaut") {
      const x = w * 0.5 + Math.sin(t * 0.24) * 24;
      const y = h * 0.56 + Math.sin(t * 0.5) * 8;
      this.drawAstronaut(ctx, x, y, 1, t, rim);
    } else if (spec.subject === "cat") {
      const x = spec.camera === "follow" ? w * 0.5 : w * 0.42 + Math.sin(t * 0.2) * 10;
      const gy = h * 0.87;
      this.drawCat(ctx, x, gy, 1, t, phase, rim);
    } else if (spec.subject === "deer") {
      const x = w * 0.45;
      const gy = h * 0.87;
      this.drawDeer(ctx, x, gy, 1, t, rim);
    } else if (spec.subject === "bird") {
      const x = w * 0.5;
      const y = h * 0.4;
      this.drawBirdSubject(ctx, x, y, t, rim);
    } else if (spec.subject === "fish") {
      const x = w * 0.52 + Math.sin(t * 0.35) * 60;
      const y = h * 0.7 + Math.sin(t * 0.9) * 10;
      this.drawFish(ctx, x, y, 1.2, t, rim);
    }
  }

  drawHuman(ctx, x, gy, scale, phase, { run = false, rim = "#d8e6ff", facing = 1 } = {}) {
    const s = 128 * scale;
    const bob = Math.sin(phase * 2) * (run ? 4 : 2.4);
    const lean = run ? 0.1 : 0.035;
    ctx.save();
    ctx.translate(x, gy - Math.abs(bob) * 0.4);
    ctx.scale(facing, 1);
    ctx.translate(0, -s * 0.42);
    ctx.rotate(lean);

    const swing = Math.sin(phase) * (run ? 0.95 : 0.55);
    const knee = Math.max(0, Math.sin(phase + 0.9)) * (run ? 30 : 16);
    // Legs.
    ctx.strokeStyle = "#05080b";
    ctx.lineWidth = s * 0.11;
    ctx.lineCap = "round";
    for (const side of [1, -1]) {
      const hipX = side * s * 0.075;
      const stride = swing * s * (side === 1 ? 1 : -1) * 0.4;
      const footX = hipX + stride;
      const footY = s * 0.42;
      const kneeX = hipX + stride * 0.5 + side * 2;
      const kneeY = s * 0.2 - knee * 0.3 + Math.abs(swing) * 4;
      ctx.beginPath();
      ctx.moveTo(hipX, 0);
      ctx.quadraticCurveTo(kneeX, kneeY, footX, footY);
      ctx.stroke();
    }

    // Coat / torso.
    const coat = ctx.createLinearGradient(-s * 0.2, -s * 0.3, s * 0.2, s * 0.4);
    coat.addColorStop(0, "#05090c");
    coat.addColorStop(1, "#0b1319");
    ctx.fillStyle = coat;
    ctx.beginPath();
    ctx.moveTo(-s * 0.16, -s * 0.3);
    ctx.quadraticCurveTo(-s * 0.22, s * 0.05, -s * 0.2, s * 0.32);
    ctx.lineTo(-s * 0.03, s * 0.32);
    ctx.lineTo(0, s * 0.02);
    ctx.lineTo(s * 0.03, s * 0.32);
    ctx.lineTo(s * 0.2, s * 0.32);
    ctx.quadraticCurveTo(s * 0.22, s * 0.02, s * 0.15, -s * 0.3);
    ctx.closePath();
    ctx.fill();

    // Coat rim light.
    ctx.strokeStyle = rgba(rim, 0.5);
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(s * 0.16, -s * 0.28);
    ctx.quadraticCurveTo(s * 0.23, s * 0.04, s * 0.2, s * 0.32);
    ctx.stroke();

    // Arms.
    const armSwing = Math.sin(phase + Math.PI) * (run ? 0.9 : 0.5);
    for (const side of [1, -1]) {
      const shoulderX = side * s * 0.14;
      const handX = shoulderX + armSwing * s * 0.34 * side;
      const handY = s * 0.14 + Math.abs(armSwing) * s * 0.06;
      ctx.strokeStyle = "#060b0e";
      ctx.lineWidth = s * 0.075;
      ctx.beginPath();
      ctx.moveTo(shoulderX, -s * 0.22);
      ctx.quadraticCurveTo(shoulderX + side * 8, -s * 0.02, handX, handY);
      ctx.stroke();
    }

    // Head + hood silhouette.
    ctx.fillStyle = "#060a0d";
    ctx.beginPath();
    ctx.arc(0, -s * 0.4, s * 0.095, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = rgba(rim, 0.6);
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.arc(0, -s * 0.4, s * 0.095, -2.3, 1.1);
    ctx.stroke();

    // Scarf trail.
    if (run || this.spec.weather === "rain" || this.spec.weather === "storm") {
      ctx.strokeStyle = "rgba(90,110,130,0.75)";
      ctx.lineWidth = s * 0.035;
      ctx.beginPath();
      ctx.moveTo(-s * 0.03, -s * 0.31);
      ctx.quadraticCurveTo(-s * 0.28, -s * 0.28 + Math.sin(phase * 1.3) * 8, -s * 0.42, -s * 0.14 + Math.cos(phase) * 8);
      ctx.stroke();
    }
    ctx.restore();
  }

  drawCar(ctx, x, gy, scale, t, { neon = false, speed = 1, rim = "#8df5ff" } = {}) {
    const s = 210 * scale;
    const wheelSpin = t * 8 * speed;
    const bounce = Math.sin(t * 9 * speed) * 0.8;
    ctx.save();
    ctx.translate(x, gy + bounce);

    // Ground glow.
    const under = ctx.createRadialGradient(0, 0, 4, 0, 0, s * 0.7);
    under.addColorStop(0, neon ? "rgba(60,255,230,0.4)" : "rgba(255,180,80,0.18)");
    under.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = under;
    ctx.fillRect(-s * 0.7, -20, s * 1.4, 70);

    // Shadow.
    ctx.fillStyle = "rgba(0,0,0,0.5)";
    ctx.beginPath();
    ctx.ellipse(0, 2, s * 0.47, 11, 0, 0, Math.PI * 2);
    ctx.fill();

    // Speed streaks.
    if (speed > 0.6) {
      ctx.strokeStyle = neon ? "rgba(90,240,255,0.28)" : "rgba(255,255,255,0.14)";
      ctx.lineWidth = 2;
      for (let i = 0; i < 3; i++) {
        const yy = -s * (0.18 + i * 0.07);
        ctx.beginPath();
        ctx.moveTo(-s * 0.7 - i * 40 - (t * 200) % 60, yy);
        ctx.lineTo(-s * 0.42, yy);
        ctx.stroke();
      }
    }

    // Body.
    const body = ctx.createLinearGradient(0, -s * 0.3, 0, 0);
    body.addColorStop(0, "#1b2733");
    body.addColorStop(0.5, "#0b141d");
    body.addColorStop(1, "#050a0f");
    ctx.fillStyle = body;
    ctx.beginPath();
    ctx.moveTo(-s * 0.46, -s * 0.06);
    ctx.lineTo(-s * 0.34, -s * 0.2);
    ctx.quadraticCurveTo(-s * 0.12, -s * 0.33, s * 0.02, -s * 0.33);
    ctx.quadraticCurveTo(s * 0.22, -s * 0.32, s * 0.37, -s * 0.18);
    ctx.lineTo(s * 0.47, -s * 0.08);
    ctx.lineTo(s * 0.44, s * 0.01);
    ctx.lineTo(-s * 0.44, s * 0.01);
    ctx.closePath();
    ctx.fill();

    // Cabin glass.
    const glass = ctx.createLinearGradient(0, -s * 0.33, 0, -s * 0.12);
    glass.addColorStop(0, neon ? "rgba(80,220,255,0.55)" : "rgba(170,210,255,0.35)");
    glass.addColorStop(1, "rgba(10,20,30,0.9)");
    ctx.fillStyle = glass;
    ctx.beginPath();
    ctx.moveTo(-s * 0.2, -s * 0.17);
    ctx.quadraticCurveTo(-s * 0.05, -s * 0.31, s * 0.08, -s * 0.31);
    ctx.quadraticCurveTo(s * 0.22, -s * 0.3, s * 0.3, -s * 0.16);
    ctx.closePath();
    ctx.fill();

    // Rim light.
    ctx.strokeStyle = rgba(rim, 0.75);
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-s * 0.3, -s * 0.21);
    ctx.quadraticCurveTo(-s * 0.1, -s * 0.34, s * 0.06, -s * 0.335);
    ctx.quadraticCurveTo(s * 0.24, -s * 0.32, s * 0.38, -s * 0.18);
    ctx.stroke();

    // Underglow line.
    ctx.strokeStyle = neon ? "rgba(70,255,225,0.95)" : "rgba(255,170,70,0.55)";
    ctx.shadowColor = neon ? "#3dffe0" : "#ffae55";
    ctx.shadowBlur = 16;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(-s * 0.4, -s * 0.015);
    ctx.lineTo(s * 0.4, -s * 0.015);
    ctx.stroke();
    ctx.shadowBlur = 0;

    // Wheels.
    for (const side of [-1, 1]) {
      const wx = side * s * 0.3;
      const wy = -s * 0.005;
      ctx.save();
      ctx.translate(wx, wy);
      ctx.fillStyle = "#03060a";
      ctx.beginPath();
      ctx.arc(0, 0, s * 0.11, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "rgba(150,190,215,0.5)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, 0, s * 0.072, 0, Math.PI * 2);
      ctx.stroke();
      ctx.save();
      ctx.rotate(wheelSpin * (side === -1 ? 1 : 1));
      ctx.strokeStyle = "rgba(160,200,220,0.55)";
      ctx.lineWidth = 2;
      for (let i = 0; i < 4; i++) {
        ctx.rotate(Math.PI / 2);
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(0, -s * 0.062);
        ctx.stroke();
      }
      ctx.restore();
      ctx.restore();
    }

    // Headlight cone.
    const beam = ctx.createLinearGradient(s * 0.4, -s * 0.1, s * 1.15, -s * 0.3);
    beam.addColorStop(0, "rgba(220,245,255,0.35)");
    beam.addColorStop(1, "rgba(210,240,255,0)");
    ctx.fillStyle = beam;
    ctx.beginPath();
    ctx.moveTo(s * 0.36, -s * 0.12);
    ctx.lineTo(s * 1.1, -s * 0.36);
    ctx.lineTo(s * 1.12, -s * 0.02);
    ctx.lineTo(s * 0.44, -s * 0.02);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "rgba(240,255,255,0.95)";
    ctx.beginPath();
    ctx.arc(s * 0.4, -s * 0.08, 3.5, 0, Math.PI * 2);
    ctx.fill();

    // Taillight.
    ctx.fillStyle = "rgba(255,60,90,0.9)";
    ctx.shadowColor = "#ff3d62";
    ctx.shadowBlur = 10;
    ctx.fillRect(-s * 0.47, -s * 0.1, 4, 9);
    ctx.shadowBlur = 0;
    ctx.restore();
  }

  drawAstronaut(ctx, x, y, scale, t, rim) {
    const s = 120 * scale;
    const float = Math.sin(t * 0.7) * 5;
    ctx.save();
    ctx.translate(x, y + float);
    ctx.rotate(Math.sin(t * 0.35) * 0.035);

    // Tether.
    ctx.strokeStyle = "rgba(200,220,255,0.35)";
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(-s * 0.22, 0);
    ctx.bezierCurveTo(-s * 1.4, s * 0.3, -s * 2.4, -s * 0.6, -s * 3.1, s * 0.1);
    ctx.stroke();

    // Backpack.
    ctx.fillStyle = "#0a1119";
    ctx.fillRect(-s * 0.34, -s * 0.36, s * 0.24, s * 0.6);
    ctx.fillStyle = rgba(rim, 0.35);
    ctx.fillRect(-s * 0.32, -s * 0.32, s * 0.04, s * 0.48);

    // Body.
    const suit = ctx.createLinearGradient(-s * 0.2, -s * 0.2, s * 0.2, s * 0.5);
    suit.addColorStop(0, "#c9d7e4");
    suit.addColorStop(0.5, "#7f94a8");
    suit.addColorStop(1, "#3d4c5c");
    ctx.fillStyle = suit;
    ctx.beginPath();
    ctx.roundRect(-s * 0.18, -s * 0.22, s * 0.36, s * 0.52, s * 0.08);
    ctx.fill();
    ctx.strokeStyle = rgba(rim, 0.55);
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Legs.
    ctx.strokeStyle = "#9aaec0";
    ctx.lineWidth = s * 0.12;
    ctx.lineCap = "round";
    for (const side of [-1, 1]) {
      const kick = Math.sin(t * 0.8 + side) * 0.16;
      ctx.beginPath();
      ctx.moveTo(side * s * 0.08, s * 0.25);
      ctx.lineTo(side * s * 0.13 + kick * s, s * 0.46);
      ctx.stroke();
    }

    // Arms.
    for (const side of [-1, 1]) {
      const wave = Math.sin(t * 0.6 + side * 1.2) * 0.12;
      ctx.beginPath();
      ctx.moveTo(side * s * 0.18, -s * 0.14);
      ctx.lineTo(side * s * 0.3, s * 0.1 + wave * s);
      ctx.stroke();
    }

    // Helmet.
    const helm = ctx.createRadialGradient(-s * 0.05, -s * 0.42, 2, 0, -s * 0.36, s * 0.22);
    helm.addColorStop(0, "#eef5fb");
    helm.addColorStop(0.7, "#9cafc0");
    helm.addColorStop(1, "#52616f");
    ctx.fillStyle = helm;
    ctx.beginPath();
    ctx.arc(0, -s * 0.36, s * 0.19, 0, Math.PI * 2);
    ctx.fill();

    // Visor.
    const visor = ctx.createLinearGradient(-s * 0.1, -s * 0.48, s * 0.1, -s * 0.26);
    visor.addColorStop(0, "#101c2a");
    visor.addColorStop(0.5, "#1d4c5c");
    visor.addColorStop(1, "#0b1520");
    ctx.fillStyle = visor;
    ctx.beginPath();
    ctx.ellipse(s * 0.045, -s * 0.36, s * 0.145, s * 0.125, -0.1, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "rgba(140,245,255,0.35)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.ellipse(s * 0.03, -s * 0.39, s * 0.09, s * 0.06, -0.3, 0, Math.PI);
    ctx.stroke();

    // Chest light.
    ctx.fillStyle = "rgba(255,120,130,0.85)";
    ctx.beginPath();
    ctx.arc(s * 0.02, -s * 0.02, 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  drawCat(ctx, x, gy, scale, t, phase, rim) {
    const s = 74 * scale;
    const bob = Math.sin(phase * 2) * 1.5;
    ctx.save();
    ctx.translate(x, gy + bob);
    // Shadow.
    ctx.fillStyle = "rgba(0,0,0,0.4)";
    ctx.beginPath();
    ctx.ellipse(0, 2, s * 0.5, s * 0.09, 0, 0, Math.PI * 2);
    ctx.fill();

    // Tail.
    ctx.strokeStyle = "#060b0d";
    ctx.lineWidth = s * 0.09;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(-s * 0.32, -s * 0.5);
    ctx.bezierCurveTo(-s * 0.72, -s * 0.6 + Math.sin(t * 2) * 6, -s * 0.6, -s * 0.95, -s * 0.42, -s * 0.9 + Math.cos(t * 1.7) * 5);
    ctx.stroke();

    // Legs.
    ctx.lineWidth = s * 0.075;
    for (const side of [-1, 1]) {
      const legPhase = Math.sin(phase + (side === 1 ? 0 : Math.PI)) * 0.07;
      ctx.beginPath();
      ctx.moveTo(side * s * 0.16, -s * 0.22);
      ctx.lineTo(side * s * 0.18 + legPhase * s, -s * 0.02);
      ctx.stroke();
    }

    // Body.
    ctx.fillStyle = "#060b0d";
    ctx.beginPath();
    ctx.ellipse(0, -s * 0.38, s * 0.36, s * 0.22, -0.04, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = rgba(rim, 0.4);
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.ellipse(0, -s * 0.38, s * 0.36, s * 0.22, -0.04, -2.6, -0.5);
    ctx.stroke();

    // Head.
    ctx.fillStyle = "#070c0e";
    ctx.beginPath();
    ctx.arc(s * 0.3, -s * 0.58, s * 0.17, 0, Math.PI * 2);
    ctx.fill();
    // Ears.
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(s * 0.3 + side * s * 0.07, -s * 0.7);
      ctx.lineTo(s * 0.3 + side * s * 0.15, -s * 0.87);
      ctx.lineTo(s * 0.3 + side * s * 0.15, -s * 0.66);
      ctx.closePath();
      ctx.fill();
    }
    // Eyes.
    ctx.fillStyle = rgba(rim, 0.95);
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.ellipse(s * 0.32 + side * s * 0.06, -s * 0.6, s * 0.018, s * 0.026, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  drawDeer(ctx, x, gy, scale, t, rim) {
    const s = 120 * scale;
    const breathe = Math.sin(t * 0.8) * 1.5;
    ctx.save();
    ctx.translate(x, gy);
    ctx.fillStyle = "rgba(0,0,0,0.35)";
    ctx.beginPath();
    ctx.ellipse(0, 2, s * 0.44, s * 0.08, 0, 0, Math.PI * 2);
    ctx.fill();

    // Legs.
    ctx.strokeStyle = "#070c0c";
    ctx.lineWidth = s * 0.045;
    ctx.lineCap = "round";
    [[-0.28, 0], [0.24, 0.04], [-0.22, 0.1], [0.28, 0.12]].forEach(([lx, off]) => {
      ctx.beginPath();
      ctx.moveTo(lx * s, -s * 0.48);
      ctx.lineTo(lx * s + off * s, -s * 0.03);
      ctx.stroke();
    });

    // Body.
    ctx.fillStyle = "#080d0c";
    ctx.beginPath();
    ctx.ellipse(0, -s * 0.56 + breathe, s * 0.36, s * 0.2, -0.03, 0, Math.PI * 2);
    ctx.fill();
    // Neck + head.
    ctx.beginPath();
    ctx.moveTo(s * 0.2, -s * 0.64);
    ctx.quadraticCurveTo(s * 0.4, -s * 0.82, s * 0.36, -s * 0.95);
    ctx.lineTo(s * 0.48, -s * 0.98);
    ctx.quadraticCurveTo(s * 0.5, -s * 0.8, s * 0.32, -s * 0.58);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(s * 0.46, -s * 1.0, s * 0.11, s * 0.07, 0.2, 0, Math.PI * 2);
    ctx.fill();

    // Antlers.
    ctx.strokeStyle = rgba(rim, 0.55);
    ctx.lineWidth = 1.7;
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(s * (0.44 + side * 0.02), -s * 1.05);
      ctx.quadraticCurveTo(s * (0.5 + side * 0.04), -s * 1.22, s * (0.38 + side * 0.03), -s * 1.32);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(s * 0.47, -s * 1.16);
      ctx.lineTo(s * 0.58, -s * 1.24);
      ctx.stroke();
    }

    // Rim light on back.
    ctx.strokeStyle = rgba(rim, 0.42);
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.ellipse(0, -s * 0.56 + breathe, s * 0.36, s * 0.2, -0.03, -2.8, -0.4);
    ctx.stroke();

    // Eye.
    ctx.fillStyle = rgba(rim, 0.85);
    ctx.beginPath();
    ctx.arc(s * 0.49, -s * 1.01, 1.6, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  drawBirdSubject(ctx, x, y, t, rim) {
    const s = 1.5;
    const flap = Math.sin(t * 6) * 24;
    ctx.save();
    ctx.translate(x, y);
    ctx.strokeStyle = "rgba(6,10,12,0.95)";
    ctx.lineWidth = 5;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(-70 * s, 0);
    ctx.quadraticCurveTo(-30 * s, -flap, 0, 0);
    ctx.quadraticCurveTo(30 * s, -flap, 70 * s, 0);
    ctx.stroke();
    ctx.strokeStyle = rgba(rim, 0.35);
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(-70 * s, 0);
    ctx.quadraticCurveTo(-30 * s, -flap, 0, 0);
    ctx.stroke();
    ctx.restore();
  }

  drawFish(ctx, x, y, scale, t, rim) {
    const s = 90 * scale;
    const wiggle = Math.sin(t * 3) * 10;
    ctx.save();
    ctx.translate(x, y);
    // Tail.
    ctx.fillStyle = "#0a1b20";
    ctx.beginPath();
    ctx.moveTo(-s * 0.45, 0);
    ctx.lineTo(-s * 0.85, -s * 0.2 + wiggle);
    ctx.lineTo(-s * 0.8, s * 0.18 + wiggle);
    ctx.closePath();
    ctx.fill();
    // Body.
    const g = ctx.createLinearGradient(-s * 0.5, 0, s * 0.5, 0);
    g.addColorStop(0, "#0a222b");
    g.addColorStop(0.5, "#145e6b");
    g.addColorStop(1, "#48d7e6");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(0, 0, s * 0.48, s * 0.19, 0, 0, Math.PI * 2);
    ctx.fill();
    // Fin.
    ctx.fillStyle = "rgba(90,220,235,0.5)";
    ctx.beginPath();
    ctx.moveTo(-s * 0.05, -s * 0.16);
    ctx.quadraticCurveTo(0, -s * 0.36, s * 0.18, -s * 0.14);
    ctx.closePath();
    ctx.fill();
    // Eye.
    ctx.fillStyle = rgba(rim, 0.9);
    ctx.beginPath();
    ctx.arc(s * 0.3, -s * 0.02, 2.1, 0, Math.PI * 2);
    ctx.fill();
    // Bubbles.
    ctx.strokeStyle = "rgba(180,240,250,0.35)";
    ctx.lineWidth = 1;
    for (let i = 0; i < 4; i++) {
      const p = (t * 0.25 + i * 0.25) % 1;
      ctx.beginPath();
      ctx.arc(s * 0.52 + i * 6, -p * 120, 2 + i, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
  }

  drawForeground(sky, t) {
    const env = this.spec.env;
    const ctx = this.ctx;
    const w = this.width;
    const h = this.height;
    if (env === "forest") {
      // Near silhouetted branches framing the scene.
      ctx.fillStyle = "#030605";
      ctx.beginPath();
      ctx.moveTo(-20, h);
      ctx.lineTo(-20, h * 0.32);
      ctx.quadraticCurveTo(w * 0.08, h * 0.5, w * 0.13, h * 0.68);
      ctx.quadraticCurveTo(w * 0.16, h * 0.5, w * 0.2, h * 0.44);
      ctx.quadraticCurveTo(w * 0.12, h * 0.34, w * 0.1, h);
      ctx.closePath();
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(w + 20, h);
      ctx.lineTo(w + 20, h * 0.26);
      ctx.quadraticCurveTo(w * 0.9, h * 0.48, w * 0.86, h * 0.7);
      ctx.quadraticCurveTo(w * 0.83, h * 0.5, w * 0.78, h * 0.4);
      ctx.quadraticCurveTo(w * 0.89, h * 0.3, w * 0.9, h);
      ctx.closePath();
      ctx.fill();
    }
    if (env === "city") {
      // Subtle vertical foreground silhouettes.
      ctx.fillStyle = "rgba(2,5,8,0.85)";
      ctx.fillRect(0, h * 0.7, 36, h * 0.3);
      ctx.fillRect(w - 30, h * 0.72, 30, h * 0.28);
    }
    if (env === "road" || env === "mountain") {
      ctx.fillStyle = "rgba(2,5,4,0.9)";
      ctx.beginPath();
      ctx.moveTo(0, h);
      ctx.lineTo(0, h * 0.88);
      ctx.quadraticCurveTo(w * 0.2, h * 0.8, w * 0.36, h * 0.9);
      ctx.lineTo(w * 0.4, h);
      ctx.closePath();
      ctx.fill();
    }
  }

  drawLightning(t) {
    if (this.spec.weather !== "storm") return;
    const cycle = t % 8.5;
    let flash = 0;
    if (cycle > 6.1 && cycle < 6.22) flash = 1;
    else if (cycle > 6.4 && cycle < 6.47) flash = 0.6;
    else if (cycle > 6.7 && cycle < 6.74) flash = 0.3;
    if (!flash) return;
    const ctx = this.ctx;
    const w = this.width;
    const h = this.height;
    ctx.save();
    ctx.globalCompositeOperation = "screen";
    ctx.fillStyle = `rgba(190,215,255,${flash * 0.32})`;
    ctx.fillRect(0, 0, w, h);
    // Bolt.
    ctx.strokeStyle = `rgba(235,245,255,${flash})`;
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    let x = w * 0.68;
    let y = h * 0.12;
    ctx.moveTo(x, y);
    for (let i = 0; i < 7; i++) {
      x += (this.rng() - 0.5) * 60;
      y += h * 0.075;
      ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.restore();
  }

  drawPost(sky, t) {
    const ctx = this.ctx;
    const w = this.width;
    const h = this.height;
    // Vignette.
    const vignette = ctx.createRadialGradient(w / 2, h / 2, h * 0.28, w / 2, h / 2, h * 0.85);
    vignette.addColorStop(0, "rgba(0,0,0,0)");
    vignette.addColorStop(0.75, "rgba(0,0,0,0.22)");
    vignette.addColorStop(1, "rgba(0,0,0,0.62)");
    ctx.fillStyle = vignette;
    ctx.fillRect(0, 0, w, h);

    // Fog wash.
    if (this.spec.weather === "fog") {
      ctx.fillStyle = "rgba(100,125,145,0.1)";
      ctx.fillRect(0, 0, w, h);
    }

    // Cinematic bars hint (kept thin, not cropping content).
    ctx.fillStyle = "rgba(0,0,0,0.25)";
    ctx.fillRect(0, 0, w, 8);
    ctx.fillRect(0, h - 8, w, 8);

    // Film grain.
    if (!this._grainPattern) {
      const size = 96;
      const off = document.createElement("canvas");
      off.width = size;
      off.height = size;
      const octx = off.getContext("2d");
      const image = octx.createImageData(size, size);
      let seed = 7;
      for (let i = 0; i < image.data.length; i += 4) {
        seed = (seed * 1103515245 + 12345) & 0x7fffffff;
        const v = (seed >> 16) & 255;
        image.data[i] = v;
        image.data[i + 1] = v;
        image.data[i + 2] = v;
        image.data[i + 3] = 16;
      }
      octx.putImageData(image, 0, 0);
      this._grainPattern = ctx.createPattern(off, "repeat");
    }
    if (this._grainPattern) {
      ctx.save();
      ctx.globalAlpha = 0.35;
      ctx.fillStyle = this._grainPattern;
      ctx.translate((t * 7) % 96, (t * 11) % 96);
      ctx.fillRect(-96, -96, w + 192, h + 192);
      ctx.restore();
    }
  }
}
