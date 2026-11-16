/**
 * ============================================================================
 * НАСТРОЙКИ ПРИЛОЖЕНИЯ И БЕЗОПАСНОСТИ
 * ============================================================================
 * 
 * КАК СГЕНЕРИРОВАТЬ SHA-256 ХЕШ ДЛЯ СВОЕГО ПАРОЛЯ:
 * Способ 1 (прямо в браузере на этом сайте):
 *   Откройте консоль разработчика (F12 -> Console) и выполните команду:
 *   await generatePasswordHash("ваш_новый_пароль")
 *   Скопируйте полученную строку и вставьте её в PASSWORD_HASH ниже.
 * 
 * Способ 2 (в одну строку в любой вкладке браузера F12):
 *   Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode('ваш_пароль')))).map(b => b.toString(16).padStart(2, '0')).join('')
 * 
 * По умолчанию установлен пароль: 1234
 */

const REQUIRE_PASSWORD = true; // Установите false, чтобы отключить запрос пароля при входе

const CONFIG = {
  // SHA-256 хеш пароля "1234"
  PASSWORD_HASH: "03ac674216f3e15c761ee1a5e255f067953623c8b388b4459e13f978d7c846f4",

  // Пороги цен в коэнах для автоматического определения категории бюджета
  PRICE_THRESHOLDS: {
    cheapMax: 300000,   // До 300 000 — Дешёвые
    mediumMax: 500000   // 300 000 – 500 000 — Средние, свыше 500 000 — Дорогие
  },

  STORAGE_KEYS: {
    AUTH_SESSION: "abi_auth_unlocked",
    THEME: "abi_theme",
    LOCAL_DATA: "abi_local_db_v1"
  }
};

// Состояние приложения
const state = {
  builds: [],
  gear: [],
  editorMode: false,
  hasLocalChanges: false,
  filters: {
    search: "",
    budget: "all",
    effClass: "all",
    zone: "all",
    gearType: "all"
  }
};

// ============================================================================
// УТИЛИТЫ И КРИПТОГРАФИЯ
// ============================================================================

async function sha256(text) {
  const msgBuffer = new TextEncoder().encode(text);
  const hashBuffer = await crypto.subtle.digest("SHA-256", msgBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, "0")).join("");
}

// Глобальная функция для удобной генерации хеша через консоль (F12)
window.generatePasswordHash = async function(plainPassword) {
  const hash = await sha256(plainPassword);
  console.log(`Пароль: "${plainPassword}"\nSHA-256 Хеш: ${hash}`);
  return hash;
};

function formatKoens(num) {
  return Number(num || 0).toLocaleString("ru-RU") + " ₭";
}

function escapeHtml(str) {
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function getBudgetCategory(price, manualOverride = "auto") {
  if (manualOverride && manualOverride !== "auto") {
    return manualOverride;
  }
  const numPrice = Number(price) || 0;
  if (numPrice <= CONFIG.PRICE_THRESHOLDS.cheapMax) return "cheap";
  if (numPrice <= CONFIG.PRICE_THRESHOLDS.mediumMax) return "medium";
  return "expensive";
}

function showToast(message) {
  const container = document.getElementById("toast-container");
  const toast = document.createElement("div");
  toast.className = "toast";
  toast.textContent = message;
  container.appendChild(toast);

  setTimeout(() => {
    toast.remove();
  }, 2800);
}

// ============================================================================
// АВТОРИЗАЦИЯ И ТЕМЫ
// ============================================================================

function initTheme() {
  const savedTheme = localStorage.getItem(CONFIG.STORAGE_KEYS.THEME) || "amber";
  document.documentElement.setAttribute("data-theme", savedTheme);
  const select = document.getElementById("theme-select");
  if (select) {
    select.value = savedTheme;
    select.addEventListener("change", (e) => {
      const newTheme = e.target.value;
      document.documentElement.setAttribute("data-theme", newTheme);
      localStorage.setItem(CONFIG.STORAGE_KEYS.THEME, newTheme);
    });
  }
}

function initAuth() {
  const overlay = document.getElementById("auth-overlay");
  const appWrapper = document.getElementById("app-wrapper");
  const authForm = document.getElementById("auth-form");
  const passInput = document.getElementById("auth-password");
  const errorMsg = document.getElementById("auth-error");

  const unlockApp = () => {
    overlay.classList.add("hidden");
    appWrapper.classList.remove("hidden");
    loadDatabase();
  };

  if (!REQUIRE_PASSWORD || sessionStorage.getItem(CONFIG.STORAGE_KEYS.AUTH_SESSION) === "true") {
    unlockApp();
    return;
  }

  authForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const enteredHash = await sha256(passInput.value.trim());
    if (enteredHash === CONFIG.PASSWORD_HASH.toLowerCase()) {
      sessionStorage.setItem(CONFIG.STORAGE_KEYS.AUTH_SESSION, "true");
      errorMsg.classList.add("hidden");
      unlockApp();
    } else {
      errorMsg.classList.remove("hidden");
      passInput.value = "";
      passInput.focus();
    }
  });
}

