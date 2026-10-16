'use client';
import { OrgChart } from './org-chart';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  Cell,
  Pie,
  PieChart,
} from 'recharts';
import {
  Activity,
  ArrowDownToLine,
  ArrowRight,
  ArrowUpRight,
  CalendarDays,
  Check,
  ChevronDown,
  CircleAlert,
  Factory,
  Leaf,
  MapPin,
  MoreHorizontal,
  Plus,
  Recycle,
  RefreshCw,
  Users,
  Wallet,
  Zap,
} from 'lucide-react';
import { api, currency, number, type Row } from '@/lib/api';
import { useOs } from './shell';
import { Button } from './ui/button';
import { Empty, ErrorState, Loading } from './ui/states';
import { RecordDialog } from './records';
import { ProfileLink } from './profile';
type DashboardData = {
  metrics: Record<string, number>;
  trend: Row[];
  sitePerformance: Row[];
  clientPerformance: Row[];
  uptime: Row[];
  categories: Row[];
  alerts: Row[];
  recentTickets: Row[];
};
const colors = ['#187657', '#a2c39c', '#e5bd62', '#82a8ad', '#c6d3ce', '#f0dbc1', '#9aabbc'];
export function Dashboard({ vertical }: { vertical?: 'viagreen' | 'anthrasite' }) {
  const { identity, businessUnitId, setBusinessUnitId, catalog } = useOs();
  const [period, setPeriod] = useState('month'),
    [customFrom, setCustomFrom] = useState(''),
    [customTo, setCustomTo] = useState(''),
    [data, setData] = useState<DashboardData | null>(null),
    [error, setError] = useState(''),
    [refresh, setRefresh] = useState(0),
    [loading, setLoading] = useState(true),
    [create, setCreate] = useState(false),
    [chart, setChart] = useState<'waste' | 'coal' | 'present'>('waste');
  const verticalUnit = identity.businessUnits.find((u) => u.code === vertical?.toUpperCase());
  const selected = verticalUnit?.id || businessUnitId;
  const now = new Date(),
    today = new Date(now.getTime() + 330 * 60000).toISOString().slice(0, 10);
  let start = new Date(`${today}T00:00:00+05:30`);
  if (period === 'week') start = new Date(start.getTime() - 6 * 86400000);
  if (period === 'month') start = new Date(`${today.slice(0, 7)}-01T00:00:00+05:30`);
  const from =
    period === 'custom' && customFrom
      ? new Date(`${customFrom}T00:00:00+05:30`).toISOString()
      : start.toISOString();
  const to =
    period === 'custom' && customTo
      ? new Date(`${customTo}T23:59:59.999+05:30`).toISOString()
      : new Date(`${today}T23:59:59.999+05:30`).toISOString();
  const query = new URLSearchParams({
    from,
    to,
    ...(selected ? { businessUnitId: selected } : {}),
  }).toString();
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    api<DashboardData>(`/dashboard?${query}`)
      .then((result) => {
        if (active) setData(result);
      })
      .catch((e) => {
        if (active) setError(e.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [query, refresh]);
  const m = data?.metrics;
  const recordKey = vertical === 'anthrasite' ? 'production' : 'waste';
  return (
    <div className="page dashboard-page">
      <div className="page-heading">
        <div>
          <div className="eyebrow">
            <span className="tiny-square" />
            {vertical ? 'BUSINESS UNIT WORKSPACE' : 'YOUR OPERATIONS, AT A GLANCE'}
          </div>
          <h1>
            {vertical === 'viagreen'
              ? 'Viagreen operations'
              : vertical === 'anthrasite'
                ? 'Anthrasite operations'
                : 'Operations overview'}
            <span className="live-pill">
              <span /> Live workspace
            </span>
          </h1>
          <p>
            {vertical === 'anthrasite'
              ? 'From wet waste to eco-coal. Track every machine and every batch.'
              : vertical === 'viagreen'
                ? 'Collection to disposal. A connected view of your waste operations.'
                : 'A clear view of your people, sites, and impact. All in one place.'}
          </p>
        </div>
        <div className="heading-actions">
          {identity.principal.permissions.includes('reports:read') && (
            <Button asChild variant="outline">
              <Link href="/reports">
                <ArrowDownToLine />
                Export report
              </Link>
            </Button>
          )}
          {catalog[recordKey]?.canWrite && (
            <Button onClick={() => setCreate(true)}>
              <Plus />
              Log {recordKey === 'production' ? 'production' : 'waste'}
            </Button>
          )}
        </div>
      </div>
      <div className="dashboard-toolbar">
        <div className="unit-tabs">
          {!vertical ? (
            <>
              <button
                className={!businessUnitId ? 'selected' : ''}
                onClick={() => setBusinessUnitId('')}
              >
                All business units
              </button>
              {identity.businessUnits.map((u) => (
                <button
                  key={u.id}
                  className={businessUnitId === u.id ? 'selected' : ''}
                  onClick={() => setBusinessUnitId(u.id)}
                >
                  {u.code === 'VIAGREEN' ? <Leaf size={14} /> : <Factory size={14} />} {u.name}
                </button>
              ))}
            </>
          ) : (
            <>
              <Link href={vertical === 'viagreen' ? '/waste' : '/production'}>
                {' '}
                {vertical === 'viagreen' ? 'Waste records' : 'Production batches'}{' '}
                <ArrowUpRight size={13} />
              </Link>
              <Link href={vertical === 'viagreen' ? '/disposals' : '/machines'}>
                {vertical === 'viagreen' ? 'Disposals' : 'Machines'} <ArrowUpRight size={13} />
              </Link>
              <Link href={vertical === 'viagreen' ? '/vendors' : '/maintenance'}>
                {vertical === 'viagreen' ? 'Vendors' : 'Maintenance'} <ArrowUpRight size={13} />
              </Link>
            </>
          )}
        </div>
        <div className="range-control">
          <CalendarDays size={15} />
          <select
            aria-label="Dashboard date range"
            value={period}
            onChange={(e) => setPeriod(e.target.value)}
          >
            <option value="today">Today</option>
            <option value="week">Last 7 days</option>
            <option value="month">This month</option>
            <option value="custom">Custom range</option>
          </select>
          <button aria-label="Refresh dashboard" onClick={() => setRefresh((v) => v + 1)}>
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>
      <OrgChart refresh={refresh} />
      {period === 'custom' && (
        <div className="custom-range">
          <label>
            From
            <input type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} />
          </label>
          <label>
            To
            <input
              type="date"
              min={customFrom}
              value={customTo}
              onChange={(e) => setCustomTo(e.target.value)}
            />
          </label>
          <span>Maximum range: 366 days</span>
        </div>
      )}
      {error ? (
        <ErrorState message={error} retry={() => setRefresh((v) => v + 1)} />
      ) : !data || !m ? (
        <Loading />
      ) : (
        <div className={loading ? 'dashboard-content refreshing' : 'dashboard-content'}>
          <div className="metric-grid">
            {catalog.sites && (
              <Metric
                title="Active sites"
                value={number(m.activeSites)}
                icon={<MapPin size={18} />}
                foot={`${m.clients} active clients`}
                link="/sites"
                label="Across your operations"
              />
            )}
            {catalog.employees && (
              <Metric
                title="Total workforce"
                value={number(m.employees)}
                icon={<Users size={18} />}
                foot={`${m.activeWorkers} currently checked in`}
                link="/employees"
                label={`${m.managers} managers · ${m.supervisors} supervisors`}
              />
            )}
            {catalog.waste && (
              <Metric
                title="Waste collected"
                value={number(m.wasteKg / 1000)}
                suffix="tonnes"
                icon={<Recycle size={18} />}
                foot="Collected in selected period"
                link="/waste"
                label="Every kilogram accounted for"
              />
            )}
            {catalog.attendance && (
              <Metric
                title="Workforce attendance"
                value={number(m.attendancePercent)}
                suffix="%"
                icon={<Activity size={18} />}
                foot={`${m.present} of ${m.present + m.absent} scheduled site-days`}
                link="/attendance"
                label={`${m.late} late arrivals · ${m.earlyCheckout} early exits`}
              />
            )}
          </div>
          <div className="chart-grid">
            <section className="panel waste-chart">
              <div className="panel-heading">
                <div>
                  <h2>
                    {chart === 'waste'
                      ? 'Waste collection trend'
                      : chart === 'coal'
                        ? 'Eco-coal production'
                        : 'Workforce attendance'}
                  </h2>
                  <p>Daily operational activity over the selected period</p>
                </div>
                <div className="chart-switch">
                  {catalog.waste && (
                    <button
                      className={chart === 'waste' ? 'selected' : ''}
                      onClick={() => setChart('waste')}
                    >
                      Waste
                    </button>
                  )}
                  {catalog.production && (
                    <button
                      className={chart === 'coal' ? 'selected' : ''}
                      onClick={() => setChart('coal')}
                    >
                      Eco-coal
                    </button>
                  )}
                  {catalog.attendance && (
                    <button
                      className={chart === 'present' ? 'selected' : ''}
                      onClick={() => setChart('present')}
                    >
                      People
                    </button>
                  )}
                </div>
              </div>
              <div className="chart-summary">
                <strong>
                  {number(
                    chart === 'waste' ? m.wasteKg : chart === 'coal' ? m.ecoCoalKg : m.present,
                  )}
                  <small>{chart === 'present' ? ' check-ins' : ' kg'}</small>
                </strong>
                <span>
                  <i className="legend-dot" />
                  {chart === 'waste'
                    ? 'Waste collected'
                    : chart === 'coal'
                      ? 'Eco-coal produced'
                      : 'Attendance recorded'}
                </span>
              </div>
              <div className="chart-container">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart
                    data={data.trend}
                    margin={{ left: -18, right: 12, top: 10, bottom: 0 }}
                  >
                    <defs>
                      <linearGradient id="collectionFill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#4d9677" stopOpacity={0.22} />
                        <stop offset="95%" stopColor="#4d9677" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 4" vertical={false} stroke="#e9edeb" />
                    <XAxis
                      dataKey="date"
                      axisLine={false}
                      tickLine={false}
                      minTickGap={35}
                      tick={{ fontSize: 10, fill: '#87938b' }}
                      tickFormatter={(v) =>
                        new Date(v).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })
                      }
                    />
                    <YAxis
                      axisLine={false}
                      tickLine={false}
                      tick={{ fontSize: 10, fill: '#87938b' }}
                      tickFormatter={(v) => (v >= 1000 ? `${v / 1000}k` : v)}
                    />
                    <Tooltip
                      contentStyle={{ border: '1px solid #e3e9e5', borderRadius: 10, fontSize: 12 }}
                    />
                    <Area
                      type="monotone"
                      dataKey={chart}
                      stroke="#268365"
                      strokeWidth={2.5}
                      fill="url(#collectionFill)"
                      activeDot={{ r: 5, strokeWidth: 3, stroke: 'white' }}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
              <div className="chart-foot">
                <span>
                  <span className="legend-dot" /> Source: recorded operational data
                </span>
                <Link href="/reports">
                  View analytics <ArrowRight size={13} />
                </Link>
              </div>
            </section>
            <section className="panel composition">
              <div className="panel-heading">
                <div>
                  <h2>Waste composition</h2>
                  <p>Collected weight by category</p>
                </div>
                <Recycle size={17} className="muted" />
              </div>
              {data.categories.some((c) => c.quantity > 0) ? (
                <>
                  <div className="donut-wrap">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={data.categories.filter((c) => c.quantity > 0)}
                          dataKey="quantity"
                          nameKey="name"
                          innerRadius={65}
                          outerRadius={88}
                          paddingAngle={3}
                          stroke="none"
                        >
                          {data.categories
                            .filter((c) => c.quantity > 0)
                            .map((c, i) => (
                              <Cell key={c.name} fill={colors[i % colors.length]} />
                            ))}
                        </Pie>
                        <Tooltip formatter={(value) => `${number(Number(value))} kg`} />
                      </PieChart>
                    </ResponsiveContainer>
                    <div className="donut-center">
                      <span>Total collected</span>
                      <strong>{number(m.wasteKg / 1000)}</strong>
                      <small>tonnes</small>
                    </div>
                  </div>
                  <div className="composition-legend">
                    {data.categories
                      .filter((c) => c.quantity > 0)
                      .slice(0, 5)
                      .map((c, i) => (
                        <div key={c.name}>
                          <i style={{ background: colors[i % colors.length] }} />
                          <span>{c.name}</span>
                          <strong>
                            {m.wasteKg ? Math.round((c.quantity / m.wasteKg) * 100) : 0}%
                          </strong>
                          <small>{number(c.quantity / 1000)} t</small>
                        </div>
                      ))}
                  </div>
                </>
              ) : (
                <Empty
                  title="No waste recorded"
                  message="Category distribution appears after collection entries."
                />
              )}
            </section>
          </div>
          <div className="business-grid">
            {catalog.waste && (
              <section className="business-card">
                <div className="business-card-heading">
                  <span className="business-logo viagreen">
                    <Leaf size={22} />
                  </span>
                  <div>
                    <h2>
                      Viagreen <span className="badge green">Waste management</span>
                    </h2>
                    <p>Cleaner sites. Responsible waste journeys.</p>
                  </div>
                  <Link href="/viagreen" aria-label="Open Viagreen">
                    <ArrowUpRight size={19} />
                  </Link>
                </div>
                <div className="business-numbers">
                  <div>
                    <small>Waste collected</small>
                    <strong>
                      {number(m.wasteKg / 1000)} <span>t</span>
                    </strong>
                  </div>
                  <div>
                    <small>Pending tasks</small>
                    <strong>{m.pendingTasks}</strong>
                  </div>
                  <div>
                    <small>Open complaints</small>
                    <strong>
                      {m.openTickets}
                      <span className="mini-amber">to resolve</span>
                    </strong>
                  </div>
                </div>
                <div className="business-bottom">
                  <span>
                    <i className="unit-dot green" /> Collection → segregation → disposal
                  </span>
                  <Link href="/waste">
                    View operations <ArrowRight size={13} />
                  </Link>
                </div>
              </section>
            )}
            {catalog.production && (
              <section className="business-card">
                <div className="business-card-heading">
                  <span className="business-logo anthrasite">
                    <Factory size={22} />
                  </span>
                  <div>
                    <h2>
                      Anthrasite <span className="badge amber">Waste to energy</span>
                    </h2>
                    <p>Turning wet waste into a better resource.</p>
                  </div>
                  <Link href="/anthrasite" aria-label="Open Anthrasite">
                    <ArrowUpRight size={19} />
                  </Link>
                </div>
                <div className="business-numbers">
                  <div>
                    <small>Wet waste processed</small>
                    <strong>
                      {number(m.wetWasteKg / 1000)} <span>t</span>
                    </strong>
                  </div>
                  <div>
                    <small>Eco-coal produced</small>
                    <strong>
                      {number(m.ecoCoalKg / 1000)} <span>t</span>
                    </strong>
                  </div>
                  <div>
                    <small>Production yield</small>
                    <strong>
                      {m.yieldPercent}
                      <span>%</span>
                    </strong>
                  </div>
                </div>
                <div className="business-bottom">
                  <span>
                    <i className="unit-dot green" />
                    {m.machinesRunning} machines running <span className="subtle-divider">/</span>{' '}
                    {m.machinesOffline} offline
                  </span>
                  <Link href="/production">
                    View production <ArrowRight size={13} />
                  </Link>
                </div>
              </section>
            )}
          </div>
          <div className="lower-grid">
            <section className="panel sites-panel">
              <div className="panel-heading">
                <div>
                  <h2>
                    Site performance{' '}
                    <span className="count-badge">{data.sitePerformance.length}</span>
                  </h2>
                  <p>Waste collection against the expected daily volume</p>
                </div>
                <Link className="text-link" href="/sites">
                  All sites <ArrowUpRight size={14} />
                </Link>
              </div>
              {!data.sitePerformance.length ? (
                <Empty
                  title="Your sites will appear here"
                  message="Create a client and add your first operational site."
                />
              ) : (
                <div className="table-scroll">
                  <table>
                    <thead>
                      <tr>
                        <th>Site name</th>
                        <th>Business unit</th>
                        <th>Collected</th>
                        <th>Performance</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.sitePerformance.slice(0, 5).map((s, i) => (
                        <tr key={s.id}>
                          <td>
                            <Link href={`/sites?record=${s.id}`} className="site-name">
                              <span className="site-icon">
                                <BuildingIcon index={i} />
                              </span>
                              <span>
                                {s.name}
                                <small>
                                  {s.visits} visits · {s.tickets} open issues
                                </small>
                              </span>
                            </Link>
                          </td>
                          <td>
                            <span
                              className={`badge ${identity.businessUnits.find((u) => u.id === s.businessUnitId)?.code === 'VIAGREEN' ? 'green' : 'amber'}`}
                            >
                              {identity.businessUnits.find((u) => u.id === s.businessUnitId)
                                ?.name || '—'}
                            </span>
                          </td>
                          <td className="numeric">
                            {number(s.wasteKg / 1000)} <span className="muted">t</span>
                          </td>
                          <td>
                            <div className="performance">
                              <span className="performance-track">
                                <i
                                  style={{
                                    width: `${Math.min(s.performance, 100)}%`,
                                    background: s.performance < 60 ? '#d4a74e' : '#438c6d',
                                  }}
                                />
                              </span>
                              {s.performance}%
                            </div>
                          </td>
                          <td>
                            <span className="status-text">
                              <i />
                              {s.status === 'ACTIVE' ? 'Active' : 'Inactive'}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
            <section className="panel attention-panel">
              <div className="panel-heading">
                <div>
                  <h2>
                    <span className="attention-dot" />
                    Needs attention
                  </h2>
                  <p>Operational signals to follow up</p>
                </div>
                <span className="count-badge">{data.alerts.length}</span>
              </div>
              {data.alerts.length ? (
                <div className="attention-list">
                  {data.alerts.slice(0, 4).map((a, i) => (
                    <Link
                      key={`${a.name}-${i}`}
                      href={
                        a.kind === 'MACHINE_OFFLINE'
                          ? '/machines'
                          : a.kind === 'TICKET_OVERDUE'
                            ? '/tickets'
                            : '/sites'
                      }
                    >
                      <span className={`alert-icon ${i % 2 ? 'yellow' : ''}`}>
                        <CircleAlert size={17} />
                      </span>
                      <div>
                        <strong>{a.name}</strong>
                        <p>{a.message}</p>
                        <small>{a.kind.replaceAll('_', ' ').toLowerCase()}</small>
                      </div>
                      <ArrowUpRight size={14} />
                    </Link>
                  ))}
                </div>
              ) : (
                <Empty title="All clear" message="No operational alerts for your current scope." />
              )}
              <Link className="attention-footer" href="/notifications">
                View notifications <ArrowRight size={13} />
              </Link>
            </section>
          </div>
          {(catalog.invoices || vertical === 'anthrasite') && (
            <div className="analytics-grid">
              {catalog.invoices && (
                <section className="panel">
                  <div className="panel-heading">
                    <div>
                      <h2>Revenue & receivables</h2>
                      <p>Invoiced revenue in period · outstanding across all invoices</p>
                    </div>
                    <Wallet size={18} />
                  </div>
                  <div className="finance-summary">
                    <div>
                      <span>Invoiced revenue</span>
                      <strong>{currency(m.revenue)}</strong>
                    </div>
                    <div>
                      <span>Outstanding</span>
                      <strong>{currency(m.outstanding)}</strong>
                    </div>
                  </div>
                  <div className="small-chart">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart
                        data={data.clientPerformance
                          .filter((c) => c.revenue || c.outstanding)
                          .slice(0, 8)}
                      >
                        <CartesianGrid vertical={false} strokeDasharray="3 4" />
                        <XAxis
                          dataKey="id"
                          tick={({ x, y, payload }: any) => {
                            const client = data.clientPerformance.find(
                              (c) => c.id === payload.value,
                            );
                            return (
                              <foreignObject
                                x={Number(x) - 42}
                                y={Number(y) + 4}
                                width={84}
                                height={28}
                              >
                                <div
                                  style={{ fontSize: 9, textAlign: 'center', overflow: 'hidden' }}
                                >
                                  {client && (
                                    <ProfileLink type="clients" id={client.id}>
                                      {client.name}
                                    </ProfileLink>
                                  )}
                                </div>
                              </foreignObject>
                            );
                          }}
                          axisLine={false}
                          tickLine={false}
                        />
                        <YAxis
                          tick={{ fontSize: 9 }}
                          tickFormatter={(v) => `${v / 1000}k`}
                          axisLine={false}
                          tickLine={false}
                        />
                        <Tooltip formatter={(v) => currency(Number(v))} />
                        <Bar
                          dataKey="revenue"
                          name="Revenue"
                          fill="#328365"
                          radius={[3, 3, 0, 0]}
                        />
                        <Bar
                          dataKey="outstanding"
                          name="Outstanding"
                          fill="#dcc07f"
                          radius={[3, 3, 0, 0]}
                        />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </section>
              )}
              {catalog.machines && (
                <section className="panel">
                  <div className="panel-heading">
                    <div>
                      <h2>Machine uptime</h2>
                      <p>Running time as a share of recorded state history</p>
                    </div>
                    <Zap size={18} />
                  </div>
                  <div className="uptime-list">
                    {data.uptime.slice(0, 5).map((u) => (
                      <div key={u.name}>
                        <span>{u.name}</span>
                        <span className="performance-track">
                          <i style={{ width: `${u.uptime || 0}%` }} />
                        </span>
                        <strong>{u.uptime === null ? 'No history' : `${u.uptime}%`}</strong>
                        <small>{u.coverage}% coverage</small>
                      </div>
                    ))}
                    {!data.uptime.length && (
                      <Empty
                        title="No machines in scope"
                        message="Add machines to begin recording state history."
                      />
                    )}
                  </div>
                </section>
              )}
            </div>
          )}
          <div className="impact-note">
            <Leaf size={17} />
            <span>Better operations. Measurable impact.</span>
            <small>Every record brings us closer to a circular future.</small>
          </div>
        </div>
      )}
      {catalog[recordKey] && (
        <RecordDialog
          moduleKey={recordKey}
          resource={catalog[recordKey]}
          open={create}
          onOpenChange={setCreate}
          onSaved={() => setRefresh((v) => v + 1)}
        />
      )}
    </div>
  );
}
function Metric({
  title,
  value,
  suffix,
  icon,
  foot,
  label,
  link,
}: {
  title: string;
  value: string;
  suffix?: string;
  icon: React.ReactNode;
  foot: string;
  label: string;
  link: string;
}) {
  return (
    <Link href={link} className="metric">
      <div className="metric-title">
        <span>{title}</span>
        <span className="metric-icon">{icon}</span>
      </div>
      <div className="metric-value">
        {value}
        <small>{suffix}</small>
      </div>
      <div className="metric-foot">
        <span className="metric-indicator" />
        <span>{foot}</span>
      </div>
      <div className="metric-label">
        {label}
        <ArrowUpRight size={13} />
      </div>
    </Link>
  );
}
function BuildingIcon({ index }: { index: number }) {
  return index % 2 ? <Factory size={16} /> : <MapPin size={16} />;
}
