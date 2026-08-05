# The form says nothing is wrong

The contact details form on the account page validates on submit, puts a count at the top, and draws
a message under every field that failed. Three things have come back about it in the same week, two
from one customer and one from support.

- "I use a screen reader. I filled the form in, pressed Save, and nothing happened. I pressed it four
  more times. Nothing ever told me anything was wrong, and nothing told me it had saved either."
- "Once I knew it had rejected something, I still could not find which box. I went through all three
  fields from the top hoping one of them would say."
- "Her account has five audit entries for the same change, all inside a minute."

## The task

All of it in `src/client/ContactDetailsForm.tsx`.

**Every message reaches the field it is about.** Someone moving through the form field by field
hears what is wrong with the field they are on, and hears that the field is in a failed state,
without seeing the red text. A field that has been fixed says neither.

**The form is heard as well as seen.** A submit that failed says how many fields need attention, and
a finished save says whether it worked, to someone who is not watching the screen.

**A failed submit puts the keyboard where the work is:** on the first field that needs fixing, and
then leaves it alone while it is being fixed.

**One press is one save. So is two presses.**

## Notes

`src/client/rules.ts` holds the rules and every string the form shows. Both are written, both are
read-only, and neither is what is wrong. The checkpoints take the wording from there rather than from
your markup, so no string has to be matched by hand.

The form is `noValidate` and stays that way: the design calls for messages in the page rather than
the browser's own bubbles. That decision is already made. What it costs is the exercise.

`saveContactDetails` exposes `calls`, a `hold` and a `failNext` so the checkpoints can count
requests, keep one in flight and drop one. A real API has none of that.

A checkpoint cannot hear a screen reader: jsdom has no accessibility tree. What they check is the DOM
contract underneath one. Which element describes which, what is in the page before a message arrives,
and where `document.activeElement` ends up.

`npm`-style commands are not available here. Hit **Run checkpoints** to see where you are.

## If you finish early

- Nothing is checked again until the next submit, so a field stays marked wrong the whole time it is
  being put right. Work out when it should be rechecked, and why doing it on every keystroke from the
  first render is worse than not doing it at all.
- The count at the top is a number and nothing else. A list of links to the fields that failed is the
  other half of that pattern; work out what each link has to do to be worth having.
- Disabling the button takes it out of the tab order while the request is running. Work out where
  that leaves the keyboard, and whether the answer changes once focus is somewhere else.
