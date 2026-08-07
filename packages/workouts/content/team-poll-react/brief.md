# The poll board, from what the API actually sends

Everyone gets one vote on the topic for the next lunch and learn. The endpoint is up: post a vote to
it and it answers with every vote anybody has cast, one row each, in the order they arrived.

The design is a board under the form: every topic, the busiest first, with a count and a percentage
against each. Nothing about that shape comes back from the API, and the reply to the backend team
asking for it was that they have nothing free this quarter. So the shaping is ours.

## The task

Finish it in `src/client/PollBoard.tsx` and `src/client/tally.ts`.

**A vote is cast, and the board is the answer that came back.** `castVote` takes the topic id and
answers with the poll as it now stands. Nothing is posted while no topic is chosen.

**Every topic on the ballot is on the board.** A topic nobody has chosen is a row saying zero, not a
row that is missing.

**Most votes first, and a tie goes to the topic whose title comes first alphabetically.** The order
has to be the same every time the board is drawn.

**The shares are whole numbers and they add up to 100.** Each one is that topic's share of every
vote cast. Where flooring them leaves points over, the topic whose exact share was cut by the most
gets the next point, and if two have an equal claim the one higher on the board takes it. Before
anybody has voted every share is 0.

## Notes

`src/client/api.ts` and `src/client/topics.ts` are the API and the ballot, and both are read-only.
The API is a local fixture rather than a network call, and it refuses a body that is not `{ topicId }`
carrying the number id of a topic on the ballot.

The poll opens with seventeen votes already in it.

Leave the markup as it is. The checkpoints find the radios by their label, the Vote button by its
name, each result row by its table row, and the running total by its `aria-label`.

`npm`-style commands are not available here. Hit **Run checkpoints** to see where you are.

## If you finish early

- Every vote carries the voter's team. Break each topic down by team without walking the votes twice
  per topic, and decide where that second grouping belongs.
- The board is worked out on every render. Work out what would have to be true about the poll's size
  before `useMemo` around it changed anything you could measure.
- Two people vote at the same moment and each gets the other's total a second later. Decide what the
  board should do about that, given the only thing it can ask is for the whole list again.
