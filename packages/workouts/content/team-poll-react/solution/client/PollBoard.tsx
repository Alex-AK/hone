import { type FormEvent, useEffect, useState } from 'react';

import { type Vote, castVote, fetchPoll } from './api';
import { tallyVotes } from './tally';
import { TOPICS } from './topics';

/**
 * The lunch and learn poll: pick a topic, cast your vote, and see where it lands.
 *
 * The board is drawn from the votes the API last answered with, including the
 * answer to the vote just cast. Nothing here counts anything the server has not
 * confirmed.
 */
export function PollBoard() {
  const [votes, setVotes] = useState<Vote[]>([]);
  const [choice, setChoice] = useState('');
  const [voted, setVoted] = useState(false);

  useEffect(() => {
    let live = true;
    void fetchPoll().then((response) => {
      if (live) setVotes(response.votes);
    });
    return () => {
      live = false;
    };
  }, []);

  const results = tallyVotes(TOPICS, votes);

  async function onSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (choice === '') return;

    const response = await castVote({ topicId: Number(choice) });
    setVotes(response.votes);
    setVoted(true);
  }

  return (
    <section>
      <h2>Lunch and learn: which topic?</h2>

      {voted ? (
        <p role="status">Your vote is in.</p>
      ) : (
        <form onSubmit={(event) => void onSubmit(event)}>
          <fieldset>
            <legend>Pick one topic</legend>
            {TOPICS.map((topic) => (
              <div key={topic.id}>
                <input
                  type="radio"
                  id={`topic-${topic.id}`}
                  name="topic"
                  value={String(topic.id)}
                  checked={choice === String(topic.id)}
                  onChange={(event) => setChoice(event.target.value)}
                />
                <label htmlFor={`topic-${topic.id}`}>{topic.title}</label>
              </div>
            ))}
          </fieldset>
          <button type="submit" disabled={choice === ''}>
            Vote
          </button>
        </form>
      )}

      <table>
        <caption>Results</caption>
        <thead>
          <tr>
            <th scope="col">Topic</th>
            <th scope="col">Votes</th>
            <th scope="col">Share</th>
          </tr>
        </thead>
        <tbody>
          {results.map((result) => (
            <tr key={result.topicId}>
              <td>{result.title}</td>
              <td>{result.votes}</td>
              <td>{result.share}%</td>
            </tr>
          ))}
        </tbody>
      </table>

      <p>
        Votes cast <output aria-label="Votes cast">{votes.length}</output>
      </p>
    </section>
  );
}
