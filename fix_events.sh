#!/bin/bash
sed -i 's/onkeydown={stopPropagation((e) => {/onkeydown={(e: KeyboardEvent) => { e.stopPropagation();/' src/lib/components/filemanager/FileList.svelte
sed -i 's/onclick={stopPropagation((e) => handleContextMenu(e, file))}/onclick={(e: MouseEvent) => { e.stopPropagation(); handleContextMenu(e, file); }}/' src/lib/components/filemanager/FileList.svelte

sed -i 's/onkeydown={stopPropagation((e) => {/onkeydown={(e: KeyboardEvent) => { e.stopPropagation();/' src/lib/components/filemanager/FileGrid.svelte

sed -i 's/on:input={function (e) {/oninput={function (e: Event) {/' src/lib/components/WaypointTable.svelte
sed -i 's/const target = e.currentTarget || e.target;/const target = (e.currentTarget || e.target) as HTMLInputElement;/' src/lib/components/WaypointTable.svelte
