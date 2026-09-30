import { type } from 'arktype';
import { fromArkType } from '@mimlet/arktype';

const User = type({ name: 'string', age: 'string' }).pipe(({ name, age }) => ({
  name,
  age: Number(age),
}));

const users = fromArkType(User).with({ name: 'Ada', age: '42' });
export const input = users.build(); // age: string
export const user = users.buildValidated(); // age: number
