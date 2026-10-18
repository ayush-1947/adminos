'use client';
import { useEffect, useRef, useState } from 'react';
import { api, type Row } from '@/lib/api';
import { useOs } from './shell';
import { AttendanceRegister } from './attendance-register';
import { Loading } from './ui/states';

export function StaffAttendance({ workers = false }: { workers?: boolean }) {
  const { identity } = useOs();
  const staffAllowed = [
    'Super Admin',
    'Operations Manager',
    'Business Manager',
    'Site Supervisor',
    'Accountant',
    'Finance/Admin',
  ].includes(identity.principal.role);
  const supervisor = identity.principal.role === 'Site Supervisor';
  const [data, setData] = useState<Row | null>(null);
  const [error, setError] = useState(''),
    [success, setSuccess] = useState(''),
    [busy, setBusy] = useState(false);
  const [siteId, setSiteId] = useState(''),
    [photo, setPhoto] = useState<File | null>(null);
  const [location, setLocation] = useState<{
    latitude: number;
    longitude: number;
    accuracy: number;
    capturedAt: string;
  } | null>(null);
  const [date, setDate] = useState(''),
    [reason, setReason] = useState(''),
    [status, setStatus] = useState('PRESENT'),
    [notes, setNotes] = useState('');
  const [reviewNotes, setReviewNotes] = useState<Record<string, string>>({});
  const photoInput = useRef<HTMLInputElement>(null);
  const load = async () => {
    const d = await api<Row>('/staff-attendance');
    setData(d);
    setSiteId(
      (s) =>
        d.records.find((r: Row) => r.workDate.slice(0, 10) === d.today && r.checkIn && !r.checkOut)
          ?.siteId ||
        s ||
        d.sites[0]?.id ||
        '',
    );
  };
  useEffect(() => {
    if (!staffAllowed) return;
    load().catch((e) => setError(e.message));
  }, []);
  async function act(fn: () => Promise<unknown>, message: string) {
    setBusy(true);
    setError('');
    setSuccess('');
    try {
      await fn();
      setSuccess(message);
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  function locate() {
    setLocation(null);
    setError('');
    if (!navigator.geolocation) {
      setError('This browser does not support location.');
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (p) =>
        setLocation({
          latitude: p.coords.latitude,
          longitude: p.coords.longitude,
          accuracy: p.coords.accuracy,
          capturedAt: new Date(p.timestamp).toISOString(),
        }),
      (e) =>
        setError(`Location unavailable: ${e.message}. Enable location permission and try again.`),
      { enableHighAccuracy: true, maximumAge: 0, timeout: 20000 },
    );
  }
  async function clock(action: string) {
    if (!location || !photo) {
      setError('Capture your current location and select a photo first.');
      return;
    }
    const body = new FormData();
    Object.entries({ ...location, siteId, action }).forEach(([k, v]) => body.set(k, String(v)));
    body.set('photo', photo);
    await act(
      async () => {
        await api('/staff-attendance/clock', { method: 'POST', body });
        setPhoto(null);
        setLocation(null);
        if (photoInput.current) photoInput.current.value = '';
      },
      action === 'START' ? 'Attendance started.' : 'Attendance stopped.',
    );
  }
  if (!staffAllowed)
    return (
      <div className="page">
        <h1>Staff attendance unavailable</h1>
        <p>This workspace is for staff accounts.</p>
      </div>
    );
  if (!data && !error) return <Loading />;
  const current = data?.records.find((r: Row) => r.workDate.slice(0, 10) === data.today);
  const pendingDay = data?.records.find(
    (r: Row) =>
      r.source === 'GPS_PHOTO' && r.checkIn && !r.checkOut && r.workDate.slice(0, 10) < data.today,
  );
  const rows = (records: Row[]) => (
    <div className="table-scroll">
      <table>
        <thead>
          <tr>
            <th>Person / date</th>
            <th>Status</th>
            <th>Start / stop (IST)</th>
            <th>Evidence</th>
          </tr>
        </thead>
        <tbody>
          {records.map((r) => (
            <tr key={r.id}>
              <td>
                {r.user?.name}
                <br />
                {r.workDate.slice(0, 10)}
              </td>
              <td>
                {r.status} ? {r.source}
              </td>
              <td>
                {r.checkIn
                  ? new Date(r.checkIn).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })
                  : '?'}
                <br />
                {r.checkOut
                  ? new Date(r.checkOut).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })
                  : '?'}
              </td>
              <td>
                {r.startLatitude != null && (
                  <>
                    <a
                      href={`https://www.google.com/maps?q=${r.startLatitude},${r.startLongitude}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Start GPS
                    </a>{' '}
                    ?{' '}
                    <a
                      href={`/api/staff-attendance/${r.id}/photo/start`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Start photo
                    </a>
                  </>
                )}
                {r.endLatitude != null && (
                  <>
                    <br />
                    <a
                      href={`https://www.google.com/maps?q=${r.endLatitude},${r.endLongitude}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Stop GPS
                    </a>{' '}
                    ?{' '}
                    <a
                      href={`/api/staff-attendance/${r.id}/photo/stop`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Stop photo
                    </a>
                  </>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
  return (
    <>
      <div className="page staff-attendance">
        <div className="page-heading">
          <div>
            <div className="eyebrow">STAFF ATTENDANCE ? IST</div>
            <h1>{supervisor ? 'Start your working day' : 'Staff attendance'}</h1>
            <p>
              {supervisor
                ? 'Mark your own attendance with location and a photo. Mark workers in the sheet below.'
                : 'Mark your daily attendance manually and review leave requests.'}
            </p>
          </div>
        </div>
        {error && (
          <p role="alert" className="notice">
            {error}
          </p>
        )}
        {success && (
          <p role="status" className="notice">
            {success}
          </p>
        )}
        {data && (
          <>
            <section className="panel settings-body">
              <h2>Today ? {data.today}</h2>
              <p>
                {current
                  ? `${current.status} ? ${current.checkOut ? 'Day completed' : current.checkIn ? 'Day started' : 'Manually marked'}`
                  : 'Attendance not started'}
              </p>
              {pendingDay && (
                <p className="notice">
                  {pendingDay.workDate.slice(0, 10)} is unfinished. Submit a leave/correction sheet
                  below for manager review.
                </p>
              )}
              {supervisor ? (
                <div className="staff-form">
                  <label>
                    Assigned site
                    <select
                      disabled={busy || !!current?.checkIn}
                      value={siteId}
                      onChange={(e) => {
                        setSiteId(e.target.value);
                        setLocation(null);
                      }}
                    >
                      {data.sites.map((s: Row) => (
                        <option key={s.id} value={s.id}>
                          {s.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <button className="button secondary" disabled={busy} onClick={locate}>
                    Capture current location
                  </button>
                  {location && (
                    <p>
                      Location captured ? accuracy {Math.round(location.accuracy)} m ?{' '}
                      {location.latitude.toFixed(5)}, {location.longitude.toFixed(5)}
                    </p>
                  )}
                  <label>
                    Attendance photo (JPEG/PNG, up to 2 MB)
                    <input
                      ref={photoInput}
                      type="file"
                      accept="image/jpeg,image/png"
                      capture="user"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f && f.size > 2 * 1024 * 1024) {
                          setError('Choose a photo under 2 MB.');
                          setPhoto(null);
                        } else setPhoto(f || null);
                      }}
                    />
                  </label>
                  <div className="staff-actions">
                    <button
                      className="button"
                      disabled={busy || !!current || !siteId}
                      onClick={() => clock('START')}
                    >
                      Start time
                    </button>
                    <button
                      className="button secondary"
                      disabled={busy || !current?.checkIn || !!current?.checkOut}
                      onClick={() => clock('STOP')}
                    >
                      Stop time
                    </button>
                  </div>
                </div>
              ) : (
                <form
                  className="staff-form"
                  onSubmit={(e) => {
                    e.preventDefault();
                    act(
                      () =>
                        api('/staff-attendance/manual', {
                          method: 'POST',
                          body: JSON.stringify({ status, notes }),
                        }),
                      'Attendance saved.',
                    );
                  }}
                >
                  <label>
                    Status
                    <select value={status} onChange={(e) => setStatus(e.target.value)}>
                      <option>PRESENT</option>
                      <option>ABSENT</option>
                      <option>HALF_DAY</option>
                    </select>
                  </label>
                  <label>
                    Notes
                    <input
                      value={notes}
                      maxLength={1000}
                      onChange={(e) => setNotes(e.target.value)}
                    />
                  </label>
                  <button className="button" disabled={busy}>
                    Save today's attendance
                  </button>
                </form>
              )}
            </section>
            <section className="panel settings-body">
              <h2>Missed day / leave sheet</h2>
              <p>Send a previous missed or unfinished day directly to your reporting manager.</p>
              <form
                className="staff-form"
                onSubmit={(e) => {
                  e.preventDefault();
                  act(async () => {
                    await api('/staff-attendance/leaves', {
                      method: 'POST',
                      body: JSON.stringify({ date, reason }),
                    });
                    setReason('');
                  }, 'Request sent to your manager.');
                }}
              >
                <label>
                  Date
                  <input
                    type="date"
                    required
                    value={date}
                    max={new Date(new Date(data.today).getTime() - 86400000)
                      .toISOString()
                      .slice(0, 10)}
                    onChange={(e) => setDate(e.target.value)}
                  />
                </label>
                <label>
                  Reason
                  <textarea
                    required
                    minLength={5}
                    maxLength={2000}
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                  />
                </label>
                <button className="button" disabled={busy}>
                  Send leave sheet
                </button>
              </form>
              {data.leaves.map((r: Row) => (
                <p key={r.id}>
                  {r.workDate.slice(0, 10)} ? {r.status} ? {r.reason}
                  {r.reviewNote ? ` ? ${r.reviewNote}` : ''}
                </p>
              ))}
            </section>
            {!!data.inbox.length && (
              <section className="panel settings-body">
                <h2>Manager review</h2>
                {data.inbox.map((r: Row) => (
                  <div key={r.id} className="staff-review">
                    <strong>
                      {r.user.name} ? {r.workDate.slice(0, 10)} ? {r.status}
                    </strong>
                    <p>{r.reason}</p>
                    {r.status === 'PENDING' && (
                      <>
                        <label>
                          Review note
                          <input
                            value={reviewNotes[r.id] || ''}
                            maxLength={1000}
                            onChange={(e) =>
                              setReviewNotes((v) => ({ ...v, [r.id]: e.target.value }))
                            }
                          />
                        </label>
                        <div className="staff-actions">
                          {['APPROVED', 'REJECTED'].map((s) => (
                            <button
                              className="button secondary"
                              key={s}
                              disabled={busy}
                              onClick={() =>
                                act(
                                  () =>
                                    api(`/staff-attendance/leaves/${r.id}`, {
                                      method: 'PATCH',
                                      body: JSON.stringify({
                                        status: s,
                                        note: reviewNotes[r.id] || '',
                                      }),
                                    }),
                                  'Review saved.',
                                )
                              }
                            >
                              {s === 'APPROVED' ? 'Approve leave' : 'Reject'}
                            </button>
                          ))}
                        </div>
                      </>
                    )}
                  </div>
                ))}
              </section>
            )}
            <section className="panel settings-body">
              <h2>Your attendance ? latest 60 days</h2>
              {rows(data.records)}
            </section>
            {!!data.team.length && (
              <section className="panel settings-body">
                <h2>Team staff attendance</h2>
                {rows(data.team)}
              </section>
            )}
          </>
        )}
      </div>
      {workers && <AttendanceRegister />}
    </>
  );
}
