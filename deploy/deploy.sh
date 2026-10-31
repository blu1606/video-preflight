#!/usr/bin/env bash
set -Eeuo pipefail

main() {
    local expected_sha="${1:-}" current_sha
    local app_root="${APP_ROOT:-/opt/video-preflight}"
    export APP_ENV_FILE="${APP_ENV_FILE:-$app_root/shared/app.env}"
    cd "$app_root/repo"
    mkdir -p "$app_root/shared/backups"
    exec 9>"$app_root/shared/deploy.lock"
    flock -n 9 || { echo 'Another deployment is running.' >&2; return 1; }

    [[ -f "$APP_ENV_FILE" ]] || { echo "Missing $APP_ENV_FILE" >&2; return 1; }
    [[ -z "$expected_sha" || "$expected_sha" =~ ^[0-9a-f]{40}$ ]] || {
        echo 'Expected a full Git commit SHA.' >&2; return 1;
    }
    [[ "$(git branch --show-current)" == main ]] || {
        echo 'Server checkout must be on main.' >&2; return 1;
    }
    [[ -z "$(git status --porcelain)" ]] || {
        echo 'Server checkout has local changes; refusing to overwrite them.' >&2; return 1;
    }
    export GIT_TERMINAL_PROMPT=0
    git pull --ff-only origin main
    current_sha="$(git rev-parse HEAD)"
    [[ -z "$expected_sha" || "$current_sha" == "$expected_sha" ]] || {
        echo 'main changed after CI. Deploy the latest passing workflow instead.' >&2; return 1;
    }

    local compose=(docker compose --env-file "$APP_ENV_FILE" -f compose.yaml)
    "${compose[@]}" config --quiet
    # Build before replacing running containers: build failures leave the live app up.
    "${compose[@]}" build --pull

    # Stop writes while copying the small JSON database. Never delete named volumes.
    local db_container backup
    db_container="$("${compose[@]}" ps --all -q db)"
    if [[ -n "$db_container" ]]; then
        "${compose[@]}" stop api db
        backup="$app_root/shared/backups/db-$(date -u +%Y%m%dT%H%M%SZ)-$current_sha.json"
        if ! docker cp "$db_container:/var/lib/preflight/db.json" "$backup"; then
            "${compose[@]}" start db api
            echo 'Database backup failed; deployment aborted.' >&2
            return 1
        fi
    fi
    if ! "${compose[@]}" up -d --remove-orphans --wait --wait-timeout 180; then
        "${compose[@]}" ps
        "${compose[@]}" logs --tail 60
        echo 'Deployment failed. Inspect logs and restore the previous release if needed.' >&2
        return 1
    fi
    printf '%s\n' "$current_sha" > "$app_root/shared/deployed-sha"
    "${compose[@]}" ps
    echo "Deployed $current_sha"
}

main "$@"
