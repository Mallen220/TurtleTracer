#!/bin/bash

# Fix leftover svelte 4 to 5 component events and bindables
sed -i 's/onkeydown={stopPropagation((e) => {/onkeydown={(e) => { e.stopPropagation();/' src/lib/components/sections/WaitSection.svelte
sed -i 's/onkeydown={stopPropagation((e) => {/onkeydown={(e) => { e.stopPropagation();/' src/lib/components/sections/RotateSection.svelte
sed -i 's/onkeydown={stopPropagation((e) => {/onkeydown={(e) => { e.stopPropagation();/' src/lib/components/sections/MacroSection.svelte

sed -i 's/let { isOpen = false }/let { isOpen = $bindable(false) }/' src/lib/components/dialogs/PathStatisticsDialog.svelte
sed -i 's/let { startPoint, lines, sequence, shapes }/let { startPoint = $bindable(), lines = $bindable(), sequence = $bindable(), shapes = $bindable() }/' src/App.svelte
sed -i 's/let { controlTabRef }/let { controlTabRef = $bindable() }/' src/App.svelte
