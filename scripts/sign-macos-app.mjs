import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import process from "node:process";

const root = resolve(import.meta.dirname, "..");
const app = resolve(process.env.MACOS_APP || "src-tauri/target/release/bundle/macos/声篇工坊.app");
const identity = process.env.APPLE_SIGNING_IDENTITY || "-";

if (!existsSync(app)) {
  throw new Error(`找不到 macOS 应用包：${app}`);
}

// A local ad-hoc signature is useful for development and makes the bundle
// internally verifiable. Distribution outside the build Mac still requires a
// Developer ID Application certificate and notarization (set the identity via
// APPLE_SIGNING_IDENTITY).
execFileSync("/usr/bin/codesign", [
  "--force",
  "--deep",
  "--timestamp=none",
  "--options", "runtime",
  "--sign", identity,
  app,
], { cwd: root, stdio: "inherit" });

execFileSync("/usr/bin/codesign", ["--verify", "--deep", "--strict", "--verbose=2", app], {
  cwd: root,
  stdio: "inherit",
});

console.log(`macOS 签名完成：${app}`);
console.log(identity === "-"
  ? "当前为 ad-hoc 签名：仅适合测试；正式分发还需要 Developer ID 签名并 notarize。"
  : "当前使用 Developer ID 身份签名；请继续完成 notarize 后再分发。"
);
