'use client';
import { useEffect, useState } from 'react';
import { api, type Row } from '@/lib/api';
import { Button } from './ui/button';
import { Loading } from './ui/states';
const weekdays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
export function WorkCalendar() {
  const today = new Date(Date.now() + 330 * 60000).toISOString().slice(0, 10);
  const [month, setMonth] = useState(today.slice(0, 7)),
    [data, setData] = useState<Row | null>(null),
    [days, setDays] = useState<number[]>([]),
    [trackingFrom, setTrackingFrom] = useState(today);
  const [selected, setSelected] = useState(''),
    [mode, setMode] = useState('DEFAULT'),
    [label, setLabel] = useState(''),
    [error, setError] = useState(''),
    [success, setSuccess] = useState(''),
    [busy, setBusy] = useState(false);
  async function load() {
    const d = await api<Row>(`/admin/work-calendar?month=${month}`);
    setData(d);
    setDays(d.workingWeekdays);
    setTrackingFrom(d.trackingFrom);
  }
  useEffect(() => {
    setData(null);
    setSelected('');
    load().catch((e) => setError(e.message));
  }, [month]);
  async function save(fn: () => Promise<unknown>) {
    setBusy(true);
    setError('');
    setSuccess('');
    try {
      await fn();
      await load();
      setSuccess('Calendar saved. Attendance rules have been updated.');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  function choose(date: string) {
    setSelected(date);
    const d = data?.days.find((d: Row) => d.date.slice(0, 10) === date);
    setMode(d ? (d.working ? 'WORKING' : 'OFF') : 'DEFAULT');
    setLabel(d?.label || '');
  }
  const first = new Date(`${month}-01T00:00:00Z`);
  const length = new Date(
    Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0),
  ).getUTCDate();
  return (
    <div className="page staff-attendance">
      <div className="page-heading">
        <div>
          <div className="eyebrow">ADMIN / ATTENDANCE</div>
          <h1>Work calendar</h1>
          <p>Choose working weekdays, holidays and special working days for your organization.</p>
        </div>
      </div>
      {error && (
        <p className="notice" role="alert">
          {error}
        </p>
      )}
      {success && (
        <p className="notice" role="status">
          {success}
        </p>
      )}
      {!data && !error && <Loading />}
      {data && (
        <>
          <section className="panel settings-body">
            <h2>Weekly schedule</h2>
            <form
              className="staff-form"
              onSubmit={(e) => {
                e.preventDefault();
                save(() =>
                  api('/admin/work-calendar', {
                    method: 'PUT',
                    body: JSON.stringify({ workingWeekdays: days, trackingFrom }),
                  }),
                );
              }}
            >
              <div className="calendar-weekdays">
                {weekdays.map((name, i) => (
                  <label key={name}>
                    <input
                      type="checkbox"
                      checked={days.includes(i)}
                      onChange={(e) =>
                        setDays((v) => (e.target.checked ? [...v, i] : v.filter((d) => d !== i)))
                      }
                    />
                    {name}
                  </label>
                ))}
              </div>
              <label>
                Check missed attendance from
                <input
                  type="date"
                  required
                  min="2020-01-01"
                  max={today}
                  value={trackingFrom}
                  onChange={(e) => setTrackingFrom(e.target.value)}
                />
              </label>
              <p>
                Only working dates on or after this date and the staff member's account creation
                date require attendance. Non-working days never require a missed-day sheet.
              </p>
              <Button disabled={busy}>Save weekly schedule</Button>
            </form>
          </section>
          <section className="panel settings-body">
            <h2>Holidays and special working days</h2>
            <div className="staff-form">
              <label>
                Month
                <input
                  type="month"
                  value={month}
                  onChange={(e) => {
                    if (e.target.value) setMonth(e.target.value);
                  }}
                />
              </label>
            </div>
            <p>
              Green means working. Grey means non-working. Select a date to override its weekly
              schedule.
            </p>
            <div className="work-calendar-grid">
              {weekdays.map((d) => (
                <strong key={d}>{d}</strong>
              ))}
              {Array.from({ length: first.getUTCDay() }, (_, i) => (
                <span key={`blank-${i}`} />
              ))}
              {Array.from({ length }, (_, i) => {
                const date = `${month}-${String(i + 1).padStart(2, '0')}`,
                  override = data.days.find((d: Row) => d.date.slice(0, 10) === date),
                  working =
                    override?.working ??
                    data.workingWeekdays.includes(new Date(`${date}T00:00:00Z`).getUTCDay());
                return (
                  <button
                    key={date}
                    className={`calendar-day ${working ? 'working' : 'off'} ${selected === date ? 'selected' : ''}`}
                    aria-label={`${date}, ${working ? 'working' : 'non-working'}${override?.label ? ', ' + override.label : ''}`}
                    aria-pressed={selected === date}
                    onClick={() => choose(date)}
                  >
                    <strong>{i + 1}</strong>
                    <span>{working ? 'Working' : 'Off'}</span>
                    {override?.label && <small>{override.label}</small>}
                  </button>
                );
              })}
            </div>
            {selected && (
              <form
                className="staff-form"
                onSubmit={(e) => {
                  e.preventDefault();
                  save(() =>
                    api('/admin/work-calendar/day', {
                      method: 'PUT',
                      body: JSON.stringify({
                        date: selected,
                        working: mode === 'DEFAULT' ? null : mode === 'WORKING',
                        label,
                      }),
                    }),
                  );
                }}
              >
                <h3>{selected}</h3>
                <label>
                  Day type
                  <select value={mode} onChange={(e) => setMode(e.target.value)}>
                    <option value="DEFAULT">Use weekly schedule</option>
                    <option value="WORKING">Working day</option>
                    <option value="OFF">Non-working day / holiday</option>
                  </select>
                </label>
                <label>
                  Label
                  <input
                    value={label}
                    maxLength={160}
                    placeholder="For example: public holiday"
                    onChange={(e) => setLabel(e.target.value)}
                  />
                </label>
                <Button disabled={busy}>Save date</Button>
              </form>
            )}
          </section>
        </>
      )}
    </div>
  );
}
