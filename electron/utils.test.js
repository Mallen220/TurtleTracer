import { describe, it, expect, vi } from 'vitest';
import { validateSafePath, validateArbitraryPath, isProjectFilePath, getDirectorySettingsPath, loadDirectorySettings, saveDirectorySettings, getPluginsDirectory } from './utils.js';
import path from 'node:path';
import fs from 'node:fs/promises';
import { app } from 'electron';

vi.mock('electron', () => ({
  app: {
    getPath: vi.fn(() => '/fake/userData'),
  },
}));

vi.mock('node:fs/promises', () => ({
  default: {
    readFile: vi.fn(),
    writeFile: vi.fn(),
  },
}));

describe('utils.js', () => {
  describe('validateSafePath', () => {
    it('normalizes path', () => {
      expect(validateSafePath('/test/path/../path2', null)).toBe('/test/path2');
    });

    it('throws on non-string', () => {
      expect(() => validateSafePath(123)).toThrow(TypeError);
    });

    it('throws on null bytes', () => {
      expect(() => validateSafePath('/test/\0/path')).toThrow(Error);
    });

    it('validates against basePath', () => {
      expect(validateSafePath('/base/test', '/base')).toBe('/base/test');
    });

    it('throws on path traversal out of base', () => {
      expect(() => validateSafePath('/base/../outside', '/base')).toThrow(Error);
    });
  });

  describe('validateArbitraryPath', () => {
    it('throws on non-string', () => {
      expect(() => validateArbitraryPath(123)).toThrow(TypeError);
    });

    it('throws on null bytes', () => {
      expect(() => validateArbitraryPath('/test/\0/path')).toThrow(Error);
    });

    it('throws on traversal sequences', () => {
      expect(() => validateArbitraryPath('/test/../path')).toThrow(Error);
    });

    it('throws if not absolute', () => {
      expect(() => validateArbitraryPath('relative/path')).toThrow(Error);
    });

    it('returns normalized absolute path', () => {
      expect(validateArbitraryPath('/absolute/path')).toBe('/absolute/path');
    });
  });

  describe('isProjectFilePath', () => {
    it('returns true for .turt files', () => {
      expect(isProjectFilePath('file.turt')).toBe(true);
      expect(isProjectFilePath('FILE.TURT')).toBe(true);
    });

    it('returns true for .pp files', () => {
      expect(isProjectFilePath('file.pp')).toBe(true);
    });

    it('returns false for other files', () => {
      expect(isProjectFilePath('file.txt')).toBe(false);
      expect(isProjectFilePath(null)).toBe(false);
      expect(isProjectFilePath(123)).toBe(false);
    });
  });

  describe('getDirectorySettingsPath', () => {
    it('returns valid path', () => {
      expect(getDirectorySettingsPath()).toBe('/fake/userData/directory-settings.json');
    });
  });

  describe('loadDirectorySettings', () => {
    it('loads settings if file exists', async () => {
      const mockSettings = { autoPathsDirectory: '/test' };
      fs.readFile.mockResolvedValueOnce(JSON.stringify(mockSettings));

      const settings = await loadDirectorySettings();
      expect(settings).toEqual(mockSettings);
    });

    it('returns default settings if file read fails', async () => {
      fs.readFile.mockRejectedValueOnce(new Error('File not found'));

      const settings = await loadDirectorySettings();
      expect(settings.autoPathsDirectory).toBe('');
      expect(settings.plugins).toBeDefined();
    });
  });

  describe('saveDirectorySettings', () => {
    it('saves settings successfully', async () => {
      fs.writeFile.mockResolvedValueOnce();

      const result = await saveDirectorySettings({ test: 'data' });
      expect(result).toBe(true);
      expect(fs.writeFile).toHaveBeenCalled();
    });

    it('returns false on error', async () => {
      fs.writeFile.mockRejectedValueOnce(new Error('Write failed'));

      const result = await saveDirectorySettings({ test: 'data' });
      expect(result).toBe(false);
    });
  });

  describe('getPluginsDirectory', () => {
    it('returns valid path', () => {
      expect(getPluginsDirectory()).toBe('/fake/userData/plugins');
    });
  });
});
