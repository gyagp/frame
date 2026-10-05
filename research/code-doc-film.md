# code-doc-film：3D 可行性研究

研究日期：2026-10-05。参考项目：[bangbuilds/code-doc-film](https://github.com/bangbuilds/code-doc-film)。
核对版本：[`d3078a857fbc70f78121ed0f919aa9d15c854e57`](https://github.com/bangbuilds/code-doc-film/tree/d3078a857fbc70f78121ed0f919aa9d15c854e57)，提交日期 2026-10-03。
方法：GitHub API 查元信息、克隆固定版本、阅读实现与参考手册、在隔离目录实际运行其船队场景。

## 结论与边界

**Movie Studio 可以进入有限范围的 3D 制作阶段，建议先用 Three.js，再扩展 Blender。**
本机 Windows 已实际渲染该项目的三维船队、动态海面、透视相机与后期处理，并编码为 MP4。
本次验证说明这个渲染路线可行；当前 Studio 的正式作品流程仍是 2D，尚未增加 3D 场景契约或 UI。

它适合风格化纪录片、路线、空间过程、产品结构和技术原理。其现成素材库是低模与程序化场景，
不足以直接提供高质量人物表演、面部特写、复杂角色绑定或通用写实电影。Three.js 本身的能力
不等同于这个项目已具备的场景库；需要新资产、新场景或新着色器时，仍有制作工作。

## 本机实际验证

| 项目 | 实测 |
|---|---|
| 原场景 | `examples/zheng-he/scenes/f01_hook.js` 的 fleet 镜头 |
| 图形库 | Three.js **0.181.2**，与上游脚手架一致 |
| 环境 | Windows、无头 Edge、WebGL 2、ANGLE / Intel Arc / D3D11 |
| 输出 | **6 秒，1280×720，24 fps，144 帧，H.264，无声** |
| 相机 | 从约 `[-60,26,760]` 移动到 `[-20,150,900]`，实际透视投影 |
| 稳定性 | 渲染 3s，再渲染其他时刻、切到另一镜头、回到 3s，PNG SHA-256 相同 |
| 错误 | 此测试无浏览器错误、无机位警告；渲染时没有外部网络请求 |
| 耗时 | 144 帧捕获与编码约 **50.6 秒**，不含安装、首次建场与预热 |

预览：[6 秒无声技术验证](http://127.0.0.1:4173/outputs/three-feasibility/d3078a857fbc70f7/reference-probe.mp4)。
本机记录：`outputs/three-feasibility/d3078a857fbc70f7/probe.json`；首、中、尾 PNG 也在该目录。
完整版权声明随产物保留于 `UPSTREAM-LICENSE.txt`。
可复现的隔离测试脚本及准备方法见 [probes/README.md](probes/README.md)，实测记录另存于
[code-doc-film-probe.json](code-doc-film-probe.json)。

这次直接调用上游已检查的 Three.js 场景和渲染器，用本地 Playwright + FFmpeg 导出。
未运行 HyperFrames，也未验证其完整 Windows 脚手架、真实地形下载、语音、配乐或全片流程。
无声片段是引擎验证，不是新作品的分镜／声音审批结果。未安装上游 skill 到全局技能目录。
临时依赖与克隆位于 `.cache/`，正式应用依赖及现有影片未改变。

50.6 秒是本次逐帧截图验证程序的墙钟耗时，不能当作纯 GPU 性能，也不能外推到其他题材、
1080p 或完整影片。字节级一致性只在本次浏览器／GPU 环境内验证，不代表不同 GPU 的输出完全相同。

## 从源码学到的可复用方法

### 1. 三维场景与影片编排分离

`film.json` 管内容、旁白、镜头顺序、事实、字幕、音乐；`scenes/*.js` 建世界和画镜头。
`film/film.js` 使用一个 WebGL 渲染器，按时间寻找 frame/shot，只保留两个活跃场景，释放旧场景资源。
`frame.js` 把全局时间转换成镜头局部时间和 0–1 进度。

可借鉴世界／资产复用和渲染适配器。Studio 应继续让模型输出可校验数据，由可信的场景库执行，
而不是直接引入共享工程中的任意 JS 场景。上游的自由代码方式适合编程助手，不能直接作为
我们的傻瓜式 Studio 的模型输出契约。

### 2. 按旁白句子编译时间轴

`film.py` 的 `resolve()` 支持 `cue:2`、`cueEnd:2`、`end-0.4` 等有限表达式。
先合成句子并测量，再确定镜头长度；相机关键帧使用 `k=0…1`。改声音后重算时间轴，
几何资产和镜头路径可以复用。

这是值得优先吸收的机制：我们刚遇到固定 14 秒镜头放不下真实旁白的问题。
未来应让叙事片默认跟随实测旁白节奏；广告等严格定长作品保留时长上限，提前改稿和安排留白。
它减少估时误差，不保证所有语音、动作和事实标注自动对齐；新的编排仍需正常审阅。

### 3. 有保护与诊断的运镜

`kit.js` 的 `world.cam` 检查相机地表净空，并采样相机到目标之间的地形视线。
发生修正会报告警告，让作者重新安排镜头，而不是把自动抬高当成成功。

这是地表／地形保护，**不是通用物体碰撞检测**。接入 Studio 时还需处理主体出框、近裁面、
文字遮挡、相机穿过模型等问题，并提供少量可靠的推进、环绕、升起揭示、跟拍预设。

### 4. 稳定时间采样

`engine.js` 有带 seed 的 RNG、关键帧插值及按输入时间变化的 shader。
`sea.js` 的 CPU 船体姿态和 GPU 海浪使用同一套波形参数。
文档要求每个镜头显式重设共享演员的可见性，避免乱序渲染残留上一镜头状态。

我们的现有纯时间 2D 运行时可以沿用这一原则：任意时间点都应独立恢复，禁止依赖逐帧累加的
角色位置、真实时钟或无种子的随机数；物理模拟若加入，需要先烘焙。

### 5. 分段配乐与环境声

`synth.py` 提供弦乐式音垫、低鼓、军鼓、号角的合成与情绪段落，还能合成风、雨、海浪等环境声。
这些是本地程序化声音，不是商业曲库或 AI 音乐服务。段落可绑定旁白 cue，并在人声出现时避让。

我们可以吸收音乐段落、环境声轨、动机变化与转折留白，让配乐跟叙事走。声音是否专业仍需
实际试听；本次没有生成或试听上游配乐，不能据代码或情绪名评价其成品听感。

### 6. 实际画面质检与事实索引

`film.py qa --frames` 抽取每个镜头的开始／中间／结束，检查黑、白、平色及相机警告，生成联系表。
静态事实检查只验证旁白阿拉伯数字是否出现在 facts 文本，以及 source 字段非空；这不是事实
真实性验证，也不能覆盖英文拼写数字。Studio 仍需保留现有证据台账、基线与测量上下文。

## 接入时要改的地方

| 上游做法 | Movie Studio 的选择 |
|---|---|
| AI 编写可执行 `scenes/*.js` | 版本化 3D JSON + 白名单几何、材质、相机、动画、资产路径 |
| HyperFrames 导出 | 第一阶段复用本地浏览器 + FFmpeg；是否采用 HyperFrames 单独评估 |
| 自动选 edge-tts / macOS say，可配置 shell 命令 | 保留 Azure Speech；个人连接配置不随项目共享，不接收项目内 shell |
| 句子决定镜头时长 | 引入语音 cue 编译；兼容严格定长作品，冻结已确认时间轴 |
| 按场景写灯光和机位 | 转成少量可靠的场景／摄影预设，更多参数藏在精细调整 |
| Windows 未测 | 本次只验证渲染核心；脚手架中的 npm/npx 调用、路径和配音需单独适配 |

作者 README 写 Node 20+，但本次 npm 查询 HyperFrames 0.8.82 要求 **Node ≥22**。
`new_project.py` 固定 Three.js 版本，却通过未固定版本的 `npx --yes hyperframes` 调用 CLI；
集成时应锁定版本与浏览器环境。

HyperFrames 是 HeyGen 维护的 **Apache-2.0 开源框架**，官方 README 描述本地 Chrome + FFmpeg
渲染且无逐次渲染授权费，也有另外的云渲染能力。它与必须调用付费视频生成 API 不是一回事。
我们的实测并不依赖它，因此没有必要为了加入 3D 迁移整套 Studio。

## 来源与许可

- bangbuilds，[README](https://github.com/bangbuilds/code-doc-film/blob/d3078a857fbc70f78121ed0f919aa9d15c854e57/README.md)：功能定位、作者实测范围、限制。作者报告的“两条影片”“55 分钟”“6 分钟渲染”均未独立复现，不作为本机结果。
- [引擎](https://github.com/bangbuilds/code-doc-film/blob/d3078a857fbc70f78121ed0f919aa9d15c854e57/template/film/engine.js)、[摄影工具](https://github.com/bangbuilds/code-doc-film/blob/d3078a857fbc70f78121ed0f919aa9d15c854e57/template/film/kit.js)、[场景调度](https://github.com/bangbuilds/code-doc-film/blob/d3078a857fbc70f78121ed0f919aa9d15c854e57/template/film/film.js)：已读核心实现并运行船队渲染。
- [时间轴与 QA](https://github.com/bangbuilds/code-doc-film/blob/d3078a857fbc70f78121ed0f919aa9d15c854e57/template/scripts/film.py)、[声音](https://github.com/bangbuilds/code-doc-film/blob/d3078a857fbc70f78121ed0f919aa9d15c854e57/template/scripts/synth.py)、`references/` 手册：源码／文档审阅；未运行整套流程。
- [MIT 许可证](https://github.com/bangbuilds/code-doc-film/blob/d3078a857fbc70f78121ed0f919aa9d15c854e57/LICENSE)，Copyright 2026 bangbuilds。未来移植实质代码需保留声明。本次测试复用其已有船队场景，没有把该场景创作归为我们原创。
- [Three.js](https://github.com/mrdoob/three)，MIT；本机隔离安装 0.181.2，未修改应用依赖。
- [HyperFrames README](https://github.com/heygen-com/hyperframes)、[LICENSE](https://github.com/heygen-com/hyperframes/blob/main/LICENSE)，Apache-2.0；2026-10-05 通过 GitHub 和 npm 元数据核实。未调用其 CLI。
- 地图高程来自 AWS Terrain Tiles、河流来自 Natural Earth 是上游的数据来源；本次没有下载或使用这些数据。上游的河谷／海岸场景也包含程序化生成，不能把所有三维场景称为真实地理复原。

上游关于特定题材、人物和发布平台的偏好属于作者工作方法；本次仅研究它们，不将其作为
Movie Studio 的新全局规则。工程实施建议见 [3D-ENGINE.md](../docs/3D-ENGINE.md)。
