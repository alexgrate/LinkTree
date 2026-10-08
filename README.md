# Dash MFB — Internal App Directory

One page that lists every internal Dash MFB application, grouped by category and searchable. Staff find the app they need and the team that supports it. Admins manage the list in the Django admin, with no code changes.

## Stack

| Part | Tech |
| --- | --- |
| Backend | Django 6, Django REST Framework, django-cors-headers, SQLite (dev) |
| Frontend | React 19 (Vite), Tailwind CSS v4, Motion (Framer Motion), lucide-react |

## Project layout

```
Bank_LinkTree/
├── backend/
│   ├── config/                 # Django settings and root URLs
│   └── links/
│       ├── models.py           # Category, AppLink
│       ├── admin.py            # Admin screens for managing links
│       ├── serializers.py      # JSON shape sent to the frontend
│       ├── views.py            # GET /api/links/
│       └── management/commands/seed_links.py   # Sample data
├── deploy/                     # package.sh (Mac) + install/update/manage .ps1 (server)
└── frontend/
    ├── public/                 # logo, favicons, web.config (IIS proxy rules)
    └── src/
        ├── api/links.js        # Calls the Django API
        ├── components/         # Header, SearchBar, CategoryFilter, CategorySection, AppCard, ...
        ├── hooks/useTheme.js   # Light/dark mode
        ├── lib/search.js       # Search and filter logic
        ├── lib/icons.js        # Icon names allowed in the admin
        └── index.css           # Tailwind + brand colours
```

## Running it locally

You need Python 3.12+ and Node 20.19+ (or 22.12+). Run the backend and the frontend in two separate terminals.

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

Open **http://localhost:5173**. Use `localhost`, not `127.0.0.1`. The backend only accepts browser requests from `http://localhost:5173` (`CORS_ALLOWED_ORIGINS` in `backend/config/settings.py`).

The frontend reads the API address from `frontend/.env`:

```
VITE_API_URL=http://127.0.0.1:8000/api
```

## Managing links

Go to **http://127.0.0.1:8000/admin**. Any page in the app's footer also links there ("Manage links").

