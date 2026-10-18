'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { createContext, useContext, useEffect, useState } from 'react';
import {
  ArrowUpRight,
  Bell,
  Building2,
  ChartNoAxesCombined,
  ChevronDown,
  CircleHelp,
  Command,
  Factory,
  FileChartColumn,
  FileText,
  Handshake,
  LayoutDashboard,
  Leaf,
  LogOut,
  MapPin,
  Menu,
  PanelLeftClose,
  Search,
  Settings2,
  ShieldCheck,
  Sprout,
  Users,
  Wallet,
  Wrench,
  X,
  ClipboardCheck,
  Truck,
  Ticket,
  CalendarCheck,
  Layers3,
} from 'lucide-react';
import { api, type Identity, type Resource } from '@/lib/api';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from './ui/dialog';
import { Loading, ErrorState } from './ui/states';
import { Button } from './ui/button';
import { ThemeToggle } from './theme-toggle';
import { ProfileLink } from './profile';
import { BRAND_NAME } from '@/lib/branding';
type Context = {
  identity: Identity;
  catalog: Record<string, Resource>;
  businessUnitId: string;
  setBusinessUnitId: (id: string) => void;
};
const OsContext = createContext<Context | null>(null);
export function useOs() {
  const value = useContext(OsContext);
  if (!value) throw new Error('Workspace context is missing');
  return value;
}
const nav = [
  {
    label: 'WORKSPACE',
    items: [
      ['', 'Overview', LayoutDashboard],
      ['sites', 'Sites', MapPin],
      ['employees', 'Workforce', Users],
      ['attendance', 'Attendance', CalendarCheck],
      ['staff-attendance', 'Staff attendance', CalendarCheck],
      ['tasks', 'Tasks & visits', ClipboardCheck],
      ['tickets', 'Complaints', Ticket],
    ],
  },
  {
    label: 'BUSINESS OPERATIONS',
    items: [
      ['viagreen', 'Viagreen', Leaf],
      ['anthrasite', 'Anthrasite', Factory],
      ['clients', 'CRM & clients', Handshake],
      ['vendors', 'Vendors', Truck],
      ['invoices', 'Finance', Wallet],
      ['challans', 'E-challans', FileText],
    ],
  },
  {
    label: 'MANAGEMENT',
    items: [
      ['reports', 'Reports & analytics', FileChartColumn],
      ['documents', 'Documents', FileText],
      ['settings', 'Settings & access', Settings2],
      ['work-calendar', 'Work calendar', CalendarCheck],
      ['lead-generation', 'Lead generation', Sprout],
      ['flowbridge', 'FlowBridge', Handshake],
    ],
  },
] as const;
export function Shell({ children }: { children: React.ReactNode }) {
  const router = useRouter(),
    pathname = usePathname();
  const [identity, setIdentity] = useState<Identity | null>(null),
    [catalog, setCatalog] = useState<Record<string, Resource>>({}),
    [error, setError] = useState(''),
    [businessUnitId, setBusinessUnitId] = useState(''),
    [mobile, setMobile] = useState(false),
    [command, setCommand] = useState(false),
    [search, setSearch] = useState(''),
    [help, setHelp] = useState(false);
  const load = () => {
    setError('');
    Promise.all([api<Identity>('/auth/me'), api<Record<string, Resource>>('/catalog')])
      .then(([me, resources]) => {
        setCatalog(resources);
        setIdentity(me);
      })
      .catch((e) => {
        if (e.status === 401) router.replace('/login');
        else setError(e.message);
      });
  };
  useEffect(load, []);
  useEffect(() => {
    setMobile(false);
  }, [pathname]);
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        setCommand((v) => !v);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);
  if (error) return <ErrorState message={error} retry={load} />;
  if (!identity) return <Loading label="Opening your workspace…" />;
  const allowed = (key: string) =>
    key === '' ||
    (['flowbridge', 'lead-generation'].includes(key) &&
      identity.principal.role === 'Super Admin') ||
    (key === 'work-calendar' && identity.principal.role === 'Super Admin') ||
    (['attendance', 'staff-attendance'].includes(key) &&
      [
        'Super Admin',
        'Operations Manager',
        'Business Manager',
        'Site Supervisor',
        'Accountant',
        'Finance/Admin',
      ].includes(identity.principal.role)) ||
    (key === 'reports' && identity.principal.permissions.includes('reports:read')) ||
    (key === 'settings' && identity.principal.permissions.includes('users:manage')) ||
    (key === 'viagreen' && !!catalog.waste) ||
    (key === 'anthrasite' && !!catalog.production) ||
    !!catalog[key];
  const current = pathname.startsWith('/profiles/')
    ? 'Profile'
    : pathname === '/'
      ? 'Overview'
      : catalog[pathname.slice(1)]?.label ||
        {
          viagreen: 'Viagreen',
          anthrasite: 'Anthrasite',
          reports: 'Reports & analytics',
          settings: 'Settings & access',
          'staff-attendance': 'Staff attendance',
          'work-calendar': 'Work calendar',
          'lead-generation': 'Lead generation',
          flowbridge: 'FlowBridge',
          profiles: 'Profile',
        }[pathname.slice(1)] ||
        'Workspace';
  const commands = [
    { href: '/', label: 'Overview', group: 'Workspace' },
    ...Object.entries(catalog).map(([key, r]) => ({
      href: `/${key}`,
      label: r.label,
      group: r.group,
    })),
  ].filter((c) => c.label.toLowerCase().includes(search.toLowerCase()));
  return (
    <OsContext.Provider value={{ identity, catalog, businessUnitId, setBusinessUnitId }}>
      <div className="app-shell">
        {mobile && (
          <button
            aria-label="Close navigation"
            className="mobile-overlay"
            onClick={() => setMobile(false)}
          />
        )}
        <aside className={`sidebar ${mobile ? 'is-open' : ''}`}>
          <Link href="/" className="brand">
            <span className="brand-symbol">
              <Layers3 size={24} />
            </span>
            <span>
              {BRAND_NAME}
              <small>OPERATIONS OS</small>
            </span>
            <span className="brand-version">v1</span>
          </Link>
          <div className="workspace-picker">
            <span className="workspace-avatar">AN</span>
            <span>
              <strong>{identity.organization.name}</strong>
              <small>Organization workspace</small>
            </span>
            <ShieldCheck size={15} />
          </div>
          <button className="nav-search" onClick={() => setCommand(true)}>
            <Search size={15} />
            <span>Quick search</span>
            <kbd>⌘ K</kbd>
          </button>
          <nav>
            {nav.map((section) => (
              <div className="nav-section" key={section.label}>
                <p>{section.label}</p>
                {section.items
                  .filter(([key]) => allowed(key))
                  .map(([key, label, Icon]) => (
                    <Link
                      className={`nav-item ${pathname === (key ? `/${key}` : '/') ? 'active' : ''}`}
                      href={key ? `/${key}` : '/'}
                      key={key}
                    >
                      <Icon size={18} />
                      <span>{label}</span>
                      {key === 'viagreen' && <i className="unit-dot green" />}
                      {key === 'anthrasite' && <i className="unit-dot amber" />}
                    </Link>
                  ))}
              </div>
            ))}
          </nav>
          <div className="sidebar-bottom">
            <div className="system-status">
              <span />
              <div>
                <strong>Built for a cleaner tomorrow</strong>
                <small>One workspace. Every operation.</small>
              </div>
              <Sprout size={21} />
            </div>
            <button className="help-link" onClick={() => setHelp(true)}>
              <CircleHelp size={17} />
              Help & workspace guide
              <ArrowUpRight size={14} />
            </button>
            <div className="profile">
              <span className="avatar">
                {identity.user.name
                  .split(' ')
                  .slice(0, 2)
                  .map((n) => n[0])
                  .join('')}
              </span>
              <div>
                <strong>
                  <ProfileLink type="users" id={identity.user.id}>
                    {identity.user.name}
                  </ProfileLink>
                </strong>
                <small>{identity.principal.role}</small>
              </div>
              <button
                aria-label="Sign out"
                onClick={async () => {
                  try {
                    await api('/auth/logout', { method: 'POST' });
                    router.replace('/login');
                  } catch (e) {
                    setError((e as Error).message);
                  }
                }}
              >
                <LogOut size={16} />
              </button>
            </div>
          </div>
        </aside>
        <div className="main-shell">
          <header className="topbar">
            <div className="breadcrumbs">
              <button
                className="mobile-menu"
                onClick={() => setMobile(true)}
                aria-label="Open navigation"
              >
                <Menu size={20} />
              </button>
              <PanelLeftClose size={17} className="desktop-icon" />
              <span className="breadcrumb-divider" />
              <span>Workspace</span>
              <span className="slash">/</span>
              <strong>{current}</strong>
            </div>
            <div className="topbar-actions">
              <ThemeToggle />
              <span className="timezone">
                IST <span>·</span> Mumbai
              </span>
              <span className="top-divider" />
              <button onClick={() => setHelp(true)} aria-label="Help">
                <CircleHelp size={18} />
              </button>
              {catalog.notifications && (
                <Link
                  href="/notifications"
                  className="notification-button"
                  aria-label="Notifications"
                >
                  <Bell size={18} />
                </Link>
              )}
              <ProfileLink type="users" id={identity.user.id}>
                <span className="avatar small">{identity.user.name[0]}</span>
              </ProfileLink>
            </div>
          </header>
          <main>{children}</main>
          <footer>
            <span>
              © {new Date().getFullYear()} {identity.organization.name}
            </span>
            <span>
              <i /> Shared operations workspace <span className="footer-dot">·</span> Asia/Kolkata
            </span>
          </footer>
        </div>
        <Dialog open={command} onOpenChange={setCommand}>
          <DialogContent>
            <DialogTitle className="dialog-title">Go to workspace</DialogTitle>
            <DialogDescription className="dialog-description">
              Search modules across your permitted operations.
            </DialogDescription>
            <div className="search-input command-input">
              <Search size={18} />
              <input
                autoFocus
                placeholder="Search sites, workforce, finance…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <div className="command-results">
              {commands.map((c) => (
                <Link
                  onClick={() => {
                    setCommand(false);
                    setSearch('');
                  }}
                  href={c.href}
                  key={c.href}
                >
                  <span>{c.label}</span>
                  <small>{c.group}</small>
                  <ArrowUpRight size={15} />
                </Link>
              ))}
              {!commands.length && <p>No matching modules.</p>}
            </div>
          </DialogContent>
        </Dialog>
        <Dialog open={help} onOpenChange={setHelp}>
          <DialogContent>
            <DialogTitle className="dialog-title">Your operations, connected.</DialogTitle>
            <DialogDescription className="dialog-description">
              A quick guide to the Useless workspace.
            </DialogDescription>
            <div className="guide">
              <p>
                <strong>1. Build your organization</strong>
                <br />
                Add business units, departments, clients, and sites. Link each site to its client
                and business unit.
              </p>
              <p>
                <strong>2. Assign your workforce</strong>
                <br />
                Create employees and shifts, then add dated site assignments. Attendance and
                operations validate these assignments.
              </p>
              <p>
                <strong>3. Run daily operations</strong>
                <br />
                Record collections in Viagreen or production batches in Anthrasite. Progress tasks,
                record visits, and resolve tickets.
              </p>
              <p>
                <strong>4. Close the loop</strong>
                <br />
                Review invoices, payments, reports, expiring documents, and the audit trail. Use
                Ctrl/⌘ K to navigate quickly.
              </p>
              <div className="notice">
                Your role: {identity.principal.role}. Access is enforced by the API within your
                organization and assigned business scope.
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </OsContext.Provider>
  );
}
