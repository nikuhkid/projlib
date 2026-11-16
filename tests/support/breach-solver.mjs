// Test-only search over the displayed puzzle. No stored passwords or answer paths.
export function solveBreach(board) {
  const tokens = [...new Set(board.cells)];
  const prefixes = [[]], known = new Set(['']);
  for (const target of board.targets) for (let length = 1; length < target.length; length++) {
    const prefix = target.slice(0, length), key = prefix.join(',');
    if (!known.has(key)) { known.add(key); prefixes.push(prefix); }
  }
  const suffix = (value, pattern) => pattern.length <= value.length && pattern.every((code, i) => code === value[value.length - pattern.length + i]);
  const transitions = prefixes.map(prefix => tokens.map(token => {
    const value = [...prefix, token];
    const matches = board.targets.reduce((mask, target, i) => mask | (suffix(value, target) ? 1 << i : 0), 0);
    let next = 0;
    for (let i = 1; i < prefixes.length; i++) if (prefixes[i].length > prefixes[next].length && suffix(value, prefixes[i])) next = i;
    return { node: next, matches };
  }));
  const count = prefixes.length, all = (1 << board.targets.length) - 1;
  const reverse = Array.from({ length: (all + 1) * count }, () => []);
  for (let mask = 0; mask <= all; mask++) for (let node = 0; node < count; node++) {
    const from = mask * count + node;
    for (const next of transitions[node]) reverse[(mask | next.matches) * count + next.node].push(from);
  }
  const distance = new Int16Array(reverse.length).fill(32767), queue = [];
  for (let node = 0; node < count; node++) { const state = all * count + node; distance[state] = 0; queue.push(state); }
  for (let at = 0; at < queue.length; at++) for (const before of reverse[queue[at]]) {
    if (distance[before] === 32767) { distance[before] = distance[queue[at]] + 1; queue.push(before); }
  }
  const tokenIndexes = board.cells.map(code => tokens.indexOf(code)), seen = new Set();
  function search(path, used, node, mask) {
    if (mask === all) return path;
    const left = board.capacity - path.length;
    if (distance[mask * count + node] > left) return null;
    const last = path.at(-1) ?? -1, key = `${used}:${last}:${node}:${mask}`;
    if (seen.has(key)) return null;
    seen.add(key);
    const candidates = Array.from({ length: board.size }, (_, i) => !path.length ? i : path.length % 2 ? i * board.size + last % board.size : Math.floor(last / board.size) * board.size + i)
      .filter(index => !(used & (1n << BigInt(index))))
      .map(index => ({ index, ...transitions[node][tokenIndexes[index]] }))
      .sort((a, b) => distance[(mask | a.matches) * count + a.node] - distance[(mask | b.matches) * count + b.node]);
    for (const next of candidates) {
      if (distance[(mask | next.matches) * count + next.node] > left - 1) continue;
      const result = search([...path, next.index], used | (1n << BigInt(next.index)), next.node, mask | next.matches);
      if (result) return result;
    }
    return null;
  }
  const result = search([], 0n, 0, 0);
  if (!result) throw new Error('Displayed Breach puzzle has no route within its buffer.');
  return result;
}
