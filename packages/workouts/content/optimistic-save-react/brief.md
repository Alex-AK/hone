# Save now, reconcile later

The profile settings panel works. Three complaints about it, from people on a slow connection.

- "I change my job title and nothing happens for a second or two, so I click it again."
- "The whole form goes dead while it saves. I cannot fix the next field until it lets go."
- "Something did not save once and I only found out the next day."

## The task

Make the panel optimistic, in `src/client/ProfileSettings.tsx`. Five things have to hold.

**The change is on screen straight away.** A save shows its new value in the published profile from the
moment you click, not from the moment the server agrees.

**The panel stays usable.** Nothing is disabled while a save is in flight, including the field being
saved: you can edit any box and send a second save for a field whose first save has not come back.

**A save that fails takes back its own change and nothing else.** The failed field goes back to the
last value the server confirmed for it. A different field saved in the meantime keeps its new value,
and what is in the boxes is never touched by a save at all: that text belongs to the person typing.

**An answer that a newer save has already replaced changes nothing.** Two saves of one field can be in
flight at once, and their answers can come back either way round. The older one must not put its value
back on success or roll anything back on failure.

**A failure says which field.** In a `role="alert"`, naming the field, and gone once a later save of
that field gets through.

## Notes

`saveProfile(field, value)` sends one field and answers with the whole profile. The fake in
`src/client/api.ts` has semantics worth knowing before you design around it, because they are the
point of the exercise:

- **A request does not settle on its own.** The checkpoints call `succeed()` or `fail()` on it, in
  whatever order they like. There is no delay to wait out and no clock to advance.
- **The server writes in the order it was asked, and answers with the profile as it stood after that
  write.** So the answer to a save can describe a profile that a later save has already moved past,
  and a rejected write is never applied.
- Nothing in an answer says which save it belongs to. Add that yourself if you need it.

Leave the markup as it is. The checkpoints find each box by its label, each button by its name, and
each published value by its `aria-label`.

`npm`-style commands are not available here. Hit **Run checkpoints** to see where you are.

## If you finish early

- Two fields fail at once. Decide whether that is two alerts or one, and what a screen reader hears
  either way.
- A save fails and the value the person typed is still in the box. Work out what a Retry button would
  send: what is in the box now, or what the failed save carried.
- The panel bets on every save succeeding. Work out what changes if the server can also answer with a
  corrected value, a display name it trimmed or truncated, rather than a yes or a no.
