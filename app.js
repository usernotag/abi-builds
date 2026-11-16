/**
 * НАСТРОЙКИ ПРИЛОЖЕНИЯ И БЕЗОПАСНОСТИ
 * Прямая проверка пароля (без SHA-256 и проблем с протоколом file://)
 */

const REQUIRE_PASSWORD = true;
const ACCESS_PASSWORD = "1337228";

const CONFIG = {
  STORAGE_KEYS: {
    AUTH_SESSION: "abi_auth_v2",
    THEME: "abi_theme",
    LOCAL_DATA: "abi_local_db_v2"
  }
};

const state = {
  builds: [],
  gear: [],
  editorMode: false,
  hasLocalChanges: false,
  filters: {
    search: "",
    priceMin: 0,
    priceMax: 2000000,
    activeRange: "all",
    effClass: "all",
    zone: "all",
    gearType: "all",
    sort: "default"
  }
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

function showToast(message) {
  const container = document.getElementById("toast-container");
  const toast = document.createElement("div");
  toast.className = "toast";
  toast.textContent = message;
  container.appendChild(toast);
  setTimeout(() => toast.remove(), 2600);
}

function getBudgetBadgeInfo(price, manualMode = "auto") {
  const p = Number(price) || 0;
  if (manualMode && manualMode !== "auto") {
    switch (manualMode) {
      case "range_1": return { text: "До 150к", cls: "badge-white" };
      case "range_2": return { text: "150–280к", cls: "badge-green" };
      case "range_3": return { text: "280–400к", cls: "badge-yellow" };
      case "range_4": return { text: "400–650к", cls: "badge-yellow" };
      case "range_5": return { text: "650к+", cls: "badge-red" };
    }
  }
  if (p <= 150000) return { text: "До 150к", cls: "badge-white" };
  if (p <= 280000) return { text: "150–280к", cls: "badge-green" };
  if (p <= 400000) return { text: "280–400к", cls: "badge-yellow" };
  if (p <= 650000) return { text: "400–650к", cls: "badge-yellow" };
  return { text: "650к+", cls: "badge-red" };
}

// Темы
function initTheme() {
  const savedTheme = localStorage.getItem(CONFIG.STORAGE_KEYS.THEME) || "gold";
  document.documentElement.setAttribute("data-theme", savedTheme);
  const select = document.getElementById("theme-select");
  if (select) {
    select.value = savedTheme;
    select.addEventListener("change", (e) => {
      const newTheme = e.target.value;
      document.documentElement.setAttribute("data-theme", newTheme);
      localStorage.setItem(CONFIG.STORAGE_KEYS.THEME, newTheme);
      updateSliderTrackFill();
    });
  }
}

function initAuth() {
  const overlay = document.getElementById("auth-overlay");
  const appWrapper = document.getElementById("app-wrapper");
  const authForm = document.getElementById("auth-form");
  const passInput = document.getElementById("auth-password");
  const errorMsg = document.getElementById("auth-error");

  const unlock = () => {
    overlay.classList.add("hidden");
    appWrapper.classList.remove("hidden");
    loadDatabase();
    updateSliderTrackFill();
  };

  if (!REQUIRE_PASSWORD || sessionStorage.getItem(CONFIG.STORAGE_KEYS.AUTH_SESSION) === "true") {
    unlock();
    return;
  }

  authForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const enteredPassword = passInput.value;

    // Прямое сравнение введённой строки с ACCESS_PASSWORD
    if (enteredPassword.trim() === ACCESS_PASSWORD) {
      sessionStorage.setItem(CONFIG.STORAGE_KEYS.AUTH_SESSION, "true");
      errorMsg.classList.add("hidden");
      unlock();
    } else {
      errorMsg.classList.remove("hidden");
      passInput.value = "";
      passInput.focus();
    }
  });
}

// Загрузка данных
async function loadDatabase() {
  const localRaw = localStorage.getItem(CONFIG.STORAGE_KEYS.LOCAL_DATA);
  if (localRaw) {
    try {
      const parsed = JSON.parse(localRaw);
      applyDataToState(parsed, true);
      renderAll();
      return;
    } catch (e) {
      console.error("Ошибка чтения localStorage", e);
    }
  }
  await fetchFromServerJson();
}

