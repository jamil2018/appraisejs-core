import type { NextConfig } from 'next'

const disableDevtools =
  process.env.DISABLE_DEVTOOLS === '1' ||
  process.env.DISABLE_DEVTOOLS === 'true'

const nextConfig: NextConfig = {
  ...(disableDevtools && {
    devIndicators: false,
  }),
}

export default nextConfig
