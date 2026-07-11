// Smart Command Palette: Browser-wide Productivity Platform
let ccRoot = null;
let ccShadow = null;
let ccBackdrop = null;
let ccSearchInput = null;
let ccResultsList = null;
let ccEmptyState = null;
let ccBreadcrumbs = null;
let ccSubmenu = null;
let ccAudioMeter = null;

// Command Mode UI elements
let ccBackBtn = null;
let ccCommandTagContainer = null;

// Registry and States
let selectedIndex = -1;
let visibleItems = [];
let activeQuery = "";
let isSubmenuOpen = false;
let isAudioBoosterActive = false;
let audioMeterInterval = null;
let clipboardHistoryCache = [];
let commandStats = {}; // { id: { frequency: 0, lastUsed: 0 } }
let currentSearchRequestId = 0;
let activeSuggestion = "";

// Command Mode State
let currentCommandMode = null; // 'image', 'pdf', 'note', 'boost', 'timer', 'translate'
let commandModeParams = {};    // sub-state parameters (e.g., resizing size)

// Audio Boost Nodes
let audioContext = null;
let gainNode = null;
let compressorNode = null;
let analyserNode = null;
let mediaSources = new Map();

// --- DB INTERFACE IMPORT FALLBACK ---
const DB = typeof CommandPaletteDB !== 'undefined' ? CommandPaletteDB : {
  async get(store, id) { return null; },
  async getAll(store) { return []; },
  async put(store, data) { return null; },
  async delete(store, id) { return true; },
  async addClipboardItem(c, t) { return null; },
  async getClipboardHistory() { return []; },
  async getNotes() { return []; }
};

// --- INITIALIZE ON LOAD ---
document.addEventListener("DOMContentLoaded", () => {
  preloadStats();
});

// Global copy listener for Clipboard History
document.addEventListener("copy", (e) => {
  const selection = window.getSelection().toString();
  if (selection) {
    let type = "text";
    if (selection.startsWith("http://") || selection.startsWith("https://")) type = "link";
    else if (selection.includes("{") || selection.includes("function") || selection.includes("class ")) type = "code";
    DB.addClipboardItem(selection, type).catch(() => {});
  }
});

// Setup key listener with capture phase to prevent page hotkey conflicts
window.addEventListener("keydown", (e) => {
  const isA = e.key.toLowerCase() === "a" || e.code === "KeyA";
  const isP = e.key.toLowerCase() === "p" || e.code === "KeyP";
  
  const toggleAltA = e.altKey && !e.shiftKey && !e.ctrlKey && !e.metaKey && isA;
  const toggleCtrlShiftP = e.ctrlKey && e.shiftKey && !e.altKey && isP;
  
  if (toggleAltA || toggleCtrlShiftP) {
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();
    toggleCommandPalette();
    return;
  }

  // If palette is active, block all inputs outside of it
  if (ccBackdrop && ccBackdrop.classList.contains("active")) {
    const path = e.composedPath();
    if (!path.includes(ccRoot)) {
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
    }
  }
}, true);

window.addEventListener("keyup", (e) => {
  if (ccBackdrop && ccBackdrop.classList.contains("active")) {
    const path = e.composedPath();
    if (!path.includes(ccRoot)) {
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
    }
  }
}, true);

window.addEventListener("keypress", (e) => {
  if (ccBackdrop && ccBackdrop.classList.contains("active")) {
    const path = e.composedPath();
    if (!path.includes(ccRoot)) {
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
    }
  }
}, true);

// Listen for messages from background script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "ping") {
    sendResponse({ status: "pong" });
  } else if (message.action === "toggle_command_center") {
    toggleCommandPalette();
    sendResponse({ success: true });
  }
  return true;
});

// Load stats for scoring
function preloadStats() {
  DB.getAll("commands").then(stats => {
    stats.forEach(s => {
      commandStats[s.id] = s;
    });
  }).catch(() => {});
}

// Typo Autocorrect for media queries
function autoCorrectMediaName(str) {
  let cleaned = str.trim().replace(/\s+/g, " ");
  const corrections = {
    "whjats": "whats",
    "retunrs": "returns",
    "movei": "movie",
    "tomb rider": "tomb raider",
    "judg returns": "judge returns",
    "the judge retuns": "the judge returns",
    "squid gmae": "squid game"
  };
  Object.keys(corrections).forEach(typo => {
    const regex = new RegExp("\\b" + typo + "\\b", "gi");
    cleaned = cleaned.replace(regex, corrections[typo]);
  });
  return cleaned;
}

function getCommandArg(query) {
  const clean = query.trim();
  const firstSpace = clean.indexOf(" ");
  if (firstSpace === -1) return "";
  return clean.substring(firstSpace + 1).trim();
}

// -------------------------------------------------------------
// CORE REGISTRY
// -------------------------------------------------------------
const CommandRegistry = {
  commands: new Map(),
  register(cmd) {
    this.commands.set(cmd.id, cmd);
  },
  getAll() {
    return Array.from(this.commands.values());
  }
};

// -------------------------------------------------------------
// COMMAND PALETTE UI TOGGLE
// -------------------------------------------------------------
function toggleCommandPalette() {
  if (!ccRoot) {
    createCommandPalette();
  }
  const isActive = ccBackdrop.classList.contains("active");
  if (isActive) {
    closeCommandPalette();
  } else {
    openCommandPalette();
  }
}

function openCommandPalette() {
  ccRoot.style.pointerEvents = "auto";
  ccBackdrop.classList.add("active");
  ccSearchInput.value = "";
  selectedIndex = 0;
  activeQuery = "";
  isSubmenuOpen = false;
  ccSubmenu.classList.remove("active");
  exitCommandMode(false); // reset command mode
  
  if (document.activeElement && typeof document.activeElement.blur === "function") {
    document.activeElement.blur();
  }
  
  applyPaletteSettings();
  ccSearchInput.focus();
  requestAnimationFrame(() => ccSearchInput.focus());
  setTimeout(() => ccSearchInput.focus(), 50);

  // Sync recent clipboard clips
  DB.getClipboardHistory(10).then(clips => {
    clipboardHistoryCache = clips;
  });

  renderSearchResults("");
}

function closeCommandPalette() {
  if (ccBackdrop) {
    ccBackdrop.classList.remove("active");
    ccRoot.style.pointerEvents = "none";
    ccSearchInput.blur();
    isSubmenuOpen = false;
    ccSubmenu.classList.remove("active");
    clearInterval(audioMeterInterval);
  }
}

// -------------------------------------------------------------
// COMMAND MODE TRIGGERS
// -------------------------------------------------------------
const CommandModeMetadata = {
  image_tools: { name: "Image Tools", icon: "🖼", placeholder: "Choose image subcommand..." },
  pdf_tools: { name: "PDF Tools", icon: "📄", placeholder: "Choose PDF subcommand..." },
  note_tools: { name: "Notes", icon: "📝", placeholder: "Create or search notes..." },
  boost_tools: { name: "Volume Boost", icon: "🔊", placeholder: "Select boost level..." },
  timer_tools: { name: "Timer", icon: "⏱", placeholder: "Set timer interval..." },
  translate_tools: { name: "Translate", icon: "🗣", placeholder: "Select target language..." },
  help_tools: { name: "Help & Guide", icon: "💡", placeholder: "Browse guide..." },
  bookmark_tools: { name: "Bookmarks", icon: "🔖", placeholder: "Search bookmarks..." },
  download_tools: { name: "Downloads", icon: "📥", placeholder: "Search downloads..." },
  history_tools: { name: "History", icon: "📜", placeholder: "Search history..." },
  tab_tools: { name: "Tabs", icon: "📑", placeholder: "Search active tabs..." },
  mappings_tools: { name: "Mappings", icon: "🔗", placeholder: "Add: <keyword> <label> <url>..." },
  settings_tools: { name: "Settings", icon: "⚙️", placeholder: "Configure palette settings..." }
};

function enterCommandMode(modeId) {
  currentCommandMode = modeId;
  commandModeParams = {};
  selectedIndex = 0;

  const metadata = CommandModeMetadata[modeId];
  if (metadata) {
    ccBackBtn.classList.remove("hidden");
    ccCommandTagContainer.innerHTML = `
      <div class="cc-command-pill">
        <span>${metadata.icon}</span>
        <span>${metadata.name}</span>
      </div>
    `;
    ccSearchInput.value = "";
    ccSearchInput.style.color = "#ffffff";
    ccSearchInput.placeholder = metadata.placeholder;
    activeQuery = "";
  }
  
  // Clear autocomplete suggestion
  activeSuggestion = "";
  const shadowEl = ccBackdrop ? ccBackdrop.querySelector(".cc-autocomplete-shadow") : null;
  if (shadowEl) shadowEl.innerHTML = "";

  ccSearchInput.focus();
  renderSearchResults("");
}

function exitCommandMode(refresh = true) {
  currentCommandMode = null;
  commandModeParams = {};
  selectedIndex = 0;

  if (ccBackBtn) ccBackBtn.classList.add("hidden");
  if (ccCommandTagContainer) ccCommandTagContainer.innerHTML = "";
  if (ccSearchInput) {
    ccSearchInput.placeholder = "Search...";
    ccSearchInput.value = "";
    ccSearchInput.style.color = "#ffffff";
  }

  // Clear autocomplete suggestion
  activeSuggestion = "";
  const shadowEl = ccBackdrop ? ccBackdrop.querySelector(".cc-autocomplete-shadow") : null;
  if (shadowEl) shadowEl.innerHTML = "";

  if (refresh) {
    ccSearchInput.focus();
    renderSearchResults("");
  }
}

