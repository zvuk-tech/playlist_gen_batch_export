// sketch.js
// Batch ZIP export + hashtags
// - Насыщенность УБРАНА
// - el переименован в wvs (цвет волны)
// - Контраст = DeltaE76 (Lab) + АВТОКАЛИБРОВКА порогов по твоей палитре => ctr-LOW/MID/HI
//   (исправляет проблему “везде ctr-HI” на яркой палитре)
// ========================

// ========================
// GLOBALS
// ========================
let bgColor, ellipseColor;
let params;

let ellipseX = [], ellipseY = [], ellipseW = [], ellipseH = [], ellipseSkew = [];
let baseHeightNorm = [], baseSkewNorm = [];
let extraLeft = 5, extraRight = 5;

// ✅ Badge toggles (default OFF for batch)
let exportShowLogo = false;
let exportShowPlaque = false;

// ✅ Square preview buffer (shows EXACT square export framing)
let squarePreviewGfx = null;
let squarePreviewSize = 0;

const paletteColors = [
  "06DF65","B9FF8E","209F6D","AEEEFF","F7F0B1","FFD1E5","CBF2EC",
  "D7D9FF","2CB1FF","FF9535","FF49A0","00DBDB","765BFF"
];

// ========================
// FORBIDDEN COLOR PAIRS (bg <-> ellipse), order-independent
// ========================
const forbiddenPairsRaw = [
  ["AEEEFF","CBF2EC"],
  ["B9FF8E","AEEEFF"],
  ["B9FF8E","CBF2EC"],
  ["D3C8D0","F7F0B1"],
  ["CBF2EC","AEEEFF"],
  ["D3C8D0","FFD1E5"],
  ["D7D9FF","FFD1E5"],
  ["209f6d","ff49a0"],
  ["00dbdb","d3c8d0"],
  ["209f6d","d3c8d0"],
  ["d3c8d0","d7d9ff"],
  ["f7f0b1","b9ff8e"],
  ["ff9535","d7d9ff"],
  ["d7d9ff","209f6d"],
  ["d7d9ff","06df65"],
  ["D7D9FF","CBF2EC"],
  ["FF9535","00DBDB"],
  ["FFD1E5","CBF2EC"],
  ["B9FF8E","FFD1E5"],
  ["765BFF","209F6D"],
  ["FFD1E5","AEEEFF"],
  ["00DBDB","06DF65"],
  ["D3C8D0","CBF2EC"],
  ["209F6D","765BFF"],
  ["B9FF8E","AEEEFF"],
  ["F7F0B1","CBF2EC"],
  ["AEEEFF","D7D9FF"],
  ["FF9535","D3C8D0"],
  ["AEEEFF","D3C8D0"],
  ["06DF65","FF9535"],
  ["B9FF8E","D7D9FF"],
  ["06DF65","FF49A0"],
  ["CBF2EC","B9FF8E"],
  ["FF49A0","06DF65"],
];

// ========================
// BADGE ASSETS
// ========================
let plaqueImg = null;
let logoImg = null;

function preload() {
  // если файлов нет — просто не отрисуем бейдж
  plaqueImg = loadImage('plaque.svg', () => {}, () => {});
  logoImg   = loadImage('logo.svg',   () => {}, () => {});
}

