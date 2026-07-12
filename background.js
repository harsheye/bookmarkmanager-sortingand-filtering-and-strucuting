// Background Service Worker for Smart Command Palette Productivity Platform
importScripts("db.js");

// Open the onboarding dashboard automatically upon installation
chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === "install") {
    chrome.tabs.create({ url: "dashboard.html" });
  }
});

// Listen for global command hotkey (Alt+Space)
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
  chrome.tabs.get(tabId, (tab) => {
    if (chrome.runtime.lastError || !tab) return;
    const url = tab.url || "";

    // If it's our own extension dashboard page, message directly (since scripts are loaded statically)
    if (url.startsWith("chrome-extension://") && url.includes("dashboard.html")) {
      chrome.tabs.sendMessage(tabId, { action: "toggle_command_center" }).catch(err => {
        console.warn("Failed to toggle inside dashboard:", err);
      });
      return;
    }

    // If it's a restricted browser system page
    if (url.startsWith("chrome://") || url.startsWith("edge://") || url.startsWith("about:")) {
      chrome.tabs.create({ url: "dashboard.html" });
      return;
    }

    // Normal web pages flow
    chrome.tabs.sendMessage(tabId, { action: "ping" }, (response) => {
      if (chrome.runtime.lastError || !response || response.status !== "pong") {
        // Script is not running in this tab, dynamically inject dependencies
        chrome.scripting.executeScript({
          target: { tabId: tabId },
          files: ["rules.js", "db.js", "content.js"]
        }, () => {
          if (chrome.runtime.lastError) {
            console.warn("Could not inject script (likely a browser system page):", chrome.runtime.lastError.message);
            chrome.tabs.create({ url: "dashboard.html" });
            return;
          }
          setTimeout(() => {
            chrome.tabs.sendMessage(tabId, { action: "toggle_command_center" }).catch(err => {
              console.error("Failed to send toggle after injection:", err);
            });
          }, 120);
        });
      } else {
        chrome.tabs.sendMessage(tabId, { action: "toggle_command_center" }).catch(err => {
          console.error("Failed to send toggle to active tab:", err);
        });
      }
    });
  });
}

// Alarm Listener for Timers
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name.startsWith("timer_")) {
    const details = alarm.name.split("|");
    const label = details[1] || "Timer completed!";
    chrome.notifications.create({
      type: "basic",
      iconUrl: "icons/icon128.png",
      title: "Command Palette Timer",
      message: label,
      priority: 2
    });
  }
});

