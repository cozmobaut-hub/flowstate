#!/usr/bin/env node

// scripts/add-market-and-push.js
// Run with: node scripts/add-market-and-push.js

import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";
import { fileURLToPath } from "node:url";
import { exec as _exec } from "node:child_process";
import { promisify } from "node:util";

const exec = promisify(_exec);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// assumes this script lives in scripts/ and app.js is in repo root
const APP_JS_PATH = path.join(__dirname, "..", "app.js");

function ask(rl, q) {
  return new Promise((resolve) => rl.question(q, (ans) => resolve(ans.trim())));
}

async function main() {
  console.log("Flowstate market adder\n");

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  try {
    const id = await ask(rl, "Market id (e.g. m1): ");
    const tourn = await ask(rl, "Tournament name (e.g. Prologue): ");
    const round = await ask(rl, "Round (e.g. Prelim 1): ");
    const titleInput = await ask(rl, "Custom title (blank to use Tournament + Round): ");

    const affTeam = await ask(rl, "AFF team name: ");
    const negTeam = await ask(rl, "NEG team name: ");

    const affOddsStr = await ask(rl, "AFF odds (e.g. -130): ");
    const negOddsStr = await ask(rl, "NEG odds (e.g. +110): ");

    const deadline = await ask(rl, "Deadline (YYYY-MM-DD HH:MM): ");

    rl.close();

    const affOdds = Number(affOddsStr || "-110");
    const negOdds = Number(negOddsStr || "+110");

    const title = titleInput || `${tourn} ${round}`.trim();
    const meta = `AFF: ${affTeam}, NEG: ${negTeam}`;

    const marketObj = {
      id: id || `m_${Date.now()}`,
      title: title || "Untitled round",
      meta,
      outcomes: [
        { key: "AFF", label: affTeam || "AFF", odds: affOdds },
        { key: "NEG", label: negTeam || "NEG", odds: negOdds },
      ],
      deadline: deadline || "2026-10-05 20:00",
    };

    // Read app.js
    let appJs = fs.readFileSync(APP_JS_PATH, "utf8");

    // Find SAMPLE_MARKETS array
    const marker = "const SAMPLE_MARKETS = [";
    const idx = appJs.indexOf(marker);
    if (idx === -1) {
      throw new Error("Could not find SAMPLE_MARKETS in app.js");
    }

    // Insert before the closing ];
    const closingIndex = appJs.indexOf("];", idx);
    if (closingIndex === -1) {
      throw new Error("Could not find end of SAMPLE_MARKETS array.");
    }

    const before = appJs.slice(0, closingIndex);
    const after = appJs.slice(closingIndex); // includes ];

    const newEntry =
      "\n  " +
      JSON.stringify(marketObj, null, 2)
        .split("\n")
        .join("\n  ") +
      ",";

    const newAppJs = before + newEntry + after;

    fs.writeFileSync(APP_JS_PATH, newAppJs, "utf8");
    console.log("\n✅ Updated app.js with new market.");

    // Git add/commit/push
    console.log("📦 Running git add .");
    await exec("git add .", { cwd: path.join(__dirname, "..") });

    console.log('📝 Running git commit -m "added lines"');
    try {
      await exec('git commit -m "added lines"', { cwd: path.join(__dirname, "..") });
    } catch (e) {
      // Probably no changes (nothing to commit)
      console.log("⚠️ git commit failed (maybe no changes). Continuing.");
    }

    console.log("🚀 Running git push --force");
    await exec("git push --force", { cwd: path.join(__dirname, "..") });

    console.log("\nDone.");
  } catch (err) {
    rl.close();
    console.error("Error:", err.message || err);
    process.exit(1);
  }
}

main();
