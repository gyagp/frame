"""Original naturalistic asset library v2. Meters, Z up, animal faces +X.

Trusted repository code, not project-supplied Python. All geometry is editable.
The skin is continuous and weighted; this is still an art/animation work in progress.
"""
import bpy
import math
import random
import json
from pathlib import Path
from mathutils import Vector
from mathutils.bvhtree import BVHTree


def mesh(name, verts, faces, mats):
    data = bpy.data.meshes.new(name)
    data.from_pydata(verts, [], faces)
    data.update()
    obj = bpy.data.objects.new(name, data)
    bpy.context.scene.collection.objects.link(obj)
    for mat in mats:
        data.materials.append(mat)
    for poly in data.polygons:
        poly.use_smooth = True
    return obj


def mat(name, color, rough=.65, grain=0, scale=90):
    m=bpy.data.materials.new(name)
    m.diffuse_color=(*color,1)
    m.use_nodes=True
    nt=m.node_tree
    p=nt.nodes.get('Principled BSDF')
    p.inputs['Base Color'].default_value=(*color,1)
    p.inputs['Roughness'].default_value=rough
    p.inputs['Specular IOR Level'].default_value=.3
    if grain:
        tex=nt.nodes.new('ShaderNodeTexNoise')
        tex.inputs['Scale'].default_value=scale
        tex.inputs['Detail'].default_value=3
        bump=nt.nodes.new('ShaderNodeBump')
        bump.inputs['Strength'].default_value=grain
        bump.inputs['Distance'].default_value=.005
        nt.links.new(tex.outputs['Fac'],bump.inputs['Height'])
        nt.links.new(bump.outputs['Normal'],p.inputs['Normal'])
        ramp=nt.nodes.new('ShaderNodeValToRGB')
        ramp.color_ramp.elements[0].color=(*(c*.58 for c in color),1)
        ramp.color_ramp.elements[1].color=(*(min(1,c*1.18) for c in color),1)
        nt.links.new(tex.outputs['Fac'],ramp.inputs[0])
        nt.links.new(ramp.outputs[0],p.inputs['Base Color'])
    return m


def sphere(name, loc, size, material, segments=28):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=segments,ring_count=16,location=loc)
    o=bpy.context.object
    o.name=name
    o.scale=size
    o.data.materials.append(material)
    for p in o.data.polygons:
        p.use_smooth=True
    return o


def capsule(name,a,b,r,material,ratio=1):
    a,b=Vector(a),Vector(b)
    o=sphere(name,(a+b)/2,(r,r*ratio,(a-b).length/2+r*.4),material)
    o.rotation_euler=(b-a).to_track_quat('Z','Y').to_euler()
    return o


def curves(name, strands, radius, material, parent=None):
    d=bpy.data.curves.new(name,'CURVE')
    d.dimensions='3D'
    d.resolution_u=2
    d.bevel_depth=radius
    d.bevel_resolution=1
    for strand in strands:
        s=d.splines.new('POLY')
        s.points.add(len(strand)-1)
        for i,(point,co) in enumerate(zip(s.points,strand)):
            point.co=(*co,1)
            point.radius=max(.08,1-i/(len(strand)-.5))
    o=bpy.data.objects.new(name,d)
    bpy.context.scene.collection.objects.link(o)
    d.materials.append(material)
    o.parent=parent
    return o


def cube(name,loc,size,material,bevel=.015):
    bpy.ops.mesh.primitive_cube_add(size=1,location=loc)
    o=bpy.context.object
    o.name=name
    o.scale=size
    bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
    o.data.materials.append(material)
    if bevel:
        b=o.modifiers.new('Worn edges','BEVEL')
        b.width=bevel
        b.segments=2
        o.modifiers.new('Normals','WEIGHTED_NORMAL')
    return o


def empty(name):
    o=bpy.data.objects.new(name,None)
    bpy.context.scene.collection.objects.link(o)
    return o


def smooth(t):
    t=max(0,min(1,t))
    return t*t*(3-2*t)


def bone_parent(o,rig,bone):
    bpy.context.view_layer.update()
    matrix=o.matrix_world.copy()
    o.parent=rig
    o.parent_type='BONE'
    o.parent_bone=bone
    o.matrix_world=matrix


def fuse(parts,name,voxel=.013):
    bpy.ops.object.select_all(action='DESELECT')
    for o in parts:
        o.select_set(True)
    bpy.context.view_layer.objects.active=parts[0]
    bpy.ops.object.join()
    o=bpy.context.object
    o.name=name
    bpy.ops.object.transform_apply(location=True,rotation=True,scale=True)
    m=o.modifiers.new('Continuous anatomical skin','REMESH')
    m.mode='VOXEL'
    m.voxel_size=voxel
    m.use_smooth_shade=True
    bpy.ops.object.modifier_apply(modifier=m.name)
    m=o.modifiers.new('Relax skin','SMOOTH')
    m.factor=1.1
    m.iterations=7
    bpy.ops.object.modifier_apply(modifier=m.name)
    return o


def short_fur(o,material,count=24000,length=.007):
    bpy.ops.object.select_all(action='DESELECT')
    o.select_set(True)
    bpy.context.view_layer.objects.active=o
    bpy.ops.object.particle_system_add()
    ps=o.particle_systems[-1]
    ps.seed=73
    s=ps.settings
    s.type='HAIR'
    s.render_type='PATH'
    s.count=count
    s.hair_length=length
    s.hair_step=2
    s.root_radius=.48
    s.tip_radius=.06
    s.radius_scale=.0012
    s.use_modifier_stack=True
    s.child_type='NONE'
    o.data.materials.append(material)
    s.material=len(o.data.materials)


