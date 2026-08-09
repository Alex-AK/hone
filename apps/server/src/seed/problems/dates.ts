import { code, codeProblem, md, type ProblemDraft } from './types';

export const dateProblems: ProblemDraft[] = [
  {
    slug: 'dates-month-index',
    title: 'The off-by-one month',
    category: 'dates',
    difficulty: 'easy',
    relevance: 'daily',
    type: 'short-text',
    prompt: md(
      'This logs March, not February:',
      '',
      code('js', 'const d = new Date(2026, 2, 1);', 'console.log(d.toDateString());'),
      '',
      'What is the correct second argument for February?'
    ),
    graderConfig: {
      accept: ['1', 'one'],
      acceptPatterns: ['^\\s*1\\s*$', 'new Date\\(2026,\\s*1,'],
      closeSubstrings: {
        'zero-index': 'Right diagnosis. Now give the number.',
        '0-index': 'Right diagnosis. Now give the number.',
      },
      hints: [
        'Month is the odd one out among the Date constructor arguments.',
        'Months are zero-indexed; days of the month are not.',
        'February is month 1.',
      ],
    },
    canonicalAnswer: '1',
    solution: code(
      'js',
      'const d = new Date(2026, 1, 1); // February',
      "// or avoid the trap entirely with an ISO string:  new Date('2026-02-01T00:00:00')"
    ),
    explanation:
      'Months are zero-indexed (0 = January, 11 = December) while day-of-month, year, hours and minutes are all what you would expect. There is no reason for it beyond a 1995 decision copied from Java, and it is still one of the most common date bugs in JavaScript. `getMonth()` has the same offset, so formatting code needs the matching `+ 1`. Temporal, the replacement API now shipping in browsers, uses one-based months precisely because this trap has cost the industry so much.',
  },

  {
    slug: 'dates-iso-date-only-utc',
    title: 'The date that shifted a day',
    category: 'dates',
    difficulty: 'medium',
    relevance: 'daily',
    type: 'explain',
    prompt: md(
      'A user in Los Angeles picks 2026-03-14 in a date input. The app renders it back as March 13:',
      '',
      code(
        'js',
        "const d = new Date('2026-03-14');",
        'console.log(d.toLocaleDateString()); // "3/13/2026"'
      ),
      '',
      'Explain why, and give a fix.'
    ),
    graderConfig: {
      groups: [
        {
          synonyms: ['utc', 'gmt', 'zulu', 'z'],
          missingFeedback: 'How is a bare date-only string interpreted?',
        },
        {
          synonyms: ['local', 'timezone', 'time zone', 'offset', 'behind', 'ahead'],
          missingFeedback: 'What does it get converted to when displayed?',
        },
        {
          synonyms: [
            'midnight',
            '00:00',
            'previous day',
            'day before',
            'back a day',
            'earlier',
            'evening',
          ],
          missingFeedback: 'Why does that land on the 13th rather than the 14th?',
        },
        {
          synonyms: [
            'new date(2026, 2, 14)',
            't00:00',
            'add a time',
            'parse the parts',
            'split',
            'components',
            'utc method',
            'string',
            'plaindate',
          ],
          missingFeedback: 'Give a fix.',
        },
      ],
      hints: [
        'A date-only ISO string and a full date-time string are parsed by different rules.',
        'Date-only strings are treated as UTC midnight.',
        'UTC midnight is the previous evening anywhere west of Greenwich.',
      ],
    },
    canonicalAnswer:
      'A date-only ISO string is parsed as UTC midnight, then toLocaleDateString converts it to the local time zone. Los Angeles is eight hours behind UTC, so UTC midnight on the 14th is 4pm on the 13th locally and it renders as the previous day. Fix it by constructing from parts with new Date(2026, 2, 14), by appending a time so it parses as local (2026-03-14T00:00:00), or by keeping the value as a plain string and never turning a calendar date into a Date at all.',
    solution: code(
      'js',
      "// parsed as UTC midnight -> shifts west of Greenwich\nnew Date('2026-03-14');",
      '',
      '// parsed as local midnight',
      "new Date('2026-03-14T00:00:00');",
      '',
      '// or keep calendar dates as strings and format them yourself',
      "const [y, m, d] = '2026-03-14'.split('-').map(Number);"
    ),
    explanation:
      'The spec really does treat these two formats differently: a date-only form is UTC, a date-time form without an offset is local. So `new Date("2026-03-14")` and `new Date("2026-03-14T00:00:00")` are eight hours apart in California and identical in London, which is exactly why this ships to production. The deeper lesson is that a birthday or a due date is not an instant in time, it is a calendar date, and forcing it through a timestamp always risks a shift. Keep such values as strings end to end, or use `Temporal.PlainDate`.',
  },

  {
    slug: 'dates-format-locale',
    title: 'Formatting a date for a user',
    category: 'dates',
    difficulty: 'easy',
    relevance: 'daily',
    type: 'short-text',
    prompt: md(
      'You need "14 March 2026" in the user’s own language and conventions, without shipping a formatting library.',
      '',
      'Name the built-in API.'
    ),
    graderConfig: {
      accept: [
        'intl.datetimeformat',
        'intl.datetimeformat()',
        'datetimeformat',
        'tolocaledatestring',
        'tolocaledatestring()',
      ],
      acceptPatterns: ['Intl\\.DateTimeFormat', 'toLocaleDateString'],
      nearMisses: {
        toisostring: 'toISOString always gives the same machine format, never a localised one.',
      },
      hints: [
        'It is built into the language, no dependency needed.',
        'The same family covers numbers, currency, plurals and relative time.',
        '`Intl.DateTimeFormat`, or the `toLocaleDateString` shortcut.',
      ],
    },
    canonicalAnswer: 'Intl.DateTimeFormat',
    solution: code(
      'js',
      'new Intl.DateTimeFormat(undefined, {',
      "  day: 'numeric',",
      "  month: 'long',",
      "  year: 'numeric',",
      '}).format(date);',
      '',
      "// shortcut for one-off formatting\ndate.toLocaleDateString(undefined, { dateStyle: 'long' });"
    ),
    explanation:
      'Passing `undefined` as the locale uses the user’s own, which is almost always what you want. Reuse a constructed `Intl.DateTimeFormat` when formatting many values: construction is the expensive part and `toLocaleDateString` builds a new one every call, which shows up in a list of a thousand rows. The same family gives you `Intl.NumberFormat` for currency, `Intl.RelativeTimeFormat` for "3 days ago" without hand-rolled plural rules, and `Intl.ListFormat` for "a, b and c". Between them they replace most of what date libraries used to be for.',
  },

  {
    slug: 'dates-utc-storage',
    title: 'What to store in the database',
    category: 'dates',
    difficulty: 'medium',
    relevance: 'daily',
    type: 'explain',
    prompt: md(
      'Your API stores event timestamps as `2026-03-14 09:00:00` with no zone, written from whatever server handled the request.',
      '',
      'Explain the problem and what to store instead.'
    ),
    graderConfig: {
      groups: [
        {
          synonyms: ['ambiguous', 'no zone', 'unknown', 'which zone', 'cannot tell', 'meaningless'],
          missingFeedback: 'What is wrong with a bare local timestamp?',
        },
        {
          synonyms: ['utc', 'offset', 'timestamptz', 'epoch', 'unix'],
          missingFeedback: 'What should be stored instead?',
        },
        {
          synonyms: ['convert', 'display', 'render', 'client', 'user’s', 'users', 'local time'],
          missingFeedback: 'Where should the conversion to local time happen?',
        },
      ],
      hints: [
        'Two servers in different regions writing "09:00" mean different instants.',
        'Store an unambiguous instant, convert only when displaying.',
        'UTC (or a timestamptz), converted to the user’s zone at render time.',
      ],
    },
    canonicalAnswer:
      'A timestamp with no zone is ambiguous: 09:00 written by a server in Dublin and one in Sydney are different instants, and you cannot tell them apart afterwards. Store an unambiguous instant instead, either UTC or a timestamp with time zone, and convert to the user’s local zone only when you display it.',
    solution: code(
      'sql',
      '-- store the instant, unambiguously',
      'created_at timestamptz NOT NULL DEFAULT now()',
      '',
      '-- a future wall-clock appointment is a different problem:',
      '-- keep the local time AND the zone id, not just the instant',
      'starts_at_local timestamp NOT NULL,',
      "starts_at_zone  text NOT NULL  -- 'Europe/Dublin'"
    ),
    explanation:
      'Store instants in UTC, convert at the edges. The one important exception is a future appointment expressed in wall-clock time: if a government moves a daylight-saving boundary between now and then, "9am local" and the UTC instant you computed for it stop agreeing, and the user cares about 9am. For those, store the local time plus the IANA zone id and resolve at read time. Never store a fixed offset like `+01:00` as a substitute for a zone, because the offset changes twice a year and the zone id is what tells you when.',
  },

  {
    slug: 'dates-dst-add-day',
    title: 'Adding 24 hours is not adding a day',
    category: 'dates',
    difficulty: 'hard',
    relevance: 'occasional',
    type: 'explain',
    prompt: md(
      'A reminder set for "tomorrow at the same time" is an hour off twice a year:',
      '',
      code('js', 'const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);'),
      '',
      'Explain why, and give a correct approach.'
    ),
    graderConfig: {
      groups: [
        {
          synonyms: ['dst', 'daylight', 'summer time', 'clocks change', 'clock change'],
          missingFeedback: 'What happens twice a year?',
        },
        {
          synonyms: ['23', '25', 'not 24', 'fewer', 'longer', 'shorter', 'vary'],
          missingFeedback: 'How long is a calendar day around that boundary?',
        },
        {
          synonyms: [
            'setdate',
            'getdate() + 1',
            'calendar',
            'date arithmetic',
            'plaindate',
            'temporal',
            'add({ days',
            'date-fns',
            'adddays',
          ],
          missingFeedback: 'Give a correct approach.',
        },
      ],
      hints: [
        'A calendar day is not always 86,400 seconds long.',
        'On the DST transition it is 23 or 25 hours.',
        'Do calendar arithmetic (`setDate(getDate() + 1)`) instead of adding milliseconds.',
      ],
    },
    canonicalAnswer:
      'Adding a fixed 24 hours adds an exact duration, but a calendar day across a daylight saving boundary is 23 or 25 hours long, so the wall-clock time drifts by an hour. Use calendar arithmetic instead: copy the date and call setDate(getDate() + 1), which keeps the local time of day, or use Temporal.PlainDate and add({ days: 1 }).',
    solution: code(
      'js',
      'const tomorrow = new Date(now);',
      'tomorrow.setDate(tomorrow.getDate() + 1); // keeps the local time of day',
      '',
      '// Temporal makes the distinction explicit',
      '// zoned.add({ days: 1 })   calendar day\n// zoned.add({ hours: 24 })  exact duration'
    ),
    explanation:
      'There are two different operations hiding behind "add a day": add an exact elapsed duration, or move to the same clock time on the next calendar day. Milliseconds give you the first, `setDate` gives you the second, and for a reminder the user means the second. Temporal makes the distinction explicit in its API, which is a large part of why it exists. The same trap catches month arithmetic even harder: adding a month to January 31st has no single obviously correct answer, and every library picks a convention you should look up rather than assume.',
  },

  {
    slug: 'dates-relative-time',
    title: '"3 days ago" without a library',
    category: 'dates',
    difficulty: 'medium',
    relevance: 'occasional',
    type: 'short-text',
    prompt: md(
      'You need "in 5 minutes", "3 days ago" and "last month", correctly pluralised in the user’s language.',
      '',
      'Name the built-in API.'
    ),
    graderConfig: {
      accept: ['intl.relativetimeformat', 'relativetimeformat', 'intl.relativetimeformat()'],
      acceptPatterns: ['Intl\\.RelativeTimeFormat'],
      nearMisses: {
        'intl.datetimeformat': 'That formats absolute dates. There is a sibling for relative ones.',
      },
      hints: [
        'It is in the same family as `Intl.DateTimeFormat`.',
        'You give it a signed number and a unit; it handles the wording and plurals.',
        '`Intl.RelativeTimeFormat`',
      ],
    },
    canonicalAnswer: 'Intl.RelativeTimeFormat',
    solution: code(
      'js',
      "const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });",
      'rtf.format(-3, \'day\');   // "3 days ago"',
      'rtf.format(5, \'minute\'); // "in 5 minutes"',
      "rtf.format(-1, 'month'); // \"last month\"  (numeric: 'auto')"
    ),
    explanation:
      'The sign carries the direction: negative is past, positive is future. `numeric: "auto"` is what turns `-1 day` into "yesterday" and `-1 month` into "last month" rather than the more robotic "1 day ago". You still have to pick the unit yourself, which is the part worth writing carefully: choose the largest unit whose absolute value is at least one, and decide deliberately whether "yesterday" means 24 hours ago or the previous calendar date, because users mean the calendar one.',
  },

  codeProblem({
    slug: 'dates-days-between',
    title: 'Whole days between two dates',
    category: 'dates',
    difficulty: 'medium',
    relevance: 'occasional',
    prompt: md(
      'Write `daysBetween(a, b)` returning the number of whole calendar days from `a` to `b`, ignoring the time of day and any daylight saving shift.',
      '',
      'A later `b` gives a positive number, an earlier `b` a negative one, and the same calendar day gives 0.'
    ),
    starter: 'function daysBetween(a, b) {\n  \n}',
    tests: [
      {
        name: 'counts a simple gap',
        expression: 'daysBetween(new Date(2026, 0, 1), new Date(2026, 0, 4))',
        expected: 3,
      },
      {
        name: 'ignores the time of day',
        expression: 'daysBetween(new Date(2026, 0, 1, 23, 59), new Date(2026, 0, 2, 0, 1))',
        expected: 1,
      },
      {
        name: 'returns 0 within the same day',
        expression: 'daysBetween(new Date(2026, 0, 1, 6), new Date(2026, 0, 1, 22))',
        expected: 0,
      },
      {
        name: 'goes negative backwards',
        expression: 'daysBetween(new Date(2026, 0, 10), new Date(2026, 0, 3))',
        expected: -7,
      },
      {
        // 29 March 2026 is the European spring-forward: the run of calendar days
        // must not be thrown off by the hour the clocks move.
        name: 'survives a daylight saving boundary',
        expression: 'daysBetween(new Date(2026, 2, 28), new Date(2026, 3, 4))',
        expected: 7,
      },
    ],
    reference: [
      'function daysBetween(a, b) {',
      '  const MS_PER_DAY = 24 * 60 * 60 * 1000;',
      '  // Compare UTC midnights of the local calendar dates: no DST inside UTC.',
      '  const start = Date.UTC(a.getFullYear(), a.getMonth(), a.getDate());',
      '  const end = Date.UTC(b.getFullYear(), b.getMonth(), b.getDate());',
      '  return Math.round((end - start) / MS_PER_DAY);',
      '}',
    ].join('\n'),
    hints: [
      'Strip the time of day before you subtract anything.',
      'Subtracting local midnights still crosses DST, so the gap can be 23 or 25 hours.',
      'Rebuild both dates as UTC midnights with `Date.UTC(y, m, d)`, then subtract.',
    ],
    explanation:
      'The trick is to take the local calendar date (`getFullYear`/`getMonth`/`getDate`) and rebuild it as a **UTC** midnight. UTC has no daylight saving, so every day there is exactly 86,400,000 ms and the division is exact. Subtracting local midnights instead leaves you with 23- or 25-hour days twice a year, and a `Math.floor` then reports 6 days for a 7-day gap. `Math.round` is a belt-and-braces guard for the same reason. This is the standard shape of calendar arithmetic in plain JavaScript, and the reason `Temporal.PlainDate.until` exists.',
  }),

  {
    slug: 'dates-input-value-format',
    title: 'What a date input expects',
    category: 'dates',
    difficulty: 'easy',
    relevance: 'daily',
    type: 'short-text',
    prompt: md(
      'Setting a date input from a JS `Date` shows an empty field:',
      '',
      code('js', "input.value = date.toString(); // '' in the UI"),
      '',
      'What string format does `<input type="date">` require for its value?'
    ),
    graderConfig: {
      accept: ['yyyy-mm-dd', 'iso', 'iso 8601', 'iso8601', 'yyyy-mm-dd (iso)'],
      acceptPatterns: ['y{2,4}-?m{2}-?d{2}', 'iso'],
      nearMisses: {
        'dd/mm/yyyy': 'That is a display format. The value attribute is not localised.',
        'mm/dd/yyyy': 'That is a display format. The value attribute is not localised.',
      },
      hints: [
        'The displayed format follows the user’s locale, but the value never does.',
        'It is the ISO calendar-date form.',
        '`YYYY-MM-DD`',
      ],
    },
    canonicalAnswer: 'YYYY-MM-DD',
    solution: code(
      'js',
      '// toISOString is UTC, so it can land on the wrong day; build from local parts',
      'const pad = (n) => String(n).padStart(2, "0");',
      'input.value = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;'
    ),
    explanation:
      'The value of a date input is always `YYYY-MM-DD` regardless of locale; only the *display* follows the user’s conventions, which is exactly the separation you want. The tempting one-liner `date.toISOString().slice(0, 10)` is a bug waiting to happen: `toISOString` converts to UTC first, so for a user east of Greenwich late in the evening it returns tomorrow’s date. Build the string from the local getters instead. `datetime-local` wants `YYYY-MM-DDTHH:mm`, with the same caveat.',
  },

  {
    slug: 'dates-duration-storage',
    title: 'Storing a duration',
    category: 'dates',
    difficulty: 'easy',
    relevance: 'occasional',
    type: 'explain',
    prompt: md(
      'A team stores task durations as the string `"2h 30m"` and parses it wherever it is needed.',
      '',
      'Explain the problem and what to store instead.'
    ),
    graderConfig: {
      groups: [
        {
          synonyms: ['parse', 'parsing', 'string', 'format', 'ambiguous', 'locale'],
          missingFeedback: 'What is the cost of a formatted string?',
        },
        {
          synonyms: [
            'number',
            'integer',
            'minutes',
            'seconds',
            'milliseconds',
            'smallest unit',
            'base unit',
          ],
          missingFeedback: 'What should be stored instead?',
        },
        {
          synonyms: ['sum', 'compare', 'sort', 'aggregate', 'arithmetic', 'add', 'query'],
          missingFeedback: 'What does that make possible?',
        },
      ],
      hints: [
        'Think about what the database has to do to sum a column of these.',
        'Store the data, format at the edge.',
        'A single integer in a base unit, formatted for display only.',
      ],
    },
    canonicalAnswer:
      'Every read has to parse the string, and the format is easy to get wrong or to change. Store a single number in one base unit, for example minutes or seconds as an integer, so the database can sum, sort and compare them directly, and format it as "2h 30m" only when rendering.',
    solution: code(
      'js',
      '// store',
      'duration_minutes: 150',
      '',
      '// format at the edge',
      'const h = Math.floor(mins / 60);',
      'const m = mins % 60;',
      'const label = h ? `${h}h ${m}m` : `${m}m`;'
    ),
    explanation:
      'This is the same rule as storing instants in UTC: keep the machine-friendly value, format at the boundary. A number sorts, sums and compares in SQL without a single parse, and it cannot drift into three slightly different string formats as the app grows. Pick the base unit from the precision you actually need and write it into the column name, `duration_minutes` rather than `duration`, so nobody has to guess later. Integers also dodge the floating-point surprises that come with storing 1.5 hours.',
  },

  {
    slug: 'dates-timer-drift',
    title: 'The clock that runs slow',
    category: 'dates',
    difficulty: 'hard',
    relevance: 'occasional',
    type: 'explain',
    prompt: md(
      'A countdown built on `setInterval(tick, 1000)` is several seconds behind after a few minutes, and much further behind if the tab was in the background.',
      '',
      'Explain why and how to keep it accurate.'
    ),
    graderConfig: {
      groups: [
        {
          synonyms: ['drift', 'accumulat', 'behind', 'not exact', 'at least', 'minimum', 'late'],
          missingFeedback: 'Why does each tick fall behind?',
        },
        {
          synonyms: ['throttl', 'background', 'inactive', 'suspend', 'clamp'],
          missingFeedback: 'What does the browser do to timers in a hidden tab?',
        },
        {
          synonyms: [
            'timestamp',
            'date.now',
            'performance.now',
            'target time',
            'deadline',
            'elapsed',
            'recompute',
            'difference',
          ],
          missingFeedback: 'What should the countdown be derived from instead?',
        },
      ],
      hints: [
        'setInterval guarantees *at least* the delay, never exactly it.',
        'Small delays compound, and background tabs are throttled to once a minute or worse.',
        'Do not count ticks. Store the deadline and recompute from the clock each time.',
      ],
    },
    canonicalAnswer:
      'setInterval only guarantees a minimum delay, so every tick runs a little late and the error accumulates. Background tabs make it far worse because browsers throttle timers to once a minute or suspend them. Do not count ticks: store the target timestamp once, and on each tick recompute the remaining time from Date.now() so the display is always derived from the real clock.',
    solution: code(
      'js',
      'const deadline = Date.now() + 5 * 60 * 1000;',
      '',
      'const id = setInterval(() => {',
      '  const remaining = Math.max(0, deadline - Date.now());',
      '  render(remaining);',
      '  if (remaining === 0) clearInterval(id);',
      '}, 250); // tick often; the clock, not the count, is the source of truth'
    ),
    explanation:
      'Timers are best-effort: the callback is queued after the delay and runs when the main thread is free, so a busy frame pushes it late and the lateness compounds if you count ticks. Background throttling then turns a small drift into a large one. Deriving from a stored deadline makes the display self-correcting: whatever happened while the tab was hidden, the next tick shows the right number. Ticking more often than once a second also keeps the visible seconds from stuttering. For elapsed-time measurement rather than deadlines, use `performance.now()`, which is monotonic and unaffected by the user changing their system clock.',
  },

  {
    slug: 'dates-recurrence-month-end',
    title: 'The month-end reminder that skipped February',
    category: 'dates',
    difficulty: 'medium',
    relevance: 'occasional',
    type: 'explain',
    prompt: md(
      'A billing reminder is set to repeat monthly from 31 January:',
      '',
      code(
        'text',
        'DTSTART;TZID=Europe/Dublin:20260131T090000',
        'RRULE:FREQ=MONTHLY;BYMONTHDAY=31'
      ),
      '',
      'Across 2026 it fires seven times, not twelve.',
      '',
      'Explain what happens in the missing months, and what to write if you meant the last day of each one.'
    ),
    graderConfig: {
      groups: [
        {
          synonyms: [
            'no 31',
            'not exist',
            'nonexistent',
            'non-existent',
            'invalid',
            'no such',
            'shorter',
            'fewer days',
            '30 days',
            '28 days',
          ],
          missingFeedback: 'What is different about February, April, June, September and November?',
        },
        {
          // Deliberately no bare "clamp": it fires on the wrong model and its
          // negation alike, so it cannot tell the two answers apart.
          synonyms: [
            'skip',
            'omitted',
            'dropped',
            'produces nothing',
            'no occurrence',
            'nothing that month',
            'does not fire',
            'never fires',
            'not counted',
          ],
          missingFeedback:
            'Does the rule fall back to the nearest day it can find, or produce nothing at all?',
        },
        {
          synonyms: ['-1', 'last day', 'negative', 'end of the month', 'end of month'],
          missingFeedback:
            'What do you write to mean "the last day of the month" whatever its length?',
        },
      ],
      hints: [
        'Look at which months are missing: February, April, June, September and November.',
        'The rule asks for a date those months do not have. It does not go looking for a nearby one.',
        'Skipped, not clamped. A negative `BYMONTHDAY` counts back from the end.',
      ],
    },
    canonicalAnswer:
      'Those five months have no 31st, and an occurrence that lands on a date which does not exist is skipped rather than clamped back to the 28th or the 30th, so the rule simply produces nothing that month. If you meant the last day of the month, write BYMONTHDAY=-1, which counts back from the end and gives 31, 28, 31, 30 and so on, leap years included.',
    solution: code(
      'text',
      '# 7 occurrences in 2026: Jan, Mar, May, Jul, Aug, Oct, Dec',
      'RRULE:FREQ=MONTHLY;BYMONTHDAY=31',
      '',
      '# 12 occurrences: 31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31',
      'RRULE:FREQ=MONTHLY;BYMONTHDAY=-1'
    ),
    explanation:
      'RFC 5545 is explicit that this is a skip and not a nudge: a rule may generate an instance "with an invalid date (e.g., February 30)", and such instances "MUST be ignored and MUST NOT be counted as part of the recurrence set". The second half is the part that surprises people, because it means `COUNT` counts occurrences rather than months. The RFC\'s own worked example is `BYMONTHDAY=15,30;COUNT=5` from 15 January 2007, which yields January 15 and 30, February 15, then March 15 and 30: February 30 is not merely absent, it does not consume one of the five. Negative values are the fix and they exist for exactly this, `-1` being the last day and `-3` the third from last.',
  },

  {
    slug: 'dates-recurrence-nth-weekday',
    title: 'First Monday, not every Monday',
    category: 'dates',
    difficulty: 'easy',
    relevance: 'occasional',
    type: 'short-text',
    prompt: md(
      'A "first Monday of the month" reminder is firing on all four or five Mondays instead:',
      '',
      code('text', 'DTSTART;TZID=Europe/Dublin:20260302T090000', 'RRULE:FREQ=MONTHLY;BYDAY=MO'),
      '',
      'What should the `BYDAY` value be?'
    ),
    graderConfig: {
      accept: ['1mo', '+1mo', 'byday=1mo', 'byday=+1mo'],
      acceptPatterns: ['^\\s*(BYDAY\\s*=\\s*)?\\+?1\\s*MO\\s*$'],
      nearMisses: {
        mo: 'That is what it already says, and it means every Monday. Something goes in front of it.',
        'byday=mo':
          'That is what it already says, and it means every Monday. Something goes in front of it.',
        '-1mo': 'That is the last Monday of the month. You want the one at the other end.',
        'byday=-1mo': 'That is the last Monday of the month. You want the one at the other end.',
      },
      closeSubstrings: {
        'first monday': 'Right idea. Now say it in the syntax: something goes in front of `MO`.',
      },
      hints: [
        'A bare weekday means every one of them in the period. The syntax has a way to pick one.',
        'An integer in front of the day picks the nth: it can be negative to count from the end.',
        '`BYDAY=1MO`',
      ],
    },
    canonicalAnswer: '1MO',
    solution: code(
      'text',
      '# the first Monday of every month',
      'RRULE:FREQ=MONTHLY;BYDAY=1MO',
      '',
      '# the last Monday of every month',
      'RRULE:FREQ=MONTHLY;BYDAY=-1MO'
    ),
    explanation:
      'The ordinal prefix is optional and its absence is meaningful: RFC 5545 says that if an integer modifier is not present, the value "means all days of this type within the specified frequency", so `MO` under a monthly rule is every Monday of the month. `+1MO` and `1MO` are the same thing, and `-1MO` is the last Monday. The prefix is only legal under `MONTHLY` or `YEARLY`, because under a weekly rule there is only one of each day to pick from. Where the day you want is the nth of a set rather than the nth weekday, `BYSETPOS` is the other tool: `FREQ=MONTHLY;BYDAY=MO,TU,WE,TH,FR;BYSETPOS=-1` is the last working day of the month, which no `BYDAY` prefix can express.',
  },

  {
    slug: 'dates-recurrence-one-occurrence',
    title: 'Moving one meeting moved all of them',
    category: 'dates',
    difficulty: 'medium',
    relevance: 'occasional',
    type: 'explain',
    prompt: md(
      'A standup repeats every Tuesday at 09:00, stored as one row with a recurrence rule. Somebody drags next Tuesday to 10:00 and the handler writes the new time onto that row.',
      '',
      'Every standup now shows at 10:00, including the ones that already happened.',
      '',
      'Explain what to store instead, and how that single occurrence gets identified.'
    ),
    graderConfig: {
      groups: [
        {
          synonyms: [
            'whole series',
            'every occurrence',
            'all of them',
            'all occurrences',
            'the series',
            'entire series',
            'shared',
            'describes',
          ],
          missingFeedback: 'What does the rule on that row describe?',
        },
        {
          synonyms: [
            'exception',
            'override',
            'separate row',
            'its own row',
            'extra row',
            'second row',
            'exdate',
            'instance row',
            'overrides table',
          ],
          missingFeedback: 'What gets written instead of editing the rule?',
        },
        {
          synonyms: [
            'original start',
            'originalstarttime',
            'recurrence-id',
            'recurrenceid',
            'would have',
            'original time',
            'original occurrence',
            'the start it',
          ],
          missingFeedback:
            'An occurrence has no row and no id, so what identifies which one moved?',
        },
      ],
      hints: [
        'The rule is a property of the series, not of next Tuesday.',
        'The change belongs somewhere that only applies to one occurrence.',
        'An occurrence has no id of its own, so it is keyed by the start the rule would have given it.',
      ],
    },
    canonicalAnswer:
      'The rule describes the whole series, so writing 10:00 onto it moves every occurrence, past ones included. Leave the rule alone and write an exception row that applies to one occurrence and carries its new start. Key that row by the start the occurrence would have had under the rule, 09:00 on that Tuesday, because an occurrence has no row and no id of its own: that key is RECURRENCE-ID in RFC 5545 and originalStartTime in the Google Calendar API.',
    solution: code(
      'sql',
      'create table meeting_override (',
      '  meeting_id integer not null references meeting(id),',
      '  occurrence text    not null,  -- the local start this occurrence WOULD have had',
      '  cancelled  integer not null default 0,',
      '  starts_at  text,              -- set when this one occurrence moved',
      '  primary key (meeting_id, occurrence)',
      ');'
    ),
    explanation:
      'An occurrence is computed, not stored, so the only stable name it has is the start the rule would have given it. That is why RFC 5545 identifies a modified instance with `RECURRENCE-ID` and why the Google Calendar API returns `originalStartTime`, "the time at which this event would start according to the recurrence data in the recurring event". Cancelling one is the same shape rather than a delete: `EXDATE` lists the starts to exclude, and the spec gives those precedence over anything the rule generates. The reason a calendar UI offers three buttons is that this row cannot guess between them, and "this and following" is the one worth knowing: it ends the old rule with an `UNTIL` and starts a second series, because a rule cannot describe two different times.',
  },

  codeProblem({
    slug: 'dates-nth-weekday-of-month',
    title: 'The nth weekday of a month',
    category: 'dates',
    difficulty: 'medium',
    relevance: 'occasional',
    prompt: md(
      'Write `nthWeekdayOfMonth(year, month, weekday, n)`, the calculation behind a "first Monday" or "last Friday" recurrence rule.',
      '',
      '`month` is zero-indexed and `weekday` is 0 for Sunday through 6 for Saturday, both as in `Date`. A positive `n` counts from the start of the month and a negative `n` counts from the end, so `-1` is the last one.',
      '',
      'Return the day of the month, or `null` when the month has no such day.'
    ),
    starter: 'function nthWeekdayOfMonth(year, month, weekday, n) {\n  \n}',
    tests: [
      {
        // Mondays in March 2026: 2, 9, 16, 23, 30.
        name: 'finds the first Monday',
        expression: 'nthWeekdayOfMonth(2026, 2, 1, 1)',
        expected: 2,
      },
      {
        name: 'finds the last Monday',
        expression: 'nthWeekdayOfMonth(2026, 2, 1, -1)',
        expected: 30,
      },
      {
        name: 'counts back from the end for -2',
        expression: 'nthWeekdayOfMonth(2026, 2, 0, -2)',
        expected: 22,
      },
      {
        // February 2026 has only four Fridays: 6, 13, 20, 27.
        name: 'returns null when there is no fifth one',
        expression: 'nthWeekdayOfMonth(2026, 1, 5, 5)',
        expected: null,
      },
      {
        name: 'handles a short month from the end',
        expression: 'nthWeekdayOfMonth(2026, 1, 5, -1)',
        expected: 27,
      },
      {
        // The last Tuesday of February 2028 is the 29th.
        name: 'finds a leap day',
        expression: 'nthWeekdayOfMonth(2028, 1, 2, -1)',
        expected: 29,
      },
    ],
    reference: [
      'function nthWeekdayOfMonth(year, month, weekday, n) {',
      '  // Day 0 of the next month is the last day of this one.',
      '  const length = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();',
      '',
      '  const days = [];',
      '  for (let day = 1; day <= length; day++) {',
      '    if (new Date(Date.UTC(year, month, day)).getUTCDay() === weekday) days.push(day);',
      '  }',
      '',
      '  const index = n > 0 ? n - 1 : days.length + n;',
      '  return days[index] ?? null;',
      '}',
    ].join('\n'),
    hints: [
      'How many days a month has is `new Date(Date.UTC(year, month + 1, 0)).getUTCDate()`.',
      'Collect every matching day first. Picking the nth is then an array index.',
      'For a negative n, the index is `days.length + n`, and an out-of-range index gives `undefined`.',
    ],
    explanation:
      'Collecting the matching days and then indexing is worth more than the arithmetic shortcut, because it makes the `null` fall out for free: a month with four Mondays has no fifth, and both a missing fifth and a missing minus-fifth are just an index that is not there. That is the behaviour RFC 5545 specifies, where an occurrence the rule cannot place "MUST be ignored and MUST NOT be counted as part of the recurrence set", so `BYDAY=5MO` fires in some months and not others. Everything is built through `Date.UTC` and read back with the UTC getters, which is the same discipline calendar arithmetic always needs: the local constructor would put this at whatever midnight means in the runner\'s zone, and a day is not reliably 24 hours long there.',
  }),
];
