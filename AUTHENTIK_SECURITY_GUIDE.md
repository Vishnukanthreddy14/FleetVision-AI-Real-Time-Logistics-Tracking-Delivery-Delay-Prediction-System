# FleetVision AI — Authentik Setup & Enterprise Security Guide

This document explains how to deploy **Authentik** locally, configure OAuth2/OpenID Connect (OIDC) with Role-Based Access Control (RBAC), securely manage API credentials, and protect the FleetVision AI application against unauthorized access.

---

## 1. Quick Local Deployment (Docker Compose)

Authentik is an open-source Identity Provider (IdP). To start the local Authentik stack:

1. Ensure **Docker Desktop** is running on your Mac.
2. Open terminal in the project directory:
   ```bash
   cd "/Users/vishnukanthreddy/Documents/antigravity/login page"
   docker compose -f docker-compose.authentik.yml up -d
   ```
3. Wait ~30 seconds for PostgreSQL, Redis, and Authentik to initialize.
4. Visit the initial setup wizard:
   ```text
   http://localhost:9000/if/flow/initial-setup/
   ```
5. Set your administrator password for `akadmin`.

---

## 2. Configuring Roles & Groups in Authentik

FleetVision AI enforces strict Role-Based Access Control (RBAC).

> [!TIP]
> **Can't find "Directory"?**
> When you first log in, Authentik often places you in the **User Interface** (`/if/user/#/library`) where only app tiles are shown.
> 1. Click the **"Admin interface"** link in the top-right corner (or the gear icon).
> 2. Or navigate directly to: **`http://localhost:9000/if/admin/`**
> 3. You can also jump straight to Groups using the direct deep link below!

