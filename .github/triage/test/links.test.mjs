import assert from 'node:assert/strict'
import { test } from 'node:test'
import { applyLinksOf, buildLinkComment, classifyAnswer, decideLinkAction, linksOf, sinceOf } from '../links.mjs'

test('finds each link once, without trailing punctuation, comments or skipped domains', () => {
  const text =
    'Veja https://empresa.com/vaga. Ou [aqui](https://empresa.com/vaga) e https://www.linkedin.com/in/x <!-- https://exemplo.com -->'
  assert.deepEqual(linksOf(text, ['linkedin.com']), ['https://empresa.com/vaga'])
})

test('only a page that says it is gone counts as broken', () => {
  const broken = [404, 410]
  assert.equal(classifyAnswer(404, broken), 'broken')
  assert.equal(classifyAnswer(410, broken), 'broken')
  assert.equal(classifyAnswer(200, broken), 'ok')
  assert.equal(classifyAnswer(301, broken), 'ok')
  for (const answer of [403, 429, 500, 999, 'timeout', 'ENOTFOUND'])
    assert.equal(classifyAnswer(answer, broken), 'unknown')
})

test('the links to apply come from the apply section, or from the whole post when it has none', () => {
  const legacy = '## Nossa empresa\n\nhttps://empresa.com\n\n## Como se candidatar\n\nhttps://empresa.com/vaga'
  assert.deepEqual(applyLinksOf(legacy), ['https://empresa.com/vaga'])
  assert.deepEqual(applyLinksOf('Candidate-se em https://empresa.com/vaga ou https://outra.com'), [
    'https://empresa.com/vaga',
    'https://outra.com',
  ])
  assert.deepEqual(applyLinksOf('## Como se candidatar\n\nEnvie para rh@empresa.com\n\nhttps://empresa.com'), [
    'https://empresa.com',
  ])
})

const base = { applyLinks: ['https://a.com/vaga'], today: '2026-10-24', closeAfterDays: 7 }

test('warns on the first day a link is gone and remembers when it started', () => {
  assert.deepEqual(decideLinkAction({ ...base, brokenLinks: ['https://a.com/vaga'], since: null }), {
    action: 'warn',
    since: '2026-10-24',
  })
})

test('closes only when every link to apply has been gone for the whole grace period', () => {
  assert.equal(decideLinkAction({ ...base, brokenLinks: ['https://a.com/vaga'], since: '2026-10-18' }).action, 'warn')
  assert.equal(decideLinkAction({ ...base, brokenLinks: ['https://a.com/vaga'], since: '2026-10-17' }).action, 'close')
  assert.equal(
    decideLinkAction({
      ...base,
      applyLinks: ['https://a.com/vaga', 'https://b.com'],
      brokenLinks: ['https://a.com/vaga'],
      since: '2026-10-01',
    }).action,
    'warn',
  )
  assert.equal(
    decideLinkAction({ ...base, applyLinks: [], brokenLinks: ['https://a.com/site'], since: '2026-10-01' }).action,
    'warn',
  )
})

test('a link that works again clears the warning', () => {
  assert.equal(decideLinkAction({ ...base, brokenLinks: [], since: '2026-10-20' }).action, 'recovered')
  assert.equal(decideLinkAction({ ...base, brokenLinks: [], since: null }).action, 'none')
})

test('the comment carries the day the links broke, so the next run can count from it', () => {
  const comment = buildLinkComment({ action: 'warn', since: '2026-10-20' }, ['https://a.com/vaga'], 'pt', 7)
  assert.equal(sinceOf(comment), '2026-10-20')
  assert.match(comment, /- https:\/\/a\.com\/vaga/)
  assert.match(comment, /7 dias/)
  assert.match(buildLinkComment({ action: 'close', since: '2026-10-10' }, [], null, 7), /closed because/)
})
