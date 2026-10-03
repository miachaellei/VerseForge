# macOS 发布与“拷贝后无法运行”排查

## 当前构建的限制

目前开发机是 Apple Silicon，默认产物为 `arm64`。它只能在 Apple Silicon Mac 上运行，不能直接在 Intel Mac 上运行。发布前在目标机器执行：

```sh
uname -m
```

`arm64` 表示 Apple Silicon，`x86_64` 表示 Intel。当前包可用以下命令确认：

```sh
file "声篇工坊.app/Contents/MacOS/story-rewriter-desktop"
file "声篇工坊.app/Contents/MacOS/story-worker"
```

## 仅在开发机测试

构建后先重新生成并校验 ad-hoc 签名：

```sh
pnpm desktop:release
pnpm desktop:sign
```

将 `.app` 移到目标机的“应用程序”目录后，若系统提示“无法验证开发者”，可在“系统设置 → 隐私与安全性”中允许，或右键应用选择“打开”。这是测试绕过，不是正式发布方案。

## 正式跨机器发布

需要 Apple Developer 账号的 **Developer ID Application** 证书，并完成 notarization。仅 ad-hoc 签名不能消除 Gatekeeper 拦截。

```sh
APPLE_SIGNING_IDENTITY="Developer ID Application: 公司名称 (TEAMID)" pnpm desktop:sign
xcrun notarytool submit "声篇工坊.zip" --keychain-profile "你的 notarization profile" --wait
xcrun stapler staple "声篇工坊.app"
```

## Intel 支持

要支持 Intel，必须另外构建 `x86_64-apple-darwin` 的主程序和 `story-worker` sidecar；不能只把 arm64 主程序改名。sidecar 依赖 Python 打包运行时，因此需要在 Intel Mac/CI 上用 Intel Python 构建，或准备可用的 universal2 worker，然后再生成 universal2 应用。
