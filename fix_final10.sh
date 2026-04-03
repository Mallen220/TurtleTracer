#!/bin/bash
sed -i 's/on:click=/onclick=/g' src/lib/components/WaypointTable.svelte
# For oninput it's complaining about type 'Props'. Svelte 5 expects native DOM events to just work, but maybe on:input is needed for Svelte components? Wait, input is an HTML element here.
# Let's check what WaypointTable line 1390 actually is: `<input type="color" bind:color={line.color} oninput={...}` wait bind:color isn't valid for input, it's bind:value
sed -i 's/bind:color={line.color}/bind:value={line.color}/g' src/lib/components/WaypointTable.svelte

sed -i 's/Cannot find name '\''ComponentType'\''/Cannot find name '\''Component'\''/g' src/lib/components/LeftSidebar.svelte
sed -i 's/import type { ComponentType }/import type { Component }/g' src/lib/components/LeftSidebar.svelte
sed -i 's/: ComponentType/: Component/g' src/lib/components/LeftSidebar.svelte

# ControlTab playing
sed -i 's/let { playing = false }/let { playing = $bindable(false) }/' src/lib/ControlTab.svelte
sed -i 's/let { playing }/let { playing = $bindable(false) }/' src/lib/ControlTab.svelte

cat << 'INNER_EOF' > fix_sections4.py
import sys
import re

def fix_wizard(filepath):
    with open(filepath, 'r') as f:
        content = f.read()

    # Original: onpointerdown={stopPropagation((e) => handlePointerDown(e, "n"))}
    # It seems the regex from earlier failed because of newlines not being matched properly or it wasn't exactly that format.
    # Let's look at what the code actually is:
    #                     onpointerdown={stopPropagation((e) =>
    #                       handlePointerDown(e, "n"),
    #                     )}
    content = re.sub(r'onpointerdown={stopPropagation\(\(e\) =>\s*handlePointerDown\(e,\s*"([^"]+)"\),?\s*\)}', r'onpointerdown={(e: PointerEvent) => { e.stopPropagation(); handlePointerDown(e, "\1"); }}', content, flags=re.MULTILINE)

    # Let's also fix the Wait/Rotate/Macro section if they have errors still
    # The previous attempt worked because those files didn't have errors this time.

    with open(filepath, 'w') as f:
        f.write(content)

fix_wizard('src/lib/components/settings/CustomFieldWizard.svelte')

INNER_EOF
python3 fix_sections4.py
