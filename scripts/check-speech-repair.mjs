// A code-only audio repair may reuse genuine approvals only when the approved
// sample is reproduced byte-for-byte. Never edits the user's review fields.
import assert from "node:assert/strict";
import path from "node:path";
import { readFile,readdir,mkdir,copyFile,cp } from "node:fs/promises";
import { createHash } from "node:crypto";
import { ROOT,loadProject,hashProject,readJSON,writeJSON,run,reviewState } from "./lib.mjs";
import { buildAudio } from "./audio.mjs";
import { timeline } from "../src/model.mjs";
import { narrationPhrases,validateSpeechWav } from "../src/speech-audio.mjs";

const baseline=await readJSON(process.argv[2]);
const p=await loadProject(baseline.project.id),before=baseline.approvedHash,after=hashProject(p);
assert.match(before,/^[a-f0-9]{16}$/);
assert.equal(p.review.frames,before);assert.equal(p.review.sample,before);
const sha=b=>createHash("sha256").update(b).digest("hex");
const content=p=>JSON.stringify({...p,review:undefined});
assert.equal(content(p),content(baseline.project),"Creative inputs changed");
for(const [file,digest]of Object.entries(baseline.visualFiles))assert.equal(sha(await readFile(path.join(ROOT,file))),digest,`Visual source changed: ${file}`);
const old=path.join(ROOT,"outputs",p.id,before),out=path.join(ROOT,"outputs",p.id,after);
await mkdir(out,{recursive:true});
assert.equal(sha(await readFile(path.join(old,"sample.mp4"))),baseline.sampleSha);
assert.equal(sha(await readFile(path.join(old,"sample-picture.mp4"))),baseline.pictureSha);
const {start,duration:length}=baseline.range;
const sampleProject={...p,scenes:timeline(p).map(({start:s,end,...scene})=>({...scene,narration:end>start&&s<start+length?scene.narration:""}))};
let networkRequests=0;
globalThis.fetch=async()=>{networkRequests++;throw new Error("Repair verification must reuse cached speech; unexpected network request");};
const sampleAudio=await buildAudio(sampleProject,path.join(out,"sample-audio"));
const oldAudio=await readJSON(path.join(old,"sample-audio","audio.json"));
assert.deepEqual(sampleAudio.cues,oldAudio.cues);
assert.deepEqual(sampleAudio.timings,oldAudio.timings);
assert.equal(sha(await readFile(path.join(out,"sample-audio","soundtrack.wav"))),baseline.audioSha,"Approved soundtrack changed");
await copyFile(path.join(old,"sample-picture.mp4"),path.join(out,"sample-picture.mp4"));
await run("ffmpeg",["-y","-v","error","-i",path.join(out,"sample-picture.mp4"),"-ss",String(start),"-i",path.join(out,"sample-audio","soundtrack.wav"),"-map","0:v","-map","1:a","-c:v","copy","-c:a","aac","-b:a","192k","-t",String(length),"-movflags","+faststart",path.join(out,"sample.mp4")]);
const sampleAfter=sha(await readFile(path.join(out,"sample.mp4")));
assert.equal(sampleAfter,baseline.sampleSha,"Approved sample was not reproduced exactly");

// Exercise every actual line that failed previously, using existing valid WAVs.
const fullAudio=await buildAudio(p,out);
const phrases=p.scenes.flatMap(s=>narrationPhrases(s.narration));
const speechFiles=(await readdir(path.join(out,"speech"))).filter(f=>f.endsWith(".wav"));
assert.equal(speechFiles.length,phrases.length);
for(const file of speechFiles)validateSpeechWav(await readFile(path.join(out,"speech",file)));
assert.equal(networkRequests,0);
assert.equal(content(await loadProject(p.id)),content(p),"Project changed during verification");
for(const file of await readdir(old)){
  if(/^(frame-[a-z0-9-]+\.png|review-strip-[a-z0-9-]+\.jpg|storyboard.jpg|look-review.jpg|sample-poster.jpg|frame-diagnostics.json|manual-review.json|asset-credits.json)$/.test(file))await copyFile(path.join(old,file),path.join(out,file));
}
await cp(path.join(old,"blender"),path.join(out,"blender"),{recursive:true});
await writeJSON(path.join(out,"project.json"),p);
await writeJSON(path.join(out,"sample-range.json"),{...baseline.range,projectHash:after});
await writeJSON(path.join(out,"quality.json"),{...await readJSON(path.join(old,"quality.json")),projectHash:after});
const visualDigest=sha(JSON.stringify(baseline.visualFiles));
const proof={version:1,projectId:p.id,approvedHash:before,currentHash:after,inputBefore:sha(content(baseline.project)),inputAfter:sha(content(p)),visualBefore:visualDigest,visualAfter:visualDigest,sampleBefore:baseline.sampleSha,sampleAfter,verifiedAt:new Date().toISOString(),reason:"Punctuation-only TTS fix. Rebuilt approved Chinese sample with identical cues, timing, soundtrack and MP4; visual source digests and creative inputs unchanged. No approval fields edited.",cachedVoiceClips:speechFiles.length,networkRequests};
await writeJSON(path.join(ROOT,".studio-local","approval-equivalence",`${p.id}-${after}.json`),proof);
await writeJSON(path.join(out,"speech-repair.json"),{...proof,fullFilmAudio:{voice:fullAudio.voice,lines:speechFiles.length,cues:fullAudio.cues.length,asr:"not performed",listening:"not performed"}});
console.log(JSON.stringify({before,after,approvedSampleByteIdentical:true,voiceClips:speechFiles.length,networkRequests,review:reviewState(p)},null,2));
