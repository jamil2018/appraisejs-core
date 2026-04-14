/**
 * All (base) routes depend on server data (Prisma). Force dynamic rendering
 * so these pages are not statically generated at build time (e.g. in CI where
 * no database is available).
 */
export const dynamic = 'force-dynamic'

export default function BaseLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
