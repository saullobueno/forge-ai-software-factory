import type { ReactNode } from 'react';

function Icon({ children }: { children: ReactNode }) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 24 24"
      className="size-4 shrink-0"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {children}
    </svg>
  );
}

export type NavIconName = 'projects' | 'approvals' | 'tasks' | 'runs' | 'playground' | 'usage' | 'audit' | 'settings';

export function NavIcon({ name }: { name: NavIconName }) {
  switch (name) {
    case 'projects':
      return (
        <Icon>
          <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
        </Icon>
      );
    case 'approvals':
      return (
        <Icon>
          <circle cx="12" cy="12" r="9" />
          <path d="m8 12 3 3 5-6" />
        </Icon>
      );
    case 'tasks':
      return (
        <Icon>
          <rect x="4" y="4" width="16" height="16" rx="2" />
          <path d="M8 9h8M8 13h8M8 17h5" />
        </Icon>
      );
    case 'runs':
      return (
        <Icon>
          <path d="M6 4v16l14-8z" />
        </Icon>
      );
    case 'playground':
      return (
        <Icon>
          <path d="M12 3l1.8 4.7L18.5 9.5l-4.7 1.8L12 16l-1.8-4.7L5.5 9.5l4.7-1.8z" />
          <path d="M19 15l.7 1.8L21.5 17.5l-1.8.7L19 20l-.7-1.8-1.8-.7 1.8-.7z" />
        </Icon>
      );
    case 'usage':
      return (
        <Icon>
          <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />
        </Icon>
      );
    case 'audit':
      return (
        <Icon>
          <path d="M12 3l8 3v6c0 4.5-3.2 8-8 9-4.8-1-8-4.5-8-9V6z" />
          <path d="m9 12 2 2 4-4" />
        </Icon>
      );
    case 'settings':
      return (
        <Icon>
          <circle cx="12" cy="12" r="3" />
          <path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1 7 17M17 7l2.1-2.1" />
        </Icon>
      );
  }
}
