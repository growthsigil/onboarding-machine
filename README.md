README
 Onboarding Machine
Turn every sales call into a clean client onboarding brief — automatically.
When a call recorded in Fathom ends, this app reads the transcript, has Claude
sort it into a structured brief (who they are, what they want, their pains, what
they need from you, what you promised, and the first steps to take), and delivers
it. You walk into the kickoff already knowing exactly who this client is.
You don't write any code. You make a few free accounts, paste some keys, and
deploy. If you get stuck, copy the error into Claude Code (or ChatGPT) and say
"fix this."
   Sales call ends (recorded in Fathom)
              │
              ▼
   Your app reads the transcript  →  Claude sorts it into a brief
              │
              ├─►  Saved + readable at /briefs        (always on)
              ├─►  Filed as a Google Doc              (optional)
              └─►  Pinged to your phone on Telegram   (optional)
​
Everything but the first line is optional. With nothing extra connected, your
briefs still show up at a private /briefs page. Add Google to get Docs, add
Telegram to get phone pings — your choice.
What each brief contains
The 15-second version — the whole client in a few sentences
What they want — the outcome they're actually buying
Where they are now — their starting point, what they've tried
Goals · Pain points · What they need from us
Objections & risks · What we committed to · Kickoff actions
Red flags and their own words (direct quotes)
What you'll need
Make these as the steps ask for them, not before.
Service
What it does
Cost
Anthropic
The AI brain (Claude)
Pay per use — a brief costs cents. Start with ~$5
Supabase
Stores your briefs
Free
GitHub
Holds your copy
Free
Vercel
Puts your app online
Free
Fathom
Records your calls
Free tier records; webhooks/API need a paid plan
Optional: Google
Files briefs as Google Docs
Free
Optional: Telegram
Pings briefs to your phone
Free
The fast way: let Claude Code do it
If you use the Claude desktop app → Code, open your copy of this repo and paste:
Read README.md in this repo and walk me through setting up the Onboarding
Machine one step at a time. I'm not technical — do every technical part for me,
ask for one thing at a time, and tell me exactly where to click to find it.
Keep Telegram and Google optional. Start with step 1.
​
Otherwise, follow the steps below yourself.
Setup — the required core (about 20 minutes)
Step 1 — Get your own copy
Click Use this template → Create a new repository (or fork/clone this repo).
Name it whatever you like, keep it Private. You now own a full copy.
Step 2 — Get your Anthropic key
console.anthropic.com → API Keys → create one.
Add a little credit (~$5). Copy the key (starts with sk-ant-...) — you'll paste
it in Step 4.
Step 3 — Create your database (Supabase)
supabase.com → New project. Pick a name + password,
any region. Wait ~1 minute for it to finish.
Open SQL Editor → New query, paste the entire contents of
db/schema.sql, and press Run. (You'll come back to
replace two placeholders later if you want the poller — that's fine.)
Open Project Settings → API and copy two things:
Project URL → this is SUPABASE_URL
service_role secret (under Project API keys) → this is SUPABASE_SERVICE_ROLE_KEY
Step 4 — Deploy to Vercel
vercel.com → Add New → Project → import your repo.
Important: if this app lives in a subfolder of your repo, set Root
Directory to that folder (e.g. onboarding-machine). If it's the whole
repo, leave it.
Under Environment Variables, add the four required ones:
ANTHROPIC_API_KEY          = (your Anthropic key)
SUPABASE_URL               = (your Project URL)
SUPABASE_SERVICE_ROLE_KEY  = (your service_role secret)
ACCESS_KEY                 = (invent a long random string — your password)
​
Click Deploy. When it finishes, Vercel gives you a URL like
https://your-app.vercel.app.
Step 5 — Tell the app its own address
Add one more env var and redeploy:
NEXT_PUBLIC_BASE_URL = <https://your-app.vercel.app>     (no trailing slash)
​
Vercel → Deployments → Redeploy so it takes effect.
Step 6 — Check it
Open this in your browser (swap in your URL + access key):
<https://YOUR-APP-URL/api/setup-check?k=YOUR-ACCESS-KEY>
​
You want "ready": true. It also shows which optional pieces are on. If a core
item is missing, it names it.
Step 7 — Connect Fathom (the instant trigger)
Point Fathom at your app so a finished call is handled right away.
Fathom webhooks / Zapier / Make: add an automation that fires on a new
recording / transcript, sending the meeting transcript (plus title,
attendees, share URL) to:
In Zapier/Make: trigger Fathom → New Recording, action Webhooks → POST
to that URL with the transcript/title/attendees in the body.
<https://YOUR-APP-URL/api/webhook/fathom?k=YOUR-ACCESS-KEY>
​
The app reads common field names defensively, so most payload shapes just work.
Step 8 — Test it
Send a fake call (swap in your URL + key):
curl -X POST "<https://YOUR-APP-URL/api/webhook/fathom?k=YOUR-ACCESS-KEY>" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Onboarding — Acme Co",
    "attendees": [{"name":"Sarah Chen","email":"sarah@acme.co"}],
    "share_url": "<https://fathom.video/share/example>",
    "transcript": "Me: thanks for hopping on Sarah. Where are things at?\nSarah: honestly Im drowning, our follow up is a mess and leads go cold. I want a system so nothing slips. Budget is fine if it works. Need it live within a month before our busy season."
  }'
