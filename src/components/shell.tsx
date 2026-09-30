'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LogOut, ShieldCheck } from 'lucide-react';
import type { ReactNode } from 'react';
import { Icon, icons } from './icon';
import { event } from '@/lib/data';

type NavItem = { href: string; label: string; icon: string };

export function Shell({
  children,
  demo,
  role,
}: {
  children: ReactNode;
  demo: boolean;
  role: string | null;
}) {
  const path = usePathname();

  const staff = role === 'Coordination Team';

  // Same role-based access matrix as before — only the look changed.
  const nav: NavItem[] = [
    { href: '/', label: 'Register', icon: icons.register },
    ...(staff ? [{ href: '/check-in', label: 'Check In', icon: icons.checkIn }] : []),
    ...(role === 'Partner' ? [{ href: '/qr-code', label: 'My QR Code', icon: icons.checkIn }] : []),
    ...(role && role !== 'Partner'
      ? [{ href: '/programme', label: 'Programme', icon: icons.programme }]
      : []),
    ...(role ? [{ href: '/partners', label: 'Partners', icon: icons.partners }] : []),
    ...(staff ? [{ href: '/attendance', label: 'Attendance', icon: icons.attendance }] : []),
  ];

  const isActive = (href: string) => (href === '/' ? path === '/' : path.startsWith(href));

  return (
    <>
      <a className="skip-link" href="#main">
        Skip to content
      </a>

      {/* MOBILE HEADER (navy bar: logo · divider · event name) */}
      <header className="mobile-header">
        <Link href="/" aria-label="OAK Foundation home" className="row" style={{ gap: 12 }}>
          <img src="/Logo-Oak-Foundation.svg" width={45} height={28} alt="OAK Foundation" />
          <span className="divider" aria-hidden="true" />
          <span className="brand-title">{event.name}</span>
        </Link>
      </header>

      {/* DESKTOP SIDEBAR */}
      <aside className="sidebar">
        <Link href="/" className="sidebar-brand" aria-label="OAK Foundation home">
          <img src="/Logo-Oak-Foundation.svg" width={85} height={53} alt="OAK Foundation" />
          <span className="brand-title">{event.name}</span>
        </Link>

        <nav aria-label="Main navigation">
          <p className="eyebrow nav-role">{role ?? 'Register to access the event'}</p>
          {nav.map(({ href, label, icon }) => (
            <Link
              key={href}
              href={href}
              aria-current={isActive(href) ? 'page' : undefined}
              className={`nav-link ${isActive(href) ? 'active' : ''}`}
            >
              <Icon name={icon} size={18} />
              <span>{label}</span>
            </Link>
          ))}
        </nav>

        <div className="sidebar-footer">
          <img src="/icons/container-30.svg" width={32} height={32} alt="" />
          <div>
            <strong>{event.location}, Zimbabwe</strong>
            <small>{event.dates}</small>
          </div>
        </div>
      </aside>

      {/* MAIN CONTENT */}
      <div className="main-shell">
        <main id="main">
          {children}

          <footer className="utility-footer">
            {demo && <span className="demo-label">Local demo · sample event content</span>}

            <Link href={staff ? '/attendance' : '/staff'}>
              <ShieldCheck size={13} />
              {staff ? 'Staff area' : 'Staff sign-in'}
            </Link>

            {staff && !demo && (
              <button
                onClick={async () => {
                  await fetch('/api/auth/sign-out', { method: 'POST' });
                  window.location.href = '/';
                }}
              >
                <LogOut size={13} />
                Sign out
              </button>
            )}
          </footer>
        </main>
      </div>

      {/* MOBILE BOTTOM NAV (frosted bar, 9px labels) */}
      <nav className="bottom-nav" aria-label="Mobile navigation">
        {nav.map(({ href, label, icon }) => (
          <Link
            key={href}
            href={href}
            aria-current={isActive(href) ? 'page' : undefined}
            className={isActive(href) ? 'active' : ''}
          >
            <Icon name={icon} size={19} />
            <span>{label}</span>
          </Link>
        ))}
      </nav>
    </>
  );
}
