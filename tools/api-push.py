#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""知野 ZHIYE · API 推送工具
用法：python tools/api-push.py
说明：当 git push 无法直连 github.com 时（代理断路），走 api.github.com 推送变更。
Token 读取顺序：环境变量 GHTOKEN → tools/.ghtoken 文件（勿提交）。
"""

import base64
import os
import subprocess
import sys

import requests

REPO = "chuluono/ZHIYE"
API = f"https://api.github.com/repos/{REPO}"
LAST_FILE = os.path.join(os.path.dirname(__file__), "api-push.last")
TOKEN_FILE = os.path.join(os.path.dirname(__file__), ".ghtoken")


def read_token():
    t = os.environ.get("GHTOKEN", "")
    if t:
        return t.strip()
    if os.path.exists(TOKEN_FILE):
        return open(TOKEN_FILE, encoding="utf-8").read().strip()
    sys.exit("缺少 token：设置环境变量 GHTOKEN，或把 token 写入 tools/.ghtoken")


def git(*args):
    return subprocess.check_output(["git"] + list(args), encoding="utf-8").strip()


def main():
    H = {"Authorization": "Bearer " + read_token(),
         "Accept": "application/vnd.github+json"}

    # 远端当前状态
    r = requests.get(f"{API}/branches/main", headers=H)
    r.raise_for_status()
    remote_sha = r.json()["commit"]["sha"]
    r = requests.get(f"{API}/git/commits/{remote_sha}", headers=H)
    r.raise_for_status()
    base_tree = r.json()["tree"]["sha"]

    # 本地变更：相对上次同步点；无标记则全量
    last_local = open(LAST_FILE, encoding="utf-8").read().strip() if os.path.exists(LAST_FILE) else ""
    if last_local:
        changed = git("diff", "--name-only", last_local, "HEAD").split("\n")
    else:
        changed = git("ls-files").split("\n")
    changed = [f.strip() for f in changed if f.strip()]
    # 过滤已被 .gitignore 排除的产物（保险）
    if not changed:
        print("没有变更，无需推送。")
        return

    entries = []
    for f in changed:
        if not os.path.exists(f):
            entries.append({"path": f, "sha": None})  # 删除
            print("del", f)
            continue
        data = base64.b64encode(open(f, "rb").read()).decode()
        rr = requests.post(f"{API}/git/blobs", headers=H,
                           json={"content": data, "encoding": "base64"})
        if rr.status_code != 201:
            sys.exit(f"blob 失败 {f}: {rr.status_code} {rr.text[:150]}")
        entries.append({"path": f, "mode": "100644", "type": "blob", "sha": rr.json()["sha"]})
        print("up ", f)

    r = requests.post(f"{API}/git/trees", headers=H,
                      json={"base_tree": base_tree, "tree": entries})
    if r.status_code != 201:
        sys.exit(f"tree 失败: {r.status_code} {r.text[:200]}")

    try:
        msg = input("提交信息（回车 = 默认）：").strip() if sys.stdin.isatty() else ""
    except EOFError:
        msg = ""
    if not msg:
        msg = "更新站点内容"
    r = requests.post(f"{API}/git/commits", headers=H,
                      json={"message": msg, "tree": r.json()["sha"], "parents": [remote_sha]})
    r.raise_for_status()
    csha = r.json()["sha"]

    r = requests.patch(f"{API}/git/refs/heads/main", headers=H, json={"sha": csha})
    r.raise_for_status()

    with open(LAST_FILE, "w", encoding="utf-8") as fh:
        fh.write(git("rev-parse", "HEAD"))

    print(f"推送完成：{len(changed)} 个文件 → main ({csha[:10]})")
    print("Actions 构建约 1-2 分钟后自动上线：https://chuluono.github.io/ZHIYE/")


if __name__ == "__main__":
    main()
