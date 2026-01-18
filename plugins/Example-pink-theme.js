pedro.registerTheme("Pink Plugin Theme", `
/* Global Backgrounds */
html.dark body,
html.dark .bg-neutral-900,
html.dark .dark\\:bg-neutral-900 {
    background-color: #2a0a18 !important; /* Deepest Pink/Black */
}

html.dark .bg-neutral-800,
html.dark .dark\\:bg-neutral-800 {
    background-color: #4a0e22 !important; /* Deep Pink panel */
}

html.dark .bg-neutral-700,
html.dark .dark\\:bg-neutral-700 {
    background-color: #6d1533 !important;
}

/* Interactive Elements */
html.dark .hover\\:bg-neutral-800:hover,
html.dark .dark\\:hover\\:bg-neutral-800:hover {
    background-color: #6d1533 !important;
}
html.dark .hover\\:bg-neutral-700:hover,
html.dark .dark\\:hover\\:bg-neutral-700:hover {
    background-color: #891d41 !important;
}

/* Borders */
html.dark .border-neutral-800,
html.dark .dark\\:border-neutral-800,
html.dark .border-neutral-700,
html.dark .dark\\:border-neutral-700,
html.dark .border-neutral-600,
html.dark .dark\\:border-neutral-600,
html.dark .border-neutral-500,
html.dark .dark\\:border-neutral-500 {
    border-color: #831843 !important;
}

/* Text Colors */
html.dark .text-neutral-100,
html.dark .dark\\:text-neutral-100,
html.dark .text-white,
html.dark .dark\\:text-white {
    color: #ffe4e6 !important; /* Rose 100 */
}

html.dark .text-neutral-200,
html.dark .dark\\:text-neutral-200,
html.dark .text-neutral-300,
html.dark .dark\\:text-neutral-300 {
    color: #fecdd3 !important; /* Rose 200 */
}

html.dark .text-neutral-400,
html.dark .dark\\:text-neutral-400,
html.dark .text-neutral-500,
html.dark .dark\\:text-neutral-500 {
    color: #fda4af !important; /* Rose 300 */
}

/* Accents (Blue, Indigo, Purple -> Hot Pink) */
.bg-blue-500, .bg-blue-600, .bg-indigo-500, .bg-purple-500, .bg-purple-600 {
    background-color: #ec4899 !important; /* Pink 500 */
}

.text-blue-500, .text-blue-600, .text-indigo-500, .text-purple-500, .text-purple-400 {
    color: #f472b6 !important; /* Pink 400 */
}

.border-blue-500, .border-indigo-500, .border-purple-500 {
    border-color: #ec4899 !important;
}

.ring-blue-500, .ring-indigo-500, .ring-purple-500,
.focus\\:ring-blue-500:focus, .focus\\:ring-indigo-500:focus {
    --tw-ring-color: #ec4899 !important;
}

/* Selection */
::selection {
    background-color: #fce7f3;
    color: #831843;
}
`);
