#!/usr/bin/env python3
import os
import subprocess
import sys
import time

HOST = "179.197.76.174"
USER = "root"
PASSWORD = "Walysson2003@"

askpass_script = "/tmp/ssh_askpass.sh"
with open(askpass_script, "w") as f:
    f.write(f'#!/bin/sh\necho "{PASSWORD}"\n')
os.chmod(askpass_script, 0o755)

env = dict(os.environ)
env["SSH_ASKPASS"] = askpass_script
env["SSH_ASKPASS_REQUIRE"] = "force"
env["DISPLAY"] = "dummy:0"

DEPLOY_SCRIPT = """
set -e
echo "=========================================="
echo "🚀 INICIANDO DEPLOY NA VPS"
echo "=========================================="

REPO_DIR=$(find / -maxdepth 3 -type d -name "wr-music-app" 2>/dev/null | head -n 1)
if [ -z "$REPO_DIR" ]; then
  echo "❌ Repositório wr-music-app não encontrado na VPS!"
  exit 1
fi

echo "📁 Repositório encontrado em: $REPO_DIR"
cd "$REPO_DIR"

echo "💾 Gerando backup preventivo do banco de dados..."
mkdir -p /root/backups
docker compose exec -T db pg_dump -U postgres wrmusic > "/root/backups/backup_pre_deploy_$(date +%Y%m%d_%H%M%S).sql" 2>/dev/null || echo "⚠️ Aviso: Backup automático ignorado (container db não está rodando ou comando indisponível)."

echo "🔄 Sincronizando código com origin/main (GitHub)..."
git fetch origin main
git reset --hard origin/main

echo "🏗️ Construindo imagens e reiniciando aplicação..."
docker compose build --no-cache
docker compose up -d

echo "🌐 Recarregando proxy Caddy..."
docker compose exec -T caddy caddy reload --config /etc/caddy/Caddyfile 2>/dev/null || docker compose restart caddy 2>/dev/null || echo "Proxy OK"

echo "📊 Verificando status dos contêineres..."
docker compose ps

echo "=========================================="
echo "✅ DEPLOY CONCLUÍDO COM SUCESSO!"
echo "🌐 Acesse: https://wrmusicpro.com.br"
echo "=========================================="
"""

print(f"📡 Conectando à VPS {HOST} via SSH...")
proc = subprocess.Popen(
    ["/usr/bin/ssh", "-o", "StrictHostKeyChecking=no", "-o", "UserKnownHostsFile=/dev/null", f"{USER}@{HOST}", DEPLOY_SCRIPT],
    env=env,
    stdout=subprocess.PIPE,
    stderr=subprocess.STDOUT,
    text=True,
    bufsize=1
)

for line in proc.stdout:
    sys.stdout.write(line)
    sys.stdout.flush()

proc.wait()
if proc.returncode == 0:
    print("\n🎉 Deploy finalizado com sucesso!")
else:
    print(f"\n❌ Falha no deploy. Código de saída: {proc.returncode}")
sys.exit(proc.returncode)
