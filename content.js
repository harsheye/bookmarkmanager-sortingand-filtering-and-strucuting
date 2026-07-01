// Content Script: Floating Bookmark Command Center Overlay

let ccRoot = null;
let ccShadow = null;
let ccBackdrop = null;
let ccSearchInput = null;
let ccSuggestions = null;
let ccResultsList = null;
let ccEmptyState = null;
let ccBreadcrumbs = null;

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

  // Add styles
  const style = document.createElement("style");
  style.textContent = `
    @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600;700&display=swap');
    
    :host {
      all: initial;
    }
    .cc-backdrop {
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: rgba(4, 2, 10, 0.22);
      backdrop-filter: blur(8px);
      -webkit-backdrop-filter: blur(8px);
      z-index: 2147483647;
      display: flex;
      justify-content: center;
      align-items: center;
      opacity: 0;
      pointer-events: none;
      transition: opacity 0.25s ease;
      font-family: 'Outfit', -apple-system, sans-serif;
      color: #f3f4f6;
    }
    .cc-backdrop.active {
      opacity: 1;
      pointer-events: auto;
    }
    .cc-modal {
      width: 100%;
      max-width: 820px;
      background: rgba(10, 8, 22, 0.52);
      border: 1px solid rgba(255, 255, 255, 0.12);
      border-radius: 16px;
      box-shadow: 0 20px 60px rgba(0, 0, 0, 0.6);
      backdrop-filter: blur(20px);
      -webkit-backdrop-filter: blur(20px);
      display: flex;
      flex-direction: column;
      overflow: hidden;
      max-height: 600px;
      transform: scale(0.96);
      transition: transform 0.2s cubic-bezier(0.175, 0.885, 0.32, 1.275);
    }
    .cc-backdrop.active .cc-modal {
      transform: scale(1);
    }
    .cc-search-wrapper {
      display: flex;
      align-items: center;
      padding: 16px 20px;
      border-bottom: 1px solid rgba(255, 255, 255, 0.06);
      background: rgba(0, 0, 0, 0.2);
    }
    .cc-search-icon {
      font-size: 20px;
      margin-right: 12px;
      color: #9ca3af;
    }
    .cc-search-input {
      background: transparent;
      border: none;
      color: white;
      font-size: 16px;
      width: 100%;
      outline: none;
      font-family: inherit;
    }
    .cc-search-hint {
      font-size: 11px;
      color: rgba(255, 255, 255, 0.25);
      white-space: nowrap;
      margin-left: 10px;
      background: rgba(255, 255, 255, 0.04);
      padding: 3px 8px;
      border-radius: 4px;
      border: 1px solid rgba(255, 255, 255, 0.05);
    }
    .cc-results-container {
      flex-grow: 1;
      overflow-y: auto;
      max-height: 440px;
      background: rgba(0, 0, 0, 0.1);
    }
    .cc-results-list {
      display: flex;
      flex-direction: column;
      padding: 8px;
    }
    .cc-item {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 10px 14px;
      border-radius: 10px;
      cursor: pointer;
      margin-bottom: 2px;
      transition: all 0.15s;
      border-left: 3px solid transparent;
    }
    .cc-item:hover, .cc-item.selected {
      background: rgba(99, 102, 241, 0.2);
      border-left-color: #8b5cf6;
    }
    .cc-item-left {
      display: flex;
      align-items: center;
      gap: 12px;
      overflow: hidden;
      max-width: 75%;
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
      font-size: 14.5px;
      font-weight: 500;
      color: #e2e8f0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .cc-item-right {
      font-size: 11.5px;
      color: #9ca3af;
      flex-shrink: 0;
      text-overflow: ellipsis;
      overflow: hidden;
      white-space: nowrap;
      max-width: 25%;
    }
    .cc-suggestions {
      background: rgba(13, 10, 27, 0.6);
      border-bottom: 1px solid rgba(255, 255, 255, 0.05);
      display: flex;
      flex-direction: column;
      padding: 6px;
      max-height: 150px;
      overflow-y: auto;
    }
    .cc-suggestion-item {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 8px 12px;
      border-radius: 6px;
      font-size: 13px;
      cursor: pointer;
      color: #cbd5e1;
    }
    .cc-suggestion-item:hover, .cc-suggestion-item.selected {
      background: rgba(99, 102, 241, 0.15);
      color: white;
    }
    .cc-sug-cmd {
      font-family: monospace;
      font-weight: 700;
      color: #a5b4fc;
    }
    .cc-sug-desc {
      color: #9ca3af;
      font-size: 11.5px;
    }
    .cc-footer {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 12px 20px;
      border-top: 1px solid rgba(255, 255, 255, 0.05);
      background: rgba(0, 0, 0, 0.25);
      font-size: 12px;
      color: #9ca3af;
    }
    .cc-breadcrumbs {
      font-weight: 500;
      color: #a5b4fc;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      max-width: 50%;
    }
    .cc-shortcuts {
      display: flex;
      gap: 12px;
      color: rgba(255, 255, 255, 0.3);
    }
    .cc-shortcuts span {
      display: inline-flex;
      align-items: center;
    }
    .cc-empty-state {
      text-align: center;
      padding: 40px;
      color: #9ca3af;
      font-style: italic;
      font-size: 14px;
    }
    ::-webkit-scrollbar {
      width: 6px;
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
        <span class="cc-search-icon">🔍</span>
        <input type="text" class="cc-search-input" placeholder="Search title/url or type / for commands..." autofocus autocomplete="off">
        <span class="cc-search-hint">Alt+Shift+A</span>
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
    
    e.stopPropagation();
    handleCCKeydown(e);
  });

  ccSearchInput.addEventListener("keypress", (e) => {
    e.stopPropagation();
  });

  ccSearchInput.addEventListener("keyup", (e) => {
    e.stopPropagation();
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
      // Bookmark Link
      const domain = BookmarkRules.getDomain(item.url);
      const faviconUrl = `https://www.google.com/s2/favicons?sz=32&domain=${domain}`;
      leftHtml = `
        <img class="cc-favicon" src="${faviconUrl}" onerror="this.style.display='none'">
        <span class="cc-item-title">${item.title || item.url}</span>
      `;
      rightHtml = `<span class="cc-item-right" title="${item.url}">${domain}</span>`;
    } else {
      // Folder Directory
      leftHtml = `
        <span class="cc-item-icon">📁</span>
        <span class="cc-item-title" style="font-weight:600; color:white;">${item.title}</span>
      `;
      rightHtml = `<span class="cc-item-right" style="color:#a855f7; font-style:italic;">Folder</span>`;
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
      renderItemsList(visibleItems);
      ccBreadcrumbs.textContent = `Scoped search [${scopeDomain}]: "${scopeQuery}"`;
    } else {
      // Normal global filter search
      const query = val.toLowerCase();
      visibleItems = allFlattenedBookmarks.filter(bm => 
        (bm.title && bm.title.toLowerCase().includes(query)) ||
        (bm.url && bm.url.toLowerCase().includes(query))
      );
      renderItemsList(visibleItems);
      ccBreadcrumbs.textContent = `Search results: "${val}"`;
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
    // No matching bookmark item is selected: treat the search input text as a direct URL or spaced web query
    const query = ccSearchInput.value.trim();
    if (query) {
      const hasSpace = /\s/.test(query);
      const isDirectUrl = !hasSpace && (
        /^(https?:\/\/)?([\da-z\.-]+)\.([a-z\.]{2,6})([\/\w \.-]*)*\/?$/i.test(query)
      );
      
      let targetUrl = query;
      if (isDirectUrl) {
        if (!/^https?:\/\//i.test(query)) {
          targetUrl = "https://" + query;
        }
      } else {
        // Spaced search query or general term: open Google Search
        targetUrl = "https://www.google.com/search?q=" + encodeURIComponent(query);
      }
      
      window.open(targetUrl, "_blank");
      closeCommandCenter();
    }
    return;
  }
  
  const item = visibleItems[selectedIndex];

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
