# Two people, one card

Two people had the same card open in the planner, and both of them were editing it.

- "I set the status to Blocked and a second later it said Done. Nothing anywhere said why."
- "I opened the card after Ana did and spent ten minutes on a title she had already changed."

## The task

Two files: `src/server/room.ts` and `src/client/CardEditor.tsx`.

### The rule

Both ends of this connection write, so something has to decide which edit wins. The room does, and
this is the rule. It is written down rather than left to you, because the checkpoints measure this
one.

The room holds a **version** that goes up by one every time it applies an edit, and it remembers the
version at which **each field** last changed. An edit names one field and carries `baseVersion`,
which is the version the client had when it made it.

- **Apply** the edit when `baseVersion` is at least the version at which that field last changed.
  The room's version goes up, and that becomes the field's last-changed version.
- **Refuse** it when the field has changed since. Nothing is written.

So the first edit to arrive after a field last moved wins, and an edit made against a value that has
already been replaced loses.

### The room

`CardRoom` takes a connection through `connect`, and hears from it through `connection.onmessage`.

**Tell a client what the card says the moment it connects.** A `snapshot` carrying the card and the
version as they stand, not as they started.

**Send an applied edit to everyone, the sender included.** The sender is waiting to hear whether its
own edit stuck, and the `version` on that message is what its next edit is based on.

**Tell the loser, and only the loser.** A refused edit gets a `rejected` back down the connection it
came in on, carrying the value that beat it and the version the room is at now. Nobody else hears
about an edit that did not happen, and the version does not move for one.

**Let a client go.** When a connection closes, stop writing to it.

### The editor

`CardEditor` paints the card and lets you change the status.

**The status you pick is on screen from the moment you pick it**, not from the moment the room
agrees.

**It stays there until the room settles your edit.** Somebody else's edit to the same field landing
in the meantime does not take the box off you: yours has not been answered yet.

**A refusal takes the value that won.** Show what the `rejected` message carries, name that value in
a `role="alert"`, and take the alert away when you try again. Base that next edit on the version the
refusal carried, or it loses twice for the same reason.

## Notes

`src/protocol.ts` is what goes over the wire in both directions, and `src/wire.ts` is the
connection. Neither is editable, and the checkpoints send and read exactly those shapes.

The wire is a fake, and its semantics are worth knowing before you design around them:

- **There is no socket, no handshake and no framing.** `openWire(id)` hands back the two ends of one
  connection: `server`, which is what `CardRoom` is given, and `client`, which is what `CardEditor`
  holds. `client.send(text)` arrives at `server.onmessage(text)`, and the other way round. The
  surface is the one `ws` and the browser give you, with everything that is not this exercise taken
  off it.
- **Delivery is immediate and in order.** A message has arrived by the time `send` returns, so edits
  reach the room in the order a checkpoint sends them and nothing here waits on a clock. Two people
  editing at once looks like two edits carrying the same `baseVersion`, arriving one after the
  other.
- **A `send` into a closed connection goes nowhere and says nothing**, which is what the browser
  does with one: the data is discarded and nothing throws. `wire.discarded` counts them here, so a
  checkpoint can see a write the room should not have made. Nothing counts that for you in
  production.

`STATUSES` is the three the select offers. Leave the markup alone otherwise: the checkpoints find
the title by its heading, the status by its label, and the refusal by `role="alert"`.

`npm`-style commands are not available here. Hit **Run checkpoints** to see where you are.

## If you finish early

- The room keeps a version per field and no history, so a client that has been away cannot ask what
  it missed. Work out what answering "what has changed since version 12" would take, and what
  keeping that costs per room.
- A refused edit is thrown away. Decide which fields could merge two edits rather than pick one, and
  which could not: a status is a choice between three things, and a title is text somebody was part
  way through.
- One room lives in one process. Sketch what has to change the day there are two of them and the two
  people are connected to different ones.
