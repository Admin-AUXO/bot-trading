# Next session prompt (compact)

You are not starting from scratch. Read the vault, then verify in code.

## Read first

1. `[reference/drafts-and-implementation-truth.md](reference/drafts-and-implementation-truth.md)` — what is likely landed vs still open; agent habits; verification commands.
2. Repo-root drafts (pick the slice you touch): start at `[../draft_index.md](../draft_index.md)`.
3. One task-specific reference from `[reference/index.md](reference/index.md)` (usually `api-surface.md`, `prisma-and-views.md`, or `strategy.md`).
4. One active session note from `[sessions/index.md](sessions/index.md)` if you are continuing a thread.

## Working rule

Do not reland work already described as landed in `drafts-and-implementation-truth.md` until code proves it regressed. Finish **one** high-risk seam with evidence, then update the owning reference note in the same pass.