// Listener for messages from popup or content script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "db_op") {
    handleDbOp(message, sendResponse);
    return true; // Keep message channel open for asynchronous response
  }

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

  if (message.action === "delete_history_url") {
    chrome.history.deleteUrl({ url: message.url }, () => {
      sendResponse({ success: true });
    });
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
    const filter = {};
    if (message.url) {
      filter.url = message.url;
    } else if (message.domain) {
      let domainClean = message.domain;
      if (domainClean.startsWith('.')) {
        domainClean = domainClean.substring(1);
      }
      filter.domain = domainClean;
    }
    chrome.cookies.getAll(filter, (cookies) => {
      sendResponse({ cookies });
    });
    return true;
  }

  if (message.action === "clear_cookies") {
    const filter = {};
    if (message.url) {
      filter.url = message.url;
    } else if (message.domain) {
      let domainClean = message.domain;
      if (domainClean.startsWith('.')) {
        domainClean = domainClean.substring(1);
      }
      filter.domain = domainClean;
    }
    chrome.cookies.getAll(filter, (cookies) => {
      let pending = cookies.length;
      if (pending === 0) {
        sendResponse({ success: true });
        return;
      }
      cookies.forEach(cookie => {
        let domainClean = cookie.domain || "";
        if (domainClean.startsWith('.')) {
          domainClean = domainClean.substring(1);
        }
        const url = "http" + (cookie.secure ? "s" : "") + "://" + domainClean + (cookie.path || "/");
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
    let domainClean = cookie.domain || "";
    if (domainClean.startsWith('.')) {
      domainClean = domainClean.substring(1);
    }
    const pathClean = cookie.path || "/";
    const url = "http" + (cookie.secure ? "s" : "") + "://" + domainClean + pathClean;
    
    const newCookie = {
      url: url,
      name: cookie.name || "",
      value: cookie.value || "",
      path: pathClean,
      secure: !!cookie.secure,
      httpOnly: !!cookie.httpOnly
    };

    if (cookie.domain) {
      newCookie.domain = cookie.domain;
    }
    if (cookie.expirationDate !== undefined) {
      newCookie.expirationDate = cookie.expirationDate;
    }
    if (cookie.sameSite !== undefined) {
      newCookie.sameSite = cookie.sameSite;
    }
    if (cookie.storeId !== undefined) {
      newCookie.storeId = cookie.storeId;
    }

    chrome.cookies.set(newCookie, (result) => {
      if (chrome.runtime.lastError) {
        sendResponse({ success: false, error: chrome.runtime.lastError.message || chrome.runtime.lastError });
      } else {
        sendResponse({ success: true, result });
      }
    });
    return true;
  }

  // --- DOWNLOADS API PROXY ---
  if (message.action === "get_downloads") {
    chrome.downloads.search({ query: message.query || "", limit: 30 }, (downloads) => {
      sendResponse(downloads || []);
    });
    return true;
  }

  if (message.action === "open_download") {
    chrome.downloads.showDefault(message.id);
    sendResponse({ success: true });
    return;
  }

  if (message.action === "delete_download") {
    chrome.downloads.erase({ id: message.id }, () => {
      sendResponse({ success: !chrome.runtime.lastError });
    });
    return true;
  }

  // --- TABS API PROXY ---
  if (message.action === "get_tabs") {
    chrome.tabs.query({}, (tabs) => {
      sendResponse(tabs || []);
    });
    return true;
  }

  if (message.action === "activate_tab") {
    chrome.tabs.update(message.id, { active: true }, () => {
      if (message.windowId) {
        chrome.windows.update(message.windowId, { focused: true });
      }
      sendResponse({ success: true });
    });
    return true;
  }

  if (message.action === "close_tab") {
    chrome.tabs.remove(message.id, () => {
      sendResponse({ success: true });
    });
    return true;
  }

  if (message.action === "close_other_tabs") {
    chrome.tabs.query({ currentWindow: true }, (tabs) => {
      const activeTabId = message.id;
      const idsToRemove = tabs.filter(t => t.id !== activeTabId).map(t => t.id);
      chrome.tabs.remove(idsToRemove, () => {
        sendResponse({ success: true });
      });
    });
    return true;
  }

  if (message.action === "duplicate_tab") {
    chrome.tabs.duplicate(message.id, () => {
      sendResponse({ success: true });
    });
    return true;
  }

  if (message.action === "set_tab_pinned") {
    chrome.tabs.update(message.id, { pinned: message.pinned }, () => {
      sendResponse({ success: true });
    });
    return true;
  }

  if (message.action === "set_tab_muted") {
    chrome.tabs.update(message.id, { muted: message.muted }, () => {
      sendResponse({ success: true });
    });
    return true;
  }

  // --- SCREENSHOT CAPTURE PROXY ---
  if (message.action === "capture_visible") {
    chrome.tabs.captureVisibleTab(null, { format: "png" }, (dataUrl) => {
      if (chrome.runtime.lastError) {
        sendResponse({ error: chrome.runtime.lastError.message });
      } else {
        sendResponse({ dataUrl });
      }
    });
    return true;
  }

  // --- ALARMS FOR TIMERS ---
  if (message.action === "set_timer") {
    const alarmName = `timer_${Date.now()}|${message.label || "Timer"}`;
    chrome.alarms.create(alarmName, { delayInMinutes: message.minutes });
    sendResponse({ success: true });
    return;
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
    
    let isLegacyBlacklisted = false;
    if (blacklistStr) {
      const blacklist = blacklistStr.split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
      const domain = getDomain(url);
      isLegacyBlacklisted = blacklist.some(d => domain === d || domain.endsWith('.' + d));
    }

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

function handleDbOp(message, sendResponse) {
  const { op, storeName, id, data, limit } = message;
  if (op === "get") {
    CommandPaletteDB.get(storeName, id).then(sendResponse);
  } else if (op === "getAll") {
    CommandPaletteDB.getAll(storeName).then(sendResponse);
  } else if (op === "put") {
    CommandPaletteDB.put(storeName, data).then(sendResponse);
  } else if (op === "delete") {
    CommandPaletteDB.delete(storeName, id).then(sendResponse);
  } else if (op === "clear") {
    CommandPaletteDB.clear(storeName).then(sendResponse);
  } else if (op === "getClipboardHistory") {
    CommandPaletteDB.getClipboardHistory(limit).then(sendResponse);
  } else if (op === "getNotes") {
    CommandPaletteDB.getNotes().then(sendResponse);
  }
}
