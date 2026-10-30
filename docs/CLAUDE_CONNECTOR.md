# Claude connector (remote MCP server)

Metric Mage runs a remote MCP server at `/api/mcp` (Streamable HTTP, Node runtime). People add it
to Claude as a custom connector and ask about their own projects.

## How sign-in works

Supabase Auth is the OAuth 2.1 authorisation server, using its built-in OAuth server feature. Metric Mage
supplies the consent page and acts as the protected resource.

1. Claude calls `/api/mcp` without a token and gets a `401` whose `WWW-Authenticate` header points
   to `/.well-known/oauth-protected-resource/api/mcp`.
2. That document names `${NEXT_PUBLIC_SUPABASE_URL}/auth/v1` as the authorisation server. Claude
   reads its RFC 8414 metadata, registers itself (dynamic client registration), and starts an
   authorisation-code + PKCE flow.
3. Supabase sends the person to `/app/connect/authorize?authorization_id=…`. If they're signed out,
   the proxy sends them to `/login?next=…` and back again. The page shows the client, account and
   projects, and **Allow** / **Don't allow** call `approveAuthorization` / `denyAuthorization`.
4. Claude exchanges the code with Supabase for an access token and a refresh token. The access
   token is an ordinary Supabase JWT for that user, plus a `client_id` claim.
5. On each MCP request, `verifyMcpToken` requires the `client_id` claim and calls Supabase
   `getUser(token)`. Disconnected sessions fail at once. Tools then query with a Supabase
   client signed in as that user, so RLS applies to every read on top of the explicit
   `organisation_id` filters.

`/.well-known/oauth-authorization-server` on the app's own domain returns Supabase's metadata for
older clients that only look on the MCP server's own domain.

## Tools

| Tool              | Kind  | Notes                                                                                          |
| ----------------- | ----- | ---------------------------------------------------------------------------------------------- |
| `list_projects`   | read  | Active memberships, the same list as the app's switcher (parked organisations hidden).          |
| `list_people`     | read  | Members of one project, for assigning to-dos.                                                   |
| `get_performance` | read  | `loadPerformance` / `loadPerformanceMany`: metrics, % change, highlights and their reasons.     |
| `list_insights`   | read  | Mirrors `/api/insights`, across the person's projects or one of them.                           |
| `list_todos`      | read  | Manual `work_tasks` with status, assignees, deadline and overdue flag (as `/app/todo` shows).   |
| `add_todo`        | write | Shares validation with `addTodo` (`lib/home/add-todo.ts`). Claude is told to confirm first.     |

Unknown project IDs and missing role permissions (`workspace.read`, `work.view`, `work.create`)
come back to Claude as plain errors. Unexpected errors are logged and returned as a generic message.

## Setup (one-off, in the Supabase dashboard)

1. **Authentication → OAuth Server**: enable it.
   - **Authorization path**: `/app/connect/authorize`
   - **Allow dynamic client registration**: on (Claude registers itself).
2. **Authentication → URL Configuration**: the **Site URL** must be the app's public URL. Supabase
   builds the consent link from it.
3. Recommended: switch JWT signing to asymmetric keys (**Project Settings → JWT Keys**). This isn't
   required here, because tokens are checked with `getUser`.

There's no new database migration. Supabase stores clients, consents and tokens in the `auth`
schema. There are also no new environment variables. The connector uses `NEXT_PUBLIC_SUPABASE_URL`,
`NEXT_PUBLIC_SUPABASE_ANON_KEY` and `NEXT_PUBLIC_SITE_URL` (for the connector URL and links back
into the app). `add_todo` uses `SUPABASE_SERVICE_ROLE_KEY` for the insert, the same way the app's
own to-do form does, after the membership, role and assignee checks.

## Adding it to Claude

- **claude.ai / Claude Desktop**: Settings → Connectors → Add custom connector → name "Metric Mage",
  URL `https://<your-domain>/api/mcp` → Connect → sign in → Allow.
- **Claude Code**: `claude mcp add --transport http metric-mage https://<your-domain>/api/mcp`, then
  `/mcp` to sign in.

People can see and disconnect connected apps under **Settings → Connect Claude**. Disconnecting
calls `revokeGrant`, which also ends Claude's sessions and refresh tokens.
