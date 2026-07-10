/**
 * Kazadi KEEP CLONE interactivity
 * ------------------------------------------------------------------
 * Organized into sections:
 * 1. Constants & state
 * 2. Persistence (localStorage)
 * 3. Rendering (notes grid, note cards)
 * 4. Composer (create note)
 * 5. Modal (edit note)
 * 6. Note actions (archive / unarchive / delete / undo)
 * 7. Search & view switching (Notes vs Archive, list vs grid)
 * 8. Chrome (sidebar expand, refresh, color popovers)
 * 9. Event wiring / init
 * ------------------------------------------------------------------
 */

(() => {
  "use strict";

  /* ------------------------------------------------------------------
   * 1. Constants & state
   * ------------------------------------------------------------------ */

  const STORAGE_KEY = "keep-clone.notes.v1";
  const LABELS_STORAGE_KEY = "keep-clone.labels.v1";

  const COLORS = [
    { id: "default", label: "Default" },
    { id: "coral", label: "Coral" },
    { id: "sand", label: "Sand" },
    { id: "mint", label: "Mint" },
    { id: "sage", label: "Sage" },
    { id: "storm", label: "Storm" },
    { id: "dusk", label: "Dusk" },
    { id: "blossom", label: "Blossom" },
    { id: "clay", label: "Clay" },
  ];

  let notes = [];
  let currentView = "notes";
  let searchQuery = "";
  let activeModalNoteId = null;
  let layoutMode = "grid";
  let labels = [];

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

  function loadLabels() {
    try {
      const raw = localStorage.getItem(LABELS_STORAGE_KEY);
      labels = raw ? JSON.parse(raw) : [];
    } catch (err) {
      console.error("Could not read saved labels, starting fresh.", err);
      labels = [];
    }
  }

  function saveLabels() {
    try {
      localStorage.setItem(LABELS_STORAGE_KEY, JSON.stringify(labels));
    } catch (err) {
      console.error("Could not save labels.", err);
    }
  }

  function purgeOldTrash() {
    const SEVEN_DAYS = 7 * 24 * 60 * 60 * 1000;
    const now = Date.now();
    const before = notes.length;
    notes = notes.filter((n) => !(n.trashed && n.deletedAt && now - n.deletedAt > SEVEN_DAYS));
    if (notes.length !== before) saveNotes();
  }

  function seedNotes() {
    const now = Date.now();
    return [
      {
        id: crypto.randomUUID(),
        title: "Welcome Message",
        body: "Welcome to Kazadi Google Keep clone! This is a sample note to get you started.",
        color: "mint",
        archived: false,
        pinned: false,
        trashed: false,
        deletedAt: null,
        hasReminder: false,
        createdAt: now,
        updatedAt: now,
      }
    ];
  }

  /* ------------------------------------------------------------------
   * Helpers
   * ------------------------------------------------------------------ */

  function findNote(id) { return notes.find((n) => n.id === id); }
  function findIndex(id) { return notes.findIndex((n) => n.id === id); }

  function formatDate(timestamp) {
    const d = new Date(timestamp);
    const opts = { month: "short", day: "numeric" };
    if (d.getFullYear() !== new Date().getFullYear()) opts.year = "numeric";
    return d.toLocaleDateString(undefined, opts);
  }

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
    let visible;
    if (currentView === "trash") {
      visible = notes.filter((n) => n.trashed);
    } else if (currentView === "archive") {
      visible = notes.filter((n) => n.archived && !n.trashed);
    } else if (currentView === "reminders") {
      visible = notes.filter((n) => n.hasReminder && !n.trashed);
    } else {
      visible = notes.filter((n) => !n.archived && !n.trashed);
    }

    if (searchQuery) {
      visible = visible.filter(
        (n) =>
          n.title.toLowerCase().includes(searchQuery) ||
          n.body.toLowerCase().includes(searchQuery)
      );
    }

    visible = visible.slice().sort((a, b) => {
      const pinDiff = (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0);
      return pinDiff !== 0 ? pinDiff : b.updatedAt - a.updatedAt;
    });

    dom.notesGrid.innerHTML = "";
    dom.notesGrid.classList.toggle("is-list-view", layoutMode === "list");

    if (visible.length === 0) {
      dom.emptyState.hidden = false;
      dom.emptyStateText.textContent = searchQuery
        ? "No notes match your search."
        : currentView === "archive"
        ? "Nothing archived yet."
        : currentView === "trash"
        ? "No notes in Trash."
        : currentView === "reminders"
        ? "No reminders yet."
        : "Notes you add appear here";
    } else {
      dom.emptyState.hidden = true;
      const fragment = document.createDocumentFragment();
      visible.forEach((note) => fragment.appendChild(buildNoteCard(note)));
      dom.notesGrid.appendChild(fragment);
    }

    dom.composer.hidden = currentView !== "notes";
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

    if (note.trashed) {
      archiveBtn.hidden = true;
      unarchiveBtn.hidden = false;
      deleteBtn.setAttribute("data-tooltip", "Delete forever");
    } else if (note.archived) {
      archiveBtn.hidden = true;
      unarchiveBtn.hidden = false;
      deleteBtn.setAttribute("data-tooltip", "Delete");
    } else {
      archiveBtn.hidden = false;
      unarchiveBtn.hidden = true;
      deleteBtn.setAttribute("data-tooltip", "Delete");
    }

    node.addEventListener("click", (e) => {
      if (e.target.closest(".note-card__actions")) return;
      openModal(note.id);
    });

    archiveBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      setArchived(note.id, true);
    });
    unarchiveBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      if (note.trashed) restoreFromTrash(note.id);
      else setArchived(note.id, false);
    });
    deleteBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      if (note.trashed) permanentlyDeleteNote(note.id);
      else deleteNote(note.id);
    });

    return node;
  }

  /* ------------------------------------------------------------------
   * 4. Composer (create note)
   * ------------------------------------------------------------------ */

  let composerColor = "default";
  let composerPinned = false;
  let composerHasReminder = false;

  function initComposer() {
    refreshComposerColorPicker();
    dom.composerTitle.addEventListener("focus", openComposer);
    dom.composerBody.addEventListener("focus", openComposer);
    dom.composerBody.addEventListener("input", () => {
      dom.composerBody.style.height = "auto";
      dom.composerBody.style.height = `${dom.composerBody.scrollHeight}px`;
    });
    dom.composerCloseBtn.addEventListener("click", () => createNoteFromComposer());
    dom.composerColorBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      togglePopover(dom.composerColorPopover, dom.composerColorBtn);
    });
    dom.composerColorBtnCollapsed.addEventListener("click", (e) => {
      e.stopPropagation(); openComposer();
      togglePopover(dom.composerColorPopover, dom.composerColorBtn);
    });

    dom.composerPinBtn.addEventListener("click", () => {
      composerPinned = !composerPinned;
      dom.composerPinBtn.setAttribute("aria-pressed", String(composerPinned));
    });

    dom.composerReminderBtn.addEventListener("click", () => {
      composerHasReminder = !composerHasReminder;
      dom.composerReminderBtn.setAttribute("aria-pressed", String(composerHasReminder));
    });

    dom.composerArchiveBtn.addEventListener("click", () => {
      createNoteFromComposer({ archived: true });
    });

    document.addEventListener("click", (e) => {
      if (dom.composer.contains(e.target)) return;
      if (!dom.composer.classList.contains("is-open")) return;
      createNoteFromComposer();
    });
  }

  function refreshComposerColorPicker() {
    buildColorPicker(dom.composerColors, composerColor, (color) => {
      composerColor = color;
      dom.composerFormEl.dataset.color = color;
    });
  }

  function openComposer() { dom.composer.classList.add("is-open"); }

  function closeComposer() {
    dom.composerForm.reset();
    dom.composerBody.style.height = "auto";
    dom.composer.classList.remove("is-open");
    dom.composerColorPopover.hidden = true;
    composerColor = "default";
    dom.composerFormEl.dataset.color = "default";
    refreshComposerColorPicker();
    composerPinned = false;
    dom.composerPinBtn.setAttribute("aria-pressed", "false");
    composerHasReminder = false;
    dom.composerReminderBtn.setAttribute("aria-pressed", "false");
  }

  function createNoteFromComposer(options = {}) {
    const title = dom.composerTitle.value.trim();
    const body = dom.composerBody.value.trim();
    if (!title && !body) { closeComposer(); return; }

    const now = Date.now();
    notes.push({
      id: crypto.randomUUID(),
      title, body, color: composerColor,
      pinned: composerPinned, hasReminder: composerHasReminder,
      archived: Boolean(options.archived), trashed: false,
      deletedAt: null, createdAt: now, updatedAt: now,
    });

    saveNotes(); closeComposer(); render();
    if (options.archived) showToast("Note archived.", null);
  }

  /* ------------------------------------------------------------------
   * 5. Modal (edit note)
   * ------------------------------------------------------------------ */

  function initModal() {
    dom.modalCloseBtn.addEventListener("click", closeModal);
    dom.modalOverlay.addEventListener("click", (e) => {
      if (e.target === dom.modalOverlay) closeModal();
    });
    dom.modalArchiveBtn.addEventListener("click", () => {
      if (!activeModalNoteId) return;
      const note = findNote(activeModalNoteId);
      setArchived(activeModalNoteId, !note.archived);
      closeModal();
    });
    dom.modalRestoreBtn.addEventListener("click", () => {
      if (!activeModalNoteId) return;
      restoreFromTrash(activeModalNoteId); closeModal();
    });
    dom.modalDeleteBtn.addEventListener("click", () => {
      if (!activeModalNoteId) return;
      const note = findNote(activeModalNoteId);
      if (note.trashed) permanentlyDeleteNote(activeModalNoteId);
      else deleteNote(activeModalNoteId);
      closeModal();
    });
    dom.modalColorBtn.addEventListener("click", (e) => {
      e.stopPropagation(); togglePopover(dom.modalColorPopover, dom.modalColorBtn);
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

    const isTrashed = note.trashed;
    dom.modalArchiveBtn.hidden = isTrashed;
    dom.modalRestoreBtn.hidden = !isTrashed;

    buildColorPicker(dom.modalColors, note.color, (color) => {
      dom.modal.dataset.color = color;
      updateActiveNote({ color });
    });

    dom.modalOverlay.hidden = false;
    dom.modalTitle.focus();
  }

  function closeModal() {
    if (activeModalNoteId) {
      updateActiveNote({
        title: dom.modalTitle.value.trim(),
        body: dom.modalBody.value.trim(),
      });
    }
    activeModalNoteId = null;
    dom.modalOverlay.hidden = true;
    dom.modalColorPopover.hidden = true;
    render();
  }

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
    saveNotes(); render();
    showToast(archived ? "Note archived." : "Note restored.", null);
  }

  function deleteNote(noteId) {
    const note = findNote(noteId);
    if (!note) return;
    note.trashed = true; note.deletedAt = Date.now();
    saveNotes(); render();

    showToast("Note moved to trash.", "Undo", () => {
      note.trashed = false; note.deletedAt = null;
      saveNotes(); render(); hideToast();
    });
  }

  function restoreFromTrash(noteId) {
    const note = findNote(noteId);
    if (!note) return;
    note.trashed = false; note.deletedAt = null; note.updatedAt = Date.now();
    saveNotes(); render(); showToast("Note restored.", null);
  }

  function permanentlyDeleteNote(noteId) {
    const index = findIndex(noteId);
    if (index === -1) return;
    notes.splice(index, 1);
    saveNotes(); render(); showToast("Note deleted forever.", null);
  }

  /* Toast management */
  let toastTimeoutId = null;
  function showToast(message, actionLabel, onAction) {
    dom.toastMessage.textContent = message;
    if (actionLabel) {
      dom.toastActionBtn.textContent = actionLabel;
      dom.toastActionBtn.hidden = false; dom.toastActionBtn.onclick = onAction;
    } else {
      dom.toastActionBtn.hidden = true;
    }
    dom.toast.hidden = false;
    clearTimeout(toastTimeoutId);
    toastTimeoutId = setTimeout(hideToast, 6000);
  }
  function hideToast() { dom.toast.hidden = true; }

  /* ------------------------------------------------------------------
   * 7. Search & view switching
   * ------------------------------------------------------------------ */

  function initSearch() {
    dom.searchInput.addEventListener("input", (e) => {
      searchQuery = e.target.value.trim().toLowerCase();
      render();
    });

    // Mobile Search Activation Core Wireframes
    if (dom.mobileSearchBtn) {
      dom.mobileSearchBtn.addEventListener("click", () => {
        dom.topbar.classList.add("search-is-active");
        setTimeout(() => dom.searchInput.focus(), 50);
      });
    }

    if (dom.searchBackBtn) {
      dom.searchBackBtn.addEventListener("click", () => {
        dom.topbar.classList.remove("search-is-active");
        dom.searchInput.value = "";
        searchQuery = "";
        render();
      });
    }
  }

  function initSidebar() {
    dom.sidebarItems.forEach((item) => {
      if (item.id === "editLabelsBtn") {
        item.addEventListener("click", () => {
          openLabelsModal(); dom.sidebar.classList.remove("is-open");
        });
        return;
      }
      item.addEventListener("click", () => {
        dom.sidebarItems.forEach((el) => el.classList.remove("is-active"));
        item.classList.add("is-active");
        currentView = item.dataset.view;
        render(); dom.sidebar.classList.remove("is-open");
      });
    });
  }

  /* ------------------------------------------------------------------
   * 8. Chrome elements
   * ------------------------------------------------------------------ */

  function initMenuToggle() {
    dom.menuToggle.addEventListener("click", () => {
      if (window.matchMedia("(max-width: 900px)").matches) {
        dom.sidebar.classList.toggle("is-open");
      } else {
        dom.sidebar.classList.toggle("is-expanded");
      }
    });
  }

  function initRefresh() {
    dom.refreshBtn.addEventListener("click", () => {
      loadNotes(); purgeOldTrash(); render(); showToast("Refreshed.", null);
    });
  }

  function initViewToggle() {
    dom.viewToggleBtn.addEventListener("click", () => {
      layoutMode = layoutMode === "grid" ? "list" : "grid";
      render();
    });
  }

  function togglePopover(popoverEl, triggerBtn) {
    const willOpen = popoverEl.hidden;
    document.querySelectorAll(".color-popover").forEach((p) => (p.hidden = true));
    popoverEl.hidden = !willOpen;
    triggerBtn.setAttribute("aria-expanded", String(willOpen));
  }

  function initPopoverDismiss() {
    document.addEventListener("click", (e) => {
      document.querySelectorAll(".color-popover").forEach((popover) => {
        if (popover.hidden) return;
        const trigger = popover.id === "composerColorPopover" ? dom.composerColorBtn : dom.modalColorBtn;
        if (!popover.contains(e.target) && e.target !== trigger) {
          popover.hidden = true;
        }
      });
    });
  }

  /* Label Handling Modals */
  function renderLabelsList() {
    dom.labelsList.innerHTML = "";
    if (labels.length === 0) {
      const li = document.createElement("li");
      li.className = "labels-modal__empty";
      li.textContent = "No labels yet.";
      dom.labelsList.appendChild(li);
      return;
    }
    labels.forEach((label, index) => {
      const li = document.createElement("li");
      li.className = "labels-modal__item";
      li.innerHTML = `<span>${label}</span>`;
      dom.labelsList.appendChild(li);
    });
  }

  function openLabelsModal() { renderLabelsList(); dom.labelsModalOverlay.hidden = false; }
  function closeLabelsModal() { dom.labelsModalOverlay.hidden = true; }

  function initLabelsModal() {
    dom.labelsForm.addEventListener("submit", (e) => {
      e.preventDefault();
      const name = dom.newLabelInput.value.trim();
      if (!name) return;
      labels.push(name); saveLabels();
      dom.newLabelInput.value = ""; renderLabelsList();
    });
    dom.labelsModalDoneBtn.addEventListener("click", closeLabelsModal);
  }

  /* ------------------------------------------------------------------
   * 9. Init Execution
   * ------------------------------------------------------------------ */

  function cacheDom() {
    dom.topbar = document.querySelector(".topbar");
    dom.mobileSearchBtn = document.getElementById("mobileSearchBtn");
    dom.searchBackBtn = document.getElementById("searchBackBtn");

    dom.notesGrid = document.getElementById("notesGrid");
    dom.emptyState = document.getElementById("emptyState");
    dom.emptyStateText = document.getElementById("emptyStateText");
    dom.noteTemplate = document.getElementById("noteCardTemplate");

    dom.composer = document.getElementById("composer");
    dom.composerForm = document.getElementById("composerForm");
    dom.composerFormEl = dom.composerForm;
    dom.composerPinBtn = document.getElementById("composerPinBtn");
    dom.composerReminderBtn = document.getElementById("composerReminderBtn");
    dom.composerTitle = document.getElementById("composerTitle");
    dom.composerBody = document.getElementById("composerBody");
    dom.composerColors = document.getElementById("composerColors");
    dom.composerColorBtn = document.getElementById("composerColorBtn");
    dom.composerColorBtnCollapsed = document.getElementById("composerColorBtnCollapsed");
    dom.composerColorPopover = document.getElementById("composerColorPopover");
    dom.composerCloseBtn = document.getElementById("composerCloseBtn");
    dom.composerArchiveBtn = document.getElementById("composerArchiveBtn");

    dom.modalOverlay = document.getElementById("modalOverlay");
    dom.modal = dom.modalOverlay.querySelector(".modal");
    dom.modalTitle = document.getElementById("modalTitle");
    dom.modalBody = document.getElementById("modalBody");
    dom.modalColors = document.getElementById("modalColors");
    dom.modalColorBtn = document.getElementById("modalColorBtn");
    dom.modalColorPopover = document.getElementById("modalColorPopover");
    dom.modalMeta = document.getElementById("modalMeta");
    dom.modalArchiveBtn = document.getElementById("modalArchiveBtn");
    dom.modalRestoreBtn = document.getElementById("modalRestoreBtn");
    dom.modalDeleteBtn = document.getElementById("modalDeleteBtn");
    dom.modalCloseBtn = document.getElementById("modalCloseBtn");

    dom.labelsModalOverlay = document.getElementById("labelsModalOverlay");
    dom.labelsForm = document.getElementById("labelsForm");
    dom.newLabelInput = document.getElementById("newLabelInput");
    dom.labelsList = document.getElementById("labelsList");
    dom.labelsModalDoneBtn = document.getElementById("labelsModalDoneBtn");

    dom.toast = document.getElementById("toast");
    dom.toastMessage = document.getElementById("toastMessage");
    dom.toastActionBtn = document.getElementById("toastActionBtn");

    dom.searchInput = document.getElementById("searchInput");
    dom.sidebar = document.getElementById("sidebar");
    dom.sidebarItems = document.querySelectorAll(".sidebar__item");
    dom.menuToggle = document.getElementById("menuToggle");
    dom.refreshBtn = document.getElementById("refreshBtn");
    dom.viewToggleBtn = document.getElementById("viewToggleBtn");
  }

  function init() {
    cacheDom();
    loadNotes();
    purgeOldTrash();
    loadLabels();
    initComposer();
    initModal();
    initLabelsModal();
    initSearch();
    initSidebar();
    initMenuToggle();
    initRefresh();
    initViewToggle();
    initPopoverDismiss();
    render();
  }

  document.addEventListener("DOMContentLoaded", init);
})();