// ============================================================================
// ЗАГРУЗКА И СОХРАНЕНИЕ ДАННЫХ (builds.json + localStorage)
// ============================================================================

async function loadDatabase() {
  updateFilterThresholdLabels();

  const localRaw = localStorage.getItem(CONFIG.STORAGE_KEYS.LOCAL_DATA);
  if (localRaw) {
    try {
      const parsed = JSON.parse(localRaw);
      applyDataToState(parsed, true);
      renderAll();
      return;
    } catch (e) {
      console.error("Ошибка чтения localStorage, загружаем builds.json", e);
    }
  }

  await fetchFromServerJson();
}

async function fetchFromServerJson() {
  try {
    const response = await fetch(`builds.json?t=${Date.now()}`);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    applyDataToState(data, false);
  } catch (err) {
    console.warn("Не удалось загрузить builds.json:", err);
    showToast("Внимание: builds.json недоступен, открыта пустая база");
    applyDataToState({ builds: [], gear: [] }, false);
  }
  renderAll();
}

function applyDataToState(data, isFromLocal) {
  if (Array.isArray(data)) {
    state.builds = data;
    state.gear = [];
  } else {
    state.builds = Array.isArray(data.builds) ? data.builds : [];
    state.gear = Array.isArray(data.gear) ? data.gear : [];
  }
  state.hasLocalChanges = isFromLocal;
  updateStorageStatusUI();
}

function saveToLocalStorage() {
  const payload = {
    updatedAt: new Date().toISOString(),
    builds: state.builds,
    gear: state.gear
  };
  localStorage.setItem(CONFIG.STORAGE_KEYS.LOCAL_DATA, JSON.stringify(payload));
  state.hasLocalChanges = true;
  updateStorageStatusUI();
}

function updateStorageStatusUI() {
  const statusEl = document.getElementById("storage-status");
  if (!statusEl) return;
  if (state.hasLocalChanges) {
    statusEl.textContent = "Локальные изменения сохранены в браузере (скачайте builds.json для GitHub)";
    statusEl.classList.add("modified");
  } else {
    statusEl.textContent = "Данные синхронизированы с серверным builds.json";
    statusEl.classList.remove("modified");
  }
}

function updateFilterThresholdLabels() {
  const cheapFmt = (CONFIG.PRICE_THRESHOLDS.cheapMax / 1000).toFixed(0) + " 000";
  const medFmt = (CONFIG.PRICE_THRESHOLDS.mediumMax / 1000).toFixed(0) + " 000";

  document.getElementById("pill-cheap-label").textContent = `Дешёвые (до ${cheapFmt})`;
  document.getElementById("pill-medium-label").textContent = `Средние (${cheapFmt} – ${medFmt})`;
  document.getElementById("pill-expensive-label").textContent = `Дорогие (от ${medFmt}+)`;
}

// ============================================================================
// ОТРИСОВКА СБОРОК И СНАРЯЖЕНИЯ
// ============================================================================

