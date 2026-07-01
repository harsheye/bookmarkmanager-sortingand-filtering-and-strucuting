// Content Script: Floating Bookmark Command Center Overlay

let ccRoot = null;
let ccShadow = null;
let ccBackdrop = null;
let ccSearchInput = null;
let ccSuggestions = null;
let ccResultsList = null;
let ccEmptyState = null;
let ccBreadcrumbs = null;
let historySearchEnabled = true;

// State Variables
let currentFolderId = "0"; // Start at Bookmark System Root
let folderHistory = [];
let cachedTree = null;
let allFlattenedBookmarks = [];
let visibleItems = [];
let selectedIndex = -1;
let selectedSuggestionIndex = -1;
let activeQuery = "";

// Cache on script load
loadBookmarksTreeAndCache();

function loadBookmarksTreeAndCache() {
  chrome.storage.local.get(['categories_config', 'learned_domains'], (result) => {
    if (result.categories_config) {
      Object.keys(result.categories_config).forEach(catId => {
        const cat = BookmarkRules.categories.find(c => c.id === catId);
        if (cat) cat.enabled = result.categories_config[catId];
      });
    }
    if (result.learned_domains) {
      Object.keys(result.learned_domains).forEach(catId => {
        const cat = BookmarkRules.categories.find(c => c.id === catId);
        if (cat) {
          const uniqueDomains = new Set([...cat.domains, ...result.learned_domains[catId]]);
          cat.domains = Array.from(uniqueDomains);
        }
      });
    }

    chrome.runtime.sendMessage({ action: "get_bookmarks_tree" }, (tree) => {
      if (tree) {
        cachedTree = tree;
        flattenBookmarks(tree);
      }
    });
  });
}

// Commands List
const CC_COMMANDS = [
  { cmd: "/help", desc: "Show command center guide" },
  { cmd: "/manager", desc: "Open Smart Bookmark Manager dashboard" },
  { cmd: "/no ", desc: "Save/append notes: /no <name> <text>" },
  { cmd: "/notes", desc: "List and view all saved notes" },
  { cmd: "/t ", desc: "Filter by title: /t <query>" },
  { cmd: "/u ", desc: "Filter by URL: /u <query>" },
  { cmd: "/c ", desc: "Filter by category: /c <category>" },
  { cmd: "/d ", desc: "Filter by domain: /d <domain>" },
  { cmd: "/sort ", desc: "Sort list: /sort [name, date, url]" },
  { cmd: "/wizard", desc: "Open Smart Sorter wizard page" },
  { cmd: "/undo", desc: "Restore original bookmarks" }
];

// Listen for messages from background script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "ping") {
    sendResponse({ status: "pong" });
  } else if (message.action === "toggle_command_center") {
    toggleCommandCenter();
    sendResponse({ success: true });
  }
  return true;
});

// Listen to keyboard shortcut directly in the tab: Alt+A
document.addEventListener("keydown", (e) => {
  const key = e.key ? e.key.toLowerCase() : "";
  const isA = key === "a" || key === "å" || e.code === "KeyA" || e.keyCode === 65;
  const hasAltOnly = e.altKey && !e.shiftKey && !e.ctrlKey && !e.metaKey;
  
  if (isA && hasAltOnly) {
    e.preventDefault();
    // Exits full screen if active
    const fullscreenEl = document.fullscreenElement || document.webkitFullscreenElement || document.mozFullScreenElement || document.msFullscreenElement;
    if (fullscreenEl) {
      const exitFS = document.exitFullscreen || document.webkitExitFullscreen || document.mozCancelFullScreen || document.msExitFullscreen;
      if (exitFS) {
        exitFS.call(document).then(() => {
          toggleCommandCenter();
        }).catch(() => {
          toggleCommandCenter();
        });
      } else {
        toggleCommandCenter();
      }
    } else {
      toggleCommandCenter();
    }
  }
});

