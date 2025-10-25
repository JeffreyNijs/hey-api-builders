import { describe, it, expect, vi } from 'vitest'
import type { IR } from '@hey-api/openapi-ts'
import { handler } from './handler'
import type { BuildersHandler, Plugin } from '../types'

interface SchemaEvent {
  name: string
  schema: IR.SchemaObject
}

describe('handler integration tests', () => {
  it('should generate complete output with multiple schemas', () => {
    const userSchema: IR.SchemaObject = {
      type: 'object',
      properties: {
        id: { type: 'number' },
        name: { type: 'string' },
        email: { type: 'string', format: 'email' },
      },
      required: ['id', 'name', 'email'],
    }

    const statusSchema: IR.SchemaObject = {
      type: 'string',
      enum: ['active', 'inactive', 'pending'],
    } as IR.SchemaObject

    let output = ''
    const mockFile = {
      add: vi.fn((content: string) => {
        output += content
      }),
    }

    const mockPlugin = {
      name: 'hey-api-builders',
      output: 'builders',
      config: {},
      forEach: vi.fn((type: string, callback: (event: SchemaEvent) => void) => {
        if (type === 'schema') {
          callback({ name: 'User', schema: userSchema })
          callback({ name: 'Status', schema: statusSchema })
        }
      }),
      createFile: vi.fn(() => mockFile),
    } as unknown as Plugin

    handler({ plugin: mockPlugin } as unknown as Parameters<BuildersHandler>[0])

    expect(output).toContain('import')
    expect(output).toContain('class UserBuilder')
    expect(output).toContain('class StatusBuilder')
    expect(output).toContain('schemas')
  })

  it('should generate output with Zod schemas', () => {
    const productSchema: IR.SchemaObject = {
      type: 'object',
      properties: {
        id: { type: 'number' },
        title: { type: 'string' },
        price: { type: 'number', minimum: 0 },
      },
      required: ['id', 'title', 'price'],
    }

    let output = ''
    const mockFile = {
      add: vi.fn((content: string) => {
        output += content
      }),
    }

    let zodOutput = ''
    const mockZodFile = {
      add: vi.fn((content: string) => {
        zodOutput += content
      }),
    }

    const mockPlugin = {
      name: 'hey-api-builders',
      output: 'builders',
      config: { mockStrategy: 'zod' },
      forEach: vi.fn((type: string, callback: (event: SchemaEvent) => void) => {
        if (type === 'schema') {
          callback({ name: 'Product', schema: productSchema })
        }
      }),
      createFile: vi.fn((options: { id: string }) => {
        if (options.id === 'zod') {
          return mockZodFile
        }
        return mockFile
      }),
    } as unknown as Plugin

    handler({ plugin: mockPlugin } as unknown as Parameters<BuildersHandler>[0])

    expect(output).toContain('import * as zodSchemas from "./zod.gen"')
    expect(output).toContain('class ProductBuilder')
    expect(zodOutput).toContain('export const ProductSchema = z.object')
  })

  it('should generate output with static mocks', () => {
    const itemSchema: IR.SchemaObject = {
      type: 'object',
      properties: {
        name: { type: 'string' },
        quantity: { type: 'integer', minimum: 0 },
      },
      required: ['name', 'quantity'],
    }

    let output = ''
    const mockFile = {
      add: vi.fn((content: string) => {
        output += content
      }),
    }

    const mockPlugin = {
      name: 'hey-api-builders',
      output: 'builders',
      config: { mockStrategy: 'static' },
      forEach: vi.fn((type: string, callback: (event: SchemaEvent) => void) => {
        if (type === 'schema') {
          callback({ name: 'Item', schema: itemSchema })
        }
      }),
      createFile: vi.fn(() => mockFile),
    } as unknown as Plugin

    handler({ plugin: mockPlugin } as unknown as Parameters<BuildersHandler>[0])

    expect(output).not.toContain('schemas')
    expect(output).toContain('class ItemBuilder')
  })

  it('should generate output with Zod mocks', () => {
    const orderSchema: IR.SchemaObject = {
      type: 'object',
      properties: {
        orderId: { type: 'string' },
        amount: { type: 'number' },
      },
      required: ['orderId', 'amount'],
    }

    let output = ''
    const mockFile = {
      add: vi.fn((content: string) => {
        output += content
      }),
    }

    const mockPlugin = {
      name: 'hey-api-builders',
      output: 'builders',
      config: { mockStrategy: 'zod' },
      forEach: vi.fn((type: string, callback: (event: SchemaEvent) => void) => {
        if (type === 'schema') {
          callback({ name: 'Order', schema: orderSchema })
        }
      }),
      createFile: vi.fn(() => mockFile),
    } as unknown as Plugin

    handler({ plugin: mockPlugin } as unknown as Parameters<BuildersHandler>[0])

    expect(output).toContain('generateMockFromZodSchema')
    expect(output).toContain('class OrderBuilder')
  })

  it('should support backward compatibility with useStaticMocks', () => {
    const itemSchema: IR.SchemaObject = {
      type: 'object',
      properties: {
        name: { type: 'string' },
      },
      required: ['name'],
    }

    let output = ''
    const mockFile = {
      add: vi.fn((content: string) => {
        output += content
      }),
    }

    const mockPlugin = {
      name: 'hey-api-builders',
      output: 'builders',
      config: { useStaticMocks: true },
      forEach: vi.fn((type: string, callback: (event: SchemaEvent) => void) => {
        if (type === 'schema') {
          callback({ name: 'Item', schema: itemSchema })
        }
      }),
      createFile: vi.fn(() => mockFile),
    } as unknown as Plugin

    handler({ plugin: mockPlugin } as unknown as Parameters<BuildersHandler>[0])

    expect(output).not.toContain('schemas')
    expect(output).toContain('class ItemBuilder')
  })

  it('should support backward compatibility with useZodForMocks', () => {
    const orderSchema: IR.SchemaObject = {
      type: 'object',
      properties: {
        orderId: { type: 'string' },
      },
      required: ['orderId'],
    }

    let output = ''
    const mockFile = {
      add: vi.fn((content: string) => {
        output += content
      }),
    }

    const mockPlugin = {
      name: 'hey-api-builders',
      output: 'builders',
      config: { useZodForMocks: true },
      forEach: vi.fn((type: string, callback: (event: SchemaEvent) => void) => {
        if (type === 'schema') {
          callback({ name: 'Order', schema: orderSchema })
        }
      }),
      createFile: vi.fn(() => mockFile),
    } as unknown as Plugin

    handler({ plugin: mockPlugin } as unknown as Parameters<BuildersHandler>[0])

    expect(output).toContain('generateMockFromZodSchema')
  })

  it('should handle enum schemas correctly', () => {
    const roleSchema: IR.SchemaObject = {
      type: 'string',
      enum: ['admin', 'user', 'guest'],
    } as IR.SchemaObject

    let output = ''
    const mockFile = {
      add: vi.fn((content: string) => {
        output += content
      }),
    }

    const mockPlugin = {
      name: 'hey-api-builders',
      output: 'builders',
      config: {},
      forEach: vi.fn((type: string, callback: (event: SchemaEvent) => void) => {
        if (type === 'schema') {
          callback({ name: 'Role', schema: roleSchema })
        }
      }),
      createFile: vi.fn(() => mockFile),
    } as unknown as Plugin

    handler({ plugin: mockPlugin } as unknown as Parameters<BuildersHandler>[0])

    expect(output).toContain('class RoleBuilder')
    expect(output).toContain('schemas.RoleSchema')
  })

  it('should handle empty schema collection', () => {
    let output = ''
    const mockFile = {
      add: vi.fn((content: string) => {
        output += content
      }),
    }

    const mockPlugin = {
      name: 'hey-api-builders',
      output: 'builders',
      config: {},
      forEach: vi.fn(() => {}),
      createFile: vi.fn(() => mockFile),
    } as unknown as Plugin

    handler({ plugin: mockPlugin } as unknown as Parameters<BuildersHandler>[0])

    expect(output).toContain('import')
    expect(output).toContain('schemas = {')
  })
})
