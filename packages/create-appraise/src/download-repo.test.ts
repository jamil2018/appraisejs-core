import { describe, it, expect, vi, afterEach } from 'vitest';
import { downloadRepo } from './download-repo.js';

describe('downloadRepo', () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    vi.restoreAllMocks();
    globalThis.fetch = originalFetch;
  });

  it('throws with message including both attempts and CREATE_APPRAISE_USE_BUNDLED when both tarball and clone fail', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: false, status: 404, statusText: 'Not Found' });

    await expect(
      downloadRepo('https://github.com/invalid/repo', 'main', 'templates/default')
    ).rejects.toThrow(/CREATE_APPRAISE_USE_BUNDLED/);
  }, 15000);
});
