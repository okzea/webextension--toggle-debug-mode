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

const DEFAULT_PARAM_RULES = Object.freeze([
  {
    name: "debug",
    kind: "number",
    value: "1",
  },
]);

const offscreenDocumentPath = "offscreen.html";

let currentTab;
let currentParsedUrl;
let currentParamsEnabled = false;
let currentThemeMode = "light";
let paramRules = cloneDefaultParamRules();

function cloneDefaultParamRules() {
  return DEFAULT_PARAM_RULES.map((rule) => ({ ...rule }));
}

function parseUrl(rawUrl) {
  if (typeof rawUrl !== "string" || !rawUrl) return null;

  try {
    const parsed = new URL(rawUrl);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
    return parsed;
  } catch {
    return null;
  }
}

function normalizeRule(rawRule) {
  if (!rawRule || typeof rawRule.name !== "string") return null;

  const name = rawRule.name.trim();
  if (!name) return null;

  const kind =
    rawRule.kind === "number" || rawRule.kind === "boolean" ? rawRule.kind : "string";
  let value = rawRule.value == null ? "" : String(rawRule.value);

  if (kind === "number") {
    if (value.trim() === "") return null;
    const numberValue = Number(value);
    if (!Number.isFinite(numberValue)) return null;
    value = String(numberValue);
  } else if (kind === "boolean") {
    value = value === "false" ? "false" : "true";
  }

  return { name, kind, value };
}

function normalizeRules(rawRules) {
  const sourceRules = Array.isArray(rawRules) ? rawRules : [];
  const uniqueRulesMap = new Map();

  for (const rawRule of sourceRules) {
    const normalizedRule = normalizeRule(rawRule);
    if (!normalizedRule) continue;
    uniqueRulesMap.set(normalizedRule.name, normalizedRule);
  }

  const normalizedRules = Array.from(uniqueRulesMap.values());
  return normalizedRules.length > 0 ? normalizedRules : cloneDefaultParamRules();
}

function getRuleValue(rule) {
  if (rule.kind === "number") return String(Number(rule.value));
  if (rule.kind === "boolean") return rule.value === "false" ? "false" : "true";
  return String(rule.value);
}

function areRulesEnabled(parsedUrl) {
  if (!parsedUrl || paramRules.length === 0) return false;

  return paramRules.every((rule) => parsedUrl.searchParams.get(rule.name) === getRuleValue(rule));
}

function applyRules(parsedUrl) {
  for (const rule of paramRules) {
    parsedUrl.searchParams.set(rule.name, getRuleValue(rule));
  }
}

function removeRules(parsedUrl) {
  for (const rule of paramRules) {
    parsedUrl.searchParams.delete(rule.name);
  }
}

function getThemeMode() {
  return currentThemeMode === "dark" ? "dark" : "light";
}

function getActionTitle() {
  if (paramRules.length === 1) {
    const ruleName = paramRules[0].name;
    return currentParamsEnabled ? `Disable "${ruleName}" toggle` : `Enable "${ruleName}" toggle`;
  }

  const paramsLabel = `${paramRules.length} params`;
  return currentParamsEnabled ? `Disable ${paramsLabel} toggle` : `Enable ${paramsLabel} toggle`;
}

function updateIcon() {
  if (currentTab?.id == null) return;

  const debugState = currentParamsEnabled ? "active" : "inactive";

  chrome.action.setIcon({
    path: iconPaths[debugState][getThemeMode()],
    tabId: currentTab.id,
  });
  chrome.action.setTitle({
    title: getActionTitle(),
    tabId: currentTab.id,
  });
}

function updateActiveTab() {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const [tab] = tabs ?? [];
    if (!tab) return;

    currentTab = tab;
    currentParsedUrl = parseUrl(currentTab.url);
    currentParamsEnabled = areRulesEnabled(currentParsedUrl);

    updateIcon();
  });
}

function toggleParams(tab) {
  const tabId = tab?.id ?? currentTab?.id;
  const parsedUrl = parseUrl(tab?.url) ?? parseUrl(currentParsedUrl ? String(currentParsedUrl) : "");

  if (tabId == null || !parsedUrl) return;

  if (areRulesEnabled(parsedUrl)) {
    removeRules(parsedUrl);
  } else {
    applyRules(parsedUrl);
  }

  chrome.tabs.update(tabId, { url: String(parsedUrl) });
}

function getStorageSync(defaultValues) {
  return new Promise((resolve) => {
    chrome.storage.sync.get(defaultValues, (result) => {
      if (chrome.runtime.lastError) {
        resolve(defaultValues);
        return;
      }

      resolve(result);
    });
  });
}

async function loadParamRules() {
  const defaultValues = { paramRules: cloneDefaultParamRules() };
  const result = await getStorageSync(defaultValues);
  paramRules = normalizeRules(result.paramRules);
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
  await loadParamRules();
  updateActiveTab();
}

chrome.tabs.onUpdated.addListener(updateActiveTab);
chrome.tabs.onActivated.addListener(updateActiveTab);
chrome.windows.onFocusChanged.addListener(updateActiveTab);
chrome.action.onClicked.addListener(toggleParams);

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== "sync" || !changes.paramRules) return;

  paramRules = normalizeRules(changes.paramRules.newValue);
  currentParamsEnabled = areRulesEnabled(currentParsedUrl);
  updateIcon();
});

chrome.runtime.onMessage.addListener((message) => {
  if (message?.type === "THEME_MODE_CHANGED") {
    currentThemeMode = message.themeMode === "dark" ? "dark" : "light";
    updateIcon();
    return;
  }

  if (message?.type === "SETTINGS_UPDATED") {
    loadParamRules().then(updateActiveTab);
  }
});

chrome.runtime.onInstalled.addListener(initialize);
chrome.runtime.onStartup.addListener(initialize);

initialize();
