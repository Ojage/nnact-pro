/** First token of a display name, letters only, lowercase — used for provisional passwords. */
export function extractFirstNameForPassword(name: string): string {
  const trimmed = name.trim();
  const firstToken = trimmed.split(/\s+/)[0] ?? trimmed;
  const normalized = firstToken
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[^a-zA-Z]/g, "")
    .toLowerCase();
  return normalized || "team";
}

/** Owner-invited team members sign in with firstname@currentyear until they change it. */
export function buildTeamMemberDefaultPassword(name: string, year = new Date().getFullYear()): string {
  return `${extractFirstNameForPassword(name)}@${year}`;
}

export function formatTeamMemberLoginMessage(email: string, password: string, appLabel = "NNACT Pro"): string {
  return [
    `${appLabel} sign-in`,
    `Email: ${email}`,
    `Password: ${password}`,
    "",
    "You will be asked to set a new password the first time you sign in.",
  ].join("\n");
}
