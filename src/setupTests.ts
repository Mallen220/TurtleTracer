import "@testing-library/jest-dom";

// Ensure localStorage is always defined and functional for tests
const createMockStorage = () => {
  const mockStorage: Record<string, string> = {};
  return {
    getItem: (key: string) => (key in mockStorage ? mockStorage[key] : null),
    setItem: (key: string, value: string) => (mockStorage[key] = String(value)),
    removeItem: (key: string) => delete mockStorage[key],
    clear: () => {
      for (const key in mockStorage) {
        delete mockStorage[key];
      }
    },
    get length() { return Object.keys(mockStorage).length; },
    key: (index: number) => Object.keys(mockStorage)[index] || null,
  };
};

if (
  typeof localStorage === "undefined" ||
  !localStorage ||
  typeof localStorage.getItem !== "function"
) {
  (global as any).localStorage = createMockStorage();
}

// Ensure sessionStorage is defined and functional
if (
  typeof sessionStorage === "undefined" ||
  !sessionStorage ||
  typeof sessionStorage.getItem !== "function"
) {
  (global as any).sessionStorage = createMockStorage();
}

// Mock ResizeObserver which is missing in JSDOM
if (typeof ResizeObserver === "undefined") {
  (global as any).ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}

// Mock Element.prototype.animate which is missing in JSDOM
if (typeof HTMLElement !== "undefined" && !HTMLElement.prototype.animate) {
  HTMLElement.prototype.animate = function () {
    return {
      finished: Promise.resolve(),
      cancel: () => {},
      onfinish: null,
      play: () => {},
      pause: () => {},
      reverse: () => {},
    } as any;
  };
}

// Mock URL.createObjectURL and URL.revokeObjectURL
if (typeof URL !== "undefined" && !URL.createObjectURL) {
  URL.createObjectURL = () => "mock-url";
  URL.revokeObjectURL = () => {};
}

// Mock matchMedia
if (typeof window !== "undefined" && !window.matchMedia) {
  window.matchMedia = (query) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {}, // Deprecated
    removeListener: () => {}, // Deprecated
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => true,
  });
}
