const state = {
  mode: "xpath",
  matches: [],
  extractedOffers: [],
  combinedText: "",
  profileText: "",
  lastResultJson: null,
  resultsDirectoryHandle: null
};

const storageKeys = {
  apiKey: "offer-matcher.apiKey",
  model: "offer-matcher.model",
  selector: "offer-matcher.selector"
};

const elements = {
  apiKey: document.querySelector("#apiKey"),
  model: document.querySelector("#model"),
  profilePreset: document.querySelector("#profilePreset"),
  profileStatus: document.querySelector("#profileStatus"),
  analysisPrompt: document.querySelector("#analysisPrompt"),
  selectorInput: document.querySelector("#selectorInput"),
  htmlInput: document.querySelector("#htmlInput"),
  cssModeButton: document.querySelector("#cssModeButton"),
  xpathModeButton: document.querySelector("#xpathModeButton"),
  extractButton: document.querySelector("#extractButton"),
  analyzeButton: document.querySelector("#analyzeButton"),
  chooseFolderButton: document.querySelector("#chooseFolderButton"),
  currentModeLabel: document.querySelector("#currentModeLabel"),
  matchCount: document.querySelector("#matchCount"),
  charCount: document.querySelector("#charCount"),
  matchesList: document.querySelector("#matchesList"),
  combinedText: document.querySelector("#combinedText"),
  resultOutput: document.querySelector("#resultOutput"),
  saveJsonButton: document.querySelector("#saveJsonButton"),
  folderStatus: document.querySelector("#folderStatus")
};

const dbConfig = {
  name: "offer-matcher-db",
  version: 1,
  storeName: "settings",
  directoryKey: "results-directory"
};

function setMode(mode) {
  state.mode = mode;
  elements.currentModeLabel.textContent = mode.toUpperCase();
  elements.cssModeButton.classList.toggle("is-active", mode === "css");
  elements.xpathModeButton.classList.toggle("is-active", mode === "xpath");
  elements.selectorInput.placeholder = mode === "css"
    ? "section[data-ev-opening_uid]"
    : "//section[@data-ev-opening_uid]";
}

function supportsDirectoryPicker() {
  return typeof window.showDirectoryPicker === "function";
}

function openSettingsDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(dbConfig.name, dbConfig.version);

    request.addEventListener("upgradeneeded", () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(dbConfig.storeName)) {
        db.createObjectStore(dbConfig.storeName);
      }
    });

    request.addEventListener("success", () => resolve(request.result));
    request.addEventListener("error", () => reject(request.error));
  });
}

async function readStoredDirectoryHandle() {
  const db = await openSettingsDb();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(dbConfig.storeName, "readonly");
    const store = transaction.objectStore(dbConfig.storeName);
    const request = store.get(dbConfig.directoryKey);

    request.addEventListener("success", () => resolve(request.result || null));
    request.addEventListener("error", () => reject(request.error));
    transaction.addEventListener("complete", () => db.close());
    transaction.addEventListener("error", () => reject(transaction.error));
  });
}

async function writeStoredDirectoryHandle(handle) {
  const db = await openSettingsDb();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(dbConfig.storeName, "readwrite");
    const store = transaction.objectStore(dbConfig.storeName);
    const request = store.put(handle, dbConfig.directoryKey);

    request.addEventListener("success", () => resolve());
    request.addEventListener("error", () => reject(request.error));
    transaction.addEventListener("complete", () => db.close());
    transaction.addEventListener("error", () => reject(transaction.error));
  });
}

function updateFolderStatus() {
  if (!supportsDirectoryPicker()) {
    elements.folderStatus.textContent = "Браузер не поддерживает выбор папки. Сохранение будет через обычную загрузку.";
    return;
  }

  if (!state.resultsDirectoryHandle) {
    elements.folderStatus.textContent = "Папка не выбрана. Сохранение будет через обычную загрузку.";
    return;
  }

  const folderName = state.resultsDirectoryHandle.name || "selected-folder";
  elements.folderStatus.textContent = `Выбрана папка: ${folderName}`;
}

function loadPersistedSettings() {
  const savedApiKey = localStorage.getItem(storageKeys.apiKey);
  const savedModel = localStorage.getItem(storageKeys.model);
  const savedSelector = localStorage.getItem(storageKeys.selector);

  if (savedApiKey) {
    elements.apiKey.value = savedApiKey;
  }

  if (savedModel) {
    elements.model.value = savedModel;
  }

  if (savedSelector) {
    elements.selectorInput.value = savedSelector;
  }
}

