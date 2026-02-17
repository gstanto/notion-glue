// Inlined from shared.js to avoid module import issues in/content scripts
function parseCsv(input, delimiter = ",") {
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

function parseMarkedCsv(text, markerStart, markerEnd, delimiter) {
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

// Revised to target the specific Chat DOM
function getLastAssistantMessageText() {
  // Select all assistant message bubbles
  const messages = document.querySelectorAll('div[data-message-author-role="assistant"]');

  let target = null;
  if (messages.length > 0) {
    target = messages[messages.length - 1];
  } else {
    // Fallback: try standard "prose" classes usually used by GPT
    const proseBlocks = document.querySelectorAll('.markdown.prose');
    if (proseBlocks.length > 0) {
      target = proseBlocks[proseBlocks.length - 1];
    }
  }

  if (!target) {
    throw new Error("Could not find any assistant message on the page.");
  }

  // ChatGPT renders ```csv blocks as <pre><code> elements, so innerText
  // won't contain the backtick fence markers. Extract code blocks from
  // the DOM directly and re-wrap them so parseMarkedCsv can find them.
  const codeBlocks = target.querySelectorAll('pre code');
  if (codeBlocks.length > 0) {
    const lastCode = codeBlocks[codeBlocks.length - 1].textContent.trim();
    return "```csv\n" + lastCode + "\n```";
  }

  // No code blocks found — fall back to plain innerText for text-based markers
  return target.innerText;
}

function setComposerText(text) {
  // Strategy 1: Specific ID + contenteditable (Best match)
  let inputField = document.querySelector("#prompt-textarea[contenteditable='true']");

  // Strategy 2: ProseMirror class (Common in ChatGPT updates)
  if (!inputField) {
    inputField = document.querySelector(".ProseMirror[contenteditable='true']");
  }

  // Strategy 3: Any contenteditable div
  if (!inputField) {
    inputField = document.querySelector('[contenteditable="true"]');
  }

  // Strategy 4: Visible Textarea (Legacy/Fallback)
  if (!inputField) {
    const textareas = document.querySelectorAll("textarea");
    for (const ta of textareas) {
      if (ta.offsetParent !== null) { // check visibility
        inputField = ta;
        break;
      }
    }
  }

  if (!inputField) {
    throw new Error("Input target not found (v2). Please refresh the page.");
  }

  inputField.focus();

  if (inputField.tagName === "TEXTAREA") {
    inputField.value = text;
  } else {
    // Rich text editor logic
    inputField.innerHTML = `<p>${text}</p>`;
  }

  inputField.dispatchEvent(new Event("input", { bubbles: true }));
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  try {
    if (message.type === "extractCsv") {
      // Use the targeted text instead of the whole page
      const textToScan = getLastAssistantMessageText();

      const parsed = parseMarkedCsv(
        textToScan,
        message.markerStart,
        message.markerEnd,
        message.delimiter
      );
      sendResponse({ ok: true, parsed });
      return;
    }

    if (message.type === "setComposerText") {
      setComposerText(message.text || "");
      sendResponse({ ok: true });
      return;
    }

    sendResponse({ ok: false, error: `Unknown content message: ${message.type}` });
  } catch (error) {
    sendResponse({ ok: false, error: error.message || String(error) });
  }
});
