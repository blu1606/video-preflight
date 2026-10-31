# AWS demo deployment

One Ubuntu 24.04 EC2 (`m7i.xlarge`, Singapore), a 100 GiB encrypted gp3 root disk,
one Elastic IP, and Docker Compose. Caddy serves the built React app and proxies
`/api/*` (prefix stripped) to JSON Server, `/py/*` and `/media/*` to FastAPI.
Only ports 80/443 and the selected SSH sources are public. Every web route is
protected by HTTP Basic authentication over HTTPS because the app's shop login
is a simulation. No AWS keys are needed in GitHub Actions.

## 1. Prepare infrastructure

From your local checkout (these commands create resources only at `apply`):

```bash
ssh-keygen -t ed25519 -f ~/.ssh/video-preflight-deploy -C video-preflight-actions
# Use a dedicated key; do not overwrite an existing personal key. The Actions
# deploy key needs no passphrase. Keep the private key out of Git/Terraform.
cp infra/terraform.tfvars.example infra/terraform.tfvars
# Set ssh_public_key_path and ssh_allowed_cidrs in infra/terraform.tfvars.
terraform -chdir=infra init
terraform -chdir=infra fmt -check
terraform -chdir=infra validate
terraform -chdir=infra plan -out=demo.tfplan
terraform -chdir=infra apply demo.tfplan
terraform -chdir=infra output
```

Terraform reuses the account's default VPC/public subnet and creates a key pair,
security group, EC2 and Elastic IP. Keep the local Terraform state and plan out
of Git; retain the state so you can stop/destroy the right resources later.
No credentials or application secrets are put in EC2 user-data or Terraform.

**SSH access:** ordinary GitHub hosted runners have changing source IPs. For
this short demo, setting `ssh_allowed_cidrs = ["0.0.0.0/0"]` permits Actions to
connect using the dedicated key. If you restrict it to your own `/32`, CD will
not connect; use a runner with an allowed fixed IP instead. SSH password/root
login is disabled by cloud-init. This is an explicit choice in the tfvars,
not an automatically opened port.

## 2. Bootstrap the server once

Ensure this deployment code has reached GitHub `main` before cloning. SSH to
the Elastic IP printed by Terraform:

```bash
ssh -i ~/.ssh/video-preflight-deploy ubuntu@YOUR_PUBLIC_IP
sudo cloud-init status --wait
docker compose version
```

Reconnect SSH after cloud-init finishes if your session started before the
`docker` group was added to `ubuntu`.

Use a separate **read-only GitHub deploy key on the server** if the repository
is private. The Actions-to-server key and server-to-GitHub key serve different
purposes. Never put a PAT in the clone URL or Terraform. Example for a private repo:

```bash
ssh-keygen -t ed25519 -f ~/.ssh/id_ed25519 -C video-preflight-repo-readonly
cat ~/.ssh/id_ed25519.pub
# Add this PUBLIC key under repository Settings > Deploy keys (read-only).
# Verify github.com's SSH host key against GitHub's published fingerprints
# before accepting it on the first clone.
git clone --branch main git@github.com:blu1606/video-preflight.git /opt/video-preflight/repo
```

For a public repo use `https://github.com/blu1606/video-preflight.git` instead.
Keep the server checkout on `main` and do not edit tracked files on the server.

```bash
cp /opt/video-preflight/repo/deploy/.env.example /opt/video-preflight/shared/app.env
chmod 600 /opt/video-preflight/shared/app.env
docker run --rm -it caddy:2.10.2-alpine caddy hash-password
# Edit shared/app.env: SITE_ADDRESS=your-domain.example, DEMO_USER and the hash.
# Keep the hash in SINGLE QUOTES so Compose preserves its dollar signs.
```

Point your domain's DNS A record to the Elastic IP. Caddy obtains/renews TLS
certificates when 80/443 are reachable. Keep OPENAI_API_KEY empty until paid
calls are explicitly intended. The current app enables the policy LLM by
default; other endpoints can also request paid extraction/analysis. AWS credit
does not pay for an external OpenAI account. No real key is needed to build
images or run CI. The optional OPENAI_BASE_URL is only for a provider you choose.

```bash
bash /opt/video-preflight/repo/deploy/deploy.sh
```

The first deployment seeds the database from the versioned `db/db.json`.
Subsequent deployments keep the existing database, uploaded videos, generated
frames/cache and Caddy certificates in named volumes. The source database is
not copied over the live database on every deployment.

