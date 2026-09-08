import { graphFreshness, graphScopes } from './lib/graphify-freshness.mjs'
console.log(
  JSON.stringify(
    (process.argv[2] ? [process.argv[2]] : graphScopes).map(scope => graphFreshness(scope)),
    null,
    2,
  ),
)
