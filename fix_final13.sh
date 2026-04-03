#!/bin/bash

# Fix syntax error in WaypointTable
sed -i 's/                      on:click|stopPropagation={() =>/                      onclick={(e) => { e.stopPropagation();/g' src/lib/components/WaypointTable.svelte

cat << 'INNER_EOF' > fix_waypoint.py
import sys

def fix_file(filepath):
    with open(filepath, 'r') as f:
        content = f.read()

    # We messed up the removeWait replacement
    # Looking for lines like: onclick={(e) => { e.stopPropagation();\n                        removeWait(line.id, marker.id); }} }
    content = content.replace('removeWait(line.id, marker.id); }} }', 'removeWait(line.id, marker.id); }')

    with open(filepath, 'w') as f:
        f.write(content)

fix_file('src/lib/components/WaypointTable.svelte')

INNER_EOF
python3 fix_waypoint.py

# Fix PlaybackControls bind check
sed -i 's/let { playing = false/let { playing = $bindable(false)/g' src/lib/components/PlaybackControls.svelte

# Fix LeftSidebar
sed -i 's/Cannot find name '\''ComponentType'\''/Cannot find name '\''Component'\''/g' src/lib/components/LeftSidebar.svelte
sed -i 's/import type { ComponentType }/import type { Component }/g' src/lib/components/LeftSidebar.svelte
sed -i 's/: ComponentType/: Component/g' src/lib/components/LeftSidebar.svelte
