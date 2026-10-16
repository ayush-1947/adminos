'use client';
import { Suspense } from 'react';
import { useOs } from './shell';
import { Dashboard } from './dashboard';
import { Records } from './records';
import { Reports } from './reports';
import { Settings } from './settings';
import { Empty, Loading } from './ui/states';
export function ModulePage({ moduleKey }: { moduleKey: string }) {
  const { catalog, identity } = useOs();
  if (moduleKey === 'viagreen' && catalog.waste) return <Dashboard vertical="viagreen" />;
  if (moduleKey === 'anthrasite' && catalog.production) return <Dashboard vertical="anthrasite" />;
  if (moduleKey === 'reports' && identity.principal.permissions.includes('reports:read'))
    return <Reports />;
  if (moduleKey === 'settings' && identity.principal.permissions.includes('users:manage'))
    return <Settings />;
  if (!catalog[moduleKey])
    return (
      <Empty
        title="Module unavailable"
        message="This module does not exist or is outside your permissions."
      />
    );
  return (
    <Suspense fallback={<Loading />}>
      <Records key={moduleKey} moduleKey={moduleKey} />
    </Suspense>
  );
}
