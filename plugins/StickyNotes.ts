/// <reference path="./pedro.d.ts" />

// -------------------------------------------------------------------
// Sticky Notes Plugin for Pedro Pathing Visualizer
// -------------------------------------------------------------------

interface StickyNote {
  id: string;
  x: number;
  y: number;
  text: string;
  color: string;
  collapsed: boolean;
  width?: number;
  height?: number;
}

(function () {
  const PLUGIN_ID = "sticky-notes-plugin";
  const CONTAINER_ID = "sticky-notes-root";

  // State
  let noteElements = new Map<string, HTMLElement>();
  let isDragging = false;
  let draggedNoteId: string | null = null;
  let dragOffset = { x: 0, y: 0 };
  let isEditingId: string | null = null;

  // Store references
  let unsubscribeData: (() => void) | null = null;
  let unsubscribeView: (() => void) | null = null;

  // Initialization
  function init() {
    // 1. Mount Container
    mountContainer();

    // 2. Register Hook for subsequent mounts
    pedro.registries.hooks.register("fieldOverlayInit", (container: HTMLElement) => {
      mountContainer(container);
    });

    // 3. Register Context Menu
    pedro.registries.contextMenuItems.register({
      id: "add-sticky-note",
      label: "Add Sticky Note",
      icon: `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" /></svg>`,
      onClick: ({ x, y }) => {
        addNote(x, y);
      },
    });

    // 4. Subscribe to stores
    const { extraDataStore } = pedro.stores.project;
    const { fieldViewStore } = pedro.stores.app;

    unsubscribeData = extraDataStore.subscribe((data) => {
      render(data.stickyNotes || [], pedro.stores.get(fieldViewStore));
    });

    unsubscribeView = fieldViewStore.subscribe((view) => {
      render(
        pedro.stores.get(extraDataStore).stickyNotes || [],
        view
      );
    });
  }

  function mountContainer(parent?: HTMLElement) {
    // Cleanup existing
    const existing = document.getElementById(CONTAINER_ID);
    if (existing) existing.remove();

    // Find parent if not provided
    const target = parent || document.getElementById("field-overlay-layer");
    if (!target) return; // Field might not be mounted yet

    const container = document.createElement("div");
    container.id = CONTAINER_ID;
    container.style.position = "absolute";
    container.style.inset = "0";
    container.style.pointerEvents = "none"; // Let clicks pass through empty space
    container.style.zIndex = "40"; // Above everything else
    target.appendChild(container);

    // Force re-render
    const { extraDataStore } = pedro.stores.project;
    const { fieldViewStore } = pedro.stores.app;
    render(
      pedro.stores.get(extraDataStore).stickyNotes || [],
      pedro.stores.get(fieldViewStore)
    );
  }

  function addNote(x: number, y: number) {
    const { extraDataStore } = pedro.stores.project;
    pedro.stores.project.extraDataStore.update((data) => {
      const notes = data.stickyNotes || [];
      const newNote: StickyNote = {
        id: crypto.randomUUID(),
        x,
        y,
        text: "",
        color: "#fef3c7", // Default yellow-ish
        collapsed: false,
      };
      return { ...data, stickyNotes: [...notes, newNote] };
    });
  }

  function updateNote(id: string, updates: Partial<StickyNote>) {
    pedro.stores.project.extraDataStore.update((data) => {
      const notes: StickyNote[] = data.stickyNotes || [];
      return {
        ...data,
        stickyNotes: notes.map((n) => (n.id === id ? { ...n, ...updates } : n)),
      };
    });
  }

  function deleteNote(id: string) {
    pedro.stores.project.extraDataStore.update((data) => {
      const notes: StickyNote[] = data.stickyNotes || [];
      return {
        ...data,
        stickyNotes: notes.filter((n) => n.id !== id),
      };
    });
  }

  function render(notes: StickyNote[], fieldView: any) {
    const container = document.getElementById(CONTAINER_ID);
    if (!container) return;

    const currentIds = new Set(notes.map((n) => n.id));

    // Remove deleted notes
    for (const [id, el] of noteElements) {
      if (!currentIds.has(id)) {
        el.remove();
        noteElements.delete(id);
      }
    }

    // Create or update notes
    notes.forEach((note) => {
      let el = noteElements.get(note.id);
      if (!el) {
        el = createNoteElement(note);
        container.appendChild(el);
        noteElements.set(note.id, el);
      }

      // Update position (skip if dragging)
      if (draggedNoteId !== note.id) {
        const px = fieldView.xScale(note.x);
        const py = fieldView.yScale(note.y);
        el.style.left = `${px}px`;
        el.style.top = `${py}px`;
      }

      // Update state
      updateNoteElementState(el, note);
    });
  }

  function createNoteElement(note: StickyNote) {
    const el = document.createElement("div");
    el.className = "sticky-note shadow-lg rounded-md border border-gray-200 dark:border-gray-700 flex flex-col";
    el.style.position = "absolute";
    el.style.width = "200px";
    el.style.pointerEvents = "auto";
    el.style.transition = "box-shadow 0.2s, transform 0.1s";

    // Header
    const header = document.createElement("div");
    header.className = "sticky-header p-2 cursor-grab flex items-center justify-between rounded-t-md border-b border-black/10 select-none";
    header.style.backgroundColor = darkenColor(note.color, 10);

    const dragHandle = document.createElement("div");
    dragHandle.className = "flex-1 font-bold text-xs text-gray-800 truncate mr-2";
    dragHandle.innerText = "Note";

    const controls = document.createElement("div");
    controls.className = "flex items-center gap-1";

    // Color Picker
    const colorBtn = document.createElement("div");
    colorBtn.className = "w-3 h-3 rounded-full cursor-pointer border border-black/20 hover:scale-110 transition-transform";
    colorBtn.style.backgroundColor = note.color;
    colorBtn.title = "Change Color";
    colorBtn.onclick = (e) => {
        e.stopPropagation();
        cycleColor(note.id, note.color);
    }

    // Collapse
    const collapseBtn = document.createElement("div");
    collapseBtn.className = "cursor-pointer text-gray-700 hover:text-black transition-colors";
    collapseBtn.innerHTML = note.collapsed
        ? `<svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"></path></svg>`
        : `<svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 15l7-7 7 7"></path></svg>`;
    collapseBtn.onclick = (e) => {
        e.stopPropagation();
        updateNote(note.id, { collapsed: !note.collapsed });
    }

    // Delete
    const deleteBtn = document.createElement("div");
    deleteBtn.className = "cursor-pointer text-red-600 hover:text-red-800 transition-colors ml-1";
    deleteBtn.innerHTML = `<svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg>`;
    deleteBtn.onclick = (e) => {
        e.stopPropagation();
        if (confirm("Delete this note?")) {
            deleteNote(note.id);
        }
    }

    controls.appendChild(colorBtn);
    controls.appendChild(collapseBtn);
    controls.appendChild(deleteBtn);

    header.appendChild(dragHandle);
    header.appendChild(controls);

    // Body
    const body = document.createElement("div");
    body.className = "sticky-body p-2 flex-1 rounded-b-md";
    body.style.backgroundColor = note.color;

    const textarea = document.createElement("textarea");
    textarea.className = "w-full h-full bg-transparent resize-none outline-none text-sm text-gray-800 placeholder-gray-500/50";
    textarea.style.minHeight = "80px";
    textarea.placeholder = "Write something...";
    textarea.value = note.text;

    textarea.addEventListener("input", (e) => {
        // Debounce could be good here, but for now simple update
    });
    textarea.addEventListener("change", (e) => {
        updateNote(note.id, { text: (e.target as HTMLTextAreaElement).value });
    });
    textarea.addEventListener("focus", () => { isEditingId = note.id; });
    textarea.addEventListener("blur", () => { isEditingId = null; updateNote(note.id, { text: textarea.value }); });

    body.appendChild(textarea);

    el.appendChild(header);
    el.appendChild(body);

    // Drag Logic
    header.addEventListener("mousedown", (e) => {
        if (e.target !== header && e.target !== dragHandle) return; // Only drag from header bg or title
        e.preventDefault();
        startDrag(e, note.id, el);
    });

    return el;
  }

  function updateNoteElementState(el: HTMLElement, note: StickyNote) {
    const header = el.querySelector(".sticky-header") as HTMLElement;
    const body = el.querySelector(".sticky-body") as HTMLElement;
    const textarea = el.querySelector("textarea") as HTMLTextAreaElement;
    const colorBtn = el.querySelector(".sticky-header .w-3") as HTMLElement;
    const collapseBtn = el.querySelector(".sticky-header div:nth-child(2)") as HTMLElement;

    // Colors
    header.style.backgroundColor = darkenColor(note.color, 10);
    body.style.backgroundColor = note.color;
    colorBtn.style.backgroundColor = note.color;

    // Collapse
    if (note.collapsed) {
        body.style.display = "none";
        collapseBtn.innerHTML = `<svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"></path></svg>`;
    } else {
        body.style.display = "block";
        collapseBtn.innerHTML = `<svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 15l7-7 7 7"></path></svg>`;
    }

    // Text (only if not editing)
    if (isEditingId !== note.id && textarea.value !== note.text) {
        textarea.value = note.text;
    }
  }

  function startDrag(e: MouseEvent, id: string, el: HTMLElement) {
    isDragging = true;
    draggedNoteId = id;

    // Calculate offset from mouse to element top-left
    const rect = el.getBoundingClientRect();
    const parentRect = el.parentElement!.getBoundingClientRect();

    // We work in pixels relative to parent
    const startLeft = rect.left - parentRect.left;
    const startTop = rect.top - parentRect.top;

    const mouseStartX = e.clientX;
    const mouseStartY = e.clientY;

    el.style.zIndex = "50"; // Bring to front
    el.style.cursor = "grabbing";

    const moveHandler = (ev: MouseEvent) => {
        const dx = ev.clientX - mouseStartX;
        const dy = ev.clientY - mouseStartY;

        el.style.left = `${startLeft + dx}px`;
        el.style.top = `${startTop + dy}px`;
    };

    const upHandler = (ev: MouseEvent) => {
        document.removeEventListener("mousemove", moveHandler);
        document.removeEventListener("mouseup", upHandler);

        isDragging = false;
        draggedNoteId = null;
        el.style.zIndex = "auto";
        el.style.cursor = "grab";

        // Calculate final field coordinates
        const { fieldViewStore } = pedro.stores.app;
        const fieldView = pedro.stores.get(fieldViewStore);

        // Get final pixels
        const finalRect = el.getBoundingClientRect();
        // Since getBoundingClientRect is viewport relative, and our scales are likely somewhat complex
        // We should use the scale.invert function.
        // Note: scale.invert expects pixels relative to the field drawing area (or whatever the scale range is).
        // The container is #field-overlay-layer which is overlaying the Two.js canvas.
        // So the click coordinates or element coordinates relative to the container *should* map
        // if we consider the scale implementation.

        // FieldView x/y scales map Field Inches (domain) to Pixels (range).
        // The range seems to be centered around center of viewport plus pan.
        // x(v) = width/2 + (v...)*scale + pan
        // So we need the coordinate relative to the container (which matches the canvas).

        // Get element center or top-left? Sticky notes x/y usually top-left.
        // But field coordinates are what we store.
        // Let's use the element's current left/top style values if they are correct?
        // Wait, style.left is relative to parent. Parent is overlay. Overlay is same size as canvas.
        // So style.left is the pixel coordinate in the "range" of d3 scale.

        // Parse px values from style
        const finalPxX = parseFloat(el.style.left);
        const finalPxY = parseFloat(el.style.top);

        const inchX = fieldView.xScale.invert(finalPxX);
        const inchY = fieldView.yScale.invert(finalPxY);

        updateNote(id, { x: inchX, y: inchY });
    };

    document.addEventListener("mousemove", moveHandler);
    document.addEventListener("mouseup", upHandler);
  }

  // Helpers
  function cycleColor(id: string, currentColor: string) {
    const colors = [
        "#fef3c7", // Yellow (Amber 100)
        "#dbeafe", // Blue (Blue 100)
        "#dcfce7", // Green (Green 100)
        "#fce7f3", // Pink (Pink 100)
        "#f3e8ff", // Purple (Purple 100)
    ];
    let idx = colors.indexOf(currentColor);
    if (idx === -1) idx = 0;
    const nextColor = colors[(idx + 1) % colors.length];
    updateNote(id, { color: nextColor });
  }

  function darkenColor(hex: string, percent: number) {
      // Simple hex darken
      let num = parseInt(hex.replace("#",""),16),
      amt = Math.round(2.55 * percent),
      R = (num >> 16) - amt,
      B = (num >> 8 & 0x00FF) - amt,
      G = (num & 0x0000FF) - amt;
      return "#" + (0x1000000 + (R<255?R<1?0:R:255)*0x10000 + (B<255?B<1?0:B:255)*0x100 + (G<255?G<1?0:G:255)).toString(16).slice(1);
  }

  // Start
  init();

})();
