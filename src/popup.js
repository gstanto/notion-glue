import { DEFAULT_CONFIG, storageGet, storageSet, toCsv } from "./shared.js";

let extracted = null;
let pulledRows = [];

const statusEl = document.getElementById("status");
const previewEl = document.getElementById("preview");
const pushBtn = document.getElementById("pushBtn");
const injectBtn = document.getElementById("injectBtn");

function setStatus(text, isError = false) {
  statusEl.textContent = text;
  statusEl.style.color = isError ? "#b00020" : "#1f2937";
}

async function getActiveTab() {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tabs.length) throw new Error("No active tab found.");
  return tabs[0];
}

async function getConfig() {
  const { config } = await storageGet("config");
  return { ...DEFAULT_CONFIG, ...(config || {}) };
}

function renderPreview(payload) {
  previewEl.textContent = JSON.stringify(payload, null, 2);
}

async function extractFromTab() {
  const config = await getConfig();
  const tab = await getActiveTab();

  const response = await chrome.tabs.sendMessage(tab.id, {
    type: "extractCsv",
    markerStart: config.markerStart,
    markerEnd: config.markerEnd,
    delimiter: config.delimiter
  });

  if (!response?.ok) {
    throw new Error(response?.error || "Could not extract CSV from this tab.");
  }

  extracted = response.parsed;
  pushBtn.disabled = false;
  setStatus(`Extracted ${extracted.rows.length} rows from tab.`);
  renderPreview(extracted);
}

async function pushToNotion() {
  if (!extracted) throw new Error("Extract data first.");

  const response = await chrome.runtime.sendMessage({
    type: "pushRows",
    rows: extracted.rows
  });

  if (!response?.ok) {
    throw new Error(response?.error || "Sync failed.");
  }

  setStatus(`Synced ${response.result.written} rows to Notion.`);
}

async function pullFromNotion() {
  const response = await chrome.runtime.sendMessage({ type: "pullRows" });
  if (!response?.ok) {
    throw new Error(response?.error || "Could not pull rows.");
  }

  pulledRows = response.rows;
  injectBtn.disabled = pulledRows.length === 0;

  const headers = response.config.schema.map((s) => s.csvColumn);
  const csv = toCsv(headers, pulledRows, response.config.delimiter);
  await storageSet({ lastPulledCsv: csv });

  setStatus(`Pulled ${pulledRows.length} rows from Notion.`);
  renderPreview({ headers, rows: pulledRows });
}

async function injectIntoChatGpt() {
  const tab = await getActiveTab();
  const { lastPulledCsv = "" } = await storageGet("lastPulledCsv");
  if (!lastPulledCsv) throw new Error("No pulled CSV available yet.");

  const wrapped = [
    "<!--PERSISTED-NOTION-DATA:BEGIN-->",
    lastPulledCsv,
    "<!--PERSISTED-NOTION-DATA:END-->"
  ].join("\n");

  const response = await chrome.tabs.sendMessage(tab.id, {
    type: "setComposerText",
    text: `Use this persisted project context:\n${wrapped}`
  });

  if (!response?.ok) {
    throw new Error(response?.error || "Could not inject text into ChatGPT.");
  }

  await navigator.clipboard.writeText(wrapped);
  setStatus("Injected persisted CSV into prompt and copied it to clipboard.");
}

document.getElementById("extractBtn").addEventListener("click", () => {
  extractFromTab().catch((error) => setStatus(error.message, true));
});

document.getElementById("pushBtn").addEventListener("click", () => {
  pushToNotion().catch((error) => setStatus(error.message, true));
});

document.getElementById("pullBtn").addEventListener("click", () => {
  pullFromNotion().catch((error) => setStatus(error.message, true));
});

document.getElementById("injectBtn").addEventListener("click", () => {
  injectIntoChatGpt().catch((error) => setStatus(error.message, true));
});

document.getElementById("openOptions").addEventListener("click", (event) => {
  event.preventDefault();
  chrome.runtime.openOptionsPage();
});