​
You'll get {"ok":true,"queued":true}, then within a minute the brief appears at:
<https://YOUR-APP-URL/briefs?k=YOUR-ACCESS-KEY>
​
That's the whole core. Everything below is optional.
Optional add-ons
A) Only brief PAID clients
So you don't spend AI/space on prospects who didn't buy. Add:
FATHOM_PAID_KEYWORDS = onboarding,won,paid
​
Now a call becomes a brief only if its Fathom title or a tag contains one of
those words. When a client pays, name their call Onboarding — Their Co (or tag
it won). Everything else is skipped. Leave this blank and every call is briefed.
B) File each brief as a Google Doc
Google Cloud Console → APIs & Services: enable the Google Drive API.
Under OAuth consent screen, pick External, fill the basics, and add
your own email as a Test user.
Credentials → Create credentials → OAuth client ID → Web application.
Add this exact Authorized redirect URI:
Copy the Client ID + secret into Vercel:
Redeploy.
<https://YOUR-APP-URL/api/connect-google/callback>
​
GOOGLE_OAUTH_CLIENT_ID     = ...
GOOGLE_OAUTH_CLIENT_SECRET = ...
​
Open this once and click Allow:
Done — briefs now also appear as Docs in a "Client Onboarding" folder in your
Drive.
<https://YOUR-APP-URL/api/connect-google?k=YOUR-ACCESS-KEY>
​
C) Get briefs on Telegram
Fully optional — leave these blank and Telegram stays off.
Telegram → @BotFather → /newbot → copy the token.
Telegram → @userinfobot → copy your numeric id. Open your new bot and
press START once.
In Vercel:
Redeploy. Each brief now pings your phone with a link.
TELEGRAM_BOT_TOKEN = ...
TELEGRAM_CHAT_ID   = (your numeric id)
​
D) The "rename anytime" poller
Fathom's webhook fires once, using the title as it was then — so if you rename
a call to a paid keyword later, the webhook won't re-fire. This poller fixes
that: every 5 minutes it checks Fathom for calls you've renamed and briefs them.
Get a Fathom API key (Fathom → Settings → API; needs a plan with API
access). Add to Vercel: FATHOM_API_KEY = ... and make sure
FATHOM_PAID_KEYWORDS is set (Option A). Redeploy.
In Supabase → SQL Editor, re-run db/schema.sql after replacing
YOUR-APP-URL and YOUR-ACCESS-KEY in its HEARTBEAT section. That schedules
the 5-minute check.
Confirm it can see your calls (creates nothing):
<https://YOUR-APP-URL/api/cron/fathom?probe=1&k=YOUR-ACCESS-KEY>
​
Now: record the call, rename it to include your keyword whenever you get a moment,
and the brief shows up a few minutes later.
Where your briefs live
Always readable at https://YOUR-APP-URL/briefs?k=YOUR-ACCESS-KEY — no Google or
Telegram needed. That page is private to whoever has your access key.
Troubleshooting
unauthorized — the ?k= must match your ACCESS_KEY exactly.
setup-check shows database_reachable: false — re-run db/schema.sql,
and double-check SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY.
No brief after a test — your transcript must be at least a couple of
sentences (tiny payloads are ignored on purpose). If you set
FATHOM_PAID_KEYWORDS, the test title must contain one of them.
"Token exchange failed" connecting Google — the redirect URI on your OAuth
client must match https://YOUR-APP-URL/api/connect-google/callback exactly.
Google connected but no Doc — enable the Google Drive API for the
project, then click the connect link and Allow once more.
Poller probe shows 0 meetings or an error — check your FATHOM_API_KEY
and that your Fathom plan includes API access.
Anything else — paste the error into Claude Code and say "fix this."
How it works (for the curious)
Two ways in:
  Fathom recording ready ──POST──► /api/webhook/fathom   (instant, push)
  Rename a call later ────────────► /api/cron/fathom      (every 5 min, pull)
        │
        ▼
  Paid gate: keyword in title/tag?  (no → stop, nothing created)
        │ yes
        ▼
  Claude sorts the transcript → structured brief   (lib/fathom.ts)
  one shared pipeline for both entries (lib/intake.ts), deduped by call id
        │
        ├─► stored in Supabase  → readable at /briefs   (always)
        ├─► Google Doc          (if connected)
        └─► Telegram ping       (if configured)
​
Roughly what it costs
Anthropic charges per call processed — a single brief is a few cents. Supabase,
Vercel, GitHub, Telegram are free at this scale. The only paid piece is Fathom's
own plan (for webhooks/API), plus your Anthropic credit.
Built to be given away. Fork it, rename it, make it yours.
