#!/usr/bin/env bash
# Server setup for Zappen durch die Zeit on Debian 13 (or Ubuntu 24.04), as root. Idempotent: safe to run again.
# Does: base packages, hostname and time zone, user "deploy" with the SSH keys of root, SSH keys only and no
# root login, firewall (22, 80, 443/tcp+udp), automatic security updates with reboot at 04:00, fail2ban for
# SSH, 2 GB swap, Docker Engine with the Compose plugin, /opt/zadudize and the backup folder.
#
#   scp deploy/provision.sh root@SERVER:/root/ && ssh root@SERVER bash /root/provision.sh
#
# Root login over SSH is switched off only once "deploy" has a key – log in as deploy@SERVER afterwards.
set -euo pipefail

DEPLOY_USER="${DEPLOY_USER:-deploy}"
APP_DIR="${APP_DIR:-/opt/zadudize}"
BACKUP_DIR="${BACKUP_DIR:-/var/backups/zadudize}"
HOSTNAME_NEW="${HOSTNAME_NEW:-zadudize}"
SWAP_SIZE_MB="${SWAP_SIZE_MB:-2048}"

log() { printf '\n== %s\n' "$*"; }
[ "$(id -u)" -eq 0 ] || { echo "Bitte als root ausführen." >&2; exit 1; }
. /etc/os-release
case "$ID" in debian | ubuntu) ;; *) echo "Nur für Debian/Ubuntu (gefunden: $ID)." >&2; exit 1 ;; esac

log "Packages"
export DEBIAN_FRONTEND=noninteractive
apt-get update -q
apt-get install -y -q ca-certificates curl gnupg sudo ufw fail2ban unattended-upgrades apt-listchanges \
  age lftp rsync cron logrotate

log "Hostname and time zone"
if [ "$(hostname)" != "$HOSTNAME_NEW" ]; then
  hostnamectl set-hostname "$HOSTNAME_NEW"
  grep -q "\b$HOSTNAME_NEW\b" /etc/hosts || echo "127.0.1.1 $HOSTNAME_NEW" >> /etc/hosts
fi
timedatectl set-timezone Europe/Berlin

log "User $DEPLOY_USER"
id "$DEPLOY_USER" >/dev/null 2>&1 || adduser --disabled-password --gecos "" "$DEPLOY_USER"
usermod -aG sudo "$DEPLOY_USER"
# sudo without a password: the account has no password, only the SSH key.
echo "$DEPLOY_USER ALL=(ALL) NOPASSWD:ALL" > "/etc/sudoers.d/90-$DEPLOY_USER"
chmod 440 "/etc/sudoers.d/90-$DEPLOY_USER"
visudo -cf "/etc/sudoers.d/90-$DEPLOY_USER" >/dev/null
install -d -m 700 -o "$DEPLOY_USER" -g "$DEPLOY_USER" "/home/$DEPLOY_USER/.ssh"
KEYS="/home/$DEPLOY_USER/.ssh/authorized_keys"
if [ -s /root/.ssh/authorized_keys ]; then
  touch "$KEYS"
  # Add root's keys that deploy doesn't have yet.
  while IFS= read -r key; do
    [ -n "$key" ] && ! grep -qxF "$key" "$KEYS" && echo "$key" >> "$KEYS"
  done < /root/.ssh/authorized_keys
fi
[ -f "$KEYS" ] && chown "$DEPLOY_USER:$DEPLOY_USER" "$KEYS" && chmod 600 "$KEYS"

log "SSH: keys only"
if [ -s "$KEYS" ]; then
  cat > /etc/ssh/sshd_config.d/10-zadudize.conf <<'EOF'
# provision.sh: keys only, no root login.
PasswordAuthentication no
KbdInteractiveAuthentication no
PermitRootLogin no
EOF
  sshd -t
  systemctl reload ssh 2>/dev/null || systemctl reload sshd
else
  echo "WARNUNG: $DEPLOY_USER hat keinen SSH-Schlüssel – Root-Login bleibt an, damit du dich nicht aussperrst." >&2
fi

log "Firewall"
ufw default deny incoming >/dev/null
ufw default allow outgoing >/dev/null
ufw allow 22/tcp >/dev/null
ufw allow 80/tcp >/dev/null
ufw allow 443/tcp >/dev/null
ufw allow 443/udp >/dev/null
ufw --force enable >/dev/null
ufw status verbose | sed -n '1,12p'

log "Automatic security updates (reboot at 04:00 when needed)"
cat > /etc/apt/apt.conf.d/20auto-upgrades <<'EOF'
APT::Periodic::Update-Package-Lists "1";
APT::Periodic::Unattended-Upgrade "1";
EOF
cat > /etc/apt/apt.conf.d/52zadudize-upgrades <<'EOF'
Unattended-Upgrade::Automatic-Reboot "true";
Unattended-Upgrade::Automatic-Reboot-Time "04:00";
EOF
systemctl enable --now unattended-upgrades >/dev/null

log "fail2ban for SSH"
cat > /etc/fail2ban/jail.d/sshd.local <<'EOF'
[sshd]
enabled = true
backend = systemd
maxretry = 5
bantime = 1h
EOF
systemctl enable fail2ban >/dev/null
systemctl restart fail2ban

log "Swap ${SWAP_SIZE_MB} MB (safety net, not working memory)"
if ! swapon --show=NAME --noheadings | grep -qx /swapfile; then
  [ -f /swapfile ] || { fallocate -l "${SWAP_SIZE_MB}M" /swapfile || dd if=/dev/zero of=/swapfile bs=1M count="$SWAP_SIZE_MB"; }
  chmod 600 /swapfile
  mkswap /swapfile >/dev/null
  swapon /swapfile
fi
grep -q '^/swapfile ' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
echo 'vm.swappiness=10' > /etc/sysctl.d/90-zadudize.conf
sysctl -q -p /etc/sysctl.d/90-zadudize.conf

log "Docker Engine and Compose plugin (Docker's own repository)"
if ! command -v docker >/dev/null || ! docker compose version >/dev/null 2>&1; then
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL "https://download.docker.com/linux/$ID/gpg" -o /etc/apt/keyrings/docker.asc
  chmod a+r /etc/apt/keyrings/docker.asc
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/$ID $VERSION_CODENAME stable" \
    > /etc/apt/sources.list.d/docker.list
  apt-get update -q
  apt-get install -y -q docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
fi
systemctl enable --now docker >/dev/null
usermod -aG docker "$DEPLOY_USER"

log "Folders"
install -d -m 750 -o "$DEPLOY_USER" -g "$DEPLOY_USER" "$APP_DIR" "$APP_DIR/import"
install -d -m 700 -o "$DEPLOY_USER" -g "$DEPLOY_USER" "$BACKUP_DIR" "$BACKUP_DIR/daily" "$BACKUP_DIR/weekly"
install -d -m 750 -o "$DEPLOY_USER" -g "$DEPLOY_USER" /var/log/zadudize
cat > /etc/logrotate.d/zadudize <<'EOF'
/var/log/zadudize/*.log {
  weekly
  rotate 4
  compress
  missingok
  notifempty
}
EOF
if [ -f "$APP_DIR/cron.d/zadudize" ]; then
  install -m 644 "$APP_DIR/cron.d/zadudize" /etc/cron.d/zadudize
fi

log "Check: what listens publicly"
ss -tlnpu | awk 'NR == 1 || $5 !~ /^(127\.|\[::1\])/'
echo
echo "Fertig. Weiter als $DEPLOY_USER: ssh $DEPLOY_USER@$(hostname -I | awk '{print $1}')"
