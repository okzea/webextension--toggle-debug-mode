const browser = window.browser ?? window.chrome;

let currentTab;
let parsedUrl;
let currentDebugStatus = false;

const colorSchemeQuery = window.matchMedia?.("(prefers-color-scheme: dark)") ?? null;
const iconPaths = {
  active: { light: "icons/bug-active-light.svg", dark: "icons/bug-active-dark.svg" },
  inactive: { light: "icons/bug-inactive-light.svg", dark: "icons/bug-inactive-dark.svg" },
};

function getThemeMode() {
  return colorSchemeQuery?.matches ? "dark" : "light";
}

function updateIcon() {
  if (!currentTab?.id) return;

  const themeMode = getThemeMode();
  const debugState = currentDebugStatus ? "active" : "inactive";

  browser.browserAction.setIcon({
    path: iconPaths[debugState][themeMode],
    tabId: currentTab.id,
  });
  browser.browserAction.setTitle({
    title: currentDebugStatus ? "Disable Debug Mode" : "Enable Debug Mode",
    tabId: currentTab.id,
  });
}

async function updateActiveTab() {
  const [tab] = await new Promise((resolve) =>
    browser.tabs.query({ active: true, currentWindow: true }, resolve)
  );
  if (!tab) return;

  currentTab = tab;
  parsedUrl = null;
  currentDebugStatus = false;

  if (currentTab.url) {
    try {
      parsedUrl = new URL(currentTab.url);
      currentDebugStatus = parsedUrl.searchParams.get("debug") === "1";
    } catch {}
  }

  updateIcon();
}

browser.tabs.onUpdated.addListener(updateActiveTab);
browser.tabs.onActivated.addListener(updateActiveTab);
browser.windows.onFocusChanged.addListener(updateActiveTab);

colorSchemeQuery?.addEventListener("change", updateIcon);

updateActiveTab();

function toggleDebug() {
  if (!parsedUrl) return;
  currentDebugStatus
    ? parsedUrl.searchParams.delete("debug")
    : parsedUrl.searchParams.set("debug", "1");
  browser.tabs.update({ url: String(parsedUrl) });
}

browser.browserAction.onClicked.addListener(toggleDebug);
