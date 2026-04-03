#!/bin/bash
sed -i 's/on:click=/onclick=/g' src/lib/components/WaypointTable.svelte

cat << 'INNER_EOF' > fix_sections3.py
import sys

def fix_file(filepath):
    with open(filepath, 'r') as f:
        content = f.read()

    # We messed up the parenthesis originally, we need to properly migrate from svelte 4 to 5
    # Original: onkeydown={stopPropagation((e) => {
    # Replace with: onkeydown={(e: KeyboardEvent) => { e.stopPropagation();

    content = content.replace('onkeydown={stopPropagation((e) => {', 'onkeydown={(e: KeyboardEvent) => {\n    e.stopPropagation();')
    # But now there's an extra }) at the end of the callback instead of }
    # So we need to find `  })}` and replace with `  }}`
    content = content.replace('  })}', '  }}')

    with open(filepath, 'w') as f:
        f.write(content)

fix_file('src/lib/components/sections/WaitSection.svelte')
fix_file('src/lib/components/sections/RotateSection.svelte')
fix_file('src/lib/components/sections/MacroSection.svelte')

def fix_wizard(filepath):
    with open(filepath, 'r') as f:
        content = f.read()

    # Original: onpointerdown={stopPropagation((e) => handlePointerDown(e, "n"))}
    # Need to change to svelte 5: onpointerdown={(e: PointerEvent) => { e.stopPropagation(); handlePointerDown(e, "n"); }}
    import re
    # Match `onpointerdown={stopPropagation((e) => \s* handlePointerDown(e, "X"), \s* )}` where X is the direction

    content = re.sub(r'onpointerdown={stopPropagation\(\(e\) =>\s*handlePointerDown\(e,\s*"([^"]+)"\),\s*\)}', r'onpointerdown={(e: PointerEvent) => { e.stopPropagation(); handlePointerDown(e, "\1"); }}', content, flags=re.MULTILINE)

    with open(filepath, 'w') as f:
        f.write(content)

fix_wizard('src/lib/components/settings/CustomFieldWizard.svelte')

INNER_EOF
python3 fix_sections3.py