const BADGE_MAP = {
  budget: {
    cheap: { text: "Дешёвая", cls: "badge-green" },
    medium: { text: "Средняя", cls: "badge-yellow" },
    expensive: { text: "Дорогая", cls: "badge-red" }
  },
  effClass: {
    min: { text: "Минималка", cls: "badge-white" },
    mid: { text: "Середняк", cls: "badge-yellow" },
    meta: { text: "Мета", cls: "badge-green" }
  },
  zone: {
    white: { text: "Белая (Обычка)", cls: "badge-white" },
    yellow: { text: "Жёлтая (Блокада)", cls: "badge-yellow" },
    red: { text: "Красная (Запретка)", cls: "badge-red" }
  },
  gearStatus: {
    green: { text: "Топ / Мета", cls: "badge-green" },
    yellow: { text: "Рабочий вариант", cls: "badge-yellow" },
    red: { text: "Ситуативно / Дорого", cls: "badge-red" }
  }
};

function renderAll() {
  renderBuilds();
  renderGear();
}

function renderBuilds() {
  const grid = document.getElementById("builds-grid");
  const countEl = document.getElementById("builds-count");
  const query = state.filters.search.toLowerCase().trim();

  const filtered = state.builds.filter((b) => {
    const resolvedBudget = getBudgetCategory(b.price, b.budgetMode);

    if (state.filters.budget !== "all" && resolvedBudget !== state.filters.budget) return false;
    if (state.filters.effClass !== "all" && b.effClass !== state.filters.effClass) return false;
    if (state.filters.zone !== "all" && b.zone !== state.filters.zone) return false;

    if (query) {
      const haystack = `${b.weapon} ${b.caliber} ${b.ammo} ${b.notes || ""}`.toLowerCase();
      if (!haystack.includes(query)) return false;
    }
    return true;
  });

  countEl.textContent = filtered.length;

  if (filtered.length === 0) {
    grid.innerHTML = `<div class="empty-state">Сборки по заданным критериям не найдены. Попробуйте сбросить фильтры.</div>`;
    return;
  }

  grid.innerHTML = filtered.map((b) => {
    const resolvedBudget = getBudgetCategory(b.price, b.budgetMode);
    const budgetBadge = BADGE_MAP.budget[resolvedBudget] || BADGE_MAP.budget.medium;
    const classBadge = BADGE_MAP.effClass[b.effClass] || BADGE_MAP.effClass.mid;
    const zoneBadge = BADGE_MAP.zone[b.zone] || BADGE_MAP.zone.yellow;

    const adminControls = state.editorMode ? `
      <div class="card-admin-actions">
        <button class="btn btn-secondary btn-sm" data-action="edit-build" data-id="${escapeHtml(b.id)}">Редактировать</button>
        <button class="btn btn-secondary btn-sm" data-action="dup-build" data-id="${escapeHtml(b.id)}">Дублировать</button>
        <button class="btn btn-danger-outline btn-sm" data-action="del-build" data-id="${escapeHtml(b.id)}">Удалить</button>
      </div>
    ` : "";

    return `
      <article class="build-card">
        <div class="card-top">
          <div class="weapon-heading">
            <h3 class="weapon-name">${escapeHtml(b.weapon)}</h3>
            <span class="weapon-caliber">${escapeHtml(b.caliber)}</span>
          </div>
          <div class="weapon-price">${formatKoens(b.price)}</div>
        </div>

        <div class="badges-row">
          <span class="badge ${budgetBadge.cls}">Бюджет: ${budgetBadge.text}</span>
          <span class="badge ${classBadge.cls}">Класс: ${classBadge.text}</span>
          <span class="badge ${zoneBadge.cls}">${zoneBadge.text}</span>
        </div>

        <div class="card-info">
          <div class="info-line">
            <span class="info-label">Патроны:</span>
            <span class="info-value">${escapeHtml(b.ammo)}</span>
          </div>
          ${b.notes ? `<div class="build-note">${escapeHtml(b.notes)}</div>` : ""}
        </div>

        <div class="share-code-box">
          <span class="share-code-text" title="${escapeHtml(b.code)}">${escapeHtml(b.code)}</span>
          <button class="btn btn-primary btn-sm" data-action="copy-code" data-code="${escapeHtml(b.code)}">Скопировать код</button>
        </div>

        ${adminControls}
      </article>
    `;
  }).join("");
}

