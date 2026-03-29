import type { NextConfig } from 'next'

const disableDevtools = process.env.DISABLE_DEVTOOLS === '1' || process.env.DISABLE_DEVTOOLS === 'true'

const nextConfig: NextConfig = {
  ...(disableDevtools && {
    devIndicators: false,
  }),
  // Suppress Turbopack NFT false positive when tracing cwd-based path helpers (import trace lists next.config).
  turbopack: {
    ignoreIssue: [
      {
        path: /next\.config\.ts$/,
        title: /unexpected file in NFT list/i,
      },
    ],
  },
}

export default nextConfig
