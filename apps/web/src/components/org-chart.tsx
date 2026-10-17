'use client';
import { useEffect, useState } from 'react';
import {
  Building2,
  ChevronDown,
  ChevronRight,
  GitBranch,
  ListTree,
  Maximize2,
  Minimize2,
  Users,
} from 'lucide-react';
import { api, title } from '@/lib/api';
import { useOs } from './shell';
import { ErrorState, Loading } from './ui/states';
import { OrgChartViewport } from './org-chart-viewport';

type Person = {
  id: string;
  name: string;
  position: string;
  managerId: string | null;
  supervisorId: string | null;
};
type Contact = { id: string; name: string; phone: string | null; email: string | null };
type Site = {
  id: string;
  name: string;
  address: string;
  managerId: string | null;
  supervisorId: string | null;
  client: (Contact & { contactPerson: string | null; contacts: Contact[] }) | null;
  assignments: { employeeId: string; supervisorId: string | null }[];
};
type Chart = { people: Person[]; sites: Site[]; collapseManagers: boolean };

export function OrgChart({
  employeeId,
  clientId,
  refresh = 0,
}: {
  employeeId?: string;
  clientId?: string;
  refresh?: number;
}) {
  const { identity } = useOs();
  const [data, setData] = useState<Chart | null>(null);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [view, setView] = useState<'tree' | 'outline'>('tree');
  const allowed = identity.principal.permissions.includes('employees:read');
  useEffect(() => {
    if (!allowed) return;
    let active = true;
    setError('');
    api<Chart>('/org-chart')
      .then((value) => {
        if (active) setData(value);
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [allowed, retry, refresh]);
  if (!allowed) return null;
  if (error) return <ErrorState message={error} retry={() => setRetry((v) => v + 1)} />;
  if (!data) return <Loading label="Loading organization chart…" />;
  const people = new Map(data.people.map((p) => [p.id, p]));
  const parent = (p: Person) => {
    if (p.supervisorId || p.managerId) return p.supervisorId || p.managerId;
    const siteParents = data.sites
      .flatMap((s) => {
        if (s.supervisorId === p.id) return [s.managerId];
        return s.assignments
          .filter((a) => a.employeeId === p.id)
          .map((a) => a.supervisorId || s.supervisorId || s.managerId);
      })
      .filter((id): id is string => !!id && id !== p.id);
    return new Set(siteParents).size === 1 ? siteParents[0] : null;
  };
  const descendants = new Set<string>();
  if (employeeId) {
    descendants.add(employeeId);
    let changed = true;
    while (changed) {
      changed = false;
      data.people.forEach((p) => {
        if (parent(p) && descendants.has(parent(p)!) && !descendants.has(p.id)) {
          descendants.add(p.id);
          changed = true;
        }
      });
    }
  }
  const sites = data.sites.filter(
    (s) =>
      (!clientId || s.client?.id === clientId) &&
      (!employeeId ||
        descendants.has(s.managerId || '') ||
        descendants.has(s.supervisorId || '') ||
        s.assignments.some((a) => descendants.has(a.employeeId))),
  );
  const included = new Set(employeeId ? descendants : clientId ? [] : data.people.map((p) => p.id));
  sites.forEach((s) =>
    [
      s.managerId,
      s.supervisorId,
      ...s.assignments.flatMap((a) => [a.employeeId, a.supervisorId]),
    ].forEach((id) => {
      if (id) included.add(id);
    }),
  );
  for (const id of included) {
    let person = people.get(id);
    const seen = new Set<string>();
    while (person && !seen.has(person.id)) {
      seen.add(person.id);
      included.add(person.id);
      person = people.get(parent(person) || '');
    }
  }
  const card = (p: Person) => (
    <>
      <span className="org-avatar">
        {p.name
          .split(' ')
          .slice(0, 2)
          .map((n) => n[0])
          .join('')}
      </span>
      <span className="org-person-label">
        <strong>{p.name}</strong>
        <small>{title(p.position)}</small>
      </span>
    </>
  );
  const worker = (id: string) => {
    const p = people.get(id);
    return p ? (
      <li key={id}>
        <div className={`org-person ${id === employeeId ? 'org-selected' : ''}`}>{card(p)}</div>
      </li>
    ) : null;
  };
  function siteNode(s: Site) {
    const supervisors = [
      ...new Set(
        [s.supervisorId, ...s.assignments.map((a) => a.supervisorId)].filter(
          (id): id is string => !!id && people.has(id),
        ),
      ),
    ];
    return (
      <li key={s.id}>
        <article className="org-site">
          <span className="org-site-label">
            <Building2 size={15} /> SITE
          </span>
          <strong>{s.name}</strong>
          <small>{s.address}</small>
          <div className="org-contact">
            <strong>Customer: {s.client?.name || 'Not assigned'}</strong>
            {s.client && (
              <>
                <small>{s.client.contactPerson || 'Customer contact not provided'}</small>
                <small>{[s.client.phone, s.client.email].filter(Boolean).join(' · ')}</small>
                {s.client.contacts.map((c) => (
                  <div key={c.id}>
                    <small>{c.name}</small>
                    <small>{[c.phone, c.email].filter(Boolean).join(' · ')}</small>
                  </div>
                ))}
              </>
            )}
          </div>
        </article>
        <ul>
          {supervisors.map((id) => (
            <li key={id}>
              <div className="org-person">{card(people.get(id)!)}</div>
              <small>Site supervisor</small>
              <ul>
                {[
                  ...new Set(
                    s.assignments
                      .filter(
                        (a) => (a.supervisorId || s.supervisorId) === id && a.employeeId !== id,
                      )
                      .map((a) => a.employeeId),
                  ),
                ].map(worker)}
              </ul>
            </li>
          ))}
          {s.assignments.some((a) => !(a.supervisorId || s.supervisorId)) && (
            <li>
              <div className="org-unassigned">Supervisor not assigned</div>
              <ul>
                {[
                  ...new Set(
                    s.assignments
                      .filter((a) => !(a.supervisorId || s.supervisorId))
                      .map((a) => a.employeeId),
                  ),
                ].map(worker)}
              </ul>
            </li>
          )}
          {!supervisors.length && !s.assignments.length && (
            <li className="org-unassigned">No supervisor or workers assigned</li>
          )}
        </ul>
      </li>
    );
  }
  function branch(p: Person, path = new Set<string>()): React.ReactNode {
    if (path.has(p.id))
      return (
        <li key={p.id} className="org-unassigned">
          Reporting cycle detected: {p.name}
        </li>
      );
    const next = new Set(path).add(p.id);
    const owned = sites.filter((s) => s.managerId === p.id);
    const children = data!.people.filter(
      (c) =>
        included.has(c.id) &&
        parent(c) === p.id &&
        (!owned.some(
          (s) =>
            s.supervisorId === c.id ||
            s.assignments.some((a) => a.employeeId === c.id || a.supervisorId === c.id),
        ) ||
          sites.some((s) => s.managerId === c.id)),
    );
    const manager = owned.length > 0 || /manager/i.test(p.position);
    const open = expanded[p.id] ?? (!data!.collapseManagers || !manager || !!employeeId);
    const expandable = !!(owned.length || children.length);
    const assigned = sites.filter(
      (s) =>
        s.managerId === p.id ||
        s.supervisorId === p.id ||
        s.assignments.some((a) => a.employeeId === p.id),
    );
    return (
      <li key={p.id}>
        <button
          type="button"
          className={`org-person ${p.id === employeeId ? 'org-selected' : ''}`}
          aria-expanded={expandable ? open : undefined}
          onClick={() => setExpanded((v) => ({ ...v, [p.id]: !open }))}
        >
          {card(p)}
          {expandable && (
            <span className="org-expand">
              {open ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
            </span>
          )}
        </button>
        <small>{assigned.map((s) => s.name).join(' · ') || 'No assigned sites'}</small>
        {!parent(p) && !/ceo|chief executive/i.test(p.position) && (
          <small>Reporting line not assigned</small>
        )}
        {expandable && open && (
          <ul>
            {children.map((c) => branch(c, next))}
            {owned.map(siteNode)}
          </ul>
        )}
      </li>
    );
  }
  const roots = data.people.filter((p) => included.has(p.id) && !included.has(parent(p) || ''));
  const trees = roots.map((p) => branch(p));
  // Include disconnected cyclic components without recursively following them forever.
  const reachable = new Set<string>();
  function visit(id: string) {
    if (reachable.has(id)) return;
    reachable.add(id);
    data!.people.filter((p) => parent(p) === id).forEach((p) => visit(p.id));
  }
  roots.forEach((p) => visit(p.id));
  data.people
    .filter((p) => included.has(p.id) && !reachable.has(p.id))
    .forEach((p) => {
      if (!reachable.has(p.id)) {
        visit(p.id);
        trees.push(branch(p));
      }
    });
  return (
    <section className="org-chart-section" aria-label="Organization chart">
      <div className="org-heading">
        <div>
          <span className="org-eyebrow">
            <GitBranch size={15} /> PEOPLE & CONNECTIONS
          </span>
          <h2>Organization chart</h2>
          <p className="muted">
            Explore reporting lines, customer sites and the teams behind them.
          </p>
        </div>
        <div className="org-stats" aria-label="Chart summary">
          <span>
            <Users size={16} />
            <strong>{included.size}</strong> people
          </span>
          <span>
            <Building2 size={16} />
            <strong>{sites.length}</strong> sites
          </span>
        </div>
      </div>
      <div className="org-toolbar">
        <div className="org-view-switch" aria-label="Chart layout">
          <button type="button" aria-pressed={view === 'tree'} onClick={() => setView('tree')}>
            <GitBranch size={16} /> Chart
          </button>
          <button
            type="button"
            aria-pressed={view === 'outline'}
            onClick={() => setView('outline')}
          >
            <ListTree size={16} /> Outline
          </button>
        </div>
        <div className="org-bulk-actions">
          <button
            type="button"
            onClick={() => setExpanded(Object.fromEntries(data.people.map((p) => [p.id, true])))}
          >
            <Maximize2 size={15} /> Expand all
          </button>
          <button
            type="button"
            onClick={() => setExpanded(Object.fromEntries(data.people.map((p) => [p.id, false])))}
          >
            <Minimize2 size={15} /> Collapse all
          </button>
        </div>
      </div>
      {!included.size && !sites.length ? (
        <p>No workforce relationships available.</p>
      ) : (
        <OrgChartViewport outline={view === 'outline'}>
          <ul className="org-tree">
            {trees}
            {sites.filter((s) => !s.managerId || !people.has(s.managerId)).map(siteNode)}
          </ul>
        </OrgChartViewport>
      )}
      <div className="org-footer">
        <span>
          <i /> People <i className="org-site-dot" /> Customer sites
        </span>
        <span>Select a person to show or hide their team · Ctrl + scroll to zoom · Use Outline for a compact view</span>
      </div>
    </section>
  );
}
