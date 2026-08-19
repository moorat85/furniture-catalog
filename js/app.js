/* Личный каталог — рабочая база моделей.
   Хэш-роутинг: #standards | #model/<id>
   Данные: data/standards.json (справочник параметров и правил),
           data/models.json (модели, ссылающиеся на стандарты). */

(() => {
  const els = {
    content: document.getElementById("content"),
    modelNavList: document.getElementById("modelNavList"),
  };

  let standards = { categories: [] };
  let models = [];
  let standardIndex = {}; // key -> { param, categoryName }

  function buildStandardIndex() {
    standardIndex = {};
    standards.categories.forEach((cat) => {
      cat.params.forEach((p) => {
        standardIndex[p.key] = { ...p, categoryName: cat.name, categoryId: cat.id };
      });
    });
  }

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
          ${g.items
            .map(
              (m) => `
            <a href="#model/${m.id}" class="nav-model-item" data-nav="model/${m.id}">${m.name}</a>`
            )
            .join("")}
        </div>`
      )
      .join("");
  }

  function setActiveNav(hash) {
    document.querySelectorAll(".nav-item, .nav-model-item").forEach((el) => {
      el.classList.toggle("is-active", el.dataset.nav === hash);
    });
  }

  function renderStandards() {
    els.content.innerHTML = `
      <div class="page-header">
        <h1 class="page-title">Стандарты и правила</h1>
        <p class="page-sub">Единые параметры и правила, на которые опираются все модели каталога. Пока редактируется прямо в <code>data/standards.json</code> — в будущем здесь будет редактируемая страница с автоматическим пересчётом связанных моделей.</p>
      </div>
      ${standards.categories
        .map(
          (cat) => `
        <section class="standards-category" id="cat-${cat.id}">
          <h2>${cat.name}</h2>
          <table class="params-table">
            <thead>
              <tr><th>Параметр</th><th>Значение</th><th>Комментарий</th></tr>
            </thead>
            <tbody>
              ${cat.params
                .map(
                  (p) => `
                <tr id="param-${p.key}">
                  <td>${p.label}<div class="key">${p.key}</div></td>
                  <td class="val">${p.value}${p.unit ? " " + p.unit : ""}</td>
                  <td class="rule">${p.rule || "—"}</td>
                </tr>`
                )
                .join("")}
            </tbody>
          </table>
        </section>`
        )
        .join("")}
    `;
  }

  function pluralRu(n) {
    const mod10 = n % 10;
    const mod100 = n % 100;
    if (mod10 === 1 && mod100 !== 11) return "";
    if ([2, 3, 4].includes(mod10) && ![12, 13, 14].includes(mod100)) return "а";
    return "ов";
  }

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
          ${(m.drawings || [])
            .map((d) => `<div class="drawing-card">${d.label}</div>`)
            .join("")}
        </div>
      </section>

      <section class="section-block">
        <p class="section-title">Спецификация</p>
        <table class="spec-table">
          ${(m.specs || [])
            .map((s) => `<tr><td>${s.label}</td><td>${s.value}${s.unit ? " " + s.unit : ""}</td></tr>`)
            .join("")}
        </table>
      </section>

      ${
        linked
          ? `<section class="section-block">
              <p class="section-title">Связанные стандарты</p>
              <div class="linked-standards">${linked}</div>
            </section>`
          : ""
      }

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

  function route() {
    const hash = (location.hash || "#standards").slice(1);
    setActiveNav(hash);
    if (hash.startsWith("model/")) {
      renderModel(hash.slice("model/".length));
    } else {
      renderStandards();
    }
    window.scrollTo(0, 0);
  }

  async function init() {
    const [standardsRes, modelsRes] = await Promise.all([
      fetch("data/standards.json"),
      fetch("data/models.json"),
    ]);
    standards = await standardsRes.json();
    models = await modelsRes.json();
    buildStandardIndex();
    buildModelNav();
    window.addEventListener("hashchange", route);
    route();
  }

  init();
})();
