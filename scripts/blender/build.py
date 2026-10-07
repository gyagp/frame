"""Trusted Blender 4.5 scene builder. Project JSON contains data, never code.

Meters, Z up, character forward +X. Assets are original procedural blocking
models, with editable armatures/materials; they are not approved final characters.
"""
import bpy
import json
import math
import random
import sys
import hashlib
from pathlib import Path
from mathutils import Vector, Matrix
sys.path.insert(0,str(Path(__file__).resolve().parent))
import natural_assets
import camera_tools
import performance

args = sys.argv[sys.argv.index('--') + 1:]
manifest_path, output = Path(args[0]), Path(args[1])
data = json.loads(manifest_path.read_text(encoding='utf8'))
shot = data['spatial']
natural = shot['environment'].endswith('-v2')
random.seed(shot['seed'])
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
scene = bpy.context.scene
scene.render.engine = 'CYCLES'
scene.cycles.samples = 24
scene.cycles.use_denoising = True
scene.cycles.seed = shot['seed']
scene.cycles.use_animated_seed = False
scene.render.resolution_x = data['width']
scene.render.resolution_y = data['height']
scene.render.resolution_percentage = 100
scene.render.fps = data['fps']
scene.render.image_settings.file_format = 'PNG'
scene.render.film_transparent = False
scene.frame_start = 1
scene.frame_end = round(data['duration'] * data['fps'])
scene.view_settings.view_transform = 'AgX'
scene.world.color = (0.35, 0.42, 0.48)
scene.world.use_nodes = True
scene.world.node_tree.nodes['Background'].inputs['Color'].default_value = (0.48, 0.63, 0.78, 1)
scene.world.node_tree.nodes['Background'].inputs['Strength'].default_value = 0.4
device = 'CPU'
try:
    prefs = bpy.context.preferences.addons['cycles'].preferences
    prefs.compute_device_type = 'OPTIX'
    prefs.get_devices()
    gpu = [d for d in prefs.devices if d.type == 'OPTIX']
    if gpu:
        for d in prefs.devices:
            d.use = d.type == 'OPTIX'
        scene.cycles.device = 'GPU'
        scene.cycles.denoising_use_gpu = True
        scene.render.use_persistent_data = True
        scene.render.image_settings.compression = 0
        device = ', '.join(d.name for d in gpu)
except Exception:
    pass


def material(name, color, roughness=0.65, noise=0):
    m = bpy.data.materials.new(name)
    m.diffuse_color = (*color, 1)
    m.use_nodes = True
    p = m.node_tree.nodes.get('Principled BSDF')
    p.inputs['Base Color'].default_value = (*color, 1)
    p.inputs['Roughness'].default_value = roughness
    if noise:
        n = m.node_tree.nodes.new('ShaderNodeTexNoise')
        n.inputs['Scale'].default_value = 95
        n.inputs['Detail'].default_value = 2
        bump = m.node_tree.nodes.new('ShaderNodeBump')
        bump.inputs['Strength'].default_value = noise
        bump.inputs['Distance'].default_value = 0.025
        m.node_tree.links.new(n.outputs['Fac'], bump.inputs['Height'])
        m.node_tree.links.new(bump.outputs['Normal'], p.inputs['Normal'])
    return m


coat = material('Chestnut short-coat study', (0.22, 0.070, 0.023), noise=0.05)
oxcoat = material('Ox warm grey', (0.23, 0.20, 0.15), noise=0.12)
dark = material('Mane and tail', (0.065, 0.026, 0.018), noise=0.12)
hoof = material('Horn', (0.065, 0.061, 0.047), 0.48)
cream = material('Cream marking', (0.87, 0.77, 0.57))
eye = material('Eyes', (0.014, 0.009, 0.005), 0.14)
linen = material('Woven flax sack', (0.60, 0.45, 0.24), noise=0.42)
rope = material('Teal cord', (0.065, 0.20, 0.17), noise=0.2)
grass = material('Sage meadow', (0.27, 0.34, 0.13), noise=0.2)
earth = material('River bed', (0.31, 0.27, 0.16), noise=0.3)
wood = material('Aged timber', (0.22, 0.12, 0.056), noise=0.3)
plaster = material('Warm lime plaster', (0.69, 0.57, 0.36), noise=0.2)
stone = material('River stones', (0.39, 0.41, 0.32), noise=0.15)
leaf = material('Willow leaves', (0.18, 0.29, 0.09), noise=0.12)