function persistField(key, value) {
  if (value) {
    localStorage.setItem(key, value);
    return;
  }

  localStorage.removeItem(key);
}

function parseHtml(html) {
  const parser = new DOMParser();
  return parser.parseFromString(html, "text/html");
}

function sanitizeText(text) {
  return text.replace(/\s+/g, " ").trim();
}

function serializeNode(node) {
  const text = sanitizeText(node.textContent || "");
  if (text) {
    return text;
  }

  if (node instanceof Element) {
    return sanitizeText(node.outerHTML);
  }

  return "";
}

function toAbsoluteUrl(href) {
  if (!href) {
    return "";
  }

  try {
    return new URL(href, "https://www.upwork.com").toString();
  } catch (error) {
    return href;
  }
}

function extractOfferFromNode(node, index) {
  const container = node instanceof Element ? node : null;
  const linkElement = container?.querySelector("h3 a[href], a[href]");
  const descriptionElement = container?.querySelector("[data-test='job-description-text']");
  const title = sanitizeText(linkElement?.textContent || "");
  const url = toAbsoluteUrl(linkElement?.getAttribute("href") || "");
  const description = sanitizeText(descriptionElement?.textContent || container?.textContent || "");

  return {
    offer_index: index + 1,
    title: title || `Offer ${index + 1}`,
    url,
    description
  };
}

function formatOfferPreview(offer) {
  const lines = [
    `[${offer.offer_index}] ${offer.title}`
  ];

  if (offer.url) {
    lines.push(offer.url);
  }

  if (offer.description) {
    lines.push(offer.description);
  }

  return lines.join("\n");
}

function buildOffersText(offers) {
  return offers.map((offer) => [
    `=== OFFER ${offer.offer_index} ===`,
    `TITLE: ${offer.title}`,
    `URL: ${offer.url || "N/A"}`,
    "DESCRIPTION:",
    offer.description || "N/A"
  ].join("\n")).join("\n\n");
}

function mergeOfferMetadata(resultJson) {
  if (!resultJson || !Array.isArray(resultJson.offers)) {
    return resultJson;
  }

  return {
    ...resultJson,
    offers: resultJson.offers.map((offerResult) => {
      const extracted = state.extractedOffers.find((item) => item.offer_index === offerResult.offer_index);
      if (!extracted) {
        return offerResult;
      }

      return {
        ...offerResult,
        title: extracted.title,
        url: extracted.url,
        description: extracted.description
      };
    })
  };
}

function runCssSelector(doc, selector) {
  return Array.from(doc.querySelectorAll(selector));
}

function runXpathSelector(doc, selector) {
  const nodes = [];
  const result = doc.evaluate(
    selector,
    doc,
    null,
    XPathResult.ORDERED_NODE_SNAPSHOT_TYPE,
    null
  );

  for (let index = 0; index < result.snapshotLength; index += 1) {
    nodes.push(result.snapshotItem(index));
  }

  return nodes;
}

function updatePreview(matches) {
  state.matches = matches;
  state.extractedOffers = matches;
  state.combinedText = buildOffersText(matches);
  elements.matchCount.textContent = String(matches.length);
  elements.charCount.textContent = String(state.combinedText.length);
  elements.combinedText.textContent = state.combinedText || "Ничего не найдено.";
  elements.matchesList.innerHTML = "";

  if (!matches.length) {
    const item = document.createElement("li");
    item.textContent = "Совпадений нет.";
    elements.matchesList.appendChild(item);
    return;
  }

  matches.forEach((match) => {
    const item = document.createElement("li");
    item.textContent = formatOfferPreview(match);
    elements.matchesList.appendChild(item);
  });
}

function setResult(text, isError = false) {
  elements.resultOutput.textContent = text;
  elements.resultOutput.classList.toggle("error", isError);
  elements.resultOutput.classList.toggle("muted", !isError && text === "Пока пусто.");
}

function setResultJson(data) {
  state.lastResultJson = data;
  elements.saveJsonButton.disabled = false;
  setResult(JSON.stringify(data, null, 2));
}

function clearResultJson() {
  state.lastResultJson = null;
  elements.saveJsonButton.disabled = true;
}

