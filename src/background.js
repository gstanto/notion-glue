import { DEFAULT_CONFIG, storageGet } from "./shared.js";

const NOTION_VERSION = "2022-06-28";

function withConfig(config) {
  const merged = { ...DEFAULT_CONFIG, ...config };
  if (!merged.notionToken || !merged.notionDatabaseId) {
    throw new Error("Notion token and database id must be configured in the extension options.");
  }
  return merged;
}

function notionHeaders(token) {
  return {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
    "Notion-Version": NOTION_VERSION
  };
}

function toNotionProperty(value, type) {
  switch (type) {
    case "title":
      return { title: [{ type: "text", text: { content: value || "" } }] };
    case "number": {
      const n = Number(value);
      return { number: Number.isFinite(n) ? n : null };
    }
    case "checkbox":
      return { checkbox: ["true", "1", "yes"].includes(String(value).toLowerCase()) };
    case "url":
      return { url: value || null };
    case "date":
      return { date: value ? { start: value } : null };
    case "select":
      return { select: value ? { name: value } : null };
    case "status":
      return { status: value ? { name: value } : null };
    case "rich_text":
    default:
      return { rich_text: [{ type: "text", text: { content: value || "" } }] };
  }
}

function toPageProperties(row, schema) {
  const properties = {};
  schema.forEach((mapping) => {
    properties[mapping.notionProperty] = toNotionProperty(row[mapping.csvColumn], mapping.type);
  });
  return properties;
}

async function queryExistingPages(settings) {
  const endpoint = `https://api.notion.com/v1/databases/${settings.notionDatabaseId}/query`;
  const response = await fetch(endpoint, {
    method: "POST",
    headers: notionHeaders(settings.notionToken),
    body: JSON.stringify({ page_size: 100 })
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Failed to query existing pages: ${response.status} ${errorBody}`);
  }

  const data = await response.json();
  const titleMap = new Map();

  for (const page of data.results) {
    for (const prop of Object.values(page.properties)) {
      if (prop.type === "title") {
        const title = prop.title.map((t) => t.plain_text).join("");
        if (title) titleMap.set(title, page.id);
        break;
      }
    }
  }

  return titleMap;
}

async function pushRowsToNotion(config, rows) {
  const settings = withConfig(config);
  const titleMap = await queryExistingPages(settings);

  const titleMapping = settings.schema.find((m) => m.type === "title");
  if (!titleMapping) {
    throw new Error("Schema has no title property — cannot match rows.");
  }

  let created = 0;
  let updated = 0;

  for (const row of rows) {
    const properties = toPageProperties(row, settings.schema);
    const titleValue = row[titleMapping.csvColumn] || "";
    const existingPageId = titleMap.get(titleValue);

    if (existingPageId) {
      const response = await fetch(`https://api.notion.com/v1/pages/${existingPageId}`, {
        method: "PATCH",
        headers: notionHeaders(settings.notionToken),
        body: JSON.stringify({ properties })
      });
      if (!response.ok) {
        const errorBody = await response.text();
        throw new Error(`Failed to update row in Notion: ${response.status} ${errorBody}`);
      }
      updated++;
    } else {
      const response = await fetch("https://api.notion.com/v1/pages", {
        method: "POST",
        headers: notionHeaders(settings.notionToken),
        body: JSON.stringify({
          parent: { database_id: settings.notionDatabaseId },
          properties
        })
      });
      if (!response.ok) {
        const errorBody = await response.text();
        throw new Error(`Failed to create row in Notion: ${response.status} ${errorBody}`);
      }
      created++;
    }
  }

  return { created, updated };
}

function extractPlainValue(property) {
  if (!property) return "";
  if (property.type === "title") return property.title.map((x) => x.plain_text).join("");
  if (property.type === "rich_text") return property.rich_text.map((x) => x.plain_text).join("");
  if (property.type === "number") return property.number ?? "";
  if (property.type === "checkbox") return String(Boolean(property.checkbox));
  if (property.type === "url") return property.url ?? "";
  if (property.type === "select") return property.select?.name ?? "";
  if (property.type === "status") return property.status?.name ?? "";
  if (property.type === "date") return property.date?.start ?? "";
  return "";
}

async function pullRowsFromNotion(config) {
  const settings = withConfig(config);
  const endpoint = `https://api.notion.com/v1/databases/${settings.notionDatabaseId}/query`;
  const response = await fetch(endpoint, {
    method: "POST",
    headers: notionHeaders(settings.notionToken),
    body: JSON.stringify({
      page_size: 100,
      sorts: [{ timestamp: "last_edited_time", direction: "descending" }]
    })
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Failed to read Notion database: ${response.status} ${errorBody}`);
  }

  const data = await response.json();
  return data.results.map((page) => {
    const row = {};
    settings.schema.forEach((mapping) => {
      row[mapping.csvColumn] = extractPlainValue(page.properties[mapping.notionProperty]);
    });
    return row;
  });
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  (async () => {
    const { config = {} } = await storageGet("config");
    const mergedConfig = { ...DEFAULT_CONFIG, ...(config || {}) };

    if (message.type === "pushRows") {
      const result = await pushRowsToNotion(mergedConfig, message.rows || []);
      sendResponse({ ok: true, result });
      return;
    }

    if (message.type === "pullRows") {
      const rows = await pullRowsFromNotion(mergedConfig);
      sendResponse({ ok: true, rows, config: mergedConfig });
      return;
    }

    if (message.type === "getConfig") {
      sendResponse({ ok: true, config: mergedConfig });
      return;
    }

    if (message.type === "fetchSchema") {
      try {
        const schema = await fetchDatabaseSchema(message.token, message.databaseId);
        sendResponse({ ok: true, schema });
      } catch (error) {
        sendResponse({ ok: false, error: error.message });
      }
      return;
    }

    sendResponse({ ok: false, error: `Unknown message type: ${message.type}` });
  })().catch((error) => {
    sendResponse({ ok: false, error: error.message || String(error) });
  });

  return true;
});

async function fetchDatabaseSchema(token, databaseId) {
  const response = await fetch(`https://api.notion.com/v1/databases/${databaseId}`, {
    method: "GET",
    headers: notionHeaders(token)
  });

  if (!response.ok) {
    const errorBody = await response.text();
    if (response.status === 404) {
      throw new Error("Database not found. Please ensure you have added the 'Notion Glue' integration to the 'Master Open Loops' database page via the '...' menu -> 'Add connections'.");
    }
    throw new Error(`Failed to fetch database: ${response.status} ${errorBody}`);
  }

  const data = await response.json();
  const properties = data.properties || {};

  const schema = Object.entries(properties).map(([name, prop]) => {
    let type = prop.type;
    // Map API types to our supported types, default to rich_text if generic
    const supported = ["title", "rich_text", "number", "checkbox", "url", "select", "status", "date"];
    if (!supported.includes(type)) {
      type = "rich_text";
    }
    return {
      csvColumn: name,
      notionProperty: name,
      type: type
    };
  });

  // Sort so 'title' is first (user friendly)
  schema.sort((a, b) => (b.type === 'title') - (a.type === 'title'));

  return schema;
}
