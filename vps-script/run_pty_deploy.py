#!/usr/bin/env python3
import os
import pty
import select
import sys
import time

HOST = os.environ.get("VPS_HOST", "179.197.76.174")
USER = os.environ.get("VPS_USER", "root")
PASSWORD = os.environ.get("VPS_PASSWORD", "")

DEPLOY_COMMANDS = """
set -e
echo "🔍 Localizando diretório do projeto..."
REPO_DIR=$(find / -maxdepth 3 -type d -name "wr-music-app" 2>/dev/null | head -n 1)
if [ -z "$REPO_DIR" ]; then
  echo "❌ Repositório não encontrado!"
  exit 1
fi
echo "📁 Diretório: $REPO_DIR"
cd "$REPO_DIR"

echo "🔄 Executando git pull origin main..."
git fetch origin main
git reset --hard origin/main

echo "🏗️ Reconstruindo e reiniciando contêineres..."
docker compose up -d --build

echo "✅ Verificando containers..."
docker compose ps

echo "🚀 Deploy finalizado com sucesso em https://wrmusicpro.com.br!"
"""

def run_ssh_deploy():
    master, slave = pty.openpty()
    cmd = ["/usr/bin/ssh", "-o", "StrictHostKeyChecking=no", "-o", "UserKnownHostsFile=/dev/null", f"{USER}@{HOST}"]
    
    pid = os.fork()
    if pid == 0:
        # Child process
        os.close(master)
        os.setsid()
        os.dup2(slave, 0)
        os.dup2(slave, 1)
        os.dup2(slave, 2)
        os.close(slave)
        os.execv(cmd[0], cmd)
    else:
        # Parent process
        os.close(slave)
        buffer = b""
        password_sent = False
        commands_sent = False
        
        while True:
            r, _, _ = select.select([master], [], [], 1.0)
            if master in r:
                try:
                    data = os.read(master, 1024)
                    if not data:
                        break
                    sys.stdout.buffer.write(data)
                    sys.stdout.buffer.flush()
                    buffer += data
                    
                    if not password_sent and (b"password:" in buffer.lower() or b"password" in buffer.lower()):
                        time.sleep(0.5)
                        os.write(master, (PASSWORD + "\n").encode())
                        password_sent = True
                        buffer = b""
                    
                    if password_sent and not commands_sent and (b"#" in buffer or b"$" in buffer or b"~" in buffer):
                        time.sleep(1.0)
                        os.write(master, (DEPLOY_COMMANDS + "\nexit\n").encode())
                        commands_sent = True
                        buffer = b""
                except OSError:
                    break
                    
        os.close(master)
        _, status = os.waitpid(pid, 0)
        return os.WEXITSTATUS(status)

if __name__ == "__main__":
    if not PASSWORD:
        print("Erro: VPS_PASSWORD não definido no ambiente.")
        sys.exit(1)
    exit_code = run_ssh_deploy()
    sys.exit(exit_code)
