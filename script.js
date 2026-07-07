/**
 * PINBOARD — a simplified Google Keep clone
 * ------------------------------------------------------------------
 * Everything lives in one file for a project of this size, but it is
 * organized into clear sections:
 *   1. Constants & state
 *   2. Persistence (localStorage)
 *   3. Rendering (notes grid, note cards)
 *   4. Composer (create note)
 *   5. Modal (edit note)
 *   6. Note actions (archive / unarchive / delete / undo)
 *   7. Search & view switching (Notes vs Archive)
 *   8. Event wiring / init
 * ------------------------------------------------------------------
 */

(() => {
  "use strict";

  /* ------------------------------------------------------------------
   * 1. Constants & state
   * ------------------------------------------------------------------ */

  const STORAGE_KEY = "pinboard.notes.v1";

  const COLORS = [
    { id: "default", label: "Default" },
    { id: "butter", label: "Butter" },
    { id: "mint", label: "Mint" },
    { id: "sky", label: "Sky" },
    { id: "blossom", label: "Blossom" },
    { id: "lilac", label: "Lilac" },
  ];

  /** @type {{id:string,title:string,body:string,color:string,archived:boolean,createdAt:number,updatedAt:number}[]} */
  let notes = [];

  /** Current sidebar view: "notes" | "archive" */
  let currentView = "notes";

  /** Current search query, lowercase */
  let searchQuery = "";

  /** id of the note currently open in the modal, or null */
  let activeModalNoteId = null;

  /** Pending delete used to support "Undo" in the toast */
  let pendingDelete = null; // { note, index, timeoutId }

  /* DOM references, grabbed once on init */
  const dom = {};

  /* ------------------------------------------------------------------
   * 2. Persistence
   * ------------------------------------------------------------------ */

  function loadNotes() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      notes = raw ? JSON.parse(raw) : seedNotes();
    } catch (err) {
      console.error("Could not read saved notes, starting fresh.", err);
      notes = seedNotes();
    }
  }

  function saveNotes() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(notes));
    } catch (err) {
      console.error("Could not save notes.", err);
    }
  }

  /** A few starter notes so the board isn't empty on first run. */
  function seedNotes() {
    const now = Date.now();
    return [
      {
        id: crypto.randomUUID(),
        title: "Welcome to Pinboard",
        body: "Click \"Take a note…\" to jot something down. Hover a card to archive, delete, or open it for full editing.",
        color: "butter",
        archived: false,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: crypto.randomUUID(),
        title: "Grocery list",
        body: "Eggs\nOat milk\nCoffee\nBasil",
        color: "mint",
        archived: false,
        createdAt: now - 1000 * 60 * 60,
        updatedAt: now - 1000 * 60 * 60,
      },
      {
        id: crypto.randomUUID(),
        title: "Idea",
        body: "A corkboard where finished notes get pinned to an archive instead of vanishing.",
        color: "sky",
        archived: true,
        createdAt: now - 1000 * 60 * 60 * 24,
        updatedAt: now - 1000 * 60 * 60 * 24,
      },
    ];
  }

  /* ------------------------------------------------------------------
   * Helpers
   * ------------------------------------------------------------------ */

  function findNote(id) {
    return notes.find((n) => n.id === id);
  }

  function findIndex(id) {
    return notes.findIndex((n) => n.id === id);
  }

  function formatDate(timestamp) {
    return new Date(timestamp).toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      ...(new Date(timestamp).getFullYear() !== new Date().getFullYear() && { year: "numeric" }),
    });
  }

  /** Builds a row of color swatch buttons and wires selection. Returns nothing; mutates `container`. */
  function buildColorPicker(container, selectedColor, onSelect) {
    container.innerHTML = "";
    COLORS.forEach((color) => {
      const swatch = document.createElement("button");
      swatch.type = "button";
      swatch.className = "color-swatch";
      swatch.style.background = `var(--paper-${color.id})`;
      swatch.dataset.color = color.id;
      swatch.setAttribute("role", "radio");
      swatch.setAttribute("aria-label", color.label);
      swatch.setAttribute("data-tooltip", color.label);
      swatch.setAttribute("aria-checked", String(color.id === selectedColor));
      if (color.id === selectedColor) swatch.classList.add("is-selected");

      swatch.addEventListener("click", () => {
        container.querySelectorAll(".color-swatch").forEach((el) => {
          el.classList.remove("is-selected");
          el.setAttribute("aria-checked", "false");
        });
        swatch.classList.add("is-selected");
        swatch.setAttribute("aria-checked", "true");
        onSelect(color.id);
      });

      container.appendChild(swatch);
    });
  }

  /* ------------------------------------------------------------------
   * 3. Rendering
   * ------------------------------------------------------------------ */

  function render() {
    const isArchiveView = currentView === "archive";

    let visible = notes.filter((n) => n.archived === isArchiveView);

    if (searchQuery) {
      visible = visible.filter(
        (n) =>
          n.title.toLowerCase().includes(searchQuery) ||
          n.body.toLowerCase().includes(searchQuery)
      );
    }

    // Newest first
    visible = visible.slice().sort((a, b) => b.updatedAt - a.updatedAt);

    dom.notesGrid.innerHTML = "";

    if (visible.length === 0) {
      dom.emptyState.hidden = false;
      dom.emptyState.textContent = searchQuery
        ? "No notes match your search."
        : isArchiveView
        ? "Nothing archived yet."
        : "Your board is empty — take a note above.";
    } else {
      dom.emptyState.hidden = true;
      const fragment = document.createDocumentFragment();
      visible.forEach((note) => fragment.appendChild(buildNoteCard(note)));
      dom.notesGrid.appendChild(fragment);
    }

    // Composer only makes sense on the live "Notes" view
    dom.composer.hidden = isArchiveView;
  }

  function buildNoteCard(note) {
    const node = dom.noteTemplate.content.firstElementChild.cloneNode(true);

    node.dataset.id = note.id;
    node.dataset.color = note.color;

    const titleEl = node.querySelector(".note-card__title");
    const bodyEl = node.querySelector(".note-card__body");
    const dateEl = node.querySelector(".note-card__date");
    const archiveBtn = node.querySelector(".note-card__archive");
    const unarchiveBtn = node.querySelector(".note-card__unarchive");
    const deleteBtn = node.querySelector(".note-card__delete");

    titleEl.textContent = note.title;
    bodyEl.textContent = note.body;
    dateEl.textContent = formatDate(note.updatedAt);

    if (note.archived) {
      archiveBtn.hidden = true;
      unarchiveBtn.hidden = false;
    }

    // Open the modal editor when the card body (not an action button) is clicked
    node.addEventListener("click", (e) => {
      if (e.target.closest(".note-card__actions")) return;
      openModal(note.id);
    });
    node.addEventListener("keydown", (e) => {
      if ((e.key === "Enter" || e.key === " ") && !e.target.closest(".note-card__actions")) {
        e.preventDefault();
        openModal(note.id);
      }
    });

    archiveBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      setArchived(note.id, true);
    });
    unarchiveBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      setArchived(note.id, false);
    });
    deleteBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      deleteNote(note.id);
    });

    return node;
  }

  /* ------------------------------------------------------------------
   * 4. Composer (create note)
   * ------------------------------------------------------------------ */

  let composerColor = "default";

  function initComposer() {
    buildColorPicker(dom.composerColors, composerColor, (color) => {
      composerColor = color;
      dom.composerFormEl.dataset.color = color;
    });

    dom.composerTitle.addEventListener("focus", openComposer);
    dom.composerBody.addEventListener("focus", openComposer);

    dom.composerBody.addEventListener("input", () => {
      dom.composerBody.style.height = "auto";
      dom.composerBody.style.height = `${dom.composerBody.scrollHeight}px`;
    });

    dom.composerCloseBtn.addEventListener("click", closeComposer);

    dom.composerForm.addEventListener("submit", (e) => {
      e.preventDefault();
      createNoteFromComposer();
    });

    // Clicking outside the open composer closes (and saves, if there's content)
    document.addEventListener("click", (e) => {
      if (!dom.composer.classList.contains("is-open")) return;
      if (!dom.composer.contains(e.target)) {
        createNoteFromComposer();
      }
    });
  }

  function openComposer() {
    dom.composer.classList.add("is-open");
  }

  function closeComposer() {
    dom.composerForm.reset();
    dom.composerBody.style.height = "auto";
    dom.composer.classList.remove("is-open");
    composerColor = "default";
    dom.composerFormEl.dataset.color = "default";
    buildColorPicker(dom.composerColors, composerColor, (color) => {
      composerColor = color;
      dom.composerFormEl.dataset.color = color;
    });
  }

  function createNoteFromComposer() {
    const title = dom.composerTitle.value.trim();
    const body = dom.composerBody.value.trim();

    if (!title && !body) {
      closeComposer();
      return;
    }

    const now = Date.now();
    notes.push({
      id: crypto.randomUUID(),
      title,
      body,
      color: composerColor,
      archived: false,
      createdAt: now,
      updatedAt: now,
    });

    saveNotes();
    closeComposer();
    render();
  }

  /* ------------------------------------------------------------------
   * 5. Modal (edit note)
   * ------------------------------------------------------------------ */

  function initModal() {
    dom.modalCloseBtn.addEventListener("click", closeModal);
    dom.modalOverlay.addEventListener("click", (e) => {
      if (e.target === dom.modalOverlay) closeModal();
    });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && !dom.modalOverlay.hidden) closeModal();
    });

    dom.modalArchiveBtn.addEventListener("click", () => {
      if (!activeModalNoteId) return;
      const note = findNote(activeModalNoteId);
      setArchived(activeModalNoteId, !note.archived);
      closeModal();
    });

    dom.modalDeleteBtn.addEventListener("click", () => {
      if (!activeModalNoteId) return;
      deleteNote(activeModalNoteId);
      closeModal();
    });
  }

  function openModal(noteId) {
    const note = findNote(noteId);
    if (!note) return;

    activeModalNoteId = noteId;
    dom.modal.dataset.color = note.color;
    dom.modalTitle.value = note.title;
    dom.modalBody.value = note.body;
    dom.modalMeta.textContent = `Edited ${formatDate(note.updatedAt)}`;

    const isArchived = note.archived;
    dom.modalArchiveBtn.setAttribute("data-tooltip", isArchived ? "Restore" : "Archive");

    buildColorPicker(dom.modalColors, note.color, (color) => {
      dom.modal.dataset.color = color;
      updateActiveNote({ color });
    });

    dom.modalOverlay.hidden = false;
    dom.modalTitle.focus();
  }

  function closeModal() {
    if (activeModalNoteId) {
      // Persist any in-progress edits when the modal closes
      updateActiveNote({
        title: dom.modalTitle.value.trim(),
        body: dom.modalBody.value.trim(),
      });
    }
    activeModalNoteId = null;
    dom.modalOverlay.hidden = true;
    render();
  }

  /** Applies a partial update to the note currently open in the modal. */
  function updateActiveNote(partial) {
    const note = findNote(activeModalNoteId);
    if (!note) return;
    Object.assign(note, partial, { updatedAt: Date.now() });
    saveNotes();
  }

  /* ------------------------------------------------------------------
   * 6. Note actions
   * ------------------------------------------------------------------ */

  function setArchived(noteId, archived) {
    const note = findNote(noteId);
    if (!note) return;
    note.archived = archived;
    note.updatedAt = Date.now();
    saveNotes();
    render();
    showToast(archived ? "Note archived." : "Note restored.", null);
  }

  function deleteNote(noteId) {
    const index = findIndex(noteId);
    if (index === -1) return;

    const [removed] = notes.splice(index, 1);
    saveNotes();
    render();

    // Offer a short window to undo the delete
    if (pendingDelete) clearTimeout(pendingDelete.timeoutId);
    pendingDelete = {
      note: removed,
      index,
      timeoutId: setTimeout(() => {
        pendingDelete = null;
      }, 6000),
    };

    showToast("Note deleted.", "Undo", () => {
      if (!pendingDelete) return;
      notes.splice(pendingDelete.index, 0, pendingDelete.note);
      clearTimeout(pendingDelete.timeoutId);
      pendingDelete = null;
      saveNotes();
      render();
      hideToast();
    });
  }

  /* ------------------------------------------------------------------
   * Toast
   * ------------------------------------------------------------------ */

  let toastTimeoutId = null;

  function showToast(message, actionLabel, onAction) {
    dom.toastMessage.textContent = message;

    if (actionLabel) {
      dom.toastActionBtn.textContent = actionLabel;
      dom.toastActionBtn.hidden = false;
      dom.toastActionBtn.onclick = onAction;
    } else {
      dom.toastActionBtn.hidden = true;
      dom.toastActionBtn.onclick = null;
    }

    dom.toast.hidden = false;
    clearTimeout(toastTimeoutId);
    toastTimeoutId = setTimeout(hideToast, 6000);
  }

  function hideToast() {
    dom.toast.hidden = true;
  }

  /* ------------------------------------------------------------------
   * 7. Search & view switching
   * ------------------------------------------------------------------ */

  function initSearch() {
    dom.searchInput.addEventListener("input", (e) => {
      searchQuery = e.target.value.trim().toLowerCase();
      render();
    });
  }

  function initSidebar() {
    dom.sidebarItems.forEach((item) => {
      item.addEventListener("click", () => {
        dom.sidebarItems.forEach((el) => el.classList.remove("is-active"));
        item.classList.add("is-active");
        currentView = item.dataset.view;
        render();
        dom.sidebar.classList.remove("is-open"); // close mobile drawer after choosing
      });
    });

    dom.menuToggle.addEventListener("click", () => {
      dom.sidebar.classList.toggle("is-open");
    });
  }

  /* ------------------------------------------------------------------
   * 8. Init
   * ------------------------------------------------------------------ */

  function cacheDom() {
    dom.notesGrid = document.getElementById("notesGrid");
    dom.emptyState = document.getElementById("emptyState");
    dom.noteTemplate = document.getElementById("noteCardTemplate");

    dom.composer = document.getElementById("composer");
    dom.composerForm = document.getElementById("composerForm");
    dom.composerFormEl = dom.composerForm; // alias for clarity in color picker
    dom.composerTitle = document.getElementById("composerTitle");
    dom.composerBody = document.getElementById("composerBody");
    dom.composerColors = document.getElementById("composerColors");
    dom.composerCloseBtn = document.getElementById("composerCloseBtn");

    dom.modalOverlay = document.getElementById("modalOverlay");
    dom.modal = dom.modalOverlay.querySelector(".modal");
    dom.modalTitle = document.getElementById("modalTitle");
    dom.modalBody = document.getElementById("modalBody");
    dom.modalColors = document.getElementById("modalColors");
    dom.modalMeta = document.getElementById("modalMeta");
    dom.modalArchiveBtn = document.getElementById("modalArchiveBtn");
    dom.modalDeleteBtn = document.getElementById("modalDeleteBtn");
    dom.modalCloseBtn = document.getElementById("modalCloseBtn");

    dom.toast = document.getElementById("toast");
    dom.toastMessage = document.getElementById("toastMessage");
    dom.toastActionBtn = document.getElementById("toastActionBtn");

    dom.searchInput = document.getElementById("searchInput");
    dom.sidebar = document.getElementById("sidebar");
    dom.sidebarItems = document.querySelectorAll(".sidebar__item");
    dom.menuToggle = document.getElementById("menuToggle");
  }

  function init() {
    cacheDom();
    loadNotes();
    initComposer();
    initModal();
    initSearch();
    initSidebar();
    render();
  }

  document.addEventListener("DOMContentLoaded", init);
})();