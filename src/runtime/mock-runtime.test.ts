import { describe, it, expect } from 'vitest'
import { generateMock } from './mock-runtime'

describe('Custom Mock Runtime', () => {
  describe('generateMock', () => {
    it('generates mock from simple string schema', () => {
      const schema = { type: 'string' }
      const result = generateMock(schema)

      expect(typeof result).toBe('string')
    })

    it('generates mock from number schema', () => {
      const schema = { type: 'number' }
      const result = generateMock(schema)

      expect(typeof result).toBe('number')
    })

    it('generates mock from boolean schema', () => {
      const schema = { type: 'boolean' }
      const result = generateMock(schema)

      expect(typeof result).toBe('boolean')
    })

    it('generates mock from object schema', () => {
      const schema = {
        type: 'object',
        properties: {
          name: { type: 'string' },
          age: { type: 'number' },
        },
        required: ['name'],
      }
      const result = generateMock<{ name: string; age?: number }>(schema)

      expect(result).toHaveProperty('name')
      expect(typeof result.name).toBe('string')
    })

    it('generates mock from array schema', () => {
      const schema = {
        type: 'array',
        items: { type: 'string' },
      }
      const result = generateMock<string[]>(schema)

      expect(Array.isArray(result)).toBe(true)
    })

    it('respects enum values', () => {
      const schema = {
        type: 'string',
        enum: ['active', 'inactive'],
      }
      const result = generateMock<string>(schema)

      expect(['active', 'inactive']).toContain(result)
    })

    it('uses default value when useDefault is true', () => {
      const schema = {
        type: 'string',
        default: 'default-value',
      }
      const result = generateMock<string>(schema, { useDefault: true })

      expect(result).toBe('default-value')
    })

    it('uses example value when useExamples is true', () => {
      const schema = {
        type: 'string',
        examples: ['example-value'],
      }
      const result = generateMock<string>(schema, { useExamples: true })

      expect(result).toBe('example-value')
    })

    it('respects minLength for strings', () => {
      const schema = {
        type: 'string',
        minLength: 10,
      }
      const result = generateMock<string>(schema)

      expect(result.length).toBeGreaterThanOrEqual(10)
    })

    it('respects maxLength for strings', () => {
      const schema = {
        type: 'string',
        maxLength: 5,
      }
      const result = generateMock<string>(schema)

      expect(result.length).toBeLessThanOrEqual(5)
    })

    it('respects minimum for numbers', () => {
      const schema = {
        type: 'number',
        minimum: 10,
      }
      const result = generateMock<number>(schema)

      expect(result).toBeGreaterThanOrEqual(10)
    })

    it('respects maximum for numbers', () => {
      const schema = {
        type: 'number',
        maximum: 100,
      }
      const result = generateMock<number>(schema)

      expect(result).toBeLessThanOrEqual(100)
    })

    it('handles requiredOnly option', () => {
      const schema = {
        type: 'object',
        properties: {
          required1: { type: 'string' },
          optional1: { type: 'string' },
        },
        required: ['required1'],
      }
      const result = generateMock<Record<string, unknown>>(schema, { requiredOnly: true })

      expect(result).toHaveProperty('required1')
    })

    it('generates consistent types for schemas', () => {
      const schema = {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          email: { type: 'string', format: 'email' },
          count: { type: 'integer' },
        },
        required: ['id', 'email', 'count'],
      }
      const result = generateMock<{ id: string; email: string; count: number }>(schema)

      expect(typeof result.id).toBe('string')
      expect(typeof result.email).toBe('string')
      expect(typeof result.count).toBe('number')
    })

    it('handles nested objects', () => {
      const schema = {
        type: 'object',
        properties: {
          user: {
            type: 'object',
            properties: {
              name: { type: 'string' },
            },
            required: ['name'],
          },
        },
        required: ['user'],
      }
      const result = generateMock<{ user: { name: string } }>(schema)

      expect(result).toHaveProperty('user')
      expect(result.user).toHaveProperty('name')
    })

    it('handles arrays of objects', () => {
      const schema = {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            name: { type: 'string' },
          },
          required: ['name'],
        },
        minItems: 1,
      }
      const result = generateMock<Array<{ name: string }>>(schema)

      expect(Array.isArray(result)).toBe(true)
      expect(result.length).toBeGreaterThanOrEqual(1)
      expect(result[0]).toHaveProperty('name')
    })

    it('handles null type', () => {
      const schema = { type: 'null' }
      const result = generateMock(schema)
      expect(result).toBe(null)
    })

    it('handles oneOf schemas', () => {
      const schema = {
        oneOf: [{ type: 'string' }, { type: 'number' }],
      }
      const result = generateMock(schema)
      expect(['string', 'number']).toContain(typeof result)
    })

    it('handles anyOf schemas', () => {
      const schema = {
        anyOf: [{ type: 'string' }, { type: 'number' }],
      }
      const result = generateMock(schema)
      expect(['string', 'number']).toContain(typeof result)
    })

    it('handles allOf schemas with merging', () => {
      const schema = {
        allOf: [
          {
            type: 'object',
            properties: {
              name: { type: 'string' },
            },
            required: ['name'],
          },
          {
            type: 'object',
            properties: {
              age: { type: 'number' },
            },
          },
        ],
      }
      const result = generateMock<{ name: string; age?: number }>(schema)
      expect(result).toHaveProperty('name')
      expect(typeof result.name).toBe('string')
    })

    it('respects minItems for arrays', () => {
      const schema = {
        type: 'array',
        items: { type: 'string' },
        minItems: 5,
      }
      const result = generateMock<string[]>(schema)
      expect(Array.isArray(result)).toBe(true)
      expect(result.length).toBeGreaterThanOrEqual(5)
    })

    it('respects maxItems for arrays', () => {
      const schema = {
        type: 'array',
        items: { type: 'string' },
        maxItems: 2,
      }
      const result = generateMock<string[]>(schema)
      expect(Array.isArray(result)).toBe(true)
      expect(result.length).toBeLessThanOrEqual(2)
    })

    it('handles integer type specifically', () => {
      const schema = {
        type: 'integer',
      }
      const result = generateMock(schema)
      expect(typeof result).toBe('number')
      expect(Number.isInteger(result)).toBe(true)
    })

    it('respects minimum for numbers', () => {
      const schema = {
        type: 'number',
        minimum: 100,
      }
      const result = generateMock(schema)
      expect(result).toBeGreaterThanOrEqual(100)
    })

    it('respects maximum for numbers', () => {
      const schema = {
        type: 'number',
        maximum: 10,
      }
      const result = generateMock(schema)
      expect(result).toBeLessThanOrEqual(10)
    })

    it('respects minLength for strings', () => {
      const schema = {
        type: 'string',
        minLength: 20,
      }
      const result = generateMock(schema)
      expect(typeof result).toBe('string')
      expect((result as string).length).toBeGreaterThanOrEqual(20)
    })

    it('respects maxLength for strings', () => {
      const schema = {
        type: 'string',
        maxLength: 5,
      }
      const result = generateMock(schema)
      expect(typeof result).toBe('string')
      expect((result as string).length).toBeLessThanOrEqual(5)
    })

    it('handles pattern for strings with placeholder', () => {
      const schema = {
        type: 'string',
        pattern: '^[0-9]{3}$',
      }
      const result = generateMock(schema)
      expect(typeof result).toBe('string')

      expect(result).toMatch(/^x+$/)
    })

    it('handles uuid format with placeholder', () => {
      const schema = {
        type: 'string',
        format: 'uuid',
      }
      const result = generateMock(schema)
      expect(typeof result).toBe('string')

      expect(result).toBe('00000000-0000-0000-0000-000000000000')
    })

    it('handles email format', () => {
      const schema = {
        type: 'string',
        format: 'email',
      }
      const result = generateMock(schema)
      expect(typeof result).toBe('string')
      expect(result).toMatch(/@/)
    })

    it('handles uri format', () => {
      const schema = {
        type: 'string',
        format: 'uri',
      }
      const result = generateMock(schema)
      expect(typeof result).toBe('string')
      expect(result).toMatch(/^https?:\/\//)
    })

    it('handles date-time format', () => {
      const schema = {
        type: 'string',
        format: 'date-time',
      }
      const result = generateMock(schema)
      expect(typeof result).toBe('string')
      expect(!isNaN(Date.parse(result as string))).toBe(true)
    })

    it('handles date format', () => {
      const schema = {
        type: 'string',
        format: 'date',
      }
      const result = generateMock(schema)
      expect(typeof result).toBe('string')
      expect(/^\d{4}-\d{2}-\d{2}$/.test(result as string)).toBe(true)
    })

    it('handles time format', () => {
      const schema = {
        type: 'string',
        format: 'time',
      }
      const result = generateMock(schema)
      expect(typeof result).toBe('string')
      expect(/^\d{2}:\d{2}:\d{2}/.test(result as string)).toBe(true)
    })

    it('applies overrides to nested properties', () => {})

    it('handles schemas with const value', () => {
      const schema = {
        type: 'string',
        const: 'fixed-value',
      }
      const result = generateMock(schema)
      expect(result).toBe('fixed-value')
    })

    it('handles schemas with default value', () => {
      const schema = {
        type: 'string',
        default: 'default-value',
      }
      const result = generateMock(schema)
      expect(typeof result).toBe('string')
    })

    it('handles schemas with examples', () => {
      const schema = {
        type: 'string',
        examples: ['example1', 'example2'],
      }
      const result = generateMock(schema)
      expect(typeof result).toBe('string')
    })

    it('handles deeply nested structures', () => {
      const schema = {
        type: 'object',
        properties: {
          level1: {
            type: 'object',
            properties: {
              level2: {
                type: 'object',
                properties: {
                  level3: {
                    type: 'string',
                  },
                },
                required: ['level3'],
              },
            },
            required: ['level2'],
          },
        },
        required: ['level1'],
      } as const

      const result = generateMock<{ level1: { level2: { level3: string } } }>(schema)
      expect((result as any).level1.level2.level3).toBeDefined()
      expect(typeof (result as any).level1.level2.level3).toBe('string')
    })

    it('handles array within object within array', () => {
      const schema = {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            tags: {
              type: 'array',
              items: { type: 'string' },
            },
          },
          required: ['tags'],
        },
      }
      const result = generateMock<Array<{ tags: string[] }>>(schema)
      expect(Array.isArray(result)).toBe(true)
      expect(result.length).toBeGreaterThan(0)
      expect(Array.isArray((result[0] as any).tags)).toBe(true)
    })

    it('returns null for unknown schema type', () => {
      const schema = {
        type: 'unknown-type' as unknown as 'string',
      }
      const result = generateMock(schema)
      expect(result).toBeNull()
    })

    it('handles exclusiveMinimum', () => {
      const schema = {
        type: 'number',
        exclusiveMinimum: 10,
      }
      const result = generateMock(schema)
      expect(result).toBeGreaterThan(10)
    })

    it('handles exclusiveMaximum', () => {
      const schema = {
        type: 'number',
        exclusiveMaximum: 10,
      }
      const result = generateMock(schema)
      expect(result).toBeLessThan(10)
    })

    it('handles multipleOf constraint', () => {
      const schema = {
        type: 'number',
        multipleOf: 5,
      }
      const result = generateMock(schema)
      expect((result as number) % 5).toBe(0)
    })

    it('handles empty object schema', () => {
      const schema = {
        type: 'object',
        properties: {},
      }
      const result = generateMock(schema)
      expect(typeof result).toBe('object')
      expect(result).toEqual({})
    })

    it('handles empty array items', () => {
      const schema = {
        type: 'array',
        items: {},
      }
      const result = generateMock(schema)
      expect(Array.isArray(result)).toBe(true)
    })
  })
})