function renderGear() {
  const grid = document.getElementById("gear-grid");
  const filtered = state.gear.filter((g) => {
    if (state.filters.gearType !== "all" && g.type !== state.filters.gearType) return false;
    return true;
  });

  if (filtered.length === 0) {
    grid.innerHTML = `<div class="empty-state">Записей о снаряжении пока нет.</div>`;
    return;
  }

  grid.innerHTML = filtered.map((g) => {
    const statusBadge = BADGE_MAP.gearStatus[g.status] || BADGE_MAP.gearStatus.green;
    const typeLabel = g.type === "helmet" ? "Шлем" : "Броня / Разгрузка";

    const adminControls = state.editorMode ? `
      <div class="card-admin-actions">
        <button class="btn btn-secondary btn-sm" data-action="edit-gear" data-id="${escapeHtml(g.id)}">Редактировать</button>
        <button class="btn btn-danger-outline btn-sm" data-action="del-gear" data-id="${escapeHtml(g.id)}">Удалить</button>
      </div>
    ` : "";

    return `
      <article class="gear-card">
        <div class="gear-header">
          <div>
            <h3 class="gear-title">${escapeHtml(g.name)}</h3>
          </div>
          <span class="gear-price">${escapeHtml(g.price)}</span>
        </div>

        <div class="badges-row">
          <span class="badge badge-white">${typeLabel}</span>
          <span class="badge badge-yellow">${escapeHtml(g.tier)}</span>
          <span class="badge ${statusBadge.cls}">${statusBadge.text}</span>
        </div>

        <div class="build-note">${escapeHtml(g.notes)}</div>
        ${adminControls}
      </article>
    `;
  }).join("");
}

// ============================================================================
// ОБРАБОТЧИКИ СОБЫТИЙ И МОДАЛЬНЫХ ОКОН
// ============================================================================

function initEvents() {
  // Переключение вкладок
  document.querySelectorAll(".nav-tab").forEach((tab) => {
    tab.addEventListener("click", () => {
      document.querySelectorAll(".nav-tab").forEach(t => t.classList.remove("active"));
      tab.classList.add("active");

      const target = tab.dataset.tab;
      document.getElementById("tab-builds").classList.toggle("hidden", target !== "builds");
      document.getElementById("tab-gear").classList.toggle("hidden", target !== "gear");
    });
  });

  // Переключение режима редактора
  const editorBtn = document.getElementById("toggle-editor-btn");
  const editorToolbar = document.getElementById("editor-toolbar");
  editorBtn.addEventListener("click", () => {
    state.editorMode = !state.editorMode;
    editorBtn.classList.toggle("active", state.editorMode);
    editorToolbar.classList.toggle("hidden", !state.editorMode);
    renderAll();
  });

  // Живой поиск
  const searchInput = document.getElementById("search-input");
  searchInput.addEventListener("input", (e) => {
    state.filters.search = e.target.value;
    renderBuilds();
  });

  // Мульти-фильтры
  setupPillFilter("filter-budget", "budget", renderBuilds);
  setupPillFilter("filter-class", "effClass", renderBuilds);
  setupPillFilter("filter-zone", "zone", renderBuilds);
  setupPillFilter("filter-gear-type", "gearType", renderGear);

  // Сброс фильтров
  document.getElementById("reset-filters-btn").addEventListener("click", () => {
    state.filters.search = "";
    state.filters.budget = "all";
    state.filters.effClass = "all";
    state.filters.zone = "all";
    searchInput.value = "";

    ["filter-budget", "filter-class", "filter-zone"].forEach(id => {
      const container = document.getElementById(id);
      container.querySelectorAll(".pill").forEach(p => {
        p.classList.toggle("active", p.dataset.value === "all");
      });
    });
    renderBuilds();
  });

  // Делегирование кликов по карточкам сборок
  document.getElementById("builds-grid").addEventListener("click", async (e) => {
    const btn = e.target.closest("button[data-action]");
    if (!btn) return;

    const action = btn.dataset.action;
    const id = btn.dataset.id;

    if (action === "copy-code") {
      const code = btn.dataset.code;
      try {
        await navigator.clipboard.writeText(code);
        showToast("Код сборки скопирован в буфер обмена!");
      } catch {
        showToast("Скопируйте код вручную: " + code);
      }
    } else if (action === "edit-build") {
      openBuildModal(id);
    } else if (action === "dup-build") {
      duplicateBuild(id);
    } else if (action === "del-build") {
      deleteBuild(id);
    }
  });

  // Делегирование кликов по карточкам снаряжения
  document.getElementById("gear-grid").addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-action]");
    if (!btn) return;
    const action = btn.dataset.action;
    const id = btn.dataset.id;

    if (action === "edit-gear") {
      openGearModal(id);
    } else if (action === "del-gear") {
      deleteGear(id);
    }
  });

  // Кнопки панели редактора
  document.getElementById("add-build-btn").addEventListener("click", () => openBuildModal(null));
  document.getElementById("add-gear-btn").addEventListener("click", () => openGearModal(null));
  document.getElementById("export-json-btn").addEventListener("click", exportBuildsJson);
  document.getElementById("import-json-input").addEventListener("change", importBuildsJson);
  document.getElementById("reset-local-btn").addEventListener("click", async () => {
    if (confirm("Сбросить локальные изменения в браузере и загрузить исходный builds.json с сайта?")) {
      localStorage.removeItem(CONFIG.STORAGE_KEYS.LOCAL_DATA);
      await fetchFromServerJson();
      showToast("Кэш сброшен, загружен серверный builds.json");
    }
  });

  // Закрытие и сохранение модалки сборки
  document.getElementById("close-build-modal").addEventListener("click", closeBuildModal);
  document.getElementById("cancel-build-modal").addEventListener("click", closeBuildModal);
  document.getElementById("build-form").addEventListener("submit", saveBuildForm);

  // Закрытие и сохранение модалки снаряжения
  document.getElementById("close-gear-modal").addEventListener("click", closeGearModal);
  document.getElementById("cancel-gear-modal").addEventListener("click", closeGearModal);
  document.getElementById("gear-form").addEventListener("submit", saveGearForm);
}

