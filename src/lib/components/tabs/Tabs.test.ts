import { tick } from "svelte";
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/svelte';
import PathTab from './PathTab.svelte';
import CodeTab from './CodeTab.svelte';
import type { Point, Line, Settings, SequenceItem } from '../../../types';
import { highlightAndSplit } from '../../../utils/htmlHighlighter';

// Define defaults BEFORE vi.mock blocks to avoid hoisting issues
const defaultSettings: Settings = {
  theme: 'light',
  exportType: 'java',
  javaPackageName: 'org.firstinspires.ftc.teamcode',
  javaClassName: 'AutoPath',
  telemetryFormat: 'none',
} as any;

const defaultStartPoint: Point = { x: 0, y: 0, heading: 'linear', startDeg: 0, endDeg: 0, locked: false };

// Mock htmlHighlighter
vi.mock('../../../utils/htmlHighlighter', () => ({
  highlightAndSplit: vi.fn().mockImplementation((code) => {
    if (!code) return [];
    return code.split('\n');
  })
}));

// Mock stores
vi.mock('../../../stores', async () => {
  const { writable } = await import('svelte/store');
  return {
    notification: writable({}),
    showSettings: writable(false),
    settingsActiveTab: writable('general'),
    currentFilePath: writable(null),
    selectedLineId: writable(null),
    selectedPointId: writable(null),
    toggleCollapseAllTrigger: writable(0),
    focusRequest: writable(null),
    snapToGrid: writable(false),
  };
});

// Mock pluginsStore
vi.mock('../../pluginsStore', async () => {
  const { writable } = await import('svelte/store');
  return {
    customExportersStore: writable([])
  };
});

// Mock projectStore
vi.mock('../../../lib/projectStore', async () => {
  const { writable } = await import('svelte/store');
  return {
    macrosStore: writable([]),
    loadMacro: vi.fn(),
    ensureSequenceConsistency: vi.fn(),
    linesStore: writable([]),
    settingsStore: writable({ theme: 'light', exportType: 'java' }), // Use inline object to avoid hoisting error
    projectActions: {
      recordChange: vi.fn()
    }
  };
});

// Mock exporters
vi.mock('../../exporters', async () => {
  const { writable } = await import('svelte/store');
  const store = writable([]);
  return {
    exporterRegistry: {
      subscribe: store.subscribe,
      register: vi.fn(),
    }
  };
});

// Mock nameGenerator
vi.mock('../../../utils/nameGenerator', () => ({
  makeId: vi.fn(() => 'mock-id-' + Math.random().toString(36).substr(2, 9)),
  renumberDefaultPathNames: vi.fn()
}));

// Mock actionRegistry
vi.mock('../../actionRegistry', async () => {
  const { writable } = await import('svelte/store');
  return {
    actionRegistry: {
      subscribe: writable([]).subscribe,
      execute: vi.fn(),
      register: vi.fn()
    }
  };
});

describe('Tabs Setup', () => {
  it('should be valid setup', () => {
    expect(true).toBe(true);
  });
});

describe('PathTab', () => {
  afterEach(() => {
    cleanup();
  });

  it('renders EmptyState when sequence is empty', () => {
    render(PathTab, {
      startPoint: defaultStartPoint,
      lines: [],
      sequence: [],
      settings: defaultSettings,
      recordChange: vi.fn(),
    });

    expect(screen.getByText('Start your path')).toBeInTheDocument();
    expect(screen.getByText('Add your first path segment, wait command, or rotation to begin.')).toBeInTheDocument();
  });

  it('renders a list of sequences when there are paths', () => {
    const sequenceItem: SequenceItem = {
      type: 'path',
      kind: 'path',
      lineId: 'line-1',
      id: 'seq-1'
    } as any;

    const mockLine: Line = {
      id: 'line-1',
      startPoint: defaultStartPoint,
      endPoint: { id: 'end-1', x: 10, y: 10, locked: false, controlPoints: [] },
      points: [],
      type: 'linear',
      controlPoints: []
    } as any;

    render(PathTab, {
      startPoint: defaultStartPoint,
      lines: [mockLine],
      sequence: [sequenceItem],
      settings: defaultSettings,
      recordChange: vi.fn(),
    });

    expect(screen.queryByText('Start your path')).not.toBeInTheDocument();
    expect(screen.getAllByRole('listitem')).toHaveLength(1);
  });

  it('handles switching between distinct paths', async () => {
    const sequenceItem1: SequenceItem = { type: 'path', kind: 'path', lineId: 'line-1', id: 'seq-1' } as any;
    const sequenceItem2: SequenceItem = { type: 'path', kind: 'path', lineId: 'line-2', id: 'seq-2' } as any;

    const mockLine1: Line = { id: 'line-1', startPoint: defaultStartPoint, endPoint: { id: 'end-1', x: 10, y: 10, locked: false, controlPoints: [] }, points: [], type: 'linear', controlPoints: [], name: 'Path 1' } as any;
    const mockLine2: Line = { id: 'line-2', startPoint: defaultStartPoint, endPoint: { id: 'end-2', x: 20, y: 20, locked: false, controlPoints: [] }, points: [], type: 'linear', controlPoints: [], name: 'Path 2' } as any;

    const { rerender } = render(PathTab, {
      startPoint: defaultStartPoint,
      lines: [mockLine1],
      sequence: [sequenceItem1],
      settings: defaultSettings,
      recordChange: vi.fn(),
    });

    expect(screen.getByDisplayValue('Path 1')).toBeInTheDocument();

    await tick();
    await rerender({
      startPoint: defaultStartPoint,
      lines: [mockLine2],
      sequence: [sequenceItem2],
      settings: defaultSettings,
      recordChange: vi.fn(),
    });

    expect(screen.queryByDisplayValue('Path 1')).not.toBeInTheDocument();
    expect(screen.getByDisplayValue('Path 2')).toBeInTheDocument();
  });
});

describe('CodeTab', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it('renders correctly and calls highlightAndSplit', async () => {
    const { component } = render(CodeTab, {
      startPoint: defaultStartPoint,
      lines: [],
      sequence: [],
      settings: defaultSettings,
      isActive: true,
    });

    expect(screen.getByText(/Previewing:.*/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Copy generated code' })).toBeInTheDocument();

    await vi.waitFor(() => {
      expect(highlightAndSplit).toHaveBeenCalled();
    });
  });
});

describe('CodeTab Persistence', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it('maintains the current code view based on settings and formats', async () => {
    const { rerender } = render(CodeTab, {
      startPoint: defaultStartPoint,
      lines: [],
      sequence: [],
      settings: defaultSettings,
      isActive: true,
    });

    expect(screen.getByText(/Previewing:.*/)).toBeInTheDocument();

    const sequentialSettings = {
      ...defaultSettings,
      exportType: 'sequential' as const,
      autoExportTargetLibrary: 'SolversLib' as const,
    };

    await tick();
    await rerender({
      startPoint: defaultStartPoint,
      lines: [],
      sequence: [],
      settings: sequentialSettings,
      isActive: true,
    });

    expect(screen.getByText(/Previewing:.*/)).toBeInTheDocument();
  });
});
