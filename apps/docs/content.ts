export const identity = {
  name: 'Mimlet',
  tagline: 'Test data, with character.',
  description: 'Typed fixtures. Coherent scenarios. Failures you can replay.',
  releaseStatus: 'Published alpha',
  releaseVersion: '0.1.0-alpha.2',
  introduction:
    'Give your tests a little life. Build fixtures that fit your schemas, keep related data connected, and bring a failing case back on cue.',
};

/** Implemented in source, but excluded from the currently published release train. */
export const previewPackages: readonly string[] = [];

export const stories = [
  {
    number: '01',
    title: 'Your schema. Its natural habitat.',
    description:
      'Keep your native types, validation and codecs. Start with a supported generator, or bring a factory for the details only you know.',
    illustration: 'schema.svg',
    link: '/guide/adapters',
    action: 'Find your adapter',
  },
  {
    number: '02',
    title: 'A whole world, connected.',
    description:
      'A customer, their order, the right total. Describe the relationships once, then build a coherent scenario for the test in front of you.',
    illustration: 'scenarios.svg',
    link: '/guide/correlated-scenarios',
    action: 'Build a scenario',
  },
  {
    number: '03',
    title: 'That failure? Bring it back.',
    description:
      'Use explicit seeds and compatible replay records to reproduce a run. Shrink the inputs and recompute the relationships as the case gets smaller.',
    illustration: 'replay.svg',
    link: '/guide/sessions-and-replay',
    action: 'Meet replay and shrinking',
  },
] as const;

export const agentBenefits = [
  [
    'Less API guesswork',
    'Typed builders and tested recipes make the intended operations explicit.',
  ],
  ['More repeatable debugging', 'Save a compatible replay record and return to the failing case.'],
  [
    'A clear path through the docs',
    'Read concise Markdown, choose an adapter, and know when to use a factory.',
  ],
] as const;

export const base = '/mimlet/';
export const hostname = 'https://jeffreynijs.github.io';
export const codeTheme = {
  light: 'github-light-high-contrast',
  dark: 'github-dark-high-contrast',
} as const;
