// The CRM foundation declares team_member; live internal memberships use that role.
// Keep aligned with staff_actor_can_access in the Website Leads migration.
export const internalStaffRoles = ["team_member"] as const;
export function isInternalStaffMembership(member: { role?: string | null; active?: boolean } | null) {
  return Boolean(member?.active && internalStaffRoles.some(role => role === member.role));
}
