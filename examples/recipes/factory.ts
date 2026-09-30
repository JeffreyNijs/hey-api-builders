import Type from 'typebox';
import { fromTypeBoxFactory } from '@mimlet/typebox';

const Code = Type.String({ pattern: '^APP-[0-9]+$' });
const codes = fromTypeBoxFactory(Code, (index: number) => `APP-${index}`);

export const code = codes.buildValidated(42); // 'APP-42'
