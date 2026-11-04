/** Which tenant an error is about. Pure (tested in tenants.test.ts). */

/**
 * The tenant an az error names (Jig's messages for a tenant added in Jig: "In tenant X: …", "You're not
 * signed in to tenant X. …", "The sign-in to tenant X expired. …"); undefined when it names none, as
 * with your own az login.
 */
export function tenantNamed(error: string): string | undefined {
  return /\b(?:In|to) tenant (.+?)(?:: | expired\.|\. Sign in)/.exec(error)?.[1];
}

/**
 * Errors that name another tenant than `tenant`: what a search that ran into a tenant switch saved
 * before every az call was pinned to the search's tenant (D-345). A list with any is searched again.
 */
export function foreignErrors(errors: string[], tenant: { label: string; isDefault: boolean }): string[] {
  return errors.filter((e) => {
    const named = tenantNamed(e);
    return named !== undefined && (tenant.isDefault || named !== tenant.label);
  });
}
