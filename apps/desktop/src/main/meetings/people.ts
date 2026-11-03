import type { MeetingPerson } from "../../shared/meetings";

/** What Jig reads about people in your organisation (Microsoft Graph, delegated). */
export const PEOPLE_SCOPES = [
  "https://graph.microsoft.com/User.ReadBasic.All",
  "https://graph.microsoft.com/People.Read",
];

const SELECT = "id,displayName,mail,userPrincipalName,jobTitle";

/** Searching the directory by name or e-mail; quotes and backslashes can't break out of the search. */
export function peopleSearchUrl(query: string): string {
  const q = query.replace(/["\\]/g, " ").trim();
  const params = new URLSearchParams({
    $search: `"displayName:${q}" OR "mail:${q}"`,
    $select: SELECT,
    $top: "20",
  });
  return `https://graph.microsoft.com/v1.0/users?${params}`;
}

/** The people you work with most (Graph's `/me/people`), as user principal names to look up. */
export const SUGGESTED_URL =
  "https://graph.microsoft.com/v1.0/me/people?$top=25&$select=displayName,userPrincipalName,personType";

export function suggestedNames(
  value: Array<{ userPrincipalName?: string | null; personType?: { subclass?: string } }>,
): string[] {
  const out: string[] = [];
  for (const p of value)
    if (
      p.personType?.subclass === "OrganizationUser" &&
      p.userPrincipalName &&
      !out.includes(p.userPrincipalName)
    )
      out.push(p.userPrincipalName);
  return out.slice(0, 15);
}

/** Looks up up to 15 user principal names in one request, to get their object ids for calling. */
export function usersByNameUrl(names: string[]): string {
  const list = names.map((n) => `'${n.replaceAll("'", "''")}'`).join(",");
  const params = new URLSearchParams({ $filter: `userPrincipalName in (${list})`, $select: SELECT });
  return `https://graph.microsoft.com/v1.0/users?${params}`;
}

export interface GraphUser {
  id?: string;
  displayName?: string | null;
  mail?: string | null;
  userPrincipalName?: string | null;
  jobTitle?: string | null;
}

/** Directory users as people to call, without yourself, in the order given (by `order` when set). */
export function toPeople(users: GraphUser[], self?: string, order?: string[]): MeetingPerson[] {
  const people = users
    .filter((u) => u.id && u.id !== self)
    .map((u) => ({
      id: u.id!,
      name: u.displayName || u.mail || u.userPrincipalName || "Unknown",
      email: u.mail || u.userPrincipalName || "",
      ...(u.jobTitle ? { title: u.jobTitle } : {}),
      upn: (u.userPrincipalName ?? "").toLowerCase(),
    }));
  if (order) {
    const rank = (upn: string) => {
      const i = order.findIndex((n) => n.toLowerCase() === upn);
      return i < 0 ? order.length : i;
    };
    people.sort((a, b) => rank(a.upn) - rank(b.upn));
  }
  return people.map(({ upn: _upn, ...p }) => p);
}
