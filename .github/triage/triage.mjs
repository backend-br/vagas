import { appendFileSync, readFileSync } from 'node:fs'
import { parseForm } from './form.mjs'
import { githubRequest, listOpenIssues, useOctokit } from './github.mjs'
import { labelChanges } from './labels.mjs'
import { issueLanguage } from './language.mjs'
import { COMMENT_MARKER, buildComment } from './messages.mjs'
import { REJECTION_REASONS, contentReasons, decideVerdict } from './rules.mjs'
import { loadTaxonomy } from './taxonomy.mjs'

const config = JSON.parse(readFileSync(new URL('./config.json', import.meta.url)))
const PAGE_SIZE = 100

let taxonomy = null

function isAfterFormsWereCreated(createdAt) {
  return createdAt >= new Date(config.formsSince).getTime()
}

export async function evaluate(issue, githubLookups) {
  const form = parseForm(issue.body)
  const createdAt = new Date(issue.created_at).getTime()
  const formReasons = isAfterFormsWereCreated(createdAt) ? form.problems : []
  let reasons = [...formReasons, ...contentReasons(issue.title, issue.body, config)]

  if (decideVerdict(reasons).verdict !== 'reject') {
    const isTrustedAuthor = (await githubLookups.verifiedCount()) >= config.trustedAuthorMinVerified
    if (isTrustedAuthor) reasons = reasons.filter((reason) => REJECTION_REASONS.has(reason))
  }
  return { language: issueLanguage(issue), form, ...decideVerdict(reasons) }
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
    verifiedCount: async () => {
      const verifiedLabel = encodeURIComponent(config.labels.verified)
      const verifiedIssues = await githubRequest(
        'GET',
        `${issuesPath}?creator=${author}&state=all&labels=${verifiedLabel}&per_page=${PAGE_SIZE}`,
      )
      return verifiedIssues.filter((verifiedIssue) => verifiedIssue.number !== issue.number).length
    },
  }
}

async function applyLabels(issue, issuePath, result) {
  const { verified, review, rejected } = config.labels
  const verdictLabel = { verified, review, reject: rejected }[result.verdict]
  const { remove, add } = labelChanges({
    issue,
    form: result.form,
    taxonomy,
    statusLabels: triageLabelNames(),
    verdictLabel,
    isRejected: result.verdict === 'reject',
  })
  for (const name of remove) {
    await githubRequest('DELETE', `${issuePath}/labels/${encodeURIComponent(name)}`)
  }
  if (add.length) await githubRequest('POST', `${issuePath}/labels`, { labels: add })
}

async function upsertTriageComment(repo, issuePath, result) {
  const comments = await githubRequest('GET', `${issuePath}/comments?per_page=${PAGE_SIZE}`)
  const previousTriageComment = comments.find(
    (comment) => comment.user.type === 'Bot' && comment.body.startsWith(COMMENT_MARKER),
  )
  const body = buildComment(result.language, result, repo)
  if (previousTriageComment)
    await githubRequest('PATCH', `/repos/${repo}/issues/comments/${previousTriageComment.id}`, { body })
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

function formatLogLine(issue, { verdict, reasons }) {
  return reasons.length ? `#${issue.number}: ${verdict} (${reasons.join(', ')})` : `#${issue.number}: ${verdict}`
}

function formatTotals(rows) {
  const countByVerdict = {}
  for (const { verdict } of rows) countByVerdict[verdict] = (countByVerdict[verdict] ?? 0) + 1
  const totals = ['verified', 'review', 'reject', 'skipped'].map(
    (verdict) => `${countByVerdict[verdict] ?? 0} ${verdict}`,
  )
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
    ...rows.map(
      ({ issue, verdict, reasons }) =>
        `| ${issueLink(issue)} | ${verdict} | ${reasons.join(', ')} | ${escapeTableCell(issue.title)} |`,
    ),
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

export function run({ github }) {
  useOctokit(github)
  taxonomy = loadTaxonomy()
  return main()
}
