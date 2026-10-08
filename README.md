# Briefly — paste anything, get the gist

A single-page mini tool for the "too long, didn't read" moment: paste long
text (an article, meeting notes, a long thread, lecture notes), pick a mode —
**TL;DR**, **Explain like I'm five**, or **Action items** — and get an instant
summary.

![status](https://img.shields.io/badge/status-working-brightgreen)
![stack](https://img.shields.io/badge/stack-HTML%20%2B%20CSS%20%2B%20vanilla%20JS-blue)

## Features

- **3 summary modes** with pre-baked prompt templates (hidden from the user):
  - TL;DR → exactly 3 sharp bullet points
  - ELI5 → plain-language explanation, under 120 words
  - Action items → numbered list of concrete tasks
- **Character counter** with an 8,000-character input cap
- **Loading, error & retry states** — friendly messages for rate limits (429)
  and timeouts instead of silent failures
- **Copy-to-clipboard** button on every summary
- **History** — last 10 summaries saved in `localStorage`; click any entry to
  restore it (mode, input, and output)
- Fully **responsive**; works on phone browsers too

## How to run

No build step, no install. It's a static site:

1. Clone or download this repo.
2. Open `index.html` in any modern browser — or serve the folder
   (`python3 -m http.server 8000`) and visit `http://localhost:8000`.
3. (Optional) Deploy on **GitHub Pages**: Settings → Pages → Deploy from
   branch → `main` → `/ (root)`. The app works the moment Pages is live.

## How the AI integration works

Briefly calls the **Pollinations text API** — specifically its OpenAI-compatible
endpoint — directly from the browser:

- **Endpoint:** `POST https://text.pollinations.ai/openai/v1/chat/completions`
- **No API key, no signup.** The anonymous tier works out of the box, which is
  why the app runs with zero configuration on GitHub Pages.
- The request sends the chosen pre-baked prompt template + your pasted text,
  with `"private": true` so generations stay out of Pollinations' public feed.
- Model used: `"openai"` (Pollinations' default model alias).

**Known limits (anonymous tier):** the API can return HTTP 429 or time out on
heavy traffic. That's why the app has:

- an 8,000-character input cap (keeps prompts cheap),
- a 60-second client timeout (`AbortController`),
- a retry button and plain-English error messages.

If the limits ever bite, the same endpoint accepts an optional Pollinations
`sk_...` key in an `Authorization` header — the natural next step would be an
optional "add your key" field in the UI.

## Files

| File | What it does |
|---|---|
| `index.html` | Page structure: input, mode picker, result card, history |
| `styles.css` | Dark minimal theme, no frameworks |
| `app.js` | Prompt templates, API call, history, UI state |
| `README.md` | This file |

## Interview notes

**What the project is.** Briefly is a client-side text summarizer with three
prompt modes. I built it as a one-day portfolio mini-tool to ship something
people actually use daily, and to show I can integrate an LLM API with zero
backend.

**Why these technical decisions:**

- **Static, no build step** — a tool this small doesn't earn a bundler. Three
  files open anywhere, deploy on GitHub Pages in one click, and any reviewer
  can read the whole codebase in five minutes.
- **Pollinations API, keyless** — I wanted the app to work the instant someone
  opens the link, with no signup friction. Pollinations' OpenAI-compatible
  endpoint worked keyless when I tested it during the build (the legacy
  `GET /{prompt}` path was returning errors, so I verified and shipped the
  `POST /openai/v1/chat/completions` path instead).
- **Prompt templates hidden from the user** — the UI asks *what kind* of
  summary you want, not *how to prompt*. That's the product decision: prompt
  engineering is my job, not the user's.
- **Minimal markdown renderer instead of a library** — the API returns
  markdown (bullets, bold), but pulling in a full markdown library for that
  is overkill. ~30 lines handle lists, bold, and paragraphs safely, with
  HTML escaping first to avoid injecting raw HTML.
- **`localStorage` for history** — no accounts, no database. History is a
  convenience feature, so browser-local storage is the honest, proportionate
  choice.

**Trade-offs and limitations:**

- The anonymous API tier is rate-limited and can be slow; the 8k char cap and
  60s timeout are guardrails, not fixes. Heavy daily use would need a key.
- No streaming — the summary appears all at once after the request completes,
  so long texts feel slower than a streaming chat UI.
- Input is truncated client-side at 8,000 characters; very long documents
  need manual chunking.
- History lives in one browser only — clear your browser data and it's gone.
- I did not use a JavaScript framework; for this scope that's a feature (tiny,
  fast), but the app would need restructuring if it grew real features like
  accounts or saved collections.

**How I'd extend it:**

1. Optional "bring your own key" field stored locally, raising rate limits.
2. Streaming responses (`stream: true`) for a snappier feel.
3. A "custom mode" where the user writes their own instruction.
4. Share links — encode a summary in a URL hash so it can be passed around.
5. A lightweight backend (or serverless function) to hide the API key and add
   per-user rate limiting if it ever gets real traffic.
