// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
/// <reference path="../turtle.d.ts" />
// Notes on the field, saved in the project with `project.setData`.

interface Note {
  id: string;
  x: number;
  y: number;
  text: string;
  color: string;
}

const noteIcon = `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="size-6"><path stroke-linecap="round" stroke-linejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" /></svg>`;

function notes(): Note[] {
  const data = turtle.project.get().data as { notes?: Note[] } | null;
  return data?.notes ?? [];
}

function save(next: Note[]) {
  return turtle.project.setData({ notes: next } as unknown as Turtle.JsonValue);
}

/**
 * Shows a note's form: its text, colour and place. Resolves to the edited
 * note, "delete" if the user ticked Delete, or null if they cancelled.
 */
async function editNote(
  note: Note,
  title: string,
  canDelete: boolean,
): Promise<Note | "delete" | null> {
  const fields: Turtle.FormField[] = [
    { key: "text", type: "text", label: "Note", multiline: true },
    { key: "color", type: "color", label: "Colour" },
    { key: "x", type: "number", unit: "distance", label: "X" },
    { key: "y", type: "number", unit: "distance", label: "Y" },
  ];
  if (canDelete) {
    fields.push({ key: "delete", type: "toggle", label: "Delete this note" });
  }
  const values = await turtle.ui.form({
    title,
    submitLabel: "Save",
    fields,
    values: { text: note.text, color: note.color, x: note.x, y: note.y },
  });
  if (!values) return null;
  if (values.delete === true) return "delete";
  return {
    ...note,
    text: String(values.text),
    color: String(values.color),
    x: Number(values.x),
    y: Number(values.y),
  };
}

async function addNote(at?: Turtle.FieldPoint) {
  const { field } = turtle.project.get();
  const note = await editNote(
    {
      id: `note-${Date.now().toString(36)}`,
      x: at?.x ?? field.width / 2,
      y: at?.y ?? field.height / 2,
      text: "",
      color: String(turtle.settings.get().color),
    },
    "New sticky note",
    false,
  );
  if (note && note !== "delete" && note.text.trim()) {
    await save([...notes(), note]);
  }
}

async function openNote(id: string) {
  const note = notes().find((n) => n.id === id);
  if (!note) return;
  const edited = await editNote(note, "Edit sticky note", true);
  if (edited === "delete") await save(notes().filter((n) => n.id !== id));
  else if (edited) await save(notes().map((n) => (n.id === id ? edited : n)));
}

/** A note drawn as a square of paper with its text. */
function drawNote(note: Note): Turtle.FieldPrimitive[] {
  const lines = note.text.split("\n").slice(0, 6);
  const width = Math.max(14, ...lines.map((line) => line.length * 1.6 + 4));
  const height = lines.length * 3.2 + 3;
  return [
    {
      type: "rect",
      id: note.id,
      x: note.x,
      y: note.y,
      width,
      height,
      fill: note.color,
      stroke: "#a16207",
      strokeWidth: 0.3,
      opacity: 0.95,
    },
    ...lines.map(
      (line, i): Turtle.FieldPrimitive => ({
        type: "text",
        x: note.x,
        y: note.y + height / 2 - 2.6 - i * 3.2,
        text: line,
        size: 2.6,
        color: "#422006",
      }),
    ),
  ];
}

turtle.field.addLayer({
  draw: () => notes().flatMap(drawNote),
  onClick: (id) => void openNote(id),
});

turtle.commands.register({
  id: "add-note",
  label: "Add sticky note",
  run: ({ at }) => addNote(at),
});
turtle.ui.addContextMenuItem({
  command: "add-note",
  label: "Add sticky note here",
  icon: noteIcon,
});
turtle.ui.addNavbarButton({
  command: "add-note",
  icon: noteIcon,
  title: "Add sticky note",
});
