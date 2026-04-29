<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Architecture decisions

## Three conversation tables stay separate (deliberately)

The codebase has three near-duplicate model pairs:

- `WhatsAppConversation` + `WhatsAppMessage`
- `WebsiteConversation` + `WebsiteMessage`
- `SocialConversation` + `SocialMessage` (Instagram + Facebook share this)

Adding a 5th channel today touches ~10–15 places (Prisma models, three list/detail/star/read/persona-reset endpoints, channel-flags helper, frontend tab list, types in several files, composite indexes per table).

**This is known and intentional.** A unified-table refactor (estimated 2–4 days dev + 1 day regression testing) was scoped and deferred in April 2026 because:

- No new channels were planned within 6 months
- Cross-channel features (unified per-lead timeline, org-wide unread counts) were not on the active roadmap

**Do the refactor when** any of the following triggers:

1. A client asks for an additional channel (SMS, Telegram, voice-as-inbox). Budget the refactor as part of that channel's delivery rather than doing it cold.
2. Cross-channel features move onto the roadmap (e.g., merging a single lead's WA + IG + Website conversations into one view).
3. Two or more conversation-area cleanup items want to touch the same code at once.

**Cheaper intermediate step** if duplication starts to feel painful before a real trigger: extract a `src/lib/conversation-store.ts` helper that wraps the three per-channel `findMany` / `findUnique` calls behind one TypeScript interface. No schema change, no data migration, ~half a day of work.