// -------------------------------------------------------------
// CREATE PALETTE ELEMENT (SHADOW DOM)
// -------------------------------------------------------------
function createCommandPalette() {
  ccRoot = document.createElement("div");
  ccRoot.id = "smart-command-palette-root";
  ccRoot.style.cssText = "position:fixed; top:0; left:0; width:100vw; height:100vh; z-index:2147483647; pointer-events:none;";
  document.body.appendChild(ccRoot);

  ccShadow = ccRoot.attachShadow({ mode: "open" });

  const style = document.createElement("style");
  style.textContent = `
    @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600;700&display=swap');
    
    :host {
      all: initial;
    }
    /* Sleek custom scrollbars */
    ::-webkit-scrollbar {
      width: 6px;
      height: 6px;
    }
    ::-webkit-scrollbar-track {
      background: transparent;
    }
    ::-webkit-scrollbar-thumb {
      background: rgba(255, 255, 255, 0.12);
      border-radius: 10px;
    }
    ::-webkit-scrollbar-thumb:hover {
      background: rgba(255, 255, 255, 0.25);
    }
    .cc-backdrop {
      --cc-width: 600px;
      --cc-font-size-base: 13px;
      --cc-accent-color: #8b5cf6;
      --cc-accent-gradient: linear-gradient(135deg, #a78bfa, #8b5cf6);
      --cc-backdrop-blur: 8px;
      --cc-max-results: 8;

      position: fixed;
      top: 0;
      left: 0;
      width: 100vw;
      height: 100vh;
      background: rgba(4, 5, 8, 0.45);
      backdrop-filter: blur(var(--cc-backdrop-blur));
      -webkit-backdrop-filter: blur(var(--cc-backdrop-blur));
      z-index: 2147483647;
      display: flex;
      justify-content: center;
      align-items: center;
      opacity: 0;
      pointer-events: none;
      transition: opacity 0.16s ease-out;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      color: #f3f4f6;
      font-size: var(--cc-font-size-base);
    }
    .cc-backdrop.active {
      opacity: 1;
      pointer-events: auto;
    }
    .cc-modal {
      width: var(--cc-width);
      max-height: 90vh;
      background: #0e111a; /* Solid dark blue-slate */
      border: 1px solid rgba(255, 255, 255, 0.08);
      border-radius: 12px;
      box-shadow: 0 25px 50px rgba(0, 0, 0, 0.7), inset 0 1px 0 rgba(255, 255, 255, 0.08);
      display: flex;
      flex-direction: column;
      overflow: hidden;
      transform: scale(0.96);
      transition: transform 0.18s cubic-bezier(0.16, 1, 0.3, 1);
      position: relative;
    }
    .cc-backdrop.active .cc-modal {
      transform: scale(1);
    }
    .cc-header {
      display: flex;
      align-items: center;
      padding: 14px 20px;
      border-bottom: 1px solid rgba(255, 255, 255, 0.06);
      gap: 10px;
    }
    .cc-back-btn {
      cursor: pointer;
      font-size: 18px;
      font-weight: 500;
      color: #9ca3af;
      padding: 0 8px;
      display: flex;
      align-items: center;
      border-radius: 4px;
      transition: background 0.15s, color 0.15s;
    }
    .cc-back-btn:hover {
      background: rgba(255, 255, 255, 0.08);
      color: #ffffff;
    }
    .cc-back-btn.hidden {
      display: none;
    }
    .cc-command-tag-container {
      display: flex;
      align-items: center;
      flex-shrink: 0;
    }
    .cc-command-pill {
      display: inline-flex;
      align-items: center;
      background: rgba(255, 255, 255, 0.04);
      border: 1px solid var(--cc-accent-color);
      color: var(--cc-accent-color);
      border-radius: 6px;
      padding: 2px 8px;
      font-size: 12px;
      font-weight: 600;
      gap: 6px;
    }
    .cc-logo {
      color: #9ca3af;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .cc-search-input {
      flex-grow: 1;
      background: transparent;
      border: none;
      outline: none;
      color: #ffffff;
      font-size: calc(var(--cc-font-size-base, 13px) + 2px);
      font-family: inherit;
      height: 24px;
      line-height: 24px;
    }
    .cc-search-input::placeholder {
      color: #4b5563;
    }
    .cc-close {
      cursor: pointer;
      color: rgba(255, 255, 255, 0.3);
      font-size: 14px;
      transition: color 0.15s;
    }
    .cc-close:hover {
      color: #ef4444;
    }
    .cc-content-pane {
      display: flex;
      flex-direction: row;
      position: relative;
      overflow: hidden;
    }
    .cc-results-container {
      flex: 1;
      max-height: calc(52px * var(--cc-max-results, 8) + 30px);
      overflow-y: auto;
      padding: 8px 0;
      display: flex;
      flex-direction: column;
      min-width: 0;
    }
    .cc-group-header {
      font-size: calc(var(--cc-font-size-base, 13px) - 2px);
      font-weight: 600;
      color: #5f6e85;
      text-transform: uppercase;
      letter-spacing: 0.8px;
      padding: 8px 18px 4px 18px;
    }
    .cc-item {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 8px 18px;
      background: transparent;
      cursor: pointer;
      transition: background 0.1s ease;
    }
    .cc-item.selected {
      background: rgba(255, 255, 255, 0.04);
      box-shadow: inset 3px 0 0 var(--cc-accent-color);
    }
    .cc-item-left {
      display: flex;
      align-items: center;
      gap: 12px;
      overflow: hidden;
    }
    .cc-item-icon {
      color: #6b7280;
      display: flex;
      align-items: center;
      width: 16px;
      justify-content: center;
      flex-shrink: 0;
    }
    .cc-item.selected .cc-item-icon {
      color: #9ca3af;
    }
    .cc-item-title-wrap {
      display: flex;
      flex-direction: column;
      overflow: hidden;
    }
    .cc-item-title {
      font-size: calc(var(--cc-font-size-base, 13px) + 0.5px);
      font-weight: 500;
      color: #d1d5db;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .cc-item.selected .cc-item-title {
      color: #ffffff;
    }
    .cc-item-subtitle {
      font-size: calc(var(--cc-font-size-base, 13px) - 2px);
      color: #4b5563;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .cc-item-right {
      display: flex;
      align-items: center;
      gap: 8px;
      flex-shrink: 0;
    }
    .cc-kbd-badge {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      background: rgba(255, 255, 255, 0.05);
      border: 1px solid rgba(255, 255, 255, 0.04);
      color: rgba(255, 255, 255, 0.4);
      border-radius: 4px;
      padding: 1px 5px;
      font-size: 10px;
      font-family: inherit;
    }
    .cc-badge {
      font-size: 9px;
      font-weight: 600;
      text-transform: uppercase;
      padding: 2px 6px;
      border-radius: 4px;
      background: rgba(255, 255, 255, 0.04);
      color: rgba(255, 255, 255, 0.4);
    }
    
    .cc-empty-state {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      height: 100%;
      color: #4b5563;
      font-size: 13px;
      gap: 4px;
    }
    .hidden {
      display: none !important;
    }
    .cc-submenu {
      width: 0px;
      height: 100%;
      background: #0b0d14;
      border-left: 0px solid rgba(255, 255, 255, 0.06);
      transition: all 0.18s ease;
      overflow: hidden;
      display: flex;
      flex-direction: column;
    }
    .cc-submenu.active {
      width: 220px;
      border-left: 1px solid rgba(255, 255, 255, 0.08);
    }
    .cc-submenu-title {
      padding: 14px 16px;
      font-size: 11px;
      font-weight: 600;
      color: #5f6e85;
      border-bottom: 1px solid rgba(255, 255, 255, 0.06);
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    .cc-submenu-list {
      flex-grow: 1;
      overflow-y: auto;
      padding: 6px;
      display: flex;
      flex-direction: column;
      gap: 2px;
    }
    .cc-submenu-item {
      display: flex;
      align-items: center;
      padding: 6px 10px;
      border-radius: 6px;
      font-size: 12.5px;
      cursor: pointer;
      color: #9ca3af;
      gap: 8px;
    }
    .cc-submenu-item:hover {
      background: rgba(255, 255, 255, 0.05);
      color: #ffffff;
    }
    .cc-footer {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 10px 20px;
      background: #090b10;
      border-top: 1px solid rgba(255, 255, 255, 0.06);
      font-size: 10.5px;
      color: #4b5563;
    }
    .cc-breadcrumbs {
      font-weight: 500;
      color: #6b7280;
      display: flex;
      align-items: center;
    }
    .cc-breadcrumb-badge {
      background: rgba(255, 255, 255, 0.04);
      border: 1px solid rgba(255, 255, 255, 0.12);
      padding: 1px 6px;
      border-radius: 4px;
      color: #e2e8f0;
      margin-left: 6px;
      font-weight: 600;
      font-size: 10px;
    }
    .cc-shortcuts {
      display: flex;
      gap: 12px;
    }
    .cc-shortcuts span {
      background: rgba(255, 255, 255, 0.04);
      border: 1px solid rgba(255, 255, 255, 0.08);
      padding: 1px 5px;
      border-radius: 3px;
      color: #9ca3af;
    }
    
    .cc-audio-meter-panel {
      padding: 10px;
      background: rgba(255, 255, 255, 0.02);
      border-radius: 8px;
      margin: 8px 18px;
      display: flex;
      flex-direction: column;
      gap: 4px;
    }
    .cc-meter-row {
      display: flex;
      justify-content: space-between;
      font-size: 11px;
      color: #9ca3af;
    }
    .cc-meter-bar-outer {
      height: 4px;
      background: rgba(255, 255, 255, 0.08);
      border-radius: 2px;
      overflow: hidden;
    }
    .cc-meter-bar-inner {
      height: 100%;
      width: 0%;
      background: linear-gradient(90deg, #10b981, #f59e0b);
      transition: width 0.1s;
    }
    .cc-dropzone {
      border: 1px dashed rgba(255, 255, 255, 0.12);
      border-radius: 8px;
      padding: 18px;
      text-align: center;
      color: #6b7280;
      cursor: pointer;
      margin: 8px 18px;
    }
    .cc-dropzone.active {
      border-color: #8b5cf6;
      background: rgba(139, 92, 246, 0.03);
    }
    .cc-screenshot-crop {
      position: fixed;
      top: 0;
      left: 0;
      width: 100vw;
      height: 100vh;
      background: rgba(0,0,0,0.3);
      z-index: 2147483645;
      cursor: crosshair;
    }
    .cc-canvas-draw-overlay {
      position: fixed;
      top: 8%;
      left: 8%;
      width: 84%;
      height: 84%;
      background: #0e111a;
      border: 1px solid rgba(255,255,255,0.1);
      border-radius: 12px;
      box-shadow: 0 20px 40px rgba(0,0,0,0.8);
      z-index: 2147483646;
      display: flex;
      flex-direction: column;
      overflow: hidden;
    }
    .cc-input-container {
      position: relative;
      flex-grow: 1;
      display: flex;
      align-items: center;
    }
    .cc-autocomplete-shadow {
      position: absolute;
      left: 0;
      top: 0;
      color: rgba(255, 255, 255, 0.25);
      font-size: 15px;
      font-family: inherit;
      pointer-events: none;
      white-space: pre;
      line-height: 24px;
      height: 24px;
      font-weight: 400;
    }
  `;
  ccShadow.appendChild(style);

  ccBackdrop = document.createElement("div");
  ccBackdrop.className = "cc-backdrop";

  ccBackdrop.innerHTML = `
    <div class="cc-modal">
      <div class="cc-header">
        <div class="cc-back-btn hidden">‹</div>
        <div class="cc-command-tag-container"></div>
        <span class="cc-logo">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
        </span>
        <div class="cc-input-container">
          <span class="cc-autocomplete-shadow"></span>
          <input class="cc-search-input" placeholder="Search..." autocomplete="off">
        </div>
        <span class="cc-close">✕</span>
      </div>
      <div class="cc-content-pane">
        <div class="cc-results-container">
          <div class="cc-group-header">Recent searches</div>
          <div class="cc-results-list"></div>
          <div class="cc-empty-state hidden">
            <span>No results found</span>
          </div>
        </div>
        <div class="cc-submenu">
          <div class="cc-submenu-title">Actions</div>
          <div class="cc-submenu-list"></div>
        </div>
      </div>
      <div class="cc-footer">
        <div class="cc-breadcrumbs">Command Palette</div>
        <div class="cc-shortcuts">
          <span>↑↓ Navigate</span>
          <span>↵ Run</span>
          <span>Alt+Enter New Tab</span>
          <span>Alt+K Actions</span>
          <span>Esc Close</span>
        </div>
      </div>
    </div>
  `;

  ccShadow.appendChild(ccBackdrop);

  // Bind UI Elements
  ccSearchInput = ccBackdrop.querySelector(".cc-search-input");
  ccResultsList = ccBackdrop.querySelector(".cc-results-container");
  ccEmptyState = ccBackdrop.querySelector(".cc-empty-state");
  ccBreadcrumbs = ccBackdrop.querySelector(".cc-breadcrumbs");
  ccSubmenu = ccBackdrop.querySelector(".cc-submenu");
  ccBackBtn = ccBackdrop.querySelector(".cc-back-btn");
  ccCommandTagContainer = ccBackdrop.querySelector(".cc-command-tag-container");

  setupUIEventListeners();
  applyPaletteSettings();
}

// -------------------------------------------------------------
// EVENT BINDINGS
// -------------------------------------------------------------
function setupUIEventListeners() {
  // Stop key propagation from leaking to page
  ccBackdrop.addEventListener("keydown", (e) => {
    e.stopPropagation();
  });
  ccBackdrop.addEventListener("keyup", (e) => {
    e.stopPropagation();
  });
  ccBackdrop.addEventListener("keypress", (e) => {
    e.stopPropagation();
  });

  // Backdrop close click
  ccBackdrop.addEventListener("click", (e) => {
    if (e.target === ccBackdrop) closeCommandPalette();
  });

  // Close icon click
  ccBackdrop.querySelector(".cc-close").addEventListener("click", closeCommandPalette);

  // Back button click
  ccBackBtn.addEventListener("click", () => {
    exitCommandMode();
  });

  // Search input events
  ccSearchInput.addEventListener("input", (e) => {
    const val = e.target.value;
    if (val.startsWith("/")) {
      ccSearchInput.style.color = "#60a5fa";
    } else {
      ccSearchInput.style.color = "#ffffff";
    }
    handleSearchChange(val);
  });

  ccSearchInput.addEventListener("keydown", (e) => {
    if ((e.key === "Tab" || e.key === "ArrowRight") && activeSuggestion) {
      if (ccSearchInput.selectionStart === ccSearchInput.value.length) {
        e.preventDefault();
        ccSearchInput.value = activeSuggestion;
        if (activeSuggestion.startsWith("/")) {
          ccSearchInput.style.color = "#60a5fa";
        }
        handleSearchChange(activeSuggestion);
        return;
      }
    }

    if (e.key === "Backspace" && !ccSearchInput.value) {
      if (currentCommandMode) {
        e.preventDefault();
        if (commandModeParams.step === "view_content") {
          delete commandModeParams.step;
          renderSearchResults("");
        } else if (commandModeParams.selectedNote) {
          delete commandModeParams.selectedNote;
          renderSearchResults("");
        } else if (commandModeParams.targetLang) {
          delete commandModeParams.targetLang;
          ccSearchInput.placeholder = "Select target language...";
          renderSearchResults("");
        } else {
          exitCommandMode();
        }
        return;
      }
    }

    if (e.key === "ArrowDown") {
      e.preventDefault();
      moveSelection(1);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      moveSelection(-1);
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (e.ctrlKey || e.altKey) {
        executeMainAction(true); // new tab
      } else {
        executeMainAction(false); // standard run
      }
    } else if (e.key === "Escape") {
      e.preventDefault();
      if (isSubmenuOpen) {
        closeSubmenu();
      } else {
        closeCommandPalette();
      }
    } else if (e.key.toLowerCase() === "k" && (e.ctrlKey || e.altKey)) {
      e.preventDefault();
      toggleSubmenu();
    } else if (e.key === "Delete") {
      e.preventDefault();
      triggerDeleteAction();
    }
  });
}

function closeSubmenu() {
  isSubmenuOpen = false;
  ccSubmenu.classList.remove("active");
  ccSearchInput.focus();
}

function toggleSubmenu() {
  if (visibleItems.length === 0) return;
  isSubmenuOpen = !isSubmenuOpen;
  if (isSubmenuOpen) {
    ccSubmenu.classList.add("active");
    renderSubmenuActions();
  } else {
    ccSubmenu.classList.remove("active");
    ccSearchInput.focus();
  }
}

// -------------------------------------------------------------
// FUZZY SEARCH ENGINE & ROUTER
// -------------------------------------------------------------
async function handleSearchChange(query) {
  activeQuery = query;
  selectedIndex = 0;
  closeSubmenu();

  // "Auto-trigger command mode" if user types aliases directly and hits Space
  const cleanQ = query.trim().toLowerCase();
  
  if (!currentCommandMode) {
    if (cleanQ === "/image") {
      enterCommandMode("image_tools");
      return;
    } else if (cleanQ === "/pdf") {
      enterCommandMode("pdf_tools");
      return;
    } else if (cleanQ === "/note") {
      enterCommandMode("note_tools");
      return;
    } else if (cleanQ === "/boost") {
      enterCommandMode("boost_tools");
      return;
    } else if (cleanQ === "/timer") {
      enterCommandMode("timer_tools");
      return;
    } else if (cleanQ === "/translate") {
      enterCommandMode("translate_tools");
      return;
    } else if (cleanQ === "/help") {
      enterCommandMode("help_tools");
      return;
    } else if (cleanQ === "/wizard") {
      chrome.runtime.sendMessage({ action: "open_dashboard", view: "wizard" });
      closeCommandPalette();
      return;
    } else if (cleanQ === "/bookmarks") {
      enterCommandMode("bookmark_tools");
      return;
    } else if (cleanQ === "/downloads") {
      enterCommandMode("download_tools");
      return;
    } else if (cleanQ === "/history") {
      enterCommandMode("history_tools");
      return;
    } else if (cleanQ === "/tabs") {
      enterCommandMode("tab_tools");
      return;
    } else if (cleanQ === "/mappings") {
      enterCommandMode("mappings_tools");
      return;
    } else if (cleanQ === "/settings") {
      enterCommandMode("settings_tools");
      return;
    }
  }

  await renderSearchResults(activeQuery);
}

// Define dynamic vector icons
const Icons = {
  search: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>`,
  folder: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path></svg>`,
  file: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"></path><polyline points="13 2 13 9 20 9"></polyline></svg>`,
  globe: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"></circle><line x1="2" y1="12" x2="22" y2="12"></line><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1 4-10z"></path></svg>`,
  hash: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="4" y1="9" x2="20" y2="9"></line><line x1="4" y1="15" x2="20" y2="15"></line><line x1="10" y1="3" x2="8" y2="21"></line><line x1="16" y1="3" x2="14" y2="21"></line></svg>`,
  tag: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"></path><line x1="7" y1="7" x2="7.01" y2="7"></line></svg>`,
  download: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>`,
  clock: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>`,
  volume: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"></path></svg>`,
  crop: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M6.13 1L6 16a2 2 0 0 0 2 2h15"></path><path d="M1 6.13L16 6a2 2 0 0 1 2 2v15"></path></svg>`
};

