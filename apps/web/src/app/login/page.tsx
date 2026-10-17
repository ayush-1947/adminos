'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowRight, Factory, Layers3, Leaf, ShieldCheck, Loader2 } from 'lucide-react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { ThemeToggle } from '@/components/theme-toggle';
import { COMPANY_NAME, BRAND_NAME } from '@/lib/branding';
export default function Login() {
  const router = useRouter();
  const [email, setEmail] = useState(''),
    [password, setPassword] = useState(''),
    [error, setError] = useState(''),
    [loading, setLoading] = useState(false);
  return (
    <div className="login">
      <section className="login-story">
        <div className="login-brand">
          <Layers3 size={32} /> {BRAND_NAME}
        </div>
        <div className="login-heading">
          <span className="eyebrow">AN USEDLESS OPERATIONS OS</span>
          <h1>
            Purpose in every
            <br />
            operation.
          </h1>
          <p>
            People, places, and processes.
            <br />
            Connected for a cleaner tomorrow.
          </p>
          <div className="login-units">
            <span>
              <Leaf size={20} /> viagreen
            </span>
            <span>
              <Factory size={20} /> anthrasite
            </span>
          </div>
        </div>
        <div className="login-foot">
          {COMPANY_NAME} <span>MUMBAI, INDIA ↗</span>
        </div>
      </section>
      <section className="login-form-wrap">
        <div className="login-mobile-brand">
          <Layers3 size={28} aria-hidden="true" />
          <div>
            <strong>{BRAND_NAME}</strong>
            <span>OPERATIONS OS</span>
          </div>
        </div>
        <div className="login-theme">
          <ThemeToggle />
        </div>
        <div className="login-form">
          <span className="login-icon">
            <ShieldCheck size={25} />
          </span>
          <h2>Welcome to your workspace</h2>
          <p>Sign in to manage your operations.</p>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setLoading(true);
              setError('');
              try {
                // Wait for the API to become reachable before submitting credentials once.
                await api('/health');
                await api('/auth/login', {
                  method: 'POST',
                  body: JSON.stringify({ email, password }),
                });
                router.replace('/');
              } catch (e) {
                setError((e as Error).message);
              } finally {
                setLoading(false);
              }
            }}
          >
            <label>
              Work email
              <input
                type="email"
                autoComplete="username"
                required
                placeholder="you@company.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </label>
            <label>
              Password
              <input
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter your password"
                maxLength={128}
              />
            </label>
            {error && (
              <div className="form-error" role="alert">
                {error}
              </div>
            )}
            <Button disabled={loading} className="w-full">
              {loading ? (
                <Loader2 className="animate-spin" />
              ) : (
                <>
                  Sign in to workspace
                  <ArrowRight size={17} />
                </>
              )}
            </Button>
          </form>
          <div className="login-security">
            <ShieldCheck size={14} /> Secure, role-based access
          </div>
          <p className="login-note">Need access? Contact your organization administrator.</p>
        </div>
        <small className="login-copyright">
          © {new Date().getFullYear()} {COMPANY_NAME}. All rights reserved.
        </small>
      </section>
    </div>
  );
}
