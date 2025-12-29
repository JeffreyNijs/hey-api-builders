import { describe, it, expect } from 'vitest';
import { normalizeSchema, sanitizeSchema } from './schema-transformer';
import type { NormalizedSchemaNode } from '../types';

describe('schema-transformer coverage', () => {
  describe('normalizeSchema', () => {
    it('should convert array type with specific simple items into anyOf', () => {
      // Covers lines 263-271: converting type: 'array' with simple items list to anyOf
      const node: NormalizedSchemaNode = {
        type: 'array',
        items: [{ type: 'string' }, { type: 'number' }],
      } as unknown as NormalizedSchemaNode;

      const normalized = normalizeSchema(node);

      expect(normalized.anyOf).toBeDefined();
      expect(normalized.anyOf).toHaveLength(2);
      expect(normalized.type).toBeUndefined();
      expect(normalized.items).toBeUndefined();
    });

    it('should recursively normalize items when items is an array', () => {
      // Covers line 286: workingNode.items.map((it) => normalizeSchema(it))
      // The issue with the previous test was that even if we supply complex items,
      // the recursive call `normalizeSchema(workingNode.items)` at the end of the function
      // updates `workingNode.items`.
      //
      // However, if the `anyOf` transformation happens (lines 263-271), `items` is deleted!
      // So we must ensure the `anyOf` transformation does NOT happen.
      // The `anyOf` transformation requires `items` to be an array AND all items to be simple types.

      const node: NormalizedSchemaNode = {
        type: 'array',
        items: [
          {
            // no type, should bypass the check 'type' in item
            properties: { foo: { type: 'string' } },
          },
        ],
      } as unknown as NormalizedSchemaNode;

      const normalized = normalizeSchema(node);

      expect(Array.isArray(normalized.items)).toBe(true);
    });
  });

  describe('sanitizeSchema', () => {
    it('should handle enum type with array enum by converting to string type', () => {
      // Covers lines 307-308: if (workingNode.type === 'enum' && Array.isArray(workingNode.enum))
      const node: NormalizedSchemaNode = {
        type: 'enum',
        enum: ['a', 'b'],
      } as unknown as NormalizedSchemaNode;

      const sanitized = sanitizeSchema(node);

      expect(sanitized.type).toBe('string');
      // type 'enum' is deleted, and set to 'string'
    });
  });
});
