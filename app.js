/*
 * Briefly — client-side logic.
 * No build step, no dependencies. Everything runs in the browser.
 */

// --- Configuration ---------------------------------------------------------

// Pollinations' OpenAI-compatible text endpoint. Keyless: no API key needed,
// no signup. `private: true` keeps generations out of Pollinations' public feed.
const API_URL = "https://text.pollinations.ai/openai/v1/chat/completions";
const API_MODEL = "openai";
const MAX_CHARS = 8000;      // client-side input cap (protects the anonymous tier)
const HISTORY_LIMIT = 10;    // how many past summaries localStorage keeps
const HISTORY_KEY = "briefly-history-v1";
const REQUEST_TIMEOUT_MS = 60000;

// Pre-baked prompt templates, one per mode. The user's text is appended
// after the template; templates are intentionally hidden from the UI.
const PROMPTS = {
  tldr: {
    title: "TL;DR",
    template:
      "Summarize the following text into exactly 3 concise bullet points " +
      "that capture the key points. Use plain markdown bullets (- ). " +
      "Text:\n\n",
  },
  eli5: {
    title: "Explain like I'm five",
    template:
      "Explain the following text as if the reader is five years old. " +
      "Use simple words and short sentences, no jargon. Keep it under " +
      "120 words. Text:\n\n",
  },
  actions: {
    title: "Action items",
    template:
      "Extract the action items from the following text. Return a numbered " +
      "markdown list of concrete tasks, each starting with a verb. If there " +
      "are no clear action items, say so in one sentence. Text:\n\n",
  },
};

// --- DOM references ---------------------------------------------------------

const $ = (id) => document.getElementById(id);
const inputEl = $("input-text");
const charCountEl = $("char-count");
const clearBtn = $("clear-btn");
const summarizeBtn = $("summarize-btn");
const errorBox = $("error-box");
const errorText = $("error-text");
const retryBtn = $("retry-btn");
const resultCard = $("result-card");
const resultTitle = $("result-title");
const resultBody = $("result-body");
const copyBtn = $("copy-btn");
const loadingEl = $("loading");
const historyList = $("history-list");
const clearHistoryBtn = $("clear-history-btn");

// --- Small helpers ----------------------------------------------------------

function currentMode() {
  const checked = document.querySelector('input[name="mode"]:checked');
  return checked ? checked.value : "tldr";
}

function escapeHtml(s) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

// Minimal markdown renderer: supports bullet/numbered lists, bold, and
// paragraphs. Avoids pulling in a library for a tiny tool.
function renderMarkdown(text) {
  const lines = text.split("\n");
  let html = "";
  let listOpen = null; // "ul" | "ol"

  const inline = (s) =>
    escapeHtml(s).replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");

  for (const raw of lines) {
    const line = raw.trim();
    if (/^[-*]\s+/.test(line)) {
      if (listOpen !== "ul") { html += "<ul>"; listOpen = "ul"; }
      html += "<li>" + inline(line.replace(/^[-*]\s+/, "")) + "</li>";
    } else if (/^\d+[.)]\s+/.test(line)) {
      if (listOpen !== "ol") { html += "<ol>"; listOpen = "ol"; }
      html += "<li>" + inline(line.replace(/^\d+[.)]\s+/, "")) + "</li>";
    } else {
      if (listOpen) { html += listOpen === "ul" ? "</ul>" : "</ol>"; listOpen = null; }
      if (line) html += "<p>" + inline(line) + "</p>";
    }
  }
  if (listOpen) html += listOpen === "ul" ? "</ul>" : "</ol>";
  return html;
}

// --- API call ---------------------------------------------------------------

async function summarize(text, mode) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({
        model: API_MODEL,
        private: true,
        messages: [{ role: "user", content: PROMPTS[mode].template + text }],
      }),
    });

    if (response.status === 429) {
      throw new Error(
        "The free API is rate-limited right now. Wait a minute and try again."
      );
    }
    if (!response.ok) {
      throw new Error(
        `The summarizer returned an error (${response.status}). Try again in a bit.`
      );
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content?.trim();
    if (!content) throw new Error("Got an empty response. Try again.");
    return content;
  } catch (err) {
    if (err.name === "AbortError") {
      throw new Error("The request timed out. Shorten the text and retry.");
    }
    throw err;
  } finally {
    clearTimeout(timeout);
  }
}

