<script lang="ts">
    import CustomFieldWizard from './CustomFieldWizard.svelte';
    import type { CustomFieldConfig } from "../../../types";

    export let isOpen = true;
    export let currentConfig: CustomFieldConfig | undefined = undefined;

    // Callbacks to simulate generic event listening with Svelte 5 properties pattern
    export let onsave: ((config: any) => void) | undefined = undefined;
    export let onclose: (() => void) | undefined = undefined;

    let childProps = {
        get isOpen() { return isOpen; },
        set isOpen(v) { isOpen = v; },
        currentConfig
    };

    function handleSave(e: CustomEvent) {
        if(onsave) onsave(e.detail);
    }

    function handleClose() {
        if(onclose) onclose();
    }
</script>

<CustomFieldWizard
    bind:isOpen={childProps.isOpen}
    currentConfig={childProps.currentConfig}
    on:close={handleClose}
    on:save={handleSave}
/>