// Global key redirection: Autofocus search input if user starts typing while Command Center is active
document.addEventListener("keydown", (e) => {
  if (ccBackdrop && ccBackdrop.classList.contains("active")) {
    const shadowActive = ccShadow ? ccShadow.activeElement : null;
    if (shadowActive !== ccSearchInput && document.activeElement !== ccRoot) {
      const excludedKeys = ["Escape", "Tab", "Enter", "Shift", "Control", "Alt", "Meta", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"];
      if (!excludedKeys.includes(e.key)) {
        ccSearchInput.focus();
      }
    }
  }
});



function toggleCommandCenter() {
  if (!ccRoot) {
    createCommandCenter();
  }

  const isActive = ccBackdrop.classList.contains("active");
  if (isActive) {
    closeCommandCenter();
  } else {
    openCommandCenter();
  }
}

function openCommandCenter() {
  ccRoot.style.pointerEvents = "auto";
  ccBackdrop.classList.add("active");
  ccSearchInput.value = "";
  folderHistory = [];
  currentFolderId = "0";
  selectedIndex = -1;
  activeQuery = "";
  
  // Force layout reflow so styles are updated immediately before focusing
  ccBackdrop.offsetHeight;

  // Blur active element on the host page to unlock browser focus constraints
  if (document.activeElement && typeof document.activeElement.blur === "function") {
    document.activeElement.blur();
  }

  // Focus input instantly
  ccSearchInput.focus();
  requestAnimationFrame(() => ccSearchInput.focus());
  setTimeout(() => ccSearchInput.focus(), 25);
  setTimeout(() => ccSearchInput.focus(), 100);

  // Load current folder from cache instantly
  loadFolder(currentFolderId);
  
  // Silently refresh the bookmarks tree cache in background
  loadBookmarksTreeAndCache();
}

function closeCommandCenter() {
  if (ccBackdrop) {
    ccBackdrop.classList.remove("active");
    ccRoot.style.pointerEvents = "none";
    ccSearchInput.blur();
    hideSuggestions();
  }
}

function flattenBookmarks(tree) {
  const flattened = [];
  function traverse(node) {
    if (node.url) {
      flattened.push(node);
    }
    if (node.children) {
      node.children.forEach(traverse);
    }
  }
  if (tree && tree[0] && tree[0].children) {
    tree[0].children.forEach(traverse);
  }
  allFlattenedBookmarks = flattened;
}

function createCommandCenter() {
  ccRoot = document.createElement("div");
  ccRoot.id = "smart-bookmark-command-center-root";
  ccRoot.style.cssText = "position:fixed; top:0; left:0; width:100vw; height:100vh; z-index:2147483647; pointer-events:none;";
  document.body.appendChild(ccRoot);
 
  ccShadow = ccRoot.attachShadow({ mode: "open" });
 
  chrome.storage.local.get(['organizer_user_settings'], (result) => {
    const settings = result.organizer_user_settings || {};
    const theme = settings.ccTheme || 'black'; // 'black' or 'white'
    const blur = settings.ccBlur !== undefined ? settings.ccBlur : 15;
    historySearchEnabled = settings.ccHistory !== false;

    const style = document.createElement("style");
    style.textContent = `
      @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600;700&display=swap');
      @import url('https://cdn-uicons.flaticon.com/2.6.0/uicons-regular-rounded/css/uicons-regular-rounded.css');
      @import url('https://cdn-uicons.flaticon.com/2.6.0/uicons-solid-rounded/css/uicons-solid-rounded.css');
      @import url('https://cdn-uicons.flaticon.com/2.6.0/uicons-bold-rounded/css/uicons-bold-rounded.css');
      
      :host {
        all: initial;
      }
      .cc-backdrop {
        position: fixed;
        top: 0;
        left: 0;
        width: 100vw;
        height: 100vh;
        background: rgba(0, 0, 0, 0.45);
        backdrop-filter: blur(${blur}px);
        -webkit-backdrop-filter: blur(${blur}px);
        z-index: 2147483647;
        display: flex;
        justify-content: center;
        align-items: center;
        opacity: 0;
        pointer-events: none;
        transition: opacity 0.22s cubic-bezier(0.4, 0, 0.2, 1);
        font-family: 'Outfit', -apple-system, sans-serif;
        color: ${theme === 'white' ? '#1f2937' : '#f3f4f6'};
      }
      .cc-backdrop.active {
        opacity: 1;
        pointer-events: auto;
      }
      .cc-modal {
        width: 620px;
        background: ${theme === 'white' ? 'rgba(255, 255, 255, 0.88)' : 'rgba(10, 10, 12, 0.72)'};
        border: 1px solid ${theme === 'white' ? 'rgba(0, 0, 0, 0.08)' : 'rgba(255, 255, 255, 0.08)'};
        border-radius: 16px;
        box-shadow: 0 25px 60px rgba(0, 0, 0, 0.65);
        backdrop-filter: blur(25px);
        -webkit-backdrop-filter: blur(25px);
        display: flex;
        flex-direction: column;
        overflow: hidden;
        max-height: 600px;
        transform: translateY(-20px) scale(0.97);
        transition: transform 0.22s cubic-bezier(0.34, 1.56, 0.64, 1);
      }
      .cc-backdrop.active .cc-modal {
        transform: translateY(0) scale(1);
      }
      .cc-search-wrapper {
        display: flex;
        align-items: center;
        padding: 14px 18px;
        border-bottom: 1px solid ${theme === 'white' ? 'rgba(0, 0, 0, 0.06)' : 'rgba(255, 255, 255, 0.06)'};
        gap: 12px;
      }
      .cc-search-icon {
        font-size: 16px;
        color: ${theme === 'white' ? 'rgba(0,0,0,0.4)' : 'rgba(255, 255, 255, 0.4)'};
        display: flex;
        align-items: center;
      }
      .cc-search-input {
        flex-grow: 1;
        background: transparent;
        border: none;
        outline: none;
        color: ${theme === 'white' ? '#1f2937' : 'white'};
        font-size: 15px;
        font-family: inherit;
        resize: none;
        height: 22px;
        line-height: 22px;
        overflow-y: hidden;
        box-sizing: border-box;
      }
      .cc-search-hint {
        font-size: 11px;
        background: ${theme === 'white' ? 'rgba(0,0,0,0.06)' : 'rgba(255, 255, 255, 0.08)'};
        padding: 3px 8px;
        border-radius: 4px;
        border: 1px solid ${theme === 'white' ? 'rgba(0,0,0,0.02)' : 'rgba(255, 255, 255, 0.05)'};
        color: ${theme === 'white' ? '#4b5563' : '#9ca3af'};
      }
      .cc-suggestions {
        background: ${theme === 'white' ? 'rgba(0,0,0,0.02)' : 'rgba(0, 0, 0, 0.2)'};
        max-height: 180px;
        overflow-y: auto;
        border-bottom: 1px solid ${theme === 'white' ? 'rgba(0, 0, 0, 0.06)' : 'rgba(255, 255, 255, 0.06)'};
      }
      .cc-suggestion-item {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 10px 18px;
        cursor: pointer;
        transition: background 0.15s;
      }
      .cc-suggestion-item:hover, .cc-suggestion-item.selected {
        background: rgba(99, 102, 241, 0.15);
      }
      .cc-sug-cmd {
        color: #8b5cf6;
        font-weight: 600;
        font-size: 13.5px;
      }
      .cc-sug-desc {
        color: ${theme === 'white' ? '#6b7280' : '#9ca3af'};
        font-size: 13px;
      }
      .cc-results-container {
        flex-grow: 1;
        overflow-y: auto;
        max-height: 400px;
        background: ${theme === 'white' ? 'rgba(0,0,0,0.01)' : 'rgba(0, 0, 0, 0.1)'};
      }
      .cc-results-list {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
        gap: 10px;
        padding: 12px;
      }
      .cc-item {
        display: flex;
        flex-direction: column;
        align-items: flex-start;
        justify-content: space-between;
        padding: 12px;
        border-radius: 12px;
        background: ${theme === 'white' ? 'rgba(0, 0, 0, 0.02)' : 'rgba(255, 255, 255, 0.02)'};
        border: 1px solid ${theme === 'white' ? 'rgba(0, 0, 0, 0.06)' : 'rgba(255, 255, 255, 0.05)'};
        cursor: pointer;
        transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
        height: 90px;
        box-sizing: border-box;
        margin-bottom: 0px;
      }
      .cc-item:hover, .cc-item.selected {
        background: rgba(99, 102, 241, 0.15) !important;
        border-color: #8b5cf6 !important;
        transform: translateY(-2px);
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
      }
      .cc-item-left {
        display: flex;
        align-items: center;
        gap: 10px;
        overflow: hidden;
        max-width: 100%;
        width: 100%;
      }
      .cc-item-icon {
        font-size: 16px;
        flex-shrink: 0;
      }
      .cc-favicon {
        width: 16px;
        height: 16px;
        border-radius: 3px;
        flex-shrink: 0;
      }
      .cc-item-title {
        font-size: 13px;
        font-weight: 600;
        color: ${theme === 'white' ? '#1f2937' : '#e2e8f0'};
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .cc-item-right {
        font-size: 11px;
        color: #9ca3af;
        flex-shrink: 0;
        text-overflow: ellipsis;
        overflow: hidden;
        white-space: nowrap;
        max-width: 100%;
        width: 100%;
        margin-top: auto;
        text-align: left;
      }
      .cc-empty-state {
        padding: 30px;
        text-align: center;
        color: #9ca3af;
        font-size: 14.5px;
      }
      .cc-footer {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 10px 18px;
        background: ${theme === 'white' ? 'rgba(0, 0, 0, 0.03)' : 'rgba(0, 0, 0, 0.3)'};
        border-top: 1px solid ${theme === 'white' ? 'rgba(0, 0, 0, 0.05)' : 'rgba(255, 255, 255, 0.05)'};
        font-size: 12px;
        color: #9ca3af;
      }
      .cc-breadcrumbs {
        font-weight: 600;
        color: var(--color-primary);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        max-width: 50%;
      }
      .cc-shortcuts {
        display: flex;
        gap: 12px;
      }
      .cc-shortcuts span {
        background: ${theme === 'white' ? 'rgba(0,0,0,0.04)' : 'rgba(255,255,255,0.06)'};
        padding: 2px 6px;
        border-radius: 4px;
        border: 1px solid ${theme === 'white' ? 'rgba(0,0,0,0.02)' : 'rgba(255,255,255,0.04)'};
      }
      ::-webkit-scrollbar {
        width: 6px;
        height: 6px;
      }
      ::-webkit-scrollbar-track {
        background: transparent;
      }
      ::-webkit-scrollbar-thumb {
        background: rgba(255, 255, 255, 0.12);
        border-radius: 3px;
      }
    `;
    ccShadow.appendChild(style);

    // Add layout HTML
    ccBackdrop = document.createElement("div");
    ccBackdrop.className = "cc-backdrop";

    ccBackdrop.innerHTML = `
      <div class="cc-modal">
        <div class="cc-search-wrapper">
          <span class="cc-search-icon" style="display:flex; align-items:center; justify-content:center; color:rgba(255,255,255,0.4);"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M23.707,22.293l-5.969-5.969a10.016,10.016,0,1,0-1.414,1.414l5.969,5.969a10.025,10.025,0,0,0,1.414-1.414ZM10,18a8,8,0,1,1,8-8A8.009,8.009,0,0,1,10,18Z"/></svg></span>
          <textarea class="cc-search-input" placeholder="Search title/url or type / for commands..." autofocus autocomplete="off" rows="1"></textarea>
          <span class="cc-search-hint">Alt+A</span>
        </div>
        <div class="cc-suggestions hidden"></div>
        <div class="cc-results-container">
          <div class="cc-results-list"></div>
          <div class="cc-empty-state hidden">No items found.</div>
        </div>
        <div class="cc-footer">
          <div class="cc-breadcrumbs">Library</div>
          <div class="cc-shortcuts">
            <span>↑↓ Navigate</span>
            <span>↵ Open/Enter</span>
            <span>⌫ Back</span>
            <span>Esc Close</span>
          </div>
        </div>
      </div>
    `;

    ccShadow.appendChild(ccBackdrop);

    // Bind references
    ccSearchInput = ccBackdrop.querySelector(".cc-search-input");
    ccSuggestions = ccBackdrop.querySelector(".cc-suggestions");
    ccResultsList = ccBackdrop.querySelector(".cc-results-list");
    ccEmptyState = ccBackdrop.querySelector(".cc-empty-state");
    ccBreadcrumbs = ccBackdrop.querySelector(".cc-breadcrumbs");

    // Setup Event Listeners inside Shadow DOM
    ccBackdrop.addEventListener("click", (e) => {
      if (e.target === ccBackdrop) {
        closeCommandCenter();
      }
    });

    // Refocus search input when clicking anywhere inside the modal (except input itself)
    const modalContainer = ccBackdrop.querySelector(".cc-modal");
    if (modalContainer) {
      modalContainer.addEventListener("click", (e) => {
        if (e.target !== ccSearchInput) {
          ccSearchInput.focus();
        }
      });
    }

    // Ensure input is focused when transition completes
    ccBackdrop.addEventListener("transitionend", (e) => {
      if (ccBackdrop.classList.contains("active") && e.propertyName === "opacity") {
        ccSearchInput.focus();
      }
    });

    ccSearchInput.addEventListener("input", (e) => {
      ccSearchInput.style.height = "auto";
      ccSearchInput.style.height = Math.min(100, ccSearchInput.scrollHeight) + "px";
      handleCCSearch(e.target.value);
    });

    ccSearchInput.addEventListener("keydown", (e) => {
      const key = e.key ? e.key.toLowerCase() : "";
      const isA = key === "a" || key === "å" || e.code === "KeyA" || e.keyCode === 65;
      const hasAltOnly = e.altKey && !e.shiftKey && !e.ctrlKey && !e.metaKey;
      
      if (isA && hasAltOnly) {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        closeCommandCenter();
        return;
      }
      
      if (e.key === "Enter") {
        if (!e.shiftKey) {
          e.preventDefault();
          e.stopPropagation();
          e.stopImmediatePropagation();
          handleCCKeydown(e); // executes Enter selection
        } else {
          // Shift+Enter inserts newline: allow it, and it will resize textarea via input listener!
          e.stopPropagation();
        }
        return;
      }

      e.stopPropagation();
      handleCCKeydown(e);
    });

    ccSearchInput.addEventListener("keypress", (e) => {
      e.stopPropagation();
    });

    ccSearchInput.addEventListener("keyup", (e) => {
      e.stopPropagation();
    });
  });
}

// -------------------------------------------------------------
// NAVIGATION & BOOKMARKS LOADING
// -------------------------------------------------------------
function loadFolder(folderId) {
  currentFolderId = folderId;
  selectedIndex = -1;
  
  chrome.runtime.sendMessage({ action: "get_folder_contents", id: folderId }, (nodes) => {
    if (nodes && nodes.children) {
      visibleItems = nodes.children;
    } else if (nodes && nodes.id === "0") {
      // Chrome Root: Children are normally Bookmark Bar (1) & Other Bookmarks (2)
      visibleItems = [
        { id: "1", title: "Bookmark Bar" },
        { id: "2", title: "Other Bookmarks" }
      ];
    } else {
      visibleItems = [];
    }

    renderItemsList(visibleItems);
    updateCrumbsPath(folderId);
  });
}

function updateCrumbsPath(folderId) {
  if (folderId === "0") {
    ccBreadcrumbs.textContent = "Library";
    return;
  }
  
  // Recursively fetch path
  let path = "Library";
  
  function findPath(node, targetId, currentPath = "Library") {
    if (node.id === targetId) {
      path = currentPath + (node.title ? ` / ${node.title}` : "");
      return true;
    }
    if (node.children) {
      for (const child of node.children) {
        const title = child.title || (child.id === "1" ? "Bookmark Bar" : child.id === "2" ? "Other Bookmarks" : "Folder");
        if (findPath(child, targetId, currentPath + ` / ${title}`)) {
          return true;
        }
      }
    }
    return false;
  }

  if (cachedTree) {
    findPath(cachedTree[0], folderId);
  }

  ccBreadcrumbs.textContent = path;
}

function renderItemsList(items) {
  ccResultsList.innerHTML = "";
  
  if (items.length === 0) {
    ccEmptyState.classList.remove("hidden");
    return;
  }
  
  ccEmptyState.classList.add("hidden");

  items.forEach((item, idx) => {
    const div = document.createElement("div");
    div.className = `cc-item ${idx === selectedIndex ? "selected" : ""}`;
    
    let leftHtml = "";
    let rightHtml = "";

    if (item.url) {
      // Bookmark or History Link
      const domain = BookmarkRules.getDomain(item.url);
      const faviconUrl = `https://www.google.com/s2/favicons?sz=32&domain=${domain}`;
      leftHtml = `
        <img class="cc-favicon" src="${faviconUrl}" onerror="this.src='../icons/icon16.png'">
        <span class="cc-item-title">${item.title || item.url}</span>
      `;
      if (item.isHistory) {
        rightHtml = `
          <span class="cc-item-right" title="${item.url}" style="color:#f43f5e; font-weight:600; display:flex; align-items:center; gap:6px;">
            <i class="fi fi-rr-clock-three" style="font-size:12px; display:flex; align-items:center;"></i>
            History &bull; ${domain}
          </span>
        `;
      } else {
        rightHtml = `<span class="cc-item-right" title="${item.url}">${domain}</span>`;
      }
    } else if (item.isNote || item.isCreateNoteAction || item.isStaticHelp) {
      // Note Card
      leftHtml = `
        <span class="cc-item-icon" style="color:#10b981; display:flex; align-items:center;"><i class="fi fi-rr-document" style="font-size:14px;"></i></span>
        <span class="cc-item-title" style="font-weight:600; color:inherit;">${item.title}</span>
      `;
      rightHtml = `<span class="cc-item-right" style="color:#10b981; font-family:monospace; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;" title="${item.contentSnippet || ''}">${item.contentSnippet || ''}</span>`;
    } else {
      // Folder Directory
      leftHtml = `
        <span class="cc-item-icon" style="color:#a855f7; display:flex; align-items:center;"><i class="fi fi-rr-folder" style="font-size:14px;"></i></span>
        <span class="cc-item-title" style="font-weight:600; color:inherit;">${item.title}</span>
      `;
      rightHtml = `<span class="cc-item-right" style="color:#a855f7; font-weight:600; font-style:italic;">Folder</span>`;
    }

    div.innerHTML = `
      <div class="cc-item-left">${leftHtml}</div>
      ${rightHtml}
    `;

    div.addEventListener("click", () => {
      selectedIndex = idx;
      executeSelection();
    });

    ccResultsList.appendChild(div);
  });
}

// -------------------------------------------------------------
// KEYBOARD & INPUT ENGINE
// -------------------------------------------------------------
function handleCCSearch(val) {
  val = val.trim();
  activeQuery = val;
  selectedIndex = -1;

  if (!val) {
    hideSuggestions();
    loadFolder(currentFolderId);
    return;
  }

  const valLower = val.toLowerCase();
  if (valLower === "/no" || valLower.startsWith("/no ") || valLower === "/notes" || valLower.startsWith("/notes ")) {
    hideSuggestions();
    renderNotesSuggestions(val);
    return;
  }

  if (val.startsWith("/")) {
    renderCCSuggestions(val);
    executeCCCommand(val);
  } else {
    hideSuggestions();
    
    // Check for scoped domain search (e.g. "github.com pull request")
    const parts = val.split(" ");
    if (parts.length > 1 && parts[0].includes(".") && parts[0].length > 3) {
      const scopeDomain = parts[0].toLowerCase();
      const scopeQuery = parts.slice(1).join(" ").trim().toLowerCase();
      
      visibleItems = allFlattenedBookmarks.filter(bm => {
        const domain = BookmarkRules.getDomain(bm.url);
        if (domain && domain.toLowerCase().includes(scopeDomain)) {
          if (!scopeQuery) return true; // just filter by domain if query is empty
          return (bm.title && bm.title.toLowerCase().includes(scopeQuery)) ||
                 (bm.url && bm.url.toLowerCase().includes(scopeQuery));
        }
        return false;
      });
      
      if (visibleItems.length === 0) {
        // Fallback: query history
        chrome.runtime.sendMessage({ action: "search_history", query: val }, (historyResults) => {
          if (activeQuery !== val) return;
          visibleItems = historyResults || [];
          renderItemsList(visibleItems);
          ccBreadcrumbs.textContent = `Search results (History): "${val}"`;
        });
      } else {
        renderItemsList(visibleItems);
        ccBreadcrumbs.textContent = `Scoped search [${scopeDomain}]: "${scopeQuery}"`;
      }
    } else {
      // Normal global filter search
      const query = val.toLowerCase();
      visibleItems = allFlattenedBookmarks.filter(bm => 
        (bm.title && bm.title.toLowerCase().includes(query)) ||
        (bm.url && bm.url.toLowerCase().includes(query))
      );
      
      if (visibleItems.length === 0 && historySearchEnabled) {
        // Fallback: query history
        chrome.runtime.sendMessage({ action: "search_history", query: val }, (historyResults) => {
          if (activeQuery !== val) return;
          visibleItems = historyResults || [];
          renderItemsList(visibleItems);
          ccBreadcrumbs.textContent = `Search results (History): "${val}"`;
        });
      } else {
        renderItemsList(visibleItems);
        ccBreadcrumbs.textContent = `Search results: "${val}"`;
      }
    }
  }
}

function handleCCKeydown(e) {
  // Handle TAB key for autocompletion
  if (e.key === "Tab") {
    e.preventDefault(); // Stop standard focus cycling

    // Scenario A: Autocomplete command suggestions
    if (!ccSuggestions.classList.contains("hidden")) {
      const sugItems = ccSuggestions.querySelectorAll(".cc-suggestion-item");
      if (sugItems.length > 0) {
        if (selectedSuggestionIndex < 0) selectedSuggestionIndex = 0;
        const cmd = sugItems[selectedSuggestionIndex].querySelector(".cc-sug-cmd").textContent;
        ccSearchInput.value = cmd;
        hideSuggestions();
        handleCCSearch(cmd);
      }
      return;
    }

    // Scenario B: Autocomplete highlighted results (domain or title)
    if (visibleItems.length > 0) {
      if (selectedIndex < 0) selectedIndex = 0; // Default to first item
      const item = visibleItems[selectedIndex];
      if (item.url) {
        const domain = BookmarkRules.getDomain(item.url);
        if (domain) {
          ccSearchInput.value = domain;
          handleCCSearch(domain);
        }
      } else {
        ccSearchInput.value = item.title;
        handleCCSearch(item.title);
      }
    }
    return;
  }

  // 1. Suggestions Menu Navigation
  if (!ccSuggestions.classList.contains("hidden")) {
    const sugItems = ccSuggestions.querySelectorAll(".cc-suggestion-item");
    if (sugItems.length > 0) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        selectedSuggestionIndex = (selectedSuggestionIndex + 1) % sugItems.length;
        highlightSuggestion(sugItems);
        return;
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        selectedSuggestionIndex = (selectedSuggestionIndex - 1 + sugItems.length) % sugItems.length;
        highlightSuggestion(sugItems);
        return;
      } else if (e.key === "Enter") {
        if (selectedSuggestionIndex >= 0 && selectedSuggestionIndex < sugItems.length) {
          e.preventDefault();
          const cmd = sugItems[selectedSuggestionIndex].querySelector(".cc-sug-cmd").textContent;
          ccSearchInput.value = cmd;
          hideSuggestions();
          handleCCSearch(cmd);
          return;
        }
      }
    }
  }

  // 2. Results List Navigation
  const items = ccResultsList.querySelectorAll(".cc-item");
  if (e.key === "ArrowDown") {
    e.preventDefault();
    if (items.length > 0) {
      selectedIndex = (selectedIndex + 1) % items.length;
      updateHighlight(items);
    }
  } else if (e.key === "ArrowUp") {
    e.preventDefault();
    if (items.length > 0) {
      selectedIndex = (selectedIndex - 1 + items.length) % items.length;
      updateHighlight(items);
    }
  } else if (e.key === "Enter") {
    e.preventDefault();
    executeSelection();
  } else if (e.key === "Backspace" && !ccSearchInput.value) {
    // Go up folder
    if (folderHistory.length > 0) {
      e.preventDefault();
      const parentId = folderHistory.pop();
      loadFolder(parentId);
    }
  } else if (e.key === "Escape") {
    closeCommandCenter();
  }
}

