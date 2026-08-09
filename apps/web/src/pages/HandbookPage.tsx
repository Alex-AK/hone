import type { HandbookSectionSummary } from '@hone/shared';
import { useQuery } from '@tanstack/react-query';
import * as React from 'react';
import { Link } from 'react-router-dom';

import { ErrorState, LoadingState } from '@/components/states';
import { api, queryKeys } from '@/lib/api';

export function HandbookPage(): React.ReactElement {
  const { data, isPending, error } = useQuery({
    queryKey: queryKeys.handbook,
    queryFn: api.handbook,
  });

  if (isPending) return <LoadingState label="Loading the handbook…" />;
  if (error) return <ErrorState error={error} />;

  const written = data.reduce((count, section) => count + section.pages.length, 0);

  return (
    <div className="space-y-10">
      <header>
        <h1 className="text-3xl font-semibold tracking-tight">Handbook</h1>
        <p className="measure mt-3 text-sm text-muted-foreground">
          Short pages to study from, each one wired to the problems and workouts that make you prove
          you absorbed it. Not exhaustive, and never finished.
        </p>
      </header>

      {written === 0 ? (
        <p className="text-sm text-muted-foreground">
          No pages yet. Add one under <code>packages/handbook/content/</code>.
        </p>
      ) : (
        <>
          {/* More sections than fit on a screen, so the index gets a way in that
              is not scrolling. */}
          <nav
            aria-label="Sections"
            className="flex flex-wrap gap-x-4 gap-y-1.5 border-y py-3 text-xs text-muted-foreground"
          >
            {data.map((section) => (
              <a key={section.slug} href={`#${section.slug}`} className="hover:text-foreground">
                {section.title}
              </a>
            ))}
          </nav>

          <div className="space-y-10">
            {data.map((section) => (
              <Section key={section.slug} section={section} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

/**
 * The question leads, not the title. You arrive here stuck on something, and
 * "Why did joining one table to another multiply my rows?" is what you are
 * scanning for; "What a join actually does" is how the page is filed.
 */
function Section({ section }: { section: HandbookSectionSummary }): React.ReactElement {
  return (
    <section id={section.slug} className="scroll-mt-20 space-y-4">
      <div className="space-y-1.5 border-b pb-3">
        <div className="flex items-baseline gap-2.5">
          <h2 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
            {section.title}
          </h2>
          <span className="text-xs text-muted-foreground">
            {section.pages.length} {section.pages.length === 1 ? 'page' : 'pages'}
          </span>
        </div>
        {/* Unclamped: a summary says what the section refuses to cover as well as
            what it holds, and that half is always in the sentence that got cut. */}
        <p className="measure text-sm text-muted-foreground">{section.summary}</p>
      </div>

      {section.pages.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nothing written here yet.</p>
      ) : (
        <ul className="divide-y">
          {section.pages.map((page) => (
            <li key={page.slug}>
              <Link to={`/handbook/${page.section}/${page.slug}`} className="group block py-2.5">
                <span className="block text-sm group-hover:underline">{page.question}</span>
                <span className="mt-0.5 block text-xs text-muted-foreground">{page.title}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
