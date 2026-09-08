import { codeProblem, diagram, md, type ProblemDraft } from './types';

/**
 * The heap wave's last two reps are about using a heap rather than writing one,
 * so both are handed the same one in `setup`. Kept identical on purpose: two
 * versions of a min-heap in one file would read as a difference that means
 * something.
 */
const minHeapSetup = md(
  '// A binary min-heap. `compare` works like a sort comparator, so',
  '// new MinHeap((a, b) => a - b) is numbers with the smallest on top.',
  'class MinHeap {',
  '  constructor(compare) {',
  '    this.items = [];',
  '    this.compare = compare;',
  '  }',
  '  get size() {',
  '    return this.items.length;',
  '  }',
  '  peek() {',
  '    return this.items[0];',
  '  }',
  '  push(item) {',
  '    this.items.push(item);',
  '    let i = this.items.length - 1;',
  '    while (i > 0) {',
  '      const parent = Math.floor((i - 1) / 2);',
  '      if (this.compare(this.items[i], this.items[parent]) >= 0) break;',
  '      [this.items[i], this.items[parent]] = [this.items[parent], this.items[i]];',
  '      i = parent;',
  '    }',
  '  }',
  '  pop() {',
  '    const top = this.items[0];',
  '    const last = this.items.pop();',
  '    if (this.items.length === 0) return top;',
  '    this.items[0] = last;',
  '    let i = 0;',
  '    for (;;) {',
  '      let next = i;',
  '      for (const child of [2 * i + 1, 2 * i + 2]) {',
  '        if (child < this.items.length && this.compare(this.items[child], this.items[next]) < 0) {',
  '          next = child;',
  '        }',
  '      }',
  '      if (next === i) return top;',
  '      [this.items[i], this.items[next]] = [this.items[next], this.items[i]];',
  '      i = next;',
  '    }',
  '  }',
  '}'
);

/**
 * Two of the backtracking reps produce a list of groups with no natural order,
 * and both compare through this rather than through whichever order the
 * reference happens to walk. It sits in `setup` so the reader can see it:
 * seeing it is what says any traversal order passes.
 */
const canonSetup = md(
  '// canon puts a list of groups into one fixed order, so a test never depends',
  '// on the order your search found them in: each group is sorted as numbers,',
  '// then the groups are sorted against each other as text.',
  'function canon(groups) {',
  '  return groups.map((group) => [...group].sort((a, b) => a - b)).sort();',
  '}'
);

/**
 * The pattern track, entered on purpose: `dsa-patterns` is in
 * `OPT_IN_CATEGORIES`, so the daily queue never deals these alongside the
 * feature-work reps. Reach them by scoping practice or a session to the
 * category. Written in pattern-sized waves, one block comment to a wave.
 */
