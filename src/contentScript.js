import { parseMarkedCsv } from "./shared.js";

function getPageText() {
  return document.body?.innerText || "";
}

function setComposerText(text) {
  const textarea = document.querySelector("textarea#prompt-textarea, textarea[data-id='root']");
  if (!textarea) {
    throw new Error("Could not find the ChatGPT prompt textarea.");
  }

  textarea.focus();
  textarea.value = text;
  textarea.dispatchEvent(new Event("input", { bubbles: true }));
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  try {
    if (message.type === "extractCsv") {
      const parsed = parseMarkedCsv(
        getPageText(),
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
