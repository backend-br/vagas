import { appendFileSync, readFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import { parseForm, repositoryLabelsFromForm } from './form.mjs'
import { issueLanguage } from './language.mjs'
import { COMMENT_MARKER, buildComment } from './messages.mjs'
import { REJECTION_REASONS, contentReasons, decideVerdict } from './rules.mjs'

const config = JSON.parse(readFileSync(new URL('./config.json', import.meta.url)))
const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000
const PAGE_SIZE = 100

function isAfterFormsWereCreated(createdAt) {
  return createdAt >= new Date(config.formsSince).getTime()
}

function issuesInsideRateLimitWindow(authorIssues, createdAt) {
  const windowStart = createdAt - config.rateLimit.days * MILLISECONDS_PER_DAY
  return authorIssues.filter((authorIssue) => {
    const authorIssueCreatedAt = new Date(authorIssue.created_at).getTime()
    return authorIssueCreatedAt <= createdAt && authorIssueCreatedAt > windowStart
  })
}

export async function evaluate(issue, githubLookups) {
  const form = parseForm(issue.body)
  const createdAt = new Date(issue.created_at).getTime()
  const formReasons = isAfterFormsWereCreated(createdAt) ? form.problems : []
  let reasons = [...formReasons, ...contentReasons(issue.title, issue.body, config)]

  const recentAuthorIssues = issuesInsideRateLimitWindow(await githubLookups.authorIssues(), createdAt)
  if (recentAuthorIssues.length > config.rateLimit.maxIssues) reasons.push('rate_limit')

  if (decideVerdict(reasons).verdict !== 'reject') {
    const isTrustedAuthor = (await githubLookups.verifiedCount()) >= config.trustedAuthorMinVerified
    if (isTrustedAuthor) reasons = reasons.filter((reason) => REJECTION_REASONS.has(reason))
  }
  return { language: issueLanguage(issue), form, ...decideVerdict(reasons) }
}

export async function githubRequest(method, path, body) {
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

function triageLabelNames() {
  const { verified, review, rejected } = config.labels
  return [verified, review, rejected]
}

function labelNamesOf(issue) {
  return issue.labels.map((label) => label.name)
}

function skipReason(issue, action) {
  const labelNames = labelNamesOf(issue)
  const wasNeverTriaged = !triageLabelNames().some((name) => labelNames.includes(name))
  if (issue.pull_request) return 'pull request'
  if (labelNames.includes(config.labels.override)) return 'maintainer override label'
  if (config.skipAssociations.includes(issue.author_association)) return 'posted by a maintainer'
  if (action === 'edited' && wasNeverTriaged) return 'edited issue that was never triaged'
  return null
}

function githubLookupsFor(issue, repo) {
  const author = issue.user.login
  const issuesPath = `/repos/${repo}/issues`
  return {
    authorIssues: async () => {
      const rateLimitWindowStart = new Date(new Date(issue.created_at).getTime() - (config.rateLimit.days + 1) * MILLISECONDS_PER_DAY)
      const authorIssues = await githubRequest('GET', `${issuesPath}?creator=${author}&state=all&since=${rateLimitWindowStart.toISOString()}&per_page=${PAGE_SIZE}`)
      return authorIssues.filter((authorIssue) => !authorIssue.pull_request)
    },
    verifiedCount: async () => {
      const verifiedLabel = encodeURIComponent(config.labels.verified)
      const verifiedIssues = await githubRequest('GET', `${issuesPath}?creator=${author}&state=all&labels=${verifiedLabel}&per_page=${PAGE_SIZE}`)
      return verifiedIssues.filter((verifiedIssue) => verifiedIssue.number !== issue.number).length
    },
  }
}

async function applyLabels(issue, issuePath, result) {
  const { verified, review, rejected } = config.labels
  const verdictLabel = { verified, review, reject: rejected }[result.verdict]
  const outdatedTriageLabels = labelNamesOf(issue).filter((name) => triageLabelNames().includes(name) && name !== verdictLabel)
  for (const name of outdatedTriageLabels) {
    await githubRequest('DELETE', `${issuePath}/labels/${encodeURIComponent(name)}`)
  }
  const formLabels = result.verdict === 'reject' ? [] : repositoryLabelsFromForm(result.form.fields)
  await githubRequest('POST', `${issuePath}/labels`, { labels: [verdictLabel, ...formLabels] })
}

async function upsertTriageComment(repo, issuePath, result) {
  const comments = await githubRequest('GET', `${issuePath}/comments?per_page=${PAGE_SIZE}`)
  const previousTriageComment = comments.find((comment) => comment.user.type === 'Bot' && comment.body.startsWith(COMMENT_MARKER))
  const body = buildComment(result.language, result, repo, config.rateLimit)
  if (previousTriageComment) await githubRequest('PATCH', `/repos/${repo}/issues/comments/${previousTriageComment.id}`, { body })
  else if (result.verdict !== 'verified') await githubRequest('POST', `${issuePath}/comments`, { body })
}

async function applyState(issue, issuePath, result) {
  const wasRejectedByTriage = labelNamesOf(issue).includes(config.labels.rejected)
  if (result.verdict === 'reject' && issue.state === 'open') {
    await githubRequest('PATCH', issuePath, { state: 'closed', state_reason: 'not_planned' })
  } else if (result.verdict !== 'reject' && issue.state === 'closed' && wasRejectedByTriage) {
    await githubRequest('PATCH', issuePath, { state: 'open' })
  }
}

async function triageIssue(issue, repo, isDryRun) {
  const result = await evaluate(issue, githubLookupsFor(issue, repo))
  console.log(formatLogLine(issue, result))
  if (isDryRun) return result

  const issuePath = `/repos/${repo}/issues/${issue.number}`
  await applyLabels(issue, issuePath, result)
  await upsertTriageComment(repo, issuePath, result)
  await applyState(issue, issuePath, result)
  return result
}

export async function listOpenIssues(repo) {
  const openIssues = []
  for (let page = 1; ; page++) {
    const pageIssues = await githubRequest('GET', `/repos/${repo}/issues?state=open&per_page=${PAGE_SIZE}&page=${page}`)
    openIssues.push(...pageIssues)
    if (pageIssues.length < PAGE_SIZE) return openIssues
  }
}

function formatLogLine(issue, { verdict, reasons }) {
  return reasons.length ? `#${issue.number}: ${verdict} (${reasons.join(', ')})` : `#${issue.number}: ${verdict}`
}

function formatTotals(rows) {
  const countByVerdict = {}
  for (const { verdict } of rows) countByVerdict[verdict] = (countByVerdict[verdict] ?? 0) + 1
  const totals = ['verified', 'review', 'reject', 'skipped'].map((verdict) => `${countByVerdict[verdict] ?? 0} ${verdict}`)
  return `Totals: ${totals.join(', ')}.`
}

function writeJobSummary(rows, repo, isDryRun) {
  const escapeTableCell = (text) => text.replace(/\|/g, '\\|')
  const issueLink = (issue) => `[#${issue.number}](https://github.com/${repo}/issues/${issue.number})`
  const lines = [
    `### Job triage${isDryRun ? ' (dry run, nothing changed)' : ''}`,
    '',
    formatTotals(rows),
    '',
    '| Issue | Verdict | Reasons | Title |',
    '| --- | --- | --- | --- |',
    ...rows.map(({ issue, verdict, reasons }) => `| ${issueLink(issue)} | ${verdict} | ${reasons.join(', ')} | ${escapeTableCell(issue.title)} |`),
  ]
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${lines.join('\n')}\n`)
}

async function triageFromIssueEvent(event, repo) {
  const reason = skipReason(event.issue, event.action)
  const row = reason
    ? { issue: event.issue, verdict: 'skipped', reasons: [reason] }
    : { issue: event.issue, ...(await triageIssue(event.issue, repo, false)) }
  if (reason) console.log(formatLogLine(event.issue, row))
  writeJobSummary([row], repo, false)
}

async function triageFromManualRun(inputs, repo) {
  const isDryRun = inputs['dry-run'] !== 'false' && inputs['dry-run'] !== false
  if (isDryRun) console.log('Dry run: labels, comments and states will not change.')
  const issues = inputs.issue
    ? [await githubRequest('GET', `/repos/${repo}/issues/${Number(inputs.issue)}`)]
    : await listOpenIssues(repo)
  const rows = []
  for (const issue of issues) {
    if (issue.pull_request) continue
    const reason = skipReason(issue, 'manual')
    if (reason) {
      const skippedRow = { issue, verdict: 'skipped', reasons: [reason] }
      console.log(formatLogLine(issue, skippedRow))
      rows.push(skippedRow)
      continue
    }
    rows.push({ issue, ...(await triageIssue(issue, repo, isDryRun)) })
  }
  console.log(formatTotals(rows))
  writeJobSummary(rows, repo, isDryRun)
}

async function main() {
  const event = JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH))
  const repo = process.env.GITHUB_REPOSITORY
  if (process.env.GITHUB_EVENT_NAME === 'workflow_dispatch') return triageFromManualRun(event.inputs, repo)
  return triageFromIssueEvent(event, repo)
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error)
    process.exit(1)
  })
}
