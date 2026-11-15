/**
 * PCA Pad: the eye tracker plays the artwork's PCA space as chords.
 *
 * Two parts live in this file.
 *
 * 1. PCAOmniCore -- the PCA analysis. A browser port of Anjali Kolapalli's
 *    webapp/pca_analysis.py (street-art-sonification, pca-exploration-mode
 *    branch), method after Dalziel & Lieck, "Harmonic Sonification of
 *    High-Dimensional Continuous Data" (ICAD 2025). Same steps, same numbers:
 *      patch grid (~200 patches) -> 7 features per patch
 *      (mean R, G, B, std R, G, B, Laplacian edge density)
 *      -> standardize -> optional feature weights -> PCA, 5 components.
 *    It runs in the browser so it works on any image you drop onto the
 *    canvas, with no server round trip.
 *
 * 2. PCAOmni -- the "PCA Pad" instrument for the Colour Eye Tracking app (a pad
 *    synth built with Web Audio; the name "Omnisphere" in this file name is
 *    only a nod to that style of lush pad, none of its sounds are used).
 *    The gaze ring averages the principal components of the patches under it.
 *      PC1 (how busy / edgy the area is) -> which chord of the key
 *              (calm = home chord, busy = tense chords like V and vii)
 *      PC2 -> how many notes (2, 3 or 4)
 *      PC3 -> chord shape (normal / sus / open)
 *      all 5 PCs -> the pad's tone colour: harmonic k of every chord note
 *              gets amplitude 2^|PCk|, Anjali's default overtone mapping.
 *    So Anjali's overtone idea is still what you hear as the timbre, but it
 *    is laid over Aumrita's chords in the artwork's key instead of a raw
 *    220 Hz tone. Her original overtone sound is kept as a second option.
 */

