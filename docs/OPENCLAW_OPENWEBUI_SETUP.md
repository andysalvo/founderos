# OpenClaw + OpenWebUI + APS Setup

This is the fastest safe path to the system you described:

- `OpenClaw` runs on your VM and handles model inference.
- `OpenWebUI` is the ChatGPT-style app you use every day, including on your phone.
- `Founderos APS` stays the control plane for planning and approved actions.
- `Vercel env vars` become the place where new tool credentials are added.

The core rule is simple:

- Chat happens in OpenWebUI.
- Models run in OpenClaw.
- Sensitive actions stay behind APS.
- New tools are enabled by adding server-side env vars, not by teaching the model raw secrets.

## What success looks like

When this is set up correctly:

1. You open one URL on your phone or laptop.
2. You chat with your assistant through OpenWebUI.
3. OpenWebUI sends model requests to OpenClaw on your VM.
4. When the assistant needs approved actions, it calls APS endpoints.
5. When you add a new service key later, you add it in Vercel env vars and update APS to expose only the intended tool surface.

## Phase 1: Get the VM stable

Goal: make the VM the permanent home of OpenClaw and OpenWebUI.

Checklist:

1. Use one Ubuntu VM only for this stack.
2. Install Docker and Docker Compose on the VM.
3. Make sure OpenClaw is reachable locally on the VM.
4. Do not expose raw model ports publicly yet.
5. Keep one note with:
   - VM public IP
   - SSH login method
   - OpenClaw port
   - planned public domain, for example `ai.yourdomain.com`

Definition of done:

- SSH works
- Docker works
- OpenClaw is running reliably on the VM

## Phase 2: Put OpenWebUI in front of OpenClaw

Goal: make the system feel like ChatGPT.

Target architecture:

- browser or phone -> OpenWebUI
- OpenWebUI -> OpenClaw
- OpenWebUI does not own your orchestration rules

What to do:

1. Run OpenWebUI on the same VM with Docker.
2. Configure OpenWebUI to use your OpenClaw endpoint as an OpenAI-compatible provider if OpenClaw supports that shape.
3. Log into OpenWebUI in a browser on your laptop first.
4. Confirm you can send a prompt and get a model response.

Definition of done:

- One web app opens
- You can chat
- The reply is coming from OpenClaw

## Phase 3: Make it phone-friendly

Goal: one stable URL with HTTPS.

What to do:

1. Pick a subdomain in Porkbun such as `ai.yourdomain.com`.
2. Point that DNS record to the VM public IP.
3. Put a reverse proxy in front of OpenWebUI with HTTPS.
4. Open the final URL on your iPhone.
5. Add it to the home screen so it behaves like an app.

Safer access options:

- Best: use a private network layer such as Tailscale, then open the app privately from your phone.
- Good: public HTTPS with strong login and no exposed raw backend ports.
- Bad: public raw IP and open ports for everything.

Definition of done:

- Your phone opens one HTTPS URL
- OpenWebUI is usable from mobile
- Backend service ports are not exposed unnecessarily

## Phase 4: Keep APS as the action boundary

Goal: the assistant can plan and act without turning into an unsafe autonomous blob.

Active APS endpoints in this repo:

- `GET /api/founderos/health`
- `GET /api/founderos/capabilities`
- `POST /api/founderos/capabilities/check`
- `POST /api/founderos/precommit/plan`
- `POST /api/founderos/commit/execute`

How to think about them:

- `precommit/plan` is where the assistant proposes work.
- `commit/execute` is where exact approved writes happen.
- `FOUNDEROS_WRITE_KEY` protects authenticated access.

Do not give raw third-party secrets directly to the model.
Give them only to APS through server-side env vars.

## Phase 5: Add new tools through Vercel env vars

Goal: grow the assistant safely over time.

The safe pattern for every new service is:

1. Pick one service to add, for example GitHub, Slack, Notion, or Supabase.
2. Create that service's API key or token.
3. Store it as a Vercel environment variable.
4. Add or update one APS server-side adapter that uses that env var.
5. Expose only the narrow action you want, not the whole provider API.
6. Update the capabilities and docs so the available surface is explicit.

Example mental model:

- Bad: give the model a Notion token and tell it to do whatever it wants.
- Good: store `NOTION_API_KEY` in Vercel and add an APS tool like `notion.create_page` with tight server-side rules.

This is how the system "builds itself" without becoming unsafe:

- you add a key
- APS gains one new bounded tool
- the chat layer can use that tool
- the secret never sits in the prompt

## Phase 6: Automate operations

Goal: keep the stack running with minimal manual work.

Automate these first:

1. Docker restart policies for OpenClaw and OpenWebUI.
2. Health checks for both services.
3. Reverse proxy restart on reboot.
4. Backups for OpenWebUI persistent data.
5. Vercel-managed env vars for APS secrets.
6. A short written checklist for adding each new service key.

Automate these second:

1. VM provisioning scripts
2. DNS and TLS setup scripts
3. APS adapter scaffolding for new tools
4. Monitoring and alerting

## Blitz-scale order of operations

If you want the shortest path, do this in order:

1. Stabilize OpenClaw on the VM.
2. Put OpenWebUI in front of it.
3. Put your domain and HTTPS in front of OpenWebUI.
4. Confirm phone access.
5. Deploy APS on Vercel.
6. Connect OpenWebUI to APS as the action layer.
7. Add one new tool at a time through Vercel env vars.

## First keys to care about

Start with only the keys that matter for the current stack:

- OpenClaw provider keys already working
- `FOUNDEROS_WRITE_KEY`
- GitHub App credentials for APS writes
- Supabase witness credentials for APS

Do not add extra services until the base chat loop works.

## What I should guide you through next

The next practical move is:

1. confirm whether OpenClaw already exposes an OpenAI-compatible endpoint
2. if yes, run OpenWebUI against it
3. then wire your domain
4. then wire APS

If OpenClaw is not OpenAI-compatible yet, add a thin compatibility layer before doing anything else.
