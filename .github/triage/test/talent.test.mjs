import assert from 'node:assert/strict'
import { test } from 'node:test'
import { labelChanges } from '../labels.mjs'
import { TALENT_COMMENT_MARKER, buildTalentComment, jobOf, profileOf, rankedMatches, ufsOf } from '../talent.mjs'
import { taxonomy } from './taxonomy.fixture.mjs'

const OPTIONS = { maxProfiles: 5, minCommonStacks: 2 }
const SITE = {
  siteUrl: 'https://backend-br.github.io/talentos/',
  profilesUrl: 'https://github.com/backend-br/me-contrata',
}

function profileIssue(number, labels, overrides = {}) {
  const fields = {
    'Nome completo': `Pessoa ${number}`,
    Localização: 'Belo Horizonte - MG',
    LinkedIn: `https://www.linkedin.com/in/pessoa-${number}`,
    GitHub: '_No response_',
    ...overrides,
  }
  return {
    number,
    title: `Pessoa ${number} - Backend`,
    updated_at: `2026-10-${String(number).padStart(2, '0')}T00:00:00Z`,
    labels: labels.map((name) => ({ name })),
    body: Object.entries(fields)
      .map(([heading, value]) => `### ${heading}\n\n${value}`)
      .join('\n\n'),
  }
}

function job(labels, location = '', title = 'Backend Java') {
  const issue = { number: 900, title, labels: labels.map((name) => ({ name })) }
  return jobOf(issue, { fields: { location } }, taxonomy)
}

test('reads the states written as codes, names and capitals', () => {
  assert.deepEqual(ufsOf('Belo Horizonte - MG'), ['MG'])
  assert.deepEqual(ufsOf('São Paulo ou Rio de Janeiro'), ['RJ', 'SP'])
  assert.deepEqual(ufsOf('Campo Grande, Mato Grosso do Sul'), ['MS'])
  assert.deepEqual(ufsOf('Vaga para quem mora perto'), [])
})

test('reads a shared profile from its form and labels', () => {
  const profile = profileOf(
    profileIssue(3, ['Pleno', 'PJ', 'Remoto', 'Java', 'verificado'], { GitHub: 'https://github.com/pessoa' }),
    taxonomy,
  )

  assert.equal(profile.name, 'Pessoa 3')
  assert.deepEqual(profile.levels, ['Pleno'])
  assert.deepEqual(profile.stacks, ['Java'])
  assert.deepEqual(profile.ufs, ['MG'])
  assert.equal(profile.github, 'https://github.com/pessoa')
})

test('drops contact links that are not a LinkedIn or GitHub profile', () => {
  const profile = profileOf(
    profileIssue(4, [], { LinkedIn: 'https://evil.example/in/x', GitHub: 'javascript:alert(1)' }),
    taxonomy,
  )

  assert.equal(profile.linkedin, null)
  assert.equal(profile.github, null)
})

test('matches level, contract, work model and at least two common stacks', () => {
  const profiles = [
    profileIssue(1, ['Pleno', 'PJ', 'Remoto', 'Java', 'Apache Kafka']),
    profileIssue(2, ['Sênior', 'PJ', 'Remoto', 'Java', 'Apache Kafka']),
    profileIssue(3, ['Pleno', 'CLT', 'Remoto', 'Java', 'Apache Kafka']),
    profileIssue(5, ['Pleno', 'PJ', 'Remoto', 'Java', 'Python']),
  ].map((issue) => profileOf(issue, taxonomy))

  const matches = rankedMatches(job(['Pleno', 'PJ', 'Remoto', 'Java', 'Apache Kafka', 'PostgreSQL']), profiles, OPTIONS)

  assert.deepEqual(
    matches.map((match) => match.profile.number),
    [1],
  )
  assert.deepEqual(matches[0].stacks, ['Apache Kafka', 'Java'])
})

test('a job with a single stack needs only that stack', () => {
  const profiles = [profileOf(profileIssue(1, ['Pleno', 'PJ', 'Remoto', 'Go']), taxonomy)]

  assert.equal(rankedMatches(job(['Pleno', 'PJ', 'Remoto', 'Go']), profiles, OPTIONS).length, 1)
  assert.equal(rankedMatches(job(['Pleno', 'PJ', 'Remoto']), profiles, OPTIONS).length, 0)
})