// ========================
// COLOR / FORBIDDEN UTILS
// ========================
function normHex(h) {
  return String(h).trim().replace(/^#/, "").toUpperCase();
}
function pairKey(a, b) {
  const x = normHex(a);
  const y = normHex(b);
  return (x < y) ? `${x}|${y}` : `${y}|${x}`;
}
const forbiddenSet = new Set(forbiddenPairsRaw.map(([a,b]) => pairKey(a,b)));
function isForbiddenPair(bgHex, ellHex) {
  return forbiddenSet.has(pairKey(bgHex, ellHex));
}
function randomPaletteHex() {
  return normHex(random(paletteColors));
}

// ========================
// RANDOM RANGES (UI-less batch)
// ========================
const PARAM_RANGES = {
  skewAngleX:        { min: -0.785, max: 0.785, step: 0.01 },
  skewAngleY:        { min: -0.785, max: 0.785, step: 0.01 },

  maxEllipseHeight:  { min: 100, max: 500, step: 10 },
  heightRandomness:  { min: 0, max: 1, step: 0.01 },

  chaos:             { min: 0, max: 0.52, step: 0.01 },

  waveAmplitude:     { min: 0, max: 100, step: 1 },
  waveOffset:        { min: 0, max: 1000, step: 1 },

  lineCopies:        { min: 0, max: 5, step: 1, int: true },
  lineSpacing:       { min: 160, max: 700, step: 1 },

  ellipseSpacing:    { min: -15, max: 30, step: 1, int: true },
  ellipseWidth:      { min: 25, max: 150, step: 1, int: true },

  rotateXAngle:      { min: -1, max: 1, step: 0.01 },
  rotateYAngle:      { min: -1, max: 1, step: 0.01 },
  rotateZAngle:      { min: -1, max: 1, step: 0.01 },

  posX:              { min: -200, max: 200, step: 1, int: true },
  posY:              { min: -200, max: 200, step: 1, int: true },
  posZ:              { min: -500, max: 500, step: 1, int: true },
};

// ✅ как раньше: ellipseCount всегда максимум.
// В твоём старом UI max был 50. Если тебе нужно 60 — поставь 60.
const MAX_ELLIPSE_COUNT = 50;

function quantize(v, step) {
  if (!step || step <= 0) return v;
  return Math.round(v / step) * step;
}

function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
function lerp(a, b, t) { return a + (b - a) * t; }

// ========================
// RANDOM EXCLUDING RANGE (for ellipseSpacing)
// ========================
const RANDOM_SPACING_FORBIDDEN_MIN = -1;
const RANDOM_SPACING_FORBIDDEN_MAX = 10;

function randomExcludingRange(min, max, forbidMin, forbidMax) {
  if (forbidMax < min || forbidMin > max) return random(min, max);

  const a0 = min;
  const a1 = Math.min(forbidMin, max);
  const b0 = Math.max(forbidMax, min);
  const b1 = max;

  const lenA = Math.max(0, a1 - a0);
  const lenB = Math.max(0, b1 - b0);

  if (lenA + lenB <= 0) return min;

  const pick = random(0, lenA + lenB);
  if (pick < lenA) return a0 + pick;
  return b0 + (pick - lenA);
}

// ========================
// lineSpacing depends on maxEllipseHeight (UI-less)
// ========================
function syncLineSpacingToHeight() {
  const hMin = PARAM_RANGES.maxEllipseHeight.min;
  const hMax = PARAM_RANGES.maxEllipseHeight.max;
  const sMin = PARAM_RANGES.lineSpacing.min;
  const sMax = PARAM_RANGES.lineSpacing.max;

  const h = clamp(params.maxEllipseHeight, hMin, hMax);
  const t = (hMax === hMin) ? 0 : (h - hMin) / (hMax - hMin);
  params.lineSpacing = lerp(sMin, sMax, t);
}

// ========================
// SET RANDOM COLORS (respect forbidden pairs)
// ========================
function setRandomColors() {
  let bgHex = null;
  let ellHex = null;

  for (let i = 0; i < 400; i++) {
    bgHex = randomPaletteHex();
    ellHex = randomPaletteHex();
    if (ellHex === bgHex) continue;
    if (isForbiddenPair(bgHex, ellHex)) continue;
    break;
  }

  if (!bgHex) bgHex = randomPaletteHex();
  if (!ellHex) {
    for (let i = 0; i < 400; i++) {
      const c = randomPaletteHex();
      if (c === bgHex) continue;
      if (!isForbiddenPair(bgHex, c)) { ellHex = c; break; }
    }
    if (!ellHex) ellHex = randomPaletteHex();
  }

  bgColor = color("#" + bgHex);
  ellipseColor = color("#" + ellHex);
}

// ========================
// DeltaE76 from HEX + auto thresholds for THIS palette
// ========================
let CTR_T1 = 18; // будет пересчитано
let CTR_T2 = 40; // будет пересчитано

function hexToRgb(hex) {
  const h = String(hex).trim().replace(/^#/, "");
  const n = parseInt(h, 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

// sRGB (0..255) -> linear RGB (0..1)
function srgbToLinear(u255) {
  const u = u255 / 255;
  return (u <= 0.04045) ? (u / 12.92) : Math.pow((u + 0.055) / 1.055, 2.4);
}

// linear RGB -> XYZ (D65)
function rgbToXyz(r255, g255, b255) {
  const r = srgbToLinear(r255);
  const g = srgbToLinear(g255);
  const b = srgbToLinear(b255);

  const X = r * 0.4124564 + g * 0.3575761 + b * 0.1804375;
  const Y = r * 0.2126729 + g * 0.7151522 + b * 0.0721750;
  const Z = r * 0.0193339 + g * 0.1191920 + b * 0.9503041;

  return { X, Y, Z };
}

// XYZ -> Lab (D65 reference white)
function xyzToLab(X, Y, Z) {
  const Xn = 0.95047, Yn = 1.00000, Zn = 1.08883;
  const f = (t) => (t > 0.008856) ? Math.cbrt(t) : (7.787 * t + 16 / 116);

  const fx = f(X / Xn);
  const fy = f(Y / Yn);
  const fz = f(Z / Zn);

  return { L: 116 * fy - 16, a: 500 * (fx - fy), b: 200 * (fy - fz) };
}

function rgbToLab(r, g, b) {
  const { X, Y, Z } = rgbToXyz(r, g, b);
  return xyzToLab(X, Y, Z);
}

function deltaE76_rgb(rgb1, rgb2) {
  const p = rgbToLab(rgb1.r, rgb1.g, rgb1.b);
  const q = rgbToLab(rgb2.r, rgb2.g, rgb2.b);
  const dL = p.L - q.L, da = p.a - q.a, db = p.b - q.b;
  return Math.sqrt(dL * dL + da * da + db * db);
}

function deltaE76_hex(hex1, hex2) {
  return deltaE76_rgb(hexToRgb(hex1), hexToRgb(hex2));
}

function percentile(sortedArr, p) {
  if (!sortedArr.length) return 0;
  const idx = (sortedArr.length - 1) * p;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sortedArr[lo];
  const t = idx - lo;
  return sortedArr[lo] * (1 - t) + sortedArr[hi] * t;
}

// Автокалибровка порогов ctr под текущую палитру (без forbidden пар)
function initContrastThresholds() {
  const vals = [];

  for (let i = 0; i < paletteColors.length; i++) {
    for (let j = i + 1; j < paletteColors.length; j++) {
      const a = normHex(paletteColors[i]);
      const b = normHex(paletteColors[j]);
      if (isForbiddenPair(a, b)) continue;
      vals.push(deltaE76_hex(a, b));
    }
  }

  vals.sort((x, y) => x - y);

  // Делим на 3 класса по распределению палитры
  CTR_T1 = percentile(vals, 0.33);
  CTR_T2 = percentile(vals, 0.66);
  if (CTR_T2 <= CTR_T1) CTR_T2 = CTR_T1 + 1;

  console.log("[ctr thresholds]", { CTR_T1, CTR_T2, samples: vals.length });
}

// ========================
// SETUP / DRAW
// ========================
function setup() {
  const canvasHeight = 600;
  const canvasWidth = 1200;
  const canvas = createCanvas(canvasWidth, canvasHeight, WEBGL);
  canvas.parent('canvas-container');

  const d = Math.min(2, window.devicePixelRatio || 1);
  pixelDensity(d);

  setAttributes('antialias', true);
  smooth();
  noStroke();

  params = {
    ellipseCount: MAX_ELLIPSE_COUNT,
    skewAngleX: 0,
    skewAngleY: 0,
    maxEllipseHeight: 180,
    heightRandomness: 0.5,
    chaos: 0,
    waveAmplitude: 50,
    waveOffset: random(1000),
    lineCopies: 0,
    lineSpacing: 230,
    ellipseSpacing: -4,
    ellipseWidth: 25,
    rotateXAngle: 0,
    rotateYAngle: 0,
    rotateZAngle: 0,
    posX: 0,
    posY: 0,
    posZ: -500
  };

  setRandomColors();
  initContrastThresholds(); // ✅ важно: пороги ctr считаем по палитре
  syncLineSpacingToHeight();
  generateEllipses(false);

  initSquarePreviewBuffer();

  // ✅ Batch ZIP buttons
  document.getElementById('batchZipBtn')?.addEventListener('click', async () => {
    const n = parseInt(document.getElementById('batchCount')?.value ?? "1", 10);
    const count = Math.max(1, Math.min(5000, isNaN(n) ? 1 : n));
    await exportBatchZip(count);
  });

  document.getElementById('batchStopBtn')?.addEventListener('click', () => {
    stopBatchExport();
  });
}

function draw() {
  renderSquarePreview();

  background(17);

  push();
  resetMatrix();

  imageMode(CENTER);
  image(squarePreviewGfx, 0, 0, squarePreviewSize, squarePreviewSize);

  noFill();
  stroke(255, 40);
  strokeWeight(1);
  rectMode(CENTER);
  rect(0, 0, squarePreviewSize, squarePreviewSize);

  pop();
}

// ========================
// SQUARE PREVIEW (EXACT as square export framing)
// ========================
function initSquarePreviewBuffer() {
  squarePreviewSize = Math.min(width, height); // 600
  squarePreviewGfx = createGraphics(squarePreviewSize, squarePreviewSize, WEBGL);
  squarePreviewGfx.pixelDensity(1);
  squarePreviewGfx.noStroke();
  squarePreviewGfx.smooth();
  squarePreviewGfx.setAttributes?.('antialias', true);
}

function renderSquarePreview() {
  if (!squarePreviewGfx) return;

  renderSceneTo(squarePreviewGfx, squarePreviewSize, squarePreviewSize);

  clearDepthBuffer(squarePreviewGfx);
  drawBadgeOverlayToGfx(squarePreviewGfx, squarePreviewSize, squarePreviewSize);
}

// ========================
// RENDER SCENE (shared by preview + export)
// ========================
function renderSceneTo(gfx, targetW, targetH) {
  const baseW = 640;
  const baseH = 320;
  const s = Math.max(targetW / baseW, targetH / baseH);

  gfx.background(bgColor);
  gfx.fill(ellipseColor);
  gfx.noStroke();

  gfx.push();

  gfx.scale(s, s, 1);

  gfx.translate(params.posX, params.posY, params.posZ);
  gfx.rotateX(params.rotateXAngle);
  gfx.rotateY(params.rotateYAngle);
  gfx.rotateZ(params.rotateZAngle);
  gfx.shearX(params.skewAngleX);
  gfx.shearY(params.skewAngleY);

  for (let i = 0; i < ellipseX.length; i++) {
    drawSmoothEllipseToGraphics(
      gfx,
      ellipseX[i] - 320,
      ellipseY[i] - 160,
      ellipseW[i],
      ellipseH[i],
      ellipseSkew[i]
    );

    const copies = Math.max(0, Math.floor(params.lineCopies));
    for (let j = 1; j <= copies; j++) {
      const offsetY = j * params.lineSpacing;
      drawSmoothEllipseToGraphics(gfx, ellipseX[i] - 320, ellipseY[i] - 160 - offsetY, ellipseW[i], ellipseH[i], ellipseSkew[i]);
      drawSmoothEllipseToGraphics(gfx, ellipseX[i] - 320, ellipseY[i] - 160 + offsetY, ellipseW[i], ellipseH[i], ellipseSkew[i]);
    }
  }

  gfx.pop();
}

function drawSmoothEllipseToGraphics(g, x, y, w, h, skew) {
  g.push();
  g.translate(x, y);
  g.shearX(skew);
  g.beginShape();
  const detail = 100;
  for (let t = 0; t < TWO_PI; t += TWO_PI / detail) {
    g.vertex(cos(t) * w * 0.5, sin(t) * h * 0.5);
  }
  g.endShape(CLOSE);
  g.pop();
}

// ========================
// GENERATE ELLIPSES
// ========================
function generateEllipses(preserveRandom = true) {
  const count = Math.max(0, Math.floor(params.ellipseCount));
  const totalEllipses = count + extraLeft + extraRight;

  ellipseX = new Array(totalEllipses);
  ellipseY = new Array(totalEllipses);
  ellipseW = new Array(totalEllipses);
  ellipseH = new Array(totalEllipses);
  ellipseSkew = new Array(totalEllipses);

  if (!preserveRandom || baseHeightNorm.length !== totalEllipses) {
    baseHeightNorm = new Array(totalEllipses);
    baseSkewNorm = new Array(totalEllipses);
    for (let i = 0; i < totalEllipses; i++) {
      baseHeightNorm[i] = random(-0.5, 0.5);
      baseSkewNorm[i] = random(-1, 1);
    }
  }

  const totalWidth = count * params.ellipseWidth + Math.max(0, count - 1) * params.ellipseSpacing;
  const startX = 320 - totalWidth / 2;

  for (let i = 0; i < count; i++) {
    const idx = i + extraLeft;
    ellipseX[idx] = startX + i * (params.ellipseWidth + params.ellipseSpacing);
    ellipseY[idx] = 160 + sin((i + params.waveOffset) * 0.7) * params.waveAmplitude;
    ellipseW[idx] = params.ellipseWidth;
    ellipseH[idx] = params.maxEllipseHeight * (1 + baseHeightNorm[idx] * params.heightRandomness);
    ellipseSkew[idx] = baseSkewNorm[idx] * params.chaos;
  }

  for (let i = 0; i < extraLeft; i++) ellipseX[i] = ellipseY[i] = ellipseW[i] = ellipseH[i] = ellipseSkew[i] = 0;
  for (let i = count + extraLeft; i < totalEllipses; i++) ellipseX[i] = ellipseY[i] = ellipseW[i] = ellipseH[i] = ellipseSkew[i] = 0;
}

// ========================
// BADGE + WEBGL HELPERS
// ========================
function normHexHash(c) {
  if (!c) return "#000000";
  const s = String(c).trim();
  return s.startsWith("#") ? s : ("#" + s);
}
function colorToHex(c) {
  if (!c) return '#000000';
  return '#' + hex2(red(c), 2) + hex2(green(c), 2) + hex2(blue(c), 2);
}
function hex2(v, digits) {
  let h = Math.floor(v).toString(16);
  while (h.length < digits) h = '0' + h;
  return h;
}
function disableDepthTest(gfx) {
  const gl = gfx?._renderer?.GL;
  if (gl) gl.disable(gl.DEPTH_TEST);
}
function enableDepthTest(gfx) {
  const gl = gfx?._renderer?.GL;
  if (gl) gl.enable(gl.DEPTH_TEST);
}
function clearDepthBuffer(gfx) {
  const gl = gfx?._renderer?.GL;
  if (gl) gl.clear(gl.DEPTH_BUFFER_BIT);
}

function getSafeRect(w, h) {
  const ar = w / h;
  const isBanner = (w > h) && Math.abs(ar - 2) < 0.07;
  if (isBanner) {
    const s = h;
    return { x: (w - s) * 0.5, y: 0, w: s, h: s };
  }
  return { x: 0, y: 0, w, h };
}

function drawBadgeOverlayToGfx(gfx, exportW, exportH) {
  if (!exportShowLogo) return;
  if (!logoImg) return;
  if (exportShowPlaque && !plaqueImg) return;

  const bg = normHexHash(colorToHex(bgColor));
  const el = normHexHash(colorToHex(ellipseColor));
  const logoTint = exportShowPlaque ? el : bg;

  const safe = getSafeRect(exportW, exportH);
  const margin = safe.w * 0.06;

  const badgeH = safe.w * 0.12;

  let plaqueW = 0, plaqueH = 0;
  if (exportShowPlaque) {
    const plaqueScale = badgeH / plaqueImg.height;
    plaqueW = plaqueImg.width * plaqueScale;
    plaqueH = plaqueImg.height * plaqueScale;
  }

  const logoH = exportShowPlaque
    ? Math.min(safe.w * 0.095, plaqueH * 0.9)
    : (safe.w * 0.095);

  const logoScale = logoH / logoImg.height;
  const logoW = logoImg.width * logoScale;

  if (!exportShowPlaque) {
    plaqueW = logoW * 1.25;
    plaqueH = logoH * 1.25;
  }

  const x = safe.x + safe.w - margin - plaqueW;
  const y = safe.y + margin;

  const logoX = x + (plaqueW - logoW) * 0.5;
  const logoY = y + (plaqueH - logoH) * 0.5;

  gfx.push();
  gfx.resetMatrix();
  gfx.translate(-exportW / 2, -exportH / 2);

  disableDepthTest(gfx);

  if (exportShowPlaque) {
    gfx.tint(bg);
    gfx.image(plaqueImg, x, y, plaqueW, plaqueH);
  }

  gfx.tint(logoTint);
  gfx.image(logoImg, logoX, logoY, logoW, logoH);

  gfx.noTint();
  enableDepthTest(gfx);

  gfx.pop();
}

// ========================
// RANDOM (matches original rules)
// ========================
function generateRandom() {
  params.ellipseCount = MAX_ELLIPSE_COUNT;

  for (const key in params) {
    if (['posX','posY','posZ','chaos'].includes(key)) continue;
    if (key === 'lineSpacing') continue;
    if (key === 'ellipseCount') continue;

    const r = PARAM_RANGES[key];
    if (!r) continue;

    let v;
    if (key === 'ellipseSpacing') {
      v = randomExcludingRange(r.min, r.max, RANDOM_SPACING_FORBIDDEN_MIN, RANDOM_SPACING_FORBIDDEN_MAX);
    } else {
      v = random(r.min, r.max);
    }

    v = quantize(v, r.step);
    if (r.int) v = Math.round(v);
    if (key === 'lineCopies') v = Math.max(0, Math.floor(v));

    params[key] = v;
  }

  syncLineSpacingToHeight();
  setRandomColors();
  generateEllipses(false);
}

// ========================
// TAGS
// ========================
function rgbToHsl(r255, g255, b255) {
  const r = r255 / 255, g = g255 / 255, b = b255 / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;

  let h = 0;
  if (d !== 0) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }

  const l = (max + min) / 2;
  const s = (d === 0) ? 0 : d / (1 - Math.abs(2 * l - 1));

  return { h, s: s * 100, l: l * 100 };
}

function lightnessTagFromHex(hex) {
  const { r, g, b } = hexToRgb(hex);
  const { l } = rgbToHsl(r, g, b);
  if (l < 35) return "dark";
  if (l > 70) return "light";
  return "mid";
}

function colorTag() {
  const bgHex = normHex(colorToHex(bgColor));
  const wvsHex = normHex(colorToHex(ellipseColor));
  return `bg-${lightnessTagFromHex(bgHex)}__wvs-${lightnessTagFromHex(wvsHex)}`;
}

function contrastTag() {
  const bgHex = normHex(colorToHex(bgColor));
  const wvsHex = normHex(colorToHex(ellipseColor));

  const de = deltaE76_hex(bgHex, wvsHex);

  if (de < CTR_T1) return "ctr-LOW";
  if (de < CTR_T2) return "ctr-MID";
  return "ctr-HI";
}

// ---- Geometry tags ----
function heightTag() {
  const h = params.maxEllipseHeight;
  if (h < 220) return "h-LOW";
  if (h < 360) return "h-MID";
  return "h-TALL";
}

function widthTag() {
  const s = params.ellipseSpacing;
  if (s < 0) return "w-TIGHT";
  if (s < 10) return "w-MID";
  return "w-WIDE";
}

function skewTag() {
  const sk = Math.abs(params.skewAngleX) + Math.abs(params.skewAngleY);
  if (sk < 0.2) return "sk-LOW";
  if (sk < 0.7) return "sk-MID";
  return "sk-HI";
}

function amplitudeTag() {
  const a = params.waveAmplitude;
  if (a < 25) return "amp-LOW";
  if (a < 60) return "amp-MID";
  return "amp-HI";
}

function buildHashtagSlug() {
  return [
    colorTag(),
    contrastTag(),
    heightTag(),
    widthTag(),
    skewTag(),
    amplitudeTag()
  ].join("__");
}

// ========================
// BATCH EXPORT (ZIP) — NO FOLDERS
// ========================
let batchCancelRequested = false;

function pad4(n) { return String(n).padStart(4, "0"); }
function setBatchStatus(txt) {
  const el = document.getElementById("batchStatus");
  if (el) el.textContent = txt;
}
function sleep0() { return new Promise((r) => setTimeout(r, 0)); }

function gfxToBlob(canvas, mime = "image/png") {
  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob), mime);
  });
}

