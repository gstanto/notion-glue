# Notion Glue (Chrome Extension)

A lightweight Chrome extension that persists structured ChatGPT output into a Notion database and can pull it back into your current chat.

## What this extension does

- Extracts a CSV block from the active ChatGPT tab.
- Pushes extracted rows into a configured Notion database.
- Pulls latest rows from Notion and injects them into ChatGPT prompt context.
- Lets you configure CSV ↔ Notion property mappings.

---

## Where the code is (and whether you need to download it)

If you are looking at this from ChatGPT, the code is in a temporary cloud/container filesystem used by this coding environment:

- Repo path here: `/workspace/notion-glue`

That means:

- `/workspace/notion-glue` is **not** a normal folder on your Windows/Mac computer.
- It is also **not automatically your GitHub repo** unless changes are pushed there.
- Think of it as a remote working copy where code is edited.

For your own machine, **yes** — you need a local copy before Chrome can load it.

Use one of these:

1. `git clone <repo-url>`
2. Or download ZIP from your git host and extract it.

After that, in Chrome use **Load unpacked** and select the extracted/cloned folder that contains `manifest.json`.

### Is this already on GitHub?

Only if you (or automation in your workflow) pushed commits to a GitHub remote.

Quick checks:

```bash
git remote -v
git log --oneline -n 5
```

- If a GitHub remote exists, you can open that repo URL and pull/download from there.
- If no remote exists, create one and push, or copy this folder contents to your own repo.

---

## Quick start (first time ever installing an extension)

You do **not** need to “build” this project first for the current MVP.
You can load this folder directly as an **unpacked extension**.

### 1) Download/clone this repo locally

If using git:

```bash
git clone <your-repo-url>
cd notion-glue
```

Or download the ZIP and extract it somewhere easy (for example: `Documents/notion-glue`).

### 2) Open Chrome extensions page

In Chrome, open:

```text
chrome://extensions
```

### 3) Enable Developer Mode

- Toggle **Developer mode** ON (top-right).

### 4) Load extension

- Click **Load unpacked**.
- Select the root folder of this project (the folder containing `manifest.json`).

If it loads correctly, you will see **Notion Glue for ChatGPT** in your extension list.

### 5) Pin extension (recommended)

- Click the puzzle icon in Chrome toolbar.
- Pin **Notion Glue for ChatGPT** so it is easy to open.

---

## Notion setup (required)

### 1) Create a Notion integration

1. Go to Notion integrations: https://www.notion.so/profile/integrations
2. Create a new internal integration.
3. Copy the **Internal Integration Token**.

### 2) Create a database/table in Notion

Create a database with columns matching your CSV headers (for example: `Task`, `Status`, `Owner`).

### 3) Share that database with your integration

Inside Notion database page:

- Click **Share**
- Invite/select your integration
- Confirm access

### 4) Copy your database ID

Open the database as a full page and copy the ID from URL.

Notion URLs usually look like this:

```text
https://www.notion.so/<workspace>/<DATABASE_ID>?v=<VIEW_ID>
```

Use the `<DATABASE_ID>` value.

---

## Configure extension settings

1. Click the extension icon.
2. Click **Open settings**.
3. Fill in:
   - Notion Integration Token
   - Notion Database ID
   - CSV Delimiter (usually `,`)
   - Start/End markers
   - CSV Column ↔ Notion Property mapping
4. Ensure at least one mapping type is `title` (required by Notion).
5. Click **Save settings**.

---

## How to use it day-to-day

### Step A — Ask ChatGPT for marked CSV output

Use this protocol:

```text
<!--DO-POST:BEGIN-->
Task,Status,Owner
Investigate API,Doing,Ada
Ship MVP,Todo,Lin
<!--DO-POST:END-->
```

### Step B — Push ChatGPT data to Notion

1. Keep your ChatGPT tab active.
2. Open extension popup.
3. Click **Extract CSV from ChatGPT**.
4. Click **Sync to Notion**.

### Step C — Pull persisted data back from Notion

1. In popup, click **Pull from Notion**.
2. Click **Insert pulled CSV in ChatGPT**.
3. The extension inserts wrapped data into the ChatGPT composer and also copies it to clipboard.

---

## Marker protocol details

### Recommended markers (default)

- `<!--DO-POST:BEGIN-->`
- `<!--DO-POST:END-->`

### Backward-compatible variants also accepted

- `<--DO-POST--> ... <!--DO-POST-->`
- `<!--DO-POST--> ... <!--DO-POST-->`

---

## Troubleshooting

### “Load unpacked” fails

- Make sure you selected the folder with `manifest.json` at its root.
- Refresh `chrome://extensions` and try again.

### On Windows, the folder picker can be confusing (what your screenshot shows)

In the **Select the extension directory** dialog, Chrome only expects you to pick a folder — it does **not** show `manifest.json` as a clickable file in this step.

Do this exactly:

1. Navigate to your project folder.
2. Click the folder that contains `manifest.json` (root of this repo).
3. Click **Select Folder**.

For your screenshot path, run this quick check in a terminal opened in that folder:

```bash
# Windows PowerShell
Get-ChildItem manifest.json
```

- If that command finds `manifest.json`, you are in the right folder.
- If it says file not found, you are in the wrong folder — go to the repo root that has `manifest.json` and try again.

### Buttons do nothing in popup

- Ensure active tab is ChatGPT (`chatgpt.com` or `chat.openai.com`).
- Reload the ChatGPT tab after installing the extension.

### Notion API errors

- Verify integration token is correct.
- Verify database ID is correct.
- Verify the integration has been shared to the database.
- Ensure mapping names exactly match Notion property names.

### Data pushes but looks wrong

- Confirm CSV headers match mapping `csvColumn` names.
- Confirm Notion property types in settings match real Notion schema.

---

## Current MVP limitations

- Push currently appends new pages (no upsert/dedup key yet).
- Pull reads up to 100 latest rows ordered by last edited time.
- Notion token is stored in `chrome.storage.sync` (use a least-privilege integration token).
