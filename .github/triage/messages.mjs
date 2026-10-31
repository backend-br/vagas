import { localize } from './language.mjs'

export const COMMENT_MARKER = '<!-- job-triage -->'

const newIssueFormsUrl = (repo) => `https://github.com/${repo}/issues/new/choose`

const TEXT_BY_LANGUAGE = {
  pt: {
    reject: 'Esta vaga foi fechada automaticamente pela triagem.',
    review: 'Esta vaga está em triagem e será revisada por uma pessoa mantenedora.',
    verified: 'Esta vaga foi revisada e aprovada pela triagem.',
    fix: (repo) => `Edite a issue corrigindo os pontos abaixo e ela será reavaliada automaticamente. Para uma vaga nova, use um dos [formulários](${newIssueFormsUrl(repo)}).`,
    mistake: 'Se achar que foi um engano, comente aqui.',
    reasons: {
      form: 'O formulário não foi usado ou está incompleto (campos obrigatórios, descrição curta ou confirmações desmarcadas).',
      multiple: 'A issue tem mais de uma vaga. Publique uma vaga por issue.',
      ai_training: 'Vagas de treinamento de IA, anotação de dados ou avaliação de modelos não são aceitas.',
      not_backend: 'O título não parece ser de uma vaga de backend.',
      rate_limit: (limit) => `O limite de ${limit.maxIssues} vagas a cada ${limit.days} dias por autor foi atingido.`,
      suspicious_contact: 'O contato é feito por canal pouco verificável (ex.: Telegram).',
      crypto: 'Vagas de cripto/web3 passam por revisão manual.',
      low_effort: 'O texto tem excesso de emojis ou hashtags, comum em anúncios publicados em massa.',
    },
  },
  en: {
    reject: 'This job post was closed automatically by triage.',
    review: 'This job post is under triage and will be reviewed by a maintainer.',
    verified: 'This job post was reviewed and approved by triage.',
    fix: (repo) => `Edit the issue fixing the points below and it will be re-evaluated automatically. For a new job, use one of the [forms](${newIssueFormsUrl(repo)}).`,
    mistake: 'If you think this is a mistake, leave a comment.',
    reasons: {
      form: 'The form was not used or is incomplete (required fields, short description or unchecked confirmations).',
      multiple: 'The issue contains more than one job. Post one job per issue.',
      ai_training: 'AI training, data annotation and model evaluation gigs are not accepted.',
      not_backend: 'The title does not look like a backend role.',
      rate_limit: (limit) => `The limit of ${limit.maxIssues} jobs every ${limit.days} days per author was reached.`,
      suspicious_contact: 'Contact goes through a hard to verify channel (e.g. Telegram).',
      crypto: 'Crypto/web3 jobs go through manual review.',
      low_effort: 'The text has too many emojis or hashtags, common in mass-posted ads.',
    },
  },
}

function buildSection(language, { verdict, reasons }, repo, rateLimit) {
  const text = TEXT_BY_LANGUAGE[language]
  const lines = [text[verdict]]
  if (verdict === 'reject') lines.push('', text.fix(repo))
  if (verdict !== 'verified') {
    lines.push('')
    for (const reason of reasons) {
      const reasonText = text.reasons[reason]
      lines.push(`- ${typeof reasonText === 'function' ? reasonText(rateLimit) : reasonText}`)
    }
  }
  if (verdict === 'reject') lines.push('', text.mistake)
  return lines.join('\n')
}

export function buildComment(language, result, repo, rateLimit) {
  return [COMMENT_MARKER, localize(language, (current) => buildSection(current, result, repo, rateLimit))].join('\n\n')
}
