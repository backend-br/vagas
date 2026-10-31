import { appendFileSync, readFileSync } from 'node:fs'
import { parseForm } from './form.mjs'
import { githubRequest, listOpenIssues, useOctokit } from './github.mjs'
import { issueLanguage } from './language.mjs'
import { TALENT_COMMENT_MARKER, buildTalentComment, jobOf, profileOf, rankedMatches } from './talent.mjs'
import { loadTaxonomy } from './taxonomy.mjs'

const config = JSON.parse(readFileSync(new URL('./config.json', import.meta.url)))
const { talentMatch, labels } = config
const PAGE_SIZE = 100

function isEligible(issue) {
  return (
    !issue.pull_request &&
    !issue.locked &&
    issue.state === 'open' &&
    issue.labels.some((label) => label.name === labels.verified)
  )
}

async function sharedProfiles(taxonomy) {
  const { verified, optIn } = talentMatch.profileLabels
  const issues = await listOpenIssues(talentMatch.profilesRepo, { labels: `${verified},${optIn}` })
  return issues.filter((issue) => !issue.pull_request && !issue.locked).map((issue) => profileOf(issue, taxonomy))
}

async function talentCommentOf(issuePath) {
  const comments = await githubRequest('GET', `${issuePath}/comments?per_page=${PAGE_SIZE}`)
  return (
    comments.find((comment) => comment.user.type === 'Bot' && comment.body.startsWith(TALENT_COMMENT_MARKER)) ?? null
  )
}

function actionOf(previousComment, body) {
  if (!body) return previousComment ? 'delete' : 'none'
  if (!previousComment) return 'create'
  return previousComment.body === body ? 'none' : 'update'
}

async function apply(repo, issuePath, action, previousComment, body) {
  if (action === 'create') await githubRequest('POST', `${issuePath}/comments`, { body })
  if (action === 'update')
    await githubRequest('PATCH', `/repos/${repo}/issues/comments/${previousComment.id}`, { body })
  if (action === 'delete') await githubRequest('DELETE', `/repos/${repo}/issues/comments/${previousComment.id}`)
}

async function matchJob(issue, profiles, taxonomy, repo, isDryRun) {
  const job = jobOf(issue, parseForm(issue.body), taxonomy)
  const matches = rankedMatches(job, profiles, talentMatch)
  const body = matches.length
    ? buildTalentComment(issueLanguage(issue), matches, {
        siteUrl: talentMatch.siteUrl,
        profilesUrl: `https://github.com/${talentMatch.profilesRepo}`,
      })
    : null
  const issuePath = `/repos/${repo}/issues/${issue.number}`
  const previousComment = await talentCommentOf(issuePath)
  const action = actionOf(previousComment, body)
  console.log(`#${issue.number}: ${matches.length} profiles, ${action}`)
  if (!isDryRun) await apply(repo, issuePath, action, previousComment, body)
  return { issue, profiles: matches.map((match) => match.profile.number), action }
}

function writeJobSummary(rows, isDryRun) {
  const lines = [
    `### Talent match${isDryRun ? ' (dry run, nothing changed)' : ''}`,
    '',
    '| Issue | Profiles | Action |',
    '| --- | --- | --- |',
    ...rows.map(({ issue, profiles, action }) => `| #${issue.number} | ${profiles.join(', ')} | ${action} |`),
  ]
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${lines.join('\n')}\n`)
}

async function issuesToMatch(repo, eventName, event) {
  if (eventName === 'issues') return [await githubRequest('GET', `/repos/${repo}/issues/${event.issue.number}`)]
  if (event.inputs?.issue) return [await githubRequest('GET', `/repos/${repo}/issues/${Number(event.inputs.issue)}`)]
  return listOpenIssues(repo, { labels: labels.verified })
}

async function main() {
  const repo = process.env.GITHUB_REPOSITORY
  const eventName = process.env.GITHUB_EVENT_NAME
  const event = JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH))
  const isDryRun =
    eventName === 'workflow_dispatch'
      ? event.inputs['dry-run'] !== 'false' && event.inputs['dry-run'] !== false
      : config.automaticRunsDryRun
  if (isDryRun) console.log('Dry run: comments will not change.')
  const taxonomy = loadTaxonomy()
  const issues = (await issuesToMatch(repo, eventName, event)).filter(isEligible)
  if (!issues.length) return console.log('No verified open job to match.')
  const profiles = await sharedProfiles(taxonomy)
  console.log(`${profiles.length} profiles shared from ${talentMatch.profilesRepo}.`)
  const rows = []
  for (const issue of issues) rows.push(await matchJob(issue, profiles, taxonomy, repo, isDryRun))
  writeJobSummary(rows, isDryRun)
}

export function run({ github }) {
  useOctokit(github)
  return main()
}
