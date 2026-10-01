const DEFAULT_SETTINGS = {
  enableClipboard: true,
  enableScreenshots: true,
  enableCookies: true,
  enableDashboard: true
};

document.addEventListener('DOMContentLoaded', () => {
  const toggleClipboard = document.getElementById('toggle-clipboard');
  const toggleScreenshots = document.getElementById('toggle-screenshots');
  const toggleCookies = document.getElementById('toggle-cookies');
  const toggleDashboard = document.getElementById('toggle-dashboard');

  // Load current settings
  chrome.storage.local.get(['app_settings'], (result) => {
    const settings = { ...DEFAULT_SETTINGS, ...result.app_settings };
    toggleClipboard.checked = settings.enableClipboard;
    toggleScreenshots.checked = settings.enableScreenshots;
    toggleCookies.checked = settings.enableCookies;
    toggleDashboard.checked = settings.enableDashboard;
  });

  function saveSettings() {
    const settings = {
      enableClipboard: toggleClipboard.checked,
      enableScreenshots: toggleScreenshots.checked,
      enableCookies: toggleCookies.checked,
      enableDashboard: toggleDashboard.checked
    };
    chrome.storage.local.set({ app_settings: settings });
  }

  toggleClipboard.addEventListener('change', saveSettings);
  toggleScreenshots.addEventListener('change', saveSettings);
  toggleCookies.addEventListener('change', saveSettings);
  toggleDashboard.addEventListener('change', saveSettings);
});
