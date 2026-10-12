import type { SVGProps } from 'react';

type P = SVGProps<SVGSVGElement> & { size?: number };
const base = ({ size = 24, ...rest }: P) => ({ width: size, height: size, 'aria-hidden': true, focusable: false, ...rest });

export const IconBack = (p: P) => (
  <svg viewBox="0 0 32 24" fill="none" {...base(p)}>
    <path d="M30 12H4M12 3 3 12l9 9" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

export const IconNote = (p: P) => (
  <svg viewBox="0 0 24 24" fill="currentColor" {...base(p)}>
    <path d="M10 3.5v11.1A4 4 0 1 0 12 18V8.2l6.4 2.3c.7.2 1.3-.3 1.3-1V6.9c0-.5-.3-.9-.8-1.1L11.4 3c-.7-.3-1.4.2-1.4.5Z" />
  </svg>
);

export const IconCamera = (p: P) => (
  <svg viewBox="0 0 24 24" fill="currentColor" {...base(p)}>
    <path d="M8.6 4.5c.3-.6.9-1 1.6-1h3.6c.7 0 1.3.4 1.6 1l.7 1.4h2.6A2.3 2.3 0 0 1 21 8.2v9.5a2.3 2.3 0 0 1-2.3 2.3H5.3A2.3 2.3 0 0 1 3 17.7V8.2a2.3 2.3 0 0 1 2.3-2.3h2.6l.7-1.4ZM12 17.2a4.2 4.2 0 1 0 0-8.4 4.2 4.2 0 0 0 0 8.4Zm0-2.1a2.1 2.1 0 1 1 0-4.2 2.1 2.1 0 0 1 0 4.2ZM17.6 9.9a.9.9 0 1 0 0-1.8.9.9 0 0 0 0 1.8Z" />
  </svg>
);

/** The navigation "send" arrow in the comment bars. */
export const IconNav = (p: P) => (
  <svg viewBox="0 0 24 24" fill="currentColor" {...base(p)}>
    <path d="M12 2.5 20 21l-8-4.3L4 21l8-18.5Z" />
  </svg>
);

export const IconDots = (p: P) => (
  <svg viewBox="0 0 24 24" fill="currentColor" {...base(p)}>
    <circle cx="12" cy="5" r="2" />
    <circle cx="12" cy="12" r="2" />
    <circle cx="12" cy="19" r="2" />
  </svg>
);

export const IconPlus = ({ strokeWidth = 3, ...p }: P) => (
  <svg viewBox="0 0 24 24" fill="none" {...base(p)}>
    <path d="M12 3v18M3 12h18" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" />
  </svg>
);

export const IconChevronRight = (p: P) => (
  <svg viewBox="0 0 24 24" fill="none" {...base(p)}>
    <path d="m9 5 7 7-7 7" stroke="currentColor" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

export const IconChevronDown = (p: P) => (
  <svg viewBox="0 0 24 24" fill="currentColor" {...base(p)}>
    <path d="M3.5 7.5h17L12 18 3.5 7.5Z" />
  </svg>
);

export const IconCaretDown = (p: P) => (
  <svg viewBox="0 0 24 24" fill="none" {...base(p)}>
    <path d="m5 9 7 7 7-7" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

/** Chunky filled up arrow used for request votes. */
export const IconUp = (p: P) => (
  <svg viewBox="0 0 24 24" fill="currentColor" {...base(p)}>
    <path d="M12 2 22 12.5h-6.2V22H8.2v-9.5H2L12 2Z" />
  </svg>
);

export const IconDown = (p: P) => (
  <svg viewBox="0 0 24 24" fill="currentColor" {...base(p)}>
    <path d="M12 22 2 11.5h6.2V2h7.6v9.5H22L12 22Z" />
  </svg>
);

export const IconHeart = (p: P) => (
  <svg viewBox="0 0 24 24" fill="currentColor" {...base(p)}>
    <path d="M12 21s-7.6-4.6-9.6-9.6C1 7.8 3.4 4 7.1 4c2 0 3.5 1 4.9 2.8C13.4 5 14.9 4 16.9 4c3.7 0 6.1 3.8 4.7 7.4C19.6 16.4 12 21 12 21Z" />
  </svg>
);

/** Aux-cable loop used as the repost count icon. */
export const IconRepost = (p: P) => (
  <svg viewBox="0 0 28 24" fill="none" {...base(p)}>
    <path d="M3 9.5C3 5.4 6.4 3 10.6 3h4.8C20 3 23 5.6 23 9s-3 6-7.5 6H9.5c-2.6 0-4.5 1.4-4.5 3.4S6.9 21.5 9.5 21.5H26" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" />
    <path d="M22.5 18.5 26 21.5l-3.5 3" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

export const IconHelp = (p: P) => (
  <svg viewBox="0 0 24 34" fill="currentColor" {...base(p)}>
    <path d="M12 0C5.6 0 1.2 3.8 1 9.6h6.6c.2-2.4 1.9-4 4.3-4 2.5 0 4.2 1.5 4.2 3.6 0 2-.8 3-3.4 4.6-2.9 1.7-4.1 3.7-3.9 7.1v1.3h6.4V21c0-2 .7-3 3.4-4.6 2.9-1.7 4.4-4 4.4-7.2C23 3.8 18.5 0 12 0Zm-1 26.4a3.8 3.8 0 1 0 0 7.6 3.8 3.8 0 0 0 0-7.6Z" />
  </svg>
);

export const IconPlay = (p: P) => (
  <svg viewBox="0 0 24 24" fill="currentColor" {...base(p)}>
    <path d="M7 4.5v15c0 .8.9 1.3 1.6.8l11.3-7.5c.6-.4.6-1.3 0-1.7L8.6 3.7C7.9 3.2 7 3.7 7 4.5Z" />
  </svg>
);

export const IconPause = (p: P) => (
  <svg viewBox="0 0 24 24" fill="currentColor" {...base(p)}>
    <rect x="6" y="4.5" width="4.2" height="15" rx="1.3" />
    <rect x="13.8" y="4.5" width="4.2" height="15" rx="1.3" />
  </svg>
);

export const IconCheck = (p: P) => (
  <svg viewBox="0 0 24 24" fill="none" {...base(p)}>
    <path d="m4.5 12.5 5 5 10-11" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

export const IconX = (p: P) => (
  <svg viewBox="0 0 24 24" fill="none" {...base(p)}>
    <path d="M6 6l12 12M18 6 6 18" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
  </svg>
);

export const IconSkip = (p: P) => (
  <svg viewBox="0 0 24 24" fill="currentColor" {...base(p)}>
    <path d="M4 5.3v13.4c0 .8.9 1.2 1.5.7l8.5-6.7c.5-.4.5-1.1 0-1.5L5.5 4.6C4.9 4.1 4 4.5 4 5.3Z" />
    <rect x="16" y="4.5" width="3.4" height="15" rx="1.2" />
  </svg>
);

export const IconStop = (p: P) => (
  <svg viewBox="0 0 24 24" fill="currentColor" {...base(p)}>
    <rect x="5" y="5" width="14" height="14" rx="2.5" />
  </svg>
);

/** Concentric "live" waves. */
export const IconLive = (p: P) => (
  <svg viewBox="0 0 24 24" fill="none" {...base(p)}>
    <path d="M9 4.5C6.6 6.4 5.2 9.1 5.2 12s1.4 5.6 3.8 7.5M12.5 7c-1.4 1.3-2.2 3.1-2.2 5s.8 3.7 2.2 5M16 9.5c-.7.7-1.1 1.6-1.1 2.5s.4 1.8 1.1 2.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
  </svg>
);

export const IconSparkle = (p: P) => (
  <svg viewBox="0 0 24 24" fill="currentColor" {...base(p)}>
    <path d="M12 0c.6 6.4 5.6 11.4 12 12-6.4.6-11.4 5.6-12 12-.6-6.4-5.6-11.4-12-12C6.4 11.4 11.4 6.4 12 0Z" />
  </svg>
);

export const IconSearch = (p: P) => (
  <svg viewBox="0 0 24 24" fill="none" {...base(p)}>
    <circle cx="10.5" cy="10.5" r="6.5" stroke="currentColor" strokeWidth="2.4" />
    <path d="m15.5 15.5 5 5" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
  </svg>
);

export const IconShare = (p: P) => (
  <svg viewBox="0 0 24 24" fill="none" {...base(p)}>
    <path d="M12 3v12M7.5 7.5 12 3l4.5 4.5" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M5 12.5v6.2c0 1 .8 1.8 1.8 1.8h10.4c1 0 1.8-.8 1.8-1.8v-6.2" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
  </svg>
);

export const IconPin = (p: P) => (
  <svg viewBox="0 0 24 24" fill="currentColor" {...base(p)}>
    <path d="M12 2a7 7 0 0 0-7 7c0 5.2 7 13 7 13s7-7.8 7-13a7 7 0 0 0-7-7Zm0 9.6a2.6 2.6 0 1 1 0-5.2 2.6 2.6 0 0 1 0 5.2Z" />
  </svg>
);

export const IconWallet = (p: P) => (
  <svg viewBox="0 0 24 24" fill="none" {...base(p)}>
    <rect x="3" y="6" width="18" height="13" rx="3" stroke="currentColor" strokeWidth="2.2" />
    <path d="M16 12.5h2.5M6 6l9-3 1.2 3" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
  </svg>
);

export const IconGear = (p: P) => (
  <svg viewBox="0 0 24 24" fill="none" {...base(p)}>
    <circle cx="12" cy="12" r="3.2" stroke="currentColor" strokeWidth="2.2" />
    <path
      d="M12 2.8v2.4M12 18.8v2.4M2.8 12h2.4M18.8 12h2.4M5.5 5.5l1.7 1.7M16.8 16.8l1.7 1.7M5.5 18.5l1.7-1.7M16.8 7.2l1.7-1.7"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
    />
  </svg>
);

export const IconLogout = (p: P) => (
  <svg viewBox="0 0 24 24" fill="none" {...base(p)}>
    <path d="M14 4H6.5C5.7 4 5 4.7 5 5.5v13c0 .8.7 1.5 1.5 1.5H14M10 12h10M16.5 8.5 20 12l-3.5 3.5" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

export const IconUsers = (p: P) => (
  <svg viewBox="0 0 24 24" fill="currentColor" {...base(p)}>
    <circle cx="9" cy="8" r="3.6" />
    <path d="M2.5 19.5c0-3.6 2.9-6 6.5-6s6.5 2.4 6.5 6v.5h-13v-.5Z" />
    <circle cx="17" cy="9" r="2.8" opacity=".7" />
    <path d="M16 13.6c3.2-.3 5.8 1.8 5.8 5v.4h-4.6c0-2-.5-3.9-1.2-5.4Z" opacity=".7" />
  </svg>
);

export const IconGift = (p: P) => (
  <svg viewBox="0 0 24 24" fill="none" {...base(p)}>
    <rect x="3.5" y="8.5" width="17" height="4" rx="1" stroke="currentColor" strokeWidth="2" />
    <path d="M5 12.5v7c0 .6.4 1 1 1h12c.6 0 1-.4 1-1v-7M12 8.5v12M12 8.5S10.8 4 8.5 4C6.8 4 6.5 6 7.6 7c.9.9 4.4 1.5 4.4 1.5Zm0 0S13.2 4 15.5 4c1.7 0 2 2 .9 3-.9.9-4.4 1.5-4.4 1.5Z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
  </svg>
);

export const IconSos = (p: P) => (
  <svg viewBox="0 0 40 40" {...base(p)}>
    <circle cx="20" cy="20" r="19" fill="#E5484D" />
    <circle cx="20" cy="20" r="15.5" fill="none" stroke="#fff" strokeOpacity=".8" strokeWidth="1.4" />
    <text x="20" y="25" textAnchor="middle" fontSize="13" fontWeight="900" fill="#fff" fontFamily="Arial Black, Arial, sans-serif">
      SOS
    </text>
  </svg>
);
