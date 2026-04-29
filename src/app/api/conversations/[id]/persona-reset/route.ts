import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { requireTenant, isErrorResponse } from "@/lib/tenant";
import { isChannelEnabled, type Channel } from "@/lib/channel-flags";

/**
 * Set `personaResetAt = NOW()` on a conversation. Subsequent AI replies
 * will only see history from that point on, ignoring earlier turns that
 * may have referenced an old persona / system prompt. Customer-facing
 * inbox UI still shows the full history — only prompt construction is
 * affected (see {channel}-handler `findMany` calls that filter by
 * `createdAt >= personaResetAt`).
 *
 * This is the non-destructive alternative to deleting old assistant
 * messages: customer messages stay visible, leads stay attached, and
 * the operator can scroll back through context if needed.
 */
async function setPersonaResetRaw(
  table:
    | "ca_whatsapp_conversations"
    | "ca_website_conversations"
    | "ca_social_conversations",
  id: string,
  organizationId: string
): Promise<Date | null> {
  // Static table name — whitelisted via the union type so this is not
  // user-controlled.
  const sql = Prisma.sql`
    UPDATE ${Prisma.raw(`"${table}"`)}
    SET "personaResetAt" = NOW()
    WHERE id = ${id} AND "organizationId" = ${organizationId}
    RETURNING "personaResetAt"
  `;
  const rows = await prisma.$queryRaw<{ personaResetAt: Date }[]>(sql);
  return rows[0]?.personaResetAt ?? null;
}

const TABLE_FOR_CHANNEL: Record<
  Channel,
  Parameters<typeof setPersonaResetRaw>[0]
> = {
  whatsapp: "ca_whatsapp_conversations",
  website: "ca_website_conversations",
  instagram: "ca_social_conversations",
  facebook: "ca_social_conversations",
};

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await requireTenant(req);
  if (isErrorResponse(ctx)) return ctx;

  try {
    const { id } = await params;
    const { searchParams } = new URL(req.url);
    const channelRaw = searchParams.get("channel") || "whatsapp";
    if (
      channelRaw !== "whatsapp" &&
      channelRaw !== "website" &&
      channelRaw !== "instagram" &&
      channelRaw !== "facebook"
    ) {
      return NextResponse.json({ error: "Invalid channel" }, { status: 400 });
    }
    const channel = channelRaw as Channel;

    if (!(await isChannelEnabled(ctx.organizationId, channel))) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const personaResetAt = await setPersonaResetRaw(
      TABLE_FOR_CHANNEL[channel],
      id,
      ctx.organizationId
    );
    if (personaResetAt === null) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    return NextResponse.json({ id, personaResetAt });
  } catch (error) {
    console.error("[PERSONA-RESET API] Error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
