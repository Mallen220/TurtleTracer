// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
// Utility helpers to return full Tailwind class strings for button color variants.
// Avoids using dynamic `bg-${color}-...` templates so Tailwind JIT includes the classes.

export function getButtonFilledClass(color: string) {
  const map: Record<string, string> = {
    green:
      "bg-green-600 dark:bg-green-700 hover:bg-green-700 dark:hover:bg-green-600 focus:ring-green-300 dark:focus:ring-green-700",
    purple:
      "bg-purple-600 dark:bg-purple-700 hover:bg-purple-700 dark:hover:bg-purple-600 focus:ring-purple-300 dark:focus:ring-purple-700",
    pink: "bg-pink-600 dark:bg-pink-700 hover:bg-pink-700 dark:hover:bg-pink-600 focus:ring-pink-300 dark:focus:ring-pink-700",
    amber:
      "bg-amber-500 dark:bg-amber-600 hover:bg-amber-600 dark:hover:bg-amber-500 focus:ring-amber-300 dark:focus:ring-amber-600",
    indigo:
      "bg-indigo-600 dark:bg-indigo-700 hover:bg-indigo-700 dark:hover:bg-indigo-600 focus:ring-indigo-300 dark:focus:ring-indigo-700",
    blue: "bg-blue-600 dark:bg-blue-700 hover:bg-blue-700 dark:hover:bg-blue-600 focus:ring-blue-300 dark:focus:ring-blue-700",
    red: "bg-red-600 dark:bg-red-700 hover:bg-red-700 dark:hover:bg-red-600 focus:ring-red-300 dark:focus:ring-red-700",
    gray: "bg-gray-500 dark:bg-gray-600 hover:bg-gray-600 dark:hover:bg-gray-500 focus:ring-gray-200 dark:focus:ring-gray-500",
  };

  return map[color] || map.gray;
}

export function getSmallButtonClass(color: string) {
  const map: Record<string, string> = {
    green:
      "bg-green-50 dark:bg-green-900/20 text-green-600 dark:text-green-400 hover:bg-green-100 dark:hover:bg-green-900/30 border border-green-200 dark:border-green-800/30",
    purple:
      "bg-purple-50 dark:bg-purple-900/20 text-purple-600 dark:text-purple-400 hover:bg-purple-100 dark:hover:bg-purple-900/30 border border-purple-200 dark:border-purple-800/30",
    pink: "bg-pink-50 dark:bg-pink-900/20 text-pink-600 dark:text-pink-400 hover:bg-pink-100 dark:hover:bg-pink-900/30 border border-pink-200 dark:border-pink-800/30",
    amber:
      "bg-amber-50 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400 hover:bg-amber-100 dark:hover:bg-amber-900/30 border border-amber-200 dark:border-amber-800/30",
    indigo:
      "bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-100 dark:hover:bg-indigo-900/30 border border-indigo-200 dark:border-indigo-800/30",
    blue: "bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-900/30 border border-blue-200 dark:border-blue-800/30",
    red: "bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/30 border border-red-200 dark:border-red-800/30",
    gray: "bg-gray-50 dark:bg-gray-900/20 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-900/30 border border-gray-200 dark:border-gray-800/30",
  };

  return map[color] || map.gray;
}
