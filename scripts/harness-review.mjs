import fs from 'node:fs'
import { artifactIdentity, bindReview, verifyReview } from './lib/harness-artifact.mjs'

const [action, file, reviewer, evidence] = process.argv.slice(2)
const artifact = artifactIdentity()
if (action === 'snapshot') console.log(JSON.stringify(artifact, null, 2))
else if (action === 'bind') {
  if (!file || !reviewer || !evidence)
    throw new Error('bind <snapshot.json> <reviewer> <evidence>; emits a receipt to stdout')
  const reviewed = JSON.parse(fs.readFileSync(file, 'utf8'))
  if (reviewed.digest !== artifact.digest) throw new Error('Artifact changed since review snapshot')
  console.log(
    JSON.stringify(bindReview(reviewed, { reviewer, evidence, independent: true, outcome: 'accepted' }), null, 2),
  )
} else if (action === 'verify') {
  if (!file || !verifyReview(JSON.parse(fs.readFileSync(file, 'utf8')), artifact))
    throw new Error('Review missing, rejected, or invalidated by artifact changes')
  console.log('Review matches the current artifact. Receipt metadata is not authenticated host authority.')
} else throw new Error('Usage: harness-review.mjs snapshot | bind <snapshot> <reviewer> <evidence> | verify <receipt>')