async function fetchFromServerJson() {
  try {
    const res = await fetch(`builds.json?t=${Date.now()}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    applyDataToState(data, false);
  } catch (err) {
    console.warn("builds.json недоступен", err);
    applyDataToState({ builds: [], gear: [] }, false);
  }
  renderAll();
}

function applyDataToState(data, isLocal) {
  state.builds = Array.isArray(data.builds) ? data.builds : [];
  state.gear = Array.isArray(data.gear) ? data.gear : [];
  state.hasLocalChanges = isLocal;
  updateStorageStatusUI();
}

function saveToLocalStorage() {
  const payload = { updatedAt: new Date().toISOString(), builds: state.builds, gear: state.gear };
  localStorage.setItem(CONFIG.STORAGE_KEYS.LOCAL_DATA, JSON.stringify(payload));
  state.hasLocalChanges = true;
  updateStorageStatusUI();
}

function updateStorageStatusUI() {
  const statusEl = document.getElementById("storage-status");
  if (!statusEl) return;
  if (state.hasLocalChanges) {
    statusEl.textContent = "Локальные изменения в браузере (скачайте builds.json для GitHub)";
    statusEl.classList.add("modified");
  } else {
    statusEl.textContent = "Данные синхронизированы с builds.json";
    statusEl.classList.remove("modified");
  }
}

function updateSliderTrackFill() {
  const sliderMin = document.getElementById("price-slider-min");
  const sliderMax = document.getElementById("price-slider-max");
  const trackFill = document.getElementById("slider-track-fill");
  if (!sliderMin || !sliderMax || !trackFill) return;

  const minVal = Number(sliderMin.value);
  const maxVal = Number(sliderMax.value);
  const minLimit = Number(sliderMin.min) || 0;
  const maxLimit = Number(sliderMin.max) || 2000000;

  const leftPercent = ((minVal - minLimit) / (maxLimit - minLimit)) * 100;
  const rightPercent = ((maxVal - minLimit) / (maxLimit - minLimit)) * 100;

  trackFill.style.left = leftPercent + "%";
  trackFill.style.width = (rightPercent - leftPercent) + "%";
}

// Рендеринг
const BADGE_MAP = {
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
    green: { text: "Топ за свои деньги", cls: "badge-green" },
    yellow: { text: "Рабочий вариант", cls: "badge-yellow" },
    red: { text: "Дорого / Ситуативно", cls: "badge-red" }
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

  let filtered = state.builds.filter(b => {
    const price = Number(b.price) || 0;
    if (price < state.filters.priceMin || price > state.filters.priceMax) return false;
    if (state.filters.effClass !== "all" && b.effClass !== state.filters.effClass) return false;
    if (state.filters.zone !== "all" && b.zone !== state.filters.zone) return false;
    if (query) {
      const text = `${b.weapon} ${b.caliber} ${b.ammo} ${b.notes || ""}`.toLowerCase();
      if (!text.includes(query)) return false;
    }
    return true;
  });

  if (state.filters.sort === "cheap-first") {
    filtered.sort((a, b) => (Number(a.price) || 0) - (Number(b.price) || 0));
  } else if (state.filters.sort === "expensive-first") {
    filtered.sort((a, b) => (Number(b.price) || 0) - (Number(a.price) || 0));
  }

  countEl.textContent = filtered.length;

  if (filtered.length === 0) {
    grid.innerHTML = `<div class="empty-state">База сборок пока пуста. Включите режим редактора, чтобы добавить первую сборку.</div>`;
    return;
  }

  grid.innerHTML = filtered.map(b => {
    const budgetBadge = getBudgetBadgeInfo(b.price, b.budgetMode);
    const classBadge = BADGE_MAP.effClass[b.effClass] || BADGE_MAP.effClass.mid;
    const zoneBadge = BADGE_MAP.zone[b.zone] || BADGE_MAP.zone.yellow;

    const adminActions = state.editorMode ? `
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
          <span class="badge ${budgetBadge.cls}">${budgetBadge.text}</span>
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
          <button class="btn btn-primary btn-sm" data-action="copy-code" data-code="${escapeHtml(b.code)}">Копировать</button>
        </div>

        ${adminActions}
      </article>
    `;
  }).join("");
}

function renderGear() {
  const grid = document.getElementById("gear-grid");
  const filtered = state.gear.filter(g => {
    if (state.filters.gearType !== "all" && g.type !== state.filters.gearType) return false;
    return true;
  });

  if (filtered.length === 0) {
    grid.innerHTML = `<div class="empty-state">Записей о снаряжении пока нет.</div>`;
    return;
  }

  grid.innerHTML = filtered.map(g => {
    const statusBadge = BADGE_MAP.gearStatus[g.status] || BADGE_MAP.gearStatus.green;
    const typeLabel = g.type === "helmet" ? "Шлем" : "Бронежилет";

    const adminActions = state.editorMode ? `
      <div class="card-admin-actions">
        <button class="btn btn-secondary btn-sm" data-action="edit-gear" data-id="${escapeHtml(g.id)}">Редактировать</button>
        <button class="btn btn-danger-outline btn-sm" data-action="del-gear" data-id="${escapeHtml(g.id)}">Удалить</button>
      </div>
    ` : "";

    return `
      <article class="gear-card">
        <div class="gear-header">
          <h3 class="gear-title">${escapeHtml(g.name)}</h3>
          <span class="gear-price">${escapeHtml(g.price)}</span>
        </div>
        <div class="badges-row">
          <span class="badge badge-white">${typeLabel}</span>
          <span class="badge badge-yellow">${escapeHtml(g.tier)}</span>
          <span class="badge ${statusBadge.cls}">${statusBadge.text}</span>
        </div>
        <div class="build-note">${escapeHtml(g.notes)}</div>
        ${adminActions}
      </article>
    `;
  }).join("");
}

// Инициализация событий
function initEvents() {
  document.querySelectorAll(".nav-tab").forEach(tab => {
    tab.addEventListener("click", () => {
      document.querySelectorAll(".nav-tab").forEach(t => t.classList.remove("active"));
      tab.classList.add("active");
      const target = tab.dataset.tab;
      document.getElementById("tab-builds").classList.toggle("hidden", target !== "builds");
      document.getElementById("tab-gear").classList.toggle("hidden", target !== "gear");
    });
  });

  const editorBtn = document.getElementById("toggle-editor-btn");
  const editorToolbar = document.getElementById("editor-toolbar");
  editorBtn.addEventListener("click", () => {
    state.editorMode = !state.editorMode;
    editorBtn.classList.toggle("active", state.editorMode);
    editorToolbar.classList.toggle("hidden", !state.editorMode);
    renderAll();
  });

  document.getElementById("search-input").addEventListener("input", (e) => {
    state.filters.search = e.target.value;
    renderBuilds();
  });

  document.getElementById("sort-select").addEventListener("change", (e) => {
    state.filters.sort = e.target.value;
    renderBuilds();
  });

  const budgetPillsContainer = document.getElementById("filter-budget-pills");
  budgetPillsContainer.addEventListener("click", (e) => {
    const pill = e.target.closest(".pill");
    if (!pill) return;
    budgetPillsContainer.querySelectorAll(".pill").forEach(p => p.classList.remove("active"));
    pill.classList.add("active");

    const range = pill.dataset.range;
    state.filters.activeRange = range;

    let min = 0, max = 2000000;
    if (range !== "all") {
      const parts = range.split("-");
      min = Number(parts[0]);
      max = Number(parts[1]);
    }
    setPriceFilterValues(min, max, true);
  });

  const sliderMin = document.getElementById("price-slider-min");
  const sliderMax = document.getElementById("price-slider-max");
  const inputMin = document.getElementById("price-input-min");
  const inputMax = document.getElementById("price-input-max");

  function handlePriceChange(minVal, maxVal, updateSliders = false) {
    let min = Number(minVal) || 0;
    let max = Number(maxVal) || 2000000;
    if (min > max) [min, max] = [max, min];

    state.filters.priceMin = min;
    state.filters.priceMax = max;

    if (updateSliders) {
      sliderMin.value = min;
      sliderMax.value = max;
      inputMin.value = min;
      inputMax.value = max;
    }

    document.getElementById("budget-values-display").textContent = `${formatKoens(min).replace(" ₭", "")} – ${formatKoens(max)}`;
    updateSliderTrackFill();

    budgetPillsContainer.querySelectorAll(".pill").forEach(p => p.classList.remove("active"));
    renderBuilds();
  }

  sliderMin.addEventListener("input", (e) => handlePriceChange(e.target.value, sliderMax.value, false));
  sliderMax.addEventListener("input", (e) => handlePriceChange(sliderMin.value, e.target.value, false));
  inputMin.addEventListener("input", (e) => handlePriceChange(e.target.value, inputMax.value, true));
  inputMax.addEventListener("input", (e) => handlePriceChange(inputMin.value, e.target.value, true));

  function setPriceFilterValues(min, max, updateUI) {
    handlePriceChange(min, max, true);
    if (updateUI) {
      sliderMin.value = min;
      sliderMax.value = max;
    }
    updateSliderTrackFill();
  }

  setupVerticalFilter("filter-class", "effClass", renderBuilds);
  setupVerticalFilter("filter-zone", "zone", renderBuilds);
  setupVerticalFilter("filter-gear-type", "gearType", renderGear);

  document.getElementById("reset-filters-btn").addEventListener("click", () => {
    state.filters.search = "";
    document.getElementById("search-input").value = "";
    document.getElementById("sort-select").value = "default";
    state.filters.sort = "default";

    setPriceFilterValues(0, 2000000, true);
    budgetPillsContainer.querySelectorAll(".pill").forEach(p => p.classList.toggle("active", p.dataset.range === "all"));

    ["filter-class", "filter-zone"].forEach(id => {
      document.querySelectorAll(`#${id} .pill`).forEach(p => p.classList.toggle("active", p.dataset.value === "all"));
    });
    renderBuilds();
  });

  document.getElementById("builds-grid").addEventListener("click", async (e) => {
    const btn = e.target.closest("button[data-action]");
    if (!btn) return;
    const action = btn.dataset.action;
    const id = btn.dataset.id;

    if (action === "copy-code") {
      try {
        await navigator.clipboard.writeText(btn.dataset.code);
        showToast("Код сборки скопирован!");
      } catch {
        showToast("Код: " + btn.dataset.code);
      }
    } else if (action === "edit-build") openBuildModal(id);
    else if (action === "dup-build") duplicateBuild(id);
    else if (action === "del-build") deleteBuild(id);
  });

  document.getElementById("gear-grid").addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-action]");
    if (!btn) return;
    if (btn.dataset.action === "edit-gear") openGearModal(btn.dataset.id);
    else if (btn.dataset.action === "del-gear") deleteGear(btn.dataset.id);
  });

  document.getElementById("add-build-btn").addEventListener("click", () => openBuildModal(null));
  document.getElementById("add-gear-btn").addEventListener("click", () => openGearModal(null));
  document.getElementById("close-build-modal").addEventListener("click", () => document.getElementById("build-modal").classList.add("hidden"));
  document.getElementById("cancel-build-modal").addEventListener("click", () => document.getElementById("build-modal").classList.add("hidden"));
  document.getElementById("build-form").addEventListener("submit", saveBuildForm);

  document.getElementById("close-gear-modal").addEventListener("click", () => document.getElementById("gear-modal").classList.add("hidden"));
  document.getElementById("cancel-gear-modal").addEventListener("click", () => document.getElementById("gear-modal").classList.add("hidden"));
  document.getElementById("gear-form").addEventListener("submit", saveGearForm);

  document.getElementById("export-json-btn").addEventListener("click", exportJson);
  document.getElementById("import-json-input").addEventListener("change", importJson);
  document.getElementById("reset-local-btn").addEventListener("click", async () => {
    if (confirm("Сбросить кэш и загрузить чистый builds.json?")) {
      localStorage.removeItem(CONFIG.STORAGE_KEYS.LOCAL_DATA);
      await fetchFromServerJson();
      showToast("Кэш сброшен");
    }
  });
}

