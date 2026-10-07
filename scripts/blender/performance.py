"""Deterministic, data-only physical performance channels. No Blender dependency."""
import math

CHANNELS = ('travel','headPitch','headYaw','bodyShift','bodyDrop','probeLift','probeReach','bagDrop')

def smooth(x):
    x=max(0,min(1,x))
    return x*x*(3-2*x)

def channel(keys,name,u,default):
    points=[p for p in keys if name in p]
    if not points:return default
    if u<=points[0]['k']:return points[0][name]
    for a,b in zip(points,points[1:]):
        if u<=b['k']:
            v=smooth((u-a['k'])/(b['k']-a['k']))
            return a[name]+(b[name]-a[name])*v
    return points[-1][name]

def pose(actor,u,t):
    action=actor['action']
    defaults=dict(travel=actor['travel']*smooth((u-.06)/.88) if action=='walk' else 0,
        headPitch=.025*math.sin(t*1.5),headYaw=0,bodyShift=0,bodyDrop=0,probeLift=0,probeReach=0,bagDrop=0)
    if action=='look':
        defaults.update(headYaw=.28*math.sin(smooth(u)*math.pi*2),headPitch=.10*math.sin(smooth(u)*math.pi))
    elif action=='walk':
        defaults.update(bodyDrop=.045+.012*math.sin(t*3.2))
    elif action=='probe':
        lift=smooth((u-.12)/.14)*(1-smooth((u-.32)/.20))
        defaults.update(headPitch=.25*smooth((u-.04)/.2)-.12*smooth((u-.7)/.2),
            bodyShift=.10*smooth((u-.5)/.3),bodyDrop=.09*smooth((u-.5)/.3),
            probeLift=.24*lift,probeReach=.26*smooth((u-.22)/.28))
    keys=actor.get('performance',{}).get('keys',[])
    return {name:channel(keys,name,u,default) for name,default in defaults.items()}

def foot(travel,scale,index,stride=.50,height=.15):
    # Stance feet remain at a fixed world position; only the swing interpolates.
    distance=travel/scale
    offset=[0,.5,.75,.25][index]
    phase=distance/stride+offset
    cycle=math.floor(phase);fraction=phase-cycle
    swing=smooth((fraction-.60)/.40)
    return ((cycle+swing-offset)*stride-distance+stride*.30, height*math.sin(swing*math.pi))
