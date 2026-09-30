/* global document, fetch, AbortController, Blob, URL */
const element = (id) => document.getElementById(id);
const controls = element('controls');
const status = element('status');
const output = element('output');
const inspection = element('inspection');
let token;
let pending;
let previous;
const examples = {
  user: {
    schema: {
      $schema: 'https://json-schema.org/draft/2020-12/schema',
      type: 'object',
      properties: {
        id: { type: 'integer', minimum: 1, maximum: 9999 },
        name: { type: 'string', minLength: 2, maxLength: 20 },
        role: { enum: ['reader', 'editor', 'admin'] },
        tags: { type: 'array', items: { type: 'string', minLength: 1 }, maxItems: 3 },
      },
      required: ['id', 'name', 'role'],
      additionalProperties: false,
    },
    references: {},
  },
  union: {
    schema: {
      oneOf: [
        {
          type: 'object',
          properties: { kind: { const: 'created' }, id: { type: 'integer' } },
          required: ['kind', 'id'],
          additionalProperties: false,
        },
        {
          type: 'object',
          properties: { kind: { const: 'deleted' }, reason: { type: 'string', minLength: 1 } },
          required: ['kind', 'reason'],
          additionalProperties: false,
        },
      ],
    },
    references: {},
  },
  reference: {
    schema: {
      type: 'object',
      properties: { address: { $ref: 'https://example.test/address' } },
      required: ['address'],
    },
    references: {
      'https://example.test/address': {
        type: 'object',
        properties: { country: { enum: ['BE', 'NL', 'FR'] } },
        required: ['country'],
        additionalProperties: false,
      },
    },
  },
};
function example() {
  const value = examples[element('example').value];
  element('schema').value = JSON.stringify(value.schema, null, 2);
  element('references').value = JSON.stringify(value.references, null, 2);
}
example();
element('example').addEventListener('change', example);
function message(text, error = false) {
  status.textContent = text;
  status.dataset.error = String(error);
}
function buttons(busy) {
  element('generate').disabled = busy || !token;
  element('cancel').disabled = !busy;
  element('load-replay').disabled = busy || !token;
  for (const id of ['replay', 'next', 'save', 'save-replay'])
    element(id).disabled = busy || !previous;
}
async function run(request, description = 'Generated') {
  if (pending || !token) return;
  pending = new AbortController();
  buttons(true);
  message('Generating and checking fixtures locally…');
  try {
    const response = await fetch('/generate', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-test-builders-token': token },
      body: JSON.stringify(request),
      signal: pending.signal,
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error?.message ?? 'Generation failed');
    previous = { request, result: data };
    output.textContent = JSON.stringify(data.values, null, 2);
    inspection.textContent = JSON.stringify(data.inspection, null, 2);
    element('result-count').textContent = `${data.values.length} CHECKED`;
    message(
      `${description} ${data.values.length} fixtures. Replay reproduces this batch; Next batch continues its session.`
    );
  } catch (error) {
    message(
      error.name === 'AbortError' ? 'Generation cancelled.' : error.message,
      error.name !== 'AbortError'
    );
  } finally {
    pending = undefined;
    buttons(false);
  }
}
controls.addEventListener('submit', (event) => {
  event.preventDefault();
  if (!controls.reportValidity()) return;
  try {
    const value = element('seed').value;
    const seed =
      /^-?\d+$/.test(value) && Number.isSafeInteger(Number(value)) ? Number(value) : value;
    const dialect = element('dialect').value;
    const request = {
      schema: JSON.parse(element('schema').value),
      references: JSON.parse(element('references').value || '{}'),
      profile: element('profile').value,
      count: Number(element('count').value),
      seed,
      ...(dialect ? { dialect } : {}),
    };
    void run(request);
  } catch {
    message(
      'The schema and references must be valid JSON. Check the editor before generating.',
      true
    );
  }
});
element('schema').addEventListener('keydown', (event) => {
  if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
    event.preventDefault();
    controls.requestSubmit();
  }
});
element('cancel').addEventListener('click', () => pending?.abort());
function replay(next = false) {
  if (!previous) return;
  const request = {
    ...previous.request,
    replay: next ? previous.result.next : previous.result.replay,
  };
  delete request.seed;
  void run(request, next ? 'Continued with' : 'Replayed');
}
element('replay').addEventListener('click', () => replay());
element('next').addEventListener('click', () => replay(true));
function save(name, data) {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
  );
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
element('save').addEventListener('click', () => {
  if (previous) save('fixtures.json', previous.result.values);
});
element('save-replay').addEventListener('click', () => {
  if (!previous) return;
  const request = { ...previous.request, replay: previous.result.replay };
  delete request.seed;
  save('fixture-replay.json', request);
});
try {
  const response = await fetch('/session');
  if (!response.ok) throw new Error('Local session unavailable');
  token = (await response.json()).token;
  buttons(false);
  message('Ready. Start with an example or paste your own schema.');
} catch {
  message('The local server is unavailable. Restart the playground and reload this page.', true);
}

element('load-replay').addEventListener('change', async (event) => {
  const file = event.target.files[0];
  if (!file || pending) return;
  try {
    if (file.size > 256000) throw new Error('Replay file exceeds the request limit');
    const request = JSON.parse(await file.text());
    if (!request || typeof request !== 'object' || !Object.hasOwn(request, 'schema'))
      throw new Error('Expected a saved replay request');
    element('schema').value = JSON.stringify(request.schema, null, 2);
    element('references').value = JSON.stringify(request.references ?? {}, null, 2);
    element('profile').value = request.profile ?? 'minimal';
    element('dialect').value = request.dialect ?? '';
    element('count').value = request.count ?? 3;
    element('seed').value = request.seed ?? '42';
    await run(request, 'Loaded and replayed');
  } catch {
    message(
      'Could not load the replay. Choose a bounded JSON request saved by this playground.',
      true
    );
  } finally {
    event.target.value = '';
  }
});
