// Entry point of .github/workflows/triage.yml: evaluates a job issue and applies the verdict.
import { readFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import { formLabels, parseForm } from './form.mjs'
import { MARKER, comment } from './messages.mjs'
import { HARD, contentReasons, verdict } from './rules.mjs'

const config = JSON.parse(readFileSync(new URL('./config.json', import.meta.url)))
const DAY = 24 * 60 * 60 * 1000

// deps isolates every network call so the evaluation can be tested and backtested offline.
export async function evaluate(issue, deps) {
  const form = parseForm(issue.body)
  let reasons = [...form.problems, ...contentReasons(issue.title, issue.body, config)]

  const createdAt = new Date(issue.created_at).getTime()
  const recent = (await deps.authorIssues()).filter((other) => {
    const time = new Date(other.created_at).getTime()
    return time <= createdAt && time > createdAt - config.rateLimit.days * DAY
  })
  if (recent.length > config.rateLimit.maxIssues) reasons.push('rate_limit')

  if (verdict(reasons).verdict !== 'reject') {
    // Authors with approved history skip the soft checks; hard rules still apply to everyone.
    if ((await deps.verifiedCount()) >= config.trustedAuthorMinVerified) reasons = reasons.filter((reason) => HARD.has(reason))
  }
  return { lang: form.lang, form, ...verdict(reasons) }
}

async function github(method, path, body) {
  const response = await fetch(`https://api.github.com${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
    },
    body: body && JSON.stringify(body),
  })
  if (!response.ok) throw new Error(`${method} ${path}: ${response.status} ${await response.text()}`)
  return response.status === 204 ? null : response.json()
}

async function main() {
  const event = JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH))
  const repo = process.env.GITHUB_REPOSITORY
  const { action, issue } = event
  const { labels: names } = config
  const current = issue.labels.map((label) => label.name)
  const triageLabels = [names.verified, names.review, names.rejected]

  if (current.includes(names.override)) return console.log('Skipped: maintainer override label.')
  if (config.skipAssociations.includes(issue.author_association)) return console.log('Skipped: posted by a maintainer.')
  // Issues created before the triage existed are only evaluated when opened, never on edit.
  if (action === 'edited' && !current.some((name) => triageLabels.includes(name))) return console.log('Skipped: issue never triaged.')

  const author = issue.user.login
  const base = `/repos/${repo}/issues`
  const result = await evaluate(issue, {
    authorIssues: async () => {
      const since = new Date(Date.now() - (config.rateLimit.days + 1) * DAY).toISOString()
      const list = await github('GET', `${base}?creator=${author}&state=all&since=${since}&per_page=100`)
      return list.filter((item) => !item.pull_request)
    },
    verifiedCount: async () => {
      const list = await github('GET', `${base}?creator=${author}&state=all&labels=${encodeURIComponent(names.verified)}&per_page=100`)
      return list.filter((item) => item.number !== issue.number).length
    },
  })
  console.log(`#${issue.number}: ${result.verdict} ${result.reasons.join(', ')}`)

  const target = { verified: names.verified, review: names.review, reject: names.rejected }[result.verdict]
  for (const name of current.filter((name) => triageLabels.includes(name) && name !== target)) {
    await github('DELETE', `${base}/${issue.number}/labels/${encodeURIComponent(name)}`)
  }
  const add = [target, ...(result.verdict === 'reject' ? [] : formLabels(result.form.fields))]
  await github('POST', `${base}/${issue.number}/labels`, { labels: add })

  const comments = await github('GET', `${base}/${issue.number}/comments?per_page=100`)
  const previous = comments.find((item) => item.user.type === 'Bot' && item.body.startsWith(MARKER))
  const text = comment(result.lang, result, repo, config.rateLimit)
  if (previous) await github('PATCH', `/repos/${repo}/issues/comments/${previous.id}`, { body: text })
  else if (result.verdict !== 'verified') await github('POST', `${base}/${issue.number}/comments`, { body: text })

  if (result.verdict === 'reject' && issue.state === 'open') {
    await github('PATCH', `${base}/${issue.number}`, { state: 'closed', state_reason: 'not_planned' })
  } else if (result.verdict !== 'reject' && issue.state === 'closed' && current.includes(names.rejected)) {
    await github('PATCH', `${base}/${issue.number}`, { state: 'open' })
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error)
    process.exit(1)
  })
}
