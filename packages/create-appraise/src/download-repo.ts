import fs from 'fs-extra';
import os from 'os';
import path from 'path';
import { spawn } from 'child_process';
import { x as extractTar } from 'tar';

const TEMP_PREFIX = 'create-appraise-';

function getTarballUrl(repoBase: string, branch: string): string {
  const base = repoBase.replace(/\/$/, '').replace(/\.git$/, '');
  return `${base}/archive/refs/heads/${encodeURIComponent(branch)}.tar.gz`;
}

function getCloneUrl(repoBase: string): string {
  return repoBase.replace(/\/$/, '').replace(/\.git$/, '');
}

async function tryTarball(
  repoBase: string,
  branch: string,
  templateSubpath: string
): Promise<{ repoRoot: string; cleanupDir: string } | { error: string }> {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), TEMP_PREFIX));
  const archivePath = path.join(tempDir, 'archive.tar.gz');

  try {
    const tarballUrl = getTarballUrl(repoBase, branch);
    const response = await fetch(tarballUrl);
    if (!response.ok) {
      return {
        error: `Tarball download failed: ${response.status} ${response.statusText}`,
      };
    }

    const arrayBuffer = await response.arrayBuffer();
    await fs.writeFile(archivePath, Buffer.from(arrayBuffer));

    await extractTar({ file: archivePath, cwd: tempDir });

    const entries = await fs.readdir(tempDir, { withFileTypes: true });
    const topLevelDirs = entries.filter((e) => e.isDirectory());
    if (topLevelDirs.length !== 1) {
      const dirNames = topLevelDirs.map((d) => d.name).join(', ') || 'none';
      return {
        error: `Tarball extract failed: expected exactly one top-level directory, got ${topLevelDirs.length} (${dirNames})`,
      };
    }

    const repoRoot = path.join(tempDir, topLevelDirs[0].name);
    const templatePath = path.join(repoRoot, templateSubpath);

    const templateExists = await fs.pathExists(templatePath);
    const templateIsDir = templateExists && (await fs.stat(templatePath)).isDirectory();
    if (!templateExists || !templateIsDir) {
      return {
        error: `Template not found at ${templatePath}. The repository may not contain this path.`,
      };
    }

    return { repoRoot, cleanupDir: tempDir };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { error: `Tarball download failed: ${message}` };
  }
}

function runGitClone(cloneUrl: string, branch: string, tempDir: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn('git', ['clone', '--depth', '1', '--branch', branch, cloneUrl, tempDir], {
      stdio: 'pipe',
    });
    let stderr = '';
    child.stderr?.on('data', (chunk) => {
      stderr += chunk;
    });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`Git clone failed (exit ${code}): ${stderr.trim() || 'unknown'}`));
    });
  });
}

async function tryClone(
  repoBase: string,
  branch: string,
  templateSubpath: string
): Promise<{ repoRoot: string; cleanupDir: string } | { error: string }> {
  const cloneUrl = getCloneUrl(repoBase);
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), TEMP_PREFIX));

  try {
    await runGitClone(cloneUrl, branch, tempDir);
    const repoRoot = tempDir;
    const templatePath = path.join(repoRoot, templateSubpath);

    const templateExists = await fs.pathExists(templatePath);
    const templateIsDir = templateExists && (await fs.stat(templatePath)).isDirectory();
    if (!templateExists || !templateIsDir) {
      return {
        error: `Template not found at ${templatePath}. The repository may not contain this path.`,
      };
    }

    return { repoRoot, cleanupDir: tempDir };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { error: `Git clone failed: ${message}` };
  }
}

export async function downloadRepo(
  repoBase: string,
  branch: string,
  templateSubpath: string
): Promise<{ repoRoot: string; cleanupDir: string }> {
  const tarballResult = await tryTarball(repoBase, branch, templateSubpath);

  if ('repoRoot' in tarballResult) {
    return { repoRoot: tarballResult.repoRoot, cleanupDir: tarballResult.cleanupDir };
  }

  const cloneResult = await tryClone(repoBase, branch, templateSubpath);

  if ('repoRoot' in cloneResult) {
    return { repoRoot: cloneResult.repoRoot, cleanupDir: cloneResult.cleanupDir };
  }

  const tarballError = tarballResult.error;
  const cloneError = cloneResult.error;

  throw new Error(
    `Could not download the template. Tarball download failed: ${tarballError}. Git clone failed: ${cloneError}. Set CREATE_APPRAISE_USE_BUNDLED=1 to use the bundled template instead.`
  );
}
