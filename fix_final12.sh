#!/bin/bash
sed -i 's/on:click|stopPropagation={() => {/onclick={(e) => { e.stopPropagation();/g' src/lib/components/WaypointTable.svelte
sed -i 's/on:click|stopPropagation={() =>/onclick={(e) => { e.stopPropagation();/g' src/lib/components/WaypointTable.svelte
sed -i 's/removeWait(line.id, marker.id)}/removeWait(line.id, marker.id); }}/g' src/lib/components/WaypointTable.svelte

# Playback controls playing bind check
sed -i 's/export let playing/let { playing = $bindable(false) }/' src/lib/components/PlaybackControls.svelte
sed -i 's/let playing =/let { playing = $bindable(false) } =/' src/lib/components/PlaybackControls.svelte
sed -i 's/let { playing = false/let { playing = $bindable(false)/' src/lib/components/PlaybackControls.svelte

# LeftSidebar ComponentType check
sed -i 's/Cannot find name '\''ComponentType'\''/Cannot find name '\''Component'\''/g' src/lib/components/LeftSidebar.svelte
sed -i 's/import type { ComponentType }/import type { Component }/g' src/lib/components/LeftSidebar.svelte
sed -i 's/: ComponentType/: Component/g' src/lib/components/LeftSidebar.svelte

# ColorPicker oninput
sed -i 's/oninput={function (e: Event) {/oninput={function (e: Event) {/g' src/lib/components/WaypointTable.svelte