def finish(obj, name, mat, parent=None):
    obj.name = name
    obj.data.materials.append(mat)
    if parent:
        obj.parent = parent
    for p in getattr(obj.data, 'polygons', []):
        p.use_smooth = True
    return obj


def ellipsoid(name, loc, scale, mat, parent=None):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=32, ring_count=20, location=loc)
    o = finish(bpy.context.object, name, mat, parent)
    o.scale = scale
    return o


def box(name, loc, scale, mat, parent=None, bevel=0.08):
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc)
    o = finish(bpy.context.object, name, mat, parent)
    o.scale = scale
    bpy.context.view_layer.objects.active = o
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    if bevel:
        mod = o.modifiers.new('Soft edges', 'BEVEL')
        mod.width = bevel
        mod.segments = 3
        o.modifiers.new('Surface normals', 'WEIGHTED_NORMAL')
    return o


def link(name, a, b, r, mat, parent=None):
    a, b = Vector(a), Vector(b)
    o = ellipsoid(name, (a + b) / 2, (r, r, (b-a).length / 2 + r * 0.35), mat, parent)
    o.rotation_euler = (b-a).to_track_quat('Z', 'Y').to_euler()
    return o


def empty(name):
    o = bpy.data.objects.new(name, None)
    scene.collection.objects.link(o)
    return o


def bind(o, rig, bone):
    # Bake transforms in rest coordinates, then attach a real deform modifier.
    bpy.ops.object.select_all(action='DESELECT')
    o.select_set(True)
    bpy.context.view_layer.objects.active = o
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    group = o.vertex_groups.new(name=bone)
    group.add(list(range(len(o.data.vertices))), 1.0, 'REPLACE')
    mod = o.modifiers.new('Character rig', 'ARMATURE')
    mod.object = rig
    o.parent = rig


def curve(name, points, radius, mat, parent=None):
    c = bpy.data.curves.new(name, 'CURVE')
    c.dimensions = '3D'
    c.bevel_depth = radius
    c.bevel_resolution = 3
    s = c.splines.new('BEZIER')
    s.bezier_points.add(len(points)-1)
    for p, co in zip(s.bezier_points, points):
        p.co = co
        p.handle_left_type = p.handle_right_type = 'AUTO'
    o = bpy.data.objects.new(name, c)
    scene.collection.objects.link(o)
    o.data.materials.append(mat)
    o.parent = parent
    return o


