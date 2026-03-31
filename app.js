const state = {
  mode: "xpath",
  matches: [],
  extractedOffers: [],
  combinedText: "",
  profileText: "",
  lastResultJson: null,
  resultsDirectoryHandle: null,
  favouriteKeys: new Set()
};

const storageKeys = {
  apiKey: "offer-matcher.apiKey",
  model: "offer-matcher.model",
  selector: "offer-matcher.selector",
  searchPrefix: "offer-matcher.searchPrefix"
};

const elements = {
  apiKey: document.querySelector("#apiKey"),
  model: document.querySelector("#model"),
  searchPrefix: document.querySelector("#searchPrefix"),
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
  loadJsonButton: document.querySelector("#loadJsonButton"),
  loadJsonInput: document.querySelector("#loadJsonInput"),
  currentModeLabel: document.querySelector("#currentModeLabel"),
  matchCount: document.querySelector("#matchCount"),
  charCount: document.querySelector("#charCount"),
  matchesList: document.querySelector("#matchesList"),
  combinedText: document.querySelector("#combinedText"),
  resultStatus: document.querySelector("#resultStatus"),
  resultOutput: document.querySelector("#resultOutput"),
  saveFavouriteButton: document.querySelector("#saveFavouriteButton"),
  saveJsonButton: document.querySelector("#saveJsonButton"),
  folderStatus: document.querySelector("#folderStatus")
};

const dbConfig = {
  name: "offer-matcher-db",
  version: 2,
  storeName: "settings",
  analysisStoreName: "analysis",
  directoryKey: "results-directory"
};

const analysisIndexFileName = "analysis-index.json";
const localAnalysisIndexKey = "analysis-index";

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
      if (!db.objectStoreNames.contains(dbConfig.analysisStoreName)) {
        db.createObjectStore(dbConfig.analysisStoreName);
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

async function readLocalAnalysisIndex() {
  const db = await openSettingsDb();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(dbConfig.analysisStoreName, "readonly");
    const store = transaction.objectStore(dbConfig.analysisStoreName);
    const request = store.get(localAnalysisIndexKey);

    request.addEventListener("success", () => {
      const payload = request.result;
      resolve(Array.isArray(payload?.entries) ? payload : createEmptyAnalysisIndex());
    });
    request.addEventListener("error", () => reject(request.error));
    transaction.addEventListener("complete", () => db.close());
    transaction.addEventListener("error", () => reject(transaction.error));
  });
}

async function writeLocalAnalysisIndex(indexPayload) {
  const db = await openSettingsDb();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(dbConfig.analysisStoreName, "readwrite");
    const store = transaction.objectStore(dbConfig.analysisStoreName);
    const request = store.put(indexPayload, localAnalysisIndexKey);

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
  const savedSearchPrefix = localStorage.getItem(storageKeys.searchPrefix);

  if (savedApiKey) {
    elements.apiKey.value = savedApiKey;
  }

  if (savedModel) {
    elements.model.value = savedModel;
  }

  if (savedSelector) {
    elements.selectorInput.value = savedSelector;
  }

  if (savedSearchPrefix) {
    elements.searchPrefix.value = savedSearchPrefix;
  }
}

function updateFolderStatus() {
  if (!supportsDirectoryPicker()) {
    elements.folderStatus.textContent = "Браузер не поддерживает выбор папки. Без папки результатов анализ недоступен.";
    elements.folderStatus.classList.add("warning");
    return;
  }

  if (!state.resultsDirectoryHandle) {
    elements.folderStatus.textContent = "Папка результатов не выбрана. Без нее анализ не будет запущен.";
    elements.folderStatus.classList.add("warning");
    return;
  }

  const folderName = state.resultsDirectoryHandle.name || "selected-folder";
  elements.folderStatus.textContent = `Выбрана папка: ${folderName}`;
  elements.folderStatus.classList.remove("warning");
}

