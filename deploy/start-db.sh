#!/bin/sh
set -eu

# Seed once; a new image must never replace uploads or saved analyses.
if [ ! -f /var/lib/preflight/db.json ]; then
    cp /seed/db.json /var/lib/preflight/db.json
fi
exec json-server /var/lib/preflight/db.json --host 0.0.0.0 --port 3101
