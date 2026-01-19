/// <reference path="./pedro.d.ts" />

// Copyright 2026 Matthew Allen. Licensed under the Apache License, Version 2.0.

const NOTE_WIDTH = 160;

interface StickyNote {
  id: string;
  x: number;
  y: number;
  text: string;
  color: string;
  minimized: boolean;
}

const COLORS = ["#fef3c7", "#dcfce7", "#dbeafe", "#fce7f3", "#f3f4f6"]; // yellow, green, blue, pink, gray

let overlayContainer: HTMLElement | null = null;
let notesMap = new Map<string, HTMLElement>();
let currentNotes: StickyNote[] = [];
let fieldView = { xScale: (v: number) => v, yScale: (v: number) => v, width: 0, height: 0 };
let isDragging = false;

// Initialize
pedro.registries.hooks.register("fieldOverlayInit", (container: HTMLElement) => {
  overlayContainer = container;
  renderNotes();
});

// Context Menu
pedro.registries.contextMenuItems.register({
  id: "add-sticky-note",
  label: "Add Note",
  icon: `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" /></svg>`,
  onClick: ({ x, y }) => {
    addNote(x, y);
  },
});

// Store Subscriptions
pedro.stores.project.extraDataStore.subscribe((data) => {
  currentNotes = data.stickyNotes || [];
  renderNotes();
});

pedro.stores.app.fieldViewStore.subscribe((view) => {
  fieldView = view;
  if (!isDragging) updatePositions();
});

function addNote(x: number, y: number) {
  const note: StickyNote = {
    id: Math.random().toString(36).slice(2),
    x,
    y,
    text: "",
    color: COLORS[0],
    minimized: false,
  };

  pedro.stores.project.extraDataStore.update((data) => ({
    ...data,
    stickyNotes: [...(data.stickyNotes || []), note],
  }));
}

function updateNote(id: string, updates: Partial<StickyNote>) {
  pedro.stores.project.extraDataStore.update((data) => ({
    ...data,
    stickyNotes: (data.stickyNotes || []).map((n: StickyNote) =>
      n.id === id ? { ...n, ...updates } : n
    ),
  }));
}

function deleteNote(id: string) {
  pedro.stores.project.extraDataStore.update((data) => ({
    ...data,
    stickyNotes: (data.stickyNotes || []).filter((n: StickyNote) => n.id !== id),
  }));
}

function renderNotes() {
  if (!overlayContainer) return;

  // Remove deleted notes
  const currentIds = new Set(currentNotes.map((n) => n.id));
  for (const [id, el] of notesMap) {
    if (!currentIds.has(id)) {
      el.remove();
      notesMap.delete(id);
    }
  }

  // Add/Update notes
  currentNotes.forEach((note) => {
    let el = notesMap.get(note.id);
    if (!el) {
      el = createNoteElement(note);
      overlayContainer!.appendChild(el);
      notesMap.set(note.id, el);
    }

    updateNoteElement(el, note);
  });

  if (!isDragging) updatePositions();
}