async function renderSearchResults(query) {
  const requestId = ++currentSearchRequestId;
  const startedInMode = currentCommandMode;
  
  let scored = [];
  const qClean = query.trim().toLowerCase();

  // --- CASE A: COMMAND SUB-MENU PARAMETERS MODE ---
  if (currentCommandMode) {
    scored = await getCommandModeCandidates(currentCommandMode, qClean);
  } else {
    // --- CASE B: ROOT GENERAL SEARCH ---
    let candidates = CommandRegistry.getAll().map(cmd => ({
      id: cmd.id,
      title: cmd.name,
      subtitle: cmd.description,
      icon: cmd.icon || Icons.search,
      type: "command",
      aliases: cmd.aliases || [],
      execute: cmd.execute,
      pinned: cmd.pinned || false,
      favorite: cmd.favorite || false
    }));
    
    // Add custom account mappings
    let mappingsObj = await DB.get("settings", "account_mappings");
    let mappings = mappingsObj ? mappingsObj.value : [];
    
    // Add default mappings for Gmail if none exist
    if (mappings.length === 0) {
      mappings = [
        { id: "gmail_personal", keyword: "gmail", label: "personal", url: "https://mail.google.com/mail/u/0/" },
        { id: "gmail_work", keyword: "gmail", label: "work", url: "https://mail.google.com/mail/u/1/" },
        { id: "gmail_0", keyword: "gmail", label: "0", url: "https://mail.google.com/mail/u/0/" },
        { id: "gmail_1", keyword: "gmail", label: "1", url: "https://mail.google.com/mail/u/1/" }
      ];
      // Save default ones
      await DB.put("settings", { key: "account_mappings", value: mappings });
    }

    mappings.forEach(m => {
      candidates.push({
        id: "mapping_root_" + m.id,
        title: `${m.keyword} (${m.label})`,
        subtitle: `Redirect to: ${m.url}`,
        icon: Icons.globe,
        type: "mapping_redirect",
        mappingData: m,
        aliases: [m.keyword, `${m.keyword} ${m.label}`]
      });
    });
    
    // Prefix command check: e.g. "youtube kdrama" or "/youtube kdrama"
    for (const cmd of CommandRegistry.getAll()) {
      if (cmd.aliases) {
        for (const alias of cmd.aliases) {
          const prefix = alias + " ";
          const slashPrefix = "/" + alias + " ";
          if (qClean.startsWith(prefix) || qClean.startsWith(slashPrefix)) {
            const arg = query.substring(qClean.startsWith(slashPrefix) ? slashPrefix.length : prefix.length).trim();
            candidates.unshift({
              id: cmd.id + "_active",
              title: `${cmd.name} for "${arg}"`,
              subtitle: `Run: ${cmd.description}`,
              icon: cmd.icon || Icons.globe,
              type: "command",
              execute: () => {
                activeQuery = alias + " " + arg; // override query so execute gets correct arg
                cmd.execute();
              },
              score: 9999,
              isPrefixMatch: true
            });
          }
        }
      }
    }

    // Add Clipboard History Clips if query contains '/clipboard'
    if (qClean.startsWith("/clipboard") || qClean === "clipboard") {
      clipboardHistoryCache.forEach((clip, i) => {
        candidates.push({
          id: "clip_" + clip.id,
          title: clip.content,
          subtitle: `Clipboard History • ${new Date(clip.timestamp).toLocaleTimeString()}`,
          icon: Icons.file,
          type: "clipboard",
          clipData: clip,
          favorite: clip.favorite,
          pinned: clip.pinned
        });
      });
    }

    // Calculator check
    const mathRegex = /^[0-9+\-*/().\s^|sqrt|pow|sin|cos|tan|log|pi|e]+$/i;
    const containsMathOperator = /[\+\-\*\/\^]/.test(query) || /sqrt|pow/i.test(query);
    if (query.length > 2 && mathRegex.test(query) && containsMathOperator) {
      try {
        const cleanExpr = query.replace(/\^/g, "**")
                               .replace(/sqrt/gi, "Math.sqrt")
                               .replace(/pow/gi, "Math.pow")
                               .replace(/sin/gi, "Math.sin")
                               .replace(/cos/gi, "Math.cos")
                               .replace(/tan/gi, "Math.tan")
                               .replace(/log/gi, "Math.log")
                               .replace(/pi/gi, "Math.PI")
                               .replace(/e/gi, "Math.E");
        const evalResult = new Function(`return ${cleanExpr}`)();
        if (typeof evalResult === 'number' && !isNaN(evalResult)) {
          candidates.unshift({
            id: "calculator_result",
            title: `Result: ${evalResult}`,
            subtitle: `Calculator output for "${query}"`,
            icon: Icons.search,
            type: "command",
            execute: () => {
              navigator.clipboard.writeText(evalResult.toString());
              showToast("Copied calculator result to clipboard!", "success");
              closeCommandPalette();
            }
          });
        }
      } catch(e) {}
    }

    // Query native Bookmarks & History
    let bookmarkResults = [];
    let historyResults = [];
    let tabResults = [];
    let downloadResults = [];
    let notesResults = [];

    // Query local notes from DB
    const notes = await DB.getNotes();
    notes.forEach(note => {
      notesResults.push({
        id: "note_" + note.id,
        title: note.title,
        subtitle: `Notes • ${note.content.substring(0, 50)}`,
        icon: Icons.file,
        type: "note",
        noteData: note,
        pinned: note.pinned,
        favorite: note.favorite
      });
    });

    if (query.length > 0) {
      const qLower = query.toLowerCase();

      // Query Tabs
      const tabsList = await new Promise(res => chrome.runtime.sendMessage({ action: "get_tabs" }, res));
      
      // Safety Check after Async Call
      if (requestId !== currentSearchRequestId || currentCommandMode !== startedInMode) return;
      
      if (tabsList && Array.isArray(tabsList)) {
        tabsList.forEach(t => {
          if (t.title?.toLowerCase().includes(qLower) || t.url?.toLowerCase().includes(qLower)) {
            tabResults.push({
              id: "tab_" + t.id,
              title: t.title || "Tab",
              subtitle: `Active Tab • ${t.url}`,
              icon: Icons.globe,
              type: "tab",
              tabData: t
            });
          }
        });
      }

      // Query Downloads
      const downloadsList = await new Promise(res => chrome.runtime.sendMessage({ action: "get_downloads", query: query }, res));
      
      // Safety Check after Async Call
      if (requestId !== currentSearchRequestId || currentCommandMode !== startedInMode) return;
      
      if (downloadsList && Array.isArray(downloadsList)) {
        downloadsList.forEach(d => {
          downloadResults.push({
            id: "download_" + d.id,
            title: d.filename.split(/[\\/]/).pop() || "Downloaded File",
            subtitle: `Downloads • ${d.url}`,
            icon: Icons.download,
            type: "download",
            downloadData: d
          });
        });
      }

      // Query Bookmarks from Chrome
      const bkList = await new Promise(res => chrome.runtime.sendMessage({ action: "get_bookmarks_tree" }, res));
      
      // Safety Check after Async Call
      if (requestId !== currentSearchRequestId || currentCommandMode !== startedInMode) return;
      
      function traverseSearch(node) {
        if (node.url && (node.title?.toLowerCase().includes(qLower) || node.url?.toLowerCase().includes(qLower))) {
          bookmarkResults.push({
            id: "bm_" + node.id,
            title: node.title || node.url,
            subtitle: `Bookmark • ${node.url}`,
            icon: Icons.tag,
            type: "bookmark",
            bmData: node
          });
        }
        if (node.children) node.children.forEach(traverseSearch);
      }
      if (bkList && bkList[0]) traverseSearch(bkList[0]);

      // Query History from Chrome
      const histList = await new Promise(res => chrome.runtime.sendMessage({ action: "search_history", query: query }, res));
      
      // Safety Check after Async Call
      if (requestId !== currentSearchRequestId || currentCommandMode !== startedInMode) return;
      
      if (histList && Array.isArray(histList)) {
        histList.forEach(h => {
          historyResults.push({
            id: h.id,
            title: h.title || h.url,
            subtitle: `History • ${h.url}`,
            icon: Icons.clock,
            type: "history",
            histData: h
          });
        });
      }
    }

    // Combine Candidates
    const allCandidates = [
      ...candidates,
      ...notesResults,
      ...tabResults,
      ...downloadResults,
      ...bookmarkResults,
      ...historyResults
    ];

    // Score & Rank
    scored = allCandidates.map(item => {
      if (item.isPrefixMatch) {
        return item;
      }
      let score = 0;
      const titleLower = item.title.toLowerCase();
      const subLower = (item.subtitle || "").toLowerCase();

      if (qClean) {
        if (titleLower === qClean) score += 100;
        else if (titleLower.startsWith(qClean)) score += 80;
        else if (titleLower.includes(qClean)) score += 50;
        else if (subLower.includes(qClean)) score += 20;

        if (item.aliases && item.aliases.some(a => a.toLowerCase().includes(qClean))) {
          score += 60;
        }
      } else {
        score += 1;
      }

      // Command Stats boosting
      const stats = commandStats[item.id];
      if (stats) {
        score += Math.min(20, stats.frequency * 2);
      }

      return { ...item, score };
    });

    if (qClean) {
      scored = scored.filter(item => item.score > 0 || item.isPrefixMatch);
    }

    // Sort: Pinned > Favorite > Score
    scored.sort((a, b) => {
      if (a.pinned && !b.pinned) return -1;
      if (!a.pinned && b.pinned) return 1;
      if (a.favorite && !b.favorite) return -1;
      if (!a.favorite && b.favorite) return 1;
      return b.score - a.score;
    });
  }

  // Safety Check before Rendering
  if (requestId !== currentSearchRequestId || currentCommandMode !== startedInMode) return;

  visibleItems = scored.slice(0, 30);
  renderResultsUI();
  updateAutocompleteShadow(query);
}

function updateAutocompleteShadow(query) {
  const shadowEl = ccBackdrop ? ccBackdrop.querySelector(".cc-autocomplete-shadow") : null;
  if (!shadowEl) return;
  
  activeSuggestion = "";
  shadowEl.innerHTML = "";
  
  if (!query) return;

  const qLower = query.toLowerCase();

  // Find matches from CommandRegistry aliases first
  for (const cmd of CommandRegistry.getAll()) {
    if (cmd.aliases) {
      for (const alias of cmd.aliases) {
        const slashAlias = "/" + alias;
        if (slashAlias.startsWith(qLower) && slashAlias !== qLower) {
          activeSuggestion = query + slashAlias.substring(query.length);
          break;
        } else if (alias.startsWith(qLower) && alias !== qLower) {
          activeSuggestion = query + alias.substring(query.length);
          break;
        }
      }
    }
    if (activeSuggestion) break;
  }

  // If no alias match, check top visible item title
  if (!activeSuggestion && visibleItems[0]) {
    const topTitle = visibleItems[0].title.toLowerCase();
    const topClean = topTitle.startsWith("/") ? topTitle : "/" + topTitle;
    
    if (topTitle.startsWith(qLower) && topTitle !== qLower) {
      activeSuggestion = query + visibleItems[0].title.substring(query.length);
    } else if (topClean.startsWith(qLower) && topClean !== qLower) {
      activeSuggestion = query + (visibleItems[0].title.startsWith("/") ? "" : "/") + visibleItems[0].title.substring(qLower.startsWith("/") ? query.length : query.length + 1);
    }
  }

  if (activeSuggestion) {
    shadowEl.innerHTML = `<span style="color:transparent">${query}</span><span>${activeSuggestion.substring(query.length)}</span>`;
  }
}