def hoof_mesh(name,position,material,ox=False):
    x,y,z=position
    n=24
    verts=[]
    for zz,rx,ry,shift in [(0,.094,.071,.025),(.11,.067,.060,0),(.155,.048,.044,-.018)]:
        for i in range(n):
            a=2*math.pi*i/n
            verts.append((x+shift+rx*math.cos(a),y+ry*math.sin(a),z+zz))
    faces=[tuple(reversed(range(n)))]
    for row in range(2):
        for i in range(n):
            j=(i+1)%n
            faces.append((row*n+i,row*n+j,(row+1)*n+j,(row+1)*n+i))
    faces.append(tuple(range(2*n,3*n)))
    return mesh(name,verts,faces,[material])


def character(actor):
    ox=actor['asset']=='ox-v2'
    scale=1.6 if ox else 1.3 if actor['asset']=='mother-v2' else 1
    rng=random.Random(63 if ox else 31)
    root=empty(actor['id']+' naturalistic root')
    root['asset_id']=actor['asset']
    root['version']=2
    root['units']='m; Z up; forward +X'
    root['provenance']='Original procedural anatomy, skin, rig and grooming; Movie Studio'
    coat=mat('Chestnut short coat v2' if not ox else 'Ox warm grey coat v2',(.085,.025,.009) if not ox else (.11,.095,.072),.79,.22,150)
    p=coat.node_tree.nodes.get('Principled BSDF')
    p.inputs['Sheen Weight'].default_value=.24
    p.inputs['Sheen Roughness'].default_value=.65
    p.inputs['Subsurface Weight'].default_value=0
    p.inputs['Specular IOR Level'].default_value=.16
    hairmat=mat('Dark chestnut strands',(.038,.019,.011),.44,.03,200)
    muzzle=mat('Velvet muzzle',(.084,.057,.042),.76,.18,220)
    horn=mat('Weathered hoof horn',(.058,.046,.032),.66,.22,115)
    iris=mat('Umber iris',(.067,.040,.014),.18)
    pupil=mat('Moist dark eye',(.005,.004,.003),.10)
    nostril=mat('Nostril and lip recess',(.016,.010,.008),.77)
    cream=mat('Ivory forehead hair',(.73,.69,.57),.73,.12,180)
    arm=bpy.data.armatures.new(actor['id']+' natural skeleton')
    rig=bpy.data.objects.new(actor['id']+' deform rig v2',arm)
    bpy.context.scene.collection.objects.link(rig)
    rig.parent=root
    bpy.ops.object.select_all(action='DESELECT')
    rig.select_set(True)
    bpy.context.view_layer.objects.active=rig
    bpy.ops.object.mode_set(mode='EDIT')
    def bone(name,a,b,parent=None):
        e=arm.edit_bones.new(name)
        e.head,e.tail=a,b
        if parent:e.parent=arm.edit_bones[parent]
    bone('body',(0,0,1.05),(0,0,1.4))
    bone('head',(.63,0,1.70),(.85,0,2.08),'body')
    bone('tail',(-.76,0,1.45),(-1.01,0,.43),'body')
    legs=[]
    for front,x in [(True,.43),(False,-.57)]:
        for side,y in [('near',-.19),('far',.19)]:
            label=('front-' if front else 'back-')+side
            a=(x,y,1.16)
            b=(x+(-.015 if front else -.075),y,.61)
            c=(x+.045,y,.15)
            bone(label+'-upper',a,b,'body')
            bone(label+'-lower',b,c,label+'-upper')
            bone(label+'-foot',c,(c[0]+.17,y,c[2]),label+'-lower')
            legs.append((label,a,b,c,front))
    bpy.ops.object.mode_set(mode='OBJECT')
    skin=[]
    def s(name,loc,sz):
        o=sphere(name,loc,sz,coat)
        skin.append(o)
        return o
    def link(name,a,b,r,ratio=1):
        o=capsule(name,a,b,r,coat,ratio)
        skin.append(o)
        return o
    s('Rib cage',(-.10,0,1.29),(.64,.26 if not ox else .37,.33))
    s('Hindquarter',(-.56,0,1.34),(.29,.27 if not ox else .34,.34))
    s('Chest',(.39,0,1.31),(.24,.25 if not ox else .36,.35))
    s('Withers',(.27,0,1.53),(.25,.165,.15))
    link('Lower neck',(.39,0,1.39),(.62,0,1.79),.20,.9)
    link('Crest',(.59,0,1.67),(.74,0,2.02 if not ox else 1.82),.145,.82)
    if not ox:
        s('Skull',(.84,0,2.035),(.19,.132,.19))
        s('Jaw',(.94,0,1.88),(.16,.135,.18))
        link('Nasal bridge',(.93,0,2.015),(1.24,0,1.69),.105,1.04)
        s('Muzzle skin',(1.27,0,1.655),(.146,.122,.105))
    else:
        s('Broad ox skull',(.86,0,1.90),(.24,.245,.23))
        link('Ox face',(.99,0,1.82),(1.23,0,1.61),.17,1.2)
        s('Ox muzzle',(1.26,0,1.57),(.18,.22,.13))
        s('Dewlap',(.53,0,1.14),(.15,.13,.27))
    targets=[]
    hooves=[]
    for label,a,b,c,front in legs:
        x,y,_=a
        if front:
            s('Scapular muscle',(.35,y*.76,1.34),(.19,.15,.28))
            link('Upper forearm',a,(x-.035,y,.83),.080)
            link('Forearm tendon',(x-.035,y,.87),b,.060)
        else:
            s('Thigh',(-.52,y*.8,1.24),(.205,.155,.285))
            link('Stifle',(-.52,y,1.14),(-.36,y,.92),.11)
            link('Gaskin',(-.36,y,.94),b,.073)
        s('Carpus or hock',b,(.063,.055,.073))
        link('Cannon',b,(c[0]-.018,y,.225),.040)
        s('Fetlock',(c[0]-.018,y,.215),(.060,.052,.067))
        link('Pastern',(c[0]-.018,y,.22),(c[0]+.012,y,.105),.041)
        hooves.append((hoof_mesh(label+' hoof',(c[0]+.015,y,0),horn,ox),label+'-foot'))
        target=empty(label+' ground target')
        target.parent=root
        target.location=c
        con=rig.pose.bones[label+'-lower'].constraints.new('IK')
        con.target=target
        con.chain_count=2
        con.use_stretch=False
        # Keep the hoof sole horizontal independently of the leg chain.
        con=rig.pose.bones[label+'-foot'].constraints.new('COPY_ROTATION')
        con.target=root
        targets.append((label,target,Vector(c)))
    surface=fuse(skin,actor['id']+' continuous skin',.011)
    # Spatially blend deformation groups across joints; no visible segmented limbs.
    groups={b.name:surface.vertex_groups.new(name=b.name) for b in arm.bones}
    for v in surface.data.vertices:
        x,y,z=v.co
        weights={'body':1.0}
        if z<1.23 and abs(y)>.10 and (x<-.27 or x>.23):
            leg=('front-' if x>.0 else 'back-')+('near' if y<0 else 'far')
            lower=1-smooth((z-.51)/.20)
            limb=1-smooth((z-1.0)/.24)
            weights={'body':1-limb,leg+'-upper':limb*(1-lower),leg+'-lower':limb*lower}
        if z>1.62 and x>.57:
            h=smooth((z-1.68)/.22)*smooth((x-.57)/.13)
            weights={'body':1-h,'head':h}
        for name,weight in weights.items():
            if weight>.001:groups[name].add([v.index],weight,'REPLACE')
    mod=surface.modifiers.new('Smooth skinned skeleton','ARMATURE')
    mod.object=rig
    mod.use_deform_preserve_volume=True
    surface.parent=rig
    # Eye sockets, narrow lids, nostrils and lip line are separate editable geometry.
    for sign in [-1,1]:
        epos=(.957,sign*.127,2.065) if not ox else (.98,sign*.222,1.956)
        o=sphere('Natural lateral eye',epos,(.032,.021,.024),iris)
        bone_parent(o,rig,'head')
        o=sphere('Horizontal pupil',(epos[0]+.004,epos[1]+sign*.015,epos[2]),(.020,.008,.011),pupil)
        bone_parent(o,rig,'head')
        lid=[]
        for i in range(13):
            a=2*math.pi*i/12
            lid.append((epos[0]+.035*math.cos(a),epos[1]+sign*.005,epos[2]+.027*math.sin(a)))
        o=curves('Soft eyelid',[lid],.006,coat)
        bone_parent(o,rig,'head')
        pos=(1.32,sign*.111,1.69) if not ox else (1.35,sign*.18,1.61)
        o=sphere('Nostril',pos,(.037,.011,.022),nostril)
        o.rotation_euler.x=sign*.28
        bone_parent(o,rig,'head')
        line=[(1.37,sign*.066,1.605),(1.30,sign*.112,1.586),(1.20,sign*.107,1.618)]
        o=curves('Lip crease',[line],.0028,nostril)
        bone_parent(o,rig,'head')
        # Flattened, pointed pinna rather than a rounded cartoon capsule.
        base=Vector((.737,sign*.086,2.17)) if not ox else Vector((.72,sign*.20,1.97))
        tip=base+Vector((-.055,sign*.070,.235)) if not ox else base+Vector((-.07,sign*.22,-.015))
        u=Vector((.065,0,0))
        mid=base.lerp(tip,.5)
        verts=[base-u*.45,base+u*.45,mid+u*.62,tip,mid-u*.62,mid+Vector((0,-sign*.022,0))]
        o=mesh('Thin pinna',[tuple(p) for p in verts],[(0,1,5),(1,2,5),(2,3,5),(3,4,5),(4,0,5)],[coat,muzzle])
        for poly in o.data.polygons:poly.material_index=1
        solid=o.modifiers.new('Ear thickness','SOLIDIFY');solid.thickness=.006
        sub=o.modifiers.new('Ear surface','SUBSURF');sub.levels=2
        bone_parent(o,rig,'head')
    if not ox:
        # A surface-conforming forehead diamond, never a floating white sticker.
        bvh=BVHTree.FromPolygons([v.co for v in surface.data.vertices],[list(p.vertices) for p in surface.data.polygons])
        marks=[]
        for y,z in [(0,2.104),(-.034,2.065),(0,2.001),(.034,2.065),(0,2.063)]:
            hit,normal,_,_=bvh.ray_cast(Vector((2,y,z)),Vector((-1,0,0)))
            if hit is not None:marks.append(tuple(hit+normal*.0025))
        if len(marks)==5:
            o=mesh('Forehead diamond',marks,[(0,1,4),(1,2,4),(2,3,4),(3,0,4)],[cream])
            bone_parent(o,rig,'head')
        strands=[]
        for i in range(1050):
            u=rng.random()
            start=Vector((.28+.40*u,rng.uniform(-.035,-.02),1.70+.51*u))
            fall=rng.uniform(.13,.23)
            strands.append([tuple(start+Vector((-.025*t,-.02-.19*t,-fall*t+.035*math.sin(t*math.pi)))) for t in [0,.25,.5,.75,1]])
        mane=curves('Individually groomed mane',strands,.0018,hairmat)
        bone_parent(mane,rig,'body')
    else:
        for sign in [-1,1]:
            pts=[(.72,sign*.15,2.07),(.68,sign*.30,2.10),(.65,sign*.40,2.20),(.64,sign*.43,2.31)]
            o=curves('Tapered ox horn',[pts],.052,cream)
            bone_parent(o,rig,'head')
    strands=[]
    for i in range(900 if not ox else 180):
        a=rng.random()*math.tau
        r=math.sqrt(rng.random())*.045
        length=rng.uniform(.77,1.02)
        start=Vector((-.79,math.cos(a)*r,1.44+math.sin(a)*r))
        strands.append([tuple(start+Vector((-.17*t+.035*math.sin(t*4+a),.05*math.sin(t*2+a)*t,-length*t))) for t in [0,.2,.4,.6,.8,1]])
    tail=curves('Groomed tail hair',strands,.0017,hairmat)
    bone_parent(tail,rig,'tail')
    for o,bone in hooves:bone_parent(o,rig,bone)
    short_fur(surface,coat,32000,.006 if not ox else .014)
    if actor['bag']:
        cloth=mat('Rough flax weave',(.40,.31,.17),.92,.32,220)
        tie=mat('Faded teal twisted rope',(.034,.09,.075),.9,.24,140)
        sack=sphere('Uneven woven wheat sack',(-.22,0,1.67),(.35,.27,.175),cloth,40)
        # Cloth is shaped geometry; noise changes the silhouette as well as normals.
        bpy.ops.object.select_all(action='DESELECT');sack.select_set(True);bpy.context.view_layer.objects.active=sack
        bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
        tex=bpy.data.textures.new('Small cloth wrinkles',type='CLOUDS');tex.noise_scale=.055
        disp=sack.modifiers.new('Cloth folds','DISPLACE');disp.texture=tex;disp.strength=.016
        bone_parent(sack,rig,'body')
        for offset in [-.012,.012]:
            pts=[(-.27+offset,-.25,1.60),(-.27+offset,-.18,1.80),(-.27+offset,.13,1.82),(-.27+offset,.27,1.63)]
            rope=curves('Wheat bag tie',[pts],.007,tie);bone_parent(rope,rig,'body')
        pts=[(-.27,-.27,1.52),(-.28,-.275,1.12),(-.28,0,.985),(-.28,.275,1.12),(-.27,.27,1.52)]
        rope=curves('Sack girth',[pts],.009,tie);bone_parent(rope,rig,'body')
    root.location=actor['position']
    root.rotation_euler.z=math.radians(actor['heading'])
    root.scale=(scale,)*3
    return root,rig,targets,scale


