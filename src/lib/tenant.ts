import { NextResponse } from "next/server";
import { auth } from "@/auth";

export type TenantRole = "member" | "admin" | "superAdmin";

export type TenantContext = {
  userId: string;
  organizationId: string;
  role: TenantRole;
  isSuperAdmin: boolean;
  // If the super-admin is viewing another org via ?asOrg, this is that target org.
  // Otherwise it's the user's own org.
};

/**
 * Require a valid session and resolve the target organizationId.
 *
 * - Regular users: uses session.user.organizationId
 * - Super-admins:
 *    - If ?asOrg=<id> is provided → uses that org
 *    - Otherwise → must also have their own organizationId (the DOAI org)
 *
 * Returns an NextResponse error on failure.
 */
export async function requireTenant(
  req: Request
): Promise<TenantContext | NextResponse> {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const role = (session.user.role || "member") as TenantRole;
  const url = new URL(req.url);
  const asOrg = url.searchParams.get("asOrg");

  if (role === "superAdmin" && asOrg) {
    return {
      userId: session.user.id,
      organizationId: asOrg,
      role,
      isSuperAdmin: true,
    };
  }

  const orgId = session.user.organizationId;
  if (!orgId) {
    return NextResponse.json(
      { error: "User has no organization" },
      { status: 403 }
    );
  }

  return {
    userId: session.user.id,
    organizationId: orgId,
    role,
    isSuperAdmin: role === "superAdmin",
  };
}

export function isErrorResponse(x: unknown): x is NextResponse {
  return x instanceof NextResponse;
}

/**
 * Stronger check: must be super-admin, no asOrg override applied.
 * Used for /admin/* endpoints.
 */
export async function requireSuperAdmin(): Promise<
  { userId: string; role: "superAdmin" } | NextResponse
> {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (session.user.role !== "superAdmin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  return { userId: session.user.id, role: "superAdmin" };
}
