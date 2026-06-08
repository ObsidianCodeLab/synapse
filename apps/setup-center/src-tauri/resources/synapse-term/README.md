# 研发中心运行时资源（Windows）

本目录随应用打包，需包含：

- `psmux.exe`、`lazygit.exe`
- `tmux-windows-v3.6a-win32.7.zip`（可选，用于解压 `tmux.exe` 到用户数据目录）

终端内命令（如 `claude`、`pwsh`）依赖本机 PATH；需 PowerShell 7 时请自行安装并配置 PATH。
- `agent-workspace.ps1`、`synapse-term-agent-tmux.conf`（脚本已入库）

二进制来源与版本说明可参考独立仓库 `SynapseTerm/synapse-term/bin/README.md` 及上游发布页。
