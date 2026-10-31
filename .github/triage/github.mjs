const PAGE_SIZE = 100

let octokit = null

export function useOctokit(client) {
  octokit = client
}

export async function githubRequest(method, path, body) {
  const { data } = await octokit.request(`${method} ${path}`, body ?? {})
  return data ?? null
}

export function listOpenIssues(repo) {
  return octokit.paginate(`GET /repos/${repo}/issues`, { state: 'open', per_page: PAGE_SIZE })
}
