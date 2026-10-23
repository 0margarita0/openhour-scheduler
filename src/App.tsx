import { FormEvent, ReactNode, useEffect, useState } from "react";

type Slot = {
    id: number;
    date: string;
    time: string;
    duration: number;
    status: "available" | "booked";
    guest?: { name: string; email: string };
};
type ApiSlot = {
    id: number;
    start: string;
    duration: number;
    booked: number;
    guest_name?: string | null;
    guest_email?: string | null;
};

// Converts what the API sends into the shape our UI uses.
const fromApi = (s: ApiSlot): Slot => ({
    id: s.id,
    date: s.start.slice(0, 10),
    time: s.start.slice(11, 16),
    duration: s.duration,
    status: s.booked ? "booked" : "available",
    guest: s.guest_email ? { name: s.guest_name ?? "", email: s.guest_email } : undefined,
});

const parseDate = (v: string) => new Date(`${v}T12:00:00`);

// Today's date in the user's LOCAL time zone, as YYYY-MM-DD.
const today = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

const longDate = (v: string) =>
    new Intl.DateTimeFormat("en-US", { weekday: "long", month: "long", day: "numeric" }).format(parseDate(v));

const shortDate = (v: string) =>
    new Intl.DateTimeFormat("en-US", { weekday: "short", month: "short", day: "numeric" }).format(parseDate(v));

const monthDay = (v: string) => {
    const d = parseDate(v);
    return { month: new Intl.DateTimeFormat("en-US", { month: "short" }).format(d), day: d.getDate() };
};

const formatTime = (v: string) => {
    const [h, m] = v.split(":").map(Number);
    return new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit" }).format(new Date(2024, 0, 1, h, m));
};

const paths: Record<string, ReactNode> = {
    calendar: (<><rect x="3" y="5" width="18" height="16" rx="3" /><path d="M16 3v4M8 3v4M3 10h18" /></>),
    arrow: <path d="M5 12h14m-5-5 5 5-5 5" />,
    check: <path d="m5 12 4 4L19 6" />,
    clock: (<><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>),
    plus: <path d="M12 5v14M5 12h14" />,
    user: (<><circle cx="12" cy="8" r="4" /><path d="M4.5 21a7.5 7.5 0 0 1 15 0" /></>),
    mail: (<><rect x="3" y="5" width="18" height="14" rx="3" /><path d="m4 7 8 6 8-6" /></>),
    chevron: <path d="m9 18 6-6-6-6" />,
    close: <path d="m7 7 10 10M17 7 7 17" />,
    trash: <path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" />,
};

function Icon({ name, size = 18 }: { name: keyof typeof paths; size?: number }) {
    return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
             strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            {paths[name]}
        </svg>
    );
}

export default function App() {
    const [view, setView] = useState<"booking" | "host">("booking");
    const [slots, setSlots] = useState<Slot[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedSlot, setSelectedSlot] = useState<Slot | null>(null);
    const [confirmedSlot, setConfirmedSlot] = useState<Slot | null>(null);
    const [showNotice, setShowNotice] = useState(false);

    // The host gets the full list (with guests), guests get the public list.
    const load = async (target: "booking" | "host") => {
        const res = await fetch(target === "host" ? "/api/host/slots" : "/api/slots");
        const data: ApiSlot[] = await res.json();
        setSlots(data.map(fromApi));
        setLoading(false);
    };

    useEffect(() => {
        setLoading(true);
        load(view);
    }, [view]);

    return (
        <div className="app-shell">
            <header className="topbar">
                <button className="brand" type="button" onClick={() => setView("booking")}>
                    <span className="brand-mark"><Icon name="calendar" size={19} /></span>
                    <span>OpenHour</span>
                </button>
                <nav className="view-switcher" aria-label="Switch view">
                    <button className={view === "booking" ? "active" : ""} type="button" onClick={() => setView("booking")}>
                        Booking page
                    </button>
                    <button className={view === "host" ? "active" : ""} type="button" onClick={() => setView("host")}>
                        Host view
                    </button>
                </nav>
                <div className="host-chip">
                    <span className="avatar">MD</span>
                    <span className="host-name">Margarita Dimitrijeska</span>
                </div>
            </header>

            {loading ? (
                <main className="loading-state"><span className="spinner" /><strong>Loading availability…</strong></main>
            ) : view === "booking" ? (
                <BookingPage
                    slots={slots}
                    onBook={setSelectedSlot}
                    notice={showNotice}
                    dismissNotice={() => setShowNotice(false)}
                />
            ) : (
                <HostPage slots={slots} onAdded={() => load("host")} />
            )}

            {selectedSlot && (
                <BookingModal
                    slot={selectedSlot}
                    close={() => setSelectedSlot(null)}
                    confirm={async (guest) => {
                        const res = await fetch(`/api/slots/${selectedSlot.id}/book`, {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify(guest),
                        });
                        if (res.ok) {
                            setConfirmedSlot({ ...selectedSlot, status: "booked", guest });
                            setSelectedSlot(null);
                            load(view);
                            return undefined;
                        }
                        if (res.status === 409) {
                            // Someone else booked this slot first.
                            setSelectedSlot(null);
                            setShowNotice(true);
                            load(view);
                            return undefined;
                        }
                        return (await res.json()).error as string;
                    }}
                />
            )}

            {confirmedSlot && <ConfirmationModal slot={confirmedSlot} close={() => setConfirmedSlot(null)} />}
        </div>
    );
}

