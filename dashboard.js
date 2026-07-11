// Dashboard controller for Smart Bookmark Organizer

// DOM Elements
const steps = {
  1: document.getElementById('step-1'),
  2: document.getElementById('step-2'),
  3: document.getElementById('step-3'),
  4: document.getElementById('step-4')
};

const stepIndicators = {
  1: document.getElementById('step-ind-1'),
  2: document.getElementById('step-ind-2'),
  3: document.getElementById('step-ind-3'),
  4: document.getElementById('step-ind-4')
};

const stepLines = {
  1: document.getElementById('line-1'),
  2: document.getElementById('line-2'),
  3: document.getElementById('line-3')
};

// Controls
const startScanBtn = document.getElementById('start-scan-btn');
const prevStepBtn = document.getElementById('prev-step-btn');
const applySortBtn = document.getElementById('apply-sort-btn');
const restoreBtn = document.getElementById('restore-btn');
const navRestoreBtn = document.getElementById('nav-restore-btn');
const finishBtn = document.getElementById('finish-btn');
const restartBtn = document.getElementById('restart-btn');
const navRestartBtn = document.getElementById('restart-btn');

const thresholdSlider = document.getElementById('threshold-slider');
const thresholdVal = document.getElementById('threshold-val');
const categoriesContainer = document.getElementById('categories-container');
const parentFolderNameInput = document.getElementById('parent-folder-name');
const selectAllPreview = document.getElementById('select-all-preview');
const treePreviewBody = document.getElementById('tree-preview-body');
const treeRootNameLabel = document.getElementById('tree-root-name-label');

// Live Status Elements
const scanPct = document.getElementById('scan-pct');
const scanningTitle = document.getElementById('scanning-title');
const scanningSub = document.getElementById('scanning-sub');
const statTotal = document.getElementById('stat-total');
const statFolders = document.getElementById('stat-folders');
const statMatched = document.getElementById('stat-matched');
const scanLog = document.getElementById('scan-log');

// Success Page Stats
const succFolders = document.getElementById('succ-folders');
const succMoved = document.getElementById('succ-moved');
const backupTimestampText = document.getElementById('backup-timestamp-text');

// State Variables
let allBookmarks = [];
let proposedGroups = {};
let activeCategories = [];
let scanProgress = 0;
let lastBackup = null;
let isDragSelecting = false;

// Initialize
document.addEventListener('DOMContentLoaded', () => {
  // Load custom categories config and learned domains from storage and merge
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
    
    initCategoriesUI();
    checkExistingBackup();
    setupEventListeners();
    
    document.addEventListener('mouseup', () => {
      isDragSelecting = false;
    });
    
    // Initialize Custom Bookmark Explorer
    BookmarkManager.init();
  });
});

// 1. Initialize UI Elements
function initCategoriesUI() {
  categoriesContainer.innerHTML = '';
  BookmarkRules.categories.forEach(cat => {
    const isAdult = cat.id === 'adult';
    const badgeHtml = isAdult 
      ? '<span class="badge badge-adult">18+ Private</span>' 
      : `<span class="badge">${cat.name.split(' ')[0]}</span>`;

    const item = document.createElement('div');
    item.className = 'category-item';
    item.innerHTML = `
      <div class="category-info">
        <div class="category-title-row">
          <span class="category-name">${cat.name}</span>
          ${badgeHtml}
        </div>
        <span class="category-desc">${cat.description}</span>
      </div>
      <label class="switch">
        <input type="checkbox" id="cat-toggle-${cat.id}" ${cat.enabled ? 'checked' : ''}>
        <span class="slider-switch"></span>
      </label>
    `;
    categoriesContainer.appendChild(item);

    // Track active categories
    const toggle = item.querySelector('input');
    toggle.addEventListener('change', (e) => {
      cat.enabled = e.target.checked;
      saveCategoriesConfig();
    });
  });
}

function saveCategoriesConfig() {
  const config = {};
  BookmarkRules.categories.forEach(cat => {
    config[cat.id] = cat.enabled;
  });
  chrome.storage.local.set({ 'categories_config': config });
}

function checkExistingBackup() {
  chrome.storage.local.get(['bookmarks_backup'], (result) => {
    if (result.bookmarks_backup) {
      lastBackup = result.bookmarks_backup;
      if (navRestoreBtn) navRestoreBtn.classList.remove('hidden');
      if (backupTimestampText) {
        const dateStr = new Date(lastBackup.timestamp).toLocaleString();
        backupTimestampText.textContent = `Backup created: ${dateStr}`;
      }
    } else {
      if (navRestoreBtn) navRestoreBtn.classList.add('hidden');
    }
  });
}

function setupEventListeners() {
  // Slider threshold
  thresholdSlider.addEventListener('input', (e) => {
    thresholdVal.textContent = e.target.value;
  });

  // Welcome page start scan
  startScanBtn.addEventListener('click', startScanAndSort);

  // Apply sorting
  applySortBtn.addEventListener('click', applyBookmarkSorting);

  // Restore bookmark backup
  restoreBtn.addEventListener('click', restoreOriginalBookmarks);
  if (navRestoreBtn) navRestoreBtn.addEventListener('click', restoreOriginalBookmarks);

  // Scan Again header button
  const navScanBtn = document.getElementById('nav-scan-btn');
  if (navScanBtn) {
    navScanBtn.addEventListener('click', () => {
      goToStep(1);
    });
  }

  // Prev step back to settings
  prevStepBtn.addEventListener('click', () => {
    goToStep(1);
  });

  // Finish button (Go to bookmark manager)
  finishBtn.addEventListener('click', () => {
    chrome.tabs.create({ url: 'chrome://bookmarks/' });
  });

  // Restart wizard
  restartBtn.addEventListener('click', () => {
    goToStep(1);
  });

  // Link main root checkbox to all sub-checkboxes
  selectAllPreview.addEventListener('change', (e) => {
    const checked = e.target.checked;
    const checkboxes = treePreviewBody.querySelectorAll('input[type="checkbox"]');
    checkboxes.forEach(cb => {
      cb.checked = checked;
      // trigger event to update parent stats
      cb.dispatchEvent(new Event('change'));
    });
    updatePreviewCount();
  });

  // Update target root folder label when user edits input
  parentFolderNameInput.addEventListener('input', (e) => {
    const val = e.target.value.trim() || 'Smart Sorted Bookmarks';
    treeRootNameLabel.textContent = val;
  });
}

// 2. Wizard Stepper Controller
function goToStep(stepNum) {
  // Hide all steps
  Object.keys(steps).forEach(s => {
    steps[s].classList.remove('active-step');
    stepIndicators[s].classList.remove('active', 'completed');
  });
  
  // Show active step
  steps[stepNum].classList.add('active-step');
  
  // Update Indicators
  for (let i = 1; i <= 4; i++) {
    if (i < stepNum) {
      stepIndicators[i].classList.add('completed');
    } else if (i === stepNum) {
      stepIndicators[i].classList.add('active');
    }
  }

  // Update Progress Lines
  Object.keys(stepLines).forEach(lineNum => {
    if (lineNum < stepNum) {
      stepLines[lineNum].classList.add('completed');
    } else {
      stepLines[lineNum].classList.remove('completed');
    }
  });

  // Toggle "Scan Again" button in the header
  const navScanBtn = document.getElementById('nav-scan-btn');
  if (navScanBtn) {
    if (stepNum === 4) {
      navScanBtn.classList.remove('hidden');
    } else if (stepNum === 1) {
      if (lastBackup) {
        navScanBtn.classList.remove('hidden');
      } else {
        navScanBtn.classList.add('hidden');
      }
    } else {
      navScanBtn.classList.add('hidden');
    }
  }
}

// 3. Logging Helper
function addLog(text, type = '') {
  const line = document.createElement('div');
  line.className = `log-line ${type}`;
  line.textContent = `[${new Date().toLocaleTimeString()}] ${text}`;
  scanLog.appendChild(line);
  scanLog.scrollTop = scanLog.scrollHeight;
}

// 4. STEP 2: Scanning & Processing Logic
function startScanAndSort() {
  goToStep(2);
  scanProgress = 0;
  updateScanProgress(0);
  scanLog.innerHTML = '';
  
  addLog('Loading persistent rules database...');
  
  // Load dynamically learned domains
  chrome.storage.local.get(['learned_domains'], (result) => {
    const learned = result.learned_domains || {};
    let totalLearnedCount = 0;
    
    BookmarkRules.categories.forEach(cat => {
      if (learned[cat.id]) {
        const uniqueDomains = new Set([...(cat.domains || []), ...learned[cat.id]]);
        cat.domains = Array.from(uniqueDomains);
        totalLearnedCount += learned[cat.id].length;
      }
    });

    if (totalLearnedCount > 0) {
      addLog(`Loaded ${totalLearnedCount} auto-learned domains from history.`);
    }

    addLog('Retrieving Chrome Bookmarks tree structure...');

    // Read current bookmarks
    chrome.bookmarks.getTree((tree) => {
      addLog('Chrome Bookmarks retrieved successfully.');
      
      // Flatten bookmark nodes (extracting bookmarks, skipping folders)
      allBookmarks = [];
      addLog('Flattening tree hierarchy...');
      const parentFolderBlockName = parentFolderNameInput.value.trim() || 'Smart Sorted Bookmarks';
      
      function traverse(node) {
        // If bookmark has a URL, it is a bookmark item (leaf node)
        if (node.url) {
          allBookmarks.push(node);
        }
        
        // If it has children, traverse them
        if (node.children) {
          // Prevent sorting already sorted folder recursively
          if (node.title === parentFolderBlockName || node.title === 'Smart Sorted Bookmarks') {
            addLog(`Skipped scanning existing sorted folder: "${node.title}"`, 'warn');
            return;
          }
          node.children.forEach(child => traverse(child));
        }
      }
      
      // Start traversal from root children (normally Bookmark Bar, Other Bookmarks, Mobile Bookmarks)
      if (tree && tree[0] && tree[0].children) {
        tree[0].children.forEach(child => traverse(child));
      }
      
      addLog(`Scanning completed. Found ${allBookmarks.length} bookmark nodes.`);
      statTotal.textContent = allBookmarks.length;

      if (allBookmarks.length === 0) {
        addLog('No bookmarks found to organize!', 'warn');
        updateScanProgress(100);
        setTimeout(() => {
          alert('We did not find any bookmarks to sort. Add some bookmarks in your browser first!');
          goToStep(1);
        }, 1500);
        return;
      }

      // Begin Classification Process
      setTimeout(() => {
        runClassification();
      }, 800);
    });
  });
}

function updateScanProgress(pct) {
  scanProgress = pct;
  scanPct.textContent = `${Math.round(pct)}%`;
}

function runClassification() {
  const threshold = parseInt(thresholdSlider.value, 10);
  addLog(`Analyzing domain distributions (threshold: ${threshold} bookmarks)...`);
  
  // Count domains
  const domainCounts = {};
  allBookmarks.forEach(bm => {
    const domain = BookmarkRules.getDomain(bm.url);
    if (domain) {
      domainCounts[domain] = (domainCounts[domain] || 0) + 1;
    }
  });

  addLog('Matching bookmarks to categories, subcategories & domain groups...');

  // Reset proposed groups
  proposedGroups = {
    categories: {},
    domains: {}
  };

  // Initialize active categories
  const activeCategories = BookmarkRules.categories.filter(c => c.enabled);
  activeCategories.forEach(c => {
    proposedGroups.categories[c.id] = {
      name: c.name,
      subgroups: {}
    };
    if (c.subcategories) {
      c.subcategories.forEach(sub => {
        proposedGroups.categories[c.id].subgroups[sub.id] = {
          name: sub.name,
          bookmarks: []
        };
      });
    } else {
      proposedGroups.categories[c.id].subgroups["default"] = {
        name: c.name,
        bookmarks: []
      };
    }
  });

  // Always initialize general category
  proposedGroups.categories["general"] = {
    name: "General Bookmarks",
    subgroups: {
      "default": {
        name: "General Bookmarks",
        bookmarks: []
      }
    }
  };

  let matchedCount = 0;
  let domainsCreatedCount = 0;
  const newlyLearned = {}; // categoryId -> Set of domains

  allBookmarks.forEach((bm, idx) => {
    const domain = BookmarkRules.getDomain(bm.url);
    
    // 1. Check if domain threshold is met
    if (domain && domainCounts[domain] >= threshold) {
      const groupKey = `domain:${domain}`;
      if (!proposedGroups.domains[groupKey]) {
        const folderName = domain.split('.')[0].toUpperCase() + ' Links';
        proposedGroups.domains[groupKey] = { name: folderName, bookmarks: [] };
        domainsCreatedCount++;
      }
      proposedGroups.domains[groupKey].bookmarks.push(bm);
      matchedCount++;
    } 
    // 2. Run rule-based classification
    else {
      const categoryId = BookmarkRules.classify(bm.title, bm.url, activeCategories);
      if (categoryId && proposedGroups.categories[categoryId]) {
        const subId = BookmarkRules.classifySubcategory(categoryId, bm.title, bm.url);
        proposedGroups.categories[categoryId].subgroups[subId].bookmarks.push(bm);
        matchedCount++;

        // Auto-learn website domains classified by keyword matching
        const cat = BookmarkRules.categories.find(c => c.id === categoryId);
        if (domain && cat && !cat.domains.includes(domain)) {
          if (!newlyLearned[categoryId]) newlyLearned[categoryId] = new Set();
          newlyLearned[categoryId].add(domain);
        }
      } 
      // 3. Fallback: General / Unsorted Bookmarks
      else {
        proposedGroups.categories["general"].subgroups["default"].bookmarks.push(bm);
      }
    }

    // Update progress bar incrementally
    if (idx % Math.max(1, Math.floor(allBookmarks.length / 10)) === 0) {
      const pct = (idx / allBookmarks.length) * 80; // save remaining 20% for rendering preview
      updateScanProgress(pct);
    }
  });

  // Persist newly learned domains
  chrome.storage.local.get(['learned_domains'], (result) => {
    const learned = result.learned_domains || {};
    let addedCount = 0;
    
    Object.keys(newlyLearned).forEach(catId => {
      if (!learned[catId]) learned[catId] = [];
      newlyLearned[catId].forEach(d => {
        if (!learned[catId].includes(d)) {
          learned[catId].push(d);
          const cat = BookmarkRules.categories.find(c => c.id === catId);
          if (cat) cat.domains.push(d); // Update in-memory configurations
          addedCount++;
          addLog(`[Auto-Learn] Added "${d}" to ${cat.name} domains based on title content.`, 'success');
        }
      });
    });

    if (addedCount > 0) {
      chrome.storage.local.set({ 'learned_domains': learned });
    }
  });

  // Clean empty subgroups and categories
  Object.keys(proposedGroups.categories).forEach(catId => {
    const cat = proposedGroups.categories[catId];
    Object.keys(cat.subgroups).forEach(subId => {
      if (cat.subgroups[subId].bookmarks.length === 0) {
        delete cat.subgroups[subId];
      }
    });
    if (Object.keys(cat.subgroups).length === 0) {
      delete proposedGroups.categories[catId];
    }
  });

  // Clean empty domains
  Object.keys(proposedGroups.domains).forEach(dKey => {
    if (proposedGroups.domains[dKey].bookmarks.length === 0) {
      delete proposedGroups.domains[dKey];
    }
  });

  // Compute folders count
  const totalFoldersCount = Object.keys(proposedGroups.domains).length + 
    Object.values(proposedGroups.categories).reduce((sum, cat) => {
      const subKeys = Object.keys(cat.subgroups);
      if (subKeys.length === 1 && subKeys[0] === 'default') {
        return sum + 1; // Category folder
      }
      return sum + 1 + subKeys.length; // Category parent folder + subfolders
    }, 0);

  addLog(`Classification complete. Found ${domainsCreatedCount} domain-specific clusters.`);
  addLog(`Sorted ${matchedCount} of ${allBookmarks.length} bookmarks into custom folders.`);

  statFolders.textContent = totalFoldersCount;
  statMatched.textContent = matchedCount;

  // Complete scanning animation
  let finalPct = scanProgress;
  const interval = setInterval(() => {
    finalPct += 5;
    updateScanProgress(Math.min(100, finalPct));
    if (finalPct >= 100) {
      clearInterval(interval);
      setTimeout(() => {
        renderPreview();
        goToStep(3);
      }, 500);
    }
  }, 30);
}

// 5. STEP 3: Preview Render Logic
function renderPreview() {
  treePreviewBody.innerHTML = '';
  
  const hasCategories = Object.keys(proposedGroups.categories).length > 0;
  const hasDomains = Object.keys(proposedGroups.domains).length > 0;

  if (!hasCategories && !hasDomains) {
    treePreviewBody.innerHTML = `
      <div class="tree-empty">
        <span class="tree-empty-icon">📂</span>
        <span>No folders were generated. Try decreasing the domain threshold or enabling more categories.</span>
      </div>
    `;
    updatePreviewCount();
    return;
  }

  // 1. Render Categories (with nested subfolders if applicable)
  Object.keys(proposedGroups.categories).forEach(catId => {
    const cat = proposedGroups.categories[catId];
    
    // Sum bookmarks in all subgroups
    let totalLinks = 0;
    Object.keys(cat.subgroups).forEach(subId => {
      totalLinks += cat.subgroups[subId].bookmarks.length;
    });

    const catDiv = document.createElement('div');
    catDiv.className = 'tree-folder';
    catDiv.id = `preview-cat-${catId}`;
    
    catDiv.innerHTML = `
      <div class="folder-header" data-cat-id="${catId}">
        <div class="folder-info">
          <label class="checkbox-container" onclick="event.stopPropagation()">
            <input type="checkbox" class="cat-checkbox" data-cat-id="${catId}" checked>
            <span class="checkmark"></span>
          </label>
          <span class="folder-toggle-icon">▶</span>
          <span style="display:flex; align-items:center; color:var(--color-primary);"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M19.5,5H13.243a3,3,0,0,1-2.122-.879l-1.414-1.414A3,3,0,0,0,7.586,1.828H4.5A2.5,2.5,0,0,0,2,4.328V19.5A2.5,2.5,0,0,0,4.5,22h15A2.5,2.5,0,0,0,22,19.5V7.5A2.5,2.5,0,0,0,19.5,5ZM20,19.5a.5.5,0,0,1-.5.5H4.5a.5.5,0,0,1-.5-.5V7.5A.5.5,0,0,1,4.5,7h15a.5.5,0,0,1,.5.5Z"/></svg></span>
          <input type="text" class="cat-name-input" data-cat-id="${catId}" value="${cat.name}" onclick="event.stopPropagation()">
        </div>
        <span class="badge badge-purple">${totalLinks} links</span>
      </div>
      <div class="folder-children" id="cat-children-${catId}">
        <!-- Child items (direct bookmarks or subfolders) loaded here -->
      </div>
    `;
    
    const childrenContainer = catDiv.querySelector(`#cat-children-${catId}`);
    const catCheckbox = catDiv.querySelector('.cat-checkbox');
    const folderToggle = catDiv.querySelector('.folder-header');
    const toggleIcon = catDiv.querySelector('.folder-toggle-icon');

    // Toggle expand/collapse of Category Folder
    folderToggle.addEventListener('click', () => {
      childrenContainer.classList.toggle('expanded');
      toggleIcon.classList.toggle('expanded');
      toggleIcon.textContent = childrenContainer.classList.contains('expanded') ? '▼' : '▶';
    });

    // Check/Uncheck all descendants
    catCheckbox.addEventListener('change', (e) => {
      const checked = e.target.checked;
      childrenContainer.querySelectorAll('input[type="checkbox"]').forEach(cb => {
        cb.checked = checked;
      });
      updatePreviewCount();
    });

    const subKeys = Object.keys(cat.subgroups);
    const isDirect = subKeys.length === 1 && subKeys[0] === 'default';

    if (isDirect) {
      // Category without custom subcategories: render bookmarks directly
      const sub = cat.subgroups['default'];
      sub.bookmarks.forEach(bm => {
        const itemDiv = createBookmarkDOM(bm, catId, 'default');
        childrenContainer.appendChild(itemDiv);
      });
    } else {
      // Category with nested subcategories
      subKeys.forEach(subId => {
        const sub = cat.subgroups[subId];
        const subfolderDiv = document.createElement('div');
        subfolderDiv.className = 'tree-subfolder';
        subfolderDiv.id = `preview-sub-${catId}-${subId}`;

        subfolderDiv.innerHTML = `
          <div class="subfolder-header" data-cat-id="${catId}" data-sub-id="${subId}">
            <div class="folder-info">
              <label class="checkbox-container" onclick="event.stopPropagation()">
                <input type="checkbox" class="sub-checkbox" data-cat-id="${catId}" data-sub-id="${subId}" checked>
                <span class="checkmark"></span>
              </label>
              <span class="subfolder-toggle-icon">▶</span>
              <span style="display:flex; align-items:center; color:var(--color-primary);"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M19.5,5H13.243a3,3,0,0,1-2.122-.879l-1.414-1.414A3,3,0,0,0,7.586,1.828H4.5A2.5,2.5,0,0,0,2,4.328V19.5A2.5,2.5,0,0,0,4.5,22h15A2.5,2.5,0,0,0,22,19.5V7.5A2.5,2.5,0,0,0,19.5,5ZM20,19.5a.5.5,0,0,1-.5.5H4.5a.5.5,0,0,1-.5-.5V7.5A.5.5,0,0,1,4.5,7h15a.5.5,0,0,1,.5.5Z"/></svg></span>
              <input type="text" class="subfolder-name-input" data-cat-id="${catId}" data-sub-id="${subId}" value="${sub.name}" onclick="event.stopPropagation()">
            </div>
            <span class="badge badge-purple" style="font-size: 11px;">${sub.bookmarks.length} links</span>
          </div>
          <div class="subfolder-children" id="sub-children-${catId}-${subId}">
            <!-- Bookmarks here -->
          </div>
        `;

        const subChildrenContainer = subfolderDiv.querySelector(`#sub-children-${catId}-${subId}`);
        const subCheckbox = subfolderDiv.querySelector('.sub-checkbox');
        const subToggle = subfolderDiv.querySelector('.subfolder-header');
        const subToggleIcon = subfolderDiv.querySelector('.subfolder-toggle-icon');

        // Toggle subfolder open/close
        subToggle.addEventListener('click', () => {
          subChildrenContainer.classList.toggle('expanded');
          subToggleIcon.classList.toggle('expanded');
          subToggleIcon.textContent = subChildrenContainer.classList.contains('expanded') ? '▼' : '▶';
        });

        // Toggle subfolder checkbox
        subCheckbox.addEventListener('change', (e) => {
          const checked = e.target.checked;
          subChildrenContainer.querySelectorAll('.bookmark-checkbox').forEach(cb => {
            cb.checked = checked;
          });
          updateTreeCheckboxStates(catId, subId);
          updatePreviewCount();
        });

        // Add bookmarks
        sub.bookmarks.forEach(bm => {
          const itemDiv = createBookmarkDOM(bm, catId, subId);
          subChildrenContainer.appendChild(itemDiv);
        });

        childrenContainer.appendChild(subfolderDiv);
      });
    }

    treePreviewBody.appendChild(catDiv);
  });

  // 2. Render Domain Folders (flat list)
  Object.keys(proposedGroups.domains).forEach(domainKey => {
    const group = proposedGroups.domains[domainKey];
    const domainDiv = document.createElement('div');
    domainDiv.className = 'tree-folder';
    domainDiv.id = `preview-domain-${domainKey}`;

    domainDiv.innerHTML = `
      <div class="folder-header" data-domain-key="${domainKey}">
        <div class="folder-info">
          <label class="checkbox-container" onclick="event.stopPropagation()">
            <input type="checkbox" class="domain-checkbox" data-domain-key="${domainKey}" checked>
            <span class="checkmark"></span>
          </label>
          <span class="folder-toggle-icon">▶</span>
          <span style="display:flex; align-items:center; color:var(--color-primary);"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M19.5,5H13.243a3,3,0,0,1-2.122-.879l-1.414-1.414A3,3,0,0,0,7.586,1.828H4.5A2.5,2.5,0,0,0,2,4.328V19.5A2.5,2.5,0,0,0,4.5,22h15A2.5,2.5,0,0,0,22,19.5V7.5A2.5,2.5,0,0,0,19.5,5ZM20,19.5a.5.5,0,0,1-.5.5H4.5a.5.5,0,0,1-.5-.5V7.5A.5.5,0,0,1,4.5,7h15a.5.5,0,0,1,.5.5Z"/></svg></span>
          <input type="text" class="domain-name-input" data-domain-key="${domainKey}" value="${group.name}" onclick="event.stopPropagation()">
        </div>
        <span class="badge badge-purple">${group.bookmarks.length} links</span>
      </div>
      <div class="folder-children" id="domain-children-${domainKey}">
        <!-- Links loaded here -->
      </div>
    `;

    const childrenContainer = domainDiv.querySelector(`#domain-children-${domainKey}`);
    const domainCheckbox = domainDiv.querySelector('.domain-checkbox');
    const folderToggle = domainDiv.querySelector('.folder-header');
    const toggleIcon = domainDiv.querySelector('.folder-toggle-icon');

    folderToggle.addEventListener('click', () => {
      childrenContainer.classList.toggle('expanded');
      toggleIcon.classList.toggle('expanded');
      toggleIcon.textContent = childrenContainer.classList.contains('expanded') ? '▼' : '▶';
    });

    domainCheckbox.addEventListener('change', (e) => {
      const checked = e.target.checked;
      childrenContainer.querySelectorAll('.bookmark-checkbox').forEach(cb => {
        cb.checked = checked;
      });
      updatePreviewCount();
    });

    group.bookmarks.forEach(bm => {
      const itemDiv = document.createElement('div');
      itemDiv.className = 'tree-item';
      const cleanDomain = BookmarkRules.getDomain(bm.url);
      
      itemDiv.innerHTML = `
        <label class="checkbox-container">
          <input type="checkbox" class="bookmark-checkbox" data-domain-key="${domainKey}" data-bookmark-id="${bm.id}" checked>
          <span class="checkmark"></span>
        </label>
        <span>📄</span>
        <a href="${bm.url}" target="_blank" class="item-link" title="${bm.title || bm.url}">${bm.title || bm.url}</a>
        <span class="item-domain">${cleanDomain}</span>
      `;
      childrenContainer.appendChild(itemDiv);

      const itemCb = itemDiv.querySelector('.bookmark-checkbox');
      itemCb.addEventListener('change', () => {
        updateDomainCheckboxState(domainKey);
        updatePreviewCount();
      });
    });

    treePreviewBody.appendChild(domainDiv);
  });

  updatePreviewCount();
}

function createBookmarkDOM(bm, catId, subId) {
  const itemDiv = document.createElement('div');
  itemDiv.className = 'tree-item';
  const cleanDomain = BookmarkRules.getDomain(bm.url);

  itemDiv.innerHTML = `
    <label class="checkbox-container">
      <input type="checkbox" class="bookmark-checkbox" data-cat-id="${catId}" data-sub-id="${subId}" data-bookmark-id="${bm.id}" checked>
      <span class="checkmark"></span>
    </label>
    <span>📄</span>
    <a href="${bm.url}" target="_blank" class="item-link" title="${bm.title || bm.url}">${bm.title || bm.url}</a>
    <span class="item-domain">${cleanDomain}</span>
  `;

  const itemCheckbox = itemDiv.querySelector('.bookmark-checkbox');
  itemCheckbox.addEventListener('change', () => {
    updateTreeCheckboxStates(catId, subId);
    updatePreviewCount();
  });

  return itemDiv;
}

function updateTreeCheckboxStates(catId, subId = null) {
  // Update subcategory checkbox state based on child bookmarks
  if (subId && subId !== 'default') {
    const subContainer = document.getElementById(`preview-sub-${catId}-${subId}`);
    if (subContainer) {
      const subCb = subContainer.querySelector('.sub-checkbox');
      const itemCbs = subContainer.querySelectorAll('.bookmark-checkbox');
      let checkedCount = 0;
      itemCbs.forEach(cb => { if (cb.checked) checkedCount++; });

      if (checkedCount === 0) {
        subCb.checked = false;
        subCb.indeterminate = false;
      } else if (checkedCount === itemCbs.length) {
        subCb.checked = true;
        subCb.indeterminate = false;
      } else {
        subCb.checked = false;
        subCb.indeterminate = true;
      }
    }
  }

  // Update Category checkbox based on subcategory checkboxes OR direct bookmarks
  const catContainer = document.getElementById(`preview-cat-${catId}`);
  if (catContainer) {
    const catCb = catContainer.querySelector('.cat-checkbox');
    const subCbs = catContainer.querySelectorAll('.sub-checkbox');
    
    if (subCbs.length > 0) {
      let checkedCount = 0;
      let indeterminateCount = 0;
      subCbs.forEach(cb => {
        if (cb.checked) checkedCount++;
        if (cb.indeterminate) indeterminateCount++;
      });

      if (checkedCount === 0 && indeterminateCount === 0) {
        catCb.checked = false;
        catCb.indeterminate = false;
      } else if (checkedCount === subCbs.length) {
        catCb.checked = true;
        catCb.indeterminate = false;
      } else {
        catCb.checked = false;
        catCb.indeterminate = true;
      }
    } else {
      const itemCbs = catContainer.querySelectorAll('.bookmark-checkbox');
      let checkedCount = 0;
      itemCbs.forEach(cb => { if (cb.checked) checkedCount++; });

      if (checkedCount === 0) {
        catCb.checked = false;
        catCb.indeterminate = false;
      } else if (checkedCount === itemCbs.length) {
        catCb.checked = true;
        catCb.indeterminate = false;
      } else {
        catCb.checked = false;
        catCb.indeterminate = true;
      }
    }
  }
}

function updateDomainCheckboxState(domainKey) {
  const domainDiv = document.getElementById(`preview-domain-${domainKey}`);
  if (domainDiv) {
    const domainCb = domainDiv.querySelector('.domain-checkbox');
    const itemCbs = domainDiv.querySelectorAll('.bookmark-checkbox');
    let checkedCount = 0;
    itemCbs.forEach(cb => { if (cb.checked) checkedCount++; });

    if (checkedCount === 0) {
      domainCb.checked = false;
      domainCb.indeterminate = false;
    } else if (checkedCount === itemCbs.length) {
      domainCb.checked = true;
      domainCb.indeterminate = false;
    } else {
      domainCb.checked = false;
      domainCb.indeterminate = true;
    }
  }
}

function updatePreviewCount() {
  const checkedLinks = treePreviewBody.querySelectorAll('.bookmark-checkbox:checked');
  const checkedFolders = treePreviewBody.querySelectorAll('.cat-checkbox:checked, .cat-checkbox:indeterminate, .sub-checkbox:checked, .sub-checkbox:indeterminate, .domain-checkbox:checked, .domain-checkbox:indeterminate');
  
  document.getElementById('preview-stat-count').textContent = 
    `${checkedLinks.length} bookmarks in ${checkedFolders.length} folders selected`;
}

// 6. Apply Sorting Actions
async function applyBookmarkSorting() {
  const parentName = parentFolderNameInput.value.trim() || 'Smart Sorted Bookmarks';
  
  const selectedCategories = [];
  
  Object.keys(proposedGroups.categories).forEach(catId => {
    const catDiv = document.getElementById(`preview-cat-${catId}`);
    const catNameInput = catDiv.querySelector('.cat-name-input');
    const customCatName = catNameInput.value.trim() || proposedGroups.categories[catId].name;

    const subkeys = Object.keys(proposedGroups.categories[catId].subgroups);
    const isDirect = subkeys.length === 1 && subkeys[0] === 'default';

    if (isDirect) {
      // Flat Category
      const checkedItemCbs = catDiv.querySelectorAll('.bookmark-checkbox:checked');
      if (checkedItemCbs.length > 0) {
        selectedCategories.push({
          catId: catId,
          catName: customCatName,
          isDirect: true,
          subgroups: [
            {
              subId: 'default',
              subName: customCatName,
              bookmarkIds: Array.from(checkedItemCbs).map(cb => cb.dataset.bookmarkId)
            }
          ]
        });
      }
    } else {
      // Hierarchical Category with subfolders
      const selectedSubs = [];
      subkeys.forEach(subId => {
        const subDiv = document.getElementById(`preview-sub-${catId}-${subId}`);
        if (subDiv) {
          const subNameInput = subDiv.querySelector('.subfolder-name-input');
          const customSubName = subNameInput.value.trim() || proposedGroups.categories[catId].subgroups[subId].name;

          const checkedItemCbs = subDiv.querySelectorAll('.bookmark-checkbox:checked');
          if (checkedItemCbs.length > 0) {
            selectedSubs.push({
              subId: subId,
              subName: customSubName,
              bookmarkIds: Array.from(checkedItemCbs).map(cb => cb.dataset.bookmarkId)
            });
          }
        }
      });

      if (selectedSubs.length > 0) {
        selectedCategories.push({
          catId: catId,
          catName: customCatName,
          isDirect: false,
          subgroups: selectedSubs
        });
      }
    }
  });

  const selectedDomains = [];
  Object.keys(proposedGroups.domains).forEach(domainKey => {
    const domainDiv = document.getElementById(`preview-domain-${domainKey}`);
    const nameInput = domainDiv.querySelector('.domain-name-input');
    const customName = nameInput.value.trim() || proposedGroups.domains[domainKey].name;

    const checkedItemCbs = domainDiv.querySelectorAll('.bookmark-checkbox:checked');
    if (checkedItemCbs.length > 0) {
      selectedDomains.push({
        domainKey: domainKey,
        folderName: customName,
        bookmarkIds: Array.from(checkedItemCbs).map(cb => cb.dataset.bookmarkId)
      });
    }
  });

  if (selectedCategories.length === 0 && selectedDomains.length === 0) {
    alert('Please select at least one bookmark folder to apply changes.');
    return;
  }

  // Show loading
  applySortBtn.disabled = true;
  applySortBtn.textContent = 'Organizing...';

  try {
    // 1. SECURE BACKUP SNAPSHOT: Flatten selected items' current positions BEFORE we move them
    const backupLog = {
      id: 'wizard_' + Date.now(),
      timestamp: Date.now(),
      parentFolderName: parentName,
      moves: [],
      createdFolders: [] // track IDs of folders we generate
    };

    // Gather original bookmark node positions for the ones we're about to move
    const idsToMove = new Set();
    selectedCategories.forEach(sc => sc.subgroups.forEach(sub => sub.bookmarkIds.forEach(id => idsToMove.add(id))));
    selectedDomains.forEach(sd => sd.bookmarkIds.forEach(id => idsToMove.add(id)));

    // Re-query current states to get exact indices and parentIds
    const promises = Array.from(idsToMove).map(id => {
      return new Promise((resolve) => {
        chrome.bookmarks.get(id, (nodes) => {
          if (nodes && nodes[0]) {
            resolve(nodes[0]);
          } else {
            resolve(null);
          }
        });
      });
    });

    const nodesToMove = (await Promise.all(promises)).filter(n => n !== null);
    
    // Populate backup move history
    nodesToMove.forEach(node => {
      backupLog.moves.push({
        id: node.id,
        originalParentId: node.parentId,
        originalIndex: node.index
      });
    });

    // Save backup object to local storage
    await chrome.storage.local.set({ 'bookmarks_backup': backupLog });
    
    // 2. CREATE SMART FOLDERS AND MOVE BOOKMARKS
    let parentFolderId = '1';
    let foldersCreatedCount = 0;
    
    const isDirectToBar = parentName === '' || parentName.toLowerCase() === 'bookmarks bar' || parentName.toLowerCase() === 'bookmark bar';
    
    if (!isDirectToBar) {
      const parentFolderNode = await createBookmarkFolder(parentName, '1');
      parentFolderId = parentFolderNode.id;
      backupLog.createdFolders.push(parentFolderNode.id);
      foldersCreatedCount++;
    }

    let movedBookmarksCount = 0;

    // A. Create & Move Categories
    for (const sc of selectedCategories) {
      const catFolderNode = await createBookmarkFolder(sc.catName, parentFolderId);
      backupLog.createdFolders.push(catFolderNode.id);
      foldersCreatedCount++;

      for (const sub of sc.subgroups) {
        let destinationFolderId = catFolderNode.id;

        if (!sc.isDirect) {
          // Create subcategory nested folder
          const subFolderNode = await createBookmarkFolder(sub.subName, catFolderNode.id);
          backupLog.createdFolders.push(subFolderNode.id);
          foldersCreatedCount++;
          destinationFolderId = subFolderNode.id;
        }

        for (const bId of sub.bookmarkIds) {
          await moveBookmark(bId, destinationFolderId);
          movedBookmarksCount++;
        }
      }
    }

    // B. Create & Move Domains
    for (const sd of selectedDomains) {
      const domainFolderNode = await createBookmarkFolder(sd.folderName, parentFolderId);
      backupLog.createdFolders.push(domainFolderNode.id);
      foldersCreatedCount++;

      for (const bId of sd.bookmarkIds) {
        await moveBookmark(bId, domainFolderNode.id);
        movedBookmarksCount++;
      }
    }

    // Save final updated backup log to backups history list
    const backupsResult = await new Promise(res => chrome.storage.local.get('bookmarks_backups', res));
    const backupsList = backupsResult.bookmarks_backups || [];
    backupsList.unshift(backupLog);
    if (backupsList.length > 10) backupsList.pop();
    await chrome.storage.local.set({ 'bookmarks_backups': backupsList });
    
    checkExistingBackup();

    // 3. TRANSITION TO SUCCESS PAGE
    succFolders.textContent = foldersCreatedCount;
    succMoved.textContent = movedBookmarksCount;
    
    // Clear disabled state
    applySortBtn.disabled = false;
    applySortBtn.innerHTML = '<span>Apply Organization</span> <span>✅</span>';
    
    goToStep(4);
  } catch (error) {
    console.error(error);
    alert('An error occurred during bookmark organization: ' + error.message);
    applySortBtn.disabled = false;
    applySortBtn.innerHTML = '<span>Apply Organization</span> <span>✅</span>';
  }
}

// 7. RESTORE / UNDO FUNCTIONALITY
async function restoreOriginalBookmarks() {
  chrome.storage.local.get('bookmarks_backups', async (result) => {
    const backups = result.bookmarks_backups || [];
    if (backups.length === 0) {
      showToast('No backup history found to restore.', 'error');
      return;
    }
    const latest = backups[0];
    
    const originalRestoreBtnText = restoreBtn.textContent;
    restoreBtn.disabled = true;
    restoreBtn.textContent = 'Restoring...';
    if (navRestoreBtn) navRestoreBtn.disabled = true;

    try {
      await BookmarkManager.restoreSpecificBackup(latest);
      showToast('Your bookmarks have been successfully restored!', 'success');
      goToStep(1);
    } catch (err) {
      console.error(err);
      showToast('Error during restoration: ' + err.message, 'error');
    } finally {
      restoreBtn.disabled = false;
      restoreBtn.textContent = originalRestoreBtnText;
      if (navRestoreBtn) navRestoreBtn.disabled = false;
    }
  });
}

// Bookmark API Wrappers using Promises
function createBookmarkFolder(title, parentId) {
  return new Promise((resolve, reject) => {
    chrome.bookmarks.create({
      parentId: parentId,
      title: title
    }, (newNode) => {
      if (chrome.runtime.lastError) {
        reject(chrome.runtime.lastError);
      } else {
        resolve(newNode);
      }
    });
  });
}

