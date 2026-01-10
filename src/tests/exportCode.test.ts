import { render, fireEvent, waitFor } from '@testing-library/svelte';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import ExportCodeDialog from '../lib/components/ExportCodeDialog.svelte';

// Mock the utils module used by the component so we can control generated code
vi.mock('../utils', () => {
  return {
    generateJavaCode: vi.fn(),
    generatePointsArray: vi.fn(() => 'apple\nbanana\napple\ncherry\napple'),
    generateSequentialCommandCode: vi.fn(),
    downloadTrajectory: vi.fn(),
  };
});

describe('ExportCodeDialog search behavior', () => {
  it('pressing Enter goes to next match and Shift+Enter goes to previous', async () => {
    const { getByLabelText, getByPlaceholderText, getByText, component } = render(ExportCodeDialog, {
      isOpen: false,
      startPoint: { x: 0, y: 0, heading: 'constant', degrees: 0 },
      lines: [],
      sequence: [],
      shapes: [],
    });

    // Open the dialog with points format which uses the mocked generatePointsArray
    await component.openWithFormat('points');

    // Click the search toggle button
    const searchButton = getByLabelText('Search code');
    await fireEvent.click(searchButton);

    const input = getByPlaceholderText('Find...');

    // Type 'apple' which occurs 3 times in the mocked output
    await fireEvent.input(input, { target: { value: 'apple' } });

    // Should show 1/3 initially
    await waitFor(() => expect(getByText('1/3')).toBeTruthy());

    // Press Enter to go to next match -> 2/3
    await fireEvent.keyDown(input, { key: 'Enter' });
    await waitFor(() => expect(getByText('2/3')).toBeTruthy());

    // Press Shift+Enter to go back -> 1/3
    await fireEvent.keyDown(input, { key: 'Enter', shiftKey: true });
    await waitFor(() => expect(getByText('1/3')).toBeTruthy());
  });
});
