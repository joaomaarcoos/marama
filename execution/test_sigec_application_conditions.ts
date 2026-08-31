import assert from 'node:assert/strict'
import { deriveSigecAudience, matchesSigecAudience } from '../lib/sigec-application-conditions'

const questions = [
  { id: 'all', config: { audience: 'all' as const } },
  { id: 'pcd', config: { audience: 'all' as const, audienceMarker: 'pcd' as const } },
  { id: 'ppp', config: { audience: 'all' as const, audienceMarker: 'ppp' as const } },
]

assert.deepEqual(deriveSigecAudience(questions, {}), { pcd: false, ppp: false })
assert.deepEqual(deriveSigecAudience(questions, { pcd: true, ppp: false }), { pcd: true, ppp: false })
assert.equal(matchesSigecAudience('all', { pcd: false, ppp: false }), true)
assert.equal(matchesSigecAudience('pcd', { pcd: true, ppp: false }), true)
assert.equal(matchesSigecAudience('pcd', { pcd: false, ppp: true }), false)
assert.equal(matchesSigecAudience('ppp', { pcd: false, ppp: true }), true)
assert.equal(matchesSigecAudience('pcd_or_ppp', { pcd: false, ppp: false }), false)
assert.equal(matchesSigecAudience('pcd_or_ppp', { pcd: true, ppp: false }), true)

console.log(JSON.stringify({ ok: true, checks: 8 }))
