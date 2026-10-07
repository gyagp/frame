"""Time-driven camera paths and explicit spatial diagnostics.
Method reference: bangbuilds/code-doc-film kit.js; original Blender implementation.
"""
from mathutils import Vector
from bpy_extras.object_utils import world_to_camera_view
import bpy


def sample_camera(spec,k):
    keys=spec.get('keys',[{'k':0,'position':spec['position'],'target':spec['target']}, {'k':1,'position':spec.get('endPosition',spec['position']),'target':spec.get('endTarget',spec['target'])}])
    k=max(0,min(1,k))
    b=next((x for x in keys if x['k']>=k),keys[-1])
    index=keys.index(b);a=keys[max(0,index-1)]
    u=0 if a==b else (k-a['k'])/(b['k']-a['k'])
    u=u*u*(3-2*u)
    return Vector(a['position']).lerp(Vector(b['position']),u),Vector(a['target']).lerp(Vector(b['target']),u),a.get('lens',spec['lens'])+(b.get('lens',spec['lens'])-a.get('lens',spec['lens']))*u


def safe_camera(position,target,spec,height):
    result=position.copy();warnings=[]
    rules=spec.get('safety',{})
    clearance=rules.get('clearance',.06)
    minimum=height(position.x,position.y)+clearance
    if position.z<minimum:
        adjusted=bool(rules.get('avoidGround',False))
        if adjusted:result.z=minimum
        warnings.append({'code':'camera-ground','issue':'相机低于地面／水面安全距离','corrected':adjusted,'original':list(position),'actual':list(result)})
    blocked=False
    for i in range(1,25):
        point=result.lerp(target,i/25*.90)
        if height(point.x,point.y)>point.z+.03:blocked=True;break
    if blocked:warnings.append({'code':'terrain-occlusion','issue':'相机到目标的视线穿过地形；需要重新安排机位','corrected':False})
    return result,warnings


def framing(scene,camera,actors,spec):
    findings=[];rules=spec.get('safety',{})
    if rules.get('framing','full')=='detail':return findings
    subjects=rules.get('subjects',[a[0]['id'] for a in actors])
    deps=bpy.context.evaluated_depsgraph_get()
    for actor,root,rig,targets,scale in actors:
        if actor['id'] not in subjects:continue
        parts=[]
        for o in scene.objects:
            if o.type!='MESH':continue
            parent=o.parent
            while parent and parent!=root:parent=parent.parent
            if parent==root:parts.append(o.evaluated_get(deps))
        points=[world_to_camera_view(scene,camera,o.matrix_world@Vector(p)) for o in parts for p in o.bound_box]
        if not points:continue
        bounds={'left':min(p.x for p in points),'right':max(p.x for p in points),'bottom':min(p.y for p in points),'top':max(p.y for p in points)}
        if any(p.z<=0 for p in points):findings.append({'code':'subject-behind-camera','actorId':actor['id'],'issue':'主体部分位于相机后方','bounds':bounds})
        elif bounds['left']<.015 or bounds['right']>.985 or bounds['bottom']<.015 or bounds['top']>.985:findings.append({'code':'subject-crop','actorId':actor['id'],'issue':'完整主体模式下角色触及或越出画框','bounds':bounds})
    return findings
