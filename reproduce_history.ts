
import { createHistory, type AppState } from "./src/utils/history";

const mockState: AppState = {
    startPoint: { x: 0, y: 0, heading: "tangential" },
    lines: [],
    shapes: [],
    sequence: [],
    settings: {} as any
};

const history = createHistory();

// 1. Record Initial
history.record({ ...mockState, startPoint: { ...mockState.startPoint, x: 1 } }, "State 1");
console.log("Recorded State 1");

// 2. Record Second
history.record({ ...mockState, startPoint: { ...mockState.startPoint, x: 2 } }, "State 2");
console.log("Recorded State 2");

// 3. Record Third
history.record({ ...mockState, startPoint: { ...mockState.startPoint, x: 3 } }, "State 3");
console.log("Recorded State 3");

// Check store
history.historyStore.subscribe(items => {
    console.log("--- Current History Store ---");
    items.forEach((item, i) => {
        console.log(`[${i}] ${item.item.description} (Future: ${item.future})`);
    });
});

// Undo once (Back to 2)
console.log("\nUndo 1 (Back to State 2)...");
history.undo();

// Undo again (Back to 1)
console.log("\nUndo 2 (Back to State 1)...");
history.undo();

// Redo once (Forward to 2)
console.log("\nRedo 1 (Forward to State 2)...");
history.redo();
