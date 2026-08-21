/**
 * A Jira issue key: one or more uppercase letters, a hyphen, then digits
 * (e.g. `DIG-12345`). Deliberately not restricted to a single project prefix.
 */
export const JIRA_ID_PATTERN = /^[A-Z]+-\d+$/;

export function isValidJiraId(value: string): boolean {
  return JIRA_ID_PATTERN.test(value);
}

/**
 * Build the browse URL for a Jira issue from the configured base URL. Trims a
 * trailing slash on the base so `https://x.atlassian.net/` and
 * `https://x.atlassian.net` both produce the same URL.
 */
export function buildJiraUrl(baseUrl: string, jiraId: string): string | null {
  const trimmedBase = baseUrl.trim().replace(/\/+$/, "");
  if (!trimmedBase || !isValidJiraId(jiraId)) {
    return null;
  }
  return `${trimmedBase}/browse/${jiraId}`;
}
