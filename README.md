# FRAME · Movie Studio

一个逐步成长的本地电影制作工作室和自有 2D 引擎。大模型承担导演、摄影与动画编排，
本地运行时执行图层、关键帧、路径、粒子、相机与声画时间线。
`subgroup-matrix` 是工作室的第一部作品，不是整个产品的唯一用途。

## 打开工作室

需要 Node.js 22 LTS（或 ^20.19.0 / >=22.12.0）和 FFmpeg / FFprobe。首次运行：

```powershell
npm install
npm start
```

打开 <http://127.0.0.1:4173>。也可双击 `start-studio.cmd`。

默认进入**引导工作台**：每一步只突出下一步。成片完成后直接播放、下载，不会让你重复渲染。
「精细调整」保留全部镜头、运镜、声音和素材设置；简单操作不会降低生成质量。

侧栏「连接设置」支持 Gemini / GitHub Copilot、Nano Banana、Azure Speech / 本地配音，
每个人使用自己的账号。可以先检查，再保存；个人密钥不进入项目或仓库。
选择 Copilot 后可直接从账号返回的模型列表选择（例如 GPT-6 Astra），也可以刷新列表。
详细说明见 [docs/CONNECTIONS.md](docs/CONNECTIONS.md)。

Google 功能读取已配置的 `GOOGLE_API_KEY`，或复制 `.env.example` 为 `.env` 并填写。
密钥只留在本地服务。旁白使用 **Azure Speech**：配置 `SPEECH_KEY` 与 `SPEECH_REGION`，
或通过 `.env.example` 中的三个 Azure 资源字段让本地服务使用 Azure CLI 读取密钥。
密钥不会显示在界面、写入项目或进入 Git。没有云端服务也可以手工编排、上传图片并用
Windows 本地语音。Google 配音已按用户要求移除。

## 做一部新电影

1. 点击「新建作品」，说想法即可。工作室能从描述识别语言、时长、横竖屏；风格等默认值可展开修改，手动设置优先。
2. 故事、节奏、声线、无旁白、对标作品、素材、必须出现的事实可在可选区域补充。
   「更多设置」提供 12 种影片类型和 12 套配色；类型附带叙事建议，配色可展开色板库直接预览。
   已经手动选好的配色不会被类型推荐覆盖。编辑简报时会保留自定义风格、时长和声音方向。
3. AI 导演先生成故事与分镜。你可逐镜修改；点击「确认分镜，准备画面」后生成关键帧。
4. 确认关键画面，先制作当前镜头起约 12 秒的片段，带实际旁白、音乐、动画和运镜。
5. 预览样片，必要时重做。点击「样片满意，制作全片」后才制作剩余全片。

默认只有一个主播放器：方案阶段看镜头安排、样片阶段看短片、完成后看全片。
顶部引导卡始终说明当前阶段和下一步。每个确认都与具体项目内容绑定，修改后旧确认
自动失效。创作简报可重新打开。MP4、SRT、封面和版本历史都在「审片与交付」。

修改会自动保存旧版本。导出读取冻结快照，不会被之后的编辑影响。生成失败会显示原因；
已经生成的素材和语音缓存会保留，不会无限重试收费调用。Google / Azure 计费遵循自己的账户。
动画按镜头逐个编排，每完成一镜就保存。超时或重启后，重试只处理尚未完成的镜头。
创作任务会显示正在设计／编写的镜头；复杂动画请求有独立的等待上限。

## 首版已经实现

- 独立作品库、12 种影片类型与各自的叙事结构、可配置的 AI 导演分镜；
- 整片连续性设定、逐镜导演意图、大模型生成的声明式 2D 动画和音效事件；
- 实际关键帧的 AI 审片建议、自然语言修改单个镜头；
- 中英文旁白、Nano Banana 画面生成、图片上传、素材来源记录；
- 逐镜编辑、复制、删除、排序、运镜、12 套可预览配色、版本恢复；
- 浏览器与离线导出共享时间函数，横屏 / 竖屏 1080p、24 fps MP4；
- Azure 自然语音，或显式选择 Windows 本地语音；实际音频时长驱动字幕；
- 分镜 → 关键画面 → 带声音样片 → 全片的内容绑定审阅流程；
- 原创程序化电子 BGM、转场音效、人声避让、两遍响度归一化；
- 后台任务进度、出错提示、字幕、封面、分镜图与 QA 脚本。

