#!/bin/bash
sed -i 's/on:mouseleave=/onmouseleave=/g' src/lib/components/WaypointTable.svelte

cat << 'INNER_EOF' > fix_sections2.py
import sys

def fix_file(filepath):
    with open(filepath, 'r') as f:
        content = f.read()

    content = content.replace('onkeydown={(e: KeyboardEvent) => { e.stopPropagation();\n    if (e.key === "Enter" || e.key === " ") {\n      e.preventDefault();\n      itemRef?.focus();\n    }\n  }}', 'onkeydown={(e: KeyboardEvent) => {\n    e.stopPropagation();\n    if (e.key === "Enter" || e.key === " ") {\n      e.preventDefault();\n      itemRef?.focus();\n    }\n  }}')

    with open(filepath, 'w') as f:
        f.write(content)

fix_file('src/lib/components/sections/WaitSection.svelte')
fix_file('src/lib/components/sections/RotateSection.svelte')
fix_file('src/lib/components/sections/MacroSection.svelte')

INNER_EOF
python3 fix_sections2.py

sed -i 's/let backgroundImageRef: HTMLImageElement = $state();/let backgroundImageRef: HTMLImageElement | undefined = $state();/' src/lib/components/settings/CustomFieldWizard.svelte
