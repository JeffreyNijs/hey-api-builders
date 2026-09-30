import { protobufAdapter, fromProtobuf } from '@mimlet/protobuf';
import type { SchemaBuilder, GenerationSession } from '@mimlet/core';
declare function expectType<T>(value: T): void;
const p = protobufAdapter('syntax="proto3";message X{int64 id=1;}', 'X');
expectType<Uint8Array>(p.encode({ id: 1n }));
expectType<Record<string, unknown>>(p.decode(new Uint8Array()));
expectType<
  SchemaBuilder<Record<string, unknown>, Record<string, unknown>, [session?: GenerationSession]>
>(fromProtobuf('message X{}', 'X'));
// @ts-expect-error Runtime descriptors do not infer an application model.
const id: bigint = p.create().id;
// @ts-expect-error Binary decoders do not accept ambiguous base64 strings.
p.decode('AAA=');
const asynchronous = p.builder().transformAsync(async (v) => v);
// @ts-expect-error Known asynchronous pipelines cannot advertise synchronous validation.
asynchronous.buildValidated();
void id;