当前是**以生成关键帧、动态排版与代码动画为基础的工作室**。尚未提供完整的非线性视频
剪辑器、视频生成、口型同步、角色一致性参考图、任意比例、曲库或云协作。
TXT / MD 会作为 AI 导演的来源材料（最多 5 个文件、每个 8000 字符）；事实仍需审核。
图片和文本可上传；视频 / 3D 模型当前可记录路径，尚不能直接剪辑或渲染。

图片素材采用相机推进 / 拉远 / 横移；这不等同于生成了真实角色运动。
最终声音和节奏仍需要人工审片，自动检查不能替代导演判断。

影片类型包括科普、教程、纪录片、案例、产品、品牌广告、预告片、故事、影像随笔、旅行、
音乐视觉和视觉诗。配色包括深色科技、墨黑青玉、深海蓝金、琥珀电影、黑白银幕、温暖纸感、
瓷白墨蓝、钴蓝白昼、森绿麦穗、玫瑰奶油、雾紫月光、暮色珊瑚。
类型指导导演的叙事编排；配色同时用于画面生成、动画编排和基础预览。
修改配色会使旧动画需要重新制作，已有图片保留，可在素材页重新生成。

这些选项集中维护于 `src/presets.mjs`，由浏览器与离线入口共享。
它为既有主题注册表追加新配色，原有三套配色和已完成影片的指纹保持兼容；
新配色的颜色值参与渲染指纹，修改后需重新确认对应画面。
使用 `node scripts/check-presets-ui.mjs` 检查选择、保存与手机布局；该检查只修改自己的临时作品。

## 第一部作品

`projects/subgroup-matrix/`：面向国际开发者，英文旁白，150 秒，16:9。
原始 demo 和 report 已作为来源快照保存。性能数据为历史实测回放，没有重新执行 GPU benchmark。

新版 `projects/subgroup-matrix-v2/`（Closing the Gap）是独立的 168 秒英文作品，
讲述端侧推理、矩阵硬件与 API、Dawn / ORT 工程贡献及 AMD 结果。目前处于故事审阅阶段。
打开 `http://127.0.0.1:4173/?project=subgroup-matrix-v2`，可展开每镜的旁白、运镜和声音设计。
任意作品都可以用 `node scripts/story-review.mjs <project-id>` 生成可阅读的故事网页；
此命令不调用生成服务，也不会改变确认状态。

```powershell
npm run stills
node scripts/render.mjs subgroup-matrix --sample --start 0 --length 12
npm run render
npm run verify
```

低层 CLI 用于复现和调试；样片与全片渲染应在相应用户确认之后运行。
作品的实际进度以工作台为准；生成的成片不随 Git 仓库分发。

产物在 `outputs/subgroup-matrix/<snapshot>/`。重新捕获原始 demo：启动工作室后运行
`node scripts/capture-demo.mjs`（需要 Playwright 和 Edge，也可通过 `BROWSER_CHANNEL` 指定 Chrome）。

## 仓库结构

```text
.agents/skills/   9 个可复用电影制作 skills
public/          简单的中文工作室界面、字体
src/engine/      自有 2D 场景图、关键帧、相机、镜头配方、编排与审片
src/             作品模型、领域图表、Google 画面 / 导演与 Azure 语音适配器
scripts/         配音、渲染、截图、检查和启动工具
projects/<id>/   project.json、素材、来源、treatment 和 credits
research/        原帖消化与 API 核实记录
outputs/         每次导出的不可变作品快照与产物（不提交 Git）
```

技能入口见 [AGENTS.md](AGENTS.md)，原帖方法摘要见 [research/lemomo-digest.md](research/lemomo-digest.md)。
新增七个参考的消化见 [research/studio-references.md](research/studio-references.md)，
引擎边界与设计见 [docs/ENGINE.md](docs/ENGINE.md)。不依赖 Pika、Seedance 等视频生成平台。
本项目尊重用户的创作方向，不把参考文章里的数字型建议变成所有影片的硬门槛。

## 验证与继续建设

```powershell
npm test
npm run test:ui
npm run test:workflow
node scripts/verify.mjs subgroup-matrix --asr
```

UI / workflow 测试需要已启动服务；验证覆盖编辑保存、模板、导航、响应式界面和服务访问边界。
workflow 测试用临时项目实际执行 Google 动画编排 / 静帧审阅、Azure 配音、竖屏样片与全片导出，并检查各审阅门槛；
测试完成后清理临时项目。加 `--ai` 可额外验证真实 AI 导演调用，会使用你的 API 配额。
ASR 会向 Google 发送最终音轨，仅在显式带 `--asr` 时运行。开发路线见
[docs/ROADMAP.md](docs/ROADMAP.md)，素材和方法归属见 [CREDITS.md](CREDITS.md)。
