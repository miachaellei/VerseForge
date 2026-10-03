# Local Worker

本地 Worker 负责不能放在浏览器沙箱中的文档解析和后续 AI 工作流。第一批实现：

- TXT、Markdown 编码识别；
- EPUB 容器、OPF、阅读顺序和 XHTML 正文解析；
- 文字型 PDF 分页提取；
- 文件哈希、稳定章节/段落 ID 和导入质量报告；
- EPUB 条目数量、单文件大小、总解压大小和路径安全检查。

运行测试：

```bash
python3 -m unittest discover -s tests -v
```

当前是可由桌面核心调用的纯 Python 模块。Tauri 进程监管和稳定 IPC 协议将在桌面壳里接入。
