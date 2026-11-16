# Breakside: Ultimate Training

A single-file training app for ultimate frisbee: strength, speed, conditioning,
recovery and disc-skill work that auto-generates around your actual game schedule.

## What is in this folder

| File | What it is |
|---|---|
| `breakside.html` | The whole app. One file, no build step, no dependencies. |
| `manifest.json`, `sw.js`, `icons/` | What makes it installable as an app that works offline. The page runs without them; copy them next to it on the Pi. See [Install it as an app](#install-it-as-an-app-works-offline). |
| `strava-proxy-worker.js` | Optional. A tiny serverless function for the Strava OAuth token exchange. Only needed for automatic Strava sync — see [Strava](#strava-optional). |
| `peer-review.html` | A dossier for peer review: how the training logic works, and which of its numbers rest on established practice versus my own calibration. Open it in a browser. |
| `README.md` | This file. |

---

# Part 1 — Running it

## Option A: just open the file (no Pi, no server)

Double-click `breakside.html`. It runs entirely in the browser.
This is the right choice if you only ever use it on one computer.

Your data is saved in that browser's local storage. **Nothing is uploaded anywhere.**

## Option B: serve it from a Raspberry Pi 3

This is what you want if you plan to use it on your **phone** (which is the point —
it is built to be used mid-workout, one-handed). The Pi becomes an always-on
web server on your home network, and your phone opens it like any website.

### Read this first: where your data actually lives

The Pi serves the **page**. It does **not** store your training data.
Everything is saved in the `localStorage` of whichever browser opened the page.

That has one consequence that will bite you if you skip it:

> **Your phone and the Pi's own browser keep completely separate training logs.**
> Checking a box on your phone will never show up on your laptop, and vice versa.

So: **pick one device as your source of truth** — almost certainly your phone —
and use it consistently. See [Backing up your data](#backing-up-your-data) for
moving data between devices and for backups, which you should actually do, because
there is no server-side copy of anything.

### Step 1 — Prerequisites

Raspberry Pi OS (any recent version, Lite is fine — you do not need a desktop).
Python 3 is preinstalled, which is all we need. Check it:

```bash
python3 --version
```

Get the Pi's address. Either of these works:

```bash
hostname -I          # e.g. 192.168.1.42
hostname             # e.g. raspberrypi  -> reachable as raspberrypi.local
```

The `.local` name works on iPhones, Macs and most Androids because Raspberry Pi OS
ships Avahi/mDNS. If it does not resolve, use the IP address instead, and consider
giving the Pi a static DHCP reservation in your router so the IP stops changing.

### Step 2 — Copy the app onto the Pi

From your Mac, in this folder. Make the app's own directory on the Pi:

```bash
ssh pi@raspberrypi.local 'mkdir -p /home/pi/frisbee'
```

Copy the app in as `index.html`, so the address stays short:

```bash
scp breakside.html pi@raspberrypi.local:/home/pi/frisbee/index.html
```

Copy the files that make it installable next to it:

```bash
scp -r manifest.json sw.js icons pi@raspberrypi.local:/home/pi/frisbee/
```

After you change the app, only the first `scp` needs repeating.

### Step 3 — Try it manually first

```bash
cd /home/pi/frisbee
python3 -m http.server 8080 --bind 0.0.0.0
```

Now open `http://raspberrypi.local:8080` on your phone. If the dashboard loads,
stop the server with `Ctrl+C` and make it permanent in step 4.

If it does not load, jump to [Troubleshooting](#troubleshooting).

### Step 4 — Make it start automatically on boot

Create a systemd service:

```bash
sudo nano /etc/systemd/system/frisbee.service
```

Paste this (if your user is not `pi`, change both `User=` and the paths):

```ini
[Unit]
Description=Breakside ultimate training app
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=pi
WorkingDirectory=/home/pi/frisbee
ExecStart=/usr/bin/python3 -m http.server 8080 --bind 0.0.0.0
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
```

Enable and start it:

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now frisbee.service
sudo systemctl status frisbee.service
```

It will now come back on its own after a reboot or a power cut.

Useful later:

```bash
sudo systemctl restart frisbee.service   # after replacing index.html
sudo journalctl -u frisbee.service -n 50 # look at its log
```

### Step 5 — Put it on your phone's home screen

This is worth the 20 seconds. It removes the browser chrome and makes it open
like a real app, with its own icon.

- **iPhone (Safari):** open the page, tap Share, then *Add to Home Screen*.
- **Android (Chrome):** open the page, tap the ⋮ menu, then *Add to Home screen*.

Note that Safari and the home-screen shortcut can be treated as separate storage
contexts. Once you add it to the home screen, **always open it from the home-screen
icon** so you are always looking at the same saved data.

Over plain `http://` on your home network this is a shortcut that needs the Pi
to be reachable: away from home Wi-Fi it will not open. To make it a real app
that opens anywhere, with or without a connection, do the next section instead.

### Install it as an app (works offline)

Phones only let a web page save itself for offline use when it is served over
**HTTPS**. Tailscale gives the Pi an HTTPS address with a real certificate that
your phone can reach from anywhere (home Wi-Fi or cellular) while the Tailscale
app is on, without exposing the Pi to the internet. It is free for personal use.

1. **On the Pi**, install Tailscale and sign in:

   ```bash
   curl -fsSL https://tailscale.com/install.sh | sh
   ```

   ```bash
   sudo tailscale up
   ```

   Open the link it prints and log in.
2. **On your phone**, install the Tailscale app and sign in to the same account.
3. In the Tailscale admin console, open **DNS**, make sure **MagicDNS** is on,
   and under **HTTPS Certificates** select **Enable HTTPS**. (This publishes
   your machine names in the public certificate log, so do not use a device
   name you would mind being public.)
4. **On the Pi**, serve the app over HTTPS in the background:

   ```bash
   sudo tailscale serve --bg 8080
   ```

   It prints the address, something like
   `https://raspberrypi.your-tailnet.ts.net`. The setting survives reboots.
   `tailscale serve status` shows it, and `sudo tailscale serve --https=443 off`
   turns it off. (Using nginx on port 80 instead? Serve `80`.)
5. **On your phone**, with Tailscale connected, open that `https://` address
   and add it to the home screen as in Step 5. Open it once from the icon while
   connected. From then on it opens and works with no connection, and the rest
   timer can keep the screen awake.

**Move your data across once.** The installed app is a new address, so it
starts empty. In the page you used before: **Athlete → Data, Backup & Sync →
Download backup**. In the installed app, same card: **Restore from file**. Or
turn on [cloud sync](#cloud-sync-use-it-on-several-devices) and add the ts.net
address under Firebase **Authorized domains**.

**Updating it:** copy the new `index.html` to the Pi as usual. The next time
the app opens with a connection, it downloads the new version and shows
*A new version of the app is ready. Tap here to load it.*

If you use the Strava proxy, add the ts.net address to `ALLOWED_REDIRECT_HOSTS`
in `strava-proxy-worker.js` and redeploy it.

### Optional: nginx instead of `python3 -m http.server`

`http.server` is single-threaded and is not meant for serious traffic — but you are
serving one ~340 KB file to one phone, so it is genuinely fine. If you would rather
use a real web server:

```bash
sudo apt update && sudo apt install -y nginx
sudo cp -r /home/pi/frisbee/. /var/www/html/
sudo systemctl enable --now nginx
```

Then the URL is just `http://raspberrypi.local` (port 80, no port number), and you
should disable the python service so the two do not both try to run:

```bash
sudo systemctl disable --now frisbee.service
```

### A note on HTTPS and using this away from home

Everything above serves plain HTTP on your local network, which is fine: the app
sends no data anywhere, and `localStorage` works on plain HTTP.

Do **not** port-forward this to the open internet as-is. If you want to reach it
away from home, use Tailscale as described in
[Install it as an app](#install-it-as-an-app-works-offline) (which also makes it
work offline), another VPN such as WireGuard, or a tunnel like Cloudflare Tunnel.
Those give you HTTPS and authentication; a bare port-forward gives you neither.

---

# Part 2 — Using the app

## The daily loop

1. Open it. It lands on **Today**. (A red dot on the tab means today's check-in
   is not logged yet.)
2. First, tell it about your schedule: on **This Week**, open **Set This Week's
   Games & Practices** and tap an intensity for any day you have a game,
   practice or pickup. Everything else is built around those.
3. On **Today**, tap **Log check-in** and enter your morning numbers from the
   Forerunner 55 — Body Battery at wake-up, sleep hours, resting HR, yesterday's
   stress — plus soreness, how you feel and a note.
4. Train. The workout is at the top, in the order to do it. Tap an exercise
   for how to do it and a rest timer; tap its checkbox when you finish it.
5. On lifts, tap **▤** and log what you actually lifted (type the number or use
   − / +). After training, set **Session effort** under the workout.

That is the whole loop. Steps 3 and 5 are optional but they are what make the
app adapt instead of just displaying a fixed plan.

## The six tabs

**Today** — one day at a time: that day's workout in order with an estimate of
how long it takes, the morning check-in below it, any Strava/manual activity,
and a one-line preview of tomorrow. Tap an exercise for its how-to, a rest
timer and swaps. Prev / Next or the date picker reach any day; past days show
what you checked off. On a phone the tabs sit in a bar at the bottom of the
screen.

**This Week** — your seven days, the work prescribed for each, and the controls
below. Each day has an **Open in Today view** link.

**Calendar** — set intensity for any date, weeks or months out, and add
tournaments and tryouts. The small bars under dates show completed (green) and
missed (red) days.

**Athlete** — season phase, the Foundation→Advanced gate and test battery, your
lifting log and best estimated 1RMs, adherence stats, body metrics, Strava, and
**Data, Backup & Sync**.

**Exercise Bank** — every exercise, searchable, with what it is for. Tap any
exercise for a short how-to: the setup, the movement, and the key safety point.
Advanced-tier work shows here with a 🔒 even before you unlock it, so you can see
what you are working toward.

**How It Works** — the reasoning behind every rule, in more depth than this README.

## The intensity scale

Set this for every game, practice and pickup. It drives everything else.

| | Meaning | Effect |
|---|---|---|
| **None** | No game | Day is free for training |
| **Chill** | Easy jog / social pickup | A casual day: training still goes here and still counts, kept to a short session |
| **Light** | Light practice / easy scrimmage | Same as Chill |
| **Medium** | Competitive game | Counts as the day's session. No max-speed work the day before or after; lifting the day before is avoided |
| **High** | High-intensity competitive game | Counts as the day's session. No max-speed work the day before; lifting and speed avoid the days either side |
| **Max** | 3hr practice + conditioning | Same as High, with more (optional) recovery work |

Games can go on **any** day; the week re-plans around wherever you put them.

**A regular schedule is entered once.** Set one week (say Tue and Sat
practice), then in **Set This Week's Games & Practices** copy it to the next 4
or 8 weeks. **Add** keeps one-off games you already entered on other days;
**Replace** clears them, for when your regular schedule changed. Days you
marked off stay off, tournaments are untouched, and any single day can still
be changed afterwards.

Within the week, the rest day, the sprint day and the lifting days are chosen
together: the app scores every combination and keeps:

- **One rest day a week** with no training. A day you marked off counts. Pick a
  preferred rest day in the Athlete tab, or leave it on Auto; a game on that day
  always wins and the rest day moves.
- **A minimum dose:** at least two lifts a week while building (one in-season)
  and one speed session, even in a crowded week. Before, two hard practices and
  a game a week left no lift at all.
- **Distance from hard sessions:** lifts go as far from games and hard practices
  as the week allows. The day after one is better than the day before, and a
  short lift after practice on the same day is the last resort.
- **Spacing:** no lifting the day before sprints, no back-to-back lifts, no lift /
  sprint / lift runs where it can be avoided. When days are scarce, sprints and a
  short lift can share one day (sprints first).

Volume that does not fit is trimmed rather than crammed, and each day stays one
session long: extra throwing or conditioning on a lift or speed day is one block.

A **Tournament or Tryout** (added in the Calendar tab) is different from several
Max days in a row, and you should use it for anything multi-day. Only an Event
adds the full arc: a **taper** before it, the event itself, and a **recovery**
window after — each as long as you set. Events also pause your strength cycle
(see below) and override manual settings on the days they touch.

## The five pillars

| | Pillar | What it is |
|---|---|---|
| 🟠 | **Orange** | Strength & power. Runs on a 4-week RPE wave. |
| 🟣 | **Skill** | Throwing power and mechanics, cutting footwork, contested-disc work. Low CNS cost, so it fits on days strength and speed cannot. |
| 🔵 | **Blue** | Conditioning — repeat-sprint ability, shuttles, aerobic base. |
| 🔴 | **Red** | Max speed, reactive plyos, deceleration, change of direction. Always concentrated into one day. |
| 🟢 | **Green** | Recovery, mobility, and prehab scheduled by the week (below). |

Exercises are **numbered in the order you should do them**, and the day runs
Red → Skill → Orange → Blue → Green. Do the numbered work in order: if you are
cooked after ①, you know to scale the rest rather than finding out halfway in.

**Prehab is placed by the week, not by the day:**

- **Nordic + Copenhagen** (hamstrings and groin): twice a week, or once in-season.
  They're preferably on lift days and never on the rest day, a game or practice
  day, the day before one, or within two days of a tournament, because the
  soreness they cause is the wrong thing to carry into a hard session.
- **Ankle & calf** (balance reach and calf raises): twice a week on other days.

A prehab block is only added to a day with room for it.

## Day controls

Each day header has four buttons:

| Button | Does |
|---|---|
| **○ / ✓** | Readiness check-in. ✓ means logged. |
| **⇄** | Substitute the day (no gym, no field). Pick a replacement; the swapped-out work gets re-placed on another day that week if a safe one exists. Game and practice days have nothing to swap. |
| **🔓 / 🔒** | Lock a future day so it keeps its exact workout even if the rest of the week changes. You don't need to lock past days: they, and today once you tick anything, are kept automatically. |
| **✕** | Mark the day off. |

**Mark days off explicitly.** A day you simply ignore is recorded as a *missed
session*, which pulls next week's volume down. A day marked off is understood as
planned rest and does not count against you; up to two a week are ordinary rest
and never make the week a "recovery week".

**Finished days don't change.** Once a day is in the past, or you have ticked
anything on it, its workout is kept as it was, so adding a tournament or next
week's games re-plans only the days still ahead.

On each exercise row: the **checkbox** marks it done, **tapping the name** or **⇄**
shows how to do it and lets you swap it for another exercise in the same movement
pattern, and **▤** (on lifts only) logs your weight, reps and RPE.

## Readiness check-in

The check-in is built around the **Garmin Forerunner 55** and asks only for what
it records. Read these off the watch or Garmin Connect each morning:

| Field | Where on the Forerunner 55 |
|---|---|
| **Body Battery at wake-up** | Body Battery widget, or the morning high in Garmin Connect. Use the wake-up number — it drains all day. |
| **Sleep hours** | Garmin Connect → Sleep |
| **Resting heart rate** | Heart rate widget (RHR) |
| **Yesterday's average stress** | Garmin Connect → Stress (0–100) |
| Recovery time left *(optional)* | Shown after a run |
| Calories *(optional)* | Garmin Connect |

Soreness, how you feel, session effort and a note are yours to fill in. The
Forerunner 55 has **no** Sleep Score, HRV Status or Training Readiness, so the
app does not ask for them. (Values logged in those fields before this change
still show on old check-ins.)

Body Battery is the primary signal when logged:

| Body Battery | Today scales to |
|---|---|
| 65+ | 100% — full session |
| 45–64 | 85% |
| 30–44 | 67% |
| under 30 | 40% — touch only |

Then these can trim the day further:

- **"Off today"** caps it at 67%.
- **Under 6 hours of sleep** caps it at 85%, even if Body Battery recharged.
- **Resting HR 5+ bpm above your baseline** caps it at 85%. The baseline is the
  median of your last four weeks of logged mornings and needs at least 5 of them.

Stress and recovery time only add notes — Body Battery already accounts for
them. No Body Battery? It falls back to your sleep hours minus half your
soreness score.

**A day with no check-in trains at 100%.** No data is not treated as bad data —
you never need to log anything to get your full session.

## Injuries and limits

Hurt something? Tap **Injured or sore? Set limits** on Today (or **Athlete →
Injuries & Limits**). There is no injury list: you mark what hurts by what it
stops you doing. Each area can be **Full**, **Easier** or **Skip**:

| Area | Covers |
|---|---|
| Top-speed sprinting | max-velocity and flying sprints |
| Short sprints & cutting | acceleration, cuts, stops, agility |
| Jumping & landing | plyos, bounds, skying for the disc |
| Running conditioning | tempo, shuttles, repeat sprints, long runs |
| Squats & lunges | knee-dominant leg lifts |
| Deadlifts & hamstrings | hinges, RDLs, Nordics, lower back |
| Pushing | presses: chest and shoulders |
| Pulling & grip | rows, pull-ups, carries: back, arms, hands |
| Core & rotation | chops, rotational throws, anti-rotation |
| Throwing | every throwing drill |
| Catching & layouts | catching, contested disc, diving |

- **Easier** drops the exercises that load the area hardest and keeps the rest
  at about two-thirds of the sets or minutes, with lifts capped at RPE 7.
- **Skip** drops everything that uses the area. A pillar left empty is not
  planned at all (skip all running and jumping and there is no speed day); a
  pillar left partly empty just gets a shorter session.
- **One exercise:** tap it in a workout and choose **This hurts**. Undo from
  the toast, or bring it back in the editor or the Exercise Bank.

Some starting points: a sore heel or plantar fasciitis, running, jumping and
top speed on Easier. A pulled hamstring, top speed on Skip and deadlifts &
hamstrings on Easier. A jammed finger, throwing, catching and pulling & grip
on Skip.

Limits apply from today on, including a workout you have already started;
finished days keep what they had. A banner on Today and This Week shows what
you are working around until you clear it. If pain lasts more than a week or
two or keeps getting worse, see a physio or doctor.

## The 4-week strength wave

Orange sessions cycle: weeks 1–3 step up in RPE, week 4 deloads.

| Week | Target | Volume |
|---|---|---|
| 1 | RPE 6-7 (light, learn form) | full |
| 2 | RPE 7-8 (moderate) | full |
| 3 | RPE 8-9 (heavy) | full |
| 4 | RPE 6-7 (deload) | Orange −40%, Red −30% |

Match the **RPE**, not a fixed weight. Adjust load up or down to hit it.

The wave **pauses** during tapers, events and recovery windows, and in weeks whose
lifts mostly didn't happen (under half the lift exercises ticked), so it stays in
phase with your season and your actual training. Rest days don't pause it.

Log your sets with **▤** so you can check the wave is real: week 3 should be
heavier than week 1 at the same RPE. If it is not, the wave is not working, and
the Athlete tab will show you that.

## Season phase

In the Athlete tab. **Auto** works week by week: **in-season** when a tournament
or tryout is within four weeks, or when the week has three or more
Medium-or-harder games (or five or more across the surrounding three weeks — a
once-a-week league game alone does not cut your strength block); **pre-season**
when an event is 4–10 weeks out; otherwise **off-season**.

| Phase | Effect |
|---|---|
| **Off-season** | Highest strength and skill volume (Orange ×1.2, Skill ×1.25) |
| **Pre-season** | Speed and conditioning rise (Red and Blue ×1.15) |
| **In-season** | Strength *volume* drops to two-thirds; RPE target unchanged. The games are the load; the lifts hold what you built. |

## Missed sessions

A prescribed day left completely unchecked past end-of-day, and never marked off,
is logged as missed. **Games and practices rated Medium or harder count as played**
on their own, so the optional recovery work on those days never makes them
missed. A casual Chill/Light pickup day still has work that counts. Three
consequences of a missed day:

- Half credit toward recovery-week detection.
- A rolling 14-day trim: 2 missed cuts volume 7%, 4+ cuts it 15%. The generator
  stops prescribing against work you did not absorb.
- It counts against the 80% adherence floor on the Foundation clock.

A logged or synced Strava activity that day downgrades it from *missed* to
*logged externally* — evidence the session happened and just was not ticked off.

The last **13 days** are scored (the checklist is stored per real date). Nothing
older is re-scored.

## Foundation → Advanced tier

Advanced work — depth-jump contrast complexes, resisted and overspeed sprints,
live layout D — assumes a strength and landing base already exists. Skipping that
base is one of the most common avoidable injury paths, so it is gated on **both**
of these, not either:

**Time served:** 10 weeks of Foundation training at 80%+ adherence. Weeks below
the floor do not advance the clock.

**Test battery** (Athlete tab → *Log test battery*, retest every 4–6 weeks):

| Test | Target |
|---|---|
| Squat or trap-bar estimated 1RM ÷ bodyweight | ≥ 1.5× |
| Standing broad jump ÷ height | ≥ 1.2× |
| Landing mechanics: quiet, no knee valgus, 3s stable stick | all three |
| 300-yard shuttle | ≤ your target (default 68s, 75s at most) |

Film the landing check from the front on your phone and be honest about it — that
is the test protecting your knees. No true 1RM attempt is needed; an estimate from
a heavy set of 3–5 is fine, and the app will suggest one from your logged sets.

Fail a retest and the Athlete tab names the **specific** test that is the gap.
Pass everything with the clock met and advanced work unlocks itself, and the
generator switches to dedicated single-quality days instead of blended sessions.

There is a manual override, and a real reason not to use it unless you genuinely
have years of that base already.

## Strava (optional)

Strava gives per-activity duration, heart rate and calories — enough to confirm a
session happened and how hard it was. It does **not** carry Body Battery, sleep or
stress; that is Garmin-proprietary and never enters Strava's data model, which is
why the manual entries are not redundant with it.

Three ways to get activity data in, easiest first:

**1. Log it by hand.** Athlete tab → *Log an activity by hand*. Always works.

**2. Paste an access token.** Get one from your Strava API settings
(<https://www.strava.com/settings/api>), paste it into the *Strava access token*
field, and hit *Sync activities*. No server needed. The token expires in about six
hours, so this is for occasional catch-up syncs.

**3. Deploy `strava-proxy-worker.js`** for a durable connection. Strava's
code-to-token exchange requires your client secret, which cannot live in a
client-side file — anyone who opens the file could read it. The worker does that
exchange on infrastructure you control. Full deploy instructions are in the
comment block at the top of that file.

**Why not run the proxy on the Pi?** Because Strava's OAuth callback has to be a
publicly reachable HTTPS address, and a Pi behind home NAT is neither public nor
HTTPS without extra work (a domain, port forwarding, certificates). Cloudflare
Workers gives you both for free on its free tier, which is why the worker targets
it. Options 1 and 2 above need no server at all and are the natural fit for a
Pi-hosted setup.

Note also that live sync needs the page opened as a real web page — which the Pi
setup gives you. It will not work inside a sandboxed artifact frame, which blocks
outbound network calls.

---

# Cloud sync (use it on several devices)

Optional, free, and about 10 minutes of one-time setup. Once it is on, you sign
in with Google on each device and every check-off, check-in and setting follows
you. Each device keeps a full working copy, so the app still works offline and
uploads when it reconnects.

1. Go to <https://console.firebase.google.com> → **Add project** (Google
   Analytics can be off).
2. **Build → Authentication → Get started → Sign-in method → Google → Enable →
   Save.**
3. **Build → Firestore Database → Create database** → production mode → pick a
   region near you.
4. **Firestore → Rules**, replace everything with this, then **Publish**:

   ```
   rules_version = '2';
   service cloud.firestore {
     match /databases/{database}/documents {
       match /users/{uid}/{document=**} {
         allow read, write: if request.auth != null && request.auth.uid == uid;
       }
     }
   }
   ```

   This is what keeps your data private to your Google account — skip it and
   sync fails with "permission denied".
5. **Project settings (gear) → General → Your apps → Web (`</>`)** → register an
   app → copy the `firebaseConfig` object it shows.
6. Either paste that object into `FIREBASE_CONFIG` near the top of the script in
   `breakside.html` (every device then picks it up), or paste
   it into **Athlete → Data, Backup & Sync** on each device.
7. Serve the page over **https**. Sign-in does not work when the file is opened
   directly (`file://`). The simplest route is Firebase Hosting, which is free
   and works away from home too: copy the HTML to `public/index.html`, then
   `npm install -g firebase-tools`, `firebase login`, `firebase init hosting`,
   `firebase deploy` → `https://<project>.web.app`. If you keep using the Pi,
   add its address under **Authentication → Settings → Authorized domains**
   (`localhost` is allowed by default).
8. Open the app on each device → **Sign in with Google**.

**First sign-in on a device that already has data:** if your account already
has data from another device, it asks which copy this device should use — the
cloud's, or this device's (which then replaces the cloud copy for all devices).
Either way a copy of this device's previous data is kept locally, downloadable
from **Download pre-sync copy**.

**How conflicts resolve:** the most recent save of each item wins. Day-level
items (a day's checklist, check-in, game setting) sync independently; the lift
log, compliance history, events and activity list are each one item, so editing
the same one on two devices while both are offline keeps the later save.

---

# Backing up your data

**Athlete → Data, Backup & Sync → Download backup** saves everything as one JSON
file; **Restore from file** loads it back (on any device). With cloud sync on,
a restore also replaces the cloud copy. Without sync there is no server-side
copy — if you clear your browser data, it is gone. Every key is prefixed
`husky_` in `localStorage` (kept from the app's old name, so existing data carries over). Without sync, the app reminds you to download a
backup once a week has passed since the last one (at most every few days).

The console method below still works as a fallback.

**To export:** open the page, open your browser's developer console, and run:

```js
copy(JSON.stringify(Object.fromEntries(
  Object.entries(localStorage).filter(([k]) => k.startsWith('husky_'))
)))
```

That puts a JSON blob on your clipboard. Paste it into a file and keep it
somewhere safe. (On a phone, use *Share → Copy* of the same output, or just do
this occasionally from a desktop browser.)

**To restore it, or to move your data to another device**, run this on the target
device with your backup pasted in place of `BACKUP`:

```js
const BACKUP = { /* paste the JSON here */ };
Object.entries(BACKUP).forEach(([k, v]) => localStorage.setItem(k, v));
location.reload();
```

Compliance and lifting history are pruned after 400 days.

---

# Troubleshooting

**The page will not load on my phone.**
Check the server is up: `sudo systemctl status frisbee.service`. Then confirm the
phone is on the **same Wi-Fi network** as the Pi (not guest Wi-Fi, and not on
cellular). Try the raw IP from `hostname -I` instead of the `.local` name.

**`raspberrypi.local` does not resolve.**
mDNS is blocked on some networks and some Android versions. Use the IP address, and
give the Pi a static DHCP reservation in your router so it stays put.

**Port 8080 is already in use.**
Pick another port in the service file (`8081`, `8888`), then
`sudo systemctl daemon-reload && sudo systemctl restart frisbee.service`.

**I replaced `index.html` and nothing changed.**
Installed over HTTPS, the app opens its saved copy first and fetches the new one
in the background: wait for *A new version of the app is ready* and tap it. Over
plain http, your browser cached the old one: hard-refresh, or on iOS close the
tab and reopen from the home-screen icon.

**My progress vanished.**
Almost always a different storage context: a different browser, a private/incognito
window, Safari vs. the home-screen icon, the installed app vs. the old `http://`
page, or cleared site data. The data is per browser per device and per address.
Pick one and stick to it, and move data with Download backup / Restore from file.

**Every day says "Missed".**
You are not ticking the checkboxes, or you are leaving days you do not intend to
train un-marked. Use **✕** to mark real rest days off — that stops them counting
against you.

**Everything says Blue and nothing else.**
You probably have no games set. With no schedule the generator has no structure to
build around. Set your games and practices first.

---

# Tuning it

Everything is plain, commented JavaScript in one file — search for these to adjust:

| Search for | Controls |
|---|---|
| `baseOrange`, `baseRed`, `baseBlue`, `baseSkill` | Weekly volume targets before any multipliers |
| `SEASON_PHASES` | Off/pre/in-season multipliers |
| `getProgressionMultipliers` | Deload-week volume cuts |
| `getReadinessScale` | Body Battery bands and the sleep/soreness fallback |
| `TEST_TARGETS`, `FOUNDATION_WEEKS_REQUIRED`, `ADHERENCE_FLOOR` | The Advanced-tier gate |
| `MAX_DAILY_UNITS`, `DAY_EXERCISE_BUDGET` | Ceilings on how much can land on one day |
| `PLACE_PENALTY`, `MIN_LIFTS` | How the week's rest, sprint and lifting days are chosen, and the minimum lifts per week |
| `PREHAB_PER_WEEK` | Weekly Nordic/Copenhagen and ankle/calf frequency |
| `EXERCISES` | The exercise bank itself — add your own |
| `HOW_TO` | The how-to cues for each exercise, keyed by exercise id — add one for any exercise you add |
| `EST_MIN` | Minutes per exercise (including its rest) behind each day's time estimate |
| `restSecondsFor` | Default rest-timer lengths when a prescription does not name one |
| `BLUE_TEMPLATES`, `SKILL_ROTATION` | Which conditioning and skill categories each session draws on, per season phase |
| `LIMIT_AREAS`, `LIMIT_TAGS`, `EASE_SCALE` | The injury-limit areas, which areas each exercise uses (1) or loads hard (2), and how much an Easier limit leaves |
| `GAME_LEVELS` | The intensity scale, including which levels block heavy work |

After editing, copy the file to the Pi again. The python server picks it up
without a restart; the installed app offers the new version the next time it
opens with a connection.
