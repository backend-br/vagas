import assert from 'node:assert/strict'
import { test } from 'node:test'
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

test('reads a state written as a code', () => {
  // Given a place with the state code
  const place = 'Belo Horizonte - MG'

  // When the states are read
  const ufs = ufsOf(place)

  // Then the state is found
  assert.deepEqual(ufs, ['MG'])
})

test('reads the states written as capitals', () => {
  // Given a place with two capitals
  const place = 'São Paulo ou Rio de Janeiro'

  // When the states are read
  const ufs = ufsOf(place)

  // Then both states are found
  assert.deepEqual(ufs, ['RJ', 'SP'])
})

test('reads a state written as a name', () => {
  // Given a place with the name of the state
  const place = 'Campo Grande, Mato Grosso do Sul'

  // When the states are read
  const ufs = ufsOf(place)

  // Then the state is found
  assert.deepEqual(ufs, ['MS'])
})

test('reads no state from a place that names none', () => {
  // Given a place without any state
  const place = 'Vaga para quem mora perto'

  // When the states are read
  const ufs = ufsOf(place)

  // Then no state is found
  assert.deepEqual(ufs, [])
})

test('reads a shared profile from its form and labels', () => {
  // Given a profile issue with labels and a GitHub link
  const issue = profileIssue(3, ['Pleno', 'PJ', 'Remoto', 'Java', 'verificado'], {
    GitHub: 'https://github.com/pessoa',
  })

  // When the profile is read
  const profile = profileOf(issue, taxonomy)

  // Then it has the name, the facets, the state and the link
  assert.equal(profile.name, 'Pessoa 3')
  assert.deepEqual(profile.levels, ['Pleno'])
  assert.deepEqual(profile.stacks, ['Java'])
  assert.deepEqual(profile.ufs, ['MG'])
  assert.equal(profile.github, 'https://github.com/pessoa')
})

test('drops contact links that are not a LinkedIn or GitHub profile', () => {
  // Given a profile issue with contact links that are not profiles
  const issue = profileIssue(4, [], { LinkedIn: 'https://evil.example/in/x', GitHub: 'javascript:alert(1)' })

  // When the profile is read
  const profile = profileOf(issue, taxonomy)

  // Then both links are dropped
  assert.equal(profile.linkedin, null)
  assert.equal(profile.github, null)
})

test('matches level, contract, work model and at least two common stacks', () => {
  // Given a profile that fits the job and three that miss the level, the contract or a second stack
  const profiles = [
    profileIssue(1, ['Pleno', 'PJ', 'Remoto', 'Java', 'Apache Kafka']),
    profileIssue(2, ['Sênior', 'PJ', 'Remoto', 'Java', 'Apache Kafka']),
    profileIssue(3, ['Pleno', 'CLT', 'Remoto', 'Java', 'Apache Kafka']),
    profileIssue(5, ['Pleno', 'PJ', 'Remoto', 'Java', 'Python']),
  ].map((issue) => profileOf(issue, taxonomy))

  // When a job is matched
  const matches = rankedMatches(job(['Pleno', 'PJ', 'Remoto', 'Java', 'Apache Kafka', 'PostgreSQL']), profiles, OPTIONS)

  // Then only the first profile matches, with its common stacks
  assert.deepEqual(
    matches.map((match) => match.profile.number),
    [1],
  )
  assert.deepEqual(matches[0].stacks, ['Apache Kafka', 'Java'])
})

test('a job that leaves out level and contract accepts any level and contract', () => {
  // Given a remote senior profile under CLT
  const profiles = [profileOf(profileIssue(1, ['Sênior', 'CLT', 'Remoto', 'Java', 'Apache Kafka']), taxonomy)]

  // When a remote job with only stacks is matched
  const matches = rankedMatches(job(['Remoto', 'Java', 'Apache Kafka']), profiles, OPTIONS)

  // Then the profile matches
  assert.deepEqual(
    matches.map((match) => match.profile.number),
    [1],
  )
})