// -------------------------------------------------------------
// GET CANDIDATES FOR COMMAND MODES
// -------------------------------------------------------------
async function getCommandModeCandidates(modeId, filter) {
  let list = [];

  try {
    switch (modeId) {
    case "image_tools":
      if (commandModeParams.step === "resize") {
        list = [
          { id: "img_res_800", title: "Scale to 800px Width", subtitle: "Maintains proportional height", icon: Icons.crop, type: "subaction", run: () => runImageResizer(800) },
          { id: "img_res_1200", title: "Scale to 1200px Width", subtitle: "Proportional scaling", icon: Icons.crop, type: "subaction", run: () => runImageResizer(1200) },
          { id: "img_res_1080p", title: "Full HD (1920x1080)", subtitle: "Crops/stretches to standard display", icon: Icons.crop, type: "subaction", run: () => runImageResizer(1920, 1080) },
          { id: "img_res_50", title: "Scale down by 50%", subtitle: "Halves image resolution", icon: Icons.crop, type: "subaction", run: () => runImageResizer(0.5) }
        ];
      } else {
        list = [
          { id: "cmd_clip_dl", title: "Download Clipboard Image", subtitle: "Extract and download any copied image file", icon: Icons.download, type: "subaction", run: () => executeDirectCommand("clipboard_download") },
          { id: "cmd_clip_resize", title: "Resize Clipboard Image...", subtitle: "Select dimensions and scaling properties", icon: Icons.crop, type: "subaction", run: () => { commandModeParams.step = "resize"; renderSearchResults(""); } },
          { id: "cmd_clip_webp", title: "Convert to WebP format", subtitle: "Re-save copied image as WebP", icon: Icons.globe, type: "subaction", run: () => executeDirectCommand("clipboard_image_convert", "webp") },
          { id: "cmd_clip_png", title: "Convert to PNG format", subtitle: "Re-save copied image as PNG", icon: Icons.file, type: "subaction", run: () => executeDirectCommand("clipboard_image_convert", "png") },
          { id: "cmd_clip_jpg", title: "Convert to JPG format", subtitle: "Re-save copied image as JPG", icon: Icons.tag, type: "subaction", run: () => executeDirectCommand("clipboard_image_convert", "jpg") }
        ];
      }
      break;

    case "pdf_tools":
      list = [
        { id: "cmd_pdf_compress", title: "Compress PDF Document", subtitle: "Reduces size using native streams", icon: Icons.file, type: "subaction", run: () => executeDirectCommand("pdf_compressor") },
        { id: "cmd_pdf_merge", title: "Merge PDF Documents (Bulk Join)", subtitle: "Merges multiple local PDF files", icon: Icons.folder, type: "subaction", run: () => executeDirectCommand("pdf_merge") }
      ];
      break;

    case "note_tools":
      if (commandModeParams.step === "view_content") {
        const noteTitle = commandModeParams.selectedNote;
        const note = await DB.get("notes", noteTitle);
        const content = note ? note.content : "(empty)";
        list = [
          { id: "note_view_back", title: "‹ Back to Note Actions", subtitle: "Return to note options list", icon: Icons.crop, type: "subaction", run: () => { delete commandModeParams.step; renderSearchResults(""); } },
          { id: "note_text_display", title: noteTitle, subtitle: content, icon: Icons.file, type: "static_text" }
        ];
      } else if (commandModeParams.selectedNote) {
        const noteTitle = commandModeParams.selectedNote;
        list = [
          { id: "note_act_append", title: `Append text to "${noteTitle}"`, subtitle: "Type content in search input and run", icon: Icons.file, type: "subaction", run: () => appendNoteFromInput(noteTitle) },
          { id: "note_act_view", title: `View Note content`, subtitle: "View note content directly inside palette", icon: Icons.search, type: "subaction", run: () => viewNoteContent(noteTitle) },
          { id: "note_act_del", title: `Delete Note`, subtitle: "Permanently erase this note", icon: Icons.close, type: "subaction", run: () => deleteNoteFromMode(noteTitle) }
        ];
      } else {
        list = [
          { id: "note_act_new", title: "🆕 Create New Note", subtitle: "Creates note using query as title", icon: Icons.file, type: "subaction", run: () => createNoteFromInput() }
        ];
        const notes = await DB.getNotes();
        notes.forEach(n => {
          list.push({
            id: "note_select_" + n.id,
            title: `📝 Note: ${n.title}`,
            subtitle: `Contains: ${n.content.substring(0, 40)}...`,
            icon: Icons.file,
            type: "subaction",
            run: () => {
              commandModeParams.selectedNote = n.title;
              renderSearchResults("");
            }
          });
        });
      }
      break;

    case "boost_tools":
      list = [
        { id: "boost_lvl_100", title: "Boost to 100% (Default)", subtitle: "Standard audio level", icon: Icons.volume, type: "subaction", run: () => runAudioBoost(100) },
        { id: "boost_lvl_150", title: "Boost to 150%", subtitle: "Adds clean volume boost", icon: Icons.volume, type: "subaction", run: () => runAudioBoost(150) },
        { id: "boost_lvl_200", title: "Boost to 200%", subtitle: "Ideal for quiet media", icon: Icons.volume, type: "subaction", run: () => runAudioBoost(200) },
        { id: "boost_lvl_250", title: "Boost to 250%", subtitle: "Loud volume", icon: Icons.volume, type: "subaction", run: () => runAudioBoost(250) },
        { id: "boost_lvl_300", title: "Boost to 300% (Maximum)", subtitle: "Safety compressor active", icon: Icons.volume, type: "subaction", run: () => runAudioBoost(300) }
      ];
      break;

    case "timer_tools":
      list = [
        { id: "timer_int_5", title: "5 Minute Timer", subtitle: "Set custom timer", icon: Icons.clock, type: "subaction", run: () => runTimer(5, "5 Min Timer") },
        { id: "timer_int_10", title: "10 Minute Timer", subtitle: "Set custom timer", icon: Icons.clock, type: "subaction", run: () => runTimer(10, "10 Min Timer") },
        { id: "timer_int_25", title: "25 Minute Pomodoro", subtitle: "Focused session timer", icon: Icons.clock, type: "subaction", run: () => runTimer(25, "Pomodoro Session") },
        { id: "timer_int_60", title: "1 Hour Timer", subtitle: "Long interval countdown", icon: Icons.clock, type: "subaction", run: () => runTimer(60, "1 Hour Timer") },
        { id: "timer_int_cust", title: "Custom Timer", subtitle: "Type minutes inside search input and select", icon: Icons.clock, type: "subaction", run: () => runCustomTimer() }
      ];
      break;

    case "translate_tools":
      if (commandModeParams.targetLang) {
        list = [
          { id: "trans_exec", title: `Translate text to ${commandModeParams.targetLang.toUpperCase()}`, subtitle: "Type phrase in search input and execute", icon: Icons.globe, type: "subaction", run: () => runTranslateText() }
        ];
      } else {
        const langs = ["French", "Spanish", "Japanese", "German", "Chinese", "Hindi", "Russian"];
        langs.forEach(l => {
          list.push({
            id: "trans_lang_" + l.toLowerCase(),
            title: `🗣 Translate to ${l}`,
            subtitle: "Select language",
            icon: Icons.globe,
            type: "subaction",
            run: () => {
              commandModeParams.targetLang = l.toLowerCase();
              ccSearchInput.placeholder = `Type text to translate to ${l}...`;
              renderSearchResults("");
            }
          });
        });
      }
      break;

    case "help_tools":
      const guideText = `SMART COMMAND PALETTE GUIDE
      
Keyboard Shortcuts:
• Alt+A           : Open / Close Palette
• Ctrl+Shift+P    : Alternative Open hotkey
• Up / Down Arrow : Navigate results list
• Enter           : Execute / Run action
• Alt+Enter       : Open in new browser tab
• Alt+K           : Open sliding Action Sheet
• Backspace       : Exit sub-command modes
• Esc             : Close palette

Prefix Commands (type directly in search):
• note          : Enter Note Manager
• boost         : Set Audio Booster gain (100% - 300%)
• pdf           : Compress or merge PDF documents
• image         : Resize, convert, or download clipboard images
• timer         : Start countdown or Pomodoro (e.g. timer 25)
• translate     : Translate text inline (e.g. translate hello to french)
• collections   : Browse custom workspace collections
• /youtube <q>  : Search YouTube media
• /twitch <q>   : Search Twitch streaming media
• /mkvdrama <q> : Search MKV Drama series
• /bollyflix <q>: Search Bollyflix catalog
• /katmovies <q>: Search KatMovieHD catalog`;

      list = [
        { id: "help_view_back", title: "‹ Back to Search", subtitle: "Return to general search results", icon: Icons.crop, type: "subaction", run: () => exitCommandMode() },
        { id: "help_text_display", title: "Command Palette Guide", subtitle: guideText, icon: "💡", type: "static_text" }
      ];
      break;

    case "bookmark_tools":
      {
        const bkList = await new Promise(res => chrome.runtime.sendMessage({ action: "get_bookmarks_tree" }, res));
        let bookmarks = [];
        function traverse(node) {
          if (node.url) {
            bookmarks.push({
              id: "bm_" + node.id,
              title: node.title || node.url,
              subtitle: node.url,
              icon: Icons.tag,
              type: "bookmark",
              bmData: node
            });
          }
          if (node.children) node.children.forEach(traverse);
        }
        if (bkList && bkList[0]) traverse(bkList[0]);
        if (filter) {
          bookmarks = bookmarks.filter(b => b.title.toLowerCase().includes(filter) || b.subtitle.toLowerCase().includes(filter));
        }
        list = bookmarks;
      }
      break;

    case "download_tools":
      {
        const downloadsList = await new Promise(res => chrome.runtime.sendMessage({ action: "get_downloads", query: filter || "" }, res));
        if (downloadsList && Array.isArray(downloadsList)) {
          list = downloadsList.map(d => ({
            id: "download_" + d.id,
            title: d.filename.split(/[\\/]/).pop() || "Downloaded File",
            subtitle: d.url,
            icon: Icons.download,
            type: "download",
            downloadData: d
          }));
        }
      }
      break;

    case "history_tools":
      {
        const histList = await new Promise(res => chrome.runtime.sendMessage({ action: "search_history", query: filter || "" }, res));
        if (histList && Array.isArray(histList)) {
          list = histList.map(h => ({
            id: h.id,
            title: h.title || h.url,
            subtitle: h.url,
            icon: Icons.clock,
            type: "history",
            histData: h
          }));
        }
      }
      break;

    case "tab_tools":
      {
        const tabsList = await new Promise(res => chrome.runtime.sendMessage({ action: "get_tabs" }, res));
        if (tabsList && Array.isArray(tabsList)) {
          let tabs = tabsList.map(t => ({
            id: "tab_" + t.id,
            title: t.title || "Tab",
            subtitle: t.url,
            icon: Icons.globe,
            type: "tab",
            tabData: t
          }));
          if (filter) {
            tabs = tabs.filter(t => t.title.toLowerCase().includes(filter) || t.subtitle.toLowerCase().includes(filter));
          }
          list = tabs;
        }
      }
      break;

    case "mappings_tools":
      {
        let mappingsObj = await DB.get("settings", "account_mappings");
        let mappings = mappingsObj ? mappingsObj.value : [];
        
        let title = "➕ Create New Mapping";
        let subtitle = "Type label or '<keyword> <label> <url>' to map current or custom page";
        
        if (filter) {
          const parsed = parseMappingInput(filter);
          if (parsed.url === window.location.href) {
            title = `➕ Map Current Page as: ${parsed.keyword} (${parsed.label})`;
            subtitle = "Press Enter to map this webpage under these parameters";
          } else {
            title = `➕ Map Custom URL: ${parsed.keyword} (${parsed.label})`;
            subtitle = `URL: ${parsed.url}`;
          }
        }

        list = [
          {
            id: "mapping_add_new",
            title: title,
            subtitle: subtitle,
            icon: Icons.globe,
            type: "subaction",
            alwaysKeep: true,
            run: () => createMappingFromInput()
          }
        ];
        
        mappings.forEach(m => {
          list.push({
            id: "mapping_item_" + m.id,
            title: `🔗 ${m.keyword} (${m.label})`,
            subtitle: `Redirects to: ${m.url}`,
            icon: Icons.globe,
            type: "mapping",
            mappingData: m
          });
        });
      }
      break;

    case "settings_tools":
      {
        const config = await getPaletteConfig();
        
        list = [
          // Font Size options
          {
            id: "setting_font_small",
            title: "Set Font Size: Small (11px)",
            subtitle: config.fontSize === "11px" ? "⚡ Current setting" : "Change palette font size to small",
            icon: "🔤",
            type: "subaction",
            run: () => updatePaletteSetting("fontSize", "11px")
          },
          {
            id: "setting_font_normal",
            title: "Set Font Size: Normal (13px)",
            subtitle: config.fontSize === "13px" ? "⚡ Current setting" : "Change palette font size to normal",
            icon: "🔤",
            type: "subaction",
            run: () => updatePaletteSetting("fontSize", "13px")
          },
          {
            id: "setting_font_large",
            title: "Set Font Size: Large (15px)",
            subtitle: config.fontSize === "15px" ? "⚡ Current setting" : "Change palette font size to large",
            icon: "🔤",
            type: "subaction",
            run: () => updatePaletteSetting("fontSize", "15px")
          },
          
          // Width options
          {
            id: "setting_width_compact",
            title: "Set Palette Width: Compact (500px)",
            subtitle: config.width === "500px" ? "⚡ Current setting" : "Change layout width",
            icon: "📏",
            type: "subaction",
            run: () => updatePaletteSetting("width", "500px")
          },
          {
            id: "setting_width_default",
            title: "Set Palette Width: Default (600px)",
            subtitle: config.width === "600px" ? "⚡ Current setting" : "Change layout width",
            icon: "📏",
            type: "subaction",
            run: () => updatePaletteSetting("width", "600px")
          },
          {
            id: "setting_width_wide",
            title: "Set Palette Width: Wide (700px)",
            subtitle: config.width === "700px" ? "⚡ Current setting" : "Change layout width",
            icon: "📏",
            type: "subaction",
            run: () => updatePaletteSetting("width", "700px")
          },
          {
            id: "setting_width_longest",
            title: "Set Palette Width: Longest (800px)",
            subtitle: config.width === "800px" ? "⚡ Current setting" : "Change layout width",
            icon: "📏",
            type: "subaction",
            run: () => updatePaletteSetting("width", "800px")
          },

          // Accent colors
          {
            id: "setting_accent_purple",
            title: "Accent Color: Violet Purple (Default)",
            subtitle: config.accent === "purple" ? "⚡ Current setting" : "Set accent theme to Violet",
            icon: "🎨",
            type: "subaction",
            run: () => updatePaletteSetting("accent", "purple")
          },
          {
            id: "setting_accent_blue",
            title: "Accent Color: Ice Blue",
            subtitle: config.accent === "blue" ? "⚡ Current setting" : "Set accent theme to Blue",
            icon: "🎨",
            type: "subaction",
            run: () => updatePaletteSetting("accent", "blue")
          },
          {
            id: "setting_accent_green",
            title: "Accent Color: Emerald Green",
            subtitle: config.accent === "green" ? "⚡ Current setting" : "Set accent theme to Green",
            icon: "🎨",
            type: "subaction",
            run: () => updatePaletteSetting("accent", "green")
          },
          {
            id: "setting_accent_orange",
            title: "Accent Color: Sunset Orange",
            subtitle: config.accent === "orange" ? "⚡ Current setting" : "Set accent theme to Orange",
            icon: "🎨",
            type: "subaction",
            run: () => updatePaletteSetting("accent", "orange")
          },
          {
            id: "setting_accent_red",
            title: "Accent Color: Crimson Red",
            subtitle: config.accent === "red" ? "⚡ Current setting" : "Set accent theme to Red",
            icon: "🎨",
            type: "subaction",
            run: () => updatePaletteSetting("accent", "red")
          },

          // Max Results options
          {
            id: "setting_results_5",
            title: "Max Results Displayed: 5 items",
            subtitle: config.maxResults === 5 ? "⚡ Current setting" : "Compact lists layout",
            icon: "🔢",
            type: "subaction",
            run: () => updatePaletteSetting("maxResults", 5)
          },
          {
            id: "setting_results_8",
            title: "Max Results Displayed: 8 items (Default)",
            subtitle: config.maxResults === 8 ? "⚡ Current setting" : "Balanced list display",
            icon: "🔢",
            type: "subaction",
            run: () => updatePaletteSetting("maxResults", 8)
          },
          {
            id: "setting_results_12",
            title: "Max Results Displayed: 12 items",
            subtitle: config.maxResults === 12 ? "⚡ Current setting" : "Extended list display",
            icon: "🔢",
            type: "subaction",
            run: () => updatePaletteSetting("maxResults", 12)
          },

          // Backdrop Blur options
          {
            id: "setting_blur_none",
            title: "Backdrop Blur: None",
            subtitle: config.blur === "none" ? "⚡ Current setting" : "Disable background blur",
            icon: "👁️",
            type: "subaction",
            run: () => updatePaletteSetting("blur", "none")
          },
          {
            id: "setting_blur_sleek",
            title: "Backdrop Blur: Sleek (8px)",
            subtitle: config.blur === "8px" ? "⚡ Current setting" : "Apply standard blur",
            icon: "👁️",
            type: "subaction",
            run: () => updatePaletteSetting("blur", "8px")
          },
          {
            id: "setting_blur_intense",
            title: "Backdrop Blur: Intense Glassmorphism (20px)",
            subtitle: config.blur === "20px" ? "⚡ Current setting" : "Apply heavy cinematic blur",
            icon: "👁️",
            type: "subaction",
            run: () => updatePaletteSetting("blur", "20px")
          }
        ];
      }
      break;
    }
  } catch (err) {
    console.error("Error in getCommandModeCandidates:", err);
  }

  // Filter command candidates list
  if (filter) {
    const fLower = filter.toLowerCase();
    list = list.filter(item => 
      item.alwaysKeep ||
      item.title.toLowerCase().includes(fLower) || 
      item.subtitle.toLowerCase().includes(fLower)
    );
  }

  return list;
}

// -------------------------------------------------------------
// EXECUTE ACTION WORKFLOWS FOR SUB-MODES
// -------------------------------------------------------------
function executeDirectCommand(commandId, args = "") {
  const cmdObj = CommandRegistry.commands.get(commandId);
  if (cmdObj) {
    if (args) {
      activeQuery = `${commandId} ${args}`;
    } else {
      activeQuery = commandId;
    }
    cmdObj.execute();
  }
}

async function createMappingFromInput() {
  const text = ccSearchInput.value.trim();
  if (!text) {
    showToast("Type label or '<keyword> <label> <url>' first!", "error");
    return;
  }
  
  const parsed = parseMappingInput(text);

  let mappingsObj = await DB.get("settings", "account_mappings");
  let mappings = mappingsObj ? mappingsObj.value : [];
  
  const id = parsed.keyword + "_" + parsed.label;
  mappings = mappings.filter(m => m.id !== id);
  
  mappings.push({ id, keyword: parsed.keyword, label: parsed.label, url: parsed.url });
  await DB.put("settings", { key: "account_mappings", value: mappings });
  
  showToast(`Mapping for "${parsed.keyword} (${parsed.label})" created!`, "success");
  ccSearchInput.value = "";
  renderSearchResults("");
}

