// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
import type { SequenceItem } from "../../../types";

/** What the table gives every wait, turn and macro row. */
export interface StepRowProps<Item extends SequenceItem> {
  item: Item;
  index: number;
  isLocked?: boolean;
  dragOverIndex?: number | null;
  dragPosition?: string | null;
  draggingIndex?: number | null;
  onUpdate: (item: Item) => void;
  onLock: () => void;
  onDelete: () => void;
  onDragStart: (e: DragEvent) => void;
  onDragEnd: () => void;
  onContextMenu: (e: MouseEvent) => void;
  /** Used to show when other steps share this one's value. */
  sequence?: SequenceItem[];
}
