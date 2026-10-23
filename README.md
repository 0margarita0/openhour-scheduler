# OpenHour

A small scheduling app. A host publishes available time slots, and guests book one with their name and email. A booked slot is no longer available, so there are no double bookings. No login is needed (single host).

Built for the TeamLift Product Engineer Internship challenge.

**Live app:** https://openhour-scheduler.onrender.com/

> The app runs on a free Render instance, so the first load can take about a minute while it wakes up.

## What I built

- **Booking page:** guests see upcoming open slots grouped by day and book one through a short form (name and email). Booked slots are hidden, with a "Show booked" toggle. Empty, loading, validation and "just booked by someone else" states are handled.
- **Host view:** add a slot (date, start time, duration), see all slots with their status, and see who booked each one.
- **Backend:** Node + Express API with a SQLite database, so data persists between restarts on a normal machine.
- **No double bookings:** booking is a single atomic SQL `UPDATE ... WHERE guest_email IS NULL`. If two people click at the same time, only one succeeds and the other gets a clear error and a refreshed list.
- **Privacy:** the public API only says whether a slot is booked. Guest names and emails are only returned to the host view.

**Design:** prototyped in Figma Make, then I built the React UI and connected it to the backend step by step.

**Stack:** React, TypeScript, Vite, Tailwind CSS, Express, better-sqlite3.

## Run it locally

Requires Node.js 18+.

```bash
npm install
npm run dev
```

Open http://localhost:5173 (the API runs on port 3001 and is proxied by Vite).

Production build, served by a single server:

```bash
npm run build
npm start      # http://localhost:3001
```

## API

| Method | Route | Description |
|---|---|---|
| GET | `/api/slots` | Public list of slots (no guest details) |
| GET | `/api/host/slots` | Host list, including guest name and email |
| POST | `/api/slots` | Create a slot: `{ date, time, duration }` |
| POST | `/api/slots/:id/book` | Book a slot: `{ name, email }`. Returns 409 if it is already booked |

## AI tools I used

- **Figma Make (Figma AI)** to prototype the UI before writing code.
- **Claude** to plan the architecture and walk through the code with me step by step. I wrote and tested the code and I can explain every part of it.

## What I would improve with more time

- Use PostgreSQL (for example on Neon). On the free hosting tier the SQLite file is reset when the service restarts, so booked data does not last there.
- Host authentication, so only the host can publish slots, plus deleting and editing slots.
- Time zone support and a real confirmation email to the guest (the confirmation screen currently only confirms that the booking is saved).
- An AI-written confirmation message (for example with Gemini) and a Google Calendar check for clashing events.
- Automated tests for the booking logic.