// Image Resizer action trigger
async function runImageResizer(dim1, dim2 = null) {
  try {
    const items = await navigator.clipboard.read();
    for (const item of items) {
      for (const type of item.types) {
        if (type.startsWith("image/")) {
          const blob = await item.getType(type);
          const img = new Image();
          img.onload = () => {
            let w = dim1;
            let h = dim2;
            if (dim1 < 1) { // scale multiplier (e.g. 0.5)
              w = Math.round(img.width * dim1);
              h = Math.round(img.height * dim1);
            } else if (!dim2) { // width only proportional
              h = Math.round(img.height * (w / img.width));
            }
            
            const canvas = document.createElement("canvas");
            canvas.width = w;
            canvas.height = h;
            const ctx = canvas.getContext("2d");
            ctx.drawImage(img, 0, 0, w, h);
            canvas.toBlob((resizedBlob) => {
              const url = URL.createObjectURL(resizedBlob);
              const a = document.createElement("a");
              a.href = url;
              a.download = `resized_image.png`;
              a.click();
              showToast("Resized image downloaded!", "success");
              exitCommandMode();
              closeCommandPalette();
            }, "image/png");
          };
          img.src = URL.createObjectURL(blob);
          return;
        }
      }
    }
    showToast("No image found on clipboard!", "error");
  } catch(e) {
    showToast("Clipboard access blocked!", "error");
  }
}

// Audio Boost levels
function runAudioBoost(level) {
  enableAudioBooster(level);
}

// Timer triggers
function runTimer(mins, label) {
  chrome.runtime.sendMessage({
    action: "set_timer",
    minutes: mins,
    label: label
  }, () => {
    showToast(`Timer set for ${mins} minutes!`, "success");
    exitCommandMode();
    closeCommandPalette();
  });
}

function runCustomTimer() {
  const val = parseFloat(ccSearchInput.value);
  if (isNaN(val) || val <= 0) {
    showToast("Type minutes in search input first!", "error");
    return;
  }
  runTimer(val, "Timer");
}

// Translation runner
async function runTranslateText() {
  const text = ccSearchInput.value.trim();
  const lang = commandModeParams.targetLang;
  if (!text) {
    showToast("Type text in search input first!", "error");
    return;
  }

  try {
    showToast("Translating...", "success");
    const res = await fetch(`https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=en|${lang.substring(0, 2)}`);
    const data = await res.json();
    const translated = data.responseData?.translatedText || text;
    showToast(`Translated: "${translated}"`, "success");
    exitCommandMode();
    closeCommandPalette();
  } catch(e) {
    showToast("Translation service error", "error");
  }
}

// Notes triggers inside sub-mode
async function createNoteFromInput() {
  const title = ccSearchInput.value.trim();
  if (!title) {
    showToast("Type note title in search bar first!", "error");
    return;
  }
  const noteObj = {
    id: title,
    title: title,
    content: "",
    versions: [],
    tags: [],
    pinned: false,
    favorite: false,
    lastModified: Date.now()
  };
  await DB.put("notes", noteObj);
  showToast(`Note "${title}" created!`, "success");
  commandModeParams.selectedNote = title;
  renderSearchResults("");
}

async function appendNoteFromInput(title) {
  const text = ccSearchInput.value.trim();
  if (!text) {
    showToast("Type content in search bar first!", "error");
    return;
  }
  const existing = await DB.get("notes", title);
  if (existing) {
    existing.versions.unshift({ content: existing.content, timestamp: Date.now() });
    existing.content = existing.content ? existing.content + "\n" + text : text;
    existing.lastModified = Date.now();
    await DB.put("notes", existing);
    showToast(`Appended to note "${title}"!`, "success");
    exitCommandMode();
    closeCommandPalette();
  }
}

async function viewNoteContent(title) {
  commandModeParams.step = "view_content";
  renderSearchResults("");
}

async function deleteNoteFromMode(title) {
  await DB.delete("notes", title);
  showToast("Note deleted!", "success");
  delete commandModeParams.selectedNote;
  renderSearchResults("");
}

// -------------------------------------------------------------
// RENDER GENERAL RESULTS UI
// -------------------------------------------------------------
function renderResultsUI() {
  const listEl = ccResultsList.querySelector(".cc-results-list");
  const headerEl = ccResultsList.querySelector(".cc-group-header");
  listEl.innerHTML = "";

  if (currentCommandMode) {
    const metadata = CommandModeMetadata[currentCommandMode];
    headerEl.textContent = `${metadata.name} Actions`;
  } else if (activeQuery) {
    headerEl.textContent = "Search results";
  } else {
    headerEl.textContent = "Recent searches";
  }

  if (selectedIndex >= visibleItems.length) {
    selectedIndex = Math.max(0, visibleItems.length - 1);
  }

  if (visibleItems.length === 0) {
    ccEmptyState.classList.remove("hidden");
    ccBreadcrumbs.innerHTML = "Command Palette";
    return;
  }
  ccEmptyState.classList.add("hidden");

  visibleItems.forEach((item, idx) => {
    const itemEl = document.createElement("div");
    itemEl.className = `cc-item ${idx === selectedIndex ? "selected" : ""}`;

    if (item.type === "static_text") {
      itemEl.innerHTML = `
        <div class="cc-item-left" style="flex-direction:column; align-items:flex-start; width:100%; gap:8px;">
          <div style="font-weight:600; font-size:13px; color:var(--cc-accent-color); display:flex; align-items:center; gap:8px;">
            <span>${item.icon || "📝"}</span>
            <span>${item.title}</span>
          </div>
          <div style="white-space:pre-wrap; font-family:monospace; font-size:12px; color:#a3b3cc; max-height:220px; overflow-y:auto; width:100%; line-height:1.5; padding:8px; background:rgba(255,255,255,0.02); border-radius:6px; border:1px solid rgba(255,255,255,0.04); box-sizing:border-box;">${item.subtitle}</div>
        </div>
      `;
      itemEl.style.cursor = "default";
    } else {
      let iconHtml = `<span class="cc-item-icon">${Icons.search}</span>`;
      if (typeof item.icon === "string") {
        iconHtml = `<span class="cc-item-icon">${item.icon}</span>`;
      }

      // Show website favicons for bookmarks, tabs, and history entries
      if ((item.type === "bookmark" || item.type === "tab" || item.type === "history") && (item.bmData || item.tabData || item.histData)) {
        const url = (item.bmData?.url || item.tabData?.url || item.histData?.url);
        if (url) {
          const d = BookmarkRules.getDomain(url);
          iconHtml = `<img class="cc-item-icon" src="https://www.google.com/s2/favicons?sz=32&domain=${d}" onerror="this.src='https://www.google.com/s2/favicons?sz=32&domain=google.com'" style="width:14px; height:14px; border-radius:3px;">`;
        }
      }

      let rightBadgeHtml = "";
      if (item.pinned) rightBadgeHtml += `<span style="font-size:11px; margin-right:4px;">📌</span>`;
      if (item.favorite) rightBadgeHtml += `<span style="font-size:11px; margin-right:4px;">⭐</span>`;

      let kbdText = "";
      if (item.type === "tab") kbdText = "↵ Switch";
      else if (item.type === "bookmark") kbdText = "↵ Open";
      else if (item.type === "command") kbdText = "↵ Select";
      else if (item.type === "subaction") kbdText = "↵ Run";
      else if (item.type === "note") kbdText = "↵ Select";
      else if (item.type === "download") kbdText = "↵ Open";
      else kbdText = "↵ Go";

      itemEl.innerHTML = `
        <div class="cc-item-left">
          ${iconHtml}
          <div class="cc-item-title-wrap">
            <span class="cc-item-title">${item.title}</span>
            <span class="cc-item-subtitle">${item.subtitle || ""}</span>
          </div>
        </div>
        <div class="cc-item-right">
          ${rightBadgeHtml}
          <span class="cc-kbd-badge">${kbdText}</span>
        </div>
      `;

      itemEl.addEventListener("click", () => {
        selectedIndex = idx;
        executeMainAction(false);
      });
    }

    listEl.appendChild(itemEl);
  });

  if (visibleItems[selectedIndex]) {
    ccBreadcrumbs.innerHTML = `Command Palette › <span class="cc-breadcrumb-badge">${visibleItems[selectedIndex].title}</span>`;
    if (isSubmenuOpen) {
      renderSubmenuActions();
    }
  } else {
    ccBreadcrumbs.innerHTML = "Command Palette";
  }
}

function moveSelection(direction) {
  const items = ccResultsList.querySelectorAll(".cc-item");
  if (items.length === 0) return;

  selectedIndex = (selectedIndex + direction + items.length) % items.length;

  items.forEach((item, idx) => {
    if (idx === selectedIndex) {
      item.classList.add("selected");
      item.scrollIntoView({ block: "nearest" });
    } else {
      item.classList.remove("selected");
    }
  });

  if (visibleItems[selectedIndex]) {
    ccBreadcrumbs.innerHTML = `Command Palette › <span class="cc-breadcrumb-badge">${visibleItems[selectedIndex].title}</span>`;
    if (isSubmenuOpen) {
      renderSubmenuActions();
    }
  }
}

// -------------------------------------------------------------
// EXECUTE CORE ACTIONS
// -------------------------------------------------------------
async function executeMainAction(inNewTab = false) {
  const item = visibleItems[selectedIndex];
  if (!item) return;

  // Command mode subaction triggers
  if (item.type === "subaction" && typeof item.run === "function") {
    item.run();
    return;
  }

  // Auto-route command mode entries when selected and pressed Enter
  if (item.type === "command") {
    if (item.id === "quick_note") { enterCommandMode("note_tools"); return; }
    else if (item.id === "audio_booster") { enterCommandMode("boost_tools"); return; }
    else if (item.id === "pomodoro_timer") { enterCommandMode("timer_tools"); return; }
    else if (item.id === "translate_utility") { enterCommandMode("translate_tools"); return; }
    else if (item.id === "pdf_merge" || item.id === "pdf_compressor") { enterCommandMode("pdf_tools"); return; }
    else if (item.id === "clipboard_image_resize" || item.id === "clipboard_image_convert" || item.id === "clipboard_download") { enterCommandMode("image_tools"); return; }
    else if (item.id === "search_bookmarks") { enterCommandMode("bookmark_tools"); return; }
    else if (item.id === "search_downloads") { enterCommandMode("download_tools"); return; }
    else if (item.id === "search_history") { enterCommandMode("history_tools"); return; }
    else if (item.id === "search_active_tabs") { enterCommandMode("tab_tools"); return; }
    else if (item.id === "mappings_manager") { enterCommandMode("mappings_tools"); return; }
    else if (item.id === "settings_manager") { enterCommandMode("settings_tools"); return; }
  }

  // Track stats
  const itemId = item.id;
  if (!commandStats[itemId]) {
    commandStats[itemId] = { id: itemId, frequency: 0, lastUsed: 0 };
  }
  commandStats[itemId].frequency++;
  commandStats[itemId].lastUsed = Date.now();
  await DB.put("commands", commandStats[itemId]);

  if (item.type === "command" && typeof item.execute === "function") {
    item.execute();
    return;
  }

  if ((item.type === "mapping" || item.type === "mapping_redirect") && item.mappingData) {
    if (inNewTab) {
      window.open(item.mappingData.url, "_blank");
    } else {
      window.location.href = item.mappingData.url;
    }
    closeCommandPalette();
    return;
  }

  if (item.type === "bookmark" && item.bmData) {
    if (inNewTab) {
      window.open(item.bmData.url, "_blank");
    } else {
      window.location.href = item.bmData.url;
    }
    closeCommandPalette();
    return;
  }

  if (item.type === "history" && item.histData) {
    if (inNewTab) {
      window.open(item.histData.url, "_blank");
    } else {
      window.location.href = item.histData.url;
    }
    closeCommandPalette();
    return;
  }

  if (item.type === "tab" && item.tabData) {
    chrome.runtime.sendMessage({
      action: "activate_tab",
      id: item.tabData.id,
      windowId: item.tabData.windowId
    });
    closeCommandPalette();
    return;
  }

  if (item.type === "download" && item.downloadData) {
    chrome.runtime.sendMessage({ action: "open_download", id: item.downloadData.id });
    closeCommandPalette();
    return;
  }

  if (item.type === "note" && item.noteData) {
    enterCommandMode("note_tools");
    commandModeParams.selectedNote = item.noteData.title;
    renderSearchResults("");
    return;
  }

  if (item.type === "clipboard" && item.clipData) {
    navigator.clipboard.writeText(item.clipData.content);
    showToast("Copied clip to clipboard!", "success");
    closeCommandPalette();
    return;
  }
}

