## What changed

<!-- One or two sentences. Link the issue if there is one. -->

## Why

<!-- The constraint or problem that forced this change. -->

## Checklist

- [ ] `pnpm verify:all` passes locally
- [ ] Tests were added or updated for the behaviour that changed
- [ ] If a calculation changed, `docs/methodology.md` was updated
- [ ] If a dataset changed, `pnpm data:write` was run and the manifest committed
- [ ] If the report shape changed, `pnpm schemas:write` was run and the schema committed
- [ ] If the Action changed, `pnpm bundle` was run and `packages/github-action/dist/index.js` committed
- [ ] No claim was added that GreenCI measures energy, knows a data-centre
      location, or guarantees a saving

<!--
The distribution bundle is generated. Never hand-edit
packages/github-action/dist/index.js; run `pnpm bundle`.
-->
