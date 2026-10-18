'use client';
import { StaffAttendance } from './staff-attendance';
import { OrgChart } from './org-chart';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { api, type Row } from '@/lib/api';
import { useOs } from './shell';
import { Dashboard } from './dashboard';
import { ProfileLink } from './profile';
import { Loading, ErrorState, Empty } from './ui/states';
export function WorkspaceHome() {
  const { identity } = useOs();
  if (
    identity.principal.role === 'Site Supervisor' &&
    identity.principal.permissions.includes('attendance:read')
  )
    return <StaffAttendance />;
  return identity.principal.role === 'Customer' ? (
    <CustomerHome />
  ) : (
    <>
      {identity.principal.role === 'Super Admin' && (
        <div className="page staff-actions">
          <Link className="button" href="/lead-generation">
            Lead generation
          </Link>
          <Link className="button secondary" href="/flowbridge">
            FlowBridge
          </Link>
        </div>
      )}
      <Dashboard />
    </>
  );
}
function CustomerHome() {
  const [sites, setSites] = useState<Row[] | null>(null);
  const [error, setError] = useState('');
  const load = () => {
    setError('');
    api<Row[]>('/customer/team')
      .then(setSites)
      .catch((e) => setError(e.message));
  };
  useEffect(load, []);
  if (error) return <ErrorState message={error} retry={load} />;
  if (!sites) return <Loading />;
  return (
    <div className="page">
      <div className="page-heading">
        <div>
          <div className="eyebrow">CUSTOMER WORKSPACE</div>
          <h1>Your sites & team</h1>
          <p>Meet the people looking after your sites and track service requests.</p>
        </div>
        <Link className="button" href="/tickets">
          Raise a ticket or complaint
        </Link>
      </div>
      {!sites.length && (
        <Empty
          title="No sites assigned"
          message="Your sites and team will appear here when your account is linked."
        />
      )}
      <OrgChart />
      <div className="business-grid">
        {sites.map((site) => (
          <section className="panel" key={site.id}>
            <div className="panel-heading">
              <div>
                <h2>{site.name}</h2>
                <p>{site.address}</p>
              </div>
            </div>
            <div className="settings-body">
              <p>
                <strong>Manager:</strong>{' '}
                {site.manager ? (
                  <ProfileLink type="employees" id={site.manager.id}>
                    {site.manager.name}
                  </ProfileLink>
                ) : (
                  'Not assigned'
                )}
              </p>
              <p>
                <strong>Supervisor:</strong>{' '}
                {site.supervisor ? (
                  <ProfileLink type="employees" id={site.supervisor.id}>
                    {site.supervisor.name}
                  </ProfileLink>
                ) : (
                  'Not assigned'
                )}
              </p>
              <h3>Workers</h3>
              {site.workers.length ? (
                <ul>
                  {site.workers.map((worker: Row) => (
                    <li key={worker.id}>
                      <ProfileLink type="employees" id={worker.id}>
                        {worker.name}
                      </ProfileLink>
                    </li>
                  ))}
                </ul>
              ) : (
                <p>No active workers assigned.</p>
              )}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
