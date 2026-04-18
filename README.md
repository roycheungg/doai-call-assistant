DOAI Call Assistant — multi-tenant CRM for voice (Vapi), WhatsApp, and embeddable website chatbots.

## Local development

Requires [Docker Desktop](https://www.docker.com/products/docker-desktop/) and Node.js 22+.

```bash
# First time setup
cp .env.local.example .env.local   # fills in DATABASE_URL + dev auth bypass
npm install
npm run db:up                       # starts Postgres in Docker
npm run dev:setup                   # pushes schema + seeds sample data

# Every time after that
npm run db:up                       # if not already running
npm run dev                         # http://localhost:4500
```

With `DEV_BYPASS_AUTH=1` in `.env.local` (set by the example), you are auto-signed-in as the seeded super-admin and can navigate everything without a real session.

Reset the local DB and re-seed:
```bash
npm run dev:reset
```

## Tech stack

- Next.js 16 + React 19
- Prisma 7 + PostgreSQL
- NextAuth v5 (Credentials + JWT sessions)
- Tailwind 4 + shadcn/ui

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