def shore(y):
    return 2.0+.12*math.sin(y*.7)+.12*math.sin(y*.22)


def sourced_horse(actor):
    """A fixed, attributed mesh asset; never imports executable source .blend data."""
    folder=Path(__file__).resolve().parents[2]/'assets'/'3d'/'jjmoser-horse'
    source=json.loads((folder/'mesh.json').read_text(encoding='utf8'))
    root=empty(actor['id']+' sourced horse root')
    root['asset_id']=actor['asset'];root['asset_version']=3
    root['provenance']='Horse lowpoly by jjmoser, CC-BY-3.0; experimental Studio rig and materials'
    scale=1.3 if actor['asset']=='mother-v3' else 1
    coat=mat('jjmoser albedo / Studio PBR',(.20,.1,.04),.80)
    nt=coat.node_tree;p=nt.nodes.get('Principled BSDF')
    p.inputs['Specular IOR Level'].default_value=.24
    p.inputs['Sheen Weight'].default_value=.20
    p.inputs['Sheen Roughness'].default_value=.78
    albedo=nt.nodes.new('ShaderNodeTexImage');albedo.image=bpy.data.images.load(str(folder/'albedo.png'),check_existing=True)
    # The licensed diffuse texture contains painted lighting. Compress that
    # contrast on the coat; preserve muzzle, eyes, hooves and mane with a mask.
    coatmask=nt.nodes.new('ShaderNodeAttribute');coatmask.attribute_name='CoatMask'
    blend=nt.nodes.new('ShaderNodeMixRGB');blend.blend_type='MIX'
    nt.links.new(coatmask.outputs['Fac'],blend.inputs[0])
    nt.links.new(albedo.outputs['Color'],blend.inputs[1])
    blend.inputs[2].default_value=(.19,.074,.029,1)
    nt.links.new(blend.outputs[0],p.inputs['Base Color'])
    nt.links.new(albedo.outputs['Alpha'],p.inputs['Alpha'])
    normal=nt.nodes.new('ShaderNodeTexImage');normal.image=bpy.data.images.load(str(folder/'normal.png'),check_existing=True);normal.image.colorspace_settings.name='Non-Color'
    decode=nt.nodes.new('ShaderNodeNormalMap');decode.inputs['Strength'].default_value=.20
    nt.links.new(normal.outputs['Color'],decode.inputs['Color'])
    grain=nt.nodes.new('ShaderNodeTexNoise');grain.inputs['Scale'].default_value=260;grain.inputs['Detail'].default_value=2
    bump=nt.nodes.new('ShaderNodeBump');bump.inputs['Strength'].default_value=.12;bump.inputs['Distance'].default_value=.002
    nt.links.new(grain.outputs['Fac'],bump.inputs['Height']);nt.links.new(decode.outputs[0],bump.inputs['Normal']);nt.links.new(bump.outputs[0],p.inputs['Normal'])
    surface=mesh(actor['id']+' attributed continuous mesh',source['vertices'],source['faces'],[coat])
    mask=surface.data.attributes.new('CoatMask','FLOAT','POINT')
    for v,value in zip(surface.data.vertices,mask.data):
        x,y,z=v.co
        trunk=smooth((z-.19)/.25)*(1-smooth((x-.52)/.38))*(1-smooth((-x-1.02)/.18))
        value.value=.62*trunk
    uv=surface.data.uv_layers.new(name='SourceUV')
    for loop,coord in zip(uv.data,source['uv']):loop.uv=coord
    surface.parent=root
    arm=bpy.data.armatures.new(actor['id']+' sourced skeleton')
    rig=bpy.data.objects.new(actor['id']+' sourced deform rig',arm);bpy.context.scene.collection.objects.link(rig);rig.parent=root
    bpy.ops.object.select_all(action='DESELECT');rig.select_set(True);bpy.context.view_layer.objects.active=rig;bpy.ops.object.mode_set(mode='EDIT')
    def bone(name,a,b,parent=None):
        o=arm.edit_bones.new(name);o.head,o.tail=a,b
        if parent:o.parent=arm.edit_bones[parent]
    bone('body',(-.15,0,1.1),(-.15,0,1.55))
    bone('head',(.53,0,1.52),(1.0,0,1.60),'body')
    for side,sign in [('near',-1),('far',1)]:
        bone('ear-'+side,(.69,sign*.09,1.84),(.66,sign*.13,2.04),'head')
    bone('tail',(-1.04,0,1.53),(-1.10,0,.5),'body')
    legs=[]
    for front,x in [(True,.48),(False,-.88)]:
        for side,y in [('near',-.20),('far',.20)]:
            name=('front-' if front else 'back-')+side
            a=(x if front else -.61,y,1.25)
            b=(x-.015 if front else -.81,y,.57)
            c=(x,y,.14)
            bone(name+'-upper',a,b,'body');bone(name+'-lower',b,c,name+'-upper');bone(name+'-foot',c,(x+.14,y,.14),name+'-lower')
            legs.append((name,c))
    bpy.ops.object.mode_set(mode='OBJECT')
    targets=[]
    for name,c in legs:
        o=empty(name+' source foot target');o.parent=root;o.location=c
        con=rig.pose.bones[name+'-lower'].constraints.new('IK');con.target=o;con.chain_count=2;con.use_stretch=False
        con.iterations=128
        upper=arm.bones[name+'-upper'];joint=arm.bones[name+'-lower'].head_local
        pole=empty(name+' knee direction');pole.parent=root
        pole.location=(upper.head_local.x-1.5,upper.head_local.y,upper.head_local.z-.4)
        con.pole_target=pole
        best=None
        for angle in [0,math.pi/2,-math.pi/2,math.pi]:
            con.pole_angle=angle;bpy.context.view_layer.update()
            error=(rig.pose.bones[name+'-lower'].head-joint).length
            if best is None or error<best[0]:best=(error,angle)
        con.pole_angle=best[1]
        o.rotation_mode='QUATERNION';o.rotation_quaternion=rig.data.bones[name+'-foot'].matrix_local.to_quaternion()
        level=rig.pose.bones[name+'-foot'].constraints.new('COPY_ROTATION');level.target=o
        targets.append((name,o,Vector(c)))
    groups={b.name:surface.vertex_groups.new(name=b.name) for b in arm.bones}
    for v in surface.data.vertices:
        x,y,z=v.co;weights={'body':1}
        if z<1.26 and (x>.16 or x<-.43):
            name=('front-' if x>0 else 'back-')+('near' if y<0 else 'far')
            limb=1-smooth((z-.94)/.32);lower=1-smooth((z-.48)/.22);foot=1-smooth((z-.10)/.14)
            weights={'body':1-limb,name+'-upper':limb*(1-lower),name+'-lower':limb*lower*(1-foot),name+'-foot':limb*lower*foot}
        elif x>.4 and z>1.24:
            h=smooth((x-.4)/.35);weights={'body':1-h,'head':h}
        elif x<-1.02:
            h=smooth((-x-1.02)/.15);weights={'body':1-h,'tail':h}
        if z>1.84 and x<.86:
            ear=smooth((z-1.84)/.095)
            weights={'head':1-ear,'ear-'+('near' if y<0 else 'far'):ear}
        for name,weight in weights.items():
            if weight>.001:groups[name].add([v.index],weight,'REPLACE')
    armature=surface.modifiers.new('Studio articulated skin','ARMATURE');armature.object=rig;armature.use_deform_preserve_volume=True
    sub=surface.modifiers.new('Smooth source topology','SUBSURF');sub.levels=2;sub.render_levels=2
    # Character identity and props remain separate from the licensed skin.
    linen=mat('Natural flax sack',(.31,.245,.135),.94,.40,200)
    rope=mat('Faded teal cord',(.025,.074,.062),.88,.2,130)
    if actor['bag']:
        # Shape the lower cloth to the actual back surface, then attach it as one
        # prop. A sphere and straight hanging cord looked like a floating pill.
        back=BVHTree.FromPolygons([v.co for v in surface.data.vertices],[list(p.vertices) for p in surface.data.polygons])
        prop=empty(actor['id']+' wheat bag attachment')
        prop['role']='wheat-bag';prop['actor_id']=actor['id']
        verts=[];faces=[];n=40;rings=21
        for j in range(rings):
            phi=-math.pi/2+math.pi*(j+.01)/(rings-.98)
            for i in range(n):
                theta=math.tau*i/n
                x=-.25+.32*math.cos(phi)*math.cos(theta)
                y=.265*math.cos(phi)*math.sin(theta)
                hit,_,_,_=back.ray_cast(Vector((x,y,2.2)),Vector((0,0,-1)))
                base=hit.z if hit is not None else 1.43
                z=max(base+.018,1.645+.14*math.sin(phi))
                z+=.007*math.sin(theta*8+phi*2)*math.cos(phi)
                verts.append((x,y,z))
        for j in range(rings-1):
            for i in range(n):
                a=j*n+i;b=j*n+(i+1)%n;faces.append((a,b,b+n,a+n))
        sack=mesh('Draped woven wheat sack',verts,faces,[linen]);sack.parent=prop
        sub=sack.modifiers.new('Cloth subdivision','SUBSURF');sub.levels=1
        knot=sphere('Gathered sack neck',(.075,0,1.62),(.065,.075,.06),linen);knot.parent=prop
        curves('Sack neck tie',[[(.076,.074*math.cos(k*math.tau/32),1.62+.059*math.sin(k*math.tau/32)) for k in range(33)]],.004,rope,prop)
        for y in [-.20,.20]:
            pts=[(-.25+.26*math.cos(k*math.pi/16),y,1.61+.095*math.sin(k*math.pi/16)) for k in range(17)]
            curves('Sack stitched seam',[pts],.003,rope,prop)
        for offset in [-.013,.013]:
            pts=[]
            for k in range(65):
                angle=math.tau*k/64
                # Girth follows the flank cross section rather than dangling.
                y=.26*math.sin(angle);z=1.21+.34*math.cos(angle)
                pts.append((-.26+offset,y,z))
            girth=curves('Saddle girth cord',[pts],.005,rope)
            bone_parent(girth,rig,'body')
        bone_parent(prop,rig,'body')
        prop['rest_location']=list(prop.location)
        prop['rest_rotation']=list(prop.rotation_euler)
    root.location=actor['position'];root.rotation_euler.z=math.radians(actor['heading']);root.scale=(scale,)*3
    return root,rig,targets,scale


