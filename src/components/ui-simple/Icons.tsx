import type { ReactNode, SVGProps } from 'react';

type IconProps = SVGProps<SVGSVGElement>;
type IconBaseProps = IconProps & { children: ReactNode };

const baseProps = {
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
};

function IconBase({ children, ...props }: IconBaseProps) {
  const ariaHidden = props['aria-label'] ? undefined : true;
  return (
    <svg {...baseProps} {...props} aria-hidden={ariaHidden}>
      {children}
    </svg>
  );
}

export function Bell(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.7 21a2 2 0 0 1-3.4 0" />
    </IconBase>
  );
}

export function TrendingUp(props: IconProps) {
  return (
    <IconBase {...props}>
      <polyline points="23 6 13.5 15.5 8.5 10.5 1 18" />
      <polyline points="17 6 23 6 23 12" />
    </IconBase>
  );
}

export function TrendingDown(props: IconProps) {
  return (
    <IconBase {...props}>
      <polyline points="23 18 13.5 8.5 8.5 13.5 1 6" />
      <polyline points="17 18 23 18 23 12" />
    </IconBase>
  );
}

export function ArrowLeft(props: IconProps) {
  return (
    <IconBase {...props}>
      <line x1="19" y1="12" x2="5" y2="12" />
      <polyline points="12 19 5 12 12 5" />
    </IconBase>
  );
}

export function ArrowRight(props: IconProps) {
  return (
    <IconBase {...props}>
      <line x1="5" y1="12" x2="19" y2="12" />
      <polyline points="12 5 19 12 12 19" />
    </IconBase>
  );
}

export function ChevronDown(props: IconProps) {
  return (
    <IconBase {...props}>
      <polyline points="6 9 12 15 18 9" />
    </IconBase>
  );
}

export function LogOut(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <polyline points="16 17 21 12 16 7" />
      <line x1="21" y1="12" x2="9" y2="12" />
    </IconBase>
  );
}

export function Heart(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.6l-1-1a5.5 5.5 0 0 0-7.8 7.8l1 1L12 21l7.8-7.6 1-1a5.5 5.5 0 0 0 0-7.8z" />
    </IconBase>
  );
}

export function MessageCircle(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4z" />
    </IconBase>
  );
}

export function Repeat2(props: IconProps) {
  return (
    <IconBase {...props}>
      <polyline points="17 1 21 5 17 9" />
      <path d="M21 5H9a4 4 0 0 0-4 4v4" />
      <polyline points="7 23 3 19 7 15" />
      <path d="M3 19h12a4 4 0 0 0 4-4v-4" />
    </IconBase>
  );
}

export function Share(props: IconProps) {
  return (
    <IconBase {...props}>
      <circle cx="18" cy="5" r="3" />
      <circle cx="6" cy="12" r="3" />
      <circle cx="18" cy="19" r="3" />
      <line x1="8.6" y1="13.5" x2="15.4" y2="17.5" />
      <line x1="15.4" y1="6.5" x2="8.6" y2="10.5" />
    </IconBase>
  );
}

export function Share2(props: IconProps) {
  return <Share {...props} />;
}

export function Send(props: IconProps) {
  return (
    <IconBase {...props}>
      <line x1="22" y1="2" x2="11" y2="13" />
      <polygon points="22 2 15 22 11 13 2 9 22 2" />
    </IconBase>
  );
}

export function Image(props: IconProps) {
  return (
    <IconBase {...props}>
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <circle cx="8.5" cy="8.5" r="1.5" />
      <polyline points="21 15 16 10 5 21" />
    </IconBase>
  );
}

export function Video(props: IconProps) {
  return (
    <IconBase {...props}>
      <rect x="3" y="5" width="15" height="14" rx="2" />
      <polygon points="16 7 22 12 16 17 16 7" />
    </IconBase>
  );
}

export function X(props: IconProps) {
  return (
    <IconBase {...props}>
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </IconBase>
  );
}

export function Search(props: IconProps) {
  return (
    <IconBase {...props}>
      <circle cx="11" cy="11" r="8" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </IconBase>
  );
}

export function Users(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </IconBase>
  );
}

export function Globe(props: IconProps) {
  return (
    <IconBase {...props}>
      <circle cx="12" cy="12" r="10" />
      <path d="M2 12h20" />
      <path d="M12 2a15 15 0 0 1 0 20" />
      <path d="M12 2a15 15 0 0 0 0 20" />
    </IconBase>
  );
}

export function User(props: IconProps) {
  return (
    <IconBase {...props}>
      <circle cx="12" cy="7" r="4" />
      <path d="M5.5 21a6.5 6.5 0 0 1 13 0" />
    </IconBase>
  );
}

export function Hash(props: IconProps) {
  return (
    <IconBase {...props}>
      <line x1="4" y1="9" x2="20" y2="9" />
      <line x1="4" y1="15" x2="20" y2="15" />
      <line x1="10" y1="3" x2="8" y2="21" />
      <line x1="16" y1="3" x2="14" y2="21" />
    </IconBase>
  );
}

export function ExternalLink(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
      <polyline points="15 3 21 3 21 9" />
      <line x1="10" y1="14" x2="21" y2="3" />
    </IconBase>
  );
}

export function UserPlus(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <line x1="19" y1="8" x2="19" y2="14" />
      <line x1="22" y1="11" x2="16" y2="11" />
    </IconBase>
  );
}

export function UserMinus(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <line x1="16" y1="11" x2="22" y2="11" />
    </IconBase>
  );
}