function updateHighlight(items) {
  items.forEach(item => item.classList.remove("selected"));
  const activeItem = items[selectedIndex];
  if (activeItem) {
    activeItem.classList.add("selected");
    activeItem.scrollIntoView({ block: "nearest" });
  }
}

function highlightSuggestion(sugItems) {
  sugItems.forEach(item => item.classList.remove("selected"));
  const activeItem = sugItems[selectedSuggestionIndex];
  if (activeItem) {
    activeItem.classList.add("selected");
    activeItem.scrollIntoView({ block: "nearest" });
  }
}

function executeSelection() {
  if (selectedIndex < 0 || selectedIndex >= visibleItems.length) {
    // If user has typed a command starting with /no and presses enter directly:
    const query = ccSearchInput.value.trim();
    if (query.startsWith("/no")) {
      executeNotesCommand(query);
      return;
    }

    // No matching bookmark item is selected: treat the search input text as a direct URL or spaced web query
    const queryTerm = ccSearchInput.value.trim();
    if (queryTerm) {
      const hasSpace = /\s/.test(queryTerm);
      const isDirectUrl = !hasSpace && (
        /^(https?:\/\/)?([\da-z\.-]+)\.([a-z\.]{2,6})([\/\w \.-]*)*\/?$/i.test(queryTerm)
      );
      
      let targetUrl = queryTerm;
      if (isDirectUrl) {
        if (!/^https?:\/\//i.test(queryTerm)) {
          targetUrl = "https://" + queryTerm;
        }
      } else {
        // Spaced search query or general term: open Google Search
        targetUrl = "https://www.google.com/search?q=" + encodeURIComponent(queryTerm);
      }
      
      window.open(targetUrl, "_blank");
      closeCommandCenter();
    }
    return;
  }
  
  const item = visibleItems[selectedIndex];

  if (item.isNote) {
    if (item.textToAppend) {
      appendNoteContent(item.noteName, item.textToAppend);
    } else {
      showToast(`Note "${item.noteName}":\n${item.noteContent}`, "success");
      ccSearchInput.value = `/no ${item.noteName} `;
      ccSearchInput.focus();
      handleCCSearch(ccSearchInput.value);
    }
    return;
  }

  if (item.isCreateNoteAction) {
    createOrUpdateNote(item.noteName, item.noteContent || "");
    return;
  }

  if (item.url) {
    // Open Bookmark
    window.open(item.url, "_blank");
    closeCommandCenter();
  } else {
    // Navigate into Folder
    folderHistory.push(currentFolderId);
    loadFolder(item.id);
    ccSearchInput.value = "";
    hideSuggestions();
  }
}