def squirrel(actor):
    rng=random.Random(73)
    root=empty(actor['id']+' natural squirrel root')
    fur=mat('Squirrel russet guard hairs',(.23,.085,.024),.65,.10,180)
    dark=mat('Squirrel eyes and claws',(.009,.006,.004),.23)
    pieces=[sphere('Squirrel thorax',(0,0,.27),(.095,.09,.17),fur),sphere('Squirrel haunch',(-.04,0,.15),(.12,.105,.12),fur),sphere('Squirrel skull',(.07,0,.44),(.10,.08,.095),fur),sphere('Squirrel muzzle',(.16,0,.411),(.065,.051,.04),fur)]
    for sign in [-1,1]:
        pieces.append(capsule('Squirrel foreleg',(.045,sign*.07,.30),(.13,sign*.06,.19),.023,fur))
        pieces.append(capsule('Squirrel hindfoot',(-.02,sign*.07,.07),(.12,sign*.075,.025),.028,fur))
        pieces.append(sphere('Squirrel pinna',(.05,sign*.054,.533),(.035,.021,.058),fur))
    o=fuse(pieces,'Continuous squirrel skin',.005)
    surface=o
    arm=bpy.data.armatures.new(actor['id']+' reaction skeleton')
    rig=bpy.data.objects.new(actor['id']+' reaction rig',arm);bpy.context.scene.collection.objects.link(rig);rig.parent=root
    bpy.ops.object.select_all(action='DESELECT');rig.select_set(True);bpy.context.view_layer.objects.active=rig;bpy.ops.object.mode_set(mode='EDIT')
    for name,a,b,parent in [
        ('body',(-.02,0,.10),(0,0,.30),None),
        ('head',(.02,0,.35),(.14,0,.44),'body'),
        ('tail',(-.10,0,.10),(-.20,0,.55),'body'),
        ('paw-near',(.045,-.07,.30),(.13,-.06,.19),'body'),
        ('paw-far',(.045,.07,.30),(.13,.06,.19),'body')]:
        bone=arm.edit_bones.new(name);bone.head=a;bone.tail=b
        if parent:bone.parent=arm.edit_bones[parent]
    bpy.ops.object.mode_set(mode='OBJECT')
    groups={b.name:surface.vertex_groups.new(name=b.name) for b in arm.bones}
    for v in surface.data.vertices:
        x,y,z=v.co;head=smooth((z-.34)/.07);weights={'head':head,'body':1-head}
        if .17<z<.33 and x>.055:
            paw=smooth((x-.055)/.06)*(1-head);weights={'head':head,'body':1-head-paw,'paw-'+('near' if y<0 else 'far'):paw}
        for name,w in weights.items():
            if w>.001:groups[name].add([v.index],w,'REPLACE')
    deform=surface.modifiers.new('Reaction skin','ARMATURE');deform.object=rig
    surface.parent=root;short_fur(surface,fur,15000,.016)
    for sign in [-1,1]:
        o=sphere('Small squirrel eye',(.119,sign*.072,.459),(.015,.010,.014),dark);bone_parent(o,rig,'head')
        for j in range(4):
            pts=[(.13,sign*(.047+j*.012),.04),(.17,sign*(.047+j*.013),.019)]
            curves('Fine squirrel toes',[pts],.003,dark,root)
    o=sphere('Squirrel nose',(.212,0,.424),(.012,.018,.01),dark);bone_parent(o,rig,'head')
    strands=[]
    for i in range(2300):
        u=rng.random();a=rng.random()*math.tau;r=rng.uniform(.035,.075)
        center=Vector((-.10-.16*math.sin(u*math.pi),0,.10+u*.55))
        strands.append([tuple(center+Vector((math.cos(a)*r*t,math.sin(a)*r*t,.04*t))) for t in [0,.4,.7,1]])
    tail=curves('Bushy guard-hair tail',strands,.0011,fur);bone_parent(tail,rig,'tail')
    root.location=actor['position'];root.rotation_euler.z=math.radians(actor['heading'])
    return root,rig,[],1


