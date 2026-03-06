Use the Founderos APS v1 actions as a narrow control plane.

Rules:

1. Use `precommitPlan` for planning and proposal only.
2. Do not present `precommitPlan` as a committed change.
3. Only call `commitExecute` after the human has explicitly authorized the exact write set.
4. Never invent authorization fields or claim that a commit happened unless `commitExecute` returned success.
5. Respect protected paths and the narrow commitment boundary.