### Direct Deep Links:
- **Groups Page**: [`http://localhost:9000/if/admin/#/core/groups`](http://localhost:9000/if/admin/#/core/groups)
- **Users Page**: [`http://localhost:9000/if/admin/#/core/users`](http://localhost:9000/if/admin/#/core/users)
- **Providers Page**: [`http://localhost:9000/if/admin/#/core/providers`](http://localhost:9000/if/admin/#/core/providers)
- **Applications Page**: [`http://localhost:9000/if/admin/#/core/applications`](http://localhost:9000/if/admin/#/core/applications)

### Steps to Configure Groups:
1. In the **Admin Interface**, look at the left sidebar menu.
2. Click **Directory** to expand it, then click **Groups** (or use the direct deep link above).
3. Click **Create** to add three groups:
   - `Fleet Admins`: Grants full telematics, geofence override, vehicle diagnostics, and security audit logs.
   - `Fleet Dispatchers`: Grants route creation, active delivery dispatch, cargo manifests, and driver communications.
   - `Fleet Drivers`: Grants assigned vehicle console (Unit #402), pre-trip inspection logs, and turn-by-turn route view.
4. In the left sidebar under **Directory**, click **Users**:
   - Create users (e.g. `james.vance@fleetvision.ai`, `sarah.chen@fleetvision.ai`, `marcus.brody@fleetvision.ai`).
   - Click each user → **Groups** tab → Add them to their respective group.

---

## 3. Creating the OAuth2/OIDC Provider & Application

### Step 3.1: Create Provider
1. In the Authentik Admin Interface, go to **Applications** → **Providers**.
2. Click **Create** and select **OAuth2/OpenID Provider**.
3. Fill in the fields:
   - **Name**: `FleetVision AI Provider`
   - **Authentication flow**: `default-authentication-flow`
   - **Authorization flow**: `default-provider-authorization-implicit-consent` (or explicit consent)
   - **Client type**: `Confidential` *(Crucial: Ensures authorization code exchange requires client secret)*
   - **Client ID**: Generated automatically (copy this). # CoXsj1Pa67D1Ri874ww3BkiMcHNIbsGSZQCJHB5k
   - **Client Secret**: Generated automatically (copy this). #RjlhOfFxZbdP6FwP9rVblaz5JIaYHIShaKHtdHoSyk3LgxuR9xi3RFt2WXNGjGIgmMqDXpYsH3VZZXzBMNdAarz2GLxFiuO6je9lfkq50zoJFJfvBXCHxlr0zTMj8mZD
   - **Redirect URIs**:
     ```text
     http://localhost:8000/api/auth/callback
     http://localhost:3000/api/auth/callback
     ```
   - **Signing Key**: Select `authentik Self-signed Certificate` (or generate custom RSA key). #authentik Self-signed Certificate
   - **Scopes**: Ensure `openid`, `email`, `profile`, and `groups` are selected.
4. Click **Finish**.

### Step 3.2: Create Application
1. In the Authentik Admin Interface, go to **Applications** → **Applications**.
2. Click **Create**:
   - **Name**: `FleetVision AI`
   - **Slug**: `fleetvision-ai`
   - **Provider**: Select `FleetVision AI Provider` (created above).
3. Click **Create**.

---

## 4. How to Access & Manage Authentik Credentials Securely

To keep the web-based transport application secure, follow these credential management standards:

### 4.1 Where to Retrieve Credentials
- Navigate to **Applications** → **Providers** → Click **FleetVision AI Provider**.
- Under the **Details** tab, locate:
  - **Client ID** (Public identifier for your application) #CoXsj1Pa67D1Ri874ww3BkiMcHNIbsGSZQCJHB5k
  - **Client Secret** (Confidential private key used by the backend to verify tokens)

### 4.2 How to Store Credentials Safely
Never hardcode credentials in source code or client-side JavaScript (`index.html` or `app.js`).

1. Open your `.env` file in the project root:
   ```env
   AUTHENTIK_HOST=http://localhost:9000
   AUTHENTIK_APP_SLUG=fleetvision-ai
   AUTHENTIK_CLIENT_ID=your-copied-client-id
   AUTHENTIK_CLIENT_SECRET=your-copied-client-secret
   AUTHENTIK_REDIRECT_URI=http://localhost:3000/api/auth/callback
   SESSION_SECRET=a-secure-random-64-character-string
   ```
2. Verify `.env` is listed in `.gitignore` so secrets are never pushed to version control:
   ```gitignore
   .env
   node_modules/
   ```

### 4.3 Production Security Best Practices

1. **PKCE (Proof Key for Code Exchange) Enforced**:
   - FleetVision AI's backend (`server.js`) automatically implements PKCE with `SHA-256` code challenge generation. Even if authorization codes are intercepted in transit, attackers cannot exchange them without the high-entropy `code_verifier`.
2. **HttpOnly, SameSite=Strict Session Cookies**:
   - Session tokens are stored in browser cookies with:
     - `HttpOnly`: Client-side scripts cannot access or steal the session token (immune to XSS).
     - `SameSite=Strict`: Cookies are never transmitted in third-party contexts (immune to CSRF).
     - `HMAC-SHA256 Signature`: Tampering with cookie contents immediately invalidates the session.
3. **Rotating Client Secrets**:
   - In Authentik Admin: **Applications** → **Providers** → Select provider → Click **Regenerate Secret**.
   - Update `AUTHENTIK_CLIENT_SECRET` in `.env` and restart `node server.js`.
4. **HTTPS / TLS in Production**:
   - Set up reverse proxy (Nginx / Caddy / Cloudflare) with automated Let's Encrypt SSL certificates.
   - Update `AUTHENTIK_REDIRECT_URI` to use `https://`.
   - Add the `Secure` flag to session cookies in `server.js`.

---

## 5. Testing the System

You can run the backend server right now with:
```bash
node server.js
```
Then visit `http://localhost:3000`.

- Click **"Sign in with Authentik SSO"** to authenticate via your live Authentik stack.
- Or use the **Quick Persona Switcher** on the login card to test the role-based dashboard immediately!
