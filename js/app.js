/* Личный каталог — рабочая база моделей.
   Хэш-роутинг: #system | #materials | #model/<id>
   Данные: data/system.json    — параметрическая размерная система и модели,
           data/standards.json — образцы материалов и правила-исключения,
           data/models.json    — карточки моделей. */

(() => {
  const els = {
    content: document.getElementById("content"),
    modelNavList: document.getElementById("modelNavList"),
  };

  const STORE_KEY = "catalog.system.v2";

  let system = { globals: [], limits: [], categories: [], models: [] };
  let standards = { categories: [] };
  let models = [];
  let standardIndex = {};

  let state = { modelId: null, overrides: { globals: {}, limits: {}, cats: {} } };

  /* ---------- состояние ---------- */

  function loadState() {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      if (raw) {
        const p = JSON.parse(raw);
        state = { ...state, ...p, overrides: { globals: {}, limits: {}, cats: {}, ...(p.overrides || {}) } };
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

  function valuesOf(list, over) {
    const out = {};
    list.forEach((v) => { out[v.id] = over && over[v.id] !== undefined ? over[v.id] : v.value; });
    return out;
  }

  function model() {
    const mdl = activeModel();
    const cat = catOf(mdl);
    const g = valuesOf(system.globals, state.overrides.globals);
    const l = valuesOf(system.limits, state.overrides.limits);
    const v = valuesOf(cat.vars, state.overrides.cats[cat.id]);
    const comp = Engine.compute(cat, v, g, l);
    const cfg = mdl.config;
    const built = Engine.buildParts(comp, g, cfg);
    const nested = Engine.nest(built.parts, g);
    const railHeight = Engine.railFor(comp, g, cfg.height);
    const checks = Engine.check(comp, l, { railHeight });
    return { mdl, cat, g, l, v, comp: { ...comp, railHeight }, cfg, built, nested, checks };
  }

  /* ---------- навигация ---------- */

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
        <p class="page-sub">Модули и глубины редактируются здесь — производные величины, чертёж и раскрой пересчитываются на ходу. Остальные параметры показаны справочно и правятся в <code>data/system.json</code>.</p>
      </div>

      <div class="sys-layout">
        <aside class="sys-controls" id="sysControls"></aside>
        <div class="sys-output" id="sysOutput"></div>
      </div>
    `;

    renderControls();
    renderOutput();
  }

  function ctrl(v, scope, current) {
    return `
      <label class="ctrl" data-ctrl="${scope}:${v.id}">
        <span class="ctrl-label">${v.label}</span>
        <span class="ctrl-val">
          <input type="number" value="${current[v.id]}" min="${v.min}" max="${v.max}" step="${v.step}"
                 data-input="${scope}:${v.id}" aria-label="${v.label}">
          ${v.unit ? `<span class="ctrl-unit">${v.unit}</span>` : ""}
        </span>
      </label>`;
  }

  function roList(items, values) {
    return `
      <dl class="ro-list">
        ${items.map((v) => `
          <div class="ro-row" title="${(v.rule || "").replace(/"/g, "&quot;")}">
            <dt>${v.label}</dt>
            <dd>${values[v.id]}${v.unit ? " " + v.unit : ""}</dd>
          </div>`).join("")}
      </dl>`;
  }

  function renderControls() {
    const m = model();
    const editable = m.cat.vars.filter((v) => v.editable);
    const fixed = m.cat.vars.filter((v) => !v.editable);

    const groups = {};
    system.globals.forEach((v) => { (groups[v.group || "Прочее"] = groups[v.group || "Прочее"] || []).push(v); });

    document.getElementById("sysControls").innerHTML = `
      <div class="ctrl-group">
        <p class="ctrl-group-title">Модули · ${m.cat.name}</p>
        ${editable.map((v) => ctrl(v, "cat", m.v)).join("")}
      </div>

      <div class="ctrl-actions">
        <button class="btn" id="sysReset">Сбросить</button>
        <button class="btn btn-primary" id="sysExport">Скопировать JSON</button>
      </div>
      <p class="ctrl-hint" id="sysHint"></p>

      <div class="ro-block">
        <p class="ro-title">Справочно · правится в файле</p>
        ${fixed.length ? `<p class="ro-sub">Категория</p>${roList(fixed, m.v)}` : ""}
        ${Object.keys(groups).map((gname) => `<p class="ro-sub">${gname}</p>${roList(groups[gname], m.g)}`).join("")}
        <p class="ro-sub">Пределы</p>${roList(system.limits, m.l)}
      </div>
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
    const [scope, id] = key.split(":");
    const num = Number(e.target.value);
    if (!Number.isFinite(num)) return;

    if (scope === "glob") state.overrides.globals[id] = num;
    else if (scope === "lim") state.overrides.limits[id] = num;
    else {
      const cid = catOf(activeModel()).id;
      state.overrides.cats[cid] = state.overrides.cats[cid] || {};
      state.overrides.cats[cid][id] = num;
    }
    saveState();
    renderOutput();
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

  function renderOutput() {
    const m = model();
    const errors = m.checks.filter((c) => !c.ok && c.level === "error");
    const warns = m.checks.filter((c) => !c.ok && c.level === "warn");
    const li = (c) => `<li>${c.label}: <b>${c.actual}</b> при ${c.dir === "max" ? "максимуме" : "минимуме"} ${c.limit} мм</li>`;
    const depth = m.comp.depths.find((d) => d.id === m.cfg.depth);
    const exceptions = standards.categories.find((c) => c.id === "exceptions");

    document.getElementById("sysOutput").innerHTML = `
      <div class="model-switch" id="modelSwitch">
        ${system.models.map((x) => `
          <button class="chip${x.id === m.mdl.id ? " is-active" : ""}" data-model="${x.id}">
            ${x.name}<span class="chip-note">${x.note || ""}</span>
          </button>`).join("")}
      </div>

      ${errors.length ? `<div class="alert"><p class="alert-title">Нарушены пределы: ${errors.length}</p><ul>${errors.map(li).join("")}</ul></div>` : ""}
      ${warns.length ? `<div class="alert alert-warn"><p class="alert-title">Требует решения: ${warns.length}</p><ul>${warns.map(li).join("")}</ul>
          <p class="alert-note">Не ошибка конструктива: на такой высоте верхний модуль делается антресолью с полкой, а штанга уходит ниже.</p></div>` : ""}

      <section class="section-block">
        <p class="section-title">${m.mdl.name} · X${m.cfg.width} · ${m.cfg.height} · глубина ${depth.value}</p>
        <div class="drawing-stage">${Draw.elevation(m.comp, m.g, m.cfg, m.built)}</div>
      </section>

      <section class="section-block">
        <p class="section-title">Производные величины</p>
        <div class="derived-grid">
          ${derivedCard("Чистая ширина отсека", m.comp.clearW, "модуль − панель")}
          ${derivedCard("Пролёт полки", m.comp.bayClear, `${m.comp.bay} × модуль − панель`, chk(m.checks, "bayClear"))}
          ${derivedCard("Ширина фасада", m.comp.facadeW, "модуль − зазор", chk(m.checks, "facadeWmax") && chk(m.checks, "facadeWmin"))}
          ${derivedCard("Полушаг", m.comp.halfStep, "вертикальный модуль ÷ 2")}
          ${derivedCard("Высота штанги", m.comp.railHeight, "верх корпуса − модуль", chk(m.checks, "railHeight"))}
          ${derivedCard("Самая высокая", m.comp.maxTotal, "корпус + цоколь", chk(m.checks, "totalHeight"))}
        </div>
      </section>

      <section class="section-block">
        <p class="section-title">Ширины</p>
        ${tbl(["Код", "Модулей", "Габарит", "Номинал"], m.comp.widths.map((w) => [w.code, w.n, w.corpus, w.nominal]))}
      </section>

      <section class="section-block">
        <p class="section-title">Высоты</p>
        ${tbl(["Код", "Формула", "Корпус", "С цоколем", "Назначение"], m.comp.heights.map((h) => [
          h.code, `${m.comp.stepH} × ${h.n}${h.half ? " + " + m.comp.halfStep : ""} + ${m.g.panel}`, h.corpus, h.total, h.use || "",
        ]))}
      </section>

      <section class="section-block">
        <p class="section-title">Зоны хранения</p>
        ${tbl(["Зона", "Модулей", "Чистая высота", "Норматив", "Назначение"], m.comp.zones.map((z) => [
          z.label, z.steps, z.clear, z.norm || "—", z.use || "",
        ]))}
      </section>

      <section class="section-block">
        <p class="section-title">Глубины</p>
        ${tbl(["Глубина", "Роль", "Чистая", "Плечики", "Полос из листа", "Отход"], m.comp.depths.map((d) => [
          d.value, d.label, d.clear, d.hangerOk ? "проходит" : "не проходит", d.strips, d.waste,
        ]))}
      </section>

      <section class="section-block">
        <p class="section-title">Детали модели</p>
        ${tbl(["Деталь", "Размер", "Кол-во", "Материал"], m.built.parts.map((p) => [p.name, `${p.w} × ${p.h}`, p.qty, p.material]))}
      </section>

      <section class="section-block">
        <p class="section-title">Раскрой ЛДСП</p>
        <div class="stat-row">
          ${stat("Листов", m.nested.count, "шт")}
          ${stat("Использование", Math.round(m.nested.util * 100), "%", m.nested.util >= 0.85)}
          ${stat("Деталей на раскрой", m.nested.totalPieces, "шт")}
          ${stat("Площадь деталей", (m.nested.partsArea / 1e6).toFixed(2), "м²")}
          ${stat("ДВП отдельно", (m.nested.hdfArea / 1e6).toFixed(2), "м²")}
        </div>
        <div class="sheet-row">${Draw.sheets(m.nested, m.g, 4)}</div>
        <p class="notes-box">Оценка по алгоритму полос с учётом пропила и направления текстуры: детали кладутся длинной стороной вдоль листа, без поворота. Реальный раскрой обычно даёт на 2–4 % лучше.</p>
      </section>

      ${exceptions ? `
      <section class="section-block">
        <p class="section-title">Где сетка ломается</p>
        <div class="rules-grid">
          ${(exceptions.rules || []).map((r, i) => `
            <div class="rule-card">
              <span class="rule-num">${String(i + 1).padStart(2, "0")}</span>
              <p class="rule-title">${r.title}</p>
              <p class="rule-text">${r.text}</p>
            </div>`).join("")}
        </div>
      </section>` : ""}
    `;

    document.getElementById("modelSwitch").addEventListener("click", (e) => {
      const btn = e.target.closest("[data-model]");
      if (!btn) return;
      state.modelId = btn.dataset.model;
      saveState();
      renderSystem();
    });
  }

  function chk(checks, id) {
    const c = checks.find((x) => x.id === id);
    return c ? c.ok : true;
  }

  function derivedCard(label, value, formula, ok) {
    return `
      <div class="derived${ok === false ? " is-bad" : ""}">
        <span class="derived-val">${value}</span>
        <span class="derived-label">${label}</span>
        <span class="derived-formula">${formula}</span>
      </div>`;
  }

  function stat(label, value, unit, good) {
    const cls = good === undefined ? "" : good ? " is-good" : " is-bad";
    return `
      <div class="stat${cls}">
        <span class="stat-val">${value}<span class="stat-unit">${unit}</span></span>
        <span class="stat-label">${label}</span>
      </div>`;
  }

  function tbl(cols, rows) {
    return `
      <div class="data-table-wrap">
        <table class="data-table">
          <thead><tr>${cols.map((c) => `<th>${c}</th>`).join("")}</tr></thead>
          <tbody>${rows.map((r) => `<tr>${r.map((c, i) => `<td${i === 0 ? ' class="first"' : ""}>${c}</td>`).join("")}</tr>`).join("")}</tbody>
        </table>
      </div>`;
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
        ${roListStatic(general.params)}
      </section>` : ""}
    `;
  }

  function roListStatic(params) {
    return `
      <dl class="ro-list ro-wide">
        ${params.map((p) => `
          <div class="ro-row" id="param-${p.key}" title="${(p.rule || "").replace(/"/g, "&quot;")}">
            <dt>${p.label}</dt>
            <dd>${p.value}${p.unit ? " " + p.unit : ""}</dd>
          </div>`).join("")}
      </dl>`;
  }

  /* ================= страница модели ================= */

  function renderModel(id) {
    const m = models.find((item) => item.id === id);
    if (!m) {
      els.content.innerHTML = `<p class="page-sub">Модель не найдена.</p>`;
      return;
    }

    const linked = (m.linkedStandards || [])
      .map((key) => {
        const std = standardIndex[key];
        if (!std) return "";
        return `<button class="standard-chip" data-goto-standard="${key}">${std.label}: ${std.value}${std.unit ? " " + std.unit : ""}</button>`;
      })
      .join("");

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

    els.content.querySelectorAll("[data-goto-standard]").forEach((btn) => {
      btn.addEventListener("click", () => { location.hash = "system"; });
    });
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
