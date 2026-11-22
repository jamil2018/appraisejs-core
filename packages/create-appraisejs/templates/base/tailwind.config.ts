import type { Config } from 'tailwindcss'
import animate from 'tailwindcss-animate'

const semanticColor = (token: string) => `rgb(var(--${token}-rgb) / <alpha-value>)`

const colorPair = (token: string, foreground = `${token}-foreground`) => ({
  DEFAULT: semanticColor(token),
  foreground: semanticColor(foreground),
})

const statusColors = (token: string) => ({
  DEFAULT: semanticColor(token),
  surface: semanticColor(`${token}-surface`),
  border: semanticColor(`${token}-border`),
})

export default {
  darkMode: ['class'],
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
    '!./src/**/*.{test,spec}.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: 'var(--font-sans)',
        mono: 'var(--font-mono)',
      },
      colors: {
        background: semanticColor('background'),
        foreground: semanticColor('foreground'),
        card: colorPair('card', 'foreground'),
        popover: colorPair('popover', 'foreground'),
        primary: colorPair('primary'),
        secondary: colorPair('secondary'),
        muted: colorPair('muted'),
        accent: colorPair('accent'),
        destructive: colorPair('destructive'),
        border: semanticColor('border'),
        input: semanticColor('input'),
        field: semanticColor('field'),
        ring: semanticColor('ring'),
        success: statusColors('success'),
        warning: statusColors('warning'),
        danger: statusColors('danger'),
        info: statusColors('info'),
        selection: statusColors('selection'),
        chart: {
          '1': 'var(--chart-1)',
          '2': 'var(--chart-2)',
          '3': 'var(--chart-3)',
          '4': 'var(--chart-4)',
          '5': 'var(--chart-5)',
        },
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
      },
    },
  },
  plugins: [animate],
} satisfies Config
