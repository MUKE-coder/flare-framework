/**
 * The shapes a slide can take.
 *
 * Deliberately few. A deck with twenty layouts is a deck nobody can add to a week later,
 * and every one of these earns its place by appearing more than twice.
 */
export type Slide =
  | { id: string; kind: "cover"; event: string; title: string; tagline: string; speaker: string; section?: string }
  | { id: string; kind: "section"; part: string; title: string; range?: string; note?: string; section?: string }
  /** A single claim, large. The workhorse. */
  | { id: string; kind: "statement"; eyebrow: string; title: string; body?: string; section?: string }
  /** The numbered list of problems, shown whole before they are taken one at a time. */
  | { id: string; kind: "list"; eyebrow: string; items: { code: string; label: string }[]; section?: string }
  /** One problem, with the others greyed beside it. */
  | { id: string; kind: "problem"; code: string; title: string; body: string; answer?: string; section?: string }
  | { id: string; kind: "code"; eyebrow: string; title?: string; lang?: string; code: string; caption?: string; section?: string }
  /** Two columns that mean something against each other: ours/yours, before/after. */
  | {
      id: string;
      kind: "split";
      eyebrow: string;
      left: { heading: string; items: string[]; note?: string };
      right: { heading: string; items: string[]; note?: string };
      caption?: string;
      section?: string;
    }
  /** The closing accounting: every problem, and the one thing that answers it. */
  | { id: string; kind: "scorecard"; eyebrow: string; title: string; rows: { code: string; label: string; answer: string }[]; section?: string };

export interface Section {
  id: string;
  title: string;
  blurb: string;
}
