import { test, expect, type Page } from '@playwright/test';
test.use({
  permissions: ['geolocation', 'camera'],
  geolocation: { latitude: 19.02, longitude: 72.82, accuracy: 10 },
  launchOptions: {
    executablePath: process.env.ATTENDANCE_BROWSER_EXECUTABLE,
    args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--disable-gpu', '--renderer-process-limit=1'],
  },
});
const today = new Date(Date.now() + 330 * 60000).toISOString().slice(0, 10);
const yesterday = new Date(new Date(today).getTime() - 86400000).toISOString().slice(0, 10);
const siteId = '11111111-1111-4111-a111-111111111111';
async function workspace(
  page: Page,
  options: { missed?: boolean; off?: boolean; denyCamera?: boolean } = {},
) {
  page.on('pageerror', (e) => console.log('Browser error:', e.message));
  page.on('requestfailed', (r) =>
    console.log('Failed request:', new URL(r.url()).pathname, r.failure()?.errorText),
  );
  page.on('response', (r) => {
    if (r.status() >= 400) console.log('HTTP error:', r.status(), new URL(r.url()).pathname);
  });
  let records: Record<string, unknown>[] = [];
  let submitted = false;
  const clocks: Buffer[] = [];
  await page.addInitScript(
    ({ denyCamera }) => {
      const w = window as any;
      w.cameraRequests = [];
      w.cameraStreams = [];
      w.locationRequests = 0;
      const native = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
      navigator.mediaDevices.getUserMedia = async (constraints) => {
        w.cameraRequests.push(constraints);
        if (denyCamera) throw new DOMException('Denied', 'NotAllowedError');
        const stream = await native({ audio: false, video: true });
        w.cameraStreams.push(stream);
        return stream;
      };
      const geo = navigator.geolocation.getCurrentPosition.bind(navigator.geolocation);
      navigator.geolocation.getCurrentPosition = (...args: Parameters<typeof geo>) => {
        w.locationRequests++;
        return geo(...args);
      };
    },
    { denyCamera: !!options.denyCamera },
  );
  await page.route('**/api/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    let body: unknown = {};
    if (path === '/api/auth/me')
      body = {
        user: { id: 'user', name: 'Diya Patil', email: 'supervisor@example.com' },
        organization: { id: 'org', name: 'Test organization' },
        businessUnits: [],
        principal: {
          role: 'Site Supervisor',
          scope: 'ASSIGNED',
          permissions: ['attendance:read', 'attendance:write'],
          employeeId: 'supervisor',
        },
      };
    else if (path === '/api/catalog')
      body = {
        attendance: {
          label: 'Attendance',
          group: 'Workforce',
          fields: [],
          columns: [],
          search: [],
          canWrite: true,
        },
      };
    else if (path === '/api/staff-attendance')
      body = {
        today,
        records,
        leaves: [],
        inbox: [],
        team: [],
        sites: [{ id: siteId, name: 'Assigned test site' }],
        calendar: {
          workingToday: !options.off,
          missedDays: options.missed && !submitted ? [yesterday] : [],
          trackingFrom: yesterday,
        },
      };
    else if (path === '/api/staff-attendance/clock') {
      const payload = route.request().postDataBuffer()!;
      clocks.push(payload);
      const stop = payload.toString().includes('STOP');
      records = [
        {
          id: 'day',
          userId: 'user',
          siteId,
          workDate: today,
          source: 'GPS_PHOTO',
          status: 'PRESENT',
          checkIn: new Date().toISOString(),
          checkOut: stop ? new Date().toISOString() : null,
          user: { name: 'Diya Patil' },
        },
      ];
      body = { ok: true };
    } else if (path === '/api/staff-attendance/leaves') {
      submitted = true;
      body = { ok: true };
    } else if (path === '/api/attendance/register')
      body = {
        date: today,
        siteId,
        sites: [{ id: siteId, name: 'Assigned test site' }],
        canWrite: true,
        rows: [
          {
            employeeId: 'supervisor',
            name: 'Diya Patil',
            position: 'SUPERVISOR',
            employeeCode: 'S001',
            status: null,
            notes: '',
            version: null,
            locked: true,
            shiftId: 'shift',
          },
          {
            employeeId: 'worker',
            name: 'Test Worker',
            position: 'WORKER',
            employeeCode: 'W001',
            status: null,
            notes: '',
            version: null,
            locked: false,
            shiftId: 'shift',
          },
        ],
      };
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(body),
    });
  });
  return { clocks };
}
test('supervisor captures fresh GPS and camera photos for start/stop, switches cameras, and never sees a file picker', async ({
  page,
}) => {
  const { clocks } = await workspace(page);
  await page.goto('/attendance');
  await expect(page.locator('input[type=file]')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Start time', exact: true })).toBeVisible({
    timeout: 15000,
  });
  await page.getByRole('button', { name: 'Start time', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await expect(
    dialog.getByRole('button', { name: 'Capture photo and mark attendance' }),
  ).toBeEnabled();
  expect(await page.evaluate(() => (window as any).locationRequests)).toBeGreaterThan(0);
  await dialog.getByRole('button', { name: 'Back camera', exact: true }).click();
  await expect
    .poll(() => page.evaluate(() => (window as any).cameraRequests.at(-1).video.facingMode))
    .toEqual({ exact: 'environment' });
  await expect(
    dialog.getByRole('button', { name: 'Capture photo and mark attendance' }),
  ).toBeEnabled();
  await dialog.getByRole('button', { name: 'Front camera', exact: true }).click();
  await expect(
    dialog.getByRole('button', { name: 'Capture photo and mark attendance' }),
  ).toBeEnabled();
  await page.screenshot({ path: '.local/supervisor-camera-preview.png', fullPage: true });
  await dialog.getByRole('button', { name: 'Capture photo and mark attendance' }).click();
  await expect(dialog).not.toBeVisible();
  await expect(page.getByRole('button', { name: 'Stop time', exact: true })).toBeVisible();
  expect(clocks).toHaveLength(1);
  expect(clocks[0].toString()).toContain('attendance-camera.jpg');
  expect(clocks[0].toString()).toContain('name="latitude"');
  await page.getByRole('button', { name: 'Stop time', exact: true }).click();
  await expect(
    dialog.getByRole('button', { name: 'Capture photo and mark attendance' }),
  ).toBeEnabled();
  await dialog.getByRole('button', { name: 'Capture photo and mark attendance' }).click();
  await expect(dialog).not.toBeVisible();
  expect(clocks).toHaveLength(2);
  expect(clocks[1].toString()).toContain('STOP');
  expect(
    await page.evaluate(() =>
      (window as any).cameraStreams.every((s: MediaStream) =>
        s.getTracks().every((t) => t.readyState === 'ended'),
      ),
    ),
  ).toBe(true);
});
test('a missed previous working day replaces Start with Fill sheet and unlocks after submission', async ({
  page,
}) => {
  await workspace(page, { missed: true });
  await page.goto('/attendance');
  await expect(page.getByRole('button', { name: 'Start time', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Fill sheet', exact: true }).click();
  await page.getByLabel('Reason', { exact: true }).fill('Missed attendance yesterday');
  await page.getByRole('button', { name: 'Send to manager', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Start time', exact: true })).toBeVisible();
});
test('non-working days do not offer Start or Fill sheet', async ({ page }) => {
  await workspace(page, { off: true });
  await page.goto('/attendance');
  await expect(
    page.getByText('Non-working day, as configured in the admin calendar.'),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: 'Start time', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Fill sheet', exact: true })).toHaveCount(0);
});
test('Staff attendance contains only the team sheet', async ({ page }) => {
  await workspace(page);
  await page.goto('/staff-attendance');
  await expect(
    page.getByRole('heading', { name: 'Staff attendance sheet', exact: true }),
  ).toBeVisible();
  await expect(page.getByText('Test Worker', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Start time', exact: true })).toHaveCount(0);
  await expect(page.locator('input[type=file]')).toHaveCount(0);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect
    .poll(() => page.locator('aside').evaluate((el) => el.getBoundingClientRect().right))
    .toBeLessThanOrEqual(1);
  await page.screenshot({ path: '.local/supervisor-worker-sheet-mobile.png', fullPage: true });
});
test('camera permission failure leaves attendance unchanged and cancel stops any streams', async ({
  page,
}) => {
  const { clocks } = await workspace(page, { denyCamera: true });
  await page.goto('/attendance');
  await page.getByRole('button', { name: 'Start time', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('alert')).toContainText('Camera unavailable');
  await expect(
    dialog.getByRole('button', { name: 'Capture photo and mark attendance' }),
  ).toBeDisabled();
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
  expect(clocks).toHaveLength(0);
  await expect(page.getByRole('button', { name: 'Start time', exact: true })).toBeVisible();
});

test('admin configures weekly workdays and a date-specific holiday', async ({ page }) => {
  await workspace(page);
  await page.route('**/api/auth/me', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        user: { id: 'admin', name: 'Administrator', email: 'admin@useless.example' },
        organization: { id: 'org', name: 'Test organization' },
        businessUnits: [],
        principal: {
          role: 'Super Admin',
          scope: 'ORGANIZATION',
          permissions: ['attendance:read', 'attendance:write', 'users:manage'],
          employeeId: null,
        },
      }),
    }),
  );
  let weekdays = [0, 1, 2, 3, 4, 5, 6];
  let exceptions: Record<string, unknown>[] = [];
  await page.route('**/api/admin/work-calendar**', async (route) => {
    if (route.request().method() === 'PUT') {
      const body = route.request().postDataJSON();
      if (new URL(route.request().url()).pathname.endsWith('/day'))
        exceptions = [{ date: body.date, working: body.working, label: body.label }];
      else weekdays = body.workingWeekdays;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ok: true }),
      });
    } else
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          month: today.slice(0, 7),
          workingWeekdays: weekdays,
          trackingFrom: today,
          days: exceptions,
        }),
      });
  });
  await page.goto('/work-calendar');
  await expect(page.getByRole('heading', { name: 'Work calendar', exact: true })).toBeVisible();
  await page.getByLabel('Sun', { exact: true }).uncheck();
  await page.getByRole('button', { name: 'Save weekly schedule', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Calendar saved');
  await expect(page.getByLabel('Sun', { exact: true })).not.toBeChecked();
  await page.getByRole('button', { name: new RegExp(`^${today},`) }).click();
  await page.getByLabel('Day type', { exact: true }).selectOption('OFF');
  await page.getByLabel('Label', { exact: true }).fill('Holiday test');
  await page.getByRole('button', { name: 'Save date', exact: true }).click();
  await expect(
    page.getByRole('button', { name: `${today}, non-working, Holiday test`, exact: true }),
  ).toBeVisible();
  await page.screenshot({ path: '.local/admin-work-calendar.png', fullPage: true });
});
