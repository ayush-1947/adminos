'use client';
import { useSyncExternalStore } from 'react';
import { isApiRecovering, subscribeApiRecovery } from '@/lib/api';
import { AlertCircle, Inbox, Loader2 } from 'lucide-react';
import { Button } from './button';
export function Loading({ label = 'Loading operational data…' }: { label?: string }) {
  const reconnecting = useSyncExternalStore(subscribeApiRecovery, isApiRecovering, () => false);
  return (
    <div className="state" role="status">
      <Loader2 className="animate-spin text-emerald-700" size={24} />
      <p>
        {reconnecting
          ? 'Connecting to the server… This can take about a minute after inactivity.'
          : label}
      </p>
    </div>
  );
}
export function Empty({
  title = 'No records yet',
  message = 'Add your first record to get started.',
}: {
  title?: string;
  message?: string;
}) {
  return (
    <div className="state">
      <span className="state-icon">
        <Inbox size={24} />
      </span>
      <h3>{title}</h3>
      <p>{message}</p>
    </div>
  );
}
export function ErrorState({ message, retry }: { message: string; retry?: () => void }) {
  return (
    <div className="state" role="alert">
      <AlertCircle className="text-amber-600" />
      <h3>We couldn’t load this view</h3>
      <p>{message}</p>
      {retry && (
        <Button variant="outline" onClick={retry}>
          Try again
        </Button>
      )}
    </div>
  );
}
