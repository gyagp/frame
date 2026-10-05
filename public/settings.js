export function mountConnections({ api, onSaved }) {
  const dialog = document.createElement("dialog");
  dialog.id = "connections-dialog";
  dialog.innerHTML = `<form id="connections-form"><div class="dialog-header"><span class="overline">YOUR STUDIO, YOUR ACCOUNTS</span><button type="button" id="connections-close" class="icon-button" aria-label="关闭连接设置">×</button></div><h2>连接你的创作工具</h2><p>每个人使用自己的账号。连接信息留在本机，不随作品分享。</p>
  <section class="connection-card"><h3><span>01</span> 导演与动画编排</h3><label for="director-provider">使用哪位助手？</label><select id="director-provider"><option value="gemini">Google Gemini</option><option value="copilot">GitHub Copilot</option></select><div data-connection="gemini"><label for="director-model">导演模型</label><input id="director-model" list="director-models" placeholder="gemini-3.8-flash"><small>与下方 Nano Banana 共用 Google API Key。</small></div><div data-connection="copilot" hidden><p>可使用本机已登录的 Copilot / GitHub 账号，也可填写自己的 Token。</p><label for="copilot-model">Copilot 模型</label><select id="copilot-model"><option value="auto">Auto · 自动选择</option></select><div class="connection-test"><button type="button" id="copilot-refresh" class="button quiet">刷新可用模型</button><span id="copilot-model-status" role="status">从你的 Copilot 账号读取模型列表。</span></div><label for="copilot-token">GitHub Token（已有登录可留空）</label><input id="copilot-token" type="password" autocomplete="new-password"><label class="check-label"><input id="copilot-clear" type="checkbox">清除本机保存的 Token</label><small>需要账号具备 Copilot 使用权限。可先通过 Copilot CLI 或 GitHub CLI 登录。</small></div><datalist id="director-models"></datalist><div class="connection-test"><button type="button" data-test-connection="director" class="button quiet">检查导演连接</button><span id="director-result" role="status"></span></div></section>
  <section class="connection-card"><h3><span>02</span> 图片与美术素材</h3><label for="image-provider">图片来源</label><select id="image-provider"><option value="nano-banana">Nano Banana / Google</option><option value="uploads">使用我上传的素材与代码画面</option></select><label for="google-key">Google API Key</label><input id="google-key" type="password" autocomplete="new-password"><label class="check-label"><input id="google-clear" type="checkbox">清除本机保存的 Google 密钥</label><div id="image-model-settings"><label for="image-model-setting">图片模型</label><input id="image-model-setting" list="image-models" placeholder="gemini-3.1-flash-image"></div><datalist id="image-models"></datalist><div class="connection-test"><button type="button" data-test-connection="image" class="button quiet">检查图片连接</button><span id="image-result" role="status"></span></div></section>
  <section class="connection-card"><h3><span>03</span> 配音</h3><label for="speech-provider">语音服务</label><select id="speech-provider"><option value="azure">Azure Speech</option><option value="local">Windows 本地语音（离线）</option></select><div data-connection="azure"><div class="two-fields"><div><label for="speech-region">Azure 服务区域</label><input id="speech-region" placeholder="japaneast"></div><div><label for="speech-key">Speech Key</label><input id="speech-key" type="password" autocomplete="new-password"></div></div><label class="check-label"><input id="speech-clear" type="checkbox">清除本机保存的 Speech 密钥</label><div class="two-fields"><div><label for="speech-english">默认英文声线</label><select id="speech-english"><option value="en-US-AndrewMultilingualNeural">Andrew · 男声</option><option value="en-US-AvaMultilingualNeural">Ava · 女声</option></select></div><div><label for="speech-chinese">默认中文声线</label><select id="speech-chinese"><option value="zh-CN-XiaoxiaoNeural">晓晓 · 女声</option><option value="zh-CN-YunxiNeural">云希 · 男声</option></select></div></div><details class="advanced-create"><summary>通过 Azure CLI 读取密钥 <span>可选</span></summary><p>已经用 az 登录的用户可填资源信息，省去手动复制密钥。</p><label for="speech-subscription">Subscription ID</label><input id="speech-subscription"><label for="speech-group">Resource group</label><input id="speech-group"><label for="speech-resource">Resource name</label><input id="speech-resource"></details></div><div class="connection-test"><button type="button" data-test-connection="speech" class="button quiet">检查配音连接</button><span id="speech-result" role="status"></span></div></section>
  <p class="connection-privacy">已保存的密钥不会回显；留空会保留原有值。设置只影响接下来的制作，已有成片会保留。</p><div id="connections-status" role="status"></div><button id="connections-save" class="button primary wide" type="submit">保存连接设置</button></form>`;
  document.body.append(dialog);
  const settingsBody = document.createElement("div");
  settingsBody.className = "connection-body";
  const firstCard = dialog.querySelector(".connection-card");
  firstCard.before(settingsBody);
  for (const section of [
    ...dialog.querySelectorAll(".connection-card"),
    dialog.querySelector(".connection-privacy"),
  ])
    settingsBody.append(section);
  const $ = (id) => document.getElementById(id);
  let busy = false;
  function setCopilotModels(
    models,
    selected = $("copilot-model").value || "auto",
  ) {
    const choices = models.some((m) => m.id === "auto")
      ? models
      : [{ id: "auto", name: "Auto · 自动选择" }, ...models];
    const options = choices.map((m) => new Option(m.name || m.id, m.id));
    if (!choices.some((m) => m.id === selected))
      options.push(new Option(selected + " · 当前设置，待验证", selected));
    $("copilot-model").replaceChildren(...options);
    $("copilot-model").value = selected;
  }
  function showFields() {
    dialog.querySelector('[data-connection="gemini"]').hidden =
      $("director-provider").value !== "gemini";
    dialog.querySelector('[data-connection="copilot"]').hidden =
      $("director-provider").value !== "copilot";
    dialog.querySelector('[data-connection="azure"]').hidden =
      $("speech-provider").value !== "azure";
    $("image-model-settings").hidden = $("image-provider").value === "uploads";
  }
  for (const id of ["director-provider", "image-provider", "speech-provider"])
    $(id).onchange = () => {
      showFields();
      if (id === "director-provider" && $(id).value === "copilot")
        void checkConnection("director");
    };
  function fill(s) {
    $("director-provider").value = s.director.provider;
    $("director-model").value = s.director.model;
    if (
      ![...$("copilot-model").options].some((o) => o.value === s.copilot.model)
    )
      $("copilot-model").add(
        new Option(s.copilot.model + " · 当前设置", s.copilot.model),
      );
    $("copilot-model").value = s.copilot.model;
    $("image-provider").value = s.google.imageMode;
    $("image-model-setting").value = s.google.imageModel;
    $("speech-provider").value = s.speech.provider;
    for (const [id, key] of [
      ["speech-region", "region"],
      ["speech-subscription", "subscription"],
      ["speech-group", "resourceGroup"],
      ["speech-resource", "resourceName"],
      ["speech-english", "englishVoice"],
      ["speech-chinese", "chineseVoice"],
    ])
      $(id).value = s.speech[key];
    for (const [id, configured] of [
      ["google-key", s.google.apiKeyConfigured],
      ["copilot-token", s.copilot.tokenConfigured],
      ["speech-key", s.speech.keyConfigured],
    ]) {
      $(id).value = "";
      $(id).placeholder = configured ? "已配置，留空保留" : "填写你自己的密钥";
    }
    for (const id of ["google-clear", "copilot-clear", "speech-clear"])
      $(id).checked = false;
    if (
      !s.speech.keyConfigured &&
      s.speech.subscription &&
      s.speech.resourceGroup &&
      s.speech.resourceName
    )
      $("speech-key").placeholder = "通过 Azure CLI 读取，可留空";
    showFields();
  }
  function values() {
    return {
      director: {
        provider: $("director-provider").value,
        model: $("director-model").value,
      },
      google: {
        apiKey: $("google-key").value,
        imageMode: $("image-provider").value,
        imageModel: $("image-model-setting").value,
      },
      copilot: {
        token: $("copilot-token").value,
        model: $("copilot-model").value,
      },
      speech: {
        provider: $("speech-provider").value,
        key: $("speech-key").value,
        region: $("speech-region").value,
        subscription: $("speech-subscription").value,
        resourceGroup: $("speech-group").value,
        resourceName: $("speech-resource").value,
        englishVoice: $("speech-english").value,
        chineseVoice: $("speech-chinese").value,
      },
      clearSecrets: [
        ...($("google-clear").checked ? ["google.apiKey"] : []),
        ...($("copilot-clear").checked ? ["copilot.token"] : []),
        ...($("speech-clear").checked ? ["speech.key"] : []),
      ],
    };
  }
  function lock(locked) {
    busy = locked;
    dialog
      .querySelectorAll("button:not(#connections-close)")
      .forEach((b) => (b.disabled = locked));
  }
  async function save() {
    const s = await api("/api/settings", "PUT", values());
    fill(s);
    await onSaved();
    $("connections-status").textContent =
      "设置已保存，接下来的制作会使用这些连接。";
    return s;
  }
  $("connections-close").onclick = () => dialog.close();
  $("connections-form").onsubmit = async (e) => {
    e.preventDefault();
    if (busy) return;
    lock(true);
    try {
      await save();
    } catch (e) {
      $("connections-status").textContent = e.message;
    } finally {
      lock(false);
    }
  };
  async function checkConnection(kind) {
    if (busy) return;
    const provider = $("director-provider").value;
    const copilot = kind === "director" && provider === "copilot";
    lock(true);
    $(kind + "-result").textContent = "正在检查…";
    if (copilot)
      $("copilot-model-status").textContent = "正在读取账号可用模型…";
    try {
      const result = await api("/api/settings/test", "POST", {
        kind,
        settings: values(),
      });
      $("connections-status").textContent =
        "检查不会覆盖现有连接。满意后点击「保存连接设置」。";
      $(kind + "-result").textContent = result.message;
      $(kind + "-result").className = result.ok
        ? "connection-ok"
        : "connection-error";
      if (result.models && copilot) {
        setCopilotModels(result.models);
        $("copilot-model-status").textContent =
          `已读取 ${result.models.length} 个模型，选择后保存即可。`;
      } else if (result.models) {
        const list = $(kind === "image" ? "image-models" : "director-models");
        list.replaceChildren(
          ...result.models.map((m) => new Option(m.name || m.id, m.id)),
        );
      }
      if (copilot && !result.ok)
        $("copilot-model-status").textContent = result.message;
    } catch (e) {
      $(kind + "-result").textContent = e.message;
      $(kind + "-result").className = "connection-error";
      if (copilot) $("copilot-model-status").textContent = e.message;
    } finally {
      lock(false);
    }
  }
  dialog.querySelectorAll("[data-test-connection]").forEach((button) => {
    button.onclick = () => checkConnection(button.dataset.testConnection);
  });
  $("copilot-refresh").onclick = () => checkConnection("director");
  $("copilot-model").onchange = () => {
    $("director-result").textContent = "模型已选择，保存后用于下一次创作。";
    $("director-result").className = "";
  };
  $("copilot-token").oninput = () => {
    $("copilot-model-status").textContent = "凭据已修改，请刷新可用模型。";
  };
  return async function openConnections() {
    try {
      fill(await api("/api/settings"));
      $("connections-status").textContent = "";
      dialog.showModal();
      if ($("director-provider").value === "copilot")
        void checkConnection("director");
    } catch (e) {
      $("connections-status").textContent = e.message;
      dialog.showModal();
    }
  };
}
