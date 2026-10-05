"""One-time source import for the first film; never invoked by normal startup."""
from pathlib import Path
import json, hashlib, shutil, re

root = Path(__file__).resolve().parents[1]
src = Path(r'D:\workspace\project\skills\gyagp-skills\subgroup-matrix')
project = root / 'projects/subgroup-matrix'
(project / 'assets').mkdir(parents=True, exist_ok=True)
for name in ['demo.html', 'report.html']:
    shutil.copy2(src / name, project / 'assets' / name)

def shot(id, kind, seconds, title, eyebrow, body, narration, note='', **extra):
    return dict(id=id, kind=kind, duration=seconds, title=title, eyebrow=eyebrow, body=body, narration=narration, note=note, **extra)

scenes = [
shot('hook','title',12,'One subgroup.\nA different engine.','SUBGROUP MATRIX / A DEVELOPER FILM','From lane-level arithmetic to cooperative matrix operations.',
'What changes when a subgroup can use matrix hardware? The math stays the same. The way the GPU executes it changes.',
'September 2026 evaluation snapshot'),
shot('math','matrix',16,'The same mathematical contract.','01 / START WITH THE MATH','C′ = A × B + C',
'Start with matrix multiply and accumulate. A has M rows and K columns. B has K rows and N columns. Each output adds a dot product to C. In this small example, the first result is fifty-nine.',
'Illustrative 2×3 and 3×2 matrices; not an advertised hardware tile'),
shot('lanes','lanes',18,'From individual work\nto one cooperative operation.','02 / CHANGE THE EXECUTION PATH','A subgroup is a hardware-sized team of lanes: a warp or wave.',
'On the F M A path, lanes execute multiply-add instructions to build an output tile. With subgroup matrix operations, the lanes cooperate on matrix fragments and use matrix multiply hardware. The result is distributed across the subgroup.',
'Conceptual animation. Lane count and fragment layout are implementation-dependent.'),
shot('bridge','pipeline',18,'One surface. Three native paths.','03 / THROUGH DAWN AND TINT','Validate capabilities first. Lower to the native backend.',
'Dawn exposes an experimental Web G P U surface. Tint lowers the shader to Vulkan cooperative matrices, Metal SIMD-group operations, or D three D twelve wave matrices. The adapter must advertise the exact configuration. Hardware branding alone is not enough.',
'Source snapshot: D3D12 SM 6.10 LinAlg uses a preview runtime.'),
shot('contract','checklist',16,'Make the comparison fair.','04 / THE MEASUREMENT CONTRACT','Radeon RX 9070 XT · Windows · D3D12',
'The supplied evaluation compares matched workloads on a Radeon R X ninety seventy X T. Inputs and shapes match. Results are checked against a CPU reference. GPU timestamps measure dispatch only, after warmup, with thirty measured samples.',
'f16 × f16 → f32 · preview driver 26.10.07.02 · historical measurements',items=['Same shapes and input data','CPU reference validation','Dispatch-only GPU timestamps','Warmup + 30 measured samples']),
shot('prefill','benchmark',18,'Prefill 2048. A clear difference.','05 / REPLAY THE RECORDED RESULT','2048 × 3072 × 3072 · FP16 FMA baseline',
'For the prefill twenty forty-eight workload, the recorded F M A result is thirteen point zero nine teraflops. LinAlg reaches forty-eight point nine seven. That is a three point seven four times gain in this matched test. This is a replay of recorded data.',
'Measured 21 Sep 2026 · RX 9070 XT · D3D12 · not a live benchmark', baseline=13.09,result=48.97),
shot('demo','demo',20,'Explore the original demo.','06 / THE SOURCE, ON SCREEN','Choose a workload. Replay its measured comparison.',
'The original demo lets you switch workloads and replay the comparison. Across its five D three D twelve cases, recorded speedups range from two point seven zero to four point one three times. These are workload-specific results, not a promise for every model or every GPU.',
'Captured from the supplied demo.html · recorded results, not live execution', image='assets/demo-prefill.png', imageAlt='assets/demo-mlp.png'),
shot('limits','compare',14,'Keep the baseline in the frame.','07 / INTERPRET THE RESULT','A speedup belongs to a workload, a device, and a baseline.',
'The Vulkan results use an integer eight D P four A baseline. The D three D twelve results use F P sixteen F M A. These gains cannot rank the APIs. One Vulkan case even records a slowdown.',
'RTX 5080 · Vulkan · Prefill 128: 0.89× vs INT8 DP4A'),
shot('engineering','checklist',10,'A usable path needs engineering.','08 / FROM FEATURE TO WORKING STACK','Capabilities → correctness → measurement',
'The source records six landed Dawn changes, covering build setup, cooperative loads, resource lifetime, and capability validation. A usable path needs all of them.',
'Dawn CLs 326715 · 330695 · 331295 · 333935 · 335215 · 335895',items=['Build and resource lifetime','Cooperative matrix loads','Exact capability validation']),
shot('closing','closing',8,'Same math.\nBetter matched execution.','SUBGROUP MATRIX','Probe the adapter. Validate the output. Measure your workload.',
'Same math. A different execution engine. Probe the adapter, validate the output, and measure the workload that matters to you.',
'Source: gyagp-skills/subgroup-matrix · demo.html + report.html')
]
p=dict(schemaVersion=1,id='subgroup-matrix',title='Subgroup Matrix',idea='Explain cooperative matrix execution and replay the supplied GPU evaluation for international developers.',language='en',template='explainer',theme='midnight',voice='Microsoft David Desktop',music=True,fps=24,width=1920,height=1080,status='draft',createdAt='2026-10-04T13:00:00Z',scenes=scenes,sources=[dict(label='Original interactive demo',url='assets/demo.html'),dict(label='Detailed evaluation report',url='assets/report.html'),dict(label='Filmmaking reference · lemomo_ai',url='https://x.com/lemomo_ai/status/2103823847632060854')])
(project/'project.json').write_text(json.dumps(p,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
manifest={ 'importedAt':'2026-10-04','sourceDirectory':str(src),'files':[],'measurementDate':'2026-09-21','verification':'Values transcribed from user-supplied demo; benchmarks were not re-run.' }
for name in ['demo.html','report.html']:
    manifest['files'].append(dict(name=name,sha256=hashlib.sha256((src/name).read_bytes()).hexdigest()))
(project/'sources.json').write_text(json.dumps(manifest,indent=2)+'\n',encoding='utf-8')
print('Created subgroup-matrix project: '+str(sum(s['duration'] for s in scenes))+' seconds')
