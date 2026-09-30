import Type from 'typebox';
import { fromTypeBox } from '@mimlet/typebox';

const User = Type.Object({
  id: Type.String({ default: 'user-1' }),
  role: Type.Union([
    Type.Literal('reader'),
    Type.Literal('admin'),
  ]),
});

export const admin = fromTypeBox(User)
  .with({ role: 'admin' })
  .buildValidated();
