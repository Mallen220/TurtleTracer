import { shell } from "electron";
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import AppUpdater from './updater.js';

import fs from 'node:fs';

vi.mock('electron', () => ({
  app: {
    getVersion: vi.fn(() => '1.0.0'),
    getPath: vi.fn(() => '/fake/userData'),
  },
  shell: {
    openExternal: vi.fn(),
  }
}));

vi.mock('node:fs', () => {
  const actual = {
    existsSync: vi.fn(),
    readFileSync: vi.fn(),
    writeFileSync: vi.fn(),
    accessSync: vi.fn(),
    constants: { X_OK: 1 }
  };
  return {
    ...actual,
    default: actual
  };
});

const mockSpawn = vi.fn(() => ({ unref: vi.fn() }));
vi.mock('node:child_process', () => {
  return {
    spawn: (...args) => mockSpawn(...args),
    default: {
      spawn: (...args) => mockSpawn(...args)
    }
  };
});

// Mock fetch globally
global.fetch = vi.fn();

describe('updater.js', () => {
  let updater;
  let mockWindow;

  beforeEach(() => {
    vi.clearAllMocks();

    fs.existsSync.mockReturnValue(false);
    fs.readFileSync.mockReturnValue('');
    fs.writeFileSync.mockImplementation(() => {});
    fs.accessSync.mockReturnValue();

    mockWindow = {
      webContents: {
        send: vi.fn()
      }
    };
    updater = new AppUpdater(mockWindow);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('initializes correctly', () => {
    expect(updater.currentVersion).toBe('1.0.0');
    expect(updater.updaterSettingsPath).toBe('/fake/userData/updater-settings.json');
  });

  describe('checkForUpdates', () => {
    it('skips check if running in Microsoft Store', async () => {
      process.windowsStore = true;
      const result = await updater.checkForUpdates();
      expect(result.updateAvailable).toBe(false);
      expect(result.reason).toBe('store');
      delete process.windowsStore; // cleanup
    });

    it('handles failed fetch', async () => {
      global.fetch.mockResolvedValueOnce({ ok: false, status: 404 });
      const result = await updater.checkForUpdates();
      expect(result.updateAvailable).toBe(false);
      expect(result.error).toContain('404');
    });

    it('throws on manual failed fetch', async () => {
      global.fetch.mockResolvedValueOnce({ ok: false, status: 500 });
      await expect(updater.checkForUpdates(true)).rejects.toThrow('500');
    });

    it('returns latest if no newer version', async () => {
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ tag_name: 'v1.0.0', body: 'Notes', html_url: 'url' })
      });
      const result = await updater.checkForUpdates();
      expect(result.updateAvailable).toBe(false);
      expect(result.reason).toBe('latest');
    });

    it('detects newer version and sends dialog', async () => {
      vi.useFakeTimers();
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ tag_name: 'v1.1.0', body: 'Notes', html_url: 'url' })
      });
      fs.existsSync.mockReturnValue(false); // No skipped versions

      const result = await updater.checkForUpdates(true);
      expect(result.updateAvailable).toBe(true);
      expect(result.version).toBe('1.1.0');

      vi.runAllTimers();
      expect(mockWindow.webContents.send).toHaveBeenCalledWith('update-available', {
        version: '1.1.0',
        releaseNotes: 'Notes',
        url: 'url'
      });
      vi.useRealTimers();
    });

    it('skips version if in skipped versions', async () => {
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ tag_name: 'v1.1.0', body: 'Notes', html_url: 'url' })
      });
      fs.existsSync.mockReturnValue(true);
      fs.readFileSync.mockReturnValue(JSON.stringify({ skippedVersions: ['1.1.0'] }));

      const result = await updater.checkForUpdates(false);
      expect(result.updateAvailable).toBe(false);
      expect(result.reason).toBe('skipped');
    });
  });

  describe('isNewerVersion', () => {
    it('compares versions correctly', () => {
      expect(updater.isNewerVersion('1.1.0', '1.0.0')).toBe(true);
      expect(updater.isNewerVersion('2.0.0', '1.9.9')).toBe(true);
      expect(updater.isNewerVersion('1.0.1', '1.0.0')).toBe(true);
      expect(updater.isNewerVersion('1.0.0', '1.0.0')).toBe(false);
      expect(updater.isNewerVersion('0.9.0', '1.0.0')).toBe(false);
    });
  });

  describe('skipVersion', () => {
    it('adds version to skipped versions', () => {
      fs.existsSync.mockReturnValue(false); // empty list

      updater.skipVersion('1.2.0');

      expect(fs.writeFileSync).toHaveBeenCalled();
      const writtenData = JSON.parse(fs.writeFileSync.mock.calls[0][1]);
      expect(writtenData.skippedVersions).toContain('1.2.0');
    });
  });

  describe('fs access tests', () => {
    it('saves skipped versions', () => {
        updater.saveSkippedVersions(['1.1.0']);
        expect(fs.writeFileSync).toHaveBeenCalled();
        const writtenData = JSON.parse(fs.writeFileSync.mock.calls[0][1]);
        expect(writtenData.skippedVersions).toContain('1.1.0');
    });

    it('loads skipped versions', () => {
        fs.existsSync.mockReturnValue(true);
        fs.readFileSync.mockReturnValue(JSON.stringify({ skippedVersions: ['1.1.0'] }));
        const versions = updater.loadSkippedVersions();
        expect(versions).toContain('1.1.0');
    });

    it('handles write failure', () => {
      fs.writeFileSync.mockImplementationOnce(() => { throw new Error('Write failed'); });
      updater.saveSkippedVersions(['1.2.0']); // should not throw
    });

    it('handles read failure', () => {
      fs.existsSync.mockReturnValue(true);
      fs.readFileSync.mockImplementationOnce(() => { throw new Error('Read failed'); });
      const res = updater.loadSkippedVersions(); // should not throw
      expect(res).toEqual([]);
    });
  });

  describe('handleDownloadAndInstall', () => {
    let originalPlatform;

    beforeEach(() => {
      originalPlatform = process.platform;
      mockSpawn.mockClear();
    });

    afterEach(() => {
      Object.defineProperty(process, 'platform', { value: originalPlatform });
    });

    it('handles win32', () => {
      Object.defineProperty(process, 'platform', { value: 'win32' });
      updater.handleDownloadAndInstall('1.0.0', 'url');
      expect(shell.openExternal).toHaveBeenCalledWith('https://github.com/Mallen220/TurtleTracer/releases/download/v1.0.0/Turtle-Tracer-Setup-1.0.0.exe');
    });

    it('handles darwin', () => {
      Object.defineProperty(process, 'platform', { value: 'darwin' });
      updater.handleDownloadAndInstall('1.0.0', 'url');
      expect(mockSpawn).toHaveBeenCalledTimes(2);
      expect(mockSpawn.mock.calls[0][0]).toBe('/usr/bin/osascript');
    });

    it('handles linux with terminal fallback', () => {
      Object.defineProperty(process, 'platform', { value: 'linux' });
      updater.openTerminalLinux = vi.fn().mockReturnValue(false);

      updater.handleDownloadAndInstall('1.0.0', 'fallback_url');
      expect(shell.openExternal).toHaveBeenCalledWith('fallback_url');
    });

    it('handles linux success', () => {
      Object.defineProperty(process, 'platform', { value: 'linux' });
      updater.openTerminalLinux = vi.fn().mockReturnValue(true);

      updater.handleDownloadAndInstall('1.0.0', 'fallback_url');
      expect(updater.openTerminalLinux).toHaveBeenCalled();
    });

    it('handles unknown OS', () => {
      Object.defineProperty(process, 'platform', { value: 'unknown' });
      updater.handleDownloadAndInstall('1.0.0', 'fallback_url');
      expect(shell.openExternal).toHaveBeenCalledWith('fallback_url');
    });

    it('handles exception during download', () => {
      Object.defineProperty(process, 'platform', { value: 'win32' });
      shell.openExternal.mockImplementationOnce(() => { throw new Error('err'); });

      updater.handleDownloadAndInstall('1.0.0', 'fallback_url');
      // Throws error but caught, then calls fallback
      expect(shell.openExternal).toHaveBeenCalledWith('fallback_url');
    });
  });

  describe('trySpawnLinux', () => {
    it('returns true on success', () => {
       fs.accessSync.mockReturnValue(true);
       const res = updater.trySpawnLinux('/usr/bin/term', ['arg']);
       expect(res).toBe(true);
       expect(mockSpawn).toHaveBeenCalled();
    });

    it('returns false on failure', () => {
       fs.accessSync.mockImplementation(() => { throw new Error('not found'); });
       const res = updater.trySpawnLinux('/usr/bin/term', ['arg']);
       expect(res).toBe(false);
    });
  });

  describe('openTerminalLinux', () => {
      it('returns true if any term spawns', () => {
          updater.trySpawnLinux = vi.fn().mockImplementation((cmd) => cmd === '/usr/bin/konsole');
          expect(updater.openTerminalLinux('cmd')).toBe(true);
      });
      it('returns false if none spawns', () => {
          updater.trySpawnLinux = vi.fn().mockReturnValue(false);
          expect(updater.openTerminalLinux('cmd')).toBe(false);
      });
  });
});
