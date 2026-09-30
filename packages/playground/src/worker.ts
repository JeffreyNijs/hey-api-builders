import { parentPort, workerData } from 'node:worker_threads';
import { executeGeneration } from './execution.js';

// This entrypoint only transports data; the same execution module has direct conformance coverage.
parentPort!.postMessage(executeGeneration(workerData));
parentPort!.close();
