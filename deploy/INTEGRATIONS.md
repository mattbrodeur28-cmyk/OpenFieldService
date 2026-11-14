# Self-hosted integrations

The catalog is intentionally limited to Google services, Microsoft services,
HubSpot CRM, LinkedIn, and the existing AI providers. OAuth and API requests run
on your own Node server. Clawnify is not involved.

## Available operations

| Connection | Implemented operations |
| --- | --- |
| Google Workspace | Profile, recent Drive file metadata, upcoming primary-calendar events, inbox message headers |
| Microsoft 365 | Profile, OneDrive root file metadata, calendar events in the next 30 days, inbox headers, contacts |
| HubSpot CRM | Contacts, companies, deals |
| LinkedIn | Connected member profile |

Google Docs/Sheets cards use Drive metadata. Excel uses OneDrive metadata; document
contents, spreadsheet cells, editing, sending mail, calendar writes, CRM writes,
social publishing and automatic synchronization are not implemented. LinkedIn is
profile-only, not a social-feed or posting integration. Google and Microsoft cards
share their corresponding connection; signing in once covers that provider's cards.
Each response is limited to 20 records (10 Gmail message headers); this is a preview,
not a comprehensive search or import. Chat can use up to three explicitly selected
read operations. The selected account data goes to the selected AI provider, along
with the normal message and knowledge context. Prior replies may retain details
previously shared even when future requests stop fetching integration data.

## 1. HTTPS and origin

For this installation, the intended URL is **https://field.mattshomelab.net**.
Configure your reverse proxy with a valid certificate and route it to the LXC's
HTTP listener at `http://10.0.4.67:3000`. NetBird connectivity alone does not add TLS.
Keep the access restrictions you require on the proxy; callbacks are browser
redirects, so the browser authorizing the provider must be able to reach the app.
Do not point an HTTPS upstream at the plain HTTP port.

Verify the hostname and certificate first. Then set this line in
`/etc/openfieldservice.env` (preserve all other settings and the existing encryption
key), and restart the service:

```ini
PUBLIC_URL=https://field.mattshomelab.net
```

```sh
systemctl restart openfieldservice
curl --fail https://field.mattshomelab.net/healthz
```

Use the HTTPS hostname for sign-in after setting PUBLIC_URL, because login cookies
are Secure on an HTTPS-configured deployment. A strict-cookie session is not
required at the provider callback: a random, hashed, user-bound, one-use state
expiring after ten minutes authorizes that code exchange. All setup, connect,
disconnect, preview and status endpoints require a local authenticated session.
Only the four exact provider callback GET routes bypass the session guard.

## 2. Register provider applications

You own these applications and their credentials. Save secrets privately in the
Integrations popup as Owner/Admin; do not put them in Git or paste them into chat.
The popup shows the exact callback URL and requested scopes. Provider app/client
configuration is shared by your one company; account authorizations are per user.
Changing an app's client settings disconnects all its existing local connections.
A blank secret preserves the saved secret. Members connect their own accounts;
Viewers can see status but cannot connect, disconnect or request previews.

### Google

Create an OAuth client of type Web application in Google Cloud. Configure the consent
screen, enable Drive, Calendar and Gmail APIs, and register:

`https://field.mattshomelab.net/api/integrations/google/callback`

Use the read-only scopes shown in the popup. Gmail metadata is a restricted Google
scope, and Drive metadata also has provider policy requirements. Depending on app
audience and publishing status, testing-user enrollment, verification, consent
restrictions or assessments may apply. Testing-mode refresh tokens can expire;
reconnect when required. Do not assume every Google Workspace administrator allows
these scopes. See [Google web-server OAuth](https://developers.google.com/identity/protocols/oauth2/web-server)
and [scope reference](https://developers.google.com/identity/protocols/oauth2/scopes).

### Microsoft

Register an application in Microsoft Entra ID. Use a Web redirect:

`https://field.mattshomelab.net/api/integrations/microsoft/callback`

This connector uses the `common` authorization endpoint; choose an application
account audience that matches the accounts you intend to connect. Add delegated
Graph permissions `User.Read`, `Mail.ReadBasic`, `Calendars.Read`, `Files.Read`,
`Contacts.Read`, and `offline_access`. Create a client secret and save its **value**,
not its secret ID. Your organization's user-consent policies may require an admin.
See [Microsoft delegated OAuth](https://learn.microsoft.com/en-us/graph/auth-v2-user).

### HubSpot

Create an OAuth application with `oauth`, `crm.objects.contacts.read`,
`crm.objects.companies.read`, and `crm.objects.deals.read`. Register:

`https://field.mattshomelab.net/api/integrations/hubspot/callback`

The backend uses the current date-versioned token endpoint, including refresh.
See [HubSpot OAuth migration and token format](https://developers.hubspot.com/docs/api-reference/legacy/authentication/oauth-tokens/v1/migration-guide).

### LinkedIn

Create an app and enable **Sign In with LinkedIn using OpenID Connect**. Register:

`https://field.mattshomelab.net/api/integrations/linkedin/callback`

Grant `openid profile email`. The connector reads the member profile; it does not
use LinkedIn as local workspace login, verify identity, or request posting scope.
See [LinkedIn OpenID Connect](https://learn.microsoft.com/en-us/linkedin/consumer/integrations/self-serve/sign-in-with-linkedin-v2).

## 3. Connect and verify

Sign in to your workspace, open a service card, save the provider Client ID and
Client secret, and click Connect account. Authorize at the provider, then return
to Integrations. Open the card and choose Read profile/files/calendar/mail or the
available CRM operation. A successful live preview proves that specific operation
works with your account. Configured credentials alone do not prove connectivity.

Client IDs/secrets can alternatively come from server environment variables:
`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `MICROSOFT_CLIENT_ID`,
`MICROSOFT_CLIENT_SECRET`, `HUBSPOT_CLIENT_ID`, `HUBSPOT_CLIENT_SECRET`,
`LINKEDIN_CLIENT_ID`, `LINKEDIN_CLIENT_SECRET`. Saved app settings take precedence.
Restart after changing the service environment. Client secrets saved in the UI and
all account tokens are AES-256-GCM encrypted in `workspace.sqlite`, using the
existing `WORKSPACE_ENCRYPTION_KEY` or `WORKSPACE_TOKEN` fallback. Keep and privately
back up that key; replacing it makes previously saved secrets unreadable.

Disconnect removes local credentials and invalidates pending authorizations. It
does not revoke a grant at the provider; revoke access there too when required.
Deactivating a local account prevents further API access but retains its encrypted
connection for potential reactivation. Account data is not shared with teammates.
Read responses are not cached in the browser's field-service offline cache.

## Validation limits

Automated tests use fixture provider responses and real local account/session
checks. They cover state replay, encrypted storage, permission guards, user
isolation, read allowlists, token refresh, disconnect races and opt-in Chat context.
No real provider account has been authorized or queried during development.
Complete a real account authorization and live preview after deploying and
configuring HTTPS and provider applications.
