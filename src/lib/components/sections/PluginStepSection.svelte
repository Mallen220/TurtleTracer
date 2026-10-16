<!-- Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0. -->
<!-- A step of a plugin's action type in the path list, with its settings. -->
<script lang="ts">
  import SequenceItemCard from "./SequenceItemCard.svelte";
  import SchemaForm from "../../plugins/ui/SchemaForm.svelte";
  import type {
    ActionDefinition,
    SequenceItem,
    SequencePluginItem,
  } from "../../../types/index";
  import type { FormValues } from "../../plugins/api";
  import { pluginOfType } from "../../actions/PluginStepAction";
  import { settingsStore } from "../../projectStore";
  import { ui } from "../../ui";

  interface Props {
    item: SequencePluginItem;
    /** This step's action type (or the stand-in for a missing plugin). */
    action: ActionDefinition;
    sequence: SequenceItem[];
    collapsed?: boolean;
    onRemove: () => void;
    onAddAction?: (def: ActionDefinition) => void;
    onMoveUp: () => void;
    onMoveDown: () => void;
    canMoveUp?: boolean;
    canMoveDown?: boolean;
    recordChange?: (description?: string) => void;
  }

  let {
    item,
    action,
    sequence = $bindable(),
    collapsed = $bindable(false),
    recordChange,
    onRemove,
    onAddAction,
    onMoveUp,
    onMoveDown,
    canMoveUp,
    canMoveDown,
  }: Props = $props();

  function update(changes: Partial<SequencePluginItem>) {
    sequence = sequence.map((s) =>
      s.kind === "plugin" && s.id === item.id ? { ...s, ...changes } : s,
    );
  }
</script>

<SequenceItemCard
  {item}
  bind:sequence
  bind:collapsed
  label={action.missing ? "Plugin step" : action.label}
  accent="neutral"
  onRename={(name) => update({ name })}
  {recordChange}
  {onRemove}
  {onAddAction}
  {onMoveUp}
  {onMoveDown}
  {canMoveUp}
  {canMoveDown}
>
  {#if action.missing}
    <p class="{ui.alert.neutral} text-xs">
      This step needs the <strong>{pluginOfType(item.type)}</strong> plugin. It's
      kept in the project as it is, but does nothing until the plugin is installed
      and turned on.
    </p>
  {:else if action.fields?.length}
    <SchemaForm
      fields={action.fields}
      values={item.data as FormValues}
      units={$settingsStore.visualizerUnits}
      disabled={item.locked}
      idPrefix="plugin-step-{item.id}"
      onChange={(data) => {
        update({ data: { ...item.data, ...data } });
        recordChange?.(`Change ${action.label}`);
      }}
    />
  {:else}
    <p class="text-xs text-neutral-500 dark:text-neutral-400">
      This step has no settings.
    </p>
  {/if}
</SequenceItemCard>
