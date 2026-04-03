#!/bin/bash
sed -i 's/on:click=/onclick=/g' src/lib/components/WaypointTable.svelte
# Ah, it's a ColorPicker component, not an input element. It probably expected `bind:color`
sed -i 's/bind:value={line.color}/bind:color={line.color}/g' src/lib/components/WaypointTable.svelte
# ColorPicker component needs to be updated to use $bindable
sed -i 's/let { color } = $props()/let { color = $bindable() } = $props()/' src/lib/components/common/ColorPicker.svelte
sed -i 's/export let color/let { color = $bindable() }/' src/lib/components/common/ColorPicker.svelte

sed -i 's/Cannot find name '\''ComponentType'\''/Cannot find name '\''Component'\''/g' src/lib/components/LeftSidebar.svelte
sed -i 's/import type { ComponentType }/import type { Component }/g' src/lib/components/LeftSidebar.svelte
sed -i 's/: ComponentType/: Component/g' src/lib/components/LeftSidebar.svelte

# Let's fix playing prop in PlaybackControls instead of ControlTab
sed -i 's/let { playing = false/let { playing = $bindable(false)/' src/lib/components/PlaybackControls.svelte
