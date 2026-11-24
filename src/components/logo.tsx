import Image from 'next/image'

type LogoProps = {
  compact?: boolean
}

const markClassName = 'size-8 shrink-0 [.light_&]:invert'

function CompactLogo() {
  return (
    <div className="flex items-center gap-2 whitespace-nowrap">
      <Image src="/logo.svg" alt="AppraiseJS" width={32} height={32} priority className={markClassName} />
      <span className="flex items-baseline gap-1">
        <span className="text-sm font-semibold uppercase tracking-[0.08em] text-foreground">Appraise</span>
        <span className="text-sm font-semibold uppercase tracking-[0.08em] text-primary">JS</span>
      </span>
    </div>
  )
}

function FullLogo() {
  return (
    <div className="m-2 flex items-center gap-1.5 whitespace-nowrap">
      <Image src="/logo.svg" alt="AppraiseJS" width={32} height={32} priority className={markClassName} />
      <span className="flex items-baseline gap-1">
        <span className="text-[0.95rem] font-medium uppercase tracking-[0.12em] text-foreground/90">Appraise</span>
        <span className="text-[0.95rem] font-normal uppercase tracking-[0.12em] text-primary">JS</span>
      </span>
    </div>
  )
}

const Logo = ({ compact = false }: LogoProps) => {
  if (compact) return <CompactLogo />

  return <FullLogo />
}

export default Logo
