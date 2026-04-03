// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
import "@testing-library/jest-dom";
import { beforeEach, vi } from "vitest";

const createLocalStorageMock = () => {
	const storage = new Map<string, string>();

	return {
		getItem: vi.fn((key: string) => storage.get(key) ?? null),
		setItem: vi.fn((key: string, value: string) => {
			storage.set(key, value);
		}),
		removeItem: vi.fn((key: string) => {
			storage.delete(key);
		}),
		clear: vi.fn(() => {
			storage.clear();
		}),
		key: vi.fn((index: number) => Array.from(storage.keys())[index] ?? null),
		get length() {
			return storage.size;
		},
	};
};

beforeEach(() => {
	const localStorageMock = createLocalStorageMock();

	Object.defineProperty(window, "localStorage", {
		value: localStorageMock,
		configurable: true,
		writable: true,
	});

	Object.defineProperty(globalThis, "localStorage", {
		value: localStorageMock,
		configurable: true,
		writable: true,
	});

	if (typeof Element !== "undefined" && !Element.prototype.animate) {
		Object.defineProperty(Element.prototype, "animate", {
			configurable: true,
			value: vi.fn(() => ({
				cancel: vi.fn(),
				finish: vi.fn(),
				pause: vi.fn(),
				play: vi.fn(),
				reverse: vi.fn(),
				updatePlaybackRate: vi.fn(),
				commitStyles: vi.fn(),
				finished: Promise.resolve(),
				ready: Promise.resolve(),
			})),
		});
	}

	if (typeof globalThis.ResizeObserver === "undefined") {
		class ResizeObserverMock {
			observe() {}
			unobserve() {}
			disconnect() {}
		}

		Object.defineProperty(globalThis, "ResizeObserver", {
			value: ResizeObserverMock,
			configurable: true,
			writable: true,
		});
	}
});
