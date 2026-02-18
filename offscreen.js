const colorSchemeQuery = window.matchMedia("(prefers-color-scheme: dark)");

function getThemeMode() {
  return colorSchemeQuery.matches ? "dark" : "light";
}

function notifyThemeMode() {
  chrome.runtime.sendMessage(
    {
      type: "THEME_MODE_CHANGED",
      themeMode: getThemeMode(),
    },
    () => {
      void chrome.runtime.lastError;
    }
  );
}

if (colorSchemeQuery.addEventListener) {
  colorSchemeQuery.addEventListener("change", notifyThemeMode);
} else if (colorSchemeQuery.addListener) {
  colorSchemeQuery.addListener(notifyThemeMode);
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === "GET_THEME_MODE") {
    sendResponse({ themeMode: getThemeMode() });
  }
});

notifyThemeMode();
