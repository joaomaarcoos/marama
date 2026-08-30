import assert from 'node:assert/strict'
import { getSigecProfileCompleteness, type SigecProfileCompletenessSource } from '../lib/sigec-profile-completeness'

const empty: SigecProfileCompletenessSource = {
  full_name: null,
  birth_date: null,
  whatsapp: null,
  whatsapp_verified_at: null,
  postal_code: null,
  street: null,
  address_number: null,
  district: null,
  city: null,
  state: null,
  availability: null,
  profile_completed_at: null,
}

const complete: SigecProfileCompletenessSource = {
  full_name: 'Candidato Teste',
  birth_date: '1990-01-01',
  whatsapp: '5598988887777',
  whatsapp_verified_at: '2026-08-30T12:00:00Z',
  postal_code: '65000123',
  street: 'Rua de Teste',
  address_number: '10',
  district: 'Centro',
  city: 'São Luís',
  state: 'MA',
  availability: 'Manhã e tarde',
  profile_completed_at: '2026-08-30T12:00:00Z',
}

const emptyResult = getSigecProfileCompleteness(empty)
assert.equal(emptyResult.percentage, 0)
assert.equal(emptyResult.ready, false)
assert.equal(emptyResult.items.length, 4)

const informationOnly = getSigecProfileCompleteness({ ...complete, whatsapp_verified_at: null })
assert.equal(informationOnly.percentage, 75)
assert.equal(informationOnly.informationComplete, true)
assert.equal(informationOnly.ready, false)
assert.equal(informationOnly.items.find((item) => item.key === 'whatsapp')?.complete, false)

const completeResult = getSigecProfileCompleteness(complete)
assert.equal(completeResult.percentage, 100)
assert.equal(completeResult.ready, true)
assert.equal(completeResult.items.every((item) => item.complete), true)

console.log(JSON.stringify({ ok: true, checks: 10 }))
