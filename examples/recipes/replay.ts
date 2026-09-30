import { createBuilder, createSession, restoreSession } from '@mimlet/core';
import type { GenerationSession } from '@mimlet/core';

const identity = { fingerprint: 'users/v1', provider: 'my-factory@1' };
const session = createSession({ ...identity, seed: 42 });
const users = createBuilder((run: GenerationSession) => ({ id: run.integer(1, 1000) }));

// Save before the failing operation to reproduce that operation.
export const before = session.snapshot();
export const first = users.build(session);
export const again = users.build(restoreSession(before, identity));
// first and again have the same id. Restoring checks the supplied identity.