export function Loader2(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M21 12a9 9 0 1 1-2.6-6.4" />
    </IconBase>
  );
}

export function Sparkles(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M12 3l1.8 4.5L18 9l-4.2 1.5L12 15l-1.8-4.5L6 9l4.2-1.5L12 3z" />
      <path d="M19 2l.9 2.2L22 5l-2.1.8L19 8l-.9-2.2L16 5l2.1-.8L19 2z" />
    </IconBase>
  );
}

export function DollarSign(props: IconProps) {
  return (
    <IconBase {...props}>
      <line x1="12" y1="1" x2="12" y2="23" />
      <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
    </IconBase>
  );
}

export function Wallet(props: IconProps) {
  return (
    <IconBase {...props}>
      <rect x="2" y="6" width="20" height="14" rx="2" />
      <line x1="16" y1="12" x2="20" y2="12" />
      <circle cx="18" cy="12" r="1" />
    </IconBase>
  );
}

export function Home(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M3 10.5l9-7 9 7" />
      <path d="M5 10v10h14V10" />
    </IconBase>
  );
}

export function Zap(props: IconProps) {
  return (
    <IconBase {...props}>
      <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
    </IconBase>
  );
}

export function Eye(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z" />
      <circle cx="12" cy="12" r="3" />
    </IconBase>
  );
}

export function Star(props: IconProps) {
  return (
    <IconBase {...props}>
      <polygon points="12 2 15 8.5 22 9.3 17 14 18.5 21 12 17.5 5.5 21 7 14 2 9.3 9 8.5 12 2" />
    </IconBase>
  );
}

export function Filter(props: IconProps) {
  return (
    <IconBase {...props}>
      <polygon points="3 4 21 4 14 12 14 20 10 20 10 12 3 4" />
    </IconBase>
  );
}

export function Coins(props: IconProps) {
  return (
    <IconBase {...props}>
      <circle cx="9" cy="8" r="5" />
      <circle cx="15" cy="14" r="5" />
    </IconBase>
  );
}

export function Flame(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M12 2s5 5 5 10a5 5 0 0 1-10 0c0-5 5-10 5-10z" />
    </IconBase>
  );
}

export function AlertCircle(props: IconProps) {
  return (
    <IconBase {...props}>
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="8" x2="12" y2="12" />
      <circle cx="12" cy="16" r="1" />
    </IconBase>
  );
}

export function Settings(props: IconProps) {
  return (
    <IconBase {...props}>
      <circle cx="12" cy="12" r="3" />
      <line x1="12" y1="2" x2="12" y2="5" />
      <line x1="12" y1="19" x2="12" y2="22" />
      <line x1="2" y1="12" x2="5" y2="12" />
      <line x1="19" y1="12" x2="22" y2="12" />
      <line x1="4.2" y1="4.2" x2="6.4" y2="6.4" />
      <line x1="17.6" y1="17.6" x2="19.8" y2="19.8" />
      <line x1="17.6" y1="6.4" x2="19.8" y2="4.2" />
      <line x1="4.2" y1="19.8" x2="6.4" y2="17.6" />
    </IconBase>
  );
}

export function Check(props: IconProps) {
  return (
    <IconBase {...props}>
      <polyline points="20 6 9 17 4 12" />
    </IconBase>
  );
}

export function CheckCircle(props: IconProps) {
  return (
    <IconBase {...props}>
      <circle cx="12" cy="12" r="10" />
      <polyline points="9 12 12 15 17 10" />
    </IconBase>
  );
}

export function AlertTriangle(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M10.3 3.4L1.6 18a2 2 0 0 0 1.7 3h17.4a2 2 0 0 0 1.7-3L13.7 3.4a2 2 0 0 0-3.4 0z" />
      <line x1="12" y1="9" x2="12" y2="13" />
      <circle cx="12" cy="17" r="1" />
    </IconBase>
  );
}

export function Info(props: IconProps) {
  return (
    <IconBase {...props}>
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="10" x2="12" y2="16" />
      <circle cx="12" cy="7" r="1" />
    </IconBase>
  );
}

export function Bug(props: IconProps) {
  return (
    <IconBase {...props}>
      <rect x="7" y="8" width="10" height="10" rx="4" />
      <line x1="12" y1="2" x2="12" y2="6" />
      <line x1="8" y1="2" x2="10" y2="4" />
      <line x1="16" y1="2" x2="14" y2="4" />
      <line x1="2" y1="12" x2="6" y2="12" />
      <line x1="18" y1="12" x2="22" y2="12" />
      <line x1="4" y1="17" x2="7" y2="16" />
      <line x1="20" y1="17" x2="17" y2="16" />
    </IconBase>
  );
}

export function Wifi(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M5 12a10 10 0 0 1 14 0" />
      <path d="M8.5 15.5a5 5 0 0 1 7 0" />
      <circle cx="12" cy="19" r="1" />
    </IconBase>
  );
}

export function Activity(props: IconProps) {
  return (
    <IconBase {...props}>
      <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
    </IconBase>
  );
}

export function Camera(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
      <circle cx="12" cy="13" r="4" />
    </IconBase>
  );
}

export function ShoppingCart(props: IconProps) {
  return (
    <IconBase {...props}>
      <circle cx="9" cy="21" r="1" />
      <circle cx="20" cy="21" r="1" />
      <path d="M1 1h4l2.7 13.4a2 2 0 0 0 2 1.6h9.7a2 2 0 0 0 2-1.6L23 6H6" />
    </IconBase>
  );
}