// -------------------------------------------------------------
// PREFIX COMMAND PARSER
// -------------------------------------------------------------
function renderCCSuggestions(val) {
  ccSuggestions.innerHTML = "";
  const cmdQuery = val.split(" ")[0].toLowerCase();
  
  const matches = CC_COMMANDS.filter(c => c.cmd.startsWith(cmdQuery));
  if (matches.length === 0) {
    hideSuggestions();
    return;
  }

  ccSuggestions.classList.remove("hidden");
  selectedSuggestionIndex = -1;

  matches.forEach((c, idx) => {
    const div = document.createElement("div");
    div.className = `cc-suggestion-item ${idx === selectedSuggestionIndex ? "selected" : ""}`;
    div.innerHTML = `
      <span class="cc-sug-cmd">${c.cmd}</span>
      <span class="cc-sug-desc">${c.desc}</span>
    `;
    div.addEventListener("click", () => {
      ccSearchInput.value = c.cmd;
      ccSearchInput.focus();
      hideSuggestions();
      handleCCSearch(c.cmd);
    });
    ccSuggestions.appendChild(div);
  });
}

function hideSuggestions() {
  ccSuggestions.classList.add("hidden");
  ccSuggestions.innerHTML = "";
}

function executeCCCommand(val) {
  const parts = val.split(" ");
  const cmd = parts[0].toLowerCase();
  const query = parts.slice(1).join(" ").trim().toLowerCase();

  let results = [];
  let title = `Filter: ${cmd}`;

  switch (cmd) {
    case "/help":
      showCCHelp();
      break;

    case "/t":
      if (!query) return;
      results = allFlattenedBookmarks.filter(bm => bm.title && bm.title.toLowerCase().includes(query));
      title = `Title matches: "${query}"`;
      break;

    case "/u":
      if (!query) return;
      results = allFlattenedBookmarks.filter(bm => bm.url && bm.url.toLowerCase().includes(query));
      title = `URL matches: "${query}"`;
      break;

    case "/c":
      if (!query) return;
      const categories = BookmarkRules.categories;
      results = allFlattenedBookmarks.filter(bm => {
        const catId = BookmarkRules.classify(bm.title, bm.url, categories);
        if (catId) {
          const subId = BookmarkRules.classifySubcategory(catId, bm.title, bm.url);
          return catId.toLowerCase() === query || subId.toLowerCase() === query;
        }
        return false;
      });
      title = `Category: "${query}"`;
      break;

    case "/d":
      if (!query) return;
      results = allFlattenedBookmarks.filter(bm => {
        const d = BookmarkRules.getDomain(bm.url);
        return d && d.includes(query);
      });
      title = `Domain: "${query}"`;
      break;

    case "/sort":
      if (!query) return;
      results = [...visibleItems];
      if (query === "name") {
        results.sort((a, b) => (a.title || "").localeCompare(b.title || ""));
      } else if (query === "date") {
        results.sort((a, b) => (b.dateAdded || 0) - (a.dateAdded || 0));
      } else if (query === "url") {
        results.sort((a, b) => (a.url || "").localeCompare(b.url || ""));
      }
      title = `Sorted by ${query}`;
      break;

    case "/wizard":
      chrome.runtime.sendMessage({ action: "open_dashboard" });
      closeCommandCenter();
      return;

    case "/manager":
      chrome.runtime.sendMessage({ action: "open_dashboard" });
      closeCommandCenter();
      return;

    case "/undo":
      alert("Undo requested. Opening dashboard to recover bookmarks tree.");
      chrome.runtime.sendMessage({ action: "open_dashboard" });
      closeCommandCenter();
      return;
  }

  if (cmd !== "/help" && cmd !== "/wizard" && cmd !== "/undo") {
    visibleItems = results;
    renderItemsList(results);
    ccBreadcrumbs.textContent = title;
  }
}

