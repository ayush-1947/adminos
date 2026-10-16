'use client';
import { useEffect, useState } from 'react';
import { Check, KeyRound, Plus, ShieldCheck, Users } from 'lucide-react';
import { api, title, type Row } from '@/lib/api';
import { useOs } from './shell';
import { ProfileLink } from './profile';
import { RelationInput } from './records';
import { Button } from './ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from './ui/dialog';
import { ErrorState, Loading } from './ui/states';
export function Settings() {
  const { identity } = useOs();
  const [users, setUsers] = useState<Row[]>([]),
    [roles, setRoles] = useState<Row[]>([]),
    [permissions, setPermissions] = useState<string[]>([]),
    [role, setRole] = useState(''),
    [selected, setSelected] = useState<string[]>([]),
    [error, setError] = useState(''),
    [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false),
    [open, setOpen] = useState(false),
    [employeeId, setEmployeeId] = useState(''),
    [clientId, setClientId] = useState(''),
    [unit, setUnit] = useState(identity.businessUnits[0]?.id || ''),
    [message, setMessage] = useState(''),
    [deviceSite, setDeviceSite] = useState(''),
    [deviceKey, setDeviceKey] = useState(''),
    [cardEmployee, setCardEmployee] = useState('');
  const load = () => {
    setError('');
    setLoading(true);
    Promise.all([
      api<Row[]>('/admin/users'),
      api<{ roles: Row[]; permissions: string[] }>('/admin/roles'),
    ])
      .then(([u, r]) => {
        setUsers(u);
        setRoles(r.roles);
        setPermissions(r.permissions);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  };
  useEffect(load, []);
  function chooseRole(id: string) {
    setRole(id);
    setSelected(
      roles.find((r) => r.id === id)?.rolePermission_role.map((r: Row) => r.permission.key) || [],
    );
    setMessage('');
  }
  if (loading) return <Loading />;
  return (
    <div className="page">
      <div className="page-heading">
        <div>
          <div className="eyebrow">ORGANIZATION / ACCESS CONTROL</div>
          <h1>Settings & access</h1>
          <p>Manage identities, granular permissions, and attendance devices.</p>
        </div>
        <Button onClick={() => setOpen(true)}>
          <Plus />
          Create user
        </Button>
      </div>
      {error && (
        <div role="alert" className="form-error">
          {error}
        </div>
      )}
      {message && (
        <div className="success-message" role="status">
          {message}
        </div>
      )}
      <section className="panel">
        <div className="panel-heading">
          <div>
            <h2>Workspace users</h2>
            <p>{users.length} accounts · deactivation revokes all active sessions</p>
          </div>
          <Users size={20} />
        </div>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Role</th>
                <th>Status</th>
                <th>Access</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id}>
                  <td className="primary-cell">
                    <ProfileLink type="users" id={u.id}>
                      {u.name}
                    </ProfileLink>
                  </td>
                  <td>{u.email}</td>
                  <td>{u.role.name}</td>
                  <td>
                    <span className={`badge ${u.status === 'ACTIVE' ? 'green' : 'neutral'}`}>
                      {title(u.status)}
                    </span>
                  </td>
                  <td>
                    {u.id === identity.user.id ? (
                      <span className="muted">You</span>
                    ) : (
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={busy}
                        onClick={async () => {
                          setBusy(true);
                          try {
                            await api(`/admin/users/${u.id}/status`, {
                              method: 'PATCH',
                              body: JSON.stringify({
                                status: u.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE',
                              }),
                            });
                            load();
                          } catch (e) {
                            setError((e as Error).message);
                          } finally {
                            setBusy(false);
                          }
                        }}
                      >
                        {u.status === 'ACTIVE' ? 'Deactivate' : 'Activate'}
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <section className="panel settings-panel">
        <div className="panel-heading">
          <div>
            <h2>Role permissions</h2>
            <p>Permissions are checked by the API for every read and write.</p>
          </div>
          <ShieldCheck size={20} />
        </div>
        <div className="settings-body">
          <label>
            Role
            <select value={role} onChange={(e) => chooseRole(e.target.value)}>
              <option value="">Select a role</option>
              {roles
                .filter((r) => r.name !== 'Super Admin')
                .map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name} · {title(r.scope)}
                  </option>
                ))}
            </select>
          </label>
          {role && (
            <>
              <div className="permission-grid">
                {permissions.map((p) => (
                  <label key={p}>
                    <input
                      type="checkbox"
                      checked={selected.includes(p)}
                      onChange={(e) =>
                        setSelected(
                          e.target.checked ? [...selected, p] : selected.filter((v) => v !== p),
                        )
                      }
                    />
                    {p}
                  </label>
                ))}
              </div>
              <Button
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  try {
                    await api(`/admin/roles/${role}/permissions`, {
                      method: 'PUT',
                      body: JSON.stringify({ permissions: selected }),
                    });
                    setMessage('Permissions saved. New requests use the updated access rules.');
                  } catch (e) {
                    setError((e as Error).message);
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                <Check />
                Save permissions
              </Button>
            </>
          )}
        </div>
      </section>
      {identity.principal.permissions.includes('devices:manage') && (
        <div className="business-grid">
          <section className="panel settings-panel">
            <div className="panel-heading">
              <div>
                <h2>Register NFC reader</h2>
                <p>Device keys are shown once. Store securely on the reader.</p>
              </div>
              <KeyRound size={20} />
            </div>
            <form
              className="settings-body"
              onSubmit={async (e) => {
                e.preventDefault();
                const values = new FormData(e.currentTarget);
                setBusy(true);
                try {
                  const r = await api<Row>('/admin/devices', {
                    method: 'POST',
                    body: JSON.stringify({ name: values.get('name'), siteId: deviceSite }),
                  });
                  setDeviceKey(r.key);
                } catch (e) {
                  setError((e as Error).message);
                } finally {
                  setBusy(false);
                }
              }}
            >
              <label>
                Reader name
                <input name="name" required minLength={2} />
              </label>
              <label>
                Site
                <RelationInput
                  field={{
                    key: 'siteId',
                    type: 'relation',
                    label: 'Site',
                    resource: 'sites',
                    required: true,
                  }}
                  value={deviceSite}
                  onChange={setDeviceSite}
                />
              </label>
              <Button disabled={busy}>Register reader</Button>
              {deviceKey && (
                <div className="notice key-display">
                  <strong>Copy this key now; it cannot be retrieved later.</strong>
                  <code>{deviceKey}</code>
                </div>
              )}
            </form>
          </section>
          <section className="panel settings-panel">
            <div className="panel-heading">
              <div>
                <h2>Assign NFC card</h2>
                <p>Card identifiers are hashed before storage.</p>
              </div>
            </div>
            <form
              className="settings-body"
              onSubmit={async (e) => {
                e.preventDefault();
                const values = new FormData(e.currentTarget);
                setBusy(true);
                try {
                  await api('/admin/cards', {
                    method: 'POST',
                    body: JSON.stringify({
                      employeeId: cardEmployee,
                      cardId: values.get('cardId'),
                    }),
                  });
                  setMessage('NFC card assigned.');
                } catch (e) {
                  setError((e as Error).message);
                } finally {
                  setBusy(false);
                }
              }}
            >
              <label>
                Employee
                <RelationInput
                  field={{
                    key: 'employeeId',
                    type: 'relation',
                    label: 'Employee',
                    resource: 'employees',
                    required: true,
                  }}
                  value={cardEmployee}
                  onChange={setCardEmployee}
                />
              </label>
              <label>
                Card identifier
                <input name="cardId" required minLength={4} maxLength={200} />
              </label>
              <Button disabled={busy}>Assign card</Button>
            </form>
          </section>
        </div>
      )}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogTitle className="dialog-title">Create workspace user</DialogTitle>
          <DialogDescription className="dialog-description">
            Link managers and supervisors to an employee profile. Link customers to their client
            profile. Accountants can use organization-wide access.
          </DialogDescription>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              const form = new FormData(e.currentTarget);
              setBusy(true);
              try {
                await api('/admin/users', {
                  method: 'POST',
                  body: JSON.stringify({
                    name: form.get('name'),
                    email: form.get('email'),
                    password: form.get('password'),
                    roleId: form.get('roleId'),
                    businessUnitId: unit || null,
                    ...(employeeId ? { employeeId } : {}),
                    ...(clientId ? { clientId } : {}),
                  }),
                });
                setOpen(false);
                load();
              } catch (e) {
                setError((e as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            <div className="form-grid">
              <label>
                Name *<input name="name" required minLength={2} />
              </label>
              <label>
                Email *<input name="email" required type="email" />
              </label>
              <label className="full-width">
                Initial password (14+ characters) *
                <input
                  name="password"
                  type="password"
                  required
                  minLength={14}
                  maxLength={128}
                  autoComplete="new-password"
                />
              </label>
              <label>
                Role *
                <select name="roleId" required>
                  <option value="">Choose role</option>
                  {roles.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Business unit
                <select
                  value={unit}
                  onChange={(e) => {
                    setUnit(e.target.value);
                    setEmployeeId('');
                    setClientId('');
                  }}
                >
                  <option value="">Organization-wide</option>
                  {identity.businessUnits.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="full-width">
                Employee profile (managers, supervisors and workers)
                <RelationInput
                  field={{
                    key: 'employeeId',
                    label: 'Employee',
                    type: 'relation',
                    resource: 'employees',
                  }}
                  businessUnitId={unit}
                  value={employeeId}
                  onChange={setEmployeeId}
                />
              </label>
              <label className="full-width">
                Client profile (customers only)
                <RelationInput
                  field={{
                    key: 'clientId',
                    label: 'Client',
                    type: 'relation',
                    resource: 'clients',
                  }}
                  businessUnitId={unit}
                  value={clientId}
                  onChange={setClientId}
                />
              </label>
            </div>
            {error && (
              <div className="form-error" role="alert">
                {error}
              </div>
            )}
            <div className="dialog-footer">
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button disabled={busy}>{busy ? 'Creating…' : 'Create user'}</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