function setupPillFilter(containerId, filterKey, callback) {
  const container = document.getElementById(containerId);
  container.addEventListener("click", (e) => {
    const pill = e.target.closest(".pill");
    if (!pill) return;
    container.querySelectorAll(".pill").forEach(p => p.classList.remove("active"));
    pill.classList.add("active");
    state.filters[filterKey] = pill.dataset.value;
    callback();
  });
}

// ============================================================================
// CRUD ОПЕРАЦИИ: СБОРКИ И СНАРЯЖЕНИЕ
// ============================================================================

function openBuildModal(buildId = null) {
  const modal = document.getElementById("build-modal");
  const title = document.getElementById("build-modal-title");
  const form = document.getElementById("build-form");
  form.reset();

  if (buildId) {
    const item = state.builds.find(b => b.id === buildId);
    if (!item) return;
    title.textContent = "РЕДАКТИРОВАТЬ СБОРКУ";
    document.getElementById("build-id").value = item.id;
    document.getElementById("build-weapon").value = item.weapon;
    document.getElementById("build-caliber").value = item.caliber;
    document.getElementById("build-price").value = item.price;
    document.getElementById("build-budget-mode").value = item.budgetMode || "auto";
    document.getElementById("build-class").value = item.effClass;
    document.getElementById("build-zone").value = item.zone;
    document.getElementById("build-ammo").value = item.ammo;
    document.getElementById("build-code").value = item.code;
    document.getElementById("build-notes").value = item.notes || "";
  } else {
    title.textContent = "ДОБАВИТЬ СБОРКУ";
    document.getElementById("build-id").value = "";
    document.getElementById("build-budget-mode").value = "auto";
  }

  modal.classList.remove("hidden");
}

function closeBuildModal() {
  document.getElementById("build-modal").classList.add("hidden");
}

function saveBuildForm(e) {
  e.preventDefault();
  const id = document.getElementById("build-id").value || ("b_" + Date.now());
  const newBuild = {
    id,
    weapon: document.getElementById("build-weapon").value.trim(),
    caliber: document.getElementById("build-caliber").value.trim(),
    price: Number(document.getElementById("build-price").value) || 0,
    budgetMode: document.getElementById("build-budget-mode").value,
    effClass: document.getElementById("build-class").value,
    zone: document.getElementById("build-zone").value,
    ammo: document.getElementById("build-ammo").value.trim(),
    code: document.getElementById("build-code").value.trim(),
    notes: document.getElementById("build-notes").value.trim()
  };

  const existingIdx = state.builds.findIndex(b => b.id === id);
  if (existingIdx >= 0) {
    state.builds[existingIdx] = newBuild;
    showToast("Сборка обновлена");
  } else {
    state.builds.unshift(newBuild);
    showToast("Новая сборка добавлена");
  }

  saveToLocalStorage();
  renderBuilds();
  closeBuildModal();
}

