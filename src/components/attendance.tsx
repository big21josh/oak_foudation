'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Search } from 'lucide-react';
import { Card, Status, requestJson } from './ui';
import { Dropdown } from './dropdown';
import { Icon, icons } from './icon';
import { registrationRoles } from '@/lib/roles';
import { event } from '@/lib/data';

type Person = {
  id: string;
  firstName: string;
  lastName: string;
  organisation: string;
  role: string;
  createdAt: string;
  checkedInAt: string | null;
};

export function Attendance({ initial }: { initial: Person[] }) {
  const [people, setPeople] = useState(initial),
    [query, setQuery] = useState(''),
    [role, setRole] = useState(''),
    [status, setStatus] = useState(''),
    [error, setError] = useState('');

  async function refresh() {
    try {
      setPeople((await requestJson('/api/attendance')).registrations);
      setError('');
    } catch (e) {
      setError((e as Error).message);
    }
  }

  useEffect(() => {
    const timer = setInterval(() => {
      if (!document.hidden) void refresh();
    }, 15000);
    return () => clearInterval(timer);
  }, []);

  const checked = people.filter((p) => p.checkedInAt).length;
  const expected = Math.max(event.expected, people.length);
  const rate = people.length ? Math.round((checked / people.length) * 100) : 0;
  const filtered = people.filter(
    (p) =>
      `${p.firstName} ${p.lastName} ${p.organisation}`.toLowerCase().includes(query.toLowerCase()) &&
      (!role || p.role === role) &&
      (!status || (status === 'attended' ? !!p.checkedInAt : !p.checkedInAt)),
  );
  const format = (value: string) =>
    new Date(value).toLocaleString('en-GB', {
      timeZone: 'Africa/Harare',
      dateStyle: 'medium',
      timeStyle: 'short',
    });

  return (
    <>
      <div className="page-heading">
        <h1>Attendance</h1>
        <p>Check-in tracking · {event.dates}</p>
      </div>

      <div className="stack">
        {/* Empty state — shown until the first attendee is scanned in */}
        {checked === 0 && (
          <Card className="empty-state">
            <div className="empty-icon">
              <img src="/icons/icon-43.svg" width={36} height={36} alt="" />
            </div>
            <div>
              <h2>No check-ins yet</h2>
              <p style={{ paddingTop: 4 }}>
                Attendees will appear here once they have been scanned in at the event entrance.
              </p>
            </div>
            <Link className="button" href="/check-in">
              <Icon name={icons.goToScanner} size={16} />
              Go to Check-In Scanner
            </Link>
          </Card>
        )}

        <Card>
          <p className="eyebrow">Event Overview</p>
          <div className="overview-grid">
            <div>
              <strong>{expected}</strong>
              <span>Expected</span>
            </div>
            <div>
              <strong>{checked}</strong>
              <span>Checked In</span>
            </div>
            <div>
              <strong>{Math.max(expected - checked, 0)}</strong>
              <span>Pending</span>
            </div>
          </div>
        </Card>

        <Card>
          <p className="eyebrow">Role breakdown</p>
          <dl className="details">
            <div>
              <dt>Total registered</dt>
              <dd>{people.length}</dd>
            </div>
            <div>
              <dt>Total attendees</dt>
              <dd>{checked}</dd>
            </div>
            <div>
              <dt>Attendance rate</dt>
              <dd>{rate}%</dd>
            </div>
            {registrationRoles.map((r) => (
              <div key={r}>
                <dt>{r}</dt>
                <dd>{people.filter((p) => p.role === r).length}</dd>
              </div>
            ))}
          </dl>
        </Card>

        <Card>
          <div className="row between">
            <h2>Participants</h2>
            <button className="text-button" onClick={refresh}>
              Refresh
            </button>
          </div>
          <div className="form-stack" style={{ paddingTop: 16 }}>
            <div className="search-input">
              <Search size={16} />
              <input
                aria-label="Search participants"
                type="search"
                placeholder="Search name or organisation…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>
            <div className="field">
              <span>Role</span>
              <Dropdown
                name="role"
                label="Filter by role"
                onValueChange={setRole}
                options={[
                  { value: '', label: 'All roles' },
                  ...registrationRoles.map((r) => ({ value: r, label: r })),
                ]}
              />
            </div>
            <div className="field">
              <span>Attendance status</span>
              <Dropdown
                name="status"
                label="Attendance status"
                onValueChange={setStatus}
                options={[
                  { value: '', label: 'All participants' },
                  { value: 'attended', label: 'Attended' },
                  { value: 'pending', label: 'Not checked in' },
                ]}
              />
            </div>
          </div>

          <div className="attendance-list" style={{ marginTop: 8 }}>
            {filtered.map((p) => (
              <div className="person" key={p.id}>
                <div className="row between">
                  <strong>
                    {p.firstName} {p.lastName}
                  </strong>
                  <span className={`pill ${p.checkedInAt ? 'attended' : ''}`}>
                    {p.checkedInAt ? 'Attended' : 'Registered'}
                  </span>
                </div>
                <p>
                  {p.organisation} · {p.role}
                </p>
                <small>
                  Registered: {format(p.createdAt)}
                  <br />
                  Check-in: {p.checkedInAt ? format(p.checkedInAt) : 'Not checked in'}
                </small>
              </div>
            ))}
            {!filtered.length && (
              <p className="muted" style={{ padding: '20px 0' }}>
                No participants match these filters.
              </p>
            )}
          </div>

          <Link className="button full mt-4" href="/check-in">
            Open Check-in Scanner
          </Link>
        </Card>

        <Status error>{error}</Status>
      </div>
    </>
  );
}
