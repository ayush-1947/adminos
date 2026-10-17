'use client';

import { useEffect, useRef, useState } from 'react';
import { CalendarCheck, Check, Loader2, RefreshCw } from 'lucide-react';
import { api } from '@/lib/api';
import { Loading } from './ui/states';

type Status = 'PRESENT' | 'ABSENT' | 'HALF_DAY';
type Person = {
  employeeId: string;
  name: string;
  employeeCode: string;
  position: string;
  status: string | null;
  notes: string;
  version: string | null;
  locked: boolean;
  shiftId: string | null;
};
type Register = {
  date: string;
  siteId: string | null;
  sites: { id: string; name: string }[];
  rows: Person[];
  canWrite: boolean;
};
const choices: { value: Status; label: string }[] = [
  { value: 'PRESENT', label: 'Present' },
  { value: 'ABSENT', label: 'Absent' },
  { value: 'HALF_DAY', label: 'Half day' },
];
const today = () => new Date(Date.now() + 330 * 60000).toISOString().slice(0, 10);

export function AttendanceRegister() {
  const [date, setDate] = useState(today);
  const [siteId, setSiteId] = useState('');
  const [data, setData] = useState<Register | null>(null);
  const [drafts, setDrafts] = useState<Record<string, { status: string | null; notes: string }>>(
    {},
  );
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [retry, setRetry] = useState(0);
  const revision = useRef(0);
  const dirty = Object.keys(drafts).length;

  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  useEffect(() => {
    const current = ++revision.current;
    setLoading(true);
    setError('');
    setSuccess('');
    const query = new URLSearchParams({ date, ...(siteId ? { siteId } : {}) });
    api<Register>(`/attendance/register?${query}`)
      .then((result) => {
        if (current === revision.current) {
          setData(result);
          setDrafts({});
        }
      })
      .catch((e) => {
        if (current === revision.current) {
          setError(e.message);
          setData(null);
          setDrafts({});
        }
      })
      .finally(() => {
        if (current === revision.current) setLoading(false);
      });
    return () => {
      revision.current++;
    };
  }, [date, siteId, retry]);

  function change(person: Person, update: Partial<{ status: string | null; notes: string }>) {
    setSuccess('');
    setDrafts((previous) => {
      const next = {
        ...previous,
        [person.employeeId]: {
          ...(previous[person.employeeId] || { status: person.status, notes: person.notes }),
          ...update,
        },
      };
      if (
        next[person.employeeId].status === person.status &&
        next[person.employeeId].notes === person.notes
      )
        delete next[person.employeeId];
      return next;
    });
  }
  function canNavigate() {
    return (
      !dirty ||
      window.confirm('You have attendance changes that have not been saved. Discard them?')
    );
  }
  async function save() {
    if (!data?.siteId) return;
    const entries = data.rows
      .filter((p) => drafts[p.employeeId])
      .map((p) => ({ employeeId: p.employeeId, version: p.version, ...drafts[p.employeeId] }));
    if (entries.some((e) => !e.status)) {
      setError('Choose Present, Absent or Half day for each person with a note.');
      return;
    }
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      const result = await api<Register>('/attendance/register', {
        method: 'POST',
        body: JSON.stringify({ date, siteId: data.siteId, entries }),
      });
      setData(result);
      setDrafts({});
      setSuccess('Attendance saved.');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="attendance-register" aria-label="Daily attendance">
      <header className="attendance-heading">
        <div>
          <span className="attendance-eyebrow">
            <CalendarCheck size={17} /> DAILY ATTENDANCE
          </span>
          <h1>Mark attendance</h1>
          <p>Choose a status beside each person. Add a note if needed, then save.</p>
        </div>
      </header>
      <div className="attendance-filters">
        <label>
          Site
          <select
            value={siteId || data?.siteId || ''}
            disabled={saving || loading}
            onChange={(e) => {
              if (canNavigate()) {
                setDrafts({});
                setSiteId(e.target.value);
              }
            }}
          >
            <option value="" disabled>
              Choose a site
            </option>
            {data?.sites.map((site) => (
              <option value={site.id} key={site.id}>
                {site.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Date
          <input
            type="date"
            value={date}
            max={today()}
            disabled={saving}
            onChange={(e) => {
              if (e.target.value && canNavigate()) {
                setDrafts({});
                setDate(e.target.value);
              }
            }}
          />
        </label>
        <button
          type="button"
          className="attendance-reload"
          disabled={saving || loading}
          onClick={() => {
            if (canNavigate()) setRetry((v) => v + 1);
          }}
        >
          <RefreshCw size={16} /> Reload
        </button>
      </div>
      {error && (
        <div className="form-error" role="alert">
          {error}
        </div>
      )}
      {success && (
        <div className="attendance-success" role="status">
          <Check size={18} /> {success}
        </div>
      )}
      {loading ? (
        <Loading label="Loading your team…" />
      ) : (
        data && (
          <>
            {!data.sites.length ? (
              <p className="attendance-empty">
                No sites are assigned to you. Ask your administrator to link your site.
              </p>
            ) : !data.rows.length ? (
              <p className="attendance-empty">
                No supervisors or workers are assigned here for this date.
              </p>
            ) : (
              <div className="attendance-people">
                {data.rows.map((person) => {
                  const draft = drafts[person.employeeId] || person;
                  const disabled = saving || !data.canWrite || person.locked || !person.shiftId;
                  return (
                    <article className="attendance-person" key={person.employeeId}>
                      <div className="attendance-person-name">
                        <strong>{person.name}</strong>
                        <span>
                          {person.position === 'SUPERVISOR' ? 'Supervisor' : 'Worker'} ·{' '}
                          {person.employeeCode}
                        </span>
                        {person.locked && <small>Reviewed by manager</small>}
                        {!person.shiftId && <small>A shift needs to be configured</small>}
                      </div>
                      <div
                        className="attendance-statuses"
                        role="group"
                        aria-label={`Attendance for ${person.name}`}
                      >
                        {choices.map((choice) => (
                          <button
                            type="button"
                            key={choice.value}
                            className={`attendance-choice attendance-${choice.value.toLowerCase()}`}
                            aria-pressed={draft.status === choice.value}
                            disabled={disabled}
                            onClick={() => change(person, { status: choice.value })}
                          >
                            {draft.status === choice.value && <Check size={16} />}
                            {choice.label}
                          </button>
                        ))}
                      </div>
                      <label className="attendance-note">
                        <span>
                          Notes <small>(optional)</small>
                        </span>
                        <input
                          aria-label={`Notes for ${person.name}`}
                          placeholder="Add a note…"
                          maxLength={1000}
                          disabled={disabled}
                          value={draft.notes}
                          onChange={(e) => change(person, { notes: e.target.value })}
                        />
                      </label>
                    </article>
                  );
                })}
              </div>
            )}
            {!!data.rows.length && (
              <div className="attendance-save-bar">
                <span>
                  {dirty
                    ? `${dirty} ${dirty === 1 ? 'person' : 'people'} to save`
                    : 'No unsaved changes'}
                </span>
                <button type="button" disabled={!dirty || saving || !data.canWrite} onClick={save}>
                  {saving ? <Loader2 size={20} className="animate-spin" /> : <Check size={20} />}
                  {saving ? 'Saving…' : 'Save attendance'}
                </button>
              </div>
            )}
          </>
        )
      )}
    </section>
  );
}
