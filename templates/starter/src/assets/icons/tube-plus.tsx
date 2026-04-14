import { cn } from '@/lib/utils'

export const TubePlus = ({ className }: { className?: string }) => {
  return (
    <>
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="24"
        height="24"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className={cn('lucide', className)}
      >
        {/* Empty tube icon */}
        <path d="M14.5 2v17.5c0 1.4-1.1 2.5-2.5 2.5c-1.4 0-2.5-1.1-2.5-2.5V2" />
        <path d="M8.5 2h7" />
        {/* Half-filled level indicator */}
        <line x1="10.5" y1="15.5" x2="13.5" y2="15.5" />
        {/* Plus icon - positioned at bottom right */}
        <line x1="17.5" y1="19.5" x2="21.5" y2="19.5" strokeWidth="1.5" />
        <line x1="19.5" y1="17.5" x2="19.5" y2="21.5" strokeWidth="1.5" />
      </svg>
    </>
  )
}
