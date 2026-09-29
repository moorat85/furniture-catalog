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

  function iso(comp, globals, config, built) {
    const geo = built && built.corpus && built.corpus.geo;
    if (!geo) return "";
    const { corpusW, totalH, plinth, panel: P, secs } = geo;

    /* x — вправо, y — вверх, z — от задней плоскости к фронту */
    const boxes = [];
    const add = (x0, x1, y0, y1, z0, z1, kind) => boxes.push({ x0, x1, y0, y1, z0, z1, kind: kind || "" });

    add(0, P, plinth, totalH, 0, secs[0].depth);
    add(corpusW - P, corpusW, plinth, totalH, 0, secs[secs.length - 1].depth);

    (geo.plinthBoxes || []).forEach((b) => add(b.x0, b.x1, 0, plinth, b.z0, b.z1));

    secs.forEach((sec, i) => {
      const D = sec.depth;
      if (i < secs.length - 1) add(sec.x1, sec.x1 + P, plinth + P, totalH - P, 0, Math.max(D, secs[i + 1].depth));

      add(sec.x0, sec.x1, plinth, plinth + P, 0, D);
      add(sec.x0, sec.x1, totalH - P, totalH, 0, D);
      add(sec.x0, sec.x1, plinth + P, totalH - P, 0, sec.backT);

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
      order.push(i);
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
    const sc = Math.min(560 / (maxX - minX), 500 / (maxY - minY));
    const T = (x, y, z) => {
      const [px, py] = pr(x, y, z);
      return `${((px - minX) * sc + pad).toFixed(1)},${((py - minY) * sc + pad).toFixed(1)}`;
    };
    const vbW = (maxX - minX) * sc + pad * 2;
    const vbH = (maxY - minY) * sc + pad * 2;

    const poly = (cls, pts) => `<polygon class="${cls}" points="${pts.join(" ")}"/>`;
    const out = order.map((i) => {
      const b = boxes[i];
      const kind = b.kind ? ` ${b.kind}` : "";
      return `<g>`
        + poly(`iso-front${kind}`, [T(b.x0, b.y0, b.z1), T(b.x1, b.y0, b.z1), T(b.x1, b.y1, b.z1), T(b.x0, b.y1, b.z1)])
        + poly(`iso-top${kind}`, [T(b.x0, b.y1, b.z0), T(b.x1, b.y1, b.z0), T(b.x1, b.y1, b.z1), T(b.x0, b.y1, b.z1)])
        + poly(`iso-right${kind}`, [T(b.x1, b.y0, b.z0), T(b.x1, b.y0, b.z1), T(b.x1, b.y1, b.z1), T(b.x1, b.y1, b.z0)])
        + `</g>`;
    }).join("");

    return `
      <svg class="iso" viewBox="0 0 ${vbW.toFixed(1)} ${vbH.toFixed(1)}" preserveAspectRatio="xMidYMid meet" role="img"
           aria-label="Объёмный вид">
        ${out}
      </svg>`;
  }

  /* ---------- превью раскроя ---------- */

  function sheets(nested, globals, limit) {
    const L = globals.sheetL;
    const W = globals.sheetW;
    const show = nested.sheets.slice(0, limit || 4);
    if (!show.length) return "";

    const s = 420 / L;

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
            <figcaption>Лист ${idx + 1}${sh.oversize ? " · деталь не влезает" : ""}</figcaption>
          </figure>`;
      })
      .join("");
  }

  return { elevation, plan, iso, sheets };
})();
