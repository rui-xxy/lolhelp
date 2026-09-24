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

## 隔离工作区的 node_modules（跑工具链前必读）

隔离工作区每次任务开始都会重置，只含 git 跟踪的源码，**没有 node_modules**。直接跑 `npm run lint / typecheck / test / check` 会报"找不到 eslint/tsc/vitest"。

**标准做法（任务开始时执行一次）**——把主目录的 node_modules 用 junction 挂进来（瞬间完成，不占磁盘）：

```bash
cmd //c 'mklink /J node_modules "C:\Users\Administrator\Desktop\个人项目\lolhelp\node_modules"'
```

- junction 建好后所有 npm scripts 立即可用
- **不要**在隔离工作区直接 `npm install`（737MB，慢且占盘）；主目录依赖有变化时由用户在主目录更新
- 若 junction 失败（极少见），退回 `npm install --prefer-offline`
- `npm run check`（lint+typecheck+styles+test 全链）是收尾自检的标准命令

## 成果落地方式（免审核直写，禁止提交）

用户已明确授权：**任务完成并通过检查链后，直接把最终改动同步（写回）到真实桌面项目** `C:\Users\Administrator\Desktop\个人项目\lolhelp` 的文件里。不要把工作停留在"待审核补丁"状态等用户 accept——用户不会去控制台点审核。

**严格禁止 git commit / git push**（用户 2026-09-23 明确要求：提交时机由用户自己决定，AI 只写文件不碰版本历史）。

- 写回前比对目标文件 SHA，写回后逐文件校验哈希一致
- 只同步本任务涉及的文件，不动其他部分
- 完成后在回复里告诉用户"改动已写入哪些文件"，由用户自行决定是否提交