test('a job that leaves out the work model takes the work models of the profile', () => {
  // Given a remote profile
  const profiles = [profileOf(profileIssue(1, ['Pleno', 'PJ', 'Remoto', 'Java', 'Apache Kafka']), taxonomy)]

  // When a job with only stacks is matched
  const matches = rankedMatches(job(['Java', 'Apache Kafka']), profiles, OPTIONS)

  // Then the match carries the work models of the profile
  assert.deepEqual(matches[0].workModels, ['Remoto'])
})

test('a job that leaves out the work model still needs the same state for an on-site profile', () => {
  // Given an on-site profile in Recife
  const profiles = [
    profileOf(
      profileIssue(1, ['Pleno', 'PJ', 'Presencial', 'Java', 'Apache Kafka'], { Localização: 'Recife - PE' }),
      taxonomy,
    ),
  ]

  // When a job in Belo Horizonte with only stacks is matched
  const matches = rankedMatches(job(['Java', 'Apache Kafka'], 'Belo Horizonte, MG'), profiles, OPTIONS)

  // Then the profile does not match
  assert.equal(matches.length, 0)
})

test('a job that leaves out the work model matches an on-site profile in the same state', () => {
  // Given an on-site profile in Belo Horizonte
  const profiles = [profileOf(profileIssue(1, ['Pleno', 'PJ', 'Presencial', 'Java', 'Apache Kafka']), taxonomy)]

  // When a job in Belo Horizonte with only stacks is matched
  const matches = rankedMatches(job(['Java', 'Apache Kafka'], 'Belo Horizonte, MG'), profiles, OPTIONS)

  // Then the profile matches
  assert.equal(matches.length, 1)
})

test('a facet that both the job and the profile leave out does not block the match', () => {
  // Given a profile without a contract label
  const profiles = [profileOf(profileIssue(1, ['Pleno', 'Remoto', 'Java', 'Apache Kafka']), taxonomy)]

  // When a remote job without a contract is matched
  const matches = rankedMatches(job(['Remoto', 'Java', 'Apache Kafka']), profiles, OPTIONS)

  // Then the profile matches
  assert.equal(matches.length, 1)
})

test('a job that states another contract finds no profile', () => {
  // Given a CLT profile
  const profiles = [profileOf(profileIssue(1, ['Pleno', 'CLT', 'Remoto', 'Java', 'Apache Kafka']), taxonomy)]

  // When a PJ job is matched
  const matches = rankedMatches(job(['PJ', 'Java', 'Apache Kafka']), profiles, OPTIONS)

  // Then no profile matches
  assert.equal(matches.length, 0)
})

test('a job that states another level finds no profile', () => {
  // Given a mid-level profile
  const profiles = [profileOf(profileIssue(1, ['Pleno', 'CLT', 'Remoto', 'Java', 'Apache Kafka']), taxonomy)]

  // When a senior job is matched
  const matches = rankedMatches(job(['Sênior', 'Java', 'Apache Kafka']), profiles, OPTIONS)

  // Then no profile matches
  assert.equal(matches.length, 0)
})

test('a job that states the same level still finds the profile', () => {
  // Given a mid-level profile
  const profiles = [profileOf(profileIssue(1, ['Pleno', 'CLT', 'Remoto', 'Java', 'Apache Kafka']), taxonomy)]

  // When a mid-level job is matched
  const matches = rankedMatches(job(['Pleno', 'Java', 'Apache Kafka']), profiles, OPTIONS)

  // Then the profile matches
  assert.equal(matches.length, 1)
})

test('a job with a single stack needs only that stack', () => {
  // Given a profile that knows Go
  const profiles = [profileOf(profileIssue(1, ['Pleno', 'PJ', 'Remoto', 'Go']), taxonomy)]

  // When a Go job is matched
  const matches = rankedMatches(job(['Pleno', 'PJ', 'Remoto', 'Go']), profiles, OPTIONS)

  // Then the profile matches
  assert.equal(matches.length, 1)
})

