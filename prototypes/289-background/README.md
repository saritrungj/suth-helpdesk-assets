# #289 background preview

Question: choose the intensity/spread of the approved cream/peach/mint colors
on existing Overview, Registry and Print Entry pages. App structure is preserved
because the Issue explicitly limits the decision to backgrounds. Login is the
already-merged design, displayed for the combined visual decision.

Start `npm run dev --workspace @suth/web -- --host 127.0.0.1 --port 5289 --strictPort`,
then `node prototypes/289-background/capture.mjs` in another terminal.
Open `output/playwright/289-background/index.html` to compare before/A/B/C at
1440×900 and 1280×800, plus representative hover/focus and Login light/dark.

All API requests use existing browser fixture adapters. No real API/database
connection or business-data write is required. Only runtime semantic CSS tokens
are overridden; no production application file is changed. Variant code stays
on this isolated prototype branch, generated evidence is ignored.

Owner selected B on 2026-10-10. Saved preimplementation approval images are
preserved outside this worktree in the issue's Git-common-directory evidence.
`before` regeneration pins canvas tokens to base commit `595399f1cbd4d783f8f57018d8979edd4a807303`,
so it does not silently label the implemented B as the old background.

Pending implementation checks: full worst-case gradient/glass contrast proof,
empty/error/pending states, dark pixel equivalence, print/forced-colors and
keyboard/reflow checks for implementation. The conservative preview worst color
is the opaque peach endpoint; the shared text helper is preliminary evidence,
not a complete gradient/compositing or WCAG certificate.

Also run node prototypes/289-background/states.mjs for 1440px empty/error/pending/dark workspace samples and Login error/pending. Gallery supports these additional states at 1440px. B is the owner's approved choice; fresh implementation results are recorded separately from the original preview.