function showCCHelp() {
  ccResultsList.innerHTML = "";
  ccEmptyState.classList.add("hidden");

  const helpItems = [
    { title: "/t <text>", desc: "Search globally in bookmark titles only" },
    { cmd: true },
    { title: "/u <text>", desc: "Search globally in bookmark URLs only" },
    { cmd: true },
    { title: "/c <cat>", desc: "Filter by category (e.g. movies, study, software, adult, sports)" },
    { cmd: true },
    { title: "/d <domain>", desc: "Filter by domain name (e.g. github.com)" },
    { cmd: true },
    { title: "/sort <type>", desc: "Sort list items by name, date, or url" },
    { cmd: true },
    { title: "/manager", desc: "Open the bookmark manager dashboard" },
    { cmd: true },
    { title: "/wizard", desc: "Open the smart organizer wizard tab" },
    { cmd: true },
    { title: "/undo", desc: "Restore your original bookmarks backup" }
  ];

  helpItems.forEach(item => {
    const div = document.createElement("div");
    div.className = "cc-item";
    div.innerHTML = `
      <div class="cc-item-left">
        <span class="cc-item-icon">💡</span>
        <span class="cc-item-title" style="font-family:monospace; color:#a5b4fc;">${item.title}</span>
      </div>
      <span class="cc-item-right" style="color:#9ca3af;">${item.desc}</span>
    `;
    ccResultsList.appendChild(div);
  });

  ccBreadcrumbs.textContent = "Commands Guide";
}