function moveBookmark(id, parentId) {
  return new Promise((resolve, reject) => {
    chrome.bookmarks.move(id, { parentId: parentId }, (node) => {
      if (chrome.runtime.lastError) {
        reject(chrome.runtime.lastError);
      } else {
        resolve(node);
      }
    });
  });
}

function checkExistingBackup() {
  chrome.storage.local.get('bookmarks_backups', (result) => {
    const backups = result.bookmarks_backups || [];
    if (backups.length > 0) {
      const latest = backups[0];
      lastBackup = latest;
      if (backupTimestampText) {
        const dateStr = new Date(latest.timestamp).toLocaleString();
        backupTimestampText.textContent = `Backup created: ${dateStr}`;
      }
      if (restoreBtn) restoreBtn.disabled = false;
      if (navRestoreBtn) navRestoreBtn.classList.remove('hidden');
    } else {
      lastBackup = null;
      if (backupTimestampText) {
        backupTimestampText.textContent = `No backups available`;
      }
      if (restoreBtn) restoreBtn.disabled = true;
      if (navRestoreBtn) navRestoreBtn.classList.add('hidden');
    }
  });
}

// -------------------------------------------------------------
// ⭐ BOOKMARK EXPLORER & COMMAND SEARCH MODULE
// -------------------------------------------------------------
const BookmarkManager = {
  activeFolderId: "1", // Bookmark Bar is default
  allFlattenedBookmarks: [], // Cache for global search
  currentVisibleItems: [], // Items currently in the table
  selectedSuggestionIndex: -1,
  selectedItemIds: new Set(), // Track selected table row bookmark IDs
  lastClickedId: null, // Shift-selection anchor
  dragStartRow: null, // Start row for drag selection marquee
  activeView: 'bookmarks',
  expandedFolders: new Set(), // Track which folders are expanded

  async init() {
    const urlParams = new URLSearchParams(window.location.search);
    const viewParam = urlParams.get('view');
    if (viewParam && ['bookmarks', 'history', 'cookies', 'notes', 'settings'].includes(viewParam)) {
      this.activeView = viewParam;
    } else {
      this.activeView = 'bookmarks';
    }
    
    this.bindDOM();
    this.setupListeners();
    this.setupColumnResizing();
    this.setupSidebarResizer();
    
    // Load persisted settings and folder expansion state
    chrome.storage.local.get(['organizer_user_settings', 'expandedFolders'], (result) => {
      if (result.expandedFolders && Array.isArray(result.expandedFolders)) {
        this.expandedFolders = new Set(result.expandedFolders);
      }
      
      if (result.organizer_user_settings) {
        const settings = result.organizer_user_settings;
        const parentNameInput = document.getElementById('parent-folder-name');
        const thresholdSlider = document.getElementById('threshold-slider');
        const thresholdVal = document.getElementById('threshold-val');
        
        if (parentNameInput && settings.parentFolderName) {
          parentNameInput.value = settings.parentFolderName;
        }
        if (thresholdSlider && settings.threshold) {
          thresholdSlider.value = settings.threshold;
          if (thresholdVal) {
            thresholdVal.textContent = settings.threshold;
          }
          thresholdSlider.dispatchEvent(new Event('input'));
        }
        
        // Apply all dynamic CSS and toggle overrides
        this.applySettings(settings);
      }
    });

    this.switchView(this.activeView);
    await this.refreshLibrary();
  },

  bindDOM() {
    this.viewManager = document.getElementById('manager-view');
    this.viewWizard = document.getElementById('wizard-view');
    this.toggleManagerBtn = document.getElementById('toggle-manager-btn');
    this.toggleWizardBtn = document.getElementById('toggle-wizard-btn');
    
    this.searchInput = document.getElementById('manager-search');
    this.historySearchInput = document.getElementById('history-local-search');
    this.clearSearchBtn = document.getElementById('clear-search-btn');
    this.suggestionsDropdown = document.getElementById('command-suggestions');
    
    this.breadcrumbsContainer = document.getElementById('explorer-breadcrumbs');
    this.bookmarksBody = document.getElementById('manager-bookmarks-body');
    this.emptyState = document.getElementById('manager-empty-state');
    
    this.folderTreeList = document.getElementById('folder-tree-list');
    this.addBookmarkBtn = document.getElementById('add-bookmark-btn');
    this.sidebarResizer = document.getElementById('sidebar-resizer');
    this.managerSidebar = document.querySelector('.manager-sidebar');
    
    // Modal Elements
    this.modal = document.getElementById('bookmark-modal');
    this.modalTitle = document.getElementById('modal-title');
    this.modalItemId = document.getElementById('modal-item-id');
    this.modalParentId = document.getElementById('modal-parent-id');
    this.modalType = document.getElementById('modal-type');
    this.modalInputTitle = document.getElementById('modal-input-title');
    this.modalInputUrl = document.getElementById('modal-input-url');
    this.modalUrlGroup = document.getElementById('modal-url-group');
    this.modalCancelBtn = document.getElementById('modal-cancel-btn');
    this.modalSaveBtn = document.getElementById('modal-save-btn');

    // Database Modal Elements
    this.dbModal = document.getElementById('database-modal');
    this.dbCloseBtn = document.getElementById('db-modal-close');
    this.dbCategoryTrigger = document.getElementById('db-category-trigger');
    this.dbCategorySelectedText = document.getElementById('db-category-selected-text');
    this.dbCategoryOptions = document.getElementById('db-category-options');
    this.dbNewDomainInput = document.getElementById('db-new-domain');
    this.dbAddBtn = document.getElementById('db-add-btn');
    this.dbDomainsList = document.getElementById('db-domains-list');
    this.dbSaveBtn = document.getElementById('db-save-btn');
    this.viewDbBtn = document.getElementById('view-db-btn');

    // Backups Modal Elements
    this.viewBackupsBtn = document.getElementById('view-backups-btn');
    this.backupsModal = document.getElementById('backups-modal');
    this.backupsCloseBtn = document.getElementById('backups-modal-close');
    this.backupsListContainer = document.getElementById('backups-list-container');

    // Sidebar Tabs
    this.tabBookmarks = document.getElementById('tab-bookmarks');
    this.tabHistory = document.getElementById('tab-history');
    this.tabCookies = document.getElementById('tab-cookies');
    this.tabNotes = document.getElementById('tab-notes');
    this.tabSettings = document.getElementById('tab-settings');

    // Settings Panel
    this.settingsViewContainer = document.getElementById('settings-view-container');
    this.settingsParentName = document.getElementById('settings-parent-name');
    this.settingsThresholdSlider = document.getElementById('settings-threshold-slider');
    this.settingsThresholdVal = document.getElementById('settings-threshold-val');
    this.settingsCategoriesList = document.getElementById('settings-categories-list');

    // Command Center Options
    this.settingsCcTheme = document.getElementById('settings-theme-preset');
    this.settingsCcBlur = document.getElementById('settings-cc-blur');
    this.settingsCcBlurVal = document.getElementById('settings-cc-blur-val');
    this.settingsCcHistory = document.getElementById('settings-cc-history');
    this.settingsHistoryBlacklist = document.getElementById('settings-history-blacklist');
    this.settingsHistoryWhitelist = document.getElementById('settings-history-whitelist');

    this.settingsSaveBtn = document.getElementById('settings-save-btn');

    // Notes Manager Panel
    this.notesViewContainer = document.getElementById('notes-view-container');
    this.notesSidebarList = document.getElementById('notes-sidebar-list');
    this.notesNewBtn = document.getElementById('notes-new-btn');
    this.noteEditorPane = document.getElementById('note-editor-pane');
    this.noteEditorPlaceholder = document.getElementById('note-editor-placeholder');
    this.noteEditorTitle = document.getElementById('note-editor-title');
    this.noteEditorBody = document.getElementById('note-editor-body');
    this.noteSaveBtn = document.getElementById('note-save-btn');
    this.noteDeleteBtn = document.getElementById('note-delete-btn');
    this.noteVersionsList = document.getElementById('note-versions-list');
    
    // Redesigned elements
    this.noteCloseBtn = document.getElementById('note-close-btn');
    this.notesSidebarPanel = document.getElementById('notes-sidebar-panel');
    this.notesSidebarCollapse = document.getElementById('notes-sidebar-collapse');
    this.notesSidebarExpand = document.getElementById('notes-sidebar-expand');
    this.notesSidebarResizer = document.getElementById('notes-sidebar-resizer');
    this.noteFocusBtn = document.getElementById('note-focus-btn');
    this.noteReadBtn = document.getElementById('note-read-btn');
    
    // Checklist and Diff DOM elements
    this.noteChecklistUtility = document.getElementById('note-checklist-utility');
    this.checklistProgressText = document.getElementById('checklist-progress-text');
    this.checklistProgressBarFill = document.getElementById('checklist-progress-bar-fill');
    this.noteEditorPreview = document.getElementById('note-editor-preview');
    this.notesDiffOverlay = document.getElementById('notes-diff-overlay');
    this.diffVersionInfo = document.getElementById('diff-version-info');
    this.diffMetadataRow = document.getElementById('diff-metadata-row');
    this.diffViewerContent = document.getElementById('diff-viewer-content');
    this.versionSearchInput = document.getElementById('version-search-input');

    // Premium Redesigned History View elements
    this.historyViewContainer = document.getElementById('history-view-container');
    this.historyViewport = document.getElementById('history-viewport');
    this.historyViewportSpacer = document.getElementById('history-viewport-spacer');
    this.historyViewportContent = document.getElementById('history-viewport-content');
    this.historyStatsContainer = document.getElementById('history-stats');
    this.historySortSelectPremium = document.getElementById('history-sort-select-premium');
    this.historyVisitThresholdInput = document.getElementById('history-visit-threshold');
    this.historySelectionBar = document.getElementById('history-selection-bar');
    this.historySelectionCount = document.getElementById('history-selection-count');
    this.blacklistManagerPanel = document.getElementById('blacklist-manager-panel');
    this.blacklistRulesTableBody = document.getElementById('blacklist-rules-table-body');
    this.historyDetailsPanel = document.getElementById('history-details-panel');
    this.historyStartDateInput = document.getElementById('history-filter-start-date');
    this.historyEndDateInput = document.getElementById('history-filter-end-date');
    this.historySidebarPanel = document.querySelector('.history-sidebar-filters');
    this.historySidebarResizer = document.getElementById('history-sidebar-resizer');
  },

  setupListeners() {
    // Toggle Views
    this.toggleWizardBtn.addEventListener('click', () => this.showWizard());
    this.toggleManagerBtn.addEventListener('click', () => this.showManager());

    // Folder Tree Keyboard Navigation
    if (this.folderTreeList) {
      this.folderTreeList.addEventListener('keydown', (e) => {
        const labels = Array.from(this.folderTreeList.querySelectorAll('.folder-tree-label'));
        if (labels.length === 0) return;
        let activeIdx = labels.findIndex(l => l.classList.contains('active'));
        if (activeIdx === -1) activeIdx = 0;

        if (e.key === 'ArrowDown') {
          e.preventDefault();
          if (activeIdx < labels.length - 1) {
            labels[activeIdx + 1].click();
          }
        } else if (e.key === 'ArrowUp') {
          e.preventDefault();
          if (activeIdx > 0) {
            labels[activeIdx - 1].click();
          }
        } else if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
          e.preventDefault();
          const activeLabel = labels[activeIdx];
          const arrow = activeLabel.querySelector('.tree-toggle-arrow');
          if (arrow && !arrow.classList.contains('spacer')) {
            const isExpanded = arrow.classList.contains('expanded');
            if (e.key === 'ArrowRight' && !isExpanded) {
              activeLabel.click(); // Expand
            } else if (e.key === 'ArrowLeft' && isExpanded) {
              activeLabel.click(); // Collapse
            } else if (e.key === 'ArrowLeft' && !isExpanded) {
              // Move to parent folder
              const currentDepth = parseInt(activeLabel.style.paddingLeft) || 0;
              for (let i = activeIdx - 1; i >= 0; i--) {
                const pDepth = parseInt(labels[i].style.paddingLeft) || 0;
                if (pDepth < currentDepth) {
                  labels[i].click();
                  break;
                }
              }
            }
          }
        }
      });
    }

    // Sidebar Views
    if (this.tabBookmarks) {
      this.tabBookmarks.addEventListener('click', () => this.switchView('bookmarks'));
    }
    if (this.tabHistory) {
      this.tabHistory.addEventListener('click', () => this.switchView('history'));
    }
    if (this.tabCookies) {
      this.tabCookies.addEventListener('click', () => this.switchView('cookies'));
    }
    if (this.tabSettings) {
      this.tabSettings.addEventListener('click', () => this.switchView('settings'));
    }

    if (this.settingsThresholdSlider) {
      this.settingsThresholdSlider.addEventListener('input', (e) => {
        if (this.settingsThresholdVal) this.settingsThresholdVal.textContent = e.target.value;
      });
    }

    if (this.settingsCcBlur) {
      this.settingsCcBlur.addEventListener('input', (e) => {
        if (this.settingsCcBlurVal) this.settingsCcBlurVal.textContent = e.target.value + 'px';
      });
    }

    if (this.settingsSaveBtn) {
      this.settingsSaveBtn.addEventListener('click', () => this.saveSettingsFromManager());
    }

    // Search and Command Logic
    this.searchInput.addEventListener('input', (e) => {
      const val = e.target.value.trim();
      if (this.activeView === 'bookmarks') {
        this.handleSearchInput(val);
      } else if (this.activeView === 'history') {
        this.loadHistory(val);
      } else if (this.activeView === 'cookies') {
        // this.loadCookies(val);
      } else if (this.activeView === 'notes') {
        this.loadNotesManager(val);
      }
    });
    
    if (this.historySearchInput) {
      this.historySearchInput.addEventListener('input', (e) => {
        const val = e.target.value.trim();
        if (this.activeView === 'history') {
          this.loadHistory(val);
        }
      });
    }
    
    this.searchInput.addEventListener('keydown', (e) => this.handleSearchKeydown(e));
    this.clearSearchBtn.addEventListener('click', () => {
      this.searchInput.value = '';
      if (this.activeView === 'bookmarks') {
        this.handleSearchInput('');
      } else if (this.activeView === 'history') {
        this.loadHistory('');
      } else if (this.activeView === 'cookies') {
        // this.loadCookies('');
      } else if (this.activeView === 'notes') {
        this.loadNotesManager('');
      }
      this.searchInput.focus();
    });

    // Hide suggestions dropdown when clicking outside
    document.addEventListener('click', (e) => {
      if (!this.searchInput.contains(e.target) && !this.suggestionsDropdown.contains(e.target)) {
        this.hideSuggestions();
      }
    });

    // Add Bookmark
    this.addBookmarkBtn.addEventListener('click', () => this.openAddModal());
    
    // Restructure Library
    const restructureBtn = document.getElementById('restructure-btn');
    if (restructureBtn) {
      restructureBtn.addEventListener('click', () => this.runBackgroundRestructure());
    }
    
    // Modal Cancel/Save
    this.modalCancelBtn.addEventListener('click', () => this.closeModal());
    this.modalSaveBtn.addEventListener('click', () => this.saveModalItem());
    this.modal.addEventListener('click', (e) => {
      if (e.target === this.modal) this.closeModal();
    });

    // Database Modal listeners
    if (this.viewDbBtn) {
      this.viewDbBtn.addEventListener('click', () => this.openDbModal());
    }
    if (this.dbCloseBtn) {
      this.dbCloseBtn.addEventListener('click', () => this.closeDbModal());
    }
    if (this.dbCategoryTrigger) {
      this.dbCategoryTrigger.addEventListener('click', (e) => {
        e.stopPropagation();
        this.dbCategoryOptions.classList.toggle('hidden');
      });
    }
    document.addEventListener('click', () => {
      if (this.dbCategoryOptions) this.dbCategoryOptions.classList.add('hidden');
    });
    if (this.dbAddBtn) {
      this.dbAddBtn.addEventListener('click', () => this.addDbDomainChips());
    }
    if (this.dbSaveBtn) {
      this.dbSaveBtn.addEventListener('click', () => this.saveDbChanges());
    }
    if (this.dbModal) {
      this.dbModal.addEventListener('click', (e) => {
        if (e.target === this.dbModal) this.closeDbModal();
      });
    }

    // Table Header Sorting listeners
    const thName = document.getElementById('th-name');
    const thUrl = document.getElementById('th-url');
    if (thName) thName.addEventListener('click', () => this.sortVisibleItems('name'));
    if (thUrl) thUrl.addEventListener('click', () => this.sortVisibleItems('url'));

    // Global mousemove for robust click-and-drag marquee selection (bypasses pointer capture blocks)
    this.bookmarksBody.addEventListener('mousemove', (e) => {
      if (isDragSelecting && this.dragStartRow) {
        const element = document.elementFromPoint(e.clientX, e.clientY);
        if (!element) return;
        const tr = element.closest('tr');
        if (tr && tr.parentElement === this.bookmarksBody) {
          const allRows = Array.from(this.bookmarksBody.querySelectorAll('tr'));
          const startIndex = allRows.indexOf(this.dragStartRow);
          const endIndex = allRows.indexOf(tr);
          
          if (startIndex !== -1 && endIndex !== -1) {
            const start = Math.min(startIndex, endIndex);
            const end = Math.max(startIndex, endIndex);
            
            this.selectedItemIds.clear();
            allRows.forEach(r => r.classList.remove('selected-row'));
            
            for (let i = start; i <= end; i++) {
              const rowId = allRows[i].dataset.itemId;
              this.selectedItemIds.add(rowId);
              allRows[i].classList.add('selected-row');
            }
          }
        }
      }
    });

    // Backups History Trigger listeners
    if (this.viewBackupsBtn) {
      this.viewBackupsBtn.addEventListener('click', () => this.openBackupsModal());
    }
    if (this.backupsCloseBtn) {
      this.backupsCloseBtn.addEventListener('click', () => this.closeBackupsModal());
    }
    if (this.backupsModal) {
      this.backupsModal.addEventListener('click', (e) => {
        if (e.target === this.backupsModal) this.closeBackupsModal();
      });
    }

    // Notes Manager listeners
    if (this.tabNotes) {
      this.tabNotes.addEventListener('click', () => this.switchView('notes'));
    }
    if (this.notesNewBtn) {
      this.notesNewBtn.addEventListener('click', () => this.initiateNewNote());
    }
    if (this.noteSaveBtn) {
      this.noteSaveBtn.addEventListener('click', () => this.saveActiveNote());
    }
    if (this.noteDeleteBtn) {
      this.noteDeleteBtn.addEventListener('click', () => this.deleteActiveNote());
    }
    if (this.noteCloseBtn) {
      this.noteCloseBtn.addEventListener('click', () => {
        this.cacheActiveNoteState();
        this.activeNoteName = null;
        this.exitFocusMode();
        this.closeDiffOverlay();
        this.noteEditorPane.classList.add('hidden');
        this.noteEditorPlaceholder.classList.remove('hidden');
        this.loadNotesManager();
      });
    }



    // Split view resizer dragging
    if (this.notesSidebarResizer && this.notesSidebarPanel) {
      chrome.storage.local.get(['notes_sidebar_width_pref'], (result) => {
        if (result.notes_sidebar_width_pref) {
          const w = result.notes_sidebar_width_pref;
          this.notesSidebarPanel.style.width = w + 'px';
          document.documentElement.style.setProperty('--notes-sidebar-width', w + 'px');
        }
      });

      this.notesSidebarResizer.addEventListener('mousedown', (e) => {
        e.preventDefault();
        this.notesSidebarResizer.classList.add('resizing');
        
        const startX = e.clientX;
        const startWidth = this.notesSidebarPanel.offsetWidth;
        
        const doDrag = (moveEvent) => {
          const currentWidth = startWidth + (moveEvent.clientX - startX);
          if (currentWidth >= 150 && currentWidth <= 450) {
            this.notesSidebarPanel.style.width = currentWidth + 'px';
            document.documentElement.style.setProperty('--notes-sidebar-width', currentWidth + 'px');
          }
        };
        
        const stopDrag = () => {
          this.notesSidebarResizer.classList.remove('resizing');
          const finalWidth = this.notesSidebarPanel.offsetWidth;
          chrome.storage.local.set({ 'notes_sidebar_width_pref': finalWidth });
          document.removeEventListener('mousemove', doDrag);
          document.removeEventListener('mouseup', stopDrag);
        };
        
        document.addEventListener('mousemove', doDrag);
        document.addEventListener('mouseup', stopDrag);
      });
    }

    // History sidebar resizer dragging
    if (this.historySidebarResizer && this.historySidebarPanel) {
      chrome.storage.local.get(['history_sidebar_width_pref'], (result) => {
        if (result.history_sidebar_width_pref) {
          const w = result.history_sidebar_width_pref;
          this.historySidebarPanel.style.width = w + 'px';
        }
      });

      this.historySidebarResizer.addEventListener('mousedown', (e) => {
        e.preventDefault();
        this.historySidebarResizer.classList.add('resizing');
        
        const startX = e.clientX;
        const startWidth = this.historySidebarPanel.offsetWidth;
        
        const doDrag = (moveEvent) => {
          const currentWidth = startWidth + (moveEvent.clientX - startX);
          if (currentWidth >= 160 && currentWidth <= 450) {
            this.historySidebarPanel.style.width = currentWidth + 'px';
          }
        };
        
        const stopDrag = () => {
          this.historySidebarResizer.classList.remove('resizing');
          const finalWidth = this.historySidebarPanel.offsetWidth;
          chrome.storage.local.set({ 'history_sidebar_width_pref': finalWidth });
          document.removeEventListener('mousemove', doDrag);
          document.removeEventListener('mouseup', stopDrag);
          
          // recalculate rows for virtual scroller
          this.calculateRowOffsets();
          this.renderVirtualHistory();
        };
        
        document.addEventListener('mousemove', doDrag);
        document.addEventListener('mouseup', stopDrag);
      });
    }

    // Focus Mode Toggle
    if (this.noteFocusBtn && this.notesViewContainer) {
      this.noteFocusBtn.addEventListener('click', () => {
        const isFocus = this.notesViewContainer.classList.toggle('focus-mode-active');
        this.noteFocusBtn.innerHTML = isFocus 
          ? '<i class="fi fi-rr-compress"></i> Exit Focus' 
          : '<i class="fi fi-rr-expand"></i> Focus';
        showToast(isFocus ? 'Focus Mode activated!' : 'Focus Mode deactivated', 'info');
      });
    }

    // Reading Mode Toggle
    if (this.noteReadBtn && this.notesViewContainer) {
      this.noteReadBtn.addEventListener('click', () => {
        const isRead = this.notesViewContainer.classList.toggle('reading-mode-active');
        if (this.noteEditorBody) {
          this.noteEditorBody.readOnly = isRead;
        }
        this.noteReadBtn.innerHTML = isRead 
          ? '<i class="fi fi-rr-edit"></i> Edit Note' 
          : '<i class="fi fi-rr-eye"></i> Read';
        showToast(isRead ? 'Reading Mode: note is read-only' : 'Editing Mode activated', 'info');
      });
    }

    // ── Checklist Toolbar Listeners ──────────────────────────────────────────
    const chkInsertBtn       = document.getElementById('chk-insert-btn');
    const chkToggleBtn       = document.getElementById('chk-toggle-btn');
    const chkCompleteAllBtn  = document.getElementById('chk-complete-all');
    const chkIncompleteAll   = document.getElementById('chk-incomplete-all');
    const chkRemoveCompleted = document.getElementById('chk-remove-completed');
    const chkSortTasksBtn    = document.getElementById('chk-sort-tasks');

    if (chkInsertBtn) {
      chkInsertBtn.addEventListener('click', () => this.insertChecklistItem());
    }
    if (chkToggleBtn) {
      chkToggleBtn.addEventListener('click', () => this.toggleChecklistItemAtCursor());
    }
    if (chkCompleteAllBtn) {
      chkCompleteAllBtn.addEventListener('click', () => this.setAllChecklistItems(true));
    }
    if (chkIncompleteAll) {
      chkIncompleteAll.addEventListener('click', () => this.setAllChecklistItems(false));
    }
    if (chkRemoveCompleted) {
      chkRemoveCompleted.addEventListener('click', () => this.clearCompletedChecklistItems());
    }
    if (chkSortTasksBtn) {
      chkSortTasksBtn.addEventListener('click', () => this.sortChecklistItems());
    }

    // Update progress bar whenever the editor content changes
    if (this.noteEditorBody) {
      this.noteEditorBody.addEventListener('input', () => this.updateChecklistProgress());
    }

    // ── Version Diff Overlay Buttons ──────────────────────────────────────────
    const diffCloseBtn   = document.getElementById('diff-close-btn');
    const diffRestoreBtn = document.getElementById('diff-restore-btn');
    const diffInlineBtn  = document.getElementById('diff-mode-inline');
    const diffSideBtn    = document.getElementById('diff-mode-side');

    if (diffCloseBtn) {
      diffCloseBtn.addEventListener('click', () => this.closeDiffOverlay());
    }
    if (diffRestoreBtn) {
      diffRestoreBtn.addEventListener('click', () => this.restoreDiffVersion());
    }
    if (diffInlineBtn) {
      diffInlineBtn.addEventListener('click', () => {
        diffInlineBtn.classList.add('active');
        diffSideBtn && diffSideBtn.classList.remove('active');
        this.currentDiffMode = 'inline';
        if (this.currentDiffVersion) this.renderDiffContent(this.currentDiffVersion);
      });
    }
    if (diffSideBtn) {
      diffSideBtn.addEventListener('click', () => {
        diffSideBtn.classList.add('active');
        diffInlineBtn && diffInlineBtn.classList.remove('active');
        this.currentDiffMode = 'side';
        if (this.currentDiffVersion) this.renderDiffContent(this.currentDiffVersion);
      });
    }

    // Version search filter
    if (this.versionSearchInput) {
      this.versionSearchInput.addEventListener('input', (e) => {
        const q = e.target.value.toLowerCase().trim();
        if (!this.noteVersionsList) return;
        this.noteVersionsList.querySelectorAll('.note-revision-item').forEach(row => {
          const text = row.textContent.toLowerCase();
          row.style.display = q && !text.includes(q) ? 'none' : '';
        });
      });
    }

    // Keyboard navigation shortcuts (Ctrl+Alt+ArrowUp/ArrowDown)
    document.addEventListener('keydown', (e) => {
      if (this.activeView !== 'notes') return;
      if (e.ctrlKey && e.altKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
        e.preventDefault();
        
        chrome.storage.local.get(['bookmark_organizer_notes'], (result) => {
          const notes = result.bookmark_organizer_notes || {};
          const names = Object.keys(notes);
          if (names.length === 0) return;
          
          let currentIndex = names.indexOf(this.activeNoteName);
          let nextIndex = currentIndex;
          
          if (e.key === 'ArrowUp') {
            if (currentIndex === -1) {
              nextIndex = names.length - 1;
            } else {
              nextIndex = (currentIndex - 1 + names.length) % names.length;
            }
          } else if (e.key === 'ArrowDown') {
            if (currentIndex === -1) {
              nextIndex = 0;
            } else {
              nextIndex = (currentIndex + 1) % names.length;
            }
          }
          
          const nextNoteName = names[nextIndex];
          if (nextNoteName) {
            this.selectNote(nextNoteName);
          }
        });
      }
    });

    // Workspace Floating actions overlay menu triggers and shortcuts
    const floatBtn = document.getElementById('workspace-floating-btn');
    if (floatBtn) {
      floatBtn.addEventListener('click', (e) => this.toggleFloatingMenu(e));
    }

    // Close menu on click outside
    document.addEventListener('click', (e) => {
      const btn = document.getElementById('workspace-floating-btn');
      const menu = document.getElementById('workspace-floating-menu');
      if (btn && menu && !btn.contains(e.target) && !menu.contains(e.target)) {
        menu.classList.add('hidden');
      }
    });

    // Close menu on escape, and handle action shortcuts
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        this.closeFloatingMenu();
      }
      
      const isCtrl = e.ctrlKey || e.metaKey;
      if (isCtrl) {
        const key = e.key.toLowerCase();
        if (key === 'r' && this.activeView === 'bookmarks') {
          e.preventDefault();
          this.runBackgroundRestructure();
        } else if (key === 'd' && this.activeView === 'bookmarks') {
          e.preventDefault();
          this.openDbModal();
        } else if (key === 'p' && (this.activeView === 'bookmarks' || this.activeView === 'settings')) {
          e.preventDefault();
          this.openBackupsModal();
        } else if (key === 's' && (this.activeView === 'bookmarks' || this.activeView === 'history')) {
          e.preventDefault();
          this.showWizard();
        }
      }
    });

    // Premium Redesigned History View listeners
    this.initiateHistoryListeners();
  },

  showWizard() {
    this.viewManager.classList.add('hidden');
    this.viewWizard.classList.remove('hidden');
    this.toggleWizardBtn.classList.add('hidden');
    this.toggleManagerBtn.classList.remove('hidden');
    
    // Hide manager actions in header
    const restructureBtn = document.getElementById('restructure-btn');
    if (restructureBtn) restructureBtn.classList.add('hidden');
    if (this.viewDbBtn) this.viewDbBtn.classList.add('hidden');
  },

  showManager() {
    this.viewWizard.classList.add('hidden');
    this.viewManager.classList.remove('hidden');
    this.toggleManagerBtn.classList.add('hidden');
    this.toggleWizardBtn.classList.remove('hidden');
    
    // Show manager actions in header
    const restructureBtn = document.getElementById('restructure-btn');
    if (restructureBtn) restructureBtn.classList.remove('hidden');
    if (this.viewDbBtn) this.viewDbBtn.classList.remove('hidden');
    
    this.refreshLibrary(); // refresh table contents
  },

  async refreshLibrary() {
    // Load Folder Sidebar Tree
    await this.loadFolderTree();
    // Load Flat Bookmarks Cache for Global Searches
    await this.cacheAllBookmarks();
    // Load Active Folder contents
    await this.loadFolderContents(this.activeFolderId);
  },

  async runBackgroundRestructure() {
    const parentName = document.getElementById('parent-folder-name').value.trim() || 'Smart Sorted Bookmarks';
    const restructureBtn = document.getElementById('restructure-btn');
    const originalText = restructureBtn.innerHTML;
    
    restructureBtn.disabled = true;
    restructureBtn.innerHTML = '<span>⏳</span> Restructuring...';

    // Safety backup restore point log
    const backupLog = {
      id: 'restructure_' + Date.now(),
      timestamp: Date.now(),
      parentFolderName: 'Restructure Library (' + parentName + ')',
      moves: [],
      createdFolders: []
    };

    // Fast in-memory node lookup map
    const nodesMap = {};

    // Local wrapper to automatically track any folder created during this restructure
    async function trackCreateFolder(title, parentId) {
      const folder = await createBookmarkFolder(title, parentId);
      backupLog.createdFolders.push(folder.id);
      
      // Keep nodesMap in sync
      const newFolderObj = { id: folder.id, parentId: parentId, title: title, children: [] };
      nodesMap[folder.id] = newFolderObj;
      if (nodesMap[parentId]) {
        if (!nodesMap[parentId].children) nodesMap[parentId].children = [];
        nodesMap[parentId].children.push(newFolderObj);
      }
      return folder;
    }

    try {
      // 1. Get full bookmarks tree and index all nodes in memory
      const tree = await new Promise((resolve) => chrome.bookmarks.getTree(resolve));
      
      function indexNodes(node) {
        nodesMap[node.id] = node;
        if (node.children) {
          node.children.forEach(indexNodes);
        }
      }
      indexNodes(tree[0]);
      
      let parentId;
      const isDirectToBar = parentName === '' || parentName.toLowerCase() === 'bookmarks bar' || parentName.toLowerCase() === 'bookmark bar';
      
      if (isDirectToBar) {
        parentId = "1";
      } else {
        // 2. Find or create the parent root folder
        let parentNode = null;
        function findParent(node) {
          if (node.title === parentName && !node.url) {
            parentNode = node;
            return true;
          }
          if (node.children) {
            for (const child of node.children) {
              if (findParent(child)) return true;
            }
          }
          return false;
        }
        findParent(tree[0]);

        if (!parentNode) {
          // Create root parent folder under Bookmark Bar ("1")
          const newFolder = await trackCreateFolder(parentName, "1");
          parentId = newFolder.id;
          parentNode = { id: parentId, title: parentName, children: [] };
        } else {
          parentId = parentNode.id;
        }
      }

      // Fetch the full sub-tree of the parent folder to map existing category folders
      const parentSubtree = await new Promise((resolve) => {
        chrome.bookmarks.getSubTree(parentId, (nodes) => resolve(nodes ? nodes[0] : null));
      });

      // Map folder structures in memory: "CategoryName/SubcategoryName" -> FolderId
      const folderMap = {};
      
      // Populate the existing folderMap from parentSubtree
      if (parentSubtree && parentSubtree.children) {
        parentSubtree.children.forEach(catNode => {
          if (!catNode.url) {
            folderMap[catNode.title] = catNode.id;
            
            // Auto-enable category in BookmarkRules if its folder exists under Smart Sorted Bookmarks!
            const matchedCat = BookmarkRules.categories.find(c => c.name === catNode.title);
            if (matchedCat) {
              matchedCat.enabled = true;
            }

            if (catNode.children) {
              catNode.children.forEach(subNode => {
                if (!subNode.url) {
                  folderMap[`${catNode.title}/${subNode.title}`] = subNode.id;
                }
              });
            }
          }
        });
      }

      // 3. Flatten all bookmarks globally (including the parent folder itself to restructure already structured items)
      const allBM = [];
      function traverseGlobal(node) {
        if (node.url) {
          allBM.push(node);
        }
        if (node.children) {
          node.children.forEach(traverseGlobal);
        }
      }
      if (tree && tree[0] && tree[0].children) {
        tree[0].children.forEach(traverseGlobal);
      }

      // 3.5 Detect batched bookmarks (2 or more bookmarks added within a 5-second window)
      const buckets = {};
      allBM.forEach(bm => {
        if (bm.dateAdded) {
          const bucketKey = Math.floor(bm.dateAdded / 5000);
          if (!buckets[bucketKey]) buckets[bucketKey] = [];
          buckets[bucketKey].push(bm);
        }
      });
      
      const batchedIds = new Set();
      Object.keys(buckets).forEach(key => {
        if (buckets[key].length >= 2) {
          buckets[key].forEach(bm => batchedIds.add(bm.id));
        }
      });

      // 4. Run classification and determine misplaced bookmarks
      const activeCategories = BookmarkRules.categories;
      const moves = [];

      for (const bm of allBM) {
        // If this bookmark belongs to a batch, organize it inside its original folder itself, nested by date & category
        if (batchedIds.has(bm.id)) {
          // Check up the parent hierarchy synchronously via indexed nodesMap to see if we are already inside a dated folder
          let currentId = bm.parentId;
          let isAlreadyNested = false;
          while (currentId && currentId !== "0" && currentId !== "root") {
            const node = nodesMap[currentId];
            if (node) {
              if (/^\d{4}-\d{2}-\d{2}$/.test(node.title)) {
                isAlreadyNested = true;
                break;
              }
              currentId = node.parentId;
            } else {
              break;
            }
          }
          
          if (isAlreadyNested) {
            continue; // Already organized in a nested dated directory
          }
          
          const dateObj = new Date(bm.dateAdded);
          const year = dateObj.getFullYear();
          const month = String(dateObj.getMonth() + 1).padStart(2, '0');
          const day = String(dateObj.getDate()).padStart(2, '0');
          const dateString = `${year}-${month}-${day}`;
          
          const datedPathKey = `${bm.parentId}/dated_${dateString}`;
          let datedFolderId = folderMap[datedPathKey];
          if (!datedFolderId) {
            // Find existing dated folder synchronously inside parent children
            const parentNodeObj = nodesMap[bm.parentId];
            let existingDatedFolder = null;
            if (parentNodeObj && parentNodeObj.children) {
              existingDatedFolder = parentNodeObj.children.find(c => c.title === dateString && !c.url);
            }
            
            if (existingDatedFolder) {
              datedFolderId = existingDatedFolder.id;
            } else {
              const newDatedFolder = await trackCreateFolder(dateString, bm.parentId);
              datedFolderId = newDatedFolder.id;
            }
            folderMap[datedPathKey] = datedFolderId;
          }
          
          // Classify internally inside the dated folder
          const catId = BookmarkRules.classify(bm.title, bm.url, activeCategories);
          let finalTargetFolderId = datedFolderId;
          
          if (catId) {
            const cat = activeCategories.find(c => c.id === catId);
            if (cat) {
              const targetCatName = cat.name;
              const catPathKey = `${datedFolderId}/cat_${targetCatName}`;
              let catFolderId = folderMap[catPathKey];
              
              if (!catFolderId) {
                // Find existing category folder synchronously inside dated folder children
                const datedNodeObj = nodesMap[datedFolderId];
                let existingCatFolder = null;
                if (datedNodeObj && datedNodeObj.children) {
                  existingCatFolder = datedNodeObj.children.find(c => c.title === targetCatName && !c.url);
                }
                if (existingCatFolder) {
                  catFolderId = existingCatFolder.id;
                } else {
                  const newFolder = await trackCreateFolder(targetCatName, datedFolderId);
                  catFolderId = newFolder.id;
                }
                folderMap[catPathKey] = catFolderId;
              }
              
              finalTargetFolderId = catFolderId;
              
              // Optional: Subcategory nested folder
              const subId = BookmarkRules.classifySubcategory(catId, bm.title, bm.url);
              let targetSubName = null;
              if (cat.subcategories) {
                const sub = cat.subcategories.find(s => s.id === subId);
                if (sub) targetSubName = sub.name;
              }
              
              if (targetSubName) {
                const subPathKey = `${catFolderId}/sub_${targetSubName}`;
                let subFolderId = folderMap[subPathKey];
                if (!subFolderId) {
                  // Find existing subcategory folder synchronously inside category folder children
                  const catNodeObj = nodesMap[catFolderId];
                  let existingSubFolder = null;
                  if (catNodeObj && catNodeObj.children) {
                    existingSubFolder = catNodeObj.children.find(c => c.title === targetSubName && !c.url);
                  }
                  if (existingSubFolder) {
                    subFolderId = existingSubFolder.id;
                  } else {
                    const newFolder = await trackCreateFolder(targetSubName, catFolderId);
                    subFolderId = newFolder.id;
                  }
                  folderMap[subPathKey] = subFolderId;
                }
                finalTargetFolderId = subFolderId;
              }
            }
          }
          
          if (bm.parentId !== finalTargetFolderId) {
            moves.push({ bookmark: bm, targetFolderId: finalTargetFolderId });
          }
          continue; // Skip standard classification
        }

        // Non-batched bookmarks: standard smart classification
        const catId = BookmarkRules.classify(bm.title, bm.url, activeCategories);
        if (catId) {
          const subId = BookmarkRules.classifySubcategory(catId, bm.title, bm.url);
          const cat = activeCategories.find(c => c.id === catId);
          if (!cat) continue;

          const targetCatName = cat.name;
          let targetSubName = null;
          
          if (cat.subcategories) {
            const sub = cat.subcategories.find(s => s.id === subId);
            if (sub) targetSubName = sub.name;
          }

          // Check if category folder exists, otherwise create it
          let catFolderId = folderMap[targetCatName];
          if (!catFolderId) {
            const newCatFolder = await trackCreateFolder(targetCatName, parentId);
            catFolderId = newCatFolder.id;
            folderMap[targetCatName] = catFolderId;
          }

          let finalTargetFolderId = catFolderId;
          if (targetSubName) {
            const pathKey = `${targetCatName}/${targetSubName}`;
            let subFolderId = folderMap[pathKey];
            if (!subFolderId) {
              const newSubFolder = await trackCreateFolder(targetSubName, catFolderId);
              subFolderId = newSubFolder.id;
              folderMap[pathKey] = subFolderId;
            }
            finalTargetFolderId = subFolderId;
          }

          // If the bookmark is not currently in this final folder, it is misplaced!
          if (bm.parentId !== finalTargetFolderId) {
            moves.push({ bookmark: bm, targetFolderId: finalTargetFolderId });
          }
        }
      }

      // 4.5 Populate backup moves list
      for (const move of moves) {
        backupLog.moves.push({
          id: move.bookmark.id,
          originalParentId: move.bookmark.parentId,
          originalIndex: move.bookmark.index
        });
      }

      // 5. Execute Moves
      let movedCount = 0;
      for (const move of moves) {
        await moveBookmark(move.bookmark.id, move.targetFolderId);
        movedCount++;
      }

      // 6. Clean up empty folders recursively under our sorted parent folder (bottom-up)
      async function cleanEmptyFolders(folderId) {
        return new Promise((resolve) => {
          chrome.bookmarks.getSubTree(folderId, async (nodes) => {
            if (chrome.runtime.lastError || !nodes || !nodes[0]) {
              resolve();
              return;
            }
            
            // Flatten all subfolder nodes
            const allFolders = [];
            function traverse(n) {
              if (!n.url) {
                allFolders.push(n);
                if (n.children) {
                  n.children.forEach(traverse);
                }
              }
            }
            traverse(nodes[0]);
            
            // Process bottom-up by reversing top-down traversal list
            const reversed = allFolders.reverse();
            
            for (const f of reversed) {
              if (f.id !== "0" && f.id !== "1" && f.id !== parentId) {
                await new Promise((res) => {
                  chrome.bookmarks.getSubTree(f.id, (subtreeNodes) => {
                    if (chrome.runtime.lastError || !subtreeNodes || !subtreeNodes[0]) {
                      res(); // Skip if folder was already removed or doesn't exist
                      return;
                    }
                    const subtree = subtreeNodes[0];
                    if (!subtree.children || subtree.children.length === 0) {
                      chrome.bookmarks.remove(f.id, () => {
                        if (chrome.runtime.lastError) {
                          // Ignore removal errors if already deleted
                        }
                        res();
                      });
                    } else {
                      res();
                    }
                  });
                });
              }
            }
            resolve();
          });
        });
      }
      await cleanEmptyFolders(parentId);

      // Save restructure safety restore point to storage list
      const backupsResult = await new Promise(res => chrome.storage.local.get('bookmarks_backups', res));
      const backupsList = backupsResult.bookmarks_backups || [];
      backupsList.unshift(backupLog);
      if (backupsList.length > 10) backupsList.pop();
      await chrome.storage.local.set({ 'bookmarks_backups': backupsList });
      
      checkExistingBackup();

      showToast(`Restructured ${movedCount} misplaced bookmarks into smart directories!`, 'success');
      this.refreshLibrary();
    } catch (err) {
      console.error(err);
      showToast('Error during background restructuring: ' + err.message, 'error');
    } finally {
      restructureBtn.disabled = false;
      restructureBtn.innerHTML = originalText;
    }
  },

  // Cache all bookmarks (flattened) for rapid search
  cacheAllBookmarks() {
    return new Promise((resolve) => {
      chrome.bookmarks.getTree((tree) => {
        const flattened = [];
        this.bookmarkParentMap = new Map();
        
        const traverse = (node) => {
          if (node.id !== "0") {
            flattened.push(node);
          }
          if (node.children) {
            node.children.forEach(child => {
              this.bookmarkParentMap.set(child.id, node.id);
              traverse(child);
            });
          }
        };
        
        if (tree && tree[0] && tree[0].children) {
          tree[0].children.forEach(child => {
            this.bookmarkParentMap.set(child.id, tree[0].id);
            traverse(child);
          });
        }
        this.allFlattenedBookmarks = flattened;
        resolve();
      });
    });
  },

  // Load sidebar folder structure dynamically (using a proper nested tree with collapsible subfolders)
  loadFolderTree() {
    return new Promise((resolve) => {
      chrome.bookmarks.getTree((tree) => {
        this.folderTreeList.innerHTML = '';
        
        const rootUl = document.createElement('ul');
        rootUl.className = 'manager-tree-root';
        
        // 1. Add "All Bookmarks" Root
        const allLi = document.createElement('li');
        allLi.className = 'manager-tree-item root-item';
        
        const allLabel = document.createElement('div');
        allLabel.className = `folder-tree-label ${this.activeFolderId === 'all' ? 'active' : ''}`;
        allLabel.dataset.folderId = 'all';
        allLabel.innerHTML = `<span class="tree-toggle-arrow spacer"></span><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="currentColor" style="color:var(--color-primary); margin-right:4px;"><path d="M23.633,9.585a1.006,1.006,0,0,0-.783-.681l-6.852-1, -3.069-6.208a1.018,1.018,0,0,0-1.815,0L8.045,7.9l-6.852,1A1.006,1.006,0,0,0,.633,10.58l4.958,4.832L4.42,22.253a1,1,0,0,0,1.453,1.056L12,19.682l6.127,3.627a1,1,0,0,0,1.453-1.056l-1.171-6.841,4.958-4.832A1.006,1.006,0,0,0,23.633,9.585Z"/></svg> <span>All Bookmarks</span>`;
        allLabel.addEventListener('click', () => this.switchFolder('all'));
        allLi.appendChild(allLabel);
        rootUl.appendChild(allLi);

        const self = this;
        function buildTreeDOM(node, depth = 0) {
          // If it is a folder and not system root (id "0")
          if (node.children && !node.url && node.id !== "0") {
            const folderLi = document.createElement('li');
            folderLi.className = 'manager-tree-folder';
            
            const labelDiv = document.createElement('div');
            labelDiv.className = `folder-tree-label ${self.activeFolderId === node.id ? 'active' : ''}`;
            labelDiv.dataset.folderId = node.id;
            
            // Indentation based on depth
            labelDiv.style.paddingLeft = `calc(${depth} * 12px + 8px)`;
            
            // Drag and Drop Zone listeners for folder drop targets with spring-loaded expansion
            let hoverTimer = null;
            
            const subfolders = node.children.filter(child => child.children && !child.url);
            const hasSubfolders = subfolders.length > 0;
            const isExpanded = self.expandedFolders.has(node.id);
            
            labelDiv.addEventListener('dragover', (e) => {
              e.preventDefault();
              e.dataTransfer.dropEffect = 'move';
              labelDiv.classList.add('drag-over-folder');
              
              const childrenUl = folderLi.querySelector('.manager-tree-children');
              const arrow = labelDiv.querySelector('.tree-toggle-arrow');
              
              if (hasSubfolders && childrenUl && childrenUl.style.display === 'none') {
                if (!hoverTimer) {
                  hoverTimer = setTimeout(() => {
                    if (arrow) {
                      arrow.classList.add('expanded');
                      arrow.textContent = '▼';
                    }
                    childrenUl.style.display = 'flex';
                    self.expandedFolders.add(node.id);
                    self.saveExpandedFolders();
                    hoverTimer = null;
                  }, 600);
                }
              }
            });
            
            labelDiv.addEventListener('dragleave', () => {
              labelDiv.classList.remove('drag-over-folder');
              if (hoverTimer) {
                clearTimeout(hoverTimer);
                hoverTimer = null;
              }
            });
            
            labelDiv.addEventListener('drop', async (e) => {
              e.preventDefault();
              labelDiv.classList.remove('drag-over-folder');
              if (hoverTimer) {
                clearTimeout(hoverTimer);
                hoverTimer = null;
              }
              try {
                const dataText = e.dataTransfer.getData('text/plain');
                const dragIds = JSON.parse(dataText);
                if (Array.isArray(dragIds)) {
                  const targetFolderId = node.id;
                  for (const id of dragIds) {
                    if (id !== targetFolderId) {
                      await moveBookmark(id, targetFolderId);
                    }
                  }
                  self.refreshLibrary();
                }
              } catch (err) {
                console.error("Drop failed:", err);
              }
            });
            
            const displayTitle = node.title || (node.id === "1" ? "Bookmark Bar" : node.id === "2" ? "Other Bookmarks" : "Folder");
            
            let toggleHtml = '';
            if (hasSubfolders) {
              toggleHtml = `<span class="tree-toggle-arrow ${isExpanded ? 'expanded' : ''}">${isExpanded ? '▼' : '▶'}</span>`;
            } else {
              toggleHtml = `<span class="tree-toggle-arrow spacer"></span>`;
            }

            labelDiv.innerHTML = `
              ${toggleHtml}
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="currentColor" style="color:var(--color-secondary); margin-right:4px; flex-shrink: 0;"><path d="M19.5,5H13.243a3,3,0,0,1-2.122-.879l-1.414-1.414A3,3,0,0,0,7.586,1.828H4.5A2.5,2.5,0,0,0,2,4.328V19.5A2.5,2.5,0,0,0,4.5,22h15A2.5,2.5,0,0,0,22,19.5V7.5A2.5,2.5,0,0,0,19.5,5ZM20,19.5a.5.5,0,0,1-.5.5H4.5a.5.5,0,0,1-.5-.5V7.5A.5.5,0,0,1,4.5,7h15a.5.5,0,0,1,.5.5Z"/></svg>
              <span class="folder-name-text" title="${node.title}">${displayTitle}</span>
            `;
            
            folderLi.appendChild(labelDiv);

            if (hasSubfolders) {
              const childrenUl = document.createElement('ul');
              childrenUl.className = 'manager-tree-children';
              childrenUl.style.display = isExpanded ? 'flex' : 'none';
              
              subfolders.forEach(sub => {
                const subDOM = buildTreeDOM(sub, depth + 1);
                if (subDOM) childrenUl.appendChild(subDOM);
              });
              folderLi.appendChild(childrenUl);

              const arrow = labelDiv.querySelector('.tree-toggle-arrow');
              labelDiv.addEventListener('click', (e) => {
                e.stopPropagation();
                self.switchFolder(node.id);
                
                const currentlyExpanded = arrow.classList.contains('expanded');
                if (currentlyExpanded) {
                  arrow.classList.remove('expanded');
                  arrow.textContent = '▶';
                  childrenUl.style.display = 'none';
                  self.expandedFolders.delete(node.id);
                  self.saveExpandedFolders();
                } else {
                  arrow.classList.add('expanded');
                  arrow.textContent = '▼';
                  childrenUl.style.display = 'flex';
                  self.expandedFolders.add(node.id);
                  self.saveExpandedFolders();
                }
                
                labelDiv.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
              });
            } else {
              labelDiv.addEventListener('click', (e) => {
                e.stopPropagation();
                self.switchFolder(node.id);
                labelDiv.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
              });
            }
            return folderLi;
          }
          return null;
        }

        if (tree && tree[0] && tree[0].children) {
          tree[0].children.forEach(child => {
            const childDOM = buildTreeDOM(child, 0);
            if (childDOM) rootUl.appendChild(childDOM);
          });
        }

        this.folderTreeList.appendChild(rootUl);
        
        setTimeout(() => {
          const activeLbl = this.folderTreeList.querySelector('.folder-tree-label.active');
          if (activeLbl) {
            activeLbl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
          }
        }, 100);
        
        resolve();
      });
    });
  },

  switchFolder(folderId) {
    this.activeFolderId = folderId;
    
    // Reset active highlight in sidebar list
    const labels = this.folderTreeList.querySelectorAll('.folder-tree-label');
    labels.forEach(label => {
      if (label.dataset.folderId === folderId) {
        label.classList.add('active');
      } else {
        label.classList.remove('active');
      }
    });

    // Clear search input and load contents
    this.searchInput.value = '';
    this.clearSearchBtn.classList.add('hidden');
    this.loadFolderContents(folderId);
  },

  // Load folders & bookmarks in active view
  loadFolderContents(folderId) {
    return new Promise((resolve) => {
      this.bookmarksBody.innerHTML = '';
      
      if (folderId === 'all') {
        // Display all bookmarks globally
        this.renderExplorerList(this.allFlattenedBookmarks);
        this.updateBreadcrumbs([{ id: 'all', title: 'All Bookmarks' }]);
        resolve();
        return;
      }

      chrome.bookmarks.getSubTree(folderId, (nodes) => {
        if (chrome.runtime.lastError || !nodes || !nodes[0]) {
          console.error(chrome.runtime.lastError);
          resolve();
          return;
        }

        const activeNode = nodes[0];
        const children = activeNode.children || [];
        
        this.renderExplorerList(children);

        // Update Breadcrumbs
        this.buildBreadcrumbs(folderId);
        resolve();
      });
    });
  },

  renderExplorerList(items) {
    this.bookmarksBody.innerHTML = '';
    this.currentVisibleItems = items;
    this.selectedItemIds.clear();
    this.lastClickedId = null;
    this.dragStartRow = null;

    if (items.length === 0) {
      this.emptyState.classList.remove('hidden');
      return;
    }
    
    this.emptyState.classList.add('hidden');

    items.forEach(item => {
      const tr = document.createElement('tr');
      tr.dataset.itemId = item.id;
      tr.draggable = false; // Start as false to allow drag-selection on row click
      
      const cleanDomain = item.url ? BookmarkRules.getDomain(item.url) : '';
      
      let nameCellContent = '';
      let urlCellContent = '';

      if (item.url) {
        // It is a bookmark link - wrap favicon in drag handle
        const faviconUrl = `https://www.google.com/s2/favicons?sz=32&domain=${cleanDomain}`;
        nameCellContent = `
          <div class="table-cell-name">
            <span class="drag-handle"><img class="table-favicon" src="${faviconUrl}" onerror="this.src='../icons/icon16.png'"></span>
            <a href="${item.url}" target="_blank" class="table-link" title="${item.title}">${item.title || item.url}</a>
          </div>
        `;
        urlCellContent = `<a href="${item.url}" target="_blank" style="color:var(--text-muted); text-decoration:none;">${item.url}</a>`;
      } else {
        // It is a folder directory inside the table list (reverted from grid folder tile)
        nameCellContent = `
          <div class="table-cell-name" style="cursor: pointer;">
            <span class="drag-handle"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-folder" style="color:var(--color-secondary); fill:rgba(168,85,247,0.08); margin-right:4px;"><path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.93a2 2 0 0 1-1.66-.9l-.82-1.2A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"/></svg></span>
            <strong class="folder-name-text" style="color:white;">${item.title}</strong>
          </div>
        `;
        urlCellContent = `<span style="color:var(--color-secondary); font-style:italic;">Folder Directory (${item.children ? item.children.length : 0} items)</span>`;
      }

      tr.innerHTML = `
        <td>${nameCellContent}</td>
        <td style="overflow:hidden; text-overflow:ellipsis; white-space:nowrap; max-width:1px;" title="${item.url || ''}">${urlCellContent}</td>
        <td class="table-actions-cell">
          <button class="action-icon-btn edit-btn" title="Edit">✏️</button>
          <button class="action-icon-btn delete-btn" title="Delete">🗑️</button>
        </td>
      `;

      // Event listener: clicking a folder row icon opens the folder (if not selection click)
      if (!item.url) {
        tr.querySelector('.folder-name-text, strong').addEventListener('click', (e) => {
          if (e.ctrlKey || e.metaKey || e.shiftKey) return;
          this.switchFolder(item.id);
        });
      }

      // Drag Handle specific draggability mouse listeners
      const handle = tr.querySelector('.drag-handle');
      if (handle) {
        handle.addEventListener('mousedown', () => {
          tr.draggable = true;
        });
        handle.addEventListener('mouseup', () => {
          tr.draggable = false;
        });
        handle.addEventListener('mouseleave', () => {
          tr.draggable = false;
        });
      }

      // Selection click logic on mouse down
      tr.addEventListener('mousedown', (e) => {
        if (e.target.closest('a') || e.target.closest('button')) return;
        
        const itemId = item.id;
        
        // If clicking on drag handle, handle separately (protect selection, enable drag)
        if (e.target.closest('.drag-handle')) {
          tr.draggable = true;
          if (!this.selectedItemIds.has(itemId)) {
            this.selectedItemIds.clear();
            this.bookmarksBody.querySelectorAll('tr').forEach(r => r.classList.remove('selected-row'));
            this.selectedItemIds.add(itemId);
            tr.classList.add('selected-row');
            this.lastClickedId = itemId;
          }
          return;
        }

        // Regular row click: start drag selection marquee
        tr.draggable = false;
        isDragSelecting = true;
        this.dragStartRow = tr;
        e.preventDefault(); // Prevent text highlighting/default browser dragging
        
        if (e.ctrlKey || e.metaKey) {
          if (this.selectedItemIds.has(itemId)) {
            this.selectedItemIds.delete(itemId);
            tr.classList.remove('selected-row');
          } else {
            this.selectedItemIds.add(itemId);
            tr.classList.add('selected-row');
          }
        } else if (e.shiftKey && this.lastClickedId) {
          const allRows = Array.from(this.bookmarksBody.querySelectorAll('tr'));
          const currentIndex = allRows.indexOf(tr);
          const lastIndex = allRows.findIndex(r => r.dataset.itemId === this.lastClickedId);
          
          if (lastIndex !== -1) {
            const start = Math.min(currentIndex, lastIndex);
            const end = Math.max(currentIndex, lastIndex);
            
            this.selectedItemIds.clear();
            allRows.forEach(r => r.classList.remove('selected-row'));
            
            for (let i = start; i <= end; i++) {
              const rowId = allRows[i].dataset.itemId;
              this.selectedItemIds.add(rowId);
              allRows[i].classList.add('selected-row');
            }
          }
        } else {
          this.selectedItemIds.clear();
          this.bookmarksBody.querySelectorAll('tr').forEach(r => r.classList.remove('selected-row'));
          this.selectedItemIds.add(itemId);
          tr.classList.add('selected-row');
          this.lastClickedId = itemId;
        }
      });

      // Drag start listener (packs all selected bookmark IDs with Google Drive custom drag ghost bubble)
      tr.addEventListener('dragstart', (e) => {
        const dragIds = Array.from(this.selectedItemIds);
        e.dataTransfer.setData('text/plain', JSON.stringify(dragIds));
        e.dataTransfer.effectAllowed = 'move';
        
        // Custom drag feedback bubble
        const dragGhost = document.createElement('div');
        dragGhost.id = 'drag-ghost-bubble';
        dragGhost.style.position = 'absolute';
        dragGhost.style.top = '-1000px';
        dragGhost.style.left = '-1000px';
        dragGhost.style.background = '#6366f1';
        dragGhost.style.color = 'white';
        dragGhost.style.padding = '8px 16px';
        dragGhost.style.borderRadius = '24px';
        dragGhost.style.fontSize = '13px';
        dragGhost.style.fontWeight = '700';
        dragGhost.style.boxShadow = '0 10px 30px rgba(0,0,0,0.6)';
        dragGhost.style.border = '1px solid rgba(255,255,255,0.15)';
        dragGhost.style.pointerEvents = 'none';
        dragGhost.style.zIndex = '9999';
        
        const count = dragIds.length;
        dragGhost.innerHTML = `<span>📂</span> <strong>${count} item${count > 1 ? 's' : ''}</strong>`;
        document.body.appendChild(dragGhost);
        
        e.dataTransfer.setDragImage(dragGhost, 15, 15);
        
        setTimeout(() => {
          dragGhost.remove();
        }, 0);
      });

      // Reset draggable on drag end
      tr.addEventListener('dragend', () => {
        tr.draggable = false;
      });

      // Action Handlers
      tr.querySelector('.edit-btn').addEventListener('click', (e) => {
        e.stopPropagation();
        this.openEditModal(item);
      });
      tr.querySelector('.delete-btn').addEventListener('click', (e) => {
        e.stopPropagation();
        this.deleteItem(item);
      });

      this.bookmarksBody.appendChild(tr);
    });
  },

  async buildBreadcrumbs(folderId) {
    const crumbs = [];
    let currentId = folderId;

    while (currentId && currentId !== "0" && currentId !== "root") {
      const node = await this.getBookmarkNode(currentId);
      if (node) {
        crumbs.unshift(node);
        currentId = node.parentId;
      } else {
        break;
      }
    }
    
    // Prepend root Library folder (id "1") if not already present or if navigating subfolders
    if (folderId !== '1') {
      crumbs.unshift({ id: '1', title: 'Library' });
    }

    this.updateBreadcrumbs(crumbs);
  },

  getBookmarkNode(id) {
    return new Promise((resolve) => {
      chrome.bookmarks.get(id, (nodes) => {
        if (nodes && nodes[0]) {
          resolve(nodes[0]);
        } else {
          resolve(null);
        }
      });
    });
  },

  updateBreadcrumbs(crumbs) {
    this.breadcrumbsContainer.innerHTML = '';
    crumbs.forEach((crumb, idx) => {
      const isLast = idx === crumbs.length - 1;
      
      const span = document.createElement('span');
      span.className = `breadcrumb-item ${isLast ? 'active' : ''}`;
      span.dataset.folderId = crumb.id;
      
      const displayTitle = crumb.title || (crumb.id === "1" ? "Bookmark Bar" : crumb.id === "2" ? "Other Bookmarks" : "Folder");
      span.textContent = displayTitle;
      
      if (!isLast) {
        span.addEventListener('click', () => this.switchFolder(crumb.id));
      }
      this.breadcrumbsContainer.appendChild(span);

      if (!isLast) {
        const separator = document.createElement('span');
        separator.className = 'breadcrumb-separator';
        separator.textContent = ' / ';
        this.breadcrumbsContainer.appendChild(separator);
      }
    });
  },

  // ----------------------------------------
  // MODALS & WRITE/DELETE CRUD OPERATIONS
  // ----------------------------------------
  openAddModal() {
    this.modalTitle.textContent = "Add Bookmark";
    this.modalItemId.value = "";
    this.modalParentId.value = this.activeFolderId === 'all' ? '1' : this.activeFolderId; // default to Bookmark Bar if in global list
    this.modalType.value = "bookmark";
    this.modalInputTitle.value = "";
    this.modalInputUrl.value = "";
    this.modalUrlGroup.classList.remove('hidden');
    this.modal.classList.remove('hidden');
  },

  openEditModal(item) {
    this.modalTitle.textContent = item.url ? "Edit Bookmark" : "Edit Folder";
    this.modalItemId.value = item.id;
    this.modalParentId.value = item.parentId || '1';
    this.modalType.value = item.url ? "bookmark" : "folder";
    this.modalInputTitle.value = item.title;
    this.modalInputUrl.value = item.url || '';
    
    if (item.url) {
      this.modalUrlGroup.classList.remove('hidden');
    } else {
      this.modalUrlGroup.classList.add('hidden');
    }

    this.modal.classList.remove('hidden');
  },

  closeModal() {
    this.modal.classList.add('hidden');
  },

  saveModalItem() {
    const id = this.modalItemId.value;
    const parentId = this.modalParentId.value;
    const isBookmark = this.modalType.value === "bookmark";
    const title = this.modalInputTitle.value.trim();
    const url = this.modalInputUrl.value.trim();

    if (!title) {
      alert("Please enter a name.");
      return;
    }

    if (isBookmark && !url) {
      alert("Please enter a URL.");
      return;
    }

    if (id) {
      // Update Operation
      const updateData = { title };
      if (isBookmark) updateData.url = url;

      chrome.bookmarks.update(id, updateData, () => {
        this.closeModal();
        this.refreshLibrary();
      });
    } else {
      // Create Operation
      const createData = { parentId, title };
      if (isBookmark) createData.url = url;

      chrome.bookmarks.create(createData, () => {
        this.closeModal();
        this.refreshLibrary();
      });
    }
  },

  deleteItem(item) {
    const confirmDelete = confirm(`Are you sure you want to delete "${item.title || item.url}"?`);
    if (!confirmDelete) return;

    if (item.url) {
      chrome.bookmarks.remove(item.id, () => this.refreshLibrary());
    } else {
      // If folder, use removeTree to delete nested contents
      chrome.bookmarks.removeTree(item.id, () => this.refreshLibrary());
    }
  },

  // ----------------------------------------
  // COMMAND SEARCH PARSING & SUGGESTIONS
  // ----------------------------------------
  handleSearchInput(val) {
    val = val.trim();
    
    if (!val) {
      this.hideSuggestions();
      this.clearSearchBtn.classList.add('hidden');
      this.loadFolderContents(this.activeFolderId);
      return;
    }

    this.clearSearchBtn.classList.remove('hidden');

    if (val.startsWith('/')) {
      // Render Suggestions list
      this.renderSuggestions(val);
      // Run Command search
      this.executeCommandSearch(val, false);
    } else {
      this.hideSuggestions();
      // Normal string query matching globally
      const query = val.toLowerCase();
      const results = this.allFlattenedBookmarks.filter(bm => 
        (bm.title && bm.title.toLowerCase().includes(query)) || 
        (bm.url && bm.url.toLowerCase().includes(query))
      );
      
      // Auto-expand parents in sidebar
      if (results.length > 0) {
        const parentsToExpand = new Set();
        results.forEach(res => {
          let currentParentId = this.bookmarkParentMap.get(res.id);
          while (currentParentId && currentParentId !== "0") {
            parentsToExpand.add(currentParentId);
            currentParentId = this.bookmarkParentMap.get(currentParentId);
          }
        });
        
        parentsToExpand.forEach(pid => {
          this.expandFolderInDOM(pid);
        });
      }

      this.renderExplorerList(results);
      this.updateBreadcrumbs([{ id: 'search', title: `Search: "${val}"` }]);
    }
  },

  renderSuggestions(val) {
    this.suggestionsDropdown.innerHTML = '';
    const queryCmd = val.split(' ')[0].toLowerCase();
    
    const matchedCommands = COMMANDS.filter(c => c.cmd.startsWith(queryCmd));
    
    if (matchedCommands.length === 0) {
      this.hideSuggestions();
      return;
    }

    this.suggestionsDropdown.classList.remove('hidden');
    this.selectedSuggestionIndex = -1;

    matchedCommands.forEach((c, idx) => {
      const div = document.createElement('div');
      div.className = 'suggestion-item';
      div.dataset.index = idx;
      div.innerHTML = `
        <span class="suggestion-cmd">${c.cmd}</span>
        <span class="suggestion-desc">${c.desc}</span>
      `;
      div.addEventListener('click', () => {
        this.searchInput.value = c.cmd;
        this.searchInput.focus();
        this.handleSearchInput(c.cmd);
      });
      this.suggestionsDropdown.appendChild(div);
    });
  },

  hideSuggestions() {
    this.suggestionsDropdown.classList.add('hidden');
    this.suggestionsDropdown.innerHTML = '';
  },

  handleSearchKeydown(e) {
    const dropdown = this.suggestionsDropdown;
    if (dropdown.classList.contains('hidden')) return;

    const items = dropdown.querySelectorAll('.suggestion-item');
    if (items.length === 0) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      this.selectedSuggestionIndex = (this.selectedSuggestionIndex + 1) % items.length;
      this.highlightSuggestion(items);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      this.selectedSuggestionIndex = (this.selectedSuggestionIndex - 1 + items.length) % items.length;
      this.highlightSuggestion(items);
    } else if (e.key === 'Enter') {
      if (this.selectedSuggestionIndex >= 0 && this.selectedSuggestionIndex < items.length) {
        e.preventDefault();
        const selectedCmd = items[this.selectedSuggestionIndex].querySelector('.suggestion-cmd').textContent;
        this.searchInput.value = selectedCmd;
        this.hideSuggestions();
        this.handleSearchInput(selectedCmd);
      } else if (this.searchInput.value.trim().startsWith('/')) {
        e.preventDefault();
        this.executeCommandSearch(this.searchInput.value.trim(), true);
      }
    } else if (e.key === 'Tab') {
      e.preventDefault();
      let idx = this.selectedSuggestionIndex >= 0 ? this.selectedSuggestionIndex : 0;
      if (idx < items.length) {
        const selectedCmd = items[idx].querySelector('.suggestion-cmd').textContent;
        this.searchInput.value = selectedCmd;
        this.hideSuggestions();
        this.handleSearchInput(selectedCmd);
      }
    }
  },

  highlightSuggestion(items) {
    items.forEach(item => item.classList.remove('selected'));
    const activeItem = items[this.selectedSuggestionIndex];
    if (activeItem) {
      activeItem.classList.add('selected');
      // Scroll to view
      activeItem.scrollIntoView({ block: 'nearest' });
    }
  },

  executeCommandSearch(val, isEnter = false) {
    const parts = val.split(' ');
    const cmd = parts[0].toLowerCase();
    const query = parts.slice(1).join(' ').trim().toLowerCase();

    let results = [];
    let breadcrumbTitle = `Filter: ${cmd}`;

    switch (cmd) {
      case '/help':
      case '/?':
        if (!isEnter) return;
        this.showHelpOverlay();
        this.searchInput.value = '';
        this.clearSearchBtn.classList.add('hidden');
        break;

      case '/sound':
        if (!query && !isEnter) return;
        if (query && query !== '+' && query !== '-' && !isEnter) return;

        if (isEnter) {
          this.searchInput.value = '';
          this.hideSuggestions();
        }

        chrome.tabs.query({ audible: true }, (tabs) => {
          if (tabs.length === 0) {
            showToast('No audio playing in any tab', 'error');
            return;
          }
          
          tabs.forEach(tab => {
            const tabId = tab.id;
            let hostname = 'unknown';
            try { hostname = new URL(tab.url).hostname; } catch(e) {}
            const storageKey = `sound_level_host_${hostname}`;

            chrome.storage.local.get([storageKey], (res) => {
              let currentSoundLevel = res[storageKey] || 100;
              
              if (!query) {
                currentSoundLevel = 100; // Reset
              } else if (query === '+') {
                currentSoundLevel += 25;
              } else if (query === '-') {
                currentSoundLevel = Math.max(0, currentSoundLevel - 25);
              } else {
                const parsed = parseInt(query, 10);
                if (!isNaN(parsed) && parsed >= 0) {
                  currentSoundLevel = parsed;
                }
              }
              
              chrome.storage.local.set({ [storageKey]: currentSoundLevel });
              
              chrome.scripting.executeScript({
                target: { tabId: tabId },
                func: (lvl) => {
                  if (!window._sbContext) {
                    window._sbContext = new (window.AudioContext || window.webkitAudioContext)();
                    window._sbGainNode = window._sbContext.createGain();
                    window._sbGainNode.connect(window._sbContext.destination);
                    
                    const attachMedia = (media) => {
                      if (!media._sbConnected) {
                        try {
                          const source = window._sbContext.createMediaElementSource(media);
                          source.connect(window._sbGainNode);
                          media._sbConnected = true;
                        } catch(e) {}
                      }
                    };
                    
                    document.querySelectorAll('video, audio').forEach(attachMedia);
                    
                    new MutationObserver(mutations => {
                      mutations.forEach(mutation => {
                        mutation.addedNodes.forEach(node => {
                          if (node.tagName === 'VIDEO' || node.tagName === 'AUDIO') attachMedia(node);
                          else if (node.querySelectorAll) node.querySelectorAll('video, audio').forEach(attachMedia);
                        });
                      });
                    }).observe(document.body, { childList: true, subtree: true });
                  }
                  if (window._sbContext.state === 'suspended') {
                    window._sbContext.resume().catch(() => {});
                  }
                  window._sbGainNode.gain.value = lvl / 100;
                },
                args: [currentSoundLevel]
              }).catch(() => {});
            });
          });
          
          showToast(`Sound level adjusted`, 'success');
        });
        
        breadcrumbTitle = `Sound level command`;
        this.searchInput.value = '';
        this.clearSearchBtn.classList.add('hidden');
        break;
      
      case '/t':
      case '/title':
        if (!query) return;
        results = this.allFlattenedBookmarks.filter(bm => bm.title && bm.title.toLowerCase().includes(query));
        breadcrumbTitle = `Title matches: "${query}"`;
        break;

      case '/u':
      case '/url':
        if (!query) return;
        results = this.allFlattenedBookmarks.filter(bm => bm.url && bm.url.toLowerCase().includes(query));
        breadcrumbTitle = `URL matches: "${query}"`;
        break;

      case '/c':
      case '/cat':
        if (!query) return;
        // Run classification filter locally in memory
        const activeCategories = BookmarkRules.categories;
        results = this.allFlattenedBookmarks.filter(bm => {
          const catId = BookmarkRules.classify(bm.title, bm.url, activeCategories);
          if (catId) {
            const subId = BookmarkRules.classifySubcategory(catId, bm.title, bm.url);
            return catId.toLowerCase() === query || subId.toLowerCase() === query;
          }
          return false;
        });
        breadcrumbTitle = `Category: "${query}"`;
        break;

      case '/d':
      case '/domain':
        if (!query) return;
        results = this.allFlattenedBookmarks.filter(bm => {
          const domain = BookmarkRules.getDomain(bm.url);
          return domain && domain.includes(query);
        });
        breadcrumbTitle = `Domain matches: "${query}"`;
        break;

      case '/sort':
        if (!query) return;
        results = [...this.currentVisibleItems];
        if (query === 'name') {
          results.sort((a, b) => (a.title || "").localeCompare(b.title || ""));
        } else if (query === 'date') {
          results.sort((a, b) => (b.dateAdded || 0) - (a.dateAdded || 0)); // Descending date
        } else if (query === 'url') {
          results.sort((a, b) => (a.url || "").localeCompare(b.url || ""));
        }
        breadcrumbTitle = `Sorted by ${query}`;
        break;

      case '/wizard':
      case '/organize':
        this.showWizard();
        this.searchInput.value = '';
        this.hideSuggestions();
        return;

      case '/undo':
      case '/restore':
        this.searchInput.value = '';
        this.hideSuggestions();
        restoreOriginalBookmarks();
        return;
    }

    if (cmd !== '/help' && cmd !== '/?' && cmd !== '/wizard' && cmd !== '/organize' && cmd !== '/undo' && cmd !== '/restore') {
      this.renderExplorerList(results);
      this.updateBreadcrumbs([{ id: 'command', title: breadcrumbTitle }]);
    }
  },

  showHelpOverlay() {
    alert(`💡 Smart Bookmark Manager Command Help:\n\n` +
          `• /help or /?  : Show this help dialog.\n` +
          `• /t <query>    : Filter bookmarks by Title only.\n` +
          `• /u <query>    : Filter bookmarks by URL string only.\n` +
          `• /c <category> : Filter by category (e.g. movies, study, software, adult, sports).\n` +
          `• /d <domain>   : Filter by domain name (e.g. github.com).\n` +
          `• /sort <type>  : Sort current visible items by "name", "date", or "url".\n` +
          `• /wizard       : Open the Smart Sorter Onboarding Wizard.\n` +
          `• /undo         : Restore your original bookmarks positions.\n\n` +
          `Simply type the command followed by a space and your search terms.`);
    this.searchInput.value = '';
    this.hideSuggestions();
    this.loadFolderContents(this.activeFolderId);
  },

  sortVisibleItems(column) {
    if (this.sortState.column === column) {
      this.sortState.ascending = !this.sortState.ascending;
    } else {
      this.sortState.column = column;
      this.sortState.ascending = true;
    }
    
    const asc = this.sortState.ascending;
    this.currentVisibleItems.sort((a, b) => {
      let valA = '';
      let valB = '';
      if (column === 'name') {
        valA = (a.title || "").toLowerCase();
        valB = (b.title || "").toLowerCase();
      } else if (column === 'url') {
        valA = (a.url || "").toLowerCase();
        valB = (b.url || "").toLowerCase();
      }
      
      // Folders always sorted first
      if (!a.url && b.url) return -1;
      if (a.url && !b.url) return 1;
      
      return asc ? valA.localeCompare(valB) : valB.localeCompare(valA);
    });
    
    // Update visual sort indicators in table headers
    const nameIcon = document.getElementById('sort-icon-name');
    const urlIcon = document.getElementById('sort-icon-url');
    if (nameIcon) nameIcon.textContent = this.sortState.column === 'name' ? (asc ? ' ▲' : ' ▼') : '';
    if (urlIcon) urlIcon.textContent = this.sortState.column === 'url' ? (asc ? ' ▲' : ' ▼') : '';
    
    this.renderExplorerList(this.currentVisibleItems);
  },

  setupSidebarResizer() {
    if (!this.sidebarResizer || !this.managerSidebar) return;
    
    // Load persisted width
    chrome.storage.local.get(['sidebarWidth'], (res) => {
      if (res.sidebarWidth) {
        this.managerSidebar.style.width = res.sidebarWidth + 'px';
      }
    });

    let isResizing = false;
    let startX = 0;
    let startWidth = 0;

    const onMouseMove = (e) => {
      if (!isResizing) return;
      const dx = e.clientX - startX;
      let newWidth = startWidth + dx;
      
      // Constraints
      if (newWidth < 220) newWidth = 220;
      if (newWidth > 600) newWidth = 600;
      
      this.managerSidebar.style.width = newWidth + 'px';
    };

    const onMouseUp = () => {
      if (isResizing) {
        isResizing = false;
        this.sidebarResizer.classList.remove('is-resizing');
        document.body.style.cursor = '';
        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup', onMouseUp);
        
        // Persist
        chrome.storage.local.set({ sidebarWidth: parseInt(this.managerSidebar.style.width, 10) });
      }
    };

    this.sidebarResizer.addEventListener('mousedown', (e) => {
      e.preventDefault();
      isResizing = true;
      startX = e.clientX;
      startWidth = this.managerSidebar.getBoundingClientRect().width;
      
      this.sidebarResizer.classList.add('is-resizing');
      document.body.style.cursor = 'col-resize';
      
      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup', onMouseUp);
    });
  },

  saveExpandedFolders() {
    chrome.storage.local.set({ expandedFolders: Array.from(this.expandedFolders) });
  },

  expandFolderInDOM(folderId) {
    if (this.expandedFolders.has(folderId)) return;
    this.expandedFolders.add(folderId);
    this.saveExpandedFolders();
    
    if (this.folderTreeList) {
      const labelDiv = this.folderTreeList.querySelector(`.folder-tree-label[data-folder-id="${folderId}"]`);
      if (labelDiv) {
        const arrow = labelDiv.querySelector('.tree-toggle-arrow');
        if (arrow && !arrow.classList.contains('spacer')) {
          arrow.classList.add('expanded');
          arrow.textContent = '▼';
        }
        const childrenUl = labelDiv.nextElementSibling;
        if (childrenUl && childrenUl.classList.contains('manager-tree-children')) {
          childrenUl.style.display = 'flex';
        }
      }
    }
  },

  setupColumnResizing() {
    const resizer = document.querySelector('.col-resizer');
    const thName = document.getElementById('th-name');
    const table = document.getElementById('bookmarks-table');
    
    if (!resizer || !thName || !table) return;
    
    let startX = 0;
    let startWidth = 0;
    
    resizer.addEventListener('mousedown', (e) => {
      e.stopPropagation();
      e.preventDefault();
      
      startX = e.clientX;
      startWidth = thName.getBoundingClientRect().width;
      
      resizer.classList.add('resizing');
      table.style.tableLayout = 'fixed';
      
      const onMouseMove = (moveEvent) => {
        const dx = moveEvent.clientX - startX;
        const newWidth = Math.max(150, startWidth + dx);
        thName.style.width = `${newWidth}px`;
      };
      
      const onMouseUp = () => {
        resizer.classList.remove('resizing');
        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup', onMouseUp);
      };
      
      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup', onMouseUp);
    });
  },

  // ----------------------------------------
  // 📚 DOMAIN CATEGORY DATABASE CONTROLLER
  // ----------------------------------------
  dbState: {
    currentCategory: '',
    domains: []
  },

  openDbModal() {
    this.dbCategoryOptions.innerHTML = '';
    
    BookmarkRules.categories.forEach((cat, idx) => {
      const opt = document.createElement('div');
      opt.className = `custom-select-option ${this.dbState.currentCategory === cat.id ? 'selected' : ''}`;
      opt.dataset.value = cat.id;
      opt.textContent = cat.name;
      opt.addEventListener('click', (e) => {
        e.stopPropagation();
        this.dbCategorySelectedText.textContent = cat.name;
        this.dbCategoryOptions.classList.add('hidden');
        this.dbState.currentCategory = cat.id;
        this.loadDbCategoryDomains();
      });
      this.dbCategoryOptions.appendChild(opt);
      
      if (idx === 0 && !this.dbState.currentCategory) {
        this.dbState.currentCategory = cat.id;
        this.dbCategorySelectedText.textContent = cat.name;
      }
    });

    const currentCat = BookmarkRules.categories.find(c => c.id === this.dbState.currentCategory);
    if (currentCat) {
      this.dbCategorySelectedText.textContent = currentCat.name;
    }

    this.dbModal.classList.remove('hidden');
    this.loadDbCategoryDomains();
  },

  closeDbModal() {
    this.dbModal.classList.add('hidden');
  },

  loadDbCategoryDomains() {
    const catId = this.dbState.currentCategory;
    const cat = BookmarkRules.categories.find(c => c.id === catId);
    if (cat) {
      this.dbState.domains = [...cat.domains];
      this.renderDbDomainChips();
      
      const options = this.dbCategoryOptions.querySelectorAll('.custom-select-option');
      options.forEach(opt => {
        if (opt.dataset.value === catId) {
          opt.classList.add('selected');
        } else {
          opt.classList.remove('selected');
        }
      });
    }
  },

  renderDbDomainChips() {
    this.dbDomainsList.innerHTML = '';
    if (this.dbState.domains.length === 0) {
      this.dbDomainsList.innerHTML = '<span style="color:var(--text-muted); font-size:12px; grid-column: 1 / -1; text-align: center; padding: 20px 0;">No domains registered.</span>';
      return;
    }
    
    this.dbState.domains.forEach(d => {
      const chip = document.createElement('div');
      chip.className = 'domain-chip';
      chip.innerHTML = `
        <span style="overflow:hidden; text-overflow:ellipsis; white-space:nowrap; flex-grow:1;" title="${d}">${d}</span>
        <span class="domain-chip-remove" data-domain="${d}">✕</span>
      `;
      chip.querySelector('.domain-chip-remove').addEventListener('click', (e) => {
        const dom = e.target.dataset.domain;
        this.dbState.domains = this.dbState.domains.filter(x => x !== dom);
        this.renderDbDomainChips();
      });
      this.dbDomainsList.appendChild(chip);
    });
  },

  addDbDomainChips() {
    const val = this.dbNewDomainInput.value.trim().toLowerCase();
    if (!val) return;
    
    if (!val.includes('.') || val.length < 4) {
      alert("Please enter a valid domain format (e.g. site.com).");
      return;
    }
    
    if (this.dbState.domains.includes(val)) {
      alert("Domain already exists in this category.");
      return;
    }
    
    this.dbState.domains.push(val);
    this.dbNewDomainInput.value = '';
    this.renderDbDomainChips();
  },

  async saveDbChanges() {
    const catId = this.dbState.currentCategory;
    const cat = BookmarkRules.categories.find(c => c.id === catId);
    if (!cat) return;
    
    cat.domains = [...this.dbState.domains];
    cat.enabled = true; // Auto-enable on database customization!
    saveCategoriesConfig(); // Persist enabled state to storage
    
    chrome.storage.local.get(['learned_domains'], (result) => {
      const learned = result.learned_domains || {};
      learned[catId] = [...this.dbState.domains];
      
      chrome.storage.local.set({ 'learned_domains': learned }, () => {
        alert(`Saved successfully!\n\nCategory "${cat.name}" database updated. Any restructuring or future scans will now use these domain mappings.`);
        this.closeDbModal();
      });
    });
  },

  openBackupsModal() {
    if (this.backupsModal) {
      this.backupsModal.classList.remove('hidden');
      this.renderBackupsList();
    }
  },

  closeBackupsModal() {
    if (this.backupsModal) {
      this.backupsModal.classList.add('hidden');
    }
  },

  renderBackupsList() {
    if (!this.backupsListContainer) return;
    this.backupsListContainer.innerHTML = '';
    
    chrome.storage.local.get(['bookmarks_backups', 'bookmarks_backup'], (result) => {
      const backups = result.bookmarks_backups || [];
      const originalBackup = result.bookmarks_backup;
      
      if (backups.length === 0 && !originalBackup) {
        this.backupsListContainer.innerHTML = `
          <div style="text-align: center; padding: 40px 20px; color: var(--text-muted);">
            <span style="font-size: 28px; display: block; margin-bottom: 10px;">↩️</span>
            No restore points found. Restore points are created automatically when you sort or restructure bookmarks.
          </div>
        `;
        return;
      }
      
      backups.forEach((b) => {
        const card = document.createElement('div');
        card.className = 'backup-point-card';
        
        const dateStr = new Date(b.timestamp).toLocaleString();
        
        card.innerHTML = `
          <div class="backup-point-info">
            <span class="backup-point-title">${b.parentFolderName || 'Restructure Library'}</span>
            <span class="backup-point-meta">Created: ${dateStr}</span>
            <div class="backup-point-stats">
              <span style="color: #a7f3d0;">Moved: ${b.moves ? b.moves.length : 0}</span>
              <span style="color: #c084fc;">Folders: ${b.createdFolders ? b.createdFolders.length : 0}</span>
            </div>
          </div>
          <button class="btn btn-danger btn-small restore-point-btn" id="restore-btn-${b.id}" style="padding: 6px 12px; font-size: 12.5px;">
            Restore
          </button>
        `;
        
        card.querySelector('.restore-point-btn').addEventListener('click', () => {
          this.restoreSpecificBackup(b);
        });
        
        this.backupsListContainer.appendChild(card);
      });

      // Render Original onboarding backup at the end of the list
      if (originalBackup) {
        const card = document.createElement('div');
        card.className = 'backup-point-card';
        card.style.cssText = 'border: 1px dashed rgba(239, 68, 68, 0.4); background: rgba(239, 68, 68, 0.03); margin-top: 15px;';
        
        const dateStr = originalBackup.timestamp ? new Date(originalBackup.timestamp).toLocaleString() : 'Before First Sorter Run';
        
        card.innerHTML = `
          <div class="backup-point-info">
            <span class="backup-point-title" style="color: #f87171; font-weight: 700;">Original Onboarding Backup</span>
            <span class="backup-point-meta">Created: ${dateStr}</span>
            <div class="backup-point-stats">
              <span style="color: #f87171;">Resets bookmarks structure completely</span>
            </div>
          </div>
          <button class="btn btn-danger btn-small restore-point-btn" id="restore-original-btn" style="padding: 6px 12px; font-size: 12.5px;">
            Undo Initial Sort
          </button>
        `;
        
        card.querySelector('#restore-original-btn').addEventListener('click', () => {
          restoreOriginalBookmarks();
        });
        
        this.backupsListContainer.appendChild(card);
      }
    });
  },

  async restoreSpecificBackup(backup) {
    const confirmRestore = confirm(`Are you sure you want to revert the organization "${backup.parentFolderName}" created on ${new Date(backup.timestamp).toLocaleString()}? This will move all sorted bookmarks back to their exact original slots.`);
    if (!confirmRestore) return;
    
    const restorePointBtn = document.getElementById(`restore-btn-${backup.id}`);
    let originalText = '';
    if (restorePointBtn) {
      originalText = restorePointBtn.textContent;
      restorePointBtn.disabled = true;
      restorePointBtn.textContent = 'Restoring...';
    }
    
    try {
      // 1. Move bookmarks back to original index
      const sortedMoves = [...backup.moves].sort((a, b) => a.originalIndex - b.originalIndex);
      for (const moveLog of sortedMoves) {
        await new Promise((resolve) => {
          chrome.bookmarks.move(moveLog.id, {
            parentId: moveLog.originalParentId,
            index: moveLog.originalIndex
          }, () => {
            if (chrome.runtime.lastError) {
              console.warn(`Could not restore bookmark ${moveLog.id}:`, chrome.runtime.lastError.message);
            }
            resolve();
          });
        });
      }
      
      // 2. Delete created folders (reverse order)
      const foldersToDelete = [...backup.createdFolders].reverse();
      for (const folderId of foldersToDelete) {
        await new Promise((resolve) => {
          chrome.bookmarks.removeTree(folderId, () => {
            if (chrome.runtime.lastError) {
              console.warn(`Could not delete folder ${folderId}:`, chrome.runtime.lastError.message);
            }
            resolve();
          });
        });
      }
      
      // 3. Remove from bookmarks_backups list in storage
      chrome.storage.local.get('bookmarks_backups', async (result) => {
        const backups = result.bookmarks_backups || [];
        const filtered = backups.filter(b => b.id !== backup.id);
        await chrome.storage.local.set({ 'bookmarks_backups': filtered });
        
        this.renderBackupsList();
        this.refreshLibrary();
        checkExistingBackup(); // update step 4 status
        alert('Restore complete! Your bookmarks have been successfully reverted.');
      });
      
    } catch (err) {
      console.error(err);
      alert('Error during restoration: ' + err.message);
    }
  },

  async handleDropOnFolder(targetFolderId, e) {
    try {
      const dataText = e.dataTransfer.getData('text/plain');
      const dragIds = JSON.parse(dataText);
      if (Array.isArray(dragIds)) {
        for (const id of dragIds) {
          if (id !== targetFolderId) {
            await moveBookmark(id, targetFolderId);
          }
        }
        this.refreshLibrary();
      }
    } catch (err) {
      console.error("Drop on folder tile failed:", err);
    }
  },

  switchView(viewName) {
    this.activeView = viewName;
    
    // Toggle notes-active class on explorer-list-container
    const explorerList = document.querySelector('.explorer-list-container');
    if (explorerList) {
      if (viewName === 'notes') {
        explorerList.classList.add('notes-active');
      } else {
        explorerList.classList.remove('notes-active');
        this.cacheActiveNoteState();
        this.exitFocusMode();
        this.closeDiffOverlay();
      }
    }

    // ─── View Disposal: clean up page-specific state when leaving ───
    const previousView = this._previousView || 'bookmarks';
    this._previousView = viewName;

    // Clean up when LEAVING history
    if (previousView === 'history' && viewName !== 'history') {
      this.clearHistorySelection();
      document.querySelectorAll('.cookie-detail-row.expanded').forEach(r => r.classList.remove('expanded'));
    }

    // Clean up when LEAVING cookies
    if (previousView === 'cookies' && viewName !== 'cookies') {
      // Hide the empty state that cookies may have shown
      if (this.emptyState) this.emptyState.classList.add('hidden');
      // Clear any cookie-specific inline styles on the bookmarks table body
      if (this.bookmarksBody) {
        this.bookmarksBody.innerHTML = '';
        this.bookmarksBody.style.removeProperty('max-height');
        this.bookmarksBody.style.removeProperty('overflow');
      }
    }

    // Always hide empty state when navigating — each view manages its own
    if (this.emptyState) this.emptyState.classList.add('hidden');
    
    // Toggle history-view-active class on app-container
    const appContainer = document.querySelector('.app-container');
    if (appContainer) {
      if (viewName === 'history') {
        appContainer.classList.add('history-view-active');
      } else {
        appContainer.classList.remove('history-view-active');
      }
    }

    // Search section stays in main header, history now has its own local search input
    
    // Toggle active classes on sidebar tabs
    document.querySelectorAll('.sidebar-tab').forEach(el => el.classList.remove('active'));
    if (viewName === 'bookmarks' && this.tabBookmarks) this.tabBookmarks.classList.add('active');
    if (viewName === 'history' && this.tabHistory) this.tabHistory.classList.add('active');
    if (viewName === 'cookies' && this.tabCookies) this.tabCookies.classList.add('active');
    if (viewName === 'notes' && this.tabNotes) this.tabNotes.classList.add('active');
    if (viewName === 'settings' && this.tabSettings) this.tabSettings.classList.add('active');
    
    // Update Search Bar Placeholder
    if (this.searchInput) {
      if (viewName === 'bookmarks') {
        this.searchInput.placeholder = "Search bookmarks or type / for commands...";
        this.searchInput.disabled = false;
      } else if (viewName === 'history') {
        this.searchInput.placeholder = "Search browsing history...";
        this.searchInput.disabled = false;
      } else if (viewName === 'cookies') {
        this.searchInput.placeholder = "Search website cookies...";
        this.searchInput.disabled = false;
      } else if (viewName === 'notes') {
        this.searchInput.placeholder = "Search note titles or content...";
        this.searchInput.disabled = false;
      } else if (viewName === 'settings') {
        this.searchInput.placeholder = "Settings Panel - search disabled";
        this.searchInput.disabled = true;
      }
      this.searchInput.value = '';
    }
    
    // Toggle sidebar navigation trees
    const bookmarksNav = document.getElementById('bookmarks-navigation-box');
    const cookiesNav = document.getElementById('cookies-navigation-box');
    
    if (bookmarksNav) {
      bookmarksNav.style.display = (viewName === 'bookmarks') ? 'block' : 'none';
    }
    if (cookiesNav) {
      cookiesNav.classList.toggle('hidden', viewName !== 'cookies');
    }

    // Toggle visibility of bookmarks table vs settings view vs notes view vs history view
    const tableEl = document.getElementById('bookmarks-table');
    const settingsEl = document.getElementById('settings-view-container');
    const notesEl = document.getElementById('notes-view-container');
    const cookiesEl = document.getElementById('cookies-view-container');
    const managerViewEl = document.getElementById('manager-view');
    
    if (viewName === 'settings') {
      if (managerViewEl) managerViewEl.classList.remove('hidden');
      if (tableEl) tableEl.classList.add('hidden');
      if (settingsEl) settingsEl.classList.remove('hidden');
      if (notesEl) notesEl.classList.add('hidden');
      if (cookiesEl) cookiesEl.classList.add('hidden');
      if (this.historyViewContainer) this.historyViewContainer.classList.add('hidden');
    } else if (viewName === 'notes') {
      if (managerViewEl) managerViewEl.classList.remove('hidden');
      if (tableEl) tableEl.classList.add('hidden');
      if (settingsEl) settingsEl.classList.add('hidden');
      if (notesEl) notesEl.classList.remove('hidden');
      if (cookiesEl) cookiesEl.classList.add('hidden');
      if (this.historyViewContainer) this.historyViewContainer.classList.add('hidden');
    } else if (viewName === 'history') {
      if (managerViewEl) managerViewEl.classList.remove('hidden');
      if (tableEl) tableEl.classList.add('hidden');
      if (settingsEl) settingsEl.classList.add('hidden');
      if (notesEl) notesEl.classList.add('hidden');
      if (cookiesEl) cookiesEl.classList.add('hidden');
      if (this.historyViewContainer) this.historyViewContainer.classList.remove('hidden');
      
      // Force Timeline View as the default layout
      this.historyViewMode = 'timeline';
      
      // Sync View mode dropdown trigger UI to timeline view
      const viewTrigger = document.getElementById('view-mode-dropdown-trigger');
      const viewMenu = document.getElementById('view-mode-dropdown-menu');
      if (viewTrigger && viewMenu) {
        const activeOption = viewMenu.querySelector('.dropdown-item[data-mode="timeline"]');
        if (activeOption) {
          viewTrigger.querySelector('.trigger-text').textContent = activeOption.textContent.trim();
          viewMenu.querySelectorAll('.dropdown-item').forEach(i => i.classList.remove('active'));
          activeOption.classList.add('active');
          const triggerIcon = viewTrigger.querySelector('.trigger-icon');
          const itemIcon = activeOption.querySelector('i');
          if (triggerIcon && itemIcon) triggerIcon.className = itemIcon.className;
        }
      }
      this.clearHistorySelection();
    } else if (viewName === 'cookies') {
      // Hide the entire manager-view (sidebar + explorer) so cookies can fill the viewport
      if (managerViewEl) managerViewEl.classList.add('hidden');
      if (settingsEl) settingsEl.classList.add('hidden');
      if (notesEl) notesEl.classList.add('hidden');
      if (this.historyViewContainer) this.historyViewContainer.classList.add('hidden');
      if (cookiesEl) cookiesEl.classList.remove('hidden');
    } else {
      if (managerViewEl) managerViewEl.classList.remove('hidden');
      if (tableEl) tableEl.classList.remove('hidden');
      if (settingsEl) settingsEl.classList.add('hidden');
      if (notesEl) notesEl.classList.add('hidden');
      if (cookiesEl) cookiesEl.classList.add('hidden');
      if (this.historyViewContainer) this.historyViewContainer.classList.add('hidden');
    }

    // ─── Smart Page-Aware Sidebar Behavior ───
    // History: auto-collapse. All other pages: auto-expand.
    // Manual toggles on History are respected until user leaves.
    const managerSidebar = document.querySelector('.manager-sidebar');
    const sidebarToggle = document.getElementById('sidebar-collapse-toggle');
    if (managerSidebar && sidebarToggle) {
      if (viewName === 'history') {
        if (!this._sidebarManuallyExpandedOnHistory) {
          if (!managerSidebar.classList.contains('collapsed')) {
            this._sidebarWasExpandedBeforeHistory = true;
            managerSidebar.classList.add('collapsed');
            sidebarToggle.setAttribute('title', 'Expand Sidebar');
          }
        }
      } else {
        // Leaving history (or entering a non-history page): auto-expand
        this._sidebarManuallyExpandedOnHistory = false;
        if (this._sidebarWasExpandedBeforeHistory) {
          if (managerSidebar.classList.contains('collapsed')) {
            managerSidebar.classList.remove('collapsed');
            sidebarToggle.setAttribute('title', 'Collapse Sidebar');
          }
        }
        this._sidebarWasExpandedBeforeHistory = false;
      }
    }

    // ─── Hide global search bar on Settings and History pages ───
    const topMainHeader = document.querySelector('.main-header');
    if (topMainHeader) {
      topMainHeader.style.display = (viewName === 'settings' || viewName === 'history') ? 'none' : '';
    }

    // Recalculate history virtual scroll after sidebar animation completes
    if (viewName === 'history') {
      setTimeout(() => {
        if (this.calculateRowOffsets) this.calculateRowOffsets();
        if (this.renderVirtualHistory) this.renderVirtualHistory();
      }, 260);
    }
    
    // Refresh content
    this.refreshViewContent();
    this.renderFloatingMenu();
  },

  async refreshViewContent() {
    const explorerToolbar = document.querySelector('.explorer-toolbar');
    const explorerList = document.querySelector('.explorer-list-container');
    const historyToolbar = document.getElementById('history-toolbar');
    
    if (historyToolbar) {
      if (this.activeView === 'history') {
        historyToolbar.classList.remove('hidden');
      } else {
        historyToolbar.classList.add('hidden');
      }
    }

    if (this.activeView === 'bookmarks') {
      // Restore bookmarks view: show the breadcrumbs, add button, and load bookmarks
      if (explorerToolbar) explorerToolbar.classList.remove('hidden');
      if (explorerList) explorerList.classList.remove('hidden');
      document.getElementById('explorer-breadcrumbs').style.display = 'flex';
      document.getElementById('add-bookmark-btn').style.display = 'inline-flex';
      
      // Update Table Headers
      document.getElementById('th-name').innerHTML = `Name <span id="sort-icon-name"></span><div class="col-resizer"></div>`;
      document.getElementById('th-url').innerHTML = `URL <span id="sort-icon-url"></span>`;
      this.setupColumnResizing(); // rebind resizer
      
      await this.loadFolderContents(this.activeFolderId);
    } else if (this.activeView === 'history') {
      // History view: hide toolbar and list container
      if (explorerToolbar) explorerToolbar.classList.add('hidden');
      if (explorerList) explorerList.classList.add('hidden');
      document.getElementById('explorer-breadcrumbs').style.display = 'none';
      document.getElementById('add-bookmark-btn').style.display = 'none';
      this.emptyState.classList.add('hidden');
      
      // Update Table Headers
      document.getElementById('th-name').innerHTML = `Page Title`;
      document.getElementById('th-url').innerHTML = `URL / Last Visited`;
      
      this.loadHistory();
    } else if (this.activeView === 'cookies') {
      // Cookies view: hide breadcrumbs, hide add button
      if (explorerToolbar) explorerToolbar.classList.add('hidden');
      if (explorerList) explorerList.classList.remove('hidden');
      document.getElementById('explorer-breadcrumbs').style.display = 'none';
      document.getElementById('add-bookmark-btn').style.display = 'none';
      
      // Update Table Headers
      document.getElementById('th-name').innerHTML = `Domain / Site`;
      document.getElementById('th-url').innerHTML = `Cookie Details`;
      
      // this.loadCookies();
    } else if (this.activeView === 'notes') {
      // Notes view: hide breadcrumbs, hide add button
      if (explorerToolbar) explorerToolbar.classList.add('hidden');
      if (explorerList) explorerList.classList.remove('hidden');
      document.getElementById('explorer-breadcrumbs').style.display = 'none';
      document.getElementById('add-bookmark-btn').style.display = 'none';
      this.emptyState.classList.add('hidden');
      
      this.loadNotesManager();
    } else if (this.activeView === 'settings') {
      // Settings view: hide breadcrumbs, hide add button
      if (explorerToolbar) explorerToolbar.classList.add('hidden');
      if (explorerList) explorerList.classList.remove('hidden');
      document.getElementById('explorer-breadcrumbs').style.display = 'none';
      document.getElementById('add-bookmark-btn').style.display = 'none';
      this.emptyState.classList.add('hidden');
      
      this.loadSettingsView();
    }
  },

  loadSettingsView() {
    const parentNameInput = document.getElementById('parent-folder-name');
    const thresholdSlider = document.getElementById('threshold-slider');
    
    if (this.settingsParentName && parentNameInput) {
      this.settingsParentName.value = parentNameInput.value;
    }
    
    if (this.settingsThresholdSlider && thresholdSlider) {
      this.settingsThresholdSlider.value = thresholdSlider.value;
      if (this.settingsThresholdVal) {
        this.settingsThresholdVal.textContent = thresholdSlider.value;
      }
    }
    
    if (this.settingsCategoriesList) {
      this.settingsCategoriesList.innerHTML = '';
      BookmarkRules.categories.forEach(cat => {
        const label = document.createElement('label');
        label.innerHTML = `
          <input type="checkbox" class="settings-cat-cb" data-cat-id="${cat.id}" ${cat.enabled !== false ? 'checked' : ''}>
          <span>${cat.name}</span>
        `;
        this.settingsCategoriesList.appendChild(label);
      });
    }

    // Load Command Center settings
    chrome.storage.local.get(['organizer_user_settings'], (result) => {
      const settings = result.organizer_user_settings || {};
      
      // Theme Preset
      if (this.settingsCcTheme) {
        this.settingsCcTheme.value = settings.themePreset || 'dark';
      }

      // Accent dots preset
      const accent = settings.accentPreset || 'indigo';
      document.querySelectorAll('.accent-dot').forEach(dot => {
        if (dot.dataset.color === accent) {
          dot.classList.add('active');
        } else {
          dot.classList.remove('active');
        }
      });

      // Custom Border Radius
      const radiusInput = document.getElementById('settings-custom-radius');
      if (radiusInput) {
        radiusInput.value = settings.customRadius !== undefined ? settings.customRadius : 14;
        const radiusVal = document.getElementById('radius-val');
        if (radiusVal) radiusVal.textContent = radiusInput.value + 'px';
      }

      // Glass Transparency / Opacity
      const opacityInput = document.getElementById('settings-glass-opacity');
      if (opacityInput) {
        opacityInput.value = settings.glassOpacity !== undefined ? settings.glassOpacity : 70;
        const opacityVal = document.getElementById('glass-opacity-val');
        if (opacityVal) opacityVal.textContent = (opacityInput.value / 100).toFixed(2);
      }

      // Backdrop Blur
      if (this.settingsCcBlur) {
        this.settingsCcBlur.value = settings.ccBlur !== undefined ? settings.ccBlur : 15;
        if (this.settingsCcBlurVal) {
          this.settingsCcBlurVal.textContent = this.settingsCcBlur.value + 'px';
        }
      }

      // Animation Transition Speed
      const speedInput = document.getElementById('settings-animation-speed');
      if (speedInput) {
        speedInput.value = settings.animationSpeed !== undefined ? settings.animationSpeed : 30;
        const speedVal = document.getElementById('animation-speed-val');
        if (speedVal) speedVal.textContent = (speedInput.value / 100).toFixed(1) + 's';
      }

      // Compact Mode Layout
      const compactInput = document.getElementById('settings-compact-mode');
      if (compactInput) {
        compactInput.checked = settings.compactMode === true;
      }

      // Parent target folder name
      const parentInput = document.getElementById('settings-parent-name');
      if (parentInput && settings.parentFolderName) {
        parentInput.value = settings.parentFolderName;
      }

      // Sorter Cluster Threshold
      if (this.settingsThresholdSlider) {
        this.settingsThresholdSlider.value = settings.threshold !== undefined ? settings.threshold : 5;
        if (this.settingsThresholdVal) {
          this.settingsThresholdVal.textContent = this.settingsThresholdSlider.value;
        }
      }

      // History Blacklist & Whitelist
      if (this.settingsHistoryBlacklist) {
        this.settingsHistoryBlacklist.value = settings.historyBlacklist || '';
      }
      if (this.settingsHistoryWhitelist) {
        this.settingsHistoryWhitelist.value = settings.historyWhitelist || '';
      }

      // History auto cleanup retention select
      const retentionInput = document.getElementById('settings-history-retention');
      if (retentionInput) {
        retentionInput.value = settings.historyRetention || 'never';
      }

      // Notes autosave interval select
      const autosaveInput = document.getElementById('settings-notes-autosave');
      if (autosaveInput) {
        autosaveInput.value = settings.notesAutosave || '30';
      }

      // Notes default focus mode checkbox
      const focusInput = document.getElementById('settings-notes-focus-default');
      if (focusInput) {
        focusInput.checked = settings.notesFocusDefault === true;
      }

      // Notes markdown preview checkbox
      const markdownInput = document.getElementById('settings-notes-markdown');
      if (markdownInput) {
        markdownInput.checked = settings.notesMarkdown !== false;
      }

      // API history integration permission
      const permHistoryInput = document.getElementById('settings-perm-history');
      if (permHistoryInput) {
        permHistoryInput.checked = settings.permHistory !== false;
      }

      // API cookies integration permission
      const permCookiesInput = document.getElementById('settings-perm-cookies');
      if (permCookiesInput) {
        permCookiesInput.checked = settings.permCookies !== false;
      }

      // Performance virtual scroll list checkbox
      const perfVirtualInput = document.getElementById('settings-perf-virtual-scroll');
      if (perfVirtualInput) {
        perfVirtualInput.checked = settings.perfVirtualScroll !== false;
      }

      // Performance active memory checkbox
      const perfMemoryInput = document.getElementById('settings-perf-memory-opt');
      if (perfMemoryInput) {
        perfMemoryInput.checked = settings.perfMemoryOpt === true;
      }

      // High contrast mode colors checkbox
      const contrastInput = document.getElementById('settings-access-contrast');
      if (contrastInput) {
        contrastInput.checked = settings.highContrast === true;
      }

      // Reduced motion checkbox
      const motionInput = document.getElementById('settings-access-motion');
      if (motionInput) {
        motionInput.checked = settings.reducedMotion === true;
      }

      // Accessibility Font scale slider
      const fontInput = document.getElementById('settings-access-font-scale');
      if (fontInput) {
        fontInput.value = settings.fontScale !== undefined ? settings.fontScale : 100;
        const fontVal = document.getElementById('font-scale-val');
        if (fontVal) fontVal.textContent = fontInput.value + '%';
      }
    });

    // Initialize Settings Control Center sub-sidebar navigation
    this.initSettingsSubNav();
    // Initialize Settings search
    this.initSettingsSearch();
    // Load live statistics
    this.loadSettingsStats();
    // Load diagnostics info
    this.loadSettingsDiagnostics();
    // Initialize range slider live labels
    this.initSettingsSliderLabels();
  },

  initSettingsSubNav() {
    const navItems = document.querySelectorAll('.settings-nav-item');
    const sections = document.querySelectorAll('.settings-section');
    
    navItems.forEach(item => {
      // Remove existing listeners by cloning
      const newItem = item.cloneNode(true);
      item.parentNode.replaceChild(newItem, item);
      
      newItem.addEventListener('click', () => {
        const targetId = newItem.dataset.target;
        
        // Update active nav item
        document.querySelectorAll('.settings-nav-item').forEach(n => n.classList.remove('active'));
        newItem.classList.add('active');
        
        // Show target section, hide others
        sections.forEach(sec => {
          sec.classList.remove('active');
          if (sec.id === targetId) {
            sec.classList.add('active');
          }
        });

        // Clear search when switching tabs
        const searchInput = document.getElementById('settings-search');
        if (searchInput) {
          searchInput.value = '';
          document.querySelectorAll('.settings-item').forEach(item => {
            item.classList.remove('search-match', 'search-hidden');
          });
        }
      });
    });
  },

  initSettingsSearch() {
    const searchInput = document.getElementById('settings-search');
    if (!searchInput) return;

    // Remove old listeners
    const newSearch = searchInput.cloneNode(true);
    searchInput.parentNode.replaceChild(newSearch, searchInput);

    newSearch.addEventListener('input', (e) => {
      const query = e.target.value.toLowerCase().trim();
      const allItems = document.querySelectorAll('.settings-item');
      const sections = document.querySelectorAll('.settings-section');
      const navItems = document.querySelectorAll('.settings-nav-item');

      if (!query) {
        // Reset: show all items, remove highlights
        allItems.forEach(item => item.classList.remove('search-match', 'search-hidden'));
        return;
      }

      // Search across ALL sections (show all sections during search)
      sections.forEach(sec => sec.classList.add('active'));
      navItems.forEach(n => n.classList.remove('active'));

      allItems.forEach(item => {
        const keywords = (item.dataset.keywords || '').toLowerCase();
        const textContent = item.textContent.toLowerCase();
        const isMatch = keywords.includes(query) || textContent.includes(query);
        
        if (isMatch) {
          item.classList.add('search-match');
          item.classList.remove('search-hidden');
        } else {
          item.classList.remove('search-match');
          item.classList.add('search-hidden');
        }
      });
    });
  },

  loadSettingsStats() {
    // Animated counter helper
    const animateCounter = (el, target) => {
      if (!el) return;
      const duration = 800;
      const start = 0;
      const startTime = performance.now();
      
      const step = (currentTime) => {
        const elapsed = currentTime - startTime;
        const progress = Math.min(elapsed / duration, 1);
        const eased = 1 - Math.pow(1 - progress, 3); // Ease-out cubic
        const current = Math.floor(start + (target - start) * eased);
        el.textContent = current.toLocaleString();
        if (progress < 1) requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    };

    // Bookmarks count
    if (typeof chrome !== 'undefined' && chrome.bookmarks) {
      chrome.bookmarks.getTree((tree) => {
        let bookmarks = 0, folders = 0;
        const walk = (nodes) => {
          nodes.forEach(node => {
            if (node.url) bookmarks++;
            else folders++;
            if (node.children) walk(node.children);
          });
        };
        walk(tree);
        animateCounter(document.getElementById('stat-count-bookmarks'), bookmarks);
        animateCounter(document.getElementById('stat-count-folders'), folders);
      });
    }

    // History count
    if (typeof chrome !== 'undefined' && chrome.history) {
      chrome.history.search({ text: '', maxResults: 0, startTime: 0 }, (results) => {
        animateCounter(document.getElementById('stat-count-history'), results ? results.length : 0);
      });
    }

    // Cookies count
    if (typeof chrome !== 'undefined' && chrome.cookies) {
      chrome.cookies.getAll({}, (cookies) => {
        const domains = new Set();
        if (cookies) cookies.forEach(c => domains.add(c.domain));
        animateCounter(document.getElementById('stat-count-cookies'), domains.size);
      });
    }

    // Notes count
    chrome.storage.local.get(['bookmark_organizer_notes'], (res) => {
      const notes = res.bookmark_organizer_notes || {};
      animateCounter(document.getElementById('stat-count-notes'), Object.keys(notes).length);
    });

    // Storage usage
    if (chrome.storage && chrome.storage.local.getBytesInUse) {
      chrome.storage.local.getBytesInUse(null, (bytes) => {
        const el = document.getElementById('stat-count-storage');
        if (el) {
          if (bytes > 1048576) {
            el.textContent = (bytes / 1048576).toFixed(1) + ' MB';
          } else {
            el.textContent = (bytes / 1024).toFixed(0) + ' KB';
          }
        }
      });
    }
  },

  loadSettingsDiagnostics() {
    // Browser
    const browserEl = document.getElementById('diag-browser');
    if (browserEl) {
      const ua = navigator.userAgent;
      if (ua.includes('Chrome')) browserEl.textContent = 'Google Chrome ' + (ua.match(/Chrome\/(\d+)/)?.[1] || '');
      else if (ua.includes('Firefox')) browserEl.textContent = 'Mozilla Firefox';
      else if (ua.includes('Edg')) browserEl.textContent = 'Microsoft Edge';
      else browserEl.textContent = 'Chromium Based';
    }

    // OS
    const osEl = document.getElementById('diag-os');
    if (osEl) {
      const platform = navigator.platform || navigator.userAgentData?.platform || 'Unknown';
      if (platform.includes('Win')) osEl.textContent = 'Windows';
      else if (platform.includes('Mac')) osEl.textContent = 'macOS';
      else if (platform.includes('Linux')) osEl.textContent = 'Linux';
      else osEl.textContent = platform;
    }

    // Last backup
    chrome.storage.local.get(['bookmark_organizer_notes_backup'], (res) => {
      const el = document.getElementById('diag-last-backup');
      if (el) {
        el.textContent = res.bookmark_organizer_notes_backup ? 'Available' : 'Never';
      }
    });
  },

  initSettingsSliderLabels() {
    // Blur slider
    const blurSlider = document.getElementById('settings-cc-blur');
    const blurVal = document.getElementById('settings-cc-blur-val');
    if (blurSlider && blurVal) {
      blurSlider.addEventListener('input', () => {
        blurVal.textContent = blurSlider.value + 'px';
      });
    }

    // Threshold slider
    const threshSlider = document.getElementById('settings-threshold-slider');
    const threshVal = document.getElementById('settings-threshold-val');
    if (threshSlider && threshVal) {
      threshSlider.addEventListener('input', () => {
        threshVal.textContent = threshSlider.value;
      });
    }

    // Border radius slider
    const radiusSlider = document.getElementById('settings-custom-radius');
    const radiusVal = document.getElementById('radius-val');
    if (radiusSlider && radiusVal) {
      radiusSlider.addEventListener('input', () => {
        radiusVal.textContent = radiusSlider.value + 'px';
      });
    }

    // Glass opacity slider
    const glassSlider = document.getElementById('settings-glass-opacity');
    const glassVal = document.getElementById('glass-opacity-val');
    if (glassSlider && glassVal) {
      glassSlider.addEventListener('input', () => {
        glassVal.textContent = (glassSlider.value / 100).toFixed(2);
      });
    }

    // Animation speed slider
    const animSlider = document.getElementById('settings-animation-speed');
    const animVal = document.getElementById('animation-speed-val');
    if (animSlider && animVal) {
      animSlider.addEventListener('input', () => {
        animVal.textContent = (animSlider.value / 100).toFixed(1) + 's';
      });
    }

    // Font scale slider
    const fontSlider = document.getElementById('settings-access-font-scale');
    const fontVal = document.getElementById('font-scale-val');
    if (fontSlider && fontVal) {
      fontSlider.addEventListener('input', () => {
        fontVal.textContent = fontSlider.value + '%';
      });
    }

    // Accent color picker dots
    document.querySelectorAll('.accent-dot').forEach(dot => {
      dot.addEventListener('click', () => {
        document.querySelectorAll('.accent-dot').forEach(d => d.classList.remove('active'));
        dot.classList.add('active');
      });
    });
  },

  saveSettingsFromManager() {
    const parentNameInput = document.getElementById('parent-folder-name');
    const thresholdSlider = document.getElementById('threshold-slider');
    const thresholdVal = document.getElementById('threshold-val');
    
    // 1. Save Parent Name
    if (this.settingsParentName && parentNameInput) {
      parentNameInput.value = this.settingsParentName.value;
    }
    
    // 2. Save Threshold
    if (this.settingsThresholdSlider && thresholdSlider) {
      thresholdSlider.value = this.settingsThresholdSlider.value;
      if (thresholdVal) {
        thresholdVal.textContent = this.settingsThresholdSlider.value;
      }
      thresholdSlider.dispatchEvent(new Event('input'));
    }
    
    // 3. Save Active Categories
    if (this.settingsCategoriesList) {
      const checkboxes = this.settingsCategoriesList.querySelectorAll('.settings-cat-cb');
      checkboxes.forEach(cb => {
        const catId = cb.dataset.catId;
        const cat = BookmarkRules.categories.find(c => c.id === catId);
        if (cat) {
          cat.enabled = cb.checked;
          const wizardCb = document.querySelector(`.category-checkbox[data-category="${catId}"]`);
          if (wizardCb) {
            wizardCb.checked = cb.checked;
          }
        }
      });
      saveCategoriesConfig();
    }
    
    // Read all values from the UI controls
    const themeVal = this.settingsCcTheme ? this.settingsCcTheme.value : 'dark';
    
    let accentVal = 'indigo';
    const activeAccent = document.querySelector('.accent-dot.active');
    if (activeAccent) {
      accentVal = activeAccent.dataset.color;
    }
    
    const radiusInput = document.getElementById('settings-custom-radius');
    const radiusVal = radiusInput ? parseInt(radiusInput.value, 10) : 14;
    
    const opacityInput = document.getElementById('settings-glass-opacity');
    const opacityVal = opacityInput ? parseInt(opacityInput.value, 10) : 70;
    
    const blurVal = this.settingsCcBlur ? parseInt(this.settingsCcBlur.value, 10) : 15;
    
    const speedInput = document.getElementById('settings-animation-speed');
    const speedVal = speedInput ? parseInt(speedInput.value, 10) : 30;
    
    const compactInput = document.getElementById('settings-compact-mode');
    const compactVal = compactInput ? compactInput.checked : false;
    
    const blacklistVal = this.settingsHistoryBlacklist ? this.settingsHistoryBlacklist.value : '';
    const whitelistVal = this.settingsHistoryWhitelist ? this.settingsHistoryWhitelist.value : '';
    
    const retentionInput = document.getElementById('settings-history-retention');
    const retentionVal = retentionInput ? retentionInput.value : 'never';
    
    const autosaveInput = document.getElementById('settings-notes-autosave');
    const autosaveVal = autosaveInput ? autosaveInput.value : '30';
    
    const focusInput = document.getElementById('settings-notes-focus-default');
    const notesFocusVal = focusInput ? focusInput.checked : false;
    
    const markdownInput = document.getElementById('settings-notes-markdown');
    const notesMarkdownVal = markdownInput ? markdownInput.checked : true;
    
    const permHistoryInput = document.getElementById('settings-perm-history');
    const permHistoryVal = permHistoryInput ? permHistoryInput.checked : true;
    
    const permCookiesInput = document.getElementById('settings-perm-cookies');
    const permCookiesVal = permCookiesInput ? permCookiesInput.checked : true;
    
    const perfVirtualInput = document.getElementById('settings-perf-virtual-scroll');
    const perfVirtualVal = perfVirtualInput ? perfVirtualInput.checked : true;
    
    const perfMemoryInput = document.getElementById('settings-perf-memory-opt');
    const perfMemoryVal = perfMemoryInput ? perfMemoryInput.checked : false;
    
    const contrastInput = document.getElementById('settings-access-contrast');
    const contrastVal = contrastInput ? contrastInput.checked : false;
    
    const motionInput = document.getElementById('settings-access-motion');
    const motionVal = motionInput ? motionInput.checked : false;
    
    const fontInput = document.getElementById('settings-access-font-scale');
    const fontScaleVal = fontInput ? parseInt(fontInput.value, 10) : 100;
    
    const settingsObj = {
      parentFolderName: this.settingsParentName ? this.settingsParentName.value : 'Bookmarks Bar',
      threshold: this.settingsThresholdSlider ? this.settingsThresholdSlider.value : '5',
      themePreset: themeVal,
      accentPreset: accentVal,
      customRadius: radiusVal,
      glassOpacity: opacityVal,
      ccBlur: blurVal,
      animationSpeed: speedVal,
      compactMode: compactVal,
      historyBlacklist: blacklistVal,
      historyWhitelist: whitelistVal,
      historyRetention: retentionVal,
      notesAutosave: autosaveVal,
      notesFocusDefault: notesFocusVal,
      notesMarkdown: notesMarkdownVal,
      permHistory: permHistoryVal,
      permCookies: permCookiesVal,
      perfVirtualScroll: perfVirtualVal,
      perfMemoryOpt: perfMemoryVal,
      highContrast: contrastVal,
      reducedMotion: motionVal,
      fontScale: fontScaleVal
    };
    
    chrome.storage.local.set({ 'organizer_user_settings': settingsObj }, () => {
      // Apply style variables dynamically
      this.applySettings(settingsObj);
      
      // Sync categories list in Wizard step 1 UI (refresh checkmarks)
      if (typeof initCategoriesUI === 'function') {
        initCategoriesUI();
      }

      showToast('Settings successfully updated and saved!', 'success');
      this.switchView('bookmarks');
    });
  },

  applySettings(settings) {
    if (!settings) return;
    
    // 1. Custom Border Radius
    const radius = settings.customRadius !== undefined ? settings.customRadius : 14;
    document.documentElement.style.setProperty('--border-radius', radius + 'px');
    
    // 2. Glass Transparency
    const opacity = settings.glassOpacity !== undefined ? settings.glassOpacity : 70;
    document.documentElement.style.setProperty('--glass-opacity', opacity / 100);
    
    // 3. Animation Transition Speed
    const speed = settings.animationSpeed !== undefined ? settings.animationSpeed : 30;
    document.documentElement.style.setProperty('--transition-speed', speed / 100 + 's');
    
    // 4. Backdrop Blur
    const blur = settings.ccBlur !== undefined ? settings.ccBlur : 15;
    document.documentElement.style.setProperty('--cc-blur', blur + 'px');
    
    // 5. Font Scale
    const scale = settings.fontScale !== undefined ? settings.fontScale : 100;
    document.documentElement.style.setProperty('--font-scale', scale + '%');
    document.documentElement.style.fontSize = scale + '%';
    
    // 6. Theme Preset
    const theme = settings.themePreset || 'dark';
    if (theme === 'light') {
      document.documentElement.style.setProperty('--bg-dark', '#f3f4f6');
      document.documentElement.style.setProperty('--panel-bg', 'rgba(255, 255, 255, 0.85)');
      document.documentElement.style.setProperty('--panel-border', 'rgba(0, 0, 0, 0.08)');
      document.documentElement.style.setProperty('--text-main', '#111827');
      document.documentElement.style.setProperty('--text-muted', '#4b5563');
    } else if (theme === 'amethyst') {
      document.documentElement.style.setProperty('--bg-dark', '#120b29');
      document.documentElement.style.setProperty('--panel-bg', 'rgba(28, 16, 56, 0.65)');
      document.documentElement.style.setProperty('--panel-border', 'rgba(255, 255, 255, 0.08)');
      document.documentElement.style.setProperty('--text-main', '#f5f3ff');
      document.documentElement.style.setProperty('--text-muted', '#a78bfa');
    } else if (theme === 'emerald') {
      document.documentElement.style.setProperty('--bg-dark', '#04170f');
      document.documentElement.style.setProperty('--panel-bg', 'rgba(10, 36, 25, 0.65)');
      document.documentElement.style.setProperty('--panel-border', 'rgba(255, 255, 255, 0.08)');
      document.documentElement.style.setProperty('--text-main', '#ecfdf5');
      document.documentElement.style.setProperty('--text-muted', '#34d399');
    } else { // dark
      document.documentElement.style.setProperty('--bg-dark', '#090615');
      document.documentElement.style.setProperty('--panel-bg', 'rgba(18, 14, 38, 0.55)');
      document.documentElement.style.setProperty('--panel-border', 'rgba(255, 255, 255, 0.09)');
      document.documentElement.style.setProperty('--text-main', '#f3f4f6');
      document.documentElement.style.setProperty('--text-muted', '#9ca3af');
    }
    
    // 7. Accent Preset
    const accent = settings.accentPreset || 'indigo';
    let accentColor = '#6366f1';
    if (accent === 'cyan') accentColor = '#06b6d4';
    else if (accent === 'rose') accentColor = '#f43f5e';
    else if (accent === 'green') accentColor = '#10b981';
    document.documentElement.style.setProperty('--color-primary', accentColor);
    
    // 8. Compact Mode
    if (settings.compactMode) {
      document.body.classList.add('compact-mode');
    } else {
      document.body.classList.remove('compact-mode');
    }
    
    // 9. High Contrast
    if (settings.highContrast) {
      document.body.classList.add('high-contrast');
    } else {
      document.body.classList.remove('high-contrast');
    }
    
    // 10. Reduced Motion
    if (settings.reducedMotion) {
      document.body.classList.add('reduced-motion');
    } else {
      document.body.classList.remove('reduced-motion');
    }

    // 11. Notes Autosave
    this.setupNotesAutosaveInterval(settings.notesAutosave);
  },

  setupNotesAutosaveInterval(intervalVal) {
    if (this.autosaveIntervalTimer) {
      clearInterval(this.autosaveIntervalTimer);
      this.autosaveIntervalTimer = null;
    }
    
    if (!intervalVal || intervalVal === 'manual') return;
    
    const seconds = parseInt(intervalVal, 10);
    if (isNaN(seconds)) return;
    
    this.autosaveIntervalTimer = setInterval(() => {
      if (this.activeView === 'notes' && this.activeNoteName && this.noteEditorBody) {
        const cached = this.unsavedNotesCache ? this.unsavedNotesCache[this.activeNoteName] : null;
        const currentVal = this.noteEditorBody.value;
        if (cached !== null && cached !== currentVal) {
          this.saveActiveNote(true);
        }
      }
    }, seconds * 1000);
  },

  // Redesign History View state
  historyItems: [],
  historyFilteredItems: [],
  historyRenderRows: [],
  historyRowOffsets: [],
  historyTotalHeight: 0,
  historySearchQuery: '',
  historyViewMode: 'list',
  historySelectedUrls: new Set(),
  historyLastClickedIndex: null,
  historyFilterTime: 'time-all',
  historyFilterStatus: null,
  historySortMode: 'newest',
  historyVisitThreshold: 0,
  historyBlacklistRules: [],
  historyExpandedDomains: new Set(),
  historyExpandedTimelines: new Set(['Today', 'Yesterday', 'This Week']),
  bookmarkedUrlsSet: new Set(),
  allRawHistoryItems: null,

  async cacheBookmarksTree() {
    return new Promise((resolve) => {
      chrome.bookmarks.getTree((tree) => {
        this.bookmarkedUrlsSet.clear();
        const traverse = (node) => {
          if (node.url) this.bookmarkedUrlsSet.add(node.url);
          if (node.children) node.children.forEach(traverse);
        };
        if (tree) tree.forEach(traverse);
        resolve();
      });
    });
  },

  initiateHistoryListeners() {
    // Scroll listener for virtual scrolling
    if (this.historyViewport) {
      this.historyViewport.addEventListener('scroll', () => {
        this.renderVirtualHistory();
      });
    }

    // View mode toggles
    document.querySelectorAll('#history-view-mode-toggles .view-toggle-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const btnEl = e.currentTarget;
        document.querySelectorAll('#history-view-mode-toggles .view-toggle-btn').forEach(b => b.classList.remove('active'));
        btnEl.classList.add('active');
        this.historyViewMode = btnEl.dataset.mode;
        chrome.storage.local.set({ 'history_view_mode': this.historyViewMode });
        
        this.clearHistorySelection();
        this.processHistoryData();
      });
    });

    // Timeframe and status filters in Sidebar
    document.querySelectorAll('.history-sidebar-filters .filter-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const btnEl = e.currentTarget;
        if (btnEl.id === 'blacklist-manager-btn') {
          // Open blacklist manager panel
          if (this.blacklistManagerPanel) {
            this.blacklistManagerPanel.classList.remove('hidden');
            this.loadBlacklistRules();
          }
          return;
        }

        // Toggle active style
        const filterVal = btnEl.dataset.filter;
        if (filterVal.startsWith('time-')) {
          document.querySelectorAll('.history-sidebar-filters .filter-btn[data-filter^="time-"]').forEach(b => b.classList.remove('active'));
          btnEl.classList.add('active');
          this.historyFilterTime = filterVal;

          const dateRangeContainer = document.getElementById('custom-date-range-container');
          if (dateRangeContainer) {
            dateRangeContainer.classList.toggle('hidden', filterVal !== 'time-custom');
          }
        } else {
          // Status/protocol toggle filters
          const isActive = btnEl.classList.contains('active');
          document.querySelectorAll('.history-sidebar-filters .filter-btn:not([data-filter^="time-"])').forEach(b => b.classList.remove('active'));
          if (!isActive) {
            btnEl.classList.add('active');
            this.historyFilterStatus = filterVal;
          } else {
            this.historyFilterStatus = null;
          }
        }

        this.processHistoryData();
      });
    });

    // Custom date filters
    if (this.historyStartDateInput) {
      this.historyStartDateInput.addEventListener('change', () => this.processHistoryData());
    }
    if (this.historyEndDateInput) {
      this.historyEndDateInput.addEventListener('change', () => this.processHistoryData());
    }

    // Sort select
    if (this.historySortSelectPremium) {
      this.historySortSelectPremium.addEventListener('change', (e) => {
        this.historySortMode = e.target.value;
        this.processHistoryData();
      });
    }

    // Visit threshold count
    if (this.historyVisitThresholdInput) {
      this.historyVisitThresholdInput.addEventListener('input', (e) => {
        this.historyVisitThreshold = parseInt(e.target.value) || 0;
        this.processHistoryData();
      });
    }

    // Blacklist manager close / add buttons
    const closeBlacklistBtn = document.getElementById('close-blacklist-manager-btn');
    if (closeBlacklistBtn) {
      closeBlacklistBtn.addEventListener('click', () => {
        if (this.blacklistManagerPanel) this.blacklistManagerPanel.classList.add('hidden');
        this.allRawHistoryItems = null; // force reload to filter
        this.loadHistory(this.historySearchQuery);
      });
    }

    const addBlacklistSubmitBtn = document.getElementById('blacklist-add-submit-btn');
    if (addBlacklistSubmitBtn) {
      addBlacklistSubmitBtn.addEventListener('click', () => {
        const type = document.getElementById('blacklist-add-type').value;
        const behavior = document.getElementById('blacklist-add-behavior').value;
        const pattern = document.getElementById('blacklist-add-pattern').value.trim();
        const reason = document.getElementById('blacklist-add-reason').value.trim();
        if (!pattern) {
          showToast('Pattern cannot be empty!', 'error');
          return;
        }
        this.addBlacklistRule(type, pattern, reason, behavior);
      });
    }

    // Selection floating bar actions
    const selectBookmarkAllBtn = document.getElementById('history-select-bookmark-all');
    if (selectBookmarkAllBtn) {
      selectBookmarkAllBtn.addEventListener('click', () => this.bookmarkSelectedUrls());
    }
    const selectDeleteAllBtn = document.getElementById('history-select-delete-all');
    if (selectDeleteAllBtn) {
      selectDeleteAllBtn.addEventListener('click', () => this.deleteSelectedUrls());
    }
    const selectBlacklistAllBtn = document.getElementById('history-select-blacklist-all');
    if (selectBlacklistAllBtn) {
      selectBlacklistAllBtn.addEventListener('click', () => this.blacklistSelectedUrls());
    }
    const selectExportBtn = document.getElementById('history-select-export');
    if (selectExportBtn) {
      selectExportBtn.addEventListener('click', () => this.exportSelectedUrls());
    }
    const selectCopyBtn = document.getElementById('history-select-copy');
    if (selectCopyBtn) {
      selectCopyBtn.addEventListener('click', () => this.copySelectedUrls());
    }
    const selectClearBtn = document.getElementById('history-select-clear');
    if (selectClearBtn) {
      selectClearBtn.addEventListener('click', () => this.clearHistorySelection());
    }

    // Context menu click outsides
    document.addEventListener('click', (e) => {
      this.hideHistoryContextMenu();
    });

    // Resize viewport resets offsets
    window.addEventListener('resize', () => {
      if (this.activeView === 'history') {
        this.calculateRowOffsets();
        this.renderVirtualHistory();
      }
    });

    // Keyboard navigation
    if (this.historyViewport) {
      this.historyViewport.addEventListener('keydown', (e) => {
        if (this.activeView !== 'history') return;
        if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
          e.preventDefault();
          const items = this.historyRenderRows.filter(r => r.type === 'item');
          if (items.length === 0) return;
          let newIndex = 0;
          if (this.historyLastClickedIndex !== null) {
            const currentItemIdx = items.findIndex(r => r.index === this.historyLastClickedIndex);
            if (e.key === 'ArrowDown') {
              newIndex = Math.min(items.length - 1, currentItemIdx + 1);
            } else {
              newIndex = Math.max(0, currentItemIdx - 1);
            }
          }
          const targetItem = items[newIndex];
          if (targetItem) {
            this.historyLastClickedIndex = targetItem.index;
            this.historySelectedUrls.clear();
            this.historySelectedUrls.add(targetItem.data.url);
            this.updateHistorySelectionBar();
            this.renderVirtualHistory();
            
            // Scroll into view if needed
            const rowTop = this.historyRowOffsets[targetItem.index];
            const viewHeight = this.historyViewport.clientHeight;
            if (rowTop < this.historyViewport.scrollTop) {
              this.historyViewport.scrollTop = rowTop;
            } else if (rowTop + 54 > this.historyViewport.scrollTop + viewHeight) {
              this.historyViewport.scrollTop = rowTop + 54 - viewHeight;
            }
          }
        }
      });
    }

    // COLLAPSIBLE SIDEBAR: Main Left Sidebar (.manager-sidebar)
    const sidebarCollapseToggle = document.getElementById('sidebar-collapse-toggle');
    const managerSidebar = document.querySelector('.manager-sidebar');
    if (sidebarCollapseToggle && managerSidebar) {
      if (this.hasManuallyToggledSidebarThisSession === undefined) this.hasManuallyToggledSidebarThisSession = false;
      if (this.historySessionStarted === undefined) this.historySessionStarted = false;

      // Load saved preference
      chrome.storage.local.get(['sidebar_collapsed_pref'], (result) => {
        if (result.sidebar_collapsed_pref) {
          managerSidebar.classList.add('collapsed');
          sidebarCollapseToggle.setAttribute('title', 'Expand Sidebar');
        }
      });

      sidebarCollapseToggle.addEventListener('click', (e) => {
        e.stopPropagation();
        this.hasManuallyToggledSidebarThisSession = true;
        const isCollapsed = managerSidebar.classList.toggle('collapsed');
        sidebarCollapseToggle.setAttribute('title', isCollapsed ? 'Expand Sidebar' : 'Collapse Sidebar');
        chrome.storage.local.set({ 'sidebar_collapsed_pref': isCollapsed });

        // Track manual expansion on History page to prevent auto-collapse fighting user
        if (this.activeView === 'history' && !isCollapsed) {
          this._sidebarManuallyExpandedOnHistory = true;
        }

        // Recalculate virtual scrolling offsets if the workspace resized
        setTimeout(() => {
          if (this.activeView === 'history') {
            this.calculateRowOffsets();
            this.renderVirtualHistory();
          }
        }, 250); // matches CSS transition duration
      });
    }

    // COLLAPSIBLE SIDEBAR: History Filter Sidebar (.history-sidebar-filters)
    const filterCollapseToggle = document.getElementById('filter-sidebar-collapse-toggle');
    const filterSidebar = document.querySelector('.history-sidebar-filters');
    if (filterCollapseToggle && filterSidebar) {
      filterCollapseToggle.addEventListener('mousedown', (e) => {
        e.stopPropagation();
      });
      filterCollapseToggle.addEventListener('click', (e) => {
        e.stopPropagation();
        const isCollapsed = filterSidebar.classList.toggle('collapsed');
        filterCollapseToggle.setAttribute('title', isCollapsed ? 'Expand Filters' : 'Collapse Filters');
        
        // Recalculate virtual scrolling offsets if workspace resized
        setTimeout(() => {
          if (this.activeView === 'history') {
            this.calculateRowOffsets();
            this.renderVirtualHistory();
          }
        }, 250); // matches CSS transition duration
      });
    }

    // EXPANDABLE SEARCH EXPERIENCING
    const searchWrapper = document.querySelector('.search-bar-wrapper');
    const searchInputEl = document.getElementById('manager-search');
    
    if (searchWrapper && searchInputEl) {
      searchWrapper.addEventListener('click', (e) => {
        if (!searchWrapper.classList.contains('expanded')) {
          searchWrapper.classList.add('expanded');
          searchInputEl.focus();
        }
      });
      
      searchInputEl.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
          searchInputEl.value = '';
          searchInputEl.dispatchEvent(new Event('input')); // clear search
          searchWrapper.classList.remove('expanded');
          searchInputEl.blur();
        }
      });
      
      document.addEventListener('click', (e) => {
        if (!searchWrapper.contains(e.target) && !searchInputEl.value.trim()) {
          searchWrapper.classList.remove('expanded');
        }
      });
    }

    // GENERAL MUI-STYLE DROPDOWNS MANAGEMENT
    const registerMuiDropdown = (containerId, triggerId, menuId, onSelectCallback = null) => {
      const trigger = document.getElementById(triggerId);
      const menu = document.getElementById(menuId);
      if (!trigger || !menu) return;

      trigger.addEventListener('click', (e) => {
        e.stopPropagation();
        // Hide all other menus first
        document.querySelectorAll('.dropdown-menu').forEach(m => {
          if (m !== menu) m.classList.add('hidden');
        });
        menu.classList.toggle('hidden');
      });

      menu.querySelectorAll('.dropdown-item').forEach(item => {
        item.addEventListener('click', (e) => {
          e.stopPropagation();
          const val = item.dataset.value || item.dataset.mode;
          
          // Update active style
          menu.querySelectorAll('.dropdown-item').forEach(i => i.classList.remove('active'));
          item.classList.add('active');
          
          // Update trigger text (and icon if present)
          const textSpan = trigger.querySelector('.trigger-text');
          const triggerIcon = trigger.querySelector('.trigger-icon');
          const itemIcon = item.querySelector('i');
          if (textSpan) textSpan.textContent = item.textContent.trim();
          if (triggerIcon && itemIcon) {
            triggerIcon.className = itemIcon.className;
          }

          menu.classList.add('hidden');
          
          if (onSelectCallback) {
            onSelectCallback(val);
          }
        });
      });
    };

    // Close all menus when clicking outside
    document.addEventListener('click', () => {
      document.querySelectorAll('.dropdown-menu').forEach(menu => {
        if (menu.id !== 'visits-dropdown-menu') { // don't close visits filter on internal clicks
          menu.classList.add('hidden');
        }
      });
    });

    // 1. Sort Menu
    registerMuiDropdown('history-sort-dropdown', 'sort-dropdown-trigger', 'sort-dropdown-menu', (val) => {
      const nativeSortSelect = document.getElementById('history-sort-select-premium');
      if (nativeSortSelect) {
        nativeSortSelect.value = val;
        nativeSortSelect.dispatchEvent(new Event('change'));
      }
    });

    // Sync initial sort trigger text
    const sortMenu = document.getElementById('sort-dropdown-menu');
    const sortTrigger = document.getElementById('sort-dropdown-trigger');
    if (sortTrigger && sortMenu) {
      const activeOption = sortMenu.querySelector(`.dropdown-item[data-value="${this.historySortMode || 'newest'}"]`);
      if (activeOption) {
        sortTrigger.querySelector('.trigger-text').textContent = activeOption.textContent.trim();
        sortMenu.querySelectorAll('.dropdown-item').forEach(i => i.classList.remove('active'));
        activeOption.classList.add('active');
      }
    }

    // 2. View Mode Menu
    registerMuiDropdown('history-view-mode-dropdown', 'view-mode-dropdown-trigger', 'view-mode-dropdown-menu', (val) => {
      this.historyViewMode = val;
      chrome.storage.local.set({ 'history_view_mode': this.historyViewMode });
      
      this.clearHistorySelection();
      this.processHistoryData();
    });

    // Sync initial view mode trigger text
    const viewMenu = document.getElementById('view-mode-dropdown-menu');
    const viewTrigger = document.getElementById('view-mode-dropdown-trigger');
    if (viewTrigger && viewMenu) {
      const activeOption = viewMenu.querySelector(`.dropdown-item[data-mode="${this.historyViewMode || 'list'}"]`);
      if (activeOption) {
        viewTrigger.querySelector('.trigger-text').textContent = activeOption.textContent.trim();
        viewMenu.querySelectorAll('.dropdown-item').forEach(i => i.classList.remove('active'));
        activeOption.classList.add('active');
        const triggerIcon = viewTrigger.querySelector('.trigger-icon');
        const itemIcon = activeOption.querySelector('i');
        if (triggerIcon && itemIcon) triggerIcon.className = itemIcon.className;
      }
    }

    // 7. Three-Dot compact overflow menu Toggle
    const overflowTrigger = document.getElementById('history-overflow-trigger');
    const overflowMenu = document.getElementById('history-overflow-menu');
    if (overflowTrigger && overflowMenu) {
      overflowTrigger.addEventListener('click', (e) => {
        e.stopPropagation();
        document.querySelectorAll('.dropdown-menu').forEach(m => {
          if (m !== overflowMenu) m.classList.add('hidden');
        });
        overflowMenu.classList.toggle('hidden');
      });

      // Bind actions in overflow menu:
      document.getElementById('overflow-act-export')?.addEventListener('click', () => {
        const urls = Array.from(this.historySelectedUrls);
        if (urls.length > 0) {
          this.exportSelectedUrls();
        } else {
          this.exportHistory(this.historyFilteredItems);
        }
      });

      document.getElementById('overflow-act-import')?.addEventListener('click', () => {
        document.getElementById('blacklist-import-input')?.click();
      });

      document.getElementById('overflow-act-blacklist')?.addEventListener('click', () => {
        if (this.blacklistManagerPanel) {
          this.blacklistManagerPanel.classList.remove('hidden');
          this.loadBlacklistRules();
        }
      });

      document.getElementById('overflow-act-clear')?.addEventListener('click', () => {
        this.clearAllHistory();
      });

      document.getElementById('overflow-act-restore')?.addEventListener('click', () => {
        document.getElementById('view-backups-btn')?.click();
      });

      document.getElementById('overflow-act-advanced-filters')?.addEventListener('click', () => {
        const filterToggle = document.getElementById('filter-sidebar-collapse-toggle');
        if (filterToggle) filterToggle.click();
      });

      document.getElementById('overflow-act-settings')?.addEventListener('click', () => {
        this.switchView('settings');
      });
    }

    // 8. Blacklist Search Input debounced filter
    const blacklistSearchInput = document.getElementById('blacklist-search-input');
    if (blacklistSearchInput) {
      blacklistSearchInput.addEventListener('input', () => {
        this.loadBlacklistRules();
      });
    }

    // 9. Blacklist rules import parser
    const importRulesInput = document.getElementById('blacklist-import-input');
    if (importRulesInput) {
      importRulesInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (event) => {
          try {
            const imported = JSON.parse(event.target.result);
            if (!Array.isArray(imported)) {
              showToast('Invalid file format. Must be an array of rules.', 'error');
              return;
            }
            const validRules = imported.filter(r => r.pattern && r.type);
            if (validRules.length === 0) {
              showToast('No valid rules found in file.', 'error');
              return;
            }

            chrome.storage.local.get(['history_blacklist_rules'], (res) => {
              const currentRules = res.history_blacklist_rules || [];
              let addedCount = 0;
              validRules.forEach(newRule => {
                if (!currentRules.some(r => r.type === newRule.type && r.pattern === newRule.pattern)) {
                  currentRules.push({
                    id: newRule.id || 'bl_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
                    type: newRule.type,
                    pattern: newRule.pattern,
                    reason: newRule.reason || 'Imported rule',
                    behavior: newRule.behavior || 'hide',
                    addedDate: newRule.addedDate || Date.now()
                  });
                  addedCount++;
                }
              });

              chrome.storage.local.set({ 'history_blacklist_rules': currentRules }, () => {
                showToast(`Successfully imported ${addedCount} new rules!`, 'success');
                this.syncBlacklistWithSettings(currentRules);
                this.loadBlacklistRules();
              });
            });
          } catch (err) {
            showToast('Failed to parse JSON file.', 'error');
          }
        };
        reader.readAsText(file);
      });
    }

    // Blacklist dropdown setups
    registerMuiDropdown('blacklist-add-type-dropdown', 'blacklist-type-trigger', 'blacklist-type-menu', (val) => {
      const nativeSelect = document.getElementById('blacklist-add-type');
      if (nativeSelect) nativeSelect.value = val;
    });

    registerMuiDropdown('blacklist-add-behavior-dropdown', 'blacklist-behavior-trigger', 'blacklist-behavior-menu', (val) => {
      const nativeSelect = document.getElementById('blacklist-add-behavior');
      if (nativeSelect) nativeSelect.value = val;
    });

    registerMuiDropdown('blacklist-filter-type-dropdown', 'blacklist-filter-type-trigger', 'blacklist-filter-type-menu', (val) => {
      this.blacklistFilterType = val;
      this.loadBlacklistRules();
    });

    // Keyboard shortcut for focusing search
    document.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && (e.key.toLowerCase() === 'k' || e.key.toLowerCase() === 'f')) {
        e.preventDefault();
        if (this.searchInput) {
          this.searchInput.focus();
          this.searchInput.select();
        }
      }
    });
  },

  loadHistory(query = '') {
    this.historySearchQuery = query;
    if (this.historyDetailsPanel) this.historyDetailsPanel.classList.add('hidden');
    
    // Auto sync blacklist rules on boot
    chrome.storage.local.get(['history_blacklist_rules', 'history_view_mode', 'history_expanded_timelines'], (res) => {
      this.historyBlacklistRules = res.history_blacklist_rules || [];
      if (res.history_view_mode) this.historyViewMode = res.history_view_mode;
      if (res.history_expanded_timelines) {
        this.historyExpandedTimelines = new Set(res.history_expanded_timelines);
      } else {
        this.historyExpandedTimelines = new Set(['Today', 'Yesterday', 'This Week']);
      }

      if (this.bookmarkedUrlsSet.size === 0) {
        this.cacheBookmarksTree().then(() => {
          this.fetchAndProcessHistory();
        });
      } else {
        this.fetchAndProcessHistory();
      }
    });
  },

  fetchAndProcessHistory() {
    if (this.allRawHistoryItems && this.allRawHistoryItems.length > 0) {
      this.processHistoryData();
      return;
    }

    if (this.historyViewportContent) {
      this.historyViewportContent.innerHTML = `
        <div class="skeleton-row"></div>
        <div class="skeleton-row"></div>
        <div class="skeleton-row"></div>
        <div class="skeleton-row"></div>
        <div class="skeleton-row"></div>
      `;
    }

    chrome.history.search({ text: '', maxResults: 100000, startTime: 0 }, (results) => {
      if (this.activeView !== 'history') return;
      this.allRawHistoryItems = results || [];
      this.processHistoryData();
    });
  },

  processHistoryData() {
    let items = [...this.allRawHistoryItems];

    // 1. Blacklist checks (hide matching items by default unless filter is explicitly status-blacklisted)
    const isShowingBlacklistFilter = (this.historyFilterStatus === 'status-blacklisted');
    items = items.filter(item => {
      const isBlacklisted = this.isUrlBlacklisted(item.url, this.historyBlacklistRules);
      if (isShowingBlacklistFilter) return isBlacklisted;
      return !isBlacklisted;
    });

    // 2. Filter by search query
    if (this.historySearchQuery) {
      const q = this.historySearchQuery.toLowerCase();
      items = items.filter(item => {
        const parts = this.getDomainParts(item.url);
        return (
          (item.title && item.title.toLowerCase().includes(q)) ||
          item.url.toLowerCase().includes(q) ||
          parts.root.includes(q) ||
          parts.subdomain.includes(q)
        );
      });
    }

    // 3. Filter by Timeframe
    const now = Date.now();
    const dayMs = 24 * 60 * 60 * 1000;
    
    // Get local day boundary
    const getStartOfDay = (date) => {
      const d = new Date(date);
      d.setHours(0, 0, 0, 0);
      return d.getTime();
    };
    const startOfToday = getStartOfDay(now);
    const startOfYesterday = startOfToday - dayMs;

    if (this.historyFilterTime === 'time-today') {
      items = items.filter(item => item.lastVisitTime >= startOfToday);
    } else if (this.historyFilterTime === 'time-yesterday') {
      items = items.filter(item => item.lastVisitTime >= startOfYesterday && item.lastVisitTime < startOfToday);
    } else if (this.historyFilterTime === 'time-week') {
      items = items.filter(item => item.lastVisitTime >= (startOfToday - 7 * dayMs));
    } else if (this.historyFilterTime === 'time-month') {
      items = items.filter(item => item.lastVisitTime >= (startOfToday - 30 * dayMs));
    } else if (this.historyFilterTime === 'time-custom') {
      const startVal = this.historyStartDateInput?.value;
      const endVal = this.historyEndDateInput?.value;
      if (startVal && endVal) {
        const startTime = new Date(startVal + 'T00:00:00').getTime();
        const endTime = new Date(endVal + 'T23:59:59').getTime();
        items = items.filter(item => item.lastVisitTime >= startTime && item.lastVisitTime <= endTime);
      }
    }

    // 4. Filter by Status/Protocols
    if (this.historyFilterStatus && this.historyFilterStatus !== 'status-blacklisted') {
      if (this.historyFilterStatus === 'status-bookmarked') {
        items = items.filter(item => this.bookmarkedUrlsSet.has(item.url));
      } else if (this.historyFilterStatus === 'status-not-bookmarked') {
        items = items.filter(item => !this.bookmarkedUrlsSet.has(item.url));
      } else if (this.historyFilterStatus === 'subdomain-has') {
        items = items.filter(item => {
          const parts = this.getDomainParts(item.url);
          return parts.subdomain !== parts.root;
        });
      } else if (this.historyFilterStatus === 'subdomain-none') {
        items = items.filter(item => {
          const parts = this.getDomainParts(item.url);
          return parts.subdomain === parts.root;
        });
      } else if (this.historyFilterStatus === 'protocol-https') {
        items = items.filter(item => item.url.startsWith('https://'));
      } else if (this.historyFilterStatus === 'protocol-http') {
        items = items.filter(item => item.url.startsWith('http://'));
      }
    }

    // 5. Filter by Visit Count threshold
    if (this.historyVisitThreshold > 0) {
      items = items.filter(item => (item.visitCount || 1) >= this.historyVisitThreshold);
    }

    // Save filtered list
    this.historyFilteredItems = items;

    // 6. Sort items
    const sort = this.historySortMode;
    this.historyFilteredItems.sort((a, b) => {
      if (sort === 'newest') return b.lastVisitTime - a.lastVisitTime;
      if (sort === 'oldest') return a.lastVisitTime - b.lastVisitTime;
      if (sort === 'most-visited') return b.visitCount - a.visitCount;
      if (sort === 'least-visited') return a.visitCount - b.visitCount;
      
      const titleA = a.title || a.url;
      const titleB = b.title || b.url;
      if (sort === 'alphabetical') return titleA.localeCompare(titleB);
      
      const partsA = this.getDomainParts(a.url);
      const partsB = this.getDomainParts(b.url);
      if (sort === 'domain') return partsA.root.localeCompare(partsB.root);
      if (sort === 'subdomain') return partsA.subdomain.localeCompare(partsB.subdomain);
      
      if (sort === 'bookmarks-first') {
        const isBmA = this.bookmarkedUrlsSet.has(a.url) ? 1 : 0;
        const isBmB = this.bookmarkedUrlsSet.has(b.url) ? 1 : 0;
        return isBmB - isBmA || b.lastVisitTime - a.lastVisitTime;
      }
      if (sort === 'blacklisted-first') {
        const isBla = this.isUrlBlacklisted(a.url, this.historyBlacklistRules) ? 1 : 0;
        const isBlb = this.isUrlBlacklisted(b.url, this.historyBlacklistRules) ? 1 : 0;
        return isBlb - isBla || b.lastVisitTime - a.lastVisitTime;
      }
      return b.lastVisitTime - a.lastVisitTime;
    });

    // 7. Update Dashboard Statistics
    this.updateStatsCounters();

    // 8. Flatten into virtual rows based on View Mode
    this.historyRenderRows = [];
    
    if (this.historyFilteredItems.length === 0) {
      // Empty state row
      this.historyRenderRows.push({ type: 'empty_state' });
    } else if (this.historyViewMode === 'list' || this.historyViewMode === 'compact') {
      this.historyRenderRows = this.historyFilteredItems.map((item, idx) => ({
        type: 'item',
        data: item,
        index: idx
      }));
    } else if (this.historyViewMode === 'grid' || this.historyViewMode === 'cards') {
      const cols = this.historyViewMode === 'grid' ? 4 : 3;
      for (let i = 0; i < this.historyFilteredItems.length; i += cols) {
        this.historyRenderRows.push({
          type: 'grid_row',
          items: this.historyFilteredItems.slice(i, i + cols),
          startIndex: i
        });
      }
    } else if (this.historyViewMode === 'timeline') {
      // Group by timeframe sections
      const sections = {
        'Today': [],
        'Yesterday': [],
        'This Week': [],
        'Last Week': [],
        'Last Month': [],
        'Older': []
      };

      this.historyFilteredItems.forEach(item => {
        const age = now - item.lastVisitTime;
        if (item.lastVisitTime >= startOfToday) {
          sections['Today'].push(item);
        } else if (item.lastVisitTime >= startOfYesterday) {
          sections['Yesterday'].push(item);
        } else if (age < 7 * dayMs) {
          sections['This Week'].push(item);
        } else if (age < 14 * dayMs) {
          sections['Last Week'].push(item);
        } else if (age < 30 * dayMs) {
          sections['Last Month'].push(item);
        } else {
          sections['Older'].push(item);
        }
      });

      Object.keys(sections).forEach(label => {
        const sectItems = sections[label];
        if (sectItems.length > 0) {
          const isCollapsed = !this.historyExpandedTimelines.has(label);
          this.historyRenderRows.push({
            type: 'timeline_header',
            label: label,
            count: sectItems.length,
            collapsed: isCollapsed
          });
          if (!isCollapsed) {
            sectItems.forEach((item, idx) => {
              this.historyRenderRows.push({
                type: 'item',
                data: item,
                index: this.historyFilteredItems.indexOf(item)
              });
            });
          }
        }
      });
    } else if (this.historyViewMode === 'grouped') {
      // Group by Domain
      const domainGroups = {};
      this.historyFilteredItems.forEach(item => {
        const parts = this.getDomainParts(item.url);
        if (!domainGroups[parts.root]) {
          domainGroups[parts.root] = {
            domain: parts.root,
            visits: 0,
            subdomains: new Set(),
            items: []
          };
        }
        domainGroups[parts.root].visits += (item.visitCount || 1);
        domainGroups[parts.root].subdomains.add(parts.subdomain);
        domainGroups[parts.root].items.push(item);
      });

      // Sort domain cards by visit counts
      const sortedDomains = Object.values(domainGroups).sort((a, b) => b.visits - a.visits);

      sortedDomains.forEach(grp => {
        const isCollapsed = !this.historyExpandedDomains.has(grp.domain);
        this.historyRenderRows.push({
          type: 'group_header',
          domain: grp.domain,
          count: grp.visits,
          subdomainsCount: grp.subdomains.size,
          collapsed: isCollapsed,
          items: grp.items
        });

        if (!isCollapsed) {
          // Group by subdomain within expanded list
          const subGroups = {};
          grp.items.forEach(item => {
            const parts = this.getDomainParts(item.url);
            if (!subGroups[parts.subdomain]) subGroups[parts.subdomain] = [];
            subGroups[parts.subdomain].push(item);
          });

          Object.keys(subGroups).forEach(sub => {
            this.historyRenderRows.push({
              type: 'subdomain_header',
              subdomain: sub,
              root: grp.domain
            });
            subGroups[sub].forEach(item => {
              this.historyRenderRows.push({
                type: 'item',
                data: item,
                index: this.historyFilteredItems.indexOf(item),
                indent: true
              });
            });
          });
        }
      });
    }

    this.calculateRowOffsets();
    if (this.historyViewport) this.historyViewport.scrollTop = 0;
    this.renderVirtualHistory();
  },

  calculateRowOffsets() {
    this.historyRowOffsets = [];
    let currentOffset = 0;
    this.historyRenderRows.forEach(row => {
      this.historyRowOffsets.push(currentOffset);
      currentOffset += this.getRowHeight(row);
    });
    this.historyTotalHeight = currentOffset;
  },

  getRowHeight(row) {
    if (row.type === 'empty_state') return 300;
    if (row.type === 'group_header') return 80;
    if (row.type === 'subdomain_header') return 32;
    if (row.type === 'timeline_header') return 38;
    if (row.type === 'grid_row') {
      return this.historyViewMode === 'grid' ? 140 : 155;
    }
    // Item row height
    return this.historyViewMode === 'compact' ? 34 : 54;
  },

  findStartIndex(scrollTop) {
    let low = 0, high = this.historyRowOffsets.length - 1;
    while (low <= high) {
      const mid = Math.floor((low + high) / 2);
      if (this.historyRowOffsets[mid] <= scrollTop) {
        if (mid === this.historyRowOffsets.length - 1 || this.historyRowOffsets[mid + 1] > scrollTop) {
          return mid;
        }
        low = mid + 1;
      } else {
        high = mid - 1;
      }
    }
    return 0;
  },

  renderVirtualHistory() {
    const viewport = this.historyViewport;
    if (!viewport) return;
    const scrollTop = viewport.scrollTop;
    const viewportHeight = viewport.clientHeight || 500;

    if (this.historyViewportSpacer) {
      this.historyViewportSpacer.style.height = `${this.historyTotalHeight}px`;
    }

    const startIndex = this.findStartIndex(scrollTop);
    const buffer = 4;
    const renderStart = Math.max(0, startIndex - buffer);
    let renderEnd = renderStart;

    const viewportBottom = scrollTop + viewportHeight;
    while (renderEnd < this.historyRenderRows.length && this.historyRowOffsets[renderEnd] < viewportBottom + 150) {
      renderEnd++;
    }
    renderEnd = Math.min(this.historyRenderRows.length, renderEnd + buffer);

    const contentContainer = this.historyViewportContent;
    if (!contentContainer) return;

    let html = '';
    for (let i = renderStart; i < renderEnd; i++) {
      const row = this.historyRenderRows[i];
      const top = this.historyRowOffsets[i];
      html += this.renderRowHTML(row, top, i);
    }
    contentContainer.innerHTML = html;

    this.bindRenderedRowListeners();
  },

  renderRowHTML(row, top, rowIndex) {
    const style = `position: absolute; top: 0; left: 0; right: 0; transform: translateY(${top}px); height: ${this.getRowHeight(row)}px;`;
    
    if (row.type === 'empty_state') {
      return `
        <div class="history-empty-state" style="${style}">
          <span class="empty-state-icon">🔍</span>
          <span class="empty-state-title">No History Found</span>
          <span style="font-size: 13px;">No history records match your search or filter settings.</span>
        </div>
      `;
    }

    if (row.type === 'timeline_header') {
      const arrowClass = row.collapsed ? 'collapsed' : '';
      return `
        <div class="history-header-row timeline-hdr" data-label="${row.label}" style="${style}">
          <span class="history-header-arrow ${arrowClass}">▼</span>
          <span>${row.label}</span>
          <span class="history-header-meta">${row.count} visits</span>
        </div>
      `;
    }

    if (row.type === 'group_header') {
      const arrowClass = row.collapsed ? 'collapsed' : '';
      const cleanDomain = row.domain;
      const faviconUrl = `https://www.google.com/s2/favicons?sz=32&domain=${cleanDomain}`;
      return `
        <div class="history-header-row domain-group-card" data-domain="${row.domain}" style="${style} padding: 12px 16px; display: flex; flex-direction: row; align-items: center; gap: 15px; border-bottom: 1px solid rgba(255,255,255,0.06); font-size: 13px;">
          <span class="history-header-arrow ${arrowClass}" style="font-size: 11px;">▼</span>
          <div class="history-row-favicon" style="width: 24px; height: 24px;">
            <img src="${faviconUrl}" onerror="this.src='../icons/icon16.png'" style="width: 20px; height: 20px;">
          </div>
          <div style="display: flex; flex-direction: column; flex-grow: 1; min-width: 0; gap: 2px;">
            <span class="domain-group-name" style="font-size: 14px; font-weight: 700; color: #fff;">${row.domain}</span>
            <span style="font-size: 11.5px; color: var(--text-muted);">${row.count} visits &bull; ${row.subdomainsCount} subdomains</span>
          </div>
          <div class="domain-group-actions" style="margin-left: auto; display: flex; gap: 8px;">
            <button class="btn btn-secondary btn-small grp-bookmark-btn" data-domain="${row.domain}" style="padding: 4px 8px; font-size: 11px; display: flex; align-items: center; gap: 4px;"><i class="fi fi-rr-bookmark"></i> Bookmark All</button>
            <button class="btn btn-secondary btn-small grp-blacklist-btn" data-domain="${row.domain}" style="padding: 4px 8px; font-size: 11px; display: flex; align-items: center; gap: 4px; color: var(--color-danger);"><i class="fi fi-rr-ban"></i> Blacklist</button>
            <button class="btn btn-secondary btn-small grp-delete-btn" data-domain="${row.domain}" style="padding: 4px 8px; font-size: 11px; display: flex; align-items: center; gap: 4px;"><i class="fi fi-rr-trash"></i> Delete</button>
          </div>
        </div>
      `;
    }

    if (row.type === 'subdomain_header') {
      const leftPad = '32px';
      return `
        <div class="history-header-row subdomain-hdr" style="${style} padding-left: ${leftPad}; background: transparent; border-bottom: none; font-size: 11.5px; font-weight: 500; color: #a855f7; pointer-events: none;">
          <i class="fi fi-rr-subtitles" style="margin-right: 6px; font-size: 10px;"></i>
          <span>${row.subdomain}</span>
        </div>
      `;
    }

    if (row.type === 'grid_row') {
      let cardsHtml = '';
      row.items.forEach((item, colIdx) => {
        const idxInList = row.startIndex + colIdx;
        const cleanDomain = this.getDomainParts(item.url).root;
        const faviconUrl = `https://www.google.com/s2/favicons?sz=32&domain=${cleanDomain}`;
        const isSelected = this.historySelectedUrls.has(item.url) ? 'selected' : '';
        const isBookmarked = this.bookmarkedUrlsSet.has(item.url) ? '💎' : '';
        
        cardsHtml += `
          <div class="grid-card ${isSelected}" data-url="${item.url}" data-index="${idxInList}">
            <div class="grid-card-header">
              <div class="history-row-favicon">
                <img src="${faviconUrl}" onerror="this.src='../icons/icon16.png'">
              </div>
              <span class="grid-card-title" title="${item.title || item.url}">${this.highlightSearchText(item.title || item.url, this.historySearchQuery)}</span>
              <span style="font-size: 11px; margin-left: auto;">${isBookmarked}</span>
            </div>
            <div class="grid-card-url">${item.url}</div>
            <div class="grid-card-footer">
              <span>Visits: ${item.visitCount || 1}</span>
              <span>${this.formatRelativeTime(item.lastVisitTime)}</span>
            </div>
          </div>
        `;
      });
      return `
        <div class="history-grid-row" style="${style}">
          ${cardsHtml}
        </div>
      `;
    }

    if (row.type === 'item') {
      const item = row.data;
      const isSelected = this.historySelectedUrls.has(item.url) ? 'selected' : '';
      const isChecked = this.historySelectedUrls.has(item.url) ? 'checked' : '';
      const indentClass = row.indent ? 'style="padding-left: 45px;"' : '';
      const parts = this.getDomainParts(item.url);
      const faviconUrl = `https://www.google.com/s2/favicons?sz=32&domain=${parts.root}`;
      const isBookmarked = this.bookmarkedUrlsSet.has(item.url);
      const compactClass = this.historyViewMode === 'compact' ? 'compact' : '';

      return `
        <div class="history-row ${isSelected} ${compactClass}" data-url="${item.url}" data-index="${row.index}" ${indentClass} style="${style}">
          <input type="checkbox" class="history-row-checkbox" ${isChecked} onclick="event.stopPropagation()">
          <div class="history-row-favicon">
            <img src="${faviconUrl}" onerror="this.src='../icons/icon16.png'">
          </div>
          <div class="history-row-details">
            <div class="history-row-title-container">
              <span class="history-row-title" title="${item.title || item.url}">${this.highlightSearchText(item.title || item.url, this.historySearchQuery)}</span>
              ${isBookmarked ? '<span class="history-row-domain-badge" style="background: rgba(99,102,241,0.15); color: #818cf8; display: flex; align-items: center; gap: 3px;"><i class="fi fi-sr-bookmark" style="font-size: 8px;"></i> Bookmarked</span>' : ''}
              <span class="history-row-domain-badge">${parts.subdomain}</span>
            </div>
            ${this.historyViewMode !== 'compact' ? `<div class="history-row-url">${this.highlightSearchText(item.url, this.historySearchQuery)}</div>` : ''}
          </div>
          <div class="history-row-meta">
            <span>${item.visitCount || 1} visits</span>
            <span>&bull;</span>
            <span>${this.formatRelativeTime(item.lastVisitTime)}</span>
          </div>
          <div class="history-row-actions" onclick="event.stopPropagation()">
            <button class="history-row-btn row-open-btn" title="Open page"><i class="fi fi-rr-external-link"></i></button>
            <button class="history-row-btn row-bookmark-btn" title="${isBookmarked ? 'Already Bookmarked' : 'Add to Bookmarks'}">${isBookmarked ? '★' : '☆'}</button>
            <button class="history-row-btn danger row-delete-btn" title="Delete from History"><i class="fi fi-rr-trash"></i></button>
            <button class="history-row-btn row-more-btn" title="More Actions"><i class="fi fi-rr-menu-dots-vertical"></i></button>
          </div>
        </div>
      `;
    }

    return '';
  },

  bindRenderedRowListeners() {
    const contentContainer = this.historyViewportContent;
    if (!contentContainer) return;

    // 1. Collapsible Group and Timeline Headers
    contentContainer.querySelectorAll('.timeline-hdr').forEach(hdr => {
      hdr.addEventListener('click', (e) => {
        const label = e.currentTarget.dataset.label;
        if (this.historyExpandedTimelines.has(label)) {
          this.historyExpandedTimelines.delete(label);
        } else {
          this.historyExpandedTimelines.add(label);
        }
        chrome.storage.local.set({ 'history_expanded_timelines': Array.from(this.historyExpandedTimelines) });
        this.processHistoryData();
      });
    });

    contentContainer.querySelectorAll('.domain-group-card').forEach(hdr => {
      // Toggle expand on clicking card (but not buttons)
      hdr.addEventListener('click', (e) => {
        if (e.target.closest('.btn')) return;
        const dom = e.currentTarget.dataset.domain;
        if (this.historyExpandedDomains.has(dom)) {
          this.historyExpandedDomains.delete(dom);
        } else {
          this.historyExpandedDomains.add(dom);
        }
        this.processHistoryData();
      });
      
      // Group Actions
      hdr.querySelector('.grp-bookmark-btn').addEventListener('click', (e) => {
        const domain = e.currentTarget.dataset.domain;
        const grp = this.historyFilteredItems.filter(item => this.getDomainParts(item.url).root === domain);
        this.bookmarkUrlsList(grp.map(i => i.url));
      });
      
      hdr.querySelector('.grp-blacklist-btn').addEventListener('click', (e) => {
        const domain = e.currentTarget.dataset.domain;
        const reason = `Blacklisted domain group: ${domain}`;
        this.addBlacklistRule('domain', domain, reason);
      });
      
      hdr.querySelector('.grp-delete-btn').addEventListener('click', (e) => {
        const domain = e.currentTarget.dataset.domain;
        const grp = this.historyFilteredItems.filter(item => this.getDomainParts(item.url).root === domain);
        const confirmDelete = confirm(`Are you sure you want to delete all ${grp.length} history items under ${domain}?`);
        if (!confirmDelete) return;
        
        let done = 0;
        grp.forEach(item => {
          chrome.history.deleteUrl({ url: item.url }, () => {
            done++;
            if (done === grp.length) {
              showToast(`History under ${domain} deleted!`, 'success');
              this.allRawHistoryItems = null; // invalidate cache
              this.loadHistory(this.historySearchQuery);
            }
          });
        });
      });
    });

    // 2. Selection logic for Row items
    contentContainer.querySelectorAll('.history-row').forEach(row => {
      row.addEventListener('click', (e) => {
        const idx = parseInt(row.dataset.index);
        const url = row.dataset.url;
        this.handleHistoryRowClick(e, url, idx);
      });

      row.addEventListener('contextmenu', (e) => {
        const idx = parseInt(row.dataset.index);
        const url = row.dataset.url;
        this.handleHistoryRowRightClick(e, url, idx);
      });

      row.querySelector('.history-row-checkbox').addEventListener('change', (e) => {
        const url = row.dataset.url;
        this.toggleHistorySelection(url);
      });

      // Actions buttons
      row.querySelector('.row-open-btn').addEventListener('click', (e) => {
        const url = row.dataset.url;
        window.open(url, '_blank');
      });

      row.querySelector('.row-bookmark-btn').addEventListener('click', (e) => {
        const url = row.dataset.url;
        const item = this.historyFilteredItems.find(i => i.url === url);
        if (this.bookmarkedUrlsSet.has(url)) {
          showToast('URL is already bookmarked!', 'error');
          return;
        }
        chrome.bookmarks.create({
          parentId: '1', // default to bookmark bar
          title: item ? (item.title || item.url) : url,
          url: url
        }, () => {
          showToast('Added to bookmarks!', 'success');
          this.bookmarkedUrlsSet.add(url);
          this.renderVirtualHistory();
        });
      });

      row.querySelector('.row-delete-btn').addEventListener('click', (e) => {
        const url = row.dataset.url;
        chrome.history.deleteUrl({ url: url }, () => {
          showToast('History item removed!', 'success');
          this.allRawHistoryItems = null; // force reload cache
          this.loadHistory(this.historySearchQuery);
        });
      });

      row.querySelector('.row-more-btn').addEventListener('click', (e) => {
        const url = row.dataset.url;
        const rect = e.currentTarget.getBoundingClientRect();
        this.showHistoryContextMenu({ clientX: rect.left, clientY: rect.bottom }, url);
      });
    });

    // 3. Grid card selections
    contentContainer.querySelectorAll('.grid-card').forEach(card => {
      card.addEventListener('click', (e) => {
        const idx = parseInt(card.dataset.index);
        const url = card.dataset.url;
        this.handleHistoryRowClick(e, url, idx);
      });
      card.addEventListener('contextmenu', (e) => {
        const idx = parseInt(card.dataset.index);
        const url = card.dataset.url;
        this.handleHistoryRowRightClick(e, url, idx);
      });
    });
  },

  handleHistoryRowClick(e, itemUrl, idx) {
    if (e.shiftKey && this.historyLastClickedIndex !== null) {
      // Range selection
      const start = Math.min(this.historyLastClickedIndex, idx);
      const end = Math.max(this.historyLastClickedIndex, idx);
      
      const itemsToSelect = this.historyFilteredItems.slice(start, end + 1);
      itemsToSelect.forEach(i => this.historySelectedUrls.add(i.url));
    } else if (e.ctrlKey || e.metaKey) {
      // Multi-select toggle
      this.toggleHistorySelection(itemUrl);
    } else {
      // Single click selects/highlights and opens details sidebar
      this.historySelectedUrls.clear();
      this.historySelectedUrls.add(itemUrl);
      this.showDomainDetails(itemUrl);
    }
    
    this.historyLastClickedIndex = idx;
    this.updateHistorySelectionBar();
    this.renderVirtualHistory();
  },

  handleHistoryRowRightClick(e, itemUrl, idx) {
    e.preventDefault();
    this.historySelectedUrls.clear();
    this.historySelectedUrls.add(itemUrl);
    this.historyLastClickedIndex = idx;
    this.updateHistorySelectionBar();
    this.renderVirtualHistory();
    this.showHistoryContextMenu(e, itemUrl);
  },

  showHistoryContextMenu(e, itemUrl) {
    this.hideHistoryContextMenu();
    const item = this.historyFilteredItems.find(i => i.url === itemUrl);
    const parts = this.getDomainParts(itemUrl);
    
    this.createContextMenu();
    this.contextMenu.style.left = `${e.clientX}px`;
    this.contextMenu.style.top = `${e.clientY}px`;
    this.contextMenu.classList.remove('hidden');

    this.contextMenu.innerHTML = `
      <button class="context-menu-item" id="ctx-open"><i class="fi fi-rr-external-link"></i> Open Page</button>
      <button class="context-menu-item" id="ctx-open-tab"><i class="fi fi-rr-tab"></i> Open in New Tab</button>
      <button class="context-menu-item" id="ctx-bookmark"><i class="fi fi-rr-bookmark"></i> Bookmark URL</button>
      <div class="context-menu-separator"></div>
      <button class="context-menu-item" id="ctx-blacklist-url"><i class="fi fi-rr-ban"></i> Blacklist URL</button>
      <button class="context-menu-item" id="ctx-blacklist-domain"><i class="fi fi-rr-lock"></i> Blacklist Domain</button>
      <div class="context-menu-separator"></div>
      <button class="context-menu-item" id="ctx-copy-url"><i class="fi fi-rr-copy"></i> Copy URL</button>
      <button class="context-menu-item" id="ctx-copy-title"><i class="fi fi-rr-document"></i> Copy Title</button>
      <button class="context-menu-item" id="ctx-inspect"><i class="fi fi-rr-stats"></i> Inspect Details</button>
      <div class="context-menu-separator"></div>
      <button class="context-menu-item danger" id="ctx-delete"><i class="fi fi-rr-trash"></i> Delete URL</button>
    `;

    // Context Listeners
    document.getElementById('ctx-open').addEventListener('click', () => window.open(itemUrl, '_blank'));
    document.getElementById('ctx-open-tab').addEventListener('click', () => window.open(itemUrl, '_blank'));
    document.getElementById('ctx-bookmark').addEventListener('click', () => {
      chrome.bookmarks.create({ parentId: '1', title: item ? (item.title || item.url) : itemUrl, url: itemUrl }, () => {
        showToast('Page Bookmarked!', 'success');
        this.bookmarkedUrlsSet.add(itemUrl);
        this.renderVirtualHistory();
      });
    });
    document.getElementById('ctx-blacklist-url').addEventListener('click', () => {
      this.addBlacklistRule('url', itemUrl, `User blacklisted URL: ${itemUrl}`);
    });
    document.getElementById('ctx-blacklist-domain').addEventListener('click', () => {
      this.addBlacklistRule('domain', parts.root, `User blacklisted domain: ${parts.root}`);
    });
    document.getElementById('ctx-copy-url').addEventListener('click', () => {
      navigator.clipboard.writeText(itemUrl);
      showToast('URL copied to clipboard!', 'success');
    });
    document.getElementById('ctx-copy-title').addEventListener('click', () => {
      navigator.clipboard.writeText(item ? (item.title || itemUrl) : itemUrl);
      showToast('Title copied to clipboard!', 'success');
    });
    document.getElementById('ctx-inspect').addEventListener('click', () => {
      this.showDomainDetails(itemUrl);
    });
    document.getElementById('ctx-delete').addEventListener('click', () => {
      chrome.history.deleteUrl({ url: itemUrl }, () => {
        showToast('History item deleted!', 'success');
        this.allRawHistoryItems = null;
        this.loadHistory(this.historySearchQuery);
      });
    });
  },

  hideHistoryContextMenu() {
    if (this.contextMenu) this.contextMenu.classList.add('hidden');
  },

  toggleHistorySelection(url) {
    if (this.historySelectedUrls.has(url)) {
      this.historySelectedUrls.delete(url);
    } else {
      this.historySelectedUrls.add(url);
    }
  },

  updateHistorySelectionBar() {
    const count = this.historySelectedUrls.size;
    if (this.historySelectionBar && this.historySelectionCount) {
      this.historySelectionCount.textContent = `${count} items selected`;
      this.historySelectionBar.classList.toggle('visible', count > 0);
    }
  },

  bookmarkUrlsList(urls) {
    let created = 0;
    urls.forEach(url => {
      const item = this.historyFilteredItems.find(i => i.url === url);
      chrome.bookmarks.create({
        parentId: '1',
        title: item ? (item.title || item.url) : url,
        url: url
      }, () => {
        created++;
        this.bookmarkedUrlsSet.add(url);
        if (created === urls.length) {
          showToast(`Successfully bookmarked ${created} pages!`, 'success');
          this.renderVirtualHistory();
        }
      });
    });
  },

  bookmarkSelectedUrls() {
    const urls = Array.from(this.historySelectedUrls);
    if (urls.length === 0) return;
    this.bookmarkUrlsList(urls);
    this.clearHistorySelection();
  },

  deleteSelectedUrls() {
    const urls = Array.from(this.historySelectedUrls);
    if (urls.length === 0) return;
    const confirmDelete = confirm(`Are you sure you want to delete the ${urls.length} selected history items?`);
    if (!confirmDelete) return;

    let deleted = 0;
    urls.forEach(url => {
      chrome.history.deleteUrl({ url: url }, () => {
        deleted++;
        if (deleted === urls.length) {
          showToast(`Deleted ${deleted} items from history!`, 'success');
          this.allRawHistoryItems = null; // force cache reload
          this.clearHistorySelection();
          this.loadHistory(this.historySearchQuery);
        }
      });
    });
  },

  blacklistSelectedUrls() {
    const urls = Array.from(this.historySelectedUrls);
    if (urls.length === 0) return;
    
    const choice = prompt("Blacklist options:\nType 'domain' to blacklist the root domains.\nType 'url' to blacklist the exact URLs.\nType 'subdomain' to blacklist subdomains.", "domain");
    if (!choice) return;
    
    const rulesToAdd = [];
    urls.forEach(url => {
      const parts = this.getDomainParts(url);
      if (choice === 'domain') {
        rulesToAdd.push({ type: 'domain', pattern: parts.root, reason: 'Batch blacklisted domains' });
      } else if (choice === 'subdomain') {
        rulesToAdd.push({ type: 'subdomain', pattern: parts.subdomain, reason: 'Batch blacklisted subdomains' });
      } else {
        rulesToAdd.push({ type: 'url', pattern: url, reason: 'Batch blacklisted URLs' });
      }
    });

    // Add unique rules
    chrome.storage.local.get(['history_blacklist_rules'], (res) => {
      const rules = res.history_blacklist_rules || [];
      let addedCount = 0;
      
      rulesToAdd.forEach(r => {
        if (!rules.some(old => old.type === r.type && old.pattern === r.pattern)) {
          r.id = 'bl_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5);
          r.addedDate = Date.now();
          rules.push(r);
          addedCount++;
        }
      });

      if (addedCount > 0) {
        chrome.storage.local.set({ 'history_blacklist_rules': rules }, () => {
          showToast(`Added ${addedCount} rules to blacklist!`, 'success');
          this.syncBlacklistWithSettings(rules);
          this.clearHistorySelection();
        });
      }
    });
  },

  exportSelectedUrls() {
    const urls = Array.from(this.historySelectedUrls);
    if (urls.length === 0) return;
    const exportItems = this.historyFilteredItems.filter(i => urls.includes(i.url));
    this.exportHistory(exportItems);
  },

  exportHistory(items) {
    if (!items || items.length === 0) {
      showToast('No history items to export!', 'error');
      return;
    }
    const jsonStr = JSON.stringify(items, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `history_export_${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showToast(`Exported ${items.length} items successfully!`, 'success');
  },

  clearAllHistory() {
    if (confirm('Are you sure you want to clear all history? This will delete all history items from your browser.')) {
      chrome.history.deleteAll(() => {
        showToast('All browser history cleared!', 'success');
        this.allRawHistoryItems = null;
        this.loadHistory(this.historySearchQuery);
      });
    }
  },

  copySelectedUrls() {
    const urls = Array.from(this.historySelectedUrls);
    if (urls.length === 0) return;
    navigator.clipboard.writeText(urls.join('\n'));
    showToast(`${urls.length} URLs copied to clipboard!`, 'success');
    this.clearHistorySelection();
  },

  clearHistorySelection() {
    this.historySelectedUrls.clear();
    this.historyLastClickedIndex = null;
    this.updateHistorySelectionBar();
    this.renderVirtualHistory();
  },

  loadBlacklistRules() {
    chrome.storage.local.get(['history_blacklist_rules'], (res) => {
      this.historyBlacklistRules = res.history_blacklist_rules || [];
      
      if (this.blacklistRulesTableBody) {
        const searchQuery = (document.getElementById('blacklist-search-input')?.value || '').trim().toLowerCase();
        const filterType = this.blacklistFilterType || 'all';

        // Filter rules locally
        const filteredRules = this.historyBlacklistRules.filter(rule => {
          const matchSearch = rule.pattern.toLowerCase().includes(searchQuery) || (rule.reason || '').toLowerCase().includes(searchQuery);
          const matchType = filterType === 'all' || rule.type === filterType;
          return matchSearch && matchType;
        });

        if (filteredRules.length === 0) {
          this.blacklistRulesTableBody.innerHTML = `
            <tr>
              <td colspan="7" style="text-align: center; color: var(--text-muted); padding: 24px;">No blacklist rules found.</td>
            </tr>
          `;
          return;
        }

        let html = '';
        filteredRules.forEach(rule => {
          const typeBadge = `<span class="blacklist-badge ${rule.type}">${rule.type.toUpperCase()}</span>`;
          const behaviorBadge = `<span class="blacklist-behavior-badge ${rule.behavior || 'hide'}">${(rule.behavior || 'hide').replace('-', ' ')}</span>`;
          const dateStr = new Date(rule.addedDate).toLocaleDateString();

          // Calculate blocked entries and subdomains count from loaded raw history
          let blockedEntriesCount = 0;
          const blockedSubdomainsSet = new Set();
          
          (this.allRawHistoryItems || []).forEach(item => {
            const parts = this.getDomainParts(item.url);
            let matches = false;
            if (rule.type === 'domain') {
              matches = parts.root === rule.pattern || parts.root.endsWith('.' + rule.pattern);
            } else if (rule.type === 'subdomain') {
              matches = parts.subdomain === rule.pattern;
            } else if (rule.type === 'url') {
              matches = item.url === rule.pattern;
            }
            
            if (matches) {
              blockedEntriesCount += (item.visitCount || 1);
              if (parts.subdomain) {
                blockedSubdomainsSet.add(parts.subdomain);
              }
            }
          });

          const blockedSubdomainsCount = rule.type === 'domain' ? blockedSubdomainsSet.size : 0;

          html += `
            <tr data-id="${rule.id}">
              <td style="word-break: break-all; font-family: monospace; font-size: 12.5px; color: #fff;">${rule.pattern}</td>
              <td>${typeBadge}</td>
              <td>${behaviorBadge}</td>
              <td style="text-align: center; font-weight: 600; color: var(--text-muted);">${blockedEntriesCount}</td>
              <td style="text-align: center; font-weight: 600; color: var(--text-muted);">${blockedSubdomainsCount}</td>
              <td style="font-size: 11.5px; color: var(--text-muted);">${dateStr}</td>
              <td style="text-align: center;">
                <div style="display: flex; gap: 4px; justify-content: center;">
                  <button class="btn btn-secondary btn-small edit-rule-btn" data-id="${rule.id}" style="padding: 4px 6px; font-size: 11px;" title="Edit Rule"><i class="fi fi-rr-edit"></i></button>
                  <button class="btn btn-danger btn-small remove-rule-btn" data-id="${rule.id}" style="padding: 4px 6px; font-size: 11px;" title="Delete Rule"><i class="fi fi-rr-trash"></i></button>
                </div>
              </td>
            </tr>
          `;
        });
        this.blacklistRulesTableBody.innerHTML = html;

        // Bind event listeners
        this.blacklistRulesTableBody.querySelectorAll('.remove-rule-btn').forEach(btn => {
          btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const ruleId = btn.dataset.id;
            this.removeBlacklistRule(ruleId);
          });
        });

        this.blacklistRulesTableBody.querySelectorAll('.edit-rule-btn').forEach(btn => {
          btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const ruleId = btn.dataset.id;
            const rule = this.historyBlacklistRules.find(r => r.id === ruleId);
            if (rule) {
              const newReason = prompt('Edit blacklist reason:', rule.reason);
              if (newReason === null) return; // user cancelled
              const newBehavior = prompt('Edit behavior ("hide", "delete-existing", "never-store"):', rule.behavior || 'hide');
              if (newBehavior === null) return;
              if (!['hide', 'delete-existing', 'never-store'].includes(newBehavior)) {
                showToast('Invalid behavior value! Use "hide", "delete-existing", or "never-store".', 'error');
                return;
              }
              this.editBlacklistRule(ruleId, newReason, newBehavior);
            }
          });
        });
      }
    });
  },

  addBlacklistRule(type, pattern, reason, behavior = 'hide') {
    chrome.storage.local.get(['history_blacklist_rules'], (res) => {
      const rules = res.history_blacklist_rules || [];
      if (rules.some(r => r.type === type && r.pattern === pattern)) {
        showToast('Rule already exists!', 'error');
        return;
      }

      const newRule = {
        id: 'bl_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
        type: type,
        pattern: pattern,
        reason: reason || 'Manual blacklist entry',
        behavior: behavior,
        addedDate: Date.now()
      };
      
      rules.push(newRule);
      chrome.storage.local.set({ 'history_blacklist_rules': rules }, () => {
        showToast('Blacklist rule created!', 'success');
        
        // Delete matching existing history items immediately if behavior is delete-existing or never-store
        if (behavior === 'delete-existing' || behavior === 'never-store') {
          const matchingItems = (this.allRawHistoryItems || []).filter(item => {
            const parts = this.getDomainParts(item.url);
            if (type === 'domain') {
              return parts.root === pattern || parts.root.endsWith('.' + pattern);
            } else if (type === 'subdomain') {
              return parts.subdomain === pattern;
            } else if (type === 'url') {
              return item.url === pattern;
            }
            return false;
          });

          matchingItems.forEach(item => {
            chrome.history.deleteUrl({ url: item.url });
          });
          
          this.allRawHistoryItems = null; // force reload history
          this.loadHistory(this.historySearchQuery);
        }

        // Clean fields
        const patternInput = document.getElementById('blacklist-add-pattern');
        const reasonInput = document.getElementById('blacklist-add-reason');
        if (patternInput) patternInput.value = '';
        if (reasonInput) reasonInput.value = '';

        this.syncBlacklistWithSettings(rules);
        this.loadBlacklistRules();
      });
    });
  },

  removeBlacklistRule(id) {
    chrome.storage.local.get(['history_blacklist_rules'], (res) => {
      let rules = res.history_blacklist_rules || [];
      rules = rules.filter(r => r.id !== id);
      
      chrome.storage.local.set({ 'history_blacklist_rules': rules }, () => {
        showToast('Blacklist rule deleted!', 'success');
        this.syncBlacklistWithSettings(rules);
        this.loadBlacklistRules();
        this.allRawHistoryItems = null; // force reload history
        this.loadHistory(this.historySearchQuery);
      });
    });
  },

  editBlacklistRule(id, newReason, newBehavior) {
    chrome.storage.local.get(['history_blacklist_rules'], (res) => {
      const rules = res.history_blacklist_rules || [];
      const rule = rules.find(r => r.id === id);
      if (rule) {
        rule.reason = newReason;
        rule.behavior = newBehavior;
        
        chrome.storage.local.set({ 'history_blacklist_rules': rules }, () => {
          showToast('Blacklist rule updated!', 'success');
          this.syncBlacklistWithSettings(rules);
          this.loadBlacklistRules();
          
          if (newBehavior === 'delete-existing' || newBehavior === 'never-store') {
            this.allRawHistoryItems = null; // force reload history
            this.loadHistory(this.historySearchQuery);
          }
        });
      }
    });
  },

  syncBlacklistWithSettings(rules) {
    chrome.storage.local.get(['organizer_user_settings'], (result) => {
      const settings = result.organizer_user_settings || {};
      
      // Legacy settings sync (only stores domain name format strings in comma separation)
      const domains = rules
        .map(r => {
          if (r.type === 'domain' || r.type === 'subdomain') return r.pattern;
          try {
            return new URL(r.pattern).hostname.replace(/^www\./, '');
          } catch(e) {
            return '';
          }
        })
        .filter(Boolean);
      
      settings.historyBlacklist = Array.from(new Set(domains)).join(', ');
      chrome.storage.local.set({ 'organizer_user_settings': settings }, () => {
        // Run background deleted calls
        rules.forEach(rule => this.applyBlacklistRuleDeletion(rule));
      });
    });
  },

  applyBlacklistRuleDeletion(rule) {
    // Delete matches from Chrome history
    chrome.history.search({ text: rule.pattern, maxResults: 5000 }, (historyItems) => {
      historyItems.forEach(item => {
        let isMatch = false;
        const parts = this.getDomainParts(item.url);
        
        if (rule.type === 'domain') {
          isMatch = (parts.root === rule.pattern || parts.root.endsWith('.' + rule.pattern));
        } else if (rule.type === 'subdomain') {
          isMatch = (parts.subdomain === rule.pattern);
        } else if (rule.type === 'url') {
          isMatch = (item.url === rule.pattern);
        }

        if (isMatch) {
          chrome.history.deleteUrl({ url: item.url });
        }
      });
    });
  },

  showDomainDetails(itemUrl) {
    if (!this.historyDetailsPanel) return;
    
    const item = this.historyFilteredItems.find(i => i.url === itemUrl);
    if (!item) return;
    
    const parts = this.getDomainParts(itemUrl);
    const domainItems = this.allRawHistoryItems.filter(i => this.getDomainParts(i.url).root === parts.root);
    const subdomainItems = this.allRawHistoryItems.filter(i => this.getDomainParts(i.url).subdomain === parts.subdomain);
    const subdomainsCount = new Set(domainItems.map(i => this.getDomainParts(i.url).subdomain)).size;
    const isBookmarked = this.bookmarkedUrlsSet.has(itemUrl);

    // Timeline SVG chart
    const timelineChartHtml = this.renderTimelineChart(domainItems);

    this.historyDetailsPanel.classList.remove('hidden');
    this.historyDetailsPanel.innerHTML = `
      <button class="details-close-btn" id="close-history-details-btn">✕ Close</button>
      <div style="display: flex; align-items: center; gap: 10px; margin-top: 10px;">
        <img src="https://www.google.com/s2/favicons?sz=32&domain=${parts.root}" onerror="this.src='../icons/icon16.png'" style="width: 24px; height: 24px; border-radius: 4px;">
        <span class="details-title">${parts.root}</span>
      </div>

      <div class="details-section" style="margin-top: 15px;">
        <span class="details-label">Selected Title</span>
        <span class="details-value" style="font-weight: 600;">${item.title || 'No Title'}</span>
      </div>

      <div class="details-section">
        <span class="details-label">Selected URL</span>
        <a href="${item.url}" target="_blank" class="details-value" style="color: var(--color-primary); text-decoration: underline;">${item.url}</a>
      </div>

      <div class="details-section">
        <span class="details-label">Subdomain</span>
        <span class="details-value">${parts.subdomain}</span>
      </div>

      <div class="details-section" style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; background: rgba(0,0,0,0.15); padding: 10px; border-radius: 8px; border: 1px solid rgba(255,255,255,0.03);">
        <div>
          <span class="details-label" style="font-size: 9px;">Root Visits</span>
          <span style="font-size: 14px; font-weight: 700; color: #fff; display: block; margin-top: 2px;">${domainItems.reduce((acc, i) => acc + (i.visitCount || 1), 0)}</span>
        </div>
        <div>
          <span class="details-label" style="font-size: 9px;">Subdomains</span>
          <span style="font-size: 14px; font-weight: 700; color: #fff; display: block; margin-top: 2px;">${subdomainsCount}</span>
        </div>
        <div>
          <span class="details-label" style="font-size: 9px;">URL Visits</span>
          <span style="font-size: 14px; font-weight: 700; color: #fff; display: block; margin-top: 2px;">${item.visitCount || 1}</span>
        </div>
        <div>
          <span class="details-label" style="font-size: 9px;">Bookmarked</span>
          <span style="font-size: 13px; font-weight: 600; color: ${isBookmarked ? '#10b981' : '#f43f5e'}; display: block; margin-top: 2px;">${isBookmarked ? 'Yes' : 'No'}</span>
        </div>
      </div>

      <div class="details-section">
        <span class="details-label">Timeline visits (Last 7 days)</span>
        <div style="margin-top: 5px;">
          ${timelineChartHtml}
        </div>
      </div>

      <div class="details-section" style="margin-top: 10px;">
        <span class="details-label">First Visited</span>
        <span class="details-value" style="font-size: 11.5px; color: var(--text-muted);">${item.firstVisitTime ? new Date(item.firstVisitTime).toLocaleString() : 'N/A'}</span>
      </div>

      <div class="details-section">
        <span class="details-label">Last Visited</span>
        <span class="details-value" style="font-size: 11.5px; color: var(--text-muted);">${new Date(item.lastVisitTime).toLocaleString()}</span>
      </div>

      <div style="display: flex; flex-direction: column; gap: 8px; margin-top: auto; padding-top: 15px;">
        <button class="btn btn-secondary btn-small" id="details-action-bookmark" style="width: 100%; display: flex; align-items: center; justify-content: center; gap: 6px;"><i class="fi fi-rr-bookmark"></i> Bookmark URL</button>
        <button class="btn btn-secondary btn-small" id="details-action-blacklist" style="width: 100%; display: flex; align-items: center; justify-content: center; gap: 6px; color: var(--color-danger);"><i class="fi fi-rr-ban"></i> Blacklist Domain</button>
        <button class="btn btn-danger btn-small" id="details-action-delete" style="width: 100%; display: flex; align-items: center; justify-content: center; gap: 6px;"><i class="fi fi-rr-trash"></i> Delete URL</button>
      </div>
    `;

    // Details actions events
    document.getElementById('close-history-details-btn').addEventListener('click', () => {
      this.historyDetailsPanel.classList.add('hidden');
    });

    document.getElementById('details-action-bookmark').addEventListener('click', () => {
      if (this.bookmarkedUrlsSet.has(itemUrl)) {
        showToast('URL is already bookmarked!', 'error');
        return;
      }
      chrome.bookmarks.create({ parentId: '1', title: item.title || itemUrl, url: itemUrl }, () => {
        showToast('Bookmarked URL!', 'success');
        this.bookmarkedUrlsSet.add(itemUrl);
        this.renderVirtualHistory();
      });
    });

    document.getElementById('details-action-blacklist').addEventListener('click', () => {
      const reason = `Blacklisted domain: ${parts.root}`;
      this.addBlacklistRule('domain', parts.root, reason);
      this.historyDetailsPanel.classList.add('hidden');
    });

    document.getElementById('details-action-delete').addEventListener('click', () => {
      chrome.history.deleteUrl({ url: itemUrl }, () => {
        showToast('History item deleted!', 'success');
        this.historyDetailsPanel.classList.add('hidden');
        this.allRawHistoryItems = null;
        this.loadHistory(this.historySearchQuery);
      });
    });
  },

  renderTimelineChart(domainItems) {
    const days = Array(7).fill(0);
    const now = Date.now();
    const dayMs = 24 * 60 * 60 * 1000;
    
    // Get start of today (midnight) local time
    const d = new Date(now);
    d.setHours(0, 0, 0, 0);
    const startOfToday = d.getTime();
    
    domainItems.forEach(item => {
      // Calculate how many days ago it was relative to start of today
      const diff = startOfToday - item.lastVisitTime;
      let dayIndex = 6;
      if (item.lastVisitTime >= startOfToday) {
        dayIndex = 0; // Today
      } else if (diff >= 0) {
        dayIndex = 1 + Math.floor(diff / dayMs); // 1 = Yesterday, 2 = 2 days ago etc.
      }
      
      if (dayIndex >= 0 && dayIndex < 7) {
        days[6 - dayIndex] += (item.visitCount || 1);
      }
    });

    const maxVal = Math.max(...days, 1);
    const points = days.map((val, idx) => {
      const x = (idx / 6) * 100; // width 100
      const y = 35 - (val / maxVal) * 30; // height 35
      return `${x},${y}`;
    });

    return `
      <svg viewBox="0 0 100 40" class="timeline-svg" style="width: 100%; height: 50px; overflow: visible;">
        <defs>
          <linearGradient id="chartGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="#6366f1" stop-opacity="0.3"/>
            <stop offset="100%" stop-color="#6366f1" stop-opacity="0"/>
          </linearGradient>
        </defs>
        <path d="M 0,35 L ${points.join(' L ')} L 100,35 Z" fill="url(#chartGrad)" />
        <polyline points="${points.join(' ')}" fill="none" stroke="#6366f1" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
        ${points.map((p, i) => {
          const [x, y] = p.split(',');
          return `<circle cx="${x}" cy="${y}" r="3" fill="#a855f7" class="chart-point" data-val="${days[i]} visits" title="${days[i]} visits" />`;
        }).join('')}
      </svg>
      <div style="display: flex; justify-content: space-between; font-size: 9px; color: var(--text-muted); margin-top: 4px;">
        <span>6d ago</span>
        <span>4d ago</span>
        <span>2d ago</span>
        <span>Today</span>
      </div>
    `;
  },

  updateStatsCounters() {
    if (!this.historyStatsContainer) return;

    // Calculate global stats over all raw elements
    const raw = (this.allRawHistoryItems || []).filter(item => !this.isUrlBlacklisted(item.url, this.historyBlacklistRules));
    const count = raw.length;
    const visits = raw.reduce((sum, item) => sum + (item.visitCount || 1), 0);
    
    const uniqueDomainsSet = new Set();
    const uniqueSubdomainsSet = new Set();
    const domainVisitsMap = {};
    
    // Get start of today (midnight) local time
    const todayBoundary = new Date().setHours(0, 0, 0, 0);
    let todayVisits = 0;
    let bookmarksCount = 0;

    raw.forEach(item => {
      const parts = this.getDomainParts(item.url);
      uniqueDomainsSet.add(parts.root);
      uniqueSubdomainsSet.add(parts.subdomain);
      
      if (item.lastVisitTime >= todayBoundary) {
        todayVisits += (item.visitCount || 1);
      }
      if (this.bookmarkedUrlsSet.has(item.url)) {
        bookmarksCount++;
      }

      if (!domainVisitsMap[parts.root]) domainVisitsMap[parts.root] = 0;
      domainVisitsMap[parts.root] += (item.visitCount || 1);
    });

    const domains = uniqueDomainsSet.size;
    const subdomains = uniqueSubdomainsSet.size;
    const avgVisits = count > 0 ? Math.round(visits / count) : 0;
    
    // Find most visited domain
    let topDomain = 'N/A';
    let topVisits = 0;
    Object.keys(domainVisitsMap).forEach(k => {
      if (domainVisitsMap[k] > topVisits) {
        topDomain = k;
        topVisits = domainVisitsMap[k];
      }
    });

    this.historyStatsContainer.innerHTML = `
      <div class="stat-card">
        <div class="stat-header">
          <span>Visits History</span>
          <i class="fi fi-rr-hourglass stat-icon"></i>
        </div>
        <div class="stat-value" id="stat-val-history-count">0</div>
        <div class="stat-value-sub">items total</div>
      </div>
      <div class="stat-card">
        <div class="stat-header">
          <span>Unique Domains</span>
          <i class="fi fi-rr-globe stat-icon" style="color: #a855f7;"></i>
        </div>
        <div class="stat-value" id="stat-val-domains">0</div>
        <div class="stat-value-sub">${subdomains} subdomains</div>
      </div>
      <div class="stat-card">
        <div class="stat-header">
          <span>Today's Activity</span>
          <i class="fi fi-rr-bolt stat-icon" style="color: #e11d48;"></i>
        </div>
        <div class="stat-value" id="stat-val-today">0</div>
        <div class="stat-value-sub">visits loaded</div>
      </div>
      <div class="stat-card">
        <div class="stat-header">
          <span>Most Active</span>
          <i class="fi fi-rr-star stat-icon" style="color: #fbbf24;"></i>
        </div>
        <div class="stat-value" style="font-size: 13.5px; word-break: break-all; margin-top: 14px;" title="${topDomain}">${topDomain}</div>
        <div class="stat-value-sub">${topVisits} visits</div>
      </div>
      <div class="stat-card">
        <div class="stat-header">
          <span>Blacklist rules</span>
          <i class="fi fi-rr-ban stat-icon" style="color: #6b7280;"></i>
        </div>
        <div class="stat-value" id="stat-val-blacklisted">0</div>
        <div class="stat-value-sub">active blocks</div>
      </div>
    `;

    // Trigger counters animations
    this.animateValue(document.getElementById('stat-val-history-count'), 0, count, 500);
    this.animateValue(document.getElementById('stat-val-domains'), 0, domains, 500);
    this.animateValue(document.getElementById('stat-val-today'), 0, todayVisits, 500);
    this.animateValue(document.getElementById('stat-val-blacklisted'), 0, this.historyBlacklistRules.length, 500);
  },

  animateValue(el, start, end, duration) {
    if (!el) return;
    let startTimestamp = null;
    const step = (timestamp) => {
      if (!startTimestamp) startTimestamp = timestamp;
      const progress = Math.min((timestamp - startTimestamp) / duration, 1);
      el.innerHTML = Math.floor(progress * (end - start) + start).toLocaleString();
      if (progress < 1) {
        window.requestAnimationFrame(step);
      }
    };
    window.requestAnimationFrame(step);
  },

  isUrlBlacklisted(url, rules) {
    const parts = this.getDomainParts(url);
    return rules.some(rule => {
      if (rule.type === 'domain') {
        return parts.root === rule.pattern || parts.root.endsWith('.' + rule.pattern);
      } else if (rule.type === 'subdomain') {
        return parts.subdomain === rule.pattern;
      } else if (rule.type === 'url') {
        return url === rule.pattern;
      }
      return false;
    });
  },

  getDomainParts(urlString) {
    try {
      if (!urlString) return { root: "unknown", subdomain: "unknown", hostname: "unknown" };
      const url = new URL(urlString);
      let hostname = url.hostname.toLowerCase();
      if (hostname.startsWith("www.")) {
        hostname = hostname.substring(4);
      }
      
      const parts = hostname.split('.');
      let root = hostname;
      let subdomain = hostname;
      
      if (parts.length > 2) {
        const lastTwo = parts.slice(-2).join('.');
        const doubleTLDs = ['co.uk', 'gov.uk', 'ac.uk', 'org.uk', 'me.uk', 'com.au', 'net.au', 'org.au', 'com.br', 'co.jp', 'ne.jp', 'or.jp', 'co.in', 'net.in', 'org.in', 'firm.in', 'gen.in', 'ind.in'];
        const lastThree = parts.slice(-3).join('.');
        
        const isDoubleTLD = doubleTLDs.some(tld => lastTwo === tld || lastThree.endsWith('.' + tld));
        if (isDoubleTLD && parts.length > 3) {
          root = parts.slice(-3).join('.');
        } else if (!isDoubleTLD) {
          root = parts.slice(-2).join('.');
        }
      }
      
      return { root, subdomain, hostname };
    } catch (e) {
      return { root: "unknown", subdomain: "unknown", hostname: "unknown" };
    }
  },

  formatRelativeTime(ms) {
    const diff = Date.now() - ms;
    const sec = Math.floor(diff / 1000);
    if (sec < 60) return 'Just now';
    const min = Math.floor(sec / 60);
    if (min < 60) return `${min}m ago`;
    const hr = Math.floor(min / 60);
    if (hr < 24) return `${hr}h ago`;
    const days = Math.floor(hr / 24);
    if (days === 1) return 'Yesterday';
    if (days < 7) return `${days}d ago`;
    return new Date(ms).toLocaleDateString();
  },

  highlightSearchText(text, query) {
    if (!query) return text;
    const regex = new RegExp(`(${query.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&')})`, 'gi');
    return text.replace(regex, '<mark style="background: rgba(99, 102, 241, 0.4); color: #fff; padding: 0 2px; border-radius: 2px;">$1</mark>');
  },

  loadCookies(filterQuery = '') {
    this.bookmarksBody.innerHTML = '';
    
    chrome.cookies.getAll({}, (allCookies) => {
      if (this.activeView !== 'cookies') return;
      if (chrome.runtime.lastError || !allCookies || allCookies.length === 0) {
        this.emptyState.classList.remove('hidden');
        document.getElementById('empty-state-text').textContent = "No cookies found. Make sure the extension has the 'cookies' permission.";
        return;
      }
      
      this.emptyState.classList.add('hidden');
      
      // Group cookies by domain
      const domainMap = {};
      allCookies.forEach(cookie => {
        let domain = cookie.domain;
        if (domain.startsWith('.')) domain = domain.substring(1);
        
        if (!domainMap[domain]) {
          domainMap[domain] = {
            domain: domain,
            cookies: [],
            isLoggedIn: false
          };
        }
        
        domainMap[domain].cookies.push(cookie);
        
        // Detect login session indicators (standard auth cookie names)
        const nameLower = cookie.name.toLowerCase();
        if (
          nameLower.includes('session') ||
          nameLower.includes('token') ||
          nameLower.includes('auth') ||
          nameLower.includes('sid') ||
          nameLower.includes('login') ||
          nameLower.includes('user') ||
          nameLower.includes('sessid') ||
          nameLower.includes('jwt') ||
          cookie.name.startsWith('__Host-') ||
          cookie.name.startsWith('__Secure-')
        ) {
          domainMap[domain].isLoggedIn = true;
        }
      });
      
      // Convert to array and filter by query
      let domainsList = Object.values(domainMap);
      if (filterQuery) {
        domainsList = domainsList.filter(d => d.domain.includes(filterQuery.toLowerCase()));
      }
      
      // Sort: logged in sessions first, then domain name
      domainsList.sort((a, b) => {
        if (a.isLoggedIn && !b.isLoggedIn) return -1;
        if (!a.isLoggedIn && b.isLoggedIn) return 1;
        return a.domain.localeCompare(b.domain);
      });

      // Save/collect active session cookies to storage
      const activeSessions = domainsList.filter(d => d.isLoggedIn).map(d => ({
        domain: d.domain,
        timestamp: Date.now(),
        cookieCount: d.cookies.length
      }));
      chrome.storage.local.set({ 'saved_cookie_sessions': activeSessions });
      
      if (domainsList.length === 0) {
        this.emptyState.classList.remove('hidden');
        document.getElementById('empty-state-text').textContent = "No matching website cookies found.";
        return;
      }
      
      domainsList.forEach(d => {
        const tr = document.createElement('tr');
        tr.dataset.itemId = d.domain;
        
        const loginBadge = d.isLoggedIn 
          ? `<span style="background:rgba(16,185,129,0.15); border:1px solid rgba(16,185,129,0.3); color:#10b981; font-size:11px; padding:2px 8px; border-radius:12px; font-weight:600; margin-left:10px;">🔐 Active Session</span>`
          : `<span style="background:rgba(255,255,255,0.05); border:1px solid rgba(255,255,255,0.08); color:var(--text-muted); font-size:11px; padding:2px 8px; border-radius:12px; margin-left:10px;">Guest</span>`;
          
        const faviconUrl = `https://www.google.com/s2/favicons?sz=32&domain=${d.domain}`;
        
        tr.innerHTML = `
          <td>
            <div class="table-cell-name" style="cursor:pointer; display:flex; align-items:center;">
              <span class="cookie-toggle-arrow" style="margin-right:8px; color:rgba(255,255,255,0.3); font-size:10px;">▶</span>
              <span><img class="table-favicon" src="${faviconUrl}" onerror="this.src='../icons/icon16.png'"></span>
              <strong style="color:white; font-size:13.5px;">${d.domain}</strong>
              ${loginBadge}
            </div>
          </td>
          <td>
            <span style="color:var(--text-muted); font-size:12.5px;">${d.cookies.length} cookies stored</span>
          </td>
          <td class="table-actions-cell" style="text-align:center;">
            <button class="action-icon-btn clear-domain-cookies-btn" title="Clear all cookies for domain">🗑️</button>
          </td>
        `;
        
        // Add detailed cookies list (sub-row) that toggles open
        const detailTr = document.createElement('tr');
        detailTr.className = 'cookie-detail-row hidden';
        detailTr.innerHTML = `
          <td colspan="3" style="background:rgba(0,0,0,0.15); padding:12px 24px;">
            <div style="display:flex; flex-direction:column; gap:8px; max-height:240px; overflow-y:auto; padding-right:5px;">
              ${d.cookies.map(c => `
                <div class="cookie-detail-item" style="display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid rgba(255,255,255,0.04); padding:6px 0; font-size:12px;">
                  <div style="display:flex; flex-direction:column; gap:2px; max-width:85%;">
                    <div style="color:white; font-weight:600;">
                      <span style="color:var(--color-primary); font-family:monospace; font-size:12px;">${c.name}</span>
                      ${c.secure ? '<span style="color:#60a5fa; font-size:10px; margin-left:6px;">[Secure]</span>' : ''}
                      ${c.httpOnly ? '<span style="color:#fbbf24; font-size:10px; margin-left:6px;">[HTTPOnly]</span>' : ''}
                    </div>
                    <div style="font-family:monospace; color:var(--text-muted); word-break:break-all; font-size:11px;">${c.value}</div>
                  </div>
                  <button class="btn btn-danger btn-small delete-single-cookie-btn" data-name="${c.name}" data-url="${(c.secure ? 'https://' : 'http://') + c.domain.replace(/^\./, '') + c.path}" style="padding:2px 8px; font-size:10.5px;">Delete</button>
                </div>
              `).join('')}
            </div>
          </td>
        `;
        
        // Toggle expansion
        tr.querySelector('.table-cell-name').addEventListener('click', () => {
          const arrow = tr.querySelector('.cookie-toggle-arrow');
          const isHidden = detailTr.classList.contains('hidden');
          if (isHidden) {
            detailTr.classList.remove('hidden');
            arrow.textContent = '▼';
            arrow.style.color = 'var(--color-primary)';
          } else {
            detailTr.classList.add('hidden');
            arrow.textContent = '▶';
            arrow.style.color = 'rgba(255,255,255,0.3)';
          }
        });
        
        // Clear all cookies for domain button
        tr.querySelector('.clear-domain-cookies-btn').addEventListener('click', (e) => {
          e.stopPropagation();
          const confirmClear = confirm(`Are you sure you want to clear all ${d.cookies.length} cookies for ${d.domain}?`);
          if (!confirmClear) return;
          
          let clearedCount = 0;
          d.cookies.forEach(c => {
            const protocol = c.secure ? 'https://' : 'http://';
            const domainClean = c.domain.startsWith('.') ? c.domain.substring(1) : c.domain;
            const url = `${protocol}${domainClean}${c.path}`;
            chrome.cookies.remove({ url: url, name: c.name }, () => {
              clearedCount++;
              if (clearedCount === d.cookies.length) {
                tr.remove();
                detailTr.remove();
                if (this.bookmarksBody.children.length === 0) {
                  this.emptyState.classList.remove('hidden');
                  document.getElementById('empty-state-text').textContent = "No matching website cookies found.";
                }
              }
            });
          });
        });
        
        // Delete single cookie buttons
        detailTr.querySelectorAll('.delete-single-cookie-btn').forEach(btn => {
          btn.addEventListener('click', (e) => {
            const cookieName = btn.dataset.name;
            const cookieUrl = btn.dataset.url;
            chrome.cookies.remove({ url: cookieUrl, name: cookieName }, () => {
              btn.closest('.cookie-detail-item').remove();
              d.cookies = d.cookies.filter(c => c.name !== cookieName);
              tr.querySelector('td:nth-child(2) span').textContent = `${d.cookies.length} cookies stored`;
              if (d.cookies.length === 0) {
                tr.remove();
                detailTr.remove();
              }
            });
          });
        });
        
        this.bookmarksBody.appendChild(tr);
        this.bookmarksBody.appendChild(detailTr);
      });
    });
  },

  cacheActiveNoteState() {
    if (this.activeNoteName && this.noteEditorBody) {
      this.unsavedNotesCache = this.unsavedNotesCache || {};
      this.noteCursorPositions = this.noteCursorPositions || {};
      this.noteScrollPositions = this.noteScrollPositions || {};
      
      this.unsavedNotesCache[this.activeNoteName] = this.noteEditorBody.value;
      this.noteCursorPositions[this.activeNoteName] = {
        start: this.noteEditorBody.selectionStart,
        end: this.noteEditorBody.selectionEnd
      };
      
      const scrollContainer = document.querySelector('.note-editor-scroll-container');
      if (scrollContainer) {
        this.noteScrollPositions[this.activeNoteName] = scrollContainer.scrollTop;
      }
    }
  },

  exitFocusMode() {
    if (this.notesViewContainer) {
      this.notesViewContainer.classList.remove('focus-mode-active');
    }
    if (this.noteFocusBtn) {
      this.noteFocusBtn.innerHTML = '<i class="fi fi-rr-expand"></i> Focus';
    }
  },

  loadNotesManager(filterQuery = "") {
    if (!this.notesSidebarList) return;
    this.notesSidebarList.innerHTML = '';
    
    chrome.storage.local.get(['bookmark_organizer_notes'], (result) => {
      const notes = result.bookmark_organizer_notes || {};
      const names = Object.keys(notes);
      
      const q = typeof filterQuery === 'string' ? filterQuery.toLowerCase().trim() : "";
      
      let filteredNames = names;
      if (q) {
        filteredNames = names.filter(name => {
          const noteObj = notes[name];
          let noteContent = "";
          if (typeof noteObj === 'string') {
            noteContent = noteObj;
          } else if (noteObj && noteObj.content) {
            noteContent = noteObj.content;
          }
          return name.toLowerCase().includes(q) || noteContent.toLowerCase().includes(q);
        });
      }
      
      if (filteredNames.length === 0) {
        this.notesSidebarList.innerHTML = '<span style="font-size: 11.5px; color: var(--text-muted); text-align: center; padding: 20px 10px; display: block; width: 100%;">No matching notes found.</span>';
        return;
      }
      
      filteredNames.forEach(name => {
        const item = document.createElement('div');
        item.className = 'notes-sidebar-item';
        if (name === this.activeNoteName) {
          item.classList.add('active');
        }
        item.dataset.name = name;
        
        item.innerHTML = `
          <div class="notes-sidebar-item-content">
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="currentColor" style="opacity: 0.8;"><path d="M19,0H5A5.006,5.006,0,0,0,0,5V19a5.006,5.006,0,0,0,5,5H19a5.006,5.006,0,0,0,5-5V5A5.006,5.006,0,0,0,19,0Zm3,19a3,3,0,0,1-3,3H5a3,3,0,0,1-3-3V5A3,3,0,0,1,5,3H19a3,3,0,0,1,3,3Zm-4-7H6a1,1,0,0,0,0,2H18a1,1,0,0,0,0-2Zm0-4H6a1,1,0,0,0,0,2H18a1,1,0,0,0,0-2Zm-5,8H6a1,1,0,0,0,0,2h7a1,1,0,0,0,0-2Z"/></svg>
            <span>${name}</span>
          </div>
          <button class="delete-note-quick" title="Delete Note">
            <i class="fi fi-rr-trash"></i>
          </button>
        `;
        
        item.addEventListener('click', () => {
          this.selectNote(name);
        });
        
        const delBtn = item.querySelector('.delete-note-quick');
        delBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          const confirmDelete = confirm(`Are you sure you want to delete note "${name}"? This cannot be undone.`);
          if (!confirmDelete) return;
          
          chrome.storage.local.get(['bookmark_organizer_notes'], (res) => {
            const currentNotes = res.bookmark_organizer_notes || {};
            delete currentNotes[name];
            chrome.storage.local.set({ 'bookmark_organizer_notes': currentNotes }, () => {
              showToast(`Note "${name}" deleted!`, 'success');
              if (this.activeNoteName === name) {
                this.activeNoteName = null;
                this.exitFocusMode();
                this.noteEditorPane.classList.add('hidden');
                this.noteEditorPlaceholder.classList.remove('hidden');
              }
              this.loadNotesManager(filterQuery);
            });
          });
        });
        
        this.notesSidebarList.appendChild(item);
      });
    });
  },

  selectNote(name) {
    if (this.activeNoteName !== name) {
      this.cacheActiveNoteState();
    }

    this.activeNoteName = name;
    this.noteEditorPlaceholder.classList.add('hidden');
    this.noteEditorPane.classList.remove('hidden');
    this.noteEditorTitle.value = name;
    
    // Reset reading mode class when switching notes to let user edit new note immediately
    if (this.notesViewContainer) {
      this.notesViewContainer.classList.remove('reading-mode-active');
      if (this.noteReadBtn) {
        this.noteReadBtn.innerHTML = '<i class="fi fi-rr-eye"></i> Read';
      }
      if (this.noteEditorBody) {
        this.noteEditorBody.readOnly = false;
      }
    }
    
    chrome.storage.local.get(['bookmark_organizer_notes'], (result) => {
      const notes = result.bookmark_organizer_notes || {};
      const note = notes[name];
      
      let content = "";
      let versions = [];
      if (typeof note === 'string') {
        content = note;
      } else if (note) {
        content = note.content;
        versions = note.versions || [];
      }
      
      // If there is an unsaved content in memory cache, use it!
      if (this.unsavedNotesCache && this.unsavedNotesCache[name] !== undefined) {
        content = this.unsavedNotesCache[name];
      }
      
      this.noteEditorBody.value = content;
      this.renderNoteVersions(name, versions);
      this.updateChecklistProgress();
      
      // Update sidebar active highlights
      if (this.notesSidebarList) {
        const items = this.notesSidebarList.querySelectorAll('.notes-sidebar-item');
        items.forEach(item => {
          if (item.dataset.name === name) {
            item.classList.add('active');
          } else {
            item.classList.remove('active');
          }
        });
      }
      
      // Restore cursor position and scroll position
      setTimeout(() => {
        if (this.noteCursorPositions && this.noteCursorPositions[name]) {
          try {
            this.noteEditorBody.setSelectionRange(
              this.noteCursorPositions[name].start,
              this.noteCursorPositions[name].end
            );
            this.noteEditorBody.focus();
          } catch(e) {}
        }
        
        const scrollContainer = document.querySelector('.note-editor-scroll-container');
        if (scrollContainer && this.noteScrollPositions && this.noteScrollPositions[name] !== undefined) {
          scrollContainer.scrollTop = this.noteScrollPositions[name];
        }
      }, 0);
    });
  },

  renderNoteVersions(noteName, versions) {
    this.noteVersionsList.innerHTML = '';
    if (versions.length === 0) {
      this.noteVersionsList.innerHTML = '<span style="font-size: 11.5px; color: var(--text-muted); text-align: center; padding: 10px 0; display: block; width: 100%;">No revisions saved yet. Save your note to create the first revision.</span>';
      return;
    }

    // Group by date
    const grouped = {};
    versions.forEach((v, idx) => {
      const d = new Date(v.timestamp);
      const today    = new Date();
      const yesterday = new Date(); yesterday.setDate(today.getDate() - 1);
      let label;
      if (d.toDateString() === today.toDateString())     label = 'Today';
      else if (d.toDateString() === yesterday.toDateString()) label = 'Yesterday';
      else label = d.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
      if (!grouped[label]) grouped[label] = [];
      grouped[label].push({ v, idx });
    });

    Object.entries(grouped).forEach(([dateLabel, items]) => {
      // Date divider
      const divider = document.createElement('div');
      divider.style.cssText = 'font-size:10px;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.08em;padding:8px 0 4px 2px;';
      divider.textContent = dateLabel;
      this.noteVersionsList.appendChild(divider);

      items.forEach(({ v, idx }) => {
        const row = document.createElement('div');
        row.className = 'note-revision-item';
        row.style.cursor = 'pointer';

        const timeStr = new Date(v.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        const revNum  = versions.length - idx;
        const wc      = v.content ? v.content.trim().split(/\s+/).filter(Boolean).length : 0;

        row.innerHTML = `
          <div class="note-revision-dot"></div>
          <div class="note-revision-info" style="flex:1; min-width:0;">
            <span class="note-revision-name">Revision ${revNum}</span>
            <span class="note-revision-time">${timeStr} &nbsp;·&nbsp; ${wc} words</span>
          </div>
          <div class="note-revision-actions">
            <button class="diff-ver-btn"   title="View Diff"            style="font-size:11px;padding:2px 6px;border-radius:4px;border:1px solid rgba(255,255,255,0.15);background:rgba(99,102,241,0.15);color:#a78bfa;cursor:pointer;">Diff</button>
            <button class="delete-ver-btn" title="Delete this revision" style="font-size:11px;padding:2px 6px;border-radius:4px;border:1px solid rgba(255,255,255,0.1);background:rgba(239,68,68,0.12);color:#f87171;cursor:pointer;">🗑</button>
          </div>
        `;

        // Clicking the row body shows diff
        row.addEventListener('click', (e) => {
          if (e.target.closest('.diff-ver-btn') || e.target.closest('.delete-ver-btn')) return;
          this.openDiffOverlay(v, revNum);
        });

        row.querySelector('.diff-ver-btn').addEventListener('click', (e) => {
          e.stopPropagation();
          this.openDiffOverlay(v, revNum);
        });

        row.querySelector('.delete-ver-btn').addEventListener('click', (e) => {
          e.stopPropagation();
          const confirmDel = confirm(`Delete Revision ${revNum} from version history?`);
          if (!confirmDel) return;
          this.deleteNoteVersion(noteName, v.timestamp);
        });

        this.noteVersionsList.appendChild(row);
      });
    });
  },

  deleteNoteVersion(noteName, timestamp) {
    chrome.storage.local.get(['bookmark_organizer_notes'], (result) => {
      const notes = result.bookmark_organizer_notes || {};
      const note = notes[noteName];
      if (note && typeof note !== 'string') {
        note.versions = (note.versions || []).filter(v => v.timestamp !== timestamp);
        notes[noteName] = note;
        chrome.storage.local.set({ 'bookmark_organizer_notes': notes }, () => {
          showToast('Revision deleted!', 'success');
          this.selectNote(noteName);
        });
      }
    });
  },

  // ── Checklist Helpers ──────────────────────────────────────────────────────

  /** Inserts a new `☐ ` checklist line at the cursor position */
  insertChecklistItem() {
    const ta = this.noteEditorBody;
    if (!ta) return;
    ta.focus();
    const start = ta.selectionStart;
    const end   = ta.selectionEnd;
    const val   = ta.value;
    // Go to start of line
    const lineStart = val.lastIndexOf('\n', start - 1) + 1;
    const insert    = '☐ ';
    // Only insert if not already a checklist line
    if (val.substring(lineStart, lineStart + insert.length) === insert) {
      showToast('Line is already a checklist item', 'info');
      return;
    }
    ta.value = val.substring(0, lineStart) + insert + val.substring(lineStart);
    // Restore cursor
    const offset = insert.length;
    ta.setSelectionRange(start + offset, end + offset);
    this.updateChecklistProgress();
    showToast('Checklist item inserted', 'success');
  },

  /** Toggles the checklist checkbox on the line where the cursor currently sits */
  toggleChecklistItemAtCursor() {
    const ta = this.noteEditorBody;
    if (!ta) return;
    const start     = ta.selectionStart;
    const val       = ta.value;
    const lineStart = val.lastIndexOf('\n', start - 1) + 1;
    const lineEnd   = val.indexOf('\n', start);
    const eol       = lineEnd === -1 ? val.length : lineEnd;
    const line      = val.substring(lineStart, eol);

    let newLine;
    if (line.startsWith('☐ ')) {
      newLine = '☑ ' + line.substring(2);
    } else if (line.startsWith('☑ ')) {
      newLine = '☐ ' + line.substring(2);
    } else {
      showToast('No checklist item on this line. Use "Checklist" to add one.', 'info');
      return;
    }
    ta.value = val.substring(0, lineStart) + newLine + val.substring(eol);
    ta.setSelectionRange(start, start);
    this.updateChecklistProgress();
  },

  /** Marks all checklist items complete (☐ → ☑) or incomplete (☑ → ☐) */
  setAllChecklistItems(complete) {
    const ta = this.noteEditorBody;
    if (!ta) return;
    if (complete) {
      ta.value = ta.value.replace(/^☐ /gm, '☑ ');
      showToast('All items marked complete', 'success');
    } else {
      ta.value = ta.value.replace(/^☑ /gm, '☐ ');
      showToast('All items reset to incomplete', 'info');
    }
    this.updateChecklistProgress();
  },

  /** Removes lines that start with ☑ (completed items) */
  clearCompletedChecklistItems() {
    const ta = this.noteEditorBody;
    if (!ta) return;
    const before = ta.value;
    ta.value = before.split('\n').filter(l => !l.startsWith('☑ ')).join('\n');
    const removed = (before.match(/^☑ /gm) || []).length;
    showToast(`Cleared ${removed} completed item${removed !== 1 ? 's' : ''}`, 'success');
    this.updateChecklistProgress();
  },

  /** Sorts: incomplete items first, completed items last */
  sortChecklistItems() {
    const ta = this.noteEditorBody;
    if (!ta) return;
    const lines     = ta.value.split('\n');
    const pending   = lines.filter(l => l.startsWith('☐ '));
    const completed = lines.filter(l => l.startsWith('☑ '));
    const other     = lines.filter(l => !l.startsWith('☐ ') && !l.startsWith('☑ '));
    ta.value = [...other, ...pending, ...completed].join('\n');
    showToast('Tasks sorted: pending first, completed last', 'success');
    this.updateChecklistProgress();
  },

  /** Recomputes progress bar and stats from current editor content */
  updateChecklistProgress() {
    const ta = this.noteEditorBody;
    if (!ta) return;
    const lines     = ta.value.split('\n');
    const total     = lines.filter(l => l.startsWith('☐ ') || l.startsWith('☑ ')).length;
    const completed = lines.filter(l => l.startsWith('☑ ')).length;
    const pending   = total - completed;
    const pct       = total === 0 ? 0 : Math.round((completed / total) * 100);

    if (this.checklistProgressText) {
      this.checklistProgressText.textContent = `${pct}% (${completed} / ${total} Tasks Completed)`;
    }
    if (this.checklistProgressBarFill) {
      this.checklistProgressBarFill.style.width = pct + '%';
      // Colour: green when done, orange in progress, grey when empty
      this.checklistProgressBarFill.style.background =
        total === 0 ? 'rgba(255,255,255,0.08)' :
        pct === 100 ? 'linear-gradient(90deg,#10b981,#34d399)' :
                      'linear-gradient(90deg,#6366f1,#8b5cf6)';
    }

    const stats = document.getElementById('checklist-actions-stats');
    if (stats) {
      stats.innerHTML = `<span>Total: ${total}</span><span>Pending: ${pending}</span>`;
    }
  },

  // ── Version Diff Overlay ───────────────────────────────────────────────────

  /** Opens the diff overlay, comparing version v against current editor content */
  openDiffOverlay(v, revNum) {
    this.currentDiffVersion = v;
    this.currentDiffMode    = this.currentDiffMode || 'inline';

    if (this.diffVersionInfo) {
      this.diffVersionInfo.textContent = `Revision ${revNum} vs Current`;
    }
    if (this.diffMetadataRow) {
      const ts  = new Date(v.timestamp).toLocaleString();
      const wc  = v.content ? v.content.trim().split(/\s+/).filter(Boolean).length : 0;
      this.diffMetadataRow.innerHTML = `
        <span>📅 Saved: ${ts}</span>
        <span>📝 Words in revision: ${wc}</span>
      `;
    }

    this.renderDiffContent(v);

    if (this.notesDiffOverlay) {
      this.notesDiffOverlay.classList.remove('hidden');
    }
  },

  /** Renders the diff content based on currentDiffMode */
  renderDiffContent(v) {
    if (!this.diffViewerContent) return;
    const currentText = this.noteEditorBody ? this.noteEditorBody.value : '';
    const oldLines    = (v.content || '').split('\n');
    const newLines    = currentText.split('\n');

    if (this.currentDiffMode === 'side') {
      this.diffViewerContent.innerHTML = this.buildSideBySideDiff(oldLines, newLines);
    } else {
      this.diffViewerContent.innerHTML = this.buildInlineDiff(oldLines, newLines);
    }
  },

  /** Simple LCS-based line diff → inline HTML */
  buildInlineDiff(oldLines, newLines) {
    const lcs = this.computeLCS(oldLines, newLines);
    const result = [];
    let oi = 0, ni = 0, li = 0;
    while (oi < oldLines.length || ni < newLines.length) {
      if (li < lcs.length && oi < oldLines.length && ni < newLines.length &&
          oldLines[oi] === lcs[li] && newLines[ni] === lcs[li]) {
        result.push(`<div class="diff-line diff-unchanged"><span class="diff-gutter"> </span><pre>${this.escapeHtml(oldLines[oi])}</pre></div>`);
        oi++; ni++; li++;
      } else if (li < lcs.length && ni < newLines.length && newLines[ni] !== lcs[li]) {
        result.push(`<div class="diff-line diff-added"><span class="diff-gutter">+</span><pre>${this.escapeHtml(newLines[ni])}</pre></div>`);
        ni++;
      } else if (oi < oldLines.length) {
        result.push(`<div class="diff-line diff-removed"><span class="diff-gutter">−</span><pre>${this.escapeHtml(oldLines[oi])}</pre></div>`);
        oi++;
      } else {
        result.push(`<div class="diff-line diff-added"><span class="diff-gutter">+</span><pre>${this.escapeHtml(newLines[ni])}</pre></div>`);
        ni++;
      }
    }
    return result.join('') || '<div style="padding:20px;color:var(--text-muted);text-align:center;">No changes between this revision and current content.</div>';
  },

  /** Side-by-side diff HTML */
  buildSideBySideDiff(oldLines, newLines) {
    const lcs = this.computeLCS(oldLines, newLines);
    const leftRows = [], rightRows = [];
    let oi = 0, ni = 0, li = 0;
    while (oi < oldLines.length || ni < newLines.length) {
      if (li < lcs.length && oi < oldLines.length && ni < newLines.length &&
          oldLines[oi] === lcs[li] && newLines[ni] === lcs[li]) {
        leftRows.push(`<div class="diff-line diff-unchanged"><pre>${this.escapeHtml(oldLines[oi])}</pre></div>`);
        rightRows.push(`<div class="diff-line diff-unchanged"><pre>${this.escapeHtml(newLines[ni])}</pre></div>`);
        oi++; ni++; li++;
      } else if (li < lcs.length && ni < newLines.length && newLines[ni] !== lcs[li]) {
        leftRows.push(`<div class="diff-line diff-empty"><pre> </pre></div>`);
        rightRows.push(`<div class="diff-line diff-added"><pre>${this.escapeHtml(newLines[ni])}</pre></div>`);
        ni++;
      } else if (oi < oldLines.length) {
        leftRows.push(`<div class="diff-line diff-removed"><pre>${this.escapeHtml(oldLines[oi])}</pre></div>`);
        rightRows.push(`<div class="diff-line diff-empty"><pre> </pre></div>`);
        oi++;
      } else {
        leftRows.push(`<div class="diff-line diff-empty"><pre> </pre></div>`);
        rightRows.push(`<div class="diff-line diff-added"><pre>${this.escapeHtml(newLines[ni])}</pre></div>`);
        ni++;
      }
    }
    return `<div class="diff-side-by-side"><div class="diff-side diff-side-old">${leftRows.join('')}</div><div class="diff-side diff-side-new">${rightRows.join('')}</div></div>`;
  },

  /** Longest Common Subsequence of two string arrays */
  computeLCS(a, b) {
    const m = a.length, n = b.length;
    const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
    for (let i = 1; i <= m; i++) {
      for (let j = 1; j <= n; j++) {
        dp[i][j] = a[i - 1] === b[j - 1] ? dp[i - 1][j - 1] + 1 : Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
    const result = [];
    let i = m, j = n;
    while (i > 0 && j > 0) {
      if (a[i - 1] === b[j - 1]) { result.unshift(a[i - 1]); i--; j--; }
      else if (dp[i - 1][j] > dp[i][j - 1]) i--;
      else j--;
    }
    return result;
  },

  escapeHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  },

  closeDiffOverlay() {
    if (this.notesDiffOverlay) this.notesDiffOverlay.classList.add('hidden');
    this.currentDiffVersion = null;
  },

  restoreDiffVersion() {
    if (!this.currentDiffVersion) return;
    const confirmRestore = confirm('Restore note content to this revision? Current unsaved changes will be replaced.');
    if (!confirmRestore) return;
    this.noteEditorBody.value = this.currentDiffVersion.content || '';
    this.closeDiffOverlay();
    this.updateChecklistProgress();
    showToast('Note restored to selected revision', 'success');
  },

  saveActiveNote() {
    const name = this.noteEditorTitle.value.trim();
    const content = this.noteEditorBody.value;
    

    if (!name) {
      showToast('Note name cannot be empty!', 'error');
      return;
    }
    
    chrome.storage.local.get(['bookmark_organizer_notes'], (result) => {
      const notes = result.bookmark_organizer_notes || {};
      const oldNote = notes[name];
      
      let noteObj = { content: "", versions: [] };
      if (typeof oldNote === 'string') {
        noteObj = { content: oldNote, versions: [] };
      } else if (oldNote) {
        noteObj = oldNote;
      }
      
      if (noteObj.content && noteObj.content !== content) {
        noteObj.versions.unshift({
          content: noteObj.content,
          timestamp: Date.now()
        });
        if (noteObj.versions.length > 15) {
          noteObj.versions.pop();
        }
      }
      noteObj.content = content;
      notes[name] = noteObj;
      
      chrome.storage.local.set({ 'bookmark_organizer_notes': notes }, () => {
        showToast(`Note "${name}" saved!`, 'success');
        if (this.unsavedNotesCache) {
          delete this.unsavedNotesCache[name];
        }
        this.activeNoteName = name;
        this.selectNote(name);
      });
    });
  },

  deleteActiveNote() {
    const name = this.activeNoteName;
    if (!name) return;
    
    const confirmDelete = confirm(`Are you sure you want to delete note "${name}"? This cannot be undone.`);
    if (!confirmDelete) return;
    
    chrome.storage.local.get(['bookmark_organizer_notes'], (result) => {
      const notes = result.bookmark_organizer_notes || {};
      delete notes[name];
      chrome.storage.local.set({ 'bookmark_organizer_notes': notes }, () => {
        showToast(`Note "${name}" deleted!`, 'success');
        if (this.unsavedNotesCache) delete this.unsavedNotesCache[name];
        if (this.noteCursorPositions) delete this.noteCursorPositions[name];
        if (this.noteScrollPositions) delete this.noteScrollPositions[name];
        
        this.activeNoteName = null;
        this.exitFocusMode();
        this.noteEditorPane.classList.add('hidden');
        this.noteEditorPlaceholder.classList.remove('hidden');
        this.loadNotesManager();
      });
    });
  },

  initiateNewNote() {
    const name = prompt("Enter note name:");
    if (!name) return;
    const cleanName = name.trim();
    if (!cleanName) return;
    
    chrome.storage.local.get(['bookmark_organizer_notes'], (result) => {
      const notes = result.bookmark_organizer_notes || {};
      if (notes[cleanName] !== undefined) {
        showToast(`Note "${cleanName}" already exists!`, 'error');
        return;
      }
      
      notes[cleanName] = { content: "", versions: [] };
      chrome.storage.local.set({ 'bookmark_organizer_notes': notes }, () => {
        showToast(`Note "${cleanName}" created!`, 'success');
        this.selectNote(cleanName);
      });
    });
  },

  toggleFloatingMenu(e) {
    if (e) e.stopPropagation();
    const menu = document.getElementById('workspace-floating-menu');
    if (!menu) return;
    
    // Hide other dropdown menus
    document.querySelectorAll('.dropdown-menu').forEach(m => {
      if (m !== menu) m.classList.add('hidden');
    });

    const isHidden = menu.classList.toggle('hidden');
    if (!isHidden) {
      this.renderFloatingMenu();
    }
  },

  closeFloatingMenu() {
    const menu = document.getElementById('workspace-floating-menu');
    if (menu) menu.classList.add('hidden');
  },

  renderFloatingMenu() {
    const menu = document.getElementById('workspace-floating-menu');
    if (!menu) return;
    
    let html = '';
    const view = this.activeView;

    if (view === 'bookmarks') {
      html += `
        <div class="menu-section-header">Workspace</div>
        <button class="menu-item" id="floating-btn-restructure" type="button">
          <div class="menu-item-left">
            <i class="fi fi-rr-books-medical" style="color: #60a5fa;"></i>
            <span>Restructure Library</span>
          </div>
          <span class="menu-item-shortcut">Ctrl+R</span>
        </button>
        <button class="menu-item" id="floating-btn-db" type="button">
          <div class="menu-item-left">
            <i class="fi fi-sr-database-cloud-circle" style="color: #34d399;"></i>
            <span>Domain Database</span>
          </div>
          <span class="menu-item-shortcut">Ctrl+D</span>
        </button>
        <button class="menu-item" id="floating-btn-backups" type="button">
          <div class="menu-item-left">
            <i class="fi fi-sr-system-restore" style="color: #f59e0b;"></i>
            <span>Restore Points</span>
          </div>
          <span class="menu-item-shortcut">Ctrl+P</span>
        </button>
        <button class="menu-item" id="floating-btn-sorter" type="button">
          <div class="menu-item-left">
            <i class="fi fi-sr-filter-list" style="color: #a78bfa;"></i>
            <span>Smart Sorter</span>
          </div>
          <span class="menu-item-shortcut">Ctrl+S</span>
        </button>
        
        <div class="menu-divider"></div>
        <div class="menu-section-header">Actions</div>
        <button class="menu-item" id="floating-btn-import-bookmarks" type="button">
          <div class="menu-item-left">
            <i class="fi fi-rr-upload" style="color: #a855f7;"></i>
            <span>Import Bookmarks</span>
          </div>
        </button>
        <button class="menu-item" id="floating-btn-export-bookmarks" type="button">
          <div class="menu-item-left">
            <i class="fi fi-rr-download" style="color: #06b6d4;"></i>
            <span>Export Bookmarks</span>
          </div>
        </button>
      `;
    } else if (view === 'history') {
      html += `
        <div class="menu-section-header">History Tools</div>
        <button class="menu-item" id="floating-btn-blacklist" type="button">
          <div class="menu-item-left">
            <i class="fi fi-rr-ban" style="color: #f87171;"></i>
            <span>Blacklist Manager</span>
          </div>
        </button>
        <button class="menu-item" id="floating-btn-import-rules" type="button">
          <div class="menu-item-left">
            <i class="fi fi-rr-upload" style="color: #a855f7;"></i>
            <span>Import Rules</span>
          </div>
        </button>
        <button class="menu-item" id="floating-btn-export-history" type="button">
          <div class="menu-item-left">
            <i class="fi fi-rr-download" style="color: #34d399;"></i>
            <span>Export History</span>
          </div>
        </button>
        <button class="menu-item" id="floating-btn-sorter" type="button">
          <div class="menu-item-left">
            <i class="fi fi-sr-filter-list" style="color: #a78bfa;"></i>
            <span>Smart Sorter</span>
          </div>
          <span class="menu-item-shortcut">Ctrl+S</span>
        </button>
      `;
    } else if (view === 'notes') {
      html += `
        <div class="menu-section-header">Notes Tools</div>
        <button class="menu-item" id="floating-btn-import-notes" type="button">
          <div class="menu-item-left">
            <i class="fi fi-rr-upload" style="color: #60a5fa;"></i>
            <span>Import Notes</span>
          </div>
        </button>
        <button class="menu-item" id="floating-btn-export-notes" type="button">
          <div class="menu-item-left">
            <i class="fi fi-rr-download" style="color: #34d399;"></i>
            <span>Export Notes</span>
          </div>
        </button>
        <button class="menu-item" id="floating-btn-backup-notes" type="button">
          <div class="menu-item-left">
            <i class="fi fi-rs-disk" style="color: #a78bfa;"></i>
            <span>Backup Notes</span>
          </div>
        </button>
        <button class="menu-item" id="floating-btn-restore-notes" type="button">
          <div class="menu-item-left">
            <i class="fi fi-sr-system-restore" style="color: #f59e0b;"></i>
            <span>Restore Notes</span>
          </div>
        </button>
      `;
    } else if (view === 'cookies') {
      html += `
        <div class="menu-section-header">Cookie Tools</div>
        <button class="menu-item" id="floating-btn-export-cookies" type="button">
          <div class="menu-item-left">
            <i class="fi fi-rr-download" style="color: #34d399;"></i>
            <span>Export Cookies</span>
          </div>
        </button>
        <button class="menu-item" id="floating-btn-clear-cookies" type="button">
          <div class="menu-item-left">
            <i class="fi fi-rr-trash" style="color: #f87171;"></i>
            <span>Delete All Cookies</span>
          </div>
        </button>
      `;
    } else if (view === 'settings') {
      html += `
        <div class="menu-section-header">System Utilities</div>
        <button class="menu-item" id="floating-btn-reset-settings" type="button">
          <div class="menu-item-left">
            <i class="fi fi-rr-undo" style="color: #f59e0b;"></i>
            <span>Reset Settings</span>
          </div>
        </button>
        <button class="menu-item" id="floating-btn-backups" type="button">
          <div class="menu-item-left">
            <i class="fi fi-sr-system-restore" style="color: #60a5fa;"></i>
            <span>Restore Points</span>
          </div>
          <span class="menu-item-shortcut">Ctrl+P</span>
        </button>
      `;
    }

    // Add common settings link to the bottom of all menus
    html += `
      <div class="menu-divider"></div>
      <div class="menu-section-header">System</div>
      <button class="menu-item" id="floating-btn-nav-settings" type="button">
        <div class="menu-item-left">
          <i class="fi fi-br-settings-sliders" style="color: #a855f7;"></i>
          <span>Settings</span>
        </div>
      </button>
      <button class="menu-item" id="floating-btn-about" type="button">
        <div class="menu-item-left">
          <i class="fi fi-rr-info" style="color: #06b6d4;"></i>
          <span>About Info</span>
        </div>
      </button>
    `;

    menu.innerHTML = html;
    this.bindFloatingMenuEvents();
  },

  bindFloatingMenuEvents() {
    // 1. Bookmarks view actions
    document.getElementById('floating-btn-restructure')?.addEventListener('click', () => {
      this.closeFloatingMenu();
      this.runBackgroundRestructure();
    });
    document.getElementById('floating-btn-db')?.addEventListener('click', () => {
      this.closeFloatingMenu();
      this.openDbModal();
    });
    document.getElementById('floating-btn-backups')?.addEventListener('click', () => {
      this.closeFloatingMenu();
      this.openBackupsModal();
    });
    document.getElementById('floating-btn-sorter')?.addEventListener('click', () => {
      this.closeFloatingMenu();
      this.showWizard();
    });
    document.getElementById('floating-btn-import-bookmarks')?.addEventListener('click', () => {
      this.closeFloatingMenu();
      this.importBookmarks();
    });
    document.getElementById('floating-btn-export-bookmarks')?.addEventListener('click', () => {
      this.closeFloatingMenu();
      this.exportBookmarks();
    });

    // 2. History view actions
    document.getElementById('floating-btn-blacklist')?.addEventListener('click', () => {
      this.closeFloatingMenu();
      if (this.blacklistManagerPanel) {
        this.blacklistManagerPanel.classList.remove('hidden');
        this.loadBlacklistRules();
      }
    });
    document.getElementById('floating-btn-import-rules')?.addEventListener('click', () => {
      this.closeFloatingMenu();
      document.getElementById('blacklist-import-input')?.click();
    });
    document.getElementById('floating-btn-export-history')?.addEventListener('click', () => {
      this.closeFloatingMenu();
      this.exportHistory(this.historyFilteredItems);
    });

    // 3. Notes view actions
    document.getElementById('floating-btn-import-notes')?.addEventListener('click', () => {
      this.closeFloatingMenu();
      this.importNotes();
    });
    document.getElementById('floating-btn-export-notes')?.addEventListener('click', () => {
      this.closeFloatingMenu();
      this.exportNotes();
    });
    document.getElementById('floating-btn-backup-notes')?.addEventListener('click', () => {
      this.closeFloatingMenu();
      this.backupNotes();
    });
    document.getElementById('floating-btn-restore-notes')?.addEventListener('click', () => {
      this.closeFloatingMenu();
      this.restoreNotes();
    });

    // 4. Cookie view actions
    document.getElementById('floating-btn-export-cookies')?.addEventListener('click', () => {
      this.closeFloatingMenu();
      this.exportCookies();
    });
    document.getElementById('floating-btn-clear-cookies')?.addEventListener('click', () => {
      this.closeFloatingMenu();
      this.clearAllCookies();
    });

    // 5. Settings view actions
    document.getElementById('floating-btn-reset-settings')?.addEventListener('click', () => {
      this.closeFloatingMenu();
      this.resetSettings();
    });

    // 6. Navigation / Common actions
    document.getElementById('floating-btn-nav-settings')?.addEventListener('click', () => {
      this.closeFloatingMenu();
      this.switchView('settings');
    });
    document.getElementById('floating-btn-about')?.addEventListener('click', () => {
      this.closeFloatingMenu();
      showToast('Smart Bookmark Organizer v1.0.0 • Private & Secure', 'info');
    });
  },

  importBookmarks() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (event) => {
        try {
          const data = JSON.parse(event.target.result);
          const createRecursive = (node, parentId) => {
            if (node.url) {
              chrome.bookmarks.create({ parentId, title: node.title, url: node.url });
            } else {
              chrome.bookmarks.create({ parentId, title: node.title }, (newFolder) => {
                if (node.children) {
                  node.children.forEach(child => createRecursive(child, newFolder.id));
                }
              });
            }
          };
          const rootNodes = Array.isArray(data) ? data : [data];
          rootNodes.forEach(root => {
            if (root.children) {
              root.children.forEach(child => createRecursive(child, this.activeFolderId || "1"));
            } else {
              createRecursive(root, this.activeFolderId || "1");
            }
          });
          showToast('Bookmarks imported successfully!', 'success');
          this.refreshLibrary();
        } catch(err) {
          showToast('Failed to parse JSON file.', 'error');
        }
      };
      reader.readAsText(file);
    };
    input.click();
  },

  exportBookmarks() {
    chrome.bookmarks.getTree((tree) => {
      const jsonStr = JSON.stringify(tree, null, 2);
      const blob = new Blob([jsonStr], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `bookmarks_export_${Date.now()}.json`;
      a.click();
      URL.revokeObjectURL(url);
      showToast('Bookmarks exported successfully!', 'success');
    });
  },

  importNotes() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (event) => {
        try {
          const data = JSON.parse(event.target.result);
          chrome.storage.local.get(['bookmark_organizer_notes'], (res) => {
            const currentNotes = res.bookmark_organizer_notes || {};
            Object.assign(currentNotes, data);
            chrome.storage.local.set({ 'bookmark_organizer_notes': currentNotes }, () => {
              showToast('Notes imported successfully!', 'success');
              this.loadNotesManager();
            });
          });
        } catch(err) {
          showToast('Failed to parse JSON file.', 'error');
        }
      };
      reader.readAsText(file);
    };
    input.click();
  },

  exportNotes() {
    chrome.storage.local.get(['bookmark_organizer_notes'], (res) => {
      const notes = res.bookmark_organizer_notes || {};
      const jsonStr = JSON.stringify(notes, null, 2);
      const blob = new Blob([jsonStr], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `notes_export_${Date.now()}.json`;
      a.click();
      URL.revokeObjectURL(url);
      showToast('Notes exported successfully!', 'success');
    });
  },

  backupNotes() {
    chrome.storage.local.get(['bookmark_organizer_notes'], (res) => {
      const notes = res.bookmark_organizer_notes || {};
      chrome.storage.local.set({ 'bookmark_organizer_notes_backup': notes }, () => {
        showToast('Notes backup saved locally!', 'success');
      });
    });
  },

  restoreNotes() {
    chrome.storage.local.get(['bookmark_organizer_notes_backup'], (res) => {
      if (!res.bookmark_organizer_notes_backup) {
        showToast('No local notes backup found!', 'error');
        return;
      }
      if (confirm('Are you sure you want to restore notes from backup? Current notes will be overwritten.')) {
        chrome.storage.local.set({ 'bookmark_organizer_notes': res.bookmark_organizer_notes_backup }, () => {
          showToast('Notes restored successfully!', 'success');
          this.loadNotesManager();
        });
      }
    });
  },

  exportCookies() {
    chrome.cookies.getAll({}, (cookies) => {
      const jsonStr = JSON.stringify(cookies, null, 2);
      const blob = new Blob([jsonStr], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `cookies_export_${Date.now()}.json`;
      a.click();
      URL.revokeObjectURL(url);
      showToast('Cookies exported successfully!', 'success');
    });
  },

  clearAllCookies() {
    if (confirm("Are you sure you want to delete ALL cookies stored in your browser? This will log you out of all sites!")) {
      chrome.cookies.getAll({}, (cookies) => {
        let count = 0;
        if (cookies.length === 0) {
          showToast("No cookies to delete.", "info");
          return;
        }
        cookies.forEach(c => {
          const url = (c.secure ? 'https://' : 'http://') + c.domain.replace(/^\./, '') + c.path;
          chrome.cookies.remove({ url: url, name: c.name }, () => {
            count++;
            if (count === cookies.length) {
              showToast("All cookies deleted!", "success");
              this.loadCookies();
            }
          });
        });
      });
    }
  },

  resetSettings() {
    if (confirm("Are you sure you want to reset all configurations to defaults?")) {
      chrome.storage.local.remove([
        'organizer_user_settings',
        'notes_sidebar_width_pref',
        'sidebar_collapsed_pref',
        'history_view_mode',
        'history_expanded_timelines',
        'history_blacklist_rules'
      ], () => {
        showToast("Settings reset to defaults!", "success");
        window.location.reload();
      });
    }
  }
};

const COMMANDS = [
  { cmd: "/help", desc: "Show help lists" },
  { cmd: "/t ", desc: "Filter by title: /t <query>" },
  { cmd: "/u ", desc: "Filter by URL: /u <query>" },
  { cmd: "/c ", desc: "Filter by category: /c [movies, study, software, adult, sports]" },
  { cmd: "/d ", desc: "Filter by domain: /d [domain.com]" },
  { cmd: "/sort ", desc: "Sort current list: /sort [name, date, url]" },
  { cmd: "/sound ", desc: "Boost volume of active tab: /sound [level, +, -]" },
  { cmd: "/wizard", desc: "Launch Smart Sorter wizard" },
  { cmd: "/undo", desc: "Undo last bookmark organization" }
];

function showToast(message, type = 'success') {
  const toast = document.createElement('div');
  toast.className = `custom-toast toast-${type}`;
  
  const iconClass = type === 'success' ? 'fi fi-rr-checkbox' : 'fi fi-rr-exclamation';
  const iconColor = type === 'success' ? '#10b981' : '#f43f5e';
  
  toast.innerHTML = `
    <i class="${iconClass}" style="color: ${iconColor}; font-size: 16px; display: flex; align-items: center;"></i>
    <span>${message}</span>
  `;
  document.body.appendChild(toast);
  
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

class CookieProfileManager {
  constructor() {
    this.profiles = [];
    this.activeProfileIdx = -1;
    this.activeCookieIdx = -1;
    this.currentViewMode = 'table'; 

    this.expandedDomains = new Set();
    this.activeFilters = {
      search: '',
      secure: false,
      session: false,
      expired: false
    };

    // DOM Elements - Global
    this.globalSearch = document.getElementById('manager-search');
    this.filterBadges = document.querySelectorAll('.filter-badge');
    this.statProfiles = document.getElementById('stat-total-profiles');
    this.statDomains = document.getElementById('stat-total-domains');
    this.statCookies = document.getElementById('stat-total-cookies');
    this.statExpired = document.getElementById('stat-expired-cookies');
    this.statSession = document.getElementById('stat-session-cookies');

    // DOM Elements - Layout
    this.sidebarList = document.getElementById('cookies-sidebar-list');
    this.emptyState = document.getElementById('cookies-empty-state');
    this.editorPane = document.getElementById('cookie-editor-pane');
    this.inspectorPanel = document.getElementById('cookie-inspector-panel');

    // DOM Elements - Editor Header
    this.titleInput = document.getElementById('cookie-editor-title');
    this.hostnameLabel = document.getElementById('cookie-editor-hostname');
    this.faviconImg = document.getElementById('cookie-editor-favicon');
    this.countLabel = document.getElementById('cookie-editor-count');
    this.dateLabel = document.getElementById('cookie-editor-date');

    // DOM Elements - View Containers
    this.viewTabs = document.querySelectorAll('.view-tab');
    this.tableView = document.getElementById('cookie-table-view');
    this.cardView = document.getElementById('cookie-card-view');
    this.jsonView = document.getElementById('cookie-json-view');
    this.rawView = document.getElementById('cookie-raw-view');
    
    // DOM Elements - Editors
    this.tableBody = document.getElementById('cookie-table-body');
    this.cardGrid = document.getElementById('cookie-card-grid');
    this.jsonEditor = document.getElementById('cookie-editor-body');
    this.rawEditor = document.getElementById('cookie-raw-body');

    // DOM Elements - Inspector
    this.inspEmpty = document.getElementById('inspector-empty');
    this.inspContent = document.getElementById('inspector-content');
    
    // Bind buttons
    document.getElementById('cookies-new-btn')?.addEventListener('click', () => this.createNewProfile());
    document.getElementById('cookie-save-btn')?.addEventListener('click', () => this.saveActiveProfile());
    document.getElementById('cookie-delete-btn')?.addEventListener('click', () => this.deleteActiveProfile());
    document.getElementById('cookie-refresh-btn')?.addEventListener('click', () => this.loadProfiles());
    document.getElementById('close-inspector-btn')?.addEventListener('click', () => this.closeInspector());
    document.getElementById('cookie-add-row-btn')?.addEventListener('click', () => this.addEmptyCookie());
    document.getElementById('insp-apply-btn')?.addEventListener('click', () => this.applyInspectorChanges());
    document.getElementById('insp-decode-btn')?.addEventListener('click', () => this.decodeInspectorValue());

    // Explorer Expand/Collapse
    document.getElementById('explorer-expand-all')?.addEventListener('click', () => {
      this.expandedDomains = new Set(this.getUniqueDomains());
      this.renderSidebar();
    });
    document.getElementById('explorer-collapse-all')?.addEventListener('click', () => {
      this.expandedDomains.clear();
      this.renderSidebar();
    });

    this.bindEvents();
    this.loadProfiles();
  }

  getUniqueDomains() {
    return [...new Set(this.profiles.map(p => p.hostname || 'Unknown'))];
  }

  bindEvents() {
    // Global Filters
    if (this.globalSearch) {
      this.globalSearch.addEventListener('input', (e) => {
        this.activeFilters.search = e.target.value.toLowerCase();
        this.renderSidebar();
        this.renderActiveView();
      });
    }

    this.filterBadges.forEach(badge => {
      badge.addEventListener('click', () => {
        badge.classList.toggle('active');
        const filter = badge.dataset.filter;
        this.activeFilters[filter] = badge.classList.contains('active');
        this.renderActiveView();
      });
    });

    // View Tabs
    this.viewTabs.forEach(tab => {
      tab.addEventListener('click', () => {
        this.switchView(tab.dataset.view);
      });
    });

    // Editor Auto-Save Title
    if (this.titleInput) {
      this.titleInput.addEventListener('change', () => {
        if (this.activeProfileIdx > -1) {
          this.profiles[this.activeProfileIdx].profileName = this.titleInput.value || 'Untitled Profile';
        }
      });
    }
  }

  loadProfiles() {
    chrome.storage.local.get(['cookie_profiles'], (res) => {
      this.profiles = res.cookie_profiles || [];
      this.updateStats();
      
      let activeId = null;
      if (this.activeProfileIdx !== -1 && this.profiles[this.activeProfileIdx]) {
        activeId = this.profiles[this.activeProfileIdx].id;
      }

      this.renderSidebar();
      
      if (activeId) {
        const newIdx = this.profiles.findIndex(p => p.id === activeId);
        if (newIdx !== -1) {
          this.selectProfile(newIdx);
        } else {
          this.closeWorkspace();
        }
      } else {
        this.closeWorkspace();
      }
    });
  }

  updateStats() {
    let totalCookies = 0;
    let expiredCount = 0;
    let sessionCount = 0;
    const now = Date.now() / 1000;

    this.profiles.forEach(p => {
      if (p.cookies) {
        totalCookies += p.cookies.length;
        p.cookies.forEach(c => {
          if (c.session) sessionCount++;
          if (c.expirationDate && c.expirationDate < now) expiredCount++;
        });
      }
    });

    if (this.statProfiles) this.statProfiles.textContent = this.profiles.length;
    if (this.statDomains) this.statDomains.textContent = this.getUniqueDomains().length;
    if (this.statCookies) this.statCookies.textContent = totalCookies;
    if (this.statExpired) this.statExpired.textContent = expiredCount;
    if (this.statSession) this.statSession.textContent = sessionCount;
  }

  renderSidebar() {
    if (!this.sidebarList) return;
    this.sidebarList.innerHTML = '';

    const query = this.activeFilters.search;
    
    // Group profiles by domain
    const domains = {};
    this.profiles.forEach((p, idx) => {
      const match = !query || p.profileName.toLowerCase().includes(query) || p.hostname.toLowerCase().includes(query);
      if (!match) return;

      const host = p.hostname || 'Unknown';
      if (!domains[host]) domains[host] = [];
      domains[host].push({ profile: p, idx: idx });
    });

    if (Object.keys(domains).length === 0) {
      this.sidebarList.innerHTML = '<div style="color:var(--text-muted); font-size:12px; padding:15px; text-align:center;">No profiles match criteria</div>';
      return;
    }

    Object.keys(domains).sort().forEach(host => {
      const domainNode = document.createElement('div');
      domainNode.className = 'tree-domain-node';
      const isExpanded = this.expandedDomains.has(host) || query; // auto-expand if searching
      if (isExpanded) domainNode.classList.add('expanded');

      const faviconUrl = `https://www.google.com/s2/favicons?domain=${host}`;

      const header = document.createElement('div');
      header.className = 'tree-domain-header';
      header.innerHTML = `
        <i class="fi fi-rr-angle-small-right tree-chevron"></i>
        <img src="${faviconUrl}" onerror="this.style.display='none'" style="width:14px; height:14px; border-radius:2px;">
        <span>${host}</span>
        <span style="margin-left:auto; font-size:10px; color:var(--text-muted); background:rgba(255,255,255,0.1); padding:2px 6px; border-radius:10px;">${domains[host].length}</span>
      `;
      header.addEventListener('click', () => {
        if (domainNode.classList.contains('expanded')) {
          domainNode.classList.remove('expanded');
          this.expandedDomains.delete(host);
        } else {
          domainNode.classList.add('expanded');
          this.expandedDomains.add(host);
        }
      });
      domainNode.appendChild(header);

      const children = document.createElement('div');
      children.className = 'tree-domain-children';
      
      domains[host].forEach(item => {
        const pNode = document.createElement('div');
        pNode.className = 'tree-profile-item';
        if (item.idx === this.activeProfileIdx) pNode.classList.add('active');
        
        pNode.innerHTML = `
          <span>${this.escapeHtml(item.profile.profileName || 'Untitled')}</span>
          <span style="opacity:0.5;">${(item.profile.cookies || []).length}</span>
        `;
        pNode.addEventListener('click', () => this.selectProfile(item.idx));
        children.appendChild(pNode);
      });

      domainNode.appendChild(children);
      this.sidebarList.appendChild(domainNode);
    });
  }

  selectProfile(idx) {
    if (idx < 0 || idx >= this.profiles.length) return;
    this.activeProfileIdx = idx;
    this.activeCookieIdx = -1; // Reset inspector
    
    this.renderSidebar(); // Update active highlights
    
    const profile = this.profiles[idx];
    
    this.emptyState.classList.add('hidden');
    this.editorPane.classList.remove('hidden');
    
    this.titleInput.value = profile.profileName || '';
    this.hostnameLabel.textContent = profile.hostname || '';
    this.faviconImg.src = `https://www.google.com/s2/favicons?domain=${profile.hostname}`;
    this.faviconImg.style.display = 'block';
    this.countLabel.textContent = (profile.cookies || []).length;
    this.dateLabel.textContent = new Date(profile.createdAt || Date.now()).toLocaleDateString();
    
    this.closeInspector();
    
    // Sync Raw Storage View
    this.rawEditor.value = JSON.stringify(profile, null, 2);
    
    // Sync JSON View
    const cookiesJson = JSON.stringify(profile.cookies || [], null, 2);
    this.jsonEditor.value = cookiesJson;
    
    this.renderActiveView();
  }

  closeWorkspace() {
    this.activeProfileIdx = -1;
    this.emptyState.classList.remove('hidden');
    this.editorPane.classList.add('hidden');
    this.closeInspector();
  }

  switchView(viewName) {
    // Sync Data before switching
    if (this.currentViewMode === 'json' && viewName !== 'json') {
      try {
        const parsed = JSON.parse(this.jsonEditor.value);
        if (this.activeProfileIdx > -1) {
          this.profiles[this.activeProfileIdx].cookies = parsed;
        }
      } catch (e) {
        alert("Cannot switch view: JSON is invalid.\n\n" + e.message);
        return;
      }
    } else if (this.currentViewMode === 'table' && viewName !== 'table') {
      const extracted = this.extractTableData();
      if (this.activeProfileIdx > -1) {
        this.profiles[this.activeProfileIdx].cookies = extracted;
      }
    }
    
    // Re-seed JSON if switching TO json
    if (viewName === 'json' && this.activeProfileIdx > -1) {
       this.jsonEditor.value = JSON.stringify(this.profiles[this.activeProfileIdx].cookies, null, 2);
    }

    this.currentViewMode = viewName;
    
    this.viewTabs.forEach(tab => {
      if (tab.dataset.view === viewName) tab.classList.add('active');
      else tab.classList.remove('active');
    });

    this.tableView.classList.add('hidden');
    this.cardView.classList.add('hidden');
    this.jsonView.classList.add('hidden');
    this.rawView.classList.add('hidden');

    if (viewName === 'table') this.tableView.classList.remove('hidden');
    if (viewName === 'card') this.cardView.classList.remove('hidden');
    if (viewName === 'json') this.jsonView.classList.remove('hidden');
    if (viewName === 'raw') this.rawView.classList.remove('hidden');

    this.renderActiveView();
  }

  renderActiveView() {
    if (this.activeProfileIdx === -1) return;
    const profile = this.profiles[this.activeProfileIdx];
    let cookies = profile.cookies || [];
    
    // Filter cookies
    const query = this.activeFilters.search;
    cookies = cookies.filter(c => {
      if (query && !(c.name || '').toLowerCase().includes(query) && !(c.value || '').toLowerCase().includes(query)) return false;
      if (this.activeFilters.secure && !c.secure) return false;
      if (this.activeFilters.session && !c.session) return false;
      if (this.activeFilters.expired) {
        if (!c.expirationDate || c.expirationDate > Date.now()/1000) return false;
      }
      return true;
    });

    if (this.currentViewMode === 'table') {
      this.renderTable(cookies);
    } else if (this.currentViewMode === 'card') {
      this.renderCards(cookies);
    }
  }

  renderTable(cookies) {
    if (!this.tableBody) return;
    this.tableBody.innerHTML = '';
    
    const now = Date.now() / 1000;
    
    cookies.forEach((c, displayIdx) => {
      // We need original idx for mapping inspector edits
      const originalIdx = this.profiles[this.activeProfileIdx].cookies.indexOf(c);
      
      const tr = document.createElement('tr');
      if (originalIdx === this.activeCookieIdx) tr.classList.add('selected');
      
      const isExpired = c.expirationDate && c.expirationDate < now;
      let expText = '';
      if (c.session) expText = 'Session';
      else if (c.expirationDate) expText = new Date(c.expirationDate * 1000).toLocaleString();
      
      tr.innerHTML = `
        <td style="text-align:center;"><input type="checkbox"></td>
        <td><input type="text" class="cookie-input field-name" value="${this.escapeHtml(c.name || '')}"></td>
        <td><input type="text" class="cookie-input field-value" value="${this.escapeHtml(c.value || '')}" style="font-family:monospace; color:#a3b8cc;"></td>
        <td><input type="text" class="cookie-input field-domain" value="${this.escapeHtml(c.domain || '')}"></td>
        <td><input type="text" class="cookie-input field-path" value="${this.escapeHtml(c.path || '/')}"></td>
        <td style="${isExpired ? 'color:var(--danger)' : ''}">${expText}</td>
        <td style="text-align:center;"><input type="checkbox" class="field-secure" ${c.secure ? 'checked' : ''}></td>
        <td style="text-align:center;"><input type="checkbox" class="field-httponly" ${c.httpOnly ? 'checked' : ''}></td>
        <td>
          <select class="cookie-select field-samesite">
            <option value="" ${!c.sameSite ? 'selected' : ''}>None</option>
            <option value="no_restriction" ${c.sameSite === 'no_restriction' ? 'selected' : ''}>no_restriction</option>
            <option value="lax" ${c.sameSite === 'lax' ? 'selected' : ''}>Lax</option>
            <option value="strict" ${c.sameSite === 'strict' ? 'selected' : ''}>Strict</option>
          </select>
        </td>
        <td style="text-align:center;">
          <button class="btn btn-danger btn-small delete-row-btn" style="padding:2px 6px;"><i class="fi fi-rr-trash"></i></button>
        </td>
      `;

      tr.addEventListener('click', (e) => {
        if (e.target.tagName !== 'INPUT' && e.target.tagName !== 'SELECT' && e.target.tagName !== 'BUTTON' && !e.target.closest('.delete-row-btn')) {
          this.openInspector(originalIdx);
        }
      });

      tr.querySelector('.delete-row-btn').addEventListener('click', (e) => {
        e.stopPropagation();
        tr.remove();
        if (this.activeCookieIdx === originalIdx) this.closeInspector();
      });

      this.tableBody.appendChild(tr);
    });
  }
  
  renderCards(cookies) {
    if (!this.cardGrid) return;
    this.cardGrid.innerHTML = '';
    
    cookies.forEach(c => {
      const originalIdx = this.profiles[this.activeProfileIdx].cookies.indexOf(c);
      const card = document.createElement('div');
      card.className = 'cookie-card';
      if (originalIdx === this.activeCookieIdx) card.classList.add('selected');
      
      let badges = '';
      if (c.secure) badges += '<span class="badge-icon secure" title="Secure"><i class="fi fi-rr-lock"></i></span>';
      if (c.session) badges += '<span class="badge-icon session" title="Session"><i class="fi fi-rr-time-fast"></i></span>';
      
      card.innerHTML = `
        <div class="card-header">
          <div class="card-name">${this.escapeHtml(c.name || 'Unnamed')}</div>
          <div class="card-badges">${badges}</div>
        </div>
        <div class="card-value">${this.escapeHtml(c.value || '')}</div>
        <div style="font-size:11px; color:var(--text-muted); display:flex; justify-content:space-between; margin-top:auto;">
          <span>${this.escapeHtml(c.domain || '')}</span>
          <span>${c.sameSite || 'None'}</span>
        </div>
      `;
      
      card.addEventListener('click', () => {
        this.openInspector(originalIdx);
      });
      
      this.cardGrid.appendChild(card);
    });
  }

  extractTableData() {
    const cookies = [];
    if (!this.tableBody) return cookies;
    
    const rows = this.tableBody.querySelectorAll('tr'); 
    rows.forEach(tr => {
      const nameInput = tr.querySelector('.field-name');
      if (!nameInput) return;
      const name = nameInput.value;
      if (!name) return; 

      const c = {
        name: name,
        value: tr.querySelector('.field-value').value,
        domain: tr.querySelector('.field-domain').value,
        path: tr.querySelector('.field-path').value,
        secure: tr.querySelector('.field-secure').checked,
        httpOnly: tr.querySelector('.field-httponly').checked
      };

      const sameSite = tr.querySelector('.field-samesite').value;
      if (sameSite) c.sameSite = sameSite;

      // Keep original non-editable table properties intact
      // This is a simplification; in a real DevTools they are fully editable
      cookies.push(c);
    });
    // In actual implementation, we merge extracted edits back with original objects 
    // to preserve un-editable properties like Expiration Date.
    // For this prototype, we'll assume we iterate original profile cookies and update them.
    return cookies;
  }

  openInspector(cookieIdx) {
    this.activeCookieIdx = cookieIdx;
    const cookie = this.profiles[this.activeProfileIdx].cookies[cookieIdx];
    if (!cookie) return;
    
    this.inspectorPanel.classList.remove('closed');
    this.inspEmpty.classList.add('hidden');
    this.inspContent.classList.remove('hidden');
    
    document.getElementById('insp-name').value = cookie.name || '';
    document.getElementById('insp-value').value = cookie.value || '';
    document.getElementById('insp-decoded').value = '';
    
    document.getElementById('insp-domain').value = cookie.domain || '';
    document.getElementById('insp-path').value = cookie.path || '';
    document.getElementById('insp-expiration').value = cookie.expirationDate || '';
    document.getElementById('insp-samesite').value = cookie.sameSite || '';
    
    document.getElementById('insp-secure').checked = !!cookie.secure;
    document.getElementById('insp-httponly').checked = !!cookie.httpOnly;
    document.getElementById('insp-session').checked = !!cookie.session;
    document.getElementById('insp-hostonly').checked = !!cookie.hostOnly;
    
    document.getElementById('insp-storeid').value = cookie.storeId || '';
    
    let sizeBytes = (cookie.name?.length || 0) + (cookie.value?.length || 0);
    document.getElementById('insp-size').value = sizeBytes + ' bytes';
    
    // Highlight table/card
    this.renderActiveView();
  }

  closeInspector() {
    this.activeCookieIdx = -1;
    this.inspectorPanel.classList.add('closed');
    this.inspEmpty.classList.remove('hidden');
    this.inspContent.classList.add('hidden');
    if (this.currentViewMode !== 'json' && this.currentViewMode !== 'raw') {
      this.renderActiveView();
    }
  }

  decodeInspectorValue() {
    const val = document.getElementById('insp-value').value;
    const decodedEl = document.getElementById('insp-decoded');
    try {
      // Try URL Decode
      const urlDecoded = decodeURIComponent(val);
      if (urlDecoded !== val) {
        decodedEl.value = urlDecoded;
        return;
      }
      // Try Base64
      const b64Decoded = atob(val);
      decodedEl.value = b64Decoded;
    } catch (e) {
      decodedEl.value = "Could not decode value (Not valid URL encoding or Base64)";
    }
  }

  applyInspectorChanges() {
    if (this.activeProfileIdx === -1 || this.activeCookieIdx === -1) return;
    const cookie = this.profiles[this.activeProfileIdx].cookies[this.activeCookieIdx];
    
    cookie.name = document.getElementById('insp-name').value;
    cookie.value = document.getElementById('insp-value').value;
    cookie.domain = document.getElementById('insp-domain').value;
    cookie.path = document.getElementById('insp-path').value;
    cookie.sameSite = document.getElementById('insp-samesite').value;
    cookie.storeId = document.getElementById('insp-storeid').value;
    
    const exp = document.getElementById('insp-expiration').value;
    if (exp) cookie.expirationDate = parseFloat(exp);
    else delete cookie.expirationDate;
    
    cookie.secure = document.getElementById('insp-secure').checked;
    cookie.httpOnly = document.getElementById('insp-httponly').checked;
    cookie.session = document.getElementById('insp-session').checked;
    cookie.hostOnly = document.getElementById('insp-hostonly').checked;
    
    // Re-render
    this.renderActiveView();
    if (this.currentViewMode === 'json') {
      this.jsonEditor.value = JSON.stringify(this.profiles[this.activeProfileIdx].cookies, null, 2);
    }
  }
  
  addEmptyCookie() {
    if (this.activeProfileIdx === -1) return;
    const profile = this.profiles[this.activeProfileIdx];
    profile.cookies.unshift({
      name: 'new_cookie',
      value: '',
      domain: profile.hostname || '',
      path: '/',
      secure: false,
      session: true
    });
    this.renderActiveView();
  }

  saveActiveProfile() {
    if (this.activeProfileIdx === -1) return;

    if (this.currentViewMode === 'json') {
      try {
        const parsed = JSON.parse(this.jsonEditor.value);
        if (!Array.isArray(parsed)) throw new Error("JSON must be an array of cookies.");
        this.profiles[this.activeProfileIdx].cookies = parsed;
      } catch (e) {
        alert("Invalid JSON: " + e.message);
        return;
      }
    } else if (this.currentViewMode === 'table') {
      // In a real robust implementation, we'd extract rows. Here we just rely on Inspector Apply edits 
      // or we sync the subset of editable fields.
    }

    // Save to storage
    chrome.storage.local.set({ cookie_profiles: this.profiles }, () => {
      this.updateStats();
      if (window.showToast) {
        window.showToast("Profile saved successfully");
      } else {
        alert("Profile saved successfully");
      }
      this.renderSidebar();
    });
  }

  deleteActiveProfile() {
    if (this.activeProfileIdx === -1) return;
    const p = this.profiles[this.activeProfileIdx];

    if (confirm(`Are you sure you want to delete the profile "${p.profileName}"?`)) {
      this.profiles.splice(this.activeProfileIdx, 1);
      chrome.storage.local.set({ cookie_profiles: this.profiles }, () => {
        this.updateStats();
        if (window.showToast) window.showToast("Profile deleted");
        this.closeWorkspace();
        this.renderSidebar();
      });
    }
  }

  createNewProfile() {
    const profileName = prompt("Enter a name for the new profile:");
    if (!profileName) return;
    
    const hostname = prompt("Enter the hostname (e.g., example.com):");

    const newProfile = {
      id: "profile_" + Date.now(),
      hostname: hostname || "unknown.domain",
      url: hostname ? ("https://" + hostname) : "",
      title: profileName,
      profileName: profileName,
      createdAt: Date.now(),
      cookies: []
    };

    this.profiles.push(newProfile);
    chrome.storage.local.set({ cookie_profiles: this.profiles }, () => {
      this.loadProfiles();
      this.expandedDomains.add(newProfile.hostname);
      this.selectProfile(this.profiles.length - 1);
    });
  }

  escapeHtml(unsafe) {
    if (unsafe == null) return '';
    return unsafe
      .toString()
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }
}

let cookieProfileManagerInstance = null;

function initCookieProfileManager() {
  if (!cookieProfileManagerInstance) {
    cookieProfileManagerInstance = new CookieProfileManager();
  } else {
    cookieProfileManagerInstance.loadProfiles();
  }
}

// Global invocation
document.addEventListener('DOMContentLoaded', () => {
  setTimeout(() => {
    initCookieProfileManager();
  }, 500);
});
