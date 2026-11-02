import assert from 'node:assert/strict'
import { test } from 'node:test'
import { applyLinksOf, buildLinkComment, classifyAnswer, decideLinkAction, linksOf, sinceOf } from '../links.mjs'

test('finds each link once, without trailing punctuation, comments or skipped domains', () => {
  // Given a text with a repeated link, a skipped domain and a commented link
  const text =
    'Veja https://empresa.com/vaga. Ou [aqui](https://empresa.com/vaga) e https://www.linkedin.com/in/x <!-- https://exemplo.com -->'

  // When the links are read
  const links = linksOf(text, ['linkedin.com'])

  // Then only the real link comes back, once
  assert.deepEqual(links, ['https://empresa.com/vaga'])
})

test('a 404 answer counts as broken', () => {
  // Given the answers that mean a page is gone
  const broken = [404, 410]

  // When a 404 is classified
  const result = classifyAnswer(404, broken)

  // Then it is broken
  assert.equal(result, 'broken')
})

test('a 410 answer counts as broken', () => {
  // Given the answers that mean a page is gone
  const broken = [404, 410]

  // When a 410 is classified
  const result = classifyAnswer(410, broken)

  // Then it is broken
  assert.equal(result, 'broken')
})

test('a 200 answer is ok', () => {
  // Given the answers that mean a page is gone
  const broken = [404, 410]

  // When a 200 is classified
  const result = classifyAnswer(200, broken)

  // Then it is ok
  assert.equal(result, 'ok')
})

test('a 301 answer is ok', () => {
  // Given the answers that mean a page is gone
  const broken = [404, 410]

  // When a 301 is classified
  const result = classifyAnswer(301, broken)

  // Then it is ok
  assert.equal(result, 'ok')
})

for (const answer of [403, 429, 500, 999, 'timeout', 'ENOTFOUND']) {
  test(`an answer of ${answer} proves nothing about the page`, () => {
    // Given the answers that mean a page is gone
    const broken = [404, 410]

    // When the answer is classified
    const result = classifyAnswer(answer, broken)

    // Then it is unknown
    assert.equal(result, 'unknown')
  })
}

test('the links to apply come from the apply section when the post has one', () => {
  // Given a legacy post with an apply section
  const legacy = '## Nossa empresa\n\nhttps://empresa.com\n\n## Como se candidatar\n\nhttps://empresa.com/vaga'

  // When the links to apply are read
  const links = applyLinksOf(legacy)

  // Then only the link of the section comes back
  assert.deepEqual(links, ['https://empresa.com/vaga'])
})

test('the links to apply come from the whole post when it has no apply section', () => {
  // Given a post without an apply section
  const text = 'Candidate-se em https://empresa.com/vaga ou https://outra.com'

  // When the links to apply are read
  const links = applyLinksOf(text)

  // Then every link comes back
  assert.deepEqual(links, ['https://empresa.com/vaga', 'https://outra.com'])
})

test('the links to apply leave out the email of the apply section', () => {
  // Given a post whose apply section has an email and a link
  const text = '## Como se candidatar\n\nEnvie para rh@empresa.com\n\nhttps://empresa.com'

  // When the links to apply are read
  const links = applyLinksOf(text)

  // Then only the link comes back
  assert.deepEqual(links, ['https://empresa.com'])
})

const base = { applyLinks: ['https://a.com/vaga'], today: '2026-10-24', closeAfterDays: 7 }

test('warns on the first day a link is gone and remembers when it started', () => {
  // Given a broken link that was not broken before
  const input = { ...base, brokenLinks: ['https://a.com/vaga'], since: null }

  // When the action is decided
  const decision = decideLinkAction(input)

  // Then it warns and starts counting today
  assert.deepEqual(decision, { action: 'warn', since: '2026-10-24' })
})

test('keeps warning while the grace period is not over', () => {
  // Given a link gone for six days
  const input = { ...base, brokenLinks: ['https://a.com/vaga'], since: '2026-10-18' }

  // When the action is decided
  const decision = decideLinkAction(input)

  // Then it warns
  assert.equal(decision.action, 'warn')
})

test('closes once the link has been gone for the whole grace period', () => {
  // Given a link gone for seven days
  const input = { ...base, brokenLinks: ['https://a.com/vaga'], since: '2026-10-17' }

  // When the action is decided
  const decision = decideLinkAction(input)

  // Then it closes
  assert.equal(decision.action, 'close')
})

test('does not close while another link to apply still works', () => {
  // Given two links to apply and only one of them gone for long
  const input = {
    ...base,
    applyLinks: ['https://a.com/vaga', 'https://b.com'],
    brokenLinks: ['https://a.com/vaga'],
    since: '2026-10-01',
  }

  // When the action is decided
  const decision = decideLinkAction(input)

  // Then it only warns
  assert.equal(decision.action, 'warn')
})

test('does not close when the broken link is not one to apply', () => {
  // Given a post without links to apply and a broken link elsewhere
  const input = { ...base, applyLinks: [], brokenLinks: ['https://a.com/site'], since: '2026-10-01' }

  // When the action is decided
  const decision = decideLinkAction(input)

  // Then it only warns
  assert.equal(decision.action, 'warn')
})

test('a link that works again clears the warning', () => {
  // Given no broken links and a warning from before
  const input = { ...base, brokenLinks: [], since: '2026-10-20' }

  // When the action is decided
  const decision = decideLinkAction(input)

  // Then it recovers
  assert.equal(decision.action, 'recovered')
})

test('nothing happens when no link is broken and there was no warning', () => {
  // Given no broken links and no warning
  const input = { ...base, brokenLinks: [], since: null }

  // When the action is decided
  const decision = decideLinkAction(input)

  // Then there is nothing to do
  assert.equal(decision.action, 'none')
})

test('the comment carries the day the links broke, so the next run can count from it', () => {
  // Given a warning comment for links broken on a day
  const comment = buildLinkComment({ action: 'warn', since: '2026-10-20' }, ['https://a.com/vaga'], 'pt', 7)

  // When the day is read back from the comment
  const since = sinceOf(comment)

  // Then it is the same day
  assert.equal(since, '2026-10-20')
})

test('the warning comment lists the broken links and the days of grace', () => {
  // Given a warning for a broken link with seven days of grace
  const decision = { action: 'warn', since: '2026-10-20' }

  // When the comment is built
  const comment = buildLinkComment(decision, ['https://a.com/vaga'], 'pt', 7)

  // Then it lists the link and the days
  assert.match(comment, /- https:\/\/a\.com\/vaga/)
  assert.match(comment, /7 dias/)
})

test('the closing comment says why the issue was closed', () => {
  // Given a closing decision and an unknown language
  const decision = { action: 'close', since: '2026-10-10' }

  // When the comment is built
  const comment = buildLinkComment(decision, [], null, 7)

  // Then it says it was closed because of the links
  assert.match(comment, /closed because/)
})