The original demo media/features are not in Git. Upload/copy the intended
`data/` and `output/` separately if you need existing demo videos/cached AI
results; database records and saved analyses alone do not provide those files.
For example, from a checkout that actually has these media files:

```bash
rsync -av -e 'ssh -i ~/.ssh/video-preflight-deploy' data/ ubuntu@YOUR_PUBLIC_IP:/opt/video-preflight/shared/media-import/
rsync -av -e 'ssh -i ~/.ssh/video-preflight-deploy' output/ ubuntu@YOUR_PUBLIC_IP:/opt/video-preflight/shared/output-import/
# On the server:
cd /opt/video-preflight/repo
export APP_ENV_FILE=/opt/video-preflight/shared/app.env
docker compose --env-file "$APP_ENV_FILE" cp /opt/video-preflight/shared/media-import/. api:/app/data
docker compose --env-file "$APP_ENV_FILE" cp /opt/video-preflight/shared/output-import/. api:/app/output
docker compose --env-file "$APP_ENV_FILE" exec --user root api chown -R app:app /app/data /app/output
```

## 3. Four GitHub Actions repository secrets

In Settings > Secrets and variables > Actions:

| Secret | Value |
|---|---|
| `DEPLOY_HOST` | Terraform Elastic IP |
| `DEPLOY_USER` | `ubuntu` |
| `DEPLOY_SSH_KEY` | Contents of the dedicated Actions-to-server private key |
| `DEPLOY_KNOWN_HOSTS` | Verified SSH known_hosts line for the server IP |

To obtain the host key, inspect `/etc/ssh/ssh_host_ed25519_key.pub` through the
EC2 console/trusted SSH session. Use `ssh-keyscan -t ed25519 YOUR_PUBLIC_IP`
locally and compare its fingerprint to the server before saving the resulting
known_hosts line. The workflow enforces host verification; it does not trust
an unverified keyscan at deploy time. App/API secrets stay in `shared/app.env`.

**CI:** PRs and pushes to `main` run Python syntax + a small dependency-free
scoring test set, frontend unit tests + production build, Terraform formatting,
shell syntax and Compose config validation. No Docker image build, provider
calls or heavyweight backend dependency install in CI.

**CD:** only after CI succeeds on `main`, Actions SSHs to the server and calls
`deploy/deploy.sh <tested-commit>`. Manual workflow runs are also available on
`main`. The script locks deployment, runs `git pull --ff-only`, verifies that
HEAD matches the passing CI commit, builds images, backs up the database with
writes stopped, then runs `docker compose up -d --wait`. Build failures leave
the current containers running. A health-check failure fails CD and prints
logs; it does not claim success or automatically roll back. A brief restart
window is expected, and in-flight analysis jobs can be interrupted. A newer
untested main commit is refused until its CI runs.

When any of the four deployment secrets is missing, CI still runs and CD is
explicitly skipped with a notice. After saving all four secrets, use Actions >
CI and deploy > Run workflow on `main` to verify the first automated deployment.

## Operations

```bash
cd /opt/video-preflight/repo
export APP_ENV_FILE=/opt/video-preflight/shared/app.env
docker compose --env-file "$APP_ENV_FILE" ps
docker compose --env-file "$APP_ENV_FILE" logs --tail 100 api
curl -u demo https://YOUR_DOMAIN/py/health
curl -u demo 'https://YOUR_DOMAIN/api/shops?_limit=1'
```

For local HTTP smoke testing only, copy `deploy/.env.example` to `deploy/.env`,
set `SITE_ADDRESS=:80`, set a real demo password hash, and run
`docker compose --env-file deploy/.env up -d --build --wait`. Production uses
a real domain and HTTPS. This stack is one demo server, without high availability
or a persistent job queue; avoid unbounded concurrent analysis runs.

Database backups are in `/opt/video-preflight/shared/backups/`. To return to an
older release, rebuild the previous commit's images and bring Compose up;
restore the matching database backup with API/DB stopped if the data contract
changed. GitHub deployment expects `main`, so return to `main` before resuming CD.

After the demo, stop EC2 to stop compute charges, export the media/database
you need, and use `terraform -chdir=infra destroy` when ready to remove it.
Stopping alone retains billable EBS/Elastic IP. Destroy removes the root disk
and all Docker volumes, so export required artifacts first. No shutdown timer
is created by this configuration.