- **Categories** group apps on the page. `order` controls the order they appear in. A category with no active apps is hidden.
- **App links** need a name, URL and category. The other fields are optional, but they make the page more useful:
  - **environment**: Production, UAT or Disaster Recovery. Shown as a coloured badge.
  - **owner_team / support_contact**: shown on the card, so staff know who to contact.
  - **tags**: comma-separated nicknames, such as `cbs, core, teller`. Search matches these, so people can find an app without knowing its official name.
  - **is_active**: untick to hide an app without deleting it.
  - **icon**: one of the names in `frontend/src/lib/icons.js`, such as `landmark`, `credit-card`, `users`, `shield`, `headset` or `piggy-bank`. An unknown name shows a generic icon. To add more, import the icon from [Lucide](https://lucide.dev/icons) in that file and add it to the list.

### Sample data

`python manage.py seed_links` loads 5 categories and 11 placeholder apps. All of their URLs point at `example.com`. Running it again updates those entries instead of duplicating them. It never touches records with other names.

Delete the sample apps in the admin before entering real data, or edit them in place.

## API

`GET /api/links/` returns the categories that have at least one active app, in order. Each category includes its active apps:

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

## Using the page

- **Search** matches app name, description, tags, owner team, environment and category. Every word must match, so `core uat` finds the CoreBank test environment.
- Press **⌘K / Ctrl+K** or **/** to jump to search, and **Esc** to clear it.
- The **category chips** narrow the list to one category.
- The **sun/moon button** switches light and dark mode. The choice is remembered in the browser.

## Branding

- Colours live in `frontend/src/index.css` as `--color-brand-50` to `--color-brand-900`. `brand-600` is the official Dash MFB purple, `#4f1a60`.
- The logo is `frontend/public/logo.png`. The favicon and the iOS home-screen icon were generated from it.

## Useful commands

| Where | Command | What it does |
| --- | --- | --- |
| backend | `python manage.py runserver` | Start the API on port 8000 |
| backend | `python manage.py seed_links` | Load or refresh the sample data |
| backend | `python manage.py makemigrations && python manage.py migrate` | Apply model changes |
| frontend | `npm run dev` | Start the dev server on port 5173 |
| frontend | `npm run lint` | Check code with ESLint |
| frontend | `npm run build` | Build the production files into `frontend/dist/` |

## Deploying to the Windows server (IIS + NSSM)

```
Browser ──► IIS site "dash-linktree" (links.dash-mfb.com)
              ├── /                      → React build (static files)
              └── /api, /admin, /static  → reverse proxy → 127.0.0.1:8001
                                                           Django on Waitress
                                                           (NSSM service "DashLinkTree")
```

- Django listens only on `127.0.0.1`, so the network can reach it only through IIS.
- The page and the API share one address, so CORS isn't involved in production.
- Production settings (`DJANGO_SECRET_KEY`, `DJANGO_DEBUG`, `DJANGO_ALLOWED_HOSTS`, `DJANGO_CSRF_TRUSTED_ORIGINS`) are stored as environment variables on the NSSM service, not in code.
- The proxy rule lives in `frontend/public/web.config`, which Vite copies into every build.

### Server prerequisites (one time)

- Python 3.12+ installed for all users and on PATH
- `nssm.exe` on PATH (from https://nssm.cc)
- IIS with the **URL Rewrite** and **Application Request Routing** modules
- A DNS record for the chosen hostname pointing at the server

### 1. Package on your Mac

```bash
./deploy/package.sh
```

This builds the frontend and creates `release/dash-linktree.zip` containing `backend/` (without venv or database), `frontend/` (the built site) and `deploy/` (the server scripts).

### 2. First install on the server

Copy the zip to the server, extract it so you have `C:\sites\dash-linktree\backend`, `...\frontend` and `...\deploy`. Then, in **PowerShell as Administrator**:

```powershell
cd C:\sites\dash-linktree
powershell -ExecutionPolicy Bypass -File .\deploy\install.ps1 -HostName links.dash-mfb.com

.\deploy\manage.ps1 createsuperuser
.\deploy\manage.ps1 seed_links          # optional sample data
```

`install.ps1` does the following:
- creates the venv
- generates a secret key
- runs migrations and `collectstatic`
- registers and starts the NSSM service, with logs in `C:\sites\dash-linktree\logs` that roll over at 10 MB
- enables the ARR proxy
- creates the IIS site on port 80

Afterwards, add an **https** binding with the company certificate in IIS Manager.

`manage.ps1` runs any `manage.py` command with the live service's settings, for example `changepassword admin`.

### 3. Deploying updates

Run `./deploy/package.sh` again, copy the new zip to the server, and extract it somewhere other than the install folder (e.g. Downloads). Then:

```powershell
powershell -ExecutionPolicy Bypass -File C:\sites\dash-linktree\deploy\update.ps1 -Release C:\Users\<you>\Downloads\dash-linktree
```

`update.ps1` does the following:
- stops the service
- backs up `db.sqlite3` into `logs\`
- replaces the code, keeping the venv, database and static files
- installs packages, migrates and collects static files
- starts the service again and checks that it answers

### Service commands

```powershell
nssm status DashLinkTree
nssm restart DashLinkTree
nssm edit DashLinkTree          # GUI for all service settings, including environment variables
Get-Content C:\sites\dash-linktree\logs\service-error.log -Tail 50
```

### Troubleshooting

| Symptom | Likely cause |
| --- | --- |
| IIS error 502.3 | Service not running, or ARR proxy not enabled |
| `Bad Request (400)` | Hostname missing from `DJANGO_ALLOWED_HOSTS` (edit with `nssm edit DashLinkTree`, then restart) |
| CSRF failure on admin login | Exact address, including `http://` or `https://`, missing from `DJANGO_CSRF_TRUSTED_ORIGINS` |
| Admin has no styling | `collectstatic` not run, or WhiteNoise missing from `MIDDLEWARE` |
| Page loads but `/api/links/` is 404 | `web.config` missing from the site folder, or URL Rewrite not installed |

### Still to decide

- **HTTPS-only:** once the https binding works, set `SESSION_COOKIE_SECURE`, `CSRF_COOKIE_SECURE` and HSTS in `settings.py`.
- **Database:** SQLite is fine for this small, mostly-read app. Back up `backend\db.sqlite3`. Switch to SQL Server or PostgreSQL if bank policy requires it.
- **Service account:** the service runs as LocalSystem by default. A dedicated low-privilege account with write access only to `C:\sites\dash-linktree` is better practice.
