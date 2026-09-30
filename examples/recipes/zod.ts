import { z } from 'zod';
import { fromZod } from '@mimlet/zod';

const User = z.object({
  name: z.string(),
  age: z.string().transform(Number),
});

const users = fromZod(User).with({ name: 'Ada', age: '42' });
export const input = users.build(); // age: string
export const user = users.buildValidated(); // age: number
