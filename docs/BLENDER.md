# Blender 预演管线

全片任务另有只读帧观察器，每 5 秒更新已完成帧数、当前镜头和近期速度估算。它只写进度，
不参与画面求值，不改画质、不影响内容指纹。复制来的旧预演帧不会计入本轮；已经返回的
前序镜头按完成计数，当前镜头统计本轮生成的帧。ETA 是画面部分估计，不含最后编码与合成。
可用 `node scripts/watch-blender-progress.mjs <project-id> <running-job-id>` 附加到正在运行的全片任务，
不必重启 Blender。新启动的全片任务会自动带上观察器。

新增能力见 [code-doc-film 接入记录](../research/code-doc-film-integration.md)：归一化多点
机位／目标／焦距、实测语音 cue 编译、显式相机警告、首中尾三帧检查，以及完整镜头缓存。
静帧审查展示 `review-strip-<scene>.jpg` 和 `frame-diagnostics.json`，并非自然表演验收。
角色资产可选带许可与版本的 `pony-v3` / `mother-v3`；原 v1/v2 原型仍可重建。

`camera.keys` 的每项为 `{k, position, target, lens?}`，k 从 0 严格递增到 1。
`camera.cueKeys` 的每项为 `{at, position, target, lens?}`，at 可为秒数或
`cue:0+0.2`、`cueEnd:1`、`end-0.3`。未合成语音的画面预演使用普通起止机位，
有声导出才由真实 cue 编译路径；缺失或非法 cue 不会被偷偷换成估时。
`camera.safety` 支持 `clearance`、`avoidGround`、`framing: full/detail`、`subjects`。
自动修正仍会产生警告。每次缓存命中都会核对 `.blend` 与全部请求 PNG 的哈希。

2026-10-05：Blender 4.5.9 LTS 官方 Windows ZIP 安装并核对官方 SHA-256。
本机实际使用 Cycles / OptiX / NVIDIA GeForce RTX 5080。便携安装与 FFmpeg 位于个人
`AppData/Local/MovieStudio/tools`，执行路径写入 `~/.movie-studio/blender.json`，不随作品共享。
现有 Gemini / Copilot / Azure 连接没有被改写，浏览器没有 executable 或 shell 输入接口。

## 实际验证范围

- 独立几何 fixture：2 秒、12 fps、24 个真实渲染帧、H.264 编码和 FFprobe 检查通过。
- 另一次进程以 24、1、12 乱序取帧，与顺序渲染比较像素。OptiX 存在极少量 8-bit 通道
  1 级差异；验收阈值为最大 1、平均 0.001。记录实际差异，不声称逐字节完全一致。
- `/prepare` 在隔离项目上确实调用 Cycles 并产出分镜；UI 显示真实帧，桌面与手机截图已检查。
- 单元测试覆盖非法数据／脚本／路径拒绝、审批失效、2D 入口拒绝 3D。API 验证未批准时
  阻止制图、样片与全片。测试没有改写用户影片审批。
- 《小马过河》18 张 960×540 预演帧及 18 个可编辑 `.blend` 已生成。故事确认来自用户明确回复；
  画面和样片未批准。没有渲染本片有声样片或全片。
- 旁白／字幕／音轨合成已接 Azure 共用代码，但本片有声路径尚未端到端实测。自然步态、
  听看、ASR、最终材质质量均未验收。当前资产是预演原型，不是已完成角色库。

## 使用

```powershell
npm run blender:setup -- 'C:/absolute/path/to/blender.exe'
npm run blender:verify
npm start
```

打开《小马过河》，故事批准后点击制作画面。精细调整内可编辑受验证的场景 JSON，下载本镜
Blender 工程。已渲染图片是关键帧预览，不标成实时 3D 或动画播放；动画播放使用导出的 MP4。
手工编辑下载的 `.blend` 不会回传工作台；下一次生成仍以 `project.json` 为源。

```powershell
node scripts/blender-stills.mjs little-pony-crosses-river
# 画面批准后，由用户选择样片镜头；以下是第 13 镜的推荐范围。
node scripts/blender-render.mjs little-pony-crosses-river --sample --start 142 --length 12
# 有声样片批准后才可执行全片：
node scripts/blender-fast-render.mjs little-pony-crosses-river
npm test
npm run test:ui
npm run test:blender-ui
```

审批通过现有服务器端接口记录。CLI 也检查故事、画面和样片审批。绝不通过手工伪造 review
字段让渲染通过。`scripts/pony-layout.mjs` 仅初始化这部片的镜头数据，不修改台词或审批。

