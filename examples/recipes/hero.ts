import Type from 'typebox';
import { fluent } from '@mimlet/core';
import { fromTypeBox } from '@mimlet/typebox';

const User = Type.Object({
  id: Type.String({ default: 'user-1' }),
  role: Type.Union([
    Type.Literal('reader'),
    Type.Literal('admin'),
  ]),
});

const users = fluent(fromTypeBox(User), ['id', 'role']);
export const admin = users.withRole('admin').buildValidated();
