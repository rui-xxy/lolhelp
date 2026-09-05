import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';

const host = document.querySelector('#energy-core');

if (host) {
  const C = (red, green, blue) => new THREE.Color(red, green, blue);
  const EMOTIONS = {
    alert: {
      colorA: C(1, 0.78, 0.1), colorB: C(1, 0.95, 0.35), core: C(1, 1, 0.75),
      pulse: 2.4, flow: 1.1, flickerSpeed: 7, flickerAmount: 0.45,
      bright: 1.05, crack: 0, dirStr: 1, breathe: 0.022,
      rippleRate: 2, rippleStrength: 0.8, rippleSpeed: 1.6, rippleFrequency: 34,
      fanIntensity: 1, fanSpeed: 6,
      particleMode: 'track', particleCount: 160, particleSpeed: 1.3, particleSize: 2,
    },
    angry: {
      colorA: C(1, 0.18, 0.05), colorB: C(1, 0.62, 0.1), core: C(1, 0.92, 0.45),
      pulse: 4.2, flow: 2.4, flickerSpeed: 16, flickerAmount: 0.92,
      bright: 1.25, crack: 1, dirStr: 0, breathe: 0.05,
      rippleRate: 3.6, rippleStrength: 1.6, rippleSpeed: 3.2, rippleFrequency: 48,
      fanIntensity: 0.9, fanSpeed: 4.5,
      particleMode: 'burst', particleCount: 220, particleSpeed: 2.6, particleSize: 2.2,
    },
    excited: {
      colorA: C(0.2, 1, 0.45), colorB: C(1, 0.22, 0.85), core: C(0.85, 1, 0.6),
      pulse: 3.4, flow: 1.9, flickerSpeed: 11, flickerAmount: 0.7,
      bright: 1.15, crack: 0, dirStr: 0, breathe: 0.035,
      rippleRate: 2.6, rippleStrength: 0.95, rippleSpeed: 2.2, rippleFrequency: 38,
      fanIntensity: 0.7, fanSpeed: 3,
      particleMode: 'swirl', particleCount: 200, particleSpeed: 1.8, particleSize: 2.3,
    },
  };

  const SPHERE_VERTEX_SHADER = `
    varying vec3 vObj;
    varying vec3 vN;
    varying vec3 vV;
    void main() {
      vObj = position;
      vN = normalize(normalMatrix * normal);
      vec4 mv = modelViewMatrix * vec4(position, 1.0);
      vV = -mv.xyz;
      gl_Position = projectionMatrix * mv;
    }
  `;

  const SPHERE_FRAGMENT_SHADER = `
    precision highp float;
    varying vec3 vObj;
    varying vec3 vN;
    varying vec3 vV;
    uniform float uTime, uPulse, uFlow, uFlickerSpeed, uFlickerAmount;
    uniform float uBright, uCrack, uDirStr;
    uniform vec3 uColorA, uColorB, uCore, uDir;

    vec3 hash3(vec3 p) {
      p = vec3(dot(p, vec3(127.1,311.7,74.7)),
               dot(p, vec3(269.5,183.3,246.1)),
               dot(p, vec3(113.5,271.9,124.6)));
      return -1.0 + 2.0 * fract(sin(p) * 43758.5453123);
    }

    float vnoise(vec3 p) {
      vec3 i = floor(p), f = fract(p);
      f = f * f * (3.0 - 2.0 * f);
      float n = mix(
        mix(mix(dot(hash3(i+vec3(0,0,0)),f-vec3(0,0,0)),
                dot(hash3(i+vec3(1,0,0)),f-vec3(1,0,0)),f.x),
            mix(dot(hash3(i+vec3(0,1,0)),f-vec3(0,1,0)),
                dot(hash3(i+vec3(1,1,0)),f-vec3(1,1,0)),f.x),f.y),
        mix(mix(dot(hash3(i+vec3(0,0,1)),f-vec3(0,0,1)),
                dot(hash3(i+vec3(1,0,1)),f-vec3(1,0,1)),f.x),
            mix(dot(hash3(i+vec3(0,1,1)),f-vec3(0,1,1)),
                dot(hash3(i+vec3(1,1,1)),f-vec3(1,1,1)),f.x),f.y),f.z);
      return n * 0.5 + 0.5;
    }

    float fbm(vec3 p) {
      float value = 0.0, amplitude = 0.5;
      for (int i=0; i<5; i++) {
        value += amplitude * vnoise(p);
        p *= 2.03;
        amplitude *= 0.5;
      }
      return value;
    }

    void main() {
      vec3 dir = normalize(vObj);
      vec3 N = normalize(vN), V = normalize(vV);
      float ndv = max(dot(N,V), 0.0);
      float fresnel = pow(1.0-ndv, 2.4);
      float directionAmount = pow(max(dot(dir, normalize(uDir)),0.0),3.0) * uDirStr;
      float pulse = 0.68 + 0.22 * sin(uTime*uPulse);
      float surfaceBrightness = min(uBright, 1.05);
      float flowTime = uTime*uFlow;
      vec3 flowDirection = normalize(vec3(
        sin(flowTime), cos(flowTime*0.7), sin(flowTime*0.5+1.0)
      ));
      float flow = dot(dir, flowDirection);
      float activity = smoothstep(0.0,0.55,sin(flow*3.0+uTime*1.6)*0.5+0.5);
      vec3 plasmaPosition = dir*3.0;
      plasmaPosition += vec3(uTime*uFlow*0.6,uTime*uFlow*0.4,uTime*uFlow*0.5);
      float plasmaLarge = fbm(plasmaPosition);
      float plasmaFine = fbm(plasmaPosition*2.0+3.0+plasmaLarge*2.0);
      float plasma = plasmaLarge*0.6+plasmaFine*0.4;
      float hot = smoothstep(0.62,0.95,plasma);
      float cool = smoothstep(0.0,0.5,plasma);
      vec3 baseColor = mix(uColorA,uColorB,smoothstep(0.2,0.8,plasma));
      vec3 finalColor = baseColor*(0.4+cool*0.6)*pulse*surfaceBrightness;
      finalColor += uCore*hot*surfaceBrightness;
      finalColor += uColorB*hot*activity*0.45;
      finalColor += directionAmount*uCore*1.2;
      finalColor += uColorB*fresnel*0.55;
      float flicker = fract(sin(uTime*uFlickerSpeed*0.3+plasma*40.0))*2.0-1.0;
      finalColor *= 1.0+flicker*uFlickerAmount*0.3;
      float crackNoise = vnoise(dir*11.0+vec3(0.0,0.0,uTime*0.15));
      float crack = smoothstep(0.80,0.88,crackNoise)*uCrack;
      float crackBright = smoothstep(0.86,0.90,crackNoise)*uCrack;
      finalColor += vec3(1.3,1.05,0.9)*crack*1.35;
      finalColor += vec3(1.5,1.4,1.2)*crackBright*1.8;
      gl_FragColor = vec4(finalColor,1.0);
    }
  `;

  const HALO_VERTEX_SHADER = `
    varying vec3 vN;
    varying vec3 vV;
    void main() {
      vN=normalize(normalMatrix*normal);
      vec4 mv=modelViewMatrix*vec4(position,1.0);
      vV=-mv.xyz;
      gl_Position=projectionMatrix*mv;
    }
  `;

  const HALO_FRAGMENT_SHADER = `
    varying vec3 vN;
    varying vec3 vV;
    uniform vec3 uColor;
    uniform float uStrength;
    void main() {
      float f=pow(1.0-max(dot(normalize(vN),normalize(vV)),0.0),3.0);
      gl_FragColor=vec4(uColor*f*1.6*uStrength,f*uStrength);
    }
  `;

  const DISTORT_SHADER = {
    uniforms: {
      tDiffuse: { value: null },
      uSphere: { value: new THREE.Vector2(0.5,0.5) },
      uAspect: { value: 1 },
      uTime: { value: 0 },
      uStrength: { value: 0.5 },
      uSpeed: { value: 1 },
      uFreq: { value: 30 },
    },
    vertexShader: `
      varying vec2 vUv;
      void main() {
        vUv=uv;
        gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);
      }
    `,
    fragmentShader: `
      uniform sampler2D tDiffuse;
      uniform vec2 uSphere;
      uniform float uAspect,uTime,uStrength,uSpeed,uFreq;
      varying vec2 vUv;
      void main() {
        vec2 delta=vUv-uSphere;
        delta.x*=uAspect;
        float distanceToCore=length(delta);
        float falloff=smoothstep(0.02,0.22,distanceToCore)*exp(-distanceToCore*2.2);
        vec2 direction=distanceToCore>0.0001 ? delta/distanceToCore : vec2(0.0);
        float wave=sin(distanceToCore*uFreq-uTime*uSpeed*6.0);
        float offset=wave*0.022*falloff*uStrength;
        vec2 uv=vUv+direction*offset;
        uv-=direction*0.06*falloff*uStrength/uAspect;
        uv=clamp(uv,0.001,0.999);
        vec4 result=texture2D(tDiffuse,uv);
        float chromaticOffset=0.004*falloff*uStrength;
        result.r=texture2D(tDiffuse,uv+vec2(chromaticOffset,0.0)).r;
        result.b=texture2D(tDiffuse,uv-vec2(chromaticOffset,0.0)).b;
        gl_FragColor=result;
      }
    `,
  };

  const TRANSPARENT_COMPOSITE_SHADER = {
    uniforms: { tDiffuse: { value: null } },
    vertexShader: `
      varying vec2 vUv;
      void main() {
        vUv=uv;
        gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);
      }
    `,
    fragmentShader: `
      uniform sampler2D tDiffuse;
      varying vec2 vUv;
      void main() {
        vec4 color=texture2D(tDiffuse,vUv);
        float energy=max(max(color.r,color.g),color.b);
        float alpha=smoothstep(0.025,0.30,energy);
        gl_FragColor=vec4(color.rgb,alpha);
      }
    `,
  };

  function respawnParticle(particle, mode) {
    const radius = 1.08*(1.08+Math.random()*0.42);
    const theta = Math.random()*Math.PI*2;
    const phi = Math.acos(2*Math.random()-1);
    particle.position.set(
      radius*Math.sin(phi)*Math.cos(theta),
      radius*Math.cos(phi),
      radius*Math.sin(phi)*Math.sin(theta),
    );
    particle.maxLife=1.5+Math.random()*2.5;
    particle.life=particle.maxLife;
    if (mode==='burst') {
      particle.velocity.copy(particle.position).normalize().multiplyScalar(0.6+Math.random()*1.4);
    } else if (mode==='swirl') {
      particle.velocity.crossVectors(particle.position,new THREE.Vector3(0,1,0)).normalize().multiplyScalar(0.8);
      particle.velocity.add(particle.position.clone().normalize().multiplyScalar(0.2));
      particle.velocity.y+=(Math.random()-0.5)*0.3;
    } else if (mode==='track') {
      particle.velocity.copy(particle.position).normalize().multiplyScalar(0.3+Math.random()*0.5);
    }
  }

  let activeEmotion = document.body.dataset.radarState || 'alert';
  window.addEventListener('radar-state-change', event => {
    const nextState = event.detail?.state;
    if (nextState && EMOTIONS[nextState]) activeEmotion=nextState;
  });

  const reducedMotion=window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const scene=new THREE.Scene();
  const cameraTarget=new THREE.Vector3(0,-0.35,0);
  const camera=new THREE.PerspectiveCamera(46,1,0.1,140);
  camera.position.set(0,11.2,4.2);
  camera.lookAt(cameraTarget);
  const renderer=new THREE.WebGLRenderer({antialias:true,alpha:true,powerPreference:'high-performance'});
  renderer.setClearColor(0x000000,0);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,reducedMotion?1:1.5));
  renderer.toneMapping=THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure=0.85;
  renderer.outputColorSpace=THREE.SRGBColorSpace;
  host.appendChild(renderer.domElement);

  const initial=EMOTIONS[activeEmotion];
  const uniforms={
    uTime:{value:0},uColorA:{value:initial.colorA.clone()},uColorB:{value:initial.colorB.clone()},
    uCore:{value:initial.core.clone()},uPulse:{value:initial.pulse},uFlow:{value:initial.flow},
    uFlickerSpeed:{value:initial.flickerSpeed},uFlickerAmount:{value:initial.flickerAmount},
    uBright:{value:initial.bright},uCrack:{value:initial.crack},uDirStr:{value:initial.dirStr},
    uDir:{value:new THREE.Vector3(1,0,0)},
  };
  const sphereMaterial=new THREE.ShaderMaterial({uniforms,vertexShader:SPHERE_VERTEX_SHADER,fragmentShader:SPHERE_FRAGMENT_SHADER});
  const sphere=new THREE.Mesh(new THREE.IcosahedronGeometry(1.08,64),sphereMaterial);
  scene.add(sphere);

  const coreMaterial=new THREE.MeshBasicMaterial({
    color:initial.core,transparent:true,opacity:0.35,blending:THREE.AdditiveBlending,depthWrite:false,
  });
  const coreMesh=new THREE.Mesh(new THREE.SphereGeometry(1.08*0.72,48,48),coreMaterial);
  scene.add(coreMesh);

  const haloMaterial=new THREE.ShaderMaterial({
    uniforms:{uColor:{value:initial.colorB.clone()},uStrength:{value:0.28+initial.bright*0.2}},
    vertexShader:HALO_VERTEX_SHADER,fragmentShader:HALO_FRAGMENT_SHADER,transparent:true,
    blending:THREE.AdditiveBlending,depthWrite:false,side:THREE.FrontSide,
  });
  const halo=new THREE.Mesh(new THREE.SphereGeometry(1.08*1.34,48,48),haloMaterial);
  scene.add(halo);

  const fanCanvas=document.createElement('canvas');
  fanCanvas.width=64;
  fanCanvas.height=256;
  const fanContext=fanCanvas.getContext('2d');
  if (fanContext) {
    const vertical=fanContext.createLinearGradient(32,0,32,256);
    vertical.addColorStop(0,'rgba(255,255,255,0)');
    vertical.addColorStop(0.5,'rgba(255,255,255,0.6)');
    vertical.addColorStop(1,'rgba(255,255,255,0)');
    fanContext.fillStyle=vertical;
    fanContext.fillRect(0,0,64,256);
    const horizontal=fanContext.createLinearGradient(0,0,64,0);
    horizontal.addColorStop(0,'rgba(255,255,255,0)');
    horizontal.addColorStop(0.5,'rgba(255,255,255,0.8)');
    horizontal.addColorStop(1,'rgba(255,255,255,0)');
    fanContext.globalCompositeOperation='destination-in';
    fanContext.fillStyle=horizontal;
    fanContext.fillRect(0,0,64,256);
  }
  const fanTexture=new THREE.CanvasTexture(fanCanvas);
  const fanMaterial=new THREE.MeshBasicMaterial({
    map:fanTexture,transparent:true,opacity:0,blending:THREE.AdditiveBlending,depthWrite:false,side:THREE.DoubleSide,
  });
  const fan=new THREE.Mesh(new THREE.PlaneGeometry(4.6,3.2),fanMaterial);
  scene.add(fan);

  const alertShellMaterial=new THREE.MeshBasicMaterial({
    color:EMOTIONS.alert.colorB,wireframe:true,transparent:true,opacity:0,
    blending:THREE.AdditiveBlending,depthWrite:false,
  });
  const alertShell=new THREE.Mesh(new THREE.IcosahedronGeometry(1.08*1.12,2),alertShellMaterial);
  scene.add(alertShell);

  const particleMax=reducedMotion?70:400;
  const particles=Array.from({length:particleMax},()=>({
    position:new THREE.Vector3(),velocity:new THREE.Vector3(),life:Math.random(),maxLife:1,size:1+Math.random()*2,
  }));
  const positions=new Float32Array(particleMax*3);
  const sizes=new Float32Array(particleMax);
  const lives=new Float32Array(particleMax);
  const particleGeometry=new THREE.BufferGeometry();
  particleGeometry.setAttribute('position',new THREE.BufferAttribute(positions,3));
  particleGeometry.setAttribute('aSize',new THREE.BufferAttribute(sizes,1));
  particleGeometry.setAttribute('aLife',new THREE.BufferAttribute(lives,1));
  const particleMaterial=new THREE.ShaderMaterial({
    uniforms:{uColor:{value:initial.colorB.clone()},uPixelRatio:{value:renderer.getPixelRatio()}},
    vertexShader:`
      attribute float aSize; attribute float aLife; varying float vLife; uniform float uPixelRatio;
      void main() {
        vLife=aLife; vec4 mv=modelViewMatrix*vec4(position,1.0);
        gl_PointSize=max(0.8,aSize*(11.5/-mv.z)*uPixelRatio); gl_Position=projectionMatrix*mv;
      }
    `,
    fragmentShader:`
      varying float vLife; uniform vec3 uColor;
      void main() {
        vec2 point=gl_PointCoord-0.5; float radius=length(point); float haze=exp(-radius*radius*22.0);
        float core=smoothstep(0.12,0.0,radius); float alpha=(haze*0.62+core*0.38)*vLife*0.82;
        if (alpha<0.012) discard; gl_FragColor=vec4(mix(uColor,vec3(1.0),core*0.36),alpha);
      }
    `,
    transparent:true,blending:THREE.AdditiveBlending,depthWrite:false,
  });
  scene.add(new THREE.Points(particleGeometry,particleMaterial));

  const rippleGeometry=new THREE.RingGeometry(1,1.012,96);
  const ripples=Array.from({length:14},()=>{
    const material=new THREE.MeshBasicMaterial({
      color:initial.colorB,transparent:true,opacity:0,side:THREE.DoubleSide,
      blending:THREE.AdditiveBlending,depthWrite:false,
    });
    const mesh=new THREE.Mesh(rippleGeometry,material);
    mesh.rotation.x=Math.PI/2;
    mesh.visible=false;
    mesh.userData.age=0;
    mesh.userData.life=1;
    scene.add(mesh);
    return mesh;
  });

  const composer=new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene,camera));
  const bloom=new UnrealBloomPass(new THREE.Vector2(128,128),0.52,0.34,0.62);
  composer.addPass(bloom);
  const distortPass=new ShaderPass(DISTORT_SHADER);
  composer.addPass(distortPass);
  composer.addPass(new ShaderPass(TRANSPARENT_COMPOSITE_SHADER));
  composer.addPass(new OutputPass());

  const current={
    colorA:initial.colorA.clone(),colorB:initial.colorB.clone(),core:initial.core.clone(),
    pulse:initial.pulse,flow:initial.flow,flickerSpeed:initial.flickerSpeed,
    flickerAmount:initial.flickerAmount,bright:initial.bright,crack:initial.crack,
    dirStr:initial.dirStr,breathe:initial.breathe,rippleRate:initial.rippleRate,
    rippleStrength:initial.rippleStrength,rippleSpeed:initial.rippleSpeed,
    rippleFrequency:initial.rippleFrequency,fanIntensity:initial.fanIntensity,fanSpeed:initial.fanSpeed,
  };
  const scanTarget=new THREE.Vector3(1,0,0);
  const projectedCore=new THREE.Vector3();
  const scratch=new THREE.Vector3();
  const up=new THREE.Vector3(0,1,0);
  let renderedWidth=0;
  let renderedHeight=0;
  const resize=()=>{
    const width=Math.round(host.clientWidth);
    const height=Math.round(host.clientHeight);
    if (width<2||height<2||(width===renderedWidth&&height===renderedHeight)) return;
    renderedWidth=width;
    renderedHeight=height;
    renderer.setSize(width,height,false);
    composer.setSize(width,height);
    camera.aspect=width/height;
    camera.updateProjectionMatrix();
    distortPass.uniforms.uAspect.value=width/height;
  };
  new ResizeObserver(resize).observe(host);
  resize();

  const spawnRipple=emotion=>{
    const ripple=ripples.find(item=>!item.visible)??ripples[0];
    ripple.visible=true;
    ripple.userData.age=0;
    ripple.userData.life=1.6+Math.random()*1.2;
    ripple.scale.setScalar(1);
    ripple.material.color.copy(emotion.colorB);
    ripple.material.opacity=0.14;
  };

  const updateParticles=(delta,emotion)=>{
    particleMaterial.uniforms.uColor.value.copy(current.colorB);
    const active=Math.min(particleMax,reducedMotion?34:emotion.particleCount);
    for (let index=0; index<particleMax; index+=1) {
      const particle=particles[index];
      if (index>=active) {
        lives[index]=0;
        sizes[index]=0;
        continue;
      }
      particle.life-=delta;
      if (particle.life<=0) respawnParticle(particle,emotion.particleMode);
      if (emotion.particleMode==='burst') {
        particle.velocity.multiplyScalar(1-0.4*delta);
      } else if (emotion.particleMode==='swirl') {
        scratch.crossVectors(particle.position,up).normalize().multiplyScalar(emotion.particleSpeed*0.6);
        particle.velocity.lerp(scratch,2.5*delta);
      } else if (emotion.particleMode==='track') {
        particle.velocity.addScaledVector(scanTarget,0.4*delta);
        particle.velocity.multiplyScalar(1-0.6*delta);
      }
      particle.position.addScaledVector(particle.velocity,delta*emotion.particleSpeed);
      if (particle.position.length()>5||particle.position.y<-3.2) respawnParticle(particle,emotion.particleMode);
      const lifeRatio=Math.max(particle.life/particle.maxLife,0);
      lives[index]=0.4+0.6*lifeRatio;
      sizes[index]=emotion.particleSize*(0.5+lifeRatio*0.8);
      positions[index*3]=particle.position.x;
      positions[index*3+1]=particle.position.y;
      positions[index*3+2]=particle.position.z;
    }
    particleGeometry.attributes.position.needsUpdate=true;
    particleGeometry.attributes.aSize.needsUpdate=true;
    particleGeometry.attributes.aLife.needsUpdate=true;
  };

  let previousTime=performance.now();
  let elapsedTime=0;
  let rippleTimer=0;
  const draw=timestamp=>{
    const delta=Math.min(0.05,Math.max(0.001,(timestamp-previousTime)/1000));
    previousTime=timestamp;
    elapsedTime+=delta;
    const time=elapsedTime;
    const target=EMOTIONS[activeEmotion]||EMOTIONS.alert;
    const ease=1-Math.exp(-delta*2.6);
    current.colorA.lerp(target.colorA,ease);
    current.colorB.lerp(target.colorB,ease);
    current.core.lerp(target.core,ease);
    for (const key of [
      'pulse','flow','flickerSpeed','flickerAmount','bright','crack','dirStr','breathe',
      'rippleRate','rippleStrength','rippleSpeed','rippleFrequency','fanIntensity','fanSpeed',
    ]) current[key]=THREE.MathUtils.lerp(current[key],target[key],ease);

    const scanTime=time*0.4;
    scanTarget.set(
      Math.sin(scanTime)+Math.cos(scanTime*0.7)*0.5,
      Math.sin(scanTime*0.6)*0.4,
      Math.cos(scanTime),
    ).normalize();
    uniforms.uTime.value=time;
    uniforms.uColorA.value.copy(current.colorA);
    uniforms.uColorB.value.copy(current.colorB);
    uniforms.uCore.value.copy(current.core);
    uniforms.uPulse.value=current.pulse;
    uniforms.uFlow.value=current.flow;
    uniforms.uFlickerSpeed.value=current.flickerSpeed;
    uniforms.uFlickerAmount.value=current.flickerAmount;
    uniforms.uBright.value=current.bright;
    uniforms.uCrack.value=current.crack;
    uniforms.uDirStr.value=current.dirStr;
    uniforms.uDir.value.copy(scanTarget);
    sphere.scale.setScalar(1+Math.sin(time*current.pulse)*current.breathe);
    sphere.rotation.y+=delta*0.08;
    coreMesh.scale.setScalar(0.9+Math.sin(time*current.pulse*1.3)*0.08*(0.4+current.bright));
    halo.scale.setScalar(1+Math.sin(time*current.pulse*0.7)*0.05);
    coreMaterial.color.copy(current.core);
    coreMaterial.opacity=(0.12+current.bright*0.1)*1.6;
    haloMaterial.uniforms.uColor.value.copy(current.colorB);
    haloMaterial.uniforms.uStrength.value=(0.28+current.bright*0.2)*1.4;
    bloom.strength=0.34+current.bright*0.18+current.crack*0.15;
    fan.rotation.y=current.dirStr>0.1?Math.atan2(scanTarget.x,scanTarget.z):time*current.fanSpeed;
    fanMaterial.opacity=current.fanIntensity*0.018;
    fanMaterial.color.copy(current.colorB);
    const shellEase=1-Math.exp(-delta*3.7);
    alertShellMaterial.opacity=THREE.MathUtils.lerp(alertShellMaterial.opacity,current.dirStr*0.25,shellEase);
    if (alertShellMaterial.opacity>0.001) {
      alertShell.rotation.y+=0.6*delta;
      alertShell.rotation.x+=0.2*delta;
    }

    updateParticles(delta,target);
    rippleTimer-=delta;
    if (rippleTimer<=0) {
      rippleTimer=1/Math.max(0.1,current.rippleRate);
      spawnRipple(target);
    }
    for (const ripple of ripples) {
      if (!ripple.visible) continue;
      ripple.userData.age+=delta;
      const progress=ripple.userData.age/ripple.userData.life;
      if (progress>=1) {
        ripple.visible=false;
        continue;
      }
      ripple.scale.setScalar(1+progress*5.5*current.rippleStrength);
      ripple.material.opacity=0.14*(1-progress);
    }
    projectedCore.set(0,0,0).project(camera);
    distortPass.uniforms.uSphere.value.set(projectedCore.x*0.5+0.5,projectedCore.y*-0.5+0.5);
    distortPass.uniforms.uTime.value=time;
    distortPass.uniforms.uStrength.value=current.rippleStrength;
    distortPass.uniforms.uSpeed.value=current.rippleSpeed;
    distortPass.uniforms.uFreq.value=current.rippleFrequency;
    composer.render();
    requestAnimationFrame(draw);
  };
  requestAnimationFrame(draw);
}
