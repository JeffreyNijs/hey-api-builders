import { $, applyNaming, toCase } from '@hey-api/openapi-ts';
import type { IR } from '@hey-api/openapi-ts';

import type { BuildersPlugin, Config } from './types';

type PluginInstance = BuildersPlugin['Instance'];
type SymbolRef = NonNullable<ReturnType<PluginInstance['querySymbol']>>;

export interface RuntimeSymbols {
  builderOptions: SymbolRef;
  builderPatch: SymbolRef;
  builderTransform: SymbolRef;
  mergeBuilderPatch: SymbolRef;
  mergeBuilderPatches: SymbolRef;
}

interface BuilderTarget {
  anchor: string;
  factorySymbol: SymbolRef;
  modelSymbol: SymbolRef;
  naming: Config['definitions'];
  properties?: ReadonlyArray<string>;
  resource: 'definition' | 'operation';
  resourceId: string;
  role?: 'request' | 'response';
  statusCode?: string;
}

/** Emit the small shared runtime used by every generated builder class. */
export function emitRuntime(plugin: PluginInstance): RuntimeSymbols {
  const builderOptions = plugin.symbol('BuilderOptions', {
    kind: 'type',
    meta: {
      category: 'utility',
      resource: 'builder',
    },
  });
  const callableType = $.type
    .func()
    .param('_argument', (parameter) => parameter.optional().type('never'))
    .returns('unknown');
  const parametersType = () => $.type('Parameters').generic('TFactory');
  const optionsType = $.type
    .ternary(parametersType())
    .extends($.type.tuple())
    .do('undefined')
    .otherwise(parametersType().idx(0));
  plugin.node(
    $.type
      .alias(builderOptions)
      .export()
      .generic('TFactory', (parameter) => parameter.extends(callableType))
      .type(optionsType)
  );

  const builderPatch = plugin.symbol('BuilderPatch', {
    kind: 'type',
    meta: {
      category: 'utility',
      resource: 'builder',
    },
  });
  const objectPatch = $.type
    .ternary('T')
    .extends('object')
    .do($.type('Partial').generic('T'))
    .otherwise('T');
  const patchType = $.type
    .ternary('T')
    .extends($.type('ReadonlyArray').generic('unknown'))
    .do('T')
    .otherwise(objectPatch);
  plugin.node($.type.alias(builderPatch).export().generic('T').type(patchType));

  const builderTransform = plugin.symbol('BuilderTransform', {
    kind: 'type',
    meta: {
      category: 'utility',
      resource: 'builder',
    },
  });
  const transformType = $.type
    .func()
    .param('value', (parameter) => parameter.type('T'))
    .returns('T');
  plugin.node($.type.alias(builderTransform).export().generic('T').type(transformType));

  const mergeBuilderPatch = plugin.symbol('mergeBuilderPatch', {
    kind: 'function',
    meta: {
      category: 'utility',
      resource: 'builder',
    },
  });
  const valueIsObject = $.typeofExpr('value').eq($.literal('object'));
  const valueIsPresent = $('value').neq($.literal(null));
  const valueIsNotArray = $.not($('Array').attr('isArray').call('value'));
  const patchIsObject = $.typeofExpr('patch').eq($.literal('object'));
  const patchIsPresent = $('patch').neq($.literal(null));
  const patchIsNotArray = $.not($('Array').attr('isArray').call('patch'));
  const canMerge = $.binary(
    $.binary(
      $.binary(
        $.binary($.binary(valueIsObject, '&&', valueIsPresent), '&&', valueIsNotArray),
        '&&',
        patchIsObject
      ),
      '&&',
      patchIsPresent
    ),
    '&&',
    patchIsNotArray
  );
  const mergeFunction = $.func(mergeBuilderPatch)
    .decl()
    .generic('T')
    .param('value', (parameter) => parameter.type('T'))
    .param('patch', (parameter) => parameter.type($.type(builderPatch).generic('T')))
    .returns('T')
    .do(
      $.if(canMerge).do($.return($.object().spread('value').spread('patch').as('T'))),
      $.return($('patch').as('T'))
    );
  plugin.node(mergeFunction);

  const mergeBuilderPatches = plugin.symbol('mergeBuilderPatches', {
    kind: 'function',
    meta: {
      category: 'utility',
      resource: 'builder',
    },
  });
  const leftIsObject = $.typeofExpr('left').eq($.literal('object'));
  const leftIsPresent = $('left').neq($.literal(null));
  const leftIsNotArray = $.not($('Array').attr('isArray').call('left'));
  const rightIsObject = $.typeofExpr('right').eq($.literal('object'));
  const rightIsPresent = $('right').neq($.literal(null));
  const rightIsNotArray = $.not($('Array').attr('isArray').call('right'));
  const patchesCanMerge = $.binary(
    $.binary(
      $.binary(
        $.binary($.binary(leftIsObject, '&&', leftIsPresent), '&&', leftIsNotArray),
        '&&',
        rightIsObject
      ),
      '&&',
      rightIsPresent
    ),
    '&&',
    rightIsNotArray
  );
  const mergePatchesFunction = $.func(mergeBuilderPatches)
    .decl()
    .generic('T')
    .param('left', (parameter) => parameter.type($.type(builderPatch).generic('T')))
    .param('right', (parameter) => parameter.type($.type(builderPatch).generic('T')))
    .returns($.type(builderPatch).generic('T'))
    .do(
      $.if(patchesCanMerge).do(
        $.return($.object().spread('left').spread('right').as($.type(builderPatch).generic('T')))
      ),
      $.return('right')
    );
  plugin.node(mergePatchesFunction);

  return {
    builderOptions,
    builderPatch,
    builderTransform,
    mergeBuilderPatch,
    mergeBuilderPatches,
  };
}

