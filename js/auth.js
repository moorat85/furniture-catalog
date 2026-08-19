/* Экран-код перед каталогом: логотип + 4 точки-индикатора с мигающим
   курсором, реальное поле ввода невидимо и просто ловит цифры.
   Без кнопки — проверка происходит сразу, как только введены все цифры.

   ВАЖНО: это НЕ настоящая защита — код проверяется в браузере
   (сравнивается его SHA-256, а не сам текст), но при желании его всё
   равно можно обойти через код страницы. Годится только как барьер
   от случайных посетителей, не для конфиденциальных данных.

   Как сменить код:
   1. Придумай новый код той же длины, что и PIN_LENGTH ниже
      (или поменяй саму длину и число точек в index.html, .pin-dot).
   2. Посчитай его SHA-256, например в терминале:
      printf '%s' '1234' | shasum -a 256
      (на Windows/Linux: printf '%s' '1234' | sha256sum)
   3. Вставь получившуюся строку вместо PIN_HASH ниже. */

(() => {
  const PIN_LENGTH = 4;
  const PIN_HASH = "b553e6af4fb183a84375bf1e79a2be2768fc3c50344bff533a9baba97bd537fe";
  const SESSION_KEY = "catalog-auth-ok";

  const gate = document.getElementById("authGate");
  const app = document.getElementById("app");
  const input = document.getElementById("authInput");
  const error = document.getElementById("authError");
  const dots = Array.from(document.querySelectorAll(".pin-dot"));

  input.maxLength = PIN_LENGTH;

  async function sha256Hex(text) {
    const data = new TextEncoder().encode(text);
    const digest = await crypto.subtle.digest("SHA-256", data);
    return Array.from(new Uint8Array(digest))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  }

  function renderDots() {
    const len = input.value.length;
    dots.forEach((dot, i) => {
      dot.classList.toggle("is-filled", i < len);
      dot.classList.toggle("is-cursor", i === len);
    });
  }

  function grantAccess() {
    gate.hidden = true;
    app.hidden = false;
    window.initCatalogApp();
  }

  function shakeAndReset() {
    error.hidden = false;
    gate.classList.add("shake");
    input.value = "";
    renderDots();
    setTimeout(() => gate.classList.remove("shake"), 300);
  }

  input.addEventListener("input", async () => {
    input.value = input.value.replace(/\D/g, "").slice(0, PIN_LENGTH);
    error.hidden = true;
    renderDots();

    if (input.value.length < PIN_LENGTH) return;

    const hash = await sha256Hex(input.value);
    if (hash === PIN_HASH) {
      sessionStorage.setItem(SESSION_KEY, "1");
      grantAccess();
    } else {
      shakeAndReset();
    }
  });

  document.querySelector(".auth-card").addEventListener("click", () => input.focus());

  function boot() {
    renderDots();
    if (sessionStorage.getItem(SESSION_KEY) === "1") {
      grantAccess();
    } else {
      input.focus();
    }
  }

  if (window.initCatalogApp) {
    boot();
  } else {
    document.addEventListener("DOMContentLoaded", boot);
  }
})();
