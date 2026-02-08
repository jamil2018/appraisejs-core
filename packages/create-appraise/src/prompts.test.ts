import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { runPrompts } from './prompts.js';

vi.mock('@inquirer/prompts', () => ({
  input: vi.fn(),
  select: vi.fn(),
  confirm: vi.fn(),
}));

async function getMocks() {
  const { input, select, confirm } = await import('@inquirer/prompts');
  return { input: input as ReturnType<typeof vi.fn>, select: select as ReturnType<typeof vi.fn>, confirm: confirm as ReturnType<typeof vi.fn> };
}

describe('runPrompts', () => {
  let cwd: string;
  let tempDir: string;

  beforeEach(() => {
    cwd = process.cwd();
    tempDir = path.join(os.tmpdir(), `create-appraise-prompts-${Date.now()}`);
  });

  afterEach(async () => {
    if (tempDir && fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
    vi.clearAllMocks();
  });

  it('returns directory, packageManager, and runInstall from mocked prompts', async () => {
    fs.mkdirSync(tempDir, { recursive: true });
    const { input, select, confirm } = await getMocks();
    input.mockResolvedValue(tempDir);
    select.mockResolvedValue('pnpm');
    confirm.mockResolvedValue(false);

    const result = await runPrompts(cwd);

    expect(result.directory).toBe(path.resolve(cwd, tempDir));
    expect(result.packageManager).toBe('pnpm');
    expect(result.runInstall).toBe(false);
  });

  it('throws when target directory exists and is non-empty', async () => {
    fs.mkdirSync(tempDir, { recursive: true });
    fs.writeFileSync(path.join(tempDir, 'file.txt'), 'x');
    const { input } = await getMocks();
    input.mockResolvedValue(tempDir);

    await expect(runPrompts(cwd)).rejects.toThrow(/Directory must be empty/);
  });

  it('accepts when target directory does not exist', async () => {
    const newPath = path.join(tempDir, 'new-app');
    const { input, select, confirm } = await getMocks();
    input.mockResolvedValue(newPath);
    select.mockResolvedValue('npm');
    confirm.mockResolvedValue(true);

    const result = await runPrompts(cwd);

    expect(result.directory).toBe(path.resolve(cwd, newPath));
    expect(result.packageManager).toBe('npm');
    expect(result.runInstall).toBe(true);
  });
});