/** Emit a builder for a reusable OpenAPI schema. */
export function emitDefinitionBuilder({
  event,
  naming,
  plugin,
  runtime,
}: {
  event: {
    name: string;
    pointer: string;
    schema: IR.SchemaObject;
  };
  naming: Config['definitions'];
  plugin: PluginInstance;
  runtime: RuntimeSymbols;
}): void {
  const factorySymbol = plugin.querySymbol({
    artifact: '@faker-js/faker',
    category: 'schema',
    resource: 'definition',
    resourceId: event.pointer,
  });
  const modelSymbol = plugin.querySymbol({
    artifact: 'types',
    category: 'type',
    resource: 'definition',
    resourceId: event.pointer,
  });

  if (!factorySymbol || !modelSymbol) {
    return;
  }

  emitBuilder({
    plugin,
    runtime,
    target: {
      anchor: event.name,
      factorySymbol,
      modelSymbol,
      naming,
      properties: Object.keys(event.schema.properties ?? {}),
      resource: 'definition',
      resourceId: event.pointer,
    },
  });
}

/** Emit request and response builders from the factories produced by Faker. */
export function emitOperationBuilders({
  operation,
  plugin,
  requests,
  responses,
  runtime,
}: {
  operation: IR.OperationObject;
  plugin: PluginInstance;
  requests: Config['requests'];
  responses: Config['responses'];
  runtime: RuntimeSymbols;
}): void {
  if (requests.enabled) {
    const requestFactory = plugin.querySymbol({
      artifact: '@faker-js/faker',
      category: 'schema',
      resource: 'operation',
      resourceId: operation.id,
      role: 'request',
    });

    if (requestFactory) {
      const requestModel = emitFactoryReturnType({
        anchor: `${operation.id}Request`,
        factorySymbol: requestFactory,
        plugin,
        resourceId: operation.id,
        role: 'request',
      });
      emitBuilder({
        plugin,
        runtime,
        target: {
          anchor: `${operation.id}Request`,
          factorySymbol: requestFactory,
          modelSymbol: requestModel,
          naming: requests,
          properties: collectRequestProperties(operation),
          resource: 'operation',
          resourceId: operation.id,
          role: 'request',
        },
      });
    }
  }

  if (!responses.enabled) {
    return;
  }

  const responseFactories = plugin.symbolFactory.queryAll({
    artifact: '@faker-js/faker',
    category: 'schema',
    resource: 'operation',
    resourceId: operation.id,
    role: 'response',
  });

  responseFactories.forEach((factorySymbol, index) => {
    const rawStatusCode = factorySymbol.meta?.statusCode;
    const statusCode =
      typeof rawStatusCode === 'string' || typeof rawStatusCode === 'number'
        ? String(rawStatusCode)
        : undefined;
    const suffix = statusCode ?? String(index + 1);
    const anchor = `${operation.id}Response${suffix}`;
    const responseModel = emitFactoryReturnType({
      anchor,
      factorySymbol,
      plugin,
      resourceId: operation.id,
      role: 'response',
      statusCode,
    });
    emitBuilder({
      plugin,
      runtime,
      target: {
        anchor,
        factorySymbol,
        modelSymbol: responseModel,
        naming: responses,
        properties: collectResponseProperties({
          operation,
          plugin,
          statusCode,
        }),
        resource: 'operation',
        resourceId: operation.id,
        role: 'response',
        statusCode,
      },
    });
  });
}

