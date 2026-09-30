# Complete union variants

Partial discriminant patches can create an invalid shape, such as changing a cat's
`kind` to `dog` without adding `bark`. Generic builders require complete replacement
for such transitions. Native TypeBox adapters additionally provide
`fromTypeBoxVariant(union, index, options)` to generate one complete branch first.
The same function is exported by the modern and legacy adapter packages.

```ts
import Type from 'typebox';
import { fromTypeBoxVariant } from '@mimlet/typebox';

const Pet = Type.Union([
  Type.Object({ kind: Type.Literal('cat'), lives: Type.Integer({ default: 9 }) }),
  Type.Object({ kind: Type.Literal('dog'), bark: Type.Boolean({ default: true }) }),
]);
const dogs = fromTypeBoxVariant(Pet, 1);
const quietDog = dogs.with({ bark: false }).buildValidated();
// Input patches are restricted to the selected dog branch.
// dogs.with({ kind: 'cat' }) and dogs.with({ lives: 9 }) are type errors.
```

The index identifies an existing top-level `anyOf` entry. Literal indexes are
checked against known tuples by TypeScript, and runtime indexes are checked before
any generation. This does not search nested schemas, resolve discriminant strings,
or reinterpret `oneOf` as `anyOf`. Use an explicit branch schema/provider for those
representations. Native contexts and references are forwarded without network I/O.

Creation invokes the selected branch's native creator, then checks the original
union too. Validated builds check membership in the selected branch before invoking
the **original union's** validator/decoder. A root Codec or legacy Transform is
therefore preserved and decoded once. Output retains the original union's output
type rather than asserting that opaque root transformations preserve the branch.
For overlapping branches, the native union decoder's selection rules still apply.
No constraints are removed from the original native schema to force generation.

`typeBoxVariantAdapter(union, index, options)` exposes the original `source`, the
selected `variantSource`, the index in `metadata.variant`, a branch-input-typed
`standard` validator, and strict `check`, `issues`, `create`, `decode`, and `encode`
operations. Encoding a different branch fails the selected-branch check, even if
it is accepted by the original union. These operations use the native library's
checking semantics; they do not invent constraints that library ignores.

For branches that native minimal creation cannot satisfy, provide an explicit
factory to `createSchemaBuilder(adapter.standard, factory)`. This supports both
synchronous and asynchronous factories and preserves the selected input and
original output types. There are no hidden retries, repairs, or double decodes.
As with all native adapters, schema handles, codecs, and registries are trusted,
caller-owned objects. Do not mutate them while builders use them.
