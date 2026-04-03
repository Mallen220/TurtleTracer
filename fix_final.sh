#!/bin/bash
sed -i 's/onkeydown={(e: KeyboardEvent) => { e.stopPropagation();/onkeydown={(e: KeyboardEvent) => { e.stopPropagation();/g' src/lib/components/filemanager/FileList.svelte
# Fix the broken close bracket from previous svelte 4 to 5 conversion of FileList and FileGrid
sed -i 's/if (e.key === "Escape") dispatch("rename-cancel");/if (e.key === "Escape") dispatch("rename-cancel"); }}/g' src/lib/components/filemanager/FileList.svelte
sed -i 's/if (e.key === "Escape") dispatch("rename-cancel");/if (e.key === "Escape") dispatch("rename-cancel"); }}/g' src/lib/components/filemanager/FileGrid.svelte
sed -i 's/                  })}/                  /g' src/lib/components/filemanager/FileList.svelte
sed -i 's/                  })}/                  /g' src/lib/components/filemanager/FileGrid.svelte

sed -i 's/on:click={(e) => handleRowClick(e, "point-0-0", null)}/onclick={(e) => handleRowClick(e, "point-0-0", null)}/g' src/lib/components/WaypointTable.svelte