export const dsaPatternProblems: ProblemDraft[] = [
  /* Two pointers: one from each end, or one reading while the other writes. */
  codeProblem({
    slug: 'dsa-merge-sorted',
    title: 'Merge two sorted arrays',
    category: 'dsa-patterns',
    difficulty: 'easy',
    relevance: 'occasional',
    prompt: md(
      'Merge two arrays, each already sorted ascending, into one sorted array.',
      '',
      'Keep duplicates. Do it in a single pass rather than sorting the concatenation.'
    ),
    starter: 'function merge(a, b) {\n  \n}',
    tests: [
      {
        name: 'interleaves both sides',
        expression: 'merge([1, 4, 7], [2, 3, 8])',
        expected: [1, 2, 3, 4, 7, 8],
      },
      { name: 'keeps duplicates', expression: 'merge([1, 2], [2, 3])', expected: [1, 2, 2, 3] },
      {
        name: 'compares by value, not as strings',
        expression: 'merge([2, 10], [3, 20])',
        expected: [2, 3, 10, 20],
      },
      { name: 'handles an empty left side', expression: 'merge([], [1, 2])', expected: [1, 2] },
      { name: 'handles an empty right side', expression: 'merge([3], [])', expected: [3] },
      { name: 'handles two empty arrays', expression: 'merge([], [])', expected: [] },
    ],
    reference:
      'function merge(a, b) {\n  const out = [];\n  let i = 0;\n  let j = 0;\n  while (i < a.length && j < b.length) {\n    if (a[i] <= b[j]) {\n      out.push(a[i]);\n      i += 1;\n    } else {\n      out.push(b[j]);\n      j += 1;\n    }\n  }\n  return out.concat(a.slice(i), b.slice(j));\n}',
    hints: [
      'The smallest value left is always at the front of one of the two arrays.',
      'When one side runs out, everything left on the other side is already in order.',
      '`[...a, ...b].sort()` compares as strings, so 10 lands before 2.',
    ],
    explanation:
      'Both inputs are sorted, so the smallest remaining value is at the front of one of them: comparing those two fronts is the whole algorithm, and it costs O(n + m). Sorting the concatenation is O((n + m) log(n + m)) and throws away the ordering you were handed. It also has a bug that has nothing to do with speed, since `sort()` without a comparator converts to strings and puts 10 before 2. Taking from `a` when the fronts are equal is what keeps the merge stable, which starts to matter the moment the values are objects.',
  }),

  codeProblem({
    slug: 'dsa-two-sum-sorted',
    title: 'Two sum on a sorted array',
    category: 'dsa-patterns',
    difficulty: 'medium',
    relevance: 'foundational',
    prompt: md(
      'Given an array sorted ascending and a target, return the indices of the two values that add',
      'to it, as `[i, j]` with `i` before `j`. Return `null` when no pair does.',
      '',
      'A value cannot pair with itself. Solve it in constant extra space.'
    ),
    starter: 'function twoSum(sorted, target) {\n  \n}',
    tests: [
      {
        name: 'finds a pair in the middle',
        expression: 'twoSum([1, 3, 4, 7, 11], 11)',
        expected: [2, 3],
      },
      { name: 'finds a pair at the ends', expression: 'twoSum([2, 5, 9], 11)', expected: [0, 2] },
      {
        name: 'handles negative values',
        expression: 'twoSum([-4, -1, 0, 3], -5)',
        expected: [0, 1],
      },
      {
        name: 'returns null when nothing adds up',
        expression: 'twoSum([1, 2, 3], 100)',
        expectedCode: 'null',
      },
      {
        name: 'does not pair a value with itself',
        expression: 'twoSum([3, 6], 6)',
        expectedCode: 'null',
      },
      { name: 'handles an empty array', expression: 'twoSum([], 5)', expectedCode: 'null' },
    ],
    reference:
      'function twoSum(sorted, target) {\n  let left = 0;\n  let right = sorted.length - 1;\n  while (left < right) {\n    const sum = sorted[left] + sorted[right];\n    if (sum === target) return [left, right];\n    if (sum < target) left += 1;\n    else right -= 1;\n  }\n  return null;\n}',
    hints: [
      'A hash map solves this, and ignores the fact that the array is sorted.',
      'Start with the widest pair: one index at each end.',
      'A sum that is too big means the right value is too big; too small means the left one is.',
    ],
    explanation: md(
      diagram(
        '[1, 3, 4, 7, 11], target 11',
        '',
        '  1   3   4   7  11',
        '  L               R   1 + 11 = 12   over  -> only R can lower it',
        '  L           R       1 +  7 =  8   under -> only L can raise it',
        '      L       R       3 +  7 = 10   under -> only L can raise it',
        '          L   R       4 +  7 = 11   -> [2, 3]'
      ),
      '',
      'Sorting is the information the hash-map solution throws away. Once the array is ordered, the sum tells you which pointer to move: raising the left index is the only way to increase it and lowering the right index is the only way to decrease it, so neither pointer ever needs to go back and every index is visited once. That is O(n) time in O(1) space, against the map at O(n) space. The loop runs while `left < right` rather than `<=`, which is what stops one value being counted twice.'
    ),
  }),

  codeProblem({
    slug: 'dsa-move-zeroes',
    title: 'Move the zeroes to the end',
    category: 'dsa-patterns',
    difficulty: 'medium',
    relevance: 'foundational',
    prompt: md(
      'Move every zero to the end of the array, keeping the other values in their original order.',
      '',
      'Do it in place and return the same array you were given.'
    ),
    starter: 'function moveZeroes(items) {\n  \n}',
    tests: [
      {
        name: 'moves the zeroes to the end',
        expression: 'moveZeroes([0, 1, 0, 3, 12])',
        expected: [1, 3, 12, 0, 0],
      },
      {
        name: 'keeps the order of everything else',
        expression: 'moveZeroes([4, 0, 5, 0, 6])',
        expected: [4, 5, 6, 0, 0],
      },
      {
        name: 'returns the array it was given, not a copy',
        expression: '(() => { const xs = [0, 1, 0, 2]; return moveZeroes(xs) === xs; })()',
        expected: true,
      },
      {
        name: 'changes the array you passed in',
        expression: '(() => { const xs = [0, 1]; moveZeroes(xs); return xs; })()',
        expected: [1, 0],
      },
      {
        name: 'leaves an array with no zeroes alone',
        expression: 'moveZeroes([1, 2, 3])',
        expected: [1, 2, 3],
      },
      { name: 'handles an empty array', expression: 'moveZeroes([])', expected: [] },
    ],
    reference:
      'function moveZeroes(items) {\n  let write = 0;\n  for (let read = 0; read < items.length; read += 1) {\n    if (items[read] !== 0) {\n      items[write] = items[read];\n      write += 1;\n    }\n  }\n  for (; write < items.length; write += 1) {\n    items[write] = 0;\n  }\n  return items;\n}',
    hints: [
      'Two pointers, but not one at each end: one reads and one writes.',
      'Copy every non-zero value back to the write pointer, then fill what is left with zeroes.',
      'Calling `splice` inside the loop shifts every later element, which makes it O(n²).',
    ],
    explanation:
      'The write pointer is where the next kept value belongs and the read pointer is where you are looking. The write pointer can never overtake the read pointer, so overwriting in place is safe, and whatever sits past the last write is exactly the zeroes you skipped. Reaching for `splice` inside the loop is the version that looks tidier and runs in O(n²), because every removal shifts the rest of the array. `filter` then pad is the same complexity as this and reads better, but it allocates a second array, which is the one thing in place was asked to avoid.',
  }),

  /* Sliding window: a fixed frame first, then one that grows and shrinks. */
  codeProblem({
    slug: 'dsa-max-window-sum',
    title: 'Best window of k values',
    category: 'dsa-patterns',
    difficulty: 'easy',
    relevance: 'occasional',
    prompt: md(
      'Return the largest sum of any `k` consecutive values. `k` is at least 1.',
      '',
      'Return `null` when the array is shorter than `k`. Make one pass, not one per window.'
    ),
    starter: 'function maxWindowSum(values, k) {\n  \n}',
    tests: [
      {
        name: 'finds the best window in the middle',
        expression: 'maxWindowSum([1, 2, 5, 2, 8, 1, 5], 3)',
        expected: 15,
      },
      {
        name: 'handles an array with no positive value in it',
        expression: 'maxWindowSum([-3, -1, -4, -1], 2)',
        expected: -4,
      },
      {
        name: 'takes the whole array when k is its length',
        expression: 'maxWindowSum([2, 3], 2)',
        expected: 5,
      },
      { name: 'handles a single element', expression: 'maxWindowSum([7], 1)', expected: 7 },
      {
        name: 'returns null when the array is shorter than k',
        expression: 'maxWindowSum([1, 2], 3)',
        expectedCode: 'null',
      },
      { name: 'handles an empty array', expression: 'maxWindowSum([], 1)', expectedCode: 'null' },
    ],
    reference:
      'function maxWindowSum(values, k) {\n  if (k > values.length) return null;\n  let sum = 0;\n  for (let i = 0; i < k; i += 1) sum += values[i];\n  let best = sum;\n  for (let i = k; i < values.length; i += 1) {\n    sum += values[i] - values[i - k];\n    if (sum > best) best = sum;\n  }\n  return best;\n}',
    hints: [
      'Two neighbouring windows share all but two of their values.',
      'Sum the first k values, then add the value entering the window and subtract the one leaving.',
      'Seed `best` with the first window rather than 0, or an all-negative array answers 0.',
    ],
    explanation: md(
      diagram(
        '[1, 2, 5, 2, 8, 1, 5], k = 3',
        '',
        '  [1  2  5] 2  8  1  5    8     the whole window, added up once',
        '   1 [2  5  2] 8  1  5    9     + 2  - 1',
        '   1  2 [5  2  8] 1  5   15     + 8  - 2    best',
        '   1  2  5 [2  8  1] 5   11     + 1  - 5',
        '   1  2  5  2 [8  1  5]  14     + 5  - 2'
      ),
      '',
      'The window moves one step at a time, so consecutive sums differ by exactly two values: adding the one that entered and subtracting the one that left makes each step O(1) and the whole pass O(n). Summing each window in an inner loop is the version that reads fine and costs O(n * k), and it redoes k - 1 additions it already did. Starting `best` at 0 is the bug worth remembering here, because it only shows up when every value is negative and the answer comes back as a window that does not exist.'
    ),
  }),

  codeProblem({
    slug: 'dsa-longest-unique-substring',
    title: 'Longest run of distinct characters',
    category: 'dsa-patterns',
    difficulty: 'medium',
    relevance: 'foundational',
    prompt: md(
      'Return the length of the longest substring whose characters are all different.',
      '',
      'The substring has to be contiguous. One pass over the string.'
    ),
    starter: 'function longestUnique(text) {\n  \n}',
    tests: [
      {
        name: 'finds the longest run of distinct characters',
        expression: "longestUnique('abcabcbb')",
        expected: 3,
      },
      {
        name: 'never moves the left edge backwards',
        expression: "longestUnique('abba')",
        expected: 2,
      },
      {
        name: 'handles a string of one repeated character',
        expression: "longestUnique('bbbbb')",
        expected: 1,
      },
      {
        name: 'takes the whole string when nothing repeats',
        expression: "longestUnique('abcdef')",
        expected: 6,
      },
      { name: 'handles a single character', expression: "longestUnique('a')", expected: 1 },
      { name: 'handles an empty string', expression: "longestUnique('')", expected: 0 },
    ],
    reference:
      'function longestUnique(text) {\n  const lastSeen = new Map();\n  let start = 0;\n  let best = 0;\n  for (let end = 0; end < text.length; end += 1) {\n    const char = text[end];\n    const seen = lastSeen.get(char);\n    if (seen !== undefined && seen >= start) start = seen + 1;\n    lastSeen.set(char, end);\n    if (end - start + 1 > best) best = end - start + 1;\n  }\n  return best;\n}',
    hints: [
      'The window holds a run that is already valid, so widening it is what can break it.',
      'Remember where you last saw each character, and pull the left edge past a repeat.',
      'A character last seen before the left edge is no longer in the window.',
    ],
    explanation:
      'Both edges only ever move right, so every character enters and leaves the window once and the scan is O(n), against O(n^2) for checking each substring for duplicates. Storing the last index of each character is what lets the left edge jump straight past a repeat instead of shrinking one step at a time. The guard that decides the answer is `seen >= start`: a character last seen outside the window is not in it, and without that check `abba` moves the start backwards and reports 3. A Set with an inner shrink loop is the same complexity and harder to get wrong, which makes it the better answer under time pressure.',
  }),

  codeProblem({
    slug: 'dsa-at-most-k-distinct',
    title: 'Longest window with k distinct characters',
    category: 'dsa-patterns',
    difficulty: 'hard',
    relevance: 'foundational',
    prompt: md(
      'Return the length of the longest substring containing at most `k` distinct characters.',
      '',
      '`k` can be 0, and the answer is then 0. The substring has to be contiguous.'
    ),
    starter: 'function longestWithAtMostK(text, k) {\n  \n}',
    tests: [
      {
        name: 'finds the longest window with two distinct characters',
        expression: "longestWithAtMostK('eceba', 2)",
        expected: 3,
      },
      {
        name: 'stops counting a character once its last copy leaves',
        expression: "longestWithAtMostK('aabbcc', 2)",
        expected: 4,
      },
      {
        name: 'takes the whole string when it has few enough distinct characters',
        expression: "longestWithAtMostK('aaaa', 2)",
        expected: 4,
      },
      { name: 'returns 0 when k is 0', expression: "longestWithAtMostK('abc', 0)", expected: 0 },
      { name: 'handles a single character', expression: "longestWithAtMostK('a', 1)", expected: 1 },
      { name: 'handles an empty string', expression: "longestWithAtMostK('', 2)", expected: 0 },
    ],
    reference:
      'function longestWithAtMostK(text, k) {\n  if (k === 0) return 0;\n  const counts = new Map();\n  let start = 0;\n  let best = 0;\n  for (let end = 0; end < text.length; end += 1) {\n    const char = text[end];\n    counts.set(char, (counts.get(char) ?? 0) + 1);\n    while (counts.size > k) {\n      const leaving = text[start];\n      const left = counts.get(leaving) - 1;\n      if (left === 0) counts.delete(leaving);\n      else counts.set(leaving, left);\n      start += 1;\n    }\n    if (end - start + 1 > best) best = end - start + 1;\n  }\n  return best;\n}',
    hints: [
      'Widen the window one character at a time, and only shrink it when it has gone too far.',
      'A Set cannot tell you when a character has really left: you need how many of it are inside.',
      'Delete a key when its count hits 0, or the size of the map keeps counting it.',
    ],
    explanation:
      'The window is valid before you widen it and at most one character over afterwards, so shrinking from the left until it is valid again is enough, and each index is entered and left once, which keeps the pass O(n). Counts rather than a Set are the whole difficulty: `aabb` has two copies of `a`, so dropping one of them does not mean `a` has left the window. Deleting the key at 0 is what keeps `counts.size` equal to the number of distinct characters actually inside, and skipping that deletion gives an answer that is too short in a way that looks almost right. Rerunning the check over every substring is the alternative, at O(n^2) and with the same counting bug waiting inside it.',
  }),

  /* Prefix sums: total once, then a range costs one subtraction. */
  codeProblem({
    slug: 'dsa-running-totals',
    title: 'Running totals',
    category: 'dsa-patterns',
    difficulty: 'easy',
    relevance: 'occasional',
    prompt: md(
      'Return the running totals of an array: entry `i` is the sum of everything up to and',
      'including `i`.',
      '',
      'Leave the array you were given alone.'
    ),
    starter: 'function runningTotals(values) {\n  \n}',
    tests: [
      {
        name: 'accumulates left to right',
        expression: 'runningTotals([1, 2, 3, 4])',
        expected: [1, 3, 6, 10],
      },
      {
        name: 'handles negative values',
        expression: 'runningTotals([5, -2, -4])',
        expected: [5, 3, -1],
      },
      {
        name: 'leaves the input array unchanged',
        expression: '(() => { const xs = [1, 2, 3]; runningTotals(xs); return xs; })()',
        expected: [1, 2, 3],
      },
      { name: 'handles a single element', expression: 'runningTotals([7])', expected: [7] },
      { name: 'handles an empty array', expression: 'runningTotals([])', expected: [] },
    ],
    reference:
      'function runningTotals(values) {\n  const out = [];\n  let sum = 0;\n  for (const value of values) {\n    sum += value;\n    out.push(sum);\n  }\n  return out;\n}',
    hints: [
      'Entry i is entry i - 1 plus one more value.',
      'Carry the total across the loop instead of recomputing it.',
      '`values.map((_, i) => values.slice(0, i + 1).reduce(add))` is the O(n^2) version of this.',
    ],
    explanation:
      'Each total is the previous total plus one value, so carrying the sum across the loop makes this a single O(n) pass. The `map` and `slice` version reads well and re-adds every earlier value at each index, which is O(n^2): it is the cumulative column on a chart that gets slow at a few thousand points. Keeping the totals around is what turns the sum of any range into one subtraction rather than a scan, and that is the reason this shape is worth building at all.',
  }),

  codeProblem({
    slug: 'dsa-range-sum-queries',
    title: 'Answer many range sums',
    category: 'dsa-patterns',
    difficulty: 'medium',
    relevance: 'occasional',
    prompt: md(
      'Answer a batch of range-sum queries over one array. Each query is `[from, to]`, inclusive at',
      'both ends and always inside the array. Return one total per query, in order.',
      '',
      'Answer `q` queries over `n` values in O(n + q).'
    ),
    starter: 'function rangeSums(values, queries) {\n  \n}',
    tests: [
      {
        name: 'sums a range in the middle',
        expression: 'rangeSums([1, 2, 3, 4, 5], [[1, 3]])',
        expected: [9],
      },
      {
        name: 'includes both ends of the range',
        expression: 'rangeSums([1, 2, 3], [[0, 2]])',
        expected: [6],
      },
      {
        name: 'answers several queries over the same array',
        expression: 'rangeSums([2, 4, 6, 8], [[0, 1], [2, 3], [1, 2]])',
        expected: [6, 14, 10],
      },
      {
        name: 'handles a range of a single element',
        expression: 'rangeSums([5, 6], [[1, 1]])',
        expected: [6],
      },
      {
        name: 'handles negative values',
        expression: 'rangeSums([3, -1, -5, 2], [[1, 2]])',
        expected: [-6],
      },
      {
        name: 'returns an empty array when there are no queries',
        expression: 'rangeSums([1, 2, 3], [])',
        expected: [],
      },
      { name: 'handles an empty array', expression: 'rangeSums([], [])', expected: [] },
    ],
    reference:
      'function rangeSums(values, queries) {\n  const prefix = [0];\n  for (let i = 0; i < values.length; i += 1) {\n    prefix.push(prefix[i] + values[i]);\n  }\n  return queries.map(([from, to]) => prefix[to + 1] - prefix[from]);\n}',
    hints: [
      'Every query re-adds values an earlier query already added.',
      'Build the running totals once, before you look at the queries.',
      'Put a 0 at the front of the totals, and the answer is `prefix[to + 1] - prefix[from]`.',
    ],
    explanation: md(
      diagram(
        '[2, 4, 6, 8]',
        '',
        '  values        2    4    6    8',
        '  prefix   0    2    6   12   20',
        '  index    0    1    2    3    4',
        '',
        '  query [1, 2]  =  prefix[3] - prefix[1]  =  12 - 2  =  10',
        '                   ^^^^^^^^^   ^^^^^^^^^',
        '                   2 + 4 + 6   2, taken back off'
      ),
      '',
      'A range sum is the difference of two running totals, so building the totals once turns q scans into q subtractions: O(n + q) against O(n * q) for a loop per query, and the gap widens with every query. The leading 0 is what makes it uniform, because without it `from === 0` needs its own branch and that is exactly where the off-by-one lives. The cost is an extra O(n) of memory and totals that go stale the moment a value changes, which is the trade every precomputed aggregate makes, in an array or in a materialised view.'
    ),
  }),

  codeProblem({
    slug: 'dsa-subarray-sum-count',
    title: 'Count subarrays that hit a target',
    category: 'dsa-patterns',
    difficulty: 'hard',
    relevance: 'foundational',
    prompt: md(
      'Count the contiguous subarrays whose values sum to `target`.',
      '',
      'Values can be negative, and subarrays that overlap each other both count. One pass.'
    ),
    starter: 'function countSubarrays(values, target) {\n  \n}',
    tests: [
      {
        name: 'counts overlapping subarrays separately',
        expression: 'countSubarrays([1, 1, 1], 2)',
        expected: 2,
      },
      {
        name: 'counts a subarray that starts at index 0',
        expression: 'countSubarrays([3, 4, 7], 7)',
        expected: 2,
      },
      {
        name: 'handles negative values',
        expression: 'countSubarrays([1, -1, 0], 0)',
        expected: 3,
      },
      {
        name: 'returns 0 when nothing adds up',
        expression: 'countSubarrays([1, 2, 3], 100)',
        expected: 0,
      },
      {
        name: 'handles a single element that is the target',
        expression: 'countSubarrays([5], 5)',
        expected: 1,
      },
      { name: 'handles an empty array', expression: 'countSubarrays([], 0)', expected: 0 },
    ],
    reference:
      'function countSubarrays(values, target) {\n  const seen = new Map([[0, 1]]);\n  let sum = 0;\n  let count = 0;\n  for (const value of values) {\n    sum += value;\n    count += seen.get(sum - target) ?? 0;\n    seen.set(sum, (seen.get(sum) ?? 0) + 1);\n  }\n  return count;\n}',
    hints: [
      'A subarray sum is the difference between two running totals.',
      'At each index, ask how many earlier totals were exactly `sum - target`.',
      'Seed the map with `{0: 1}`, or every subarray starting at index 0 goes uncounted.',
    ],
    explanation:
      'A subarray ending at j sums to target when some earlier total equals `total[j] - target`, so counting pairs of totals in one pass with a map replaces the nested loops at O(n^2). The map counts occurrences rather than storing an index, because the same total can be reached several times and each one is a separate subarray. Seeding it with `{0: 1}` stands for the empty prefix, and it is what counts the subarrays that start at index 0. The window from the earlier reps is the tempting O(n) answer and it is wrong here: with negative values the running total is not monotonic, so shrinking from the left no longer reliably brings the sum down.',
  }),

  /* Fast and slow pointers: two speeds over one sequence. */
  codeProblem({
    slug: 'dsa-linked-list-cycle',
    title: 'Detect a cycle in a linked list',
    category: 'dsa-patterns',
    difficulty: 'medium',
    relevance: 'foundational',
    prompt: md(
      'Return true when following `next` from the head goes round forever, false when it reaches an',
      'end.',
      '',
      'A node is `{ value, next }`, and `next` is `null` at the end of a list. The head can be',
      '`null`. Use constant extra space.'
    ),
    starter: 'function hasCycle(head) {\n  \n}',
    setup: md(
      '// Builds a list of { value, next } nodes. With cycleAt set, the last node',
      '// points back at the node at that index instead of at null.',
      'function buildList(values, cycleAt = -1) {',
      '  const nodes = values.map((value) => ({ value, next: null }));',
      '  for (let i = 0; i < nodes.length - 1; i += 1) nodes[i].next = nodes[i + 1];',
      '  if (cycleAt >= 0 && nodes.length > 0) nodes[nodes.length - 1].next = nodes[cycleAt];',
      '  return nodes[0] ?? null;',
      '}'
    ),
    tests: [
      {
        name: 'finds a cycle back into the middle',
        expression: 'hasCycle(buildList([1, 2, 3, 4], 1))',
        expected: true,
      },
      {
        name: 'finds a cycle back to the head',
        expression: 'hasCycle(buildList([1, 2], 0))',
        expected: true,
      },
      {
        name: 'finds a node pointing at itself',
        expression: 'hasCycle(buildList([1], 0))',
        expected: true,
      },
      {
        name: 'returns false for a list that ends',
        expression: 'hasCycle(buildList([1, 2, 3]))',
        expected: false,
      },
      {
        name: 'returns false for a single node',
        expression: 'hasCycle(buildList([1]))',
        expected: false,
      },
      { name: 'returns false for an empty list', expression: 'hasCycle(null)', expected: false },
    ],
    reference:
      'function hasCycle(head) {\n  let slow = head;\n  let fast = head;\n  while (fast !== null && fast.next !== null) {\n    slow = slow.next;\n    fast = fast.next.next;\n    if (slow === fast) return true;\n  }\n  return false;\n}',
    hints: [
      'Two walkers on the same track, one of them moving twice as fast.',
      'On a loop the fast one laps the slow one; on a list that ends it falls off the end first.',
      'Check both `fast` and `fast.next` before stepping twice, or a list that ends throws.',
    ],
    explanation: md(
      diagram(
        'buildList([1, 2, 3, 4], 1)',
        '',
        '  1 -> 2 -> 3 -> 4',
        '       ^         |',
        '       +---------+',
        '',
        '  step   slow   fast',
        '     0      1      1',
        '     1      2      3',
        '     2      3      2    fast has been round the loop once',
        '     3      4      4    same node, so it loops'
      ),
      '',
      'The fast pointer gains exactly one node a step, so inside a loop the gap between them closes by one each time and they have to land on the same node: a gap that shrinks by one can never be stepped over. A Set of visited nodes answers the same question and costs O(n) memory, which is the thing to avoid when the list is what does not fit in memory. Guarding on both `fast` and `fast.next` is what stops a list that ends from throwing, since the two-step move reads through a node that may be the last. Compare the pointers by identity, not by value: two nodes can hold the same value without being the same node.'
    ),
  }),

  codeProblem({
    slug: 'dsa-middle-of-list',
    title: 'Middle of a linked list',
    category: 'dsa-patterns',
    difficulty: 'easy',
    relevance: 'foundational',
    prompt: md(
      'Return the value in the middle node of a list, in a single pass. For an even number of nodes,',
      'return the second of the two middles.',
      '',
      'A node is `{ value, next }`, and `next` is `null` at the end. Return `null` for an empty list.'
    ),
    starter: 'function middleValue(head) {\n  \n}',
    setup: md(
      '// Builds a list of { value, next } nodes from an array and returns the head.',
      'function buildList(values) {',
      '  let head = null;',
      '  for (let i = values.length - 1; i >= 0; i -= 1) head = { value: values[i], next: head };',
      '  return head;',
      '}'
    ),
    tests: [
      {
        name: 'returns the middle of an odd-length list',
        expression: 'middleValue(buildList([1, 2, 3, 4, 5]))',
        expected: 3,
      },
      {
        name: 'returns the second middle of an even-length list',
        expression: 'middleValue(buildList([1, 2, 3, 4]))',
        expected: 3,
      },
      {
        name: 'handles a two-node list',
        expression: 'middleValue(buildList([1, 2]))',
        expected: 2,
      },
      { name: 'handles a single node', expression: 'middleValue(buildList([9]))', expected: 9 },
      {
        name: 'returns null for an empty list',
        expression: 'middleValue(null)',
        expectedCode: 'null',
      },
    ],
    reference:
      'function middleValue(head) {\n  let slow = head;\n  let fast = head;\n  while (fast !== null && fast.next !== null) {\n    slow = slow.next;\n    fast = fast.next.next;\n  }\n  return slow === null ? null : slow.value;\n}',
    hints: [
      'You get one pass, and you do not know the length.',
      'Move one pointer a node at a time and another two, and stop when the fast one runs out.',
      'Where the loop stops decides which of the two middles you land on.',
    ],
    explanation:
      'By the time the fast pointer has covered the list the slow one has covered half of it, which finds the middle without ever knowing the length. Counting the nodes and then walking half of them gets the same answer in two passes, and two passes are not available at all over something that can only be read once, like a stream or a database cursor. The loop condition is what picks the middle on an even-length list: `fast && fast.next` leaves slow on the second one, and dropping `fast.next` leaves it on the first. The empty list still needs its own check, because slow never moves off the null head.',
  }),

  codeProblem({
    slug: 'dsa-happy-number',
    title: 'Happy number',
    category: 'dsa-patterns',
    difficulty: 'medium',
    relevance: 'occasional',
    prompt: md(
      'Replace a positive integer with the sum of the squares of its digits, over and over. Some',
      'numbers reach 1. The rest fall into a loop that never does.',
      '',
      'Return true when the number reaches 1. Use constant extra space.'
    ),
    starter: 'function isHappy(n) {\n  \n}',
    tests: [
      { name: 'returns true for a happy number', expression: 'isHappy(19)', expected: true },
      { name: 'returns true for 1 itself', expression: 'isHappy(1)', expected: true },
      { name: 'returns true for a single digit', expression: 'isHappy(7)', expected: true },
      {
        name: 'returns false for a number that loops',
        expression: 'isHappy(2)',
        expected: false,
      },
      {
        name: 'returns false for a number already on the loop',
        expression: 'isHappy(4)',
        expected: false,
      },
      { name: 'returns true for 100', expression: 'isHappy(100)', expected: true },
    ],
    reference:
      'function isHappy(n) {\n  const step = (value) => {\n    let sum = 0;\n    let rest = value;\n    while (rest > 0) {\n      const digit = rest % 10;\n      sum += digit * digit;\n      rest = Math.floor(rest / 10);\n    }\n    return sum;\n  };\n\n  let slow = n;\n  let fast = step(n);\n  while (fast !== 1 && slow !== fast) {\n    slow = step(slow);\n    fast = step(step(fast));\n  }\n  return fast === 1;\n}',
    hints: [
      'The next value depends only on the current one, so an unhappy number repeats itself forever.',
      'That repeat is a cycle, and you have already detected one without storing anything.',
      'Run one copy of the sequence a step at a time and another two, and stop when they meet or hit 1.',
    ],
    explanation:
      'There is no list here, which is the point: two speeds work on any sequence where the next value depends only on the current one, and a linked list is only the version where the step is a pointer. A bounded deterministic sequence either reaches its target or repeats, and once it repeats it repeats forever, so the fast pointer catching the slow one proves there is no 1 ahead. A Set of values seen so far is the answer most people write, and it works at the cost of memory the two pointers do not need. Digit squares of anything under a billion sum to at most 729, so the sequence collapses into a small range immediately and both versions finish fast.',
  }),

  /* Binary search: the answer is a boundary, and the bugs all live at the edges. */
  codeProblem({
    slug: 'dsa-insertion-bounds',
    title: 'Leftmost and rightmost insertion point',
    category: 'dsa-patterns',
    difficulty: 'medium',
    relevance: 'foundational',
    prompt: md(
      'Given an array sorted ascending and a target, return `[low, high]`: the first index where the',
      'target could be inserted and keep the array in order, and the last such index.',
      '',
      'The target need not be present. Halve the search space each step rather than scanning.'
    ),
    starter: 'function bounds(sorted, target) {\n  \n}',
    tests: [
      {
        name: 'spans a run of duplicates',
        expression: 'bounds([1, 2, 2, 2, 5], 2)',
        expected: [1, 4],
      },
      {
        name: 'gives the same index twice when the target is absent from the middle',
        expression: 'bounds([1, 3, 5], 4)',
        expected: [2, 2],
      },
      {
        name: 'handles a target below everything',
        expression: 'bounds([2, 4, 6], 1)',
        expected: [0, 0],
      },
      {
        name: 'handles a target above everything',
        expression: 'bounds([2, 4, 6], 9)',
        expected: [3, 3],
      },
      {
        name: 'spans the whole array when every value is the target',
        expression: 'bounds([7, 7, 7], 7)',
        expected: [0, 3],
      },
      { name: 'handles a single element', expression: 'bounds([5], 5)', expected: [0, 1] },
      { name: 'handles an empty array', expression: 'bounds([], 3)', expected: [0, 0] },
    ],
    reference:
      'function bounds(sorted, target) {\n  const firstIndexWhere = (passes) => {\n    let low = 0;\n    let high = sorted.length;\n    while (low < high) {\n      const mid = Math.floor((low + high) / 2);\n      if (passes(sorted[mid])) high = mid;\n      else low = mid + 1;\n    }\n    return low;\n  };\n  return [firstIndexWhere((v) => v >= target), firstIndexWhere((v) => v > target)];\n}',
    hints: [
      'Neither answer needs the target to be in the array at all.',
      'Look for a boundary rather than a value: the first index that is at least the target, and the first that is past it.',
      'Start `high` at `sorted.length` and move it to `mid`, never `mid - 1`, since `mid` is still a candidate.',
    ],
    explanation: md(
      diagram(
        '[1, 2, 2, 2, 5], target 2',
        '',
        '  index    0  1  2  3  4  5',
        '  value    1  2  2  2  5  .   . is one past the end, where high starts',
        '',
        '  first index whose value is >= 2',
        '    low 0  high 5   mid 2   2 >= 2    -> high = mid',
        '    low 0  high 2   mid 1   2 >= 2    -> high = mid',
        '    low 0  high 1   mid 0   1 <  2    -> low = mid + 1',
        '    low 1  high 1                     -> 1',
        '',
        '  high moves to mid, never mid - 1: mid has not been ruled out.',
        '  The same loop with >= changed to > lands on 4, so [1, 4]: 3 copies.'
      ),
      '',
      '`indexOf` answers a different question: with duplicates it lands on an arbitrary copy, and when the target is missing it tells you nothing about where the value belongs. Both bounds are the same loop with one comparison changed, `>=` for the left edge and `>` for the right, which is why `high - low` counts the copies for free. `high` starts at `length` rather than `length - 1` because the answer can be one past the end, and it moves to `mid` rather than `mid - 1` because `mid` has not been ruled out. Scanning is O(n) per lookup and fine once; it is the wrong shape the moment you do it per row of a batch, which is exactly the descent a B-tree index does for you.'
    ),
  }),

  codeProblem({
    slug: 'dsa-search-rotated',
    title: 'Search a rotated sorted array',
    category: 'dsa-patterns',
    difficulty: 'hard',
    relevance: 'occasional',
    prompt: md(
      'An array of distinct values was sorted ascending, then rotated, so `[0, 1, 2, 4, 5, 6, 7]`',
      'might arrive as `[4, 5, 6, 7, 0, 1, 2]`. Return the index of `target`, or -1.',
      '',
      'You do not know where the rotation point is. Halve the search space each step rather than',
      'scanning.'
    ),
    starter: 'function search(rotated, target) {\n  \n}',
    tests: [
      {
        name: 'finds a value after the rotation point',
        expression: 'search([4, 5, 6, 7, 0, 1, 2], 0)',
        expected: 4,
      },
      {
        name: 'finds a value before the rotation point',
        expression: 'search([4, 5, 6, 7, 0, 1, 2], 6)',
        expected: 2,
      },
      {
        name: 'handles an array that was not rotated',
        expression: 'search([1, 2, 3, 4], 4)',
        expected: 3,
      },
      {
        name: 'returns -1 for a value inside the range but absent',
        expression: 'search([4, 5, 6, 7, 0, 1, 2], 3)',
        expected: -1,
      },
      {
        name: 'returns -1 for a value smaller than every element',
        expression: 'search([4, 5, 6, 7, 0, 1, 2], -1)',
        expected: -1,
      },
      {
        name: 'returns -1 for a value larger than every element',
        expression: 'search([4, 5, 6, 7, 0, 1, 2], 99)',
        expected: -1,
      },
      {
        name: 'handles a two-element array rotated by one',
        expression: 'search([2, 1], 1)',
        expected: 1,
      },
      { name: 'handles a single element', expression: 'search([5], 5)', expected: 0 },
      { name: 'handles an empty array', expression: 'search([], 1)', expected: -1 },
    ],
    reference:
      'function search(rotated, target) {\n  let low = 0;\n  let high = rotated.length - 1;\n  while (low <= high) {\n    const mid = Math.floor((low + high) / 2);\n    if (rotated[mid] === target) return mid;\n    if (rotated[low] <= rotated[mid]) {\n      if (rotated[low] <= target && target < rotated[mid]) high = mid - 1;\n      else low = mid + 1;\n    } else {\n      if (rotated[mid] < target && target <= rotated[high]) low = mid + 1;\n      else high = mid - 1;\n    }\n  }\n  return -1;\n}',
    hints: [
      'The array is not sorted, but cutting it at any index leaves one half that is.',
      'Compare the midpoint against the low end to work out which half is the sorted one.',
      'Decide whether the target falls inside that sorted half. If it does, keep it; if it does not, the answer is in the other one.',
    ],
    explanation:
      'The invariant binary search actually needs is not "the array is sorted", it is "I can rule out half of what is left", and a rotated array still supplies that: cut it anywhere and at least one side is in order, so a range check on that side decides which half to throw away. Finding the rotation point first and then searching twice works and is two loops with two off-by-ones instead of one. The naive scan is O(n) and looks fine until the array is the sorted index behind a search box. Comparing `rotated[low] <= rotated[mid]` rather than `<` is what keeps a two-element window honest, since `low` and `mid` are the same index whenever the window is down to one.',
  }),

  codeProblem({
    slug: 'dsa-min-batch-capacity',
    title: 'Smallest batch that clears the queue',
    category: 'dsa-patterns',
    difficulty: 'hard',
    relevance: 'occasional',
    prompt: md(
      'Jobs run in order, split into at most `batches` consecutive runs. A run takes jobs until the',
      'next one would push it over its capacity. Return the smallest capacity that clears the queue.',
      '',
      'Jobs cannot be reordered, and every job has to fit in a run on its own. Return 0 for no jobs.',
      'Do not try every capacity from 1 upwards.'
    ),
    starter: 'function minCapacity(sizes, batches) {\n  \n}',
    tests: [
      {
        name: 'finds a capacity between the largest job and the total',
        expression: 'minCapacity([1, 2, 3, 4, 5], 2)',
        expected: 9,
      },
      {
        name: 'takes the whole queue when there is one run',
        expression: 'minCapacity([1, 2, 3, 4, 5], 1)',
        expected: 15,
      },
      {
        name: 'never goes below the largest single job',
        expression: 'minCapacity([1, 2, 3, 4, 5], 99)',
        expected: 5,
      },
      {
        name: 'handles equal-sized jobs',
        expression: 'minCapacity([3, 3, 3], 2)',
        expected: 6,
      },
      { name: 'handles a single job', expression: 'minCapacity([7], 1)', expected: 7 },
      { name: 'handles an empty queue', expression: 'minCapacity([], 1)', expected: 0 },
    ],
    reference:
      'function minCapacity(sizes, batches) {\n  if (sizes.length === 0) return 0;\n  const fits = (capacity) => {\n    let runs = 1;\n    let room = capacity;\n    for (const size of sizes) {\n      if (size > room) {\n        runs += 1;\n        room = capacity;\n      }\n      room -= size;\n    }\n    return runs <= batches;\n  };\n\n  let low = 0;\n  let high = 0;\n  for (const size of sizes) {\n    if (size > low) low = size;\n    high += size;\n  }\n  while (low < high) {\n    const mid = Math.floor((low + high) / 2);\n    if (fits(mid)) high = mid;\n    else low = mid + 1;\n  }\n  return low;\n}',
    hints: [
      'There is nothing sorted here to search. Ask instead what the answer could be, and what its range is.',
      'Counting the runs a given capacity needs is one greedy pass. That pass is the test you binary-search with.',
      'A capacity that works means every larger one works, so the yes/no answers are already in order: keep the smallest capacity that still fits.',
    ],
    explanation:
      'The array is not what gets searched here: the candidate answers are, and they are sorted for free, because a capacity that clears the queue means every larger one does too. That monotonic yes or no is the only thing binary search ever needed, so the space to halve runs from the largest single job, which nothing smaller can hold, up to the sum of them all, which is one run. Walking capacities from the bottom costs O(n * total) and quietly depends on the size of the numbers rather than the length of the array. This is the variant that transfers: the smallest pool that drains a backlog, the smallest timeout that holds the error rate down, anything you can test a guess against more cheaply than you can compute it.',
  }),

  /* Intervals: sort by start, then decide what to do with the one in your hand. */
  codeProblem({
    slug: 'dsa-merge-intervals',
    title: 'Merge overlapping ranges',
    category: 'dsa-patterns',
    difficulty: 'medium',
    relevance: 'occasional',
    prompt: md(
      'Merge every overlapping range in a list of `[start, end]` pairs, and return the result sorted',
      'by start.',
      '',
      'Ranges that touch count as overlapping, so `[1, 2]` and `[2, 3]` merge into `[1, 3]`. The input',
      'arrives in any order, and you must not reorder it in place.'
    ),
    starter: 'function mergeIntervals(ranges) {\n  \n}',
    tests: [
      {
        name: 'merges ranges that overlap',
        expression: 'mergeIntervals([[1, 3], [2, 6], [8, 10]])',
        expected: [
          [1, 6],
          [8, 10],
        ],
      },
      {
        name: 'merges ranges that only touch',
        expression: 'mergeIntervals([[1, 2], [2, 3]])',
        expected: [[1, 3]],
      },
      {
        name: 'sorts input that does not arrive in order',
        expression: 'mergeIntervals([[8, 10], [1, 3], [2, 6]])',
        expected: [
          [1, 6],
          [8, 10],
        ],
      },
      {
        name: 'keeps the wider range when one swallows another',
        expression: 'mergeIntervals([[1, 10], [2, 3]])',
        expected: [[1, 10]],
      },
      {
        name: 'compares starts as numbers, not as strings',
        expression: 'mergeIntervals([[10, 12], [2, 6]])',
        expected: [
          [2, 6],
          [10, 12],
        ],
      },
      {
        name: 'leaves ranges that neither touch nor overlap alone',
        expression: 'mergeIntervals([[1, 2], [3, 4]])',
        expected: [
          [1, 2],
          [3, 4],
        ],
      },
      {
        name: 'does not reorder the list you were given',
        expression: '(() => { const xs = [[3, 4], [1, 2]]; mergeIntervals(xs); return xs; })()',
        expected: [
          [3, 4],
          [1, 2],
        ],
      },
      {
        name: 'handles a single range',
        expression: 'mergeIntervals([[5, 6]])',
        expected: [[5, 6]],
      },
      { name: 'handles an empty list', expression: 'mergeIntervals([])', expected: [] },
    ],
    reference:
      'function mergeIntervals(ranges) {\n  const sorted = [...ranges].sort((a, b) => a[0] - b[0]);\n  const out = [];\n  for (const [start, end] of sorted) {\n    const last = out[out.length - 1];\n    if (last !== undefined && start <= last[1]) last[1] = Math.max(last[1], end);\n    else out.push([start, end]);\n  }\n  return out;\n}',
    hints: [
      'Two ranges that overlap are not necessarily next to each other in the list you were handed.',
      'Sort by start. Then the only range that can overlap the one in your hand is the one you kept last.',
      'Extend the kept range to the larger of the two ends, because the later range can finish before the earlier one does.',
    ],
    explanation: md(
      diagram(
        '[[1, 3], [2, 6], [8, 10]]',
        '',
        '             1  2  3  4  5  6  7  8  9 10',
        '    [1, 3]   =======',
        '    [2, 6]      =============',
        '   [8, 10]                        =======',
        '',
        '  hold [1, 3]',
        '  [2, 6]  starts on or before 3   overlap  -> end = max(3, 6) = 6',
        '  [8, 10] starts after 6          no touch -> settle [1, 6], hold it',
        '  input ends                               -> settle [8, 10]'
      ),
      '',
      'Sorting by start is what makes one comparison enough: once the starts are in order, anything overlapping the range in your hand must have started earlier, so the only candidate is the range you kept last. Without the sort you compare every pair at O(n^2) and then have to merge the merges, because two ranges can become one that overlaps a third. Taking the larger of the two ends is the case people drop, since a range sitting entirely inside an earlier one has a smaller end and would otherwise shrink it. Whether touching counts as overlapping is a product decision rather than a mathematical one, and `<=` against `<` is the whole of it: a calendar that shows a free slot from 2 to 2 has picked wrong.'
    ),
  }),

  codeProblem({
    slug: 'dsa-insert-interval',
    title: 'Insert into a merged range list',
    category: 'dsa-patterns',
    difficulty: 'medium',
    relevance: 'occasional',
    prompt: md(
      'Insert `added` into `ranges`, a list of `[start, end]` pairs already sorted by start with no',
      'overlaps. Return a list that is still sorted with no overlaps.',
      '',
      'Ranges that touch merge, so inserting `[2, 3]` into `[[1, 2]]` gives `[[1, 3]]`. The list can',
      'be long: do not sort it again.'
    ),
    starter: 'function insertInterval(ranges, added) {\n  \n}',
    tests: [
      {
        name: 'merges the new range with the ones it overlaps',
        expression: 'insertInterval([[1, 3], [6, 9]], [2, 5])',
        expected: [
          [1, 5],
          [6, 9],
        ],
      },
      {
        name: 'swallows every range the new one covers',
        expression: 'insertInterval([[1, 2], [3, 5], [6, 7], [8, 10]], [4, 9])',
        expected: [
          [1, 2],
          [3, 10],
        ],
      },
      {
        name: 'merges a range that starts where an existing one ends',
        expression: 'insertInterval([[1, 2]], [2, 3])',
        expected: [[1, 3]],
      },
      {
        name: 'merges a range that ends where an existing one starts',
        expression: 'insertInterval([[3, 5]], [1, 3])',
        expected: [[1, 5]],
      },
      {
        name: 'inserts ahead of everything',
        expression: 'insertInterval([[3, 5]], [1, 2])',
        expected: [
          [1, 2],
          [3, 5],
        ],
      },
      {
        name: 'inserts after everything',
        expression: 'insertInterval([[1, 2]], [4, 5])',
        expected: [
          [1, 2],
          [4, 5],
        ],
      },
      {
        name: 'drops into a gap without merging',
        expression: 'insertInterval([[1, 2], [7, 8]], [4, 5])',
        expected: [
          [1, 2],
          [4, 5],
          [7, 8],
        ],
      },
      {
        name: 'handles an empty list',
        expression: 'insertInterval([], [1, 2])',
        expected: [[1, 2]],
      },
    ],
    reference:
      'function insertInterval(ranges, added) {\n  const out = [];\n  let [start, end] = added;\n  let i = 0;\n  while (i < ranges.length && ranges[i][1] < start) {\n    out.push(ranges[i]);\n    i += 1;\n  }\n  while (i < ranges.length && ranges[i][0] <= end) {\n    start = Math.min(start, ranges[i][0]);\n    end = Math.max(end, ranges[i][1]);\n    i += 1;\n  }\n  out.push([start, end]);\n  while (i < ranges.length) {\n    out.push(ranges[i]);\n    i += 1;\n  }\n  return out;\n}',
    hints: [
      'The list is already in order and the answer keeps that order, so most of it comes across untouched.',
      'Three groups: the ranges that finish before the new one starts, the ones it touches, and the ones that begin after it ends.',
      'Grow the new range across the middle group, taking the smaller start and the larger end, then push it once.',
    ],
    explanation:
      'The list was already sorted with no overlaps, and that is the work you get to keep: only the ranges touching the new one change, and they sit next to each other. Pushing the new range on, sorting and merging from scratch gets the same answer at O(n log n), and the sort dominates a job whose real cost is a single pass. The new start needs the smaller of the two, not the one you were handed, because the new range can begin after a range it overlaps. This is the maintain-the-invariant shape, and it is why a bookings table merges on write rather than merging on every read.',
  }),

  codeProblem({
    slug: 'dsa-rooms-needed',
    title: 'Rooms needed for a schedule',
    category: 'dsa-patterns',
    difficulty: 'medium',
    relevance: 'foundational',
    prompt: md(
      'Meetings arrive as `[start, end]` pairs in any order. Return the smallest number of rooms that',
      'holds all of them, which is the most that are ever running at once.',
      '',
      'A room frees the instant a meeting ends, so `[1, 2]` and `[2, 3]` share one. Every meeting',
      'starts strictly before it ends. Return 0 for no meetings.'
    ),
    starter: 'function roomsNeeded(meetings) {\n  \n}',
    tests: [
      {
        name: 'counts the busiest moment',
        expression: 'roomsNeeded([[0, 30], [5, 10], [15, 20]])',
        expected: 2,
      },
      {
        name: 'shares a room when one meeting ends as another starts',
        expression: 'roomsNeeded([[1, 2], [2, 3]])',
        expected: 1,
      },
      {
        name: 'counts meetings that all cover the same moment',
        expression: 'roomsNeeded([[1, 10], [2, 9], [3, 8]])',
        expected: 3,
      },
      {
        name: 'handles input that does not arrive in order',
        expression: 'roomsNeeded([[15, 20], [0, 30], [5, 10]])',
        expected: 2,
      },
      {
        name: 'returns 1 when nothing overlaps',
        expression: 'roomsNeeded([[1, 2], [3, 4], [5, 6]])',
        expected: 1,
      },
      {
        name: 'compares times as numbers, not as strings',
        expression: 'roomsNeeded([[1, 3], [2, 20], [4, 5]])',
        expected: 2,
      },
      { name: 'handles a single meeting', expression: 'roomsNeeded([[1, 5]])', expected: 1 },
      { name: 'handles an empty schedule', expression: 'roomsNeeded([])', expected: 0 },
    ],
    reference:
      'function roomsNeeded(meetings) {\n  const starts = meetings.map(([start]) => start).sort((a, b) => a - b);\n  const ends = meetings.map(([, end]) => end).sort((a, b) => a - b);\n  let open = 0;\n  let best = 0;\n  let closed = 0;\n  for (const start of starts) {\n    while (closed < ends.length && ends[closed] <= start) {\n      closed += 1;\n      open -= 1;\n    }\n    open += 1;\n    if (open > best) best = open;\n  }\n  return best;\n}',
    hints: [
      'The answer is about a moment in the day, not about a pair of meetings.',
      'Take the meetings in order of start, and keep a count of how many are still running when each one begins.',
      'The starts and the ends can be sorted apart from each other: every start opens a room, and every end at or before it frees one.',
    ],
    explanation:
      'The answer is the busiest instant rather than the worst pair, so comparing every meeting against every other one is O(n^2) and answers a question nobody asked. Sorting the starts and the ends separately is what decouples them: walk the starts in order, release every end at or before the current start, and the running count of open rooms peaks at the answer. Splitting the ends away from their own starts is the move that looks wrong and is not, because you only ever need how many have finished, never which ones. `ends[closed] <= start` rather than `<` is the convention this rep picked, and it is the difference between a room freeing at 2 and staying booked through it.',
  }),

  /* Traversal: a queue answers how far, a stack answers how deep, a set is what ends a cycle. */
  codeProblem({
    slug: 'dsa-shortest-hops',
    title: 'Fewest hops between two nodes',
    category: 'dsa-patterns',
    difficulty: 'medium',
    relevance: 'foundational',
    prompt: md(
      'A graph is an object of node ids to the ids they link to, every node a key, including the',
      'ones that link nowhere. `site` above is one.',
      '',
      'Return the number of hops on the shortest route from `from` to `to`. A node is 0 hops from',
      'itself. Return `null` when there is no route, and when either id is not in the graph.'
    ),
    starter: 'function hops(graph, from, to) {\n  \n}',
    setup: md(
      '// A small site and what each page links to. Every page is a key,',
      '// including the ones that link nowhere.',
      'const site = {',
      "  home: ['blog', 'docs'],",
      "  blog: ['archive'],",
      "  archive: ['api'],",
      "  docs: ['api'],",
      "  api: ['home'],",
      '  guides: [],',
      '};'
    ),
    tests: [
      {
        name: 'takes the shorter of two routes',
        expression: "hops(site, 'home', 'api')",
        expected: 2,
      },
      {
        name: 'returns 0 for the node you start from',
        expression: "hops(site, 'home', 'home')",
        expected: 0,
      },
      {
        name: 'follows a link back to an earlier page without hanging',
        expression: "hops(site, 'api', 'blog')",
        expected: 2,
      },
      {
        name: 'returns null when nothing leads to the target',
        expression: "hops(site, 'home', 'guides')",
        expectedCode: 'null',
      },
      {
        name: 'returns null from a page that links nowhere',
        expression: "hops(site, 'guides', 'home')",
        expectedCode: 'null',
      },
      {
        name: 'returns null for an id the graph does not have',
        expression: "hops(site, 'home', 'shop')",
        expectedCode: 'null',
      },
      {
        name: 'handles a graph of one node',
        expression: "hops({ only: [] }, 'only', 'only')",
        expected: 0,
      },
      {
        name: 'handles an empty graph',
        expression: "hops({}, 'home', 'api')",
        expectedCode: 'null',
      },
    ],
    reference:
      'function hops(graph, from, to) {\n  if (graph[from] === undefined || graph[to] === undefined) return null;\n  const seen = new Set([from]);\n  const queue = [[from, 0]];\n  for (let i = 0; i < queue.length; i += 1) {\n    const [node, distance] = queue[i];\n    if (node === to) return distance;\n    for (const next of graph[node]) {\n      if (!seen.has(next)) {\n        seen.add(next);\n        queue.push([next, distance + 1]);\n      }\n    }\n  }\n  return null;\n}',
    hints: [
      'The first route you find is not always the shortest one.',
      'Take nodes in the order you reach them, so everything one hop away is done before anything two hops away.',
      'A link back to an earlier node runs forever without a set of the nodes you have already queued.',
    ],
    explanation: md(
      diagram(
        "hops(site, 'home', 'api')",
        '',
        '  breadth first, a layer at a time    depth first, a route at a time',
        '    0   home                          home -> blog -> archive -> api    3',
        '    1   blog, docs                    home -> docs -> api               2',
        '    2   archive, api    <- found, 2   both walked, then take the smaller'
      ),
      '',
      'A queue is what makes the answer the shortest one: everything one hop out comes off before anything two hops out, so the first time you meet the target you are already on a shortest route and can stop. Going depth-first hands you the length of whichever route it happened to walk, which here is 3 rather than 2, so it has to walk every route and take the smallest. The visited set is not a speed-up: `api` links back to `home`, and without it the walk never ends. This argument dies the moment edges have weights, because a two-hop route can then be cheaper than a one-hop one, and that is where Dijkstra starts.'
    ),
  }),

  codeProblem({
    slug: 'dsa-reachable-nodes',
    title: 'Everything reachable, in visit order',
    category: 'dsa-patterns',
    difficulty: 'easy',
    relevance: 'foundational',
    prompt: md(
      '`services` above is a graph: node ids to the ids they call, every node a key, and each',
      "node's neighbours listed in the order to visit them.",
      '',
      'Return every node reachable from `start`, `start` included, in the order a breadth-first walk',
      'reaches them. A node reachable two ways appears once. Return `[]` when `start` is not in the',
      'graph.'
    ),
    starter: 'function reachable(graph, start) {\n  \n}',
    setup: md(
      '// Services and what each one calls. Neighbours are listed in the order a',
      '// traversal should visit them.',
      'const services = {',
      "  api: ['auth', 'billing'],",
      "  auth: ['users'],",
      "  billing: ['users', 'ledger'],",
      '  users: [],',
      "  ledger: ['api'],",
      "  reports: ['users'],",
      '};'
    ),
    tests: [
      {
        name: 'visits the nearest nodes first',
        expression: "reachable(services, 'api')",
        expected: ['api', 'auth', 'billing', 'users', 'ledger'],
      },
      {
        name: 'lists a node once even when two others point at it',
        expression:
          "reachable({ app: ['left', 'right'], left: ['shared'], right: ['shared'], shared: [] }, 'app')",
        expected: ['app', 'left', 'right', 'shared'],
      },
      {
        name: 'follows a cycle without repeating a node',
        expression: "reachable({ north: ['east'], east: ['south'], south: ['north'] }, 'north')",
        expected: ['north', 'east', 'south'],
      },
      {
        name: 'leaves out what cannot be reached',
        expression: "reachable(services, 'reports')",
        expected: ['reports', 'users'],
      },
      {
        name: 'handles a node that calls nothing',
        expression: "reachable(services, 'users')",
        expected: ['users'],
      },
      {
        name: 'returns an empty list for an id the graph does not have',
        expression: "reachable(services, 'search')",
        expected: [],
      },
      {
        name: 'handles an empty graph',
        expression: "reachable({}, 'api')",
        expected: [],
      },
    ],
    reference:
      'function reachable(graph, start) {\n  if (graph[start] === undefined) return [];\n  const seen = new Set([start]);\n  const order = [start];\n  for (let i = 0; i < order.length; i += 1) {\n    for (const next of graph[order[i]]) {\n      if (!seen.has(next)) {\n        seen.add(next);\n        order.push(next);\n      }\n    }\n  }\n  return order;\n}',
    hints: [
      'The queue you take nodes off is the answer, in order.',
      'Two nodes can point at the same third one, so a node can be queued twice before it is ever visited.',
      'Mark a node as seen when you queue it, not when you take it off the queue.',
    ],
    explanation:
      'Marking a node when it goes into the queue rather than when it comes out is the whole of this: `users` is called by two services, so a walk that marks on the way out queues it twice and lists it twice. The set is also what makes a cycle finite, since `ledger` calls back to `api`. Reading the array with an index instead of shifting off the front is what lets the queue and the answer be the same list, which is most of why this version is short. Depth-first reaches the same nodes and returns them in an order that says nothing about distance, which is fine when you only want the set and wrong the moment somebody reads the order as nearness.',
  }),

  codeProblem({
    slug: 'dsa-import-cycle',
    title: 'Find an import cycle',
    category: 'dsa-patterns',
    difficulty: 'hard',
    relevance: 'occasional',
    prompt: md(
      '`modules` above maps each module to the modules it imports. Every module is a key, including',
      'the ones that import nothing.',
      '',
      'Return true when following imports from some module leads back to that same module, false',
      'when no module can reach itself.'
    ),
    starter: 'function hasImportCycle(modules) {\n  \n}',
    setup: md(
      '// Modules and what each one imports. Every module is a key, including the',
      '// ones that import nothing.',
      'const modules = {',
      "  app: ['auth', 'billing'],",
      "  auth: ['config'],",
      "  billing: ['config', 'invoice'],",
      '  config: [],',
      "  invoice: ['billing'],",
      '};'
    ),
    tests: [
      {
        name: 'finds a cycle between two modules',
        expression: 'hasImportCycle(modules)',
        expected: true,
      },
      {
        name: 'does not call a shared import a cycle',
        expression:
          "hasImportCycle({ app: ['auth', 'billing'], auth: ['config'], billing: ['config'], config: [] })",
        expected: false,
      },
      {
        name: 'finds a module that imports itself',
        expression: "hasImportCycle({ app: ['app'] })",
        expected: true,
      },
      {
        name: 'finds a cycle nothing else imports',
        expression: "hasImportCycle({ app: [], jobs: ['queue'], queue: ['jobs'] })",
        expected: true,
      },
      {
        name: 'returns false for a chain that ends',
        expression: "hasImportCycle({ app: ['auth'], auth: ['db'], db: [] })",
        expected: false,
      },
      {
        name: 'handles a single module',
        expression: 'hasImportCycle({ app: [] })',
        expected: false,
      },
      { name: 'handles an empty graph', expression: 'hasImportCycle({})', expected: false },
    ],
    reference:
      'function hasImportCycle(modules) {\n  const done = new Set();\n  const onPath = new Set();\n  const visit = (name) => {\n    if (onPath.has(name)) return true;\n    if (done.has(name)) return false;\n    onPath.add(name);\n    for (const next of modules[name]) {\n      if (visit(next)) return true;\n    }\n    onPath.delete(name);\n    done.add(name);\n    return false;\n  };\n  return Object.keys(modules).some((name) => visit(name));\n}',
    hints: [
      'A module you have already checked is not the same as a module you are in the middle of checking.',
      'Two modules importing the same third one is not a cycle, so one visited set says true too often.',
      'Keep the modules on the route you are currently walking in a set of their own, and take one out when you finish with it.',
    ],
    explanation:
      'A visited set answers "have I been here", and a cycle asks "am I here right now", which are different questions: `auth` and `billing` both import `config`, so treating any second visit as a cycle reports one on a graph that has none. Two sets is the fix, one for the modules on the route you are walking and one for the modules you have finished with, and the line that decides it is removing a module from the first when its imports are done. Drop the finished set and the answer stays right while the walk re-explores every shared subtree, which goes exponential on a chain of diamonds. Start from every module, not just the first: a cycle that nothing imports is still a cycle, and it is the one a bundler finds after you have convinced yourself the entry point is clean.',
  }),

  /* Monotonic stack: hold what is still waiting for an answer, and pop it when the answer lands. */
  codeProblem({
    slug: 'dsa-next-greater',
    title: 'Next greater value',
    category: 'dsa-patterns',
    difficulty: 'medium',
    relevance: 'foundational',
    prompt: md(
      'For each value, return the next value to its right that is larger than it, or `null` when',
      'there is none.',
      '',
      'Equal values do not count as larger. Do not compare every pair: each value should be looked',
      'at a constant number of times.'
    ),
    starter: 'function nextGreater(values) {\n  \n}',
    tests: [
      {
        name: 'finds the next larger value',
        expression: 'nextGreater([2, 1, 3])',
        expected: [3, 3, null],
      },
      {
        name: 'answers several waiting values at once',
        expression: 'nextGreater([5, 4, 3, 6])',
        expected: [6, 6, 6, null],
      },
      {
        name: 'does not count an equal value as larger',
        expression: 'nextGreater([2, 2, 3])',
        expected: [3, 3, null],
      },
      {
        name: 'returns null throughout a descending array',
        expression: 'nextGreater([3, 2, 1])',
        expected: [null, null, null],
      },
      {
        name: 'handles negative values',
        expression: 'nextGreater([-3, -5, -1])',
        expected: [-1, -1, null],
      },
      { name: 'handles a single element', expression: 'nextGreater([5])', expected: [null] },
      { name: 'handles an empty array', expression: 'nextGreater([])', expected: [] },
    ],
    reference:
      'function nextGreater(values) {\n  const out = values.map(() => null);\n  const stack = [];\n  for (let i = 0; i < values.length; i += 1) {\n    while (stack.length > 0 && values[stack[stack.length - 1]] < values[i]) {\n      out[stack.pop()] = values[i];\n    }\n    stack.push(i);\n  }\n  return out;\n}',
    hints: [
      'One larger value can answer more than one earlier value at a time.',
      'Keep the values still waiting for an answer, and notice they are always in descending order.',
      'Store indices rather than values, so you know where to write an answer when one is settled.',
    ],
    explanation: md(
      diagram(
        '[5, 4, 3, 6]',
        '',
        '  read   stack, top on the right   answered',
        '     5   5                         -',
        '     4   5 4                       -',
        '     3   5 4 3                     -',
        '     6   6                         3, 4 and 5, all on one read',
        '   end   6                         nothing is larger than 6 -> null',
        '',
        '  [6, 6, 6, null]'
      ),
      '',
      'The stack holds exactly the values still waiting for an answer, and they come out in descending order for free, because anything smaller than a value to its left would already have been settled by it. A new value settles every waiting value it beats, and each of those pops once and never returns, which is why the inner loop does not make this O(n^2) the way it looks like it should. Comparing every pair is the O(n^2) version and re-reads the same tail for every value. Popping on `<` rather than `<=` is what keeps "larger" strict: with `<=` an equal value settles the one before it, and the answer comes back as the duplicate instead of the next genuinely larger value.'
    ),
  }),

  codeProblem({
    slug: 'dsa-days-until-warmer',
    title: 'Days until it gets warmer',
    category: 'dsa-patterns',
    difficulty: 'medium',
    relevance: 'occasional',
    prompt: md(
      '`temperatures[i]` is the temperature on day `i`. For each day, return how many days you wait',
      'for a warmer one, and 0 when no warmer day follows.',
      '',
      'The same temperature is not warmer. One pass.'
    ),
    starter: 'function daysUntilWarmer(temperatures) {\n  \n}',
    tests: [
      {
        name: 'counts the wait to the next warmer day',
        expression: 'daysUntilWarmer([30, 40, 50, 60])',
        expected: [1, 1, 1, 0],
      },
      {
        name: 'looks past a cold spell',
        expression: 'daysUntilWarmer([73, 74, 75, 71, 69, 72, 76, 73])',
        expected: [1, 1, 4, 2, 1, 1, 0, 0],
      },
      {
        name: 'does not count a repeated temperature as warmer',
        expression: 'daysUntilWarmer([30, 30, 31])',
        expected: [2, 1, 0],
      },
      {
        name: 'returns 0 when it only gets colder',
        expression: 'daysUntilWarmer([50, 40, 30])',
        expected: [0, 0, 0],
      },
      { name: 'handles a single day', expression: 'daysUntilWarmer([70])', expected: [0] },
      { name: 'handles an empty array', expression: 'daysUntilWarmer([])', expected: [] },
    ],
    reference:
      'function daysUntilWarmer(temperatures) {\n  const out = temperatures.map(() => 0);\n  const stack = [];\n  for (let i = 0; i < temperatures.length; i += 1) {\n    while (stack.length > 0 && temperatures[stack[stack.length - 1]] < temperatures[i]) {\n      const day = stack.pop();\n      out[day] = i - day;\n    }\n    stack.push(i);\n  }\n  return out;\n}',
    hints: [
      'The answer is a distance, so what you hold has to say where a day was, not how warm it was.',
      'Push the day and leave it there until a warmer day turns up.',
      'A warmer day settles every colder day still waiting, and the wait is the gap between the two indices.',
    ],
    explanation:
      'This is the previous shape with the payload changed, and it is the version that makes the stack obvious: what you hold is indices, and the answer falls out as `i - day` the moment a warmer day pops one. Days still on the stack at the end never got a warmer day, which is why the array starts full of zeroes rather than being patched afterwards. Scanning forward from each day is O(n^2) and repeats comparisons the stack only makes once. Popping on `<` leaves an equal temperature waiting, which is what the prompt asks for; `<=` settles it and reports a wait to a day that is no warmer.',
  }),

  codeProblem({
    slug: 'dsa-window-maxima',
    title: 'Maximum of every window',
    category: 'dsa-patterns',
    difficulty: 'hard',
    relevance: 'occasional',
    prompt: md(
      'Return the maximum of every window of `k` consecutive values, left to right. `k` is at least',
      '1.',
      '',
      'Return `[]` when the array is shorter than `k`. Every value should be added and removed at',
      'most once, so no rescanning a window.'
    ),
    starter: 'function windowMaxima(values, k) {\n  \n}',
    tests: [
      {
        name: 'reports the maximum of each window',
        expression: 'windowMaxima([1, 3, -1, -3, 5, 3, 6, 7], 3)',
        expected: [3, 3, 5, 5, 6, 7],
      },
      {
        name: 'drops the maximum once it falls out of the window',
        expression: 'windowMaxima([5, 1, 2, 3], 2)',
        expected: [5, 2, 3],
      },
      {
        name: 'keeps a repeated maximum until both copies have left',
        expression: 'windowMaxima([4, 4, 1], 2)',
        expected: [4, 4],
      },
      {
        name: 'takes the whole array when k is its length',
        expression: 'windowMaxima([2, 7, 3], 3)',
        expected: [7],
      },
      {
        name: 'returns every value when k is 1',
        expression: 'windowMaxima([2, 7, 3], 1)',
        expected: [2, 7, 3],
      },
      {
        name: 'handles negative values',
        expression: 'windowMaxima([-5, -2, -8], 2)',
        expected: [-2, -2],
      },
      {
        name: 'returns an empty array when the array is shorter than k',
        expression: 'windowMaxima([1, 2], 5)',
        expected: [],
      },
      { name: 'handles an empty array', expression: 'windowMaxima([], 2)', expected: [] },
    ],
    reference:
      'function windowMaxima(values, k) {\n  const out = [];\n  const deque = [];\n  for (let i = 0; i < values.length; i += 1) {\n    while (deque.length > 0 && values[deque[deque.length - 1]] <= values[i]) deque.pop();\n    deque.push(i);\n    if (deque[0] <= i - k) deque.shift();\n    if (i >= k - 1) out.push(values[deque[0]]);\n  }\n  return out;\n}',
    hints: [
      'A value with a larger value after it can never be the answer to any later window.',
      'Keep the candidates in descending order, and drop the ones a new value has beaten.',
      'Hold indices rather than values: the front of the line leaves by position, not by size.',
    ],
    explanation:
      'What you keep is not the window, it is the candidates: a value with a larger one after it can never be the maximum of a later window, so it goes the moment that larger value arrives, and what is left is descending with the answer at the front. Both ends move, which is what makes this a deque rather than a stack, and holding indices is what lets the front be evicted by position once the window slides past it. Rescanning each window is O(n * k) and re-reads k - 1 values it just read; here every index is pushed once and popped once, so the pass is O(n) despite the inner loop. A running sum over a fixed window needs none of this, and the difference is the whole reason: a sum can be undone by subtraction when a value leaves, and a maximum cannot.',
  }),

  /* Heaps: the smallest of the k best is the only value you ever need in reach. */
  codeProblem({
    slug: 'dsa-heap-push-pop',
    title: 'Push and pop a binary heap',
    category: 'dsa-patterns',
    difficulty: 'hard',
    relevance: 'foundational',
    prompt: md(
      'A binary min-heap is an array where the children of index `i` sit at `2i + 1` and `2i + 2`,',
      'and no child is ever smaller than its parent.',
      '',
      'Write `push`, which adds a value, and `pop`, which removes and returns the smallest. Both',
      'change the array in place and leave a valid heap behind. `pop` on an empty heap returns',
      '`undefined`. Neither may sort. The tests use `isHeap` and `drain` above.'
    ),
    starter: 'function push(heap, value) {\n  \n}\n\nfunction pop(heap) {\n  \n}',
    setup: md(
      '// isHeap checks the property. drain pushes every value, then pops until',
      '// the heap is empty.',
      'function isHeap(heap) {',
      '  return heap.every((value, i) =>',
      '    [heap[2 * i + 1], heap[2 * i + 2]].every((child) => child === undefined || value <= child)',
      '  );',
      '}',
      '',
      'function drain(values) {',
      '  const heap = [];',
      '  for (const value of values) push(heap, value);',
      '  return values.map(() => pop(heap));',
      '}'
    ),
    tests: [
      {
        name: 'keeps the smallest value at the root',
        expression:
          '(() => { const heap = []; for (const v of [5, 3, 8, 1]) push(heap, v); return heap[0]; })()',
        expected: 1,
      },
      {
        name: 'leaves a valid heap after every push',
        expression:
          '(() => { const heap = []; return [9, 4, 7, 1, 8, 2].every((v) => { push(heap, v); return isHeap(heap); }); })()',
        expected: true,
      },
      {
        name: 'pops the values in ascending order',
        expression: 'drain([5, 3, 8, 1, 9, 2])',
        expected: [1, 2, 3, 5, 8, 9],
      },
      {
        name: 'handles duplicate values',
        expression: 'drain([2, 1, 2, 1])',
        expected: [1, 1, 2, 2],
      },
      {
        name: 'leaves a valid heap after popping the root',
        expression:
          '(() => { const heap = []; for (const v of [6, 2, 9, 1, 7, 3]) push(heap, v); pop(heap); return isHeap(heap) && heap.length === 5; })()',
        expected: true,
      },
      {
        name: 'empties a heap of one value',
        expression:
          '(() => { const heap = []; push(heap, 4); return [pop(heap), heap.length]; })()',
        expected: [4, 0],
      },
      {
        name: 'returns undefined for an empty heap',
        expression: 'pop([])',
        expectedCode: 'undefined',
      },
    ],
    reference:
      'function push(heap, value) {\n  heap.push(value);\n  let i = heap.length - 1;\n  while (i > 0) {\n    const parent = Math.floor((i - 1) / 2);\n    if (heap[parent] <= heap[i]) break;\n    [heap[i], heap[parent]] = [heap[parent], heap[i]];\n    i = parent;\n  }\n}\n\nfunction pop(heap) {\n  const smallest = heap[0];\n  const last = heap.pop();\n  if (heap.length === 0) return smallest;\n  heap[0] = last;\n  let i = 0;\n  for (;;) {\n    const left = 2 * i + 1;\n    const right = left + 1;\n    let next = i;\n    if (left < heap.length && heap[left] < heap[next]) next = left;\n    if (right < heap.length && heap[right] < heap[next]) next = right;\n    if (next === i) return smallest;\n    [heap[i], heap[next]] = [heap[next], heap[i]];\n    i = next;\n  }\n}',
    hints: [
      'A value in the wrong place only has to move along one line: up to the root, or down to a leaf.',
      'A new value goes on the end and climbs while its parent is larger. Popping puts the last value at the root and sinks it.',
      'Sinking, compare against the smaller of the two children. Swapping with the larger one leaves a value above something smaller than it.',
    ],
    explanation:
      'A heap is only ever repaired along one path, which is what makes both operations O(log n): a new value climbs from the end, a replacement root sinks to a leaf, and nothing else in the array can be out of place. Keeping the array sorted instead gives the same `pop` and turns every `push` into an insert that shifts the tail, at O(n) a value. Sinking has to compare against the smaller child rather than the left one, or the swap puts a value above something smaller and breaks the property one level down, where it sits unnoticed until the values come out in the wrong order. The array is the tree, so there are no nodes and no pointers, and `2i + 1` is the entire structure.',
  }),

  codeProblem({
    slug: 'dsa-k-largest',
    title: 'The k largest values',
    category: 'dsa-patterns',
    difficulty: 'medium',
    relevance: 'occasional',
    prompt: md(
      'Return the `k` largest values, largest first. `k` can be larger than the array, and',
      'duplicates count separately.',
      '',
      'The array can be far longer than `k`, so hold `k` values at a time rather than ordering all',
      'of them. `MinHeap` above is available.'
    ),
    starter: 'function kLargest(values, k) {\n  \n}',
    setup: minHeapSetup,
    tests: [
      {
        name: 'returns the largest values, largest first',
        expression: 'kLargest([3, 1, 5, 12, 2, 11], 3)',
        expected: [12, 11, 5],
      },
      {
        name: 'keeps duplicates',
        expression: 'kLargest([4, 4, 1], 2)',
        expected: [4, 4],
      },
      {
        name: 'compares as numbers, not as strings',
        expression: 'kLargest([9, 10, 2], 2)',
        expected: [10, 9],
      },
      {
        name: 'returns everything when k is larger than the array',
        expression: 'kLargest([2, 5], 9)',
        expected: [5, 2],
      },
      {
        name: 'handles negative values',
        expression: 'kLargest([-5, -1, -9], 2)',
        expected: [-1, -5],
      },
      {
        name: 'returns an empty array when k is 0',
        expression: 'kLargest([1, 2, 3], 0)',
        expected: [],
      },
      { name: 'handles a single element', expression: 'kLargest([7], 1)', expected: [7] },
      { name: 'handles an empty array', expression: 'kLargest([], 3)', expected: [] },
    ],
    reference:
      'function kLargest(values, k) {\n  const heap = new MinHeap((a, b) => a - b);\n  for (const value of values) {\n    heap.push(value);\n    if (heap.size > k) heap.pop();\n  }\n  const out = [];\n  while (heap.size > 0) out.push(heap.pop());\n  return out.reverse();\n}',
    hints: [
      'You never need more than k values in hand at once.',
      'Keep the k best seen so far. The one to throw away is the smallest of them.',
      'A min-heap hands you that smallest without looking at the rest: push every value, and pop as soon as the heap holds more than k.',
    ],
    explanation: md(
      diagram(
        '[3, 1, 5, 12, 2, 11], k = 3',
        '',
        '  arrives   holding       smallest held   dropped',
        '        3   {3}           3',
        '        1   {1, 3}        1',
        '        5   {1, 3, 5}     1',
        '       12   {3, 5, 12}    3             1',
        '        2   {3, 5, 12}    3             2    in and straight back out',
        '       11   {5, 11, 12}   5             3',
        '',
        '  [12, 11, 5]'
      ),
      '',
      'The smallest of the k best is the only value you ever compare against, and a min-heap hands it over without touching the rest, so each value costs O(log k) and the pass is O(n log k) in O(k) space. Sorting the whole array is O(n log n) and holds all of it, which is the wrong shape when k is 10 and n is a million, and impossible when the values arrive one at a time and there is no array to sort. `sort()` with no comparator is the other cost of that route: it compares as strings, so 10 sorts before 9. Popping only once the heap is over k is what pins the memory at k rather than n, and it is the line that gets dropped.'
    ),
  }),

  codeProblem({
    slug: 'dsa-merge-k-sorted',
    title: 'Merge k sorted lists',
    category: 'dsa-patterns',
    difficulty: 'hard',
    relevance: 'occasional',
    prompt: md(
      'Merge `lists`, each already sorted ascending, into one sorted array. Keep duplicates, and',
      'expect some lists to be empty.',
      '',
      'The lists are already in order, and the answer should not throw that away by sorting again.',
      '`MinHeap` above is available.'
    ),
    starter: 'function mergeLists(lists) {\n  \n}',
    setup: minHeapSetup,
    tests: [
      {
        name: 'merges three lists into one',
        expression: 'mergeLists([[1, 4, 7], [2, 3, 8], [5, 6]])',
        expected: [1, 2, 3, 4, 5, 6, 7, 8],
      },
      {
        name: 'keeps duplicates',
        expression: 'mergeLists([[1, 2], [2, 3]])',
        expected: [1, 2, 2, 3],
      },
      {
        name: 'handles lists of very different lengths',
        expression: 'mergeLists([[1], [2, 3, 4, 5]])',
        expected: [1, 2, 3, 4, 5],
      },
      {
        name: 'skips the empty lists',
        expression: 'mergeLists([[], [1, 2], []])',
        expected: [1, 2],
      },
      {
        name: 'compares as numbers, not as strings',
        expression: 'mergeLists([[2, 10], [3, 20]])',
        expected: [2, 3, 10, 20],
      },
      {
        name: 'handles negative values',
        expression: 'mergeLists([[-5, 0], [-2]])',
        expected: [-5, -2, 0],
      },
      { name: 'handles a single list', expression: 'mergeLists([[3, 4]])', expected: [3, 4] },
      { name: 'handles no lists at all', expression: 'mergeLists([])', expected: [] },
    ],
    reference:
      'function mergeLists(lists) {\n  const heap = new MinHeap((a, b) => a.value - b.value);\n  lists.forEach((list, from) => {\n    if (list.length > 0) heap.push({ value: list[0], from, at: 0 });\n  });\n  const out = [];\n  while (heap.size > 0) {\n    const { value, from, at } = heap.pop();\n    out.push(value);\n    const next = at + 1;\n    if (next < lists[from].length) heap.push({ value: lists[from][next], from, at: next });\n  }\n  return out;\n}',
    hints: [
      'The next value out is the head of one of the lists, and the only question is which one.',
      'Checking every head each time costs k comparisons a value. Keep the heads somewhere that answers it in one step.',
      'Push one entry per list, and each time you take one out, push the next value from the list it came from.',
    ],
    explanation:
      'Only the heads compete, so the job is picking the smallest of k values n times, and a heap turns that pick from k comparisons into one: O(n log k) against O(n * k) for scanning the heads. Each entry has to carry which list it came from, because taking a value out is what lets the next one in. Concatenating and sorting is O(n log n), throws away the ordering you were handed, and needs the whole input at once, which the heap does not: this is the shape that merges sorted files or paginated sources too big to hold. The two-pointer merge is the k = 2 case and does not generalise by repetition, since merging one list into the result at a time re-walks everything already merged.',
  }),

  /* Backtracking: choose, recurse, undo. The undo is the line that gets left out. */
  codeProblem({
    slug: 'dsa-subsets',
    title: 'Every subset of a list',
    category: 'dsa-patterns',
    difficulty: 'medium',
    relevance: 'occasional',
    prompt: md(
      'Return every subset of `values`, which are distinct numbers. The empty subset counts, so n',
      'values give 2^n subsets.',
      '',
      'Any order is fine: the tests compare through `canon` above, which sorts each subset and then',
      'sorts the list.'
    ),
    starter: 'function subsets(values) {\n  \n}',
    setup: canonSetup,
    tests: [
      {
        name: 'returns all eight subsets of three values',
        expression: 'canon(subsets([1, 2, 3]))',
        expected: [[], [1], [1, 2], [1, 2, 3], [1, 3], [2], [2, 3], [3]],
      },
      {
        name: 'takes a value back off before trying the next one',
        expression: 'canon(subsets([1, 2]))',
        expected: [[], [1], [1, 2], [2]],
      },
      {
        name: 'stores a copy of each subset rather than the list it is building',
        expression: 'new Set(subsets([1, 2])).size',
        expected: 4,
      },
      {
        name: 'handles negative values',
        expression: 'canon(subsets([-1, 2]))',
        expected: [[], [-1], [-1, 2], [2]],
      },
      { name: 'handles a single value', expression: 'canon(subsets([7]))', expected: [[], [7]] },
      { name: 'handles an empty list', expression: 'subsets([])', expected: [[]] },
    ],
    reference:
      'function subsets(values) {\n  const out = [];\n  const path = [];\n  const walk = (from) => {\n    out.push([...path]);\n    for (let i = from; i < values.length; i += 1) {\n      path.push(values[i]);\n      walk(i + 1);\n      path.pop();\n    }\n  };\n  walk(0);\n  return out;\n}',
    hints: [
      'Every value is either in a subset or it is not, and that one choice splits the answer in two.',
      'Keep one list of what you have taken so far, and record a copy of it at every step.',
      'Take the last value back off that list before trying the next one, or it leaks into the branch beside it.',
    ],
    explanation: md(
      diagram(
        'subsets([1, 2, 3])',
        '',
        '  path        action        recorded',
        '  []          -             []',
        '  [1]         take 1        [1]',
        '  [1, 2]      take 2        [1, 2]',
        '  [1, 2, 3]   take 3        [1, 2, 3]',
        '  [1, 2]      put 3 back',
        '  [1]         put 2 back',
        '  [1, 3]      take 3        [1, 3]      right only because 2 went back',
        '  [1]         put 3 back',
        '  []          put 1 back',
        '  [2]         take 2        [2]         and on, to eight in all'
      ),
      '',
      'Three lines carry the pattern: take a value, recurse on what is left, put it back. Putting it back is the one that gets dropped, and dropping it does not make the answer slow, it makes it wrong, because the list you are building leaks into the branch beside it. Recording `[...path]` rather than `path` matters for the same reason, since `path` keeps changing after you push it and every entry ends up holding whatever it held last. Doubling a list instead, starting from `[[]]` and extending everything by each value in turn, is shorter and just as correct here, and it stops being available the moment a constraint means a branch has to be abandoned part way down.'
    ),
  }),

  codeProblem({
    slug: 'dsa-seating-orders',
    title: 'Seating orders that keep the peace',
    category: 'dsa-patterns',
    difficulty: 'medium',
    relevance: 'occasional',
    prompt: md(
      '`guests` sit in a row in any order, and `feuds` lists pairs who must not sit next to each',
      'other, either way round. Return how many orders of all the guests break no feud.',
      '',
      'Names are distinct, and a feud can name somebody who is not coming. Return 0 when there are no',
      'guests. Reject a seat the moment it breaks a feud rather than building every order and',
      'filtering.'
    ),
    starter: 'function seatingCount(guests, feuds) {\n  \n}',
    setup: md(
      '// The guest list, and the pairs who will not sit next to each other.',
      "const guests = ['ana', 'ben', 'cass', 'dev', 'eli'];",
      'const feuds = [',
      "  ['ana', 'ben'],",
      "  ['cass', 'dev'],",
      '];'
    ),
    tests: [
      {
        name: 'counts the orders that keep both feuds apart',
        expression: 'seatingCount(guests, feuds)',
        expected: 48,
      },
      {
        name: 'counts every order when nobody feuds',
        expression: "seatingCount(['a', 'b', 'c'], [])",
        expected: 6,
      },
      {
        name: 'treats a feud as going both ways',
        expression: "seatingCount(['a', 'b', 'c'], [['b', 'a']])",
        expected: 2,
      },
      {
        name: 'returns 0 when the feuds rule every order out',
        expression: "seatingCount(['a', 'b', 'c'], [['a', 'b'], ['b', 'c'], ['a', 'c']])",
        expected: 0,
      },
      {
        name: 'ignores a feud naming somebody who is not coming',
        expression: "seatingCount(['a', 'b'], [['a', 'z']])",
        expected: 2,
      },
      { name: 'handles a single guest', expression: "seatingCount(['a'], [])", expected: 1 },
      { name: 'handles no guests', expression: 'seatingCount([], [])', expected: 0 },
    ],
    reference:
      'function seatingCount(guests, feuds) {\n  if (guests.length === 0) return 0;\n  const banned = new Set();\n  for (const [a, b] of feuds) {\n    banned.add(`${a}|${b}`);\n    banned.add(`${b}|${a}`);\n  }\n\n  const seated = new Set();\n  const place = (last) => {\n    if (seated.size === guests.length) return 1;\n    let total = 0;\n    for (const guest of guests) {\n      if (seated.has(guest)) continue;\n      if (last !== null && banned.has(`${last}|${guest}`)) continue;\n      seated.add(guest);\n      total += place(guest);\n      seated.delete(guest);\n    }\n    return total;\n  };\n  return place(null);\n}',
    hints: [
      'Sitting a guest down can only break a feud with one other seat: the one beside them.',
      'Build the row a guest at a time, tracking who is already sitting and who you seated last.',
      'Take the guest back out of the seated set on the way back up, or every branch after the first runs out of guests.',
    ],
    explanation:
      'Rejecting a guest the moment they land beside somebody they feud with removes the whole subtree under that seat, which is what makes this a search rather than a filter: a bad pair two seats in kills every order that would have started that way. Building all n! orders and checking each one afterwards builds 3,628,800 arrays at ten guests before a single check runs. The undo is `seated.delete(guest)`, and forgetting it costs nothing in time and everything in correctness, because the first full row uses every guest up, nobody is ever released, and the count comes back as 1. A rota, a seating chart and a layout whose pieces must not collide are all this shape, and what keeps them tractable is that most of the tree is never walked.',
  }),

  codeProblem({
    slug: 'dsa-combination-sum',
    title: 'Every way to make a total',
    category: 'dsa-patterns',
    difficulty: 'hard',
    relevance: 'occasional',
    prompt: md(
      'Return every combination of `amounts` that adds up to `target`. An amount can be used as often',
      'as you like, and the same amounts used the same number of times are one combination, not two.',
      '',
      '`amounts` are distinct positive numbers, and the empty combination adds to 0. Any order is',
      'fine: the tests compare through `canon` above, which sorts each combination and then sorts the',
      'list.'
    ),
    starter: 'function waysToTotal(amounts, target) {\n  \n}',
    setup: canonSetup,
    tests: [
      {
        name: 'finds both ways to reach the total',
        expression: 'canon(waysToTotal([2, 3, 6, 7], 7))',
        expected: [[2, 2, 3], [7]],
      },
      {
        name: 'uses one amount as often as it needs',
        expression: 'canon(waysToTotal([2], 6))',
        expected: [[2, 2, 2]],
      },
      {
        name: 'counts a set of amounts once however it is ordered',
        expression: 'canon(waysToTotal([2, 3], 5))',
        expected: [[2, 3]],
      },
      {
        name: 'finds every combination when there are several',
        expression: 'canon(waysToTotal([2, 3, 5], 8))',
        expected: [
          [2, 2, 2, 2],
          [2, 3, 3],
          [3, 5],
        ],
      },
      {
        name: 'returns nothing when no combination reaches the total',
        expression: 'waysToTotal([2, 4], 7)',
        expected: [],
      },
      {
        name: 'returns the empty combination for a target of 0',
        expression: 'waysToTotal([1, 2], 0)',
        expected: [[]],
      },
      {
        name: 'returns nothing when there are no amounts',
        expression: 'waysToTotal([], 5)',
        expected: [],
      },
    ],
    reference:
      'function waysToTotal(amounts, target) {\n  const out = [];\n  const path = [];\n  const walk = (from, rest) => {\n    if (rest === 0) {\n      out.push([...path]);\n      return;\n    }\n    for (let i = from; i < amounts.length; i += 1) {\n      if (amounts[i] > rest) continue;\n      path.push(amounts[i]);\n      walk(i, rest - amounts[i]);\n      path.pop();\n    }\n  };\n  walk(0, target);\n  return out;\n}',
    hints: [
      'The same amounts in a different order are the same combination, so something has to stop you finding each one twice.',
      'Recurse on how much of the target is left rather than on how much you have spent.',
      'Pass the index you are on, not the next one: staying put reuses an amount, and never looking back is what stops a combination arriving twice.',
    ],
    explanation:
      'Two decisions carry this rep and neither is the recursion itself. Recursing from `i` rather than `i + 1` is what lets an amount be used again; refusing to look back before `i` is what makes `[2, 3]` and `[3, 2]` one combination rather than two. Without that second rule the search finds every ordering of every combination, which is more work to produce and then more work to deduplicate on sorted keys afterwards. Skipping an amount larger than what is left is the prune, and `path.pop()` is the same undo as ever. Enumerating subsets does not answer this at all, since an amount can appear more than once.',
  }),

  /* Memoisation: the recursion is already right, and the cache is what makes it finish. */
  codeProblem({
    slug: 'dsa-fewest-coins',
    title: 'Fewest coins for a total',
    category: 'dsa-patterns',
    difficulty: 'medium',
    relevance: 'occasional',
    prompt: md(
      'Return the fewest coins from `coins` that add up to `target`, using each coin as often as you',
      'like. Return -1 when no combination does.',
      '',
      '`coins` are distinct positive numbers and `target` is 0 or more. Write the recursion first: one',
      'of the tests uses a target the plain recursive version cannot get through.'
    ),
    starter: 'function fewestCoins(coins, target) {\n  \n}',
    tests: [
      {
        name: 'takes the fewest coins, not the biggest ones first',
        expression: 'fewestCoins([1, 3, 4], 6)',
        expected: 2,
      },
      {
        name: 'uses one coin when one fits exactly',
        expression: 'fewestCoins([2, 5], 5)',
        expected: 1,
      },
      { name: 'returns 0 for a target of 0', expression: 'fewestCoins([1, 5], 0)', expected: 0 },
      {
        name: 'returns -1 when no combination adds up',
        expression: 'fewestCoins([5, 7], 3)',
        expected: -1,
      },
      {
        name: 'returns -1 when the coins cannot reach the target at all',
        expression: 'fewestCoins([2, 4], 7)',
        expected: -1,
      },
      {
        name: 'returns -1 when there are no coins',
        expression: 'fewestCoins([], 5)',
        expected: -1,
      },
      {
        name: 'answers a target the plain recursion cannot get through',
        expression: 'fewestCoins([7, 11, 13], 200)',
        expected: 16,
      },
    ],
    reference:
      'function fewestCoins(coins, target) {\n  const best = new Map();\n  const fewest = (rest) => {\n    if (rest === 0) return 0;\n    if (best.has(rest)) return best.get(rest);\n    let found = -1;\n    for (const coin of coins) {\n      if (coin > rest) continue;\n      const below = fewest(rest - coin);\n      if (below !== -1 && (found === -1 || below + 1 < found)) found = below + 1;\n    }\n    best.set(rest, found);\n    return found;\n  };\n  return fewest(target);\n}',
    hints: [
      'The fewest coins for a target is one more than the fewest for whatever is left after taking one coin.',
      'Write that recursion straight, then count how many times it asks about the same remaining amount.',
      'Keep a map from remaining amount to answer: read it before doing any work, write to it before returning.',
    ],
    explanation: md(
      diagram(
        'fewestCoins([1, 3, 4], 6), where every call branches on 1, 3 and 4',
        '',
        '  f(6) -> f(5)  f(3)  f(2)',
        '  f(5) -> f(4)  f(2)  f(1)      f(2) is reached from f(6), f(5) and f(3)',
        '  f(4) -> f(3)  f(1)  f(0)      f(3) is reached from f(6) and f(4)',
        '  f(3) -> f(2)  f(0)            f(1) is reached from f(5), f(4) and f(2)',
        '  f(2) -> f(1)',
        '',
        '  target      plain calls   with the map',
        '       6               24             14',
        '      20           20,736             56',
        '      30        2,550,408             86'
      ),
      '',
      'The recursion is the answer and it is already right: the fewest coins for `rest` is one more than the fewest for `rest - coin`, over every coin that fits. What it is not is finishable, because the same `rest` is reached down thousands of different routes and recomputed from scratch each time; at a target of 200 over 7, 11 and 13 that is 34 seconds against under a millisecond. Memoising is two lines and changes nothing else: return the stored answer for `rest` before doing any work, and store the answer under `rest` before returning it. That collapses the call tree to one piece of work per distinct `rest`, so the cost becomes the target times the number of coins. Taking the largest coin that fits each time is the other tempting answer, and it is wrong rather than slow: from 1, 3 and 4 it makes 6 as 4 + 1 + 1 instead of 3 + 3.'
    ),
  }),

  codeProblem({
    slug: 'dsa-word-break',
    title: 'Split a string into known words',
    category: 'dsa-patterns',
    difficulty: 'medium',
    relevance: 'foundational',
    prompt: md(
      'Return true when `text` can be cut into a run of words from `words`, using each word as often',
      'as you like and leaving nothing over.',
      '',
      'An empty `text` is true, and `words` holds no empty string. `stubborn` above is a string the',
      'plain recursive version cannot get through.'
    ),
    starter: 'function canBreak(text, words) {\n  \n}',
    setup: md(
      '// A three-word dictionary, and a string that splits many ways and never',
      "// lands: 32 a's followed by a b, which is not a word.",
      "const words = ['a', 'aa', 'aaa'];",
      "const stubborn = 'a'.repeat(32) + 'b';"
    ),
    tests: [
      {
        name: 'splits a string made of the words',
        expression: "canBreak('applepie', ['apple', 'pie'])",
        expected: true,
      },
      {
        name: 'backs out of a word that fits but leads nowhere',
        expression: "canBreak('cars', ['car', 'ca', 'rs'])",
        expected: true,
      },
      {
        name: 'returns false when what is left over is not a word',
        expression: "canBreak('applepies', ['apple', 'pie'])",
        expected: false,
      },
      {
        name: 'uses a word as often as it needs',
        expression: "canBreak('aaa', ['a'])",
        expected: true,
      },
      {
        name: 'returns true for an empty string',
        expression: "canBreak('', ['a'])",
        expected: true,
      },
      {
        name: 'returns false when there are no words',
        expression: "canBreak('abc', [])",
        expected: false,
      },
      {
        name: 'finishes a string that splits every way and never lands',
        expression: 'canBreak(stubborn, words)',
        expected: false,
      },
    ],
    reference:
      'function canBreak(text, words) {\n  const known = new Map();\n  const from = (start) => {\n    if (start === text.length) return true;\n    if (known.has(start)) return known.get(start);\n    let works = false;\n    for (const word of words) {\n      if (text.startsWith(word, start) && from(start + word.length)) {\n        works = true;\n        break;\n      }\n    }\n    known.set(start, works);\n    return works;\n  };\n  return from(0);\n}',
    hints: [
      'The first word that fits at the front is not always the word that leads to a split.',
      'Ask one question recursively: can what is left from index `i` onwards be split?',
      'The same index gets asked down many different routes, and the answer never depends on how you got there. Cache it against the index.',
    ],
    explanation:
      "The recursion asks one thing, whether the rest of the string from index `i` can be split, and every word matching at `i` is a branch. Those branches overlap enormously: 32 a's against `a`, `aa` and `aaa` reach that final `b` down 181,997,601 different routes, and every one of them asks the same question at the same index. Caching by index is two lines and collapses those routes into 33 pieces of work, one per position, because how you arrived was never part of the question. Returning on the first word that fits is the other tempting answer and it is wrong rather than slow: `cars` takes `car` and is left with `s`, when `ca` and `rs` were sitting right there.",
  }),

  codeProblem({
    slug: 'dsa-grid-routes',
    title: 'Routes across a grid with blocked cells',
    category: 'dsa-patterns',
    difficulty: 'hard',
    relevance: 'foundational',
    prompt: md(
      '`grid` is an array of strings, one per row, made of `.` for an open cell and `#` for a blocked',
      'one. Return how many routes run from the top-left cell to the bottom-right one, moving only',
      'right or down and never onto a `#`.',
      '',
      'A one-cell open grid has one route, the one that goes nowhere. Return 0 for an empty grid and 0',
      'when either corner is blocked. One of the tests uses a grid the plain recursive version cannot',
      'get through.'
    ),
    starter: 'function routes(grid) {\n  \n}',
    tests: [
      {
        name: 'counts both routes across a 2 by 2 grid',
        expression: "routes(['..', '..'])",
        expected: 2,
      },
      {
        name: 'goes around a blocked cell',
        expression: "routes(['...', '.#.', '...'])",
        expected: 2,
      },
      {
        name: 'returns 0 when nothing gets through',
        expression: "routes(['.#', '#.'])",
        expected: 0,
      },
      {
        name: 'returns 0 when the finish is blocked',
        expression: "routes(['..', '.#'])",
        expected: 0,
      },
      {
        name: 'returns 0 when the start is blocked',
        expression: "routes(['#.', '..'])",
        expected: 0,
      },
      {
        name: 'counts one route across a single open cell',
        expression: "routes(['.'])",
        expected: 1,
      },
      { name: 'handles an empty grid', expression: 'routes([])', expected: 0 },
      {
        name: 'counts the routes across a 16 by 16 grid',
        expression: "routes(Array(16).fill('.'.repeat(16)))",
        expected: 155117520,
      },
    ],
    reference:
      "function routes(grid) {\n  const rows = grid.length;\n  const cols = rows === 0 ? 0 : grid[0].length;\n  if (rows === 0 || cols === 0) return 0;\n\n  const seen = new Map();\n  const from = (row, col) => {\n    if (row >= rows || col >= cols || grid[row][col] === '#') return 0;\n    if (row === rows - 1 && col === cols - 1) return 1;\n    const key = `${row},${col}`;\n    if (seen.has(key)) return seen.get(key);\n    const total = from(row + 1, col) + from(row, col + 1);\n    seen.set(key, total);\n    return total;\n  };\n  return from(0, 0);\n}",
    hints: [
      'The routes from a cell are the routes from the cell below it plus the routes from the cell to its right.',
      'Write that recursion, then count how many times it is asked about a cell in the middle.',
      'Cache the answer against the cell, and make the key say which cell: `${row}${col}` merges (1, 15) with (11, 5).',
    ],
    explanation:
      'Routes from a cell are routes from the cell below plus routes from the cell to the right, which is the entire recurrence. Left alone it makes a call for every route, and a 16 by 16 open grid has 155,117,520 of them, because the middle of the grid is reached down every route that passes through it. The cache is two lines and the only part needing care is the key: it has to name everything the answer depends on, which is the pair, and `${row}${col}` merges (1, 15) with (11, 5) and returns a confidently wrong number rather than a slow one. Filling a table row by row computes exactly the same values and asks you to work out the evaluation order yourself, where the memo gets that order free from the call stack, which is why the recursion is worth writing first even when you mean to end up with the table.',
  }),
];
