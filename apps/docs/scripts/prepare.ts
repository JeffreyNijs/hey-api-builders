/** Generate HTML input and agent-readable output from the same canonical Markdown and recipes. */
import { cp, mkdir, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createMarkdownRenderer } from 'vitepress';
import { agentBenefits, base, codeTheme, identity, stories } from '../content.ts';

export const root = fileURLToPath(new URL('../../../', import.meta.url));
const generated = resolve(root, 'apps/docs/.generated');
const repository =
  process.env.GITHUB_REPOSITORY === 'JeffreyNijs/mimlet'
    ? 'JeffreyNijs/mimlet'
    : 'JeffreyNijs/hey-api-builders';
const ref = process.env.DOCS_SOURCE_REF ?? 'codex/mimlet-brand-and-docs';
const sourceUrl = `https://github.com/${repository}/blob/${encodeURIComponent(ref)}/`;
const read = (file: string) => readFile(resolve(root, file), 'utf8');

async function writeChanged(path: string, content: string): Promise<void> {
  if (
    await readFile(path, 'utf8').then(
      (value) => value === content,
      () => false
    )
  ) {
    return;
  }
  const temporary = `${path}.${randomUUID()}.tmp`;
  await writeFile(temporary, content);
  await rename(temporary, path);
}

export async function prepare(): Promise<void> {
  const documents = new Map<string, string>();
  for (const file of (await readdir(resolve(root, 'docs')))
    .filter((file) => file.endsWith('.md'))
    .sort()) {
    documents.set(`docs/${file}`, `guide/${file}`);
  }
  const packages: { name: string; directory: string }[] = [];
  for (const directory of (await readdir(resolve(root, 'packages'))).sort()) {
    const manifest = JSON.parse(await read(`packages/${directory}/package.json`)) as {
      name: string;
    };
    packages.push({ name: manifest.name, directory });
    documents.set(`packages/${directory}/README.md`, `packages/${directory}.md`);
  }
  const { version } = JSON.parse(await read('packages/core/package.json')) as { version: string };
  const link = (href: string, file: string, markdown: boolean): string => {
    if (/^(?:https?:|mailto:|#|\/\/)/.test(href)) {
      return href.replace(
        'https://github.com/JeffreyNijs/mimlet',
        `https://github.com/${repository}`
      );
    }
    const [target = '', anchor = ''] = href.split('#');
    const resolved = relative(
      root,
      resolve(dirname(resolve(root, file)), decodeURIComponent(target))
    ).replaceAll('\\', '/');
    const route = documents.get(resolved);
    if (route) {
      return `${markdown ? base : '/'}${route.replace(/\.md$/, markdown ? '.md' : '.html')}${anchor ? `#${anchor}` : ''}`;
    }
    if (resolved === 'README.md') {
      return markdown ? `${base}index.md` : '/';
    }
    return `${sourceUrl}${resolved}${anchor ? `#${anchor}` : ''}`;
  };
  const rewriteLinks = (content: string, file: string, markdown: boolean) => {
    // Leave code fences intact; URLs in runnable examples are data, not navigation.
    return content
      .split(/(^```[^\n]*\n[\s\S]*?^```\s*$)/m)
      .map((part, i) =>
        i % 2
          ? part
          : part
              .replace(
                /(\]\()([^\s)]+)(\))/g,
                (_, open: string, href: string, close: string) =>
                  `${open}${link(href, file, markdown)}${close}`
              )
              .replace(
                /^(\[[^\]\n]+\]:\s*)(\S+)/gm,
                (_, prefix: string, href: string) => `${prefix}${link(href, file, markdown)}`
              )
      )
      .join('');
  };
  const expandRecipes = async (source: string) => {
    for (const match of source.matchAll(/<!-- recipe:([a-z-]+) -->/g)) {
      const snippet = await read(`examples/recipes/${match[1]}.ts`);
      source = source.replace(match[0], `\`\`\`ts\n${snippet.trim()}\n\`\`\``);
    }
    return source;
  };
  await mkdir(resolve(generated, 'public'), { recursive: true });
  const previous = await readFile(resolve(generated, 'site-manifest.json'), 'utf8').then(
    (text) => JSON.parse(text) as { pages: string[] },
    () => ({ pages: [] })
  );
  for (const route of previous.pages) {
    if (
      /^(guide|packages)\/[a-z0-9-]+\.md$/.test(route) &&
      ![...documents.values()].includes(route)
    ) {
      await rm(resolve(generated, route), { force: true });
      await rm(resolve(generated, 'public', route), { force: true });
    }
  }
  await cp(resolve(root, 'assets/brand'), resolve(generated, 'public/brand'), { recursive: true });
  for (const [file, route] of documents) {
    const source = await expandRecipes(await read(file));
    for (const markdown of [false, true]) {
      const destination = resolve(generated, markdown ? 'public' : '', route);
      await mkdir(dirname(destination), { recursive: true });
      await writeChanged(destination, rewriteLinks(source, file, markdown));
    }
  }
  const hero = await read('examples/recipes/hero.ts');
  const renderer = await createMarkdownRenderer(root, { theme: codeTheme });
  await writeChanged(
    resolve(generated, 'hero.ts'),
    `// Generated from the packed-consumer recipe.\nexport const heroHtml = ${JSON.stringify(renderer.render(`\`\`\`ts\n${hero}\n\`\`\``))};\nexport const preparedVersion = ${JSON.stringify(version)};\n`
  );
  await writeChanged(
    resolve(generated, 'index.md'),
    `---\nlayout: page\nsidebar: false\ntitle: ${identity.name} — ${identity.tagline}\ndescription: ${identity.description}\n---\n\n<MimletHome />\n`
  );
  const overview =
    `# ${identity.name}\n\n${identity.tagline}\n\n${identity.description}\n\n${identity.introduction}\n\nStatus: source preview, prepared alpha ${version}. New npm names are unpublished.\n\n[Get started](${base}guide/getting-started.md) · [Choose an adapter](${base}guide/adapters.md)\n\n` +
    stories
      .map(
        (story) =>
          `## ${story.title}\n\n${story.description}\n\n[${story.action}](${base}${story.link.slice(1)}.md)\n`
      )
      .join('\n') +
    `\n## For coding agents\n\n` +
    agentBenefits.map(([title, description]) => `- ${title}: ${description}`).join('\n') +
    `\n\n[Agent guide](${base}guide/agents.md)\n\n## A working example\n\n\`\`\`ts\n${hero}\n\`\`\`\n`;
  await writeChanged(resolve(generated, 'public/index.md'), overview);
  const guides = [
    ['Getting started', 'getting-started', 'Source-preview setup and an executable first fixture'],
    [
      'Adapter selection',
      'adapters',
      'Native semantics, supported generation and factory escape hatches',
    ],
    [
      'Coding agents',
      'agents',
      'Task recipes, validation, replay, shrinking and deterministic code generation',
    ],
    ['Scenarios', 'correlated-scenarios', 'Shared identities and recomputed dependent values'],
    [
      'Replay',
      'sessions-and-replay',
      'Explicit seeds, compatibility identities and bounded sessions',
    ],
    ['Migration', 'mimlet-migration', 'New package names and preserved serialized formats'],
    ['Compatibility', 'compatibility', 'Tested versions and runtime boundaries'],
  ];
  await writeChanged(
    resolve(generated, 'public/llms.txt'),
    `# Mimlet\n\n> ${identity.description} A modular schema-aware test-data toolkit with a dependency-free core.\n\nSource preview: prepared ${version}; new npm names are not published. Use the source setup in Getting started. Generation is capability-specific; arbitrary validators may require a factory.\n\n## Guides\n\n` +
      guides
        .map(
          ([title, slug, description]) => `- [${title}](${base}guide/${slug}.md): ${description}`
        )
        .join('\n') +
      `\n\n## Packages\n\n` +
      packages
        .map(({ name, directory }) => `- [${name}](${base}packages/${directory}.md)`)
        .join('\n') +
      `\n\n## Optional\n\n- [Mimlet skill](${sourceUrl}skills/mimlet/SKILL.md): Optional agent usage guide; install only when requested.\n`
  );
  await writeChanged(
    resolve(generated, 'site-manifest.json'),
    JSON.stringify(
      {
        pages: ['index.md', ...documents.values()],
        packages: packages.map((p) => p.name),
        version,
        sourceUrl,
      },
      null,
      2
    )
  );
  console.log(
    `Prepared ${documents.size + 1} pages, Markdown alternates and llms.txt from canonical sources.`
  );
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await prepare();
}
