'use client';
import { OrgChart } from './org-chart';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import {
  ArrowDown,
  ArrowDownToLine,
  ArrowUp,
  ArrowUpRight,
  Check,
  ChevronLeft,
  ChevronRight,
  Download,
  FileText,
  Filter,
  Loader2,
  MapPin,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  SlidersHorizontal,
  X,
} from 'lucide-react';
import { api, ApiError, number, title, type Field, type Resource, type Row } from '@/lib/api';
import { useOs } from './shell';
import { Button } from './ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from './ui/dialog';
import { Empty, ErrorState, Loading } from './ui/states';
import { SavedPdfs } from './saved-pdfs';
import { ProfileLink, profileTypes } from './profile';
export function RelationInput({
  field,
  value,
  onChange,
  businessUnitId,
  siteId,
}: {
  field: Field;
  value: string;
  onChange: (value: string) => void;
  businessUnitId?: string;
  siteId?: string;
}) {
  const [search, setSearch] = useState(''),
    [rows, setRows] = useState<Row[]>([]),
    [selected, setSelected] = useState<Row | null>(null),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    let active = true;
    const timer = setTimeout(() => {
      setBusy(true);
      const params = new URLSearchParams({
        limit: '30',
        search,
        sort: 'createdAt',
        ...(businessUnitId && field.resource !== 'business-units' ? { businessUnitId } : {}),
        ...(siteId && field.resource !== 'sites' ? { siteId } : {}),
      });
      api<{ rows: Row[] }>(`/resources/${field.resource}?${params}`)
        .then((d) => {
          if (active) {
            setRows(d.rows);
            setError('');
          }
        })
        .catch((e) => {
          if (active) setError(e.message);
        })
        .finally(() => {
          if (active) setBusy(false);
        });
    }, 200);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [search, field.resource, businessUnitId, siteId]);
  useEffect(() => {
    if (!value) {
      setSelected(null);
      return;
    }
    let active = true;
    api<Row>(`/resources/${field.resource}/${value}`)
      .then((row) => {
        if (active) setSelected(row);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [value, field.resource]);
  const options = selected && !rows.some((r) => r.id === selected.id) ? [selected, ...rows] : rows;
  return (
    <div className="relation-control">
      <input
        aria-label={`Search ${field.label}`}
        type="search"
        placeholder={`Search ${field.label.toLowerCase()}…`}
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />
      <select
        aria-label={field.label}
        required={field.required}
        value={value || ''}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value="">{busy ? 'Loading…' : `Select ${field.label.toLowerCase()}`}</option>
        {value && !options.some((row) => row.id === value) && (
          <option value={value}>Loading selected record…</option>
        )}
        {options.map((row) => (
          <option value={row.id} key={row.id}>
            {row.name || row.employeeCode || row.invoiceNumber || row.id}
            {row.employeeCode ? ` · ${row.employeeCode}` : ''}
          </option>
        ))}
      </select>
      {selected && field.resource && profileTypes.includes(field.resource) && (
        <ProfileLink type={field.resource} id={selected.id}>
          {selected.name || 'View profile'}
        </ProfileLink>
      )}
      {error && <small className="field-error">{error}</small>}
    </div>
  );
}
const localDate = (value: string) => {
  const d = new Date(value);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
};
export function RecordDialog({
  moduleKey,
  resource,
  record,
  open,
  onOpenChange,
  onSaved,
}: {
  moduleKey: string;
  resource: Resource;
  record?: Row | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}) {
  const { businessUnitId, identity } = useOs();
  const [values, setValues] = useState<Row>({}),
    [saving, setSaving] = useState(false),
    [error, setError] = useState(''),
    [fields, setFields] = useState<Record<string, string>>({});
  useEffect(() => {
    if (open) {
      setError('');
      setFields({});
      const initial: Row = {};
      for (const f of resource.fields) {
        const value = record?.[f.key];
        initial[f.key] =
          value != null
            ? f.type === 'date'
              ? localDate(value)
              : f.type === 'json'
                ? JSON.stringify(value, null, 2)
                : value
            : f.type === 'boolean'
              ? false
              : f.key === 'businessUnitId'
                ? businessUnitId || identity.businessUnits[0]?.id || ''
                : f.type === 'select'
                  ? f.options?.[0] || ''
                  : f.type === 'date' && f.required
                    ? localDate(new Date().toISOString())
                    : f.type === 'json'
                      ? JSON.stringify(
                          {
                            'Workers present': false,
                            'PPE compliance': false,
                            'Waste collection': false,
                            'Segregation quality': false,
                            'Machine condition': false,
                            'Site cleanliness': false,
                            'Client complaints addressed': false,
                            'Equipment condition': false,
                          },
                          null,
                          2,
                        )
                      : '';
      }
      setValues(initial);
    }
  }, [open, record, resource, businessUnitId, identity.businessUnits]);
  const workerTask = identity.principal.role === 'Worker' && moduleKey === 'tasks';
  const workerTicket = identity.principal.role === 'Worker' && moduleKey === 'tickets';
  const customerTicket = identity.principal.role === 'Customer' && moduleKey === 'tickets';
  const visibleFields = customerTicket
    ? resource.fields.filter((f) =>
        ['name', 'siteId', 'category', 'priority', 'description'].includes(f.key),
      )
    : workerTask
      ? resource.fields.filter((f) => f.key === 'status')
      : workerTicket
        ? resource.fields.filter((f) => !['clientId', 'assigneeId'].includes(f.key))
        : resource.fields;
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError('');
    setFields({});
    try {
      const payload: Row = {};
      for (const f of visibleFields) {
        const value = values[f.key];
        if (value === '' || value == null) {
          if (record && !f.required) payload[f.key] = null;
          continue;
        }
        payload[f.key] =
          f.type === 'date'
            ? new Date(value).toISOString()
            : f.type === 'number'
              ? Number(value)
              : f.type === 'json'
                ? JSON.parse(value)
                : value;
      }
      if (workerTicket) {
        const site = await api<Row>(`/resources/sites/${payload.siteId}`);
        payload.clientId = site.clientId;
      }
      await api(`/resources/${moduleKey}${record ? `/${record.id}` : ''}`, {
        method: record ? 'PATCH' : 'POST',
        body: JSON.stringify(payload),
      });
      onSaved();
      onOpenChange(false);
    } catch (e) {
      setError(e instanceof SyntaxError ? 'Checklist must be valid JSON' : (e as Error).message);
      if (e instanceof ApiError && e.details)
        setFields(Object.fromEntries(e.details.map((d) => [d.field, d.message])));
    } finally {
      setSaving(false);
    }
  }
  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!saving) onOpenChange(v);
      }}
    >
      <DialogContent>
        <DialogTitle className="dialog-title">
          {record ? 'Edit' : 'New'} {resource.label.toLowerCase().replace(/s$/, '')}
        </DialogTitle>
        <DialogDescription className="dialog-description">
          {record
            ? 'Update the record. Changes are saved to the audit trail.'
            : 'Add a record to your shared operational workspace.'}{' '}
          Required fields are marked *.
        </DialogDescription>
        <form onSubmit={submit}>
          <div className="form-grid">
            {visibleFields.map((f) => (
              <label
                key={f.key}
                className={['textarea', 'json', 'relation'].includes(f.type) ? 'full-width' : ''}
              >
                {f.label}
                {f.required && <span className="required"> *</span>}
                {f.type === 'relation' ? (
                  <RelationInput
                    field={f}
                    value={values[f.key] || ''}
                    businessUnitId={values.businessUnitId}
                    siteId={values.siteId}
                    onChange={(v) =>
                      setValues((prev) => ({
                        ...prev,
                        [f.key]: v,
                        ...(f.key === 'businessUnitId'
                          ? Object.fromEntries(
                              resource.fields
                                .filter((x) => x.type === 'relation' && x.key !== 'businessUnitId')
                                .map((x) => [x.key, '']),
                            )
                          : {}),
                      }))
                    }
                  />
                ) : f.type === 'select' ? (
                  <select
                    required={f.required}
                    value={values[f.key] || ''}
                    onChange={(e) => setValues({ ...values, [f.key]: e.target.value })}
                  >
                    {f.options?.map((v) => (
                      <option key={v} value={v}>
                        {title(v)}
                      </option>
                    ))}
                  </select>
                ) : ['textarea', 'json'].includes(f.type) ? (
                  <textarea
                    rows={f.type === 'json' ? 8 : 3}
                    required={f.required}
                    value={values[f.key] || ''}
                    onChange={(e) => setValues({ ...values, [f.key]: e.target.value })}
                  />
                ) : f.type === 'boolean' ? (
                  <input
                    type="checkbox"
                    checked={!!values[f.key]}
                    onChange={(e) => setValues({ ...values, [f.key]: e.target.checked })}
                  />
                ) : (
                  <input
                    type={
                      f.type === 'date'
                        ? 'datetime-local'
                        : f.type === 'number'
                          ? 'number'
                          : f.type === 'email'
                            ? 'email'
                            : 'text'
                    }
                    min={f.min}
                    maxLength={f.type === 'text' ? 250 : undefined}
                    step={f.type === 'number' ? 'any' : undefined}
                    required={f.required}
                    value={values[f.key] ?? ''}
                    onChange={(e) => setValues({ ...values, [f.key]: e.target.value })}
                  />
                )}{' '}
                {fields[f.key] && <small className="field-error">{fields[f.key]}</small>}
              </label>
            ))}
          </div>
          {error && (
            <div className="form-error" role="alert">
              {error}
            </div>
          )}
          <div className="dialog-footer">
            <span>
              <Check size={13} /> Validated & audited
            </span>
            <Button
              type="button"
              variant="outline"
              disabled={saving}
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button disabled={saving}>
              {saving ? <Loader2 className="animate-spin" /> : <Check />}
              {saving ? 'Saving…' : 'Save record'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
function DisplayValue({
  column,
  value,
  resource,
  labels,
}: {
  column: string;
  value: unknown;
  resource: Resource;
  labels: Record<string, string>;
}) {
  if (value == null) return <span className="muted">—</span>;
  if (typeof value === 'boolean')
    return <span className={`badge ${value ? 'green' : ''}`}>{value ? 'Yes' : 'No'}</span>;
  if (column.endsWith('Id')) {
    const target = resource.fields.find((f) => f.key === column)?.resource;
    const label = labels[String(value)] || String(value).slice(0, 8);
    if (target && profileTypes.includes(target))
      return (
        <ProfileLink type={target} id={String(value)}>
          {label}
        </ProfileLink>
      );
    return <>{label}</>;
  }
  if (
    [
      'status',
      'stage',
      'priority',
      'qualityStatus',
      'renewalStatus',
      'position',
      'type',
      'kind',
    ].includes(column)
  ) {
    const s = String(value);
    return (
      <span
        className={`badge ${['ACTIVE', 'PRESENT', 'RUNNING', 'PAID', 'PASSED', 'COMPLETED', 'RESOLVED', 'CLOSED'].includes(s) ? 'green' : ['LATE', 'PENDING', 'MAINTENANCE', 'PARTIAL', 'HIGH', 'OPEN', 'SCHEDULED'].includes(s) ? 'amber' : ['ERROR', 'OFFLINE', 'CRITICAL', 'FAILED', 'INACTIVE'].includes(s) ? 'red' : 'neutral'}`}
      >
        {title(s)}
      </span>
    );
  }
  if (
    resource.fields.find((f) => f.key === column)?.type === 'date' ||
    /At$|Date$|Time$|checkIn|checkOut/.test(column)
  ) {
    const d = new Date(String(value));
    if (!Number.isNaN(d.getTime()))
      return (
        <span className="nowrap">
          {d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: '2-digit' })}{' '}
          {['checkIn', 'checkOut'].includes(column) &&
            d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
        </span>
      );
  }
  if (typeof value === 'object') return <code>{JSON.stringify(value)}</code>;
  if (resource.fields.find((f) => f.key === column)?.type === 'number')
    return <span className="numeric">{number(Number(value))}</span>;
  return <>{String(value)}</>;
}
export function Records({ moduleKey }: { moduleKey: string }) {
  const { catalog, businessUnitId, identity } = useOs();
  const resource = catalog[moduleKey];
  const params = useSearchParams();
  const [search, setSearch] = useState(''),
    [status, setStatus] = useState(''),
    [sort, setSort] = useState('createdAt'),
    [order, setOrder] = useState('desc'),
    [page, setPage] = useState(1),
    [data, setData] = useState<{ rows: Row[]; total: number } | null>(null),
    [labels, setLabels] = useState<Record<string, string>>({}),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(''),
    [refresh, setRefresh] = useState(0),
    [form, setForm] = useState(false),
    [edit, setEdit] = useState<Row | null>(null),
    [detail, setDetail] = useState<Row | null>(null),
    [exporting, setExporting] = useState(false),
    [uploadOpen, setUploadOpen] = useState(false);
  const query = new URLSearchParams({
    page: String(page),
    limit: '15',
    search,
    sort,
    order,
    ...(status ? { status } : {}),
    ...(businessUnitId ? { businessUnitId } : {}),
  }).toString();
  useEffect(() => {
    let active = true;
    const timer = setTimeout(() => {
      setLoading(true);
      setError('');
      api<{ rows: Row[]; total: number }>(`/resources/${moduleKey}?${query}`)
        .then(async (d) => {
          if (!active) return;
          setData(d);
          const mapped: Record<string, string> = {};
          await Promise.all(
            resource.fields
              .filter((f) => f.type === 'relation')
              .map(async (f) => {
                const ids = [...new Set(d.rows.map((row) => row[f.key]).filter(Boolean))];
                await Promise.all(
                  ids.map(async (id) => {
                    try {
                      const r = await api<Row>(`/resources/${f.resource}/${id}`);
                      mapped[id] = r.name || r.employeeCode || id;
                    } catch {
                      mapped[id] = 'Restricted record';
                    }
                  }),
                );
              }),
          );
          if (active) setLabels(mapped);
        })
        .catch((e) => {
          if (active) setError(e.message);
        })
        .finally(() => {
          if (active) setLoading(false);
        });
    }, 200);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [moduleKey, query, refresh, resource]);
  useEffect(() => {
    setPage(1);
    setSearch('');
    setStatus('');
    setDetail(null);
  }, [moduleKey, businessUnitId]);
  useEffect(() => {
    const id = params.get('record');
    if (id)
      api<Row>(`/resources/${moduleKey}/${id}`)
        .then(setDetail)
        .catch((e) => setError(e.message));
  }, [params, moduleKey]);
  if (!resource)
    return (
      <Empty title="Module unavailable" message="Your role does not have access to this module." />
    );
  const statuses =
    resource.statusFilters || resource.fields.find((f) => f.key === 'status')?.options;
  const submodules = Object.entries(catalog).filter(([, r]) => r.group === resource.group);
  async function downloadReport() {
    setExporting(true);
    try {
      const response = await fetch(`/api/reports/${moduleKey}/csv?${query}`, {
        credentials: 'include',
      });
      if (!response.ok) throw new Error((await response.json()).error);
      const url = URL.createObjectURL(await response.blob());
      const a = document.createElement('a');
      a.href = url;
      a.download = `${moduleKey}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setExporting(false);
    }
  }
  return (
    <div className="page">
      <div className="page-heading">
        <div>
          <div className="eyebrow">{resource.group.toUpperCase()} / SHARED WORKSPACE</div>
          <h1>{resource.label}</h1>
          <p>
            {(
              {
                sites: 'Every location, connected to the people and clients behind it.',
                employees: 'Your people, their assignments, and the work they make possible.',
                attendance: 'Site-level attendance, NFC-ready and backed by a clear audit trail.',
                waste: 'Track every kilogram from collection through responsible disposal.',
                production: 'Trace wet waste input, eco-coal output, and batch quality.',
                invoices: 'Manage client billing and follow each invoice through to payment.',
                audit: 'A traceable record of who changed what, and when.',
              } as Record<string, string>
            )[moduleKey] || `Manage ${resource.label.toLowerCase()} across your operational scope.`}
          </p>
        </div>
        <div className="heading-actions">
          {identity.principal.permissions.includes('reports:read') && (
            <Button variant="outline" onClick={downloadReport} disabled={exporting}>
              <ArrowDownToLine />
              {exporting ? 'Exporting…' : 'Export CSV'}
            </Button>
          )}
          {moduleKey === 'notifications' && (
            <Button
              onClick={async () => {
                try {
                  await api('/notifications/refresh', { method: 'POST' });
                  setRefresh((v) => v + 1);
                } catch (e) {
                  setError((e as Error).message);
                }
              }}
            >
              <RefreshCw />
              Check alerts
            </Button>
          )}
          {moduleKey === 'documents' &&
            identity.principal.permissions.includes('documents:write') && (
              <Button onClick={() => setUploadOpen(true)}>
                <Plus />
                Upload document
              </Button>
            )}
          {resource.canWrite &&
            !(identity.principal.role === 'Worker' && moduleKey === 'tasks') && (
              <Button
                onClick={() => {
                  setEdit(null);
                  setForm(true);
                }}
              >
                <Plus />
                Add record
              </Button>
            )}
        </div>
      </div>
      <div className="module-tabs">
        {submodules.map(([key, r]) => (
          <Link className={key === moduleKey ? 'active' : ''} href={`/${key}`} key={key}>
            {r.label}
          </Link>
        ))}
      </div>
      {['employees', 'assignments', 'sites', 'clients', 'contacts'].includes(moduleKey) && <OrgChart refresh={refresh} />}
      <section className="panel records-panel">
        <div className="records-toolbar">
          <div className="search-input">
            <Search size={16} />
            <input
              type="search"
              aria-label={`Search ${resource.label}`}
              maxLength={200}
              placeholder={
                resource.search.length
                  ? `Search ${resource.label.toLowerCase()}…`
                  : 'This view has no text search fields'
              }
              disabled={!resource.search.length}
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
            />
          </div>
          <div className="table-filters">
            {(search || status) && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setSearch('');
                  setStatus('');
                  setPage(1);
                }}
              >
                <X size={14} />
                Clear filters
              </Button>
            )}
            {statuses && (
              <label className="filter-select">
                <Filter size={14} />
                <select
                  aria-label="Filter status"
                  value={status}
                  onChange={(e) => {
                    setStatus(e.target.value);
                    setPage(1);
                  }}
                >
                  <option value="">All statuses</option>
                  {statuses.map((s) => (
                    <option value={s} key={s}>
                      {title(s)}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <Button
              variant="outline"
              size="icon"
              aria-label="Refresh records"
              onClick={() => setRefresh((v) => v + 1)}
            >
              <RefreshCw className={loading ? 'animate-spin' : ''} />
            </Button>
          </div>
        </div>
        {error ? (
          <ErrorState message={error} retry={() => setRefresh((v) => v + 1)} />
        ) : loading && !data ? (
          <Loading />
        ) : !data?.rows.length ? (
          <Empty
            title={
              search || status ? 'No matching records' : `No ${resource.label.toLowerCase()} yet`
            }
            message={
              search || status
                ? 'Try a different search or status filter.'
                : resource.canWrite
                  ? 'Add a record to get started.'
                  : 'Records will appear here when available.'
            }
          />
        ) : (
          <div className={`table-scroll ${loading ? 'refreshing' : ''}`}>
            <table>
              <thead>
                <tr>
                  {resource.columns.map((c) => (
                    <th
                      key={c}
                      aria-sort={
                        sort === c ? (order === 'asc' ? 'ascending' : 'descending') : 'none'
                      }
                    >
                      <button
                        onClick={() => {
                          setSort(c);
                          setOrder(sort === c && order === 'asc' ? 'desc' : 'asc');
                          setPage(1);
                        }}
                      >
                        {resource.fields.find((f) => f.key === c)?.label ||
                          title(c.replace(/([A-Z])/g, ' $1').replace(/ Id$/, ''))}
                        {sort === c &&
                          (order === 'asc' ? <ArrowUp size={12} /> : <ArrowDown size={12} />)}
                      </button>
                    </th>
                  ))}
                  <th>
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {data.rows.map((row) => (
                  <tr key={row.id}>
                    {resource.columns.map((c, i) => (
                      <td key={c} className={i === 0 ? 'primary-cell' : ''}>
                        {profileTypes.includes(moduleKey) &&
                        ['name', 'contactPerson'].includes(c) &&
                        row[c] ? (
                          <ProfileLink type={moduleKey} id={row.id}>
                            {row[c]}
                          </ProfileLink>
                        ) : i === 0 &&
                          !profileTypes.includes(
                            resource.fields.find((f) => f.key === c)?.resource || '',
                          ) ? (
                          <button className="cell-link" onClick={() => setDetail(row)}>
                            <DisplayValue
                              column={c}
                              value={row[c]}
                              resource={resource}
                              labels={labels}
                            />
                          </button>
                        ) : (
                          <DisplayValue
                            column={c}
                            value={row[c]}
                            resource={resource}
                            labels={labels}
                          />
                        )}
                      </td>
                    ))}
                    <td>
                      <button
                        className="row-action"
                        aria-label={`View ${row.name || row.id}`}
                        onClick={() => setDetail(row)}
                      >
                        <ArrowUpRight size={16} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="pagination">
          <span>
            {data?.total
              ? `${(page - 1) * 15 + 1}–${Math.min(page * 15, data.total)} of ${number(data.total)} records`
              : '0 records'}
          </span>
          <div>
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1 || loading}
              onClick={() => setPage((p) => p - 1)}
            >
              <ChevronLeft />
              Previous
            </Button>
            <span>Page {page}</span>
            <Button
              variant="outline"
              size="sm"
              disabled={!data || page * 15 >= data.total || loading}
              onClick={() => setPage((p) => p + 1)}
            >
              Next
              <ChevronRight />
            </Button>
          </div>
        </div>
      </section>
      <RecordDialog
        moduleKey={moduleKey}
        resource={resource}
        record={edit}
        open={form}
        onOpenChange={setForm}
        onSaved={() => {
          setRefresh((v) => v + 1);
          setDetail(null);
        }}
      />
      <Dialog
        open={!!detail}
        onOpenChange={(open) => {
          if (!open) setDetail(null);
        }}
      >
        <DialogContent className="detail-dialog">
          <DialogTitle className="dialog-title">{detail?.name || resource.label}</DialogTitle>
          <DialogDescription className="dialog-description">
            Record details · {detail?.id}
          </DialogDescription>
          {detail && (
            <>
              <div className="detail-actions">
                {profileTypes.includes(moduleKey) && (
                  <ProfileLink type={moduleKey} id={detail.id}>
                    {detail.name || 'View full profile card'}
                  </ProfileLink>
                )}
                {resource.canWrite &&
                  moduleKey !== 'payments' &&
                  !(
                    ['Worker', 'Customer'].includes(identity.principal.role) &&
                    moduleKey === 'tickets'
                  ) && (
                    <Button
                      size="sm"
                      onClick={() => {
                        setEdit(detail);
                        setDetail(null);
                        setForm(true);
                      }}
                    >
                      <Pencil />
                      Edit record
                    </Button>
                  )}
                {moduleKey === 'sites' && detail.latitude != null && detail.longitude != null && (
                  <Button asChild variant="outline" size="sm">
                    <a
                      href={`https://www.google.com/maps?q=${detail.latitude},${detail.longitude}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      <MapPin />
                      Open location
                    </a>
                  </Button>
                )}
                {moduleKey === 'documents' && (
                  <Button
                    size="sm"
                    onClick={async () => {
                      try {
                        const d = await api<{ url: string }>(`/documents/${detail.id}/download`);
                        window.location.assign(d.url);
                      } catch (e) {
                        setError((e as Error).message);
                        setDetail(null);
                      }
                    }}
                  >
                    <Download />
                    Secure download
                  </Button>
                )}
                {moduleKey === 'notifications' && !detail.readAt && (
                  <Button
                    size="sm"
                    onClick={async () => {
                      try {
                        await api(`/notifications/${detail.id}/read`, { method: 'PATCH' });
                        setDetail(null);
                        setRefresh((v) => v + 1);
                      } catch (e) {
                        setError((e as Error).message);
                        setDetail(null);
                      }
                    }}
                  >
                    <Check />
                    Mark read
                  </Button>
                )}
              </div>
              {moduleKey === 'production' && (
                <div className="notice">
                  Yield:{' '}
                  {detail.outputKg == null
                    ? 'Batch in progress'
                    : `${((Number(detail.outputKg) / Number(detail.inputKg)) * 100).toFixed(1)}%`}{' '}
                  · Output ÷ input × 100
                </div>
              )}
              <dl className="detail-grid">
                {Object.entries(detail)
                  .filter(([k]) => !['id', 'organizationId', 'deletedAt', 'objectKey'].includes(k))
                  .map(([k, v]) => (
                    <div key={k}>
                      <dt>
                        {resource.fields.find((f) => f.key === k)?.label ||
                          title(k.replace(/([A-Z])/g, ' $1'))}
                      </dt>
                      <dd>
                        <DisplayValue column={k} value={v} resource={resource} labels={labels} />
                      </dd>
                    </div>
                  ))}
              </dl>
              {moduleKey === 'sites' && <SiteActivity siteId={detail.id} />}
              {['invoices', 'challans'].includes(moduleKey) && (
                <SavedPdfs
                  key={detail.id}
                  moduleKey={moduleKey}
                  recordId={detail.id}
                  canWrite={resource.canWrite}
                />
              )}
            </>
          )}
        </DialogContent>
      </Dialog>
      <DocumentDialog
        open={uploadOpen}
        onOpenChange={setUploadOpen}
        onSaved={() => setRefresh((v) => v + 1)}
      />
    </div>
  );
}
function SiteActivity({ siteId }: { siteId: string }) {
  const { catalog } = useOs();
  const [tab, setTab] = useState('attendance'),
    [rows, setRows] = useState<Row[]>([]),
    [error, setError] = useState(''),
    [loading, setLoading] = useState(false);
  useEffect(() => {
    let active = true;
    setLoading(true);
    api<{ rows: Row[] }>(`/resources/${tab}?siteId=${siteId}&limit=10`)
      .then((d) => {
        if (active) {
          setRows(d.rows);
          setError('');
        }
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
  }, [siteId, tab]);
  return (
    <section className="site-activity">
      <h3>Site activity</h3>
      <div className="module-tabs">
        {['attendance', 'waste', 'tasks', 'tickets', 'visits', 'assignments', 'production']
          .filter((k) => catalog[k])
          .map((k) => (
            <button className={tab === k ? 'active' : ''} key={k} onClick={() => setTab(k)}>
              {catalog[k].label}
            </button>
          ))}
      </div>
      {loading ? (
        <Loading />
      ) : error ? (
        <p role="alert">{error}</p>
      ) : rows.length ? (
        <ul>
          {rows.map((r) => (
            <li key={r.id}>
              <Link href={`/${tab}?record=${r.id}`}>{r.name || r.status || r.id.slice(0, 8)}</Link>
              <span>
                {r.quantity
                  ? `${r.quantity} kg`
                  : r.status || new Date(r.createdAt).toLocaleDateString('en-IN')}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <Empty title="No activity yet" message="Entries linked to this site will appear here." />
      )}
    </section>
  );
}
function DocumentDialog({
  open,
  onOpenChange,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSaved: () => void;
}) {
  const { identity, catalog } = useOs();
  const [parentType, setParentType] = useState('site'),
    [parentId, setParentId] = useState(''),
    [unit, setUnit] = useState(identity.businessUnits[0]?.id || ''),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  const parents: Record<string, string> = {
    site: 'sites',
    employee: 'employees',
    client: 'clients',
    contract: 'contracts',
    vendor: 'vendors',
    machine: 'machines',
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogTitle className="dialog-title">Upload document</DialogTitle>
        <DialogDescription className="dialog-description">
          Private files with short-lived, authorized download links. Maximum 10 MB.
        </DialogDescription>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setError('');
            try {
              const data = new FormData(e.currentTarget);
              data.set('parentType', parentType);
              data.set('parentId', parentId);
              data.set('businessUnitId', unit);
              const expiry = data.get('expiresAt');
              if (expiry) data.set('expiresAt', new Date(String(expiry)).toISOString());
              else data.delete('expiresAt');
              await api('/documents', { method: 'POST', body: data });
              onSaved();
              onOpenChange(false);
            } catch (e) {
              setError((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          <div className="form-grid">
            <label>
              Business unit
              <select
                value={unit}
                onChange={(e) => {
                  setUnit(e.target.value);
                  setParentId('');
                }}
              >
                {identity.businessUnits.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Belongs to
              <select
                value={parentType}
                onChange={(e) => {
                  setParentType(e.target.value);
                  setParentId('');
                }}
              >
                {Object.entries(parents)
                  .filter(([, r]) => catalog[r])
                  .map(([p]) => (
                    <option value={p} key={p}>
                      {title(p)}
                    </option>
                  ))}
              </select>
            </label>
            <label className="full-width">
              Owner *
              <RelationInput
                field={{
                  key: 'parentId',
                  label: 'Owner',
                  type: 'relation',
                  resource: parents[parentType],
                  required: true,
                }}
                businessUnitId={unit}
                value={parentId}
                onChange={setParentId}
              />
            </label>
            <label>
              Document type *
              <input
                name="documentType"
                required
                maxLength={100}
                placeholder="Contract, identity, inspection…"
              />
            </label>
            <label>
              Expires on
              <input name="expiresAt" type="date" />
            </label>
            <label className="full-width">
              File *
              <input type="file" name="file" required accept=".pdf,.jpg,.jpeg,.png,.docx,.xlsx" />
            </label>
          </div>
          {error && (
            <div className="form-error" role="alert">
              {error}
            </div>
          )}
          <div className="dialog-footer">
            <Button variant="outline" type="button" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button disabled={busy}>{busy ? 'Uploading…' : 'Upload securely'}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
