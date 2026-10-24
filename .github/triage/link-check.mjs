import { appendFileSync, readFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import { proposeFormat } from './format.mjs'
import { LINK_COMMENT_MARKER, applyLinksOf, buildLinkComment, classifyAnswer, decideLinkAction, linksOf, sinceOf } from './links.mjs'
import { githubRequest, listOpenIssues } from './triage.mjs'

const config = JSON.parse(readFileSync(new URL('./config.json', import.meta.url)))
const { linkCheck, labels } = config
const PAGE_SIZE = 100
const USER_AGENT = 'Mozilla/5.0 (compatible; backend-br-vagas-link-check; +https://github.com/backend-br/vagas)'

function sleep(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds))
}

async function answerOf(url) {
  try {
    const response = await fetch(url, {
      redirect: 'follow',
      signal: AbortSignal.timeout(linkCheck.timeoutSeconds * 1000),
      headers: { 'User-Agent': USER_AGENT, Accept: 'text/html,*/*' },
    })
    await response.body?.cancel()
    return response.status
  } catch (error) {
    return error.cause?.code ?? error.name
  }
}

// A link is only broken when every attempt says the page is gone, so a passing hiccup never flags a job.
async function stateOf(url) {
  for (let attempt = 1; attempt <= linkCheck.attempts; attempt++) {
    const answer = await answerOf(url)
    const state = classifyAnswer(answer, linkCheck.brokenStatuses)
    if (state !== 'broken') return { state, answer }
    if (attempt < linkCheck.attempts) await sleep(linkCheck.retrySeconds * 1000)
  }
  return { state: 'broken', answer: linkCheck.brokenStatuses.join('/') }
}

function skipReason(issue) {
  const labelNames = issue.labels.map((label) => label.name)
  if (issue.pull_request) return 'pull request'
  if (issue.locked) return 'locked'
  if (labelNames.includes(labels.override)) return 'maintainer override label'
  if (config.skipAssociations.includes(issue.author_association)) return 'posted by a maintainer'
  return null
}

async function linkCommentOf(issuePath) {
  const comments = await githubRequest('GET', `${issuePath}/comments?per_page=${PAGE_SIZE}`)
  return comments.find((comment) => comment.user.type === 'Bot' && comment.body.startsWith(LINK_COMMENT_MARKER)) ?? null
}

async function removeLabel(issuePath, name) {
  try {
    await githubRequest('DELETE', `${issuePath}/labels/${encodeURIComponent(name)}`)
  } catch (error) {
    if (!String(error.message).includes(': 404 ')) throw error
  }
}

async function applyDecision(repo, issue, decision, brokenLinks, previousComment) {
  const issuePath = `/repos/${repo}/issues/${issue.number}`
  if (decision.action === 'recovered') {
    await removeLabel(issuePath, labels.brokenLink)
    if (previousComment) await githubRequest('DELETE', `/repos/${repo}/issues/comments/${previousComment.id}`)
    return
  }
  const language = proposeFormat(issue).language
  const body = buildLinkComment(decision, brokenLinks, language, linkCheck.closeAfterDays)
  await githubRequest('POST', `${issuePath}/labels`, { labels: [labels.brokenLink] })
  if (previousComment && previousComment.body !== body) await githubRequest('PATCH', `/repos/${repo}/issues/comments/${previousComment.id}`, { body })
  if (!previousComment) await githubRequest('POST', `${issuePath}/comments`, { body })
  if (decision.action === 'close') await githubRequest('PATCH', issuePath, { state: 'closed', state_reason: 'not_planned' })
}

function writeJobSummary(rows, repo, isDryRun) {
  const escapeTableCell = (text) => text.replace(/\|/g, '\\|')
  const issueLink = (issue) => `[#${issue.number}](https://github.com/${repo}/issues/${issue.number})`
  const acted = rows.filter((row) => row.action !== 'none')
  const lines = [
    `### Link check${isDryRun ? ' (dry run, nothing changed)' : ''}`,
    '',
    `${rows.length} issues checked, ${acted.length} with something to do.`,
    '',
    '| Issue | Action | Broken links | Unknown links |',
    '| --- | --- | --- | --- |',
    ...acted.map(({ issue, action, brokenLinks, unknownLinks }) =>
      `| ${issueLink(issue)} | ${action} | ${escapeTableCell(brokenLinks.join(' '))} | ${escapeTableCell(unknownLinks.join(' '))} |`),
  ]
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${lines.join('\n')}\n`)
}

export async function checkIssues(issues, repo, isDryRun, today = new Date().toISOString().slice(0, 10)) {
  const checkable = issues.filter((issue) => {
    const reason = skipReason(issue)
    if (reason) console.log(`#${issue.number}: skipped (${reason})`)
    return !reason
  })
  const stateByUrl = new Map()
  for (const issue of checkable) {
    for (const url of linksOf(issue.body, linkCheck.skipDomains)) {
      if (!stateByUrl.has(url)) stateByUrl.set(url, stateOf(url))
    }
  }
  const rows = []
  for (const issue of checkable) {
    const links = linksOf(issue.body, linkCheck.skipDomains)
    const states = await Promise.all(links.map(async (url) => ({ url, ...(await stateByUrl.get(url)) })))
    const brokenLinks = states.filter(({ state }) => state === 'broken').map(({ url }) => url)
    const unknownLinks = states.filter(({ state }) => state === 'unknown').map(({ url, answer }) => `${url} (${answer})`)
    const isFlagged = issue.labels.some((label) => label.name === labels.brokenLink)
    const issuePath = `/repos/${repo}/issues/${issue.number}`
    const previousComment = brokenLinks.length || isFlagged ? await linkCommentOf(issuePath) : null
    const decision = decideLinkAction({
      brokenLinks,
      applyLinks: applyLinksOf(issue.body, linkCheck.skipDomains),
      since: sinceOf(previousComment?.body) ?? (isFlagged ? today : null),
      today,
      closeAfterDays: linkCheck.closeAfterDays,
    })
    console.log(`#${issue.number}: ${decision.action}${brokenLinks.length ? ` (${brokenLinks.join(' ')})` : ''}`)
    if (!isDryRun && decision.action !== 'none') await applyDecision(repo, issue, decision, brokenLinks, previousComment)
    rows.push({ issue, action: decision.action, brokenLinks, unknownLinks })
  }
  writeJobSummary(rows, repo, isDryRun)
  return rows
}

async function main() {
  const repo = process.env.GITHUB_REPOSITORY
  const isManualRun = process.env.GITHUB_EVENT_NAME === 'workflow_dispatch'
  const inputs = isManualRun ? JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH)).inputs : {}
  const isDryRun = isManualRun ? inputs['dry-run'] !== 'false' && inputs['dry-run'] !== false : config.automaticRunsDryRun
  if (isDryRun) console.log('Dry run: labels, comments and states will not change.')
  const issues = inputs.issue
    ? [await githubRequest('GET', `/repos/${repo}/issues/${Number(inputs.issue)}`)]
    : await listOpenIssues(repo)
  await checkIssues(issues.filter((issue) => issue.state === 'open'), repo, isDryRun)
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error)
    process.exit(1)
  })
}
