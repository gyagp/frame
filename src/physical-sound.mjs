import { timeline } from "./model.mjs";

// Events originate in the same baked foot contacts used for the water ripples.
export function physicalEvents(project, reports) {
  const events = [];
  for (const scene of timeline(project)) {
    const report = reports[scene.id];
    if (!report) throw new Error(`Missing contact report: ${scene.id}`);
    const seen = new Set();
    const add = (event) => {
      if (
        !Number.isFinite(event.time) ||
        event.time < 0 ||
        event.time >= scene.duration ||
        !["water", "hoof"].includes(event.kind) ||
        !scene.spatial.actors.some((a) => a.id === event.actorId)
      )
        throw new Error(`Invalid physical sound event: ${scene.id}`);
      const key = `${event.actorId}/${event.kind}/${Math.round(event.time * 10)}`;
      if (seen.has(key)) return;
      seen.add(key);
      events.push({
        ...event,
        sceneId: scene.id,
        time: scene.start + event.time,
        gain: event.actorId === "pony" ? 0.026 : 0.014,
      });
    };
    for (const [actorId, contact] of Object.entries(report.contacts ?? {}))
      add({ ...contact, actorId, kind: "water" });
    for (const event of report.contactEvents ?? []) add(event);
  }
  return events.sort((a, b) => a.time - b.time);
}

export function addPhysicalSound(mix, rate, project, events) {
  const shots = timeline(project);
  let shotIndex = 0,
    seed = 3171,
    low = 0,
    slow = 0;
  const random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 2147483648 - 1;
  };
  for (let i = 0; i < mix.length; i++) {
    const time = i / rate;
    while (shotIndex < shots.length - 1 && time >= shots[shotIndex].end)
      shotIndex++;
    const shot = shots[shotIndex];
    low += 0.16 * (random() - low);
    slow += 0.009 * (low - slow);
    const water = shot.spatial.environment.startsWith("river");
    const fade = Math.min(
      1,
      Math.max(0, time / 1.5),
      Math.max(0, (mix.length / rate - time) / 1.5),
    );
    mix[i] +=
      (water ? 0.009 : 0.0025) *
      (low - slow) *
      fade *
      (0.85 + 0.15 * Math.sin(time * 0.73));
  }
  for (const event of events) {
    const offset = Math.round(event.time * rate),
      length = event.kind === "water" ? 0.3 : 0.16;
    let noise = 0;
    for (let i = 0; i < length * rate && offset + i < mix.length; i++) {
      const t = i / rate;
      noise += 0.3 * (random() - noise);
      const signal =
        event.kind === "water"
          ? 0.42 *
              Math.sin(2 * Math.PI * (420 * t - 330 * t * t)) *
              Math.exp(-t * 24) +
            noise * Math.exp(-t * 13)
          : (0.8 * Math.sin(2 * Math.PI * 105 * t) + 0.3 * noise) *
            Math.exp(-t * 38);
      mix[offset + i] += event.gain * signal;
    }
  }
}
