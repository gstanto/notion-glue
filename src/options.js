import { DEFAULT_CONFIG, storageGet, storageSet } from "./shared.js";

const schemaRows = document.getElementById("schemaRows");
const statusEl = document.getElementById("status");

const typeOptions = ["title", "rich_text", "number", "checkbox", "url", "select", "status", "date"];

function rowTemplate(mapping = { csvColumn: "", notionProperty: "", type: "rich_text" }) {
  const tr = document.createElement("tr");
  tr.innerHTML = `
    <td><input class="csvColumn" value="${mapping.csvColumn}" /></td>
    <td><input class="notionProperty" value="${mapping.notionProperty}" /></td>
    <td>
      <select class="type">
        ${typeOptions
      .map((type) => `<option value="${type}" ${mapping.type === type ? "selected" : ""}>${type}</option>`)
      .join("")}
      </select>
    </td>
    <td><button class="delete" type="button">Delete</button></td>
  `;

  tr.querySelector(".delete").addEventListener("click", () => tr.remove());
  return tr;
}

function gatherSchema() {
  return [...schemaRows.querySelectorAll("tr")]
    .map((tr) => ({
      csvColumn: tr.querySelector(".csvColumn").value.trim(),
      notionProperty: tr.querySelector(".notionProperty").value.trim(),
      type: tr.querySelector(".type").value
    }))
    .filter((row) => row.csvColumn && row.notionProperty);
}

function setStatus(text, isError = false) {
  statusEl.textContent = text;
  statusEl.style.color = isError ? "#b00020" : "#166534";
}

async function loadConfig() {
  const { config } = await storageGet("config");
  const merged = { ...DEFAULT_CONFIG, ...(config || {}) };

  document.getElementById("token").value = merged.notionToken;
  document.getElementById("databaseId").value = merged.notionDatabaseId;
  document.getElementById("delimiter").value = merged.delimiter;
  document.getElementById("markerStart").value = merged.markerStart;
  document.getElementById("markerEnd").value = merged.markerEnd;

  schemaRows.innerHTML = "";
  merged.schema.forEach((mapping) => schemaRows.appendChild(rowTemplate(mapping)));
}

async function saveConfig() {
  const schema = gatherSchema();
  if (!schema.length) {
    throw new Error("Add at least one column mapping.");
  }
  if (!schema.some((x) => x.type === "title")) {
    throw new Error("At least one mapping must be type 'title' for Notion pages.");
  }

  const config = {
    notionToken: document.getElementById("token").value.trim(),
    notionDatabaseId: document.getElementById("databaseId").value.trim(),
    delimiter: document.getElementById("delimiter").value || ",",
    markerStart: document.getElementById("markerStart").value.trim() || DEFAULT_CONFIG.markerStart,
    markerEnd: document.getElementById("markerEnd").value.trim() || DEFAULT_CONFIG.markerEnd,
    schema
  };

  await storageSet({ config });
  setStatus("Saved settings.");
}

document.getElementById("addMapping").addEventListener("click", () => {
  schemaRows.appendChild(rowTemplate());
});

document.getElementById("save").addEventListener("click", () => {
  saveConfig().catch((error) => setStatus(error.message, true));
});

document.getElementById("autoDetect").addEventListener("click", async () => {
  try {
    const token = document.getElementById("token").value.trim();
    const databaseId = document.getElementById("databaseId").value.trim();

    if (!token || !databaseId) {
      throw new Error("Please enter Token and Database ID first.");
    }

    setStatus("Fetching schema from Notion...");
    const response = await chrome.runtime.sendMessage({
      type: "fetchSchema",
      token,
      databaseId
    });

    if (!response.ok) {
      throw new Error(response.error);
    }

    // Clear and populate
    schemaRows.innerHTML = "";
    response.schema.forEach((mapping) => schemaRows.appendChild(rowTemplate(mapping)));
    setStatus(`Auto-detected ${response.schema.length} columns.`);
  } catch (error) {
    setStatus(error.message, true);
  }
});

loadConfig().catch((error) => setStatus(error.message, true));
