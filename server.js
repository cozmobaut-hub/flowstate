// server.js
import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import bcrypt from "bcryptjs";
import { pool } from "./db.js";
import cors from "cors";
import crypto from "crypto";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 10000;

// ultra-simple in-memory session store (fine for v1)
const sessions = new Map();

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "public")));

function createSession(userId) {
  const token = crypto.randomBytes(24).toString("hex");
  sessions.set(token, { userId, createdAt: Date.now() });
  return token;
}

function getUserIdFromToken(token) {
  const session = sessions.get(token);
  if (!session) return null;
  return session.userId;
}

// signup
app.post("/api/signup", async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password || password.length < 6) {
      return res
        .status(400)
        .json({ error: "Username + password (>=6 chars) required." });
    }

    const hash = await bcrypt.hash(password, 10);
    const insertQuery =
      "INSERT INTO users (username, password_hash) VALUES ($1, $2) RETURNING id, username, balance";
    const result = await pool.query(insertQuery, [username, hash]);
    const user = result.rows[0];

    const token = createSession(user.id);
    res.json({
      token,
      user: {
        id: user.id,
        username: user.username,
        balance: user.balance
      }
    });
  } catch (err) {
    if (err.code === "23505") {
      return res.status(409).json({ error: "Username is already taken." });
    }
    console.error("Signup error:", err);
    res.status(500).json({ error: "Server error during signup." });
  }
});

// login
app.post("/api/login", async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: "Username + password required." });
    }

    const query =
      "SELECT id, username, password_hash, balance FROM users WHERE username = $1";
    const result = await pool.query(query, [username]);
    if (result.rowCount === 0) {
      return res.status(401).json({ error: "Invalid username or password." });
    }

    const user = result.rows[0];
    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) {
      return res.status(401).json({ error: "Invalid username or password." });
    }

    const token = createSession(user.id);
    res.json({
      token,
      user: {
        id: user.id,
        username: user.username,
        balance: user.balance
      }
    });
  } catch (err) {
    console.error("Login error:", err);
    res.status(500).json({ error: "Server error during login." });
  }
});

// current user
app.get("/api/me", async (req, res) => {
  try {
    const authHeader = req.headers.authorization || "";
    const token = authHeader.replace("Bearer ", "").trim();
    if (!token) {
      return res.status(401).json({ error: "Missing token." });
    }

    const userId = getUserIdFromToken(token);
    if (!userId) {
      return res.status(401).json({ error: "Invalid or expired token." });
    }

    const query =
      "SELECT id, username, balance FROM users WHERE id = $1";
    const result = await pool.query(query, [userId]);
    if (result.rowCount === 0) {
      return res.status(404).json({ error: "User not found." });
    }

    const user = result.rows[0];
    res.json({ user });
  } catch (err) {
    console.error("Me error:", err);
    res.status(500).json({ error: "Server error." });
  }
});

app.listen(PORT, () => {
  console.log(`Flowstate listening on port ${PORT}`);
});
