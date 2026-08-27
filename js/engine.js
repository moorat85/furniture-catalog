/* Движок пересчёта размерной системы.
   Ведущие переменные -> производные величины -> проверка пределов -> детали -> раскрой.
   Ничего не хранит: на вход состояние, на выход посчитанная модель. */

window.Engine = (() => {
  const round = (v) => Math.round(v);
  /* Номинал каталога: производный габарит, округлённый вверх до 10 мм. */
  const nominal = (v) => Math.ceil(v / 10) * 10;

  /* ---------- производные величины категории ---------- */

  function compute(cat, vars, globals, limits) {
    const { stepW, stepH, bay, plinth, depthA, depthB } = vars;
    const { panel, back, gap } = globals;

    const clearW = stepW - panel;
    const bayClear = bay * stepW - panel;
    const facadeW = stepW - gap;
    const halfStep = stepH / 2;

    const widths = cat.widths.map((n) => {
      const corpus = stepW * n + panel;
      return { code: n + "W", n, corpus, nominal: nominal(corpus) };
    });

    const heights = cat.heights.map((h) => {
      const corpus = round(stepH * (h.n + (h.half ? 0.5 : 0)) + panel);
      return { ...h, corpus, total: corpus + plinth };
    });

    const zones = (cat.zones || []).map((z) => ({
      ...z,
      clear: round(stepH * z.steps - panel),
      raw: round(stepH * z.steps),
    }));

    const depths = [
      { id: "depthA", label: "Гардеробная", value: depthA },
      { id: "depthB", label: "Неглубокая", value: depthB },
    ].map((d) => {
      const strips = Math.max(1, Math.floor((globals.sheetW + globals.kerf) / (d.value + globals.kerf)));
      const used = strips * d.value + (strips - 1) * globals.kerf;
      return {
        ...d,
        clear: d.value - back,
        hangerOk: d.value - back >= limits.minHangDepth,
        strips,
        waste: globals.sheetW - used,
      };
    });

    return {
      stepW, stepH, bay, plinth, halfStep,
      clearW, bayClear, facadeW,
      widths, heights, zones, depths,
      maxTotal: heights.reduce((a, h) => Math.max(a, h.total), 0),
    };
  }

  /* Высота штанги от пола для конкретной высоты корпуса — та же формула,
     что и на чертеже: штанга висит под верхним горизонтом, на модуль ниже верха. */
  function railFor(comp, globals, heightCode) {
    const h = comp.heights.find((x) => x.code === heightCode) || comp.heights[comp.heights.length - 1];
    if (!h) return 0;
    return round(h.total - globals.panel - comp.stepH);
  }

  /* ---------- проверка пределов ----------
     level "error" — конструктив не работает; "warn" — работает, но требует решения. */

  function check(comp, limits, extra) {
    const out = [];
    const add = (id, ok, label, actual, limit, dir, level) =>
      out.push({ id, ok, label, actual, limit, dir, level: level || "error" });

    add("bayClear", comp.bayClear <= limits.maxShelfSpan,
      "Пролёт полки", comp.bayClear, limits.maxShelfSpan, "max");

    add("facadeWmin", comp.facadeW >= limits.minFacadeWidth,
      "Ширина фасада (мин.)", comp.facadeW, limits.minFacadeWidth, "min");

    add("facadeWmax", comp.facadeW <= limits.maxFacadeWidth,
      "Ширина фасада (макс.)", comp.facadeW, limits.maxFacadeWidth, "max");

    add("totalHeight", comp.maxTotal <= limits.maxTotalHeight,
      "Высота самого высокого изделия", comp.maxTotal, limits.maxTotalHeight, "max");

    const rail = (extra && extra.railHeight) || 0;
    add("railHeight", rail <= limits.maxRailHeight,
      "Высота штанги от пола", rail, limits.maxRailHeight, "max", "warn");

    comp.depths.forEach((d) => {
      if (d.id === "depthA") {
        add("depthClear", d.hangerOk,
          "Чистая глубина под плечики", d.clear, limits.minHangDepth, "min");
      }
    });

    return out;
  }

  /* ---------- разбивка ширины на секции ---------- */

  function bays(n, bay, stepW, panel) {
    const full = Math.floor(n / bay);
    const rem = n % bay;
    const list = [];
    for (let i = 0; i < full; i += 1) list.push({ modules: bay, clear: bay * stepW - panel });
    if (rem > 0) list.push({ modules: rem, clear: rem * stepW - panel });
    return list;
  }

  /* ---------- список деталей конфигурации ---------- */

  function buildParts(comp, globals, config) {
    const { panel, back } = globals;
    const w = comp.widths.find((x) => x.n === config.width);
    const h = comp.heights.find((x) => x.code === config.height);
    const d = comp.depths.find((x) => x.id === config.depth);
    if (!w || !h || !d) return { parts: [], corpus: null };

    const secs = bays(config.width, comp.bay, comp.stepW, panel);
    const innerH = h.corpus - 2 * panel;
    const shelfDepth = Math.max(100, d.value - back - 10);

    const parts = [];
    const push = (name, ww, hh, qty, material) => {
      if (qty > 0 && ww > 0 && hh > 0) parts.push({ name, w: round(ww), h: round(hh), qty, material: material || "ЛДСП" });
    };

    push("Боковина", h.corpus, d.value, 2);
    push("Стойка внутренняя", innerH, d.value, Math.max(0, secs.length - 1));

    /* Горизонты верх/низ — по секциям, чтобы держать один типоразмер на секцию. */
    const bySize = {};
    secs.forEach((s) => { bySize[s.clear] = (bySize[s.clear] || 0) + 1; });
    Object.keys(bySize).forEach((clear) => {
      const c = Number(clear);
      push(`Горизонт верх/низ ${c}`, c, d.value, bySize[clear] * 2);
      if (config.shelvesPerBay > 0) push(`Полка ${c}`, c, shelfDepth, bySize[clear] * config.shelvesPerBay);
      push(`Цоколь ${c}`, c, comp.plinth, bySize[clear]);
    });

    const facadeH = h.corpus - 2 * globals.gap;
    push("Фасад", comp.facadeW, facadeH, config.width);

    if (config.drawers > 0) {
      push("Фронт ящика", comp.facadeW, comp.halfStep - globals.gap, config.drawers);
      push("Боковина ящика", shelfDepth - 20, comp.halfStep - 40, config.drawers * 2);
      push("Дно ящика", comp.clearW - 30, shelfDepth - 30, config.drawers, "ДВП");
    }

    push("Задняя стенка", w.corpus, h.corpus, 1, "ДВП");

    return { parts, corpus: { w, h, d, secs, shelfDepth } };
  }

  /* ---------- оценка раскроя: укладка полосами вдоль листа ---------- */

  function nest(parts, globals) {
    const L = globals.sheetL;
    const W = globals.sheetW;
    const k = globals.kerf;

    /* Только ЛДСП: ДВП считается отдельно, у неё свой формат. */
    const flat = [];
    parts.filter((p) => p.material === "ЛДСП").forEach((p) => {
      for (let i = 0; i < p.qty; i += 1) flat.push({ name: p.name, l: Math.max(p.w, p.h), w: Math.min(p.w, p.h) });
    });
    /* Длинную сторону кладём вдоль листа — направление текстуры. */
    flat.sort((a, b) => b.w - a.w || b.l - a.l);

    const sheets = [];
    const partsArea = flat.reduce((a, p) => a + p.l * p.w, 0);

    flat.forEach((p) => {
      if (p.l > L || p.w > W) {
        sheets.push({ strips: [{ w: p.w, y: 0, items: [{ ...p, x: 0, oversize: true }], used: p.l }], oversize: true });
        return;
      }
      let placed = false;
      for (const sh of sheets) {
        if (sh.oversize) continue;
        /* First Fit Decreasing Height: полоса заводится самой широкой деталью,
           более узкие доукладываются в неё же. */
        for (const st of sh.strips) {
          if (p.w <= st.w && st.used + k + p.l <= L) {
            st.items.push({ ...p, x: st.used + k });
            st.used += k + p.l;
            placed = true;
            break;
          }
        }
        if (placed) break;
        const height = sh.strips.reduce((a, s) => a + s.w + k, 0);
        if (height + p.w <= W) {
          sh.strips.push({ w: p.w, y: height, items: [{ ...p, x: 0 }], used: p.l });
          placed = true;
          break;
        }
      }
      if (!placed) {
        sheets.push({ strips: [{ w: p.w, y: 0, items: [{ ...p, x: 0 }], used: p.l }] });
      }
    });

    const count = sheets.length;
    const util = count ? partsArea / (count * L * W) : 0;
    const hdfArea = parts
      .filter((p) => p.material === "ДВП")
      .reduce((a, p) => a + p.w * p.h * p.qty, 0);

    return {
      sheets,
      count,
      util,
      partsArea,
      hdfArea,
      totalPieces: flat.length,
      oversize: sheets.some((s) => s.oversize),
    };
  }

  return { compute, railFor, check, buildParts, nest, bays, nominal };
})();
