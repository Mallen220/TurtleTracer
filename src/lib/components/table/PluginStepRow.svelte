<!-- Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0. -->
<!-- A step of a plugin's action type in the table. Its settings open in a dialog. -->
<script lang="ts">
  import StepTableRow from "./StepTableRow.svelte";
  import type { ActionDefinition, SequencePluginItem } from "../../../types";
  import type { FormValues } from "../../plugins/api";
  import { dialogRegistry } from "../../registries";
  import PluginFormDialog from "../../plugins/ui/PluginFormDialog.svelte";
  import { pluginOfType } from "../../actions/PluginStepAction";
  import { ui } from "../../ui";

  interface Props {
    item: SequencePluginItem;
    /** This step's action type (or the stand-in for a missing plugin). */
    action: ActionDefinition;
    index: number;
    isLocked?: boolean;
    dragOverIndex?: number | null;
    dragPosition?: string | null;
    draggingIndex?: number | null;
    onUpdate: (item: SequencePluginItem) => void;
    onLock: () => void;
    onDelete: () => void;
    onDragStart: (e: DragEvent) => void;
    onDragEnd: () => void;
    onContextMenu: (e: MouseEvent) => void;
  }

  let {
    item,
    action,
    index,
    isLocked,
    dragOverIndex,
    dragPosition,
    draggingIndex,
    onUpdate,
    onLock,
    onDelete,
    onDragStart,
    onDragEnd,
    onContextMenu,
  }: Props = $props();

  function edit() {
    const id = `plugin-step-${item.id}`;
    const close = () => dialogRegistry.unregister(id);
    dialogRegistry.register({
      id,
      component: PluginFormDialog,
      props: {
        title: item.name || action.label,
        fields: action.fields ?? [],
        values: item.data as FormValues,
        submitLabel: "Save",
        onSubmit: (data: FormValues) => {
          close();
          onUpdate({ ...item, data: { ...item.data, ...data } });
        },
        onCancel: close,
      },
    });
  }
</script>

<StepTableRow
  {item}
  {index}
  {isLocked}
  {dragOverIndex}
  {dragPosition}
  {draggingIndex}
  {onLock}
  {onDelete}
  {onDragStart}
  {onDragEnd}
  {onContextMenu}
  noun="step"
  placeholder={action.label}
  accent="neutral"
  onRename={(name) => onUpdate({ ...item, name })}
>
  {#snippet cells()}
    <td class="px-3 py-2">
      <span class="inline-flex items-center gap-1.5 text-xs font-medium">
        <span
          class="size-2.5 rounded-full shrink-0"
          style="background-color: {action.color}"
          aria-hidden="true"
        ></span>
        {action.missing ? item.type : action.label}
      </span>
    </td>
    <td class="px-3 py-2 text-xs">
      {#if action.missing}
        <span
          class="text-neutral-500 dark:text-neutral-400 italic"
          title="This step is kept, but it does nothing until the plugin is installed and on."
        >
          Needs the {pluginOfType(item.type)} plugin
        </span>
      {:else if action.fields?.length}
        <button
          class={ui.btnSm.secondary}
          onclick={edit}
          disabled={isLocked}
          aria-label="Edit {item.name || action.label}">Edit…</button
        >
      {:else}
        <span class="text-neutral-500 dark:text-neutral-400 italic">-</span>
      {/if}
    </td>
  {/snippet}
</StepTableRow>