(function (root) {
  "use strict";

  // ==================================================================
  // 1. PCA ANALYSIS (port of pca_analysis.py)
  // ==================================================================

  const FEATURE_NAMES = ["mean_R", "mean_G", "mean_B", "std_R", "std_G", "std_B", "edge_density"];
  const N_COMPONENTS = 5;
  const BASE_FREQ = 220.0;
  const TARGET_PATCHES = 200;
  const MIN_PATCH_SIZE = 32;
  const MAX_PATCH_SIZE = 160;
  const MIN_PATCHES_FOR_PCA = 12;
  const LONG_EDGE = 1800; // the server normalizes uploads to this long edge

  const FEATURE_WEIGHTS = {
    none: [1, 1, 1, 1, 1, 1, 1],
    edge3: [1, 1, 1, 1, 1, 1, 3],
    edge3_std2: [1, 1, 1, 2, 2, 2, 3],
    edge3_std2_mean05: [0.5, 0.5, 0.5, 2, 2, 2, 3]
  };

  // Python's round() rounds halves to the even neighbour; match it so the
  // patch size is identical to the server's.
  function roundHalfEven(value) {
    const floor = Math.floor(value);
    const diff = value - floor;
    if (Math.abs(diff - 0.5) < 1e-12) return floor % 2 === 0 ? floor : floor + 1;
    return Math.round(value);
  }

  function choosePatchSize(width, height, target = TARGET_PATCHES) {
    const raw = Math.sqrt(width * height / target);
    const snapped = roundHalfEven(raw / 8) * 8;
    return Math.max(MIN_PATCH_SIZE, Math.min(MAX_PATCH_SIZE, snapped));
  }

  function contentBounds(box, width, height) {
    if (!box || box.length !== 4) return [0, 0, width, height];
    let [x1, y1, x2, y2] = box.map(v => roundHalfEven(Number(v)));
    x1 = Math.max(0, Math.min(width, x1));
    y1 = Math.max(0, Math.min(height, y1));
    x2 = Math.max(x1, Math.min(width, x2));
    y2 = Math.max(y1, Math.min(height, y2));
    if (x2 - x1 < MIN_PATCH_SIZE || y2 - y1 < MIN_PATCH_SIZE) return [0, 0, width, height];
    return [x1, y1, x2, y2];
  }

  // Seven numbers for one square patch of an RGBA pixel array.
  // Edge density = mean |Laplacian| of the grey patch, with scipy's default
  // "reflect" border (the edge pixel is repeated), exactly as
  // scipy.ndimage.laplace(patch.mean(axis=2)).
  function patchFeatures(rgba, imageWidth, x0, y0, size) {
    const n = size * size;
    const grey = new Float64Array(n);
    let sr = 0, sg = 0, sb = 0;

    for (let row = 0; row < size; row++) {
      let p = ((y0 + row) * imageWidth + x0) * 4;
      for (let col = 0; col < size; col++, p += 4) {
        const r = rgba[p], g = rgba[p + 1], b = rgba[p + 2];
        sr += r; sg += g; sb += b;
        grey[row * size + col] = (r + g + b) / 3;
      }
    }

    const mr = sr / n, mg = sg / n, mb = sb / n;
    let vr = 0, vg = 0, vb = 0;

    for (let row = 0; row < size; row++) {
      let p = ((y0 + row) * imageWidth + x0) * 4;
      for (let col = 0; col < size; col++, p += 4) {
        const dr = rgba[p] - mr, dg = rgba[p + 1] - mg, db = rgba[p + 2] - mb;
        vr += dr * dr; vg += dg * dg; vb += db * db;
      }
    }

    let edge = 0;
    const last = size - 1;
    for (let row = 0; row < size; row++) {
      const up = row === 0 ? 0 : row - 1;
      const down = row === last ? last : row + 1;
      for (let col = 0; col < size; col++) {
        const left = col === 0 ? 0 : col - 1;
        const right = col === last ? last : col + 1;
        const centre = grey[row * size + col];
        const lap =
          grey[up * size + col] + grey[down * size + col] +
          grey[row * size + left] + grey[row * size + right] - 4 * centre;
        edge += Math.abs(lap);
      }
    }

    return [mr, mg, mb, Math.sqrt(vr / n), Math.sqrt(vg / n), Math.sqrt(vb / n), edge / n];
  }

  // Eigen-decomposition of a small symmetric matrix (cyclic Jacobi).
  function symmetricEigen(matrix) {
    const n = matrix.length;
    const a = matrix.map(row => row.slice());
    const v = Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => (i === j ? 1 : 0)));

    for (let sweep = 0; sweep < 100; sweep++) {
      let off = 0;
      for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) off += a[i][j] * a[i][j];
      if (off < 1e-22) break;

      for (let p = 0; p < n; p++) {
        for (let q = p + 1; q < n; q++) {
          if (Math.abs(a[p][q]) < 1e-300) continue;
          const theta = (a[q][q] - a[p][p]) / (2 * a[p][q]);
          const t = Math.sign(theta || 1) / (Math.abs(theta) + Math.sqrt(theta * theta + 1));
          const c = 1 / Math.sqrt(t * t + 1);
          const s = t * c;

          for (let k = 0; k < n; k++) {
            const akp = a[k][p], akq = a[k][q];
            a[k][p] = c * akp - s * akq;
            a[k][q] = s * akp + c * akq;
          }
          for (let k = 0; k < n; k++) {
            const apk = a[p][k], aqk = a[q][k];
            a[p][k] = c * apk - s * aqk;
            a[q][k] = s * apk + c * aqk;
          }
          for (let k = 0; k < n; k++) {
            const vkp = v[k][p], vkq = v[k][q];
            v[k][p] = c * vkp - s * vkq;
            v[k][q] = s * vkp + c * vkq;
          }
        }
      }
    }

    const order = Array.from({ length: n }, (_, i) => i).sort((i, j) => a[j][j] - a[i][i]);
    return {
      values: order.map(i => a[i][i]),
      vectors: order.map(i => v.map(row => row[i])) // one row per component
    };
  }

  function corrcoef(x, y) {
    const n = x.length;
    let mx = 0, my = 0;
    for (let i = 0; i < n; i++) { mx += x[i]; my += y[i]; }
    mx /= n; my /= n;
    let sxy = 0, sxx = 0, syy = 0;
    for (let i = 0; i < n; i++) {
      const dx = x[i] - mx, dy = y[i] - my;
      sxy += dx * dy; sxx += dx * dx; syy += dy * dy;
    }
    return sxx > 0 && syy > 0 ? sxy / Math.sqrt(sxx * syy) : 0;
  }

  const round = (value, places) => {
    const f = Math.pow(10, places);
    return Math.round(value * f) / f;
  };

  /**
   * Run the whole analysis on an RGBA pixel array (e.g. ImageData.data).
   * Returns the same JSON shape as pca_analysis.analyze(), plus `features`
   * (the raw 7-number rows) for the instrument.
   */
  function analyzePixels(rgba, width, height, options = {}) {
    const weightsId = FEATURE_WEIGHTS[options.weightsId] ? options.weightsId : "none";
    const [left, top, right, bottom] = contentBounds(options.contentBox, width, height);
    const usableW = right - left;
    const usableH = bottom - top;
    const patchSize = options.patchSize || choosePatchSize(usableW, usableH, options.targetPatches || TARGET_PATCHES);

    const cols = Math.floor(usableW / patchSize);
    const rows = Math.floor(usableH / patchSize);
    if (cols < 1 || rows < 1) throw new Error(`The artwork is too small for ${patchSize}px patches.`);

    const originX = left + Math.floor((usableW - cols * patchSize) / 2);
    const originY = top + Math.floor((usableH - rows * patchSize) / 2);

    const features = [];
    const positions = [];
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const x = originX + col * patchSize;
        const y = originY + row * patchSize;
        features.push(patchFeatures(rgba, width, x, y, patchSize));
        positions.push({ row, col, x, y });
      }
    }

    const nSamples = features.length;
    const nFeatures = FEATURE_NAMES.length;
    if (nSamples < MIN_PATCHES_FOR_PCA) {
      throw new Error(`Only ${nSamples} patches available; at least ${MIN_PATCHES_FOR_PCA} are needed.`);
    }

    // StandardScaler (population std; a constant column is left at zero).
    const mean = new Array(nFeatures).fill(0);
    const scale = new Array(nFeatures).fill(0);
    for (const f of features) for (let j = 0; j < nFeatures; j++) mean[j] += f[j];
    for (let j = 0; j < nFeatures; j++) mean[j] /= nSamples;
    for (const f of features) for (let j = 0; j < nFeatures; j++) scale[j] += (f[j] - mean[j]) ** 2;
    for (let j = 0; j < nFeatures; j++) {
      const sd = Math.sqrt(scale[j] / nSamples);
      scale[j] = sd < 10 * Number.EPSILON * Math.max(1, Math.abs(mean[j])) ? 1 : sd;
    }

    const weights = FEATURE_WEIGHTS[weightsId];
    const X = features.map(f => f.map((value, j) => ((value - mean[j]) / scale[j]) * weights[j]));

    // PCA: centre, covariance, eigenvectors.
    const centre = new Array(nFeatures).fill(0);
    for (const x of X) for (let j = 0; j < nFeatures; j++) centre[j] += x[j];
    for (let j = 0; j < nFeatures; j++) centre[j] /= nSamples;
    const cov = Array.from({ length: nFeatures }, () => new Array(nFeatures).fill(0));
    for (const x of X) {
      for (let i = 0; i < nFeatures; i++) {
        const di = x[i] - centre[i];
        for (let j = i; j < nFeatures; j++) cov[i][j] += di * (x[j] - centre[j]);
      }
    }
    for (let i = 0; i < nFeatures; i++) {
      for (let j = i; j < nFeatures; j++) {
        cov[i][j] /= nSamples - 1;
        cov[j][i] = cov[i][j];
      }
    }

    const eig = symmetricEigen(cov);
    const nComp = Math.min(N_COMPONENTS, nFeatures, nSamples);
    const totalVar = eig.values.reduce((s, v) => s + Math.max(0, v), 0) || 1;

    // scikit-learn's sign convention: the largest |loading| of each
    // component is positive. This makes the numbers match the server's.
    const components = eig.vectors.slice(0, nComp).map(vec => {
      let big = 0;
      for (let j = 1; j < vec.length; j++) if (Math.abs(vec[j]) > Math.abs(vec[big])) big = j;
      return vec[big] < 0 ? vec.map(v => -v) : vec;
    });
    const ratio = eig.values.slice(0, nComp).map(v => Math.max(0, v) / totalVar);

    const latent = X.map(x => components.map(comp => {
      let sum = 0;
      for (let j = 0; j < nFeatures; j++) sum += (x[j] - centre[j]) * comp[j];
      return sum;
    }));

    let pcAbsMax = 0;
    for (const row of latent) for (const v of row) pcAbsMax = Math.max(pcAbsMax, Math.abs(v));
    pcAbsMax = pcAbsMax || 1;

    const brightness = features.map(f => (f[0] + f[1] + f[2]) / 3);
    const edge = features.map(f => f[6]);
    const correlations = {};
    for (let axis = 0; axis < Math.min(2, nComp); axis++) {
      const column = latent.map(row => row[axis]);
      correlations[`PC${axis + 1}`] = {
        edge_density: round(corrcoef(column, edge), 3),
        brightness: round(corrcoef(column, brightness), 3)
      };
    }

    return {
      method: "patch-grid-standardized-pca",
      reference: "Dalziel & Lieck, ICAD 2025 -- harmonic overtone amplitude sonification",
      author: "Anjali Kolapalli (browser port for the Colour Eye Tracking app)",
      geometry: {
        patch_size: patchSize,
        cols,
        rows,
        origin: [originX, originY],
        content_box: [left, top, right, bottom],
        image_size: { width, height }
      },
      n_patches: positions.length,
      feature_names: FEATURE_NAMES,
      weights_id: weightsId,
      weights: weights.slice(),
      n_components: nComp,
      explained_variance_ratio: ratio.map(v => round(v, 5)),
      total_explained: round(ratio.reduce((s, v) => s + v, 0), 5),
      components: components.map(c => c.map(v => round(v, 5))),
      feature_mean: mean.map(v => round(v, 5)),
      feature_scale: scale.map(v => round(v, 5)),
      correlations,
      pc_abs_max: round(pcAbsMax, 4),
      audio: { base_frequency: BASE_FREQ, default_mapping: "pow2" },
      patches: positions.map((pos, i) => ({ ...pos, pc: latent[i].map(v => round(v, 4)) })),
      features
    };
  }

  const PCAOmniCore = {
    FEATURE_NAMES, FEATURE_WEIGHTS, N_COMPONENTS, BASE_FREQ, LONG_EDGE,
    choosePatchSize, patchFeatures, symmetricEigen, analyzePixels
  };

  root.PCAOmniCore = PCAOmniCore;
  if (typeof module !== "undefined" && module.exports) module.exports = PCAOmniCore;

  if (typeof document === "undefined") return; // Node (tests): analysis only.

  // ==================================================================
  // 2. THE PCA PAD INSTRUMENT
  // ==================================================================

  // Calm -> tense, so a busier area of the artwork pulls the harmony away
  // from home: I, vi, IV, ii, iii, V, vii.
  const TENSION_ORDER = [0, 5, 3, 1, 2, 4, 6];
  const SHAPES = ["stack", "sus", "open"];
  const SHAPE_WORDS = { stack: "normal chord", sus: "sus", open: "open" };
  const HOLD_MS = 180;          // a new chord must last this long to play
  const REST_MS = 400;          // ...and silence this long
  const NOTE_LEVEL = 0.055;     // loudness of each pad note
  const OVERTONE_SECONDS = 0.15; // Anjali's per-patch tone length
  const OVERTONE_FADE = 0.01;    // her 10 ms fade

  const COOL = [59, 76, 192], MID = [221, 221, 221], WARM = [180, 4, 38];

  function coolwarm(t) {
    const c = Math.max(0, Math.min(1, t));
    const [from, to, mix] = c < 0.5 ? [COOL, MID, c * 2] : [MID, WARM, (c - 0.5) * 2];
    return from.map((v, i) => Math.round(v + (to[i] - v) * mix));
  }

  // Fraction of `sorted` that is below `value` (0..1).
  function percentile(sorted, value) {
    let lo = 0, hi = sorted.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (sorted[mid] < value) lo = mid + 1; else hi = mid;
    }
    return sorted.length ? lo / sorted.length : 0.5;
  }

  /**
   * Make the instrument.
   * hooks: {
   *   canvas,                    the art canvas (#cv)
   *   panel,                     element the readout is drawn into
   *   context(), bus(), dry(),   AudioContext, wet input (reverb), dry output
   *   buildChord(degree, shape, size), keyName(), noteNames,
   *   status(message)
   * }
   */
  function create(hooks) {
    const cv = hooks.canvas;
    const state = {
      active: false,
      sound: "omni",        // "omni" = PCA chords, "overtones" = Anjali's original
      weightsId: "none",
      showGrid: true,
      source: null,         // { image, rect } -- rect in canvas pixels
      result: null,
      dirty: true,
      dist: null,           // sorted PC columns for percentiles
      orient: [1, 1, 1, 1, 1],
      focus: null,          // averaged PCs under the ring
      focusPatches: [],     // [{ index, weight }]
      centrePatch: -1,
      chord: null,
      chordKey: "rest",
      pendingKey: null,
      pendingChord: null,
      pendingSince: 0,
      voices: new Map(),
      wave: null,
      lastWaveAt: 0,
      lastOvertonePatch: -1,
      drawQueued: false
    };

    // ---------- overlay canvas (the PC1 tinted grid) ----------

    const overlay = document.createElement("canvas");
    overlay.className = "pca-overlay";
    overlay.hidden = true;
    document.body.appendChild(overlay);

    function placeOverlay() {
      const rect = cv.getBoundingClientRect();
      const ratio = window.devicePixelRatio || 1;
      const w = Math.round(rect.width * ratio), h = Math.round(rect.height * ratio);
      if (overlay.width !== w || overlay.height !== h) { overlay.width = w; overlay.height = h; }
      Object.assign(overlay.style, {
        left: rect.left + "px", top: rect.top + "px",
        width: rect.width + "px", height: rect.height + "px"
      });
      return { ratio, sx: rect.width / cv.width, sy: rect.height / cv.height };
    }

    function queueDraw() {
      if (state.drawQueued) return;
      state.drawQueued = true;
      requestAnimationFrame(() => { state.drawQueued = false; draw(); });
    }

    function draw() {
      overlay.hidden = !(state.active && state.showGrid && state.result);
      if (overlay.hidden) return;

      const { ratio, sx, sy } = placeOverlay();
      const g = overlay.getContext("2d");
      g.setTransform(ratio * sx, 0, 0, ratio * sy, 0, 0);
      g.clearRect(0, 0, cv.width, cv.height);

      const absMax = state.result.pc_abs_max || 1;
      for (const patch of state.result.patches) {
        const [r, gg, b] = coolwarm(0.5 + patch.pc[0] / (2 * absMax));
        g.fillStyle = `rgba(${r},${gg},${b},0.32)`;
        g.fillRect(patch.cx, patch.cy, patch.cw, patch.ch);
      }

      g.lineWidth = 0.6 / sx;
      g.strokeStyle = "rgba(255,255,255,0.35)";
      for (const patch of state.result.patches) g.strokeRect(patch.cx, patch.cy, patch.cw, patch.ch);

      for (const { index, weight } of state.focusPatches) {
        const patch = state.result.patches[index];
        g.lineWidth = (1 + 2.5 * weight) / sx;
        g.strokeStyle = `rgba(0,0,0,${0.25 + 0.75 * weight})`;
        g.strokeRect(patch.cx, patch.cy, patch.cw, patch.ch);
      }
    }

    window.addEventListener("resize", queueDraw);
    window.addEventListener("scroll", queueDraw, true);

    // ---------- analysis ----------

    function setSource(image, rect) {
      state.source = { image, rect: rect || { x: 0, y: 0, w: cv.width, h: cv.height } };
      state.dirty = true;
      state.result = null;
      silence();
      if (state.active) analyze();
    }

    function analyze() {
      const source = state.source || { image: null, rect: { x: 0, y: 0, w: cv.width, h: cv.height } };
      const { rect } = source;
      let pixels, width, height;

      if (source.image) {
        // Analyze the original image at the server's 1800 px long edge,
        // not the small canvas copy, so the patches match Anjali's.
        const img = source.image;
        const long = Math.max(img.naturalWidth, img.naturalHeight);
        const s = Math.min(1, PCAOmniCore.LONG_EDGE / long);
        width = Math.max(1, Math.round(img.naturalWidth * s));
        height = Math.max(1, Math.round(img.naturalHeight * s));
        const off = document.createElement("canvas");
        off.width = width; off.height = height;
        const g = off.getContext("2d", { willReadFrequently: true });
        g.drawImage(img, 0, 0, width, height);
        pixels = g.getImageData(0, 0, width, height).data;
      } else {
        width = Math.round(rect.w); height = Math.round(rect.h);
        pixels = cv.getContext("2d", { willReadFrequently: true })
          .getImageData(Math.round(rect.x), Math.round(rect.y), width, height).data;
      }

      const started = performance.now();
      let result;
      try {
        result = PCAOmniCore.analyzePixels(pixels, width, height, { weightsId: state.weightsId });
      } catch (error) {
        state.result = null;
        state.dirty = false;
        renderInfo(`PCA could not run on this image: ${error.message}`);
        draw();
        return;
      }

      // Where each patch sits on the canvas.
      const kx = rect.w / width, ky = rect.h / height;
      const size = result.geometry.patch_size;
      for (const patch of result.patches) {
        patch.cx = rect.x + patch.x * kx;
        patch.cy = rect.y + patch.y * ky;
        patch.cw = size * kx;
        patch.ch = size * ky;
      }

      // Musical direction for each component. PCA signs are arbitrary, so
      // turn PC1 to point toward "busier" (more edges) and PC2 toward
      // "brighter". The displayed numbers stay exactly as computed.
      const corr = result.correlations;
      state.orient = [
        corr.PC1 && corr.PC1.edge_density < 0 ? -1 : 1,
        corr.PC2 && corr.PC2.brightness < 0 ? -1 : 1,
        1, 1, 1
      ];
      state.dist = [0, 1, 2].map(k =>
        result.patches.map(p => (p.pc[k] || 0) * state.orient[k]).sort((a, b) => a - b));

      // Anjali's global normalization for her overtone sound: the loudest
      // patch of this artwork is the reference.
      let loudest = 1e-6;
      for (const p of result.patches) {
        loudest = Math.max(loudest, p.pc.reduce((s, v) => s + Math.pow(2, Math.abs(v)), 0));
      }
      result.gainScale = 0.9 / loudest;

      state.result = result;
      state.dirty = false;
      state.lastOvertonePatch = -1;

      const ms = Math.round(performance.now() - started);
      const g = result.geometry;
      const c1 = corr.PC1 ? ` · PC1 ~ edges ${corr.PC1.edge_density >= 0 ? "+" : ""}${corr.PC1.edge_density.toFixed(2)}, brightness ${corr.PC1.brightness >= 0 ? "+" : ""}${corr.PC1.brightness.toFixed(2)}` : "";
      renderInfo(`${g.cols} × ${g.rows} = ${result.n_patches} patches at ${g.patch_size}px · 5 PCs explain ${Math.round(result.total_explained * 100)}%${c1} · ${ms} ms`);
      renderBars();
      draw();
    }

    // ---------- the gaze ring -> PCs ----------

    // x, y, radius in canvas pixels (or null when off the canvas).
    function feed(x, y, radius) {
      if (!state.active) return;
      if (state.dirty) analyze();
      const result = state.result;

      if (x == null || !result) {
        state.focus = null;
        state.focusPatches = [];
        state.centrePatch = -1;
        choose(null, null);
        renderBars();
        queueDraw();
        return;
      }

      const sum = new Array(result.n_components).fill(0);
      const found = [];
      let total = 0, centre = -1, best = Infinity;
      const sigma = Math.max(radius, 1) * 0.6;

      result.patches.forEach((p, index) => {
        const px = p.cx + p.cw / 2, py = p.cy + p.ch / 2;
        const d2 = (px - x) ** 2 + (py - y) ** 2;
        if (d2 < best) { best = d2; centre = index; }
        const reach = radius + Math.max(p.cw, p.ch) / 2;
        if (d2 > reach * reach) return;
        const w = Math.exp(-d2 / (2 * sigma * sigma));
        found.push({ index, weight: w });
        total += w;
        for (let k = 0; k < sum.length; k++) sum[k] += w * p.pc[k];
      });

      // Over a blank margin with no patch close by: rest.
      const inside = x >= result.patches[0].cx - 1 && y >= result.patches[0].cy - 1 &&
        x <= result.patches[result.patches.length - 1].cx + result.patches[result.patches.length - 1].cw + 1 &&
        y <= result.patches[result.patches.length - 1].cy + result.patches[result.patches.length - 1].ch + 1;

      if (!inside || !found.length) {
        state.focus = null;
        state.focusPatches = [];
        state.centrePatch = -1;
        choose(null, null);
      } else {
        const maxW = Math.max(...found.map(f => f.weight));
        state.focus = sum.map(v => v / total);
        state.focusPatches = found.map(f => ({ index: f.index, weight: f.weight / maxW }));
        state.centrePatch = centre;

        if (state.sound === "overtones") {
          if (centre !== state.lastOvertonePatch) {
            state.lastOvertonePatch = centre;
            playOvertone(result.patches[centre].pc);
          }
          renderChordText(null, `Patch row ${result.patches[centre].row + 1}, column ${result.patches[centre].col + 1}: harmonic k of 220 Hz = 2^|PCk| (Anjali's original sound).`);
        } else {
          const { chord, why } = chordFor(state.focus);
          choose(chord, why);
          updateTimbre();
        }
      }

      renderBars();
      queueDraw();
    }

    function chordFor(pcs) {
      const [d1, d2, d3] = state.dist;
      const p1 = percentile(d1, pcs[0] * state.orient[0]);
      const p2 = percentile(d2, (pcs[1] || 0) * state.orient[1]);
      const p3 = percentile(d3, pcs[2] || 0);

      const degree = TENSION_ORDER[Math.min(6, Math.floor(p1 * 7))];
      const size = p2 < 0.3 ? 2 : p2 < 0.7 ? 3 : 4;
      const shape = SHAPES[Math.min(2, Math.floor(p3 * 3))];
      const chord = hooks.buildChord(degree, shape, size);
      const pct = p => `${Math.round(p * 100)}%`;

      const why =
        `PC1 higher than ${pct(p1)} of patches → step ${degree + 1} of ${hooks.keyName()} · ` +
        `PC2 ${pct(p2)} → ${size} notes · PC3 ${pct(p3)} → ${SHAPE_WORDS[shape]} · ` +
        `tone colour from all 5 PCs (2^|PC|).`;
      return { chord, why, brightness: p1 };
    }

    // Debounced like the Omnichord, so a shaky gaze does not flutter.
    function choose(chord, why) {
      const key = chord ? chord.key : "rest";
      if (key === state.chordKey) {
        state.pendingKey = null;
        if (chord) renderChordText(chord, why);
        return;
      }
      const now = performance.now();
      if (state.pendingKey !== key) {
        state.pendingKey = key;
        state.pendingChord = { chord, why };
        state.pendingSince = now;
        return;
      }
      if (now - state.pendingSince >= (chord ? HOLD_MS : REST_MS)) {
        state.pendingKey = null;
        commit(state.pendingChord.chord, state.pendingChord.why);
      }
    }

    // The gaze reports constantly but the mouse only when it moves; nudge
    // the debounce so a chord still lands when the mouse rests.
    setInterval(() => {
      if (state.active && state.pendingKey && state.sound === "omni") {
        const p = state.pendingChord;
        choose(p.chord, p.why);
      }
    }, 60);

    function commit(chord, why) {
      state.chord = chord;
      state.chordKey = chord ? chord.key : "rest";
      setPad(chord ? chord.padMidi : null);
      renderChordText(chord, why);
    }

    // ---------- sound ----------

    function harmonicAmps(pcs) {
      const amps = pcs.map(v => Math.pow(2, Math.abs(v)));
      const peak = Math.max(...amps, 1e-6);
      return amps.map(a => a / peak);
    }

    function makeWave(amps, normalize) {
      const ctx = hooks.context();
      const real = new Float32Array(amps.length + 1);
      const imag = new Float32Array(amps.length + 1);
      amps.forEach((a, k) => { imag[k + 1] = a; });
      return ctx.createPeriodicWave(real, imag, { disableNormalization: !normalize });
    }

    // Morph the pad's tone colour toward the PCs under the ring.
    function updateTimbre(force) {
      if (!state.focus || !hooks.context()) return;
      const now = performance.now();
      if (!force && now - state.lastWaveAt < 90) return;
      state.lastWaveAt = now;
      state.wave = makeWave(harmonicAmps(state.focus), true);
      for (const voice of state.voices.values()) {
        for (const osc of voice.oscs) osc.setPeriodicWave(state.wave);
        voice.filter.frequency.setTargetAtTime(cutoffFor(voice.freq), hooks.context().currentTime, 0.25);
      }
    }

    // Busier areas open the filter a little: brighter sound.
    function cutoffFor(freq) {
      const busy = state.focus && state.dist
        ? percentile(state.dist[0], state.focus[0] * state.orient[0]) : 0.5;
      return Math.min(freq * (3 + 7 * busy), 6000);
    }

    function setPad(notes) {
      const ctx = hooks.context();
      if (!ctx) return;
      const now = ctx.currentTime;
      const wanted = new Set(notes || []);

      for (const [midi, voice] of state.voices) {
        if (!wanted.has(midi)) {
          releaseVoice(voice, now);
          state.voices.delete(midi);
        }
      }
      if (!state.wave && state.focus) state.wave = makeWave(harmonicAmps(state.focus), true);
      for (const midi of wanted) {
        if (!state.voices.has(midi)) state.voices.set(midi, startVoice(midi, now));
      }
    }

    // One PCA Pad note: two detuned oscillators shaped by the PCA
    // overtone wave, spread left and right, through a slowly breathing
    // low-pass filter, into the Omnichord's reverb.
    function startVoice(midi, now) {
      const ctx = hooks.context();
      const freq = 440 * Math.pow(2, (midi - 69) / 12);

      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0, now);
      gain.gain.setTargetAtTime(NOTE_LEVEL, now, 0.18);

      const filter = ctx.createBiquadFilter();
      filter.type = "lowpass";
      filter.frequency.value = cutoffFor(freq);
      filter.Q.value = 0.7;
      filter.connect(gain);
      gain.connect(hooks.bus());

      const lfo = ctx.createOscillator();
      const lfoDepth = ctx.createGain();
      lfo.frequency.value = 0.12 + Math.random() * 0.1;
      lfoDepth.gain.value = freq * 0.8;
      lfo.connect(lfoDepth);
      lfoDepth.connect(filter.frequency);
      lfo.start(now);

      const oscs = [];
      for (const [cents, pan] of [[-8, -0.35], [8, 0.35]]) {
        const osc = ctx.createOscillator();
        if (state.wave) osc.setPeriodicWave(state.wave); else osc.type = "sine";
        osc.frequency.value = freq;
        osc.detune.value = cents;
        const panner = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
        if (panner) { panner.pan.value = pan; osc.connect(panner); panner.connect(filter); }
        else osc.connect(filter);
        osc.start(now);
        oscs.push(osc);
      }
      return { gain, filter, oscs, lfo, freq };
    }

    function releaseVoice(voice, now) {
      voice.gain.gain.cancelScheduledValues(now);
      voice.gain.gain.setTargetAtTime(0, now, 0.4);
      const end = now + 2.5;
      for (const osc of voice.oscs) osc.stop(end);
      voice.lfo.stop(end);
    }

    // Anjali's original: one 150 ms tone per patch, 5 harmonics of 220 Hz,
    // harmonic k amplitude = 2^|PCk| scaled by the loudest patch.
    function playOvertone(pcs) {
      const ctx = hooks.context();
      if (!ctx || !state.result) return;
      const now = ctx.currentTime + 0.005;
      const amps = pcs.map(v => Math.pow(2, Math.abs(v)) * state.result.gainScale);
      const osc = ctx.createOscillator();
      osc.setPeriodicWave(makeWave(amps, false));
      osc.frequency.value = PCAOmniCore.BASE_FREQ;
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(1, now + OVERTONE_FADE);
      gain.gain.setValueAtTime(1, now + OVERTONE_SECONDS - OVERTONE_FADE);
      gain.gain.linearRampToValueAtTime(0, now + OVERTONE_SECONDS);
      osc.connect(gain);
      gain.connect(hooks.dry());
      osc.start(now);
      osc.stop(now + OVERTONE_SECONDS + 0.02);
    }

    function silence() {
      state.pendingKey = null;
      state.chord = null;
      state.chordKey = "rest";
      setPad(null);
      renderChordText(null, "");
    }

    // ---------- the readout panel ----------

    const panel = hooks.panel;
    panel.innerHTML = `
      <div class="pcachord" data-role="name">Rest (silence)</div>
      <div class="chordnotes" data-role="notes">Look at the artwork. The grid shows PC1: blue = calm, red = busy.</div>
      <div class="hint" data-role="why"></div>
      <div class="pcabars" data-role="bars"></div>
      <div class="pcacontrols">
        <label>Sound
          <select data-role="sound">
            <option value="omni" selected>Pad chords (PCA picks the chord)</option>
            <option value="overtones">Overtones (Anjali's original)</option>
          </select>
        </label>
        <label>Feature weights
          <select data-role="weights">
            <option value="none" selected>None (baseline)</option>
            <option value="edge3">Edges ×3 (PC1 = how busy)</option>
            <option value="edge3_std2">Edges ×3, texture ×2</option>
            <option value="edge3_std2_mean05">Edges ×3, texture ×2, colour ×½</option>
          </select>
        </label>
        <label class="pcacheck"><input type="checkbox" data-role="grid" checked> Show PCA grid</label>
      </div>
      <div class="hint" data-role="info">PCA runs when you open this tab.</div>`;

    const el = role => panel.querySelector(`[data-role="${role}"]`);
    const bars = el("bars");
    bars.innerHTML = [0, 1, 2, 3, 4].map(k => `
      <div class="pcabar"><span class="pcalabel" data-k="${k}">PC${k + 1}</span>
        <span class="pcatrack"><span class="pcafill"></span><span class="pcazero"></span></span>
        <span class="pcaval">–</span></div>`).join("");

    function renderBars() {
      const result = state.result;
      const rows = bars.querySelectorAll(".pcabar");
      rows.forEach((row, k) => {
        const label = row.querySelector(".pcalabel");
        const fill = row.querySelector(".pcafill");
        const val = row.querySelector(".pcaval");
        const ratio = result && result.explained_variance_ratio[k];
        label.textContent = `PC${k + 1}` + (ratio != null ? ` ${Math.round(ratio * 100)}%` : "");
        const v = state.focus ? state.focus[k] : null;
        if (v == null || !result) {
          fill.style.width = "0"; val.textContent = "–"; return;
        }
        const half = Math.min(1, Math.abs(v) / (result.pc_abs_max || 1)) * 50;
        fill.style.left = (v >= 0 ? 50 : 50 - half) + "%";
        fill.style.width = half + "%";
        fill.style.background = v >= 0 ? "#b4042b" : "#3b4cc0";
        val.textContent = (v >= 0 ? "+" : "") + v.toFixed(2);
      });
    }

    function renderChordText(chord, why) {
      if (state.sound === "overtones") {
        el("name").textContent = state.centrePatch >= 0 ? "Overtone tone" : "Rest (silence)";
        el("notes").textContent = "220 Hz + 4 overtones, one short tone per patch you look at.";
        el("why").textContent = why || "";
        return;
      }
      el("name").textContent = chord ? chord.name : "Rest (silence)";
      el("notes").textContent = chord
        ? `${chord.size} notes: ${chord.noteNames.join(" – ")}`
        : "Look at the artwork. The grid shows PC1: blue = calm, red = busy.";
      el("why").textContent = chord ? (why || "") : "";
    }

    function renderInfo(text) { el("info").textContent = text; }

    el("sound").addEventListener("change", event => {
      state.sound = event.target.value;
      state.lastOvertonePatch = -1;
      silence();
    });
    el("weights").addEventListener("change", event => {
      state.weightsId = event.target.value;
      state.dirty = true;
      silence();
      if (state.active) analyze();
    });
    el("grid").addEventListener("change", event => {
      state.showGrid = event.target.checked;
      draw();
    });

    document.addEventListener("visibilitychange", () => {
      if (document.hidden && state.active) silence();
    });

    // ---------- on / off ----------

    function activate() {
      state.active = true;
      if (state.dirty) analyze();
      renderBars();
      draw();
    }

    function deactivate() {
      state.active = false;
      state.focus = null;
      state.focusPatches = [];
      silence();
      draw();
    }

    return {
      activate,
      deactivate,
      feed,
      setSource,
      isActive: () => state.active,
      result: () => state.result,
      state: () => ({ sound: state.sound, chord: state.chord, focus: state.focus, voices: state.voices.size })
    };
  }

  root.PCAOmni = { create, coolwarm };
})(typeof window !== "undefined" ? window : globalThis);
