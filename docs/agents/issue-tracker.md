# Issue tracker: Local Markdown

Specs and implementation tickets live under `.scratch/`.
Publishing to this tracker means writing local files, not creating GitHub issues.

## Layout

- Feature directory: `.scratch/<feature-slug>/`
- Spec: `.scratch/<feature-slug>/spec.md`
- Tickets: `.scratch/<feature-slug>/issues/<NN>-<slug>.md`
- Number tickets from `01`, with one file per ticket.
- Record triage state in a `Status:` line near the top of specs and tickets.
  Use the vocabulary in `triage-labels.md`.
- Append discussion under `## Comments`.
- Fetch a referenced ticket by reading its file.

Keep one authoritative feature specification. When moving an existing spec
into the tracker, replace its former location with a pointer rather than
maintaining competing copies.
