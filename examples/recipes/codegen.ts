import { emitBuilders } from '@mimlet/codegen';

// Generation records the application import; it does not execute the module.
export const files = emitBuilders([
  {
    name: 'UserBuilder',
    source: { kind: 'factory', module: '../users.js', export: 'makeUser' },
    fields: ['id', 'role'],
  },
]);
// files[0] contains a fluent UserBuilder with withId and withRole methods.
