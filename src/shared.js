export const DEFAULT_CONFIG = {
  notionToken: "",
  notionDatabaseId: "",
  delimiter: ",",
  markerStart: "<!--DO-POST:BEGIN-->",
  markerEnd: "<!--DO-POST:END-->",
  schema: [
    { csvColumn: "Task", notionProperty: "Task", type: "title" },
    { csvColumn: "Status", notionProperty: "Status", type: "rich_text" }
  ]
};

export function parseCsv(input, delimiter = ",") {
  const rows = [];
  let current = "";
  let row = [];
  let inQuotes = false;

  for (let i = 0; i < input.length; i += 1) {
    const char = input[i];
    const next = input[i + 1];

    if (char === '"') {
      if (inQuotes && next === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === delimiter && !inQuotes) {
      row.push(current);
      current = "";
      continue;
    }

    if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && next === "\n") i += 1;
      row.push(current);
      if (row.some((cell) => cell.trim() !== "")) {
        rows.push(row);
      }
      row = [];
      current = "";
      continue;
    }

    current += char;
  }

  if (current.length > 0 || row.length > 0) {
    row.push(current);
    if (row.some((cell) => cell.trim() !== "")) {
      rows.push(row);
    }
  }

  return rows;
}

export function parseMarkedCsv(text, markerStart, markerEnd, delimiter) {
  const candidates = [
    { start: markerStart, end: markerEnd },
    { start: "<--DO-POST-->", end: "<!--DO-POST-->" },
    { start: "<!--DO-POST-->", end: "<!--DO-POST-->" },
    { start: "```csv", end: "```" },
    { start: "```", end: "```" }
  ];

  const block = candidates
    .map((pair) => {
      // Use lastIndexOf to find the MOST RECENT block (bottom of chat)
      const startAt = text.lastIndexOf(pair.start);
      if (startAt === -1) return null;

      const endAt = text.indexOf(pair.end, startAt + pair.start.length);
      if (endAt === -1) return null;

      return text.slice(startAt + pair.start.length, endAt).trim();
    })
    .find(Boolean);

  if (!block) {
    throw new Error("No marked CSV block was found in the page text.");
  }

  const rows = parseCsv(block, delimiter);
  if (rows.length < 2) {
    throw new Error("CSV block must include a header row and at least one data row.");
  }

  const [headers, ...dataRows] = rows;
  return {
    headers: headers.map((h) => h.trim()),
    rows: dataRows
      .filter((r) => r.some((cell) => cell.trim() !== ""))
      .map((r) => {
        const obj = {};
        headers.forEach((header, index) => {
          obj[header.trim()] = (r[index] ?? "").trim();
        });
        return obj;
      })
  };
}

export function toCsv(headers, rows, delimiter = ",") {
  const escape = (value) => {
    const raw = String(value ?? "");
    if (raw.includes('"') || raw.includes("\n") || raw.includes(delimiter)) {
      return `"${raw.replaceAll('"', '""')}"`;
    }
    return raw;
  };

  const lines = [headers.map(escape).join(delimiter)];
  for (const row of rows) {
    lines.push(headers.map((h) => escape(row[h])).join(delimiter));
  }
  return lines.join("\n");
}

export function storageGet(keys) {
  return chrome.storage.sync.get(keys);
}

export function storageSet(value) {
  return chrome.storage.sync.set(value);
}