// -------------------------------------------------------------
// CONTEXT ACTIONS SUB-MENU (Ctrl+K)
// -------------------------------------------------------------
function renderSubmenuActions() {
  const item = visibleItems[selectedIndex];
  const listEl = ccSubmenu.querySelector(".cc-submenu-list");
  listEl.innerHTML = "";

  if (!item) return;

  const actions = [];

  // General Actions
  actions.push({
    label: "Open / Run",
    icon: "↵",
    run: () => executeMainAction(false)
  });
  actions.push({
    label: "Open in New Tab",
    icon: "Alt+↵",
    run: () => executeMainAction(true)
  });

  // Favorite toggle
  actions.push({
    label: item.favorite ? "Unfavorite" : "Favorite / Star",
    icon: "⭐",
    run: async () => {
      item.favorite = !item.favorite;
      if (item.type === "note") {
        const note = item.noteData;
        note.favorite = item.favorite;
        await DB.put("notes", note);
      } else {
        await DB.put("favorites", { id: item.id, favorite: item.favorite });
      }
      showToast(item.favorite ? "Added to favorites" : "Removed from favorites", "success");
      renderSearchResults(activeQuery);
      closeSubmenu();
    }
  });

  // Pin toggle
  actions.push({
    label: item.pinned ? "Unpin" : "Pin to Top",
    icon: "📌",
    run: async () => {
      item.pinned = !item.pinned;
      if (item.type === "note") {
        const note = item.noteData;
        note.pinned = item.pinned;
        await DB.put("notes", note);
      } else {
        await DB.put("favorites", { id: item.id, pinned: item.pinned });
      }
      showToast(item.pinned ? "Pinned command" : "Unpinned command", "success");
      renderSearchResults(activeQuery);
      closeSubmenu();
    }
  });

  // Bookmarks details/actions
  if (item.type === "bookmark" && item.bmData) {
    actions.push({
      label: "Copy Bookmark URL",
      icon: "📋",
      run: () => {
        navigator.clipboard.writeText(item.bmData.url);
        showToast("URL copied!", "success");
        closeCommandPalette();
      }
    });
    actions.push({
      label: "Delete Bookmark",
      icon: "🗑",
      run: () => {
        chrome.runtime.sendMessage({ action: "delete_bookmark", id: item.bmData.id, isFolder: false }, () => {
          showToast("Bookmark deleted!", "success");
          renderSearchResults(activeQuery);
          closeSubmenu();
        });
      }
    });
  }

  // Notes details/actions
  if (item.type === "note" && item.noteData) {
    actions.push({
      label: "Edit Note Title",
      icon: "✏",
      run: async () => {
        const newTitle = prompt("Edit note title:", item.noteData.title);
        if (newTitle) {
          const oldNote = item.noteData;
          await DB.delete("notes", oldNote.id);
          oldNote.id = newTitle;
          oldNote.title = newTitle;
          await DB.put("notes", oldNote);
          showToast("Note renamed!", "success");
          renderSearchResults(activeQuery);
        }
        closeSubmenu();
      }
    });
    actions.push({
      label: "Delete Note",
      icon: "🗑",
      run: async () => {
        await DB.delete("notes", item.noteData.id);
        showToast("Note deleted!", "success");
        renderSearchResults(activeQuery);
        closeSubmenu();
      }
    });
  }

  // Tabs details/actions
  if (item.type === "tab" && item.tabData) {
    actions.push({
      label: "Close Tab",
      icon: "✕",
      run: () => {
        chrome.runtime.sendMessage({ action: "close_tab", id: item.tabData.id }, () => {
          showToast("Closed tab!", "success");
          renderSearchResults(activeQuery);
          closeSubmenu();
        });
      }
    });
    actions.push({
      label: "Duplicate Tab",
      icon: "⎘",
      run: () => {
        chrome.runtime.sendMessage({ action: "duplicate_tab", id: item.tabData.id }, () => {
          showToast("Tab duplicated!", "success");
          renderSearchResults(activeQuery);
          closeSubmenu();
        });
      }
    });
    actions.push({
      label: item.tabData.pinned ? "Unpin Tab" : "Pin Tab",
      icon: "📌",
      run: () => {
        chrome.runtime.sendMessage({ action: "set_tab_pinned", id: item.tabData.id, pinned: !item.tabData.pinned }, () => {
          showToast(item.tabData.pinned ? "Tab unpinned!" : "Tab pinned!", "success");
          renderSearchResults(activeQuery);
          closeSubmenu();
        });
      }
    });
    actions.push({
      label: item.tabData.mutedInfo?.muted ? "Unmute Tab" : "Mute Tab",
      icon: "🔇",
      run: () => {
        chrome.runtime.sendMessage({ action: "set_tab_muted", id: item.tabData.id, muted: !item.tabData.mutedInfo?.muted }, () => {
          showToast(item.tabData.mutedInfo?.muted ? "Tab unmuted!" : "Tab muted!", "success");
          renderSearchResults(activeQuery);
          closeSubmenu();
        });
      }
    });
  }

  // Downloads details/actions
  if (item.type === "download" && item.downloadData) {
    actions.push({
      label: "Open Downloaded File",
      icon: "↵",
      run: () => {
        chrome.runtime.sendMessage({ action: "open_download", id: item.downloadData.id });
        closeSubmenu();
      }
    });
    actions.push({
      label: "Clear from Downloads History",
      icon: "🗑",
      run: () => {
        chrome.runtime.sendMessage({ action: "delete_download", id: item.downloadData.id }, () => {
          showToast("Cleared download record!", "success");
          renderSearchResults(activeQuery);
          closeSubmenu();
        });
      }
    });
  }

  // History details/actions
  if (item.type === "history" && item.histData) {
    actions.push({
      label: "Copy History URL",
      icon: "📋",
      run: () => {
        navigator.clipboard.writeText(item.histData.url);
        showToast("URL copied!", "success");
        closeSubmenu();
      }
    });
    actions.push({
      label: "Delete from Browser History",
      icon: "🗑",
      run: () => {
        chrome.runtime.sendMessage({ action: "delete_history_url", url: item.histData.url }, () => {
          showToast("Deleted history record!", "success");
          renderSearchResults(activeQuery);
          closeSubmenu();
        });
      }
    });
  }

  // Mappings details/actions
  if (item.type === "mapping" && item.mappingData) {
    actions.push({
      label: "Delete Account Mapping",
      icon: "🗑",
      run: async () => {
        let mappingsObj = await DB.get("settings", "account_mappings");
        let mappings = mappingsObj ? mappingsObj.value : [];
        mappings = mappings.filter(m => m.id !== item.mappingData.id);
        await DB.put("settings", { key: "account_mappings", value: mappings });
        showToast("Deleted mapping!", "success");
        renderSearchResults(activeQuery);
        closeSubmenu();
      }
    });
  }

  // Clipboard details/actions
  if (item.type === "clipboard" && item.clipData) {
    actions.push({
      label: "Delete Clip from History",
      icon: "🗑",
      run: async () => {
        await DB.delete("clipboard", item.clipData.id);
        showToast("Deleted clip!", "success");
        const clips = await DB.getClipboardHistory(10);
        clipboardHistoryCache = clips;
        renderSearchResults(activeQuery);
        closeSubmenu();
      }
    });
  }

  // Mapping details/actions
  if (item.type === "mapping" && item.mappingData) {
    actions.push({
      label: "Delete Mapping",
      icon: "🗑",
      run: async () => {
        let mappingsObj = await DB.get("settings", "account_mappings");
        let mappings = mappingsObj ? mappingsObj.value : [];
        mappings = mappings.filter(m => m.id !== item.mappingData.id);
        await DB.put("settings", { key: "account_mappings", value: mappings });
        showToast("Mapping deleted!", "success");
        renderSearchResults(activeQuery);
        closeSubmenu();
      }
    });
  }

  // Render list
  actions.forEach(act => {
    const actEl = document.createElement("div");
    actEl.className = "cc-submenu-item";
    actEl.innerHTML = `
      <span style="font-weight:600; color:var(--cc-accent-color);">${act.icon}</span>
      <span>${act.label}</span>
    `;
    actEl.addEventListener("click", () => {
      act.run();
    });
    listEl.appendChild(actEl);
  });
}

function triggerDeleteAction() {
  const item = visibleItems[selectedIndex];
  if (!item) return;

  if (item.type === "note" && item.noteData) {
    DB.delete("notes", item.noteData.id).then(() => {
      showToast("Note deleted!", "success");
      renderSearchResults(activeQuery);
    });
  } else if (item.type === "clipboard" && item.clipData) {
    DB.delete("clipboard", item.clipData.id).then(() => {
      showToast("Clip deleted!", "success");
      DB.getClipboardHistory(10).then(clips => {
        clipboardHistoryCache = clips;
        renderSearchResults(activeQuery);
      });
    });
  } else if (item.type === "mapping" && item.mappingData) {
    DB.get("settings", "account_mappings").then(mappingsObj => {
      let mappings = mappingsObj ? mappingsObj.value : [];
      mappings = mappings.filter(m => m.id !== item.mappingData.id);
      DB.put("settings", { key: "account_mappings", value: mappings }).then(() => {
        showToast("Deleted mapping!", "success");
        renderSearchResults(activeQuery);
      });
    });
  }
}

// -------------------------------------------------------------
// MODULE REGISTRY DEFINITIONS
// -------------------------------------------------------------

// Bookmarks Search Command
CommandRegistry.register({
  id: "search_bookmarks",
  name: "Bookmarks",
  aliases: ["bookmarks", "bm"],
  description: "Enter Bookmarks command mode to browse and search.",
  icon: Icons.tag,
  execute: () => {
    enterCommandMode("bookmark_tools");
  }
});

// Downloads Browse Command
CommandRegistry.register({
  id: "search_downloads",
  name: "Downloads",
  aliases: ["downloads", "dl"],
  description: "Enter Downloads command mode to browse and search.",
  icon: Icons.download,
  execute: () => {
    enterCommandMode("download_tools");
  }
});

// History Search Command
CommandRegistry.register({
  id: "search_history",
  name: "History",
  aliases: ["history", "hist"],
  description: "Enter History command mode to browse and search.",
  icon: Icons.clock,
  execute: () => {
    enterCommandMode("history_tools");
  }
});

// Search Active Tabs Command
CommandRegistry.register({
  id: "search_active_tabs",
  name: "Tabs",
  aliases: ["tabs", "tab", "switchtab"],
  description: "Enter Active Tabs command mode to browse, search, and switch tabs.",
  icon: Icons.globe,
  execute: () => {
    enterCommandMode("tab_tools");
  }
});

// Clipboard History Command
CommandRegistry.register({
  id: "search_clipboard",
  name: "View Clipboard History",
  aliases: ["clipboard", "clip"],
  description: "Browse and search your copied clipboard items.",
  icon: Icons.file,
  execute: () => {
    ccSearchInput.value = "/clipboard";
    handleSearchChange("/clipboard");
  }
});

// Mappings Management Command
CommandRegistry.register({
  id: "mappings_manager",
  name: "Account Mappings",
  aliases: ["mappings", "mapping", "accounts"],
  description: "Configure custom domain and account redirects (e.g. gmail personal ➔ u/0).",
  icon: Icons.globe,
  execute: () => {
    enterCommandMode("mappings_tools");
  }
});

// Quick Map Current Page Command
CommandRegistry.register({
  id: "mapping_new",
  name: "Create Quick Mapping",
  aliases: ["mapping new", "mapping add", "new mapping", "add mapping"],
  description: "Map the current opened URL page to a label/keyword.",
  icon: Icons.globe,
  execute: async () => {
    const parsed = parseMappingInput(activeQuery);
    if (!parsed.label || parsed.label === "default") {
      showToast("Please specify a label, e.g. 'mapping new personal'", "error");
      return;
    }

    let mappingsObj = await DB.get("settings", "account_mappings");
    let mappings = mappingsObj ? mappingsObj.value : [];
    
    const id = parsed.keyword + "_" + parsed.label;
    mappings = mappings.filter(m => m.id !== id);
    
    mappings.push({ id, keyword: parsed.keyword, label: parsed.label, url: parsed.url });
    await DB.put("settings", { key: "account_mappings", value: mappings });
    
    showToast(`Mapped page to: ${parsed.keyword} (${parsed.label})`, "success");
    closeCommandPalette();
  }
});

// Settings Command
CommandRegistry.register({
  id: "settings_manager",
  name: "Settings",
  aliases: ["settings", "config", "preferences"],
  description: "Configure command palette width, font size, theme, backdrop blur, etc.",
  icon: "⚙️",
  execute: () => {
    enterCommandMode("settings_tools");
  }
});

// Tab Management Commands
CommandRegistry.register({
  id: "close_current_tab",
  name: "Close Current Tab",
  aliases: ["close", "closetab"],
  description: "Close the currently active browser tab.",
  icon: Icons.close,
  execute: () => {
    chrome.runtime.sendMessage({ action: "get_tabs" }, (tabs) => {
      const active = tabs.find(t => t.active);
      if (active) {
        chrome.runtime.sendMessage({ action: "close_tab", id: active.id }, () => {
          showToast("Closed active tab!", "success");
          closeCommandPalette();
        });
      }
    });
  }
});

CommandRegistry.register({
  id: "duplicate_current_tab",
  name: "Duplicate Tab",
  aliases: ["duplicate", "duptab"],
  description: "Duplicate the currently active browser tab.",
  icon: Icons.file,
  execute: () => {
    chrome.runtime.sendMessage({ action: "get_tabs" }, (tabs) => {
      const active = tabs.find(t => t.active);
      if (active) {
        chrome.runtime.sendMessage({ action: "duplicate_tab", id: active.id }, () => {
          showToast("Tab duplicated!", "success");
          closeCommandPalette();
        });
      }
    });
  }
});

CommandRegistry.register({
  id: "pin_current_tab",
  name: "Pin / Unpin Tab",
  aliases: ["pin", "pintab"],
  description: "Toggle pinning of the current tab.",
  icon: Icons.tag,
  execute: () => {
    chrome.runtime.sendMessage({ action: "get_tabs" }, (tabs) => {
      const active = tabs.find(t => t.active);
      if (active) {
        chrome.runtime.sendMessage({ action: "set_tab_pinned", id: active.id, pinned: !active.pinned }, () => {
          showToast(active.pinned ? "Tab unpinned!" : "Tab pinned!", "success");
          closeCommandPalette();
        });
      }
    });
  }
});

CommandRegistry.register({
  id: "mute_current_tab",
  name: "Mute / Unmute Tab",
  aliases: ["mute", "mutetab"],
  description: "Toggle muting audio on the current tab.",
  icon: Icons.volume,
  execute: () => {
    chrome.runtime.sendMessage({ action: "get_tabs" }, (tabs) => {
      const active = tabs.find(t => t.active);
      if (active) {
        const isMuted = active.mutedInfo?.muted;
        chrome.runtime.sendMessage({ action: "set_tab_muted", id: active.id, muted: !isMuted }, () => {
          showToast(isMuted ? "Tab unmuted!" : "Tab muted!", "success");
          closeCommandPalette();
        });
      }
    });
  }
});

// Website Shortcuts
const websites = [
  { id: "gmail", name: "Open Gmail", url: "https://mail.google.com" },
  { id: "youtube", name: "Open YouTube", url: "https://www.youtube.com" },
  { id: "github", name: "Open GitHub", url: "https://github.com" },
  { id: "reddit", name: "Open Reddit", url: "https://www.reddit.com" },
  { id: "chatgpt", name: "Open ChatGPT", url: "https://chatgpt.com" },
  { id: "netflix", name: "Open Netflix", url: "https://www.netflix.com" },
  { id: "spotify", name: "Open Spotify", url: "https://open.spotify.com" }
];

websites.forEach(site => {
  CommandRegistry.register({
    id: `web_${site.id}`,
    name: site.name,
    aliases: [site.id],
    description: `Instantly open ${site.url}`,
    icon: Icons.globe,
    execute: () => {
      window.open(site.url, "_blank");
      closeCommandPalette();
    }
  });
});

// Collections Module Commands
CommandRegistry.register({
  id: "view_collections",
  name: "View Collections / Spaces",
  aliases: ["collections", "spaces"],
  description: "Browse your created collections and spaces.",
  icon: Icons.folder,
  execute: async () => {
    const colls = await DB.getAll("collections");
    if (colls.length === 0) {
      showToast("No collections created yet. Type: addcollection <name> to create one!", "error");
      return;
    }
    visibleItems = colls.map(c => ({
      id: "coll_" + c.id,
      title: `Collection: ${c.name}`,
      subtitle: `${c.items.length} items stored`,
      icon: Icons.folder,
      type: "command",
      execute: () => {
        c.items.forEach(item => {
          if (item.url) window.open(item.url, "_blank");
        });
        showToast(`Opened ${c.items.length} items from ${c.name}!`, "success");
        closeCommandPalette();
      }
    }));
    renderResultsUI();
  }
});