def ground(x,y):
    a=abs(x)-shore(y)
    # A broad shallow ford along the crossing axis avoids an abrupt 43 cm step.
    ford=math.exp(-(y/1.55)**4)
    width=.52+.95*ford
    bank=smooth((a+.48)/width)
    fine=.008*math.sin(x*8+y*5)*math.sin(y*7-x*3)
    inland=max(0,abs(x)-7)*.033
    return -.17+.43*bank+fine+inland


def contact_height(x,y):
    # The shallow approach includes a persistent, visible stepping stone.
    radius=((x+1.59)/.23)**2+((y+.20)/.20)**2
    return max(ground(x,y),-.035+.12*math.sqrt(1-radius)) if radius<1 else ground(x,y)


def environment(seed,kind):
    rng=random.Random(seed)
    soil=mat('Moist silt and earth',(.115,.085,.048),.96,.65,38)
    gravel=mat('River gravel',(.245,.232,.192),.75,.62,85)
    sphere('Shallow approach stepping stone',(-1.59,-.20,-.035),(.23,.20,.12),gravel,32)
    bark=mat('Weathered bark',(.115,.078,.042),.93,.8,27)
    grasses=[mat('Grass variation '+str(i),c,.82,.14,95) for i,c in enumerate([(.070,.110,.021),(.115,.148,.032),(.168,.187,.056),(.23,.22,.088),(.06,.105,.028)])]
    leaves=[mat('Leaf variation '+str(i),c,.64,.16,160) for i,c in enumerate([(.055,.092,.017),(.11,.15,.03),(.16,.19,.048),(.08,.115,.027)])]
    for m in leaves:
        p=m.node_tree.nodes.get('Principled BSDF');p.inputs['Subsurface Weight'].default_value=.08
    # Continuous river banks with a shallow approach, small erosion and no slab edges.
    nx,ny=161,191
    verts=[(-20+i*.25,-12+j*.4,ground(-20+i*.25,-12+j*.4)) for j in range(ny) for i in range(nx)]
    faces=[(j*nx+i,j*nx+i+1,(j+1)*nx+i+1,(j+1)*nx+i) for j in range(ny-1) for i in range(nx-1)]
    land=mesh('Continuous irregular river terrain',verts,faces,[soil,grasses[2],gravel])
    for p in land.data.polygons:
        c=p.center
        p.material_index=1 if abs(c.x)>shore(c.y)+.3 else 2
    # True blades, rendered in a few meshes rather than hundreds of thousands of objects.
    verts=[];faces=[];indices=[]
    for i in range(37000):
        x=rng.uniform(-15,15);y=rng.uniform(-9,34)
        if abs(x)<shore(y)+.20:continue
        if (x<-4 and abs(y-1.2)<.46) or (x>3.3 and abs(y-2.3)<.42):continue
        if abs(x)<4 and rng.random()<.35:continue
        z=ground(x,y)
        h=rng.uniform(.065,.28)*(1+.45*math.sin(x*3+y*2)**2)
        angle=rng.random()*math.tau
        width=rng.uniform(.003,.010)
        side=Vector((math.cos(angle)*width,math.sin(angle)*width,0))
        base=Vector((x,y,z))
        mid=base+Vector((math.sin(angle)*h*.13,math.cos(angle)*h*.13,h*.58))
        tip=base+Vector((math.sin(angle)*h*.32,math.cos(angle)*h*.32,h))
        k=len(verts);verts.extend([tuple(base-side),tuple(base+side),tuple(mid+side*.6),tuple(mid-side*.6),tuple(tip)])
        faces.extend([(k,k+1,k+2,k+3),(k+3,k+2,k+4)])
        indices.extend([rng.randrange(len(grasses))]*2)
    grass=mesh('Clustered meadow blades',verts,faces,grasses)
    for p,index in zip(grass.data.polygons,indices):p.material_index=index
    # Irregular stones near and under the water; flattened individual geology.
    for i in range(270):
        x=rng.uniform(-2.6,2.6);y=rng.uniform(-7,21)
        r=rng.uniform(.018,.135)
        rock=sphere('Wet river stone',(x,y,ground(x,y)+r*.17),(r,r*rng.uniform(.65,1.5),r*.45),gravel,12)
        rock.rotation_euler=(rng.random()*.2,rng.random()*.3,rng.random()*math.tau)
    # Branching trees with individually shaped leaves, no opaque ball canopies.
    def tree(x,y,height):
        z=ground(x,y)
        trunk=[(x,y,z),(x+.07,y-.04,z+height*.35),(x-.06,y+.08,z+height*.72),(x+.02,y,z+height)]
        curves('Tapered trunk',[trunk],height*.028,bark)
        branches=[];lv=[];lf=[];li=[]
        for j in range(33):
            angle=j*2.399+rng.uniform(-.35,.35)
            level=rng.uniform(.36,.95)
            length=height*rng.uniform(.19,.39)*(1.3-level*.6)
            start=Vector((x,y,z+height*level))
            end=start+Vector((math.cos(angle)*length,math.sin(angle)*length,length*.2))
            middle=start.lerp(end,.56)+Vector((0,0,.13))
            branches.append([tuple(start),tuple(middle),tuple(end)])
            for k in range(115):
                c=start.lerp(end,rng.uniform(.48,1.1))+Vector((rng.uniform(-.35,.35),rng.uniform(-.35,.35),rng.uniform(-.24,.42)))
                a=rng.random()*math.tau;ll=rng.uniform(.045,.105)
                u=Vector((math.cos(a)*ll,math.sin(a)*ll,rng.uniform(-.035,.035)))
                v=Vector((-math.sin(a)*ll*.32,math.cos(a)*ll*.32,.008))
                n=len(lv);lv.extend([tuple(c-u),tuple(c+v),tuple(c+u),tuple(c-v),tuple(c+Vector((0,0,.012)))])
                lf.extend([(n,n+1,n+4),(n+1,n+2,n+4),(n+2,n+3,n+4),(n+3,n,n+4)]);li.extend([rng.randrange(4)]*4)
        curves('Secondary branches',branches,.033,bark)
        o=mesh('Individual deciduous leaves',lv,lf,leaves)
        for p,i in zip(o.data.polygons,li):p.material_index=i
    for x,y,h in [(-6,7,5),(-4,12,5.8),(4.4,10,6),(7,8,5.5),(-8,2,5),(8,18,7),(-6,24,7),(4,28,8),(-11,16,6),(12,6,6),(-10,32,8),(10,36,8)]:tree(x,y,h)
    # Soft distant land keeps the horizon out of the river's vanishing point.
    for x,y,s in [(-15,44,12),(14,55,17),(-12,62,20)]:
        sphere('Distant wooded hill',(x,y,-2),(s,s*.7,6),grasses[0],40)
    watermat=mat('Clear shallow river',(.78,.88,.90),.11)
    nt=watermat.node_tree;p=nt.nodes.get('Principled BSDF')
    p.inputs['Transmission Weight'].default_value=1
    p.inputs['IOR'].default_value=1.333
    tex=nt.nodes.new('ShaderNodeTexNoise');tex.inputs['Scale'].default_value=9;tex.inputs['Detail'].default_value=3
    coord=nt.nodes.new('ShaderNodeTexCoord');stretch=nt.nodes.new('ShaderNodeVectorMath');stretch.operation='MULTIPLY';stretch.inputs[1].default_value=(1,2.7,1)
    flow=nt.nodes.new('ShaderNodeVectorMath');flow.name='River flow offset';flow.operation='ADD'
    nt.links.new(coord.outputs['Object'],flow.inputs[0]);nt.links.new(flow.outputs[0],stretch.inputs[0]);nt.links.new(stretch.outputs[0],tex.inputs['Vector'])
    bump=nt.nodes.new('ShaderNodeBump');bump.inputs['Strength'].default_value=.18;bump.inputs['Distance'].default_value=.025
    nt.links.new(tex.outputs['Fac'],bump.inputs['Height']);nt.links.new(bump.outputs[0],p.inputs['Normal'])
    water=mesh('Reflective flowing water',[(-3,-15,.145),(3,-15,.145),(3,70,.145),(-3,70,.145)],[(0,1,2,3)],[watermat])
    # Rustic buildings stay at the established locations.
    plaster=mat('Aged limestone plaster',(.46,.405,.31),.93,.6,65)
    wood=mat('Rough sawn oak',(.145,.09,.044),.89,.7,45)
    roof=mat('Dark weathered shingles',(.09,.070,.050),.86,.6,100)
    def building(x,y,w,d,h,label):
        cube(label+' plaster',(x,y,h/2+.25),(w,d,h),plaster,.025)
        for xx in [-w*.5,w*.5]:cube(label+' upright',(x+xx,y-d*.51,h/2+.23),(.13,.14,h+.14),wood,.015)
        cube(label+' door',(x,y-d*.51,.95),(.7,.1,1.5),wood)
        for j in range(7):cube('Door plank',(x-.30+j*.10,y-d*.54,.95),(.085,.035,1.46),wood,.003)
        for sign in [-1,1]:
            o=cube('Roof plane',(x+sign*w*.26,y,h+.25),(w*.65,d+ .45,.07),roof)
            o.rotation_euler.y=sign*.55
            for j in range(8):
                for k in range(9):
                    xx=sign*(j/8*w*.58)
                    zz=h+.58-abs(xx)*.61
                    o=cube('Overlapping roof shingle',(x+xx,y-d*.55+k/8*d*1.1,zz),(.19,.30,.022),roof,.005)
                    o.rotation_euler.y=sign*.55
        cube('Window recess',(x+w*.32,y-d*.515,1.8),(.36,.06,.5),wood)
    building(5.3,4,2.3,2.2,2.8,'Mill')
    building(-7,4,2.7,2.3,2.0,'Stable')
    hub=empty('Timber windmill rotor');hub.location=(5.3,2.74,2.75)
    for a in [0,math.pi/2,math.pi,math.pi*1.5]:
        for j in range(8):
            r=.42+j*.135
            o=cube('Windmill wooden slat',(5.3+math.sin(a)*r,2.69,2.75+math.cos(a)*r),(.32,.055,.105),wood,.006)
            o.rotation_euler.y=a
            matrix=o.matrix_world.copy();o.parent=hub;o.matrix_world=matrix
    cube('Delivery platform',(4.1,2.2,.40),(1.2,.9,.50),wood)
    return water,hub


