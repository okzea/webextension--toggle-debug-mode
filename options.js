const DEFAULT_PARAM_RULES = Object.freeze([
  {
    name: "debug",
    kind: "number",
    value: "1",
  },
]);

const rulesContainer = document.getElementById("rules");
const statusElement = document.getElementById("status");
const ruleTemplate = document.getElementById("rule-template");
const addRuleButton = document.getElementById("add-rule");
const resetDefaultsButton = document.getElementById("reset-defaults");
const saveButton = document.getElementById("save");

function cloneDefaultParamRules() {
  return DEFAULT_PARAM_RULES.map((rule) => ({ ...rule }));
}

function normalizeKind(kind) {
  return kind === "number" || kind === "boolean" ? kind : "string";
}

function normalizeRule(rawRule) {
  if (!rawRule || typeof rawRule.name !== "string") return null;

  const name = rawRule.name.trim();
  if (!name) return null;

  const kind = normalizeKind(rawRule.kind);
  let value = rawRule.value == null ? "" : String(rawRule.value);

  if (kind === "number") {
    if (value.trim() === "") return null;
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return null;
    value = String(parsed);
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

function showStatus(message, isError) {
  statusElement.textContent = message;
  statusElement.className = isError ? "error" : "";
}

function clearStatus() {
  showStatus("", false);
}

function syncValueEditorVisibility(row) {
  const kindSelect = row.querySelector(".param-kind");
  const textValueInput = row.querySelector(".param-value-text");
  const booleanValueSelect = row.querySelector(".param-value-boolean");

  if (kindSelect.value === "boolean") {
    textValueInput.hidden = true;
    booleanValueSelect.hidden = false;
  } else {
    textValueInput.hidden = false;
    booleanValueSelect.hidden = true;
  }
}

function createRuleRow(ruleData) {
  const row = ruleTemplate.content.firstElementChild.cloneNode(true);
  const nameInput = row.querySelector(".param-name");
  const kindSelect = row.querySelector(".param-kind");
  const textValueInput = row.querySelector(".param-value-text");
  const booleanValueSelect = row.querySelector(".param-value-boolean");
  const removeButton = row.querySelector(".remove-rule");

  nameInput.value = ruleData.name;
  kindSelect.value = normalizeKind(ruleData.kind);

  if (kindSelect.value === "boolean") {
    booleanValueSelect.value = ruleData.value === "false" ? "false" : "true";
  } else {
    textValueInput.value = ruleData.value;
  }

  syncValueEditorVisibility(row);

  kindSelect.addEventListener("change", () => {
    if (kindSelect.value === "boolean") {
      const lowerText = textValueInput.value.trim().toLowerCase();
      booleanValueSelect.value = lowerText === "false" ? "false" : "true";
    } else {
      textValueInput.value = booleanValueSelect.value;
      textValueInput.placeholder = kindSelect.value === "number" ? "1" : "value";
    }
    syncValueEditorVisibility(row);
    clearStatus();
  });

  removeButton.addEventListener("click", () => {
    row.remove();
    clearStatus();
  });

  nameInput.addEventListener("input", clearStatus);
  textValueInput.addEventListener("input", clearStatus);
  booleanValueSelect.addEventListener("change", clearStatus);

  return row;
}

function renderRules(rules) {
  rulesContainer.innerHTML = "";
  rules.forEach((rule) => {
    rulesContainer.appendChild(createRuleRow(rule));
  });
}

function readRulesFromForm() {
  const rows = Array.from(rulesContainer.querySelectorAll(".rule-row"));
  if (rows.length === 0) {
    throw new Error("Add at least one param.");
  }

  const rules = [];
  const seenNames = new Set();

  for (const row of rows) {
    const name = row.querySelector(".param-name").value.trim();
    const kind = normalizeKind(row.querySelector(".param-kind").value);
    const textValue = row.querySelector(".param-value-text").value;
    const booleanValue = row.querySelector(".param-value-boolean").value;
    const value = kind === "boolean" ? booleanValue : textValue.trim();

    if (!name) {
      throw new Error("Every row must include a param name.");
    }

    if (/[?&#=\s]/.test(name)) {
      throw new Error(`Invalid param name "${name}".`);
    }

    if (seenNames.has(name)) {
      throw new Error(`Duplicate param name "${name}".`);
    }

    if (kind === "number") {
      if (value === "" || !Number.isFinite(Number(value))) {
        throw new Error(`Param "${name}" must have a valid numeric value.`);
      }
    }

    seenNames.add(name);
    rules.push({ name, kind, value });
  }

  return rules;
}

function saveRules() {
  let rules;
  try {
    rules = readRulesFromForm();
  } catch (error) {
    showStatus(error.message, true);
    return;
  }

  chrome.storage.sync.set({ paramRules: rules }, () => {
    if (chrome.runtime.lastError) {
      showStatus(chrome.runtime.lastError.message, true);
      return;
    }

    chrome.runtime.sendMessage({ type: "SETTINGS_UPDATED" }, () => {
      void chrome.runtime.lastError;
    });
    showStatus("Saved.", false);
  });
}

function addRule() {
  rulesContainer.appendChild(
    createRuleRow({
      name: "",
      kind: "string",
      value: "",
    })
  );
  clearStatus();
}

function resetDefaults() {
  renderRules(cloneDefaultParamRules());
  showStatus("Defaults loaded. Click Save to apply.", false);
}

function loadRules() {
  chrome.storage.sync.get({ paramRules: cloneDefaultParamRules() }, (result) => {
    if (chrome.runtime.lastError) {
      showStatus(chrome.runtime.lastError.message, true);
      return;
    }

    renderRules(normalizeRules(result.paramRules));
  });
}

addRuleButton.addEventListener("click", addRule);
resetDefaultsButton.addEventListener("click", resetDefaults);
saveButton.addEventListener("click", saveRules);

loadRules();