CommandRegistry.register({
  id: "add_to_collection",
  name: "Add Current Tab to Collection",
  aliases: ["addcollection", "addspace"],
  description: "Add active page to a space: addcollection <name>",
  icon: Icons.tag,
  execute: async () => {
    const parts = activeQuery.split(" ");
    const name = parts.slice(1).join(" ").trim();
    if (!name) {
      showToast("Usage: addcollection <name>", "error");
      return;
    }

    const currentTitle = document.title;
    const currentUrl = window.location.href;

    const existing = await DB.get("collections", name);
    let collObj = { id: name, name: name, items: [] };
    if (existing) collObj = existing;

    collObj.items.push({ title: currentTitle, url: currentUrl, type: "tab" });
    await DB.put("collections", collObj);
    showToast(`Added "${currentTitle}" to collection "${name}"!`, "success");
    closeCommandPalette();
  }
});

// Translation Utility
CommandRegistry.register({
  id: "translate_utility",
  name: "Translate Text",
  aliases: ["translate", "lang"],
  description: "Translate phrases inline. Usage: translate hello to french",
  icon: Icons.globe,
  execute: async () => {
    const parts = activeQuery.split(" to ");
    const phrasePart = parts[0].substring(9).trim(); // skip 'translate'
    const targetLang = (parts[1] || "spanish").trim().toLowerCase();
    if (!phrasePart) {
      showToast("Usage: translate <text> to <language>", "error");
      return;
    }

    try {
      showToast("Translating...", "success");
      const res = await fetch(`https://api.mymemory.translated.net/get?q=${encodeURIComponent(phrasePart)}&langpair=en|${targetLang.substring(0, 2)}`);
      const data = await res.json();
      const translated = data.responseData?.translatedText || phrasePart;
      showToast(`Translated: "${translated}"`, "success");
    } catch(e) {
      showToast(`Could not translate. Text: "${phrasePart}" to ${targetLang}`, "error");
    }
  }
});

// Notes Module Command `/note <title> <content>`
CommandRegistry.register({
  id: "quick_note",
  name: "Save Quick Note",
  aliases: ["note", "notes", "todo"],
  description: "Create or append a note immediately: note <title> <content>",
  icon: Icons.file,
  execute: async () => {
    enterCommandMode("note_tools");
  }
});

// Sound Booster Module Command `/boost <percentage>`
CommandRegistry.register({
  id: "audio_booster",
  name: "Sound Booster",
  aliases: ["boost", "volume", "sound"],
  description: "Boost sound on active tab up to 300%. boost <100-300>",
  icon: Icons.volume,
  execute: () => {
    enterCommandMode("boost_tools");
  }
});

// Screenshot Module Commands
CommandRegistry.register({
  id: "screenshot_visible",
  name: "Capture Visible Viewport",
  aliases: ["screenshot", "capture"],
  description: "Capture the visible webpage area and copy/save it.",
  icon: Icons.crop,
  execute: () => {
    closeCommandPalette();
    setTimeout(() => {
      chrome.runtime.sendMessage({ action: "capture_visible" }, (res) => {
        if (res && res.dataUrl) {
          triggerClipboardImageDownload(res.dataUrl, "viewport_screenshot.png");
        } else {
          showToast("Failed to capture screen", "error");
        }
      });
    }, 200);
  }
});

CommandRegistry.register({
  id: "screenshot_region",
  name: "Capture Screen Region",
  aliases: ["region", "crop"],
  description: "Select and crop a specific region of the webpage.",
  icon: Icons.crop,
  execute: () => {
    closeCommandPalette();
    setTimeout(startRegionScreenshot, 250);
  }
});

// Clipboard Media Module Commands
CommandRegistry.register({
  id: "clipboard_download",
  name: "Download Clipboard Image",
  aliases: ["clipimg", "saveimg"],
  description: "Retrieve any copied image from your clipboard and download it.",
  icon: Icons.download,
  execute: async () => {
    enterCommandMode("image_tools");
  }
});

CommandRegistry.register({
  id: "clipboard_image_resize",
  name: "Resize Clipboard Image",
  aliases: ["resize", "scale"],
  description: "Scale clipboard image. Usage: resize <width> <height>",
  icon: Icons.crop,
  execute: async () => {
    enterCommandMode("image_tools");
  }
});

CommandRegistry.register({
  id: "clipboard_image_convert",
  name: "Convert Clipboard Image Format",
  aliases: ["convert", "png", "jpg", "webp"],
  description: "Convert clipboard image format. Usage: convert <png|jpg|webp>",
  icon: Icons.globe,
  execute: async () => {
    enterCommandMode("image_tools");
  }
});

CommandRegistry.register({
  id: "pdf_compressor",
  name: "Compress PDF Document",
  aliases: ["compresspdf", "shrinkpdf"],
  description: "Compress or downscale PDF files. Drag & Drop or paste PDF.",
  icon: Icons.file,
  execute: () => {
    enterCommandMode("pdf_tools");
  }
});

CommandRegistry.register({
  id: "pdf_merge",
  name: "Merge PDF Documents (Bulk Join)",
  aliases: ["mergepdf", "joinpdf"],
  description: "Combine multiple PDF documents into a single PDF.",
  icon: Icons.folder,
  execute: () => {
    enterCommandMode("pdf_tools");
  }
});

// Utilities Module
CommandRegistry.register({
  id: "pomodoro_timer",
  name: "Start Pomodoro / Timer",
  aliases: ["timer", "pomo", "alarm"],
  description: "Start custom timer in minutes. Usage: timer <minutes> <label>",
  icon: Icons.clock,
  execute: () => {
    enterCommandMode("timer_tools");
  }
});

CommandRegistry.register({
  id: "unit_converter",
  name: "Unit Converter",
  aliases: ["convertunit", "units"],
  description: "Quickly convert currency, temperature, sizes. Usage: 10km, 50usd, 120f, 8gb",
  icon: Icons.hash,
  execute: () => {
    const query = activeQuery.toLowerCase();
    const match = query.match(/^(\d+(?:\.\d+)?)\s*(km|mi|f|c|gb|mb|usd|eur|inr)$/i);
    if (!match) {
      showToast("Usage: type like '10km', '120f', '8gb', '50usd' directly in search.", "error");
      return;
    }
    const val = parseFloat(match[1]);
    const unit = match[2];
    let result = "";

    if (unit === "km") result = `${val} km = ${(val * 0.621371).toFixed(2)} mi`;
    else if (unit === "mi") result = `${val} mi = ${(val / 0.621371).toFixed(2)} km`;
    else if (unit === "f") result = `${val}°F = ${(((val - 32) * 5) / 9).toFixed(1)}°C`;
    else if (unit === "c") result = `${val}°C = ${((val * 9) / 5 + 32).toFixed(1)}°F`;
    else if (unit === "gb") result = `${val} GB = ${val * 1024} MB = ${(val / 1024).toFixed(3)} TB`;
    else if (unit === "mb") result = `${val} MB = ${(val / 1024).toFixed(3)} GB`;
    else if (unit === "usd") result = `${val} USD = ${(val * 0.92).toFixed(2)} EUR = ${(val * 83.5).toFixed(1)} INR`;
    else if (unit === "eur") result = `${val} EUR = ${(val * 1.09).toFixed(2)} USD = ${(val * 90.8).toFixed(1)} INR`;
    else if (unit === "inr") result = `${val} INR = ${(val / 83.5).toFixed(2)} USD = ${(val / 90.8).toFixed(2)} EUR`;

    showToast(result, "success");
  }
});

// Media & Search Commands
CommandRegistry.register({
  id: "search_youtube",
  name: "Search YouTube",
  aliases: ["youtube", "yt"],
  description: "Search media on YouTube: youtube <query>",
  icon: Icons.globe,
  execute: () => {
    const query = getCommandArg(activeQuery);
    if (!query) {
      showToast("Usage: youtube <query>", "error");
      return;
    }
    const cleanQuery = autoCorrectMediaName(query);
    window.open(`https://www.youtube.com/results?search_query=${encodeURIComponent(cleanQuery)}`, "_blank");
    closeCommandPalette();
  }
});

CommandRegistry.register({
  id: "search_twitch",
  name: "Search Twitch",
  aliases: ["twitch"],
  description: "Search streams on Twitch: twitch <query>",
  icon: Icons.globe,
  execute: () => {
    const query = getCommandArg(activeQuery);
    if (!query) {
      showToast("Usage: twitch <query>", "error");
      return;
    }
    const cleanQuery = autoCorrectMediaName(query);
    window.open(`https://www.twitch.tv/search?term=${encodeURIComponent(cleanQuery)}`, "_blank");
    closeCommandPalette();
  }
});

CommandRegistry.register({
  id: "search_mkvdrama",
  name: "Search MKVDrama",
  aliases: ["mkvdrama", "kdrama"],
  description: "Search Asian dramas on MKVDrama: mkvdrama <query>",
  icon: Icons.globe,
  execute: () => {
    const query = getCommandArg(activeQuery);
    if (!query) {
      showToast("Usage: mkvdrama <query>", "error");
      return;
    }
    const cleanQuery = autoCorrectMediaName(query);
    window.open(`https://mkvdrama.net/?s=${encodeURIComponent(cleanQuery)}`, "_blank");
    closeCommandPalette();
  }
});

CommandRegistry.register({
  id: "search_bollyflix",
  name: "Search Bollyflix",
  aliases: ["bollyflix"],
  description: "Search Bollywood movies on Bollyflix: bollyflix <query>",
  icon: Icons.globe,
  execute: () => {
    const query = getCommandArg(activeQuery);
    if (!query) {
      showToast("Usage: bollyflix <query>", "error");
      return;
    }
    const cleanQuery = autoCorrectMediaName(query);
    window.open(`https://bollyflix.at/search/${encodeURIComponent(cleanQuery)}`, "_blank");
    closeCommandPalette();
  }
});

CommandRegistry.register({
  id: "search_katmovies",
  name: "Search KatMovieHD",
  aliases: ["katmovies", "katmoviehd"],
  description: "Search movies on KatMovieHD: katmovies <query>",
  icon: Icons.globe,
  execute: () => {
    const query = getCommandArg(activeQuery);
    if (!query) {
      showToast("Usage: katmovies <query>", "error");
      return;
    }
    const cleanQuery = autoCorrectMediaName(query);
    window.open(`https://new.katmoviehd.top/?s=${encodeURIComponent(cleanQuery)}`, "_blank");
    closeCommandPalette();
  }
});

CommandRegistry.register({
  id: "help_command",
  name: "Palette Help & Shortcuts",
  aliases: ["help", "guide"],
  description: "View shortcuts and help details.",
  icon: Icons.search,
  execute: () => {
    enterCommandMode("help_tools");
  }
});

CommandRegistry.register({
  id: "wizard_command",
  name: "Open Sorter Wizard",
  aliases: ["wizard", "sortwizard"],
  description: "Launch the Smart Sorter organization page.",
  icon: Icons.folder,
  execute: () => {
    chrome.runtime.sendMessage({ action: "open_dashboard", view: "wizard" });
    closeCommandPalette();
  }
});

// -------------------------------------------------------------
// ADVANCED SOUND BOOSTER ENGINE (WEB AUDIO GRAPH)
// -------------------------------------------------------------
function enableAudioBooster(gainValue) {
  try {
    if (!audioContext) {
      audioContext = new (window.AudioContext || window.webkitAudioContext)();
      gainNode = audioContext.createGain();
      
      compressorNode = audioContext.createDynamicsCompressor();
      compressorNode.threshold.setValueAtTime(-12, audioContext.currentTime);
      compressorNode.knee.setValueAtTime(10, audioContext.currentTime);
      compressorNode.ratio.setValueAtTime(12, audioContext.currentTime);
      compressorNode.attack.setValueAtTime(0.003, audioContext.currentTime);
      compressorNode.release.setValueAtTime(0.08, audioContext.currentTime);

      analyserNode = audioContext.createAnalyser();
      analyserNode.fftSize = 64;

      gainNode.connect(compressorNode);
      compressorNode.connect(analyserNode);
      analyserNode.connect(audioContext.destination);

      hookMediaElements();
      
      new MutationObserver(mutations => {
        mutations.forEach(m => {
          m.addedNodes.forEach(node => {
            if (node.tagName === 'VIDEO' || node.tagName === 'AUDIO') hookElement(node);
            else if (node.querySelectorAll) node.querySelectorAll('video, audio').forEach(hookElement);
          });
        });
      }).observe(document.body, { childList: true, subtree: true });
    }

    if (audioContext.state === 'suspended') {
      audioContext.resume();
    }

    gainNode.gain.setValueAtTime(gainValue / 100, audioContext.currentTime);
    isAudioBoosterActive = true;
    showToast(`Volume boosted to ${gainValue}%!`, "success");
    closeCommandPalette();
    
    const hostname = window.location.hostname;
    chrome.runtime.sendMessage({ action: "save_sound_level", level: gainValue });
    DB.put("audioProfiles", { hostname, currentBoost: gainValue, enabled: true });

  } catch (err) {
    showToast("Error activating Audio Booster", "error");
    console.error(err);
  }
}

function hookMediaElements() {
  document.querySelectorAll('video, audio').forEach(hookElement);
}

function hookElement(media) {
  if (media._connectedToBooster) return;
  try {
    const source = audioContext.createMediaElementSource(media);
    source.connect(gainNode);
    media._connectedToBooster = true;
  } catch(e) {}
}

// Volume Peak monitoring
function startAudioVisualizer() {
  if (!analyserNode) return;
  const dataArray = new Uint8Array(analyserNode.frequencyBinCount);
  
  let panel = ccBackdrop.querySelector(".cc-audio-meter-panel");
  if (!panel) {
    panel = document.createElement("div");
    panel.className = "cc-audio-meter-panel";
    panel.innerHTML = `
      <div class="cc-meter-row">
        <span>Live Audio Boost</span>
        <span class="cc-meter-value">100%</span>
      </div>
      <div class="cc-meter-bar-outer">
        <div class="cc-meter-bar-inner"></div>
      </div>
    `;
    ccBackdrop.querySelector(".cc-modal").appendChild(panel);
  }

  const valueEl = panel.querySelector(".cc-meter-value");
  const barEl = panel.querySelector(".cc-meter-bar-inner");

  clearInterval(audioMeterInterval);
  audioMeterInterval = setInterval(() => {
    analyserNode.getByteFrequencyData(dataArray);
    let max = 0;
    for (let i = 0; i < dataArray.length; i++) {
      if (dataArray[i] > max) max = dataArray[i];
    }
    const level = Math.round((max / 255) * 100);
    const boostStr = gainNode ? Math.round(gainNode.gain.value * 100) : 100;
    valueEl.textContent = `${boostStr}% | Meter: ${level}%`;
    barEl.style.width = `${level}%`;
    if (level > 85) {
      barEl.style.background = "#ef4444";
    } else {
      barEl.style.background = "linear-gradient(90deg, #10b981, #f59e0b)";
    }
  }, 100);
}

