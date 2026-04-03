#!/bin/bash
sed -i 's/two.makePath/two!.makePath/g' src/lib/components/FieldRenderer.svelte
sed -i 's/two.add/two!.add/g' src/lib/components/FieldRenderer.svelte
sed -i 's/two.update/two!.update/g' src/lib/components/FieldRenderer.svelte
sed -i 's/two.renderer/two!.renderer/g' src/lib/components/FieldRenderer.svelte
sed -i 's/canvas.getContext/canvas!.getContext/g' src/lib/components/telemetry/LiveFieldLayer.svelte
sed -i 's/on:click={copyTableToClipboard}/onclick={copyTableToClipboard}/' src/lib/components/WaypointTable.svelte
sed -i 's/oninput={function (e: Event) {/oninput={function (e: Event) {/' src/lib/components/WaypointTable.svelte
sed -i 's/Cannot find name '\''ComponentType'\''/Cannot find name '\''Component'\''/g' src/lib/components/LeftSidebar.svelte # already replaced manually
sed -i 's/import type { ComponentType }/import type { Component }/g' src/lib/components/LeftSidebar.svelte
sed -i 's/: ComponentType/: Component/g' src/lib/components/LeftSidebar.svelte
