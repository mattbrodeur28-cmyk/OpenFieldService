# Current security and permission boundaries

One company, local accounts and no public signup after owner bootstrap. A member
may have HR capability; HR is not a separate database role or service-data tenant.

| Operation | Owner | Admin | Member + HR | Member | Viewer |
| --- | --- | --- | --- | --- | --- |
| Read service records | Yes | Yes | Yes | Yes | Yes |
| Write service records / Knowledge | Yes | Yes | Yes | Yes | No |
| Own AI conversations | Yes | Yes | Yes | Yes | Yes |
| Manage ordinary people / team rosters | Yes | Yes | Yes | No | No |
| Grant HR to members | Yes | Yes | No | No | No |
| Create/manage administrators | Yes | No | No | No | No |
| Configure AI / server provider apps / Builder | Yes | Yes | No | No | No |
| Read team messages | All teams | All teams | Joined teams | Joined teams | Joined teams |
| Post team messages | All teams | All teams | Joined teams | Joined teams | No |

HR does not gain system privileges through the HR flag. An ordinary member still
has the business permissions of a member. HR can change membership (including
joining a team), so roster changes can intentionally grant conversation access.
Owners, self-management and privileged targets are protected from HR resets/edits.
Role changes and resets revoke target sessions. Password operations recheck current
permissions after asynchronous hashing to prevent an in-flight privilege race.

All users can update their own display name and password. Profile fields cannot
set role/HR. Integrations are per-user; administrative provider app setup does not
connect every user's account. See integration guide for exact provider scopes.

Passwords use salted scrypt; cookies are HttpOnly/SameSite=Strict, Secure with HTTPS
PUBLIC_URL. Session tokens are hashed at rest. OAuth/AI credentials are encrypted;
back up the encryption key privately and do not rotate it without re-encryption.
The custom request header plus same-site cookies protect browser mutations; CORS
credential access is not enabled. The bootstrap key is not a general API bearer key.

Do not log passwords, bootstrap keys, tokens or provider content unnecessarily.
Keep deployment env files private; use private maintainer contact for vulnerability
reports, not public issues containing secrets. MFA/SSO, centralized capabilities,
durable audit and distributed rate limits remain planned. Saved offline device data
cannot be erased remotely while disconnected; logout clears local field caches.