def pony(actor):
    is_ox = actor['asset'] == 'ox-v1'
    scale = 1.6 if is_ox else 1.3 if actor['asset'] == 'mother-v1' else 1
    fur = oxcoat if is_ox else coat
    root = empty(actor['id'] + '-root')
    root['asset_id'] = actor['asset']
    root['asset_version'] = 1
    root['provenance'] = 'Original procedural blocking mesh; Movie Studio'
    arm = bpy.data.armatures.new(actor['id'] + '-skeleton')
    rig = bpy.data.objects.new(actor['id'] + '-rig', arm)
    scene.collection.objects.link(rig)
    rig.parent = root
    bpy.context.view_layer.objects.active = rig
    rig.select_set(True)
    bpy.ops.object.mode_set(mode='EDIT')
    def bone(name, head, tail, parent=None):
        b = arm.edit_bones.new(name)
        b.head, b.tail = head, tail
        if parent:
            b.parent = arm.edit_bones[parent]
        return b
    bone('body', (0, 0, 1), (0, 0, 1.35))
    bone('head', (.65, 0, 1.52), (.9, 0, 1.98), 'body')
    bone('tail', (-.8, 0, 1.28), (-1.12, 0, .55), 'body')
    legs = []
    for front, x in [(True, .55), (False, -.62)]:
        for side, y in [('near', -.25), ('far', .25)]:
            label = ('front-' if front else 'back-') + side
            a, b, c = (x, y, 1.12), (x + (-.06 if front else .10), y, .63), (x, y, .15)
            bone(label + '-upper', a, b, 'body')
            bone(label + '-lower', b, c, label + '-upper')
            bone(label + '-foot', c, (x+.18, y, .15), label + '-lower')
            legs.append((label, a, b, c))
    bpy.ops.object.mode_set(mode='OBJECT')
    parts = [
        (ellipsoid('Barrel', (-.12, 0, 1.24), (.83, .35, .40), fur), 'body'),
        (ellipsoid('Shoulder', (.47, 0, 1.34), (.32, .31, .40), fur), 'body'),
        (link('Neck', (.46, 0, 1.30), (.74, 0, 1.83), .265, fur), 'body'),
        (ellipsoid('Head', (.89, 0, 1.91), (.36, .205, .255), fur), 'head'),
        (link('Face', (1.02, 0, 1.9), (1.34, 0, 1.68), .172, fur), 'head'),
        (ellipsoid('Muzzle', (1.36, 0, 1.65), (.20, .19, .145), fur if is_ox else material(actor['id']+' muzzle', (.22,.14,.085))), 'head'),
    ]
    if is_ox:
        for mesh, _ in parts:
            bpy.data.objects.remove(mesh,do_unlink=True)
        parts=[
            (ellipsoid('Ox barrel',(-.12,0,1.25),(.88,.43,.45),fur),'body'),
            (ellipsoid('Ox shoulder',(.45,0,1.32),(.36,.39,.44),fur),'body'),
            (link('Ox short neck',(.53,0,1.38),(.79,0,1.69),.29,fur),'body'),
            (ellipsoid('Ox broad skull',(.95,0,1.73),(.30,.29,.25),fur),'head'),
            (link('Ox face',(1.03,0,1.7),(1.29,0,1.48),.22,fur),'head'),
            (ellipsoid('Ox muzzle',(1.30,0,1.46),(.23,.27,.16),fur),'head')]
    for y in [-.19, .19]:
        ear = ellipsoid('Ear', (.78, y if not is_ox else y*1.65, 2.19 if not is_ox else 1.95), (.087, .061, .215) if not is_ox else (.11,.20,.065), fur)
        ear.rotation_euler.x = -.2 if y < 0 else .2
        parts.append((ear, 'head'))
        parts.append((ellipsoid('Eye', (1.01, y * 1.015, 1.99) if not is_ox else (1.03,y*1.45,1.80), (.045, .022, .040), eye), 'head'))
        parts.append((ellipsoid('Nostril', (1.47, y * .82, 1.70) if not is_ox else (1.46,y*1.13,1.49), (.034,.018,.027), hoof), 'head'))
    if not is_ox:
        blaze = ellipsoid('Cream forehead blaze', (1.13, 0, 2.012), (.105, .071, .021), cream)
        blaze.rotation_euler.y = .38
        parts.append((blaze, 'head'))
        for i in range(10):
            parts.append((ellipsoid('Mane tuft', (.37+i*.047, 0, 1.61+i*.058), (.12,.085,.17), dark), 'body' if i < 6 else 'head'))
        parts.append((link('Tail', (-.84,0,1.4),(-1.08,0,.50),.105,dark), 'tail'))
    else:
        for sign in [-1,1]:
            parts.append((link('Horn',(.82,sign*.19,1.91),(.68,sign*.54,2.16),.07,cream),'head'))
        parts.append((ellipsoid('Ox dewlap',(.68,0,1.33),(.16,.13,.33),fur),'body'))
        parts.append((link('Ox tail',(-.9,0,1.32),(-1.05,0,.42),.035,fur),'tail'))
    targets = []
    for label, a, b, c in legs:
        parts += [(link(label+' thigh',a,b,.125,fur), label+'-upper'),
                  (ellipsoid(label+' joint',b,(.105,.10,.115),fur),label+'-lower'),
                  (link(label+' shank',b,c,.066,fur), label+'-lower'),
                  (box(label+' hoof',(c[0]+.035,c[1],.10),(.22,.18,.19),hoof,bevel=.035),label+'-foot')]
        target = empty(label+' IK target')
        target.parent = root
        target.location = c
        constraint = rig.pose.bones[label+'-lower'].constraints.new('IK')
        constraint.target = target
        constraint.chain_count = 2
        constraint.use_stretch = False
        foot = rig.pose.bones[label+'-foot'].constraints.new('COPY_ROTATION')
        foot.target = root
        foot.target_space = 'WORLD'
        foot.owner_space = 'WORLD'
        targets.append((label,target,Vector(c)))
    # Fuse torso and head volumes into editable smooth surfaces. Limbs remain
    # articulated blocking segments until the approved anatomy/skin pass.
    for group_name in ['body','head']:
        meshes=[mesh for mesh,b in parts if b==group_name and len(mesh.data.materials) and mesh.data.materials[0]==fur]
        bpy.ops.object.select_all(action='DESELECT')
        for mesh in meshes:
            mesh.select_set(True)
        bpy.context.view_layer.objects.active=meshes[0]
        bpy.ops.object.join()
        joined=bpy.context.object
        bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
        mod=joined.modifiers.new('Unified surface','REMESH')
        mod.mode='VOXEL'
        mod.voxel_size=.035
        mod.use_smooth_shade=True
        bpy.ops.object.modifier_apply(modifier=mod.name)
        smooth_mod=joined.modifiers.new('Surface relaxation','SMOOTH')
        smooth_mod.factor=1.3
        smooth_mod.iterations=5
        bpy.ops.object.modifier_apply(modifier=smooth_mod.name)
        parts=[(mesh,b) for mesh,b in parts if mesh not in meshes]
        parts.append((joined,group_name))
    for mesh,b in parts:
        bind(mesh,rig,b)
    if actor['bag']:
        bag = ellipsoid('Dry flax wheat sack',(-.20,0,1.66),(.38,.36,.235),linen)
        bind(bag,rig,'body')
        cord = curve('Teal tie',[(-.18,-.36,1.66),(-.18,-.22,1.90),(-.18,.22,1.90),(-.18,.36,1.66)],.016,rope,rig)
        curve('Harness',[(-.32,-.35,1.52),(-.30,-.32,.95),(-.30,.32,.95),(-.32,.35,1.52)],.018,rope,rig)
    root.location = actor['position']
    root.rotation_euler.z = math.radians(actor['heading'])
    root.scale = (scale,)*3
    return root, rig, targets, scale


