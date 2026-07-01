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

  async init() {
    this.activeView = 'bookmarks';
    this.bindDOM();
    this.setupListeners();
    this.setupColumnResizing();
    
    // Load persisted settings
    chrome.storage.local.get(['organizer_user_settings'], (result) => {
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
      }
    });

    await this.refreshLibrary();
  },

  bindDOM() {
    this.viewManager = document.getElementById('manager-view');
    this.viewWizard = document.getElementById('wizard-view');
    this.toggleManagerBtn = document.getElementById('toggle-manager-btn');
    this.toggleWizardBtn = document.getElementById('toggle-wizard-btn');
    
    this.searchInput = document.getElementById('manager-search');
    this.clearSearchBtn = document.getElementById('clear-search-btn');
    this.suggestionsDropdown = document.getElementById('command-suggestions');
    
    this.breadcrumbsContainer = document.getElementById('explorer-breadcrumbs');
    this.bookmarksBody = document.getElementById('manager-bookmarks-body');
    this.emptyState = document.getElementById('manager-empty-state');
    
    this.folderTreeList = document.getElementById('folder-tree-list');
    this.addBookmarkBtn = document.getElementById('add-bookmark-btn');
    
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
    this.settingsCcTheme = document.getElementById('settings-cc-theme');
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
  },

  setupListeners() {
    // Toggle Views
    this.toggleWizardBtn.addEventListener('click', () => this.showWizard());
    this.toggleManagerBtn.addEventListener('click', () => this.showManager());

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
        this.loadCookies(val);
      }
    });
    this.searchInput.addEventListener('keydown', (e) => this.handleSearchKeydown(e));
    this.clearSearchBtn.addEventListener('click', () => {
      this.searchInput.value = '';
      if (this.activeView === 'bookmarks') {
        this.handleSearchInput('');
      } else if (this.activeView === 'history') {
        this.loadHistory('');
      } else if (this.activeView === 'cookies') {
        this.loadCookies('');
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

    // History Toolbar listeners
    const selectAllCb = document.getElementById('history-select-all');
    if (selectAllCb) {
      selectAllCb.addEventListener('change', (e) => {
        const checked = e.target.checked;
        document.querySelectorAll('.history-row-cb').forEach(cb => {
          cb.checked = checked;
        });
      });
    }

    const deleteSelectedBtn = document.getElementById('history-delete-selected');
    if (deleteSelectedBtn) {
      deleteSelectedBtn.addEventListener('click', () => {
        const checkedCbs = document.querySelectorAll('.history-row-cb:checked');
        if (checkedCbs.length === 0) {
          showToast('No history items selected!', 'error');
          return;
        }
        const confirmDelete = confirm(`Are you sure you want to delete the ${checkedCbs.length} selected history items?`);
        if (!confirmDelete) return;

        let deletedCount = 0;
        checkedCbs.forEach(cb => {
          const url = cb.dataset.url;
          chrome.history.deleteUrl({ url: url }, () => {
            const tr = cb.closest('tr');
            if (tr) tr.remove();
            deletedCount++;
            if (deletedCount === checkedCbs.length) {
              showToast(`Deleted ${deletedCount} history items!`, 'success');
              if (selectAllCb) selectAllCb.checked = false;
              if (this.bookmarksBody.children.length === 0) {
                this.emptyState.classList.remove('hidden');
                document.getElementById('empty-state-text').textContent = "No history items found.";
              }
            }
          });
        });
      });
    }

    const clearAllBtn = document.getElementById('history-clear-all');
    if (clearAllBtn) {
      clearAllBtn.addEventListener('click', () => {
        const confirmClear = confirm("Are you sure you want to clear ALL browsing history? This will delete all search results visible here from Chrome's database.");
        if (!confirmClear) return;
        chrome.history.deleteAll(() => {
          this.loadHistory();
          showToast('History cleared completely!', 'success');
        });
      });
    }

    const sortSelect = document.getElementById('history-sort-select');
    if (sortSelect) {
      sortSelect.addEventListener('change', () => {
        this.loadHistory();
      });
    }

    const manageListsBtn = document.getElementById('history-manage-lists-btn');
    if (manageListsBtn) {
      manageListsBtn.addEventListener('click', () => {
        this.switchView('settings');
      });
    }

    // Close any history row dropdown menus when clicking outside
    document.addEventListener('click', () => {
      document.querySelectorAll('.history-row-menu').forEach(el => el.classList.add('hidden'));
    });
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
        function buildTreeDOM(node) {
          // If it is a folder and not system root (id "0")
          if (node.children && !node.url && node.id !== "0") {
            const folderLi = document.createElement('li');
            folderLi.className = 'manager-tree-folder';
            
            const labelDiv = document.createElement('div');
            labelDiv.className = `folder-tree-label ${self.activeFolderId === node.id ? 'active' : ''}`;
            labelDiv.dataset.folderId = node.id;
            
            // Drag and Drop Zone listeners for folder drop targets with spring-loaded expansion
            let hoverTimer = null;
            
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
            
            const subfolders = node.children.filter(child => child.children && !child.url);
            const hasSubfolders = subfolders.length > 0;
            
            let toggleHtml = '';
            if (hasSubfolders) {
              toggleHtml = `<span class="tree-toggle-arrow">▶</span>`;
            } else {
              toggleHtml = `<span class="tree-toggle-arrow spacer"></span>`;
            }

            labelDiv.innerHTML = `
              ${toggleHtml}
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="currentColor" style="color:var(--color-secondary); margin-right:4px;"><path d="M19.5,5H13.243a3,3,0,0,1-2.122-.879l-1.414-1.414A3,3,0,0,0,7.586,1.828H4.5A2.5,2.5,0,0,0,2,4.328V19.5A2.5,2.5,0,0,0,4.5,22h15A2.5,2.5,0,0,0,22,19.5V7.5A2.5,2.5,0,0,0,19.5,5ZM20,19.5a.5.5,0,0,1-.5.5H4.5a.5.5,0,0,1-.5-.5V7.5A.5.5,0,0,1,4.5,7h15a.5.5,0,0,1,.5.5Z"/></svg>
              <span class="folder-name-text" title="${node.title}">${displayTitle}</span>
            `;
            
            folderLi.appendChild(labelDiv);

            if (hasSubfolders) {
              const childrenUl = document.createElement('ul');
              childrenUl.className = 'manager-tree-children';
              childrenUl.style.display = 'none';
              subfolders.forEach(sub => {
                const subDOM = buildTreeDOM(sub);
                if (subDOM) childrenUl.appendChild(subDOM);
              });
              folderLi.appendChild(childrenUl);

              // Click logic on the entire label container to switch folder AND toggle expand/collapse
              const arrow = labelDiv.querySelector('.tree-toggle-arrow');
              labelDiv.addEventListener('click', (e) => {
                e.stopPropagation();
                self.switchFolder(node.id);
                
                const isExpanded = arrow.classList.contains('expanded');
                if (isExpanded) {
                  arrow.classList.remove('expanded');
                  arrow.textContent = '▶';
                  childrenUl.style.display = 'none';
                } else {
                  arrow.classList.add('expanded');
                  arrow.textContent = '▼';
                  childrenUl.style.display = 'flex';
                }
              });
            } else {
              // No subfolders, just switch folder on click
              labelDiv.addEventListener('click', (e) => {
                e.stopPropagation();
                self.switchFolder(node.id);
              });
            }
            return folderLi;
          }
          return null;
        }

        if (tree && tree[0] && tree[0].children) {
          tree[0].children.forEach(child => {
            const childDOM = buildTreeDOM(child);
            if (childDOM) rootUl.appendChild(childDOM);
          });
        }

        this.folderTreeList.appendChild(rootUl);
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
      this.executeCommandSearch(val);
    } else {
      this.hideSuggestions();
      // Normal string query matching globally
      const query = val.toLowerCase();
      const results = this.allFlattenedBookmarks.filter(bm => 
        (bm.title && bm.title.toLowerCase().includes(query)) || 
        (bm.url && bm.url.toLowerCase().includes(query))
      );
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

  executeCommandSearch(val) {
    const parts = val.split(' ');
    const cmd = parts[0].toLowerCase();
    const query = parts.slice(1).join(' ').trim().toLowerCase();

    let results = [];
    let breadcrumbTitle = `Filter: ${cmd}`;

    switch (cmd) {
      case '/help':
      case '/?':
        this.showHelpOverlay();
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
        this.searchInput.placeholder = "Notes Workspace - search disabled";
        this.searchInput.disabled = true;
      } else if (viewName === 'settings') {
        this.searchInput.placeholder = "Settings Panel - search disabled";
        this.searchInput.disabled = true;
      }
      this.searchInput.value = '';
    }
    
    // Hide folders sidebar tree if not in bookmarks view (since folder directory is only for bookmarks!)
    const navigationBox = document.querySelector('.navigation-box');
    if (navigationBox) {
      if (viewName === 'bookmarks') {
        navigationBox.style.display = 'block';
      } else {
        navigationBox.style.display = 'none';
      }
    }

    // Toggle visibility of bookmarks table vs settings view vs notes view
    const tableEl = document.getElementById('bookmarks-table');
    const settingsEl = document.getElementById('settings-view-container');
    const notesEl = document.getElementById('notes-view-container');
    
    if (viewName === 'settings') {
      if (tableEl) tableEl.classList.add('hidden');
      if (settingsEl) settingsEl.classList.remove('hidden');
      if (notesEl) notesEl.classList.add('hidden');
    } else if (viewName === 'notes') {
      if (tableEl) tableEl.classList.add('hidden');
      if (settingsEl) settingsEl.classList.add('hidden');
      if (notesEl) notesEl.classList.remove('hidden');
    } else {
      if (tableEl) tableEl.classList.remove('hidden');
      if (settingsEl) settingsEl.classList.add('hidden');
      if (notesEl) notesEl.classList.add('hidden');
    }
    
    // Refresh content
    this.refreshViewContent();
  },

  async refreshViewContent() {
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
      document.getElementById('explorer-breadcrumbs').style.display = 'flex';
      document.getElementById('add-bookmark-btn').style.display = 'inline-flex';
      
      // Update Table Headers
      document.getElementById('th-name').innerHTML = `Name <span id="sort-icon-name"></span><div class="col-resizer"></div>`;
      document.getElementById('th-url').innerHTML = `URL <span id="sort-icon-url"></span>`;
      this.setupColumnResizing(); // rebind resizer
      
      await this.loadFolderContents(this.activeFolderId);
    } else if (this.activeView === 'history') {
      // History view: hide folder breadcrumbs, hide add bookmark button
      document.getElementById('explorer-breadcrumbs').style.display = 'none';
      document.getElementById('add-bookmark-btn').style.display = 'none';
      
      // Update Table Headers
      document.getElementById('th-name').innerHTML = `Page Title`;
      document.getElementById('th-url').innerHTML = `URL / Last Visited`;
      
      this.loadHistory();
    } else if (this.activeView === 'cookies') {
      // Cookies view: hide breadcrumbs, hide add button
      document.getElementById('explorer-breadcrumbs').style.display = 'none';
      document.getElementById('add-bookmark-btn').style.display = 'none';
      
      // Update Table Headers
      document.getElementById('th-name').innerHTML = `Domain / Site`;
      document.getElementById('th-url').innerHTML = `Cookie Details`;
      
      this.loadCookies();
    } else if (this.activeView === 'notes') {
      // Notes view: hide breadcrumbs, hide add button
      document.getElementById('explorer-breadcrumbs').style.display = 'none';
      document.getElementById('add-bookmark-btn').style.display = 'none';
      this.emptyState.classList.add('hidden');
      
      this.loadNotesManager();
    } else if (this.activeView === 'settings') {
      // Settings view: hide breadcrumbs, hide add button
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
        label.style.cssText = 'display:flex; align-items:center; gap:8px; font-size:13px; color:white; cursor:pointer; padding:6px; border-radius:6px; background:rgba(255,255,255,0.03); border:1px solid rgba(255,255,255,0.04);';
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
      if (this.settingsCcTheme) {
        this.settingsCcTheme.value = settings.ccTheme || 'black';
      }
      if (this.settingsCcBlur) {
        this.settingsCcBlur.value = settings.ccBlur !== undefined ? settings.ccBlur : 15;
        if (this.settingsCcBlurVal) {
          this.settingsCcBlurVal.textContent = (settings.ccBlur !== undefined ? settings.ccBlur : 15) + 'px';
        }
      }
      if (this.settingsCcHistory) {
        this.settingsCcHistory.checked = settings.ccHistory !== false;
      }
      if (this.settingsHistoryBlacklist) {
        this.settingsHistoryBlacklist.value = settings.historyBlacklist || '';
      }
      if (this.settingsHistoryWhitelist) {
        this.settingsHistoryWhitelist.value = settings.historyWhitelist || '';
      }
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
    
    // 4. Save to local storage settings snapshot
    const ccThemeVal = this.settingsCcTheme ? this.settingsCcTheme.value : 'black';
    const ccBlurVal = this.settingsCcBlur ? parseInt(this.settingsCcBlur.value, 10) : 15;
    const ccHistoryVal = this.settingsCcHistory ? this.settingsCcHistory.checked : true;
    const blacklistVal = this.settingsHistoryBlacklist ? this.settingsHistoryBlacklist.value : '';
    const whitelistVal = this.settingsHistoryWhitelist ? this.settingsHistoryWhitelist.value : '';

    const settingsObj = {
      parentFolderName: this.settingsParentName ? this.settingsParentName.value : 'Bookmarks Bar',
      threshold: this.settingsThresholdSlider ? this.settingsThresholdSlider.value : '5',
      ccTheme: ccThemeVal,
      ccBlur: ccBlurVal,
      ccHistory: ccHistoryVal,
      historyBlacklist: blacklistVal,
      historyWhitelist: whitelistVal
    };
    chrome.storage.local.set({ 'organizer_user_settings': settingsObj }, () => {
      // Sync categories list in Wizard step 1 UI (refresh checkmarks)
      if (typeof initCategoriesUI === 'function') {
        initCategoriesUI();
      }

      showToast('Settings successfully updated and saved!', 'success');
      this.switchView('bookmarks');
    });
  },

  loadHistory(query = '') {
    this.bookmarksBody.innerHTML = '';
    
    // Show history toolbar actions
    const historyToolbar = document.getElementById('history-toolbar');
    if (historyToolbar) historyToolbar.classList.remove('hidden');
    
    chrome.storage.local.get(['organizer_user_settings'], (settingsResult) => {
      const settings = settingsResult.organizer_user_settings || {};
      const blacklistStr = settings.historyBlacklist || '';
      const whitelistStr = settings.historyWhitelist || '';
      
      const blacklist = blacklistStr.split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
      const whitelist = whitelistStr.split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
      
      chrome.history.search({ text: query, maxResults: 200 }, (historyItems) => {
        if (chrome.runtime.lastError || !historyItems || historyItems.length === 0) {
          this.emptyState.classList.remove('hidden');
          document.getElementById('empty-state-text').textContent = "No history items found.";
          return;
        }
        
        // Filter history items by blacklist & whitelist
        let filteredItems = historyItems.filter(item => {
          const domain = BookmarkRules.getDomain(item.url);
          // 1. Blacklist check
          if (blacklist.some(d => domain === d || domain.endsWith('.' + d))) {
            return false;
          }
          // 2. Whitelist check
          if (whitelist.length > 0 && !whitelist.some(d => domain === d || domain.endsWith('.' + d))) {
            return false;
          }
          return true;
        });

        if (filteredItems.length === 0) {
          this.emptyState.classList.remove('hidden');
          document.getElementById('empty-state-text').textContent = "No history items match your filters.";
          return;
        }
        
        this.emptyState.classList.add('hidden');

        // Sort filteredItems based on the selected option
        const sortSelect = document.getElementById('history-sort-select');
        const sortVal = sortSelect ? sortSelect.value : 'date-desc';
        if (sortVal === 'date-desc') {
          filteredItems.sort((a, b) => b.lastVisitTime - a.lastVisitTime);
        } else if (sortVal === 'date-asc') {
          filteredItems.sort((a, b) => a.lastVisitTime - b.lastVisitTime);
        } else if (sortVal === 'visits-desc') {
          filteredItems.sort((a, b) => b.visitCount - a.visitCount);
        } else if (sortVal === 'title-asc') {
          filteredItems.sort((a, b) => (a.title || '').localeCompare(b.title || ''));
        }

        filteredItems.forEach(item => {
          const tr = document.createElement('tr');
          tr.dataset.itemId = item.id;
          tr.dataset.itemUrl = item.url;
          
          const visitTime = new Date(item.lastVisitTime).toLocaleString();
          const cleanDomain = BookmarkRules.getDomain(item.url);
          const faviconUrl = `https://www.google.com/s2/favicons?sz=32&domain=${cleanDomain}`;
          
          tr.innerHTML = `
            <td>
              <div class="table-cell-name">
                <input type="checkbox" class="history-row-cb" data-url="${item.url}" style="margin-right: 8px; cursor: pointer;" onclick="event.stopPropagation()">
                <span><img class="table-favicon" src="${faviconUrl}" onerror="this.src='../icons/icon16.png'"></span>
                <a href="${item.url}" target="_blank" class="table-link" title="${item.title || item.url}">${item.title || item.url}</a>
              </div>
            </td>
            <td title="${item.url}">
              <div style="display:flex; flex-direction:column; gap:2px;">
                <a href="${item.url}" target="_blank" style="color:var(--text-muted); text-decoration:none; font-size:12.5px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; display:block; max-width:400px;">${item.url}</a>
                <span style="font-size:11px; color:rgba(255,255,255,0.4);">Visited: ${visitTime} &bull; Visits: ${item.visitCount}</span>
              </div>
            </td>
            <td class="table-actions-cell" style="text-align:center; position: relative;">
              <div class="history-actions-menu" style="display: flex; gap: 8px; justify-content: center; align-items: center;">
                <button class="action-icon-btn delete-history-btn" title="Delete from History">🗑️</button>
                <button class="action-icon-btn history-more-btn" title="More options" style="font-size: 14px; padding: 2px 6px;">⋮</button>
                <!-- Row Dropdown Context Menu -->
                <div class="history-row-menu hidden" style="position: absolute; right: 20px; top: 30px; background: #1e1e24; border: 1px solid rgba(255,255,255,0.1); border-radius: 8px; box-shadow: 0 10px 25px rgba(0,0,0,0.5); z-index: 100; min-width: 140px; display: flex; flex-direction: column; padding: 4px 0;">
                  <button class="menu-item blacklist-domain-btn" style="background: transparent; border: none; color: white; padding: 8px 12px; text-align: left; font-size: 12px; cursor: pointer; display: flex; align-items: center; gap: 6px; width: 100%;">🚫 Blacklist Domain</button>
                  <button class="menu-item whitelist-domain-btn" style="background: transparent; border: none; color: white; padding: 8px 12px; text-align: left; font-size: 12px; cursor: pointer; display: flex; align-items: center; gap: 6px; width: 100%;">✔️ Whitelist Domain</button>
                </div>
              </div>
            </td>
          `;
          
          tr.querySelector('.delete-history-btn').addEventListener('click', (e) => {
            e.stopPropagation();
            chrome.history.deleteUrl({ url: item.url }, () => {
              tr.remove();
              showToast('History item removed!', 'success');
              if (this.bookmarksBody.children.length === 0) {
                this.emptyState.classList.remove('hidden');
                document.getElementById('empty-state-text').textContent = "No history items found.";
              }
            });
          });

          const moreBtn = tr.querySelector('.history-more-btn');
          const rowMenu = tr.querySelector('.history-row-menu');
          moreBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            document.querySelectorAll('.history-row-menu').forEach(el => {
              if (el !== rowMenu) el.classList.add('hidden');
            });
            rowMenu.classList.toggle('hidden');
          });

          tr.querySelector('.blacklist-domain-btn').addEventListener('click', (e) => {
            e.stopPropagation();
            rowMenu.classList.add('hidden');
            this.addDomainToFilter(cleanDomain, 'blacklist');
          });

          tr.querySelector('.whitelist-domain-btn').addEventListener('click', (e) => {
            e.stopPropagation();
            rowMenu.classList.add('hidden');
            this.addDomainToFilter(cleanDomain, 'whitelist');
          });
          
          this.bookmarksBody.appendChild(tr);
        });
      });
    });
  },

  addDomainToFilter(domain, type) {
    chrome.storage.local.get(['organizer_user_settings'], (result) => {
      const settings = result.organizer_user_settings || {};
      const key = type === 'blacklist' ? 'historyBlacklist' : 'historyWhitelist';
      const oldStr = settings[key] || '';
      const list = oldStr.split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
      
      if (!list.includes(domain)) {
        list.push(domain);
        settings[key] = list.join(', ');
        chrome.storage.local.set({ 'organizer_user_settings': settings }, () => {
          showToast(`Added ${domain} to history ${type}!`, 'success');
          if (type === 'blacklist') {
            chrome.history.search({ text: domain, maxResults: 1000 }, (historyItems) => {
              historyItems.forEach(item => {
                const itemDomain = BookmarkRules.getDomain(item.url);
                if (itemDomain === domain || itemDomain.endsWith('.' + domain)) {
                  chrome.history.deleteUrl({ url: item.url });
                }
              });
            });
          }
          this.loadHistory();
        });
      } else {
        showToast(`${domain} is already in the ${type} list.`, 'error');
      }
    });
  },

  loadCookies(filterQuery = '') {
    this.bookmarksBody.innerHTML = '';
    
    chrome.cookies.getAll({}, (allCookies) => {
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

  loadNotesManager() {
    if (!this.notesSidebarList) return;
    this.notesSidebarList.innerHTML = '';
    
    chrome.storage.local.get(['bookmark_organizer_notes'], (result) => {
      const notes = result.bookmark_organizer_notes || {};
      const names = Object.keys(notes);
      
      names.forEach(name => {
        const btn = document.createElement('div');
        btn.style.cssText = 'padding: 8px 12px; border-radius: 6px; background: rgba(255,255,255,0.02); border: 1px solid rgba(255,255,255,0.05); color: white; font-size: 13px; cursor: pointer; text-overflow: ellipsis; overflow: hidden; white-space: nowrap; transition: all 0.2s;';
        if (name === this.activeNoteName) {
          btn.style.background = 'rgba(16, 185, 129, 0.12)';
          btn.style.borderColor = 'rgba(16, 185, 129, 0.3)';
        }
        btn.textContent = `📝 ${name}`;
        btn.addEventListener('click', () => {
          this.selectNote(name);
        });
        this.notesSidebarList.appendChild(btn);
      });
    });
  },

  selectNote(name) {
    this.activeNoteName = name;
    this.noteEditorPlaceholder.classList.add('hidden');
    this.noteEditorPane.classList.remove('hidden');
    this.noteEditorTitle.value = name;
    
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
      
      this.noteEditorBody.value = content;
      this.renderNoteVersions(name, versions);
      
      if (this.notesSidebarList) {
        const children = Array.from(this.notesSidebarList.children);
        children.forEach(child => {
          if (child.textContent === `📝 ${name}`) {
            child.style.background = 'rgba(16, 185, 129, 0.12)';
            child.style.borderColor = 'rgba(16, 185, 129, 0.3)';
          } else {
            child.style.background = 'rgba(255,255,255,0.02)';
            child.style.borderColor = 'rgba(255,255,255,0.05)';
          }
        });
      }
    });
  },

  renderNoteVersions(noteName, versions) {
    this.noteVersionsList.innerHTML = '';
    if (versions.length === 0) {
      this.noteVersionsList.innerHTML = '<span style="font-size: 11.5px; color: var(--text-muted); text-align: center; padding: 10px 0; display: block; width: 100%;">No revisions saved.</span>';
      return;
    }
    
    versions.forEach((v, idx) => {
      const row = document.createElement('div');
      row.style.cssText = 'display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 6px 8px; border-radius: 6px; background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.04);';
      
      const timeStr = new Date(v.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      const dateStr = new Date(v.timestamp).toLocaleDateString([], { month: 'short', day: 'numeric' });
      
      row.innerHTML = `
        <div style="display: flex; flex-direction: column; overflow: hidden; text-align: left;">
          <span style="font-size: 11px; font-weight: 600; color: white;">Revision ${versions.length - idx}</span>
          <span style="font-size: 10px; color: var(--text-muted);">${dateStr} ${timeStr}</span>
        </div>
        <div style="display: flex; gap: 4px;">
          <button class="revert-ver-btn" style="background: transparent; border: none; color: #a5b4fc; font-size: 12px; cursor: pointer; padding: 2px 4px;" title="Revert to this version">↩️</button>
          <button class="delete-ver-btn" style="background: transparent; border: none; color: #f87171; font-size: 12px; cursor: pointer; padding: 2px 4px;" title="Delete this revision">🗑️</button>
        </div>
      `;
      
      row.querySelector('.revert-ver-btn').addEventListener('click', (e) => {
        e.stopPropagation();
        const confirmRevert = confirm("Are you sure you want to revert active note content to this revision?");
        if (!confirmRevert) return;
        this.noteEditorBody.value = v.content;
        this.saveActiveNote();
      });
      
      row.querySelector('.delete-ver-btn').addEventListener('click', (e) => {
        e.stopPropagation();
        const confirmDel = confirm("Delete this revision from version history?");
        if (!confirmDel) return;
        this.deleteNoteVersion(noteName, v.timestamp);
      });
      
      this.noteVersionsList.appendChild(row);
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
        this.activeNoteName = null;
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
  }
};

const COMMANDS = [
  { cmd: "/help", desc: "Show help lists" },
  { cmd: "/t ", desc: "Filter by title: /t <query>" },
  { cmd: "/u ", desc: "Filter by URL: /u <query>" },
  { cmd: "/c ", desc: "Filter by category: /c [movies, study, software, adult, sports]" },
  { cmd: "/d ", desc: "Filter by domain: /d [domain.com]" },
  { cmd: "/sort ", desc: "Sort current list: /sort [name, date, url]" },
  { cmd: "/wizard", desc: "Launch Smart Sorter wizard" },
  { cmd: "/undo", desc: "Undo last bookmark organization" }
];

function showToast(message, type = 'success') {
  const toast = document.createElement('div');
  toast.className = `custom-toast toast-${type}`;
  toast.style.cssText = `
    position: fixed;
    bottom: 24px;
    right: 24px;
    background: ${type === 'success' ? 'rgba(16, 185, 129, 0.9)' : 'rgba(239, 68, 68, 0.9)'};
    border: 1px solid ${type === 'success' ? 'rgba(16, 185, 129, 0.4)' : 'rgba(239, 68, 68, 0.4)'};
    color: white;
    padding: 12px 24px;
    border-radius: 12px;
    font-family: system-ui, -apple-system, sans-serif;
    font-size: 13.5px;
    font-weight: 600;
    box-shadow: 0 10px 30px rgba(0,0,0,0.45);
    backdrop-filter: blur(12px);
    -webkit-backdrop-filter: blur(12px);
    z-index: 99999;
    transform: translateY(100px);
    opacity: 0;
    transition: all 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275);
  `;
  toast.textContent = message;
  document.body.appendChild(toast);
  
  setTimeout(() => {
    toast.style.transform = 'translateY(0)';
    toast.style.opacity = '1';
  }, 50);
  
  setTimeout(() => {
    toast.style.transform = 'translateY(100px)';
    toast.style.opacity = '0';
    setTimeout(() => toast.remove(), 300);
  }, 3500);
}