def lighting():
    scene=bpy.context.scene
    scene.cycles.samples=64
    scene.cycles.max_bounces=8
    scene.world.use_nodes=True
    nt=scene.world.node_tree
    bg=nt.nodes.get('Background');bg.inputs['Strength'].default_value=.12
    sky=nt.nodes.new('ShaderNodeTexSky');sky.sky_type='NISHITA'
    sky.sun_elevation=math.radians(22);sky.sun_rotation=math.radians(128)
    sky.sun_intensity=.55;sky.air_density=1.15;sky.dust_density=1.5
    nt.links.new(sky.outputs[0],bg.inputs['Color'])
    for o in list(scene.objects):
        if o.type=='LIGHT':bpy.data.objects.remove(o,do_unlink=True)
    bpy.ops.object.light_add(type='SUN',location=(-6,-3,10))
    sun=bpy.context.object;sun.name='Low morning sun';sun.rotation_euler=(.7,-.55,-.45)
    sun.data.energy=1.6;sun.data.angle=.10;sun.data.color=(1,.93,.81)
    bpy.ops.object.light_add(type='AREA',location=(1,-6,5))
    fill=bpy.context.object;fill.name='Soft sky bounce';fill.data.energy=180;fill.data.shape='DISK';fill.data.size=8
    fill.data.color=(.70,.80,1)
    fill.rotation_euler=(Vector((0,0,1))-fill.location).to_track_quat('-Z','Y').to_euler()
    scene.view_settings.look='AgX - Medium High Contrast'
    scene.view_settings.exposure=-.45
