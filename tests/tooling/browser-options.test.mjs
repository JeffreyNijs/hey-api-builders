import assert from 'node:assert/strict';
import { test } from 'node:test';
import { browserOptions } from '../../scripts/browser-options.mjs';

test('normal browser acceptance keeps all engines and one run; diagnostic selection is bounded', () => {
  assert.deepEqual(browserOptions([]), {
    install: false,
    list: false,
    project: undefined,
    repeat: 1,
  });
  assert.deepEqual(browserOptions(['--install', '--project', 'firefox', '--repeat', '25']), {
    install: true,
    list: false,
    project: 'firefox',
    repeat: 25,
  });
  assert.equal(browserOptions(['--list']).list, true);
  for (const args of [
    ['--unknown'],
    ['--list', '--list'],
    ['--project'],
    ['--project', 'shell'],
    ['--repeat'],
    ['--repeat', '0'],
    ['--repeat', '26'],
    ['--repeat', '2.5'],
    ['--repeat', '01'],
    ['--repeat', '1;echo invalid'],
    ['--project', 'firefox', '--project', 'webkit'],
  ]) {
    assert.throws(() => browserOptions(args));
  }
});
