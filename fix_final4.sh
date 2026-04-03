#!/bin/bash
sed -i 's/on:dragstart=/ondragstart=/g' src/lib/components/WaypointTable.svelte
sed -i 's/on:dragend=/ondragend=/g' src/lib/components/WaypointTable.svelte
sed -i 's/on:dragover=/ondragover=/g' src/lib/components/WaypointTable.svelte
sed -i 's/on:drop=/ondrop=/g' src/lib/components/WaypointTable.svelte

sed -i 's/Cannot find name '\''ComponentType'\''/Cannot find name '\''Component'\''/g' src/lib/components/settings/tabs/SidebarSettingsTab.svelte

sed -i 's/onkeydown={stopPropagation((e) => {/onkeydown={(e: KeyboardEvent) => { e.stopPropagation();/' src/lib/components/sections/WaitSection.svelte
sed -i 's/onkeydown={stopPropagation((e) => {/onkeydown={(e: KeyboardEvent) => { e.stopPropagation();/' src/lib/components/sections/RotateSection.svelte
sed -i 's/onkeydown={stopPropagation((e) => {/onkeydown={(e: KeyboardEvent) => { e.stopPropagation();/' src/lib/components/sections/MacroSection.svelte

sed -i 's/mainContentDiv.getBoundingClientRect()/mainContentDiv!.getBoundingClientRect()/' src/App.svelte

sed -i 's/onsvelte-copy={handleCopy}/on:svelte-copy={handleCopy}/' src/lib/components/dialogs/ExportCodeDialog.svelte
