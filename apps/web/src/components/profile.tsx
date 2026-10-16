'use client';
import Link from 'next/link';
import { OrgChart } from './org-chart';
import { useEffect, useState } from 'react';
import { ArrowUpRight, FileText, Phone, Mail, UserRound, Upload, Wallet } from 'lucide-react';
import { api, title, type Row } from '@/lib/api';
import { Button } from './ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from './ui/dialog';
import { ErrorState, Loading } from './ui/states';

const money = (value: unknown) =>
  new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(value));

export const profileTypes = ['employees', 'clients', 'users', 'vendors', 'contacts'];
export function ProfileLink({
  type,
  id,
  children,
}: {
  type: string;
  id: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        className="person-link"
        onClick={(e) => {
          e.stopPropagation();
          setOpen(true);
        }}
        aria-label={`View profile: ${typeof children === 'string' ? children : 'person'}`}
      >
        {children}
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="profile-dialog">
          <DialogTitle className="dialog-title">Profile card</DialogTitle>
          <DialogDescription className="dialog-description">
            Contact details, identity and records available to your account.
          </DialogDescription>
          {open && <ProfileView type={type} id={id} compact onNavigate={() => setOpen(false)} />}
        </DialogContent>
      </Dialog>
    </>
  );
}

const date = (value: string | null) =>
  value
    ? new Date(value).toLocaleDateString('en-IN', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      })
    : 'Not provided';
