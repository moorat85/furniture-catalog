/* Личный каталог — рабочая база моделей.
   Хэш-роутинг: #system | #materials | #model/<id>
   Данные: data/system.json    — параметрическая размерная система и модели,
           data/standards.json — образцы материалов и общие правила,
           data/models.json    — карточки моделей каталога. */

(() => {
  const els = {
    content: document.getElementById("content"),
    modelNavList: document.getElementById("modelNavList"),
  };

  const STORE_KEY = "catalog.system.v3";

  let system = { globals: [], limits: [], categories: [], models: [] };
  let standards = { categories: [] };
  let models = [];
  let standardIndex = {};

  let state = { modelId: null, variants: {}, overrides: { globals: {}, limits: {}, cats: {} } };

  /* ---------- состояние ---------- */

  function loadState() {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      if (raw) {
        const p = JSON.parse(raw);
        state = { ...state, ...p, variants: { ...(p.variants || {}) }, overrides: { globals: {}, limits: {}, cats: {}, ...(p.overrides || {}) } };
      }
    } catch (e) { /* хранилище недоступно — работаем без сохранения */ }
  }

  function saveState() {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); } catch (e) { /* не критично */ }
  }

  function activeModel() {
    return system.models.find((m) => m.id === state.modelId) || system.models[0];
  }

  function catOf(mdl) {
    return system.categories.find((c) => c.id === mdl.category) || system.categories[0];
  }

  /* Декоры ЛДСП — из образцов на странице «Материалы»: id -> { label, color, image } */
  function decorInfo(id) {
    const mats = standards.categories.find((c) => c.id === "materials");
    const sw = mats && (mats.swatches || []).find((x) => x.id === id);
    return sw ? { id: sw.id, label: sw.label, color: sw.color, image: sw.image || null } : null;
  }

  function palette(mm) {
    const d = mm.cfg.decors || {};
    const fallback = { label: "", color: "#E9ECF2", image: null };
    return { body: decorInfo(d.body) || fallback, back: decorInfo(d.back || d.body) || fallback };
  }

  function valuesOf(list, over) {
    const out = {};
    list.forEach((v) => { out[v.id] = over && over[v.id] !== undefined ? over[v.id] : v.value; });
    return out;
  }

  function model() {
    return modelOf(activeModel());
  }

  function modelOf(mdl, decors) {
    const cat = catOf(mdl);
    const g = valuesOf(system.globals, state.overrides.globals);
    const l = valuesOf(system.limits, state.overrides.limits);
    const v = valuesOf(cat.vars, state.overrides.cats[cat.id]);
    const comp = Engine.compute(cat, v, g, l);
    const cfg = decors ? { ...mdl.config, decors: { ...(mdl.config.decors || {}), ...decors } } : mdl.config;
    const built = Engine.buildParts(comp, g, cfg);
    const nested = Engine.nest(built.parts, g);
    const railHeight = Engine.railFor(comp, g, cfg.height);
    return { mdl, cat, g, l, v, comp: { ...comp, railHeight }, cfg, built, nested };
  }

  /* ---------- боковая навигация ---------- */

  function buildModelNav() {
    const groups = [];
    const idx = {};
    models.forEach((m) => {
      const key = m.categoryLabel || "Прочее";
      if (!(key in idx)) { idx[key] = groups.length; groups.push({ label: key, items: [] }); }
      groups[idx[key]].items.push(m);
    });

    els.modelNavList.innerHTML = groups
      .map((g) => `
        <div class="nav-group">
          <p class="nav-section-label">${g.label}</p>
          ${g.items.map((m) => `<a href="#model/${m.id}" class="nav-model-item" data-nav="model/${m.id}">${m.name}</a>`).join("")}
        </div>`)
      .join("");
  }

  function setActiveNav(hash) {
    document.querySelectorAll(".nav-item, .nav-model-item").forEach((el) => {
      el.classList.toggle("is-active", el.dataset.nav === hash);
    });
  }

  function buildStandardIndex() {
    standardIndex = {};
    standards.categories.forEach((cat) => {
      (cat.params || []).forEach((p) => {
        standardIndex[p.key] = { ...p, categoryName: cat.name, categoryId: cat.id };
      });
    });
    const m = model();
    system.globals.forEach((v) => { standardIndex[v.id] = { key: v.id, label: v.label, value: m.g[v.id], unit: v.unit, rule: v.rule }; });
    system.limits.forEach((v) => { standardIndex[v.id] = { key: v.id, label: v.label, value: m.l[v.id], unit: v.unit, rule: v.rule }; });
  }

  /* ================= страница «Система размеров» ================= */

  function renderSystem() {
    const m = model();

    els.content.innerHTML = `
      <div class="page-header">
        <h1 class="page-title">Система размеров</h1>
        <p class="page-sub">Модули и глубины редактируются здесь — чертёж и раскрой пересчитываются на ходу. Остальные параметры показаны ниже справочно и правятся в <code>data/system.json</code>.</p>
      </div>

      <div class="sys-tabs" id="sysTabs">
        ${system.categories.map((c) => `
          <button class="sys-tab${c.id === m.cat.id ? " is-active" : ""}" data-cat="${c.id}"><span>${c.plural || c.name}</span></button>`).join("")}
      </div>

      <div class="sys-layout">
        <aside class="sys-controls" id="sysControls"></aside>
        <div class="sys-output" id="sysOutput"></div>
      </div>

      <div class="ro-section" id="roSection"></div>
    `;

    renderControls();
    renderOutput();
    renderReadOnly();

    document.getElementById("sysTabs").addEventListener("click", (e) => {
      const btn = e.target.closest("[data-cat]");
      if (!btn) return;
      const first = system.models.find((x) => x.category === btn.dataset.cat);
      if (!first) return;
      state.modelId = first.id;
      saveState();
      renderSystem();
    });
  }

  function renderControls() {
    const m = model();
    const editable = m.cat.vars.filter((v) => v.editable);

    document.getElementById("sysControls").innerHTML = `
      <div class="ctrl-group">
        <p class="ctrl-group-title">Модули · ${m.cat.name}</p>
        ${editable.map((v) => `
          <label class="ctrl">
            <span class="ctrl-label">${v.label}</span>
            <span class="ctrl-val">
              <input type="number" value="${m.v[v.id]}" min="${v.min}" max="${v.max}" step="${v.step}"
                     data-input="cat:${v.id}" aria-label="${v.label}">
              ${v.unit ? `<span class="ctrl-unit">${v.unit}</span>` : ""}
            </span>
          </label>`).join("")}
      </div>

      <div class="ctrl-actions">
        <button class="btn" id="sysReset">Сбросить</button>
        <button class="btn btn-primary" id="sysExport">Скопировать JSON</button>
      </div>
      <p class="ctrl-hint" id="sysHint"></p>
    `;

    document.getElementById("sysControls").addEventListener("input", onControlInput);
    document.getElementById("sysReset").addEventListener("click", () => {
      state.overrides = { globals: {}, limits: {}, cats: {} };
      saveState();
      renderSystem();
    });
    document.getElementById("sysExport").addEventListener("click", exportJson);
  }

  function onControlInput(e) {
    const key = e.target.dataset.input;
    if (!key) return;
    const id = key.split(":")[1];
    const num = Number(e.target.value);
    if (!Number.isFinite(num)) return;

    const cid = catOf(activeModel()).id;
    state.overrides.cats[cid] = state.overrides.cats[cid] || {};
    state.overrides.cats[cid][id] = num;

    saveState();
    renderOutput();
    renderReadOnly();
  }

  function exportJson() {
    const m = model();
    const out = {
      globals: m.g,
      limits: m.l,
      categories: system.categories.reduce((acc, c) => {
        acc[c.id] = valuesOf(c.vars, state.overrides.cats[c.id]);
        return acc;
      }, {}),
    };
    const text = JSON.stringify(out, null, 2);
    const hint = document.getElementById("sysHint");
    const done = (msg) => { if (hint) { hint.textContent = msg; setTimeout(() => (hint.textContent = ""), 2400); } };

    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(
        () => done("Скопировано — вставь в data/system.json"),
        () => done("Не удалось скопировать, значения в консоли")
      );
    } else {
      done("Значения в консоли браузера");
    }
    console.log(text);
  }

  /* Модели текущей категории, сгруппированные по ширине: 1W, 2W, … */
  function modelSwitch(m) {
    const mine = system.models.filter((x) => x.category === m.cat.id);
    const byWidth = {};
    mine.forEach((x) => { (byWidth[x.config.width] = byWidth[x.config.width] || []).push(x); });

    const rows = Object.keys(byWidth)
      .map(Number)
      .sort((a, b) => a - b)
      .map((n) => `
        <div class="mw-row">
          <span class="mw-code">${n}W</span>
          ${byWidth[n].map((x) => `
            <button class="mw-item${x.id === m.mdl.id ? " is-active" : ""}" data-model="${x.id}">${x.name}</button>`).join("")}
        </div>`);

    return `<div class="model-switch" id="modelSwitch">${rows.join("")}</div>`;
  }

  function renderOutput() {
    const m = model();

    document.getElementById("sysOutput").innerHTML = `
      ${modelSwitch(m)}
      ${drawingBlocks(m)}
      ${cuttingBlock(m)}
    `;

    document.getElementById("modelSwitch").addEventListener("click", (e) => {
      const btn = e.target.closest("[data-model]");
      if (!btn) return;
      state.modelId = btn.dataset.model;
      saveState();
      renderOutput();
    });
  }

  /* Фронт, а для секционных изделий ещё объём, вид сверху и сечение цоколя. */
  function drawingBlocks(m, opts) {
    const o = opts || {};
    const w = m.comp.widths.find((x) => x.n === m.cfg.width);
    const title = o.title || `${m.mdl.name} · ${w ? w.code : ""} · ${m.cfg.height} · глубина ${Engine.depthLabel(m.comp, m.cfg)}`;

    let html = frontBlock(m, title);
    if (m.cfg.layout) html += viewsBlock(m) + plinthBlock(m);
    return html;
  }

  function frontBlock(m, title) {
    return `
      <section class="section-block">
        <p class="section-title">${title}</p>
        <div class="drawing-stage">${Draw.elevation(m.comp, m.g, m.cfg, m.built)}</div>
      </section>`;
  }

  function viewsBlock(m) {
    return `
      <section class="section-block">
        <p class="section-title">Объём и вид сверху</p>
        <div class="view-row">
          <div class="drawing-stage stage-iso">${Draw.iso(m.comp, m.g, m.cfg, m.built)}</div>
          <div class="drawing-stage stage-plan">${Draw.plan(m.comp, m.g, m.cfg, m.built)}</div>
        </div>
      </section>`;
  }

  function block3d(m) {
    return `
      <section class="section-block">
        <p class="section-title">3D-вид</p>
        <div class="drawing-stage">${Draw.iso(m.comp, m.g, m.cfg, m.built)}</div>
      </section>`;
  }

  function planBlock(m) {
    return `
      <section class="section-block">
        <p class="section-title">Вид сверху</p>
        <div class="drawing-stage">${Draw.plan(m.comp, m.g, m.cfg, m.built)}</div>
      </section>`;
  }

  function plinthBlock(m) {
    const geo = m.built.corpus && m.built.corpus.geo;
    if (!geo || !geo.plinthBoxes || !geo.plinthBoxes.length) return "";
    return `
      <section class="section-block">
        <p class="section-title">Сечение цоколя</p>
        <div class="drawing-stage">${Draw.plinthSection(m.comp, m.g, m.cfg, m.built)}</div>
        <p class="notes-box">Разрез на высоте ${Math.round(geo.plinth / 2)} мм от пола, вид сверху. Штриховка — рейки ЛДСП ${geo.panel} × ${geo.plinth} мм: контур (задняя, фронтальная, боковые) и перекладины внутри; пунктир — контур корпуса над цоколем. Размеры — просветы между опорами, синие — глубина цоколя.</p>
      </section>`;
  }

  function rendersBlock(m) {
    const pal = palette(m);
    return `
      <section class="section-block">
        <p class="section-title">Рендеры</p>
        <div class="renders-row">
          <figure class="render-fig">
            <div class="render-stage">${Draw.render3q(m.comp, m.g, m.cfg, m.built, pal)}</div>
            <figcaption>Вид в три четверти</figcaption>
          </figure>
          <figure class="render-fig">
            <div class="render-stage">${Draw.renderFront(m.comp, m.g, m.cfg, m.built, pal)}</div>
            <figcaption>Фронт</figcaption>
          </figure>
        </div>
        <p class="notes-box">Упрощённая визуализация по геометрии модели, цвета — из выбранного исполнения. Полноценные рендеры добавим позже.</p>
      </section>`;
  }

  function cuttingBlock(m) {
    const groups = m.nested.groups || [];
    const showGroups = groups.length > 1 || groups.some((g) => g.decor);
    const rows = groups.map((g) => {
      const info = g.decor ? decorInfo(g.decor) : null;
      return `
        <tr>
          <td>${info ? `<i class="dot" style="background:${info.color}"></i>${info.label}` : "ЛДСП"}</td>
          <td class="num">${g.count}</td>
          <td class="num">${(g.partsArea / 1e6).toFixed(2)} м²</td>
          <td class="num">${Math.round(g.util * 100)} %</td>
        </tr>`;
    }).join("");

    return `
      <section class="section-block">
        <p class="section-title">Раскрой ЛДСП</p>
        <div class="stat-row">
          ${stat("Листов", m.nested.count, "шт")}
          ${stat("Использование", Math.round(m.nested.util * 100), "%")}
          ${stat("Деталей на раскрой", m.nested.totalPieces, "шт")}
          ${stat("Площадь деталей", (m.nested.partsArea / 1e6).toFixed(2), "м²")}
        </div>
        ${showGroups ? `
        <table class="parts-table cut-groups">
          <thead><tr><th>Декор</th><th class="num">Листов</th><th class="num">Площадь деталей</th><th class="num">Использование</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>` : ""}
        <div class="sheet-row">${Draw.sheets(m.nested, m.g, 6, decorInfo)}</div>
        <p class="notes-box">Оценка по алгоритму полос с учётом пропила и направления текстуры: детали кладутся длинной стороной вдоль листа, без поворота. Детали разных декоров режутся из разных листов. Реальный раскрой обычно даёт на 2–4 % лучше.</p>
      </section>`;
  }

  function stat(label, value, unit) {
    return `
      <div class="stat">
        <span class="stat-val">${value}<span class="stat-unit">${unit}</span></span>
        <span class="stat-label">${label}</span>
      </div>`;
  }

  /* ---------- справочные параметры под чертежом, во всю ширину ---------- */

  function renderReadOnly() {
    const m = model();
    const fixed = m.cat.vars.filter((v) => !v.editable && !v.hidden);

    const groups = {};
    system.globals.forEach((v) => { (groups[v.group || "Прочее"] = groups[v.group || "Прочее"] || []).push(v); });

    const rows = [];
    const pushGroup = (title, list, values) => {
      if (!list.length) return;
      rows.push(`<tr class="ro-head"><td colspan="3">${title}</td></tr>`);
      list.forEach((v) => {
        rows.push(`
          <tr id="param-${v.id}">
            <td class="ro-name">${v.label}</td>
            <td class="ro-value">${values[v.id]}${v.unit ? " " + v.unit : ""}</td>
            <td class="ro-rule">${v.rule || ""}</td>
          </tr>`);
      });
    };

    pushGroup(m.cat.name, fixed, m.v);
    Object.keys(groups).forEach((gname) => pushGroup(gname, groups[gname], m.g));
    pushGroup("Пределы", system.limits, m.l);

    document.getElementById("roSection").innerHTML = `
      <div class="ro-divider"></div>
      <p class="ro-caption">Справочные параметры — правятся в <code>data/system.json</code></p>
      <table class="ro-table">
        <tbody>${rows.join("")}</tbody>
      </table>
    `;
  }

  /* ================= страница «Материалы и фурнитура» ================= */

  function renderMaterials() {
    const mats = standards.categories.find((c) => c.id === "materials");
    const general = standards.categories.find((c) => c.id === "general");

    els.content.innerHTML = `
      <div class="page-header">
        <h1 class="page-title">Материалы и фурнитура</h1>
        <p class="page-sub">Отделки корпуса и фасадов, общие правила оформления. Раздел фурнитуры наполним, когда появятся позиции.</p>
      </div>

      ${mats ? `
      <section class="standards-category" id="cat-materials">
        <h2>${mats.name}</h2>
        <div class="swatch-row">
          ${(mats.swatches || []).map((s) => `
            <div class="swatch">
              <span class="swatch-circle${s.bordered ? " bordered" : ""}" style="${s.image ? `background-image:url('${s.image}')` : `background-color:${s.color}`}"></span>
              <span class="swatch-text">
                <span class="swatch-label">${s.label}</span>
                ${s.desc ? `<span class="swatch-desc">${s.desc}</span>` : ""}
              </span>
            </div>`).join("")}
        </div>
      </section>` : ""}

      <section class="standards-category" id="cat-hardware">
        <h2>Фурнитура</h2>
        <p class="category-intro">Пока пусто — петли, направляющие, ручки и полкодержатели заведём отдельными позициями со ссылкой на размеры из системы.</p>
      </section>

      ${general ? `
      <section class="standards-category" id="cat-general">
        <h2>${general.name}</h2>
        <table class="ro-table">
          <tbody>
            ${general.params.map((p) => `
              <tr id="param-${p.key}">
                <td class="ro-name">${p.label}</td>
                <td class="ro-value">${p.value}${p.unit ? " " + p.unit : ""}</td>
                <td class="ro-rule">${p.rule || ""}</td>
              </tr>`).join("")}
          </tbody>
        </table>
      </section>` : ""}
    `;
  }

  /* ================= страница модели ================= */

  function linkedChips(m) {
    return (m.linkedStandards || [])
      .map((key) => {
        const std = standardIndex[key];
        if (!std) return "";
        return `<button class="standard-chip" data-goto-standard="${key}">${std.label}: ${std.value}${std.unit ? " " + std.unit : ""}</button>`;
      })
      .join("");
  }

  function bindStandardChips() {
    els.content.querySelectorAll("[data-goto-standard]").forEach((btn) => {
      btn.addEventListener("click", () => {
        location.hash = "system";
        requestAnimationFrame(() => {
          const row = document.getElementById(`param-${btn.dataset.gotoStandard}`);
          if (row) {
            row.scrollIntoView({ behavior: "smooth", block: "center" });
            row.classList.add("is-flash");
            setTimeout(() => row.classList.remove("is-flash"), 1400);
          }
        });
      });
    });
  }

  /* ---------- карточка со ссылкой на модель размерной системы: всё считается на лету ---------- */

  const fmt = Engine.fmtMod;

  function liveSpecs(mm) {
    const geo = mm.built.corpus && mm.built.corpus.geo;
    if (!geo) return [];
    const { secs } = geo;
    const maxD = Math.max(...secs.map((x) => x.depth));
    const pal = palette(mm);
    const rows = [];

    rows.push(["Габарит", `${geo.corpusW} × ${maxD} × ${geo.totalH} мм`]);
    rows.push(["Модули", `${mm.built.corpus.w.code} · ${secs.map((x) => `${x.modules} ${x.label}`).join(" + ")}`]);
    rows.push(["Глубина корпуса", secs.map((x) => `${x.depth} (${x.label})`).join(" / ") + " мм"]);
    if (pal.body.label) rows.push(["Исполнение", `корпус и фасад — ${pal.body.label.toLowerCase()}, задняя стенка стеллажа — ${pal.back.label.toLowerCase()}`]);
    rows.push(["Цоколь", `${geo.plinth} мм · рамка из реек ЛДСП ${geo.panel} мм с перекладинами, фронт утоплен на ${geo.setback} мм`]);

    const ribs = geo.plinthBoxes.filter((b) => b.role === "rib");
    if (ribs.length) {
      const txt = secs.map((sec) => {
        const mine = ribs.filter((b) => b.label === sec.label);
        if (!mine.length) return null;
        const cross = mine.filter((b) => (b.x1 - b.x0) >= (b.z1 - b.z0)).length;
        const along = mine.length - cross;
        const bits = [];
        if (cross) bits.push(`${cross} поперечн.`);
        if (along) bits.push(`${along} продольн.`);
        return `${sec.label} — ${bits.join(", ")}`;
      }).filter(Boolean);
      rows.push(["Перекладины цоколя", `${txt.join(" · ")}; шаг не более ${geo.ribSpan} мм`]);
    }

    secs.filter((x) => x.kind === "shelving").forEach((sec) => {
      const first = sec.rows[0];
      rows.push([`Ярусов (${sec.label})`, `${sec.rows.length}, в свету по высоте ${Math.round(first.y1 - first.y0)} мм`]);
      const scheme = sec.rows.map((r) => {
        const cuts = [0, ...r.splits, sec.modules];
        return cuts.slice(1).map((c, i) => fmt(c - cuts[i])).join("+");
      });
      rows.push(["Деление ярусов, снизу вверх", scheme.join(" · ")]);
    });

    secs.filter((x) => x.doors.length).forEach((sec) => {
      rows.push([`Фасады (${sec.label})`, `${sec.doors.length} × ${sec.doors[0].w} × ${sec.doors[0].h} мм`]);
      rows.push([`Полок (${sec.label})`, `${sec.shelfYs.length}`]);
    });

    rows.push(["Задняя стенка", secs.map((x) => `${x.label} — ${x.backMat} ${x.backT} мм`).join(" · ")]);

    const cut = (mm.nested.groups || []).map((g) => {
      const info = g.decor ? decorInfo(g.decor) : null;
      return `${info ? info.label.toLowerCase() : "ЛДСП"} ${g.count}`;
    });
    rows.push(["Раскрой ЛДСП", `${mm.nested.count} л. ${mm.g.sheetL} × ${mm.g.sheetW} (${cut.join(", ")}), использование ${Math.round(mm.nested.util * 100)} %`]);
    return rows;
  }

  function partsTable(mm) {
    const rows = mm.built.parts.map((p) => {
      const info = p.decor ? decorInfo(p.decor) : null;
      return `
      <tr>
        <td>${p.name}</td>
        <td class="num">${p.w} × ${p.h}</td>
        <td class="num">${p.qty}</td>
        <td class="mat">${p.material}${info ? ` · <i class="dot" style="background:${info.color}"></i>${info.label.toLowerCase()}` : ""}</td>
      </tr>`;
    }).join("");
    const total = mm.built.parts.reduce((a, p) => a + p.qty, 0);
    return `
      <table class="parts-table">
        <thead><tr><th>Деталь</th><th class="num">Размер, мм</th><th class="num">Шт</th><th>Материал</th></tr></thead>
        <tbody>${rows}</tbody>
        <tfoot><tr><td>Всего деталей</td><td></td><td class="num">${total}</td><td></td></tr></tfoot>
      </table>`;
  }

  function variantRow(m, current) {
    if (!(m.variants && m.variants.length > 1)) return "";
    return `
      <div class="variant-row" id="variantRow">
        <span class="variant-caption">Исполнение</span>
        ${m.variants.map((v) => {
          const info = decorInfo(v.decors.body);
          return `<button class="variant-btn${v.id === current ? " is-active" : ""}" data-variant="${v.id}">
            <i class="dot" style="background:${info ? info.color : "#ccc"}"></i>${v.label}</button>`;
        }).join("")}
      </div>`;
  }

  function renderLiveModel(m) {
    const sm = system.models.find((x) => x.id === m.systemModel);
    if (!sm) {
      els.content.innerHTML = `<p class="page-sub">Модель размерной системы «${m.systemModel}» не найдена.</p>`;
      return;
    }
    const variants = m.variants || [];
    const current = (variants.find((v) => v.id === state.variants[m.id]) || variants[0] || {}).id;
    const variant = variants.find((v) => v.id === current);
    const mm = modelOf(sm, variant ? variant.decors : null);
    const linked = linkedChips(m);

    els.content.innerHTML = `
      <div class="model-head">
        <div>
          <p class="page-eyebrow">${m.categoryLabel}</p>
          <h1 class="page-title">${m.name}</h1>
        </div>
        <span class="status-pill">${m.status}</span>
      </div>

      ${variantRow(m, current)}

      ${block3d(mm)}
      ${rendersBlock(mm)}
      ${frontBlock(mm, "Фронт")}
      ${planBlock(mm)}
      ${plinthBlock(mm)}

      <section class="section-block">
        <p class="section-title">Спецификация</p>
        <table class="spec-table wide">
          ${liveSpecs(mm).map((r) => `<tr><td>${r[0]}</td><td>${r[1]}</td></tr>`).join("")}
        </table>
      </section>

      <section class="section-block">
        <p class="section-title">Детали</p>
        ${partsTable(mm)}
      </section>

      ${cuttingBlock(mm)}

      ${linked ? `<section class="section-block">
        <p class="section-title">Связанные стандарты</p>
        <div class="linked-standards">${linked}</div>
      </section>` : ""}

      ${m.notes ? `<p class="notes-box">${m.notes}</p>` : ""}
    `;

    const row = document.getElementById("variantRow");
    if (row) {
      row.addEventListener("click", (e) => {
        const btn = e.target.closest("[data-variant]");
        if (!btn) return;
        state.variants[m.id] = btn.dataset.variant;
        saveState();
        renderLiveModel(m);
      });
    }

    bindStandardChips();
  }

  function renderModel(id) {
    const m = models.find((item) => item.id === id);
    if (!m) {
      els.content.innerHTML = `<p class="page-sub">Модель не найдена.</p>`;
      return;
    }
    if (m.systemModel) return renderLiveModel(m);

    const linked = linkedChips(m);

    els.content.innerHTML = `
      <div class="model-head">
        <div>
          <p class="page-eyebrow">${m.categoryLabel}</p>
          <h1 class="page-title">${m.name}</h1>
        </div>
        <span class="status-pill">${m.status}</span>
      </div>

      <section class="section-block">
        <p class="section-title">3D-вид</p>
        <div class="viewer-3d">3D-модель — заглушка</div>
      </section>

      <section class="section-block">
        <p class="section-title">Рендеры</p>
        <div class="drawings-grid">
          ${(m.renders || [{ label: "Общий вид" }, { label: "В интерьере" }]).map((d) => `<div class="drawing-card">${d.label}</div>`).join("")}
        </div>
      </section>

      <section class="section-block">
        <p class="section-title">Чертежи</p>
        <div class="drawings-grid">
          ${(m.drawings || []).map((d) => `<div class="drawing-card">${d.label}</div>`).join("")}
        </div>
      </section>

      <section class="section-block">
        <p class="section-title">Спецификация</p>
        <table class="spec-table">
          ${(m.specs || []).map((s) => `<tr><td>${s.label}</td><td>${s.value}${s.unit ? " " + s.unit : ""}</td></tr>`).join("")}
        </table>
      </section>

      ${linked ? `<section class="section-block">
        <p class="section-title">Связанные стандарты</p>
        <div class="linked-standards">${linked}</div>
      </section>` : ""}

      ${m.notes ? `<p class="notes-box">${m.notes}</p>` : ""}
    `;

    bindStandardChips();
  }

  /* ---------- роутинг ---------- */

  function route() {
    const hash = (location.hash || "#system").slice(1);
    setActiveNav(hash);
    if (hash.startsWith("model/")) renderModel(hash.slice("model/".length));
    else if (hash === "materials") renderMaterials();
    else renderSystem();
    window.scrollTo(0, 0);
  }

  async function init() {
    const [sysRes, stdRes, modRes] = await Promise.all([
      fetch("data/system.json"),
      fetch("data/standards.json"),
      fetch("data/models.json"),
    ]);
    system = await sysRes.json();
    standards = await stdRes.json();
    models = await modRes.json();

    loadState();
    if (!state.modelId || !system.models.some((m) => m.id === state.modelId)) {
      state.modelId = system.models[0].id;
    }

    buildStandardIndex();
    buildModelNav();
    window.addEventListener("hashchange", route);
    route();
  }

  init();
})();
