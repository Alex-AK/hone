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
 * The board, in the order it is drawn.
 *
 * TODO: three things are wrong with what comes back. See brief.md.
 */
export function tallyVotes(topics: Topic[], votes: Vote[]): TopicResult[] {
  const counts: Record<string, number> = {};
  for (const vote of votes) {
    counts[vote.topic] = (counts[vote.topic] ?? 0) + 1;
  }

  return Object.entries(counts).map(([topicId, count]) => ({
    topicId: Number(topicId),
    title: topics.find((topic) => topic.id === Number(topicId))?.title ?? 'Unknown topic',
    votes: count,
    share: Math.round((count / votes.length) * 100),
  }));
}
