// Popup controller for Smart Bookmark Organizer

document.addEventListener('DOMContentLoaded', () => {
  initPopup();
  setupEventListeners();
  setupSoundBoost();
});

let lastBackup = null;

function initPopup() {
  // Count bookmarks
  chrome.bookmarks.getTree((tree) => {
    let count = 0;
    function countNodes(node) {
      if (node.url) count++;
      if (node.children) {
        node.children.forEach(countNodes);
      }
    }
    if (tree && tree[0] && tree[0].children) {
      tree[0].children.forEach(countNodes);
    }
    document.getElementById('total-bookmarks').textContent = count;
  });

  // Check if backup exists
  chrome.storage.local.get(['bookmarks_backup'], (result) => {
    if (result.bookmarks_backup) {
      lastBackup = result.bookmarks_backup;
      document.getElementById('quick-restore-btn').classList.remove('hidden');
    } else {
      document.getElementById('quick-restore-btn').classList.add('hidden');
    }
  });
}

function setupEventListeners() {
  // Toggle Command Center on active tab
  document.getElementById('open-command-center-btn').addEventListener('click', () => {
    chrome.runtime.sendMessage({ action: "trigger_toggle_overlay" });
    window.close();
  });

  // Open Dashboard
  document.getElementById('open-dashboard-btn').addEventListener('click', () => {
    chrome.tabs.create({ url: 'dashboard.html' });
    window.close(); // Close popup
  });

  // Quick Undo
  document.getElementById('quick-restore-btn').addEventListener('click', async () => {
    if (!lastBackup) return;

    const confirmRestore = confirm('Revert your bookmarks to their original positions?');
    if (!confirmRestore) return;

    const restoreBtn = document.getElementById('quick-restore-btn');
    restoreBtn.disabled = true;
    restoreBtn.textContent = 'Undoing...';

    try {
      // Restore moves (ascending original index)
      const sortedMoves = [...lastBackup.moves].sort((a, b) => a.originalIndex - b.originalIndex);
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

      // Delete created folders (reverse order)
      const foldersToDelete = [...lastBackup.createdFolders].reverse();
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

      // Clear backup
      await chrome.storage.local.remove('bookmarks_backup');
      lastBackup = null;
      
      alert('Bookmarks restored!');
      initPopup();
    } catch (err) {
      console.error(err);
      alert('Error during restoration: ' + err.message);
    } finally {
      restoreBtn.disabled = false;
      restoreBtn.textContent = 'Undo Last Sorting';
      restoreBtn.classList.add('hidden');
    }
  });
}

function setupSoundBoost() {
  const valLabel = document.getElementById('sound-boost-val');
  const upBtn = document.getElementById('sound-up-btn');
  const downBtn = document.getElementById('sound-down-btn');
  const resetBtn = document.getElementById('sound-reset-btn');
  
  if (!valLabel || !upBtn || !downBtn || !resetBtn) return;
  
  let currentSoundLevel = 100;
  
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (tabs.length === 0) return;
    const tab = tabs[0];
    const tabId = tab.id;
    let hostname = 'unknown';
    try { hostname = new URL(tab.url).hostname; } catch(e) {}
    const storageKey = `sound_level_host_${hostname}`;
    
    // Load persisted level for this tab/host
    chrome.storage.local.get([storageKey], (res) => {
      currentSoundLevel = res[storageKey] || 100;
      valLabel.textContent = `${currentSoundLevel}%`;
    });
    
    const applyToTab = (level) => {
      valLabel.textContent = `${level}%`;
      chrome.storage.local.set({ [storageKey]: level });
      
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
            window._sbContext.resume();
          }
          window._sbGainNode.gain.value = lvl / 100;
        },
        args: [level]
      });
    };
    
    upBtn.addEventListener('click', () => { currentSoundLevel += 25; applyToTab(currentSoundLevel); });
    downBtn.addEventListener('click', () => { currentSoundLevel = Math.max(0, currentSoundLevel - 25); applyToTab(currentSoundLevel); });
    resetBtn.addEventListener('click', () => { currentSoundLevel = 100; applyToTab(currentSoundLevel); });
  });
}