## 数据与资产

`scene.spatial` 的 version=1。环境和资产只能用白名单 ID；机位为有限坐标和焦距；动作只能
选择 idle/look/probe/walk。未知字段、外部路径、脚本、表达式、重复 actor ID 均拒绝。
大模型可准备数据；只有仓库中的 `scripts/blender/build.py` 是可信构建器。

坐标为米、Z 向上、角色 +X 朝前。小马、母亲、牛的网格与骨骼独立保存；牛有独立的
头部／胸腹形体与角，四足使用共用的约束结构。松鼠当前仅有摆位模型，尚未绑定。
角色毛发、连续皮肤、耳朵表演、布袋次级动作与水面真实接触是后续美术和动作工作。
程序化水纹是预演提示，不是流体模拟。

每个镜头输出 `manifest.json`、`scene.blend`、PNG、`report.json` 和日志，包含 Blender 版本、
实际渲染设备、对象／骨骼数量和构建器 SHA-256。项目快照按指纹隔离；可视数据与构建器变化
使画面／样片失效，普通机位修改保留故事确认。修改后重新审片，旧目录保留。
Blender 配置中经过探测的版本也进入 3D 指纹；执行文件版本与配置不一致时拒绝复用。
每镜额外保存当时的可信构建脚本，当前交付另有 `source/` 源码快照。

没有承诺取消任务、任意外部模型导入、手工 `.blend` 回传、最终毛发布料模拟、
自然语言 3D 单镜重编或完整影片质量。2D 编排与 3D 严格分流，不能把 3D 回退成图片平移。

## GPU 执行与逐帧续渲

全片接口使用 `blender-fast-render.mjs`，从可信构建器保存的不可变 `scene.blend` 执行。
当前加速配置要求 OptiX GPU，启用 GPU OpenImageDenoise、Persistent Data 和无压缩 PNG。
保留工程的采样数、光照、几何、机位、帧率与分辨率。PNG 只是增大中间文件，不降低画质。
没有 OptiX 设备时明确报错，不静默回退 CPU。样片与关键帧仍使用原来的审批路径。

每帧以临时文件写入后原子替换，`fast-frames.json` 保存 SHA-256。续渲验证项目指纹、
源工程哈希、执行器哈希、PNG 内容与尺寸，忽略低分辨率预览、损坏或不匹配的帧。
进度计入所有镜头的已验证帧，ETA 来自最近新渲染帧，排除每镜初始化，且不包含最终编码。
`gpu-execution.json`、每镜 `gpu-profile.json` 与执行器源码快照单独记录执行配置；
创作源文件和真实审批不因执行优化而改写。现有影片的旧帧迁移须有已核验的本地 checkpoint。

执行源码按内容哈希保存在 `executors/<hash>/`，不覆盖旧版本。只修改 Node 端文件写入或
进度逻辑时，核验旧执行源码、完全相同的 Python 渲染器和完整场景身份后可继续复用原始帧。
Windows 文件占用导致的原子替换失败会有限重试；进度文件持续被占用时保留上次进度，
下一次更新继续尝试，不终止渲染。帧与检查点写入错误仍按实际失败处理，不掩盖磁盘故障。

`node scripts/check-blender-fast.mjs little-pony-crosses-river` 在隔离缓存目录渲染三张
1080p 实帧，不覆盖影片中间帧；工程检查不能代替审美、运动与听看验收。

## 动作精修与审阅预览

`scene.spatial.actors[].performance` 是受验证的曲线数据，可分别控制行走、头部朝向、
试蹄、承重与卸袋。`performance.py` 独立于 Blender 求值；固定方向约束避免腿部 IK
在接近伸直时突然翻转。河岸高差由身体高度／倾斜与独立脚目标共同处理。

`scripts/blender/audit-animation.py` 对已烘焙 `.blend` 逐帧计算骨骼到目标误差、
固定落点漂移及乱序取帧差异；不会把这些数值当成皮肤接触或自然表演评价。
已完成的 `motion-review-after.mp4` 会在工作台画面审阅阶段以“无声动作预览”显示，
同时保留全部关键帧；它不能替代有声样片或推进审批。

`build.py` 的接触事件与 `physical-sound.mjs` 共用时间线，合成轻水声、蹄声和河流底噪。
新的混音需要同一项目输出目录中已生成、manifest 匹配的 Blender 场景报告。旧语音片段
缓存可复用；听看和 ASR 仍独立记录。
