# Copilot 接入依据（2026-10-05）

- 官方 SDK：<https://github.com/github/copilot-sdk/tree/main/nodejs>
- 类型契约：<https://github.com/github/copilot-sdk/blob/main/nodejs/src/types.ts>
- 本项目锁定 `@github/copilot-sdk` 1.0.16；按安装包实际类型和运行验证实现，而非只照搬 main 分支示例。

采用 SDK 自带运行时、`mode: empty`、明确的个人数据目录和隔离的工作目录。
可使用本机 Copilot / gh 登录，或用户配置的 GitHub Token。
任务是结构化文本与图片推理，因此 `availableTools: []`，并排除
`builtin:*`、`mcp:*`、`custom:*`；关闭技能、配置发现、文件 hooks 和会话检索。
每次任务结束关闭并删除本应用刚创建的会话，不接管用户其他会话。

验证过本机账户认证、18 个可用模型的读取、JSON 结构化回答，以及通过 blob 附件
进行图片识别。首次检查时保留了 Gemini 默认配置。

2026-10-05 根据用户明确选择，将本机创作导演保存为 Copilot / `gpt-6-astra`。
通过真实 SDK 请求验证了该模型的 JSON 创作输出；浏览器确认已选 GPT-6 Astra，
下拉框载入 18 个账号可用模型。此次没有重新进行该模型的图片识别测试。
模型列表由账号实时返回，刷新和草稿连接检查不写入配置；未列出的模型会提示，
不会静默替换为其他模型。图片与配音服务仍分别是 Nano Banana 和 Azure Speech。

SDK 的空工具列表用于限制模型操作范围；电影运行时仍只接收可校验的 2D 场景数据。
不通过 Copilot 调用 Pika、Seedance 或任意收费视频生成工具。
