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
          // Fallback: open full-page manager dashboard in new tab
          chrome.tabs.create({ url: "dashboard.html" });
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
    const targetUrl = "dashboard.html" + (message.view ? "?view=" + message.view : "");
    chrome.tabs.create({ url: targetUrl });
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

  if (message.action === "search_history") {
    chrome.history.search({ text: message.query, maxResults: 15 }, (results) => {
      const mapped = (results || []).map(item => ({
        id: "history_" + item.id,
        title: item.title || item.url,
        url: item.url,
        isHistory: true
      }));
      sendResponse(mapped);
    });
    return true;
  }

  if (message.action === "save_sound_level") {
    if (sender && sender.tab && sender.tab.url) {
      let hostname = 'unknown';
      try { hostname = new URL(sender.tab.url).hostname; } catch(e) {}
      chrome.storage.local.set({ [`sound_level_host_${hostname}`]: message.level });
    }
    sendResponse({ success: true });
    return;
  }

  // --- COOKIE PROFILES API ---
  if (message.action === "get_cookies") {
    const targetUrl = message.url || ("https://" + message.domain);
    chrome.cookies.getAll({ url: targetUrl }, (cookies) => {
      sendResponse({ cookies });
    });
    return true; // Keep channel open
  }

  if (message.action === "clear_cookies") {
    const targetUrl = message.url || ("https://" + message.domain);
    chrome.cookies.getAll({ url: targetUrl }, (cookies) => {
      let pending = cookies.length;
      if (pending === 0) {
        sendResponse({ success: true });
        return;
      }
      cookies.forEach(cookie => {
        const url = "http" + (cookie.secure ? "s" : "") + "://" + cookie.domain + cookie.path;
        chrome.cookies.remove({ url: url, name: cookie.name }, () => {
          pending--;
          if (pending === 0) sendResponse({ success: true });
        });
      });
    });
    return true;
  }

  if (message.action === "set_cookie") {
    const cookie = message.cookie;
    let url = "http" + (cookie.secure ? "s" : "") + "://" + (cookie.domain?.startsWith('.') ? cookie.domain.slice(1) : cookie.domain) + cookie.path;
    if (url.includes('undefined')) url = "https://" + message.domain + "/";
    const newCookie = {
      url: url,
      name: cookie.name,
      value: cookie.value,
      domain: cookie.domain,
      path: cookie.path,
      secure: cookie.secure,
      httpOnly: cookie.httpOnly,
      sameSite: cookie.sameSite,
      expirationDate: cookie.expirationDate
    };
    chrome.cookies.set(newCookie, (result) => {
      if (chrome.runtime.lastError) {
        sendResponse({ success: false, error: chrome.runtime.lastError });
      } else {
        sendResponse({ success: true, result });
      }
    });
    return true;
  }


  return true;
});

// Auto-delete history blacklist monitor
chrome.history.onVisited.addListener((historyItem) => {
  chrome.storage.local.get(['organizer_user_settings', 'history_blacklist_rules'], (result) => {
    const settings = result.organizer_user_settings || {};
    const blacklistStr = settings.historyBlacklist || '';
    const rules = result.history_blacklist_rules || [];
    const url = historyItem.url;
    
    // Check legacy blacklist string
    let isLegacyBlacklisted = false;
    if (blacklistStr) {
      const blacklist = blacklistStr.split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
      const domain = getDomain(url);
      isLegacyBlacklisted = blacklist.some(d => domain === d || domain.endsWith('.' + d));
    }

    // Check custom blacklist rules (Never Store Again behavior)
    let isRuleBlacklisted = false;
    if (rules.length > 0) {
      const hostname = getDomain(url);
      isRuleBlacklisted = rules.some(rule => {
        if (rule.behavior !== 'never-store') return false;
        if (rule.type === 'domain') {
          return hostname === rule.pattern || hostname.endsWith('.' + rule.pattern);
        } else if (rule.type === 'subdomain') {
          return hostname === rule.pattern;
        } else if (rule.type === 'url') {
          return url === rule.pattern;
        }
        return false;
      });
    }

    if (isLegacyBlacklisted || isRuleBlacklisted) {
      chrome.history.deleteUrl({ url: url });
    }
  });
});

function getDomain(urlString) {
  try {
    if (!urlString) return "";
    const url = new URL(urlString);
    let hostname = url.hostname.toLowerCase();
    if (hostname.startsWith("www.")) {
      hostname = hostname.substring(4);
    }
    return hostname;
  } catch (e) {
    return "";
  }
}
