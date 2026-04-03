#!/bin/bash
sed -i 's/: ComponentType/: Component/g' src/lib/components/LeftSidebar.svelte
sed -i 's/let { playing/let { playing = $bindable()/' src/lib/ControlTab.svelte
sed -i 's/let canvas: HTMLCanvasElement = \$state()/let canvas: HTMLCanvasElement | undefined = $state()/' src/lib/components/telemetry/LiveFieldLayer.svelte
sed -i 's/let two: Two = \$state()/let two: Two | undefined = $state()/' src/lib/components/FieldRenderer.svelte
sed -i 's/new Two({ fitted: true, type: Two.Types.svg }).appendTo(twoElement)/new Two({ fitted: true, type: Two.Types.svg }).appendTo(twoElement!)/' src/lib/components/FieldRenderer.svelte
sed -i 's/twoElement.getBoundingClientRect()/twoElement!.getBoundingClientRect()/' src/lib/components/FieldRenderer.svelte
sed -i 's/ro.observe(container)/ro.observe(container!)/' src/lib/components/tools/SimpleChart.svelte
