'use client';
import { useState } from 'react';
import {
  ArrowDownToLine,
  FileBarChart,
  FileSpreadsheet,
  FileText,
  ShieldCheck,
} from 'lucide-react';
import { useOs } from './shell';
import { Button } from './ui/button';
export function Reports() {
  const { catalog, businessUnitId, identity } = useOs();
  const [module, setModule] = useState(
      Object.keys(catalog).find((k) => k === 'waste') || Object.keys(catalog)[0],
    ),
    [from, setFrom] = useState(''),
    [to, setTo] = useState(''),
    [format, setFormat] = useState('csv'),
    [status, setStatus] = useState(''),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [done, setDone] = useState('');
  const statuses =
    catalog[module]?.statusFilters ||
    catalog[module]?.fields.find((field) => field.key === 'status')?.options;
  function setPeriod(period: string) {
    const today = new Date(Date.now() + 330 * 60000).toISOString().slice(0, 10);
    const start = new Date(`${today}T00:00:00Z`);
    if (period === 'week') start.setUTCDate(start.getUTCDate() - 6);
    if (period === 'month') start.setUTCDate(1);
    setFrom(period === 'all' ? '' : start.toISOString().slice(0, 10));
    setTo(period === 'all' ? '' : today);
    setDone('');
  }
  async function exportFile() {
    setBusy(true);
    setError('');
    setDone('');
    try {
      if (from && to && from > to) throw new Error('From date must be on or before To date.');
      const q = new URLSearchParams({
        ...(businessUnitId ? { businessUnitId } : {}),
        ...(status ? { status } : {}),
        ...(from ? { from: new Date(`${from}T00:00:00+05:30`).toISOString() } : {}),
        ...(to ? { to: new Date(`${to}T23:59:59.999+05:30`).toISOString() } : {}),
      });
      const response = await fetch(`/api/reports/${module}/${format}?${q}`, {
        credentials: 'include',
      });
      if (!response.ok) throw new Error((await response.json()).error || 'Report failed');
      const url = URL.createObjectURL(await response.blob());
      const a = document.createElement('a');
      a.href = url;
      a.download = `useless-${module}-${new Date().toISOString().slice(0, 10)}.${format}`;
      a.click();
      URL.revokeObjectURL(url);
      setDone('Your report has been downloaded.');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="page">
      <div className="page-heading">
        <div>
          <div className="eyebrow">MANAGEMENT / REPORTING</div>
          <h1>Reports & analytics</h1>
          <p>Turn your operational records into clear, portable reports.</p>
        </div>
      </div>
      <div className="report-layout">
        <section className="panel report-builder">
          <div className="panel-heading">
            <div>
              <h2>Build a report</h2>
              <p>Exports use the same access controls as your workspace.</p>
            </div>
            <FileBarChart size={21} />
          </div>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void exportFile();
            }}
          >
            <label>
              Report dataset
              <select
                value={module}
                onChange={(e) => {
                  setModule(e.target.value);
                  setStatus('');
                  setDone('');
                }}
              >
                {Object.entries(catalog).map(([k, r]) => (
                  <option key={k} value={k}>
                    {r.group} · {r.label}
                  </option>
                ))}
              </select>
            </label>
            <p className="notice">
              Business unit:{' '}
              {identity.businessUnits.find((unit) => unit.id === businessUnitId)?.name ||
                'All permitted business units'}
              . Dates use India Standard Time (IST).
            </p>
            <div className="report-periods" role="group" aria-label="Quick date ranges">
              {[
                ['today', 'Today'],
                ['week', 'Last 7 days'],
                ['month', 'This month'],
                ['all', 'All dates'],
              ].map(([value, label]) => (
                <Button
                  key={value}
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setPeriod(value)}
                >
                  {label}
                </Button>
              ))}
            </div>
            <div className="form-grid">
              <label>
                From date
                <input
                  type="date"
                  value={from}
                  max={to || undefined}
                  onChange={(e) => setFrom(e.target.value)}
                />
              </label>
              <label>
                To date
                <input type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} />
              </label>
            </div>
            {statuses && (
              <label>
                Record status
                <select value={status} onChange={(e) => setStatus(e.target.value)}>
                  <option value="">All statuses</option>
                  {statuses.map((value) => (
                    <option key={value} value={value}>
                      {value.replaceAll('_', ' ')}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <label>Export format</label>
            <div className="format-options">
              {[
                ['csv', 'CSV', FileSpreadsheet],
                ['xlsx', 'Excel', FileBarChart],
                ['pdf', 'PDF', FileText],
              ].map(([key, label, Icon]) => {
                const I = Icon as typeof FileText;
                return (
                  <button
                    type="button"
                    key={String(key)}
                    className={format === key ? 'selected' : ''}
                    aria-pressed={format === key}
                    onClick={() => setFormat(String(key))}
                  >
                    <I size={24} />
                    <strong>{String(label)}</strong>
                    <small>
                      {key === 'csv'
                        ? 'Data & integrations'
                        : key === 'xlsx'
                          ? 'Spreadsheet analysis'
                          : 'Shareable document'}
                    </small>
                  </button>
                );
              })}
            </div>
            <div className="notice">
              <ShieldCheck size={17} /> Reports include up to 10,000 records. Narrow the date range
              for larger datasets.
            </div>
            {error && (
              <div role="alert" className="form-error">
                {error}
              </div>
            )}
            {done && (
              <div role="status" className="success-message">
                {done}
              </div>
            )}
            <Button disabled={busy}>
              <ArrowDownToLine />
              {busy ? 'Preparing report…' : 'Download report'}
            </Button>
          </form>
        </section>
        <aside className="report-guide">
          <span className="eyebrow">A SINGLE SOURCE OF TRUTH</span>
          <h2>
            From fieldwork
            <br />
            to informed decisions.
          </h2>
          <p>
            Export waste, attendance, site visits, production, invoices, and other records from the
            same shared database.
          </p>
          <ul>
            <li>Organization and assignment scope enforced</li>
            <li>Dates applied to the dataset’s operational date</li>
            <li>CSV cells protected from formula injection</li>
            <li>Machine history ready for future telemetry</li>
          </ul>
          <div className="report-guide-bottom">
            Operational analytics first.
            <br />
            AI-ready data, by design.
          </div>
        </aside>
      </div>
    </div>
  );
}
