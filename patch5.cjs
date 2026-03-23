const fs = require('fs');

let file = 'src/lib/components/WaypointTable.svelte';
let code = fs.readFileSync(file, 'utf-8');

const target = `  function handleRowClick(e: MouseEvent, pointId: string, lineId: string | null) {
    if (lineId) selectedLineId.set(lineId);
    else selectedLineId.set(null);

    selectedPointId.set(pointId);

    if (e.shiftKey || e.ctrlKey || e.metaKey) {
      multiSelectedPointIds.update(ids => {
        if (ids.includes(pointId)) {
          return ids.filter(id => id !== pointId);
        } else {
          return [...ids, pointId];
        }
      });
    } else {
      multiSelectedPointIds.set([pointId]);
    }
  }`;

const replacement = `  function handleRowClick(e: MouseEvent, pointId: string, lineId: string | null) {
    if (lineId) selectedLineId.set(lineId);
    else selectedLineId.set(null);

    selectedPointId.set(pointId);

    if (e.shiftKey || e.ctrlKey || e.metaKey) {
      multiSelectedPointIds.update(ids => {
        if (ids.includes(pointId)) {
          return ids.filter(id => id !== pointId);
        } else {
          return [...ids, pointId];
        }
      });
      if (lineId) {
        multiSelectedLineIds.update(ids => {
          if (!ids.includes(lineId)) return [...ids, lineId];
          return ids;
        });
      }
    } else {
      multiSelectedPointIds.set([pointId]);
      if (lineId) multiSelectedLineIds.set([lineId]);
      else multiSelectedLineIds.set([]);
    }
  }`;

code = code.replace(target, replacement);
fs.writeFileSync(file, code);
