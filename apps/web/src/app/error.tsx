'use client';
import { ErrorState } from '@/components/ui/states';
export default function ErrorPage({ reset }: { reset: () => void }) {
  return <ErrorState message="An unexpected error occurred. Please try again." retry={reset} />;
}
