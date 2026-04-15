<script lang="ts">
    import RobotProfileManager from './RobotProfileManager.svelte';
    import type { Settings } from "../../../types";

    export let settings: Settings;
    export let onSettingsChange: () => void = () => {};

    let childProps = {
        get settings() { return settings; },
        set settings(v) { settings = v; },
        onSettingsChange
    };
</script>

<RobotProfileManager
    bind:settings={childProps.settings}
    onSettingsChange={childProps.onSettingsChange}
/>
