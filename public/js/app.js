/* ═══════════════════════════════════════════════════════
   SpinAWheel — Main Application (v2)
   Multi-wheel, weighted entries, per-entry colors,
   sub-tabs (List/Text/Style/Sound), palettes, presets
   ═══════════════════════════════════════════════════════ */

(function () {
  'use strict';

  /* ── Constants ───────────────────────────────────── */
  const MAX_WHEELS = 6;
  const STORAGE_KEY = 'spinawheel-data';
  const THEME_KEY = 'spinawheel-theme';

  const DEFAULT_ENTRIES = [
    { name: 'Pizza',  weight: 1, color: null },
    { name: 'Burger', weight: 1, color: null },
    { name: 'Sushi',  weight: 1, color: null },
    { name: 'Tacos',  weight: 1, color: null },
    { name: 'Pasta',  weight: 1, color: null },
    { name: 'Salad',  weight: 1, color: null },
    { name: 'Ramen',  weight: 1, color: null },
    { name: 'Curry',  weight: 1, color: null },
  ];

  const SPEED_LABELS = { 1: 'Slow', 2: 'Normal', 3: 'Fast' };
  const FONT_SIZE_LABELS = { 0: 'Small', 1: 'Medium', 2: 'Large' };

  // Color picker palette (24 colors)
  const PICKER_COLORS = [
    '#f43f5e', '#ef4444', '#f97316', '#f59e0b', '#eab308', '#84cc16',
    '#22c55e', '#10b981', '#14b8a6', '#06b6d4', '#0ea5e9', '#3b82f6',
    '#6366f1', '#8b5cf6', '#a855f7', '#d946ef', '#ec4899', '#f472b6',
    '#1e293b', '#374151', '#6b7280', '#9ca3af', '#d1d5db', '#ffffff',
  ];

  /* ── State ───────────────────────────────────────── */
  let wheels = [];
  let wheelInstances = [];
  let activeIdx = 0;
  let activePanel = 'entries';  // 'entries', 'results', 'stats'
  let activeSubTab = 'list';    // 'list', 'text', 'style', 'sound'
  let globalResults = [];
  let savedLibrary = JSON.parse(localStorage.getItem('spinawheel-library') || '[]');
  let bulkWinners = [];
  let selectedEntries = new Set(); // Indices of selected entries for bulk ops
  let colorPickerTargetIdx = -1;   // Which entry row the color picker is for

  /* ── DOM References ──────────────────────────────── */
  const $ = (id) => document.getElementById(id);
  const wheelsGrid = $('wheels-grid');
  const panelTabs = $('panel-tabs');
  const entriesInput = $('entries-input');

  const entriesTab = $('entries-tab');
  const resultsTab = $('results-tab');
  const statsTab = $('stats-tab');

  const resultsList = $('results-list');
  const statsContainer = $('stats-container');

  const spinAllBtn = $('spin-all-btn');
  const fullscreenBtn = $('fullscreen-btn');
  const newWheelBtn = $('new-wheel-btn');
  const saveWheelBtn = $('save-wheel-btn');
  const libraryBtn = $('library-btn');
  const addWheelBtn = $('add-wheel-btn');
  const renameWheelBtn = $('rename-wheel-btn');
  const removeWheelBtn = $('remove-wheel-btn');

  const winnerModal = $('winner-modal');
  const winnerName = $('winner-name');
  const shareModal = $('share-modal');
  const shareUrl = $('share-url');

  const libraryModal = $('library-modal');
  const libraryOverlay = $('library-overlay');
  const closeLibraryBtn = $('close-library-btn');
  const libraryList = $('library-list');

  const toastEl = $('toast');

  // Sub-tabs
  const subTabs = $('sub-tabs');
  const entryListBody = $('entry-list-body');
  const selectAllCheckbox = $('select-all-entries');
  const addEntryBtn = $('add-entry-btn');
  const moreActionsBtn = $('more-actions-btn');
  const moreActionsDropdown = $('more-actions-dropdown');
  const colorPickerPopover = $('color-picker-popover');

  /* ── Init ────────────────────────────────────────── */

  function init() {
    applyTheme();
    loadState();
    renderWheels();
    renderPanelTabs();
    switchPanelTab('entries', activeIdx);
    renderSubTabContent();
    renderPaletteGrid();
    renderSoundPresets();
    renderColorPickerGrid();
    bindEvents();
    updateSoundBtn();
    restoreStyleSettings();
  }

  /* ── Theme ───────────────────────────────────────── */

  function applyTheme() {
    const saved = localStorage.getItem(THEME_KEY);
    if (saved) {
      document.documentElement.setAttribute('data-theme', saved);
    } else if (window.matchMedia('(prefers-color-scheme: light)').matches) {
      document.documentElement.setAttribute('data-theme', 'light');
    }
    updateThemeIcon();
  }

  function toggleTheme() {
    const current = document.documentElement.getAttribute('data-theme');
    const next = current === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    localStorage.setItem(THEME_KEY, next);
    updateThemeIcon();
  }

  function updateThemeIcon() {
    const icon = document.querySelector('.theme-icon');
    if (icon) {
      icon.textContent = document.documentElement.getAttribute('data-theme') === 'dark' ? '🌙' : '☀️';
    }
  }

  /* ── Sound ───────────────────────────────────────── */

  function updateSoundBtn() {
    const btn = $('sound-toggle');
    if (!btn) return;
    const icon = btn.querySelector('.sound-icon');
    if (window.soundManager.isMuted()) {
      icon.textContent = '🔇';
      btn.classList.remove('active');
    } else {
      icon.textContent = '🔊';
      btn.classList.add('active');
    }
  }

  /* ── Persistence ─────────────────────────────────── */

  function loadState() {
    // Check URL hash first (shared wheel)
    const hash = window.location.hash;
    if (hash && hash.length > 1) {
      try {
        const data = JSON.parse(decodeURIComponent(atob(hash.slice(1))));
        if (data && Array.isArray(data.entries) && data.entries.length > 0) {
          wheels = [{
            title: data.title || 'Shared Wheel',
            entries: data.entries.map(e => typeof e === 'string' ? { name: e, weight: 1, color: null } : e)
          }];
          globalResults = [];
          activeIdx = 0;
          saveState();
          history.replaceState(null, '', window.location.pathname);
          toast('Shared wheel loaded!');
          return;
        }
      } catch (_) { /* ignore invalid hash */ }
    }

    // Load from localStorage
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
      if (saved && Array.isArray(saved.wheels) && saved.wheels.length > 0) {
        wheels = saved.wheels.map(w => ({
          ...w,
          entries: (w.entries || []).map(e =>
            typeof e === 'string' ? { name: e, weight: 1, color: null } : { name: e.name || '', weight: e.weight || 1, color: e.color || null }
          )
        }));
        globalResults = saved.results || [];
        activeIdx = Math.min(saved.activeIdx || 0, wheels.length - 1);
        return;
      }
    } catch (_) { /* ignore */ }

    // Default state
    wheels = [{ title: 'Wheel 1', entries: [...DEFAULT_ENTRIES] }];
    globalResults = [];
    activeIdx = 0;
  }

  function saveState() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ wheels, activeIdx, globalResults }));
  }

  function saveLibrary() {
    localStorage.setItem('spinawheel-library', JSON.stringify(savedLibrary));
  }

  /* ── Multi-Wheel Rendering ───────────────────────── */

  function renderWheels() {
    wheelInstances.forEach(w => w.destroy());
    wheelInstances = [];
    wheelsGrid.innerHTML = '';
    wheelsGrid.dataset.count = wheels.length;

    wheels.forEach((w, i) => {
      const card = document.createElement('div');
      card.className = `wheel-card ${i === activeIdx ? 'active' : ''}`;
      card.dataset.idx = i;
      card.innerHTML = `
        <div class="wheel-card-label" title="Click to edit" data-idx="${i}">${escapeHtml(w.title)} <span style="font-size: 0.8em; opacity: 0.5; margin-left: 4px;">✏️</span></div>
        <div class="wheel-canvas-wrap">
          <canvas id="canvas-${i}" aria-label="Spin ${escapeHtml(w.title)}"></canvas>
        </div>
      `;
      wheelsGrid.appendChild(card);

      const canvas = $(`canvas-${i}`);
      const spinWheel = new SpinWheel(canvas, {
        onSpinEnd: (winner, winnerIdx) => handleSpinEnd(i, winner, winnerIdx),
        onTick: () => window.soundManager.tick(),
      });
      spinWheel.setEntries(w.entries);
      wheelInstances.push(spinWheel);

      card.querySelector('.wheel-canvas-wrap').addEventListener('click', () => triggerSpin(i));

      const label = card.querySelector('.wheel-card-label');
      label.addEventListener('click', () => {
        const newTitle = prompt('Enter new title for this wheel:', w.title);
        if (newTitle && newTitle.trim()) {
          w.title = newTitle.trim();
          saveState();
          renderWheels();
          renderPanelTabs();
          updateManagementButtons();
        }
      });
    });
  }

  /* ── Entries & Input Sync ────────────────────────── */

  function syncEntriesFromState() {
    const w = wheels[activeIdx];
    // Sync textarea (Text tab)
    entriesInput.value = w.entries.map(e => e.name).join('\n');
    // Sync wheel canvas
    wheelInstances[activeIdx].setEntries(w.entries);
    // Sync list view
    if (activeSubTab === 'list') renderEntryList();
    selectedEntries.clear();
    renderPanelTabs();
  }

  function syncEntriesFromInput() {
    const lines = entriesInput.value.split('\n').filter(l => l.trim() !== '');
    const current = wheels[activeIdx].entries;
    // Preserve weights/colors for existing entries at same index
    wheels[activeIdx].entries = lines.map((name, i) => ({
      name: name.trim(),
      weight: (current[i] && current[i].name === name.trim()) ? current[i].weight : 1,
      color: (current[i] && current[i].name === name.trim()) ? current[i].color : null,
    }));
    wheelInstances[activeIdx].setEntries(wheels[activeIdx].entries);
    saveState();
    renderPanelTabs();
  }

  /* ── Entry List Rendering (List Tab) ─────────────── */

  function renderEntryList() {
    const w = wheels[activeIdx];
    const totalWeight = w.entries.reduce((s, e) => s + (e.weight || 1), 0);

    if (w.entries.length === 0) {
      entryListBody.innerHTML = '<div class="entry-list-empty">No entries yet. Click + to add.</div>';
      return;
    }

    entryListBody.innerHTML = w.entries.map((entry, i) => {
      const pct = totalWeight > 0 ? Math.round(((entry.weight || 1) / totalWeight) * 100) : 0;
      const color = entry.color || wheelInstances[activeIdx]?._colorMap[i] || '#888';
      const checked = selectedEntries.has(i) ? 'checked' : '';
      return `
        <div class="entry-row" data-idx="${i}">
          <span class="er-check">
            <input type="checkbox" class="entry-checkbox entry-select" data-idx="${i}" ${checked} aria-label="Select ${escapeHtml(entry.name)}">
          </span>
          <span class="er-name">
            <input type="text" class="entry-name-input" data-idx="${i}" value="${escapeHtml(entry.name)}" placeholder="Entry name" spellcheck="false">
          </span>
          <span class="er-delete">
            <button class="entry-delete-btn" data-idx="${i}" title="Delete entry">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
            </button>
          </span>
          <span class="er-weight">
            <button class="weight-btn" data-action="dec" data-idx="${i}" ${entry.weight <= 1 ? 'disabled' : ''}>−</button>
            <input type="text" class="weight-input" data-idx="${i}" value="${entry.weight}" inputmode="numeric" pattern="[0-9]*" aria-label="Weight">
            <button class="weight-btn" data-action="inc" data-idx="${i}">+</button>
          </span>
          <span class="er-pct">${pct}%</span>
          <span class="er-color">
            <button class="color-dot-btn" data-idx="${i}" title="Change color" style="background-color:${color};"></button>
          </span>
          <span class="er-actions">
            <button class="entry-action-btn" data-idx="${i}" title="More actions">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="1"/><circle cx="12" cy="5" r="1"/><circle cx="12" cy="19" r="1"/></svg>
            </button>
          </span>
        </div>
      `;
    }).join('');

    // Update select-all checkbox
    selectAllCheckbox.checked = selectedEntries.size === w.entries.length && w.entries.length > 0;
  }

  /* ── Sub-Tab Rendering ──────────────────────────── */

  function renderSubTabContent() {
    // Show/hide sub-tab panels
    document.querySelectorAll('.sub-tab-content').forEach(el => el.classList.remove('active'));
    document.querySelectorAll('.sub-tab').forEach(el => el.classList.remove('active'));

    const activeContent = $(`subtab-${activeSubTab}`);
    if (activeContent) activeContent.classList.add('active');

    const activeTabBtn = document.querySelector(`.sub-tab[data-subtab="${activeSubTab}"]`);
    if (activeTabBtn) activeTabBtn.classList.add('active');

    // Show/hide sub-tabs & add/more buttons based on active panel
    const isEntries = activePanel === 'entries';
    subTabs.style.display = isEntries ? '' : 'none';
    document.querySelectorAll('.sub-tab-content').forEach(el => {
      if (!isEntries) el.classList.remove('active');
    });

    if (isEntries && activeSubTab === 'list') {
      renderEntryList();
    }
  }

  /* ── Palette Grid (Style Tab) ───────────────────── */

  function renderPaletteGrid() {
    const grid = $('palette-grid');
    if (!grid || wheelInstances.length === 0) return;
    const palettes = wheelInstances[0].getPalettes();
    const activePal = wheelInstances[0].activePalette;

    grid.innerHTML = Object.entries(palettes).map(([key, colors]) => {
      const isActive = key === activePal ? 'active' : '';
      const swatches = colors.slice(0, 6).map(c => `<span class="palette-swatch" style="background:${c};"></span>`).join('');
      const label = key.charAt(0).toUpperCase() + key.slice(1);
      return `
        <button class="palette-card ${isActive}" data-palette="${key}" title="${label}">
          <div class="palette-swatches">${swatches}</div>
          <span class="palette-name">${label}</span>
        </button>
      `;
    }).join('');
  }

  /* ── Sound Presets (Sound Tab) ──────────────────── */

  function renderSoundPresets() {
    const tickGrid = $('tick-sound-presets');
    const winGrid = $('win-sound-presets');
    if (!tickGrid || !winGrid) return;

    const sm = window.soundManager;

    tickGrid.innerHTML = Object.entries(SoundManager.TICK_PRESETS).map(([key, p]) => {
      const isActive = sm.tickPreset === key ? 'active' : '';
      return `<button class="sound-preset-card ${isActive}" data-type="tick" data-key="${key}" title="${p.label}">
        <span class="sound-preset-emoji">${p.emoji}</span>
        <span class="sound-preset-label">${p.label}</span>
      </button>`;
    }).join('');

    winGrid.innerHTML = Object.entries(SoundManager.WIN_PRESETS).map(([key, p]) => {
      const isActive = sm.winPreset === key ? 'active' : '';
      return `<button class="sound-preset-card ${isActive}" data-type="win" data-key="${key}" title="${p.label}">
        <span class="sound-preset-emoji">${p.emoji}</span>
        <span class="sound-preset-label">${p.label}</span>
      </button>`;
    }).join('');
  }

  /* ── Color Picker Grid ─────────────────────────── */

  function renderColorPickerGrid() {
    const grid = $('color-picker-grid');
    if (!grid) return;
    grid.innerHTML = PICKER_COLORS.map(c =>
      `<button class="cpg-dot" data-color="${c}" style="background:${c};" title="${c}"></button>`
    ).join('');
  }

  function showColorPicker(idx, anchorEl) {
    colorPickerTargetIdx = idx;
    colorPickerPopover.classList.remove('hidden');
    // Position near the anchor
    const rect = anchorEl.getBoundingClientRect();
    const panelRect = document.querySelector('.entries-panel').getBoundingClientRect();
    colorPickerPopover.style.top = (rect.bottom - panelRect.top + 4) + 'px';
    colorPickerPopover.style.right = '12px';
  }

  function hideColorPicker() {
    colorPickerPopover.classList.add('hidden');
    colorPickerTargetIdx = -1;
  }

  /* ── Restore Style Settings ────────────────────── */

  function restoreStyleSettings() {
    // Font size
    const fsSlider = $('font-size-slider');
    const savedFs = parseInt(localStorage.getItem('spinawheel-fontsize') || '1', 10);
    fsSlider.value = savedFs;
    $('font-size-value').textContent = FONT_SIZE_LABELS[savedFs] || 'Medium';
    wheelInstances.forEach(w => w.setFontSizeMode(savedFs));

    // Speed
    const speedSlider = $('spin-speed-slider');
    const savedSpeed = parseInt(localStorage.getItem('spinawheel-speed') || '2', 10);
    speedSlider.value = savedSpeed;
    $('spin-speed-value').textContent = SPEED_LABELS[savedSpeed] || 'Normal';

    // Volume
    const volSlider = $('volume-slider');
    volSlider.value = Math.round(window.soundManager.volume * 100);
    $('volume-value').textContent = volSlider.value + '%';
  }

  /* ── Results ─────────────────────────────────────── */

  function renderResults() {
    if (globalResults.length === 0) {
      resultsList.innerHTML = '<p style="text-align:center;color:var(--text-muted);padding:24px;font-size:0.9rem;">No results yet. Spin a wheel!</p>';
    } else {
      resultsList.innerHTML = globalResults.map((r, i) => `
        <div class="result-item">
          <span class="result-number">${globalResults.length - i}</span>
          <div style="flex:1; display:flex; flex-direction:column;">
            <span class="result-name">${escapeHtml(r.name)}</span>
            <span style="font-size:0.7rem;color:var(--text-muted);">${escapeHtml(r.wheelTitle)}</span>
          </div>
          <span class="result-time">${r.time}</span>
        </div>
      `).join('');
    }
  }

  /* ── Stats ───────────────────────────────────────── */

  function renderStats() {
    if (globalResults.length === 0) {
      statsContainer.innerHTML = '<p style="text-align:center;color:var(--text-muted);padding:24px;font-size:0.9rem;">Spin a wheel to see stats!</p>';
      return;
    }
    const counts = {};
    globalResults.forEach(r => { counts[r.name] = (counts[r.name] || 0) + 1; });
    const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
    const maxCount = sorted[0][1];
    const wheelColors = ['#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7', '#F0B27A', '#98D8C8', '#F7DC6F', '#E74C3C', '#85C1E9'];

    let html = '<div class="stats-chart">';
    sorted.forEach(([name, count], i) => {
      const pct = (count / maxCount) * 100;
      const color = wheelColors[i % wheelColors.length];
      html += `
        <div class="stats-bar-row">
          <span class="stats-bar-label" title="${escapeHtml(name)}">${escapeHtml(name)}</span>
          <div class="stats-bar-track"><div class="stats-bar-fill" style="width:${pct}%;background:${color};"></div></div>
          <span class="stats-bar-count">${count}</span>
        </div>
      `;
    });
    html += '</div>';
    html += `<p class="stats-total">Total spins: <strong>${globalResults.length}</strong></p>`;
    statsContainer.innerHTML = html;
  }

  /* ── Panel Tabs & UI State ───────────────────────── */

  function renderPanelTabs() {
    let tabsHtml = '';
    if (wheels.length === 1) {
      tabsHtml += `
        <button class="panel-tab ${activePanel === 'entries' ? 'active' : ''}" data-action="switch-wheel" data-idx="0">
          Entries <span class="tab-badge">${wheels[0].entries.length}</span>
        </button>
      `;
    } else {
      wheels.forEach((w, i) => {
        const isActive = activePanel === 'entries' && activeIdx === i ? 'active' : '';
        tabsHtml += `
          <button class="panel-tab ${isActive}" data-action="switch-wheel" data-idx="${i}">
            ${escapeHtml(w.title)}
          </button>
        `;
      });
    }
    tabsHtml += `
      <button class="panel-tab ${activePanel === 'results' ? 'active' : ''}" data-action="switch-panel" data-panel="results">
        Results <span class="tab-badge">${globalResults.length}</span>
      </button>
    `;
    panelTabs.innerHTML = tabsHtml;

    document.querySelectorAll('.wheel-card').forEach((card, i) => {
      card.classList.toggle('active', activePanel === 'entries' && i === activeIdx);
    });
    updateManagementButtons();
  }

  function switchPanelTab(panel, wIdx = 0) {
    activePanel = panel;
    if (panel === 'entries') {
      activeIdx = wIdx;
      entriesTab.style.display = 'none';
      resultsTab.classList.remove('active');
      statsTab.classList.remove('active');
      syncEntriesFromState();
      renderSubTabContent();
    } else if (panel === 'results') {
      resultsTab.classList.add('active');
      statsTab.classList.remove('active');
      renderResults();
      renderSubTabContent();
    } else if (panel === 'stats') {
      resultsTab.classList.remove('active');
      statsTab.classList.add('active');
      renderStats();
      renderSubTabContent();
    }
    renderPanelTabs();
    saveState();
  }

  function updateManagementButtons() {
    const wTitle = wheels[activeIdx].title;
    renameWheelBtn.innerHTML = `✏️ Rename ${escapeHtml(wTitle)}`;
    removeWheelBtn.innerHTML = `🗑️ Remove ${escapeHtml(wTitle)}`;
    removeWheelBtn.disabled = wheels.length <= 1;
    removeWheelBtn.style.display = wheels.length <= 1 ? 'none' : '';
    addWheelBtn.disabled = wheels.length >= MAX_WHEELS;
    addWheelBtn.style.opacity = wheels.length >= MAX_WHEELS ? '0.5' : '1';
    addWheelBtn.style.cursor = wheels.length >= MAX_WHEELS ? 'not-allowed' : 'pointer';
    spinAllBtn.style.display = wheels.length > 1 ? 'inline-flex' : 'none';
  }

  function handleNewWheel() {
    if (confirm('Are you sure you want to create a new default wheel? This will replace your current wheels.')) {
      wheels = [{
        title: 'New Wheel',
        entries: [...DEFAULT_ENTRIES]
      }];
      globalResults = [];
      activeIdx = 0;
      saveState();
      renderWheels();
      switchPanelTab('entries', 0);
      toast('New default wheel created!');
    }
  }

  function handleSaveWheel() {
    const activeWheel = wheels[activeIdx];
    const newSaved = {
      id: Date.now().toString(),
      title: activeWheel.title || 'Untitled Wheel',
      entries: JSON.parse(JSON.stringify(activeWheel.entries)),
      dateSaved: new Date().toLocaleDateString()
    };
    savedLibrary.push(newSaved);
    saveLibrary();
    toast(`"${newSaved.title}" saved to your Library!`);
  }

  function escapeHTML(str) {
    if (!str) return '';
    return str.toString().replace(/[&<>'"]/g, tag => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
    }[tag] || tag));
  }

  function openLibraryModal() {
    renderLibrary();
    libraryModal.classList.remove('hidden');
  }

  function closeLibraryModal() {
    libraryModal.classList.add('hidden');
  }

  function renderLibrary() {
    if (savedLibrary.length === 0) {
      libraryList.innerHTML = `<p style="color: var(--text-secondary); text-align: center; padding: 20px;">No saved wheels yet. Click the 💾 Save button to save your current wheel!</p>`;
      return;
    }
    
    libraryList.innerHTML = savedLibrary.map((w, idx) => `
      <div class="library-item">
        <div class="library-item-info">
          <div class="library-item-title">${escapeHTML(w.title)}</div>
          <div class="library-item-meta">${w.entries.length} entries • Saved ${escapeHTML(w.dateSaved)}</div>
        </div>
        <div class="library-item-actions">
          <button class="btn btn-primary lib-btn-open" data-idx="${idx}">▶️ Open</button>
          <button class="btn btn-ghost lib-btn-rename" data-idx="${idx}">✏️ Rename</button>
          <button class="btn btn-ghost lib-btn-delete" data-idx="${idx}">🗑️ Delete</button>
        </div>
      </div>
    `).join('');
  }

  libraryList.addEventListener('click', (e) => {
    const target = e.target;
    if (target.classList.contains('lib-btn-open')) {
      loadSavedWheel(parseInt(target.dataset.idx, 10));
    } else if (target.classList.contains('lib-btn-rename')) {
      renameSavedWheel(parseInt(target.dataset.idx, 10));
    } else if (target.classList.contains('lib-btn-delete')) {
      deleteSavedWheel(parseInt(target.dataset.idx, 10));
    }
  });

  function loadSavedWheel(idx) {
    const saved = savedLibrary[idx];
    if (!saved) return;
    if (confirm(`Open "${saved.title}"? This will replace your current wheel.`)) {
      wheels[activeIdx].title = saved.title;
      wheels[activeIdx].entries = JSON.parse(JSON.stringify(saved.entries));
      saveState();
      renderWheels();
      switchPanelTab('entries', activeIdx);
      closeLibraryModal();
      toast(`Loaded "${saved.title}"`);
    }
  }

  function renameSavedWheel(idx) {
    const saved = savedLibrary[idx];
    if (!saved) return;
    const newName = prompt('Enter new name for this wheel:', saved.title);
    if (newName && newName.trim() !== '') {
      saved.title = newName.trim();
      saveLibrary();
      renderLibrary();
    }
  }

  function deleteSavedWheel(idx) {
    if (confirm('Are you sure you want to delete this saved wheel?')) {
      savedLibrary.splice(idx, 1);
      saveLibrary();
      renderLibrary();
    }
  }

  function handleAddWheel() {
    if (wheels.length >= MAX_WHEELS) { toast(`Maximum ${MAX_WHEELS} wheels allowed`); return; }
    wheels.push({ title: `Wheel ${wheels.length + 1}`, entries: [...DEFAULT_ENTRIES] });
    saveState();
    renderWheels();
    switchPanelTab('entries', wheels.length - 1);
  }

  function addWheel() {
    if (wheels.length >= MAX_WHEELS) { toast(`Maximum ${MAX_WHEELS} wheels allowed`); return; }
    wheels.push({ title: `Wheel ${wheels.length + 1}`, entries: [...DEFAULT_ENTRIES] });
    saveState();
    renderWheels();
    switchPanelTab('entries', wheels.length - 1);
  }

  function removeWheel() {
    if (wheels.length <= 1) return;
    if (confirm(`Remove ${wheels[activeIdx].title}?`)) {
      wheels.splice(activeIdx, 1);
      activeIdx = Math.min(activeIdx, wheels.length - 1);
      saveState();
      renderWheels();
      switchPanelTab('entries', activeIdx);
    }
  }

  function renameWheel() {
    const newTitle = prompt('Enter new title for this wheel:', wheels[activeIdx].title);
    if (newTitle && newTitle.trim()) {
      wheels[activeIdx].title = newTitle.trim();
      saveState();
      renderWheels();
      renderPanelTabs();
      updateManagementButtons();
    }
  }

  /* ── Entry Operations ───────────────────────────── */

  function addEntry() {
    wheels[activeIdx].entries.push({ name: '', weight: 1, color: null });
    saveState();
    syncEntriesFromState();
    // Focus the new entry's input
    requestAnimationFrame(() => {
      const inputs = entryListBody.querySelectorAll('.entry-name-input');
      const last = inputs[inputs.length - 1];
      if (last) last.focus();
    });
  }

  function updateEntryName(idx, newName) {
    if (idx >= 0 && idx < wheels[activeIdx].entries.length) {
      wheels[activeIdx].entries[idx].name = newName;
      wheelInstances[activeIdx].setEntries(wheels[activeIdx].entries);
      saveState();
    }
  }

  function updateEntryWeight(idx, delta) {
    const entry = wheels[activeIdx].entries[idx];
    if (!entry) return;
    entry.weight = Math.max(1, (entry.weight || 1) + delta);
    wheelInstances[activeIdx].setEntries(wheels[activeIdx].entries);
    saveState();
    renderEntryList();
  }

  function setEntryWeight(idx, val) {
    const entry = wheels[activeIdx].entries[idx];
    if (!entry) return;
    entry.weight = Math.max(1, parseInt(val, 10) || 1);
    wheelInstances[activeIdx].setEntries(wheels[activeIdx].entries);
    saveState();
    renderEntryList();
  }

  function setEntryColor(idx, color) {
    const entry = wheels[activeIdx].entries[idx];
    if (!entry) return;
    entry.color = color;
    wheelInstances[activeIdx].setEntries(wheels[activeIdx].entries);
    saveState();
    renderEntryList();
    hideColorPicker();
  }

  function deleteEntry(idx) {
    wheels[activeIdx].entries.splice(idx, 1);
    selectedEntries.delete(idx);
    wheelInstances[activeIdx].setEntries(wheels[activeIdx].entries);
    saveState();
    syncEntriesFromState();
  }

  function duplicateEntry(idx) {
    const entry = wheels[activeIdx].entries[idx];
    if (!entry) return;
    wheels[activeIdx].entries.splice(idx + 1, 0, { ...entry, color: null });
    wheelInstances[activeIdx].setEntries(wheels[activeIdx].entries);
    saveState();
    syncEntriesFromState();
  }

  function moveEntry(idx, direction) {
    const entries = wheels[activeIdx].entries;
    const newIdx = idx + direction;
    if (newIdx < 0 || newIdx >= entries.length) return;
    [entries[idx], entries[newIdx]] = [entries[newIdx], entries[idx]];
    wheelInstances[activeIdx].setEntries(entries);
    saveState();
    renderEntryList();
  }

  function shuffleEntries() {
    const w = wheels[activeIdx];
    for (let i = w.entries.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [w.entries[i], w.entries[j]] = [w.entries[j], w.entries[i]];
    }
    syncEntriesFromState();
    saveState();
  }

  function sortEntries() {
    wheels[activeIdx].entries.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
    syncEntriesFromState();
    saveState();
  }

  function clearEntries() {
    if (wheels[activeIdx].entries.length === 0) return;
    wheels[activeIdx].entries = [];
    syncEntriesFromState();
    saveState();
  }

  function removeDuplicates() {
    const seen = new Set();
    wheels[activeIdx].entries = wheels[activeIdx].entries.filter(e => {
      const key = e.name.toLowerCase().trim();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    syncEntriesFromState();
    saveState();
    toast('Duplicates removed');
  }

  function resetAllWeights() {
    wheels[activeIdx].entries.forEach(e => e.weight = 1);
    syncEntriesFromState();
    saveState();
    toast('All weights reset to 1');
  }

  function resetAllColors() {
    wheels[activeIdx].entries.forEach(e => e.color = null);
    syncEntriesFromState();
    saveState();
    toast('All colors reset');
  }

  function clearResults() {
    globalResults = [];
    if (activePanel === 'results') renderResults();
    if (activePanel === 'stats') renderStats();
    renderPanelTabs();
    saveState();
  }

  /* ── Spin Handlers ───────────────────────────────── */

  function triggerSpin(idx) {
    if (window.soundManager) window.soundManager._init();
    const wheelInst = wheelInstances[idx];
    if (!wheelInst || wheelInst.isSpinning) return;
    if (wheels[idx].entries.length < 2) {
      toast('Add at least 2 entries to spin!');
      switchPanelTab('entries', idx);
      if (activeSubTab === 'text') entriesInput.focus();
      return;
    }
    switchPanelTab('entries', idx);
    const card = document.querySelector(`.wheel-card[data-idx="${idx}"]`);
    if (card) card.classList.add('spinning');
    wheelInst.spin();
  }

  function triggerSpinAll() {
    if (window.soundManager) window.soundManager._init();
    let spunAny = false;
    wheelInstances.forEach((wInst, idx) => {
      if (!wInst.isSpinning && wheels[idx].entries.length >= 2) {
        const card = document.querySelector(`.wheel-card[data-idx="${idx}"]`);
        if (card) card.classList.add('spinning');
        wInst.spin();
        spunAny = true;
      }
    });
    if (!spunAny) toast('No valid wheels to spin');
  }

  function handleSpinEnd(wheelIdx, winner, itemIdx) {
    const card = document.querySelector(`.wheel-card[data-idx="${wheelIdx}"]`);
    if (card) card.classList.remove('spinning');
    const now = new Date();
    const time = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const wheelTitle = wheels[wheelIdx].title || `Wheel ${wheelIdx + 1}`;
    globalResults.unshift({ name: winner, time, wheelIdx, wheelTitle });
    saveState();
    if (activePanel === 'results') renderResults();
    if (activePanel === 'stats') renderStats();
    renderPanelTabs();
    
    bulkWinners.push({ winner, itemIdx, wheelIdx, title: wheelTitle });
    
    const anySpinning = wheelInstances.some(w => w && w.isSpinning);
    if (!anySpinning) {
      if (bulkWinners.length === 1) {
        showWinner(bulkWinners[0].winner, bulkWinners[0].itemIdx, bulkWinners[0].wheelIdx);
      } else if (bulkWinners.length > 1) {
        showBulkWinners(bulkWinners);
      }
      bulkWinners = [];
    }
  }

  /* ── Winner Modal ────────────────────────────────── */

  function showBulkWinners(winners) {
    const removeBtn = $('remove-spin-btn');
    if (removeBtn) removeBtn.innerHTML = 'Remove All';
    
    const sortedWinners = [...winners].sort((a, b) => a.wheelIdx - b.wheelIdx);
    
    winnerName.innerHTML = sortedWinners.map(w => `<div style="font-size: 0.55em; margin-bottom: 12px; line-height: 1.2;"><b>${escapeHTML(w.title)}:</b><br/>${escapeHTML(w.winner)}</div>`).join('');
    winnerModal.classList.remove('hidden');
    winnerModal.dataset.bulkWinners = JSON.stringify(sortedWinners);
    winnerModal.dataset.winnerIdx = '';
    winnerModal.dataset.wheelIdx = '';

    const modalHeader = document.querySelector('.winner-modal-header');
    if (modalHeader) modalHeader.style.backgroundColor = '#3b82f6';
    
    triggerWinnerEffects('#3b82f6');
  }

  function showWinner(name, itemIdx, wheelIdx) {
    const removeBtn = $('remove-spin-btn');
    if (removeBtn) removeBtn.innerHTML = 'Remove';
    winnerName.textContent = name;
    winnerModal.classList.remove('hidden');
    winnerModal.dataset.winnerIdx = itemIdx;
    winnerModal.dataset.wheelIdx = wheelIdx;
    delete winnerModal.dataset.bulkWinners;

    const wInst = wheelInstances[wheelIdx];
    const winColor = wInst ? (wInst._colorMap[itemIdx] || wInst.colors[itemIdx % wInst.colors.length]) : '#3b82f6';
    
    const modalHeader = document.querySelector('.winner-modal-header');
    if (modalHeader) modalHeader.style.backgroundColor = winColor;

    triggerWinnerEffects(winColor);
  }

  function triggerWinnerEffects(color) {
    if (window.soundManager) window.soundManager.fanfare();
    if (typeof confetti === 'function') {
      const duration = 3500;
      const end = Date.now() + duration;
      const colors = [color, '#ffffff', '#f43f5e', '#10b981', '#f59e0b', '#3b82f6', '#a855f7'];

      (function frame() {
        confetti({ particleCount: 6, angle: 60, spread: 65, origin: { x: 0, y: 0.65 }, zIndex: 1001, colors });
        confetti({ particleCount: 6, angle: 120, spread: 65, origin: { x: 1, y: 0.65 }, zIndex: 1001, colors });
        if (Date.now() < end) requestAnimationFrame(frame);
      }());
    }
  }

  function closeWinner() { winnerModal.classList.add('hidden'); }

  function removeAndSpin() {
    if (winnerModal.dataset.bulkWinners) {
      try {
        const winners = JSON.parse(winnerModal.dataset.bulkWinners);
        winners.sort((a, b) => b.itemIdx - a.itemIdx);
        winners.forEach(w => {
          if (w.wheelIdx >= 0 && w.wheelIdx < wheels.length) {
            const wheel = wheels[w.wheelIdx];
            if (w.itemIdx >= 0 && w.itemIdx < wheel.entries.length) {
              wheel.entries.splice(w.itemIdx, 1);
              wheelInstances[w.wheelIdx].setEntries(wheel.entries);
            }
          }
        });
        saveState();
        syncEntriesFromState();
      } catch (e) {
        console.error("Bulk remove failed", e);
      }
      closeWinner();
      return;
    }

    const itemIdx = parseInt(winnerModal.dataset.winnerIdx, 10);
    const wheelIdx = parseInt(winnerModal.dataset.wheelIdx, 10);
    if (wheelIdx >= 0 && wheelIdx < wheels.length) {
      const w = wheels[wheelIdx];
      if (itemIdx >= 0 && itemIdx < w.entries.length) {
        w.entries.splice(itemIdx, 1);
        wheelInstances[wheelIdx].setEntries(w.entries);
        if (activeIdx === wheelIdx) syncEntriesFromState();
        saveState();
      }
    }
    closeWinner();
  }

  /* ── Share ───────────────────────────────────────── */

  function showShare() {
    const w = wheels[activeIdx];
    const data = { title: w.title, entries: w.entries };
    const encoded = btoa(encodeURIComponent(JSON.stringify(data)));
    const url = window.location.origin + window.location.pathname + '#' + encoded;
    shareUrl.value = url;
    shareModal.classList.remove('hidden');
    shareUrl.select();
  }

  function copyShareUrl() {
    shareUrl.select();
    navigator.clipboard.writeText(shareUrl.value).then(() => {
      toast('Link copied to clipboard!');
    }).catch(() => {
      document.execCommand('copy');
      toast('Link copied!');
    });
  }

  /* ── Fullscreen ──────────────────────────────────── */

  function toggleFullscreen() {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
      document.body.classList.add('fullscreen-mode');
    } else {
      document.exitFullscreen().catch(() => {});
      document.body.classList.remove('fullscreen-mode');
    }
  }

  document.addEventListener('fullscreenchange', () => {
    if (!document.fullscreenElement) document.body.classList.remove('fullscreen-mode');
  });

  /* ── Utilities ───────────────────────────────────── */

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  let toastTimeout;
  function toast(msg) {
    toastEl.textContent = msg;
    toastEl.classList.add('show');
    clearTimeout(toastTimeout);
    toastTimeout = setTimeout(() => toastEl.classList.remove('show'), 2500);
  }

  /* ── Event Binding ───────────────────────────────── */

  function bindEvents() {
    // ── Sub-tab switching ──
    subTabs.addEventListener('click', (e) => {
      const tabBtn = e.target.closest('.sub-tab');
      if (tabBtn) {
        activeSubTab = tabBtn.dataset.subtab;
        renderSubTabContent();
        // If switching to text, sync textarea from entries
        if (activeSubTab === 'text') {
          entriesInput.value = wheels[activeIdx].entries.map(e => e.name).join('\n');
        }
        // If switching to list from text, sync list from textarea
        if (activeSubTab === 'list') {
          syncEntriesFromInput();
          renderEntryList();
        }
      }
    });

    // ── Textarea input (Text tab) ──
    entriesInput.addEventListener('input', () => syncEntriesFromInput());

    // ── Panel tabs delegation ──
    panelTabs.addEventListener('click', (e) => {
      const tab = e.target.closest('.panel-tab');
      if (!tab) return;
      const action = tab.dataset.action;
      if (action === 'switch-wheel') {
        switchPanelTab('entries', parseInt(tab.dataset.idx, 10));
      } else if (action === 'switch-panel') {
        switchPanelTab(tab.dataset.panel);
      }
    });

    // ── Add entry button ──
    addEntryBtn.addEventListener('click', addEntry);

    // ── More actions dropdown ──
    moreActionsBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      moreActionsDropdown.classList.toggle('hidden');
    });

    moreActionsDropdown.addEventListener('click', (e) => {
      const item = e.target.closest('.dropdown-item');
      if (!item) return;
      const action = item.dataset.action;
      switch (action) {
        case 'shuffle': shuffleEntries(); break;
        case 'sort': sortEntries(); break;
        case 'remove-dupes': removeDuplicates(); break;
        case 'reset-weights': resetAllWeights(); break;
        case 'reset-colors': resetAllColors(); break;
        case 'clear': clearEntries(); break;
      }
      moreActionsDropdown.classList.add('hidden');
    });

    // ── Entry list body delegation ──
    entryListBody.addEventListener('input', (e) => {
      // Name change
      if (e.target.classList.contains('entry-name-input')) {
        const idx = parseInt(e.target.dataset.idx, 10);
        updateEntryName(idx, e.target.value);
      }
      // Weight direct input
      if (e.target.classList.contains('weight-input')) {
        const idx = parseInt(e.target.dataset.idx, 10);
        setEntryWeight(idx, e.target.value);
      }
    });

    entryListBody.addEventListener('click', (e) => {
      // Weight buttons
      const weightBtn = e.target.closest('.weight-btn');
      if (weightBtn) {
        const idx = parseInt(weightBtn.dataset.idx, 10);
        const action = weightBtn.dataset.action;
        updateEntryWeight(idx, action === 'inc' ? 1 : -1);
        return;
      }

      // Color dot
      const colorDot = e.target.closest('.color-dot-btn');
      if (colorDot) {
        const idx = parseInt(colorDot.dataset.idx, 10);
        showColorPicker(idx, colorDot);
        return;
      }

      // Delete button
      const deleteBtn = e.target.closest('.entry-delete-btn');
      if (deleteBtn) {
        const idx = parseInt(deleteBtn.dataset.idx, 10);
        deleteEntry(idx);
        return;
      }

      // Per-entry action button
      const actionBtn = e.target.closest('.entry-action-btn');
      if (actionBtn) {
        const idx = parseInt(actionBtn.dataset.idx, 10);
        showEntryContextMenu(idx, actionBtn);
        return;
      }

      // Checkbox
      if (e.target.classList.contains('entry-select')) {
        const idx = parseInt(e.target.dataset.idx, 10);
        if (e.target.checked) {
          selectedEntries.add(idx);
        } else {
          selectedEntries.delete(idx);
        }
        selectAllCheckbox.checked = selectedEntries.size === wheels[activeIdx].entries.length;
      }
    });

    // ── Select all ──
    selectAllCheckbox.addEventListener('change', (e) => {
      const entries = wheels[activeIdx].entries;
      if (e.target.checked) {
        entries.forEach((_, i) => selectedEntries.add(i));
      } else {
        selectedEntries.clear();
      }
      renderEntryList();
    });

    // ── Color picker popover ──
    $('color-picker-grid').addEventListener('click', (e) => {
      const dot = e.target.closest('.cpg-dot');
      if (dot && colorPickerTargetIdx >= 0) {
        setEntryColor(colorPickerTargetIdx, dot.dataset.color);
      }
    });

    $('color-picker-reset').addEventListener('click', () => {
      if (colorPickerTargetIdx >= 0) {
        setEntryColor(colorPickerTargetIdx, null);
      }
    });

    // ── Palette grid (Style tab) ──
    $('palette-grid').addEventListener('click', (e) => {
      const card = e.target.closest('.palette-card');
      if (card) {
        const key = card.dataset.palette;
        wheelInstances.forEach(w => w.setPalette(key));
        renderPaletteGrid();
        if (activeSubTab === 'list') renderEntryList();
      }
    });

    // ── Font size slider (Style tab) ──
    $('font-size-slider').addEventListener('input', (e) => {
      const val = parseInt(e.target.value, 10);
      $('font-size-value').textContent = FONT_SIZE_LABELS[val] || 'Medium';
      localStorage.setItem('spinawheel-fontsize', String(val));
      wheelInstances.forEach(w => w.setFontSizeMode(val));
    });

    // ── Speed slider (Style tab) ──
    $('spin-speed-slider').addEventListener('input', (e) => {
      const val = parseInt(e.target.value, 10);
      $('spin-speed-value').textContent = SPEED_LABELS[val] || 'Normal';
      localStorage.setItem('spinawheel-speed', String(val));
      wheelInstances.forEach(w => w.speed = val);
    });

    // ── Sound presets (Sound tab) ──
    $('tick-sound-presets').addEventListener('click', (e) => {
      const card = e.target.closest('.sound-preset-card');
      if (card) {
        const key = card.dataset.key;
        window.soundManager.setTickPreset(key);
        window.soundManager.previewTick(key);
        renderSoundPresets();
      }
    });

    $('win-sound-presets').addEventListener('click', (e) => {
      const card = e.target.closest('.sound-preset-card');
      if (card) {
        const key = card.dataset.key;
        window.soundManager.setWinPreset(key);
        window.soundManager.previewWin(key);
        renderSoundPresets();
      }
    });

    // ── Volume slider (Sound tab) ──
    $('volume-slider').addEventListener('input', (e) => {
      const val = parseInt(e.target.value, 10);
      $('volume-value').textContent = val + '%';
      window.soundManager.setVolume(val / 100);
    });

    // ── Management buttons ──
    if (newWheelBtn) newWheelBtn.addEventListener('click', handleNewWheel);
    if (saveWheelBtn) saveWheelBtn.addEventListener('click', handleSaveWheel);
    if (libraryBtn) libraryBtn.addEventListener('click', openLibraryModal);
    if (closeLibraryBtn) closeLibraryBtn.addEventListener('click', closeLibraryModal);
    if (libraryOverlay) libraryOverlay.addEventListener('click', closeLibraryModal);
    if (addWheelBtn) addWheelBtn.addEventListener('click', handleAddWheel);
    spinAllBtn.addEventListener('click', triggerSpinAll);
    renameWheelBtn.addEventListener('click', renameWheel);
    removeWheelBtn.addEventListener('click', removeWheel);

    // ── Theme & Sound ──
    $('theme-toggle').addEventListener('click', toggleTheme);
    $('sound-toggle').addEventListener('click', () => {
      window.soundManager.toggle();
      updateSoundBtn();
    });

    // ── Share ──
    $('share-btn').addEventListener('click', showShare);
    $('copy-url-btn').addEventListener('click', copyShareUrl);
    $('close-share-btn').addEventListener('click', () => shareModal.classList.add('hidden'));
    $('share-overlay').addEventListener('click', () => shareModal.classList.add('hidden'));

    // ── Fullscreen & Panel Toggle ──
    $('fullscreen-btn').addEventListener('click', toggleFullscreen);
    const panelToggleBtn = $('panel-toggle-btn');
    if (panelToggleBtn) {
      panelToggleBtn.addEventListener('click', () => {
        document.body.classList.toggle('panel-hidden');
      });
    }

    // ── Winner modal ──
    $('remove-spin-btn').addEventListener('click', removeAndSpin);
    $('close-modal-btn').addEventListener('click', closeWinner);
    $('winner-overlay').addEventListener('click', closeWinner);

    // ── Clear results ──
    $('clear-results-btn').addEventListener('click', clearResults);

    // ── Keyboard shortcuts ──
    document.addEventListener('keydown', (e) => {
      if (e.ctrlKey && e.key === 'Enter') {
        e.preventDefault();
        triggerSpin(activeIdx);
      }
      if (e.key === 'Escape') {
        closeWinner();
        shareModal.classList.add('hidden');
        moreActionsDropdown.classList.add('hidden');
        hideColorPicker();
        if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
      }
    });

    // ── Close dropdowns on outside click ──
    document.addEventListener('click', (e) => {
      if (!moreActionsBtn.contains(e.target) && !moreActionsDropdown.contains(e.target)) {
        moreActionsDropdown.classList.add('hidden');
      }
      if (!colorPickerPopover.contains(e.target) && !e.target.closest('.color-dot-btn')) {
        hideColorPicker();
      }
    });
  }

  /* ── Entry Context Menu (inline) ─────────────────── */

  function showEntryContextMenu(idx, anchorEl) {
    // Create a temporary context menu
    const existing = document.querySelector('.entry-context-menu');
    if (existing) existing.remove();

    const menu = document.createElement('div');
    menu.className = 'entry-context-menu';
    menu.innerHTML = `
      <button class="ecm-item" data-action="dup">📋 Duplicate</button>
      <button class="ecm-item" data-action="up" ${idx === 0 ? 'disabled' : ''}>⬆️ Move up</button>
      <button class="ecm-item" data-action="down" ${idx === wheels[activeIdx].entries.length - 1 ? 'disabled' : ''}>⬇️ Move down</button>
      <div class="dropdown-divider"></div>
      <button class="ecm-item danger" data-action="del">🗑️ Delete</button>
    `;

    // Position
    const rect = anchorEl.getBoundingClientRect();
    const panelRect = document.querySelector('.entries-panel').getBoundingClientRect();
    menu.style.position = 'absolute';
    menu.style.top = (rect.bottom - panelRect.top + 2) + 'px';
    menu.style.right = '8px';
    menu.style.zIndex = '200';

    document.querySelector('.entries-panel').appendChild(menu);

    menu.addEventListener('click', (e) => {
      const item = e.target.closest('.ecm-item');
      if (!item) return;
      switch (item.dataset.action) {
        case 'dup': duplicateEntry(idx); break;
        case 'up': moveEntry(idx, -1); break;
        case 'down': moveEntry(idx, 1); break;
        case 'del': deleteEntry(idx); break;
      }
      menu.remove();
    });

    // Close on outside click
    setTimeout(() => {
      const closer = (e) => {
        if (!menu.contains(e.target)) {
          menu.remove();
          document.removeEventListener('click', closer);
        }
      };
      document.addEventListener('click', closer);
    }, 10);
  }

  /* ── Start ───────────────────────────────────────── */
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
