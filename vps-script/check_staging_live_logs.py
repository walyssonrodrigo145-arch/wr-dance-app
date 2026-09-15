#!/usr/bin/env python3
import subprocess

askpass_script = "/tmp/ssh_askpass.sh"
env = {"SSH_ASKPASS": askpass_script, "SSH_ASKPASS_REQUIRE": "force", "DISPLAY": "dummy:0"}

cmd = "docker logs wr-music-app-staging-app --tail 30"
res = subprocess.run(
    ["/usr/bin/ssh", "-o", "StrictHostKeyChecking=no", "-o", "UserKnownHostsFile=/dev/null", "root@179.197.76.174", cmd],
    env=env, capture_output=True, text=True
)
print(res.stdout)
if res.stderr:
    print(res.stderr)