test('a job without stacks finds no profile', () => {
  // Given a profile that knows Go
  const profiles = [profileOf(profileIssue(1, ['Pleno', 'PJ', 'Remoto', 'Go']), taxonomy)]

  // When a job with no stack is matched
  const matches = rankedMatches(job(['Pleno', 'PJ', 'Remoto']), profiles, OPTIONS)

  // Then no profile matches
  assert.equal(matches.length, 0)
})

test('hybrid and on-site jobs need the same state', () => {
  // Given two hybrid profiles, one in Minas Gerais and one in Pernambuco
  const profiles = [
    profileIssue(1, ['Pleno', 'CLT', 'Híbrido', 'Go']),
    profileIssue(2, ['Pleno', 'CLT', 'Híbrido', 'Go'], { Localização: 'Recife - PE' }),
  ].map((issue) => profileOf(issue, taxonomy))

  // When a hybrid job in Minas Gerais is matched
  const matches = rankedMatches(job(['Pleno', 'CLT', 'Híbrido', 'Go'], 'Belo Horizonte, MG'), profiles, OPTIONS)

  // Then only the profile in the same state matches
  assert.deepEqual(
    matches.map((match) => match.profile.number),
    [1],
  )
})

test('hybrid and on-site jobs without a place find no profile', () => {
  // Given two hybrid profiles, one in Minas Gerais and one in Pernambuco
  const profiles = [
    profileIssue(1, ['Pleno', 'CLT', 'Híbrido', 'Go']),
    profileIssue(2, ['Pleno', 'CLT', 'Híbrido', 'Go'], { Localização: 'Recife - PE' }),
  ].map((issue) => profileOf(issue, taxonomy))

  // When a hybrid job with no place is matched
  const withoutPlace = rankedMatches(job(['Pleno', 'CLT', 'Híbrido', 'Go']), profiles, OPTIONS)

  // Then no profile matches
  assert.equal(withoutPlace.length, 0)
})

test('ranks by common stacks, then by the latest update, and keeps the maximum', () => {
  // Given three matching profiles, one with an extra common stack
  const profiles = [
    profileIssue(1, ['Pleno', 'PJ', 'Remoto', 'Java', 'Apache Kafka']),
    profileIssue(2, ['Pleno', 'PJ', 'Remoto', 'Java', 'Apache Kafka', 'PostgreSQL']),
    profileIssue(3, ['Pleno', 'PJ', 'Remoto', 'Java', 'Apache Kafka']),
  ].map((issue) => profileOf(issue, taxonomy))

  // When a job is matched with a maximum of two profiles
  const matches = rankedMatches(job(['Pleno', 'PJ', 'Remoto', 'Java', 'Apache Kafka', 'PostgreSQL']), profiles, {
    ...OPTIONS,
    maxProfiles: 2,
  })

  // Then the one with more stacks comes first, then the most recent
  assert.deepEqual(
    matches.map((match) => match.profile.number),
    [2, 3],
  )
})

test('the comment links the site, never mentions anyone and escapes the table', () => {
  // Given a match for a profile whose name has a mention, a link and a number
  const profile = profileOf(
    profileIssue(7, ['Pleno', 'PJ', 'Remoto', 'Java', 'Go'], { 'Nome completo': '@alguem | [x](y) #12' }),
    taxonomy,
  )
  const matches = rankedMatches(job(['Pleno', 'PJ', 'Remoto', 'Java', 'Go']), [profile], OPTIONS)

  // When the comment is built
  const body = buildTalentComment('pt', matches, SITE)

  // Then it links the site and carries nothing that notifies or links to an issue
  assert.ok(body.startsWith(TALENT_COMMENT_MARKER))
  assert.doesNotMatch(body, /@/)
  assert.doesNotMatch(body, /#12/)
  assert.doesNotMatch(body, /github\.com\/backend-br\/me-contrata\/issues/)
  assert.match(body, /\[alguem x \(y\) 12\]\(https:\/\/backend-br\.github\.io\/talentos\/#perfil-7\)/)
  assert.match(body, /\| Pleno \| PJ \| Remoto \| Go, Java \|/)
})
