#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn, spawnSync } from "node:child_process";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..", "..");
const venvDir = path.join(repoRoot, ".graphify-venv");
const graphDir = path.join(repoRoot, "graphify-out");
const pythonRecord = path.join(repoRoot, ".graphify_python");
const graphPythonRecord = path.join(graphDir, ".graphify_python");

function venvPythonPath() {
  return process.platform === "win32"
    ? path.join(venvDir, "Scripts", "python.exe")
    : path.join(venvDir, "bin", "python");
}

function isCompatiblePython(command, baseArgs = []) {
  const probe = spawnSync(command, [...baseArgs, "-c", "import sys; raise SystemExit(0 if sys.version_info >= (3, 10) else 1)"], {
    stdio: "ignore",
  });
  return probe.status === 0;
}

function pickBasePython() {
  const candidates = [];

  if (process.env.GRAPHIFY_PYTHON) {
    candidates.push([process.env.GRAPHIFY_PYTHON, []]);
  }

  candidates.push(
    ["python3.13", []],
    ["python3.12", []],
    ["python3.11", []],
    ["python3.10", []],
    ["python3", []],
    ["python", []],
  );

  if (process.platform === "win32") {
    candidates.unshift(
      ["py", ["-3.13"]],
      ["py", ["-3.12"]],
      ["py", ["-3.11"]],
      ["py", ["-3.10"]],
    );
  }

  for (const [command, baseArgs] of candidates) {
    if (isCompatiblePython(command, baseArgs)) {
      return { command, baseArgs };
    }
  }

  return null;
}

function runChecked(command, args, options = {}) {
  const result = spawnSync(command, args, {
    stdio: options.capture ? "pipe" : "inherit",
    cwd: options.cwd ?? repoRoot,
    env: process.env,
    encoding: "utf8",
  });

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }

  return result;
}

function ensureEnv() {
  fs.mkdirSync(graphDir, { recursive: true });

  const existingVenvPython = venvPythonPath();
  if (!fs.existsSync(existingVenvPython) || !isCompatiblePython(existingVenvPython)) {
    const basePython = pickBasePython();
    if (!basePython) {
      console.error("[graphify] Python 3.10+ is required. Install python3.10+ or set GRAPHIFY_PYTHON.");
      process.exit(1);
    }

    console.error(`[graphify] creating local virtualenv at ${venvDir}`);
    fs.rmSync(venvDir, { recursive: true, force: true });
    runChecked(basePython.command, [...basePython.baseArgs, "-m", "venv", venvDir]);
  }

  const pythonBin = venvPythonPath();
  const importCheck = spawnSync(pythonBin, ["-c", "import graphify"], { stdio: "ignore" });
  if (importCheck.status !== 0) {
    console.error(`[graphify] installing graphifyy into ${venvDir}`);
    runChecked(pythonBin, ["-m", "pip", "install", "--upgrade", "pip"]);
    runChecked(pythonBin, ["-m", "pip", "install", "graphifyy"]);
  }

  fs.writeFileSync(pythonRecord, `${pythonBin}\n`, "utf8");
  fs.writeFileSync(graphPythonRecord, `${pythonBin}\n`, "utf8");

  const currentDir = fs.realpathSync(process.cwd());
  const realRepoRoot = fs.realpathSync(repoRoot);
  if (currentDir === realRepoRoot || currentDir.startsWith(`${realRepoRoot}${path.sep}`)) {
    fs.writeFileSync(path.join(currentDir, ".graphify_python"), `${pythonBin}\n`, "utf8");
  }

  return pythonBin;
}

function execCommand(command, args, cwd = repoRoot) {
  const child = spawn(command, args, {
    cwd,
    env: process.env,
    stdio: "inherit",
  });

  child.on("exit", (code, signal) => {
    if (signal) {
      process.kill(process.pid, signal);
      return;
    }
    process.exit(code ?? 0);
  });

  child.on("error", (error) => {
    console.error("[graphify] failed to start child process", error);
    process.exit(1);
  });
}

const command = process.argv[2] ?? "run";

switch (command) {
  case "ensure-env": {
    process.stdout.write(`${ensureEnv()}\n`);
    break;
  }
  case "build-local": {
    const pythonBin = ensureEnv();
    execCommand(pythonBin, [path.join(repoRoot, ".codex", "scripts", "graphify-local-run.py"), ...process.argv.slice(3)]);
    break;
  }
  case "-h":
  case "--help":
  case "install":
  case "query":
  case "save-result":
  case "benchmark":
  case "hook":
  case "gemini":
  case "cursor":
  case "claude":
  case "codex":
  case "opencode":
  case "aider":
  case "copilot":
  case "claw":
  case "droid":
  case "trae":
  case "trae-cn": {
    const pythonBin = ensureEnv();
    execCommand(pythonBin, ["-m", "graphify", ...process.argv.slice(2)]);
    break;
  }
  default:
    console.error("[graphify] Use 'build-local' for the repo-local full build pipeline, or the $graphify skill for the interactive/manual workflow.");
    console.error("[graphify] This wrapper also provisions the local interpreter and exposes graphify CLI subcommands like query, hook, and benchmark.");
    process.exit(64);
}
