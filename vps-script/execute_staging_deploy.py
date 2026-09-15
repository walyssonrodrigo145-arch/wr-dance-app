#!/usr/bin/env python3
import os
import subprocess
import sys

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

FILES_TO_UPLOAD = [
    "client/src/pages/Progresso.tsx",
    "drizzle/schema.ts",
]

print("==========================================")
print("🔄 RESTAURANDO AMBIENTE DE TESTES (STAGING)")
print("==========================================")

base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# 1. Localizar repo
find_cmd = "find / -maxdepth 3 -type d -name 'wr-music-app' 2>/dev/null | head -n 1"
repo_proc = subprocess.run(
    ["/usr/bin/ssh", "-o", "StrictHostKeyChecking=no", "-o", "UserKnownHostsFile=/dev/null", f"{USER}@{HOST}", find_cmd],
    env=env, capture_output=True, text=True
)
repo_path = repo_proc.stdout.strip()
if not repo_path:
    print("❌ Repositório não encontrado na VPS!")
    sys.exit(1)

# 2. Remover componentes criados na VPS
print("🧹 Limpando componentes criados na VPS...")
clean_cmd = f"rm -f {repo_path}/client/src/components/progresso/StudentProfileCard.tsx {repo_path}/client/src/components/progresso/ProgressSummarySidebar.tsx {repo_path}/client/src/components/progresso/TimelineFilters.tsx {repo_path}/client/src/components/progresso/TimelineItemNew.tsx"
subprocess.run(
    ["/usr/bin/ssh", "-o", "StrictHostKeyChecking=no", "-o", "UserKnownHostsFile=/dev/null", f"{USER}@{HOST}", clean_cmd],
    env=env
)

# 3. Enviar arquivos originais restaurados
print("📦 Enviando arquivos originais para a VPS...")
for rel_path in FILES_TO_UPLOAD:
    local_file = os.path.join(base_dir, rel_path)
    remote_file = f"{repo_path}/{rel_path}"
    if os.path.exists(local_file):
        print(f"  ⬆️ {rel_path}")
        subprocess.run(
            ["/usr/bin/scp", "-o", "StrictHostKeyChecking=no", "-o", "UserKnownHostsFile=/dev/null", local_file, f"{USER}@{HOST}:{remote_file}"],
            env=env
        )

# 4. Rebuild no Staging
REMOTE_DEPLOY = f"""
cd {repo_path}
echo "🏗️ Reconstruindo container do Staging com a versão original..."
docker compose -f docker-compose.staging.yml build --no-cache
echo "🔄 Reiniciando container de Staging..."
docker compose -f docker-compose.staging.yml up -d
echo "🌐 Recarregando Caddy..."
docker compose exec -T caddy caddy reload --config /etc/caddy/Caddyfile 2>/dev/null || docker compose restart caddy 2>/dev/null || echo "Proxy OK"
echo "📊 Status dos contêineres de Staging:"
docker compose -f docker-compose.staging.yml ps
"""

print("⚙️ Executando Docker Build no servidor...")
proc = subprocess.Popen(
    ["/usr/bin/ssh", "-o", "StrictHostKeyChecking=no", "-o", "UserKnownHostsFile=/dev/null", f"{USER}@{HOST}", REMOTE_DEPLOY],
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
    print("\n==========================================")
    print("✅ RESTAURAÇÃO EM STAGING CONCLUÍDA COM SUCESSO!")
    print("🌐 Acesse: https://staging.wrmusicpro.com.br")
    print("==========================================")
else:
    print(f"\n❌ Falha no deploy. Código de saída: {proc.returncode}")
sys.exit(proc.returncode)
