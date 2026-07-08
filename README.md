# Google Keep clone

A simplified Google Keep clone built with plain HTML, CSS, and JavaScript
(no frameworks, no build step), styled to closely match Google Keep's real
UI: white chrome, the rounded search bar, an icon-only sidebar rail that
expands into labels, and pastel note cards.

## Features

- **Create notes** — click "Take a note…" at the top of the board to expand
  a composer with a title, body, and color picker.
- **Edit notes** — click any note card to open it in a full-size modal
  editor. Edits save automatically when the modal is closed.
- **Archive / restore** — archive a note from its card or the modal; switch
  to the **Archive** view in the sidebar to see archived notes and restore
  them.
- **Delete with undo** — deleting a note shows a toast with an **Undo**
  action for a few seconds before it's gone for good.
- **Search** — the search bar in the header filters visible notes by title
  and body in real time.
- **Color picker** — nine paper colors in a popover (click the paintbrush
  icon), available in both the composer and the editor modal.
- **List/grid view toggle** — the icon next to refresh in the top bar
  switches the note layout between masonry grid and single column.
- **Sidebar expand** — the hamburger menu expands the icon-only rail into
  labeled items on desktop, or opens a drawer on mobile.
- **Tooltips** — every icon button has a hover/focus tooltip describing what
  it does.
- **Responsive layout** — the sidebar collapses into a toggleable drawer on
  small screens; the note grid reflows into a single column on mobile.
- **Persistence** — notes are saved to the browser's `localStorage`, so your
  board is still there after a refresh.

Note: a few icons visible in real Google Keep (Reminders, Edit labels,
Trash, Settings, Apps grid) are included for visual fidelity but are
non-functional placeholders in this demo — their tooltips say so.

## Project structure

```
keep-clone/
├── index.html        # Page structure: header, sidebar, board, note
│                      # template, edit modal, toast
├── css/
│   └── style.css      # All styling: layout, note cards, modal, tooltips,
│                      # color themes, responsive rules
├── js/
│   └── app.js          # App logic: state, rendering, note CRUD,
│                      # archive/delete/undo, search, view switching
└── README.md
```

## Running the project

No build tools or dependencies are required. Any of the following works:

**Option 1 — just open it**
Double-click `index.html`, or drag it into a browser window.

**Option 2 — a local server (recommended for consistent `localStorage` behavior)**

```bash
# from inside the keep-clone folder
python3 -m http.server 8000
```

Then visit `http://localhost:8000` in your browser.

**Option 3 — VS Code Live Server**
If you use VS Code, install the "Live Server" extension, right-click
`index.html`, and choose "Open with Live Server."

## Deploying

Because this is a fully static site (no server-side code), it can be
deployed as-is to any static host — GitHub Pages, Netlify, Vercel, or
similar. Just upload the `keep-clone` folder (or push it to a repo) and
point the host at `index.html`.

## Notes on implementation

- State is a single in-memory array of note objects, persisted to
  `localStorage` after every change (`js/app.js`, sections 1–2).
- Rendering is a straightforward "re-render the visible list" pattern:
  any state change calls `render()`, which filters notes by the current
  view (Notes vs Archive) and search query, then rebuilds the grid from a
  `<template>` element (section 3).
- The color system is driven by a single `data-color` attribute per note,
  matched against CSS rules — adding a new color only requires one entry
  in the `COLORS` array and one CSS rule.
- Tooltips are pure CSS, driven by a `data-tooltip` attribute, so no
  JavaScript or extra markup is needed per button.