import { parseForm } from './form.mjs'

const WORDS_BY_LANGUAGE = {
  pt: new Set([
    'de', 'da', 'das', 'dos', 'em', 'na', 'nas', 'nos', 'para', 'com', 'não', 'uma', 'um', 'que', 'é', 'são',
    'por', 'você', 'vocês', 'seu', 'sua', 'mais', 'ser', 'está', 'também', 'projeto', 'vaga', 'empresa',
  ]),
  en: new Set([
    'the', 'of', 'and', 'to', 'in', 'for', 'with', 'is', 'are', 'you', 'your', 'we', 'our', 'this', 'that',
    'will', 'be', 'an', 'it', 'on', 'project', 'job', 'company',
  ]),
}

const MIN_VOTES = 5
const MIN_LEAD_RATIO = 2

export function detectLanguage(text) {
  const words = (text ?? '').toLowerCase().split(/[^\p{L}]+/u)
  const votes = { pt: 0, en: 0 }
  for (const word of words) {
    for (const [language, vocabulary] of Object.entries(WORDS_BY_LANGUAGE)) {
      if (vocabulary.has(word)) votes[language] += 1
    }
  }
  const [winner, loser] = votes.pt >= votes.en ? ['pt', 'en'] : ['en', 'pt']
  const isClear = votes[winner] >= MIN_VOTES && votes[winner] >= votes[loser] * MIN_LEAD_RATIO
  return isClear ? winner : null
}

export function issueLanguage(issue) {
  return parseForm(issue.body).language ?? detectLanguage(`${issue.title ?? ''}\n${issue.body ?? ''}`)
}

export function localize(language, render) {
  if (language) return render(language)
  return [render('pt'), '', '<details><summary>English</summary>', '', render('en'), '', '</details>'].join('\n')
}
