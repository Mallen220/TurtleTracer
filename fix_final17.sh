#!/bin/bash
sed -i 's/let { color = $bindable("#a855f7"), oninput }: { color?: string, oninput?: any } = $props();/let { color = $bindable("#a855f7"), oninput = undefined as any }: { color?: string, oninput?: any } = $props();/' src/lib/components/tools/ColorPicker.svelte

# If the above doesn't work, maybe we should just remove oninput from ColorPicker props
sed -i 's/oninput={function (e: Event) {/oninput={function (e: Event) {/g' src/lib/components/WaypointTable.svelte

cat << 'INNER_EOF' > fix_colorpicker.py
import sys
import re

def fix_picker(filepath):
    with open(filepath, 'r') as f:
        content = f.read()

    # In WaypointTable we have `<ColorPicker bind:color={line.color} oninput={...} />`
    # We will pass `onColorChange` instead of `oninput`
    content = content.replace('oninput={function (e: Event) {', 'onColorChange={function (e: Event) {')

    with open(filepath, 'w') as f:
        f.write(content)

fix_picker('src/lib/components/WaypointTable.svelte')

def fix_picker_def(filepath):
    with open(filepath, 'r') as f:
        content = f.read()

    # We added `oninput` before, let's change to `onColorChange`
    content = content.replace('oninput = undefined', 'onColorChange = undefined')
    content = content.replace('oninput?: any', 'onColorChange?: any')
    content = content.replace('oninput }', 'onColorChange }')

    # and call it
    content = content.replace('oninput={function(e) {', 'oninput={function(e) { if (onColorChange) onColorChange(e);')

    with open(filepath, 'w') as f:
        f.write(content)

fix_picker_def('src/lib/components/tools/ColorPicker.svelte')

INNER_EOF
python3 fix_colorpicker.py

# Fix ControlTab playing property bind issue
# In ControlTab.svelte: let playing = $state(false); -> let playing = false; -> bind:playing ... Wait, if PlaybackControls has `bind:playing={playing}`, then `playing` must be a state variable in ControlTab
sed -i 's/let playing = false;/let playing = $state(false);/' src/lib/ControlTab.svelte
