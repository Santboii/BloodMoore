import * as THREE from 'three';
import { Segment } from '@arena/shared';

const POOL_SIZE = 4096;
const SOFT_CAP = Math.floor(POOL_SIZE * 0.9);

export class FireParticles {
  private posX = new Float32Array(POOL_SIZE);
  private posY = new Float32Array(POOL_SIZE);
  private posZ = new Float32Array(POOL_SIZE);
  private velX = new Float32Array(POOL_SIZE);
  private velY = new Float32Array(POOL_SIZE);
  private velZ = new Float32Array(POOL_SIZE);
  private life = new Float32Array(POOL_SIZE);
  private maxLife = new Float32Array(POOL_SIZE);
  private particleSize = new Float32Array(POOL_SIZE);
  private activeCount = 0;

  private positionBuffer: Float32Array;
  private sizeBuffer: Float32Array;
  private posAttr: THREE.BufferAttribute;
  private sizeAttr: THREE.BufferAttribute;
  private geometry: THREE.BufferGeometry;
  private points: THREE.Points;

  constructor(private scene: THREE.Scene) {
    this.positionBuffer = new Float32Array(POOL_SIZE * 3);
    this.sizeBuffer = new Float32Array(POOL_SIZE);

    this.geometry = new THREE.BufferGeometry();

    this.posAttr = new THREE.BufferAttribute(this.positionBuffer, 3);
    this.posAttr.setUsage(THREE.DynamicDrawUsage);
    this.geometry.setAttribute('position', this.posAttr);

    this.sizeAttr = new THREE.BufferAttribute(this.sizeBuffer, 1);
    this.sizeAttr.setUsage(THREE.DynamicDrawUsage);
    this.geometry.setAttribute('size', this.sizeAttr);

    this.geometry.setDrawRange(0, 0);

    // ShaderMaterial required for per-particle size.
    // Standard PointsMaterial uses a uniform size — no per-vertex control.
    // Camera is orthographic so no perspective division in vertex shader.
    const material = new THREE.ShaderMaterial({
      uniforms: { color: { value: new THREE.Color(0xff6600) } },
      vertexShader: `
        attribute float size;
        void main() {
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = size;
        }
      `,
      fragmentShader: `
        uniform vec3 color;
        void main() {
          float dist = length(gl_PointCoord - vec2(0.5));
          if (dist > 0.5) discard;
          float alpha = 1.0 - dist * 2.0;
          gl_FragColor = vec4(color, alpha);
        }
      `,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });

    this.points = new THREE.Points(this.geometry, material);
    // frustumCulled false: particles span the arena; bounding sphere computation
    // is expensive and this is one draw call regardless.
    this.points.frustumCulled = false;
    scene.add(this.points);
  }

  emitTrail(x: number, y: number, z: number, dirX: number, dirZ: number): void {
    if (this.activeCount >= SOFT_CAP) return;
    const count = 3 + Math.floor(Math.random() * 3); // 3–5
    for (let i = 0; i < count; i++) {
      if (this.activeCount >= POOL_SIZE) return;
      this.spawn(
        x + (Math.random() - 0.5) * 4,
        y + (Math.random() - 0.5) * 4,
        z + (Math.random() - 0.5) * 4,
        -dirX * (40 + Math.random() * 30) + (Math.random() - 0.5) * 30,
        10 + Math.random() * 20,
        -dirZ * (40 + Math.random() * 30) + (Math.random() - 0.5) * 30,
        0.35 + Math.random() * 0.15,
        4,
      );
    }
  }

  emitExplosion(x: number, y: number, z: number): void {
    const count = 40 + Math.floor(Math.random() * 21); // 40–60
    for (let i = 0; i < count; i++) {
      if (this.activeCount >= POOL_SIZE) return;
      const theta = Math.random() * Math.PI * 2;
      const speed = 60 + Math.random() * 120;
      this.spawn(
        x + (Math.random() - 0.5) * 6,
        y + (Math.random() - 0.5) * 6,
        z + (Math.random() - 0.5) * 6,
        Math.cos(theta) * speed,
        20 + Math.random() * 80,
        Math.sin(theta) * speed,
        0.5 + Math.random() * 0.3,
        Math.random() > 0.5 ? 6 : 3,
      );
    }
  }

