import { productionUnavailable } from "./production.mjs";
// Presentation-only workflow: the server remains the authority for approvals.
export function workflowView({ project, review = {}, outputs = [], job }) {
  const output = outputs.find((x) => x.current);
  const has = (name) => !!output?.files.includes(name);
  const storyReady =
    project.scenes.some(
      (s) => s.narration.trim() || s.direction || s.composition || s.image,
    ) || project.scenes.filter((s) => s.body.trim()).length > 1;
  let phase = !storyReady
    ? "draft"
    : !review.storyApproved
      ? "story"
      : !has("storyboard.jpg") && !review.framesApproved
        ? "prepare"
        : !review.framesApproved
          ? "frames"
          : !has("sample.mp4") && !review.sampleApproved
            ? "sample"
            : !review.sampleApproved
              ? "sample-review"
              : has("film.mp4")
                ? "complete"
                : "finish";
  const copy = {
    draft: [
      0,
      "先把想法变成创作方案",
      "导演会编排故事、镜头和旁白。你先看方案，不会直接制作全片。",
      "生成创作方案",
      "plan",
    ],
    story: [
      0,
      "先看看，这是不是你想讲的故事",
      "看下面的镜头安排和旁白。满意后，工作室会自动准备画面。",
      "方案满意，制作画面",
      "approve-story",
    ],
    prepare: [
      1,
      "故事已确认，接下来准备画面",
      "工作室会完成美术、运镜和动画编排，并检查关键画面。",
      "继续制作画面",
      "prepare",
    ],
    frames: [
      1,
      "看看画面，确认你喜欢的感觉",
      "满意后先做一小段，旁白、音乐和动画会一起加入。",
      "画面满意，做一段试看片",
      "approve-frames",
    ],
    sample: [
      2,
      "画面已确认，先看一段有声样片",
      "默认从开场制作约 12 秒。先判断节奏和声音，再决定整部电影。",
      "制作有声试看片",
      "sample",
    ],
    "sample-review": [
      2,
      "先看这小段，再决定整部电影",
      "播放下方样片，听听旁白和音乐，看看动画与节奏。满意后才制作全片。",
      "样片满意，完成全片",
      "approve-sample",
    ],
    finish: [
      3,
      "方向已确认，最后一步交给工作室",
      "沿用你确认的素材和声音设置，完成剩余镜头与成片。",
      "继续完成全片",
      "render",
    ],
    complete: [
      4,
      "你的电影做好了",
      "可以直接播放和下载。想继续打磨时，打开「精细调整」。",
      "下载电影",
      "download",
    ],
  }[phase];
  const view = {
    phase,
    step: copy[0],
    title: copy[1],
    description: copy[2],
    label: copy[3],
    action: copy[4],
    output,
    media:
      has("film.mp4") && review.sampleApproved
        ? "film.mp4"
        : has("sample.mp4") && review.framesApproved
          ? "sample.mp4"
          : null,
  };
  if (
    project.production?.backend === "blender" &&
    ["frames", "sample"].includes(phase)
  ) {
    view.title = "先检查角色与空间预演";
    view.description =
      "这是实际 Blender 渲染的制作原型。检查角色尺度、构图与动作接触；角色表面和自然表演仍需精修，不能视为成片质量验收。";
    if (!view.media && has("motion-review-after.mp4")) {
      view.media = "motion-review-after.mp4";
      view.visualPreview = true;
      view.description =
        "先播放原速无声动作预览，再检查下方关键帧。确认画面后制作中文有声样片。";
    }
  }
  if (job?.projectId === project.id && job.status === "running")
    return {
      ...view,
      busy: true,
      title: "工作室正在制作，请稍候",
      description: job.message || "完成后会自动带你到下一步，已有素材会保留。",
      label: "正在制作…",
      action: null,
    };
  const unavailable = productionUnavailable(project);
  if (unavailable) {
    if (!review.storyApproved)
      return {
        ...view,
        phase: "story",
        step: 0,
        title: "先看看，这是不是你想讲的故事",
        description:
          "这是 3D 电影的故事与分镜稿。制作功能尚待接入，当前可审阅和确认方案。",
        label: "确认故事与分镜",
        action: "approve-story",
        media: null,
      };
    return {
      ...view,
      phase: "production-pending",
      step: 1,
      title: "故事已确认，3D 制作尚待接入",
      description: unavailable,
      label: "3D 制作暂未就绪",
      action: null,
      disabled: true,
      media: null,
    };
  }
  const obsoleteFailure =
    job?.status === "failed" &&
    ((job.projectHash && job.projectHash !== output?.key) ||
      (["prepare", "sample", "render"].includes(job.type) &&
        !review.storyApproved) ||
      (["sample", "render"].includes(job.type) && !review.framesApproved) ||
      (job.type === "render" && !review.sampleApproved));
  if (
    job?.projectId === project.id &&
    job.status === "failed" &&
    !obsoleteFailure &&
    (phase !== "complete" || job.type === "render")
  )
    return {
      ...view,
      failed: true,
      title: "这一步暂时没有完成",
      description: friendlyFailure(job.message),
      label: "重试这一步",
      action: "retry",
    };
  return view;
}
export function friendlyFailure(message = "") {
  if (/429|quota|rate.limit|额度|限流/i.test(message))
    return "服务暂时达到额度或调用频率限制。已经生成的素材都保留着，稍后可以重试。";
  if (/401|403|key|credential|auth|密钥|登录|权限/i.test(message))
    return "连接信息或账号权限需要检查。打开「连接设置」确认后，再继续这一步。";
  if (/too much narration|旁白.*长/i.test(message))
    return "这一镜头的旁白放不下。缩短旁白或增加一点时长后，再试一次。";
  if (/timeout|等待超时/i.test(message))
    return "这一镜头的创作等待超时。已完成的镜头和素材已保存，点击重试可从尚未完成的镜头继续。";
  if (/fetch failed|network|ECONN|连接/i.test(message))
    return "服务连接暂时中断。已有素材已保留，检查网络后可以继续。";
  return "已完成的素材和作品都已保留。可以重试，或展开错误详情查看原因。";
}
export function briefSuggestions(text) {
  const result = {};
  if (/英文|英语|\benglish\b/i.test(text)) result.language = "en";
  else if (/中文|普通话|\bchinese\b/i.test(text)) result.language = "zh";
  if (/竖屏|9\s*:\s*16|\bvertical\b/i.test(text)) result.aspect = "9:16";
  else if (/横屏|16\s*:\s*9|\blandscape\b/i.test(text)) result.aspect = "16:9";
  if (/2\s*[-–到至]\s*3\s*(分钟|minutes?)/i.test(text)) result.duration = 150;
  else {
    const m = text.match(/(\d+(?:\.\d+)?)\s*(秒|seconds?|分钟|minutes?)/i);
    if (m) {
      const seconds = Number(m[1]) * (/分钟|minutes?/i.test(m[2]) ? 60 : 1);
      if (seconds >= 30 && seconds <= 180)
        result.duration = Math.round(seconds);
    }
  }
  return result;
}
