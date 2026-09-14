import { cn } from "@/lib/utils";

/**
 * Two rounded-square modules interlocking at a corner: the core product
 * metaphor (a module plugging into another module/app) rendered as a simple,
 * confident geometric mark rather than decoration.
 */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={cn("size-8", className)}
      aria-hidden
    >
      <rect x="3" y="3" width="18" height="18" rx="5" className="fill-zinc-400 dark:fill-zinc-700" />
      <rect x="11" y="11" width="18" height="18" rx="5" className="fill-brand" />
    </svg>
  );
}

export function Logo({ className, markClassName }: { className?: string; markClassName?: string }) {
  return (
    <div className={cn("flex items-center gap-2", className)}>
      <LogoMark className={markClassName} />
      <span className="font-mono text-sm font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">
        nextapi
      </span>
    </div>
  );
}
