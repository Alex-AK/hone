export interface Topic {
  id: number;
  title: string;
}

/**
 * The ballot. Five topics, picked by the people organising the sessions, and the
 * order here is the order they were added rather than anything meaningful.
 */
export const TOPICS: Topic[] = [
  { id: 12, title: 'Incident review, start to finish' },
  { id: 3, title: 'Query plans without the fear' },
  { id: 27, title: 'Shipping behind a flag' },
  { id: 8, title: 'What our on-call actually does' },
  { id: 41, title: 'Writing a design doc people read' },
];
