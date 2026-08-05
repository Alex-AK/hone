# Dragging the scrubber is jerky

Two things came in about the episode page this week.

- "Dragging the scrubber is jerky on my work laptop: it catches, then jumps. The whole page feels
  heavy while an episode is playing."
- From the engineer who took a profile: every part of the player is rebuilt on every tick of the
  clock. That includes the show and the episode title, and neither of those changes while you listen.

## The task

Fix it in `src/client/PlayerProvider.tsx`. Everything else is read-only.

**A part of the panel is rebuilt when something it reads changes, and not otherwise.** The header
reads the episode. The scrubber and the chapter list read the clock. The shortcuts read neither and
put nothing on screen at all.

**A press on the page around the panel is not a change to the panel.** Following the show is the
page's business.

**The keyboard is bound once and stays bound.** The shortcuts set up their listener in an effect that
lists what it closes over.

**The panel still does its job.** The chapter being played stays marked as the clock crosses into it,
the buttons still move the playhead, and the arrow keys still skip.

## Notes

The panel imports four hooks from `PlayerProvider.tsx` and reads nothing else. Their names and what
they hand back are the contract. How they get it is not.

`player` in `player-engine.ts` stands in for the audio element and is the only thing that knows where
the playhead is. It moves when something calls `advance`, which is the checkpoints' job; nothing in
`src/client` calls it.

The checkpoints count renders with React's `Profiler`, which reports once per commit that touched a
part of the panel. Nothing is timed, and nothing on screen may change.

`npm`-style commands are not available here. Hit **Run checkpoints** to see where you are.

## If you finish early

- Work out exactly what `useMemo` around the value the provider publishes today would have fixed and
  what it would have left alone, and why the two halves of the answer are different.
- Redux, Zustand and Jotai all let a component subscribe to a slice of a store. Work out which parts
  of this panel would look different with one of them, and which would look the same.
- The clock moves several times a second and the play button moves twice an episode, and both of them
  are player state. Decide whether they would ever be worth sharing.
