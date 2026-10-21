import assert from 'node:assert/strict'
import { test } from 'node:test'
import { formLabels, parseForm } from '../form.mjs'
import { comment } from '../messages.mjs'
import { contentReasons, verdict } from '../rules.mjs'
import { evaluate } from '../triage.mjs'

const config = {
  blockedDomains: ['micro1.ai'],
  reviewDomains: ['t.me'],
  lowEffort: { emojis: 15, hashtags: 5 },
  maxLinksPerSite: 4,
  terms: {
    aiTraining: ['anotacao de dados', 'rlhf'],
    crypto: ['web3'],
    unrelatedTitle: ['marketing', 'frontend'],
    backendTitle: ['backend', 'fullstack'],
  },
}
const DESCRIPTION = 'Manter e evoluir as APIs de pagamentos em Node.js, com PostgreSQL e filas no AWS SQS, junto ao time de produto.'

function ptBody(overrides = {}) {
  const fields = {
    'Sobre a empresa': 'Fintech de pagamentos B2B.',
    'Site da empresa': 'https://empresa.com.br',
    'Descrição da vaga': DESCRIPTION,
    Requisitos: 'Node.js, PostgreSQL',
    Benefícios: '_No response_',
    'Faixa salarial': '_No response_',
    Nível: 'Pleno',
    'Regime de contratação': 'CLT, PJ',
    'Modelo de trabalho': 'Remoto',
    Localização: '_No response_',
    'Como se candidatar': 'https://empresa.com.br/vagas',
    Confirmações: '- [X] Esta issue contém uma única vaga.\n- [X] A vaga é para backend.\n- [X] Não é vaga de treinamento de IA.',
    ...overrides,
  }
  return Object.entries(fields).map(([label, value]) => `### ${label}\n\n${value}`).join('\n\n')
}

const enBody = [
  ['About the company', 'B2B payments fintech.'],
  ['Company website', 'https://company.com'],
  ['Job description', DESCRIPTION],
  ['Requirements', 'Go, PostgreSQL'],
  ['Level', 'Staff/Principal'],
  ['Contract type', 'Contractor'],
  ['Work model', 'Hybrid'],
  ['How to apply', 'https://company.com/jobs'],
  ['Confirmations', '- [X] One\n- [X] Two\n- [X] Three'],
].map(([label, value]) => `### ${label}\n\n${value}`).join('\n\n')

test('parses the pt-BR form and maps labels', () => {
  const form = parseForm(ptBody())
  assert.equal(form.lang, 'pt')
  assert.deepEqual(form.problems, [])
  assert.deepEqual(formLabels(form.fields), ['Pleno', 'CLT', 'PJ', 'Remoto'])
})

test('parses the en-US form and maps labels to the Portuguese ones', () => {
  const form = parseForm(enBody)
  assert.equal(form.lang, 'en')
  assert.deepEqual(form.problems, [])
  assert.deepEqual(formLabels(form.fields), ['Especialista', 'Contrato', 'Híbrido'])
})

test('rejects bodies that do not come from a form', () => {
  assert.deepEqual(parseForm('## Nossa empresa\n\nInforme a descrição da empresa.').problems, ['form'])
  assert.deepEqual(parseForm('').problems, ['form'])
})

test('rejects empty required fields, short descriptions and unchecked confirmations', () => {
  assert.deepEqual(parseForm(ptBody({ 'Site da empresa': '_No response_' })).problems, ['form'])
  assert.deepEqual(parseForm(ptBody({ 'Descrição da vaga': 'Vaga backend.' })).problems, ['form'])
  assert.deepEqual(parseForm(ptBody({ Confirmações: '- [X] Um\n- [ ] Dois\n- [X] Três' })).problems, ['form'])
})

test('hard content rules: AI training domains and terms, keycap lists', () => {
  assert.deepEqual(contentReasons('Vaga', 'https://jobs.micro1.ai/post/1', config), ['ai_training'])
  assert.deepEqual(contentReasons('Vaga', 'Projeto de Anotação de Dados para LLMs', config), ['ai_training'])
  assert.deepEqual(contentReasons('Vaga', '1️⃣ a 2️⃣ b 3️⃣ c', config), ['multiple'])
  const links = (count) => Array.from({ length: count }, (_, index) => `https://www.jobs.com/r/me?job=${index}`).join('\n')
  assert.deepEqual(contentReasons('Vaga', links(5), config), ['multiple'])
  assert.deepEqual(contentReasons('Vaga', `${links(4)} https://jobs.com/r/me?job=0`, config), [])
  assert.deepEqual(contentReasons('Vaga', 'https://notmicro1.ai https://empresa.com.br drlhf', config), [])
})

