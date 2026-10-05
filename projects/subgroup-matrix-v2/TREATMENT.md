# Subgroup Matrix — Closing the Gap

故事与分镜审阅稿 · V2 · 2026-10-05

英文旁白 / 国际开发者 / 16:9 / 1080p24 / 2:48 / 12 个镜头

这次要讲的是：**矩阵硬件已经存在，但从硬件能力到真正可用的端侧推理，还缺一条可靠的软件链路。我们正在把它接通。**

主角是一条希望在本地获得响应的推理请求。它遇到矩阵乘瓶颈，发现硬件和 API 已经提供机会，却在 preview 的能力发现、编译、运行时和集成处遇到阻碍。我们在 Dawn 的修复和 ORT 的实验集成推进这条路径，最后以 AMD 测量回答开场问题，并保留真实部署边界。

当前交付是完整的故事、英文台词、镜内动作与声音设计。尚未制作 V2 的关键帧、配音、样片或成片；Studio 中的缩略图明确为分镜占位。上一版电影及其确认记录保留在原项目中。

## 故事与节奏

| 时间 | 镜头 | 观众获得的信息 | 镜头动作 |
|---|---|---|---|
| 00:00–00:12 | Intelligence. Right here. | 本地模型为什么需要更快 | 同一台电脑，缓慢推进到一个请求 |
| 00:12–00:26 | The matrix bottleneck | Transformer prefill 的大矩阵乘是关键瓶颈之一 | 数据变为矩阵，横移跟随一次协作计算 |
| 00:26–00:40 | Hardware moved first | NVIDIA、AMD、Intel、Apple 都发展了矩阵计算能力 | 从一个 tile 拉出跨厂商的共同方向 |
| 00:40–00:54 | The APIs follow | Vulkan、Metal 已有路径；D3D 走得更久 | 沿三条 API 路径移动，在 D3D 缺口停下 |
| 00:54–01:06 | LinAlg enters the picture | D3D12 SM 6.10 LinAlg 到来，目前仍是 preview | 琥珀色桥接上，拉开后发现应用端仍有缺口 |
| 01:06–01:16 | Available. But usable? | 转折：发布功能不等于应用已经可用 | 请求停在三个工程检查点，镜头也停住 |
| 01:16–01:32 | Making Dawn more reliable | 五项已合入修复，让路径更可靠 | 跟随数据通过能力校验、编译、生命周期 |
| 01:32–01:46 | Into the inference runtime | ORT 的实验集成和待上游化工作 | 拉出 ORT → Dawn → API → GPU；同模型 A/B |
| 01:46–02:02 | 4.13× at the kernel | RX 9070 XT 原生 D3D12 矩阵乘结果 | 原 demo 取证裁切后重绘数据，同轴条形图，锁定读数 |
| 02:02–02:20 | +82% prefill throughput | RX 7900 XTX 上实际 ORT 模型收益 | 先换硬件身份板，再揭晓精确两臂结果，留 11 秒阅读 |
| 02:20–02:36 | The workload still matters | Decode 未明显改变，完整生成约缩短 8%；短 prompt 会退步 | 概念时间轴说明局部与整体，最后保留 0.93× |
| 02:36–02:48 | Closing the gap. | 软件链路让硬件能力变成推理价值 | 回到同一设备，轻拉，片名定格，音乐收束 |

逐字英文旁白、每镜起始状态／动作／终止状态、运镜理由和衔接都存于 [project.json](project.json)。网页审阅稿 [assets/story-review.html](assets/story-review.html) 与工程时间线由同一份数据生成，避免故事与实际分镜出现两个版本。

## 与上一版相比，具体改变什么

- **叙事**：从 lane/FMA 教学主导，改为应用需求 → 生态演进 → 工程转折 → 已合入贡献／待上游集成 → 模型证据。贡献是故事的动作，不是片尾附录。
- **配色**：弃用旧版荧光绿为主的视觉。墨黑 `#0A1016`、暖白 `#F1EEE7`、青玉 `#64D8CB`；preview 用琥珀 `#DFA861`，回归用低饱和珊瑚 `#D4837C`。每种颜色有固定含义。
- **运镜**：建立空间才推进、跟随计算才横移、揭示系统才拉开。数字镜头锁住；不能每个镜头都套同一种慢缩放。
- **动画**：一个请求在镜头之间保持身份和方向，经过矩阵、硬件、API、Dawn 和 ORT；动作有铺垫、接触和反馈。避免连续静态卡片与满屏术语。
- **旁白**：Azure Andrew，坚定、克制的工程纪录片语气。少报细碎版本号，精确值由画面承载。分句合成后测时，重写或延长拥挤镜头，不吞尾字。
- **BGM**：一个两音动机、五个编配阶段；证据前撤打击乐，结尾解决动机。新编配尚待实现和试听，不能把现有循环配乐当成已经完成的专业配乐。详见 [SOUND-DESIGN.md](SOUND-DESIGN.md)。

