'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { api, type Row } from '@/lib/api';
import { Loading } from './ui/states';
export function FlowBridge({ leads = false }: { leads?: boolean }) {
  const [data, setData] = useState<Row | null>(null),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  const [tab, setTab] = useState('customers'),
    [selected, setSelected] = useState<Row | null>(null),
    [messages, setMessages] = useState<Row[]>([]);
  const [search, setSearch] = useState(''),
    [name, setName] = useState(''),
    [phone, setPhone] = useState(''),
    [message, setMessage] = useState('Hi'),
    [notes, setNotes] = useState('');
  const load = async () => setData(await api<Row>('/flowbridge'));
  useEffect(() => {
    load().catch((e) => setError(e.message));
  }, []);
  async function act(fn: () => Promise<unknown>) {
    setBusy(true);
    setError('');
    try {
      await fn();
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function open(c: Row) {
    setSelected(c);
    setNotes(c.notes || '');
    setMessages([]);
    try {
      setMessages(await api<Row[]>(`/flowbridge/contacts/${c.id}/messages`));
    } catch (e) {
      setError((e as Error).message);
    }
  }
  if (!data && !error) return <Loading />;
  const contacts = (data?.contacts || []).filter((c: Row) =>
    `${c.name || ''} ${c.email || ''} ${c.whatsappId}`.toLowerCase().includes(search.toLowerCase()),
  );
  return (
    <div className="page staff-attendance">
      <div className="page-heading">
        <div>
          <div className="eyebrow">SUPER ADMIN ? WHATSAPP</div>
          <h1>{leads ? 'Lead generation' : 'Anthrasite FlowBridge'}</h1>
          <p>
            {leads
              ? 'WhatsApp enquiries and registration forms, connected to your CRM.'
              : 'Customers, conversations, submissions and campaign links in one workspace.'}
          </p>
        </div>
        <Link className="button secondary" href={leads ? '/flowbridge' : '/lead-generation'}>
          {leads ? 'Open FlowBridge' : 'Lead generation'}
        </Link>
      </div>
      {error && (
        <p role="alert" className="notice">
          {error}
        </p>
      )}
      {data && (
        <>
          <section className="panel settings-body">
            <h2>{data.configured ? 'WhatsApp connected' : 'WhatsApp setup required'}</h2>
            <p>
              {data.configured
                ? 'Signed webhooks are ready to receive WhatsApp enquiries.'
                : 'Configure the Meta app credentials, phone number, published Flow and organization in the API environment to activate messaging.'}
            </p>
            <p>
              Webhook: <code>{data.webhookPath}</code>
            </p>
            <div className="staff-actions">
              <span>{data.contacts.length} recent contacts</span>
              <span>
                {data.contacts.filter((c: Row) => c.submission).length} recent submissions
              </span>
              <span>{data.pending} pending events</span>
              <span>{data.failed} failed events</span>
              <button className="button secondary" disabled={busy} onClick={() => act(load)}>
                Refresh
              </button>
              {data.failed > 0 && (
                <button
                  className="button secondary"
                  disabled={busy}
                  onClick={() => act(() => api('/flowbridge/retry', { method: 'POST' }))}
                >
                  Retry failed events
                </button>
              )}
            </div>
          </section>
          {!leads && (
            <nav className="staff-actions" aria-label="FlowBridge sections">
              {['customers', 'conversations', 'submissions', 'campaigns', 'forms', 'settings'].map(
                (t) => (
                  <button
                    key={t}
                    className={`button ${tab === t ? '' : 'secondary'}`}
                    onClick={() => {
                      setTab(t);
                      setSelected(null);
                    }}
                  >
                    {t[0].toUpperCase() + t.slice(1)}
                  </button>
                ),
              )}
            </nav>
          )}
          {(leads || ['customers', 'conversations', 'submissions'].includes(tab)) && (
            <section className="panel settings-body">
              <h2>{leads ? 'WhatsApp leads' : tab[0].toUpperCase() + tab.slice(1)}</h2>
              <div className="staff-form">
                <label>
                  Search recent contacts
                  <input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Name, email or phone"
                  />
                </label>
              </div>
              <p>
                Latest 100 contacts. Submitted registrations also appear in{' '}
                <Link href="/leads">CRM leads</Link>.
              </p>
              {!contacts.length && (
                <p>No WhatsApp enquiries yet. Share a campaign link to invite customers.</p>
              )}
              {contacts
                .filter((c: Row) => tab !== 'submissions' || leads || c.submission)
                .map((c: Row) => (
                  <div className="staff-review" key={c.id}>
                    <button className="button secondary" onClick={() => open(c)}>
                      {c.name || c.whatsappId}
                    </button>
                    <p>
                      {c.email || c.whatsappId} ? {c.status} ? {c.state}
                    </p>
                    {c.submission && (
                      <p>
                        {c.submission.service} {c.submission.city ? `? ${c.submission.city}` : ''}
                      </p>
                    )}
                  </div>
                ))}
            </section>
          )}
          {selected && (
            <section className="panel settings-body">
              <h2>{selected.name || selected.whatsappId}</h2>
              <label>
                Status
                <select
                  value={selected.status}
                  disabled={busy}
                  onChange={(e) => {
                    const status = e.target.value;
                    act(async () => {
                      await api(`/flowbridge/contacts/${selected.id}`, {
                        method: 'PATCH',
                        body: JSON.stringify({ status, notes }),
                      });
                      setSelected({ ...selected, status, notes });
                    });
                  }}
                >
                  {['NEW', 'CONTACTED', 'QUALIFIED', 'CLOSED'].map((s) => (
                    <option key={s}>{s}</option>
                  ))}
                </select>
              </label>
              <div className="staff-form">
                <label>
                  Notes
                  <textarea
                    maxLength={2000}
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                  />
                </label>
                <button
                  className="button secondary"
                  disabled={busy}
                  onClick={() =>
                    act(() =>
                      api(`/flowbridge/contacts/${selected.id}`, {
                        method: 'PATCH',
                        body: JSON.stringify({ status: selected.status, notes }),
                      }),
                    )
                  }
                >
                  Save notes
                </button>
              </div>
              {selected.submission && (
                <>
                  <h3>Registration</h3>
                  {Object.entries(selected.submission).map(([k, v]) => (
                    <p key={k}>
                      <strong>{k.replaceAll('_', ' ')}:</strong> {String(v)}
                    </p>
                  ))}
                </>
              )}
              <h3>Conversation ? latest 100 messages</h3>
              {messages.map((m) => (
                <p key={m.id}>
                  <strong>{m.direction === 'IN' ? 'Customer' : 'FlowBridge'}:</strong> {m.content}{' '}
                  {m.deliveryStatus ? `? ${m.deliveryStatus}` : ''}
                </p>
              ))}
            </section>
          )}
          {!leads && tab === 'campaigns' && (
            <section className="panel settings-body">
              <h2>Campaign links</h2>
              <p>Create a click-to-WhatsApp link and share it with prospective customers.</p>
              <form
                className="staff-form"
                onSubmit={(e) => {
                  e.preventDefault();
                  act(async () => {
                    await api('/flowbridge/campaigns', {
                      method: 'POST',
                      body: JSON.stringify({ name, phone, message }),
                    });
                    setName('');
                  });
                }}
              >
                <label>
                  Campaign name
                  <input
                    required
                    maxLength={100}
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                  />
                </label>
                <label>
                  WhatsApp business number (country code, digits only)
                  <input
                    required
                    pattern="[0-9]{8,15}"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                  />
                </label>
                <label>
                  Prefilled message
                  <input
                    required
                    maxLength={200}
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                  />
                </label>
                <button className="button" disabled={busy}>
                  Create campaign
                </button>
              </form>
              {data.campaigns.map((c: Row) => (
                <p key={c.id}>
                  <strong>{c.name}</strong>
                  <br />
                  <a href={c.url} target="_blank" rel="noreferrer">
                    {c.url}
                  </a>
                  <br />
                  <a href={`/api/flowbridge/campaigns/${c.id}/qr`}>Download QR code</a>
                </p>
              ))}
            </section>
          )}
          {!leads && tab === 'forms' && (
            <section className="panel settings-body">
              <h2>Registration form</h2>
              <p>
                Publish this registration Flow in your Meta WhatsApp account and configure its
                published ID on the API service.
              </p>
              <a href="/flowbridge-registration.json" download>
                Download registration Flow JSON
              </a>
              <p>Published Flow: {data.flowId || 'Not configured'}</p>
            </section>
          )}
          {!leads && tab === 'settings' && (
            <section className="panel settings-body">
              <h2>Connection settings</h2>
              <p>Credentials are configured privately in your API hosting environment.</p>
              <p>
                Required: Meta app secret, verify token, access token, phone number ID, published
                WhatsApp Flow ID, organization ID and business unit ID.
              </p>
              <p>Published Flow: {data.flowId || 'Not configured'}</p>
              <p>
                The registration Flow definition supplied in the ZIP is preserved in the project
                documentation.
              </p>
            </section>
          )}
        </>
      )}
    </div>
  );
}