test('soft content rules: telegram, crypto, unrelated title, emoji and hashtag walls', () => {
  assert.deepEqual(contentReasons('Vaga', 'fale em https://t.me/recruiter', config), ['suspicious_contact'])
  assert.deepEqual(contentReasons('Vaga', 'Protocolo Web3', config), ['crypto'])
  assert.deepEqual(contentReasons('[Remoto] Analista de Marketing', '', config), ['not_backend'])
  assert.deepEqual(contentReasons('[Remoto] Dev Frontend', '', config), ['not_backend'])
  assert.deepEqual(contentReasons('[Remoto] Dev Fullstack (Frontend + Backend)', '', config), [])
  assert.deepEqual(contentReasons('Vaga', '🚀'.repeat(15), config), ['low_effort'])
  assert.deepEqual(contentReasons('Vaga', '#Vagas #Tecnologia #Java #Remoto #Dolar', config), ['low_effort'])
  assert.deepEqual(contentReasons('Vaga', 'C# e F# com .NET, issue #123', config), [])
})

test('verdict: any hard reason rejects, soft reasons send to review', () => {
  assert.deepEqual(verdict([]), { verdict: 'verified', reasons: [] })
  assert.deepEqual(verdict(['crypto', 'multiple']), { verdict: 'reject', reasons: ['multiple'] })
  assert.deepEqual(verdict(['crypto', 'crypto']), { verdict: 'review', reasons: ['crypto'] })
})

function deps(overrides = {}) {
  return {
    authorIssues: async () => [],
    verifiedCount: async () => 0,
    ...overrides,
  }
}

const issue = { title: '[Remoto] Back-end Pleno - Empresa', body: ptBody(), created_at: '2026-10-20T12:00:00Z' }

test('evaluate: clean post is verified', async () => {
  assert.equal((await evaluate(issue, deps())).verdict, 'verified')
})

test('evaluate: hard rule failures skip the author lookups', async () => {
  const result = await evaluate({ ...issue, body: 'texto solto' }, deps({ verifiedCount: async () => assert.fail('lookup called') }))
  assert.deepEqual(result.reasons, ['form'])
})

test('evaluate: rate limit counts issues inside the window ending at creation', async () => {
  const at = (day) => ({ created_at: `2026-10-${day}T10:00:00Z` })
  const many = [14, 15, 16, 17, 18, 19, 19, 20, 20].map(at)
  assert.deepEqual((await evaluate(issue, deps({ authorIssues: async () => many }))).reasons, ['rate_limit'])
  assert.equal((await evaluate(issue, deps({ authorIssues: async () => many.slice(1) }))).verdict, 'verified')
})

test('evaluate: trusted authors skip soft checks but not hard ones', async () => {
  const trusted = deps({ verifiedCount: async () => 3 })
  assert.equal((await evaluate({ ...issue, title: '[Remoto] Dev Web3 Backend' }, trusted)).verdict, 'verified')
  assert.deepEqual((await evaluate({ ...issue, body: `${issue.body}\nhttps://micro1.ai` }, trusted)).reasons, ['ai_training'])
})

test('evaluate: soft reasons send to review', async () => {
  assert.deepEqual((await evaluate({ ...issue, title: '[Remoto] Analista de Marketing' }, deps())).reasons, ['not_backend'])
})

test('comment is bilingual when the language is unknown', () => {
  const text = comment(null, { verdict: 'reject', reasons: ['form', 'rate_limit'] }, 'backend-br/vagas', { maxIssues: 8, days: 7 })
  assert.match(text, /fechada automaticamente/)
  assert.match(text, /closed automatically/)
  assert.match(text, /8 vagas a cada 7 dias/)
  assert.doesNotMatch(comment('en', { verdict: 'review', reasons: ['crypto'] }, 'r', {}), /triagem\./)
})