// --- History (localStorage) -------------------------------------------------

function loadHistory() {
  try {
    return JSON.parse(localStorage.getItem(HISTORY_KEY)) || [];
  } catch {
    return [];
  }
}

function saveToHistory(entry) {
  const history = loadHistory();
  history.unshift(entry);
  localStorage.setItem(HISTORY_KEY, JSON.stringify(history.slice(0, HISTORY_LIMIT)));
}

function renderHistory() {
  const history = loadHistory();
  historyList.innerHTML = "";

  if (history.length === 0) {
    const li = document.createElement("li");
    li.className = "history-empty";
    li.textContent =
      "Nothing here yet — your last 10 summaries will appear here.";
    historyList.appendChild(li);
    return;
  }

  history.forEach((entry, index) => {
    const li = document.createElement("li");
    const modeLabel = PROMPTS[entry.mode]?.title || entry.mode;
    const when = new Date(entry.ts).toLocaleString();
    li.innerHTML =
      `<div class="mode-tag">${escapeHtml(modeLabel)}</div>` +
      `<div class="preview">${escapeHtml(entry.output.slice(0, 160))}${
        entry.output.length > 160 ? "…" : ""
      }</div>` +
      `<div class="when">${escapeHtml(when)}</div>`;
    li.addEventListener("click", () => {
      const radio = document.querySelector(
        `input[name="mode"][value="${entry.mode}"]`
      );
      if (radio) radio.checked = true;
      inputEl.value = entry.input;
      updateCharCount();
      showResult(entry.mode, entry.output);
    });
    historyList.appendChild(li);
    void index;
  });
}

// --- UI state ----------------------------------------------------------------

function updateCharCount() {
  const len = inputEl.value.length;
  charCountEl.textContent = `${len.toLocaleString()} / ${MAX_CHARS.toLocaleString()}`;
  summarizeBtn.disabled = len === 0 || len > MAX_CHARS;
}

function showError(message) {
  errorText.textContent = message;
  errorBox.classList.remove("hidden");
}

function hideError() {
  errorBox.classList.add("hidden");
}

function setLoading(on) {
  loadingEl.classList.toggle("hidden", !on);
  summarizeBtn.disabled = on || inputEl.value.length === 0;
  summarizeBtn.textContent = on ? "Summarizing…" : "Summarize ✦";
}

function showResult(mode, text) {
  resultTitle.textContent = PROMPTS[mode]?.title || "Summary";
  resultBody.innerHTML = renderMarkdown(text);
  resultCard.classList.remove("hidden");
  resultCard.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

// --- Main action -------------------------------------------------------------

async function handleSummarize() {
  const text = inputEl.value.trim();
  if (!text) {
    showError("Paste some text first — anything from a tweet to a whole article.");
    return;
  }
  if (text.length > MAX_CHARS) {
    showError(`That's over the ${MAX_CHARS.toLocaleString()}-character limit. Trim it down a bit.`);
    return;
  }

  const mode = currentMode();
  hideError();
  setLoading(true);

  try {
    const summary = await summarize(text, mode);
    showResult(mode, summary);
    saveToHistory({ mode, input: text, output: summary, ts: Date.now() });
    renderHistory();
  } catch (err) {
    showError(err.message || "Something went wrong. Try again.");
  } finally {
    setLoading(false);
  }
}

// --- Wiring ------------------------------------------------------------------

inputEl.addEventListener("input", () => {
  hideError();
  updateCharCount();
});

clearBtn.addEventListener("click", () => {
  inputEl.value = "";
  updateCharCount();
  inputEl.focus();
});

summarizeBtn.addEventListener("click", handleSummarize);
retryBtn.addEventListener("click", handleSummarize);

copyBtn.addEventListener("click", async () => {
  const plain = resultBody.innerText;
  try {
    await navigator.clipboard.writeText(plain);
  } catch {
    // Fallback for non-secure contexts (e.g. file://)
    const ta = document.createElement("textarea");
    ta.value = plain;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand("copy");
    document.body.removeChild(ta);
  }
  copyBtn.textContent = "Copied ✓";
  setTimeout(() => (copyBtn.textContent = "Copy"), 1500);
});

clearHistoryBtn.addEventListener("click", () => {
  localStorage.removeItem(HISTORY_KEY);
  renderHistory();
});

// Init
updateCharCount();
renderHistory();