// -------------------------------------------------------------
// NOTES COMMAND ENGINE & TOASTS
// -------------------------------------------------------------
function renderNotesSuggestions(val) {
  let queryStr = "";
  let isNotesCmd = false;
  
  if (val.toLowerCase().startsWith("/notes")) {
    queryStr = val.substring(6).trim();
    isNotesCmd = true;
  } else {
    queryStr = val.substring(3).trim();
  }
  
  const parts = queryStr.split(" ");
  const subCommand = parts[0] ? parts[0].toLowerCase() : "";
  
  chrome.storage.local.get(['bookmark_organizer_notes'], (result) => {
    const notes = result.bookmark_organizer_notes || {};
    const notesList = Object.keys(notes);
    
    if (isNotesCmd) {
      if (subCommand === "se") {
        const query = parts.slice(1).join(" ").trim().toLowerCase();
        ccBreadcrumbs.textContent = `Search notes: "${query}"`;
        
        const matches = notesList.filter(name => {
          return name.toLowerCase().includes(query) || notes[name].toLowerCase().includes(query);
        }).map(name => ({
          id: "note_" + name,
          title: `📝 Note: ${name}`,
          url: "",
          contentSnippet: notes[name].substring(0, 40) + (notes[name].length > 40 ? "..." : ""),
          isNote: true,
          noteName: name,
          noteContent: notes[name]
        }));
        
        visibleItems = matches;
        renderItemsList(visibleItems);
      } else {
        ccBreadcrumbs.textContent = "Saved Notes";
        visibleItems = notesList.map(name => ({
          id: "note_" + name,
          title: `📝 Note: ${name}`,
          url: "",
          contentSnippet: notes[name].substring(0, 40) + (notes[name].length > 40 ? "..." : ""),
          isNote: true,
          noteName: name,
          noteContent: notes[name]
        }));
        
        if (visibleItems.length === 0) {
          visibleItems = [{
            id: "no_notes",
            title: "No notes saved yet",
            contentSnippet: "Type /no <note_name> <text> to create one!",
            isStaticHelp: true
          }];
        }
        renderItemsList(visibleItems);
      }
      return;
    }
    
    if (subCommand === "se") {
      const query = parts.slice(1).join(" ").trim().toLowerCase();
      ccBreadcrumbs.textContent = `Search notes: "${query}"`;
      
      const matches = notesList.filter(name => {
        return name.toLowerCase().includes(query) || notes[name].toLowerCase().includes(query);
      }).map(name => ({
        id: "note_" + name,
        title: `📝 Note: ${name}`,
        url: "",
        contentSnippet: notes[name].substring(0, 40) + (notes[name].length > 40 ? "..." : ""),
        isNote: true,
        noteName: name,
        noteContent: notes[name]
      }));
      
      visibleItems = matches;
      renderItemsList(visibleItems);
    } else if (subCommand === "new") {
      const noteName = parts[1] || "";
      const noteContent = parts.slice(2).join(" ").trim();
      ccBreadcrumbs.textContent = `Create new note: "${noteName || 'untitled'}"`;
      
      visibleItems = [{
        id: "create_new_note",
        title: `🆕 Create Note: "${noteName || 'untitled'}"`,
        contentSnippet: noteContent || "Type content...",
        isCreateNoteAction: true,
        noteName: noteName,
        noteContent: noteContent
      }];
      renderItemsList(visibleItems);
    } else {
      const noteName = parts[0] || "";
      const textToAppend = parts.slice(1).join(" ").trim();
      
      if (!noteName) {
        visibleItems = notesList.map(name => ({
          id: "note_" + name,
          title: `📝 Note: ${name}`,
          contentSnippet: notes[name].substring(0, 40) + (notes[name].length > 40 ? "..." : ""),
          isNote: true,
          noteName: name,
          noteContent: notes[name]
        }));
        
        if (visibleItems.length === 0) {
          visibleItems = [{
            id: "no_notes",
            title: "No notes saved yet",
            contentSnippet: "Type /no <note_name> <text> to create one!",
            isStaticHelp: true
          }];
        }
      } else {
        const noteExists = notes[noteName] !== undefined;
        if (noteExists) {
          ccBreadcrumbs.textContent = `Note: ${noteName}`;
          visibleItems = [{
            id: "note_" + noteName,
            title: `📝 Note: ${noteName}`,
            contentSnippet: textToAppend ? `Append: "${textToAppend}"` : notes[noteName],
            isNote: true,
            noteName: noteName,
            noteContent: notes[noteName],
            textToAppend: textToAppend
          }];
        } else {
          ccBreadcrumbs.textContent = `New note: ${noteName}`;
          visibleItems = [{
            id: "create_note_" + noteName,
            title: `🆕 Create Note: "${noteName}"`,
            contentSnippet: textToAppend || "Save empty note",
            isCreateNoteAction: true,
            noteName: noteName,
            noteContent: textToAppend
          }];
        }
      }
      renderItemsList(visibleItems);
    }
  });
}

