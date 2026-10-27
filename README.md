# Dash MFB — Internal App Directory

One console for Dash MFB's internal applications and identities, at **https://applications.dash-mfb.com**.

- **Everyone** gets the **Applications** page, with no sign-in needed: every internal app, grouped by category and searchable, with the team that supports it.
- **IT staff** use **Staff sign in** in the sidebar to unlock the rest of the console in the same layout. From there they manage the bank's OCI IAM identity domain (users synced from Active Directory, groups, integrated applications, user credentials and administrator roles), manage the Applications page's links, and review the audit log.

The Django admin at **https://applications.dash-mfb.com/admin/** is still there as a fallback. It isn't linked anywhere, so bookmark it.

## Stack

| Part | Tech |
| --- | --- |
| Backend | Django 6, Django REST Framework, django-axes, Waitress, WhiteNoise, psycopg, requests, OCI Python SDK (request signing only) |
| Database | PostgreSQL 18 in production, SQLite for local development |
| Frontend | React 19 (Vite), React Router 7, TanStack Query 5, Tailwind CSS v4, Motion (Framer Motion), lucide-react |
| Identity | OCI IAM identity domain, through its SCIM REST API (`/admin/v1/...`) |
| Hosting | Windows Server: IIS (URL Rewrite + ARR) in front, Django run as a service by NSSM |

## Project layout

```
Bank_LinkTree/
├── backend/
│   ├── config/
│   │   └── settings.py         # Reads production settings from DJANGO_* environment variables
│   └── links/
│       ├── models.py           # Category, AppLink
│       ├── fields.py           # URL field that also accepts intranet names (http://corebank:8080)
│       ├── backends.py         # Case-insensitive username login
│       ├── client_ip.py        # Visitor's real IP behind IIS, for login lockout
│       ├── admin.py            # Admin screens for managing links
│       ├── serializers.py      # JSON shape sent to the frontend
│       ├── views.py            # GET /api/links/
│       ├── tests.py
│       └── management/commands/seed_links.py   # Sample data
│   └── console/                # Identity console API (/api/console/, /api/auth/)
│       ├── directory/
│       │   ├── base.py         # What the console needs from a directory; shared data shapes
│       │   ├── oci.py          # OCI identity domain over SCIM REST (OAuth or API-key signed)
│       │   └── demo.py         # In-memory sample directory for local development
│       ├── views.py, urls.py   # Endpoints; every change calls audit.record()
│       ├── serializers.py      # Input validation
│       ├── models.py           # AuditEvent
│       └── tests.py
└── frontend/
    ├── .env                    # Local API address
    ├── .env.production         # Production API address (/api, same site)
    ├── public/
    │   ├── web.config          # IIS: HTTPS redirect, proxy to Django, security headers
    │   ├── robots.txt          # Asks search engines not to crawl
    │   └── logo.png, favicon.ico, favicon.png, apple-touch-icon.png
    └── src/
        ├── console/
        │   ├── ConsoleApp.jsx  # The whole app: routes, sign-in check, staff-only pages
        │   ├── Layout.jsx      # Sidebar and page frame shared by every page
        │   ├── pages/          # ApplicationsPage (/) plus the management pages
        │   ├── components/     # UI kit, toasts, user/group picker
        │   └── api.js          # Calls the Django API (session cookie + CSRF)
        ├── components/         # Applications page pieces: SearchBar, CategoryFilter, AppCard, ...
        ├── hooks/useTheme.js   # Light/dark mode
        ├── lib/search.js       # Search and filter logic
        ├── lib/icons.js        # Icon names allowed in the admin
        └── index.css           # Tailwind + brand colours
```

## Running it locally

You need Python 3.12+ and Node 20.19+ (or 22.12+). Run the backend and the frontend in two separate terminals. Locally, Django uses SQLite and debug mode, so no environment variables are needed.

### 1. Backend (http://127.0.0.1:8000)

```bash
cd backend
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
python manage.py migrate
python manage.py createsuperuser     # first time only
python manage.py seed_links          # optional: loads sample data
python manage.py runserver
```

