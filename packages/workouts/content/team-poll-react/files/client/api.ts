import { TOPICS } from './topics';

export interface Vote {
  id: string;
  /** Which topic. The API sends every id as a string. */
  topic: string;
  voter: { name: string; team: string };
  /** ISO 8601, UTC. */
  castAt: string;
}

export interface PollResponse {
  votes: Vote[];
}

/** Whoever is signed in. One vote each, and this one has not voted yet. */
export const CURRENT_EMPLOYEE = { name: 'Ana Silva', team: 'platform' };

/** Who has voted already, and for what. Seventeen votes across three topics. */
const SEEDED: Array<[string, string, string]> = [
  ['27', 'Priya Raman', 'platform'],
  ['27', 'Tom Beckett', 'platform'],
  ['27', 'Lena Fischer', 'payments'],
  ['27', 'Sam Okoro', 'payments'],
  ['27', 'Ivy Chen', 'growth'],
  ['27', 'Marc Dubois', 'growth'],
  ['27', 'Nadia Haddad', 'support'],
  ['12', 'Owen Pryce', 'platform'],
  ['12', 'Ruth Adeyemi', 'payments'],
  ['12', 'Jonas Berg', 'payments'],
  ['12', 'Mei Tanaka', 'growth'],
  ['12', 'Carla Ortiz', 'support'],
  ['3', 'Dev Kapoor', 'platform'],
  ['3', 'Aoife Byrne', 'platform'],
  ['3', 'Hugo Marchand', 'payments'],
  ['3', 'Zara Malik', 'growth'],
  ['3', 'Erik Lindqvist', 'support'],
];

const FIRST_VOTE_AT = Date.UTC(2026, 4, 18, 9, 0, 0);
const FOUR_MINUTES = 4 * 60 * 1000;

function seed(): Vote[] {
  return SEEDED.map(([topic, name, team], index) => ({
    id: `v${index + 1}`,
    topic,
    voter: { name, team },
    castAt: new Date(FIRST_VOTE_AT + index * FOUR_MINUTES).toISOString(),
  }));
}

let votes = seed();

/** Every body the component has posted, in order. The checkpoints read this. */
export const posted: Array<Record<string, unknown>> = [];

/** Test controls. A real API has none of this. */
export const fixture = {
  reset(): void {
    votes = seed();
    posted.length = 0;
  },
};

/** Everyone's vote, unaggregated. This is the whole of what the API answers. */
export function fetchPoll(): Promise<PollResponse> {
  return Promise.resolve({ votes: [...votes] });
}

/**
 * Cast this employee's vote and answer with the poll as it now stands.
 *
 * It refuses anything but `{ topicId }` carrying the number id of a topic on the
 * ballot, the way the real endpoint does.
 */
export function castVote(body: Record<string, unknown>): Promise<PollResponse> {
  posted.push(body);

  const topicId = body.topicId;
  const known = TOPICS.some((topic) => topic.id === topicId);
  if (typeof topicId !== 'number' || !known) {
    return Promise.reject(
      new Error(`422 Unprocessable Entity: topicId ${JSON.stringify(topicId)} is not on the ballot`)
    );
  }

  votes = [
    ...votes,
    {
      id: `v${votes.length + 1}`,
      topic: String(topicId),
      voter: { ...CURRENT_EMPLOYEE },
      castAt: new Date(FIRST_VOTE_AT + votes.length * FOUR_MINUTES).toISOString(),
    },
  ];

  return Promise.resolve({ votes: [...votes] });
}
