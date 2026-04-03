#!/bin/bash
sed -i 's/deleteControlPoint(line, j)}/deleteControlPoint(line, j); }}/g' src/lib/components/WaypointTable.svelte
sed -i 's/Cannot find name '\''ComponentType'\''/Cannot find name '\''Component'\''/g' src/lib/components/LeftSidebar.svelte
sed -i 's/import type { ComponentType }/import type { Component }/g' src/lib/components/LeftSidebar.svelte
sed -i 's/: ComponentType/: Component/g' src/lib/components/LeftSidebar.svelte

# Let's fix playing prop in PlaybackControls properly
sed -i 's/export let playing = false;/let { playing = $bindable(false) } = $props();/' src/lib/components/PlaybackControls.svelte
