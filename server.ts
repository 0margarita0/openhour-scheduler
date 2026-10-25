
import express from "express";
import pg from "pg";
import path from "node:path";

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is not configured.");
}

const db = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
});

const app = express();
app.use(express.json());

app.get("/api/health", async (_req, res) => {
    try {
        await db.query("SELECT 1");
        res.json({ ok: true });
    } catch (error) {
        console.error("Database health check failed:", error);
        res.status(500).json({ error: "Database connection failed." });
    }
});

// Public list: guests see whether a slot is booked, not who booked it.
app.get("/api/slots", async (_req, res) => {
    try {
        const result = await db.query(`
            SELECT id, start, duration,
                   (guest_email IS NOT NULL) AS booked
            FROM slots
            ORDER BY start
        `);

        res.json(result.rows);
    } catch (error) {
        console.error("Could not list slots:", error);
        res.status(500).json({ error: "Could not load slots." });
    }
});

// Host list: includes guest name and email.
app.get("/api/host/slots", async (_req, res) => {
    try {
        const result = await db.query(`
            SELECT *,
                   (guest_email IS NOT NULL) AS booked
            FROM slots
            ORDER BY start
        `);

        res.json(result.rows);
    } catch (error) {
        console.error("Could not list host slots:", error);
        res.status(500).json({ error: "Could not load slots." });
    }
});

// Create a slot. Reject any overlapping time interval.
app.post("/api/slots", async (req, res) => {
    const { date, time, duration } = req.body ?? {};
    const start = `${date}T${time}`;
    const minutes = Number(duration);

    const valid = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(start);

    if (!valid || ![15, 30, 45, 60].includes(minutes)) {
        return res.status(400).json({
            error: "Please enter a valid date, time and duration.",
        });
    }

    try {
        // Existing interval overlaps the requested interval when:
        // existing start < new end AND existing end > new start.
        const overlapping = await db.query(
            `SELECT id
             FROM slots
             WHERE start::timestamp <
                       ($1::timestamp + ($2 * INTERVAL '1 minute'))
               AND (start::timestamp +
                       (duration * INTERVAL '1 minute')) > $1::timestamp
             LIMIT 1`,
            [start, minutes]
        );

        if (overlapping.rows.length > 0) {
            return res.status(409).json({
                error: "This time overlaps with an existing slot.",
            });
        }

        const result = await db.query(
            `INSERT INTO slots (start, duration)
             VALUES ($1, $2)
                 RETURNING id`,
            [start, minutes]
        );

        res.status(201).json({ id: result.rows[0].id });
    } catch (error) {
        console.error("Could not create slot:", error);
        res.status(500).json({ error: "Could not create slot." });
    }
});

// Book a slot. Only an unbooked slot can be updated.
app.post("/api/slots/:id/book", async (req, res) => {
    const name = String(req.body?.name ?? "").trim();
    const email = String(req.body?.email ?? "").trim();

    if (!name || !/^\S+@\S+\.\S+$/.test(email)) {
        return res.status(400).json({
            error: "Please enter your name and a valid email.",
        });
    }

    try {
        const result = await db.query(
            `UPDATE slots
             SET guest_name = $1,
                 guest_email = $2,
                 booked_at = $3
             WHERE id = $4
               AND guest_email IS NULL`,
            [name, email, new Date().toISOString(), req.params.id]
        );

        if (result.rowCount === 0) {
            return res.status(409).json({
                error: "This slot was just booked by someone else.",
            });
        }

        res.json({ ok: true });
    } catch (error) {
        console.error("Could not book slot:", error);
        res.status(500).json({ error: "Could not book slot." });
    }
});

// Delete a slot.
app.delete("/api/slots/:id", async (req, res) => {
    try {
        const result = await db.query(
            "DELETE FROM slots WHERE id = $1",
            [req.params.id]
        );

        if (result.rowCount === 0) {
            return res.status(404).json({ error: "Slot not found." });
        }

        res.json({ ok: true });
    } catch (error) {
        console.error("Could not delete slot:", error);
        res.status(500).json({ error: "Could not delete slot." });
    }
});

// Serve the built React app in production.
const dist = path.join(process.cwd(), "dist");

app.use(express.static(dist));

app.use((_req, res) => {
    res.sendFile(path.join(dist, "index.html"));
});

const port = Number(process.env.PORT ?? 3001);

async function startServer() {
    try {
        await db.query(`
            CREATE TABLE IF NOT EXISTS slots (
                                                 id SERIAL PRIMARY KEY,
                                                 start TEXT NOT NULL,
                                                 duration INTEGER NOT NULL,
                                                 guest_name TEXT,
                                                 guest_email TEXT,
                                                 booked_at TEXT
            )
        `);

        app.listen(port, () => {
            console.log(`API listening on port ${port}`);
        });
    } catch (error) {
        console.error("Failed to initialize PostgreSQL:", error);
        process.exit(1);
    }
}

startServer();
