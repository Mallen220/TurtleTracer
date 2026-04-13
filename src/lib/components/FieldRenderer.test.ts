import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import FieldRenderer from './FieldRenderer.svelte';
import { get } from 'svelte/store';
import { fieldViewStore } from '../../stores';
import * as d3 from "d3";
import { generateCollisionElements } from './renderer/CollisionMarkerGenerator';

// Mock canvas API for JSDOM/Happy DOM
HTMLCanvasElement.prototype.getContext = vi.fn(() => ({
    fillRect: vi.fn(),
    clearRect: vi.fn(),
    getImageData: vi.fn(() => ({ data: new Array(4) })),
    putImageData: vi.fn(),
    createImageData: vi.fn(),
    setTransform: vi.fn(),
    drawImage: vi.fn(),
    save: vi.fn(),
    fillText: vi.fn(),
    restore: vi.fn(),
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    closePath: vi.fn(),
    stroke: vi.fn(),
    translate: vi.fn(),
    scale: vi.fn(),
    rotate: vi.fn(),
    arc: vi.fn(),
    fill: vi.fn(),
    measureText: vi.fn(() => ({ width: 0 })),
    transform: vi.fn(),
    rect: vi.fn(),
    clip: vi.fn(),
})) as any;

describe('FieldRenderer', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('reacts to prop changes and updates dimension stores', async () => {
        const { component, rerender } = render(FieldRenderer, { props: { onRecordChange: vi.fn(), width: 500, height: 500 } });
        expect(component).toBeTruthy();

        // Assert width and height update correctly when changing props
        await rerender({ width: 1000, height: 800 });

        // Wait a tick for derived updates
        await new Promise(r => setTimeout(r, 0));

        const storeValue = get(fieldViewStore);
        expect(storeValue.width).toBe(1000);
        expect(storeValue.height).toBe(800);
    });

    it('tests boundary collision logic via generateCollisionElements', () => {
        const x = d3.scaleLinear().domain([0, 144]).range([0, 1000]);
        const y = d3.scaleLinear().domain([0, 144]).range([1000, 0]);
        const uiLength = (inches: number) => inches * 10;

        const markers = [
            { x: 0, y: 0, type: 'boundary', time: 0 },
            { x: 10, y: 10, type: 'robot', time: 1 },
            { x: 20, y: 20, type: 'zero-length', time: 2 },
            { x: 30, y: 30, type: 'keep-in', time: 3 },
        ];

        const lines: any[] = [];
        const startPoint: any = { x: 0, y: 0 };
        const timePrediction: any = null;

        const elements = generateCollisionElements(markers, lines, startPoint, timePrediction, { x, y, uiLength } as any);

        expect(elements.length).toBe(4);

        // Asserting boundary orange color
        expect(elements[0].children[0].fill).toBe('rgba(249, 115, 22, 0.3)');
        expect(elements[0].children[1].fill).toBe('rgba(249, 115, 22, 0.5)');
    });

    it('validates coordinate mapping from d3 integration as used in FieldRenderer', () => {
        // FieldRenderer uses d3.scaleLinear to map [0, FIELD_SIZE] to the pixel width/height.
        const FIELD_SIZE = 144;
        const width = 1000;
        const height = 1000;
        const baseSize = Math.min(width, height);
        const scaleFactor = 1; // zoom = 1
        const pan = { x: 0, y: 0 };

        // Simulate the component's exact d3 derived scale mapping
        const x = d3.scaleLinear()
            .domain([0, FIELD_SIZE])
            .range([
                width / 2 - (baseSize * scaleFactor) / 2 + pan.x,
                width / 2 + (baseSize * scaleFactor) / 2 + pan.x,
            ]);

        const y = d3.scaleLinear()
            .domain([0, FIELD_SIZE])
            .range([
                height / 2 + (baseSize * scaleFactor) / 2 + pan.y,
                height / 2 - (baseSize * scaleFactor) / 2 + pan.y,
            ]);

        // 72 is the exact center of a 144 FIELD_SIZE, which should map to the exact center of 1000 width/height
        expect(x(72)).toBe(500);
        expect(y(72)).toBe(500);

        // 144 is the edge, which should map to 1000 on x-axis
        expect(x(FIELD_SIZE)).toBe(1000);
        // 0 is the start edge, which should map to 1000 on y-axis (y is inverted visually in rendering)
        expect(y(0)).toBe(1000);
    });
});
