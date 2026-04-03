#!/bin/bash
sed -i 's/on:contextmenu={(e) => handleContextMenu(e, -1)}/oncontextmenu={(e) => handleContextMenu(e, -1)}/g' src/lib/components/WaypointTable.svelte

sed -i 's/oninput={function (e: Event) {/oninput={function (e: Event \& { currentTarget: EventTarget \& HTMLInputElement }) {/g' src/lib/components/WaypointTable.svelte
# Let's just fix the input type completely
sed -i 's/oninput={function (e: Event) {/oninput={function (e) {/g' src/lib/components/WaypointTable.svelte
