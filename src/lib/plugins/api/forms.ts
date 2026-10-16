// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
// Forms are described as data and drawn by Turtle Tracer, so a plugin's
// settings, dialogs and action rows look like the rest of the app (themes
// included) without the plugin shipping any UI.

interface FieldBase {
  /** The name the value is stored under. */
  key: string;
  label: string;
  /** A short explanation shown under the field. */
  help?: string;
}

export interface NumberField extends FieldBase {
  type: "number";
  default?: number;
  min?: number;
  max?: number;
  step?: number;
  /**
   * What the number measures. Values are always stored in inches, degrees,
   * seconds and inches per second; the form shows them in the user's units.
   */
  unit?: "distance" | "angle" | "time" | "speed";
}

export interface TextField extends FieldBase {
  type: "text";
  default?: string;
  placeholder?: string;
  /** A box with several lines instead of one. */
  multiline?: boolean;
}

export interface ToggleField extends FieldBase {
  type: "toggle";
  default?: boolean;
}

export interface SelectField extends FieldBase {
  type: "select";
  options: { value: string; label: string }[];
  default?: string;
}

export interface ColorField extends FieldBase {
  type: "color";
  /** A hex colour such as `#22c55e`. */
  default?: string;
}

export type FormField =
  | NumberField
  | TextField
  | ToggleField
  | SelectField
  | ColorField;

/** A form's values, by field key. */
export type FormValues = Record<string, string | number | boolean>;
