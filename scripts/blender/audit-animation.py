"""Inspect every baked frame without rendering; metrics do not grade acting."""
import bpy,json,sys,math
from pathlib import Path
from mathutils import Vector

folder=Path(sys.argv[sys.argv.index('--')+1])
scene=bpy.context.scene
report=json.loads((folder/'report.json').read_text(encoding='utf8'))
actors=[]
for root in scene.objects:
    if not root.get('asset_id'):continue
    rigs=[o for o in root.children if o.type=='ARMATURE']
    if not rigs:continue
    rig=rigs[0]
    feet=[]
    for side in ['front-near','front-far','back-near','back-far']:
        targets=[o for o in root.children if o.name.startswith(side+' source foot target')]
        if targets:feet.append((side,targets[0]))
    actors.append((root,rig,feet))
previous={};errors=[];drifts=[];trajectory={};poses={};bag=[];worst=[];foot_samples={};random_deltas=[]
for frame in range(1,scene.frame_end+1):
    scene.frame_set(frame);bpy.context.view_layer.update()
    for root,rig,feet in actors:
        trajectory.setdefault(root.name,[]).append(list(root.location))
        for side,target in feet:
            actual=rig.matrix_world @ rig.pose.bones[side+'-lower'].tail
            expected=target.matrix_world.translation.copy()
            errors.append((actual-expected).length)
            if errors[-1]>.02:worst.append({'frame':frame,'actor':root.name,'foot':side,'error':errors[-1],'target':list(expected),'actual':list(actual),'body':list(rig.pose.bones['body'].location)})
            key=root.name+'/'+side
            if key in previous:
                old_target,old_actual=previous[key]
                if (expected-old_target).length<.0001:drifts.append((actual-old_actual).length)
            previous[key]=(expected,actual.copy())
            if frame in [1,scene.frame_end//2,scene.frame_end]:foot_samples[(frame,key)]=actual.copy()
        if frame in [1,scene.frame_end//2,scene.frame_end]:
            poses.setdefault(root.name,[]).append({'frame':frame,'head':list(rig.pose.bones['head'].rotation_quaternion)})
    for o in scene.objects:
        if o.get('role')=='wheat-bag' and frame in [1,scene.frame_end//2,scene.frame_end]:
            bag.append({'frame':frame,'origin':list(o.matrix_world.translation)})
# Re-evaluate nonsequentially to check the baked scene is self-contained.
order=[scene.frame_end,1,scene.frame_end//2]
random_access=True
for frame in order:
    scene.frame_set(frame);bpy.context.view_layer.update()
    for root,rig,feet in actors:
        random_access &= (Vector(trajectory[root.name][frame-1])-root.location).length<1e-6
        for side,target in feet:
            actual=rig.matrix_world @ rig.pose.bones[side+'-lower'].tail
            random_deltas.append((actual-foot_samples[(frame,root.name+'/'+side)]).length)
result={'frames':scene.frame_end,'maxFootTargetError':max(errors,default=0),'maxStationaryFootDriftPerFrame':max(drifts,default=0),
        'stationaryFootChecks':len(drifts),'meanStationaryFootDrift':sum(drifts)/max(1,len(drifts)),
        'randomFrameRootAccess':bool(random_access),'headSamples':poses,'bagSamples':bag,
        'randomFrameFootDelta':max(random_deltas,default=0),
        'worst':sorted(worst,key=lambda x:x['error'],reverse=True)[:8],
        'actingQuality':'requires playback review','skinContact':'not measured by skeletal audit'}
(folder/'animation-audit.json').write_text(json.dumps(result,indent=2),encoding='utf8')
print('ANIMATION_AUDIT '+json.dumps(result),flush=True)
