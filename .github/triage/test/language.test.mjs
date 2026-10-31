import assert from 'node:assert/strict'
import test from 'node:test'
import { detectLanguage, issueLanguage, localize } from '../language.mjs'

test('detectLanguage: Portuguese text', () => {
  assert.equal(detectLanguage('Vaga para pessoa desenvolvedora backend com experiência em Go. A empresa é remota e não exige inglês.'), 'pt')
})

test('detectLanguage: English text', () => {
  assert.equal(detectLanguage('We are hiring a backend engineer to work on our payments platform. You will own the API and the database.'), 'en')
})

test('detectLanguage: short or mixed text stays unknown', () => {
  assert.equal(detectLanguage('Backend Go'), null)
  assert.equal(detectLanguage('the job of the company para uma vaga com'), null)
  assert.equal(detectLanguage(undefined), null)
})

test('issueLanguage: falls back to the words when no form was used', () => {
  const issue = { title: 'Backend Engineer', body: 'We are hiring a backend engineer to work on our platform. You will own the API and the database.' }
  assert.equal(issueLanguage(issue), 'en')
})

test('localize: one language when known, Portuguese with English folded when unknown', () => {
  const render = (language) => `text-${language}`
  assert.equal(localize('en', render), 'text-en')
  const both = localize(null, render)
  assert.ok(both.startsWith('text-pt'))
  assert.match(both, /<details><summary>English<\/summary>\n\ntext-en\n\n<\/details>/)
})
