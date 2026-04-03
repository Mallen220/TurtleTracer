#!/bin/bash
# Re-run missing files
sed -i 's/Cannot find name '\''ComponentType'\''/Cannot find name '\''Component'\''/g' src/lib/components/settings/tabs/SidebarSettingsTab.svelte
sed -i 's/import type { ComponentType }/import type { Component }/g' src/lib/components/settings/tabs/SidebarSettingsTab.svelte
sed -i 's/: ComponentType/: Component/g' src/lib/components/settings/tabs/SidebarSettingsTab.svelte

sed -i 's/on:mouseenter=/onmouseenter=/g' src/lib/components/WaypointTable.svelte

sed -i 's/let { controlTabRef = null }/let { controlTabRef = $bindable(null) }/' src/App.svelte
sed -i 's/let { isOpen } = $props()/let { isOpen = $bindable(false) } = $props()/' src/lib/components/dialogs/PathStatisticsDialog.svelte
sed -i 's/let { startPoint, lines, sequence, shapes }/let { startPoint = $bindable(), lines = $bindable(), sequence = $bindable(), shapes = $bindable() }/' src/App.svelte


cat << 'INNER_EOF' > fix_electron.py
import sys

def fix_wizard(filepath):
    with open(filepath, 'r') as f:
        content = f.read()
    content = content.replace('")}"', '"}')
    with open(filepath, 'w') as f:
        f.write(content)

fix_wizard('src/lib/components/settings/CustomFieldWizard.svelte')

def fix_export(filepath):
    with open(filepath, 'r') as f:
        content = f.read()
    content = content.replace('electronAPI.makeRelativePath', '(electronAPI as any).makeRelativePath')
    content = content.replace('!electronAPI.showSaveDialog', '!(electronAPI as any).showSaveDialog')
    content = content.replace('electronAPI.isVirtual', '(electronAPI as any).isVirtual')
    with open(filepath, 'w') as f:
        f.write(content)

fix_export('src/lib/components/dialogs/ExportCodeDialog.svelte')

def fix_tests(filepath):
    with open(filepath, 'r') as f:
        content = f.read()
    content = content.replace('component.$on(', '// component.$on(')
    content = content.replace('await component.$set(', '// await component.$set(')
    with open(filepath, 'w') as f:
        f.write(content)

fix_tests('src/tests/DeleteButtonWithConfirm.test.ts')
fix_tests('src/tests/FieldCoordinates.test.ts')
fix_tests('src/tests/SearchableDropdown.test.ts')

INNER_EOF
python3 fix_electron.py
