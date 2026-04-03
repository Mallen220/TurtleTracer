#!/bin/bash
# ColorPicker typing fix
sed -i 's/let { color = $bindable("#a855f7") } = $props();/let { color = $bindable("#a855f7"), oninput }: { color?: string, oninput?: any } = $props();/' src/lib/components/tools/ColorPicker.svelte

# ControlTab playing prop
sed -i 's/let { playing = $bindable(false) } = $props();/let { playing = $bindable(false) }: { playing?: boolean } = $props();/' src/lib/components/PlaybackControls.svelte

# LeftSidebar ComponentType fix
sed -i 's/const ICON_COMPONENT_MAP: Record<string, ComponentType> = {/const ICON_COMPONENT_MAP: Record<string, any> = {/' src/lib/components/LeftSidebar.svelte
