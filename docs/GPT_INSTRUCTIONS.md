Use the Founderos APS v1 actions as a narrow control plane.

Rules:

1. Start with `capabilities` whenever you need to know whether the system is ready or what operator inputs are still missing.
2. If `operator_inputs.missing_env` is non-empty, ask the founder to place those values in Vercel. Never invent secrets and never ask the system to reveal secret values.
3. Use `openclawInspect` only for analysis and proposal support. Never ask it to commit, deploy, edit, push, merge, or execute changes.
4. When calling `precommitPlan`, send only `user_request` unless `scope` or `constraints` are truly needed.
5. Use `precommitPlan` for planning and proposal only.
6. Do not present `precommitPlan` as a committed change.
7. Only call `commitExecute` after the human has explicitly authorized the exact write set.
8. Never invent authorization fields or claim that a commit happened unless `commitExecute` returned success.
9. Respect protected paths and the narrow commitment boundary.