function executeNotesCommand(query) {
  let queryStr = "";
  let isNotesCmd = false;
  
  if (query.toLowerCase().startsWith("/notes")) {
    queryStr = query.substring(6).trim();
    isNotesCmd = true;
  } else {
    queryStr = query.substring(3).trim();
  }
  
  const parts = queryStr.split(" ");
  const subCommand = parts[0] ? parts[0].toLowerCase() : "";

  if (isNotesCmd) {
    if (subCommand === "se") return;
    
    const noteName = parts[0] || "";
    if (noteName) {
      chrome.storage.local.get(['bookmark_organizer_notes'], (result) => {
        const notes = result.bookmark_organizer_notes || {};
        if (notes[noteName] !== undefined) {
          showToast(`Note "${noteName}":\n${notes[noteName]}`, "success");
          closeCommandCenter();
        } else {
          showToast(`Note "${noteName}" does not exist.`, "error");
        }
      });
    }
    return;
  }

  if (subCommand === "se") return;

  if (subCommand === "new") {
    const noteName = parts[1] || "";
    const noteContent = parts.slice(2).join(" ").trim();
    if (!noteName) {
      showToast("Note name cannot be empty!", "error");
      return;
    }
    createOrUpdateNote(noteName, noteContent);
    return;
  }

  const noteName = parts[0] || "";
  const textToAppend = parts.slice(1).join(" ").trim();

  if (!noteName) {
    showToast("Please specify a note name (e.g. /no mynote content)", "error");
    return;
  }

  chrome.storage.local.get(['bookmark_organizer_notes'], (result) => {
    const notes = result.bookmark_organizer_notes || {};
    if (notes[noteName] !== undefined) {
      if (textToAppend) {
        appendNoteContent(noteName, textToAppend);
      } else {
        showToast(`Note "${noteName}":\n${notes[noteName]}`, "success");
        closeCommandCenter();
      }
    } else {
      createOrUpdateNote(noteName, textToAppend || "");
    }
  });
}

