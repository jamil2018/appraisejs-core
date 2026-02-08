import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // Use current directory as workspace root when running from template (avoids lockfile warning)
  turbopack: process.env.NODE_ENV !== 'production' ? { root: process.cwd() } : undefined,
}

export default nextConfig
