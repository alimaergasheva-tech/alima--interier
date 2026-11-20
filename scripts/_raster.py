# Грубый просмотр glTF без браузера: закраска по нормалям, алгоритм художника. Только для проверки форм.
import json, struct, sys, math, os
from PIL import Image, ImageDraw
def load(id):
    g=json.load(open(f'public/models/{id}/{id}.gltf')); b=open(f'public/models/{id}/{id}.bin','rb').read()
    tris=[]
    for p in g['meshes'][0]['primitives']:
        col=g['materials'][p['material']]['pbrMetallicRoughness']['baseColorFactor'][:3]
        def acc(i):
            a=g['accessors'][i]; v=g['bufferViews'][a['bufferView']]; n=a['count']
            if a['type']=='VEC3': return [struct.unpack_from('<3f',b,v['byteOffset']+k*12) for k in range(n)]
            return list(struct.unpack_from(f'<{n}I',b,v['byteOffset']))
        P=acc(p['attributes']['POSITION']); I=acc(p['indices'])
        c=[min(255,int((x**(1/2.2))*255)) for x in col]
        for k in range(0,len(I),3): tris.append((P[I[k]],P[I[k+1]],P[I[k+2]],c))
    return tris
def render(id,yaw,S=300,pitch=0.5):
    tris=load(id); xs=[v[0] for t in tris for v in t[:3]]; ys=[v[1] for t in tris for v in t[:3]]; zs=[v[2] for t in tris for v in t[:3]]
    cx=(max(xs)+min(xs))/2; cy=(max(ys)+min(ys))/2; cz=(max(zs)+min(zs))/2
    R=max(max(xs)-min(xs),max(ys)-min(ys),max(zs)-min(zs))
    cyw,syw=math.cos(yaw),math.sin(yaw); cp,sp=math.cos(pitch),math.sin(pitch)
    def tr(v):
        x,y,z=v[0]-cx,v[1]-cy,v[2]-cz
        x,z=x*cyw+z*syw,-x*syw+z*cyw
        y,z=y*cp-z*sp,y*sp+z*cp
        return x,y,z
    out=[]
    for a,b,c,col in tris:
        A,B,C=tr(a),tr(b),tr(c)
        u=(B[0]-A[0],B[1]-A[1],B[2]-A[2]); w=(C[0]-A[0],C[1]-A[1],C[2]-A[2])
        n=(u[1]*w[2]-u[2]*w[1],u[2]*w[0]-u[0]*w[2],u[0]*w[1]-u[1]*w[0]); l=math.sqrt(sum(q*q for q in n)) or 1
        n=[q/l for q in n]
        if n[2]<0: continue   # камера смотрит вдоль -z: видимые грани смотрят в +z
        sh=0.45+0.55*max(0,n[0]*0.3+n[1]*0.6+n[2]*0.74)
        out.append(((A[2]+B[2]+C[2])/3,[A,B,C],tuple(int(q*sh) for q in col)))
    out.sort(key=lambda t:t[0])
    im=Image.new('RGB',(S,S),(245,245,245)); d=ImageDraw.Draw(im); k=S*0.8/R
    for _,t,col in out: d.polygon([(S/2+q[0]*k,S/2-q[1]*k) for q in t],fill=col)
    return im
if __name__=='__main__':
    ids=sys.argv[2:]; yaw=float(sys.argv[1])
    S=300; W=4; im=Image.new('RGB',(W*S,((len(ids)+W-1)//W)*S),'white'); d=ImageDraw.Draw(im)
    for i,id in enumerate(ids):
        im.paste(render(id,yaw,S),((i%W)*S,(i//W)*S)); d.text(((i%W)*S+4,(i//W)*S+4),id,fill='black')
    im.save('docs/stage-16/_raster.png')