def squirrel(actor):
    root = empty(actor['id']+'-root')
    root.location = actor['position']
    root.rotation_euler.z = math.radians(actor['heading'])
    fur = material('Squirrel russet',(0.37,.15,.055),noise=.25)
    ellipsoid('Squirrel body',(0,0,.22),(.13,.12,.22),fur,root)
    ellipsoid('Squirrel head',(.1,0,.45),(.15,.105,.12),fur,root)
    for y in [-.085,.085]:
        ellipsoid('Squirrel ear',(.05,y,.56),(.038,.03,.07),fur,root)
        ellipsoid('Squirrel eye',(.18,y,.48),(.025,.018,.025),eye,root)
        ellipsoid('Squirrel foot',(.1,y,.035),(.12,.05,.035),fur,root)
        link('Squirrel arm',(.03,y,.31),(.18,y,.22),.035,fur,root)
    curve('Bushy curled tail',[(-.09,0,.10),(-.35,0,.22),(-.31,0,.59),(-.12,0,.72),(-.10,0,.58)],.10,fur,root)
    return root


def tree(x,y,size):
    link('Willow trunk',(x,y,.2),(x,y,2.6*size),.13*size,wood)
    for i in range(8):
        angle = i*2.4
        ellipsoid('Willow crown',(x+math.cos(angle)*.5*size,y+math.sin(angle)*.5*size,2.5*size+random.random()*.5),(.95*size,.8*size,.8*size),leaf)


def mill():
    box('Mill walls',(5.3,4,1.4),(2.3,2.2,2.8),plaster)
    bpy.ops.mesh.primitive_cone_add(vertices=4, radius1=1.9, radius2=0, depth=1.2, location=(5.3,4,3.3),rotation=(0,0,math.pi/4))
    finish(bpy.context.object,'Mill roof',wood)
    box('Mill door',(5.3,2.87,.77),(.6,.08,1.5),wood)
    hub = empty('Windmill rotor')
    hub.location=(5.3,2.81,2.65)
    for a in [0,math.pi/2,math.pi,math.pi*1.5]:
        sail=box('Windmill sail',(math.sin(a)*.8,0,math.cos(a)*.8),(.24,.07,1.5),linen,hub,.025)
        sail.rotation_euler.y=a
    return hub


water = None
rotor = None
if natural:
    water,rotor=natural_assets.environment(shot['seed'],shot['environment'])
elif shot['environment'] == 'studio-v1':
    box('Studio ground',(0,0,-.12),(200,200,.2),plaster)
