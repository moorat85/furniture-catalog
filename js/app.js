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
    const depth = m.comp.depths.find((d) => d.id === m.cfg.depth);
    const w = m.comp.widths.find((x) => x.n === m.cfg.width);

    document.getElementById("sysOutput").innerHTML = `
      ${modelSwitch(m)}

      <section class="section-block">
        <p class="section-title">${m.mdl.name} · ${w ? w.code : ""} · ${m.cfg.height} · глубина ${depth.value}</p>
        <div class="drawing-stage">${Draw.elevation(m.comp, m.g, m.cfg, m.built)}</div>
      </section>

      <section class="section-block">
        <p class="section-title">Раскрой ЛДСП</p>
        <div class="stat-row">
          ${stat("Листов", m.nested.count, "шт")}
          ${stat("Использование", Math.round(m.nested.util * 100), "%")}
          ${stat("Деталей на раскрой", m.nested.totalPieces, "шт")}
          ${stat("Площадь деталей", (m.nested.partsArea / 1e6).toFixed(2), "м²")}
        </div>
        <div class="sheet-row">${Draw.sheets(m.nested, m.g, 4)}</div>
        <p class="notes-box">Оценка по алгоритму полос с учётом пропила и направления текстуры: детали кладутся длинной стороной вдоль листа, без поворота. Реальный раскрой обычно даёт на 2–4 % лучше.</p>
      </section>
    `;

    document.getElementById("modelSwitch").addEventListener("click", (e) => {
      const btn = e.target.closest("[data-model]");
      if (!btn) return;
      state.modelId = btn.dataset.model;
      saveState();
      renderOutput();
    });
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
    const fixed = m.cat.vars.filter((v) => !v.editable);

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