test('hybrid and on-site jobs need the same state', () => {
  const profiles = [
    profileIssue(1, ['Pleno', 'CLT', 'Híbrido', 'Go']),
    profileIssue(2, ['Pleno', 'CLT', 'Híbrido', 'Go'], { Localização: 'Recife - PE' }),
  ].map((issue) => profileOf(issue, taxonomy))

  const matches = rankedMatches(job(['Pleno', 'CLT', 'Híbrido', 'Go'], 'Belo Horizonte, MG'), profiles, OPTIONS)
  const withoutPlace = rankedMatches(job(['Pleno', 'CLT', 'Híbrido', 'Go']), profiles, OPTIONS)

  assert.deepEqual(
    matches.map((match) => match.profile.number),
    [1],
  )
  assert.equal(withoutPlace.length, 0)
})

test('ranks by common stacks, then by the latest update, and keeps the maximum', () => {
  const profiles = [
    profileIssue(1, ['Pleno', 'PJ', 'Remoto', 'Java', 'Apache Kafka']),
    profileIssue(2, ['Pleno', 'PJ', 'Remoto', 'Java', 'Apache Kafka', 'PostgreSQL']),
    profileIssue(3, ['Pleno', 'PJ', 'Remoto', 'Java', 'Apache Kafka']),
  ].map((issue) => profileOf(issue, taxonomy))

  const matches = rankedMatches(job(['Pleno', 'PJ', 'Remoto', 'Java', 'Apache Kafka', 'PostgreSQL']), profiles, {
    ...OPTIONS,
    maxProfiles: 2,
  })

  assert.deepEqual(
    matches.map((match) => match.profile.number),
    [2, 3],
  )
})

test('the comment links the site, never mentions anyone and escapes the table', () => {
  const profile = profileOf(
    profileIssue(7, ['Pleno', 'PJ', 'Remoto', 'Java', 'Go'], { 'Nome completo': '@alguem | [x](y) #12' }),
    taxonomy,
  )
  const matches = rankedMatches(job(['Pleno', 'PJ', 'Remoto', 'Java', 'Go']), [profile], OPTIONS)

  const body = buildTalentComment('pt', matches, SITE)

  assert.ok(body.startsWith(TALENT_COMMENT_MARKER))
  assert.doesNotMatch(body, /@/)
  assert.doesNotMatch(body, /#12/)
  assert.doesNotMatch(body, /github\.com\/backend-br\/me-contrata\/issues/)
  assert.match(body, /\[alguem x \(y\) 12\]\(https:\/\/backend-br\.github\.io\/talentos\/#perfil-7\)/)
  assert.match(body, /\| Pleno \| PJ \| Remoto \| Go, Java \|/)
})

test('triage replaces the taxonomy labels of a form and keeps the others', () => {
  const issue = {
    title: 'Backend',
    body: '',
    labels: ['em-triagem', 'Sênior', 'Python', 'Stale', 'Remoto'].map((name) => ({ name })),
  }
  const form = { language: 'pt', fields: { level: 'Pleno', contract: 'PJ', workModel: 'Remoto', stack: 'Go' } }

  const changes = labelChanges({
    issue,
    form,
    taxonomy,
    statusLabels: ['verificada', 'em-triagem', 'triagem-recusada'],
    verdictLabel: 'verificada',
    isRejected: false,
  })

  assert.deepEqual(changes.remove, ['em-triagem', 'Sênior', 'Python'])
  assert.deepEqual(changes.add, ['verificada', 'Pleno', 'PJ', 'Go'])
})

test('triage of a post without form only manages the stacks', () => {
  const issue = {
    title: 'Vaga Java',
    body: 'Experiência com Postgres.',
    labels: ['Sênior', 'Python'].map((name) => ({ name })),
  }

  const changes = labelChanges({
    issue,
    form: { language: null, fields: {} },
    taxonomy,
    statusLabels: ['verificada'],
    verdictLabel: 'verificada',
    isRejected: false,
  })

  assert.deepEqual(changes.remove, ['Python'])
  assert.deepEqual(changes.add, ['verificada', 'Java', 'PostgreSQL'])
})