async function renderHighResBlob(targetW, targetH) {
  // SSAA: 2x для <= 1400
  let ss = 1;
  const maxSide = Math.max(targetW, targetH);
  if (maxSide <= 1400) ss = 2;

  const renderW = Math.round(targetW * ss);
  const renderH = Math.round(targetH * ss);

  const gfx = createGraphics(renderW, renderH, WEBGL);
  gfx.pixelDensity(1);
  gfx.noStroke();
  gfx.smooth();
  gfx.setAttributes?.('antialias', true);

  renderSceneTo(gfx, renderW, renderH);
  clearDepthBuffer(gfx);
  drawBadgeOverlayToGfx(gfx, renderW, renderH);

  const down = createGraphics(targetW, targetH);
  down.pixelDensity(1);

  const ctx = down.drawingContext;
  ctx.clearRect(0, 0, targetW, targetH);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(gfx.canvas, 0, 0, targetW, targetH);

  const blob = await gfxToBlob(down.canvas, "image/png");

  gfx.remove();
  down.remove();

  return blob;
}

async function exportBatchZip(count) {
  if (typeof JSZip === "undefined") {
    alert("JSZip не подключён.");
    return;
  }
  if (typeof saveAs === "undefined") {
    alert("FileSaver (saveAs) не подключён.");
    return;
  }

  batchCancelRequested = false;

  const zip = new JSZip();
  zip.file(
    "readme.txt",
`Generated by Zvuk Playlist Generator (batch export)
Count: ${count}
Sizes: 1000x1000, 534x530, 640x320
Tags:
- bg-(dark|mid|light)
- wvs-(dark|mid|light)
- ctr-(LOW|MID|HI)  (DeltaE76 + auto thresholds from palette)
- h-(LOW|MID|TALL)
- w-(TIGHT|MID|WIDE)
- sk-(LOW|MID|HI)
- amp-(LOW|MID|HI)
CTR thresholds: T1=${CTR_T1.toFixed(2)}  T2=${CTR_T2.toFixed(2)}
Date: ${new Date().toISOString()}
`
  );

  const sizes = [
    { w: 1000, h: 1000 },
    { w: 534,  h: 530  },
    { w: 640,  h: 320  },
  ];

  try {
    setBatchStatus(`Старт: ${count} обложек…`);

    for (let i = 1; i <= count; i++) {
      if (batchCancelRequested) {
        setBatchStatus(`Остановлено на ${i-1}/${count}. Собираю ZIP…`);
        break;
      }

      generateRandom();

      setBatchStatus(`Рендер ${i}/${count}…`);
      await sleep0();

      const tags = buildHashtagSlug();

      for (const s of sizes) {
        if (batchCancelRequested) break;

        setBatchStatus(`Рендер ${i}/${count} → ${s.w}×${s.h}…`);
        await sleep0();

        const blob = await renderHighResBlob(s.w, s.h);
        const arrBuf = await blob.arrayBuffer();

        zip.file(`cover_${pad4(i)}_${s.w}x${s.h}__${tags}.png`, arrBuf);
      }

      if (i % 10 === 0) await sleep0();
    }

    setBatchStatus(`Сборка ZIP…`);
    await sleep0();

    const outBlob = await zip.generateAsync({
      type: "blob",
      compression: "DEFLATE",
      compressionOptions: { level: 6 },
    });

    const fileName = `covers_${count}x3_${new Date().toISOString().slice(0,19).replace(/[:T]/g,'-')}.zip`;
    saveAs(outBlob, fileName);

    setBatchStatus(`Готово. ZIP скачан: ${fileName}`);
  } catch (e) {
    console.error("[batch export error]", e);
    setBatchStatus(`Ошибка: ${e?.message || e}`);
    alert(`Batch export error: ${e?.message || e}`);
  }
}

function stopBatchExport() {
  batchCancelRequested = true;
  setBatchStatus("Остановка…");
}