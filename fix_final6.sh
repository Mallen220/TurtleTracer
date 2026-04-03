#!/bin/bash
sed -i 's/on:click=/onclick=/g' src/lib/components/WaypointTable.svelte
# Svelte 5 removes the object property from DOM attributes. The copy package isn't updated. Need to suppress error using any cast or similar for svelte-copy
sed -i 's/onsvelte-copy={handleCopy}/onsvelte-copy={handleCopy} as any/g' src/lib/components/dialogs/ExportCodeDialog.svelte
sed -i 's/as any/ /g' src/lib/components/dialogs/ExportCodeDialog.svelte

# Let's fix the sections syntax manually
cat << 'INNER_EOF' > fix_sections.py
import sys

def fix_file(filepath):
    with open(filepath, 'r') as f:
        content = f.read()

    # We messed up the parenthesis when converting `onkeydown={stopPropagation((e) => {`
    # Replace the broken syntax
    content = content.replace('onkeydown={(e: KeyboardEvent) => { e.stopPropagation();\n    if (e.key === "Enter" || e.key === " ") {\n      e.preventDefault();\n      itemRef?.focus();\n    }\n  }', 'onkeydown={(e: KeyboardEvent) => { e.stopPropagation();\n    if (e.key === "Enter" || e.key === " ") {\n      e.preventDefault();\n      itemRef?.focus();\n    }\n  }}')

    with open(filepath, 'w') as f:
        f.write(content)

fix_file('src/lib/components/sections/WaitSection.svelte')
fix_file('src/lib/components/sections/RotateSection.svelte')
fix_file('src/lib/components/sections/MacroSection.svelte')

def fix_wizard(filepath):
    with open(filepath, 'r') as f:
        content = f.read()
    content = content.replace('onpointerdown={(e: PointerEvent) => { e.stopPropagation(); \n                        handlePointerDown(e, "n"); }', 'onpointerdown={(e: PointerEvent) => { e.stopPropagation();\n                        handlePointerDown(e, "n"); }}')
    content = content.replace('onpointerdown={(e: PointerEvent) => { e.stopPropagation(); \n                        handlePointerDown(e, "s"); }', 'onpointerdown={(e: PointerEvent) => { e.stopPropagation();\n                        handlePointerDown(e, "s"); }}')
    content = content.replace('onpointerdown={(e: PointerEvent) => { e.stopPropagation(); \n                        handlePointerDown(e, "w"); }', 'onpointerdown={(e: PointerEvent) => { e.stopPropagation();\n                        handlePointerDown(e, "w"); }}')
    content = content.replace('onpointerdown={(e: PointerEvent) => { e.stopPropagation(); \n                        handlePointerDown(e, "e"); }', 'onpointerdown={(e: PointerEvent) => { e.stopPropagation();\n                        handlePointerDown(e, "e"); }}')
    content = content.replace('onpointerdown={(e: PointerEvent) => { e.stopPropagation(); \n                        handlePointerDown(e, "nw"); }', 'onpointerdown={(e: PointerEvent) => { e.stopPropagation();\n                        handlePointerDown(e, "nw"); }}')
    content = content.replace('onpointerdown={(e: PointerEvent) => { e.stopPropagation(); \n                        handlePointerDown(e, "ne"); }', 'onpointerdown={(e: PointerEvent) => { e.stopPropagation();\n                        handlePointerDown(e, "ne"); }}')
    content = content.replace('onpointerdown={(e: PointerEvent) => { e.stopPropagation(); \n                        handlePointerDown(e, "sw"); }', 'onpointerdown={(e: PointerEvent) => { e.stopPropagation();\n                        handlePointerDown(e, "sw"); }}')
    content = content.replace('onpointerdown={(e: PointerEvent) => { e.stopPropagation(); \n                        handlePointerDown(e, "se"); }', 'onpointerdown={(e: PointerEvent) => { e.stopPropagation();\n                        handlePointerDown(e, "se"); }}')

    with open(filepath, 'w') as f:
        f.write(content)

fix_wizard('src/lib/components/settings/CustomFieldWizard.svelte')