  emitWall(segments: Segment[]): void {
    if (this.activeCount >= SOFT_CAP) return;
    for (const seg of segments) {
      for (let i = 0; i < 3; i++) {
        if (this.activeCount >= POOL_SIZE) return;
        const t = Math.random();
        this.spawn(
          seg.x1 + (seg.x2 - seg.x1) * t + (Math.random() - 0.5) * 4,
          1,
          seg.y1 + (seg.y2 - seg.y1) * t + (Math.random() - 0.5) * 4,
          (Math.random() - 0.5) * 15,
          40 + Math.random() * 40,
          (Math.random() - 0.5) * 15,
          0.4 + Math.random() * 0.3,
          3 + Math.random() * 3,
        );
      }
    }
  }

  emitMeteorTrail(x: number, y: number, z: number): void {
    if (this.activeCount >= SOFT_CAP) return;
    const count = 2 + Math.floor(Math.random() * 2); // 2–3
    for (let i = 0; i < count; i++) {
      if (this.activeCount >= POOL_SIZE) return;
      const theta = Math.random() * Math.PI * 2;
      const spread = 8 + Math.random() * 8;
      this.spawn(
        x + (Math.random() - 0.5) * 6,
        y + (Math.random() - 0.5) * 6,
        z + (Math.random() - 0.5) * 6,
        Math.cos(theta) * spread,
        20 + Math.random() * 20,
        Math.sin(theta) * spread,
        0.2 + Math.random() * 0.1,
        2 + Math.random() * 2,
      );
    }
  }

  emitMeteorImpact(x: number, y: number, z: number): void {
    const count = 50 + Math.floor(Math.random() * 21); // 50–70
    for (let i = 0; i < count; i++) {
      if (this.activeCount >= POOL_SIZE) return;
      const theta = Math.random() * Math.PI * 2;
      const speed = 80 + Math.random() * 120;
      this.spawn(
        x + (Math.random() - 0.5) * 10,
        y + (Math.random() - 0.5) * 10,
        z + (Math.random() - 0.5) * 10,
        Math.cos(theta) * speed,
        30 + Math.random() * 100,
        Math.sin(theta) * speed,
        0.5 + Math.random() * 0.3,
        Math.random() > 0.5 ? 7 : 4,
      );
    }
  }

  private spawn(
    x: number, y: number, z: number,
    vx: number, vy: number, vz: number,
    life: number, size: number,
  ): void {
    const i = this.activeCount++;
    this.posX[i] = x; this.posY[i] = y; this.posZ[i] = z;
    this.velX[i] = vx; this.velY[i] = vy; this.velZ[i] = vz;
    this.life[i] = life; this.maxLife[i] = life;
    this.particleSize[i] = size;
  }

  update(delta: number): void {
    let i = 0;
    while (i < this.activeCount) {
      this.life[i] -= delta;
      if (this.life[i] <= 0) {
        const last = this.activeCount - 1;
        this.posX[i] = this.posX[last]; this.posY[i] = this.posY[last]; this.posZ[i] = this.posZ[last];
        this.velX[i] = this.velX[last]; this.velY[i] = this.velY[last]; this.velZ[i] = this.velZ[last];
        this.life[i] = this.life[last]; this.maxLife[i] = this.maxLife[last];
        this.particleSize[i] = this.particleSize[last];
        this.activeCount--;
        continue;
      }
      this.velY[i] -= 80 * delta;
      this.posX[i] += this.velX[i] * delta;
      this.posY[i] += this.velY[i] * delta;
      this.posZ[i] += this.velZ[i] * delta;

      const t = i * 3;
      this.positionBuffer[t]     = this.posX[i];
      this.positionBuffer[t + 1] = this.posY[i];
      this.positionBuffer[t + 2] = this.posZ[i];
      this.sizeBuffer[i] = this.particleSize[i] * (this.life[i] / this.maxLife[i]);
      i++;
    }

    this.geometry.setDrawRange(0, this.activeCount);
    this.posAttr.needsUpdate = true;
    this.sizeAttr.needsUpdate = true;
  }

  dispose(): void {
    this.scene.remove(this.points);
    this.geometry.dispose();
    (this.points.material as THREE.ShaderMaterial).dispose();
  }
}
