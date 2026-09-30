import { createHash, randomUUID } from 'node:crypto';
import { readFile, readdir, lstat, mkdir, rename, unlink, writeFile } from 'node:fs/promises';
import { dirname, join, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { GeneratedFile } from './emit.js';
import { CodegenError } from './emit.js';
const manifestName = '.test-builders.manifest.json';
const digest = (text: string) => createHash('sha256').update(text).digest('hex');
function safePath(path: string): void {
  if (
    typeof path !== 'string' ||
    !/^[A-Za-z0-9._/-]+$/.test(path) ||
    path.startsWith('/') ||
    path
      .split('/')
      .some(
        (part) =>
          !part ||
          part === '.' ||
          part === '..' ||
          part.endsWith('.') ||
          /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(part)
      ) ||
    path === manifestName
  ) {
    throw new CodegenError('Output paths must be safe relative filenames');
  }
}
async function read(path: string): Promise<string | undefined> {
  try {
    const stat = await lstat(path);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 16_000_000) {
      throw new CodegenError('Expected a regular bounded output file');
    }
    return await readFile(path, 'utf8');
  } catch (error) {
    if ((error as { code?: string }).code === 'ENOENT') {
      return undefined;
    }
    throw error;
  }
}
async function directories(root: string, path: string, create: boolean): Promise<void> {
  const parents = [root];
  const components = relative(root, dirname(path)).split(/[\\/]/).filter(Boolean);
  for (const component of components) {
    parents.push(join(parents.at(-1)!, component));
  }
  for (const parent of parents) {
    try {
      const stat = await lstat(parent);
      if (!stat.isDirectory() || stat.isSymbolicLink()) {
        throw new CodegenError('Output directories must not be symlinks');
      }
    } catch (error) {
      if ((error as { code?: string }).code !== 'ENOENT') {
        throw error;
      }
      if (create) {
        await mkdir(parent, { recursive: true });
      }
    }
  }
}
async function atomic(path: string, content: string): Promise<void> {
  const temporary = `${path}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporary, content, { flag: 'wx' });
    await rename(temporary, path);
  } catch (error) {
    await unlink(temporary).catch(() => {});
    throw error;
  }
}

export interface WriteResult {
  readonly clean: boolean;
  readonly changed: readonly string[];
  readonly removed: readonly string[];
}
/** Hash-based ownership avoids overwriting handwritten or edited generated files. --check is non-mutating. */
export async function writeGenerated(
  directory: string,
  files: readonly GeneratedFile[],
  options: { readonly check?: boolean } = {}
): Promise<WriteResult> {
  const root = resolve(directory);
  const desired: Record<string, string> = {};
  const content = new Map<string, string>();
  const names = new Set<string>();
  let size = 0;
  if (!Array.isArray(files) || files.length > 5000) {
    throw new CodegenError('Too many generated files');
  }
  for (const file of files) {
    safePath(file.path);
    if (
      typeof file.content !== 'string' ||
      file.content.length > 16_000_000 ||
      (size += file.content.length) > 64_000_000
    ) {
      throw new CodegenError('Generated output exceeds the size budget');
    }
    const lower = file.path.toLowerCase();
    if (names.has(lower)) {
      throw new CodegenError('Output paths collide on a case-insensitive filesystem');
    }
    names.add(lower);
    Object.defineProperty(desired, file.path, { enumerable: true, value: digest(file.content) });
    content.set(file.path, file.content);
  }
  for (const name of names) {
    if ([...names].some((other) => other.startsWith(`${name}/`))) {
      throw new CodegenError('A generated file cannot also be a parent directory');
    }
  }
  await directories(root, join(root, manifestName), false);
  const previousText = await read(join(root, manifestName));
  let previous: Record<string, string> = {};
  if (previousText !== undefined) {
    const parsed = JSON.parse(previousText) as { version?: unknown; files?: unknown };
    if (
      parsed.version !== 1 ||
      !parsed.files ||
      typeof parsed.files !== 'object' ||
      Array.isArray(parsed.files)
    ) {
      throw new CodegenError('Invalid generated-file manifest');
    }
    previous = parsed.files as Record<string, string>;
    for (const [path, hash] of Object.entries(previous)) {
      safePath(path);
      if (!/^[a-f0-9]{64}$/.test(hash)) {
        throw new CodegenError('Invalid ownership hash');
      }
    }
  }
  const paths = [...new Set([...Object.keys(desired), ...Object.keys(previous)])].sort();
  const changed: string[] = [];
  const removed: string[] = [];
  for (const path of paths) {
    await directories(root, join(root, path), false);
    const existing = await read(join(root, path));
    const hash = existing === undefined ? undefined : digest(existing);
    if (hash !== undefined && hash !== desired[path] && hash !== previous[path]) {
      throw new CodegenError(`Refusing to overwrite a non-owned or modified file: ${path}`);
    }
    if (Object.hasOwn(desired, path)) {
      if (hash !== desired[path]) {
        changed.push(path);
      }
    } else if (existing !== undefined) {
      removed.push(path);
    }
  }
  const next =
    JSON.stringify(
      {
        version: 1,
        files: Object.fromEntries(
          Object.keys(desired)
            .sort()
            .map((key) => [key, desired[key]])
        ),
      },
      null,
      2
    ) + '\n';
  const clean = changed.length === 0 && removed.length === 0 && previousText === next;
  if (!options.check && !clean) {
    await directories(root, join(root, manifestName), true);
    for (const path of changed) {
      await directories(root, join(root, path), true);
      await atomic(join(root, path), content.get(path)!);
      // Record each completed write so an interrupted generation can resume safely.
      previous = { ...previous, [path]: desired[path]! };
      await atomic(
        join(root, manifestName),
        JSON.stringify({ version: 1, files: previous }, null, 2) + '\n'
      );
    }
    for (const path of removed) {
      await unlink(join(root, path));
    }
    await atomic(join(root, manifestName), next);
  }
  return { clean, changed, removed };
}
/** Copy the installed canonical runtime plus its declarations and attribution, never reimplement it. */
export async function selfContainedRuntime(prefix = 'builder-runtime'): Promise<GeneratedFile[]> {
  safePath(`${prefix}/index.js`);
  const directory = dirname(fileURLToPath(import.meta.resolve('@mimlet/core')));
  const files: GeneratedFile[] = [];
  for (const name of (await readdir(directory)).sort()) {
    if (!/^[a-zA-Z0-9._-]+\.(?:js|d\.ts)$/.test(name)) {
      continue;
    }
    files.push({
      path: `${prefix}/${name}`,
      content: await readFile(join(directory, name), 'utf8'),
    });
  }
  for (const name of ['LICENSE', 'THIRD_PARTY_NOTICES.md']) {
    files.push({
      path: `${prefix}/${name}`,
      content: await readFile(join(directory, '..', name), 'utf8'),
    });
  }
  return files;
}
