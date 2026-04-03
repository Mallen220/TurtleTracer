#!/bin/bash
# A script to fix the repetitive type errors in svelte check by making ref types nullable

FILES=$(find src -name "*.svelte")

for file in $FILES; do
  sed -i 's/: HTMLDivElement = \$state()/: HTMLDivElement | undefined = $state()/' "$file"
  sed -i 's/: HTMLInputElement = \$state()/: HTMLInputElement | undefined = $state()/' "$file"
  sed -i 's/: HTMLElement = \$state()/: HTMLElement | undefined = $state()/' "$file"
  sed -i 's/: HTMLTextAreaElement = \$state()/: HTMLTextAreaElement | undefined = $state()/' "$file"
  sed -i 's/: HTMLButtonElement = \$state()/: HTMLButtonElement | undefined = $state()/' "$file"
  sed -i 's/: ExportCodeDialog = \$state()/: ExportCodeDialog | undefined = $state()/' "$file"
  sed -i 's/: GlobalEventMarkers = \$state()/: GlobalEventMarkers | undefined = $state()/' "$file"
  sed -i 's/: HeadingControls = \$state()/: HeadingControls | undefined = $state()/' "$file"
  sed -i 's/: ReturnType<typeof createAnimationController> =/| undefined =/' "$file"

  # Also fix $bindable
  sed -i 's/let { isOpen = false/let { isOpen = $bindable(false)/' "$file"
  sed -i 's/let { show = false/let { show = $bindable(false)/' "$file"
  sed -i 's/let { controlTabRef = null/let { controlTabRef = $bindable(null)/' "$file"
  sed -i 's/let { startPoint/let { startPoint = $bindable()/' "$file"
  sed -i 's/let { lines/let { lines = $bindable()/' "$file"
  sed -i 's/let { sequence/let { sequence = $bindable()/' "$file"
  sed -i 's/let { shapes/let { shapes = $bindable()/' "$file"
done