function createOrUpdateNote(name, content) {
  chrome.storage.local.get(['bookmark_organizer_notes'], (result) => {
    const notes = result.bookmark_organizer_notes || {};
    notes[name] = content;
    chrome.storage.local.set({ 'bookmark_organizer_notes': notes }, () => {
      showToast(`Note "${name}" saved!`, "success");
      closeCommandCenter();
    });
  });
}

function appendNoteContent(name, text) {
  chrome.storage.local.get(['bookmark_organizer_notes'], (result) => {
    const notes = result.bookmark_organizer_notes || {};
    const oldContent = notes[name] || "";
    const newContent = oldContent ? oldContent + "\n" + text : text;
    notes[name] = newContent;
    chrome.storage.local.set({ 'bookmark_organizer_notes': notes }, () => {
      showToast(`Appended to note "${name}"!`, "success");
      closeCommandCenter();
    });
  });
}

function showToast(message, type = 'success') {
  const container = document.body;
  const toast = document.createElement('div');
  toast.className = `custom-toast toast-${type}`;
  toast.style.cssText = `
    position: fixed;
    bottom: 24px;
    right: 24px;
    background: ${type === 'success' ? 'rgba(16, 185, 129, 0.22)' : 'rgba(244, 63, 94, 0.22)'};
    border: 1px solid ${type === 'success' ? 'rgba(16, 185, 129, 0.4)' : 'rgba(244, 63, 94, 0.4)'};
    border-left: 5px solid ${type === 'success' ? '#10b981' : '#f43f5e'};
    color: white;
    padding: 14px 22px;
    border-radius: 12px;
    font-family: system-ui, -apple-system, sans-serif;
    font-size: 13.5px;
    font-weight: 600;
    box-shadow: 0 10px 30px ${type === 'success' ? 'rgba(16, 185, 129, 0.22)' : 'rgba(244, 63, 94, 0.22)'};
    backdrop-filter: blur(14px);
    -webkit-backdrop-filter: blur(14px);
    z-index: 2147483647;
    transform: translateY(100px);
    opacity: 0;
    display: flex;
    align-items: center;
    gap: 10px;
    transition: all 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275);
  `;
  
  const iconSvg = type === 'success' 
    ? `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="#10b981" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" style="display:flex; align-items:center; flex-shrink:0;"><polyline points="20 6 9 17 4 12"></polyline></svg>`
    : `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="#f43f5e" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" style="display:flex; align-items:center; flex-shrink:0;"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>`;

  toast.innerHTML = `
    ${iconSvg}
    <span>${message}</span>
  `;
  container.appendChild(toast);
  
  setTimeout(() => {
    toast.style.transform = 'translateY(0)';
    toast.style.opacity = '1';
  }, 50);
  
  setTimeout(() => {
    toast.style.transform = 'translateY(100px)';
    toast.style.opacity = '0';
    setTimeout(() => toast.remove(), 400);
  }, 3500);
}
