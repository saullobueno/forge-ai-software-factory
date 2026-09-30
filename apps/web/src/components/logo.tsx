/** Marca do produto: ícone (bigorna/forja estilizada) + wordmark. */
export function Logo({ className = '' }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2.5 ${className}`}>
      <svg aria-hidden viewBox="0 0 32 32" className="size-9 shrink-0" fill="none">
        <rect width="32" height="32" rx="8" className="fill-primary" />
        <path
          d="M8 12h13a3 3 0 0 0 3-3v0M8 12v3h6l-2 5h8l-2-5h6v-3"
          className="stroke-primary-foreground"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path d="M11 24h10" className="stroke-primary-foreground" strokeWidth="2" strokeLinecap="round" />
      </svg>
      <span className="font-mono text-xl font-semibold tracking-tight">forge</span>
    </span>
  );
}
