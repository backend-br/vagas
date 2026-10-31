import { appendFileSync, readFileSync } from 'node:fs'
import { parseForm, repositoryLabelsFromForm } from './form.mjs'
import {
  FORMAT_COMMENT_MARKER,
  buildAppliedComment,
  buildFormatComment,
  needsFormatting,
  proposeFormat,
} from './format.mjs'
import { githubRequest, listOpenIssues, useOctokit } from './github.mjs'

const config = JSON.parse(readFileSync(new URL('./config.json', import.meta.url)))
const { labels } = config
const PAGE_SIZE = 100
const ROLES_ALLOWED_TO_APPLY = ['admin', 'maintain', 'write', 'triage']

function skipReason(issue) {
  const labelNames = issue.labels.map((label) => label.name)
  if (issue.pull_request) return 'pull request'
  if (issue.locked) return 'locked'
  if (labelNames.includes(labels.override)) return 'maintainer override label'
  if (config.skipAssociations.includes(issue.author_association)) return 'posted by a maintainer'
  return null
}

async function formatCommentOf(issuePath) {
  const comments = await githubRequest('GET', `${issuePath}/comments?per_page=${PAGE_SIZE}`)
  return (
    comments.find((comment) => comment.user.type === 'Bot' && comment.body.startsWith(FORMAT_COMMENT_MARKER)) ?? null
  )
}

async function removeLabel(issuePath, name) {
  try {
    await githubRequest('DELETE', `${issuePath}/labels/${encodeURIComponent(name)}`)
  } catch (error) {
    if (error.status !== 404) throw error
  }
}

async function upsertComment(repo, issuePath, previousComment, body) {
  if (previousComment && previousComment.body === body) return
  if (previousComment) await githubRequest('PATCH', `/repos/${repo}/issues/comments/${previousComment.id}`, { body })
  else await githubRequest('POST', `${issuePath}/comments`, { body })
}

function verdictOf(proposal) {
  if (proposal.bodyChanged) return proposal.titleChanged ? 'title fixed, body suggested' : 'body suggested'
  return proposal.titleChanged ? 'title fixed' : 'already formatted'
}

async function suggest(issue, repo, isDryRun) {
  const proposal = proposeFormat(issue)
  const verdict = verdictOf(proposal)
  console.log(
    `#${issue.number}: ${verdict}${proposal.missing.length ? ` (missing: ${proposal.missing.join(', ')})` : ''}`,
  )
  if (isDryRun) return { issue, verdict, proposal }

  const issuePath = `/repos/${repo}/issues/${issue.number}`
  if (proposal.titleChanged) await githubRequest('PATCH', issuePath, { title: proposal.title })
  const previousComment = await formatCommentOf(issuePath)
  if (proposal.bodyChanged) {
    await githubRequest('POST', `${issuePath}/labels`, { labels: [labels.formatSuggested] })
    await upsertComment(
      repo,
      issuePath,
      previousComment,
      buildFormatComment({ ...proposal, titleChanged: false }, labels.applyFormat),
    )
  } else if (issue.labels.some((label) => label.name === labels.formatSuggested)) {
    await removeLabel(issuePath, labels.formatSuggested)
    if (previousComment) await githubRequest('DELETE', `/repos/${repo}/issues/comments/${previousComment.id}`)
  }
  return { issue, verdict, proposal }
}

async function canApply(repo, user) {
  const { permission, role_name: roleName } = await githubRequest(
    'GET',
    `/repos/${repo}/collaborators/${encodeURIComponent(user)}/permission`,
  )
  return ROLES_ALLOWED_TO_APPLY.includes(roleName) || ['admin', 'write'].includes(permission)
}

async function applyFromLabel(issue, sender, repo) {
  const issuePath = `/repos/${repo}/issues/${issue.number}`
  await removeLabel(issuePath, labels.applyFormat)
  if (!(await canApply(repo, sender.login))) {
    console.log(`#${issue.number}: ${sender.login} cannot apply the format`)
    return { issue, verdict: 'not allowed' }
  }
  const proposal = proposeFormat(issue)
  if (!needsFormatting(proposal)) {
    console.log(`#${issue.number}: already formatted`)
    return { issue, verdict: 'already formatted' }
  }
  await githubRequest('PATCH', issuePath, { title: proposal.title, body: proposal.body })
  const formLabels = repositoryLabelsFromForm(parseForm(proposal.body).fields)
  if (formLabels.length) await githubRequest('POST', `${issuePath}/labels`, { labels: formLabels })
  await removeLabel(issuePath, labels.formatSuggested)
  await upsertComment(
    repo,
    issuePath,
    await formatCommentOf(issuePath),
    buildAppliedComment(proposal.language, sender.login),
  )
  console.log(`#${issue.number}: applied by ${sender.login}`)
  return { issue, verdict: 'applied' }
}

function writeJobSummary(rows, repo, isDryRun) {
  const escapeTableCell = (text) => text.replace(/\|/g, '\\|')
  const issueLink = (issue) => `[#${issue.number}](https://github.com/${repo}/issues/${issue.number})`
  const lines = [
    `### Job format${isDryRun ? ' (dry run, nothing changed)' : ''}`,
    '',
    '| Issue | Verdict | Suggested title | Missing |',
    '| --- | --- | --- | --- |',
    ...rows.map(
      ({ issue, verdict, proposal }) =>
        `| ${issueLink(issue)} | ${verdict} | ${escapeTableCell(proposal?.titleChanged ? proposal.title : '')} | ${escapeTableCell(proposal?.missing.join(', ') ?? '')} |`,
    ),
  ]
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${lines.join('\n')}\n`)
}

async function fromIssueEvent(event, repo) {
  const isDryRun = config.automaticRunsDryRun
  if (isDryRun) console.log('Dry run: automatic runs do not change labels, comments or issues.')
  if (event.action === 'labeled') {
    if (event.label?.name !== labels.applyFormat) return
    if (isDryRun)
      return writeJobSummary(
        [{ issue: event.issue, verdict: 'would apply', proposal: proposeFormat(event.issue) }],
        repo,
        true,
      )
    return writeJobSummary([await applyFromLabel(event.issue, event.sender, repo)], repo, false)
  }
  const reason = skipReason(event.issue)
  if (reason) return console.log(`#${event.issue.number}: skipped (${reason})`)
  writeJobSummary([await suggest(event.issue, repo, isDryRun)], repo, isDryRun)
}

async function fromManualRun(inputs, repo) {
  const isDryRun = inputs['dry-run'] !== 'false' && inputs['dry-run'] !== false
  if (isDryRun) console.log('Dry run: labels and comments will not change.')
  const issues = inputs.issue
    ? [await githubRequest('GET', `/repos/${repo}/issues/${Number(inputs.issue)}`)]
    : await listOpenIssues(repo)
  const rows = []
  for (const issue of issues) {
    const reason = skipReason(issue)
    if (reason) {
      console.log(`#${issue.number}: skipped (${reason})`)
      continue
    }
    rows.push(await suggest(issue, repo, isDryRun))
  }
  writeJobSummary(rows, repo, isDryRun)
}

async function main() {
  const event = JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH))
  const repo = process.env.GITHUB_REPOSITORY
  if (process.env.GITHUB_EVENT_NAME === 'workflow_dispatch') return fromManualRun(event.inputs, repo)
  return fromIssueEvent(event, repo)
}

export function run({ github }) {
  useOctokit(github)
  return main()
}