function createNoteElement(note: StickyNote) {
  const div = document.createElement("div");
  div.className =
    "absolute shadow-lg rounded flex flex-col overflow-hidden pointer-events-auto transition-shadow hover:shadow-xl border border-black/10";
  div.style.width = `${NOTE_WIDTH}px`;

  // Header
  const header = document.createElement("div");
  header.className =
    "flex items-center justify-between px-2 py-1 cursor-move select-none bg-black/5 border-b border-black/10";

  const controls = document.createElement("div");
  controls.className = "flex items-center gap-1.5";

  // Color picker
  const colorBtn = document.createElement("div");
  colorBtn.className = "w-3 h-3 rounded-full cursor-pointer border border-black/20 hover:scale-110 transition-transform";
  colorBtn.title = "Change Color";
  colorBtn.onclick = (e) => {
    e.stopPropagation();
    const idx = COLORS.indexOf(note.color);
    const nextColor = COLORS[(idx + 1) % COLORS.length];
    updateNote(note.id, { color: nextColor });
  };

  const minBtn = document.createElement("button");
  minBtn.className =
    "text-xs font-bold w-4 h-4 flex items-center justify-center hover:bg-black/10 rounded text-black/60";
  minBtn.onclick = (e) => {
    e.stopPropagation();
    updateNote(note.id, { minimized: !note.minimized });
  };

  const closeBtn = document.createElement("button");
  closeBtn.textContent = "×";
  closeBtn.className =
    "text-xs font-bold w-4 h-4 flex items-center justify-center hover:bg-red-500 hover:text-white rounded text-black/60";
  closeBtn.onclick = (e) => {
    e.stopPropagation();
    if (confirm("Delete this note?")) {
      deleteNote(note.id);
    }
  };

  controls.appendChild(colorBtn);
  controls.appendChild(minBtn);
  controls.appendChild(closeBtn);

  const title = document.createElement("span");
  title.textContent = "Note";
  title.className = "text-xs font-semibold text-black/50 uppercase tracking-wider";

  header.appendChild(title);
  header.appendChild(controls);

  div.appendChild(header);

  // Content
  const textarea = document.createElement("textarea");
  textarea.className =
    "w-full p-2 resize-none bg-transparent border-none outline-none text-sm font-sans text-neutral-800 placeholder-neutral-400";
  textarea.style.minHeight = "80px";
  textarea.placeholder = "Type here...";
  textarea.value = note.text;

  textarea.onchange = (e) => {
    updateNote(note.id, { text: (e.target as HTMLTextAreaElement).value });
  };
  textarea.onmousedown = (e) => e.stopPropagation(); // Allow text selection without dragging note

  div.appendChild(textarea);

  // Drag Logic
  header.onmousedown = (e) => {
    e.preventDefault();
    isDragging = true;
    let startX = e.clientX;
    let startY = e.clientY;

    const onMove = (me: MouseEvent) => {
      const dx = me.clientX - startX;
      const dy = me.clientY - startY;

      const currentLeft = parseFloat(div.style.left);
      const currentTop = parseFloat(div.style.top);
      div.style.left = `${currentLeft + dx}px`;
      div.style.top = `${currentTop + dy}px`;

      startX = me.clientX;
      startY = me.clientY;
    };

    const onUp = (me: MouseEvent) => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      isDragging = false;

      const left = parseFloat(div.style.left);
      const top = parseFloat(div.style.top);

      let newX = 0,
        newY = 0;

      if ("invert" in fieldView.xScale) {
        newX = (fieldView.xScale as any).invert(left);
        newY = (fieldView.yScale as any).invert(top);
      } else {
        // Fallback
        const scale = (fieldView.xScale(1) - fieldView.xScale(0));
        newX = (left - fieldView.xScale(0)) / scale;
        newY = (top - fieldView.yScale(0)) / (fieldView.yScale(1) - fieldView.yScale(0));
      }

      updateNote(note.id, { x: newX, y: newY });
    };

    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  };

  return div;
}

function updateNoteElement(div: HTMLElement, note: StickyNote) {
  div.style.backgroundColor = note.color;

  const textarea = div.querySelector("textarea") as HTMLTextAreaElement;
  const minBtn = div.querySelectorAll("button")[0];
  const colorBtn = div.querySelector(".rounded-full") as HTMLElement;

  // Minimized state
  if (note.minimized) {
    textarea.style.display = "none";
    div.style.height = "auto";
    if (minBtn) minBtn.textContent = "+";
  } else {
    textarea.style.display = "block";
    div.style.height = "auto";
    if (minBtn) minBtn.textContent = "−";
  }

  // Update controls
  if (colorBtn) colorBtn.style.backgroundColor = note.color;

  // Update text only if not focused
  if (textarea && document.activeElement !== textarea) {
    textarea.value = note.text;
  }
}

function updatePositions() {
  currentNotes.forEach((note) => {
    const el = notesMap.get(note.id);
    if (el) {
      el.style.left = `${fieldView.xScale(note.x)}px`;
      el.style.top = `${fieldView.yScale(note.y)}px`;
    }
  });
}
