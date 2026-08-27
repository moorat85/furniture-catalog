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
        <text x="${x + 5}" y="${mid}" dominant-baseline="middle">${esc(label)}</text>
      </g>`;
  }

  /* ---------- фронтальный вид ---------- */

  function elevation(comp, globals, config, built) {
    if (!built || !built.corpus) return "";
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

  return { elevation, sheets };
})();
