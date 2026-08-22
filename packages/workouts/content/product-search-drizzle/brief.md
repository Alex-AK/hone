# Search the product catalogue

There is a products table and a search box that does nothing yet. Wire it up.

Support have a ticket open against the old search that has to stop being true here: a customer went
looking for the 50% Cotton Tee and got a widget.

## The task

Implement `searchProducts` in `src/server/products.ts`. It takes `{ q, page, limit }` and returns
`{ items, total, page, limit }`.

- **Match on name or SKU.** "LMP" should find the desk lamp even though its name says nothing about
  LMP.
- **Ignore case, match anywhere.** Searching "idget" finds "Blue Widget".
- **A blank search is not a search.** No term, an empty string or only spaces all mean "the whole
  catalogue".
- **What the user typed is text.** Searching "50%" returns the one product with "50%" in its name and
  nothing else. Searching "Cable_A" returns Cable_A and not CableXA. Searching "%" is a search for a
  percent sign.
- **`total` is the number of matches**, not the number of rows on this page.
- **Order by name, ascending.** Walking the pages has to visit every product exactly once.

## The last checkpoint

The first four search one catalogue somebody wrote, and in it the two searchable columns always agree
about which of them is doing the work: every awkward character is in a name, every SKU is bare
uppercase, and every term that finds a SKU finds it from the front. The last one generates the
catalogue and the search together, and pulls those apart. Two things about them are worth knowing. A
term can match one product by its name and a different product by its SKU, so anything that treats
the two columns differently shows up as a total that does not match the pages. And the products that
share a name share a price too, which is what a line of one product in several sizes looks like.

It adds no rules. Everything it checks is on this page already. When it fails it leads with the rule
that broke and then prints the shortest catalogue that still breaks it, which is a complete
reproduction: those products, that search, that page size.

## Notes

Every statement is logged to `workspace.queries`, and the last checkpoint reads the `ORDER BY` out of
it rather than the rows, since a database is allowed to return them in a settled order right up until
the day it doesn't.

`npm`-style commands are not available here. Hit **Run checkpoints** to see where you are.

## If you finish early

- Two queries per search is one more than you need. Look up how a window function gets you the page
  and the total together, and decide whether you would actually ship it.
- `%term%` cannot use a plain B-tree index. Find out what a trigram index changes, and what it costs.
- Rank the results so an exact SKU match comes above a partial name match, instead of alphabetically.
