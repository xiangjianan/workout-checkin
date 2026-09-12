# 📅 Check-in · Two Independent Bet Plans

**English** | [简体中文](README.zh-CN.md)

A **fully local, zero-dependency** check-in site containing two mutually independent bet plans, with data stored separately in each browser's local storage (localStorage):

| Path | Page | File |
|---|---|---|
| `/` (root path) | 📅 Daily either-or check-in (workout/study · 50 days) | `index.html` |
| `/100` | 🏋️ Workout check-in (100 days · 50 sessions · 5 exercises) | `100.html` |

> To open locally by double-click: the daily check-in is `index.html`, the workout check-in is `100.html`.

## 📅 Daily Check-in (Root Path) Rules

- **Frequency**: once per day, **50 days** in total (no rest days).
- **Either-or**: each day you check in, pick **💪 workout** or **📚 study**; completing either counts as a successful check-in (+¥200).
- **The bet**: ¥10,000; each checked-in day returns **¥200**, exactly returning the full amount over 50 days.
- **Skipping**: for special reasons such as menstruation you can "skip this day" — the streak is not broken, ¥200 is not returned, and the day does not count toward the 50 days; later days automatically shift by 1 day. You may skip up to 6 days in a row; checking in on any day resets the count. A skipped day can still be checked in as usual (overriding the skip).
- **Broken streak**: if a past check-in day goes unchecked, the streak is broken and the remaining money cannot be returned; click **make up** on that day to restore it.
- The stats area separately shows how many "workout / study" days have been accumulated; after checking in you can switch the category or cancel with one click.

## 🏋️ Workout Check-in (/100) Plan Rules

- **Frequency**: every other day (1 training day / 1 rest day), for a total of **50 sessions / 100 days**.
- **Exercises**: push-ups, sit-ups, squats, power twister, dumbbells.
- **Progressive increase**: taking push-ups as an example — 2 reps in session 1, 4 in session 2 … +2 per session, capped at 100.
- **The bet**: pay ¥10,000 up front; each completed and checked-in session returns **¥200**, and the full ¥10,000 is returned after 50 sessions. If any training day goes unchecked, the streak breaks and the remaining money cannot be returned.

> Judging rule: a day counts as "checked in successfully" (+¥200) only when all 5 exercises reach their target reps.

## Usage

1. Open the site root (daily check-in) or `/100` (workout check-in); locally, double-click `index.html` / `100.html`.
2. On first open it starts from **today** by default; to change this, click "Settings" in the top-right corner.
3. Daily check-in: click today's cell → choose 💪 workout or 📚 study to complete.
4. Workout check-in: click a **training day** on the calendar (a cell with `#number`) and record per-exercise progress; you can also click "Complete all of today's sets" at the bottom of the dialog.

## LAN Deployment (Check In from Your Phone Too)

Zero dependencies — you only need Node.js installed on your machine:

- **Double-click `启动局域网服务.command`** (simplest), or run `npm run lan` in the project directory.
- The terminal prints the LAN address (e.g. `http://192.168.x.x:8000`); connect your phone to the **same Wi-Fi** and open it directly in a browser.
- To change the port: `node scripts/dev-server.js --port 9000`.
- Responses carry `Cache-Control: no-cache`, so the phone always gets the latest code.
- If the macOS firewall prompt appears on first launch, choose "Allow".

> Note: data is stored **locally in each device's browser** (localStorage) — computer and phone data are not synced. When switching devices, first tap "Export" on the original device, then "Import" on the new one.

## Use It Like a Mobile App (PWA)

After opening via the LAN address, you can add it to your phone's home screen for full-screen use, even offline:

- **iPhone (Safari)**: open the LAN address → share button at the bottom → "Add to Home Screen".
- **Android (Chrome)**: open the LAN address → menu at the top right → "Add to Home Screen / Install app".

> The PWA offline cache (Service Worker) only works under `http(s)://`; it is skipped automatically when opening `index.html` by double-click (file://), without affecting usage.

## Features

- **Calendar view**: training days / rest days / checked / pending / missed at a glance, with month navigation.
- **Quick check-in**: each exercise supports `−1 / +1 / mark complete / reset to zero`.
- **Smart grouping**: open a training day and pick a grouping scheme. Divisor schemes are one-click selectable (e.g. target 10 → 1 set×10 / 2 sets×5 / 5 sets×2 / 10 sets×1); tap "✏️ Custom" to set any number of sets and adjust each one, with the last set auto-balancing the remainder (e.g. 100 → 34+33+33). Totals are validated in real time, and "Apply grouping" applies the scheme to all 5 exercises at once.
- **Batch grouping & per-set completion**: the grouping scheme applies to all 5 exercises with one click; tapping "Set 1", "Set 2", etc. marks that set across all 5 exercises complete at once (great for a rhythm of "one set of each of the 5 exercises → rest → next set"). Once grouped, the set buttons are shown directly, no expanding needed.
- **Set order locking**: while earlier sets are incomplete, later sets are locked (🔒) and cannot be checked off; unchecking must also proceed from the last set backwards, keeping the workout in order.
- **Success celebration animation**: when all 5 exercises of a training day are complete, a full-screen confetti + 🎉 animation + coin-arrival sound effect plays (synthesized with Web Audio, no audio files needed), reminding you to collect your ¥200. On completed days you can tap "🎉 Replay animation" anytime; Settings also has a "Test check-in celebration animation" button.
- **Statistics**: completed sessions, remaining sessions/days to goal, refunded/pending/lost amounts.
- **Data safety**: "Export" backs up your data as JSON and "Import" restores it; back up before switching browsers or clearing the cache.

## Directory Structure

```
work_out/
├── index.html              # 📅 Daily check-in page (root path /)
├── 100.html                # 🏋️ Workout check-in page (/100)
├── _redirects              # Cloudflare Pages routing (old /daily links → /)
├── styles.css              # Styles (light/dark adaptive, shared by both pages)
├── manifest.webmanifest        # Daily check-in PWA manifest (start_url /)
├── manifest-100.webmanifest    # Workout check-in PWA manifest (start_url /100)
├── package.json            # npm scripts: dev / lan / test
├── 启动局域网服务.command   # Double-click to deploy to the LAN
├── README.md
├── js/
│   ├── logic.js    # Workout plan: config & pure calculations (schedule, targets, bet, streaks)
│   ├── store.js    # Workout plan: localStorage persistence (immutable updates)
│   ├── ui.js       # Workout plan: pure render functions (stats, calendar, check-in panel)
│   ├── app.js      # Workout plan: app entry (state, events, celebration animation & sound)
│   ├── daily-logic.js  # Daily check-in: pure calculations (50-day schedule, broken streaks, type counts)
│   ├── daily-store.js  # Daily check-in: localStorage persistence (immutable updates)
│   ├── daily-ui.js     # Daily check-in: pure render functions
│   └── daily-app.js    # Daily check-in: app entry
├── test/                  # node --test unit tests
└── scripts/
    └── dev-server.js       # Zero-dependency static server (local preview + LAN deployment, extensionless routes like /100)
```

## Customization

- To give an exercise a different progression, edit `start / step / max` in `FT_EXERCISES` at the top of `js/logic.js`.
- Bet amount/days can be adjusted in `FT_CONFIG`.

## About the "Strict Bet"

For convenience, this tool **allows backfilling** past training days. If you want to strictly follow the bet rules, rely on self-discipline and do not backfill check-ins.
