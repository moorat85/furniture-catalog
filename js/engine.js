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
      vars,
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
    if (Array.isArray(config.layout)) return buildLayoutParts(comp, globals, config);
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


  /* ---------- изделие из нескольких секций (config.layout) ----------
     Секции стоят в ряд, у каждой своя глубина и своя задняя стенка; все секции
     прижаты к задней плоскости, поэтому более мелкая отступает спереди.
       kind "cabinet"  — закрытая часть: фасад(ы) и полки по сетке ярусов;
       kind "shelving" — открытая часть: ярусы и вертикали внутри яруса.
     tiers (снизу вверх): { splits: [м] } — положение вертикали в модулях от левой
     стойки секции; 1 и 1 = деление пополам, 1.5 = полтора модуля слева и полмодуля справа. */

  const fmtMod = (n) => String(Math.round(n * 100) / 100).replace(".", ",");

  function buildLayoutParts(comp, globals, config) {
    const P = globals.panel;
    const { stepW, stepH, plinth } = comp;
    const h = comp.heights.find((x) => x.code === config.height);
    if (!h || !config.layout.length) return { parts: [], corpus: null };

    const tiersN = h.n;
    const modulesTotal = config.layout.reduce((a, s) => a + s.modules, 0);
    const corpusW = stepW * modulesTotal + P;
    const corpusH = h.corpus;
    const totalH = corpusH + plinth;
    const innerH = corpusH - 2 * P;

    /* низ полки k (1..tiersN-1): полки лежат на общей сетке ярусов */
    const shelfY = (k) => plinth + k * stepH;

    let cursor = P;
    const secs = config.layout.map((s, i) => {
      const d = comp.depths.find((x) => x.id === s.depth) || comp.depths[0];
      const clear = s.modules * stepW - P;
      const backMat = s.back === "ЛДСП" ? "ЛДСП" : "ДВП";
      const backT = backMat === "ЛДСП" ? P : globals.back;
      const recess = s.kind === "cabinet" ? 10 : 0;
      const sec = {
        ...s, i, label: s.label || s.kind, depth: d.value, depthId: d.id,
        clear, x0: cursor, x1: cursor + clear, backMat, backT,
        shelfDepth: Math.max(100, d.value - backT - recess),
        shelfYs: [], rows: [], doors: [],
      };
      cursor += clear + P;

      if (s.kind === "cabinet") {
        const cnt = Math.min(s.shelves || 0, tiersN - 1);
        for (let k = 1; k <= cnt; k += 1) sec.shelfYs.push(shelfY(k));
        const doorsN = s.doors || 1;
        const doorW = (s.modules * stepW) / doorsN - globals.gap;
        for (let j = 0; j < doorsN; j += 1) {
          const left = sec.x0 - P / 2 + globals.gap / 2 + j * (s.modules * stepW) / doorsN;
          sec.doors.push({ x0: left, x1: left + doorW, y0: plinth + globals.gap, y1: totalH - globals.gap, w: round(doorW), h: round(corpusH - 2 * globals.gap) });
        }
      } else {
        for (let k = 1; k < tiersN; k += 1) sec.shelfYs.push(shelfY(k));
        for (let k = 1; k <= tiersN; k += 1) {
          const t = (s.tiers || [])[k - 1] || {};
          const splits = (t.splits || (t.split != null ? [t.split] : [])).filter((v) => v > 0 && v < s.modules);
          const y0 = k === 1 ? plinth + P : shelfY(k - 1) + P;
          const y1 = k === tiersN ? totalH - P : shelfY(k);
          const dividers = splits.map((sp) => {
            const cx = sec.x0 - P / 2 + sp * stepW;
            return { split: sp, x0: cx - P / 2, x1: cx + P / 2 };
          });
          /* чистые ширины отсеков яруса слева направо */
          const cells = [];
          let from = sec.x0;
          dividers.forEach((dv) => { cells.push({ x0: from, x1: dv.x0, clear: round(dv.x0 - from) }); from = dv.x1; });
          cells.push({ x0: from, x1: sec.x1, clear: round(sec.x1 - from) });
          sec.rows.push({ k, y0, y1, splits, dividers, cells });
        }
      }
      return sec;
    });

    /* Цоколь — коробка из реек ЛДСП по контуру (задняя, фронтальная, боковые)
       и перекладины внутри: расстояние между стенками и перекладинами не больше plinthRib.
       Фронт утоплен на setback; общая стенка между секциями идёт по более глубокой. */
    const plinthBoxes = [];
    const setback = comp.vars && comp.vars.setback != null ? comp.vars.setback : 30;
    const ribSpan = comp.vars && comp.vars.plinthRib ? comp.vars.plinthRib : 400;
    if (plinth > 0) {
      const t = P;
      const pb = (role, label, x0, x1, z0, z1) => plinthBoxes.push({ role, label, x0, x1, z0, z1 });
      const dp = (sec) => sec.depth - setback;
      pb("rear", "", 0, corpusW, 0, t);
      secs.forEach((sec, i) => {
        const Dp = dp(sec);
        const nxt = secs[i + 1];
        const innerD = Dp - 2 * t;
        pb("front", sec.label, i === 0 ? 0 : sec.x0, sec.x1 + P, Dp - t, Dp);
        if (i === 0) pb("wall", "", 0, P, t, Dp - t);
        pb("wall", "", sec.x1, sec.x1 + P, t, (nxt ? Math.max(Dp, dp(nxt)) : Dp) - t);

        const across = Math.max(0, Math.ceil(innerD / ribSpan) - 1);
        for (let k = 1; k <= across; k += 1) {
          const z0 = t + (k * innerD) / (across + 1) - t / 2;
          pb("rib", sec.label, sec.x0, sec.x1, z0, z0 + t);
        }
        const along = Math.max(0, Math.ceil(sec.clear / ribSpan) - 1);
        for (let k = 1; k <= along; k += 1) {
          const x0 = sec.x0 + (k * sec.clear) / (along + 1) - P / 2;
          pb("rib", sec.label, x0, x0 + P, t, Dp - t);
        }
      });
    }

    const parts = [];
    /* role: body — корпус и фасады, back — задняя стенка; декор берётся из config.decors[role] */
    const push = (name, ww, hh, qty, material, role) => {
      if (qty > 0 && ww > 0 && hh > 0) {
        const r = role || "body";
        const mat = material || "ЛДСП";
        const part = { name, w: round(ww), h: round(hh), qty, material: mat, role: r };
        if (mat === "ЛДСП" && config.decors && config.decors[r]) part.decor = config.decors[r];
        parts.push(part);
      }
    };

    const first = secs[0];
    const last = secs[secs.length - 1];
    if (first.depth === last.depth) push("Боковина", corpusH, first.depth, 2);
    else {
      push(`Боковина левая (${first.label})`, corpusH, first.depth, 1);
      push(`Боковина правая (${last.label})`, corpusH, last.depth, 1);
    }

    for (let i = 0; i < secs.length - 1; i += 1) {
      push(`Стойка между секциями: ${secs[i].label} | ${secs[i + 1].label}`, innerH, Math.max(secs[i].depth, secs[i + 1].depth), 1);
    }

    secs.forEach((sec) => {
      push(`Горизонт верх/низ (${sec.label})`, sec.clear, sec.depth, 2);
      push(`Полка (${sec.label})`, sec.clear, sec.shelfDepth, sec.shelfYs.length);

      if (sec.kind === "shelving") {
        const dividers = sec.rows.reduce((a, r) => a + r.dividers.length, 0);
        push(`Вертикаль яруса (${sec.label})`, stepH - P, sec.shelfDepth, dividers);
      }
      if (sec.kind === "cabinet" && sec.doors.length) {
        push("Фасад", sec.doors[0].w, sec.doors[0].h, sec.doors.length);
      }

      if (sec.backMat === "ЛДСП") push(`Задняя стенка (${sec.label})`, sec.clear, innerH, 1, "ЛДСП", "back");
      else push(`Задняя стенка (${sec.label})`, sec.modules * stepW + P, corpusH, 1, "ДВП");
    });

    const plinthNames = { rear: "Цоколь: задняя рейка", front: "Цоколь: фронт", wall: "Цоколь: боковая рейка", rib: "Цоколь: перекладина" };
    const grouped = {};
    plinthBoxes.forEach((b) => {
      const len = round(Math.max(b.x1 - b.x0, b.z1 - b.z0));
      const name = plinthNames[b.role] + (b.label ? ` (${b.label})` : "");
      const key = name + "|" + len;
      grouped[key] = grouped[key] || { name, len, qty: 0 };
      grouped[key].qty += 1;
    });
    Object.keys(grouped).forEach((k) => push(grouped[k].name, grouped[k].len, plinth, grouped[k].qty));

    const w = comp.widths.find((x) => x.n === modulesTotal)
      || { code: modulesTotal + "W", n: modulesTotal, corpus: corpusW, nominal: nominal(corpusW) };
    const geo = { corpusW, corpusH, totalH, innerH, plinth, panel: P, tiersN, gap: globals.gap, setback, ribSpan, plinthBoxes, secs };

    return { parts, corpus: { w, h, d: comp.depths.find((x) => x.id === config.depth) || comp.depths[0], secs, shelfDepth: first.shelfDepth, geo } };
  }

  /* Подпись глубины: одна цифра или «500 / 400» для разноглубинных секций. */
  function depthLabel(comp, config) {
    const ids = Array.isArray(config.layout) ? config.layout.map((s) => s.depth) : [config.depth];
    const vals = [];
    ids.forEach((id) => {
      const d = comp.depths.find((x) => x.id === id);
      if (d && !vals.includes(d.value)) vals.push(d.value);
    });
    return vals.join(" / ");
  }

  /* ---------- оценка раскроя: укладка полосами вдоль листа ---------- */

  /* Раскрой одной группы деталей (один декор) на своих листах. */
  function nestGroup(list, globals) {
    const L = globals.sheetL;
    const W = globals.sheetW;
    const k = globals.kerf;

    const flat = [];
    list.forEach((p) => {
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
    return {
      sheets,
      count,
      partsArea,
      util: count ? partsArea / (count * L * W) : 0,
      totalPieces: flat.length,
      oversize: sheets.some((s) => s.oversize),
    };
  }

  /* Раскрой ЛДСП: детали разного декора (part.decor) режутся из своих листов,
     ДВП считается отдельно — у неё свой формат. */
  function nest(parts, globals) {
    const L = globals.sheetL;
    const W = globals.sheetW;

    const lds = parts.filter((p) => p.material === "ЛДСП");
    const keys = [];
    lds.forEach((p) => { const key = p.decor || ""; if (!keys.includes(key)) keys.push(key); });

    const groups = keys.map((key) => ({ decor: key, ...nestGroup(lds.filter((p) => (p.decor || "") === key), globals) }));

    const sheets = [];
    groups.forEach((g) => g.sheets.forEach((sh) => sheets.push({ ...sh, decor: g.decor })));

    const count = sheets.length;
    const partsArea = groups.reduce((a, g) => a + g.partsArea, 0);
    const hdfArea = parts
      .filter((p) => p.material === "ДВП")
      .reduce((a, p) => a + p.w * p.h * p.qty, 0);

    return {
      sheets,
      groups,
      count,
      util: count ? partsArea / (count * L * W) : 0,
      partsArea,
      hdfArea,
      totalPieces: groups.reduce((a, g) => a + g.totalPieces, 0),
      oversize: groups.some((g) => g.oversize),
    };
  }

  return { compute, railFor, buildParts, nest, bays, nominal, depthLabel, fmtMod };
})();
