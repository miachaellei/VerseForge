import { copyFile, mkdir, rm } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import process from "node:process";

const root = resolve(import.meta.dirname, "..");
const python = process.env.STORY_WORKER_PYTHON || (process.platform === "win32" ? "python" : "python3");
const target = process.env.TAURI_ENV_TARGET_TRIPLE || rustHostTriple();
const executableSuffix = process.platform === "win32" ? ".exe" : "";
const buildRoot = join(root, "src-tauri", "target", "worker-sidecar", target);
const sourceEntry = join(root, "services", "local-worker", "worker_entry.py");
const destination = join(root, "src-tauri", "binaries", `story-worker-${target}${executableSuffix}`);

checkPythonModule("PyInstaller", "请先在用于发布的 Python 环境安装 PyInstaller。");
checkPythonModule("pypdf", "请先安装 worker 依赖：pip install -e services/local-worker。");

await rm(buildRoot, { recursive: true, force: true });
await mkdir(buildRoot, { recursive: true });
await mkdir(dirname(destination), { recursive: true });
const pyinstallerConfig = join(buildRoot, "cache");
await mkdir(pyinstallerConfig, { recursive: true });

execFileSync(python, [
  "-m", "PyInstaller",
  "--noconfirm",
  "--clean",
  "--onefile",
  "--name", "story-worker",
  "--distpath", join(buildRoot, "dist"),
  "--workpath", join(buildRoot, "work"),
  "--specpath", join(buildRoot, "spec"),
  "--paths", join(root, "services", "local-worker"),
  "--collect-all", "pypdf",
  sourceEntry,
], { cwd: root, stdio: "inherit", env: { ...process.env, PYINSTALLER_CONFIG_DIR: process.env.PYINSTALLER_CONFIG_DIR || pyinstallerConfig } });

await copyFile(join(buildRoot, "dist", `story-worker${executableSuffix}`), destination);
process.stdout.write(`Worker sidecar: ${destination}\n`);

function checkPythonModule(moduleName, message) {
  try {
    execFileSync(python, ["-c", `import ${moduleName}`], { stdio: "ignore" });
  } catch {
    throw new Error(`${message}\nPython: ${python}`);
  }
}

function rustHostTriple() {
  const output = execFileSync("rustc", ["-vV"], { encoding: "utf8" });
  const host = output.match(/^host:\s*(.+)$/m)?.[1]?.trim();
  if (!host) throw new Error("无法从 rustc -vV 读取目标三元组");
  return host;
}
