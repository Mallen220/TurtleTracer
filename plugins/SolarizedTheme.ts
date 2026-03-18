// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
/// <reference path="./turtle.d.ts" />

// Solarized is a well-known light/dark palette intentionally designed for readability.
// This plugin registers both Solarized Light and Solarized Dark as custom themes.

const solarized = {
  base03: "#002b36",
  base02: "#073642",
  base01: "#586e75",
  base00: "#657b83",
  base0: "#839496",
  base1: "#93a1a1",
  base2: "#eee8d5",
  base3: "#fdf6e3",
  yellow: "#b58900",
  orange: "#cb4b16",
  red: "#dc322f",
  magenta: "#d33682",
  violet: "#6c71c4",
  blue: "#268bd2",
  cyan: "#2aa198",
  green: "#859900",
};

const solarizedLightCss = `
/* Solarized Light Theme */
html.theme-solarized-light,
html.theme-solarized-light body {
  background-color: ${solarized.base3} !important;
  color: ${solarized.base00} !important;
}

/* Surface / Panels */
html.theme-solarized-light .bg-white,
html.theme-solarized-light .bg-neutral-50,
html.theme-solarized-light .bg-neutral-100 {
  background-color: ${solarized.base2} !important;
}
html.theme-solarized-light .bg-neutral-200,
html.theme-solarized-light .bg-neutral-300,
html.theme-solarized-light .bg-neutral-400 {
  background-color: ${solarized.base1} !important;
}

/* Borders */
html.theme-solarized-light .border-neutral-200,
html.theme-solarized-light .border-neutral-300,
html.theme-solarized-light .border-neutral-400,
html.theme-solarized-light .border-neutral-500 {
  border-color: ${solarized.base1} !important;
}

/* Text */
html.theme-solarized-light .text-neutral-900,
html.theme-solarized-light .text-black {
  color: ${solarized.base00} !important;
}
html.theme-solarized-light .text-neutral-700,
html.theme-solarized-light .text-neutral-800 {
  color: ${solarized.base01} !important;
}
html.theme-solarized-light .text-neutral-500,
html.theme-solarized-light .text-neutral-600 {
  color: ${solarized.base0} !important;
}

/* Interactive Accent Colors */
html.theme-solarized-light .bg-blue-500,
html.theme-solarized-light .bg-sky-500,
html.theme-solarized-light .bg-indigo-500 {
  background-color: ${solarized.blue} !important;
}
html.theme-solarized-light .text-blue-500,
html.theme-solarized-light .text-sky-500,
html.theme-solarized-light .text-indigo-500 {
  color: ${solarized.blue} !important;
}
html.theme-solarized-light .border-blue-500,
html.theme-solarized-light .border-indigo-500 {
  border-color: ${solarized.blue} !important;
}
html.theme-solarized-light .ring-blue-500,
html.theme-solarized-light .ring-indigo-500,
html.theme-solarized-light .focus\\:ring-blue-500:focus,
html.theme-solarized-light .focus\\:ring-indigo-500:focus {
  --tw-ring-color: ${solarized.blue} !important;
}

/* Selection */
html.theme-solarized-light ::selection {
  background-color: rgba(38, 139, 210, 0.2);
  color: ${solarized.base03};
}
`;

const solarizedDarkCss = `
/* Solarized Dark Theme */
html.theme-solarized-dark,
html.theme-solarized-dark body {
  background-color: ${solarized.base03} !important;
  color: ${solarized.base0} !important;
}

/* Surface / Panels */
html.theme-solarized-dark .bg-white,
html.theme-solarized-dark .bg-neutral-50,
html.theme-solarized-dark .bg-neutral-100 {
  background-color: ${solarized.base02} !important;
}
html.theme-solarized-dark .bg-neutral-200,
html.theme-solarized-dark .bg-neutral-300,
html.theme-solarized-dark .bg-neutral-400 {
  background-color: ${solarized.base01} !important;
}

/* Borders */
html.theme-solarized-dark .border-neutral-200,
html.theme-solarized-dark .border-neutral-300,
html.theme-solarized-dark .border-neutral-400,
html.theme-solarized-dark .border-neutral-500 {
  border-color: ${solarized.base01} !important;
}

/* Text */
html.theme-solarized-dark .text-neutral-100,
html.theme-solarized-dark .text-white {
  color: ${solarized.base0} !important;
}
html.theme-solarized-dark .text-neutral-200,
html.theme-solarized-dark .text-neutral-300 {
  color: ${solarized.base1} !important;
}
html.theme-solarized-dark .text-neutral-400,
html.theme-solarized-dark .text-neutral-500 {
  color: ${solarized.base00} !important;
}

/* Interactive Accent Colors */
html.theme-solarized-dark .bg-blue-500,
html.theme-solarized-dark .bg-sky-500,
html.theme-solarized-dark .bg-indigo-500 {
  background-color: ${solarized.blue} !important;
}
html.theme-solarized-dark .text-blue-500,
html.theme-solarized-dark .text-sky-500,
html.theme-solarized-dark .text-indigo-500 {
  color: ${solarized.blue} !important;
}
html.theme-solarized-dark .border-blue-500,
html.theme-solarized-dark .border-indigo-500 {
  border-color: ${solarized.blue} !important;
}
html.theme-solarized-dark .ring-blue-500,
html.theme-solarized-dark .ring-indigo-500,
html.theme-solarized-dark .focus\\:ring-blue-500:focus,
html.theme-solarized-dark .focus\\:ring-indigo-500:focus {
  --tw-ring-color: ${solarized.blue} !important;
}

/* Selection */
html.theme-solarized-dark ::selection {
  background-color: rgba(38, 139, 210, 0.25);
  color: ${solarized.base3};
}
`;


turtle.registerMetadata({
  description: "Provides Solarized Light and Solarized Dark themes.",
});

turtle.registerTheme("Solarized Light", solarizedLightCss);

turtle.registerTheme("Solarized Dark", solarizedDarkCss);