// -------------------------------------------------------------
// SCREENSHOT REGION DRAG SELECTION
// -------------------------------------------------------------
function startRegionScreenshot() {
  const overlay = document.createElement("div");
  overlay.className = "cc-screenshot-crop";
  document.body.appendChild(overlay);

  const selection = document.createElement("div");
  selection.style.cssText = "position:absolute; border:2px dashed #8b5cf6; background:rgba(139,92,246,0.15); pointer-events:none; display:none;";
  overlay.appendChild(selection);

  let startX = 0, startY = 0;
  let isDragging = false;

  const onMouseDown = (e) => {
    startX = e.clientX;
    startY = e.clientY;
    isDragging = true;
    selection.style.left = startX + "px";
    selection.style.top = startY + "px";
    selection.style.width = "0px";
    selection.style.height = "0px";
    selection.style.display = "block";
  };

  const onMouseMove = (e) => {
    if (!isDragging) return;
    const currentX = e.clientX;
    const currentY = e.clientY;
    const left = Math.min(startX, currentX);
    const top = Math.min(startY, currentY);
    const width = Math.abs(startX - currentX);
    const height = Math.abs(startY - currentY);

    selection.style.left = left + "px";
    selection.style.top = top + "px";
    selection.style.width = width + "px";
    selection.style.height = height + "px";
  };

  const onMouseUp = (e) => {
    if (!isDragging) return;
    isDragging = false;
    const rect = selection.getBoundingClientRect();
    overlay.remove();

    if (rect.width < 5 || rect.height < 5) return;

    setTimeout(() => {
      chrome.runtime.sendMessage({ action: "capture_visible" }, (res) => {
        if (res && res.dataUrl) {
          cropScreenshot(res.dataUrl, rect);
        } else {
          showToast("Failed to crop image", "error");
        }
      });
    }, 150);
  };

  overlay.addEventListener("mousedown", onMouseDown);
  overlay.addEventListener("mousemove", onMouseMove);
  overlay.addEventListener("mouseup", onMouseUp);
}

function cropScreenshot(dataUrl, rect) {
  const canvas = document.createElement("canvas");
  const dpr = window.devicePixelRatio || 1;
  canvas.width = rect.width;
  canvas.height = rect.height;
  const ctx = canvas.getContext("2d");

  const img = new Image();
  img.onload = () => {
    ctx.drawImage(
      img,
      rect.left * dpr,
      rect.top * dpr,
      rect.width * dpr,
      rect.height * dpr,
      0,
      0,
      rect.width,
      rect.height
    );
    canvas.toBlob((blob) => {
      openAnnotationCanvas(blob);
    }, "image/png");
  };
  img.src = dataUrl;
}

// Annotation Draw Tool
function openAnnotationCanvas(imageBlob) {
  const overlay = document.createElement("div");
  overlay.className = "cc-canvas-draw-overlay";
  overlay.innerHTML = `
    <div style="padding:14px; background:#0b0d14; display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid rgba(255,255,255,0.08);">
      <span style="font-weight:600; color:#9ca3af; font-size:13px;">Annotate Screenshot</span>
      <div style="display:flex; gap:8px;">
        <button class="cc-btn-save" style="background:#10b981; border:none; color:white; padding:6px 12px; border-radius:6px; cursor:pointer; font-size:12px; font-weight:600;">Copy & Save</button>
        <button class="cc-btn-close" style="background:#ef4444; border:none; color:white; padding:6px 12px; border-radius:6px; cursor:pointer; font-size:12px; font-weight:600;">Cancel</button>
      </div>
    </div>
    <div style="flex-grow:1; display:flex; justify-content:center; align-items:center; overflow:auto; padding:16px; background:#07080c;">
      <canvas class="cc-draw-canvas" style="box-shadow:0 10px 30px rgba(0,0,0,0.6); background:#ffffff;"></canvas>
    </div>
  `;
  document.body.appendChild(overlay);

  const canvas = overlay.querySelector(".cc-draw-canvas");
  const ctx = canvas.getContext("2d");
  const img = new Image();
  
  img.onload = () => {
    canvas.width = img.width;
    canvas.height = img.height;
    ctx.drawImage(img, 0, 0);

    let drawing = false;
    ctx.strokeStyle = "#ef4444";
    ctx.lineWidth = 4;
    ctx.lineCap = "round";

    canvas.addEventListener("mousedown", (e) => { drawing = true; draw(e); });
    canvas.addEventListener("mousemove", draw);
    canvas.addEventListener("mouseup", () => { drawing = false; ctx.beginPath(); });

    function draw(e) {
      if (!drawing) return;
      const bounds = canvas.getBoundingClientRect();
      const x = e.clientX - bounds.left;
      const y = e.clientY - bounds.top;
      ctx.lineTo(x, y);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(x, y);
    }
  };
  img.src = URL.createObjectURL(imageBlob);

  overlay.querySelector(".cc-btn-save").addEventListener("click", () => {
    canvas.toBlob((blob) => {
      try {
        navigator.clipboard.write([
          new ClipboardItem({ "image/png": blob })
        ]).then(() => {
          showToast("Annotated image copied!", "success");
        });
      } catch(e) {}
      triggerClipboardImageDownload(canvas.toDataURL(), "annotated_screenshot.png");
      overlay.remove();
    }, "image/png");
  });

  overlay.querySelector(".cc-btn-close").addEventListener("click", () => {
    overlay.remove();
  });
}

function triggerClipboardImageDownload(dataUrl, filename) {
  const a = document.createElement("a");
  a.href = dataUrl;
  a.download = filename;
  a.click();
  showToast("Image saved!", "success");
}

// -------------------------------------------------------------
// PDF MERGE & COMPRESSION FILE DROP OVERLAYS
// -------------------------------------------------------------
function showDropzoneOverlay(mode) {
  let overlay = ccBackdrop.querySelector(".cc-dropzone-wrapper");
  if (!overlay) {
    overlay = document.createElement("div");
    overlay.className = "cc-dropzone-wrapper";
    ccBackdrop.querySelector(".cc-modal").appendChild(overlay);
  }

  const dropLabel = mode === "merge" ? "Merge PDFs (Drop multiple PDF files)" : "Compress PDF (Drop a PDF file)";
  overlay.innerHTML = `
    <div class="cc-dropzone">
      <div style="font-size:24px;">📄</div>
      <div style="font-weight:600; margin-top:8px; font-size:13px; color:#d1d5db;">${dropLabel}</div>
      <div style="font-size:11px; opacity:0.6; margin-top:2px;">or click to select files</div>
      <input type="file" class="cc-file-input" style="display:none;" ${mode === 'merge' ? 'multiple' : ''} accept=".pdf">
      <div class="cc-file-list" style="margin-top:10px; font-size:11px; text-align:left; max-height:80px; overflow-y:auto; color:#9ca3af;"></div>
      <button class="cc-btn-execute-pdf" style="background:var(--cc-accent-color); border:none; color:white; padding:6px 12px; border-radius:6px; margin-top:10px; cursor:pointer; font-weight:600; font-size:12px; display:none;">
        Run ${mode === 'merge' ? 'PDF Joiner' : 'Compressor'}
      </button>
    </div>
  `;

  const input = overlay.querySelector(".cc-file-input");
  const zone = overlay.querySelector(".cc-dropzone");
  const list = overlay.querySelector(".cc-file-list");
  const btn = overlay.querySelector(".cc-btn-execute-pdf");
  let selectedFiles = [];

  zone.addEventListener("click", () => input.click());
  zone.addEventListener("dragover", (e) => { e.preventDefault(); zone.classList.add("active"); });
  zone.addEventListener("dragleave", () => zone.classList.remove("active"));
  zone.addEventListener("drop", (e) => {
    e.preventDefault();
    zone.classList.remove("active");
    handleSelectedFiles(e.dataTransfer.files);
  });

  input.addEventListener("change", (e) => {
    handleSelectedFiles(e.target.files);
  });

  function handleSelectedFiles(files) {
    selectedFiles = Array.from(files).filter(f => f.type === "application/pdf" || f.name.endsWith(".pdf"));
    list.innerHTML = selectedFiles.map(f => `<div>• ${f.name} (${(f.size / 1024 / 1024).toFixed(2)} MB)</div>`).join("");
    if (selectedFiles.length > 0) {
      btn.style.display = "inline-block";
    }
  }

  btn.addEventListener("click", async (e) => {
    e.stopPropagation();
    if (selectedFiles.length === 0) return;

    btn.textContent = "Processing PDF...";
    btn.disabled = true;

    try {
      if (typeof window.PDFLib === "undefined") {
        await new Promise((resolve, reject) => {
          const script = document.createElement("script");
          script.src = "https://unpkg.com/pdf-lib/dist/pdf-lib.min.js";
          script.onload = resolve;
          script.onerror = reject;
          document.head.appendChild(script);
        });
      }

      const { PDFDocument } = window.PDFLib;

      if (mode === "merge") {
        const mergedPdf = await PDFDocument.create();
        for (const file of selectedFiles) {
          const buffer = await file.arrayBuffer();
          const doc = await PDFDocument.load(buffer);
          const pages = await mergedPdf.copyPages(doc, doc.getPageIndices());
          pages.forEach(p => mergedPdf.addPage(p));
        }
        const mergedBytes = await mergedPdf.save();
        downloadBytes(mergedBytes, "merged_document.pdf");
        showToast("PDFs merged successfully!", "success");
      } else {
        const file = selectedFiles[0];
        const buffer = await file.arrayBuffer();
        const doc = await PDFDocument.load(buffer);
        const compressedBytes = await doc.save({ useObjectStreams: true });
        downloadBytes(compressedBytes, "compressed_document.pdf");
        showToast("PDF compressed!", "success");
      }
      overlay.remove();
      closeCommandPalette();
    } catch(err) {
      showToast("Error processing PDF files", "error");
      console.error(err);
      btn.textContent = "Failed. Try again";
      btn.disabled = false;
    }
  });
}

function downloadBytes(bytes, filename) {
  const blob = new Blob([bytes], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
}

// -------------------------------------------------------------
// TOAST NOTIFICATIONS
// -------------------------------------------------------------
function showToast(message, type = "success") {
  const toast = document.createElement("div");
  toast.style.cssText = `
    position: fixed;
    bottom: 20px;
    right: 20px;
    background: ${type === "success" ? "rgba(16, 185, 129, 0.2)" : "rgba(244, 63, 94, 0.2)"};
    border: 1px solid ${type === "success" ? "rgba(16, 185, 129, 0.3)" : "rgba(244, 63, 94, 0.3)"};
    border-left: 4px solid ${type === "success" ? "#10b981" : "#f43f5e"};
    color: white;
    padding: 12px 18px;
    border-radius: 8px;
    font-family: -apple-system, BlinkMacSystemFont, sans-serif;
    font-size: 13px;
    font-weight: 500;
    box-shadow: 0 10px 25px rgba(0,0,0,0.5);
    backdrop-filter: blur(10px);
    -webkit-backdrop-filter: blur(10px);
    z-index: 2147483647;
    opacity: 0;
    transform: translateY(15px);
    transition: all 0.25s cubic-bezier(0.16, 1, 0.3, 1);
  `;
  toast.textContent = message;
  document.body.appendChild(toast);
  
  setTimeout(() => {
    toast.style.opacity = "1";
    toast.style.transform = "translateY(0)";
  }, 50);

  setTimeout(() => {
    toast.style.opacity = "0";
    toast.style.transform = "translateY(15px)";
    setTimeout(() => toast.remove(), 250);
  }, 2800);
}

// -------------------------------------------------------------
// PALETTE SETTINGS AND CONFIG MANAGEMENT
// -------------------------------------------------------------
function getCleanKeyword() {
  try {
    const host = window.location.hostname.toLowerCase();
    let clean = host.replace(/^www\./, "");
    let parts = clean.split(".");
    if (parts.length >= 2) {
      if (parts[parts.length - 2] === "com" || parts[parts.length - 2] === "co" || parts[parts.length - 2] === "net" || parts[parts.length - 2] === "org") {
        return parts[0];
      }
      return parts[0];
    }
    return clean || "site";
  } catch (e) {
    return "site";
  }
}

function parseMappingInput(inputText) {
  let text = inputText.trim();
  text = text.replace(/^\//, "");

  const prefixes = [
    "mapping new", "mapping add", "new mapping", "add mapping",
    "mapping", "new", "add", "create"
  ];
  for (const p of prefixes) {
    const reg = new RegExp("^" + p + "\\s+", "i");
    const simpleReg = new RegExp("^" + p + "\\b", "i");
    if (reg.test(text)) {
      text = text.replace(reg, "");
      break;
    } else if (simpleReg.test(text) && text.toLowerCase() === p) {
      text = "";
      break;
    }
  }

  if (!text) {
    return { keyword: getCleanKeyword(), label: "default", url: window.location.href };
  }

  const parts = text.split(/\s+/);
  let keyword = "";
  let label = "";
  let url = "";

  const lastPart = parts[parts.length - 1] || "";
  const isUrl = lastPart.includes(".") || /^https?:\/\//i.test(lastPart) || lastPart.startsWith("localhost");

  if (isUrl && parts.length >= 3) {
    keyword = parts[0].toLowerCase();
    label = parts[1].toLowerCase();
    url = parts.slice(2).join(" ");
  } else {
    keyword = getCleanKeyword();
    label = parts.join(" ").toLowerCase();
    url = window.location.href;
  }

  return { keyword, label, url };
}

async function getPaletteConfig() {
  const settingsObj = await DB.get("settings", "palette_config");
  return settingsObj ? settingsObj.value : {
    width: "600px",
    fontSize: "13px",
    accent: "purple",
    maxResults: 8,
    blur: "8px"
  };
}

async function updatePaletteSetting(key, val) {
  const config = await getPaletteConfig();
  config[key] = val;
  await DB.put("settings", { key: "palette_config", value: config });
  await applyPaletteSettings();
  showToast(`Setting updated: ${key} = ${val}`, "success");
  renderSearchResults("");
}

async function applyPaletteSettings() {
  if (!ccBackdrop) return;
  const config = await getPaletteConfig();

  const style = ccBackdrop.style;
  style.setProperty("--cc-width", config.width || "600px");
  style.setProperty("--cc-font-size-base", config.fontSize || "13px");
  style.setProperty("--cc-max-results", config.maxResults || 8);

  // Accent Colors mapping
  let accentColor = "#8b5cf6";
  let accentGrad = "linear-gradient(135deg, #a78bfa, #8b5cf6)";
  if (config.accent === "blue") {
    accentColor = "#3b82f6";
    accentGrad = "linear-gradient(135deg, #60a5fa, #3b82f6)";
  } else if (config.accent === "green") {
    accentColor = "#10b981";
    accentGrad = "linear-gradient(135deg, #34d399, #10b981)";
  } else if (config.accent === "orange") {
    accentColor = "#f97316";
    accentGrad = "linear-gradient(135deg, #fb923c, #f97316)";
  } else if (config.accent === "red") {
    accentColor = "#ef4444";
    accentGrad = "linear-gradient(135deg, #f87171, #ef4444)";
  }
  style.setProperty("--cc-accent-color", accentColor);
  style.setProperty("--cc-accent-gradient", accentGrad);

  // Backdrop blur amount
  let blurVal = "8px";
  if (config.blur === "none") blurVal = "0px";
  else if (config.blur === "20px") blurVal = "20px";
  style.setProperty("--cc-backdrop-blur", blurVal);
}
