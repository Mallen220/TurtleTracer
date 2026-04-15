import { describe, it, expect, vi } from 'vitest';

// Main process side effects are heavy and difficult to mock fully here
// We are testing that the file imports correctly without crashing.

vi.mock('electron', () => ({
  app: {
    getPath: vi.fn(() => '/mock/userData'),
    getVersion: vi.fn(() => '1.0.0'),
    on: vi.fn(),
    whenReady: vi.fn().mockResolvedValue(),
    setPath: vi.fn(),
    quit: vi.fn(),
    isPackaged: true,
    requestSingleInstanceLock: vi.fn(() => true),
  },
  BrowserWindow: vi.fn(),
  dialog: {
    showErrorBox: vi.fn(),
    showOpenDialog: vi.fn().mockResolvedValue({ canceled: true }),
    showSaveDialog: vi.fn().mockResolvedValue({ canceled: true }),
  },
  Menu: {
    buildFromTemplate: vi.fn(),
    setApplicationMenu: vi.fn(),
  },
  shell: {
    openExternal: vi.fn(),
  },
  ipcMain: {
    handle: vi.fn(),
    on: vi.fn(),
  },
}));

vi.mock('express', () => {
  const expressFn = vi.fn(() => ({
    use: vi.fn(),
    get: vi.fn(),
  }));
  expressFn.static = vi.fn();
  expressFn.json = vi.fn();
  return { default: expressFn };
});

vi.mock('express-rate-limit', () => ({
  default: vi.fn(),
}));

vi.mock('node:http', () => ({
  default: {
    createServer: vi.fn(() => ({
      listen: vi.fn(),
      on: vi.fn(),
      close: vi.fn(),
    })),
  },
}));

vi.mock('node:fs/promises', () => ({
  default: {
    readFile: vi.fn().mockResolvedValue(''),
    writeFile: vi.fn().mockResolvedValue(),
    mkdir: vi.fn().mockResolvedValue(),
    stat: vi.fn().mockResolvedValue({ isDirectory: () => true }),
    readdir: vi.fn().mockResolvedValue([]),
    rm: vi.fn().mockResolvedValue(),
    rename: vi.fn().mockResolvedValue(),
    copyFile: vi.fn().mockResolvedValue(),
  },
}));

vi.mock('node:fs', () => ({
  default: {
    existsSync: vi.fn(() => false),
    cpSync: vi.fn(),
  },
}));

describe('main.js structure', () => {
  it('imports without executing side effects', async () => {
    // Dynamic import to allow mocks to run first
    await import('./main.js');
    expect(true).toBe(true);
  });
});
