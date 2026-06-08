# 研发环境部署手册

本文档说明如何在本地搭建 Synapse 的完整研发环境，包括后端 API 与前端桌面应用（Setup Center）的开发与联调。

## 前置要求

- **Python 3.11+**
- **Node.js**（建议 LTS，用于前端）
- **Rust**（Tauri 桌面壳需要，见 [Tauri 文档](https://tauri.app/)）
- **Git**

---

## 一、后端环境（项目根目录）

在仓库**根目录**下依次执行：

### 1. 创建虚拟环境

```bash
python -m venv .venv
```

### 2. 激活虚拟环境

**Windows (PowerShell / CMD)：**

```bash
.venv\Scripts\activate
```

**macOS / Linux：**

```bash
source .venv/bin/activate
```

### 3. 以可编辑模式安装项目依赖

```bash
cd docs-site
npm install
cd ..
python scripts/build_docs.py
pip install -e .
```

如需同时安装开发依赖（测试、格式化等）：

```bash
pip install -e ".[dev]"
```

### 4. 初始化 Synapse（首次运行）

```bash
synapse init
```

按提示完成初始化（如数据目录、配置等）。

### 5. 启动后端 API 服务

```bash
synapse serve
```

服务默认会在本机启动（如 `http://127.0.0.1:8xxx`，以实际配置为准）。**注意：** 该命令启动的是已打包/生产态的前端资源，**开发时请勿直接依赖该页面**，应使用下面「前端开发」方式运行最新代码。

---

## 二、前端开发（Setup Center）

前端在 `apps/setup-center` 下，使用 React + TypeScript + Vite，桌面壳为 Tauri。

### 1. 进入前端目录

```bash
cd apps\setup-center
```

（Linux/macOS 使用 `apps/setup-center` 即可。）

### 2. 安装前端依赖

```bash
npm install
```

### 3. 启动 Vite 开发服务器（可选，仅 Web 调试）

仅做 Web 端调试时可执行：

```bash
npm run dev
```

浏览器访问 Vite 提供的地址（如 `http://localhost:5173`）即可看到最新前端代码。

### 4. 启动 Tauri 桌面开发模式（推荐）

以开发模式运行桌面应用（内嵌最新前端代码）：

```bash
npm run tauri dev
```

桌面窗口会热重载，便于联调后端 API 与前端功能。

### 5. 生成/更新应用图标

更换应用图标源图后，需重新生成各平台图标（含 Windows `.ico`、macOS `.icns` 等）：

```bash
npm run tauri icon src-tauri/icons/icon.png
```

在 `apps/setup-center` 目录下执行，输出到 `src-tauri/icons/`。

### 6. 进入前端部署引导

在 Tauri 桌面窗口中：

- 按 **`Ctrl + Shift + O`**（macOS：`Cmd + Shift + O`）可进入**前端部署引导**界面，用于配置或检查部署相关选项。

---

## 三、开发联调说明

| 用途           | 后端                     | 前端 / 桌面                          |
|----------------|--------------------------|--------------------------------------|
| 日常开发       | `synapse serve`（根目录）| `npm run tauri dev`（`apps/setup-center`） |
| 仅看最新前端   | 可不启或另启             | `npm run dev` 或 `npm run tauri dev` |
| 部署引导       | 确保后端已就绪           | Tauri 窗口中 `Ctrl + Shift + O`      |

**重要：** 不要用 `synapse serve` 打开的那个页面做前端开发——那是打包好的静态资源，不是最新源码。开发时务必用 `npm run dev` 或 `npm run tauri dev` 跑起来的界面。

---

## 四、常见问题

- **端口占用：** 若 `synapse serve` 或 Vite 端口被占，可在对应配置中修改端口。
- **Tauri 首次构建：** `npm run tauri dev` 第一次会编译 Rust，耗时较长，属正常现象。
- **Python 找不到：** 确保已激活 `.venv`，命令行前应有 `(.venv)` 等提示。
- **前端连不上后端：** 确认后端已 `synapse serve`，且前端配置中的 API 地址与后端一致（如 `http://127.0.0.1:8xxx`）。

更多项目结构、测试与代码规范见根目录 [AGENTS.md](../../AGENTS.md)。