function parseModelJson(payload) {
  if (payload.output_text) {
    try {
      return JSON.parse(payload.output_text);
    } catch (error) {
      throw new Error("Не удалось распарсить JSON из output_text.");
    }
  }

  const outputItems = Array.isArray(payload.output) ? payload.output : [];

  for (const item of outputItems) {
    const contentItems = Array.isArray(item.content) ? item.content : [];

    for (const content of contentItems) {
      if (typeof content.text === "string" && content.text.trim()) {
        try {
          return JSON.parse(content.text);
        } catch (error) {
          continue;
        }
      }
    }
  }

  throw new Error("Модель не вернула JSON ни в output_text, ни в output[].content[].text.");
}

function saveResultJson() {
  if (!state.lastResultJson) {
    return;
  }

  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const fileName = `offer-analysis-${stamp}.json`;
  const blob = new Blob([`${JSON.stringify(state.lastResultJson, null, 2)}\n`], {
    type: "application/json"
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

async function saveResultJsonToChosenFolder() {
  if (!state.lastResultJson || !state.resultsDirectoryHandle) {
    return false;
  }

  const permission = await state.resultsDirectoryHandle.requestPermission({ mode: "readwrite" });
  if (permission !== "granted") {
    throw new Error("Нет доступа на запись в выбранную папку.");
  }

  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const fileName = `offer-analysis-${stamp}.json`;
  const fileHandle = await state.resultsDirectoryHandle.getFileHandle(fileName, { create: true });
  const writable = await fileHandle.createWritable();

  await writable.write(`${JSON.stringify(state.lastResultJson, null, 2)}\n`);
  await writable.close();

  setResult(`JSON сохранен в выбранную папку как ${fileName}.`);
  return true;
}

async function chooseResultsFolder() {
  if (!supportsDirectoryPicker()) {
    throw new Error("Этот браузер не поддерживает выбор папки.");
  }

  const handle = await window.showDirectoryPicker({ mode: "readwrite" });
  const permission = await handle.requestPermission({ mode: "readwrite" });
  if (permission !== "granted") {
    throw new Error("Доступ к папке не был предоставлен.");
  }

  state.resultsDirectoryHandle = handle;
  await writeStoredDirectoryHandle(handle);
  updateFolderStatus();
}

async function restoreResultsFolder() {
  if (!supportsDirectoryPicker()) {
    updateFolderStatus();
    return;
  }

  const handle = await readStoredDirectoryHandle();
  if (!handle) {
    updateFolderStatus();
    return;
  }

  const permission = await handle.queryPermission({ mode: "readwrite" });
  state.resultsDirectoryHandle = handle;

  if (permission === "granted") {
    updateFolderStatus();
    return;
  }

  elements.folderStatus.textContent = `Папка ${handle.name || "results"} сохранена, но доступ нужно подтвердить заново.`;
}

function summarizeProfile(text) {
  const words = sanitizeText(text).split(" ").filter(Boolean);
  return `${words.length} words loaded`;
}

async function loadProfile() {
  const profilePath = elements.profilePreset.value;
  elements.profileStatus.textContent = `Загружается ${profilePath}...`;

  const response = await fetch(profilePath, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Не удалось загрузить ${profilePath}: ${response.status}`);
  }

  state.profileText = await response.text();
  elements.profileStatus.textContent = `${profilePath} · ${summarizeProfile(state.profileText)}`;
}

function extractMatches() {
  const html = elements.htmlInput.value.trim();
  const selector = elements.selectorInput.value.trim();

  if (!html) {
    throw new Error("Вставь HTML для разбора.");
  }

  if (!selector) {
    throw new Error("Укажи CSS или XPath селектор.");
  }

  persistField(storageKeys.selector, selector);

  const doc = parseHtml(html);
  const rawNodes = state.mode === "css"
    ? runCssSelector(doc, selector)
    : runXpathSelector(doc, selector);

  const matches = rawNodes
    .map((node, index) => extractOfferFromNode(node, index))
    .filter((offer) => offer.description || offer.title || offer.url);

  updatePreview(matches);
  return matches;
}

function buildAnalysisInput() {
  const profile = sanitizeText(state.profileText);
  const analysisPrompt = elements.analysisPrompt.value.trim();

  if (!profile) {
    throw new Error("Профиль не загружен.");
  }

  if (!state.combinedText) {
    throw new Error("Сначала извлеки текст из HTML.");
  }

  return [
    "PROFILE:",
    profile,
    "",
    "JOB OFFERS:",
    state.combinedText,
    "",
    "INSTRUCTION:",
    analysisPrompt
  ].join("\n");
}

async function analyzeOffer() {
  const apiKey = elements.apiKey.value.trim();
  const model = elements.model.value.trim();

  if (!apiKey) {
    throw new Error("Укажи OpenAI API key.");
  }

  if (!model) {
    throw new Error("Укажи модель.");
  }

  const input = buildAnalysisInput();
  setResult("Идет анализ...");

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model,
      input,
      text: {
        format: {
          type: "json_schema",
          name: "offer_match_result",
          schema: {
            type: "object",
            additionalProperties: false,
            properties: {
              offers: {
                type: "array",
                items: {
                  type: "object",
                  additionalProperties: false,
                  properties: {
                    offer_index: {
                      type: "number"
                    },
                    fit_score: {
                      type: "number"
                    },
                    recommendation: {
                      type: "string",
                      enum: ["apply_now", "maybe", "skip"]
                    },
                    niche_match: {
                      type: "string",
                      enum: ["exact", "adjacent", "weak"]
                    },
                    key_reasons: {
                      type: "array",
                      items: { type: "string" }
                    },
                    red_flags: {
                      type: "array",
                      items: { type: "string" }
                    },
                    questions_to_ask_client: {
                      type: "array",
                      items: { type: "string" }
                    },
                    suggested_project_shape: {
                      type: "string",
                      enum: ["pilot", "milestone", "hourly", "skip"]
                    }
                  },
                  required: [
                    "offer_index",
                    "fit_score",
                    "recommendation",
                    "niche_match",
                    "key_reasons",
                    "red_flags",
                    "questions_to_ask_client",
                    "suggested_project_shape"
                  ]
                }
              }
            },
            required: ["offers"]
          }
        }
      }
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OpenAI API error ${response.status}: ${errorText}`);
  }

  const payload = await response.json();
  const parsedResult = mergeOfferMetadata(parseModelJson(payload));
  setResultJson(parsedResult);
}

elements.cssModeButton.addEventListener("click", () => setMode("css"));
elements.xpathModeButton.addEventListener("click", () => setMode("xpath"));

elements.apiKey.addEventListener("input", (event) => {
  persistField(storageKeys.apiKey, event.target.value.trim());
});

elements.model.addEventListener("input", (event) => {
  persistField(storageKeys.model, event.target.value.trim());
});

elements.selectorInput.addEventListener("input", (event) => {
  persistField(storageKeys.selector, event.target.value.trim());
});

elements.extractButton.addEventListener("click", () => {
  try {
    clearResultJson();
    extractMatches();
    setResult("Текст извлечен. Можно запускать анализ.");
  } catch (error) {
    clearResultJson();
    setResult(error.message, true);
  }
});

elements.analyzeButton.addEventListener("click", async () => {
  try {
    if (!state.profileText) {
      await loadProfile();
    }
    if (!state.combinedText) {
      extractMatches();
    }
    await analyzeOffer();
  } catch (error) {
    clearResultJson();
    setResult(error.message, true);
  }
});

elements.profilePreset.addEventListener("change", async () => {
  try {
    await loadProfile();
    setResult("Профиль переключен.");
  } catch (error) {
    clearResultJson();
    elements.profileStatus.textContent = error.message;
    setResult(error.message, true);
  }
});

elements.chooseFolderButton.addEventListener("click", async () => {
  try {
    await chooseResultsFolder();
    setResult("Папка для сохранения выбрана.");
  } catch (error) {
    setResult(error.message, true);
  }
});

elements.saveJsonButton.addEventListener("click", async () => {
  try {
    if (state.resultsDirectoryHandle) {
      const saved = await saveResultJsonToChosenFolder();
      if (saved) {
        return;
      }
    }

    saveResultJson();
  } catch (error) {
    setResult(error.message, true);
  }
});

setMode("xpath");
loadPersistedSettings();
updatePreview([]);
updateFolderStatus();
loadProfile().catch((error) => {
  clearResultJson();
  elements.profileStatus.textContent = error.message;
  setResult(error.message, true);
});
restoreResultsFolder().catch((error) => {
  elements.folderStatus.textContent = error.message;
});
