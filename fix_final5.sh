#!/bin/bash
sed -i 's/on:contextmenu=/oncontextmenu=/g' src/lib/components/WaypointTable.svelte
# Input bind fix for waypoint table
sed -i 's/oninput={function (e) {/oninput={function (e: Event) {/g' src/lib/components/WaypointTable.svelte

sed -i 's/Cannot find name '\''ComponentType'\''/Cannot find name '\''Component'\''/g' src/lib/components/LeftSidebar.svelte
sed -i 's/import type { ComponentType }/import type { Component }/g' src/lib/components/LeftSidebar.svelte
sed -i 's/: ComponentType/: Component/g' src/lib/components/LeftSidebar.svelte

sed -i 's/let { controlTabRef = null }/let { controlTabRef = $bindable(null) }/' src/App.svelte
sed -i 's/let { isOpen } = $props()/let { isOpen = $bindable(false) } = $props()/' src/lib/components/dialogs/PathStatisticsDialog.svelte

# Fix the broken close brackets in sections again
sed -i 's/if (e.key === "Enter" || e.key === " ") {/if (e.key === "Enter" || e.key === " ") {/g' src/lib/components/sections/WaitSection.svelte
sed -i 's/  })}/  }/g' src/lib/components/sections/WaitSection.svelte
sed -i 's/  })}/  }/g' src/lib/components/sections/RotateSection.svelte
sed -i 's/  })}/  }/g' src/lib/components/sections/MacroSection.svelte

# Fix CustomFieldWizard broken close bracket
sed -i 's/handlePointerDown(e, "move")} /handlePointerDown(e, "move"); }/g' src/lib/components/settings/CustomFieldWizard.svelte
sed -i 's/onpointerdown={(e: PointerEvent) => { e.stopPropagation();/onpointerdown={(e: PointerEvent) => { e.stopPropagation(); /g' src/lib/components/settings/CustomFieldWizard.svelte

# ExportCodeDialog fix
sed -i 's/on:svelte-copy/onsvelte-copy/g' src/lib/components/dialogs/ExportCodeDialog.svelte
