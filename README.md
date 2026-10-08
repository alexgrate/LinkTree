# Dash MFB — Internal App Directory

One page that lists every internal Dash MFB application, grouped by category and searchable. Staff find the app they need and the team that supports it. Admins manage the list in the Django admin, with no code changes.

Live at **https://application.dash-mfb.com**. The admin is at **https://application.dash-mfb.com/admin/**.

## Stack

| Part | Tech |
| --- | --- |
| Backend | Django 6, Django REST Framework, django-axes, Waitress, WhiteNoise, psycopg |
| Database | PostgreSQL 18 in production, SQLite for local development |
| Frontend | React 19 (Vite), Tailwind CSS v4, Motion (Framer Motion), lucide-react |
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
└── frontend/
    ├── .env                    # Local API address
    ├── .env.production         # Production API address (/api, same site)
    ├── public/
    │   ├── web.config          # IIS: HTTPS redirect, proxy to Django, security headers
    │   ├── robots.txt          # Asks search engines not to crawl
    │   └── logo.png, favicon.ico, favicon.png, apple-touch-icon.png
    └── src/
        ├── api/links.js        # Calls the Django API
        ├── components/         # Header, SearchBar, CategoryFilter, CategorySection, AppCard, ...
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

Open **http://localhost:5173**. Use `localhost`, not `127.0.0.1`: the backend only accepts browser requests from `http://localhost:5173` (`CORS_ALLOWED_ORIGINS` in `backend/config/settings.py`).

## Managing links

Go to `/admin/`, or use **Manage links** in the page footer. Usernames aren't case-sensitive, so `alex`, `Alex` and `ALEX` all log in to the same account. Don't create two accounts that differ only by case: neither will be able to log in.

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

## Using the page

- **Search** matches app name, description, tags, owner team, support contact, environment and category. Every word must match, so `core uat` finds the CoreBank test environment.
- Press **⌘K / Ctrl+K** or **/** to jump to search, and **Esc** to clear it.
- The **category chips** narrow the list to one category.
- The **sun/moon button** switches light and dark mode. The choice is remembered in the browser.

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
cd backend && python manage.py test links     # login and URL-validation tests
cd frontend && npm run lint                   # ESLint
```

## Branding

- Colours live in `frontend/src/index.css` as `--color-brand-50` to `--color-brand-900`. `brand-600` is the official Dash MFB purple, `#4f1a60`.
- The logo is `frontend/public/logo.png`. The favicons and the iOS home-screen icon were generated from it.

---

## Production

```
Browser ──► IIS site "dash-linktree"  (https://application.dash-mfb.com)
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
| Bindings | http :80 and https :443 (SNI), host `application.dash-mfb.com` |
| Certificate | `*.dash-mfb.com`, expires **5 March 2027**. Update this site's binding when it's renewed. |
| DNS | Covered by the existing `*.dash-mfb.com` record |
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
| `DJANGO_ALLOWED_HOSTS` | `application.dash-mfb.com,127.0.0.1,localhost` |
| `DJANGO_CSRF_TRUSTED_ORIGINS` | `https://application.dash-mfb.com,http://application.dash-mfb.com` |
| `DJANGO_DB_NAME` / `DJANGO_DB_USER` | `dash_linktree` |
| `DJANGO_DB_PASSWORD` | The `dash_linktree` role's password from pgAdmin |
| `DJANGO_DB_PORT` | `5432` (`DJANGO_DB_HOST` defaults to `127.0.0.1`) |

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
| Everyone gets locked out together | The IIS proxy isn't sending `X-Forwarded-For`, so every visitor looks like `127.0.0.1`. In IIS Manager → server → Application Request Routing Cache → Server Proxy Settings, check that **Preserve client IP in the following header** is ticked with `X-Forwarded-For`. |

### Still to do

- **Restrict access to the internal network** once Active Directory / VPN is in place. The site and admin login are currently reachable from the internet.
- **Disable TLS 1.0 and 1.1** on the server. This is a server-wide change that affects every site, so coordinate it.
- **Back up the `dash_linktree` database** along with the server's other PostgreSQL databases.
- **Run the service under a dedicated low-privilege account** instead of LocalSystem.
