import {
  emitBuilders,
  emitJsonSchemaBuilders,
  writeGenerated,
  selfContainedRuntime,
} from '@jeffreynijs/test-builders-codegen';
const modules = emitBuilders([
  {
    name: 'Users',
    source: { kind: 'factory', module: './models.js', export: 'users' },
    fields: ['id'],
  },
]);
const schemas = await emitJsonSchemaBuilders([
  {
    name: 'Users',
    schema: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] },
  },
]);
await writeGenerated('./generated', [...modules, ...schemas], { check: true });
await selfContainedRuntime();
// @ts-expect-error Unknown source kinds are not implicit executable plugins.
emitBuilders([{ name: 'Bad', source: { kind: 'eval', module: './x.js', export: 'X' } }]);
emitJsonSchemaBuilders([
  // @ts-expect-error A raw-schema target cannot serialize executable callbacks.
  { name: 'Bad', schema: true, options: { provider: { id: 'x', generate: () => 1 } } },
]);