else:
    box('Valley floor',(0,0,-.19),(100,100,.25),earth)
    box('Near bank',(-12,0,.04),(20,70,.43),grass)
    box('Far bank',(12,0,.04),(20,70,.43),grass)
    watermat=material('Teal shallow water',(.15,.35,.32),.18)
    p=watermat.node_tree.nodes.get('Principled BSDF')
    p.inputs['Transmission Weight'].default_value=.35
    p.inputs['IOR'].default_value=1.333
    water=box('River surface',(0,0,.16),(4,65,.045),watermat,bevel=0)
    # Stones and foliage are deterministic with the manifest seed.
    for i in range(55):
        x=random.choice([-1,1])*random.uniform(1.6,2.25)
        y=random.uniform(-10,15)
        ellipsoid('Shore pebble',(x,y,.15),(random.uniform(.08,.2),random.uniform(.1,.3),.12),stone)
    for x,y,s in [(-5,3,1.1),(-4,8,1.4),(4,8,1.7),(7,1,1.1),(-8,0,1.2),(7,12,1.5)]:
        tree(x,y,s)
    for i in range(100):
        x=random.choice([-1,1])*random.uniform(2.3,8)
        y=random.uniform(-4,12)
        curve('Meadow stem',[(x,y,.26),(x+.03,y,.43),(x+.10,y,.55)],.008,grass)
    rotor=mill()
    box('Stable',(-7,4,1),(2.5,2.5,2),wood)
    box('Stable doorway',(-7,2.72,.9),(1.4,.08,1.8),dark)
    box('Delivery platform',(4.1,2.2,.4),(1.2,.9,.55),wood)
    if shot['environment']=='mill-v1':
        ellipsoid('Delivered wheat',(4.1,2.2,.9),(.4,.35,.25),linen)

actors=[]
for a in shot['actors']:
    if a['asset'] in ['pony-v3','mother-v3']:
        actors.append((a,)+natural_assets.sourced_horse(a))
    elif a['asset'] in ['pony-v2','mother-v2','ox-v2']:
        actors.append((a,)+natural_assets.character(a))
    elif a['asset']=='squirrel-v2':
        actors.append((a,)+natural_assets.squirrel(a))
    elif a['asset'] in ['pony-v1','mother-v1','ox-v1']:
        actors.append((a,)+pony(a))
    elif a['asset']=='squirrel-v1':
        squirrel(a)
    else:
        o=box(a['id'],a['position'],(1,1,1),rope)
        o.rotation_euler.z=math.radians(a['heading'])
        actors.append((a,o,None,[],1))

def light(name,loc,power,size,color):
    d=bpy.data.lights.new(name,'AREA')
    d.energy=power
    d.shape='DISK'
    d.size=size
    d.color=color
    o=bpy.data.objects.new(name,d)
    scene.collection.objects.link(o)
    o.location=loc
    o.rotation_euler=(Vector((0,0,1))-o.location).to_track_quat('-Z','Y').to_euler()
light('Warm morning softbox',(-3,-4,8),1700,7,(1,.82,.58))
light('Sky fill',(4,1,7),1100,8,(.65,.80,1))
bpy.ops.object.light_add(type='SUN',location=(-6,-3,10))
sun=bpy.context.object
sun.name='Morning sun'
sun.rotation_euler=(.4,-.5,-.5)
sun.data.energy=1.4
sun.data.angle=.16
sun.data.color=(1,.86,.65)
if natural:
    natural_assets.lighting()
bpy.ops.object.camera_add()
cam=bpy.context.object
cam.name='Shot camera'
cam.data.lens=shot['camera']['lens']
cam.data.clip_end=300
scene.camera=cam
cam.data.dof.use_dof=False  # Contact and spatial layout must remain readable.
if natural:
    cam.data.dof.use_dof=True
    cam.data.dof.aperture_fstop=7.1
    cam.data.dof.focus_distance=(Vector(shot['camera']['target'])-Vector(shot['camera']['position'])).length


def smooth(t):
    t=max(0,min(1,t))
    return t*t*(3-2*t)


rings=[]
camera_diagnostics=[]
for a,root,rig,targets,scale in actors:
    if a['action']=='probe' and water and rig:
        for i in range(3):
            bpy.ops.mesh.primitive_torus_add(major_radius=1,minor_radius=.008,major_segments=64,minor_segments=8)
            ring=finish(bpy.context.object,'Contact ripple',material('Ripple '+str(i),(.45,.65,.54),.3))
            ring.location=(a['position'][0]+.84,-.25,.148+i*.001)
            rings.append((a['id'],i,ring))

