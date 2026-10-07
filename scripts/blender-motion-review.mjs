// Silent, original-speed visual review before keyframe approval. This is not a
// voiced sample or a full-film export and never writes either approval artifact.
import path from 'node:path';
import {mkdir,writeFile} from 'node:fs/promises';
import {createCanvas,loadImage} from '@napi-rs/canvas';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {renderContext,reviewState,ROOT,readJSON,writeJSON,graphics,run,hashProject} from './lib.mjs';
import {prepareCachedShot,renderCachedShot,frameName} from '../src/blender-fast.mjs';
import {mediaExecutable} from '../src/media-tools.mjs';
import {captionTextForSpeech} from '../src/captions.mjs';
import {narrationPhrases} from '../src/speech-audio.mjs';
import {timeline} from '../src/model.mjs';

const {p,out}=await renderContext({backend:'blender'});
if (!reviewState(p).storyApproved) throw new Error('Story approval required');
const baseline=path.join(ROOT,'outputs',p.id,'35734ca9c433bf92');
const prior=await readJSON(path.join(baseline,'project.json'));
if (p.scenes.some((s,i)=>s.narration!==prior.scenes[i]?.narration || s.duration!==prior.scenes[i]?.duration))
  throw new Error('This comparison requires identical narration and scene timing');
const audio=await readJSON(path.join(baseline,'audio.json'));
const captions=audio.cues.map(c=>({...c}));
for (const scene of p.scenes) {
  const text=captionTextForSpeech(scene.narration,narrationPhrases(scene.narration));
  captions.filter(c=>c.sceneId===scene.id).forEach((c,i)=>c.text=text[i]);
}
const stamp=t=>new Date(Math.round(t*1000)).toISOString().slice(11,23).replace('.',',');
await writeFile(path.join(out,'subtitles-corrected.srt'),captions.map((c,i)=>`${i+1}\n${stamp(c.start)} --> ${stamp(c.end)}\n${c.text}\n`).join('\n'));
await writeJSON(path.join(out,'caption-review.json'),{projectHash:hashProject(p),cues:captions,voiceRegenerated:false});
const segments=process.argv.includes('--polish')
  ? [{id:'shot-02',start:3,length:3},{id:'shot-13',start:3,length:5},{id:'shot-14',start:3,length:4},{id:'shot-17',start:1,length:4}]
  : [{id:'shot-02',start:4,length:4},{id:'shot-13',start:1.5,length:7},{id:'shot-14',start:2,length:5}];
const frames=[];
for(const segment of segments) {
  const scene=timeline(p).find(s=>s.id===segment.id);
  const plan=await prepareCachedShot({scene,out,width:p.width,height:p.height,fps:p.fps,projectHash:hashProject(p)});
  // Existing final-resolution scene stays immutable; review PNGs are isolated.
  plan.identity={...plan.identity,width:960,height:540};
  plan.folder=path.join(out,'motion-review-frames',scene.id);
  plan.frameHashes={};
  const first=Math.round(segment.start*p.fps)+1;
  plan.missing=Array.from({length:Math.round(segment.length*p.fps)},(_,i)=>first+i);
  await renderCachedShot(plan,async e=>{if(e.frame%24===0) console.log(`${scene.id} frame ${e.frame}`);});
  for(const n of plan.missing) frames.push({after:path.join(plan.folder,frameName(n)),before:path.join(baseline,'blender',scene.id,frameName(n)),time:scene.start+(n-1)/p.fps,sceneId:scene.id});
}
await graphics(p);
const canvas=createCanvas(1920,580),ctx=canvas.getContext('2d');
const child=spawn(mediaExecutable('ffmpeg'),['-y','-v','error','-f','rawvideo','-pixel_format','rgba','-video_size','1920x580','-framerate',String(p.fps),'-i','pipe:0','-an','-c:v','libx264','-crf','19','-pix_fmt','yuv420p','-movflags','+faststart',path.join(out,'motion-review.mp4')],{windowsHide:true});
let failure='',pipeError;child.stderr.on('data',d=>failure+=d);child.stdin.on('error',e=>pipeError=e);
const finished=once(child,'close');
function caption(text,x) {
  if(!text)return;ctx.font="23px 'Microsoft YaHei'";
  const lines=[];let line='';
  for(const ch of text) {if(ctx.measureText(line+ch).width>790 && !/[”’，。！？]/.test(ch)){lines.push(line);line='';}line+=ch;}
  if(line)lines.push(line);
  const h=lines.length*30+18,y=556-h;
  ctx.fillStyle='#13221de6';ctx.fillRect(x+54,y,852,h);ctx.fillStyle='#fff9e9';ctx.textAlign='center';ctx.textBaseline='top';
  lines.forEach((line,i)=>ctx.fillText(line,x+480,y+9+i*30));
}
for(const [i,f] of frames.entries()) {
  if(pipeError)throw pipeError;
  ctx.fillStyle='#152019';ctx.fillRect(0,0,1920,580);
  ctx.drawImage(await loadImage(f.before),0,40,960,540);ctx.drawImage(await loadImage(f.after),960,40,960,540);
  ctx.font="22px 'Microsoft YaHei'";ctx.textAlign='left';ctx.textBaseline='top';ctx.fillStyle='#f8f4e9';
  ctx.fillText('旧版 · '+f.sceneId,20,9);ctx.fillText('动作修订 · 原速 / 无声 · 待画面审阅',980,9);
  caption(audio.cues.find(c=>f.time>=c.start&&f.time<c.end)?.text,0);
  caption(captions.find(c=>f.time>=c.start&&f.time<c.end)?.text,960);
  if(i===48)await writeFile(path.join(out,'caption-comparison.jpg'),await canvas.encode('jpeg',92));
  if(!child.stdin.write(canvas.data()))await once(child.stdin,'drain');
}
child.stdin.end();if((await finished)[0]!==0)throw new Error(failure);
await run('ffmpeg',['-y','-v','error','-i',path.join(out,'motion-review.mp4'),'-vf','crop=960:580:960:0','-an','-c:v','libx264','-crf','19','-pix_fmt','yuv420p','-movflags','+faststart',path.join(out,'motion-review-after.mp4')]);
await writeJSON(path.join(out,'motion-review.json'),{projectHash:hashProject(p),baseline:'35734ca9c433bf92',segments,frames:frames.length,fps:p.fps,width:960,height:540,samples:64,audio:false,playbackSpeed:1,scope:'Visual blocking/performance review; not a voiced sample',visualReview:'pending',naturalMotion:'pending',listening:'not performed',asr:'not performed'});
console.log(out);
