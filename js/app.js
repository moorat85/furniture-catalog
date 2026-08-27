/* Личный каталог — рабочая база моделей.
   Хэш-роутинг: #system | #standards | #accessories | #model/<id>
   Данные: data/system.json    — параметрическая размерная система (ведущие переменные),
           data/standards.json — статические правила и образцы,
           data/models.json    — модели, ссылающиеся на стандарты. */

(() => {
  const els = {
    content: document.getElementById("content"),
    modelNavList: document.getElementById("modelNavList"),
  };

  const STORE_KEY = "catalog.system.v1";

  let system = { globals: [], limits: [], categories: [] };
  let standards = { categories: [] };
  let models = [];
  let standardIndex = {};

  /* Состояние правок: только отклонения от значений в system.json. */
  let state = { categoryId: null, overrides: { globals: {}, limits: {}, cats: {} }, configs: {} };

  /* ---------- состояние ---------- */

  function loadState() {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        state = { ...state, ...parsed, overrides: { globals: {}, limits: {}, cats: {}, ...(parsed.overrides || {}) } };
      }
    } catch (e) { /* приватный режим или заблокированное хранилище — работаем без сохранения */ }
  }

  function saveState() {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); } catch (e) { /* не критично */ }
  }

  function activeCat() {
    return system.categories.find((c) => c.id === state.categoryId) || system.categories[0];
  }

  function valuesOf(list, over) {
    const out = {};
    list.forEach((v) => { out[v.id] = over && over[v.id] !== undefined ? over[v.id] : v.value; });
    return out;
  }

  function globalsNow() { return valuesOf(system.globals, state.overrides.globals); }
  function limitsNow() { return valuesOf(system.limits, state.overrides.limits); }
  function varsNow(cat) { return valuesOf(cat.vars, state.overrides.cats[cat.id]); }

  function configNow(cat) {
    return state.configs[cat.id] || { ...cat.defaultConfig };
  }

  function model() {
    const cat = activeCat();
    const g = globalsNow();
    const l = limitsNow();
    const v = varsNow(cat);
    const comp = Engine.compute(cat, v, g, l);
    const cfg = configNow(cat);
    const built = Engine.buildParts(comp, g, cfg);
    const nested = Engine.nest(built.parts, g);
    const railHeight = Engine.railFor(comp, g, cfg.height);
    const checks = Engine.check(comp, l, { railHeight });
    return { cat, g, l, v, comp: { ...comp, railHeight }, cfg, built, nested, checks };
  }

  /* ---------- навигация ---------- */

  function buildModelNav() {
    const groups = [];
    const groupIndex = {};
    models.forEach((m) => {
      const key = m.categoryLabel || "Прочее";
      if (!(key in groupIndex)) {
        groupIndex[key] = groups.length;
        groups.push({ label: key, items: [] });
      }
      groups[groupIndex[key]].items.push(m);
    });

    els.modelNavList.innerHTML = groups
      .map(
        (g) => `
        <div class="nav-group">
          <p class="nav-section-label">${g.label}</p>
          ${g.items.map((m) => `<a href="#model/${m.id}" class="nav-model-item" data-nav="model/${m.id}">${m.name}</a>`).join("")}
        </div>`
      )
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
    /* Переменные системы тоже адресуемы из моделей. */
    const m = model();
    system.globals.concat(system.limits).forEach((v) => {
      standardIndex[v.id] = { key: v.id, label: v.label, value: (m.g[v.id] !== undefined ? m.g[v.id] : m.l[v.id]), unit: v.unit, rule: v.rule };
    });
  }

  /* ================= страница «Система размеров» ================= */

  function renderSystem() {
    const m = model();

    els.content.innerHTML = `
      <div class="page-header">
        <h1 class="page-title">Система размеров</h1>
        <p class="page-sub">Ведущие переменные слева — производные пересчитываются мгновенно, чертёж и раскрой перерисовываются на ходу. Пределы проверяют результат: если правка ломает конструктив, поле краснеет.</p>
      </div>

      <div class="sys-tabs" id="sysTabs">
        ${system.categories.map((c) => `<button class="sys-tab${c.id === m.cat.id ? " is-active" : ""}" data-cat="${c.id}">${c.name}</button>`).join("")}
      </div>

      <div class="sys-layout">
        <aside class="sys-controls" id="sysControls"></aside>
        <div class="sys-output" id="sysOutput"></div>
      </div>
    `;

    renderControls();
    renderOutput();

    document.getElementById("sysTabs").addEventListener("click", (e) => {
      const btn = e.target.closest("[data-cat]");
      if (!btn) return;
      state.categoryId = btn.dataset.cat;
      saveState();
      renderSystem();
    });
  }

  function ctrl(v, scope, current) {
    const val = current[v.id];
    const changed = val !== v.value;
    return `
      <label class="ctrl${changed ? " is-changed" : ""}" data-ctrl="${scope}:${v.id}">
        <span class="ctrl-head">
          <span class="ctrl-label">${v.label}</span>
          <span class="ctrl-val">
            <input type="number" value="${val}" min="${v.min}" max="${v.max}" step="${v.step}"
                   data-input="${scope}:${v.id}" aria-label="${v.label}">
            ${v.unit ? `<span class="ctrl-unit">${v.unit}</span>` : ""}
          </span>
        </span>
        <input type="range" value="${val}" min="${v.min}" max="${v.max}" step="${v.step}"
               data-range="${scope}:${v.id}" aria-label="${v.label}, ползунок">
        ${v.rule ? `<span class="ctrl-rule">${v.rule}</span>` : ""}
      </label>`;
  }

  function renderControls() {
    const m = model();
    const groups = {};
    system.globals.forEach((v) => {
      const gname = v.group || "Прочее";
      (groups[gname] = groups[gname] || []).push(v);
    });

    document.getElementById("sysControls").innerHTML = `
      <div class="ctrl-group">
        <p class="ctrl-group-title">Модули · ${m.cat.name}</p>
        ${m.cat.vars.map((v) => ctrl(v, "cat", m.v)).join("")}
      </div>
      ${Object.keys(groups).map((gname) => `
        <div class="ctrl-group">
          <p class="ctrl-group-title">${gname}</p>
          ${groups[gname].map((v) => ctrl(v, "glob", m.g)).join("")}
        </div>`).join("")}
      <div class="ctrl-group">
        <p class="ctrl-group-title">Пределы</p>
        ${system.limits.map((v) => ctrl(v, "lim", m.l)).join("")}
      </div>
      <div class="ctrl-actions">
        <button class="btn" id="sysReset">Сбросить к исходным</button>
        <button class="btn btn-primary" id="sysExport">Скопировать JSON</button>
      </div>
      <p class="ctrl-hint" id="sysHint"></p>
    `;

    const controls = document.getElementById("sysControls");
    controls.addEventListener("input", onControlInput);
    document.getElementById("sysReset").addEventListener("click", () => {
      state.overrides = { globals: {}, limits: {}, cats: {} };
      state.configs = {};
      saveState();
      renderSystem();
    });
    document.getElementById("sysExport").addEventListener("click", exportJson);
  }

  function onControlInput(e) {
    const key = e.target.dataset.input || e.target.dataset.range;
    if (!key) return;
    const [scope, id] = key.split(":");
    const num = Number(e.target.value);
    if (!Number.isFinite(num)) return;

    if (scope === "glob") state.overrides.globals[id] = num;
    else if (scope === "lim") state.overrides.limits[id] = num;
    else {
      const cid = activeCat().id;
      state.overrides.cats[cid] = state.overrides.cats[cid] || {};
      state.overrides.cats[cid][id] = num;
    }

    /* Синхронизируем парный контрол, не трогая тот, в котором печатают. */
    const wrap = e.target.closest(".ctrl");
    if (wrap) {
      const pair = e.target.dataset.input
        ? wrap.querySelector(`[data-range="${key}"]`)
        : wrap.querySelector(`[data-input="${key}"]`);
      if (pair) pair.value = num;
      const src = [].concat(system.globals, system.limits, activeCat().vars).find((v) => v.id === id);
      if (src) wrap.classList.toggle("is-changed", num !== src.value);
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
        () => done("Значения скопированы — вставь их в data/system.json"),
        () => done("Скопировать не удалось, значения в консоли")
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

    document.getElementById("sysOutput").innerHTML = `
      ${errors.length ? `
        <div class="alert">
          <p class="alert-title">Нарушены пределы: ${errors.length}</p>
          <ul>${errors.map(li).join("")}</ul>
        </div>` : ""}
      ${warns.length ? `
        <div class="alert alert-warn">
          <p class="alert-title">Требует решения: ${warns.length}</p>
          <ul>${warns.map(li).join("")}</ul>
          <p class="alert-note">Не ошибка конструктива: на такой высоте верхний модуль делается антресолью с полкой, а штанга уходит ниже.</p>
        </div>` : ""}

      <section class="section-block">
        <p class="section-title">Чертёж · ${m.cfg.width ? "X" + m.cfg.width : ""} · ${m.cfg.height} · глубина ${m.comp.depths.find((d) => d.id === m.cfg.depth).value}</p>
        <div class="drawing-stage">${Draw.elevation(m.comp, m.g, m.cfg, m.built)}</div>
        ${renderConfigBar(m)}
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
          h.code,
          `${m.comp.stepH} × ${h.n}${h.half ? " + " + m.comp.halfStep : ""} + ${m.g.panel}`,
          h.corpus, h.total, h.use || "",
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
          d.value, d.label, d.clear,
          d.hangerOk ? "проходит" : "не проходит",
          d.strips, d.waste,
        ]))}
      </section>

      <section class="section-block">
        <p class="section-title">Детали конфигурации</p>
        ${tbl(["Деталь", "Размер", "Кол-во", "Материал"], m.built.parts.map((p) => [
          p.name, `${p.w} × ${p.h}`, p.qty, p.material,
        ]))}
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
        <p class="notes-box">Оценка по алгоритму полос с учётом пропила и направления текстуры: детали кладутся длинной стороной вдоль листа, без поворота. Реальный раскрой в специализированной программе обычно даёт на 2–4 % лучше.</p>
      </section>
    `;

    document.getElementById("sysOutput").addEventListener("input", onConfigInput);
    document.getElementById("sysOutput").addEventListener("change", onConfigInput);
  }

  function chk(checks, id) {
    const c = checks.find((x) => x.id === id);
    return c ? c.ok : true;
  }

  function derivedCard(label, value, formula, ok) {
    const bad = ok === false;
    return `
      <div class="derived${bad ? " is-bad" : ""}">
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

  function renderConfigBar(m) {
    const d = m.comp.depths;
    return `
      <div class="config-bar">
        <label class="cfg">
          <span>Ширина</span>
          <select data-cfg="width">
            ${m.comp.widths.map((w) => `<option value="${w.n}"${w.n === m.cfg.width ? " selected" : ""}>${w.code} · ${w.corpus}</option>`).join("")}
          </select>
        </label>
        <label class="cfg">
          <span>Высота</span>
          <select data-cfg="height">
            ${m.comp.heights.map((h) => `<option value="${h.code}"${h.code === m.cfg.height ? " selected" : ""}>${h.code} · ${h.total}</option>`).join("")}
          </select>
        </label>
        <label class="cfg">
          <span>Глубина</span>
          <select data-cfg="depth">
            ${d.map((x) => `<option value="${x.id}"${x.id === m.cfg.depth ? " selected" : ""}>${x.value} · ${x.label}</option>`).join("")}
          </select>
        </label>
        <label class="cfg">
          <span>Полок в секции</span>
          <input type="number" min="0" max="12" step="1" value="${m.cfg.shelvesPerBay}" data-cfg="shelvesPerBay">
        </label>
        <label class="cfg">
          <span>Ящиков</span>
          <input type="number" min="0" max="12" step="1" value="${m.cfg.drawers}" data-cfg="drawers">
        </label>
      </div>`;
  }

  function onConfigInput(e) {
    const key = e.target.dataset.cfg;
    if (!key) return;
    const cat = activeCat();
    const cfg = { ...configNow(cat) };
    cfg[key] = key === "height" || key === "depth" ? e.target.value : Number(e.target.value);
    state.configs[cat.id] = cfg;
    saveState();
    renderOutput();
  }

  /* ================= страница «Стандарты» ================= */

  function renderStandards() {
    const m = model();

    els.content.innerHTML = `
      <div class="page-header">
        <h1 class="page-title">Стандарты и правила</h1>
        <p class="page-sub">Свод, собранный из действующих переменных размерной системы. Числа здесь не хранятся — они считаются, поэтому расходиться с системой не могут. Чтобы поменять, иди в <a class="link" href="#system">Систему размеров</a>.</p>
      </div>

      ${renderCategory(standards.categories.find((c) => c.id === "general"))}

      <section class="standards-category" id="cat-grid">
        <h2>Модульная сетка · ${m.cat.name}</h2>
        <p class="category-intro">Габарит по ширине считается по формуле и не принимает промежуточных значений. Панель ${m.g.panel} мм, чистый отсек ${m.comp.clearW} мм.</p>
        <p class="formula">L = ${m.comp.stepW} × n + ${m.g.panel}</p>
        ${tbl(["Код", "Модулей", "Габарит", "Номинал"], m.comp.widths.map((w) => [w.code, w.n, w.corpus, w.nominal]))}
      </section>

      <section class="standards-category" id="cat-heights">
        <h2>Высоты корпуса</h2>
        <p class="category-intro">Вертикальный модуль ${m.comp.stepH} мм, цоколь ${m.comp.plinth} мм в сетку не входит и прибавляется в конце.</p>
        ${tbl(["Код", "Формула", "Корпус", "С цоколем", "Назначение"], m.comp.heights.map((h) => [
          h.code, `${m.comp.stepH} × ${h.n}${h.half ? " + " + m.comp.halfStep : ""} + ${m.g.panel}`, h.corpus, h.total, h.use || "",
        ]))}
      </section>

      <section class="standards-category" id="cat-depth">
        <h2>Глубина</h2>
        <p class="category-intro">Две глубины: гардеробная держит плечики, неглубокая закрывает полки и открытое хранение. Обе проверены по ширине листа ${m.g.sheetW} мм.</p>
        ${tbl(["Глубина", "Роль", "Чистая", "Плечики", "Полос из листа", "Отход"], m.comp.depths.map((d) => [
          d.value, d.label, d.clear, d.hangerOk ? "проходит" : "не проходит", d.strips, d.waste,
        ]))}
      </section>

      <section class="standards-category" id="cat-limits">
        <h2>Пределы</h2>
        <p class="category-intro">Нормативы, по которым система проверяет сама себя. Не производные и не ручки настройки — граница, за которой конструктив перестаёт работать.</p>
        ${tbl(["Предел", "Значение", "Сейчас", "Статус"], m.checks.map((c) => [
          c.label, `${c.dir === "max" ? "≤" : "≥"} ${c.limit}`, c.actual, c.ok ? "в норме" : "нарушен",
        ]))}
      </section>

      ${renderCategory(standards.categories.find((c) => c.id === "exceptions"))}
      ${renderCategory(standards.categories.find((c) => c.id === "materials"))}
    `;
  }

  function renderCategory(cat) {
    if (!cat || cat.visible === false) return "";
    const body =
      cat.type === "swatches" ? renderSwatches(cat)
      : cat.type === "rules" ? renderRules(cat)
      : "";
    return `
        <section class="standards-category" id="cat-${cat.id}">
          <h2>${cat.name}</h2>
          ${cat.intro ? `<p class="category-intro">${cat.intro}</p>` : ""}
          ${body}
          ${cat.params && cat.params.length ? renderParamsTable(cat.params) : ""}
        </section>`;
  }

  function renderParamsTable(params) {
    return `
          <div class="params-table">
            <div class="params-row params-head">
              <div class="params-col">Параметр</div>
              <div class="params-col">Значение</div>
              <div class="params-col params-col-rule">Правило</div>
            </div>
            ${params.map((p) => `
              <div class="params-row" id="param-${p.key}">
                <div class="params-col label">${p.label}<div class="key">${p.key}</div></div>
                <div class="params-col val">${p.value}${p.unit ? " " + p.unit : ""}</div>
                <div class="params-col params-col-rule rule">${p.rule || ""}</div>
              </div>`).join("")}
          </div>`;
  }

  function renderRules(cat) {
    return `
          <div class="rules-grid">
            ${(cat.rules || []).map((r, i) => `
              <div class="rule-card">
                <span class="rule-num">${String(i + 1).padStart(2, "0")}</span>
                <p class="rule-title">${r.title}</p>
                <p class="rule-text">${r.text}</p>
              </div>`).join("")}
          </div>`;
  }

  function renderSwatches(cat) {
    return `
          <div class="swatch-row">
            ${(cat.swatches || []).map((s) => `
              <div class="swatch">
                <span class="swatch-circle${s.bordered ? " bordered" : ""}" style="${s.image ? `background-image:url('${s.image}')` : `background-color:${s.color}`}"></span>
                <span class="swatch-text">
                  <span class="swatch-label">${s.label}</span>
                  ${s.desc ? `<span class="swatch-desc">${s.desc}</span>` : ""}
                </span>
              </div>`).join("")}
          </div>`;
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
        location.hash = "standards";
        requestAnimationFrame(() => {
          const row = document.getElementById(`param-${btn.dataset.gotoStandard}`);
          if (row) {
            row.scrollIntoView({ behavior: "smooth", block: "center" });
            row.style.background = "var(--blue-soft)";
            setTimeout(() => (row.style.background = ""), 1200);
          }
        });
      });
    });
  }

  function renderAccessories() {
    els.content.innerHTML = `
      <div class="page-header">
        <h1 class="page-title">Фурнитура</h1>
        <p class="page-sub">Раздел пока пустой — наполним, когда появятся данные.</p>
      </div>`;
  }

  /* ---------- роутинг ---------- */

  function route() {
    const hash = (location.hash || "#system").slice(1);
    setActiveNav(hash);
    if (hash.startsWith("model/")) renderModel(hash.slice("model/".length));
    else if (hash === "accessories") renderAccessories();
    else if (hash === "standards") renderStandards();
    else renderSystem();
    window.scrollTo(0, 0);
  }

  async function init() {
    const [sysRes, standardsRes, modelsRes] = await Promise.all([
      fetch("data/system.json"),
      fetch("data/standards.json"),
      fetch("data/models.json"),
    ]);
    system = await sysRes.json();
    standards = await standardsRes.json();
    models = await modelsRes.json();

    loadState();
    if (!state.categoryId || !system.categories.some((c) => c.id === state.categoryId)) {
      const act = system.categories.find((c) => c.active) || system.categories[0];
      state.categoryId = act.id;
    }

    buildStandardIndex();
    buildModelNav();
    window.addEventListener("hashchange", route);
    route();
  }

  init();
})();
