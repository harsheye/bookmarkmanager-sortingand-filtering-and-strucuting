// Background Service Worker for Bookmark Sorter & Command Center Extension

// Open the onboarding dashboard automatically upon installation
chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === "install") {
    chrome.tabs.create({ url: "dashboard.html" });
  }
});

// Listen for global command hotkey (Alt+Shift+B)
chrome.commands.onCommand.addListener((command) => {
  if (command === "toggle-command-center") {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0] && tabs[0].id) {
        toggleCenterInTab(tabs[0].id);
      }
    });
  }
});

// Helper function to safely send toggle commands with dynamic script injection fallback
function toggleCenterInTab(tabId) {
  // 1. Send a ping message to check if script is active
  chrome.tabs.sendMessage(tabId, { action: "ping" }, (response) => {
    if (chrome.runtime.lastError || !response || response.status !== "pong") {
      // 2. Script is not running in this tab, dynamically inject rules.js and content.js
      chrome.scripting.executeScript({
        target: { tabId: tabId },
        files: ["rules.js", "content.js"]
      }, () => {
        if (chrome.runtime.lastError) {
          console.warn("Could not inject script (likely a browser system page):", chrome.runtime.lastError.message);
          return;
        }
        // 3. Script injected, wait a split second and trigger toggle
        setTimeout(() => {
          chrome.tabs.sendMessage(tabId, { action: "toggle_command_center" }).catch(err => {
            console.error("Failed to send toggle after injection:", err);
          });
        }, 120);
      });
    } else {
      // 4. Script is active, toggle overlay directly
      chrome.tabs.sendMessage(tabId, { action: "toggle_command_center" }).catch(err => {
        console.error("Failed to send toggle to active tab:", err);
      });
    }
  });
}

// Listener for messages from popup or content script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "open_dashboard") {
    chrome.tabs.create({ url: "dashboard.html" });
    sendResponse({ success: true });
    return;
  }

  // Trigger toggle from popup button click
  if (message.action === "trigger_toggle_overlay" && sender.tab === undefined) {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0] && tabs[0].id) {
        toggleCenterInTab(tabs[0].id);
      }
    });
    sendResponse({ success: true });
    return;
  }

  // --- BOOKMARKS API PROXY ---
  if (message.action === "get_bookmarks_tree") {
    chrome.bookmarks.getTree((tree) => {
      sendResponse(tree);
    });
    return true; // Keep message channel open for asynchronous response
  }

  if (message.action === "get_folder_contents") {
    chrome.bookmarks.getSubTree(message.id, (nodes) => {
      if (chrome.runtime.lastError || !nodes || !nodes[0]) {
        sendResponse({ error: "Folder not found" });
      } else {
        sendResponse(nodes[0]);
      }
    });
    return true;
  }

  if (message.action === "create_bookmark") {
    chrome.bookmarks.create(message.data, (node) => {
      if (chrome.runtime.lastError) {
        sendResponse({ error: chrome.runtime.lastError.message });
      } else {
        sendResponse(node);
      }
    });
    return true;
  }

  if (message.action === "update_bookmark") {
    chrome.bookmarks.update(message.id, message.data, (node) => {
      if (chrome.runtime.lastError) {
        sendResponse({ error: chrome.runtime.lastError.message });
      } else {
        sendResponse(node);
      }
    });
    return true;
  }

  if (message.action === "delete_bookmark") {
    if (message.isFolder) {
      chrome.bookmarks.removeTree(message.id, () => {
        sendResponse({ success: !chrome.runtime.lastError });
      });
    } else {
      chrome.bookmarks.remove(message.id, () => {
        sendResponse({ success: !chrome.runtime.lastError });
      });
    }
    return true;
  }

  return true;
});