function duplicateBuild(id) {
  const orig = state.builds.find(b => b.id === id);
  if (!orig) return;
  const copy = {
    ...orig,
    id: "b_" + Date.now(),
    weapon: orig.weapon + " (Копия)"
  };
  state.builds.unshift(copy);
  saveToLocalStorage();
  renderBuilds();
  showToast("Сборка продублирована");
}

function deleteBuild(id) {
  const item = state.builds.find(b => b.id === id);
  if (!item) return;
  if (!confirm(`Удалить сборку «${item.weapon}»?`)) return;
  state.builds = state.builds.filter(b => b.id !== id);
  saveToLocalStorage();
  renderBuilds();
  showToast("Сборка удалена");
}

// Снаряжение
function openGearModal(gearId = null) {
  const modal = document.getElementById("gear-modal");
  const title = document.getElementById("gear-modal-title");
  const form = document.getElementById("gear-form");
  form.reset();

  if (gearId) {
    const item = state.gear.find(g => g.id === gearId);
    if (!item) return;
    title.textContent = "РЕДАКТИРОВАТЬ СНАРЯЖЕНИЕ";
    document.getElementById("gear-id").value = item.id;
    document.getElementById("gear-name").value = item.name;
    document.getElementById("gear-type").value = item.type;
    document.getElementById("gear-tier").value = item.tier;
    document.getElementById("gear-price").value = item.price;
    document.getElementById("gear-status").value = item.status;
    document.getElementById("gear-notes").value = item.notes;
  } else {
    title.textContent = "ДОБАВИТЬ СНАРЯЖЕНИЕ";
    document.getElementById("gear-id").value = "";
  }

  modal.classList.remove("hidden");
}

function closeGearModal() {
  document.getElementById("gear-modal").classList.add("hidden");
}

function saveGearForm(e) {
  e.preventDefault();
  const id = document.getElementById("gear-id").value || ("g_" + Date.now());
  const newGear = {
    id,
    name: document.getElementById("gear-name").value.trim(),
    type: document.getElementById("gear-type").value,
    tier: document.getElementById("gear-tier").value,
    price: document.getElementById("gear-price").value.trim(),
    status: document.getElementById("gear-status").value,
    notes: document.getElementById("gear-notes").value.trim()
  };

  const existingIdx = state.gear.findIndex(g => g.id === id);
  if (existingIdx >= 0) {
    state.gear[existingIdx] = newGear;
    showToast("Позиция снаряжения обновлена");
  } else {
    state.gear.unshift(newGear);
    showToast("Снаряжение добавлено в шпаргалку");
  }

  saveToLocalStorage();
  renderGear();
  closeGearModal();
}

function deleteGear(id) {
  const item = state.gear.find(g => g.id === id);
  if (!item) return;
  if (!confirm(`Удалить «${item.name}» из шпаргалки?`)) return;
  state.gear = state.gear.filter(g => g.id !== id);
  saveToLocalStorage();
  renderGear();
  showToast("Позиция удалена");
}

// ============================================================================
// ИМПОРТ И ЭКСПОРТ BUILDS.JSON
// ============================================================================

function exportBuildsJson() {
  const exportData = {
    updatedAt: new Date().toISOString(),
    builds: state.builds,
    gear: state.gear
  };
  const jsonString = JSON.stringify(exportData, null, 2);
  const blob = new Blob([jsonString], { type: "application/json" });
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = "builds.json";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);

  showToast("Файл builds.json скачан!");
}

function importBuildsJson(e) {
  const file = e.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = (event) => {
    try {
      const parsed = JSON.parse(event.target.result);
      applyDataToState(parsed, true);
      saveToLocalStorage();
      renderAll();
      showToast("База builds.json успешно загружена!");
    } catch (err) {
      alert("Ошибка чтения JSON файла. Проверьте корректность формата.");
    }
    e.target.value = "";
  };
  reader.readAsText(file);
}

// Запуск при загрузке DOM
document.addEventListener("DOMContentLoaded", () => {
  initTheme();
  initEvents();
  initAuth();
});