contacts={}
contact_events=[]
last_foot_state={}
foot_ripples=[]
motion_samples=[]

# Bake all poses and cameras. Export can request arbitrary frame order safely.
for frame in range(1,scene.frame_end+1):
    t=(frame-1)/data['fps']
    u=(frame-1)/max(1,scene.frame_end-1)
    for a,root,rig,targets,scale in actors:
        pose=performance.pose(a,u,t)
        travel=pose['travel']
        angle=math.radians(a['heading'])
        root.location=Vector(a['position'])+Vector((math.cos(angle)*travel,math.sin(angle)*travel,0))
        incline=0
        if natural and a['asset']=='squirrel-v2':
            root.location.z=natural_assets.ground(root.location.x,root.location.y)+pose['probeLift']
        elif natural and rig:
            front=natural_assets.ground(root.location.x+.48*scale*math.cos(angle),root.location.y+.48*scale*math.sin(angle))
            back=natural_assets.ground(root.location.x-.88*scale*math.cos(angle),root.location.y-.88*scale*math.sin(angle))
            root.location.z=front*.54+back*.46
            incline=max(-.26,min(.26,math.atan2(back-front,1.36*scale)))
        root.keyframe_insert('location',frame=frame)
        if not rig:
            if a['asset'].startswith('squirrel'):
                root.rotation_euler.z=math.radians(a['heading'])+pose['headYaw']
                root.location.z+=pose['probeLift']+.005*math.sin(t*2)
                root.keyframe_insert('location',frame=frame)
            else:root.rotation_euler.z=math.radians(a['heading'])+u*math.pi/2
            root.keyframe_insert('rotation_euler',frame=frame)
            continue
        head=rig.pose.bones['head']
        # Move the deforming body bone, not the armature object: mesh and rig are
        # siblings under the root, so object motion cancels in modifier space.
        rig.location=(0,0,0)
        body=rig.pose.bones['body']
        body_basis=rig.data.bones['body'].matrix_local.to_3x3().normalized()
        body_turn=Matrix.Rotation(incline,3,'Y')
        body.rotation_mode='QUATERNION'
        body.rotation_quaternion=(body_basis.inverted() @ body_turn @ body_basis).to_quaternion()
        body.keyframe_insert('rotation_quaternion',frame=frame)
        body.location=body_basis.inverted() @ Vector((pose['bodyShift'],0,-pose['bodyDrop']+.008*math.sin(t*1.8)))
        body.keyframe_insert('location',frame=frame)
        if a['asset']=='squirrel-v2':
            landing=math.exp(-((u-.19)/.032)**2) if a.get('performance',{}).get('keys',[{}])[0].get('probeLift',0)>0 else 0
            body.scale=(1+landing*.045,1+landing*.045,1-landing*.10)
            body.keyframe_insert('scale',frame=frame)
            for side,sign in [('near',-1),('far',1)]:
                paw=rig.pose.bones['paw-'+side];paw.rotation_mode='XYZ';paw.rotation_euler.x=.13*math.sin(t*2.2+sign)
                paw.keyframe_insert('rotation_euler',frame=frame)
        # Anatomical yaw is character Z, pitch is character Y. Bone-local Y is
        # the long neck axis; rotating it used to produce nearly invisible twist.
        basis=rig.data.bones['head'].matrix_local.to_3x3().normalized()
        turn=Matrix.Rotation(pose['headYaw'],3,'Z') @ Matrix.Rotation(pose['headPitch'],3,'Y')
        head.rotation_mode='QUATERNION'
        head.rotation_quaternion=(basis.inverted() @ turn @ basis).to_quaternion()
        head.keyframe_insert('rotation_quaternion',frame=frame)
        for side,sign in [('near',-1),('far',1)]:
            ear=rig.pose.bones.get('ear-'+side)
            if ear:
                ear.rotation_mode='XYZ'
                ear.rotation_euler=(.07*math.sin(t*1.1+sign),0,-pose['headYaw']*.35+sign*.05*math.sin(t*1.6))
                ear.keyframe_insert('rotation_euler',frame=frame)
        tail=rig.pose.bones['tail']
        tail.rotation_mode='XYZ'
        tail.rotation_euler.x=.06*math.sin(t*1.8)
        tail.keyframe_insert('rotation_euler',frame=frame)
        for idx,(label,target,base) in enumerate(targets):
            target.location=base.copy()
            lift=0
            if a['action']=='probe' and label=='front-near':
                target.location.x+=pose['probeReach']
                lift=pose['probeLift']
            elif a['action']=='walk' and a['travel']>0:
                settings=a.get('performance',{})
                offset,lift=performance.foot(travel,scale,idx,settings.get('stride',.50),settings.get('stepHeight',.15))
                target.location.x+=offset
            x=root.location.x+scale*(math.cos(angle)*target.location.x-math.sin(angle)*target.location.y)
            y=root.location.y+scale*(math.sin(angle)*target.location.x+math.cos(angle)*target.location.y)
            ground=natural_assets.contact_height(x,y) if natural else a['position'][2]
            target.location.z=base.z+(ground-root.location.z)/scale+lift
            foot_key=a['id']+'/'+label
            submerged=natural and ground<.145
            in_contact=lift*scale<.006
            if in_contact and last_foot_state.get(foot_key) is False:
                contact_events.append({'actorId':a['id'],'foot':label,'frame':frame,'time':t,'kind':'water' if submerged else 'hoof','position':[x,y,ground]})
            last_foot_state[foot_key]=in_contact
            if a['action']=='probe' and label=='front-near' and u>.3 and ground+lift*scale<.145 and a['id'] not in contacts:
                contacts[a['id']]={'time':t,'position':(x,y,.148),'frame':frame}
            target.keyframe_insert('location',frame=frame)
        if a['action']=='walk':
            # On the bank slope, lower the pelvis enough for the planted legs to
            # reach their targets. IK with stretching disabled cannot do this by
            # itself; otherwise an apparently grounded target leaves hooves aloft.
            drop=pose['bodyDrop']
            for label,target,base in targets:
                upper=rig.data.bones[label+'-upper'];lower=rig.data.bones[label+'-lower']
                pivot=rig.data.bones['body'].head_local
                hip=pivot+body_turn @ (upper.head_local-pivot)
                horizontal=(target.location.x-hip.x-pose['bodyShift'])**2+(target.location.y-hip.y)**2
                reach=(upper.length+lower.length)*.985
                available=math.sqrt(max(.01,reach*reach-horizontal))
                drop=max(drop,hip.z+.008*math.sin(t*1.8)-target.location.z-available)
            pose['bodyDrop']=min(.42,drop)
            body.location=body_basis.inverted() @ Vector((pose['bodyShift'],0,-pose['bodyDrop']+.008*math.sin(t*1.8)))
            body.keyframe_insert('location',frame=frame)
        for prop in root.children_recursive:
            if prop.get('role')!='wheat-bag':continue
            rest=Vector(prop['rest_location'])
            drop=pose['bagDrop']
            if drop==0:
                prop.location=rest
                prop.keyframe_insert('location',frame=frame)
                continue
            # Parent-bone inverse maps this local displacement into character
            # coordinates. Release to the fixed mill platform at the final beat.
            bpy.context.view_layer.update()
            prop.location=rest
            bpy.context.view_layer.update()
            world=prop.matrix_world.copy()
            sack_base=root.matrix_world @ Vector((-.25,0,1.50))
            world.translation+=(Vector((4.1,2.2,.68))-sack_base)*drop
            prop.matrix_world=world
            prop.keyframe_insert('location',frame=frame)
            prop['drop']=drop
        if frame in data['frames']:
            motion_samples.append({'actorId':a['id'],'frame':frame,'root':list(root.location),'pose':pose})
    for actor_id,i,ring in rings:
        contact=contacts.get(actor_id)
        elapsed=t-contact['time']-i*.18 if contact else -1
        v=max(0,min(1,elapsed/1.6))
        radius=.015+v*.48
        if contact:ring.location=contact['position']
        ring.scale=(radius,radius,max(.001,1-v))
        ring.hide_render=not (0<elapsed<1.6)
        ring.keyframe_insert('location',frame=frame)
        ring.keyframe_insert('scale',frame=frame)
        ring.keyframe_insert('hide_render',frame=frame)
    camera=shot['camera']
    position,target,lens=camera_tools.sample_camera(camera,u)
    height=lambda x,y: max(natural_assets.ground(x,y),.145) if natural else (.26 if abs(x)>2 else .17)
    if shot['environment']=='studio-v1':height=lambda x,y:0
    cam.location,warnings=camera_tools.safe_camera(position,target,camera,height)
    if frame in data['frames']:
        for warning in warnings:camera_diagnostics.append({'frame':frame,**warning})
    cam.data.lens=lens
    cam.data.keyframe_insert('lens',frame=frame)
    cam.rotation_euler=(target-cam.location).to_track_quat('-Z','Y').to_euler()
    cam.keyframe_insert('location',frame=frame)
    cam.keyframe_insert('rotation_euler',frame=frame)
    if natural:
        cam.data.dof.focus_distance=(target-cam.location).length
        cam.data.keyframe_insert('dof.focus_distance',frame=frame)
    if rotor:
        rotor.rotation_euler.y=t*.10
        rotor.keyframe_insert('rotation_euler',frame=frame)
    if natural and water:
        flow=water.data.materials[0].node_tree.nodes.get('River flow offset')
        if flow:
            flow.inputs[1].default_value=(0,-t*.055,0)
            flow.inputs[1].keyframe_insert('default_value',frame=frame)

