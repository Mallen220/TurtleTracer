// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
import { writable, derived } from "svelte/store";

const numPoints = 1000;
const iterations = 10000;

// Current approach
function testCurrent() {
  const store = writable(Array.from({ length: 100 }, (_, i) => `point-${i}`));
  let arr = [];
  store.subscribe((v) => {
    arr = v;
  });

  const start = performance.now();
  for (let iter = 0; iter < iterations; iter++) {
    for (let i = 0; i < numPoints; i++) {
      const id = `point-${i}`;
      const isSelected = arr.length > 1 && arr.includes(id);
    }
  }
  return performance.now() - start;
}

// Optimized approach
function testOptimized() {
  const store = writable(Array.from({ length: 100 }, (_, i) => `point-${i}`));
  const setStore = derived(store, ($ids) => new Set($ids));
  let set = new Set();
  setStore.subscribe((v) => {
    set = v;
  });

  const start = performance.now();
  for (let iter = 0; iter < iterations; iter++) {
    for (let i = 0; i < numPoints; i++) {
      const id = `point-${i}`;
      const isSelected = set.size > 1 && set.has(id);
    }
  }
  return performance.now() - start;
}

const current = testCurrent();
const optimized = testOptimized();

console.log(`Current: ${current} ms`);
console.log(`Optimized: ${optimized} ms`);
console.log(
  `Improvement: ${(((current - optimized) / current) * 100).toFixed(2)}%`,
);
