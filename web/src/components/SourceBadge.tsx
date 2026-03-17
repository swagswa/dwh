import { sources, type SourceKey } from '@/lib/sources'
import { cn } from '@/lib/utils'

interface SourceBadgeProps {
  source: SourceKey
  variant?: 'default' | 'outline'
  className?: string
}

export function SourceBadge({ source, variant = 'default', className }: SourceBadgeProps) {
  const config = sources[source]
  const Icon = config.icon

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-xs font-medium transition-colors duration-150',
        variant === 'default' && [config.bgClass, config.textClass],
        variant === 'outline' && ['bg-transparent border', config.borderClass, config.textClass],
        className,
      )}
    >
      <Icon className="h-3 w-3" />
      {config.label}
    </span>
  )
}
