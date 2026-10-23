import express from "express";
import Database from "better-sqlite3";
import path from "node:path";

const db = new Database("data.db");

db.exec(`
  CREATE TABLE IF NOT EXISTS slots (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    start TEXT NOT NULL,
    duration INTEGER NOT NULL,
    guest_name TEXT,
    guest_email TEXT,
    booked_at TEXT
  )
`);
const app = express();
app.use(express.json());

app.get("/api/health", (_req, res) => {
    res.json({ ok: true });
});
// Public list: guests only see IF a slot is booked, never who booked it.
app.get("/api/slots", (_req, res) => {
    const slots = db
        .prepare("SELECT id, start, duration, guest_email IS NOT NULL AS booked FROM slots ORDER BY start")
        .all();
    res.json(slots);
});

// Host list: includes guest name and email.
app.get("/api/host/slots", (_req, res) => {
    const slots = db
        .prepare("SELECT *, guest_email IS NOT NULL AS booked FROM slots ORDER BY start")
        .all();
    res.json(slots);
});

// Create a slot.
app.post("/api/slots", (req, res) => {
    const { date, time, duration } = req.body ?? {};
    const start = `${date}T${time}`;
    const valid = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(start);
    if (!valid || ![15, 30, 45, 60].includes(Number(duration))) {
        return res.status(400).json({ error: "Please enter a valid date, time and duration." });
    }
    const info = db
        .prepare("INSERT INTO slots (start, duration) VALUES (?, ?)")
        .run(start, Number(duration));
    res.status(201).json({ id: info.lastInsertRowid });
});

// Book a slot.
app.post("/api/slots/:id/book", (req, res) => {
    const name = String(req.body?.name ?? "").trim();
    const email = String(req.body?.email ?? "").trim();

    if (!name || !/^\S+@\S+\.\S+$/.test(email)) {
        return res.status(400).json({ error: "Please enter your name and a valid email." });
    }

    const info = db
        .prepare(
            "UPDATE slots SET guest_name = ?, guest_email = ?, booked_at = ? WHERE id = ? AND guest_email IS NULL"
        )
        .run(name, email, new Date().toISOString(), req.params.id);

    if (info.changes === 0) {
        return res.status(409).json({ error: "This slot was just booked by someone else." });
    }
    res.json({ ok: true });
});

// Delete a slot (host).
app.delete("/api/slots/:id", (req, res) => {
    const info = db.prepare("DELETE FROM slots WHERE id = ?").run(req.params.id);
    if (info.changes === 0) return res.status(404).json({ error: "Slot not found." });
    res.json({ ok: true });
});

// In production, the same server also serves the built React app.
const dist = path.join(process.cwd(), "dist");
app.use(express.static(dist));
app.use((_req, res) => res.sendFile(path.join(dist, "index.html")));

const port = Number(process.env.PORT ?? 3001);
app.listen(port, () => console.log(`API on http://localhost:${port}`));