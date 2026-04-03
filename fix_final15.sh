#!/bin/bash
sed -i 's/Cannot find name '\''ComponentType'\''/Cannot find name '\''Component'\''/g' src/lib/components/LeftSidebar.svelte
sed -i 's/import type { ComponentType }/import type { Component }/g' src/lib/components/LeftSidebar.svelte
sed -i 's/: ComponentType/: Component/g' src/lib/components/LeftSidebar.svelte

sed -i 's/oninput={function (e: Event) {/oninput={function (e) {/g' src/lib/components/WaypointTable.svelte
# Actually the issue is that it's `ColorPicker` and we passed `oninput`, but Svelte 5 expects native events without any declaration or custom events via properties. If ColorPicker is a Svelte component, `oninput` is passed as a prop, and if `ColorPicker` doesn't export `oninput`, it complains.
# Let's fix ColorPicker to accept `oninput` or we use `onchange` or whatever. Wait, we passed `oninput` to `ColorPicker`.
# If ColorPicker just emits `oninput`, we just accept it using a prop
sed -i 's/let { color = $bindable("#a855f7") } = $props();/let { color = $bindable("#a855f7"), oninput } = $props();/' src/lib/components/tools/ColorPicker.svelte
