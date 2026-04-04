import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

describe('platform', () => {
  let originalNavigatorPlatform: any;
  let originalNavigatorUserAgent: any;
  let originalProcessPlatform: any;

  beforeEach(() => {
    originalNavigatorPlatform = global.navigator?.platform;
    originalNavigatorUserAgent = global.navigator?.userAgent;
    originalProcessPlatform = global.process?.platform;
    vi.resetModules();
  });

  afterEach(() => {
    if (global.navigator) {
      Object.defineProperty(global.navigator, 'platform', {
        value: originalNavigatorPlatform,
        writable: true,
        configurable: true,
      });
      Object.defineProperty(global.navigator, 'userAgent', {
        value: originalNavigatorUserAgent,
        writable: true,
        configurable: true,
      });
    }

    if (global.process) {
      Object.defineProperty(global.process, 'platform', {
        value: originalProcessPlatform,
        writable: true,
        configurable: true,
      });
    }
    vi.resetModules();
  });

  it('detects Mac correctly', async () => {
    Object.defineProperty(global.navigator, 'platform', {
      value: 'MacIntel',
      writable: true,
      configurable: true,
    });
    const { isMac, modKey, altKey } = await import('./platform');
    expect(isMac).toBe(true);
    expect(modKey).toBe('Cmd');
    expect(altKey).toBe('Opt');
  });

  it('detects Windows correctly', async () => {
    Object.defineProperty(global.navigator, 'platform', {
      value: 'Win32',
      writable: true,
      configurable: true,
    });
    const { isMac, modKey, altKey } = await import('./platform');
    expect(isMac).toBe(false);
    expect(modKey).toBe('Ctrl');
    expect(altKey).toBe('Alt');
  });

  it('detects browser correctly', async () => {
    Object.defineProperty(global.navigator, 'userAgent', {
      value: 'Mozilla/5.0',
      writable: true,
      configurable: true,
    });
    const { isBrowser } = await import('./platform');
    expect(isBrowser).toBe(true);
  });

  it('detects electron correctly', async () => {
    Object.defineProperty(global.navigator, 'userAgent', {
      value: 'Electron/12.0.0',
      writable: true,
      configurable: true,
    });
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
    Object.defineProperty(global.navigator, 'platform', {
      value: 'Win32',
      writable: true,
      configurable: true,
    });
    const { platform } = await import('./platform');
    expect(platform()).toBe('Win32');
  });

  it('returns unknown if neither is available', async () => {
    Object.defineProperty(global.process, 'platform', {
      value: undefined,
      writable: true,
      configurable: true,
    });
    Object.defineProperty(global.navigator, 'platform', {
      value: undefined,
      writable: true,
      configurable: true,
    });
    const { platform } = await import('./platform');
    expect(platform()).toBe('unknown');
  });
});