async function hasUsableResultsFolder() {
  if (!supportsDirectoryPicker() || !state.resultsDirectoryHandle) {
    return false;
  }

  try {
    const permission = await state.resultsDirectoryHandle.queryPermission({ mode: "readwrite" });
    return permission === "granted";
  } catch (error) {
    return false;
  }
}

async function refreshAnalyzeAvailability() {
  const hasFolder = await hasUsableResultsFolder();
  elements.analyzeButton.disabled = !hasFolder;
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

function mergeOfferMetadata(resultJson, sourceOffers = state.extractedOffers) {
  if (!resultJson || !Array.isArray(resultJson.offers)) {
    return resultJson;
  }

  return {
    ...resultJson,
    offers: resultJson.offers.map((offerResult) => {
      const extracted = sourceOffers.find((item) => item.offer_index === offerResult.offer_index);
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

async function sha256Hex(input) {
  const encoded = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", encoded);
  return Array.from(new Uint8Array(digest))
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("");
}

async function enrichOffersWithIdentity(offers) {
  return Promise.all(offers.map(async (offer) => {
    const contentHash = await sha256Hex([
      offer.title || "",
      offer.description || ""
    ].join("\n"));

    return {
      ...offer,
      content_hash: contentHash,
      offer_key: offer.url || `hash:${contentHash}`
    };
  }));
}

async function buildAnalysisSignature() {
  const profileHash = await sha256Hex(sanitizeText(state.profileText || ""));
  const promptHash = await sha256Hex(elements.analysisPrompt.value.trim());

  return JSON.stringify({
    model: elements.model.value.trim(),
    search_prefix: elements.searchPrefix.value.trim(),
    profile_hash: profileHash,
    prompt_hash: promptHash
  });
}

function createEmptyAnalysisIndex() {
  return { entries: [] };
}

function normalizeAnalysisIndex(payload) {
  return Array.isArray(payload?.entries) ? payload : createEmptyAnalysisIndex();
}

function mergeAnalysisIndexes(...payloads) {
  const merged = new Map();

  payloads
    .map((payload) => normalizeAnalysisIndex(payload))
    .forEach((payload) => {
      payload.entries.forEach((entry) => {
        const existing = merged.get(entry.key);
        if (!existing) {
          merged.set(entry.key, entry);
          return;
        }

        const existingAt = existing.analyzed_at || "";
        const nextAt = entry.analyzed_at || "";
        if (nextAt >= existingAt) {
          merged.set(entry.key, entry);
        }
      });
    });

  return {
    entries: Array.from(merged.values())
  };
}

async function ensureResultsFolderWritePermission() {
  if (!state.resultsDirectoryHandle) {
    return false;
  }

  const permission = await state.resultsDirectoryHandle.requestPermission({ mode: "readwrite" });
  return permission === "granted";
}

async function readAnalysisIndex() {
  const localIndex = await readLocalAnalysisIndex();
  if (!state.resultsDirectoryHandle) {
    return localIndex;
  }

  const hasPermission = await ensureResultsFolderWritePermission();
  if (!hasPermission) {
    return localIndex;
  }
  if (!hasPermission) {
    throw new Error("Нет доступа к папке результатов для чтения analysis-index.json.");
  }

  const fileHandle = await state.resultsDirectoryHandle.getFileHandle(analysisIndexFileName, { create: true });
  const file = await fileHandle.getFile();
  const text = await file.text();

  if (!text.trim()) {
    return localIndex;
  }

  try {
    const parsed = JSON.parse(text);
    const merged = mergeAnalysisIndexes(localIndex, parsed);
    await writeLocalAnalysisIndex(merged);
    return merged;
  } catch (error) {
    return localIndex;
  }
}

async function writeAnalysisIndex(indexPayload) {
  await writeLocalAnalysisIndex(indexPayload);
  if (!state.resultsDirectoryHandle) {
    return;
  }

  const hasPermission = await ensureResultsFolderWritePermission();
  if (!hasPermission) {
    return;
  }
  if (!hasPermission) {
    throw new Error("Нет доступа к папке результатов для записи analysis-index.json.");
  }

  const fileHandle = await state.resultsDirectoryHandle.getFileHandle(analysisIndexFileName, { create: true });
  const writable = await fileHandle.createWritable();
  await writable.write(`${JSON.stringify(indexPayload, null, 2)}\n`);
  await writable.close();
}

function splitOffersAgainstIndex(offers, indexPayload, analysisSignature) {
  const indexMap = new Map((indexPayload.entries || []).map((entry) => [entry.key, entry]));
  const cachedOffers = [];
  const offersToAnalyze = [];

  offers.forEach((offer) => {
    const existing = indexMap.get(offer.offer_key);
    if (
      existing &&
      existing.content_hash === offer.content_hash &&
      existing.analysis_signature === analysisSignature &&
      existing.result
    ) {
      cachedOffers.push({
        ...existing.result,
        result_source: "cached",
        title: offer.title,
        url: offer.url,
        description: offer.description
      });
      return;
    }

    offersToAnalyze.push(offer);
  });

  return { cachedOffers, offersToAnalyze };
}

function mergeAnalysisResults(cachedOffers, analyzedPayload) {
  return {
    offers: [
      ...cachedOffers,
      ...(Array.isArray(analyzedPayload?.offers) ? analyzedPayload.offers : [])
    ]
  };
}

function upsertAnalysisIndex(indexPayload, analyzedOffers, analyzedResult, analysisSignature) {
  const nextEntries = new Map((indexPayload.entries || []).map((entry) => [entry.key, entry]));
  const analyzedResults = Array.isArray(analyzedResult?.offers) ? analyzedResult.offers : [];

  analyzedOffers.forEach((offer) => {
    const matchedResult = analyzedResults.find((item) => item.offer_index === offer.offer_index);
    if (!matchedResult) {
      return;
    }

    nextEntries.set(offer.offer_key, {
      key: offer.offer_key,
      content_hash: offer.content_hash,
      analyzed_at: new Date().toISOString(),
      model: elements.model.value.trim(),
      search_prefix: elements.searchPrefix.value.trim(),
      analysis_signature: analysisSignature,
      result: matchedResult
    });
  });

  return {
    entries: Array.from(nextEntries.values())
  };
}

function getOfferKey(offer) {
  return [
    offer.url || "",
    offer.title || "",
    offer.description || "",
    offer.offer_index || ""
  ].join("::");
}

function buildExportFileName() {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const model = (elements.model.value.trim() || "model").replace(/[^a-zA-Z0-9._-]/g, "_");
  const searchPrefix = (elements.searchPrefix.value.trim() || "search").replace(/[^a-zA-Z0-9._-]/g, "_");
  return `${stamp}_${model}_${searchPrefix}.json`;
}

function buildFavouriteFileName() {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  return `${stamp}_favourite.json`;
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
  elements.resultStatus.textContent = text;
  elements.resultStatus.classList.toggle("error", isError);
  elements.resultStatus.classList.toggle("muted", !isError && text === "Пока пусто.");
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function renderList(items) {
  if (!Array.isArray(items) || !items.length) {
    return "<div class=\"result-empty\">None</div>";
  }

  return `<ul>${items.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>`;
}

function renderResults(data) {
  const offers = Array.isArray(data?.offers) ? [...data.offers] : [];

  if (!offers.length) {
    elements.resultOutput.innerHTML = "<div class=\"result-empty\">No offer results returned.</div>";
    return;
  }

  offers.sort((left, right) => {
    const leftScore = typeof left.fit_score === "number" ? left.fit_score : -1;
    const rightScore = typeof right.fit_score === "number" ? right.fit_score : -1;
    return rightScore - leftScore;
  });

  elements.resultOutput.innerHTML = offers.map((offer) => {
    const offerKey = getOfferKey(offer);
    const isFavourite = state.favouriteKeys.has(offerKey);
    const source = offer.result_source === "cached" ? "cached" : "fresh";
    const urlMarkup = offer.url
      ? `<a class="result-link" href="${escapeHtml(offer.url)}" target="_blank" rel="noreferrer">${escapeHtml(offer.url)}</a>`
      : "<span class=\"muted\">No link</span>";

    return `
      <article class="result-card">
        <section class="result-pane">
          <p class="result-label">Offer ${escapeHtml(offer.offer_index ?? "?")}</p>
          <h3 class="result-title">${escapeHtml(offer.title || `Offer ${offer.offer_index ?? "?"}`)}</h3>
          <p class="result-description">${escapeHtml(offer.description || "No description available.")}</p>
        </section>
        <section class="result-pane result-meta">
          <div class="result-meta-top">
            <span class="score-badge">fit_score: ${escapeHtml(offer.fit_score ?? "?")}</span>
            <span class="source-badge ${source}">${source}</span>
            <button class="action-button favourite-button ${isFavourite ? "is-active" : ""}" type="button" data-offer-key="${escapeHtml(offerKey)}">
              ${isFavourite ? "In Favourite" : "Add Favourite"}
            </button>
          </div>
          <p class="result-line"><strong>Recommendation:</strong> ${escapeHtml(offer.recommendation || "N/A")}</p>
          <p class="result-line"><strong>Niche match:</strong> ${escapeHtml(offer.niche_match || "N/A")}</p>
          <p class="result-line"><strong>Project shape:</strong> ${escapeHtml(offer.suggested_project_shape || "N/A")}</p>
          <p class="result-line"><strong>Offer link:</strong><br>${urlMarkup}</p>
          <div class="result-section">
            <p class="result-label">Key Reasons</p>
            ${renderList(offer.key_reasons)}
          </div>
          <div class="result-section">
            <p class="result-label">Red Flags</p>
            ${renderList(offer.red_flags)}
          </div>
          <div class="result-section">
            <p class="result-label">Questions To Ask Client</p>
            ${renderList(offer.questions_to_ask_client)}
          </div>
        </section>
      </article>
    `;
  }).join("");

  elements.resultOutput.querySelectorAll(".favourite-button").forEach((button) => {
    button.addEventListener("click", () => {
      const key = button.getAttribute("data-offer-key");
      if (!key) {
        return;
      }

      if (state.favouriteKeys.has(key)) {
        state.favouriteKeys.delete(key);
      } else {
        state.favouriteKeys.add(key);
      }

      updateFavouriteUiState();
      renderResults(state.lastResultJson);
    });
  });
}

function setResultJson(data) {
  state.lastResultJson = data;
  elements.saveJsonButton.disabled = false;
  updateFavouriteUiState();
  setResult(`Loaded ${Array.isArray(data?.offers) ? data.offers.length : 0} analyzed offers.`);
  renderResults(data);
}

function clearResultJson() {
  state.lastResultJson = null;
  state.favouriteKeys = new Set();
  elements.saveJsonButton.disabled = true;
  elements.saveFavouriteButton.disabled = true;
  elements.resultOutput.innerHTML = "";
}

function updateFavouriteUiState() {
  elements.saveFavouriteButton.disabled = state.favouriteKeys.size === 0;
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

async function loadResultJsonFromFile(file) {
  const text = await file.text();
  let parsed;

  try {
    parsed = JSON.parse(text);
  } catch (error) {
    throw new Error("Не удалось распарсить выбранный JSON-файл.");
  }

  if (!parsed || !Array.isArray(parsed.offers)) {
    throw new Error("JSON-файл не содержит ожидаемое поле offers.");
  }

  return parsed;
}

function mergeLoadedResults(results) {
  return {
    offers: results.flatMap((result) => Array.isArray(result.offers) ? result.offers : [])
  };
}

function buildFavouritePayload() {
  const offers = Array.isArray(state.lastResultJson?.offers) ? state.lastResultJson.offers : [];
  return {
    offers: offers.filter((offer) => state.favouriteKeys.has(getOfferKey(offer)))
  };
}

function saveResultJson() {
  if (!state.lastResultJson) {
    return;
  }

  const fileName = buildExportFileName();
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

function savePayloadAsDownload(payload, fileName) {
  const blob = new Blob([`${JSON.stringify(payload, null, 2)}\n`], {
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

  const fileName = buildExportFileName();
  const fileHandle = await state.resultsDirectoryHandle.getFileHandle(fileName, { create: true });
  const writable = await fileHandle.createWritable();

  await writable.write(`${JSON.stringify(state.lastResultJson, null, 2)}\n`);
  await writable.close();
  return true;
}

async function savePayloadToChosenFolder(payload, fileName) {
  if (!state.resultsDirectoryHandle) {
    return false;
  }

  const permission = await state.resultsDirectoryHandle.requestPermission({ mode: "readwrite" });
  if (permission !== "granted") {
    throw new Error("Нет доступа на запись в выбранную папку.");
  }

  const fileHandle = await state.resultsDirectoryHandle.getFileHandle(fileName, { create: true });
  const writable = await fileHandle.createWritable();
  await writable.write(`${JSON.stringify(payload, null, 2)}\n`);
  await writable.close();
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
  await refreshAnalyzeAvailability();
}

async function restoreResultsFolder() {
  if (!supportsDirectoryPicker()) {
    updateFolderStatus();
    await refreshAnalyzeAvailability();
    return;
  }

  const handle = await readStoredDirectoryHandle();
  if (!handle) {
    updateFolderStatus();
    await refreshAnalyzeAvailability();
    return;
  }

  const permission = await handle.queryPermission({ mode: "readwrite" });
  state.resultsDirectoryHandle = handle;

  if (permission === "granted") {
    updateFolderStatus();
    await refreshAnalyzeAvailability();
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

function buildAnalysisInputForOffers(offers) {
  const profile = sanitizeText(state.profileText);
  const analysisPrompt = elements.analysisPrompt.value.trim();

  if (!profile) {
    throw new Error("Профиль не загружен.");
  }

  if (!offers.length) {
    throw new Error("Нет офферов для анализа.");
  }

  return [
    "PROFILE:",
    profile,
    "",
    "JOB OFFERS:",
    buildOffersText(offers),
    "",
    "INSTRUCTION:",
    analysisPrompt
  ].join("\n");
}

async function analyzeOffer(offers) {
  const apiKey = elements.apiKey.value.trim();
  const model = elements.model.value.trim();

  if (!apiKey) {
    throw new Error("Укажи OpenAI API key.");
  }

  if (!model) {
    throw new Error("Укажи модель.");
  }

  const input = buildAnalysisInputForOffers(offers);
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
  return mergeOfferMetadata(parseModelJson(payload), offers);
}

elements.cssModeButton.addEventListener("click", () => setMode("css"));
elements.xpathModeButton.addEventListener("click", () => setMode("xpath"));

elements.apiKey.addEventListener("input", (event) => {
  persistField(storageKeys.apiKey, event.target.value.trim());
});

elements.model.addEventListener("input", (event) => {
  persistField(storageKeys.model, event.target.value.trim());
});

elements.searchPrefix.addEventListener("change", (event) => {
  persistField(storageKeys.searchPrefix, event.target.value.trim());
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
  elements.analyzeButton.disabled = true;
  try {
    if (!await hasUsableResultsFolder()) {
      updateFolderStatus();
      throw new Error("Сначала выбери папку результатов и дай доступ на запись. Без этого анализ не запускается.");
    }

    if (!state.profileText) {
      await loadProfile();
    }
    if (!state.combinedText) {
      extractMatches();
    }

    const indexedOffers = await enrichOffersWithIdentity(state.extractedOffers);
    const indexPayload = await readAnalysisIndex();
    const analysisSignature = await buildAnalysisSignature();
    const { cachedOffers, offersToAnalyze } = splitOffersAgainstIndex(indexedOffers, indexPayload, analysisSignature);

    if (!offersToAnalyze.length) {
      const cachedOnlyPayload = mergeAnalysisResults(cachedOffers, { offers: [] });
      setResultJson(cachedOnlyPayload);
      setResult(`Loaded ${cachedOffers.length} cached offers. No new analysis needed.`);
      return;
    }

    const analyzedPayload = await analyzeOffer(offersToAnalyze);
    analyzedPayload.offers = analyzedPayload.offers.map((offer) => ({
      ...offer,
      result_source: "fresh"
    }));
    const mergedPayload = mergeAnalysisResults(cachedOffers, analyzedPayload);

    setResultJson(mergedPayload);
    setResult(`Loaded ${cachedOffers.length} cached and analyzed ${offersToAnalyze.length} new/changed offers.`);

    const nextIndex = upsertAnalysisIndex(indexPayload, offersToAnalyze, analyzedPayload, analysisSignature);
    await writeAnalysisIndex(nextIndex);
  } catch (error) {
    clearResultJson();
    setResult(error.message, true);
  } finally {
    await refreshAnalyzeAvailability();
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

elements.loadJsonButton.addEventListener("click", () => {
  elements.loadJsonInput.click();
});

elements.loadJsonInput.addEventListener("change", async (event) => {
  const files = Array.from(event.target.files || []);

  if (!files.length) {
    return;
  }

  try {
    const parsedResults = await Promise.all(files.map((file) => loadResultJsonFromFile(file)));
    const merged = mergeLoadedResults(parsedResults);
    state.lastResultJson = merged;
    elements.saveJsonButton.disabled = false;
    renderResults(merged);
    setResult(`Loaded ${merged.offers.length} offers from ${files.length} file(s).`);
  } catch (error) {
    clearResultJson();
    setResult(error.message, true);
  } finally {
    elements.loadJsonInput.value = "";
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

elements.saveFavouriteButton.addEventListener("click", async () => {
  try {
    const payload = buildFavouritePayload();
    if (!payload.offers.length) {
      setResult("No favourite offers selected.", true);
      return;
    }

    const fileName = buildFavouriteFileName();

    if (state.resultsDirectoryHandle) {
      const saved = await savePayloadToChosenFolder(payload, fileName);
      if (saved) {
        setResult(`Saved ${payload.offers.length} favourite offer(s).`);
        return;
      }
    }

    savePayloadAsDownload(payload, fileName);
    setResult(`Saved ${payload.offers.length} favourite offer(s).`);
  } catch (error) {
    setResult(error.message, true);
  }
});

async function restoreResultsFolder() {
  if (!supportsDirectoryPicker()) {
    updateFolderStatus();
    await refreshAnalyzeAvailability();
    return;
  }

  const handle = await readStoredDirectoryHandle();
  if (!handle) {
    updateFolderStatus();
    await refreshAnalyzeAvailability();
    return;
  }

  const permission = await handle.queryPermission({ mode: "readwrite" });
  state.resultsDirectoryHandle = handle;

  if (permission === "granted") {
    updateFolderStatus();
    await refreshAnalyzeAvailability();
    return;
  }

  elements.folderStatus.textContent = `Папка ${handle.name || "results"} сохранена, но доступ нужно подтвердить заново. Без этого анализ недоступен.`;
  elements.folderStatus.classList.add("warning");
  await refreshAnalyzeAvailability();
}

setMode("xpath");
loadPersistedSettings();
updatePreview([]);
updateFolderStatus();
elements.analyzeButton.disabled = true;
setResult("Пока пусто.");
loadProfile().catch((error) => {
  clearResultJson();
  elements.profileStatus.textContent = error.message;
  setResult(error.message, true);
});
restoreResultsFolder().catch((error) => {
  elements.folderStatus.textContent = error.message;
  elements.folderStatus.classList.add("warning");
  elements.analyzeButton.disabled = true;
});
