import assert from 'node:assert/strict'
import test from 'node:test'
import { detectLanguage, issueLanguage, localize } from '../language.mjs'

test('detectLanguage: Portuguese text', () => {
  // Given a text in Portuguese
  const text = 'Vaga para pessoa desenvolvedora backend com experiência em Go. A empresa é remota e não exige inglês.'

  // When the language is detected
  const language = detectLanguage(text)

  // Then it is Portuguese
  assert.equal(language, 'pt')
})

test('detectLanguage: English text', () => {
  // Given a text in English
  const text =
    'We are hiring a backend engineer to work on our payments platform. You will own the API and the database.'

  // When the language is detected
  const language = detectLanguage(text)

  // Then it is English
  assert.equal(language, 'en')
})

test('detectLanguage: a short text stays unknown', () => {
  // Given a text with only a few words
  const text = 'Backend Go'

  // When the language is detected
  const language = detectLanguage(text)

  // Then it is unknown
  assert.equal(language, null)
})

test('detectLanguage: a mixed text stays unknown', () => {
  // Given a text that mixes both languages
  const text = 'the job of the company para uma vaga com'

  // When the language is detected
  const language = detectLanguage(text)

  // Then it is unknown
  assert.equal(language, null)
})

test('detectLanguage: a missing text stays unknown', () => {
  // Given no text
  const text = undefined

  // When the language is detected
  const language = detectLanguage(text)

  // Then it is unknown
  assert.equal(language, null)
})

test('issueLanguage: falls back to the words when no form was used', () => {
  // Given an issue in English without a form
  const issue = {
    title: 'Backend Engineer',
    body: 'We are hiring a backend engineer to work on our platform. You will own the API and the database.',
  }

  // When the language of the issue is read
  const language = issueLanguage(issue)

  // Then it is English
  assert.equal(language, 'en')
})

test('localize: one language when it is known', () => {
  // Given a renderer and a known language
  const render = (language) => `text-${language}`

  // When the text is localized to English
  const text = localize('en', render)

  // Then only the English text comes back
  assert.equal(text, 'text-en')
})

test('localize: Portuguese with English folded when the language is unknown', () => {
  // Given a renderer and an unknown language
  const render = (language) => `text-${language}`

  // When the text is localized
  const both = localize(null, render)

  // Then Portuguese comes first and English is folded
  assert.ok(both.startsWith('text-pt'))
  assert.match(both, /<details><summary>English<\/summary>\n\ntext-en\n\n<\/details>/)
})
