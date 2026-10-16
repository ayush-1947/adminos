'use client';

import { useEffect, useState } from 'react';
import { Download, FileText, Loader2 } from 'lucide-react';
import { api } from '@/lib/api';
import { Button } from './ui/button';

type SavedPdf = { id: string; filename: string; size: number; createdAt: string };
const groups = [
  [
    'Issuer and recipient',
    [
      ['documentNumber', 'PDF document number'],
      ['issuerAddress', 'Issuer address'],
      ['issuerGstin', 'Issuer GSTIN'],
      ['recipientAddress', 'Recipient address'],
      ['recipientGstin', 'Recipient GSTIN'],
    ],
  ],
  [
    'Bank and payment details',
    [
      ['bankName', 'Bank name'],
      ['accountNumber', 'Account number'],
      ['ifsc', 'IFSC'],
      ['upiId', 'UPI ID'],
    ],
  ],
  [
    'Terms and notes',
    [
      ['terms', 'Terms'],
      ['notes', 'Additional notes'],
    ],
  ],
] as const;

export function SavedPdfs({
  moduleKey,
  recordId,
  canWrite,
}: {
  moduleKey: string;
  recordId: string;
  canWrite: boolean;
}) {
  const [files, setFiles] = useState<SavedPdf[]>([]);
  const [options, setOptions] = useState<Record<string, string>>({});
  const [expanded, setExpanded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const endpoint = `/billing/${moduleKey}/${recordId}/pdfs`;
  useEffect(() => {
    let active = true;
    setLoading(true);
    api<SavedPdf[]>(endpoint)
      .then((rows) => {
        if (active) setFiles(rows);
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
  }, [endpoint]);

  async function download(file: SavedPdf) {
    const response = await fetch(`/api/saved-pdfs/${file.id}/download`, { credentials: 'include' });
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      throw new Error(body.error || 'Unable to download PDF');
    }
    const url = URL.createObjectURL(await response.blob());
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = file.filename;
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  async function save(andDownload: boolean) {
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const payload = {
        ...options,
        ...(options.gstRate ? { gstRate: Number(options.gstRate) } : {}),
      };
      if (!options.gstRate) delete payload.gstRate;
      const file = await api<SavedPdf>(endpoint, { method: 'POST', body: JSON.stringify(payload) });
      setFiles((current) => [file, ...current.filter((item) => item.id !== file.id)]);
      setMessage('PDF saved. You can download this copy again from the list below.');
      if (andDownload) await download(file);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="saved-pdfs">
      <h3>{moduleKey === 'invoices' ? 'Billing PDFs' : 'Challan PDFs'}</h3>
      <p className="dialog-description">
        Save a dated copy in the workspace, then download it whenever needed. Existing copies stay
        unchanged.
      </p>
      {canWrite && (
        <>
          <Button
            type="button"
            variant="outline"
            size="sm"
            aria-expanded={expanded}
            onClick={() => setExpanded(!expanded)}
          >
            Optional PDF details
          </Button>
          {expanded && (
            <div className="pdf-options">
              <p className="notice">
                All fields below are optional. Blank fields use the existing record details where
                available.
              </p>
              {groups.map(([heading, fields]) => (
                <fieldset key={heading} disabled={busy}>
                  <legend>{heading}</legend>
                  <div className="form-grid">
                    {fields.map(([key, label]) => (
                      <label key={key}>
                        {label}
                        {key.includes('Address') || ['terms', 'notes'].includes(key) ? (
                          <textarea
                            rows={3}
                            maxLength={2000}
                            value={options[key] || ''}
                            onChange={(e) => setOptions({ ...options, [key]: e.target.value })}
                          />
                        ) : (
                          <input
                            maxLength={
                              key === 'accountNumber'
                                ? 60
                                : ['ifsc', 'issuerGstin', 'recipientGstin'].includes(key)
                                  ? 30
                                  : 100
                            }
                            value={options[key] || ''}
                            onChange={(e) => setOptions({ ...options, [key]: e.target.value })}
                          />
                        )}
                      </label>
                    ))}
                  </div>
                </fieldset>
              ))}
              {moduleKey === 'invoices' && (
                <fieldset disabled={busy}>
                  <legend>Optional GST breakdown</legend>
                  <p className="dialog-description">
                    The recorded invoice total stays unchanged. GST is calculated within that total.
                  </p>
                  <div className="form-grid">
                    <label>
                      GST rate (%)
                      <input
                        type="number"
                        min="0"
                        max="100"
                        step="0.01"
                        value={options.gstRate || ''}
                        onChange={(e) => setOptions({ ...options, gstRate: e.target.value })}
                      />
                    </label>
                    <label>
                      GST type
                      <select
                        aria-label="GST type"
                        value={options.gstMode || ''}
                        onChange={(e) => {
                          const next = { ...options };
                          if (e.target.value) next.gstMode = e.target.value;
                          else delete next.gstMode;
                          setOptions(next);
                        }}
                      >
                        <option value="">No breakdown</option>
                        <option value="IGST">IGST</option>
                        <option value="CGST_SGST">CGST + SGST</option>
                      </select>
                    </label>
                  </div>
                </fieldset>
              )}
              <label>
                Logo (PNG / JPEG, up to 120 KB)
                <input
                  type="file"
                  accept="image/png,image/jpeg"
                  disabled={busy}
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    const next = { ...options };
                    delete next.logo;
                    setOptions(next);
                    setError('');
                    if (!file) return;
                    if (file.size > 120000 || !['image/png', 'image/jpeg'].includes(file.type)) {
                      setError('Choose a PNG or JPEG logo smaller than 120 KB.');
                      e.target.value = '';
                      return;
                    }
                    const reader = new FileReader();
                    reader.onload = () =>
                      setOptions((current) => ({ ...current, logo: String(reader.result) }));
                    reader.onerror = () => setError('Unable to read the logo.');
                    reader.readAsDataURL(file);
                  }}
                />
              </label>
            </div>
          )}
          <div className="pdf-actions">
            <Button disabled={busy} onClick={() => void save(false)}>
              {busy ? <Loader2 className="animate-spin" /> : <FileText />}Save PDF
            </Button>
            <Button variant="outline" disabled={busy} onClick={() => void save(true)}>
              <Download />
              Save & download PDF
            </Button>
          </div>
        </>
      )}
      {error && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}
      {message && (
        <p role="status" className="success-message">
          {message}
        </p>
      )}
      {loading ? (
        <p role="status">Loading saved PDFs…</p>
      ) : !files.length ? (
        <p className="dialog-description">No saved PDFs yet.</p>
      ) : (
        <ul className="pdf-list">
          {files.map((file) => (
            <li key={file.id}>
              <div>
                <strong>{file.filename}</strong>
                <small>
                  {new Date(file.createdAt).toLocaleString('en-IN')} · {Math.ceil(file.size / 1024)}{' '}
                  KB
                </small>
              </div>
              <Button
                variant="outline"
                size="sm"
                disabled={busy}
                aria-label={`Download ${file.filename}`}
                onClick={async () => {
                  setBusy(true);
                  setError('');
                  try {
                    await download(file);
                  } catch (e) {
                    setError((e as Error).message);
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                <Download />
                Download PDF
              </Button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
