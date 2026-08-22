# Sortable employee table, end to end

The employee list works, and it paginates. Product wants to sort it.

## The task

Add sorting to the employee list, backend and frontend.

**Backend** (`src/server/employees.ts`)

`listEmployees` currently takes `{ page, limit }`. Extend it to accept `sort` and `dir`:

- `sort` is one of `name`, `department`, `salary`, `startedAt`. Default `name`.
- `dir` is `asc` or `desc`. Default `asc`.
- The ordering covers the whole list: walking every page of a salary sort hands back all twelve
  employees, once each, in order.
- An unknown `sort` or `dir` is rejected or falls back to the default. It never reaches the SQL.

**Frontend** (`src/client/EmployeeTable.tsx`)

- Clicking a column header sorts by that column, ascending.
- Clicking the header of the column already sorted flips the direction.
- The current sort column and direction are visible to the user.
- Changing the sort goes back to page 1.

## The last checkpoint

The first four walk the pages once, and they do it in the one configuration where paging cannot go
wrong: ascending, over a column whose twelve values are all different and never null, at a page size
that divides twelve exactly. Two of the four sortable columns are never sorted on at all, and one of
those is the nullable one. The last checkpoint generates the roster and the sort together: either
direction, every column, ties, employees with no start date, and a page size chosen not to divide the
roster.

It adds no rules. Everything it checks is on this page already, and two things it deliberately does
not check are the two this page calls optional: where the rows with no start date sit, and whether
the tie-break is explicit. When it fails it leads with the rule that broke and then prints the
shortest roster that still breaks it, which is a complete reproduction: those employees, that sort,
that page size.

## Notes

The data is seeded and deterministic: 12 employees across 3 departments, with deliberate ties in
`department`.

`npm`-style commands are not available here. Hit **Run checkpoints** to see where you are.

## If you finish early

- Make the tie-break explicit so equal departments come back in a stable order.
- Add `nullsLast` handling for `startedAt`, which is nullable for two rows.
- Have the client show a loading state while a re-sort is in flight, without unmounting the table.
