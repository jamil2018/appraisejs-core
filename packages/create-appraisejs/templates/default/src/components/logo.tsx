import Image from 'next/image'

const Logo = () => {
  return (
    <div className="m-2 flex items-center gap-2.5">
      <Image src="/logo.svg" alt="AppraiseJS" width={32} height={32} priority className="h-8 w-8" />
      <span className="flex items-baseline gap-1">
        <span className="text-foreground/90 text-[0.95rem] font-medium uppercase tracking-[0.12em]">Appraise</span>
        <span className="text-[0.95rem] font-normal uppercase tracking-[0.12em] text-primary">JS</span>
      </span>
    </div>
  )
}

export default Logo