### 2. Frontend (http://localhost:5173)

```bash
cd frontend
npm install
npm run dev
```

Open **http://localhost:5173**. Use **Staff sign in** (in the sidebar) with the `createsuperuser` account to see the management pages.

Vite forwards `/api`, `/admin` and `/static` to Django on port 8000 (`frontend/vite.config.js`), so the browser sees one site, as it does in production. The console's sign-in cookie depends on this. Start Django on port 8000. If 5173 is busy, `npm run dev -- --port 5180` works too.

Without OCI settings, the console runs against **demo data**: 12 sample users, groups, apps and admin roles held in memory. A yellow "Demo data" badge says so, and changes vanish when Django restarts. To work against a real identity domain locally, copy `backend/.env.example` to `backend/.env` and fill in the `OCI_*` values (see [Connecting to OCI](#connecting-to-oci)). Django reads that file on startup. It's git-ignored, so secrets never reach GitHub; never put them in `settings.py`. Tests always use demo data, whatever `.env` says.

## Managing links

Sign in to the console and open **Manage links** (`/directory`), or use the Django admin at `/admin/`. The fields below are the same in both. Usernames aren't case-sensitive, so `alex`, `Alex` and `ALEX` all log in to the same account. Don't create two accounts that differ only by case: neither will be able to log in.

- **Categories** group apps on the page. `order` controls the order they appear in. A category with no active apps is hidden. A category that still has apps can't be deleted; move or delete its apps first.
- **App links** need a name, URL and category. The other fields are optional, but they make the page more useful:
  - **url**: must start with `http://` or `https://`. Bare server names are fine (`http://corebank:8080/login`), as are IP addresses and full domain names.
  - **environment**: Production, UAT or Disaster Recovery. Shown as a coloured badge.
  - **owner_team / support_contact**: shown on the card, so staff know who to contact.
  - **tags**: comma-separated nicknames, such as `cbs, core, teller`. Search matches these, so people can find an app without knowing its official name.
  - **is_active**: untick to hide an app without deleting it.
  - **icon**: one of the names in `frontend/src/lib/icons.js`, such as `landmark`, `credit-card`, `users`, `shield`, `headset` or `piggy-bank`. An unknown name shows a generic icon. To add more, import the icon from [Lucide](https://lucide.dev/icons) in that file and add it to the list.

### Sample data

`python manage.py seed_links` loads 5 categories and 11 placeholder apps whose URLs all point at `example.com`. Running it again updates those entries instead of duplicating them, and it never touches records with other names. Don't run it in production.

## The console

Every page shares one sidebar. Signed out, it shows **Applications** only. Sign in with your AD account (see [Signing in with AD](#signing-in-with-ad)) to see the rest. Opening a management page's address while signed out goes to the sign-in page, then back to that page. Local password sign-in has the same lockout as the admin: 5 wrong passwords block that IP for 30 minutes. Sessions end after 8 hours.

| Page | Address | What you can do |
| --- | --- | --- |
| **Applications** | `/` | Browse and search every internal app (everyone, no sign-in). Staff also get a **Manage links** button. |
| **Overview** | `/overview` | Counts of users, groups, apps, administrators and directory links; recent activity |
| **Users** | `/users` | Search and filter; create; edit name, email and title; activate or deactivate; delete; reset the password by email or as a one-time password; add to groups |
| **Users → Credentials** | `/users` | List, add and delete a user's API keys (paste a PEM public key), auth tokens, customer secret keys, SMTP credentials and OAuth 2.0 client credentials. New secrets are shown **once**. |
| **Groups** | `/groups` | Create, rename and delete groups; add and remove members |
| **Integrated apps** | `/integrated-apps` | Register confidential (server-side) or public (mobile/SPA) OAuth applications; edit; activate or deactivate; delete; assign users and groups; show the client ID and secret (each view is logged); **Publish** an app to the Applications page |
| **Admin roles** | `/admin-roles` | See who holds each identity domain administrator role (Identity Domain Administrator, User Administrator, ...); assign to a user or group; remove |
| **Manage links** | `/directory` | Edit the Applications page's categories and links: search, show/hide switch, icon preview. Replaces the Django admin for this. |
| **Console admins** | `/admins` | Superusers only: everyone who has signed in, marked **AD sign-in** or **Local password**; suspend or delete accounts; create local emergency accounts. You can't delete, suspend or demote yourself. |
| **Audit log** | `/audit` | Who changed what, when and from which IP. Secrets are never stored. Read-only, even in the Django admin. |

Users synced from Active Directory are marked **Federated**. Change those in AD: edits made in the console may be overwritten by the next sync.

Staff can use everything except **Console admins**, which needs a superuser. Give someone access by adding them to the console groups in the identity domain.

## Connecting to OCI

The console talks to one identity domain. It needs the domain's URL and a way to sign in to it.

1. **Domain URL.** In the OCI Console, go to **Identity & Security → Domains → *your domain***. Copy the **Domain URL**, e.g. `https://idcs-0123456789abcdef.identity.oraclecloud.com`.
2. **A confidential application for the console** (recommended):
   1. In that domain, go to **Integrated applications → Add application → Confidential Application**. Name it `Dash Identity Console`.
   2. Under client configuration, choose **Configure this application as a client now** and tick **Client credentials**.
   3. Under **App roles**, add **Identity Domain Administrator**. It's needed to manage administrator roles and other users' credentials. If the console shouldn't manage admin roles, use **User Administrator** + **Application Administrator** instead; those pages then show OCI's "not allowed" message.
   4. Finish, **Activate** the app, and copy its **Client ID** and **Client secret**.
3. **Set the variables** on the service (see [Production settings](#production-settings)): `OCI_IDENTITY_DOMAIN_URL`, `OCI_CLIENT_ID`, `OCI_CLIENT_SECRET`. Restart the service.
4. Sign in to the console. The sidebar badge turns green and shows the domain's host.

**Alternative: an OCI API key.** Leave `OCI_CLIENT_ID` empty and set `OCI_CONFIG_FILE` (default `~/.oci/config`) and `OCI_CONFIG_PROFILE` (default `DEFAULT`). The key's user needs an administrator role in the domain. This is handy on a developer machine that already has the OCI CLI configured.

### Where the OCI credentials are kept

The domain URL, client ID and client secret are **environment variables on the NSSM service**, next to `DJANGO_SECRET_KEY` and the database password. They are never in git or the database. Django reads them once at startup (`backend/config/settings.py`), so restart the service after changing them.

| Where | How to see or change it |
| --- | --- |
| Production | `nssm edit DashLinkTree` → **Environment** tab, then `nssm restart DashLinkTree`. NSSM stores them in the service's registry key, which only administrators of the server can read. |
| A developer's machine | Export them in the shell before `python manage.py runserver`, or leave them unset to use demo data. With API-key sign-in, the key lives in `~/.oci/config` and the key file it names. |

The server needs outbound HTTPS to `*.identity.oraclecloud.com`. Treat the client secret like a database password: it can manage every account in the domain. Rotate it in OCI and update the service if it leaks.

## Signing in with AD

Once the console is connected to OCI, staff sign in to it with their **Dash MFB (Active Directory) account** through the identity domain: **Staff sign in → Sign in with your Dash MFB account** sends them to the domain's sign-in page and back. The console never sees their password, and the domain's MFA and sign-on policies apply. Signing out of the console also signs them out of the identity domain.

Whether the password is checked against AD itself is configured in OCI, not here. With **AD Bridge** (delegated authentication) or **federation** to AD FS/Entra ID, the domain hands the check to AD. With plain AD Bridge sync and no delegation, the domain checks its own copy of the account.

**Who gets in** depends on identity domain groups, read fresh at every sign-in:

| Group (default name) | Setting | Gives |
| --- | --- | --- |
| `Dash Console Admins` | `CONSOLE_STAFF_GROUPS` | Console access |
| `Dash Console Superusers` | `CONSOLE_SUPERUSER_GROUPS` | Console access + **Console admins** + the Django admin |

Create these groups in the domain (or sync them from AD) and add people. Both settings accept a comma-separated list of group names. Someone removed from the groups loses console access at their next sign-in; to cut access straight away, switch off **Can sign in** for them under **Console admins**. That always outranks OCI.

**Admins act in OCI as themselves.** After an AD sign-in, every change the console makes in the identity domain (users, groups, credentials, admin roles, integrated applications) is sent to OCI with the **admin's own** OCI token, not the console app's.

- **OCI decides what each person can do**, from their own administrator role. An Identity Domain Administrator can do everything; a Help Desk Administrator can reset passwords but gets *"Your OCI administrator role doesn't allow this"* when trying to change roles. Manage those roles on the **Admin roles** page (or in OCI).
- **OCI's own audit log shows the person**, as well as the console's audit log.
- **Sessions:** the admin's tokens are kept encrypted in their server-side session and renewed automatically. If OCI stops accepting them (the person was deactivated, or the token was revoked), the console signs them out and asks them to sign in again.
- **Who uses the console app's own power instead:** local emergency accounts and demo data. `CONSOLE_ACT_AS_USER=False` switches every admin back to the console app's power.

So the console groups (`Dash Console Admins` / `Dash Console Superusers`) decide who can **open** the console, and each person's **OCI administrator role** decides what they can **change** in OCI. To give someone full control of the domain and all its integrated applications, put them in `Dash Console Admins` **and** give them **Identity Domain Administrator**.

**Setting it up.** The console signs staff in through its own confidential application (the one from [Connecting to OCI](#connecting-to-oci)), or a separate one in `OCI_SSO_CLIENT_ID` / `OCI_SSO_CLIENT_SECRET`. In that application's OAuth configuration:

1. Tick the **Authorization code** and **Refresh token** grant types (keep **Client credentials**).
2. **Redirect URL**: `https://applications.dash-mfb.com/api/auth/sso/callback/`
3. **Post-logout redirect URL**: `https://applications.dash-mfb.com/`
4. Under **Token issuance policy**, allow access to the identity domain's own APIs (the console asks for the `urn:opc:idm:__myscopes__` scope, meaning "this admin's own administrator permissions").
5. Set `CONSOLE_PUBLIC_URL=https://applications.dash-mfb.com` on the service. Django sees IIS's requests as plain `http`, so it can't work the address out by itself.

For local development against a real domain, also add `http://localhost:5173/api/auth/sso/callback/` and `http://localhost:5173/` to the app, and leave `CONSOLE_PUBLIC_URL` empty.

**Local (password) accounts.** Once AD sign-in is configured, password sign-in to the console is **off**. Set `CONSOLE_LOCAL_LOGIN=True` to keep a break-glass account usable (under **Use a local emergency account** on the sign-in page) for when OCI is unreachable. The Django admin at `/admin/` still takes local passwords either way; give local accounts long random passwords and keep them in the vault. If a local account has the same username as an AD user, that AD user is refused until the local account is renamed or removed.

## Using the Applications page

- **Search** matches app name, description, tags, owner team, support contact, environment and category. Every word must match, so `core uat` finds the CoreBank test environment.
- Press **⌘K / Ctrl+K** or **/** to jump to search, and **Esc** to clear it.
- The **category chips** narrow the list to one category.
- The **sun/moon button** at the bottom of the sidebar switches light and dark mode. The choice is remembered in the browser.

## API

`GET /api/links/` is read-only and needs no login. It returns the categories that have at least one active app, in order, each with its active apps:

```json
[
  {
    "id": 1,
    "name": "Core Banking",
    "icon": "landmark",
    "links": [
      {
        "id": 1,
        "name": "CoreBank",
        "url": "https://corebank.example.com",
        "description": "Customer accounts, deposits, withdrawals and end-of-day processing.",
        "icon": "database",
        "environment": "PROD",
        "environment_label": "Production",
        "owner_team": "Core Banking Ops",
        "support_contact": "corebank-support@example.com",
        "tags": ["cbs", "core", "accounts", "teller"]
      }
    ]
  }
]
```

## Tests and checks

```bash
cd backend && python manage.py test           # login, lockout, URL, console API and OCI client tests
cd frontend && npm run lint && npm run build  # ESLint, then a production build
```

## Branding

- Colours live in `frontend/src/index.css` as `--color-brand-50` to `--color-brand-900`. `brand-600` is the official Dash MFB purple, `#4f1a60`.
- The logo is `frontend/public/logo.png`. The favicons and the iOS home-screen icon were generated from it.

---

## Production

```
Browser ──► IIS site "dash-linktree"  (https://applications.dash-mfb.com)
              ├── http://…               → 301 redirect to https://
              ├── /                      → React build: C:\sites\dash-linktree\frontend\dist
              └── /api, /admin, /static  → reverse proxy → 127.0.0.1:8095
                                                           Django on Waitress
                                                           (Windows service "DashLinkTree", run by NSSM)
                                                              └── PostgreSQL 18, database "dash_linktree"
```

| Item | Value |
| --- | --- |
| Code | `C:\sites\dash-linktree` (a git clone of this repo) |
| IIS site | `dash-linktree`, physical path `C:\sites\dash-linktree\frontend\dist` |
| Bindings | http :80 and https :443 (SNI), host `applications.dash-mfb.com` |
| Certificate | `*.dash-mfb.com`, expires **5 March 2027**. Update this site's binding when it's renewed. |
| DNS | An A record `applications.dash-mfb.com` → `132.145.47.17`. There is no wildcard: each hostname needs its own record. |
| Django service | `DashLinkTree`, Waitress on `127.0.0.1:8095` (not reachable from the network), starts on boot |
| Database | PostgreSQL 18 on the same server, port 5432, database and login role both `dash_linktree` |
| Logs | `C:\sites\dash-linktree\logs\service.log` and `service-error.log`, roll over at 10 MB |

The IIS proxy rule in `frontend/public/web.config` points at port **8095**. If the service ever moves to another port, change both the NSSM `AppParameters` and `web.config`.

### Production settings

Django reads these from environment variables stored on the NSSM service. They are never committed. View or change them with `nssm edit DashLinkTree` (**Environment** tab), then run `nssm restart DashLinkTree`.

| Variable | Value / purpose |
| --- | --- |
| `DJANGO_SECRET_KEY` | Long random string. Generate with `python -c "import secrets; print(secrets.token_urlsafe(50))"` |
| `DJANGO_DEBUG` | `False` |
| `DJANGO_ALLOWED_HOSTS` | `applications.dash-mfb.com,127.0.0.1,localhost` |
| `DJANGO_CSRF_TRUSTED_ORIGINS` | `https://applications.dash-mfb.com,http://applications.dash-mfb.com` |
| `DJANGO_DB_NAME` / `DJANGO_DB_USER` | `dash_linktree` |
| `DJANGO_DB_PASSWORD` | The `dash_linktree` role's password from pgAdmin |
| `DJANGO_DB_PORT` | `5432` (`DJANGO_DB_HOST` defaults to `127.0.0.1`) |

| `OCI_IDENTITY_DOMAIN_URL` | The identity domain's URL. Without it the console shows demo data. |
| `OCI_CLIENT_ID` / `OCI_CLIENT_SECRET` | The console's confidential application (see [Connecting to OCI](#connecting-to-oci)) |
| `OCI_CONFIG_FILE` / `OCI_CONFIG_PROFILE` | Only when signing in with an OCI API key instead of a client secret |
| `CONSOLE_PUBLIC_URL` | `https://applications.dash-mfb.com`, for the AD sign-in callback |
| `CONSOLE_STAFF_GROUPS` / `CONSOLE_SUPERUSER_GROUPS` | Identity domain groups that give console access / superuser (defaults `Dash Console Admins` / `Dash Console Superusers`) |
| `CONSOLE_LOCAL_LOGIN` | `True` to allow break-glass password sign-in alongside AD. Empty: only while AD sign-in isn't configured. |
| `CONSOLE_SSO` | `False` turns AD sign-in off even when OCI is configured |
| `CONSOLE_ACT_AS_USER` | `False` makes admins act with the console app's OCI roles instead of their own (default `True`) |
| `OCI_SSO_CLIENT_ID` / `OCI_SSO_CLIENT_SECRET` | Optional: a separate OCI application for staff sign-in |
| `OCI_SSO_ISSUER` | Leave unset. Only for a domain whose ID tokens use an unusual issuer: the `issuer` in `<domain URL>/.well-known/openid-configuration` |

When `DJANGO_DB_NAME` is set, Django uses PostgreSQL. Without it, Django falls back to SQLite, which is what happens on a developer's machine.

### Deploying an update

Push to GitHub from your machine, then on the server in **PowerShell as Administrator**:

```powershell
cd C:\sites\dash-linktree
git pull

# Backend
cd backend
.\venv\Scripts\python -m pip install -r requirements.txt     # only if requirements.txt changed
# set the database variables for this window (see "Running manage.py on the server")
.\venv\Scripts\python manage.py migrate                      # only if there are new migrations
.\venv\Scripts\python manage.py collectstatic --noinput      # only if Django was upgraded
nssm restart DashLinkTree

# Frontend
cd ..\frontend
npm ci                                                       # only if package-lock.json changed
npm run build
```

The frontend goes live as soon as `npm run build` finishes. IIS serves `dist` directly, so there's nothing to restart. Backend changes need the `nssm restart`.

### Running manage.py on the server

`manage.py` commands don't see the service's variables. Set the database variables in the PowerShell window first, or the command will quietly use an empty SQLite file instead:

```powershell
cd C:\sites\dash-linktree\backend
$env:DJANGO_DB_NAME = "dash_linktree"
$env:DJANGO_DB_USER = "dash_linktree"
$env:DJANGO_DB_PASSWORD = 'the-password'      # single quotes

.\venv\Scripts\python manage.py migrate
.\venv\Scripts\python manage.py createsuperuser
.\venv\Scripts\python manage.py changepassword <username>
.\venv\Scripts\python manage.py axes_list_attempts          # recent failed logins
.\venv\Scripts\python manage.py axes_reset_ip <ip-address>  # unlock one address now
.\venv\Scripts\python manage.py axes_reset                  # unlock everyone
```

### Service commands

```powershell
nssm status DashLinkTree
nssm restart DashLinkTree
nssm edit DashLinkTree                     # settings window, including environment variables
Get-Content C:\sites\dash-linktree\logs\service-error.log -Tail 50
curl.exe http://127.0.0.1:8095/api/links/  # test Django directly, bypassing IIS
```

### Security measures in place

- **HTTPS only:** IIS redirects all `http://` requests and sends HSTS (`web.config`), and Django marks its login cookies HTTPS-only when `DEBUG` is off. Don't set `SECURE_SSL_REDIRECT` in Django: it sees IIS's proxied requests as HTTP and would redirect forever.
- **Not indexed:** a `noindex` meta tag, an `X-Robots-Tag: noindex` header on every response, and `robots.txt` all ask search engines to stay away.
- **Django isn't exposed directly:** it listens on `127.0.0.1` only, rejects unknown hostnames, and the API is read-only.
- **No framing:** `Content-Security-Policy: frame-ancestors 'none'` stops other sites embedding the page.
- **Secrets stay out of git:** the secret key and database password live only in the NSSM service settings.
- **Least-privilege database role:** `dash_linktree` can log in and owns only its own database.
- **Login lockout:** after 5 wrong passwords, the visitor's IP address is blocked from logging in for 30 minutes (HTTP 429, "Account locked: too many login attempts"). A successful login resets the count. Lockouts go by IP, not username, so an attacker can't lock a real admin out of their account. Failed attempts are listed in the admin under **Axes → Access attempts**, and can be cleared early with the `axes_reset_ip` command above. The real IP comes from the last `X-Forwarded-For` entry that IIS adds (`links/client_ip.py`).

### Troubleshooting

| Symptom | Likely cause |
| --- | --- |
| IIS error 502.3 | Service not running (`nssm status DashLinkTree`), or the port in `web.config` doesn't match the service |
| `Bad Request (400)` | Hostname missing from `DJANGO_ALLOWED_HOSTS` |
| CSRF failure on admin login | The exact address, including `https://`, is missing from `DJANGO_CSRF_TRUSTED_ORIGINS` |
| Admin has no styling | `collectstatic` not run after a Django upgrade |
| Page loads but `/api/links/` is 404 | `web.config` missing from `dist` (rebuild), or URL Rewrite not installed |
| `password authentication failed` from `manage.py` | Wrong `$env:DJANGO_DB_PASSWORD` in that window |
| `manage.py` changes don't show on the site | The `DJANGO_DB_*` variables weren't set, so the command ran against SQLite |
| Service starts then stops | Read `logs\service-error.log`. Usually a wrong database password or a missing package. |
| "Account locked: too many login attempts" | 5 wrong passwords from that IP. Wait 30 minutes or run `axes_reset_ip <ip>` |
| Console shows "Can't reach the OCI identity domain" | Wrong `OCI_IDENTITY_DOMAIN_URL`, no outbound HTTPS from the server, or the console's OCI app is deactivated |
| "The identity domain rejected the console's client ID and secret" | `OCI_CLIENT_ID` / `OCI_CLIENT_SECRET` wrong, or the secret was regenerated in OCI |
| "Your OCI administrator role doesn't allow this" | Working as intended: that admin's own OCI role doesn't cover the action. Give them the role on **Admin roles**. If an Identity Domain Administrator gets this too, OCI may be limiting tokens to the console app's roles: keep **Identity Domain Administrator** on the console's app. |
| Admins are sent back to sign in every hour | The console's app doesn't have the **Refresh token** grant, so OCI issues no refresh token |
| AD sign-in says "isn't allowed to use the console" | The person isn't in `Dash Console Admins` / `Dash Console Superusers` (or the names in `CONSOLE_*_GROUPS`), or was suspended under **Console admins** |
| OCI shows "invalid redirect URI" at sign-in | The app's Redirect URL doesn't exactly match `CONSOLE_PUBLIC_URL` + `/api/auth/sso/callback/` |
| AD sign-in returns "couldn't be verified" | The service log has a line starting `Refused an ID token` saying which check failed. Most often `OCI_SSO_ISSUER` is set when it shouldn't be: remove it (it isn't one of the app's credentials; the domain's issuer, `https://identity.oraclecloud.com/`, is accepted by default). Otherwise check the server clock. |
| "The console's OCI credentials aren't allowed to do this" | The console's OCI app lacks the needed app role (step 2.3 of [Connecting to OCI](#connecting-to-oci)) |
| `/users` (or another console page) gives IIS 404 on refresh | `web.config` in `dist` is old: rebuild the frontend |
| Console sign-in fails with a CSRF error | The site's `https://` address is missing from `DJANGO_CSRF_TRUSTED_ORIGINS` |
| Everyone gets locked out together | The IIS proxy isn't sending `X-Forwarded-For`, so every visitor looks like `127.0.0.1`. In IIS Manager → server → Application Request Routing Cache → Server Proxy Settings, check that **Preserve client IP in the following header** is ticked with `X-Forwarded-For`. |

### Still to do


- **Restrict access to the internal network** once Active Directory / VPN is in place. The site and admin login are currently reachable from the internet.
- **Disable TLS 1.0 and 1.1** on the server. This is a server-wide change that affects every site, so coordinate it.
- **Back up the `dash_linktree` database** along with the server's other PostgreSQL databases.
- **Run the service under a dedicated low-privilege account** instead of LocalSystem.
