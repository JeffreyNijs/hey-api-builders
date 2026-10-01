/** Bounded diagnostic selections; normal acceptance still runs every engine once. */
export function browserOptions(args) {
  const result = { install: false, list: false, project: undefined, repeat: 1 };
  const seen = new Set();
  for (let index = 0; index < args.length; index++) {
    const flag = args[index];
    if (!['--install', '--list', '--project', '--repeat'].includes(flag) || seen.has(flag)) {
      throw new Error('Unknown or duplicate browser option');
    }
    seen.add(flag);
    if (flag === '--install') result.install = true;
    else if (flag === '--list') result.list = true;
    else if (flag === '--project') {
      const project = args[++index];
      if (!['chromium', 'firefox', 'webkit'].includes(project))
        throw new Error('Browser project must be chromium, firefox or webkit');
      result.project = project;
    } else {
      const value = args[++index];
      if (!/^(?:[1-9]|1[0-9]|2[0-5])$/.test(value ?? ''))
        throw new Error('Browser repeat count must be an integer from 1 to 25');
      result.repeat = Number(value);
    }
  }
  return result;
}
