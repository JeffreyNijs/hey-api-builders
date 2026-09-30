import { fluent } from '@mimlet/core';
import { fromZodFactory } from '@mimlet/zod';
import { z } from 'zod';

const User = z.object({ name: z.string(), age: z.string().transform(Number) });
const users = fluent(
  fromZodFactory(User, (age: string) => ({ name: 'reader', age })),
  ['name', 'age']
);

export const input = users.withName('Ada').withAge('42').build('18');
export const output = users.withName('Ada').withAge('42').buildValidated('18');
// input.age is a string; output.age is a number. The original factory is not called
// while adding methods. Async transitions retain setters and remove sync build types.
export const asynchronous = await users
  .transformAsync(async (value) => value)
  .withName('Grace')
  .buildValidatedAsync('24');
