# code-doc-film → Movie Studio：实际接入记录

2026-10-05 再次核对 https://github.com/bangbuilds/code-doc-film ，HEAD 仍为
`d3078a857fbc70f78121ed0f919aa9d15c854e57`。通过 GitHub API、git 固定克隆读取 README、
SKILL.md、film-json / scenes / audio / qa / delivery 参考文档，以及 kit.js、film.py 的相关实现。
作者：bangbuilds；MIT 许可保存在 `research/licenses/code-doc-film-MIT.txt`。

此前 Three.js 船队探针的数据保留为历史实测，没有在本轮重新测量，也没有当作当前 Blender
性能。没有安装上游全局 skill、HyperFrames、edge-tts 或其任意 shell 配音入口。

## 已实现并连接到生产入口的机制

| 上游方法与来源 | Studio 实现 | 验证边界 |
|---|---|---|
| `template/film/kit.js` 的归一化 track 和 camera guard | `camera.keys` 支持 2–16 个归一化机位／目标／焦距；Blender 在每个帧号重新采样。地面／水面净空、地形视线、完整主体出框写入诊断；只有显式 `avoidGround:true` 才抬高，并记录修正前后坐标。 | 独立 fixture 实渲染多点路径和故意错误机位；不声称通用场景碰撞避免。特写允许显式 `framing:detail`。 |
| `film.py resolve()` 与 `references/film-json.md` 的旁白 cue 时序 | 有限 `cue:N` / `cueEnd:N` / `end` 加减偏移语法；从现有 Azure 实测 cue 编译 camera.cueKeys 为归一化路径。缺失 cue、越界、乱序均报错，绝不 eval。 | 合成 cue 单元测试通过；正式有声导出已调用编译器，但未越过影片审批去生成本片配音。配音前 stills 使用起止机位预演，不能证明音画时机。 |
| `film.py qa --frames` 的首中尾与亮度检查 | 每镜真实渲染三个时刻，输出 `review-strip-<id>.jpg`、像素统计、相机诊断；UI 可打开三帧条。 | 黑／白／平色统计没有判断“写实”“自然表演”的能力；静帧不能替代播放与听看。 |
| 场景／资产和影片内容分离，局部重复工作缓存 | 固定资产 ID；镜头几何、材质、相机与骨骼保存为 `.blend`；`execution.json` 绑定场景、代码、资产、分辨率和 Blender 版本，并核对图像与工程哈希后复用已完成镜头。 | 当前缓存复用同一输出目录的完整请求；不承诺跨版本共享世界或中断镜头内部逐帧恢复。 |

以上为原生 Blender / Node 实现，借鉴方法和有限表达式语法；没有执行上游任意场景 JavaScript。
Azure 仍为旁白入口，个人凭据保持在用户目录。故事 → 关键帧 → 有声样片 → 全片审批不变。

## 写实资产与参考能力的区别

上游 README 明确说角色是低模剪影、不擅长脸部／表演／人物特写。其代码场景无法自动给
《小马过河》提供实拍级动物，因此本轮另建有来源的角色资产条目：jjmoser 的 Horse lowpoly，
CC-BY-3.0，来源 https://opengameart.org/content/horse-lowpoly 。源 ZIP SHA-256、原作者、
许可证、轴向、尺寸、转换步骤与限制均在 `assets/3d/jjmoser-horse/ASSET.json`。

仅从原 `.blend` 读取网格与 UV，不载入其场景执行逻辑；生成纯 JSON 几何和固定纹理。
引擎采用自己的试验绑定、材质和角色道具，并将纹理打包到输出工程。资产本身仍是低分辨率
游戏模型：它改善了马的轮廓和脸部，不等同于已经完成实拍级皮毛、幼马体态或自然表演。

《小马过河》的故事和台词没有重写；视觉修订与新资产在项目 JSON 记录，旧渲染保留。
素材版权归属与工程方法归属分别记录。没有使用 Sketchfab 受限下载、付费角色模型或视频转绘。
