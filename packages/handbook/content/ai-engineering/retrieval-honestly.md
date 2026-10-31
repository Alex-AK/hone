---
title: Retrieval, honestly
question: The answer is confidently wrong. Is that the model, or is it what I handed it?
order: 6
practise:
  - ai-chunk-overlap-boundary
  - ai-nearest-neighbour-always-returns
  - ai-embedding-model-mismatch
sources:
  - author: OpenAI
    title: Question answering using embeddings-based search
    url: https://github.com/openai/openai-cookbook/blob/main/examples/Question_answering_using_embeddings.ipynb
  - author: pgvector
    title: pgvector
    url: https://github.com/pgvector/pgvector
verified: 2026-08-02
---

The usual way to let a model answer from your own documents is to look up the passages that seem
relevant and hand them over with the question. Nearly all of that is code you wrote: cutting the
documents into pieces, finding the closest ones, deciding how many fit. So when an answer comes back
wrong, most often the right passage never reached the model, and blaming the model hides that.

## The model

The shape is fixed, and OpenAI's own cookbook walks exactly these stages: **chunk, embed, store,
rank, budget, ask.** Once per document you split the text into short, mostly self-contained
sections, embed each one and store it. Once per query you embed the question, rank the sections by
relatedness, fit as many of the top ones as the budget allows into the prompt, and ask.

Every stage can lose the answer, and only the last one gets blamed:

- **Chunk.** A fixed token count cuts wherever it lands, including through the middle of the one
  sentence that answers the question. Neither half then looks relevant to anything.
- **Embed.** Query and corpus have to come from the same model, or the distances mean nothing.
- **Rank.** A sort is not a filter, so the top five exist whether or not anything is relevant.
- **Budget.** The prompt has a size, so what you retrieved and what the model actually saw are two
  different lists. The cookbook fills the message with ranked sections until the next one would
  exceed the token budget, then stops. Chunk seven can rank fourth and never arrive.
- **Ask.** Only now is it the model's turn, and it can only be as right as what it was handed.

**So the debugging rule is: print what was retrieved.** Not the scores, the text. Almost every
"hallucination" in a RAG system is visible the moment you read the chunks the model was given, and
almost none of them are fixed by editing the prompt.

## Worked example

The retrieval half, with the two things people leave out written down:

```js
const ranked = await db.query(
  `SELECT body, 1 - (embedding <=> $1) AS similarity
     FROM chunks
    WHERE embedding <=> $1 < $2
    ORDER BY embedding <=> $1
    LIMIT 20`,
  [queryEmbedding, MAX_DISTANCE]
);

// What ranked is not what the model sees. Fill to the budget, then stop.
const used = [];
let tokens = countTokens(question);
for (const row of ranked.rows) {
  const cost = countTokens(row.body);
  if (tokens + cost > TOKEN_BUDGET) break;
  used.push(row);
  tokens += cost;
}

if (used.length === 0) return 'I could not find an answer in the documents.';

log.info({ question, used: used.map((r) => r.similarity) }); // read this before blaming the model
```

The empty case is a real branch, not a fallback nobody hits. The cookbook does the prompt-level
version of the same thing, instructing the model to answer "I could not find an answer" when the
articles do not contain one, which is worth having as well: they fail differently, and neither one
covers the other.

## Traps

**The answer exists in the corpus and retrieval never returns it.** Check the chunk boundary first.
A sentence split across two chunks leaves two halves that each look like half a topic. Overlap makes
the cut survivable and splitting on structure makes it land somewhere sensible; both cost you index
size and uniform chunk sizes respectively.

**The model ignored a document you can prove was retrieved.** It probably never arrived. Log the
chunks that fitted in the budget rather than the chunks that ranked, because those two lists diverge
exactly when the retrieved text is long, which is when the question was hard.

**Adding more context makes it worse.** Twenty chunks of loosely related text is a worse prompt than
four relevant ones, and it costs more. `top_n` is not a quality dial: past the point where the extra
chunks are noise, you are paying tokens to make the answer harder to find. Measure it rather than
raising it.