function collectResponseProperties({
  operation,
  plugin,
  statusCode,
}: {
  operation: IR.OperationObject;
  plugin: PluginInstance;
  statusCode?: string;
}): ReadonlyArray<string> {
  if (!statusCode) {
    return [];
  }
  const schema = operation.responses?.[statusCode]?.schema;
  return schema ? collectSchemaProperties(schema, plugin, new Set()) : [];
}

function collectSchemaProperties(
  schema: IR.SchemaObject,
  plugin: PluginInstance,
  seen: Set<string>
): ReadonlyArray<string> {
  // The IR also stores array and tuple element schemas in `items`. Those
  // elements are not properties of the response value itself.
  if (schema.type === 'array' || schema.type === 'tuple') {
    return [];
  }

  if (schema.properties) {
    return Object.keys(schema.properties);
  }

  if (schema.$ref && !seen.has(schema.$ref)) {
    seen.add(schema.$ref);
    const referenced = plugin.context.resolveIrRef<IR.SchemaObject>(schema.$ref);
    return collectSchemaProperties(referenced, plugin, seen);
  }

  if (!schema.logicalOperator || !schema.items?.length) {
    return [];
  }

  const childProperties = schema.items.map((item) =>
    collectSchemaProperties(item, plugin, new Set(seen))
  );
  if (schema.logicalOperator === 'and') {
    return [...new Set(childProperties.flat())];
  }

  const [first = [], ...rest] = childProperties;
  return first.filter((property) => rest.every((properties) => properties.includes(property)));
}

function collectRequestProperties(operation: IR.OperationObject): ReadonlyArray<string> {
  const properties: Array<string> = [];
  if (operation.body) {
    properties.push('body');
  }
  if (operation.parameters?.header && Object.keys(operation.parameters.header).length > 0) {
    properties.push('headers');
  }
  if (operation.parameters?.path && Object.keys(operation.parameters.path).length > 0) {
    properties.push('path');
  }
  if (operation.parameters?.query && Object.keys(operation.parameters.query).length > 0) {
    properties.push('query');
  }
  return properties;
}

function emitFactoryReturnType({
  anchor,
  factorySymbol,
  plugin,
  resourceId,
  role,
  statusCode,
}: {
  anchor: string;
  factorySymbol: SymbolRef;
  plugin: PluginInstance;
  resourceId: string;
  role: 'request' | 'response';
  statusCode?: string;
}): SymbolRef {
  const symbol = plugin.symbol(`${toCase(anchor, 'PascalCase')}BuilderValue`, {
    kind: 'type',
    meta: {
      category: 'builder-value',
      resource: 'operation',
      resourceId,
      role,
      ...(statusCode ? { statusCode } : {}),
    },
  });
  const returnType = $.type('ReturnType').generic($(factorySymbol).typeofType());
  plugin.node($.type.alias(symbol).type(returnType));
  return symbol;
}

