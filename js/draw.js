/* Живой чертёж: фронтальный вид изделия с размерными линиями и превью раскроя.
   Панели ЛДСП рисуются двумя пунктирными линиями по граням — так к каждой грани
   можно потом привязать размер. Перерисовывается целиком, состояния не держит. */

window.Draw = (() => {
  const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;");

  /* ---------- размерные линии ---------- */

  function dimH(x1, x2, y, label, opts) {
    const o = opts || {};
    const mid = (x1 + x2) / 2;
    return `
      <g class="dim${o.accent ? " accent" : ""}">
        <line x1="${x1}" y1="${y}" x2="${x2}" y2="${y}"/>
        <line class="tick" x1="${x1}" y1="${y - 3.5}" x2="${x1}" y2="${y + 3.5}"/>
        <line class="tick" x1="${x2}" y1="${y - 3.5}" x2="${x2}" y2="${y + 3.5}"/>
        <text x="${mid}" y="${y - 5}" text-anchor="middle">${esc(label)}</text>
      </g>`;
  }

  function dimV(y1, y2, x, label, opts) {
    const o = opts || {};
    const mid = (y1 + y2) / 2;
    return `
      <g class="dim${o.accent ? " accent" : ""}">
        <line x1="${x}" y1="${y1}" x2="${x}" y2="${y2}"/>
        <line class="tick" x1="${x - 3.5}" y1="${y1}" x2="${x + 3.5}" y2="${y1}"/>
        <line class="tick" x1="${x - 3.5}" y1="${y2}" x2="${x + 3.5}" y2="${y2}"/>
        <text x="${o.left ? x - 5 : x + 5}" y="${mid}" dominant-baseline="middle"${o.left ? ' text-anchor="end"' : ""}>${esc(label)}</text>
      </g>`;
  }

  /* ---------- фронтальный вид ---------- */

  function elevation(comp, globals, config, built) {
    if (!built || !built.corpus) return "";
    if (config.layout) return elevationLayout(comp, globals, config, built);
    const { w, h, secs } = built.corpus;
    const panel = globals.panel;
    const plinth = comp.plinth;

    const totalW = w.corpus;
    const totalH = h.corpus + plinth;

    const padL = 74, padR = 128, padT = 42, padB = 48;
    const maxW = 560, maxH = 340;
    const s = Math.min(maxW / totalW, maxH / totalH);

    const X = (mm) => padL + mm * s;
    const Y = (mm) => padT + (totalH - mm) * s;

    const vbW = padL + totalW * s + padR;
    const vbH = padT + totalH * s + padB;

    /* Панель ЛДСП = две пунктирные линии по её граням. */
    const hPanel = (x0, x1, y0, y1) => `
      <line class="edge" x1="${X(x0)}" y1="${Y(y0)}" x2="${X(x1)}" y2="${Y(y0)}"/>
      <line class="edge" x1="${X(x0)}" y1="${Y(y1)}" x2="${X(x1)}" y2="${Y(y1)}"/>`;

    const vPanel = (y0, y1, x0, x1) => `
      <line class="edge" x1="${X(x0)}" y1="${Y(y0)}" x2="${X(x0)}" y2="${Y(y1)}"/>
      <line class="edge" x1="${X(x1)}" y1="${Y(y0)}" x2="${X(x1)}" y2="${Y(y1)}"/>`;

    let g = "";

    /* поле корпуса — лёгкая заливка, чтобы пунктир читался */
    g += `<rect class="field" x="${X(0)}" y="${Y(totalH)}" width="${totalW * s}" height="${h.corpus * s}"/>`;

    /* цоколь */
    g += hPanel(0, totalW, 0, plinth);
    g += vPanel(0, plinth, 0, totalW);

    /* боковины */
    g += vPanel(plinth, totalH, 0, panel);
    g += vPanel(plinth, totalH, totalW - panel, totalW);

    /* горизонты верх и низ */
    g += hPanel(0, totalW, plinth, plinth + panel);
    g += hPanel(0, totalW, totalH - panel, totalH);

    /* стойки по секциям */
    let cursor = panel;
    const secX = [];
    secs.forEach((sec, i) => {
      secX.push({ x0: cursor, x1: cursor + sec.clear, sec });
      cursor += sec.clear;
      if (i < secs.length - 1) {
        g += vPanel(plinth + panel, totalH - panel, cursor, cursor + panel);
        cursor += panel;
      }
    });

    /* наполнение секций */
    const hasHang = comp.zones.some((z) => z.id.indexOf("hang") === 0);
    secX.forEach((sx, i) => {
      const isLast = i === secX.length - 1;

      if (i === 0 && hasHang) {
        const shelfY = totalH - panel - comp.stepH;
        g += hPanel(sx.x0, sx.x1, shelfY, shelfY + panel);
        g += `<line class="rail" x1="${X(sx.x0) + 5}" y1="${Y(shelfY - 34)}" x2="${X(sx.x1) - 5}" y2="${Y(shelfY - 34)}"/>`;
        for (let k = 0; k < 5; k += 1) {
          const hx = X(sx.x0) + (X(sx.x1) - X(sx.x0)) * (0.18 + k * 0.16);
          const hw = Math.min(11, (X(sx.x1) - X(sx.x0)) * 0.07);
          g += `<path class="hanger" d="M ${hx} ${Y(shelfY - 34)} l ${-hw} ${comp.stepH * 0.62 * s} l ${hw * 2} 0 Z"/>`;
        }
      } else if (!(isLast && config.drawers > 0)) {
        for (let k = 1; k <= (config.shelvesPerBay || 0); k += 1) {
          const sy = plinth + panel + k * comp.stepH;
          if (sy + panel < totalH - panel) g += hPanel(sx.x0, sx.x1, sy, sy + panel);
        }
      }

      if (isLast && config.drawers > 0) {
        for (let k = 0; k < config.drawers; k += 1) {
          const dy = plinth + panel + k * comp.halfStep;
          if (dy + comp.halfStep > totalH - panel) break;
          g += `<rect class="drawer" x="${X(sx.x0) + 1}" y="${Y(dy + comp.halfStep)}" width="${(sx.x1 - sx.x0) * s - 2}" height="${(comp.halfStep - 2) * s}"/>`;
          const cx = (X(sx.x0) + X(sx.x1)) / 2;
          g += `<line class="pull" x1="${cx - 14}" y1="${Y(dy + comp.halfStep * 0.5)}" x2="${cx + 14}" y2="${Y(dy + comp.halfStep * 0.5)}"/>`;
        }
      }
    });

    /* швы фасадов */
    for (let k = 1; k < config.width; k += 1) {
      const fx = panel + k * comp.stepW - panel / 2;
      g += `<line class="facade-seam" x1="${X(fx)}" y1="${Y(totalH)}" x2="${X(fx)}" y2="${Y(plinth)}"/>`;
    }

    /* размеры */
    let dims = "";
    dims += dimH(X(0), X(totalW), padT - 20, `${totalW}`, { accent: true });

    let c2 = panel;
    secs.forEach((sec, i) => {
      dims += dimH(X(c2), X(c2 + sec.clear), Y(0) + 26, `${sec.clear}`);
      c2 += sec.clear + (i < secs.length - 1 ? panel : 0);
    });

    dims += dimV(Y(totalH), Y(0), X(totalW) + 40, `${totalH}`, { accent: true });
    dims += dimV(Y(plinth), Y(0), X(totalW) + 10, `${plinth}`);
    dims += dimV(Y(plinth + panel + comp.stepH), Y(plinth + panel), X(totalW) + 10, `${comp.stepH - panel}`);

    return `
      <svg class="elevation" viewBox="0 0 ${vbW} ${vbH}" preserveAspectRatio="xMidYMid meet" role="img"
           aria-label="Фронтальный вид, ${totalW} на ${totalH} мм">
        ${g}
        ${dims}
      </svg>`;
  }



  /* ---------- модуль и полумодуль (страница «Система размеров») ---------- */

  function moduleView(comp, globals, opts) {
    const o = opts || {};
    const panel = globals.panel, gap = globals.gap;
    const stepW = comp.stepW;
    const stepH = o.half ? comp.stepH / 2 : comp.stepH;
    const W = stepW + panel, H = stepH + panel;
    const canvasH = (o.canvasStepH ? (o.half ? o.canvasStepH / 2 : o.canvasStepH) : stepH) + panel;
    const door = !!o.door;
    const s = 0.42;
    const padL = 20, padR = 78, padT = 16, padB = 46;
    const X = (mm) => padL + mm * s;
    const Y = (mm) => padT + (H - mm) * s;
    const vbW = padL + W * s + padR, vbH = padT + canvasH * s + padB;
    const hP_unused = (x0, x1, y0, y1) => `
      <line class="edge" x1="${X(x0)}" y1="${Y(y0)}" x2="${X(x1)}" y2="${Y(y0)}"/>
      <line class="edge" x1="${X(x0)}" y1="${Y(y1)}" x2="${X(x1)}" y2="${Y(y1)}"/>`;
    const vP = (y0, y1, x0, x1) => `
      <line class="edge" x1="${X(x0)}" y1="${Y(y0)}" x2="${X(x0)}" y2="${Y(y1)}"/>
      <line class="edge" x1="${X(x1)}" y1="${Y(y0)}" x2="${X(x1)}" y2="${Y(y1)}"/>`;

    /* только наружный контур */
    const g = `<rect class="field" x="${X(0)}" y="${Y(H)}" width="${W * s}" height="${H * s}"/>
      <rect class="drawer" x="${X(0)}" y="${Y(H)}" width="${W * s}" height="${H * s}"/>`;

    /* размеры — только по внутренним граням */
    const d = dimH(X(panel), X(W - panel), Y(0) + 24, `${W - 2 * panel}`)
            + dimV(Y(H - panel), Y(panel), X(W) + 24, `${H - 2 * panel}`);

    return `
      <svg class="elevation module-view" width="${vbW}" height="${vbH}" viewBox="0 0 ${vbW} ${vbH}" preserveAspectRatio="xMidYMin meet" role="img"
           aria-label="${o.half ? "Полумодуль" : "Модуль"}, внутри ${W - 2 * panel} на ${H - 2 * panel} мм">
        ${g}${d}
      </svg>`;
  }

  /* ---------- изделия из секций: фронт по геометрии из движка ---------- */

  function elevationLayout(comp, globals, config, built) {
    const geo = built.corpus.geo;
    if (!geo) return "";
    const { corpusW: totalW, totalH, plinth, panel, secs } = geo;

    const padL = 74, padR = 128, padT = 42, padB = 48;
    const maxW = 560, maxH = 500;
    const s = Math.min(maxW / totalW, maxH / totalH);
    const X = (mm) => padL + mm * s;
    const Y = (mm) => padT + (totalH - mm) * s;
    const vbW = padL + totalW * s + padR;
    const vbH = padT + totalH * s + padB;

    const hPanel = (x0, x1, y0, y1) => `
      <line class="edge" x1="${X(x0)}" y1="${Y(y0)}" x2="${X(x1)}" y2="${Y(y0)}"/>
      <line class="edge" x1="${X(x0)}" y1="${Y(y1)}" x2="${X(x1)}" y2="${Y(y1)}"/>`;
    const vPanel = (y0, y1, x0, x1) => `
      <line class="edge" x1="${X(x0)}" y1="${Y(y0)}" x2="${X(x0)}" y2="${Y(y1)}"/>
      <line class="edge" x1="${X(x1)}" y1="${Y(y0)}" x2="${X(x1)}" y2="${Y(y1)}"/>`;

    let g = `<rect class="field" x="${X(0)}" y="${Y(totalH)}" width="${totalW * s}" height="${geo.corpusH * s}"/>`;

    g += hPanel(0, totalW, 0, plinth) + vPanel(0, plinth, 0, totalW);
    g += vPanel(plinth, totalH, 0, panel) + vPanel(plinth, totalH, totalW - panel, totalW);
    g += hPanel(0, totalW, plinth, plinth + panel) + hPanel(0, totalW, totalH - panel, totalH);

    secs.forEach((sec, i) => {
      if (i < secs.length - 1) g += vPanel(plinth + panel, totalH - panel, sec.x1, sec.x1 + panel);
      sec.shelfYs.forEach((y) => { g += hPanel(sec.x0, sec.x1, y, y + panel); });

      sec.rows.forEach((r) => {
        r.dividers.forEach((dv) => { g += vPanel(r.y0, r.y1, dv.x0, dv.x1); });
        r.cells.forEach((c) => {
          g += `<text class="cell" x="${(X(c.x0) + X(c.x1)) / 2}" y="${(Y(r.y0) + Y(r.y1)) / 2}">${c.clear}</text>`;
        });
      });

      sec.doors.forEach((d) => {
        g += `<rect class="facade" x="${X(d.x0)}" y="${Y(d.y1)}" width="${(d.x1 - d.x0) * s}" height="${(d.y1 - d.y0) * s}"/>`;
        const my = (d.y0 + d.y1) / 2;
        g += `<line class="pull" x1="${X(d.x1) - 7}" y1="${Y(my + 70)}" x2="${X(d.x1) - 7}" y2="${Y(my - 70)}"/>`;
      });
    });

    let dims = dimH(X(0), X(totalW), padT - 20, `${totalW}`, { accent: true });
    secs.forEach((sec) => { dims += dimH(X(sec.x0), X(sec.x1), Y(0) + 26, `${sec.clear}`); });

    dims += dimV(Y(totalH), Y(0), X(totalW) + 40, `${totalH}`, { accent: true });
    dims += dimV(Y(plinth), Y(0), X(totalW) + 10, `${plinth}`);
    const row1 = secs.map((x) => x.rows[0]).find(Boolean);
    if (row1) dims += dimV(Y(row1.y1), Y(row1.y0), X(totalW) + 10, `${Math.round(row1.y1 - row1.y0)}`);

    return `
      <svg class="elevation tall" viewBox="0 0 ${vbW} ${vbH}" preserveAspectRatio="xMidYMid meet" role="img"
           aria-label="Фронтальный вид, ${totalW} на ${totalH} мм">
        ${g}
        ${dims}
      </svg>`;
  }

  /* ---------- вид сверху: глубины секций и отступ переднего края ---------- */

  function plan(comp, globals, config, built) {
    const geo = built && built.corpus && built.corpus.geo;
    if (!geo) return "";
    const { corpusW: totalW, panel: P, secs } = geo;
    const maxD = Math.max(...secs.map((x) => x.depth));

    const padL = 52, padR = 64, padT = 44, padB = 26;
    const s = 520 / totalW;
    const X = (mm) => padL + mm * s;
    const Z = (mm) => padT + mm * s;
    const vbW = padL + totalW * s + padR;
    const vbH = padT + (maxD + P) * s + padB;

    const rect = (cls, x0, x1, z0, z1) =>
      `<rect class="${cls}" x="${X(x0)}" y="${Z(z0)}" width="${(x1 - x0) * s}" height="${(z1 - z0) * s}"/>`;

    let g = "";
    secs.forEach((sec) => { g += rect("pl-outline", sec.x0 - P, sec.x1 + P, 0, sec.depth); });

    g += rect("pl-panel", 0, P, 0, secs[0].depth);
    g += rect("pl-panel", totalW - P, totalW, 0, secs[secs.length - 1].depth);
    secs.forEach((sec, i) => {
      if (i < secs.length - 1) g += rect("pl-panel", sec.x1, sec.x1 + P, 0, Math.max(sec.depth, secs[i + 1].depth));
      if (sec.backMat === "ЛДСП") g += rect("pl-panel", sec.x0, sec.x1, 0, sec.backT);
      else g += rect("pl-hdf", sec.x0, sec.x1, 0, sec.backT);
      sec.doors.forEach((d) => { g += rect("pl-door", d.x0, d.x1, sec.depth, sec.depth + P); });
    });

    let dims = dimH(X(0), X(totalW), padT - 22, `${totalW}`, { accent: true });
    dims += dimV(Z(0), Z(secs[0].depth), X(0) - 14, `${secs[0].depth}`, { accent: true, left: true });
    const li = secs.length - 1;
    if (secs[li].depth !== secs[0].depth) dims += dimV(Z(0), Z(secs[li].depth), X(totalW) + 14, `${secs[li].depth}`, { accent: true });

    secs.forEach((sec, i) => {
      const prev = secs[i - 1];
      if (!prev || prev.depth === sec.depth) return;
      const shallow = sec.depth < prev.depth ? sec : prev;
      const x = shallow === sec ? X(sec.x0) + 24 : X(prev.x1) - 24;
      dims += dimV(Z(Math.min(sec.depth, prev.depth)), Z(Math.max(sec.depth, prev.depth)), x, `${Math.abs(sec.depth - prev.depth)}`);
    });

    return `
      <svg class="plan" viewBox="0 0 ${vbW} ${vbH}" preserveAspectRatio="xMidYMid meet" role="img"
           aria-label="Вид сверху, глубины секций">
        ${g}
        ${dims}
      </svg>`;
  }

  /* ---------- 3D: косая проекция из тех же панелей ---------- */

  /* Сцена: панели как коробки в порядке рисования + проекция в координаты SVG.
     x — вправо, y — вверх, z — от задней плоскости к фронту. */
  function scene(geo, maxW, maxH) {
    const { corpusW, totalH, plinth, panel: P, secs } = geo;
    const boxes = [];
    const add = (x0, x1, y0, y1, z0, z1, kind) => boxes.push({ x0, x1, y0, y1, z0, z1, kind: kind || "" });

    add(0, P, plinth, totalH, 0, secs[0].depth);
    add(corpusW - P, corpusW, plinth, totalH, 0, secs[secs.length - 1].depth);
    (geo.plinthBoxes || []).forEach((b) => add(b.x0, b.x1, 0, plinth, b.z0, b.z1, "plinth"));

    secs.forEach((sec, i) => {
      const D = sec.depth;
      if (i < secs.length - 1) add(sec.x1, sec.x1 + P, plinth + P, totalH - P, 0, Math.max(D, secs[i + 1].depth));

      add(sec.x0, sec.x1, plinth, plinth + P, 0, D);
      add(sec.x0, sec.x1, totalH - P, totalH, 0, D);
      add(sec.x0, sec.x1, plinth + P, totalH - P, 0, sec.backT, sec.backMat === "ЛДСП" ? "back" : "hdf");

      sec.shelfYs.forEach((y) => add(sec.x0, sec.x1, y, y + P, sec.backT, sec.backT + sec.shelfDepth));
      sec.rows.forEach((r) => r.dividers.forEach((dv) => add(dv.x0, dv.x1, r.y0, r.y1, sec.backT, sec.backT + sec.shelfDepth)));

      sec.doors.forEach((d) => {
        add(d.x0, d.x1, d.y0, d.y1, D, D + P, "door");
        const my = (d.y0 + d.y1) / 2;
        add(d.x1 - 24, d.x1 - 16, my - 80, my + 80, D + P, D + P + 12, "pull");
      });
    });

    /* Порядок рисования: дальнее раньше ближнего. Камера смотрит спереди, справа и сверху,
       поэтому «ближе» — больше по x, y и z. Разнесённые по любой оси коробки упорядочиваются
       однозначно, циклы возможны только у тех, что на экране не пересекаются. */
    const EPS = 1e-6;
    const before = (a, b) => a.x1 <= b.x0 + EPS || a.y1 <= b.y0 + EPS || a.z1 <= b.z0 + EPS;
    const order = [];
    const seen = new Array(boxes.length).fill(false);
    const visit = (i) => {
      if (seen[i]) return;
      seen[i] = true;
      for (let j = 0; j < boxes.length; j += 1) {
        if (j !== i && before(boxes[j], boxes[i]) && !before(boxes[i], boxes[j])) visit(j);
      }
      order.push(boxes[i]);
    };
    boxes.forEach((_, i) => visit(i));

    const k = 0.36;
    const pr = (x, y, z) => [x - k * z, -(y - k * z)];

    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    boxes.forEach((b) => {
      [b.x0, b.x1].forEach((x) => [b.y0, b.y1].forEach((y) => [b.z0, b.z1].forEach((z) => {
        const [px, py] = pr(x, y, z);
        minX = Math.min(minX, px); maxX = Math.max(maxX, px);
        minY = Math.min(minY, py); maxY = Math.max(maxY, py);
      })));
    });

    const pad = 16;
    const sc = Math.min(maxW / (maxX - minX), maxH / (maxY - minY));
    const T = (x, y, z) => {
      const [px, py] = pr(x, y, z);
      return `${((px - minX) * sc + pad).toFixed(1)},${((py - minY) * sc + pad).toFixed(1)}`;
    };
    const XY = (x, y, z) => {
      const [px, py] = pr(x, y, z);
      return [(px - minX) * sc + pad, (py - minY) * sc + pad];
    };

    return { order, T, XY, sc, vbW: (maxX - minX) * sc + pad * 2, vbH: (maxY - minY) * sc + pad * 2 };
  }

  const facePts = (T, b) => ({
    front: [T(b.x0, b.y0, b.z1), T(b.x1, b.y0, b.z1), T(b.x1, b.y1, b.z1), T(b.x0, b.y1, b.z1)],
    top: [T(b.x0, b.y1, b.z0), T(b.x1, b.y1, b.z0), T(b.x1, b.y1, b.z1), T(b.x0, b.y1, b.z1)],
    right: [T(b.x1, b.y0, b.z0), T(b.x1, b.y0, b.z1), T(b.x1, b.y1, b.z1), T(b.x1, b.y1, b.z0)],
  });

  function iso(comp, globals, config, built) {
    const geo = built && built.corpus && built.corpus.geo;
    if (!geo) return "";
    const sc = scene(geo, 560, 500);

    const poly = (cls, pts) => `<polygon class="${cls}" points="${pts.join(" ")}"/>`;
    const out = sc.order.map((b) => {
      const kind = b.kind ? ` ${b.kind}` : "";
      const f = facePts(sc.T, b);
      return `<g>${poly(`iso-front${kind}`, f.front)}${poly(`iso-top${kind}`, f.top)}${poly(`iso-right${kind}`, f.right)}</g>`;
    }).join("");

    return `
      <svg class="iso" viewBox="0 0 ${sc.vbW.toFixed(1)} ${sc.vbH.toFixed(1)}" preserveAspectRatio="xMidYMid meet" role="img"
           aria-label="Объёмный вид">
        ${out}
      </svg>`;
  }

  /* ---------- рендеры: та же геометрия, но в реальных цветах декоров ---------- */

  const hexRgb = (h) => {
    const v = h.replace("#", "");
    return [0, 2, 4].map((i) => parseInt(v.slice(i, i + 2), 16));
  };
  const rgbHex = (a) => "#" + a.map((c) => Math.max(0, Math.min(255, Math.round(c))).toString(16).padStart(2, "0")).join("");
  /* f > 0 — светлее, f < 0 — темнее */
  const shade = (hex, f) => rgbHex(hexRgb(hex).map((c) => (f >= 0 ? c + (255 - c) * f : c * (1 + f))));
  /* Чисто белый на белом фоне не читается — берём тёплый off-white. */
  const soft = (hex) => (hexRgb(hex).every((c) => c >= 245) ? "#F1F1EE" : hex);
  const EDGE = "rgba(20,22,26,0.34)";

  function tex(id, pal, size, sc) {
    if (!pal.image) return "";
    const t = (size * sc).toFixed(1);
    return `<pattern id="${id}" patternUnits="userSpaceOnUse" width="${t}" height="${t}">
        <image href="${pal.image}" width="${t}" height="${t}" preserveAspectRatio="xMidYMid slice"/>
      </pattern>`;
  }

  /* pal: { body: { color }, back: { color, image? } } */
  function render3q(comp, globals, config, built, pal) {
    const geo = built && built.corpus && built.corpus.geo;
    if (!geo) return "";
    const sc = scene(geo, 520, 470);
    const body = soft(pal.body.color);
    const backC = pal.back.color;

    const paint = (b) => {
      if (b.kind === "pull") return { front: "#2A2D33", top: "#2A2D33", right: "#2A2D33" };
      if (b.kind === "hdf") return { front: "#CDBFA6", top: "#D8CCB6", right: "#B9AB92" };
      if (b.kind === "back") return { front: pal.back.image ? "url(#tex3q)" : backC, top: shade(backC, 0.1), right: shade(backC, -0.16) };
      const base = b.kind === "plinth" ? shade(body, -0.1) : body;
      return { front: base, top: shade(base, 0.1), right: shade(base, -0.15) };
    };

    const out = sc.order.map((b) => {
      const c = paint(b);
      const f = facePts(sc.T, b);
      const pg = (pts, fill) => `<polygon points="${pts.join(" ")}" fill="${fill}" stroke="${EDGE}" stroke-width="0.6" stroke-linejoin="round"/>`;
      return `<g>${pg(f.front, c.front)}${pg(f.top, c.top)}${pg(f.right, c.right)}</g>`;
    }).join("");

    const [cx, cy] = sc.XY(geo.corpusW / 2, 0, Math.max(...geo.secs.map((x) => x.depth)) / 2);
    const rx = geo.corpusW * sc.sc * 0.66;

    return `
      <svg class="render" viewBox="0 0 ${sc.vbW.toFixed(1)} ${sc.vbH.toFixed(1)}" preserveAspectRatio="xMidYMid meet" role="img"
           aria-label="Рендер, вид в три четверти">
        <defs>
          <filter id="rShadow3q" x="-30%" y="-100%" width="160%" height="300%"><feGaussianBlur stdDeviation="7"/></filter>
          ${tex("tex3q", pal.back, 480, sc.sc)}
        </defs>
        <ellipse cx="${cx.toFixed(1)}" cy="${(cy + 6).toFixed(1)}" rx="${rx.toFixed(1)}" ry="${(rx * 0.16).toFixed(1)}" fill="#14161a" fill-opacity="0.16" filter="url(#rShadow3q)"/>
        ${out}
      </svg>`;
  }

  function renderFront(comp, globals, config, built, pal) {
    const geo = built && built.corpus && built.corpus.geo;
    if (!geo) return "";
    const { corpusW: totalW, totalH, plinth, panel, secs } = geo;

    const pad = 26;
    const s = Math.min(520 / totalW, 470 / totalH);
    const X = (mm) => pad + mm * s;
    const Y = (mm) => pad + (totalH - mm) * s;
    const vbW = totalW * s + pad * 2;
    const vbH = totalH * s + pad * 2 + 8;

    const body = soft(pal.body.color);
    const backC = pal.back.color;
    const rect = (x0, x1, y0, y1, fill, extra) =>
      `<rect x="${X(x0).toFixed(1)}" y="${Y(y1).toFixed(1)}" width="${((x1 - x0) * s).toFixed(1)}" height="${((y1 - y0) * s).toFixed(1)}" fill="${fill}"${extra || ""}/>`;
    const panelRect = (x0, x1, y0, y1, fill) => rect(x0, x1, y0, y1, fill, ` stroke="${EDGE}" stroke-width="0.7"`);
    const shadow = (x0, x1, y1, h) => rect(x0, x1, y1 - h, y1, "#14161a", ' fill-opacity="0.12"');

    let g = "";
    secs.forEach((sec) => {
      const isWood = sec.backMat === "ЛДСП";
      g += rect(sec.x0, sec.x1, plinth + panel, totalH - panel, isWood ? (pal.back.image ? "url(#texFront)" : backC) : "#CDBFA6");
      if (sec.kind === "shelving") {
        g += shadow(sec.x0, sec.x1, totalH - panel, 18);
        sec.shelfYs.forEach((y) => { g += shadow(sec.x0, sec.x1, y, 18); });
        sec.rows.forEach((r) => r.dividers.forEach((dv) => { g += rect(dv.x1, dv.x1 + 14, r.y0, r.y1, "#14161a", ' fill-opacity="0.12"'); }));
      }
    });

    g += panelRect(0, panel, plinth, totalH, body);
    g += panelRect(totalW - panel, totalW, plinth, totalH, body);
    secs.forEach((sec, i) => {
      if (i < secs.length - 1) g += panelRect(sec.x1, sec.x1 + panel, plinth + panel, totalH - panel, body);
      g += panelRect(sec.x0, sec.x1, plinth, plinth + panel, body);
      g += panelRect(sec.x0, sec.x1, totalH - panel, totalH, body);
      sec.shelfYs.forEach((y) => { g += panelRect(sec.x0, sec.x1, y, y + panel, body); });
      sec.rows.forEach((r) => r.dividers.forEach((dv) => { g += panelRect(dv.x0, dv.x1, r.y0, r.y1, body); }));
    });

    g += shadow(0, totalW, plinth, 14);
    g += panelRect(0, totalW, 0, plinth, shade(body, -0.1));

    secs.forEach((sec) => sec.doors.forEach((d) => {
      g += panelRect(d.x0, d.x1, d.y0, d.y1, body);
      const my = (d.y0 + d.y1) / 2;
      g += `<line x1="${(X(d.x1) - 7).toFixed(1)}" y1="${Y(my + 80).toFixed(1)}" x2="${(X(d.x1) - 7).toFixed(1)}" y2="${Y(my - 80).toFixed(1)}" stroke="#2A2D33" stroke-width="2.2" stroke-linecap="round"/>`;
    }));

    return `
      <svg class="render" viewBox="0 0 ${vbW.toFixed(1)} ${vbH.toFixed(1)}" preserveAspectRatio="xMidYMid meet" role="img"
           aria-label="Рендер, вид спереди">
        <defs>${tex("texFront", pal.back, 480, s)}</defs>
        <ellipse cx="${(vbW / 2).toFixed(1)}" cy="${(Y(0) + 6).toFixed(1)}" rx="${(totalW * s * 0.6).toFixed(1)}" ry="6" fill="#14161a" fill-opacity="0.14"/>
        ${g}
      </svg>`;
  }

  /* ---------- сечение цоколя: рейки и перекладины, вид сверху ---------- */

  function plinthSection(comp, globals, config, built) {
    const geo = built && built.corpus && built.corpus.geo;
    if (!geo || !geo.plinthBoxes || !geo.plinthBoxes.length) return "";
    const { corpusW: totalW, panel: P, secs, setback } = geo;
    const maxD = Math.max(...secs.map((x) => x.depth));

    const padL = 56, padR = 60, padT = 46, padB = 44;
    const s = 560 / totalW;
    const X = (mm) => padL + mm * s;
    const Z = (mm) => padT + mm * s;
    const vbW = padL + totalW * s + padR;
    const vbH = padT + maxD * s + padB;

    const rect = (cls, x0, x1, z0, z1) =>
      `<rect class="${cls}" x="${X(x0).toFixed(1)}" y="${Z(z0).toFixed(1)}" width="${((x1 - x0) * s).toFixed(1)}" height="${((z1 - z0) * s).toFixed(1)}"/>`;

    let g = "";
    /* контур корпуса над цоколем — для привязки: рейки утоплены от лицевой плоскости */
    secs.forEach((sec) => { g += rect("pl-outline", sec.x0 - P, sec.x1 + P, 0, sec.depth); });
    geo.plinthBoxes.forEach((b) => { g += rect("pl-cut", b.x0, b.x1, b.z0, b.z1); });

    let dims = dimH(X(0), X(totalW), padT - 24, `${totalW}`, { accent: true });
    const dp = (sec) => sec.depth - setback;

    secs.forEach((sec) => {
      /* просветы между стенками и продольными рейками — сколько остаётся между опорами */
      const ribs = geo.plinthBoxes
        .filter((b) => b.role === "rib" && b.label === sec.label && (b.z1 - b.z0) > (b.x1 - b.x0))
        .sort((a, b) => a.x0 - b.x0);
      const edges = [sec.x0];
      ribs.forEach((r) => { edges.push(r.x0, r.x1); });
      edges.push(sec.x1);
      for (let i = 0; i < edges.length; i += 2) {
        dims += dimH(X(edges[i]), X(edges[i + 1]), Z(maxD) + 24, `${Math.round(edges[i + 1] - edges[i])}`);
      }

      /* поперечные перекладины: просветы вдоль глубины */
      const cross = geo.plinthBoxes
        .filter((b) => b.role === "rib" && b.label === sec.label && (b.x1 - b.x0) >= (b.z1 - b.z0))
        .sort((a, b) => a.z0 - b.z0);
      if (cross.length) {
        const zs = [P];
        cross.forEach((r) => { zs.push(r.z0, r.z1); });
        zs.push(dp(sec) - P);
        const x = X(sec.x0) + 16;
        for (let i = 0; i < zs.length; i += 2) {
          dims += dimV(Z(zs[i]), Z(zs[i + 1]), x, `${Math.round(zs[i + 1] - zs[i])}`);
        }
      }

      /* отступ фронта цоколя от лицевой плоскости корпуса */
      if (setback > 0) {
        const mid = X(sec.x0) + (sec.x1 - sec.x0) * s * 0.72;
        dims += dimV(Z(dp(sec)), Z(sec.depth), mid, `${setback}`);
      }
    });

    dims += dimV(Z(0), Z(dp(secs[0])), X(0) - 14, `${dp(secs[0])}`, { accent: true, left: true });
    const last = secs[secs.length - 1];
    if (dp(last) !== dp(secs[0])) dims += dimV(Z(0), Z(dp(last)), X(totalW) + 14, `${dp(last)}`, { accent: true });

    return `
      <svg class="plan plinth-sec" viewBox="0 0 ${vbW.toFixed(1)} ${vbH.toFixed(1)}" preserveAspectRatio="xMidYMid meet" role="img"
           aria-label="Сечение цоколя, вид сверху">
        <defs>
          <pattern id="hatchPl" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <line x1="0" y1="0" x2="0" y2="5" stroke="#8a909a" stroke-width="1"/>
          </pattern>
        </defs>
        ${g}
        ${dims}
      </svg>`;
  }

  /* ---------- превью раскроя ---------- */

  function sheets(nested, globals, limit, decorInfo) {
    const L = globals.sheetL;
    const W = globals.sheetW;
    const show = nested.sheets.slice(0, limit || 4);
    if (!show.length) return "";

    const s = 420 / L;
    const dec = (id) => {
      const info = id && decorInfo ? decorInfo(id) : null;
      if (!info) return "";
      return ` · <i class="dot" style="background:${info.color}"></i>${esc(info.label)}`;
    };

    return show
      .map((sh, idx) => {
        let g = `<rect class="sheet-bg" x="0" y="0" width="${L * s}" height="${W * s}"/>`;
        sh.strips.forEach((st) => {
          st.items.forEach((it) => {
            g += `<rect class="sheet-part${it.oversize ? " bad" : ""}" x="${it.x * s}" y="${st.y * s}" width="${it.l * s}" height="${it.w * s}"/>`;
          });
        });
        return `
          <figure class="sheet-fig">
            <svg viewBox="0 0 ${L * s} ${W * s}" class="sheet-svg">${g}</svg>
            <figcaption>Лист ${idx + 1}${dec(sh.decor)}${sh.oversize ? " · деталь не влезает" : ""}</figcaption>
          </figure>`;
      })
      .join("");
  }

  return { moduleView, elevation, plan, iso, render3q, renderFront, plinthSection, sheets };
})();
