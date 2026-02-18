const iconPaths = {
  active: {
    light: {
      16: "icons/bug-active-light-16.png",
      32: "icons/bug-active-light-32.png",
    },
    dark: {
      16: "icons/bug-active-dark-16.png",
      32: "icons/bug-active-dark-32.png",
    },
  },
  inactive: {
    light: {
      16: "icons/bug-inactive-light-16.png",
      32: "icons/bug-inactive-light-32.png",
    },
    dark: {
      16: "icons/bug-inactive-dark-16.png",
      32: "icons/bug-inactive-dark-32.png",
    },
  },
};

const offscreenDocumentPath = "offscreen.html";
let currentTab;
let parsedUrl;
let currentDebugStatus = false;
let currentThemeMode = "light";

function getThemeMode() {
  return currentThemeMode === "dark" ? "dark" : "light";
}

function updateIcon() {
  if (currentTab?.id == null) return;

  const debugState = currentDebugStatus ? "active" : "inactive";

  chrome.action.setIcon({
    path: iconPaths[debugState][getThemeMode()],
    tabId: currentTab.id,
  });
  chrome.action.setTitle({
    title: currentDebugStatus ? "Disable Debug Mode" : "Enable Debug Mode",
    tabId: currentTab.id,
  });
}

function updateActiveTab() {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const [tab] = tabs ?? [];
    if (!tab) return;

    currentTab = tab;
    parsedUrl = null;
    currentDebugStatus = false;

    if (typeof currentTab.url === "string") {
      try {
        parsedUrl = new URL(currentTab.url);
        currentDebugStatus = parsedUrl.searchParams.get("debug") === "1";
      } catch {}
    }

    updateIcon();
  });
}

function toggleDebug(tab) {
  const tabId = tab?.id ?? currentTab?.id;
  const tabUrl = tab?.url ?? (parsedUrl ? String(parsedUrl) : null);

  if (tabId == null || !tabUrl) return;

  let updatedUrl;
  try {
    updatedUrl = new URL(tabUrl);
  } catch {
    return;
  }

  if (updatedUrl.searchParams.get("debug") === "1") {
    updatedUrl.searchParams.delete("debug");
  } else {
    updatedUrl.searchParams.set("debug", "1");
  }

  chrome.tabs.update(tabId, { url: String(updatedUrl) });
}

async function ensureOffscreenDocument() {
  if (!chrome.offscreen?.createDocument) return false;

  try {
    if (chrome.runtime.getContexts) {
      const offscreenUrl = chrome.runtime.getURL(offscreenDocumentPath);
      const contexts = await chrome.runtime.getContexts({
        contextTypes: ["OFFSCREEN_DOCUMENT"],
        documentUrls: [offscreenUrl],
      });
      if (contexts.length > 0) return true;
    }

    await chrome.offscreen.createDocument({
      url: offscreenDocumentPath,
      reasons: ["MATCH_MEDIA"],
      justification: "Detect light/dark mode to improve action icon contrast.",
    });
    return true;
  } catch (error) {
    if (String(error).includes("Only a single offscreen")) return true;
    return false;
  }
}

async function refreshThemeMode() {
  try {
    const response = await chrome.runtime.sendMessage({ type: "GET_THEME_MODE" });
    if (response?.themeMode === "dark" || response?.themeMode === "light") {
      currentThemeMode = response.themeMode;
    }
  } catch {}
}

async function initialize() {
  await ensureOffscreenDocument();
  await refreshThemeMode();
  updateActiveTab();
}

chrome.tabs.onUpdated.addListener(updateActiveTab);
chrome.tabs.onActivated.addListener(updateActiveTab);
chrome.windows.onFocusChanged.addListener(updateActiveTab);
chrome.action.onClicked.addListener(toggleDebug);

chrome.runtime.onMessage.addListener((message) => {
  if (message?.type === "THEME_MODE_CHANGED") {
    currentThemeMode = message.themeMode === "dark" ? "dark" : "light";
    updateIcon();
  }
});

chrome.runtime.onInstalled.addListener(initialize);
chrome.runtime.onStartup.addListener(initialize);

initialize();
