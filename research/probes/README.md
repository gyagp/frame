# 隔离的 3D 参考验证

这些脚本是研究验证工具，不会把第三方场景加入 Movie Studio 的生产运行时，不调用任何
配音、语言模型或付费视频 API。浏览器运行的是已检查的固定上游场景，所有网络请求限制在
临时的本机只读服务。

在仓库根目录准备固定版本（若目录已有内容，先核对版本，不要覆盖自己的修改）：

```powershell
git clone https://github.com/bangbuilds/code-doc-film.git .cache/code-doc-film
git -C .cache/code-doc-film checkout d3078a857fbc70f78121ed0f919aa9d15c854e57
npm install --prefix .cache/code-doc-film-probe --ignore-scripts --no-audit --no-fund --save-exact three@0.181.2
node research/probes/code-doc-film.mjs
```

需要本仓库已安装的 Playwright、Edge 和本机 FFmpeg。脚本检查上游 commit，建立临时 loopback
服务，渲染船队的首／中／尾帧，验证一次乱序取帧，输出 6 秒无声 MP4 与实际 GPU／媒体报告。
服务和浏览器在结束时关闭。产物位于被 Git 忽略的 `outputs/three-feasibility/`。

本次已经运行的检查记录见 [probe.json](../code-doc-film-probe.json)，结论及未验证部分见
[研究报告](../code-doc-film.md)。上游场景及模型几何版权属于 bangbuilds（MIT），Three.js 为
MIT；输出目录附上游完整许可，片段上也标注来源。本脚本不把测试片段算作原创影片。
