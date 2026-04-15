import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, fireEvent, waitFor } from '@testing-library/svelte';
import CustomFieldWizardWrapper from './CustomFieldWizardWrapper.svelte';
import CustomFieldWizard from './CustomFieldWizard.svelte';

describe('CustomFieldWizard', () => {
    let originalFileReader: any;
    let originalAlert: any;

    beforeEach(() => {
        originalFileReader = window.FileReader;
        originalAlert = window.alert;
        window.alert = vi.fn();

        // Mock pointer capture methods for jsdom
        if (!Element.prototype.setPointerCapture) {
            Element.prototype.setPointerCapture = vi.fn();
        }
        if (!Element.prototype.releasePointerCapture) {
            Element.prototype.releasePointerCapture = vi.fn();
        }
        if (!Element.prototype.hasPointerCapture) {
            Element.prototype.hasPointerCapture = vi.fn(() => true);
        }
    });

    afterEach(() => {
        window.FileReader = originalFileReader;
        window.alert = originalAlert;
        vi.restoreAllMocks();
    });

    it('renders and shows initial step 1', () => {
        const { getByText } = render(CustomFieldWizard, { props: { isOpen: true } });
        expect(getByText('Custom Field Map Wizard')).toBeDefined();
        expect(getByText('Upload a custom field map image')).toBeDefined();
        expect(getByText('Select Image')).toBeDefined();
    });

    it('does not render when isOpen is false', () => {
        const { queryByText } = render(CustomFieldWizard, { props: { isOpen: false } });
        expect(queryByText('Custom Field Map Wizard')).toBeNull();
    });

    it('handles image upload success and goes to step 2', async () => {
        const { container } = render(CustomFieldWizard, { props: { isOpen: true } });

        // Mock FileReader
        window.FileReader = class FileReader {
            onload: any;
            readAsDataURL() {
                this.result = "data:image/png;base64,dummy";
                if (this.onload) this.onload();
            }
        } as any;

        const input = container.querySelector('#wizard-image-input');
        expect(input).not.toBeNull();

        const file = new File(["dummy content"], "test.png", { type: "image/png" });
        Object.defineProperty(input, 'files', {
            value: [file]
        });

        await fireEvent.change(input!);

        // Should move to step 2 automatically
        await waitFor(() => {
            // Check if step 2 handles are present
            expect(container.querySelector('.cursor-ns-resize')).not.toBeNull();
        });
    });

    it('handles image upload read failure', async () => {
        const { container } = render(CustomFieldWizard, { props: { isOpen: true } });

        window.FileReader = class FileReader {
            onload: any;
            readAsDataURL() {
                this.result = null; // not a string
                if (this.onload) this.onload();
            }
        } as any;

        const input = container.querySelector('#wizard-image-input');
        const file = new File(["dummy content"], "test.png", { type: "image/png" });
        Object.defineProperty(input, 'files', { value: [file] });

        await fireEvent.change(input!);

        expect(window.alert).toHaveBeenCalledWith("Failed to read image file. Please try again.");
    });

    it('handles image upload error', async () => {
        const { container } = render(CustomFieldWizard, { props: { isOpen: true } });

        window.FileReader = class FileReader {
            onerror: any;
            error = { message: "Test error" };
            readAsDataURL() {
                if (this.onerror) this.onerror();
            }
        } as any;

        const input = container.querySelector('#wizard-image-input');
        const file = new File(["dummy content"], "test.png", { type: "image/png" });
        Object.defineProperty(input, 'files', { value: [file] });

        await fireEvent.change(input!);

        expect(window.alert).toHaveBeenCalledWith("Error reading file: Test error");
    });

    it('can transition back and forth between steps using buttons', async () => {
        const { getByText, container } = render(CustomFieldWizard, { props: { isOpen: true, currentConfig: { imageData: "data:image/png;base64,123", id: "test", name: "test", width: 144, height: 144, x: 0, y: 0 } } });

        // Step 1 check button
        await fireEvent.click(container.querySelector("button.mt-4.text-blue-600")!);

        // Step 2
        await waitFor(() => {
            expect(getByText("Next")).toBeDefined();
        });

        const img = container.querySelector('img');
        if (img) {
            Object.defineProperty(img, 'naturalWidth', { get: () => 1000, configurable: true });
            Object.defineProperty(img, 'naturalHeight', { get: () => 1000, configurable: true });
            await fireEvent.load(img);
        }

        // Click next -> Step 3
        await fireEvent.click(getByText("Next"));
        await waitFor(() => {
            expect(getByText("Save & Apply")).toBeDefined();
        });

        // Click back -> Step 2
        await fireEvent.click(getByText("Back"));
        await waitFor(() => {
             expect(getByText("Next")).toBeDefined();
        });
    });

    it('handles pointer events for dragging bounding box', async () => {
        const { container } = render(CustomFieldWizard, { props: { isOpen: true, currentConfig: { imageData: "data:image/png;base64,123", id: "test", name: "test", width: 144, height: 144, x: 0, y: 0 } } });

        // Go to step 2
        await fireEvent.click(container.querySelector("button.mt-4.text-blue-600")!);
        await waitFor(() => {
            expect(container.querySelector('.cursor-move')).not.toBeNull();
        });

        const moveBox = container.querySelector('.cursor-move') as HTMLElement;

        // Mock pointer events and getBoundingClientRect
        const imageContainer = moveBox.parentElement;
        if(imageContainer) {
            imageContainer.getBoundingClientRect = () => ({ width: 1000, height: 1000, left: 0, top: 0, right: 1000, bottom: 1000, x: 0, y: 0, toJSON: () => {} } as DOMRect);
        }

        // Test pointer move
        await fireEvent.pointerDown(moveBox, { clientX: 100, clientY: 100, pointerId: 1 });
        await fireEvent.pointerMove(moveBox, { clientX: 200, clientY: 200 });
        await fireEvent.pointerUp(moveBox, { pointerId: 1 });

        // Box x/y should have changed (initially 0.1, 0.1, delta is 100/1000 = +0.1) -> 0.2
        expect(moveBox.style.left).toBe('20%');
        expect(moveBox.style.top).toBe('20%');

        // Test pointer resize (W handle)
        const wHandle = container.querySelector('.cursor-ew-resize') as HTMLElement; // Left handle
        await fireEvent.pointerDown(wHandle, { clientX: 200, clientY: 200, pointerId: 2 });
        // Move left by 100px (-0.1 relative)
        await fireEvent.pointerMove(wHandle, { clientX: 100, clientY: 200 });
        await fireEvent.pointerUp(wHandle, { pointerId: 2 });

        // X should go back to 0.1, width should increase from 0.8 to 0.9
        expect(moveBox.style.left).toBe('10%');
        expect(moveBox.style.width).toBe('90%');
    });

    it('saves configuration and emits events', async () => {
        const mockSave = vi.fn();
        const mockClose = vi.fn();

        const { getByText, container } = render(CustomFieldWizardWrapper, { props: { isOpen: true, currentConfig: { imageData: "data:image/png;base64,123", id: "test", name: "test", width: 144, height: 144, x: 0, y: 0 }, onsave: mockSave, onclose: mockClose } });

        // Go to step 2
        await fireEvent.click(container.querySelector("button.mt-4.text-blue-600")!);
        await waitFor(() => {
            expect(getByText("Next")).toBeDefined();
        });

        // Mock image dimensions
        const img = container.querySelector('img');
        if (img) {
            Object.defineProperty(img, 'naturalWidth', { get: () => 1000, configurable: true });
            Object.defineProperty(img, 'naturalHeight', { get: () => 1000, configurable: true });
            await fireEvent.load(img);
        }

        // Go to step 3
        await fireEvent.click(getByText("Next"));
        await waitFor(() => {
            expect(getByText("Save & Apply")).toBeDefined();
        });

        // Click save
        await fireEvent.click(getByText("Save & Apply"));

        expect(mockSave).toHaveBeenCalled();
        expect(mockClose).toHaveBeenCalled();

        // Let's verify the calculated config values
        const savedConfig = mockSave.mock.calls[0][0];
        expect(savedConfig.imageData).toBe("data:image/png;base64,123");
        expect(savedConfig.width).toBeGreaterThan(0);
        expect(savedConfig.height).toBeGreaterThan(0);
    });

    it('fires close event when close button is clicked', async () => {
        const mockClose = vi.fn();
        const { container } = render(CustomFieldWizardWrapper, { props: { isOpen: true, onclose: mockClose } });

        // Find the close button (the one with CloseIcon)
        const closeBtn = container.querySelector('button.text-neutral-500');
        await fireEvent.click(closeBtn!);

        expect(mockClose).toHaveBeenCalled();
    });

    it('calculates config correctly', async () => {
        const mockSave = vi.fn();

        const { getByText, container } = render(CustomFieldWizardWrapper, { props: { isOpen: true, currentConfig: { imageData: "data:image/png;base64,123", id: "test-id", name: "Test Map", width: 144, height: 144, x: 0, y: 0 }, onsave: mockSave } });

        await fireEvent.click(container.querySelector("button.mt-4.text-blue-600")!);
        await waitFor(() => {
            expect(getByText("Next")).toBeDefined();
        });

        const img = container.querySelector('img');
        if (img) {
            Object.defineProperty(img, 'naturalWidth', { get: () => 1000, configurable: true });
            Object.defineProperty(img, 'naturalHeight', { get: () => 1000, configurable: true });
            await fireEvent.load(img);
        }

        await fireEvent.click(getByText("Next"));
        await waitFor(() => {
            expect(getByText("Save & Apply")).toBeDefined();
        });

        await fireEvent.click(getByText("Save & Apply"));

        const savedConfig = mockSave.mock.calls[0][0];
        expect(savedConfig.id).toBe("test-id"); // Keeps existing id
        expect(savedConfig.name).toBe("Test Map");
        expect(savedConfig.width).toBeCloseTo(180, 4);
        expect(savedConfig.height).toBeCloseTo(180, 4);
        expect(savedConfig.x).toBeCloseTo(-18, 4);
        expect(savedConfig.y).toBeCloseTo(162, 4);
    });

    it('image load error triggers alert', async () => {
         const { container } = render(CustomFieldWizardWrapper, { props: { isOpen: true, currentConfig: { imageData: "data:image/png;base64,123", id: "test", name: "test", width: 144, height: 144, x: 0, y: 0 } } });

         await fireEvent.click(container.querySelector("button.mt-4.text-blue-600")!);
         await waitFor(() => {
             expect(container.querySelector('img')).not.toBeNull();
         });

         const img = container.querySelector('img');
         // Use fireEvent.error as we found earlier it threw if we didn't wait for img to render
         if(img) {
            await fireEvent.error(img);
         }

         expect(window.alert).toHaveBeenCalledWith("The image failed to load in the browser. It may be corrupted or an unsupported format.");
    });
});
