// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
// The dialogs a plugin can show (turtle.ui.confirm/prompt/form). They're the
// app's own dialogs, labelled with the plugin's name.
import type { Component } from "svelte";
import type { FormValues } from "../api";
import { dialogRegistry } from "../../registries";
import PluginConfirmDialog from "../../components/dialogs/PluginConfirmDialog.svelte";
import PluginPromptDialog from "../../components/dialogs/PluginPromptDialog.svelte";
import PluginFormDialog from "../ui/PluginFormDialog.svelte";
import type { PluginDialogs } from "./services";

let next = 0;

function show<T>(
  component: Component<any>,
  props: Record<string, unknown>,
  answers: (finish: (value: T) => void) => Record<string, unknown>,
): Promise<T> {
  return new Promise((resolve) => {
    const id = `plugin-dialog-${++next}`;
    const finish = (value: T) => {
      dialogRegistry.unregister(id);
      resolve(value);
    };
    dialogRegistry.register({
      id,
      component,
      props: { ...props, ...answers(finish) },
    });
  });
}

/** Dialogs for one plugin, with its name in the title. */
export function dialogsFor(pluginName: string): PluginDialogs {
  const titled = (title: string) => `${title} (${pluginName})`;
  return {
    confirm: (options) =>
      show<boolean>(
        PluginConfirmDialog,
        {
          show: true,
          title: titled(options.title),
          message: options.message,
          confirmText: options.confirmLabel,
          cancelText: options.cancelLabel,
        },
        (finish) => ({
          onConfirm: () => finish(true),
          onCancel: () => finish(false),
        }),
      ),
    prompt: (options) =>
      show<string | null>(
        PluginPromptDialog,
        {
          show: true,
          title: titled(options.title),
          message: options.message ?? "",
          defaultText: options.defaultValue,
        },
        (finish) => ({
          onConfirm: (value: string) => finish(value),
          onCancel: () => finish(null),
        }),
      ),
    form: (options) =>
      show<FormValues | null>(
        PluginFormDialog,
        {
          title: options.title,
          fields: options.fields,
          values: options.values,
          submitLabel: options.submitLabel,
          source: pluginName,
        },
        (finish) => ({
          onSubmit: (values: FormValues) => finish(values),
          onCancel: () => finish(null),
        }),
      ),
  };
}
