'use client';
import { useEffect, useRef, useState } from 'react';
import { api, type Row } from '@/lib/api';
import { useOs } from './shell';
import { Button } from './ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from './ui/dialog';
import { Loading } from './ui/states';
export const staffAttendanceRoles = [
  'Super Admin',
  'Operations Manager',
  'Business Manager',
  'Site Supervisor',
  'Accountant',
  'Finance/Admin',
];
type Location = { latitude: number; longitude: number; accuracy: number; capturedAt: string };
function locate(): Promise<Location> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation)
      return reject(new Error('Location is unavailable in this browser.'));
    navigator.geolocation.getCurrentPosition(
      (p) =>
        resolve({
          latitude: p.coords.latitude,
          longitude: p.coords.longitude,
          accuracy: p.coords.accuracy,
          capturedAt: new Date(p.timestamp).toISOString(),
        }),
      () => reject(new Error('Location permission is required. Enable location and try again.')),
      { enableHighAccuracy: true, maximumAge: 0, timeout: 20000 },
    );
  });
}
export function AttendanceHistory({ records }: { records: Row[] }) {
  return (
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
              <td>{r.status}</td>
              <td>
                {r.checkIn
                  ? new Date(r.checkIn).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })
                  : 'Not started'}
                <br />
                {r.checkOut
                  ? new Date(r.checkOut).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })
                  : 'Not stopped'}
              </td>
              <td>
                {r.startLatitude != null && (
                  <a
                    href={`/api/staff-attendance/${r.id}/photo/start`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Start photo
                  </a>
                )}
                {r.endLatitude != null && (
                  <>
                    <br />
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
      {!records.length && <p>No attendance recorded yet.</p>}
    </div>
  );
}
export function StaffHistory() {
  const [data, setData] = useState<Row | null>(null),
    [error, setError] = useState('');
  useEffect(() => {
    api<Row>('/staff-attendance')
      .then(setData)
      .catch((e) => setError(e.message));
  }, []);
  return (
    <div className="page staff-attendance">
      <h1>Staff attendance sheet</h1>
      {error && <p role="alert">{error}</p>}
      {data ? (
        <AttendanceHistory records={data.team.length ? data.team : data.records} />
      ) : (
        !error && <Loading />
      )}
    </div>
  );
}
export function StaffAttendance() {
  const { identity } = useOs();
  const allowed = staffAttendanceRoles.includes(identity.principal.role),
    supervisor = identity.principal.role === 'Site Supervisor';
  const [data, setData] = useState<Row | null>(null),
    [error, setError] = useState(''),
    [success, setSuccess] = useState(''),
    [busy, setBusy] = useState(false);
  const [siteId, setSiteId] = useState(''),
    [selectedDate, setSelectedDate] = useState(''),
    [sheetDate, setSheetDate] = useState(''),
    [reason, setReason] = useState('');
  const [status, setStatus] = useState('PRESENT'),
    [notes, setNotes] = useState(''),
    [reviewNotes, setReviewNotes] = useState<Record<string, string>>({});
  const [capture, setCapture] = useState<'START' | 'STOP' | null>(null),
    [facing, setFacing] = useState<'user' | 'environment'>('user'),
    [cameraReady, setCameraReady] = useState(false),
    [location, setLocation] = useState<Location | null>(null);
  const video = useRef<HTMLVideoElement>(null),
    stream = useRef<MediaStream | null>(null),
    captureSession = useRef(0);
  const load = async () => {
    const d = await api<Row>('/staff-attendance');
    setData(d);
    setSelectedDate((v) => v || d.today);
    setSiteId(
      (v) =>
        d.records.find((r: Row) => r.workDate.slice(0, 10) === d.today && r.checkIn && !r.checkOut)
          ?.siteId ||
        v ||
        d.sites[0]?.id ||
        '',
    );
  };
  useEffect(() => {
    if (allowed) load().catch((e) => setError(e.message));
  }, []);
  useEffect(() => {
    if (!capture) return;
    let disposed = false;
    setCameraReady(false);
    stream.current?.getTracks().forEach((t) => t.stop());
    stream.current = null;
    if (!navigator.mediaDevices?.getUserMedia) {
      setError('Camera access requires HTTPS and a supported browser.');
      return;
    }
    navigator.mediaDevices
      .getUserMedia({
        audio: false,
        video: {
          facingMode: facing === 'environment' ? { exact: 'environment' } : { ideal: 'user' },
          width: { ideal: 1280 },
          height: { ideal: 960 },
        },
      })
      .then(async (media) => {
        if (disposed) {
          media.getTracks().forEach((t) => t.stop());
          return;
        }
        stream.current = media;
        if (video.current) {
          video.current.srcObject = media;
          await video.current.play();
          const activeVideo = video.current;
          if (activeVideo.requestVideoFrameCallback) {
            activeVideo.requestVideoFrameCallback(() => {
              if (!disposed) setCameraReady(true);
            });
          } else if (!disposed && activeVideo.readyState >= 2) setCameraReady(true);
        }
      })
      .catch(() => {
        if (!disposed)
          setError(
            'Camera unavailable. Allow camera access, check that this camera is connected, and try again.',
          );
      });
    return () => {
      disposed = true;
      stream.current?.getTracks().forEach((t) => t.stop());
      stream.current = null;
    };
  }, [capture, facing]);
  function closeCamera() {
    captureSession.current++;
    setCapture(null);
    setLocation(null);
    setCameraReady(false);
    stream.current?.getTracks().forEach((t) => t.stop());
    stream.current = null;
  }
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
  function begin(action: 'START' | 'STOP') {
    setError('');
    setSuccess('');
    setLocation(null);
    setCapture(action);
    const session = ++captureSession.current;
    locate()
      .then((p) => {
        if (captureSession.current === session) setLocation(p);
      })
      .catch((e) => {
        if (captureSession.current === session) setError(e.message);
      });
  }
  async function mark() {
    if (!capture || !video.current || !cameraReady) return;
    const action = capture;
    await act(
      async () => {
        const canvas = document.createElement('canvas');
        const v = video.current!;
        const scale = Math.min(1, 1280 / Math.max(v.videoWidth, v.videoHeight));
        canvas.width = Math.round(v.videoWidth * scale);
        canvas.height = Math.round(v.videoHeight * scale);
        const ctx = canvas.getContext('2d');
        if (!ctx || !canvas.width || !canvas.height)
          throw new Error('Wait for the camera preview before capturing.');
        ctx.drawImage(v, 0, 0, canvas.width, canvas.height);
        const photo = await new Promise<Blob>((resolve, reject) =>
          canvas.toBlob(
            (b) => (b ? resolve(b) : reject(new Error('Unable to capture photo. Try again.'))),
            'image/jpeg',
            0.85,
          ),
        );
        const position = await locate();
        const body = new FormData();
        Object.entries({ ...position, action, siteId }).forEach(([k, v]) => body.set(k, String(v)));
        body.set('photo', photo, 'attendance-camera.jpg');
        await api('/staff-attendance/clock', { method: 'POST', body });
        closeCamera();
      },
      action === 'START' ? 'Attendance started.' : 'Attendance stopped.',
    );
  }
  if (!allowed)
    return (
      <div className="page">
        <h1>Attendance unavailable</h1>
      </div>
    );
  if (!data && !error) return <Loading />;
  const current = data?.records.find((r: Row) => r.workDate.slice(0, 10) === data.today);
  const date = selectedDate || data?.today;
  const missed: string[] = data?.calendar?.missedDays || [];
  const past = !!data && date < data.today,
    needsSheet = past ? missed.includes(date) : missed.length > 0;
  const requestDate = past ? date : missed[0];
  return (
    <div className="page staff-attendance">
      <div className="page-heading">
        <div>
          <div className="eyebrow">YOUR ATTENDANCE / IST</div>
          <h1>Attendance</h1>
          <p>
            {supervisor
              ? 'Start or stop your day with your current location and a live camera photo.'
              : 'Mark your own attendance manually and review missed-day sheets.'}
          </p>
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
      {data && (
        <>
          <section className="panel settings-body">
            <div className="staff-form">
              <label>
                Attendance date
                <input
                  type="date"
                  value={date}
                  max={data.today}
                  onChange={(e) => {
                    if (e.target.value) {
                      setSelectedDate(e.target.value);
                      setSheetDate('');
                    }
                  }}
                />
              </label>
            </div>
            <h2>
              {date === data.today ? 'Today' : date} {date === data.today ? data.today : ''}
            </h2>
            {supervisor ? (
              <>
                {current?.checkIn && !current.checkOut && !past ? (
                  <>
                    <p>Your day is in progress.</p>
                    <Button disabled={busy} onClick={() => begin('STOP')}>
                      Stop time
                    </Button>
                  </>
                ) : needsSheet ? (
                  <>
                    <p className="notice">
                      Fill the sheet for {requestDate}
                      {!past && missed.length > 1
                        ? ` and ${missed.length - 1} other missed working day(s)`
                        : ''}{' '}
                      before starting attendance.
                    </p>
                    <Button
                      onClick={() => {
                        setSheetDate(requestDate);
                        setReason('');
                      }}
                    >
                      Fill sheet
                    </Button>
                  </>
                ) : past ? (
                  <p>No missed-day sheet is needed for this date.</p>
                ) : current ? (
                  <p>Attendance is complete for today.</p>
                ) : data.calendar?.workingToday === false ? (
                  <p>Non-working day, as configured in the admin calendar.</p>
                ) : (
                  <div className="staff-form">
                    <label>
                      Assigned site
                      <select value={siteId} onChange={(e) => setSiteId(e.target.value)}>
                        <option value="" disabled>
                          Select your site
                        </option>
                        {data.sites.map((s: Row) => (
                          <option key={s.id} value={s.id}>
                            {s.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <Button disabled={busy || !siteId} onClick={() => begin('START')}>
                      Start time
                    </Button>
                  </div>
                )}
              </>
            ) : !past ? (
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
                    {['PRESENT', 'ABSENT', 'HALF_DAY'].map((s) => (
                      <option key={s}>{s}</option>
                    ))}
                  </select>
                </label>
                <label>
                  Notes
                  <input
                    maxLength={1000}
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                  />
                </label>
                <Button disabled={busy}>Save attendance</Button>
              </form>
            ) : (
              <>
                <p>Use a missed-day sheet to request a correction.</p>
                <Button onClick={() => setSheetDate(date)}>Fill sheet</Button>
              </>
            )}
            {sheetDate && (
              <form
                className="staff-form"
                onSubmit={(e) => {
                  e.preventDefault();
                  act(async () => {
                    await api('/staff-attendance/leaves', {
                      method: 'POST',
                      body: JSON.stringify({ date: sheetDate, reason }),
                    });
                    setSheetDate('');
                    setReason('');
                  }, 'Sheet sent to your manager.');
                }}
              >
                <h3>Missed-day sheet / {sheetDate}</h3>
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
                <div className="staff-actions">
                  <Button disabled={busy}>Send to manager</Button>
                  <Button
                    type="button"
                    variant="outline"
                    disabled={busy}
                    onClick={() => setSheetDate('')}
                  >
                    Cancel
                  </Button>
                </div>
              </form>
            )}
          </section>
          {!!data.leaves.length && (
            <section className="panel settings-body">
              <h2>Your sheets</h2>
              {data.leaves.map((r: Row) => (
                <p key={r.id}>
                  {r.workDate.slice(0, 10)} / {r.status} / {r.reason}
                  {r.reviewNote ? ` / ${r.reviewNote}` : ''}
                </p>
              ))}
            </section>
          )}
          {!!data.inbox.length && (
            <section className="panel settings-body">
              <h2>Manager review</h2>
              {data.inbox.map((r: Row) => (
                <div key={r.id} className="staff-review">
                  <strong>
                    {r.user.name} / {r.workDate.slice(0, 10)} / {r.status}
                  </strong>
                  <p>{r.reason}</p>
                  {r.status === 'PENDING' && (
                    <>
                      <label>
                        Review note
                        <input
                          maxLength={1000}
                          value={reviewNotes[r.id] || ''}
                          onChange={(e) =>
                            setReviewNotes((v) => ({ ...v, [r.id]: e.target.value }))
                          }
                        />
                      </label>
                      <div className="staff-actions">
                        {['APPROVED', 'REJECTED'].map((status) => (
                          <Button
                            key={status}
                            variant="outline"
                            disabled={busy}
                            onClick={() =>
                              act(
                                () =>
                                  api(`/staff-attendance/leaves/${r.id}`, {
                                    method: 'PATCH',
                                    body: JSON.stringify({ status, note: reviewNotes[r.id] || '' }),
                                  }),
                                'Review saved.',
                              )
                            }
                          >
                            {status === 'APPROVED' ? 'Approve leave' : 'Reject'}
                          </Button>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              ))}
            </section>
          )}
          <section className="panel settings-body">
            <h2>Your attendance history</h2>
            <AttendanceHistory records={data.records} />
          </section>
        </>
      )}
      <Dialog
        open={!!capture}
        onOpenChange={(open) => {
          if (!open && !busy) closeCamera();
        }}
      >
        <DialogContent className="attendance-camera-dialog">
          <DialogTitle>
            {capture === 'START' ? 'Start time' : 'Stop time'} / live camera
          </DialogTitle>
          <DialogDescription>
            Your location and a new camera photo are required. Choose front or back camera, then
            capture to mark attendance.
          </DialogDescription>
          {error && (
            <p role="alert" className="notice">
              {error}
            </p>
          )}
          <div className="camera-choices">
            {(['user', 'environment'] as const).map((value) => (
              <Button
                key={value}
                variant={facing === value ? 'default' : 'outline'}
                aria-pressed={facing === value}
                disabled={busy}
                onClick={() => {
                  setError('');
                  if (value !== facing) {
                    setCameraReady(false);
                    setFacing(value);
                  }
                }}
              >
                {value === 'user' ? 'Front camera' : 'Back camera'}
              </Button>
            ))}
          </div>
          <video
            className="attendance-camera"
            ref={video}
            autoPlay
            muted
            playsInline
            style={{ transform: facing === 'user' ? 'scaleX(-1)' : undefined }}
          />
          <p role="status">
            {location
              ? `Location captured (accuracy ${Math.round(location.accuracy)} m)`
              : 'Waiting for location permission...'}
          </p>
          <div className="staff-actions">
            <Button disabled={busy || !cameraReady || !location} onClick={mark}>
              {busy ? 'Marking attendance...' : 'Capture photo and mark attendance'}
            </Button>
            <Button variant="outline" disabled={busy} onClick={closeCamera}>
              Cancel
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