function BookingPage({
                         slots,
                         onBook,
                         notice,
                         dismissNotice,
                     }: {
    slots: Slot[];
    onBook: (slot: Slot) => void;
    notice: boolean;
    dismissNotice: () => void;
}) {
    const [showBooked, setShowBooked] = useState(false);

    const visible = slots
        .filter((s) => s.date >= today())
        .filter((s) => showBooked || s.status === "available")
        .sort((a, b) => `${a.date}${a.time}`.localeCompare(`${b.date}${b.time}`));

    const grouped = visible.reduce<Record<string, Slot[]>>((groups, s) => {
        (groups[s.date] ??= []).push(s);
        return groups;
    }, {});

    return (
        <main className="booking-main">
            <section className="booking-hero">
                <div className="host-profile">
                    <span className="large-avatar">MD</span>
                    <div>
                        <span className="profile-label">Book time with</span>
                        <span className="profile-name">Margarita Dimitrijeska</span>
                    </div>
                </div>
                <div className="page-intro">
                    <span className="eyebrow">30–60 minute sessions</span>
                    <h1>Let’s find a time to talk.</h1>
                    <p>Choose an open time below. You’ll get an instant confirmation—no account needed.</p>
                </div>
                <div className="trust-row">
                    <span><Icon name="clock" size={16} /> Times shown in your local timezone</span>
                    <span><Icon name="check" size={16} /> Instant confirmation</span>
                </div>
            </section>

            <section className="availability-panel">
                <div className="panel-heading">
                    <div>
                        <span className="section-kicker">Upcoming availability</span>
                        <h2>Select a time</h2>
                    </div>
                    <label className="toggle-label">
                        <input type="checkbox" checked={showBooked} onChange={(e) => setShowBooked(e.target.checked)} />
                        <span className="toggle" aria-hidden="true"><span /></span>
                        Show booked
                    </label>
                </div>

                {notice && (
                    <div className="notice error-notice" role="status">
                        <span className="notice-icon">!</span>
                        <div>
                            <strong>This slot was just booked by someone else</strong>
                            <p>We’ve refreshed the list with the latest availability.</p>
                        </div>
                        <button type="button" onClick={dismissNotice} aria-label="Dismiss message">
                            <Icon name="close" size={17} />
                        </button>
                    </div>
                )}

                {Object.keys(grouped).length === 0 ? (
                    <div className="empty-state">
                        <span><Icon name="calendar" size={25} /></span>
                        <h3>No available slots yet</h3>
                        <p>New times will appear here as soon as they’re published.</p>
                    </div>
                ) : (
                    <div className="date-groups">
                        {Object.entries(grouped).map(([date, list]) => (
                            <div className="date-group" key={date}>
                                <div className="date-heading">
                                    <span>{longDate(date)}</span>
                                    <i>{list.filter((s) => s.status === "available").length} open</i>
                                </div>
                                <div className="public-slots">
                                    {list.map((s) => (
                                        <div className={`public-slot ${s.status}`} key={s.id}>
                                            <div className="slot-time">
                                                <strong>{formatTime(s.time)}</strong>
                                                <span>{s.duration} minutes</span>
                                            </div>
                                            {s.status === "available" ? (
                                                <button className="primary-button compact" type="button" onClick={() => onBook(s)}>
                                                    Book <Icon name="arrow" size={16} />
                                                </button>
                                            ) : (
                                                <span className="booked-label"><Icon name="check" size={14} /> Booked</span>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </section>
        </main>
    );
}

function HostPage({ slots, onAdded }: { slots: Slot[]; onAdded: () => void }) {
    const [date, setDate] = useState(today());
    const [time, setTime] = useState("10:00");
    const [duration, setDuration] = useState("30");
    const [error, setError] = useState("");

    const addSlot = async (event: FormEvent) => {
        event.preventDefault();
        const res = await fetch("/api/slots", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ date, time, duration: Number(duration) }),
        });
        if (!res.ok) {
            setError((await res.json()).error);
            return;
        }
        setError("");
        onAdded();
    };

    const deleteSlot = async (slot: Slot) => {
        const message =
            slot.status === "booked"
                ? `This slot is booked by ${slot.guest?.name}. Delete it anyway?`
                : "Delete this slot?";
        if (!window.confirm(message)) return;
        await fetch(`/api/slots/${slot.id}`, { method: "DELETE" });
        onAdded();
    };
    const ordered = [...slots].sort((a, b) => `${b.date}${b.time}`.localeCompare(`${a.date}${a.time}`));
    const availableCount = slots.filter((s) => s.status === "available").length;
    const bookedCount = slots.filter((s) => s.status === "booked").length;

    return (
        <main className="host-main">
            <div className="page-intro">
                <span className="eyebrow">Host dashboard</span>
                <h1>Your availability</h1>
                <p>Add time slots and see who’s booked in one simple place.</p>
            </div>

            <div className="stat-row">
                <div><span className="stat-icon purple"><Icon name="calendar" /></span><strong>{availableCount}</strong><small>Available</small></div>
                <div><span className="stat-icon green"><Icon name="check" /></span><strong>{bookedCount}</strong><small>Booked</small></div>
                <div><span className="stat-icon orange"><Icon name="clock" /></span><strong>{slots.length}</strong><small>Total slots</small></div>
            </div>

            <div className="host-grid">
                <section className="create-card">
                    <div className="card-icon"><Icon name="plus" size={20} /></div>
                    <h2>Add availability</h2>
                    <p>Publish a new time for guests to book.</p>
                    <form onSubmit={addSlot} noValidate>
                        <label>
                            Date
                            <span className="input-wrap"><Icon name="calendar" size={17} />
                <input type="date" value={date} min={today()} onChange={(e) => setDate(e.target.value)} />
              </span>
                        </label>
                        <div className="field-row">
                            <label>
                                Start time
                                <span className="input-wrap"><Icon name="clock" size={17} />
                  <input type="time" value={time} onChange={(e) => setTime(e.target.value)} />
                </span>
                            </label>
                            <label>
                                Duration
                                <span className="select-wrap">
                  <select value={duration} onChange={(e) => setDuration(e.target.value)}>
                    <option value="15">15 min</option>
                    <option value="30">30 min</option>
                    <option value="45">45 min</option>
                    <option value="60">60 min</option>
                  </select>
                  <Icon name="chevron" size={15} />
                </span>
                            </label>
                        </div>
                        {error && <span className="field-error">{error}</span>}
                        <button className="primary-button full" type="submit"><Icon name="plus" size={17} /> Add time slot</button>
                    </form>
                </section>

                <section className="slots-card">
                    <div className="slots-card-heading">
                        <div><h2>Published slots</h2><p>{slots.length} times published</p></div>
                        <span className="live-pill"><i /> Live</span>
                    </div>
                    <div className="host-slots">
                        {ordered.map((s) => <HostSlot slot={s} key={s.id} onDelete={() => deleteSlot(s)} />)}
                    </div>
                </section>
            </div>
        </main>
    );
}

function HostSlot({ slot, onDelete }: { slot: Slot; onDelete: () => void }) {
    const parts = monthDay(slot.date);
    return (
        <article className={`host-slot ${slot.status}`}>
            <div className="date-tile"><span>{parts.month}</span><strong>{parts.day}</strong></div>
            <div className="host-slot-info">
                <div className="host-slot-meta">
                    <strong>{shortDate(slot.date)}</strong>
                    <span>{formatTime(slot.time)} · {slot.duration} min</span>
                </div>
                {slot.guest && (
                    <div className="guest-info">
                        <span><Icon name="user" size={14} /> {slot.guest.name}</span>
                        <span><Icon name="mail" size={14} /> {slot.guest.email}</span>
                    </div>
                )}
            </div>
            <div className="slot-actions">
                <span className={`status-pill ${slot.status}`}><i /> {slot.status === "available" ? "Available" : "Booked"}</span>
                <button className="delete-button" type="button" onClick={onDelete} aria-label="Delete slot">
                    <Icon name="trash" size={15} /> Delete
                </button>
            </div>
        </article>
    );
}

function BookingModal({
                          slot,
                          close,
                          confirm,
                      }: {
    slot: Slot;
    close: () => void;
    confirm: (guest: { name: string; email: string }) => Promise<string | undefined>;
}) {
    const [name, setName] = useState("");
    const [email, setEmail] = useState("");
    const [errors, setErrors] = useState<{ name?: string; email?: string }>({});
    const [serverError, setServerError] = useState("");
    const [busy, setBusy] = useState(false);

    const submit = async (event: FormEvent) => {
        event.preventDefault();
        const next: { name?: string; email?: string } = {};
        if (!name.trim()) next.name = "Please enter your name.";
        if (!email.trim()) next.email = "Please enter your email.";
        else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) next.email = "Enter a valid email address.";
        setErrors(next);
        if (Object.keys(next).length > 0) return;

        setBusy(true);
        const message = await confirm({ name: name.trim(), email: email.trim() });
        setBusy(false);
        if (message) setServerError(message);
    };

    return (
        <div className="modal-backdrop" role="presentation" onMouseDown={(e) => e.target === e.currentTarget && close()}>
            <section className="modal" role="dialog" aria-modal="true" aria-labelledby="booking-title">
                <button className="close-button" type="button" onClick={close} aria-label="Close booking form">
                    <Icon name="close" />
                </button>
                <span className="modal-icon"><Icon name="calendar" size={22} /></span>
                <span className="eyebrow">Almost yours</span>
                <h2 id="booking-title">Book this time</h2>
                <div className="selected-time">
                    <div><Icon name="calendar" size={17} /><span><small>Date</small><strong>{longDate(slot.date)}</strong></span></div>
                    <div><Icon name="clock" size={17} /><span><small>Time</small><strong>{formatTime(slot.time)} · {slot.duration} min</strong></span></div>
                </div>
                <form onSubmit={submit} noValidate>
                    <label className={errors.name ? "has-error" : ""}>
                        Your name
                        <span className="input-wrap"><Icon name="user" size={17} />
              <input autoFocus type="text" placeholder="e.g. Anna Reed" value={name} onChange={(e) => setName(e.target.value)} />
            </span>
                        {errors.name && <span className="field-error">{errors.name}</span>}
                    </label>
                    <label className={errors.email ? "has-error" : ""}>
                        Email address
                        <span className="input-wrap"><Icon name="mail" size={17} />
              <input type="email" placeholder="anna@example.com" value={email} onChange={(e) => setEmail(e.target.value)} />
            </span>
                        {errors.email && <span className="field-error">{errors.email}</span>}
                    </label>
                    {serverError && <span className="field-error">{serverError}</span>}
                    <button className="primary-button full" type="submit" disabled={busy}>
                        {busy ? "Booking…" : <>Confirm booking <Icon name="arrow" size={17} /></>}
                    </button>
                    <p className="privacy-note">We’ll only use your email for this booking.</p>
                </form>
            </section>
        </div>
    );
}

function ConfirmationModal({ slot, close }: { slot: Slot; close: () => void }) {
    return (
        <div className="modal-backdrop">
            <section className="modal confirmation-modal" role="dialog" aria-modal="true" aria-labelledby="confirmation-title">
                <div className="success-mark"><Icon name="check" size={30} /></div>
                <span className="eyebrow">You’re all set</span>
                <h2 id="confirmation-title">Booking confirmed!</h2>
                <p>Thanks, {slot.guest?.name.split(" ")[0]}! Your {slot.duration}-minute session with Margarita  is confirmed.</p>
                <div className="confirmation-details">
                    <div><Icon name="calendar" /><span><small>Date</small><strong>{longDate(slot.date)}</strong></span></div>
                    <div><Icon name="clock" /><span><small>Time</small><strong>{formatTime(slot.time)} · {slot.duration} minutes</strong></span></div>
                </div>
                <p>Your booking is saved under <strong>{slot.guest?.email}</strong>.</p>
                <button className="primary-button full" type="button" onClick={close}>Done</button>
            </section>
        </div>
    );
}