## 事实与口径

### 贡献

已于 2026-10-05 通过 Gerrit REST 核实 **五项 Yang Gu 的 Dawn CL 为 MERGED**：330695、331295、333935、335215、335895。分别涉及 Vulkan cooperative-load 编译、Agility 生命周期、显式 subgroup size／能力验证、LinAlg SUPPORTED flags 和 HLSL 配置验证。

CL 326715 的 CMake Agility 支持也是已合入的相关依赖，但作者为 Shao, Jiawei，**不计入我们的五项修复**。它只在证据记录中作为依赖出现。

ORT 的源码改动、AMD 配置和 A/B 开关，在用户提供的报告里仍为实验集成／PR needed。旁白使用 “experimental ... still needs upstreaming”，不声称已经合入 ORT。报告更新于 2026-08-31；没有把该快照擅自解释为对今天 ORT 主线的完整审计。

Microsoft 当前 Agility 页面列出 SM 6.10 LinAlg preview；已核实页面，不只凭旧报告描述“当前仍 preview”。Dawn 设计文档有仍写 D3D 无支持的旧段落，相关实现状态优先依据已合入代码审查记录。Apple 最早硬件年份在资料间存在口径差异，影片不重复 A13/2019 的最早支持断言。

### 两套 AMD 数据，分开揭晓

| 层级 | 原生 kernel | 实际模型 |
|---|---|---|
| GPU | RX 9070 XT | RX 7900 XTX |
| 软件 | Native D3D12 / LinAlg preview | 实验 ORT / WebGPU EP / Dawn / D3D12 |
| 工作负载 | MLP up, M×K×N = 512×8192×3072 | Phi-4-mini-instruct INT4, 512 input + 128 generated tokens |
| 比较 | FP16 FMA → subgroup matrix，f16×f16→f32 | DP4A MatMulNBits → subgroup-matrix MatMulNBits |
| 数值 | 12.41 → 51.27 TFLOP/s，4.13× | 2,781 → 5,056 prefill tok/s，约 1.82× / +82% |
| 测量边界 | GPU dispatch timestamps，warmup + 30 samples，CPU correctness reference | 模型 prefill throughput；graph capture on；同一次四臂复测中的 D3D12 两臂 |
| 时间来源 | 测量日期 2026-09-21 | 报告更新 2026-08-31；该复测确切采集日未单独记载 |
| 限制 | 不代表整个模型提速 4.13× | 完整生成 1,116 → 1,025 ms（约缩短 8.2%）；decode 136 → 137 tok/s；128-input-token prefill 2,470 → 2,302 tok/s（0.93×） |

不混用早期实验中的 2,825→5,141 与后续四臂复测数据，不把 Vulkan INT8 DP4A 与 D3D12 FP16 FMA 基线的倍率当作 API 排名。数据图标明 **recorded results**；本次未重跑 benchmark、安装驱动或改变 GPU 设置。

## 后续制作与验收

1. **故事确认**：当前阶段。用户在 Studio 阅读台词及镜头设计，点击“方案满意，制作画面”。
2. **关键帧确认**：生成设备首尾一致性素材，编译 2D 动画；至少检查开场、API 转折、两张数据镜头，确认文字安全区与颜色语义。此时才评价真实画面。
3. **有声样片**：默认开场 12 秒；推荐在精细调整中选择 API→LinAlg 转折的约 18 秒（00:48 起），更能检查旁白、空间连续性和配乐停顿。最终试片片段由用户选择。
4. **样片确认后全片**：沿用已确认素材，逐镜检查正常速度的动作与可读性、Azure 的技术词和数字发音、字幕实测时间及声音响度。

声音目标约 −14 LUFS、true peak ≤ −1.5 dBTP，编码后复测；ASR、自动检查、实际试听分别记录。对专业度的评价必须来自生成后的画面和有声样片，本稿不虚构审片分数或试听通过记录。
