/* Живой чертёж: фронтальный вид изделия с размерными линиями и превью раскроя.
   Перерисовывается целиком при любой правке переменной — состояния не держит. */

window.Draw = (() => {
  const NS = "http://www.w3.org/2000/svg";
  const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;");

  /* ---------- вспомогательные примитивы ---------- */

  function dimH(x1, x2, y, label, opts) {
    const o = opts || {};
    const cls = o.accent ? "dim accent" : "dim";
    const mid = (x1 + x2) / 2;
    return `
      <g class="${cls}">
        <line x1="${x1}" y1="${y}" x2="${x2}" y2="${y}"/>
        <line class="tick" x1="${x1}" y1="${y - 4}" x2="${x1}" y2="${y + 4}"/>
        <line class="tick" x1="${x2}" y1="${y - 4}" x2="${x2}" y2="${y + 4}"/>
        <text x="${mid}" y="${y - 6}" text-anchor="middle">${esc(label)}</text>
      </g>`;
  }

  function dimV(y1, y2, x, label, opts) {
    const o = opts || {};
    const cls = o.accent ? "dim accent" : "dim";
    const mid = (y1 + y2) / 2;
    return `
      <g class="${cls}">
        <line x1="${x}" y1="${y1}" x2="${x}" y2="${y2}"/>
        <line class="tick" x1="${x - 4}" y1="${y1}" x2="${x + 4}" y2="${y1}"/>
        <line class="tick" x1="${x - 4}" y1="${y2}" x2="${x + 4}" y2="${y2}"/>
        <text x="${x + 6}" y="${mid}" dominant-baseline="middle">${esc(label)}</text>
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

    /* поля под размерные линии */
    const padL = 96, padR = 150, padT = 54, padB = 62;
    const maxW = 760, maxH = 470;
    const s = Math.min(maxW / totalW, maxH / totalH);

    const X = (mm) => padL + mm * s;
    const Y = (mm) => padT + (totalH - mm) * s;

    const vbW = padL + totalW * s + padR;
    const vbH = padT + totalH * s + padB;

    let g = "";

    /* цоколь */
    g += `<rect class="plinth" x="${X(0)}" y="${Y(plinth)}" width="${totalW * s}" height="${plinth * s}"/>`;

    /* корпус: наружный контур */
    g += `<rect class="carcass" x="${X(0)}" y="${Y(totalH)}" width="${totalW * s}" height="${h.corpus * s}"/>`;

    /* внутреннее поле */
    g += `<rect class="inner" x="${X(panel)}" y="${Y(totalH - panel)}" width="${(totalW - 2 * panel) * s}" height="${(h.corpus - 2 * panel) * s}"/>`;

    /* вертикальные стойки по секциям */
    let cursor = panel;
    const secX = [];
    secs.forEach((sec, i) => {
      secX.push({ x0: cursor, x1: cursor + sec.clear, sec });
      cursor += sec.clear;
      if (i < secs.length - 1) {
        g += `<rect class="post" x="${X(cursor)}" y="${Y(totalH - panel)}" width="${panel * s}" height="${(h.corpus - 2 * panel) * s}"/>`;
        cursor += panel;
      }
    });

    /* наполнение: первая секция — штанга, остальные — полки; ящики снизу второй */
    secX.forEach((sx, i) => {
      const bw = (sx.x1 - sx.x0) * s;
      const bx = X(sx.x0);

      if (i === 0 && comp.zones.some((z) => z.id.startsWith("hang"))) {
        const railY = totalH - panel - comp.stepH;
        g += `<line class="rail" x1="${bx + 6}" y1="${Y(railY)}" x2="${bx + bw - 6}" y2="${Y(railY)}"/>`;
        g += `<rect class="shelf" x="${bx}" y="${Y(totalH - panel - comp.stepH + panel)}" width="${bw}" height="${panel * s}"/>`;
        for (let k = 0; k < 5; k += 1) {
          const hx = bx + bw * (0.16 + k * 0.17);
          g += `<path class="hanger" d="M ${hx} ${Y(railY)} l -13 ${comp.stepH * 0.9 * s} l 26 0 Z"/>`;
        }
      } else {
        const nShelves = config.shelvesPerBay || 0;
        for (let k = 1; k <= nShelves; k += 1) {
          const sy = plinth + panel + k * comp.stepH;
          if (sy < totalH - panel) {
            g += `<rect class="shelf" x="${bx}" y="${Y(sy)}" width="${bw}" height="${panel * s}"/>`;
          }
        }
      }

      /* ящики в последней секции */
      if (i === secX.length - 1 && config.drawers > 0) {
        for (let k = 0; k < config.drawers; k += 1) {
          const dy = plinth + panel + k * comp.halfStep;
          g += `<rect class="drawer" x="${bx + 2}" y="${Y(dy + comp.halfStep)}" width="${bw - 4}" height="${(comp.halfStep - 2) * s}"/>`;
          g += `<line class="pull" x1="${bx + bw * 0.36}" y1="${Y(dy + comp.halfStep * 0.5)}" x2="${bx + bw * 0.64}" y2="${Y(dy + comp.halfStep * 0.5)}"/>`;
        }
      }
    });

    /* швы фасадов — штриховыми линиями по шагу */
    for (let k = 1; k < config.width; k += 1) {
      const fx = panel + k * comp.stepW - panel / 2;
      g += `<line class="facade-seam" x1="${X(fx)}" y1="${Y(totalH)}" x2="${X(fx)}" y2="${Y(plinth)}"/>`;
    }

    /* размерные линии */
    let dims = "";
    dims += dimH(X(0), X(totalW), padT - 26, `${totalW}`, { accent: true });

    let c2 = panel;
    secs.forEach((sec, i) => {
      dims += dimH(X(c2), X(c2 + sec.clear), Y(0) + 30, `${sec.clear}`);
      c2 += sec.clear + (i < secs.length - 1 ? panel : 0);
    });

    dims += dimV(Y(totalH), Y(0), X(totalW) + 46, `${totalH}`, { accent: true });
    dims += dimV(Y(plinth), Y(0), X(totalW) + 12, `${plinth}`);
    dims += dimV(Y(plinth + panel + comp.stepH), Y(plinth + panel), X(totalW) + 12, `${comp.stepH - panel}`);

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

    const vw = 420;
    const s = vw / L;

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
