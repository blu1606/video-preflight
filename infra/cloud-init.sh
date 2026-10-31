#!/usr/bin/env bash
set -Eeuo pipefail
export DEBIAN_FRONTEND=noninteractive
apt-get -o Acquire::Retries=5 update
apt-get -o Acquire::Retries=5 install -y docker.io docker-compose-v2 docker-buildx git curl ca-certificates
systemctl enable --now docker
usermod -aG docker ubuntu
install -d -o ubuntu -g ubuntu -m 750 \
    /opt/video-preflight /opt/video-preflight/shared /opt/video-preflight/shared/backups
install -d -o ubuntu -g ubuntu -m 700 /home/ubuntu/.ssh
cat > /etc/ssh/sshd_config.d/00-preflight.conf <<'EOF'
PasswordAuthentication no
KbdInteractiveAuthentication no
PermitRootLogin no
EOF
install -d -m 755 /run/sshd
sshd -t
systemctl reload ssh
echo 'Bootstrap ready. Clone main into /opt/video-preflight/repo and configure shared/app.env.'
