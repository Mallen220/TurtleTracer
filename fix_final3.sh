#!/bin/bash
sed -i 's/inputElement.blur()/inputElement?.blur()/g' src/lib/components/common/SearchableDropdown.svelte
sed -i 's/on:change={(e) =>/onchange={(e) =>/g' src/lib/components/WaypointTable.svelte
# For some reason my previous run failed for the below files?
sed -i 's/Cannot find name '\''ComponentType'\''/Cannot find name '\''Component'\''/g' src/lib/components/LeftSidebar.svelte
sed -i 's/import type { ComponentType }/import type { Component }/g' src/lib/components/LeftSidebar.svelte
sed -i 's/: ComponentType/: Component/g' src/lib/components/LeftSidebar.svelte

sed -i 's/let { playing /let { playing = $bindable() /' src/lib/ControlTab.svelte

sed -i 's/onpointerdown={stopPropagation((e) =>/onpointerdown={(e: PointerEvent) => { e.stopPropagation();/g' src/lib/components/settings/CustomFieldWizard.svelte
sed -i 's/handlePointerDown(e, "n"),/handlePointerDown(e, "n"); }/g' src/lib/components/settings/CustomFieldWizard.svelte
sed -i 's/handlePointerDown(e, "s"),/handlePointerDown(e, "s"); }/g' src/lib/components/settings/CustomFieldWizard.svelte
sed -i 's/handlePointerDown(e, "e"),/handlePointerDown(e, "e"); }/g' src/lib/components/settings/CustomFieldWizard.svelte
sed -i 's/handlePointerDown(e, "w"),/handlePointerDown(e, "w"); }/g' src/lib/components/settings/CustomFieldWizard.svelte
sed -i 's/handlePointerDown(e, "nw"),/handlePointerDown(e, "nw"); }/g' src/lib/components/settings/CustomFieldWizard.svelte
sed -i 's/handlePointerDown(e, "ne"),/handlePointerDown(e, "ne"); }/g' src/lib/components/settings/CustomFieldWizard.svelte
sed -i 's/handlePointerDown(e, "sw"),/handlePointerDown(e, "sw"); }/g' src/lib/components/settings/CustomFieldWizard.svelte
sed -i 's/handlePointerDown(e, "se"),/handlePointerDown(e, "se"); }/g' src/lib/components/settings/CustomFieldWizard.svelte
