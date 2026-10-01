import { fluent } from '@mimlet/core';
import { fromZod } from '@mimlet/zod';
import { z } from 'zod';

const User = z.object({ name: z.string(), age: z.string().transform(Number) });
const users = fluent(fromZod(User), ['name', 'age']);

export const input = users.withName('Ada').withAge('42').build();
export const output = users.withName('Ada').withAge('42').buildValidated();
// input.age is a string; output.age is a number. No builder file is generated.
// Async transitions retain setters and remove synchronous build methods.
export const asynchronous = await users
  .transformAsync(async (value) => value)
  .withName('Grace')
  .withAge('24')
  .buildValidatedAsync();
