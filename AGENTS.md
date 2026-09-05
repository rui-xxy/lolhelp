# 项目协作规则（Windows 宿主机）

## 命令输出重定向禁令（最高优先级，必须遵守）

本机是 Windows。任何命令中**禁止**使用 Windows 保留设备名作为重定向目标或文件名：

- 禁止写法：`> NUL`、`2> NUL`、`type xxx > NUL`、`echo ... > NUL`、`copy nul 文件名`
- 禁止创建、写入、读取名为 `NUL`、`CON`、`PRN`、`AUX`、`COM1`~`COM9`、`LPT1`~`LPT9` 的文件

**原因**：保留名文件无法被普通文件 API 和 Git 的清理/快照操作处理，会永久锁死 WebCodex 的可写工作区（writable slot）。2026-08-30 已实际发生过一次，导致所有写入任务被阻塞。

**正确写法**：

- Git Bash / MSYS shell：`命令 > /dev/null 2>&1`
- PowerShell：`命令 | Out-Null` 或 `命令 > $null`
- cmd：尽量避免；必须静音输出时改用 PowerShell

**应急处理**：如果发现项目或工作区里出现了 `NUL` 文件，立即告知用户，并在文件所在目录用 Git Bash 执行 `rm NUL` 删除（普通资源管理器和 del 删不掉它）。
