import type { Vote } from './api';
import type { Topic } from './topics';

export interface TopicResult {
  topicId: number;
  title: string;
  votes: number;
  /** Whole per cent of every vote cast. */
  share: number;
}

/**
 * The board, in the order it is drawn: every topic on the ballot, most votes
 * first, a tie settled by title.
 *
 * The ballot drives this rather than the votes, which is what keeps a topic
 * nobody chose on the board. The ids come back from the API as strings, so the
 * lookup is keyed by a string on both sides.
 */
export function tallyVotes(topics: Topic[], votes: Vote[]): TopicResult[] {
  const counts = new Map<string, number>();
  for (const vote of votes) {
    counts.set(vote.topic, (counts.get(vote.topic) ?? 0) + 1);
  }

  const ordered = topics
    .map((topic) => ({
      topicId: topic.id,
      title: topic.title,
      votes: counts.get(String(topic.id)) ?? 0,
      share: 0,
    }))
    .sort((a, b) => b.votes - a.votes || a.title.localeCompare(b.title));

  return withShares(ordered, votes.length);
}

/**
 * Whole per cent each, adding up to exactly 100.
 *
 * Rounding each share on its own is what loses the point: three topics on five
 * votes each is 33 three times over, and the board says 99. So every share is
 * floored, and the points that leaves over go to the topics whose exact share
 * was cut by the most. Board order settles a tie for one of those points, which
 * is what makes the result the same every time it is worked out.
 */
function withShares(rows: TopicResult[], total: number): TopicResult[] {
  if (total === 0) return rows;

  const exact = rows.map((row) => (row.votes * 100) / total);
  const shares = exact.map((share) => Math.floor(share));
  let left = 100 - shares.reduce((sum, share) => sum + share, 0);

  const byRemainder = rows
    .map((_, index) => index)
    .sort((a, b) => exact[b]! - shares[b]! - (exact[a]! - shares[a]!) || a - b);

  for (const index of byRemainder) {
    if (left === 0) break;
    shares[index] += 1;
    left -= 1;
  }

  return rows.map((row, index) => ({ ...row, share: shares[index]! }));
}
