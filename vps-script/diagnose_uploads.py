#!/usr/bin/env python3
import os, subprocess, sys

PASSWORD = "Walysson2003@"
HOST = "179.197.76.174"
USER = "root"

askpass = "/tmp/ssh_askpass.sh"
with open(askpass, "w") as f:
    f.write(f'#!/bin/sh\necho "{PASSWORD}"\n')
os.chmod(askpass, 0o755)
env = dict(os.environ)
env["SSH_ASKPASS"] = askpass
env["SSH_ASKPASS_REQUIRE"] = "force"
env["DISPLAY"] = "dummy:0"

CMD = """
echo "=== Verificando uploads dentro do container atual ==="
docker exec wr-music-app-app-1 ls -la /app/uploads/ 2>/dev/null || echo "PASTA uploads/ VAZIA OU NAO EXISTE no container"
echo ""
echo "=== Verificando se existe volume montado para /app/uploads ==="
docker inspect wr-music-app-app-1 --format='{{range .Mounts}}{{.Source}} -> {{.Destination}}{{println}}{{end}}'
echo ""
echo "=== Verificando backups disponiveis ==="
ls -lh /root/backups/ 2>/dev/null || echo "Nenhum backup encontrado"
echo ""
echo "=== Verificando uploads diretamente no host (fora do container) ==="
ls -la /root/wr-music-app/uploads/ 2>/dev/null || echo "PASTA /root/wr-music-app/uploads/ nao existe ou vazia"
echo ""
echo "=== Contando arquivos de upload no host ==="
find /root/wr-music-app/uploads/ -type f 2>/dev/null | wc -l || echo "0"
echo ""
echo "=== Primeiros 20 arquivos no host ==="
find /root/wr-music-app/uploads/ -type f 2>/dev/null | head -20
"""

proc = subprocess.Popen(
    ["/usr/bin/ssh", "-o", "StrictHostKeyChecking=no", "-o", "UserKnownHostsFile=/dev/null", f"{USER}@{HOST}", CMD],
    env=env, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, bufsize=1
)
for line in proc.stdout:
    sys.stdout.write(line)
    sys.stdout.flush()
proc.wait()