function setupVerticalFilter(containerId, key, callback) {
  const container = document.getElementById(containerId);
  container.addEventListener("click", (e) => {
    const pill = e.target.closest(".pill");
    if (!pill) return;
    container.querySelectorAll(".pill").forEach(p => p.classList.remove("active"));
    pill.classList.add("active");
    state.filters[key] = pill.dataset.value;
    callback();
  });
}

function openBuildModal(id = null) {
  const modal = document.getElementById("build-modal");
  const form = document.getElementById("build-form");
  form.reset();
  if (id) {
    const item = state.builds.find(b => b.id === id);
    if (!item) return;
    document.getElementById("build-modal-title").textContent = "РЕДАКТИРОВАТЬ СБОРКУ";
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
    document.getElementById("build-modal-title").textContent = "ДОБАВИТЬ СБОРКУ";
    document.getElementById("build-id").value = "";
  }
  modal.classList.remove("hidden");
}

function saveBuildForm(e) {
  e.preventDefault();
  const id = document.getElementById("build-id").value || ("b_" + Date.now());
  const item = {
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

  const idx = state.builds.findIndex(b => b.id === id);
  if (idx >= 0) state.builds[idx] = item;
  else state.builds.unshift(item);

  saveToLocalStorage();
  renderBuilds();
  document.getElementById("build-modal").classList.add("hidden");
  showToast("Сборка сохранена");
}

function duplicateBuild(id) {
  const orig = state.builds.find(b => b.id === id);
  if (!orig) return;
  state.builds.unshift({ ...orig, id: "b_" + Date.now(), weapon: orig.weapon + " (Копия)" });
  saveToLocalStorage();
  renderBuilds();
  showToast("Сборка продублирована");
}

function deleteBuild(id) {
  if (!confirm("Удалить сборку?")) return;
  state.builds = state.builds.filter(b => b.id !== id);
  saveToLocalStorage();
  renderBuilds();
  showToast("Сборка удалена");
}

function openGearModal(id = null) {
  const modal = document.getElementById("gear-modal");
  const form = document.getElementById("gear-form");
  form.reset();
  if (id) {
    const item = state.gear.find(g => g.id === id);
    if (!item) return;
    document.getElementById("gear-modal-title").textContent = "РЕДАКТИРОВАТЬ СНАРЯЖЕНИЕ";
    document.getElementById("gear-id").value = item.id;
    document.getElementById("gear-name").value = item.name;
    document.getElementById("gear-type").value = item.type;
    document.getElementById("gear-tier").value = item.tier;
    document.getElementById("gear-price").value = item.price;
    document.getElementById("gear-status").value = item.status;
    document.getElementById("gear-notes").value = item.notes;
  } else {
    document.getElementById("gear-modal-title").textContent = "ДОБАВИТЬ СНАРЯЖЕНИЕ";
    document.getElementById("gear-id").value = "";
  }
  modal.classList.remove("hidden");
}

function saveGearForm(e) {
  e.preventDefault();
  const id = document.getElementById("gear-id").value || ("g_" + Date.now());
  const item = {
    id,
    name: document.getElementById("gear-name").value.trim(),
    type: document.getElementById("gear-type").value,
    tier: document.getElementById("gear-tier").value,
    price: document.getElementById("gear-price").value.trim(),
    status: document.getElementById("gear-status").value,
    notes: document.getElementById("gear-notes").value.trim()
  };

  const idx = state.gear.findIndex(g => g.id === id);
  if (idx >= 0) state.gear[idx] = item;
  else state.gear.unshift(item);

  saveToLocalStorage();
  renderGear();
  document.getElementById("gear-modal").classList.add("hidden");
  showToast("Снаряжение сохранено");
}

function deleteGear(id) {
  if (!confirm("Удалить позицию?")) return;
  state.gear = state.gear.filter(g => g.id !== id);
  saveToLocalStorage();
  renderGear();
  showToast("Позиция удалена");
}

function exportJson() {
  const data = JSON.stringify({ updatedAt: new Date().toISOString(), builds: state.builds, gear: state.gear }, null, 2);
  const blob = new Blob([data], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "builds.json";
  a.click();
  URL.revokeObjectURL(url);
  showToast("Файл builds.json скачан!");
}

function importJson(e) {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (event) => {
    try {
      const parsed = JSON.parse(event.target.result);
      applyDataToState(parsed, true);
      saveToLocalStorage();
      renderAll();
      showToast("База успешно загружена!");
    } catch {
      alert("Ошибка чтения JSON файла.");
    }
    e.target.value = "";
  };
  reader.readAsText(file);
}

document.addEventListener("DOMContentLoaded", () => {
  initTheme();
  initEvents();
  initAuth();
});