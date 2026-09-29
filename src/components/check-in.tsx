'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import {
  ScanLine,
  CheckCircle2,
  XCircle,
  Clock,
  MapPin,
  Users,
  RefreshCw,
  Phone,
  Camera,
  CameraOff,
  Radio,
} from 'lucide-react';

import type { Registration, Session } from '@/lib/types';
import { event, initials, nextSession } from '@/lib/data';
import { Card, Status, Modal, requestJson } from './ui';

/** "09:34 · 9 November 2026" in Harare time, from a real ISO check-in timestamp. */
function stamp(iso: string | null) {
  const d = iso ? new Date(iso) : new Date();
  const time = d.toLocaleTimeString('en-GB', {
    timeZone: 'Africa/Harare',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  const date = d.toLocaleDateString('en-GB', {
    timeZone: 'Africa/Harare',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
  return `${time} · ${date}`;
}

export function CheckIn({ demo, sessions }: { demo: boolean; sessions: Session[] }) {
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<{ registration: Registration; already: boolean } | null>(
    null,
  );
  const [failed, setFailed] = useState(false);
  const [camera, setCamera] = useState(false);
  const [contact, setContact] = useState(false);
  // Real count from /api/attendance — stays null until we have it (no made-up numbers).
  const [count, setCount] = useState<number | null>(null);

  const video = useRef<HTMLVideoElement>(null);
  const controls = useRef<{ stop: () => void } | null>(null);
  const scanning = useRef(false);
  const generation = useRef(0);

  const stop = useCallback(() => {
    generation.current++;
    controls.current?.stop();
    controls.current = null;
    const stream = video.current?.srcObject as MediaStream | null;
    stream?.getTracks().forEach((track) => track.stop());
    if (video.current) video.current.srcObject = null;
    setCamera(false);
  }, []);

  useEffect(
    () => () => {
      generation.current++;
      controls.current?.stop();
      controls.current = null;
      const stream = video.current?.srcObject as MediaStream | null;
      stream?.getTracks().forEach((track) => track.stop());
    },
    [],
  );

  async function scan(value: string, sample = false) {
    if (scanning.current) return;
    scanning.current = true;
    setBusy(true);
    setError('');
    stop();

    try {
      const response = await fetch(sample ? '/api/demo-check-in' : '/api/check-in', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(sample ? { id: value } : { code: value }),
      });
      const data = await response.json();

      if (data.unrecognised) {
        setFailed(true);
        return;
      }
      if (!response.ok) throw new Error(data.error || 'Unable to check in.');

      setResult(data);

      try {
        const attendance = await requestJson('/api/attendance');
        setCount(attendance.registrations.filter((r: Registration) => r.checkedInAt).length);
      } catch {
        setCount(null); // attendance endpoint unavailable — hide the summary rather than guess
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      scanning.current = false;
      setBusy(false);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }

  async function startCamera() {
    setError('');
    setCamera(true);
    const current = ++generation.current;
    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error(
          'Camera access needs HTTPS or localhost. You can use manual code entry below.',
        );
      }
      const { BrowserQRCodeReader } = await import('@zxing/browser');
      if (current !== generation.current) return;
      const reader = new BrowserQRCodeReader();
      const c = await reader.decodeFromVideoDevice(undefined, video.current!, (decoded) => {
        if (decoded && !scanning.current) void scan(decoded.getText());
      });
      if (current !== generation.current) c.stop();
      else controls.current = c;
    } catch {
      if (current === generation.current) {
        setCamera(false);
        setError(
          'Camera is unavailable or permission was denied. Check camera permissions, or enter the pass code below.',
        );
      }
    }
  }

  function reset() {
    setResult(null);
    setFailed(false);
    setCode('');
    setError('');
  }

  /* ------------------------------------------------------------
   * CHECK-IN FAILED  (Figma: "Check-In Failed" / "QR Not Recognised")
   * ------------------------------------------------------------ */
  if (failed) {
    return (
      <div className="stack">
        <section className="hero failure hero-with-icon">
          <span className="hero-icon">
            <XCircle size={28} />
          </span>
          <div>
            <p className="eyebrow">Check-In Failed</p>
            <h1 style={{ paddingTop: 6 }}>QR Not Recognised</h1>
            <p style={{ paddingTop: 4 }}>Code is invalid or unregistered</p>
          </div>
        </section>

        <Card>
          <h2 className="eyebrow" style={{ marginBottom: 0 }}>
            Possible reasons
          </h2>
          <ul className="reasons">
            {[
              'QR code belongs to a different event',
              'Registration was not completed',
              'Code has been altered or corrupted',
              'Attendee registered under a different email',
            ].map((reason) => (
              <li key={reason}>
                <img src="/icons/container-margin-2.svg" width={16} height={18} alt="" />
                {reason}
              </li>
            ))}
          </ul>
        </Card>

        <button className="button full" onClick={reset}>
          <RefreshCw size={17} />
          Try Again
        </button>
        <button className="button secondary full" onClick={() => setContact(true)}>
          <Phone size={15} />
          Contact Coordination Team
        </button>

        {contact && (
          <Modal title="Event coordination" onClose={() => setContact(false)}>
            <p className="muted">
              Please speak to the coordination team at the event registration desk. They can locate
              the attendee’s registration and confirm their entry pass.
            </p>
          </Modal>
        )}
      </div>
    );
  }

  /* ------------------------------------------------------------
   * CHECKED IN SUCCESSFULLY
   * ------------------------------------------------------------ */
  if (result) {
    const r = result.registration;
    const next = nextSession(sessions);

    return (
      <div className="stack">
        <section className="hero success hero-with-icon">
          <span className="hero-icon">
            <CheckCircle2 size={28} />
          </span>
          <div>
            <p className="eyebrow">{result.already ? 'Already checked in' : 'Check-in complete'}</p>
            <h1 style={{ paddingTop: 6 }}>
              {result.already ? 'Already Checked In' : 'Checked In Successfully'}
            </h1>
            <p className="row" style={{ gap: 6, paddingTop: 6 }}>
              <Clock size={12} />
              {stamp(r.checkedInAt)}
            </p>
          </div>
        </section>

        <Card>
          <div className="row">
            <span className="avatar large">{initials(`${r.firstName} ${r.lastName}`)}</span>
            <div>
              <h2 style={{ fontSize: 18 }}>
                {r.firstName} {r.lastName}
              </h2>
              <p className="muted" style={{ fontSize: 13, paddingBottom: 6 }}>
                {r.organisation}
              </p>
              <span className="badge">{r.role}</span>
            </div>
          </div>

          {next && (
            <div className="next-session">
              <div>
                <span className="eyebrow">
                  <Users size={11} />
                  Next Session
                </span>
                <strong>{next.title.replace(/^[^:]*:\s*/, '')}</strong>
              </div>
              <div>
                <span className="eyebrow">
                  <MapPin size={11} />
                  Venue
                </span>
                <strong>{next.venue}</strong>
              </div>
            </div>
          )}
        </Card>

        <Card>
          <h2 className="eyebrow" style={{ marginBottom: 0 }}>
            <Radio size={12} />
            Live Event Status
          </h2>
          {next && (
            <div className="live-status">
              <span className="live-dot" />
              <strong>
                {next.title.replace(/^[^:]*:\s*/, '')} starting at {next.time}
              </strong>
            </div>
          )}
          {count !== null && (
            <>
              <p className="muted attendance-summary">
                {count} of {event.expected} attendees checked in
                {next ? ` · ${next.venue}` : ''}
              </p>
              <div className="attendance-progress">
                <div
                  className="attendance-progress-fill"
                  style={{ width: `${Math.min((count / event.expected) * 100, 100)}%` }}
                />
              </div>
            </>
          )}
        </Card>

        <Status error>{error}</Status>

        <button className="button full" onClick={reset}>
          <ScanLine size={18} />
          Scan Next Attendee
        </button>
      </div>
    );
  }

  /* ------------------------------------------------------------
   * SCANNER  (Figma: "Event Check-In")
   * ------------------------------------------------------------ */
  return (
    <>
      <div className="page-heading">
        <h1>Event Check-In</h1>
        <p>Scan an attendee QR code to check them in</p>
      </div>

      <div className="stack">
        <section className="scanner">
          <div className="camera-view">
            <video
              ref={video}
              autoPlay
              playsInline
              muted
              aria-label="QR scanner camera"
              className={camera ? '' : 'hidden'}
            />
            <div className="scan-frame">
              <i />
              <i />
              <i />
              <i />
            </div>
            <p>Position QR code within the frame</p>
          </div>
          <div className="scanner-footer">
            <ScanLine size={20} />
            <span>
              {camera
                ? 'Hold camera steady · Auto-scans in 1–2 seconds'
                : 'Start the camera to scan an entry pass'}
            </span>
          </div>
        </section>

        <button
          className="button secondary full"
          disabled={busy}
          onClick={camera ? stop : startCamera}
        >
          {camera ? <CameraOff size={18} /> : <Camera size={18} />}
          {camera ? 'Stop Camera' : 'Start Camera'}
        </button>

        <Status error>{error}</Status>

        {demo && (
          <Card>
            <h2 className="eyebrow" style={{ marginBottom: 0 }}>
              Simulate QR Scan
            </h2>
            {[
              { id: 'collin', name: 'Collin Manyande', role: 'Partner', code: 'OAK-2026-7842-XKPH' },
              { id: 'kayden', name: 'Kayden Mamu', role: 'Partner', code: 'OAK-2026-5592-FWBN' },
            ].map((p) => (
              <button
                disabled={busy}
                className="sample-person"
                key={p.id}
                onClick={() => scan(p.id, true)}
              >
                <span className="avatar small">{initials(p.name)}</span>
                <span>
                  <strong>{p.name}</strong>
                  <small>{p.code}</small>
                </span>
                <span className="badge">{p.role}</span>
              </button>
            ))}
          </Card>
        )}

        <Card>
          <h2 className="eyebrow" style={{ marginBottom: 12 }}>
            Manual Code Entry
          </h2>
          <form
            className="row manual-entry"
            onSubmit={(e) => {
              e.preventDefault();
              void scan(code);
            }}
          >
            <label className="sr-only" htmlFor="entry-code">
              Entry pass code
            </label>
            <input
              id="entry-code"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="OAK-2026-XXXX-XXXX"
              required
              maxLength={90}
              autoComplete="off"
            />
            <button className="button" disabled={busy}>
              {busy ? 'Checking…' : 'Check'}
            </button>
          </form>
        </Card>
      </div>
    </>
  );
}