# Each actual shallow-water landing gets a bounded local response. Events are
# baked from foot targets and reused by sound, not guessed from narration.
if natural and water:
    ripplemat=water.data.materials[0]
    for event in contact_events:
        if event['kind']!='water':continue
        bpy.ops.mesh.primitive_torus_add(major_radius=1,minor_radius=.004,major_segments=48,minor_segments=6)
        ring=finish(bpy.context.object,'Footfall ripple',ripplemat)
        ring.location=(*event['position'][:2],.147)
        for offset,radius,visible in [(-1,.01,False),(0,.025,True),(10,.13,True),(24,.28,True),(31,.34,False)]:
            frame=event['frame']+offset
            ring.scale=(radius,radius,max(.04,1-max(0,offset)/32))
            ring.hide_render=not visible
            ring.keyframe_insert('scale',frame=frame)
            ring.keyframe_insert('hide_render',frame=frame)

# Linear between per-frame samples, avoiding Bezier overshoot at contact.
for obj in scene.objects:
    if obj.animation_data and obj.animation_data.action:
        for fc in obj.animation_data.action.fcurves:
            for k in fc.keyframe_points:
                k.interpolation='LINEAR'

scene.frame_set(data['frames'][0])
bpy.ops.file.pack_all()
bpy.ops.wm.save_as_mainfile(filepath=str(output/'scene.blend'))
digests=[]
foot_diagnostics=[]
for frame in data['frames']:
    scene.frame_set(frame)
    bpy.context.view_layer.update()
    for a,root,rig,targets,scale in actors:
        if not rig:continue
        for label,target,base in targets:
            actual=rig.matrix_world @ rig.pose.bones[label+'-lower'].tail
            expected=target.matrix_world.translation
            foot_diagnostics.append({'actorId':a['id'],'frame':frame,'foot':label,'targetError':(actual-expected).length})
    for warning in camera_tools.framing(scene,cam,actors,shot['camera']):camera_diagnostics.append({'frame':frame,**warning})
    scene.render.filepath=str(output/f'frame-{frame:05d}.png')
    bpy.ops.render.render(write_still=True)
    digests.append({'frame':frame,'sha256':hashlib.sha256(Path(scene.render.filepath).read_bytes()).hexdigest()})
report={'engine':scene.render.engine,'device':device,'version':bpy.app.version_string,
        'motionSamples':motion_samples,'contacts':contacts,'contactEvents':contact_events,'footDiagnostics':foot_diagnostics,
        'frames':data['frames'],'frameDigests':digests,'cameraDiagnostics':camera_diagnostics,'objects':len(scene.objects),
        'armatures':sum(o.type=='ARMATURE' for o in scene.objects),
        'stage':'naturalistic-look-development' if natural else 'blocking','geometry':'original procedural assets with articulated rigs',
        'naturalMotion':'not checked','listening':'not checked','asr':'not checked'}
(output/'report.json').write_text(json.dumps(report,indent=2),encoding='utf8')
print('MOVIE_STUDIO_RENDER_OK '+json.dumps(report))