export function ProfileView({
  type,
  id,
  compact = false,
  onNavigate,
}: {
  type: string;
  id: string;
  compact?: boolean;
  onNavigate?: () => void;
}) {
  const [profile, setProfile] = useState<Row | null>(null),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(''),
    [editing, setEditing] = useState(false);
  const path = `/profiles/${type}/${id}`;
  useEffect(() => {
    let active = true;
    setProfile(null);
    setError('');
    setEditing(false);
    setMessage('');
    api<Row>(path)
      .then((value) => {
        if (active) setProfile(value);
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [path]);
  async function reload() {
    setProfile(await api<Row>(path));
  }
  if (!profile)
    return error ? (
      <ErrorState
        message={error}
        retry={() => {
          setError('');
          reload().catch((e) => setError(e.message));
        }}
      />
    ) : (
      <Loading label="Loading profile…" />
    );
  const p = profile;
  const fileUrl = (asset: Row, download = false) =>
    `/api/profiles/${p.type}/${p.id}/assets/${asset.id}${download ? '?download=1' : ''}`;
  const photo = p.assets.find((a: Row) => a.kind === 'PHOTO');
  const proofs = p.assets.filter((a: Row) => a.kind === 'GOVERNMENT_ID');
  const documents = p.assets.filter((a: Row) => ['DOCUMENT', 'PAYSLIP'].includes(a.kind));
  const detailFields = [
    ['employeeCode', 'Employee ID'],
    ['company', 'Company'],
    ['address', 'Address'],
    ['joiningDate', 'Joined'],
    ['dateOfBirth', 'Date of birth'],
    ['emergencyContact', 'Emergency contact'],
  ];
  async function saveDetails(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const data: Row = {};
    for (const [key, value] of form.entries()) data[key] = String(value).trim() || null;
    setBusy(true);
    setError('');
    setMessage('');
    try {
      setProfile(await api<Row>(path, { method: 'PATCH', body: JSON.stringify(data) }));
      setEditing(false);
      setMessage('Profile updated.');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function upload(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const data = new FormData(form);
    const file = data.get('file') as File;
    if (!file?.size || file.size > 10 * 1024 * 1024) {
      setError('Choose a file up to 10 MB.');
      return;
    }
    setBusy(true);
    setError('');
    setMessage('');
    try {
      await api(`${path}/assets`, { method: 'POST', body: data });
      await reload();
      form.reset();
      setMessage('File uploaded.');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function recordPayment(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const data = Object.fromEntries(new FormData(form)) as Row;
    data.paidAt = new Date(data.paidAt).toISOString();
    setBusy(true);
    setError('');
    setMessage('');
    try {
      await api(`${path}/payments`, { method: 'POST', body: JSON.stringify(data) });
      await reload();
      form.reset();
      setMessage('Payment recorded.');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className={compact ? 'person-profile compact-profile' : 'page person-profile'}>
      {!compact && (
        <div className="page-heading">
          <div>
            <div className="eyebrow">PEOPLE / PROFILE</div>
            <h1>{p.name}</h1>
            <p>Contact information, identity and profile records.</p>
          </div>
          {p.access.canEdit && (
            <Button variant="outline" onClick={() => setEditing(!editing)}>
              {editing ? 'Cancel editing' : 'Edit profile'}
            </Button>
          )}
        </div>
      )}
      <section className="profile-hero">
        {photo ? (
          <img className="profile-photo" src={fileUrl(photo)} alt={`${p.name}'s photo`} />
        ) : (
          <div className="profile-photo profile-initials" aria-label="No profile photo">
            {p.name
              .split(' ')
              .slice(0, 2)
              .map((n: string) => n[0])
              .join('')}
          </div>
        )}
        <div className="profile-heading">
          <h2>{p.name}</h2>
          <p>{title(p.designation || 'Not provided')}</p>
          <span className={`badge ${p.status === 'ACTIVE' ? 'green' : 'neutral'}`}>
            {title(p.status)}
          </span>
          <div className="profile-contact">
            <span>
              <Phone size={15} />
              {p.phone || 'Phone not provided'}
            </span>
            <span>
              <Mail size={15} />
              {p.email || 'Email not provided'}
            </span>
          </div>
        </div>
      </section>
      {error && (
        <div className="form-error" role="alert">
          {error}
        </div>
      )}
      {message && (
        <div className="success-message" role="status">
          {message}
        </div>
      )}
      {compact && (
        <Button asChild variant="outline">
          <Link href={`/profiles/${p.type}/${p.id}`} onClick={onNavigate}>
            Open full profile <ArrowUpRight size={16} />
          </Link>
        </Button>
      )}
      {editing && !compact && (
        <section className="profile-section">
          <h3>Edit profile details</h3>
          <form onSubmit={saveDetails}>
            <div className="form-grid">
              <label>
                Phone
                <input name="phone" type="tel" maxLength={40} defaultValue={p.phone || ''} />
              </label>
              <label>
                Designation
                <input name="designation" maxLength={120} defaultValue={p.designation || ''} />
              </label>
              <label className="full-width">
                Address
                <textarea name="address" maxLength={1000} defaultValue={p.address || ''} />
              </label>
              <label>
                Date of birth
                <input
                  type="date"
                  name="dateOfBirth"
                  max={new Date().toISOString().slice(0, 10)}
                  defaultValue={p.dateOfBirth?.slice(0, 10) || ''}
                />
              </label>
              <label>
                Emergency contact
                <input
                  name="emergencyContact"
                  maxLength={250}
                  defaultValue={p.emergencyContact || ''}
                />
              </label>
              <label>
                Government ID type
                <input
                  name="governmentIdType"
                  placeholder="e.g. Passport or driving licence"
                  maxLength={100}
                  defaultValue={p.governmentIdType || ''}
                />
              </label>
              <label>
                Government ID number
                <input
                  name="governmentIdNumber"
                  maxLength={100}
                  defaultValue={p.governmentIdNumber || ''}
                />
              </label>
              {p.access.canPay && (
                <label>
                  Monthly pay (INR)
                  <input
                    type="number"
                    name="monthlyPay"
                    min="0"
                    step="0.01"
                    max="999999999999.99"
                    defaultValue={p.monthlyPay ?? ''}
                  />
                </label>
              )}
              {p.access.management && (
                <label className="full-width">
                  Internal notes
                  <textarea name="notes" maxLength={5000} defaultValue={p.notes || ''} />
                </label>
              )}
            </div>
            <Button disabled={busy}>{busy ? 'Saving…' : 'Save details'}</Button>
          </form>
        </section>
      )}
      <section className="profile-section">
        <h3>
          <UserRound size={18} />
          Details
        </h3>
        <dl className="profile-details">
          {detailFields
            .filter(([key]) => key in p && (p[key] || !compact))
            .map(([key, label]) => (
              <div key={key}>
                <dt>{label}</dt>
                <dd>
                  {['joiningDate', 'dateOfBirth'].includes(key)
                    ? date(p[key])
                    : p[key] || 'Not provided'}
                </dd>
              </div>
            ))}
          {p.relationships.map((person: Row) => (
            <div key={person.label}>
              <dt>{person.label}</dt>
              <dd>
                <ProfileLink type={person.type} id={person.id}>
                  {person.name}
                </ProfileLink>
              </dd>
            </div>
          ))}
        </dl>
        {p.access.management && p.notes && <p className="profile-notes">{p.notes}</p>}
      </section>
      {['employees', 'clients', 'users'].includes(p.type) && <OrgChart employeeId={p.type === 'employees' ? p.id : undefined} clientId={p.type === 'clients' ? p.id : undefined} />}
      {p.access.identity && (
        <section className="profile-section">
          <h3>
            <FileText size={18} />
            Government ID proof
          </h3>
          <dl className="profile-details">
            <div>
              <dt>ID type</dt>
              <dd>{p.governmentIdType || 'Not provided'}</dd>
            </div>
            <div>
              <dt>ID number</dt>
              <dd>{p.governmentIdNumber || 'Not provided'}</dd>
            </div>
          </dl>
          {!proofs.length && <p className="muted">No ID proof uploaded.</p>}
          <div className="profile-files">
            {proofs.map((asset: Row) => (
              <article className="profile-file" key={asset.id}>
                {asset.mimeType.startsWith('image/') && (
                  <a href={fileUrl(asset)} target="_blank" rel="noreferrer">
                    <img
                      src={fileUrl(asset)}
                      alt={`Government ID proof: ${asset.name}`}
                      loading="lazy"
                    />
                  </a>
                )}
                <div>
                  <strong>{asset.name}</strong>
                  <small>{date(asset.createdAt)}</small>
                  <a className="person-link" href={fileUrl(asset, true)}>
                    Download ID proof
                  </a>
                </div>
              </article>
            ))}
          </div>
        </section>
      )}
      {p.access.management && (
        <section className="profile-section">
          <h3>
            <FileText size={18} />
            Documents & payslips
          </h3>
          {!documents.length && !p.documents?.length && (
            <p className="muted">No documents uploaded.</p>
          )}
          <div className="profile-files">
            {documents.map((asset: Row) => (
              <article className="profile-file" key={asset.id}>
                <FileText size={24} />
                <div>
                  <strong>{asset.name}</strong>
                  <small>
                    {title(asset.kind)} · {date(asset.createdAt)}
                  </small>
                  <a className="person-link" href={fileUrl(asset, true)}>
                    Download
                  </a>
                </div>
              </article>
            ))}
            {p.documents?.map((doc: Row) => (
              <article className="profile-file" key={doc.id}>
                <FileText size={24} />
                <div>
                  <strong>{doc.name}</strong>
                  <small>{doc.documentType}</small>
                  <button
                    type="button"
                    className="person-link"
                    onClick={async () => {
                      try {
                        const result = await api<{ url: string }>(`/documents/${doc.id}/download`);
                        window.location.assign(result.url);
                      } catch (e) {
                        setError((e as Error).message);
                      }
                    }}
                  >
                    Download
                  </button>
                </div>
              </article>
            ))}
          </div>
        </section>
      )}
      {p.access.canPay && (
        <section className="profile-section">
          <h3>
            <Wallet size={18} />
            Pay & payments
          </h3>
          <div className="profile-pay-summary">
            <div>
              <small>Monthly pay</small>
              <strong>{p.monthlyPay == null ? 'Not set' : money(p.monthlyPay)}</strong>
            </div>
            <div>
              <small>Total recorded payments</small>
              <strong>{money(p.paymentTotal)}</strong>
            </div>
          </div>
          {!p.payments.length ? (
            <p className="muted">No payments recorded.</p>
          ) : (
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Period</th>
                    <th>Amount</th>
                    <th>Method</th>
                    <th>Reference</th>
                  </tr>
                </thead>
                <tbody>
                  {(compact ? p.payments.slice(0, 3) : p.payments).map((payment: Row) => (
                    <tr key={payment.id}>
                      <td>{date(payment.paidAt)}</td>
                      <td>{payment.period}</td>
                      <td>{money(payment.amount)}</td>
                      <td>{title(payment.method)}</td>
                      <td>
                        {payment.reference || '—'}
                        {!compact && payment.notes && <small>{payment.notes}</small>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="muted">
                Showing {compact ? Math.min(3, p.payments.length) : p.payments.length} of{' '}
                {p.paymentCount} recorded payments.
              </p>
            </div>
          )}
          {!compact && (
            <details className="profile-disclosure">
              <summary>Record a payment</summary>
              <p className="muted">Record a payment already made. This does not transfer money.</p>
              <form onSubmit={recordPayment}>
                <div className="form-grid">
                  <label>
                    Amount (INR) *
                    <input
                      name="amount"
                      type="number"
                      step="0.01"
                      min="0.01"
                      max="999999999999.99"
                      required
                    />
                  </label>
                  <label>
                    Payment date *<input name="paidAt" type="datetime-local" required />
                  </label>
                  <label>
                    Pay period *
                    <input name="period" placeholder="September 2026" maxLength={100} required />
                  </label>
                  <label>
                    Method *
                    <select name="method">
                      <option value="BANK_TRANSFER">Bank transfer</option>
                      <option value="UPI">UPI</option>
                      <option value="CASH">Cash</option>
                      <option value="CHEQUE">Cheque</option>
                    </select>
                  </label>
                  <label>
                    Reference
                    <input name="reference" maxLength={200} />
                  </label>
                  <label>
                    Notes
                    <input name="notes" maxLength={2000} />
                  </label>
                </div>
                <Button disabled={busy}>Record payment</Button>
              </form>
            </details>
          )}
        </section>
      )}
      {!compact && p.access.canEdit && (
        <section className="profile-section">
          <h3>
            <Upload size={18} />
            Upload photo or document
          </h3>
          <p className="muted">
            JPEG, PNG or PDF, up to 10 MB. Profile photos must be JPEG or PNG. The most recent photo
            is displayed.
          </p>
          <form className="profile-upload" onSubmit={upload}>
            <label>
              File type
              <select name="kind">
                <option value="PHOTO">Profile photo</option>
                <option value="GOVERNMENT_ID">Government ID proof</option>
                {p.access.management && (
                  <>
                    <option value="DOCUMENT">Document</option>
                    <option value="PAYSLIP">Payslip</option>
                  </>
                )}
              </select>
            </label>
            <label>
              File
              <input
                type="file"
                name="file"
                accept="image/jpeg,image/png,application/pdf"
                required
              />
            </label>
            <Button disabled={busy}>{busy ? 'Uploading…' : 'Upload file'}</Button>
          </form>
        </section>
      )}
    </div>
  );
}
