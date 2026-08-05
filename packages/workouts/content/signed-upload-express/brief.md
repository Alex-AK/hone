# Uploads that never touch the API

Since the mobile app shipped, every video a user records is uploaded through the API process. The
box runs out of memory most evenings and the on-call rotation has started restarting it on a
schedule. Storage will take the bytes directly, without the API in the middle, as long as whoever
turns up is holding a URL it is willing to accept.

So the endpoint stops carrying files and starts handing out permission. The client asks for a URL,
uploads to storage itself, then tells you it is done.

## The task

Build it in `src/server/uploads.ts`.

**`POST /uploads/sign` returns a URL the store will accept.** The store is mounted at `/store` and it
is not editable: read it as the provider's documentation, because what it verifies is the whole
specification for what you hand out.

**The key belongs to you, not to the caller.** Two people upload `report.pdf` on the same afternoon
and neither lands on the other, and a filename with a path in it decides nothing.

**The URL stops working.** It is a bearer token from the moment it leaves your process, and the only
thing bounding what a leaked one costs is how long it lasts.

**`POST /uploads/:id/confirm` only marks an upload stored if something is actually stored.** A client
saying it finished is a claim, and the store is right there to be asked.

## Notes

- The store lives at `src/server/object-store.ts` and exports `objectExists`, `objectSize` and
  `STORE_SECRET`. In production it is somebody else's hostname; here it is on the same server so a
  checkpoint can drive the whole round trip. Your process must still never put the bytes there.
- Time comes from `nowMs()` in `src/server/clock.ts`, which the checkpoints move. `Date.now()` will
  pass the checkpoint that signs and fail the one that waits.
- `GET /uploads/:id` is written for you so the checkpoints can read a row back. Leave it alone.
- No new dependencies. `node:crypto` has everything this needs.

`npm`-style commands are not available here. Hit **Run checkpoints** to see where you are.

## If you finish early

- The client also sends a `contentType` and a declared size, and neither is currently worth
  anything. Work out which of the two you could actually hold the upload to at signing time, given
  that the store checks a signature and nothing else, and what would have to change about the store
  for the other one to be enforceable.
- A signed URL that is never used leaves a row saying `pending` forever. Decide what sweeps them and
  how it knows the difference between an upload still in flight over hotel wifi and one that will
  never arrive.
