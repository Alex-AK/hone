# The deleted line is still there

Three things have come back about the invoice panel, from two different people.

- "I removed a line and it is still in the list. It goes if I reload the page."
- "I filtered down to the two design lines and the total at the bottom is still the whole invoice."
- "While I am typing in the filter box the list is a character behind what I have typed."

## The task

Fix all three in `src/client/InvoiceLines.tsx`.

**The rows are the invoice.** What is in the table is the lines the invoice currently has, filtered by
what is in the box, matched anywhere in the description and whatever the case. A line that has been
removed is gone from the moment it is removed.

**The total is the total of what is on screen.** Filter down to two lines and it is those two lines.
Filter down to none and it is `£0.00`.

**Nothing on screen may disagree with the box.** A checkpoint uses React's `Profiler` to look at every
version of the panel that reached the DOM rather than only the one left at the end, so a render that
shows the previous search counts even though the next render corrects it. It also counts those
renders: four keystrokes is four.

## Notes

`InvoicePanel.tsx` owns the invoice and is read-only. Removing a line is its job, and the panel asks
for it through `onRemove`.

Leave the markup as it is. The checkpoints find the filter box by its label, each line by its Remove
button, and the total by its `aria-label`.

`npm`-style commands are not available here. Hit **Run checkpoints** to see where you are.

## If you finish early

- Six lines is not many. Work out how big the invoice would have to get before `useMemo` around the
  filter changed anything measurable, and what it costs on an invoice this size.
- The filter is lost on a reload and cannot be sent to anybody in a link. Decide whether it belongs in
  the URL instead.
- In the real thing the invoice arrives from an API rather than a constant. Work out which of the
  values in this component survives that change unaltered, and which one turns into a cache with
  staleness of its own.
