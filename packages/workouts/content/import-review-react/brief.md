# The rows I marked came back unmarked

`src/client/ImportReview.tsx` is the review screen for a bulk import. The uploaded file is parsed
into rows, you mark the ones to leave out, and the rest go in. Files run to tens of thousands of
rows, so the list is windowed: only the rows near the scroll position are in the DOM, and the others
exist only in the array.

Three things have come back about it.

- "I mark a few rows to skip, scroll on to find the next one, and when I come back they are
  unmarked. The count at the top still says two."
- "I can get into the list with the keyboard, but the moment it scrolls I am back at the top of the
  page and have to start again."
- "The rows with errors printed under them are sitting on top of the row below."

## The task

Four things, all in `src/client/ImportReview.tsx`.

**The window stays a window.** Ten thousand rows, and the DOM keeps the ones near the scroll
position. Rendering the file is not the fix for anything below. A row also has to say where it sits
in the whole file rather than in the window, so a screen reader announces row 907 of 10,000 rather
than counting the handful that happen to be mounted.

**A marked row stays marked.** Mark two rows, scroll to the far end of the file and back, and both
are still marked. The count in the header and the marks in the list never disagree.

**The keyboard keeps its place.** The list is one stop in the tab order rather than ten thousand.
`ArrowDown` and `ArrowUp` move the cursor, and scrolling away and back leaves it on the row it was
on. Loading the screen does not take the focus, and neither does a scroll once you have tabbed away.

**A row is as tall as what is in it.** A clean row is `ROW_HEIGHT`. A row with errors is
`ROW_HEIGHT` plus `ERROR_LINE_HEIGHT` for each error line under it. Both come from `rows.ts`.

## Notes

`rows.ts` is read-only. It parses the upload, and it is where the two heights come from.

The checkpoints run in jsdom, which has no layout: every element is zero by zero and nothing can be
measured. Two things follow. The list is handed an explicit height instead of filling its container,
so leave that alone; without it `react-window` reaches for a `ResizeObserver` that is not there. And
a row's height cannot be measured after the fact, so it has to be worked out from the row.

A checkpoint scrolls the list by setting `scrollTop` and firing a `scroll` event, which is the whole
of a scroll as far as the list is concerned.

Leave the markup as it is otherwise. The checkpoints find the list by its `listbox` role, each row by
its `option` role and the reference it shows, and the count by its `aria-label`.

`npm`-style commands are not available here. Hit **Run checkpoints** to see where you are.

## If you finish early

- Arrow past the bottom of the window and the cursor stops, because the row it should move to is not
  mounted yet. `react-window` gives the list an imperative handle through `listRef`. Work out which
  has to happen first, the scroll or the focus.
- Scrolled far away from the cursor, no row in the DOM is the active one, so the list drops out of
  the tab order altogether. Decide what should hold the tab stop while the active row is gone.
- `Ctrl-F` finds only the rows on screen, and so does printing. Work out which of the three
  complaints above would still have happened if this list were paginated instead, and which would
  not.