function emitBuilder({
  plugin,
  runtime,
  target,
}: {
  plugin: PluginInstance;
  runtime: RuntimeSymbols;
  target: BuilderTarget;
}): void {
  const className = applyNaming(target.anchor, target.naming);
  const builderSymbol = plugin.symbol(className, {
    kind: 'class',
    meta: {
      category: 'builder',
      resource: target.resource,
      resourceId: target.resourceId,
      ...(target.role ? { role: target.role } : {}),
      ...(target.statusCode ? { statusCode: target.statusCode } : {}),
    },
  });
  const patchType = () => $.type(runtime.builderPatch).generic(target.modelSymbol);
  const transformType = () => $.type(runtime.builderTransform).generic(target.modelSymbol);
  const optionsType = () =>
    $.type(runtime.builderOptions).generic($(target.factorySymbol).typeofType());
  const callableFactoryType = () =>
    $.type
      .func()
      .param('options', (parameter) => parameter.optional().type(optionsType()))
      .returns(target.modelSymbol);

  const classNode = $.class(builderSymbol)
    .export()
    .field('patch', (field) => field.private().optional().type(patchType()))
    .field('hasPatch', (field) => field.private().type('boolean'))
    .field('transforms', (field) =>
      field.private().type($.type('ReadonlyArray').generic(transformType()))
    )
    .newline()
    .init((constructor) =>
      constructor
        .param('initial', (parameter) => parameter.optional().type(patchType()))
        .do(
          $('this').attr('patch').assign('initial'),
          $('this')
            .attr('hasPatch')
            .assign($.typeofExpr('initial').neq($.literal('undefined'))),
          $('this').attr('transforms').assign($.array())
        )
    )
    .newline()
    .method('create', (method) =>
      method
        .private()
        .static()
        .param('patch', (parameter) => parameter.type($.type.or(patchType(), 'undefined')))
        .param('hasPatch', (parameter) => parameter.type('boolean'))
        .param('transforms', (parameter) =>
          parameter.type($.type('ReadonlyArray').generic(transformType()))
        )
        .returns(builderSymbol)
        .do(
          $.const('builder').assign($.new(builderSymbol)),
          $('builder').attr('patch').assign('patch'),
          $('builder').attr('hasPatch').assign('hasPatch'),
          $('builder').attr('transforms').assign('transforms'),
          $.return('builder')
        )
    )
    .newline()
    .method('with', (method) =>
      method
        .param('patch', (parameter) => parameter.type(patchType()))
        .returns(builderSymbol)
        .do(
          $.const('nextPatch').assign(
            $.ternary($('this').attr('hasPatch'))
              .do(
                $(runtime.mergeBuilderPatches)
                  .call($('this').attr('patch').as(patchType()), 'patch')
                  .generic(target.modelSymbol)
              )
              .otherwise('patch')
          ),
          $.return(
            $(builderSymbol)
              .attr('create')
              .call('nextPatch', $.literal(true), $('this').attr('transforms'))
          )
        )
    );

  for (const { methodName, propertyName } of propertyMethods(target.properties ?? [])) {
    classNode.method(methodName, (method) =>
      method
        .param('value', (parameter) =>
          parameter.type($.type(target.modelSymbol).idx($.type.literal(propertyName)))
        )
        .returns(builderSymbol)
        .do(
          $.return(
            $('this').attr('with').call($.object().prop(propertyName, 'value').as(patchType()))
          )
        )
    );
  }

  classNode
    .newline()
    .method('transform', (method) =>
      method
        .param('transform', (parameter) => parameter.type(transformType()))
        .returns(builderSymbol)
        .do(
          $.return(
            $(builderSymbol)
              .attr('create')
              .call(
                $('this').attr('patch'),
                $('this').attr('hasPatch'),
                $.array($('this').attr('transforms').spread(), $('transform'))
              )
          )
        )
    )
    .newline()
    .method('build', (method) =>
      method
        .param('options', (parameter) => parameter.optional().type(optionsType()))
        .returns(target.modelSymbol)
        .do(
          $.let('value')
            .type(target.modelSymbol)
            .assign($(target.factorySymbol).as(callableFactoryType()).call('options')),
          $.if($('this').attr('hasPatch')).do(
            $('value').assign(
              $(runtime.mergeBuilderPatch)
                .call('value', $('this').attr('patch').as(patchType()))
                .generic(target.modelSymbol)
            )
          ),
          $.for($.const('transform'))
            .of($('this').attr('transforms'))
            .do($('value').assign($('transform').call('value'))),
          $.return('value')
        )
    )
    .newline()
    .method('buildList', (method) =>
      method
        .param('count', (parameter) => parameter.type('number'))
        .param('options', (parameter) => parameter.optional().type(optionsType()))
        .returns($.type('Array').generic(target.modelSymbol))
        .do(
          $.if(
            $.binary(
              $.not($('Number').attr('isSafeInteger').call('count')),
              '||',
              $('count').lt($.literal(0))
            )
          ).do(
            $.throw('RangeError').message(
              $.literal('buildList count must be a non-negative integer')
            )
          ),
          $.return(
            $('Array')
              .attr('from')
              .call(
                $.object().prop('length', 'count'),
                $.func()
                  .arrow()
                  .do($.return($('this').attr('build').call('options')))
              )
          )
        )
    );

  plugin.node(classNode);
}

function propertyMethods(
  properties: ReadonlyArray<string>
): ReadonlyArray<{ methodName: string; propertyName: string }> {
  const methods: Array<{ methodName: string; propertyName: string }> = [];
  const used = new Set<string>(['build', 'buildList', 'constructor', 'transform', 'with']);

  for (const propertyName of properties) {
    const suffix = toCase(propertyName, 'PascalCase') || 'Value';
    const baseName = `with${suffix}`;
    let methodName = baseName;
    let collisionIndex = 2;
    while (used.has(methodName)) {
      methodName = `${baseName}${collisionIndex}`;
      collisionIndex += 1;
    }
    used.add(methodName);
    methods.push({ methodName, propertyName });
  }

  return methods;
}
