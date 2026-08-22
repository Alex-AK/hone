import { code, md, type ProblemDraft } from './types';

export const reactProblems: ProblemDraft[] = [
  {
    slug: 'react-functional-update',
    title: 'Two increments, one increase',
    category: 'react',
    difficulty: 'easy',
    relevance: 'daily',
    type: 'short-text',
    prompt: md(
      'Clicking this button increases the count by **1**, not 2:',
      '',
      code(
        'jsx',
        'const [count, setCount] = useState(0);',
        '',
        'function onClick() {',
        '  setCount(count + 1);',
        '  setCount(count + 1);',
        '}'
      ),
      '',
      'Rewrite the body so it increases by 2. (One line, used twice, is fine.)'
    ),
    graderConfig: {
      accept: [],
      acceptPatterns: ['setCount\\(\\s*\\(?\\s*\\w+\\s*\\)?\\s*=>\\s*\\w+\\s*\\+\\s*1\\s*\\)'],
      closeSubstrings: {
        setcount:
          'Right function. The argument needs to be a function of the previous value, not a number.',
      },
      hints: [
        '`count` is captured from the render that created this handler, so both calls compute the same number.',
        'The setter accepts a function that receives the latest queued value.',
        '`setCount((c) => c + 1);` twice.',
      ],
    },
    canonicalAnswer: 'setCount((c) => c + 1)',
    solution: code(
      'jsx',
      'function onClick() {',
      '  setCount((c) => c + 1);',
      '  setCount((c) => c + 1);',
      '}'
    ),
    explanation:
      '`count` is a **const captured by that render**: both calls read the same `0` and both queue "set it to 1", so the second overwrites the first. The functional form `setCount(c => c + 1)` receives the latest queued value instead of the captured one, so the two updates compose. The rule of thumb: whenever the next state is derived from the previous state, use the updater function. React batches these updates and applies them in order at the end of the event.',
  },

  {
    slug: 'react-index-key',
    title: 'Why index keys break lists',
    category: 'react',
    difficulty: 'medium',
    relevance: 'daily',
    type: 'explain',
    prompt: md(
      'A reviewer flags this in a list where rows can be reordered and deleted:',
      '',
      code('jsx', '{items.map((item, i) => <Row key={i} item={item} />)}'),
      '',
      'Explain what goes wrong and what the key should be.'
    ),
    graderConfig: {
      groups: [
        {
          synonyms: [
            'identity',
            'identif',
            'which',
            'reorder',
            'reuse',
            'wrong',
            'match',
            'position',
          ],
          missingFeedback: 'What does React use the key for when the list changes?',
        },
        {
          synonyms: ['state', 'input', 'focus', 'stale', 'dom'],
          missingFeedback: 'Name a concrete symptom: what gets attached to the wrong row?',
        },
        {
          synonyms: ['id', 'stable', 'unique'],
          missingFeedback: 'What should the key be instead?',
        },
      ],
      hints: [
        'Keys tell React which element in the new list corresponds to which in the old one.',
        'If you delete the first item, every remaining item changes index. React thinks they all changed.',
        'Component state and DOM state (like an input value or focus) stay with the index and end up on the wrong row.',
      ],
    },
    canonicalAnswer:
      'React uses the key to match elements between renders. With an index key, deleting or reordering shifts every index, so React reuses the wrong DOM nodes and component state. An input value or focus ends up on the wrong row. Use a stable unique id from the data instead.',
    solution: code('jsx', '{items.map((item) => <Row key={item.id} item={item} />)}'),
    explanation:
      'A key is React\'s **identity** for an element across renders: same key means "this is the same thing, update it", different key means "unmount and remount". Indexes are positional, so removing the first item renumbers everything and React happily reuses row 0\'s DOM node and state for what is now a different record. Half-typed inputs, checkbox states and focus all move to the wrong row. A stable id from the data fixes it. Index keys are only safe for a list that is static, never reordered and never filtered.',
  },

  {
    slug: 'react-effect-cleanup',
    title: 'Clean up an effect',
    category: 'react',
    difficulty: 'medium',
    relevance: 'daily',
    type: 'explain',
    prompt: md(
      'This subscribes on every mount but the app leaks listeners over time:',
      '',
      code('jsx', 'useEffect(() => {', "  window.addEventListener('resize', onResize);", '}, []);'),
      '',
      'What is missing, and when does React run that missing piece?'
    ),
    graderConfig: {
      groups: [
        {
          synonyms: ['cleanup', 'clean up', 'return', 'removeeventlistener', 'unsubscribe'],
          missingFeedback: 'What should the effect return?',
        },
        {
          synonyms: ['unmount', 'before', 're-run', 'rerun', 'again', 'next'],
          missingFeedback:
            'When does React invoke the cleanup? Say at least one of the two moments.',
        },
      ],
      hints: [
        'An effect can return a function.',
        'React calls that function on unmount, and also before re-running the effect.',
        "`return () => window.removeEventListener('resize', onResize);`",
      ],
    },
    canonicalAnswer:
      'The effect must return a cleanup function that removes the listener. React calls it when the component unmounts, and also before re-running the effect when its dependencies change.',
    solution: code(
      'jsx',
      'useEffect(() => {',
      "  window.addEventListener('resize', onResize);",
      "  return () => window.removeEventListener('resize', onResize);",
      '}, []);'
    ),
    explanation:
      'Whatever an effect returns is its **cleanup**, and React runs it in two situations: before the effect re-runs because a dependency changed, and when the component unmounts. Skipping it leaks listeners, timers, subscriptions and in-flight requests. In development, StrictMode deliberately mounts, unmounts and remounts every component once, precisely so a missing cleanup shows up immediately as a doubled subscription rather than in production weeks later.',
  },

  {
    slug: 'react-derived-state',
    title: 'Copying props into state',
    category: 'react',
    difficulty: 'medium',
    relevance: 'daily',
    type: 'explain',
    prompt: md(
      'A component receives `items` as a prop and does this:',
      '',
      code('jsx', 'const [sorted, setSorted] = useState(sortItems(items));'),
      '',
      'It shows stale data when `items` changes. Explain why, and what to do instead.'
    ),
    graderConfig: {
      groups: [
        {
          synonyms: ['initial', 'first render', 'only once', 'ignored', 'never updates', 'once'],
          missingFeedback: 'When is the argument to useState actually used?',
        },
        {
          synonyms: [
            'during render',
            'derive',
            'calculate',
            'compute',
            'usememo',
            'just compute',
            'no state',
          ],
          missingFeedback: 'What should you do instead of storing it in state?',
        },
      ],
      hints: [
        'The argument to `useState` is only the *initial* value.',
        'On later renders React ignores it entirely and keeps the stored state.',
        'Anything derivable from props should be computed during render, not mirrored into state.',
      ],
    },
    canonicalAnswer:
      'The argument to useState is only the initial value. React ignores it on every later render, so the state keeps the first sort forever. Derive it during render instead: const sorted = sortItems(items), wrapped in useMemo only if the sort is genuinely expensive.',
    solution: code(
      'jsx',
      '// Just derive it:',
      'const sorted = sortItems(items);',
      '',
      '// Only if profiling shows the sort is expensive:',
      'const sorted = useMemo(() => sortItems(items), [items]);'
    ),
    explanation:
      '`useState(initial)` uses its argument **only on the first render**; afterwards React returns the stored value and the expression is discarded (though still evaluated, so it also wastes work). Mirroring props into state creates two sources of truth that drift apart. The fix is to derive during render. Cheap, always correct, impossible to desynchronise. Reach for `useMemo` only when the computation is measurably expensive, and remember it is a performance hint, not a correctness guarantee.',
  },

  {
    slug: 'react-effect-object-dep',
    title: 'An effect that loops forever',
    category: 'react',
    difficulty: 'medium',
    relevance: 'daily',
    type: 'explain',
    prompt: md(
      'This fires an infinite request loop:',
      '',
      code(
        'jsx',
        'const options = { pageSize: 20 };',
        '',
        'useEffect(() => {',
        '  fetchData(options);',
        '}, [options]);'
      ),
      '',
      'Explain the cause and give a fix.'
    ),
    graderConfig: {
      groups: [
        {
          synonyms: [
            'new object',
            'recreated',
            'every render',
            'new reference',
            'identity',
            'reference',
          ],
          missingFeedback: 'What is different about `options` on each render?',
        },
        {
          synonyms: ['object.is', 'reference', 'shallow', 'compares', 'equality', '==='],
          missingFeedback: 'How does React compare dependencies?',
        },
        {
          synonyms: ['usememo', 'move', 'outside', 'primitive', 'pagesize', 'destructure'],
          missingFeedback: 'Name a fix. Hoist it, memoise it, or depend on the primitive instead.',
        },
      ],
      hints: [
        'The object literal is rebuilt on every render.',
        'React compares deps with `Object.is`, which is reference equality for objects.',
        'So the dep always looks new → effect runs → setState → render → new object → …',
      ],
    },
    canonicalAnswer:
      'The object literal is recreated on every render, and React compares dependencies by reference with Object.is, so the dep always looks changed and the effect re-runs forever. Fix it by hoisting the constant object outside the component, memoising it with useMemo, or depending on the primitive [options.pageSize] instead.',
    solution: code(
      'jsx',
      '// Best: it never changes, so hoist it out of the component',
      'const OPTIONS = { pageSize: 20 };',
      '',
      '// Or depend on the primitive',
      'useEffect(() => {',
      '  fetchData({ pageSize });',
      '}, [pageSize]);'
    ),
    explanation:
      'React compares each dependency with `Object.is`, which for objects, arrays and functions means **reference** equality, and a literal written inside the component body is a brand-new reference every render. The effect therefore re-runs, sets state, triggers a render, creates another object, and loops. The fixes in order of preference: hoist truly constant values out of the component, depend on primitives rather than the object wrapping them, or `useMemo`/`useCallback` when the value genuinely depends on props.',
  },

  {
    slug: 'react-controlled-input',
    title: 'A read-only input',
    category: 'react',
    difficulty: 'easy',
    relevance: 'daily',
    type: 'explain',
    prompt: md(
      'Typing in this field does nothing:',
      '',
      code('jsx', 'const [name, setName] = useState("");', '', '<input value={name} />'),
      '',
      'Explain why and what is missing.'
    ),
    graderConfig: {
      groups: [
        {
          synonyms: ['onchange', 'oninput', 'handler'],
          missingFeedback: 'Which prop is missing?',
        },
        {
          synonyms: [
            'controlled',
            'state',
            'setname',
            'source of truth',
            'never changes',
            'state is',
          ],
          missingFeedback:
            'Explain the controlled-input contract: what drives the displayed value?',
        },
      ],
      hints: [
        'A `value` prop makes the input **controlled**: React owns what is displayed.',
        'Every keystroke re-renders with the same state, so the old value is put straight back.',
        'You need `onChange={(e) => setName(e.target.value)}` to feed the state.',
      ],
    },
    canonicalAnswer:
      'Passing value makes it a controlled input, so React always renders the state value; without an onChange handler the state never updates and each keystroke is immediately overwritten. Add onChange={(e) => setName(e.target.value)}.',
    solution: code('jsx', '<input value={name} onChange={(e) => setName(e.target.value)} />'),
    explanation:
      'A **controlled** input takes its displayed value from React state, so the DOM is re-synchronised on every render. Without an `onChange` that writes back to state, your keystroke is replaced by the unchanged state value and the field appears frozen. React warns about exactly this in development. The alternatives are `defaultValue` for an uncontrolled field (the DOM owns the value; read it with a ref) or `readOnly` if you genuinely want it non-editable.',
  },

  {
    slug: 'react-ref-vs-state',
    title: 'useRef versus useState',
    category: 'react',
    difficulty: 'medium',
    relevance: 'daily',
    type: 'explain',
    prompt: md(
      'You need to keep a mutable value across renders. An interval id, but changing it should **not** re-render.',
      '',
      'Which hook, and what is the key behavioural difference from the other one?'
    ),
    graderConfig: {
      groups: [
        {
          synonyms: ['useref'],
          missingFeedback: 'Name the hook.',
        },
        {
          synonyms: ['re-render', 'rerender', 're render', 'render'],
          missingFeedback: 'State the difference in terms of rendering.',
        },
        {
          synonyms: ['.current', 'current'],
          missingFeedback: 'How do you read and write the value it holds?',
        },
      ],
      hints: [
        'One hook stores a value that survives renders without triggering them.',
        '`useRef` returns a stable object; you mutate `ref.current`.',
        'Changing `ref.current` never schedules a render. That is the whole point.',
      ],
    },
    canonicalAnswer:
      'useRef. It returns a stable mutable object whose .current you read and write, and changing it does not trigger a re-render, unlike useState which schedules one on every update.',
    solution: code(
      'jsx',
      'const timerRef = useRef(null);',
      '',
      'useEffect(() => {',
      '  timerRef.current = setInterval(tick, 1000);',
      '  return () => clearInterval(timerRef.current);',
      '}, []);'
    ),
    explanation:
      '`useRef` returns the **same object** on every render, and mutating `.current` neither schedules a render nor is tracked by React, which makes it the right home for timer ids, previous values, and anything the UI does not display. `useState` is for values the UI depends on; updating it re-renders. The corollary: never read or write `ref.current` during render, because React has no way to know it changed and your output would be inconsistent. Refs also hold DOM nodes when passed as the `ref` prop.',
  },

  {
    slug: 'react-lifting-state',
    title: 'Where should the state live?',
    category: 'react',
    difficulty: 'easy',
    relevance: 'daily',
    type: 'short-text',
    prompt: md(
      'Two sibling components need to read and update the same filter value.',
      '',
      'What is the standard React name for the refactor that puts the state where both can reach it?'
    ),
    graderConfig: {
      accept: [
        'lifting state up',
        'lift state up',
        'lifting state',
        'lift the state up',
        'lifting the state up',
        'state lifting',
      ],
      acceptPatterns: ['lift(ing)?\\s+(the\\s+)?state(\\s+up)?'],
      nearMisses: {
        context:
          'Context is one way to distribute it, but the refactor itself has a specific name.',
        redux: 'A store is one option, but the built-in answer has a specific name.',
        'prop drilling':
          'Prop drilling is the *consequence* people complain about, not the refactor.',
      },
      hints: [
        'The state moves to the closest common ancestor.',
        'Three words, the first is a verb ending in -ing.',
      ],
    },
    canonicalAnswer: 'lifting state up',
    solution: md(
      '**Lifting state up**: move the state into the closest common parent and pass the value down as a prop plus a setter (or a callback) back up.',
      '',
      code(
        'jsx',
        'function Parent() {',
        "  const [filter, setFilter] = useState('');",
        '  return (',
        '    <>',
        '      <FilterInput value={filter} onChange={setFilter} />',
        '      <ResultList filter={filter} />',
        '    </>',
        '  );',
        '}'
      )
    ),
    explanation:
      'Lifting state up puts the shared value in the closest common ancestor, making that component the single source of truth while the children become controlled and stateless. Easier to test and reuse. Do it *only as far as necessary*: hoisting state higher than it needs to be re-renders a larger subtree and makes components harder to move. When the distance becomes genuinely painful, that is the signal to reach for Context or a store, not before.',
  },

  {
    slug: 'react-stale-closure',
    title: 'A stale value inside an interval',
    category: 'react',
    difficulty: 'hard',
    relevance: 'occasional',
    type: 'explain',
    prompt: md(
      'This logs `0` forever, no matter how much `count` increases:',
      '',
      code(
        'jsx',
        'const [count, setCount] = useState(0);',
        '',
        'useEffect(() => {',
        '  const id = setInterval(() => console.log(count), 1000);',
        '  return () => clearInterval(id);',
        '}, []);'
      ),
      '',
      'Explain the mechanism and give a fix.'
    ),
    graderConfig: {
      groups: [
        {
          synonyms: ['closure', 'captur', 'closes over', 'snapshot', 'first render'],
          missingFeedback: 'What did the callback capture, and from when?',
        },
        {
          synonyms: ['empty', '[]', 'dependen', 'never re-run', 'never rerun', 'only once'],
          missingFeedback: 'Why is the effect never refreshed with a newer value?',
        },
        {
          synonyms: [
            'ref',
            'add count',
            'dependency array',
            'updater',
            'functional',
            'include count',
          ],
          missingFeedback:
            'Give a fix. Add the dependency, use a ref, or use the functional updater.',
        },
      ],
      hints: [
        'Each render creates a new `count` const and a new callback closing over it.',
        'With `[]`, the effect and its callback are created once, on the first render, where `count` was 0.',
        'Fix by adding `count` to the deps (re-creating the interval), or keep the latest value in a ref.',
      ],
    },
    canonicalAnswer:
      'The interval callback closes over the count from the first render, and the empty dependency array means the effect never re-runs, so that stale snapshot of 0 lives forever. Fix it by adding count to the dependency array so the interval is recreated, by keeping the latest value in a ref, or by using the functional updater form if you only need to update state.',
    solution: code(
      'jsx',
      '// Option 1. Re-create the interval when count changes',
      'useEffect(() => {',
      '  const id = setInterval(() => console.log(count), 1000);',
      '  return () => clearInterval(id);',
      '}, [count]);',
      '',
      '// Option 2. Keep the latest value in a ref, interval stays stable',
      'const countRef = useRef(count);',
      'useEffect(() => { countRef.current = count; }, [count]);',
      'useEffect(() => {',
      '  const id = setInterval(() => console.log(countRef.current), 1000);',
      '  return () => clearInterval(id);',
      '}, []);'
    ),
    explanation:
      "Every render creates fresh consts and fresh closures over them; the interval callback created on the first render permanently sees that render's `count` of `0`. The empty dependency array is what makes it permanent. The effect never re-runs, so no newer closure is ever installed. This is the **stale closure**, the most common React bug after key misuse. Adding the dependency is the honest fix; a ref is the right call when you want a stable subscription that still reads current values.",
  },

  {
    slug: 'react-memo-when',
    title: 'When useMemo actually helps',
    category: 'react',
    difficulty: 'hard',
    relevance: 'occasional',
    type: 'explain',
    prompt: md(
      'A colleague wraps every computed value in `useMemo`, including `const total = a + b;`.',
      '',
      'Explain why that is not free, and name a case where `useMemo` genuinely matters.'
    ),
    graderConfig: {
      groups: [
        {
          synonyms: ['cost', 'overhead', 'not free', 'memory', 'compar', 'slower', 'expense'],
          missingFeedback: 'What does useMemo itself cost on every render?',
        },
        {
          synonyms: [
            'expensive',
            'reference',
            'identity',
            'dependency',
            'memo',
            'stable',
            'effect',
          ],
          missingFeedback:
            'Name a case where it does matter. Expensive work, or a stable reference for a dep/memo child.',
        },
      ],
      hints: [
        '`useMemo` stores the value and the deps, and compares the deps on every render.',
        'For `a + b` the bookkeeping costs more than the addition.',
        'It earns its keep for genuinely expensive computations, or to keep a stable reference for a dependency array or a `React.memo` child.',
      ],
    },
    canonicalAnswer:
      'useMemo is not free. It allocates, stores the deps and compares them on every render, which for a + b costs more than just doing the addition. It matters for genuinely expensive computations, and for keeping a stable object or function reference so that a dependency array or a React.memo child does not see a new value every render.',
    solution: code(
      'jsx',
      '// Not worth it',
      'const total = useMemo(() => a + b, [a, b]);',
      'const total = a + b; // just do this',
      '',
      '// Worth it. Expensive work',
      'const parsed = useMemo(() => parseHugeCsv(text), [text]);',
      '',
      '// Worth it. Stable reference for a memoised child or a dep array',
      'const config = useMemo(() => ({ pageSize }), [pageSize]);'
    ),
    explanation:
      'Every `useMemo` allocates a closure, stores the dependency array and runs a comparison on each render, so for trivial arithmetic the bookkeeping is more expensive than recomputing. It pays off in two situations: the computation is genuinely costly, or you need a **stable reference** so a dependency array or a `React.memo` child does not see a new object every render. Treat it as a targeted fix after measuring, not a default, and note the React Compiler is designed to make most manual memoisation unnecessary.',
  },

  {
    slug: 'react-fetch-race',
    title: 'Out-of-order fetch results',
    category: 'react',
    difficulty: 'hard',
    relevance: 'occasional',
    type: 'explain',
    prompt: md(
      'A search box fetches on every keystroke. Occasionally the results for an older query overwrite a newer one.',
      '',
      code(
        'jsx',
        'useEffect(() => {',
        '  fetch(`/api/search?q=${query}`)',
        '    .then((r) => r.json())',
        '    .then(setResults);',
        '}, [query]);'
      ),
      '',
      'Explain the bug and how the effect cleanup fixes it.'
    ),
    graderConfig: {
      groups: [
        {
          synonyms: [
            'race',
            'out of order',
            'order',
            'slower',
            'earlier',
            'stale response',
            'later',
          ],
          missingFeedback: 'Name the class of bug: what is not guaranteed about response order?',
        },
        {
          synonyms: ['cleanup', 'return', 'abort', 'cancel', 'ignore', 'flag'],
          missingFeedback: 'What does the effect need to return, and what does it do?',
        },
      ],
      hints: [
        'Responses can arrive in a different order than the requests were sent.',
        'A slow request for "ab" can land after a fast one for "abc".',
        'Return a cleanup that either aborts the request or sets an `ignore` flag so the stale `setResults` is skipped.',
      ],
    },
    canonicalAnswer:
      'It is a race condition: responses are not guaranteed to arrive in request order, so a slow earlier request can resolve after a newer one and overwrite it. Return a cleanup function from the effect that sets an ignore flag (or aborts via an AbortController), so a response from a superseded render never calls setResults.',
    solution: code(
      'jsx',
      'useEffect(() => {',
      '  const controller = new AbortController();',
      '  fetch(`/api/search?q=${query}`, { signal: controller.signal })',
      '    .then((r) => r.json())',
      '    .then(setResults)',
      "    .catch((e) => { if (e.name !== 'AbortError') throw e; });",
      '',
      '  return () => controller.abort();',
      '}, [query]);'
    ),
    explanation:
      "Nothing guarantees that HTTP responses arrive in the order the requests were sent, so a slow request for `ab` can land after a fast one for `abc` and clobber the newer results. React runs the cleanup **before** re-running the effect, which gives you exactly the hook you need to invalidate the superseded request. Either `controller.abort()` (which also stops the network work) or a simple `let ignore = false` flag checked before calling `setResults`. This is the canonical example in React's own docs, and the reason data-fetching libraries exist.",
  },

  {
    slug: 'react-list-fragment-key',
    title: 'Key on a fragment',
    category: 'react',
    difficulty: 'medium',
    relevance: 'occasional',
    type: 'short-text',
    prompt: md(
      'You need to render two sibling elements per item, so the shorthand `<>…</>` cannot take a key:',
      '',
      code(
        'jsx',
        '{rows.map((row) => (',
        '  <??? key={row.id}>',
        '    <dt>{row.term}</dt>',
        '    <dd>{row.def}</dd>',
        '  </???>',
        '))}'
      ),
      '',
      'What do you write instead of the shorthand?'
    ),
    graderConfig: {
      accept: ['react.fragment', '<react.fragment>', 'fragment'],
      acceptPatterns: ['React\\.Fragment'],
      nearMisses: {
        div: 'A wrapper div would break the <dl> structure. You need something that renders nothing.',
        '<>': 'The shorthand is exactly what cannot take a key. You need the long form.',
      },
      hints: [
        'The shorthand `<>` accepts no props at all, including `key`.',
        'There is a long form of the same component.',
        '`<React.Fragment key={…}>`',
      ],
    },
    canonicalAnswer: 'React.Fragment',
    solution: code(
      'jsx',
      '{rows.map((row) => (',
      '  <React.Fragment key={row.id}>',
      '    <dt>{row.term}</dt>',
      '    <dd>{row.def}</dd>',
      '  </React.Fragment>',
      '))}'
    ),
    explanation:
      'The `<>…</>` shorthand is syntax sugar that accepts **no** props, so any list of fragments needs the explicit `<React.Fragment key={…}>` form. This matters most inside elements with strict content models like `<dl>`, `<table>` and `<select>`, where inserting a wrapper `<div>` would produce invalid HTML and break styling. A fragment groups children without emitting a DOM node of its own.',
  },

  {
    slug: 'react-unnecessary-effect',
    title: 'The effect that should not exist',
    category: 'react',
    difficulty: 'medium',
    relevance: 'daily',
    type: 'explain',
    prompt: md(
      'This keeps a filtered list in state:',
      '',
      code(
        'jsx',
        'const [visible, setVisible] = useState([]);',
        'useEffect(() => {',
        '  setVisible(items.filter((i) => i.name.includes(query)));',
        '}, [items, query]);'
      ),
      '',
      'Explain what is wrong with it and what to do instead.'
    ),
    graderConfig: {
      groups: [
        {
          synonyms: ['derive', 'calculate', 'compute', 'during render', 'render time', 'just a'],
          missingFeedback: 'What should happen to a value you can work out from props and state?',
        },
        {
          synonyms: [
            'extra render',
            'twice',
            'second render',
            'double',
            'render pass',
            'wasted',
            'flash',
            'stale',
          ],
          missingFeedback: 'What does the effect cost at runtime?',
        },
        {
          synonyms: ['usememo', 'const visible', 'no state', 'remove the state', 'plain variable'],
          missingFeedback: 'What replaces it?',
        },
      ],
      hints: [
        'Ask whether `visible` is really state, or just a calculation.',
        'The effect runs after paint, so React renders once with the old list and again with the new.',
        'Compute it during render, and only reach for useMemo if it is genuinely expensive.',
      ],
    },
    canonicalAnswer:
      'The filtered list is not state, it is derived from items and query, so it should be calculated during render rather than stored. Keeping it in an effect means every change renders twice, once with the stale list and again after the effect sets state, which wastes work and can flash the old content. Replace it with a plain const, wrapped in useMemo only if the filtering is genuinely expensive.',
    solution: code(
      'jsx',
      'const visible = items.filter((i) => i.name.includes(query));',
      '',
      '// only if profiling says the filter is hot',
      'const visible = useMemo(',
      '  () => items.filter((i) => i.name.includes(query)),',
      '  [items, query]',
      ');'
    ),
    explanation:
      'The question to ask of any piece of state is whether you could work it out from something you already have. If you can, it is not state, and storing it creates two sources of truth that can disagree. The effect version also renders twice per change, and between the two renders the UI shows the previous result. Effects are for synchronising with something **outside** React: the network, the DOM, a subscription, a timer. Filtering an array is none of those.',
  },

  {
    slug: 'react-context-value-identity',
    title: 'The context that rerenders everything',
    category: 'react',
    difficulty: 'medium',
    relevance: 'occasional',
    type: 'short-text',
    prompt: md(
      'Every consumer of this context rerenders on every render of the provider, even when neither value changed:',
      '',
      code('jsx', '<AuthContext.Provider value={{ user, signOut }}>'),
      '',
      'Name the hook that fixes the value.'
    ),
    graderConfig: {
      accept: ['usememo', 'usememo()', 'react.usememo'],
      acceptPatterns: ['useMemo'],
      nearMisses: {
        usecallback: 'useCallback is for the function. The whole object literal is the problem.',
        memo: 'React.memo on the consumers cannot help: the context value itself is new each time.',
      },
      hints: [
        'The object literal is a new object on every render.',
        'Context compares by identity, so a new object means every consumer is stale.',
        '`useMemo(() => ({ user, signOut }), [user, signOut])`',
      ],
    },
    canonicalAnswer: 'useMemo',
    solution: code(
      'jsx',
      'const value = useMemo(() => ({ user, signOut }), [user, signOut]);',
      'return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;'
    ),
    explanation:
      'Context propagates by reference identity, so `{ user, signOut }` written inline is a brand new object every render and every consumer is told the value changed. `React.memo` on the consumers does not help, because context updates bypass it. Memoise the value, and make sure the functions inside it are stable too, usually via `useCallback` or by defining them outside the component. If a context holds several unrelated values that change at different rates, splitting it into two contexts is often better than memoising harder.',
  },

  {
    slug: 'react-reset-state-key',
    title: 'Resetting a component for a new record',
    category: 'react',
    difficulty: 'medium',
    relevance: 'occasional',
    type: 'short-text',
    prompt: md(
      'An edit form keeps the previous user’s draft when you switch to a different user, because the state outlives the prop change.',
      '',
      'Name the React feature that gives the component a clean slate per user, without an effect.'
    ),
    graderConfig: {
      accept: ['key', 'the key prop', 'key prop'],
      acceptPatterns: ['\\bkey\\b'],
      nearMisses: {
        useeffect:
          'An effect that resets state works, but it renders once with the stale draft first.',
        usestate: 'The state itself is not the mechanism. Something has to tell React to remount.',
      },
      hints: [
        'React reuses a component instance while its position and type stay the same.',
        'Changing one special prop makes React discard the instance and mount a fresh one.',
        '`<UserForm key={user.id} …/>`',
      ],
    },
    canonicalAnswer: 'key',
    solution: code('jsx', '<UserForm key={user.id} user={user} />'),
    explanation:
      'A changed `key` tells React the element is a different thing, so it unmounts the old instance and mounts a new one with fresh state. That is the idiomatic reset, and it is instantaneous: no render with the stale draft, no effect, no manual clearing of six fields. It is the same mechanism that makes keys matter in lists, applied deliberately. Use it sparingly and on the smallest subtree that needs resetting, because remounting also throws away scroll position, focus and any uncommitted work inside.',
  },

  {
    slug: 'react-hooks-conditional',
    title: 'Why hooks cannot go in an if',
    category: 'react',
    difficulty: 'easy',
    relevance: 'daily',
    type: 'explain',
    prompt: md(
      'This throws "Rendered fewer hooks than expected":',
      '',
      code('jsx', 'if (!user) return <Login />;', 'const [tab, setTab] = useState("profile");'),
      '',
      'Explain why the order matters and how to fix it.'
    ),
    graderConfig: {
      groups: [
        {
          synonyms: ['order', 'call order', 'index', 'position', 'sequence', 'same order'],
          missingFeedback: 'How does React match a hook call to its stored state?',
        },
        {
          synonyms: ['early return', 'conditional', 'skipped', 'not called', 'if', 'fewer'],
          missingFeedback: 'What does the early return do to that?',
        },
        {
          synonyms: ['move', 'top', 'before', 'above', 'unconditional', 'always call'],
          missingFeedback: 'What is the fix?',
        },
      ],
      hints: [
        'React does not know the names of your hooks, only the order they were called in.',
        'An early return means the second render calls fewer hooks than the first.',
        'Call every hook unconditionally at the top, then return early.',
      ],
    },
    canonicalAnswer:
      'React matches each hook call to its stored state by call order, not by name, so the sequence has to be identical on every render. The early return skips the useState on some renders, so the counts no longer line up and React throws. Move every hook above the conditional so they are always called, and put the early return after them.',
    solution: code(
      'jsx',
      'const [tab, setTab] = useState("profile");',
      'if (!user) return <Login />;'
    ),
    explanation:
      'Hooks are stored in a list per component instance and read back positionally on each render, which is what makes the terse `useState` API possible without any identifier. Everything follows from that: no hooks in conditionals, loops, or after an early return. When a hook genuinely should not run, the fix is usually to move the condition **inside** it (an effect that returns early, a query with `enabled: false`) or to split the component in two so the parent decides which child to render.',
  },

  {
    slug: 'react-error-boundary',
    title: 'Catching a render error',
    category: 'react',
    difficulty: 'medium',
    relevance: 'occasional',
    type: 'explain',
    prompt: md(
      'A `try/catch` around a component’s JSX does not stop a child’s render error from blanking the whole app.',
      '',
      'Name what does catch it, and one class of error it still will not catch.'
    ),
    graderConfig: {
      groups: [
        {
          synonyms: ['error boundary', 'boundary', 'componentdidcatch', 'getderivedstatefromerror'],
          missingFeedback: 'What catches a render error in React?',
        },
        {
          synonyms: [
            'event handler',
            'async',
            'promise',
            'settimeout',
            'server',
            'ssr',
            'outside render',
            'callback',
          ],
          missingFeedback: 'Name something it does not catch.',
        },
      ],
      hints: [
        'It has to be a component above the failing one in the tree.',
        'It is still a class component, or a library wrapper around one.',
        'Errors thrown outside rendering, such as in an event handler or a promise, are not caught.',
      ],
    },
    canonicalAnswer:
      'An error boundary catches it: a component implementing getDerivedStateFromError or componentDidCatch, placed above the failing component in the tree, which renders a fallback instead of the crashed subtree. It does not catch errors thrown in event handlers, in async code such as a setTimeout or a rejected promise, or in the boundary itself, because those do not happen during rendering.',
    solution: code(
      'jsx',
      'class ErrorBoundary extends React.Component {',
      '  state = { error: null };',
      '  static getDerivedStateFromError(error) {',
      '    return { error };',
      '  }',
      '  componentDidCatch(error, info) {',
      '    report(error, info.componentStack);',
      '  }',
      '  render() {',
      '    return this.state.error ? this.props.fallback : this.props.children;',
      '  }',
      '}'
    ),
    explanation:
      'A `try/catch` cannot help because the child’s render does not happen inside the parent’s call stack: React calls each component itself. Error boundaries hook into React’s own rendering, which is why they remain the one thing that still requires a class. Place them deliberately, one per meaningful region, so a failing widget takes down a card rather than the page. For the gaps, handle rejections where they happen and use `window.onerror` and `unhandledrejection` as a global net.',
  },

  {
    slug: 'react-optimistic-update',
    title: 'Updating before the server replies',
    category: 'react',
    difficulty: 'hard',
    relevance: 'occasional',
    type: 'explain',
    prompt: md(
      'A "like" button waits for the round trip before filling in, and feels sluggish on a slow connection.',
      '',
      'Name the pattern that fixes the feel, and the two things it obliges you to handle.'
    ),
    graderConfig: {
      groups: [
        {
          synonyms: ['optimistic', 'optimism'],
          missingFeedback: 'Name the pattern.',
        },
        {
          synonyms: ['rollback', 'revert', 'undo', 'restore', 'roll back', 'previous'],
          missingFeedback: 'What has to happen if the request fails?',
        },
        {
          synonyms: [
            'error',
            'tell the user',
            'message',
            'toast',
            'inform',
            'reconcile',
            'server value',
            'refetch',
            'truth',
          ],
          missingFeedback: 'What else does a failure require?',
        },
      ],
      hints: [
        'Update the UI immediately and assume it will succeed.',
        'That assumption is sometimes wrong.',
        'You need to roll back and tell the user, then reconcile with what the server actually says.',
      ],
    },
    canonicalAnswer:
      'An optimistic update: apply the change to local state immediately and send the request in the background. If it fails you have to roll back to the previous value rather than leaving a lie on screen, and you have to tell the user it failed instead of failing silently. When it succeeds, reconcile with the value the server returns, since it is the source of truth and may differ from your guess.',
    solution: code(
      'jsx',
      'const [liked, setLiked] = useState(post.liked);',
      '',
      'async function toggle() {',
      '  const previous = liked;',
      '  setLiked(!previous); // optimistic',
      '  try {',
      '    const result = await api.setLiked(post.id, !previous);',
      '    setLiked(result.liked); // reconcile with the server',
      '  } catch {',
      '    setLiked(previous); // roll back',
      "    toast('Could not save your like');",
      '  }',
      '}'
    ),
    explanation:
      'Optimistic updates trade correctness-for-a-moment against a UI that feels instant, and they are worth it for small, high-frequency, low-stakes actions: likes, checkboxes, reordering. They are a poor fit for anything the user would be upset to see reversed, such as a payment. The two obligations are what separates the pattern from a bug: silent rollback confuses people, and no rollback at all leaves the screen disagreeing with the database until the next reload. React’s `useOptimistic` and the mutation helpers in data libraries encode this shape for you.',
  },

  {
    slug: 'react-state-object-mutation',
    title: 'The state update that did nothing',
    category: 'react',
    difficulty: 'easy',
    relevance: 'daily',
    type: 'short-text',
    prompt: md(
      'The component does not rerender:',
      '',
      code(
        'jsx',
        'const [user, setUser] = useState({ name: "Ada", tier: "free" });',
        '',
        'user.tier = "pro";',
        'setUser(user);'
      ),
      '',
      'In one word, what did this update fail to do?'
    ),
    graderConfig: {
      accept: [
        'copy',
        'clone',
        'create a new object',
        'new object',
        'a new reference',
        'new reference',
        'immutably',
      ],
      acceptPatterns: [
        'new (object|reference|copy)',
        '\\bcopy\\b',
        '\\bclone\\b',
        'immutab',
        'spread',
      ],
      nearMisses: {
        rerender: 'That is the symptom. The question is what the update itself failed to do.',
      },
      hints: [
        'React compares the previous and next state with Object.is.',
        'Mutating and passing the same object means the comparison says nothing changed.',
        'Create a new object instead of editing the old one.',
      ],
    },
    canonicalAnswer: 'create a new object',
    solution: code('jsx', 'setUser({ ...user, tier: "pro" });'),
    explanation:
      'React bails out of a rerender when the next state is `Object.is`-equal to the current one, and a mutated object is still the same object. Spreading gives a new reference, which is what signals the change. Nested updates need the same treatment at every level you touch, which is where it becomes tedious and where a helper like Immer earns its place. The same identity rule drives `React.memo`, `useMemo` dependency arrays and context propagation, so learning it once pays off everywhere.',
  },

  {
    slug: 'react-list-state-index',
    title: 'Updating one row in a list',
    category: 'react',
    difficulty: 'medium',
    relevance: 'daily',
    type: 'short-text',
    prompt: md(
      'Toggling one todo currently does this, and the list never updates:',
      '',
      code('jsx', 'todos[index].done = !todos[index].done;', 'setTodos(todos);'),
      '',
      'Name the array method that produces the correct new array.'
    ),
    graderConfig: {
      accept: ['map', 'map()', '.map', 'array.map'],
      acceptPatterns: ['\\.?\\bmap\\b'],
      nearMisses: {
        foreach: 'forEach returns nothing, so there is no new array to set.',
        splice: 'splice mutates in place, which is the problem here.',
        filter: 'filter removes items. You want to replace one.',
      },
      hints: [
        'You need a new array containing a new object for the row that changed.',
        'The other rows can keep their identity, which helps memoised children.',
        '`todos.map((t) => (t.id === id ? { ...t, done: !t.done } : t))`',
      ],
    },
    canonicalAnswer: 'map',
    solution: code(
      'jsx',
      'setTodos(todos.map((t) => (t.id === id ? { ...t, done: !t.done } : t)));'
    ),
    explanation:
      '`map` gives a new array, and returning the untouched items by reference means only the changed row has a new identity, so memoised rows elsewhere in the list skip rerendering. Matching on a stable `id` rather than an index also survives sorting and filtering, which an index does not. The immutable equivalents for the other operations are `filter` to remove, spread or `toSpliced` to insert, and `toSorted`/`toReversed` for the sorts that used to mutate.',
  },

  {
    slug: 'react-abort-on-unmount',
    title: 'Setting state after unmount',
    category: 'react',
    difficulty: 'medium',
    relevance: 'daily',
    type: 'short-text',
    prompt: md(
      'A fetch resolves after the user navigates away, and the update lands on a component that no longer exists:',
      '',
      code(
        'jsx',
        'useEffect(() => {',
        '  fetch(url).then((r) => r.json()).then(setData);',
        '}, [url]);'
      ),
      '',
      'Name what the effect is missing.'
    ),
    graderConfig: {
      accept: [
        'cleanup',
        'cleanup function',
        'a cleanup function',
        'abortcontroller',
        'abort controller',
        'cancellation',
      ],
      acceptPatterns: ['clean-?up', 'AbortController', 'cancel'],
      nearMisses: {
        'ismounted flag':
          'A mounted flag silences the symptom but still lets the request run to completion.',
      },
      hints: [
        'The effect starts something that outlives it.',
        'An effect can return a function that runs before the next run and on unmount.',
        'Return a cleanup that aborts the request.',
      ],
    },
    canonicalAnswer: 'a cleanup function',
    solution: code(
      'jsx',
      'useEffect(() => {',
      '  const controller = new AbortController();',
      '  fetch(url, { signal: controller.signal })',
      '    .then((r) => r.json())',
      '    .then(setData)',
      '    .catch((err) => {',
      "      if (err.name !== 'AbortError') setError(err);",
      '    });',
      '  return () => controller.abort();',
      '}, [url]);'
    ),
    explanation:
      'Anything an effect starts, it owns: a request, a subscription, a timer, a listener. The cleanup runs before the next effect and on unmount, which handles both navigation and a rapidly changing `url`. Aborting is better than an `isMounted` flag because it actually cancels the work and frees the connection rather than just ignoring the answer. It also fixes the out-of-order response race for free, since a superseded request is cancelled rather than left to land late.',
  },

  {
    slug: 'react-transition-not-for-input',
    title: 'The transition that made typing worse',
    category: 'react',
    difficulty: 'easy',
    relevance: 'daily',
    type: 'explain',
    prompt: md(
      'A search box filters a long list. Typing stutters, so both state updates go into a transition:',
      '',
      code(
        'jsx',
        'function onChange(event) {',
        '  startTransition(() => {',
        '    setQuery(event.target.value); // the input reads this',
        '    setApplied(event.target.value); // the list reads this',
        '  });',
        '}'
      ),
      '',
      'Typing is now worse than before: characters appear late, and sometimes out of order.',
      '',
      'Say which of the two updates does not belong in the transition, and why.'
    ),
    graderConfig: {
      groups: [
        {
          synonyms: [
            'setquery',
            'the input',
            "the input's",
            'the value the input',
            'the controlled value',
            'query',
            'first one',
            'the urgent one',
          ],
          missingFeedback:
            'Two updates went in. Name the one whose result the user is waiting to see on the very next frame.',
        },
        {
          synonyms: [
            'urgent',
            'interruptible',
            'can be interrupted',
            'abandoned',
            'delayed',
            'deferred',
            'lower priority',
            'not immediate',
            'has to paint',
            'must paint',
            'cannot control',
            'text input',
          ],
          missingFeedback:
            'Say what a transition does to an update, and why that is wrong for the value an input displays.',
        },
      ],
      hints: [
        'A transition does not make work faster. It makes an update interruptible.',
        'An interruptible update can be abandoned and restarted, so the value it sets may not paint on the next frame.',
        'The input displays `query`, so that update has to stay urgent. Only the derived one goes in the transition.',
      ],
    },
    canonicalAnswer:
      'setQuery does not belong there. It is the value the input displays, so it has to be urgent and paint on the next frame. A transition marks an update interruptible, meaning React may abandon and redo it, which is why the characters lag and reorder. Keep setQuery outside and put only setApplied, which the list derives from, inside startTransition.',
    solution: md(
      code(
        'jsx',
        'function onChange(event) {',
        '  setQuery(event.target.value); // urgent: the input has to paint',
        '  startTransition(() => setApplied(event.target.value)); // interruptible: the results',
        '}'
      ),
      '',
      'react.dev states the limit directly: "Transition updates can\'t be used to control text inputs." `useDeferredValue` is the shorter way to say the same thing when one value does the deriving.'
    ),
    explanation:
      'A transition buys interruptibility, not speed: React gets permission to abandon a render in progress when something more urgent arrives and to run it again afterwards, so the total work can go up while the urgent part paints on time. That is exactly wrong for the value a controlled input displays, because the thing the user is waiting for is that character appearing, and an update that can be deferred and redone shows it late or out of order. The split is the point of the API rather than a detail of it: the input owns an urgent piece of state, and everything derived from it goes in the transition. Reach for `useDeferredValue` when there is a single value doing the deriving, since it expresses the same split without a callback.',
  },

  {
    slug: 'react-transition-pending',
    title: 'Keeping the UI responsive during a slow update',
    category: 'react',
    difficulty: 'hard',
    relevance: 'occasional',
    type: 'short-text',
    prompt: md(
      'Typing in a search box that filters ten thousand rows makes each keystroke stutter, because the input cannot repaint until the list rerenders.',
      '',
      'Name the React hook that lets the input update first and marks the list update as interruptible.'
    ),
    graderConfig: {
      accept: ['usetransition', 'usetransition()', 'starttransition', 'usedeferredvalue'],
      acceptPatterns: ['use-?Transition', 'startTransition', 'useDeferredValue'],
      nearMisses: {
        usememo: 'Memoising the filter helps the cost, but the render still blocks the keystroke.',
        usecallback: 'That stabilises a function reference, which is a different problem.',
      },
      hints: [
        'React can treat some updates as lower priority than others.',
        'The urgent update is the input; the list can lag by a frame or several.',
        '`useTransition`, or `useDeferredValue` for the value-shaped version.',
      ],
    },
    canonicalAnswer: 'useTransition',
    solution: code(
      'jsx',
      'const [isPending, startTransition] = useTransition();',
      '',
      'function onChange(event) {',
      '  setQuery(event.target.value); // urgent: the input',
      '  startTransition(() => setFilter(event.target.value)); // interruptible: the list',
      '}'
    ),
    explanation:
      'Marking an update as a transition tells React it may be interrupted by anything more urgent, so a keystroke always wins over a list rerender and the input stays responsive. `isPending` gives you a handle for a subtle loading affordance without a spinner flash. `useDeferredValue` is the same idea expressed as a value rather than a callback, and it is usually the smaller change: derive the deferred query and filter from that. Neither makes the filtering faster, so if the work is genuinely heavy, virtualise the list as well.',
  },

  {
    slug: 'react-context-read-scope',
    title: 'A sidebar that rerenders on every mousemove',
    category: 'react',
    difficulty: 'medium',
    relevance: 'occasional',
    type: 'explain',
    prompt: md(
      'Everything under this provider shares one context value:',
      '',
      code(
        'jsx',
        'const CursorContext = createContext(null);',
        '',
        'function App() {',
        '  const [pos, setPos] = useState({ x: 0, y: 0 });',
        '  const [theme, setTheme] = useState("dark");',
        '  return (',
        '    <CursorContext.Provider value={{ pos, theme }}>',
        '      <Canvas onMove={setPos} />',
        '      <Sidebar />',
        '    </CursorContext.Provider>',
        '  );',
        '}',
        '',
        'function Sidebar() {',
        '  const { theme } = useContext(CursorContext);',
        '  return <aside className={theme}>...</aside>;',
        '}'
      ),
      '',
      'The profiler shows Sidebar rerendering dozens of times a second while the mouse moves, even though it only reads `theme`, and `theme` never changes.',
      '',
      'Explain why, and how to fix it.'
    ),
    graderConfig: {
      groups: [
        {
          synonyms: [
            'every consumer',
            'any consumer',
            'whole value',
            'entire value',
            'regardless of which',
            'no matter which',
          ],
          missingFeedback:
            'What does useContext subscribe to: the whole value, or just the field you destructure?',
        },
        {
          synonyms: [
            'never changes',
            'never changed',
            'unrelated field',
            'stayed the same',
            'unchanged',
          ],
          missingFeedback:
            'theme itself is not the problem. What is changing on every mousemove instead?',
        },
        {
          synonyms: ['split', 'separate context', 'two context', 'another context'],
          missingFeedback: 'What is the fix?',
        },
      ],
      hints: [
        'useContext has no concept of subscribing to part of a value — it rereads the whole thing on every provider render.',
        'pos updates on every mousemove; that is what makes the value object new each time, not theme.',
        'Give the fast-changing part its own provider, separate from the slow-changing part.',
      ],
    },
    canonicalAnswer:
      'useContext subscribes to the whole context value, so every consumer rerenders whenever the provider passes a new value, no matter which field it actually destructures. Sidebar reads only theme, but pos changes on every mousemove and theme itself never changes, so Sidebar rerenders anyway because it shares the same value object as Canvas. Split the value into two contexts, a fast-changing CursorContext and a slow-changing ThemeContext, so Sidebar only subscribes to the one that actually changes.',
    solution: code(
      'jsx',
      'const CursorContext = createContext(null); // pos, changes on every move',
      'const ThemeContext = createContext(null);  // theme, changes rarely',
      '',
      'function Sidebar() {',
      '  const theme = useContext(ThemeContext);',
      '  return <aside className={theme}>...</aside>;',
      '}'
    ),
    explanation:
      "Context propagation is all-or-nothing: a component that calls useContext rerenders whenever the provider passes a new value, whatever slice of that value it actually reads. Memoizing the value with useMemo, the fix when a value's identity changes for no real reason, does not help here, because pos genuinely changes on every mousemove; there is no stale identity to fix. The only lever left is scope: split the value so a field that changes 60 times a second lives in a different context from one that changes once a session. Libraries like Zustand and Jotai exist largely to give components a way to subscribe to a slice of state instead of a whole context value.",
  },

  {
    slug: 'react-context-dispatch-split',
    title: 'A button that only dispatches still rerenders',
    category: 'react',
    difficulty: 'medium',
    relevance: 'occasional',
    type: 'explain',
    prompt: md(
      'dispatch from useReducer keeps the same identity for the life of the component, but this button rerenders every time a todo is toggled anywhere in the list:',
      '',
      code(
        'jsx',
        'const TodosContext = createContext(null);',
        '',
        'function TodosProvider({ children }) {',
        '  const [state, dispatch] = useReducer(todosReducer, initialState);',
        '  return (',
        '    <TodosContext.Provider value={{ state, dispatch }}>',
        '      {children}',
        '    </TodosContext.Provider>',
        '  );',
        '}',
        '',
        'function AddButton() {',
        '  const { dispatch } = useContext(TodosContext);',
        '  return <button onClick={() => dispatch({ type: "add" })}>Add</button>;',
        '}'
      ),
      '',
      'AddButton never reads `state`. Explain why it rerenders anyway, and the fix.'
    ),
    graderConfig: {
      groups: [
        {
          synonyms: ['stable', 'never changes', 'same reference', 'does not change'],
          missingFeedback: "What's true about dispatch's identity across renders, on its own?",
        },
        {
          synonyms: ['same context', 'bundled', 'coupled', 'tied to'],
          missingFeedback: 'Why does that stability not help AddButton here?',
        },
        {
          synonyms: ['split', 'separate context', 'dispatch context', 'two context'],
          missingFeedback: 'What is the fix?',
        },
      ],
      hints: [
        "dispatch returned by useReducer keeps the same identity for the component's whole lifetime.",
        'AddButton does not read that stable dispatch directly — it reads it off a context value that also carries state.',
        'Give dispatch its own context, separate from state, so a dispatch-only consumer subscribes to something that never produces a new value.',
      ],
    },
    canonicalAnswer:
      'dispatch from useReducer is stable and never changes identity across renders, but AddButton reads it off the same context value as state, and that value is bundled together in one object, so a new value is created whenever state changes and AddButton rerenders anyway even though dispatch itself never changed. Split state and dispatch into two contexts, a TodosContext and a TodosDispatchContext, so a component that only dispatches subscribes to a context that truly never produces a new value.',
    solution: code(
      'jsx',
      'const TodosContext = createContext(null);',
      'const TodosDispatchContext = createContext(null);',
      '',
      'function TodosProvider({ children }) {',
      '  const [state, dispatch] = useReducer(todosReducer, initialState);',
      '  return (',
      '    <TodosContext value={state}>',
      '      <TodosDispatchContext value={dispatch}>',
      '        {children}',
      '      </TodosDispatchContext>',
      '    </TodosContext>',
      '  );',
      '}',
      '',
      'function AddButton() {',
      '  const dispatch = useContext(TodosDispatchContext);',
      '  return <button onClick={() => dispatch({ type: "add" })}>Add</button>;',
      '}'
    ),
    explanation:
      'useReducer guarantees dispatch keeps the same identity for as long as the component is mounted, but that guarantee only pays off if a consumer can read it without also subscribing to something that changes. Bundling { state, dispatch } into one context value throws the guarantee away, because the object wrapping them is new every time state changes. Splitting costs a second provider and a second import wherever a component needs both, so it earns its place once a tree has enough dispatch-only consumers (toolbars, buttons, forms) to matter, not reflexively on every reducer.',
  },

  {
    slug: 'react-memo-inline-prop',
    title: 'Wrapping it in memo changed nothing',
    category: 'react',
    difficulty: 'easy',
    relevance: 'daily',
    type: 'explain',
    prompt: md(
      'You wrap Row in memo to stop it rerendering when an unrelated part of the list changes:',
      '',
      code(
        'jsx',
        'const Row = memo(function Row({ item, onSelect }) {',
        '  return <li onClick={() => onSelect(item.id)}>{item.name}</li>;',
        '});',
        '',
        'function List({ items }) {',
        '  return (',
        '    <ul>',
        '      {items.map((item) => (',
        '        <Row key={item.id} item={item} onSelect={(id) => setSelected(id)} />',
        '      ))}',
        '    </ul>',
        '  );',
        '}'
      ),
      '',
      'The profiler shows every Row rerendering on every render of List anyway. Explain why memo does nothing here, and fix it.'
    ),
    graderConfig: {
      groups: [
        {
          synonyms: [
            'new function',
            'new reference',
            'arrow function',
            'inline function',
            'every render',
          ],
          missingFeedback: 'What is different about the onSelect prop on each render of List?',
        },
        {
          synonyms: ['object.is', 'reference equality', 'compares props', 'shallow'],
          missingFeedback: 'How does memo decide whether to skip a render?',
        },
        {
          synonyms: ['usecallback', 'stable reference', 'stable function'],
          missingFeedback: 'What fixes it?',
        },
      ],
      hints: [
        'memo compares each prop with Object.is; it does not know two different function objects do the same thing.',
        'onSelect={(id) => setSelected(id)} is a new function literal every time List renders.',
        'useCallback(() => ..., [deps]) keeps the same function reference across renders, so memo can actually skip Row.',
      ],
    },
    canonicalAnswer:
      'memo bails out only when every prop is Object.is-equal to last time, but onSelect={(id) => setSelected(id)} creates a new function every render of List, so Row always sees a changed prop and rerenders anyway. Wrap the handler in useCallback so its reference stays stable across renders of List, and memo can actually skip Row.',
    solution: code(
      'jsx',
      'function List({ items }) {',
      '  const handleSelect = useCallback((id) => setSelected(id), []);',
      '  return (',
      '    <ul>',
      '      {items.map((item) => (',
      '        <Row key={item.id} item={item} onSelect={handleSelect} />',
      '      ))}',
      '    </ul>',
      '  );',
      '}'
    ),
    explanation:
      'memo only helps when every prop is referentially stable; one new object, array or function per render is enough to defeat it completely, and it gives no warning about which prop broke it. useCallback fixes this specific case, but check first whether Row is expensive enough to be worth protecting at all — wrapping a cheap component in memo and useCallback adds bookkeeping on every render in exchange for skipping a render that was already cheap.',
  },

  {
    slug: 'react-usecallback-cost',
    title: 'useCallback around a plain button handler',
    category: 'react',
    difficulty: 'medium',
    relevance: 'occasional',
    type: 'explain',
    prompt: md(
      'A teammate wraps every handler in useCallback out of habit, including this one:',
      '',
      code(
        'jsx',
        'function Toolbar({ onSave }) {',
        '  const handleClick = useCallback(() => {',
        '    onSave();',
        '  }, [onSave]);',
        '',
        '  return <button onClick={handleClick}>Save</button>;',
        '}'
      ),
      '',
      '`<button>` is a plain DOM element, not a component wrapped in memo. Explain why the useCallback here does not save anything, and when useCallback actually pays for itself.'
    ),
    graderConfig: {
      groups: [
        {
          synonyms: ['wrapped in memo', 'memoized child', 'memo component', 'react.memo'],
          missingFeedback:
            'What kind of thing does a cached function reference actually need to be handed to, for the caching to matter?',
        },
        {
          synonyms: ['host element', 'dom element', 'plain button', 'not memoized'],
          missingFeedback:
            'What is <button> in React terms, and does it compare props by reference?',
        },
        {
          synonyms: ['allocates', 'overhead', 'cost', 'bookkeeping'],
          missingFeedback: 'What does useCallback itself cost, on every render?',
        },
      ],
      hints: [
        "Ask who actually reads handleClick's identity. A <button> does not compare it to anything.",
        'useCallback protects against unnecessary work downstream, typically a memoized component or an effect dependency array.',
        'Reserve it for handlers passed to a component wrapped in memo, or used inside a dependency array.',
      ],
    },
    canonicalAnswer:
      'useCallback only pays off when the cached function is handed to something that compares it by reference, like a component wrapped in memo or a dependency array. A button is a host element, not a memoized component, so React rerenders it regardless of whether handleClick changed reference, and the useCallback here buys nothing. It still allocates a closure and compares the dependency array on every render, which is pure overhead. useCallback earns its keep once handleClick is passed to a memoized child that would otherwise see a new reference every render.',
    solution: code(
      'jsx',
      '// Not worth it: <button> never compares handleClick by reference',
      'function Toolbar({ onSave }) {',
      '  const handleClick = useCallback(() => onSave(), [onSave]);',
      '  return <button onClick={handleClick}>Save</button>;',
      '}',
      '',
      '// Worth it: SaveButton is memoized, so a stable handler lets it skip renders',
      'const SaveButton = memo(function SaveButton({ onClick }) {',
      '  return <button onClick={onClick}>Save</button>;',
      '});',
      '',
      'function Toolbar({ onSave }) {',
      '  const handleClick = useCallback(() => onSave(), [onSave]);',
      '  return <SaveButton onClick={handleClick} />;',
      '}'
    ),
    explanation:
      'useCallback and useMemo share the same bill of costs: an allocation and a dependency comparison on every render. That cost is worth paying only when something downstream actually reads the reference and skips work because of it, a memoized component or a dependency array. A host element like `<button>` never does either, so caching the handler here is overhead with no offsetting saving. The fix is not to remove useCallback everywhere, it is to check whether anything downstream actually benefits before reaching for it.',
  },

  {
    slug: 'react-slow-render',
    title: 'Memoized, and still slow',
    category: 'react',
    difficulty: 'hard',
    relevance: 'occasional',
    type: 'explain',
    prompt: md(
      'Table is already wrapped in memo. rows has 20,000 entries. Typing in the filter box drops frames, and the profiler shows the time inside Table itself, not a rerender triggered from somewhere else:',
      '',
      code(
        'jsx',
        'const Table = memo(function Table({ rows, filter }) {',
        '  const visible = rows',
        '    .filter((r) => r.name.includes(filter))',
        '    .sort((a, b) => a.name.localeCompare(b.name));',
        '',
        '  return (',
        '    <table>',
        '      <tbody>',
        '        {visible.map((r) => (',
        '          <tr key={r.id}>',
        '            <td>{r.name}</td>',
        '          </tr>',
        '        ))}',
        '      </tbody>',
        '    </table>',
        '  );',
        '});'
      ),
      '',
      'Explain why memo does not fix this, and what actually would.'
    ),
    graderConfig: {
      groups: [
        {
          synonyms: ['every keystroke', 'has to render', 'unchanged', 'correctly renders'],
          missingFeedback:
            'Does filter change on every keystroke? What does that mean for whether memo can skip this render?',
        },
        {
          synonyms: ['inside the render', 'render itself', 'expensive render'],
          missingFeedback: 'Where is the actual cost, according to the profiler?',
        },
        {
          synonyms: ['usememo', 'virtualiz'],
          missingFeedback: 'Name a fix that targets the render cost itself.',
        },
      ],
      hints: [
        "memo's whole job is skipping a render when props did not change. Did filter change here?",
        "The profiler says the time is inside Table's own render function, not from a wasted rerender triggered elsewhere.",
        'Move the filter and sort into useMemo so they do not redo the O(n log n) work every render, and consider windowing so the render only touches the rows on screen.',
      ],
    },
    canonicalAnswer:
      'memo only skips a render when props are unchanged, and filter changes on every keystroke, so Table has to render every time regardless, memo was never going to help here. The actual cost is inside the render itself: filtering and sorting 20,000 rows on every keystroke. Fix the render, not the rerender: memoize the expensive filter and sort with useMemo keyed on rows and filter, or better, virtualize the table so only the visible rows are ever rendered.',
    solution: code(
      'jsx',
      'const Table = memo(function Table({ rows, filter }) {',
      '  const visible = useMemo(',
      '    () =>',
      '      rows',
      '        .filter((r) => r.name.includes(filter))',
      '        .sort((a, b) => a.name.localeCompare(b.name)),',
      '    [rows, filter]',
      '  );',
      '',
      '  // Better still: hand `visible` to a windowed list so only',
      '  // the rows on screen are ever mounted.',
      '  return <VirtualizedRows rows={visible} />;',
      '});'
    ),
    explanation:
      'Re-render prevention and render cost are two different levers, and memo only operates the first one. When a prop legitimately changes every time, as filter does here, memo cannot help at all: it is designed to skip renders, not speed them up. useMemo fixes the redundant work, so the sort only reruns when rows or filter actually change instead of on every render of an ancestor. But even a memoized sort still does O(n log n) work on every real keystroke; if that is still too slow at 20,000 rows, the render itself has to touch less, which is what windowing is for. Profile before optimizing, because memoizing a component whose real bottleneck is inside its own render buys nothing.',
  },

  {
    slug: 'react-list-windowing',
    title: 'Twenty thousand rows in the DOM',
    category: 'react',
    difficulty: 'medium',
    relevance: 'occasional',
    type: 'short-text',
    prompt: md(
      'A table renders 20,000 rows directly into the DOM. It is smooth on a laptop and stutters badly on a mid-range phone, because the browser is laying out and painting thousands of offscreen rows for no reason.',
      '',
      'Name the technique that keeps the DOM small by rendering only the rows near the current scroll position.'
    ),
    graderConfig: {
      accept: [
        'windowing',
        'virtualization',
        'virtualisation',
        'react-window',
        'list virtualization',
      ],
      nearMisses: {
        pagination:
          'Pagination avoids rendering everything too, but it breaks the list into separate pages. This keeps one continuous, scrollable list.',
      },
      hints: [
        'The DOM cost scales with rows actually rendered, not with how much data exists.',
        'Only the rows near the current scroll position need to exist in the DOM at all; the rest mount and unmount as the user scrolls.',
        'Libraries like react-window and TanStack Virtual exist to do this for you; the general technique they implement is called ___.',
      ],
    },
    canonicalAnswer: 'windowing',
    solution: code(
      'jsx',
      'import { List } from "react-window";',
      '',
      'const Row = ({ index, style, rows }) => <div style={style}>{rows[index].name}</div>;',
      '',
      '<List rowCount={rows.length} rowHeight={32} rowComponent={Row} rowProps={{ rows }} />'
    ),
    explanation:
      'Windowing keeps exactly one continuous, scrollable list while only mounting the rows near the viewport, which is the right call for exploring or searching a large, fairly uniform dataset. Pagination is the better choice when items vary a lot in height (windowing wants row sizes it can measure or fix), when a specific page needs its own shareable URL, or when the data source already paginates server-side and you would rather not hand the client the whole set. Either way, windowing only shrinks the render; the data still has to be fetched from somewhere, which is why the two techniques often pair rather than compete.',
  },

  {
    slug: 'react-state-colocation',
    title: 'One input rerenders the whole page',
    category: 'react',
    difficulty: 'medium',
    relevance: 'daily',
    type: 'explain',
    prompt: md(
      'query lives in App, and typing in the search box rerenders the whole Dashboard subtree on every keystroke, even though Dashboard never reads query:',
      '',
      code(
        'jsx',
        'function App() {',
        '  const [query, setQuery] = useState("");',
        '  return (',
        '    <>',
        '      <SearchBox value={query} onChange={setQuery} />',
        '      <Dashboard />',
        '    </>',
        '  );',
        '}'
      ),
      '',
      'Explain why Dashboard rerenders, and the fix that does not involve memo.'
    ),
    graderConfig: {
      groups: [
        {
          synonyms: ['every child', 'whole subtree', 'children rerender', 'rerenders by default'],
          missingFeedback: 'What happens to children by default when a parent rerenders?',
        },
        {
          synonyms: ['does not read', 'never reads', 'no reason', 'unrelated'],
          missingFeedback: 'What does Dashboard actually have to do with query?',
        },
        {
          synonyms: ['colocate', 'move the state down', 'closest', 'smallest', 'local state'],
          missingFeedback: 'Where should the state live instead?',
        },
      ],
      hints: [
        'Rendering is not selective by default: when App rerenders, so does everything under it, whether or not a child reads the changed state.',
        'Ask which component actually needs query. It is not Dashboard.',
        'Move the state, and the input, down into SearchBox. App no longer needs to know query exists.',
      ],
    },
    canonicalAnswer:
      'React rerenders a whole subtree by default: when App rerenders, every child rerenders too, whether or not it reads the changed state. Dashboard does not read query at all, it is just a sibling under the same App that rerenders on every keystroke for no reason of its own. The fix is to colocate the state: move query, and the input, down into SearchBox itself, the smallest component that actually needs it, instead of leaving it in App.',
    solution: code(
      'jsx',
      'function App() {',
      '  return (',
      '    <>',
      '      <SearchBox />',
      '      <Dashboard />',
      '    </>',
      '  );',
      '}',
      '',
      'function SearchBox() {',
      '  const [query, setQuery] = useState("");',
      '  return <input value={query} onChange={(e) => setQuery(e.target.value)} />;',
      '}'
    ),
    explanation:
      'Lifting state up is a one-way ratchet if nothing ever pulls it back down. Once query moved to App to feed some component that has since been removed or refactored, App keeps rerendering everything under it for state that only one small component ever needed. Colocating is not the opposite of lifting, it is the same judgment applied honestly: state lives at the lowest point that needs it, and moves up only when something else genuinely has to share it. memo on Dashboard would also stop the rerender, but it treats the symptom; moving the state removes the cause and deletes code instead of adding a wrapper.',
  },

  {
    slug: 'react-derive-write-time',
    title: 'An index rebuilt on every keystroke',
    category: 'react',
    difficulty: 'hard',
    relevance: 'occasional',
    type: 'explain',
    prompt: md(
      'notes rarely changes, but buildSearchIndex runs on every keystroke because it sits in the render body, which is why typing here drops frames:',
      '',
      code(
        'jsx',
        'function NoteSearch({ notes, query }) {',
        '  const index = buildSearchIndex(notes); // expensive: 50,000 notes',
        '  const results = index.search(query);',
        '  return <ResultList results={results} />;',
        '}'
      ),
      '',
      'A teammate suggests moving buildSearchIndex into a useEffect that stores the index in state. Explain why that is still not the best fix, and what to do instead.'
    ),
    graderConfig: {
      groups: [
        {
          synonyms: [
            'extra render',
            'second render',
            'after paint',
            'render twice',
            'double render',
          ],
          missingFeedback:
            'What does moving the work into an effect cost, on top of the original problem?',
        },
        {
          synonyms: ['usememo', 'depends on notes', 'keyed on notes'],
          missingFeedback:
            'What should the rebuild actually be keyed on, and what hook does that during render?',
        },
        {
          synonyms: ['write time', 'precompute', 'once when', 'when notes are saved'],
          missingFeedback: 'What is the better fix than rebuilding on the client at all?',
        },
      ],
      hints: [
        "An effect runs after the commit, so React paints once without the index and again once the effect's setState lands, two renders for one keystroke's worth of change.",
        'The index only needs to change when notes changes, not query. That is exactly what a memoized computation keyed on notes gives you.',
        'The cheapest place to build an index is once, wherever notes are produced, not on every client that renders them.',
      ],
    },
    canonicalAnswer:
      'An effect still costs an extra render: React commits once without the new index, then the effect runs after paint and sets state, which schedules a second render. It also does not fix the real bug, which is that the index gets rebuilt on renders that only changed query, not notes. Key the rebuild on notes with useMemo instead, so it only reruns when notes itself changes. Better still, do not rebuild it in the browser at all: compute the index once at write time, whenever notes are saved or fetched, and ship the built index instead of raw notes.',
    solution: code(
      'jsx',
      '// Correct default: rebuild only when notes changes',
      'function NoteSearch({ notes, query }) {',
      '  const index = useMemo(() => buildSearchIndex(notes), [notes]);',
      '  const results = index.search(query);',
      '  return <ResultList results={results} />;',
      '}',
      '',
      '// Better: build the index once when notes is written, not on every read',
      '// (e.g. in the API handler that saves a note, or the loader that fetches them)',
      'function NoteSearch({ notes, prebuiltIndex, query }) {',
      '  const results = prebuiltIndex.search(query);',
      '  return <ResultList results={results} />;',
      '}'
    ),
    explanation:
      'Three places can do this work, and they are not equally good: in the render body it reruns on every render including ones that only changed query; in an effect it reruns reactively and adds a whole extra render pass on top; in useMemo it reruns only when notes actually changes, during the render that needs it, no extra pass. All three still repeat the work on every client that mounts this component. The write-time option breaks that pattern: notes changes far less often than NoteSearch renders, so building the index once when a note is saved and reading a finished index everywhere else amortizes the cost across every future read instead of paying it again per mount.',
  },

  {
    slug: 'react-lazy-bundle-growth',
    title: 'Splitting the button that is always visible',
    category: 'react',
    difficulty: 'medium',
    relevance: 'occasional',
    type: 'explain',
    prompt: md(
      'SubmitButton sits above the fold on the landing page, visible the instant the page loads:',
      '',
      code(
        'jsx',
        'const SubmitButton = lazy(() => import("./SubmitButton"));',
        '',
        'function LandingPage() {',
        '  return (',
        '    <Suspense fallback={<Spinner />}>',
        '      <SubmitButton />',
        '      <Hero />',
        '    </Suspense>',
        '  );',
        '}'
      ),
      '',
      'After this change, the network tab shows more total bytes downloaded for this page, not fewer, and users see a spinner where the button used to appear instantly. Explain why, and when lazy is the right call instead.'
    ),
    graderConfig: {
      groups: [
        {
          synonyms: [
            'first paint',
            'needed immediately',
            'critical path',
            'above the fold',
            'right away',
          ],
          missingFeedback:
            'When is SubmitButton actually needed: at first paint, or only after some later interaction?',
        },
        {
          synonyms: ['extra request', 'round trip', 'chunk overhead', 'separate request'],
          missingFeedback:
            'What does splitting it into its own chunk cost, on top of the code itself?',
        },
        {
          synonyms: ['not needed immediately', 'route', 'modal', 'rarely used'],
          missingFeedback: 'Name a case where lazy is the right call.',
        },
      ],
      hints: [
        'Ask when SubmitButton is needed: at first paint, or only after some later interaction?',
        'A dynamic import always costs a network round trip before the module resolves, even when the file itself is tiny.',
        'Reserve lazy for a route, a modal, or a feature most visits never touch, so the request only happens if the user gets there.',
      ],
    },
    canonicalAnswer:
      'SubmitButton is needed on first paint, so splitting it does not move any work off the critical path, it just adds an extra request and a loading spinner in front of something that used to render immediately. Each chunk also carries its own module overhead, and if it shares code with the main bundle a bundler that is not configured to dedupe that code ships it twice, which is how the total can grow instead of shrink. lazy pays off for code that is not needed immediately: a route the user has not navigated to yet, a modal that has not been opened, a feature most visits never touch, so its bytes and its request only happen if and when the user reaches it.',
    solution: code(
      'jsx',
      '// SubmitButton is needed immediately: import it normally',
      'import SubmitButton from "./SubmitButton";',
      '',
      '// A settings panel behind a click is a good lazy candidate',
      'const SettingsPanel = lazy(() => import("./SettingsPanel"));',
      '',
      'function LandingPage() {',
      '  const [showSettings, setShowSettings] = useState(false);',
      '  return (',
      '    <>',
      '      <SubmitButton />',
      '      <Hero />',
      '      {showSettings && (',
      '        <Suspense fallback={<Spinner />}>',
      '          <SettingsPanel />',
      '        </Suspense>',
      '      )}',
      '    </>',
      '  );',
      '}'
    ),
    explanation:
      'Code splitting trades bundle size for a network request; it is worth it exactly when that request can happen later than the code would otherwise have loaded, or not at all. Splitting something needed at first paint gets the trade backwards: the bytes still have to arrive before anything useful shows, plus the round trip to fetch them, plus a Suspense fallback the user did not have before. The measure is not whether a lazy call was added, it is whether this code gets requested later than it otherwise would have been, for a user who might never need it at all.',
  },

  {
    slug: 'react-batching-scope',
    title: 'Two updates outside an event handler',
    category: 'react',
    difficulty: 'easy',
    relevance: 'foundational',
    type: 'short-text',
    prompt: md(
      "Since React 18, this listener's two setState calls trigger one rerender, not two, because updates inside native event listeners now batch automatically, the same as updates inside a JSX handler:",
      '',
      code(
        'jsx',
        'function handleServerMessage() {',
        '  setCount((c) => c + 1);',
        '  setFlag((f) => !f);',
        '}',
        '',
        'socket.addEventListener("message", handleServerMessage);'
      ),
      '',
      'If you needed the count update to land in the DOM before the very next line of code runs, name the function that forces that.'
    ),
    graderConfig: {
      accept: ['flushsync'],
      acceptPatterns: ['flush\\s*sync'],
      nearMisses: {
        unstable_batchedupdates:
          'That was the pre-18 escape hatch for forcing a batch. You need the opposite: a way to force an immediate, synchronous flush.',
        usetransition:
          'useTransition marks an update as low priority. It does not force one to flush synchronously.',
        batching:
          'Batching is the behavior itself, not a function you call. Name the escape hatch that forces a synchronous flush.',
      },
      hints: [
        'Since React 18, updates inside promises, timeouts and native event listeners batch automatically, the same as updates inside JSX handlers.',
        'There is a dedicated escape hatch that forces a synchronous flush when you truly need the DOM updated before the next line runs.',
        'import { flushSync } from "react-dom";',
      ],
    },
    canonicalAnswer: 'flushSync',
    solution: code(
      'jsx',
      'import { flushSync } from "react-dom";',
      '',
      'function handleServerMessage() {',
      '  flushSync(() => {',
      '    setCount((c) => c + 1);',
      '  });',
      '  setFlag((f) => !f); // still batched with nothing else here',
      '}'
    ),
    explanation:
      'Automatic batching in React 18+ extends the old event-handler-only rule to promises, timeouts and native listeners like this one, so two setState calls that used to trigger two renders outside a handler now trigger one. flushSync is the deliberate escape hatch: it forces React to apply an update and commit to the DOM before returning, occasionally necessary for something like measuring layout right after a change. It re-renders synchronously and can hurt performance, which is why the docs call it a last resort rather than a default.',
  },

  {
    slug: 'react-effect-vs-handler',
    title: 'The state that only exists to trigger an effect',
    category: 'react',
    difficulty: 'easy',
    relevance: 'daily',
    type: 'short-text',
    prompt: md(
      'Switch product after a purchase and `trackPurchase` fires a second time, for a product nobody bought:',
      '',
      code(
        'jsx',
        'function BuyButton({ productId }) {',
        '  const [bought, setBought] = useState(false);',
        '',
        '  useEffect(() => {',
        '    if (bought) trackPurchase(productId);',
        '  }, [bought, productId]);',
        '',
        '  return <button onClick={() => setBought(true)}>Buy</button>;',
        '}'
      ),
      '',
      '`productId` changed and `bought` is still true, so the effect runs again. Name where the `trackPurchase` call belongs instead.'
    ),
    graderConfig: {
      accept: [
        'the event handler',
        'event handler',
        'the click handler',
        'click handler',
        'the onclick handler',
        'onclick handler',
        'onclick',
        'in the event handler',
        'in the click handler',
      ],
      acceptPatterns: ['(event|click|onclick|button)\\s*handler', '\\bonClick\\b'],
      nearMisses: {
        'during render':
          'Rendering has to stay free of side effects. Put the call where the user acted.',
        useeffect:
          'Fixing the dependency array keeps both the effect and the state that only exists to feed it.',
      },
      hints: [
        'Nothing outside React is being synchronised here, so there is nothing for an effect to synchronise with.',
        'The click already knows a purchase happened. The effect only learns it second-hand, from state.',
        'Call `trackPurchase(productId)` inside `onClick`, and delete the `bought` state with it.',
      ],
    },
    canonicalAnswer: 'the click handler',
    solution: code(
      'jsx',
      'function BuyButton({ productId }) {',
      '  function onBuy() {',
      '    trackPurchase(productId);',
      '  }',
      '',
      '  return <button onClick={onBuy}>Buy</button>;',
      '}'
    ),
    explanation:
      "A handler knows **what happened**; an effect only sees the state that came out of it, so it fires again for any other reason that state is still true. That is the whole difference, and it is why `bought` can be deleted along with the effect: it existed to carry the click across to code that had no other way to hear about it. The line that survives is React's own: an effect is for synchronising with something outside React, a subscription, a timer, the DOM, a request whose answer belongs on screen. Reacting to something the user did is the handler's job, and the handler is also where you still have the click itself, which the effect never sees.",
  },

  {
    slug: 'react-context-memo-consumer',
    title: 'Wrapped in memo, and still following the context',
    category: 'react',
    difficulty: 'easy',
    relevance: 'occasional',
    type: 'explain',
    prompt: md(
      'Sidebar is memoized and it rerenders every time the provider publishes a new value:',
      '',
      code(
        'jsx',
        'const Sidebar = memo(function Sidebar() {',
        '  const { theme } = useContext(AppContext);',
        '  return <aside className={theme}>...</aside>;',
        '});'
      ),
      '',
      'Explain why memo cannot stop it.'
    ),
    graderConfig: {
      groups: [
        {
          synonyms: ['props', 'prop'],
          missingFeedback: 'What is the only thing memo compares?',
        },
        {
          synonyms: ['inside', 'below', 'subscri', 'not a prop', 'not props', 'separate channel'],
          missingFeedback: 'Where does the context read happen, relative to that comparison?',
        },
      ],
      hints: [
        'memo has one job: skip a render when every prop is `Object.is`-equal to last time.',
        'Sidebar takes no props at all, so there is nothing for that comparison to save.',
        'useContext subscribes the component from the inside, below the props comparison, so memo never sees the subscription at all.',
      ],
    },
    canonicalAnswer:
      'memo only compares props, and Sidebar receives none. The useContext call subscribes the component from the inside, below the props comparison memo performs, so a new context value rerenders it whatever memo decides.',
    solution: code(
      'jsx',
      '// memo works once the context read happens above it and arrives as a prop',
      'function SidebarContainer() {',
      '  const { theme } = useContext(AppContext);',
      '  return <Sidebar theme={theme} />;',
      '}',
      '',
      'const Sidebar = memo(function Sidebar({ theme }) {',
      '  return <aside className={theme}>...</aside>;',
      '});'
    ),
    explanation:
      'memo is a gate on props, and context does not arrive through props. react.dev states the consequence plainly: a memoized component still rerenders when a context it uses changes. memo is not useless here, it is in the wrong place. Read the context in a thin outer component and pass the one field down, and the memoized subtree below stops following the value, which is worth doing when that subtree is expensive. The other lever is scope: when the value changes often and most consumers do not care, split it into two contexts so they are not subscribed to the fast-moving half.',
  },

  {
    slug: 'react-content-visibility',
    title: 'The profiler is quiet and scrolling still stutters',
    category: 'react',
    difficulty: 'easy',
    relevance: 'occasional',
    type: 'short-text',
    prompt: md(
      'A table of 20,000 rows renders once and never rerenders. The profiler agrees that React is doing nothing while you scroll, and it still stutters on a mid-range phone: 20,000 elements are in the document and the browser pays style and layout for every one of them.',
      '',
      'Find-in-page and printing have to keep working, so the rows have to stay in the DOM. Name the CSS property that lets the browser skip rendering work for the ones offscreen.'
    ),
    graderConfig: {
      accept: [
        'content-visibility',
        'content-visibility: auto',
        'content visibility',
        'contentvisibility',
      ],
      acceptPatterns: ['content-?\\s*visibility'],
      nearMisses: {
        windowing:
          'Windowing unmounts the offscreen rows, which is exactly what takes find-in-page and printing with them.',
        'display: none':
          'That removes the content from find-in-page and from the accessibility tree too.',
        'visibility: hidden':
          'A hidden element still takes up its box and is still laid out, so the bill stays.',
      },
      hints: [
        'React is not the cost here. The 20,000 elements sitting in the document are.',
        'You want the engine to skip style, layout and paint for the rows nobody is looking at, while leaving them in the document.',
        '`content-visibility: auto`, usually alongside `contain-intrinsic-size`.',
      ],
    },
    canonicalAnswer: 'content-visibility',
    solution: code(
      'css',
      '.row {',
      '  content-visibility: auto;',
      '  contain-intrinsic-size: auto 32px;',
      '}'
    ),
    explanation:
      "`content-visibility: auto` answers the browser's bill and not React's. React still builds, reconciles and commits all 20,000 elements, so a slow render is untouched; what it saves is the style, layout and paint the engine would spend on rows nobody is looking at. That is the trade against windowing, which unmounts the offscreen rows and so fixes both costs while taking find-in-page, printing, anchor links and focus order with them. Pair it with `contain-intrinsic-size`, which gives the browser a placeholder size for skipped content so the scrollbar does not jump as rows are measured on the way past.",
  },

  {
    slug: 'react-lazy-in-render',
    title: 'The lazy panel that remounts on every render',
    category: 'react',
    difficulty: 'easy',
    relevance: 'occasional',
    type: 'short-text',
    prompt: md(
      'Typing in the editor is lost every time the parent rerenders, and the spinner flashes again each time:',
      '',
      code(
        'jsx',
        'function Page({ draft }) {',
        "  const Editor = lazy(() => import('./Editor'));",
        '',
        '  return (',
        '    <Suspense fallback={<Spinner />}>',
        '      <Editor draft={draft} />',
        '    </Suspense>',
        '  );',
        '}'
      ),
      '',
      'Name where the `lazy()` call has to go instead.'
    ),
    graderConfig: {
      accept: [
        'module scope',
        'top level',
        'the top level of the module',
        'module level',
        'outside the component',
      ],
      acceptPatterns: [
        'top[\\s-]?level',
        'module\\s+(scope|level)',
        'outside\\s+(of\\s+)?the\\s+component',
      ],
      nearMisses: {
        usememo:
          'A memo keeps the type stable while this component is mounted, and mints a new one the moment it remounts. Take the call out of the component entirely.',
        suspense: 'The boundary is already there. What is wrong is where `lazy()` is called.',
      },
      hints: [
        '`lazy()` returns a component type, and this one is built fresh on every render.',
        'React decides whether to keep a subtree by comparing element types, so a new type every render means a remount every render.',
        'Call `lazy()` once, at the top level of the module, and hold the result in a module-scope const.',
      ],
    },
    canonicalAnswer: 'the top level of the module',
    solution: code(
      'jsx',
      "const Editor = lazy(() => import('./Editor')); // module scope, called once",
      '',
      'function Page({ draft }) {',
      '  return (',
      '    <Suspense fallback={<Spinner />}>',
      '      <Editor draft={draft} />',
      '    </Suspense>',
      '  );',
      '}'
    ),
    explanation:
      'React reconciles on the element **type**, and `lazy()` returns a new type every time it is called. Calling it in a render body therefore hands React a type it has never seen on each render, and the only thing it can do with a changed type is unmount the old tree and mount a fresh one, taking the state inside with it. The new wrapper then suspends again before its already-cached module resolves, which is the spinner. react.dev puts it directly: do not declare `lazy` components inside other components. None of this is special to `lazy`, either. Any component defined inside another component gets a new identity every render and remounts for exactly the same reason.',
  },

  {
    slug: 'react-read-timer-hook',
    title: 'A hook with a timer and a cleanup',
    category: 'react',
    difficulty: 'medium',
    relevance: 'daily',
    tags: ['reading'],
    type: 'explain',
    prompt: md(
      'A search box reads its term through this hook, as `useSearchTerm(query, 300)`:',
      '',
      code(
        'jsx',
        'function useSearchTerm(value, delay) {',
        '  const [current, setCurrent] = useState(value);',
        '',
        '  useEffect(() => {',
        '    const id = setTimeout(() => setCurrent(value), delay);',
        '    return () => clearTimeout(id);',
        '  }, [value, delay]);',
        '',
        '  return current;',
        '}'
      ),
      '',
      'In one sentence: which values does a component get back from this, and what happens to the rest?'
    ),
    graderConfig: {
      groups: [
        {
          synonyms: [
            'stop',
            'stops',
            'stopped',
            'settle',
            'settles',
            'settled',
            'pause',
            'paused',
            'quiet',
            'idle',
            'last',
            'latest',
            'final',
            'debounce',
          ],
          missingFeedback:
            'Say which values reach the component: every one it is passed, or one of them.',
        },
        {
          synonyms: [
            'cleartimeout',
            'clear the timeout',
            'clears the timeout',
            'cancel',
            'cancels',
            'cancelled',
            'canceled',
            'cleanup',
            'clean up',
            'resets the timer',
            'restarts the timer',
            'throws away the timer',
          ],
          missingFeedback:
            'What does the function the effect returns do, and when does React call it?',
        },
      ],
      hints: [
        'Read the dependency array first: the effect re-runs on every new `value`.',
        'React runs the previous cleanup before it re-runs an effect.',
        'So each new value cancels the timer the one before it set, and only a value that survives `delay` ms is ever stored.',
      ],
    },
    canonicalAnswer:
      'It returns the value only once it has stopped changing for delay ms: every new value re-runs the effect, and the cleanup clears the pending timeout, so the values in between are cancelled and the component never sees them.',
    solution: md(
      'It debounces. The component sees the value only after `delay` ms with no change, and never sees the ones typed in between.',
      '',
      code(
        'jsx',
        "// typing 'react' one letter at a time, 20ms apart, with delay = 50:",
        "// the component renders 'r', then 'react'. 're', 'rea' and 'reac' never arrive."
      )
    ),
    explanation:
      "The cleanup is what makes this a debounce rather than a delay. React runs the previous effect's cleanup before re-running it, so each new `value` cancels the timeout the previous one scheduled, and a timeout only ever fires if its value survives `delay` ms unchanged. Rendered for real with `delay = 50` and a new letter every 20ms, a component fed `r`, `re`, `rea`, `reac`, `react` received `r` and then `react`, and nothing else. Drop the `clearTimeout` and every keystroke lands `delay` ms later instead, which is the same number of renders as before with a lag added: a delay, not a debounce.",
  },

  {
    slug: 'react-hydration-mismatch-cost',
    title: 'Two mismatches, two bills',
    category: 'react',
    difficulty: 'medium',
    relevance: 'occasional',
    type: 'explain',
    prompt: md(
      "A page hydrates with two mismatches. The server container is set to UTC, the reader's browser",
      'is in New York, and `isNarrow` is measured from the viewport:',
      '',
      code(
        'jsx',
        "<p>Updated {new Date(at).toLocaleString('en-GB')}</p>",
        "<nav className={isNarrow ? 'nav-narrow' : 'nav-wide'} />"
      ),
      '',
      'One of these is the expensive failure and the other is the dangerous one. Explain what each',
      'costs in the DOM.'
    ),
    graderConfig: {
      groups: [
        {
          synonyms: [
            'discard',
            'regenerat',
            'rebuil',
            'recreat',
            'remount',
            'thrown away',
            'throw away',
            'from scratch',
            'every node',
            'whole tree',
            'boundary',
            'suspense',
          ],
          missingFeedback: 'What happens to the DOM nodes around the text mismatch?',
        },
        {
          synonyms: [
            'not patch',
            'never patch',
            "isn't patch",
            'not repair',
            'never repair',
            'unrepaired',
            'keeps',
            'kept',
            'stays',
            'left alone',
            'stale',
            'nav-narrow',
          ],
          missingFeedback: 'And the class attribute: what does the DOM end up holding?',
        },
        {
          synonyms: [
            'silent',
            'production',
            'no warning',
            'no error',
            'nothing',
            'unnoticed',
            'no log',
          ],
          missingFeedback: 'Which of the two would you never hear about, and why?',
        },
      ],
      hints: [
        'Hydration compares two renders. What it does about a difference depends on where the difference is.',
        'One of them regenerates DOM nodes. The other leaves the DOM exactly as the server wrote it.',
        'The attribute mismatch is never patched up, and a production build does not log it.',
      ],
    },
    canonicalAnswer:
      "The text mismatch is loud and expensive: React discards every node up to the nearest Suspense boundary, or the whole root when there is none, and rebuilds them, so focus, scroll and uncontrolled input values go with them. The attribute mismatch is cheap and dangerous: it is never patched up, so the DOM keeps the server's nav-narrow while React's tree believes nav-wide, and a production build logs nothing at all.",
    solution: md(
      'Text mismatch: React discards every node up to the nearest `<Suspense>` boundary and rebuilds',
      'it. Expensive, and it announces itself.',
      '',
      'Attribute mismatch: nothing is repaired. The DOM keeps `nav-narrow`, React believes',
      '`nav-wide`, and a production build logs nothing.'
    ),
    explanation:
      'Measured on React 19.2.8: a text mismatch inside a `<p>` nested three levels deep discarded all five nodes in the tree, and a `<Suspense>` boundary around the section cut that to two. The server render bought nothing for the region it threw away, and whatever the DOM was holding went with it: focus, scroll position, an uncontrolled input\'s value. The attribute mismatch kept every node and repaired none. React gives the reason rather than apologising for it: "There are no guarantees that attribute differences will be patched up ... validating all markup would be prohibitively expensive." So the `<nav>` keeps the server\'s class through later state changes that rewrite the text inside it, a development build logs one line, and a production build logs nothing. The failure that shouts is the one you fix in an afternoon.',
  },

  {
    slug: 'react-suppress-hydration-warning',
    title: 'The warning is gone, the time is wrong',
    category: 'react',
    difficulty: 'medium',
    relevance: 'occasional',
    type: 'short-text',
    prompt: md(
      'A comment timestamp mismatched during hydration, so the warning was silenced:',
      '',
      code(
        'jsx',
        '<time dateTime={at} suppressHydrationWarning>',
        "  {new Date(at).toLocaleString('en-GB')}",
        '</time>'
      ),
      '',
      'The server container is set to UTC and the reader is in New York, so the two renders produce',
      'different text. Whose text is on screen once hydration finishes, and still there after a',
      'later re-render of this component?'
    ),
    graderConfig: {
      accept: [
        "the server's",
        "server's",
        'the server',
        'server',
        'the server render',
        'the server pass',
        "the server's text",
      ],
      closeSubstrings: {
        client:
          "That is what you get without the prop: a text mismatch discards the node and rebuilds it from the client render. Suppressing the warning keeps the node instead, so the other render's text is the one that stays.",
        '06:20':
          "That is the browser's render. The prop keeps the node React would otherwise have discarded, so the text written before it was ever sent is the text that stays.",
      },
      hints: [
        'The prop tells React not to report the difference. It does not tell React to fix it.',
        'Without the prop, a text mismatch discards the node and rebuilds it from the client render. With it, the node is kept.',
        'Kept means the string that arrived in the HTML is still there, and still there after the next re-render.',
      ],
    },
    canonicalAnswer: "the server's",
    solution:
      "The server's. `suppressHydrationWarning` keeps the node React would otherwise have discarded, so the UTC text stays on screen.",
    explanation:
      'Measured on React 19.2.8: with the prop, hydration reports nothing, keeps every node, and leaves the server\'s `19/02/2026, 11:20:00` on screen, still there after a state change re-rendered the same component. The prop is not a fix for a zone problem, it is a way to stop hearing about one, and it leaves the reader on UTC. React calls it "an escape hatch" and says "Don\'t overuse it." The two fixes that localise anything are sending the finished string from the server, which needs the zone in a cookie because a request does not carry it, or rendering something zone-free and correcting it after mount, which costs a second render and a flash. `dateTime` is doing the other half of the job: whatever the text says, the machine-readable value stays right.',
  },

  {
    slug: 'react-typeof-window-guard',
    title: 'The guard that shipped the bug',
    category: 'react',
    difficulty: 'medium',
    relevance: 'daily',
    type: 'explain',
    prompt: md(
      'A component read `window.innerWidth` during render, and the server pass threw',
      '`ReferenceError: window is not defined`. This shipped:',
      '',
      code('jsx', "const isNarrow = typeof window !== 'undefined' && window.innerWidth < 700;"),
      '',
      'The crash is gone. Explain what replaced it, and what you would do instead.'
    ),
    graderConfig: {
      groups: [
        {
          synonyms: [
            'mismatch',
            'differ',
            'different branch',
            'branch',
            'false on the server',
            'true in the browser',
            'disagree',
            'hydrat',
          ],
          missingFeedback: 'What value does the guard have in each of the two passes?',
        },
        {
          synonyms: [
            'silent',
            'every request',
            'someone else',
            'production',
            'intermittent',
            'harder',
            'deterministic',
            "you don't have",
            'do not have',
          ],
          missingFeedback: 'Compare the two failures: where and when does each one show up?',
        },
        {
          synonyms: [
            'effect',
            'usestate',
            'isclient',
            'after mount',
            'on mount',
            'client-only',
            'client only',
            'fallback',
            'ssr: false',
          ],
          missingFeedback: 'What would you do instead?',
        },
      ],
      hints: [
        "`typeof window !== 'undefined'` has a known value in each pass. Write down what it is in both.",
        'The two renders now take different branches, which is exactly what hydration compares.',
        'A crash happens on every request and you fix it that morning. A mismatch happens in a browser you do not have.',
      ],
    },
    canonicalAnswer:
      "The guard is false during the server pass and true in the browser, so the two renders take different branches by construction and hydration mismatches. That trades a crash you get on every request, which you find immediately, for a wrong render in someone else's browser that a production build never logs. Render the server's version, then set an isClient flag in an effect and re-render, or mark the subtree client-only so the server emits a fallback.",
    solution: md(
      code(
        'jsx',
        'const [isClient, setIsClient] = useState(false);',
        'useEffect(() => setIsClient(true), []);',
        'const isNarrow = isClient && window.innerWidth < 700;'
      ),
      '',
      'Both passes render the same thing, then the client corrects itself. The alternative is marking',
      'the subtree client-only so the server renders a fallback for it.'
    ),
    explanation:
      "React's hydration error message lists this cause first: \"A server/client branch `if (typeof window !== 'undefined')`\". The guard does exactly what it says, which is the problem. It is false where there is no `window` and true where there is, so the two passes render different trees on purpose, and hydration is the comparison that catches it. What was given up is worth naming: a `ReferenceError` out of `renderToString` fails every request, in your own terminal, on the first one you send. A mismatch fails in a browser you do not have, and if it lands on an attribute rather than text, nothing is repaired and a production build logs nothing. The honest fix costs a second render, because a value only one runtime can work out has to travel with the HTML or wait until after hydration.",
  },
];
