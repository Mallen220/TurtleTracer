import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

describe('platform', () => {
  let originalNavigator: any;
  let originalWindow: any;
  let originalProcessPlatform: any;

  beforeEach(() => {
    originalNavigator = global.navigator;
    originalWindow = global.window;
    originalProcessPlatform = global.process.platform;
    vi.resetModules();
  });

  afterEach(() => {
    global.navigator = originalNavigator;
    global.window = originalWindow;
    Object.defineProperty(global.process, 'platform', {
      value: originalProcessPlatform,
      writable: true,
      configurable: true,
    });
    vi.resetModules();
  });

  it('detects Mac correctly', async () => {
    vi.stubGlobal('navigator', { platform: 'MacIntel' });
    const { isMac, modKey, altKey } = await import('./platform');
    expect(isMac).toBe(true);
    expect(modKey).toBe('Cmd');
    expect(altKey).toBe('Opt');
  });

  it('detects Windows correctly', async () => {
    vi.stubGlobal('navigator', { platform: 'Win32' });
    const { isMac, modKey, altKey } = await import('./platform');
    expect(isMac).toBe(false);
    expect(modKey).toBe('Ctrl');
    expect(altKey).toBe('Alt');
  });

  it('detects browser correctly', async () => {
    vi.stubGlobal('window', {});
    vi.stubGlobal('navigator', { userAgent: 'Mozilla/5.0' });
    const { isBrowser } = await import('./platform');
    expect(isBrowser).toBe(true);
  });

  it('detects electron correctly', async () => {
    vi.stubGlobal('window', {});
    vi.stubGlobal('navigator', { userAgent: 'Electron/12.0.0' });
    const { isBrowser } = await import('./platform');
    expect(isBrowser).toBe(false);
  });

  it('returns process.platform if available', async () => {
    Object.defineProperty(global.process, 'platform', {
      value: 'linux',
      writable: true,
      configurable: true,
    });
    const { platform } = await import('./platform');
    expect(platform()).toBe('linux');
  });

  it('returns navigator.platform if process.platform is not available', async () => {
    Object.defineProperty(global.process, 'platform', {
      value: undefined,
      writable: true,
      configurable: true,
    });
    vi.stubGlobal('navigator', { platform: 'Win32' });
    const { platform } = await import('./platform');
    expect(platform()).toBe('Win32');
  });

  it('returns unknown if neither is available', async () => {
    Object.defineProperty(global.process, 'platform', {
      value: undefined,
      writable: true,
      configurable: true,
    });
    vi.stubGlobal('navigator', undefined);
    const { platform } = await import('./platform');
    expect(platform()).toBe('unknown');
  });
});
