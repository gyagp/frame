"""Trusted execution-only profile for an immutable, studio-generated scene."""
import bpy
import hashlib
import json
import os
from pathlib import Path
import sys
import time

request = json.loads(Path(sys.argv[sys.argv.index('--') + 1]).read_text(encoding='utf8'))
folder = Path(request['folder'])
folder.mkdir(parents=True, exist_ok=True)
scene = bpy.context.scene
if scene.render.engine != 'CYCLES':
    raise RuntimeError('Cached GPU execution requires Cycles')
prefs = bpy.context.preferences.addons['cycles'].preferences
prefs.compute_device_type = 'OPTIX'
prefs.get_devices()
for device in prefs.devices:
    device.use = device.type == 'OPTIX'
devices = [d.name for d in prefs.devices if d.use]
if not devices:
    raise RuntimeError('No OptiX GPU available; refusing silent CPU fallback')
scene.cycles.device = 'GPU'
scene.render.use_persistent_data = True
scene.cycles.denoising_use_gpu = True
scene.render.resolution_x = request['identity']['width']
scene.render.resolution_y = request['identity']['height']
scene.render.resolution_percentage = 100
scene.render.fps = request['identity']['fps']
scene.render.image_settings.file_format = 'PNG'
# PNG compression changes storage and CPU work, never the decoded pixels.
scene.render.image_settings.compression = 0
profile = {
    'profile': request['profile'], 'executorHash': request['executorHash'],
    'identity': request['identity'], 'blender': bpy.app.version_string,
    'engine': scene.render.engine, 'devices': devices, 'computeBackend': 'OPTIX',
    'samples': scene.cycles.samples, 'adaptiveThreshold': scene.cycles.adaptive_threshold,
    'denoiser': scene.cycles.denoiser, 'useDenoising': scene.cycles.use_denoising,
    'gpuDenoising': scene.cycles.denoising_use_gpu,
    'persistentData': scene.render.use_persistent_data,
    'pngCompression': scene.render.image_settings.compression,
}
def atomic_json(name, value):
    dest = folder / name
    tmp = folder / (name + '.tmp')
    tmp.write_text(json.dumps(value, indent=2), encoding='utf8')
    os.replace(tmp, dest)

atomic_json('gpu-profile.json', profile)
print('STUDIO_PROFILE ' + json.dumps(profile), flush=True)
checkpoint = {
    'version': 1, 'identity': request['identity'],
    'profile': request['profile'], 'executorHash': request['executorHash'],
    'frameHashes': request['frameHashes'],
}
for frame in request['frames']:
    if not 1 <= frame <= scene.frame_end:
        raise RuntimeError('Frame outside baked scene range')
    started = time.perf_counter()
    scene.frame_set(frame)
    bpy.context.view_layer.update()
    dest = folder / f'frame-{frame:05d}.png'
    tmp = folder / f'.frame-{frame:05d}.tmp.png'
    scene.render.filepath = str(tmp)
    bpy.ops.render.render(write_still=True)
    digest = hashlib.sha256(tmp.read_bytes()).hexdigest()
    os.replace(tmp, dest)
    checkpoint['frameHashes'][str(frame)] = digest
    atomic_json('fast-frames.json', checkpoint)
    print('STUDIO_FRAME ' + json.dumps({
        'frame': frame, 'sha256': digest, 'seconds': time.perf_counter() - started,
    }), flush=True)
