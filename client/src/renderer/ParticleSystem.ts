import * as THREE from 'three';
import { Segment } from '@arena/shared';

const POOL_SIZE = 4096;
const SOFT_CAP = Math.floor(POOL_SIZE * 0.9);

const DEFAULT_COLOR_R = 1.0;
const DEFAULT_COLOR_G = 0.4;
const DEFAULT_COLOR_B = 0.0;

export class ParticleSystem {
  private posX = new Float32Array(POOL_SIZE);
  private posY = new Float32Array(POOL_SIZE);
  private posZ = new Float32Array(POOL_SIZE);
  private velX = new Float32Array(POOL_SIZE);
  private velY = new Float32Array(POOL_SIZE);
  private velZ = new Float32Array(POOL_SIZE);
  private life = new Float32Array(POOL_SIZE);
  private maxLife = new Float32Array(POOL_SIZE);
  private particleSize = new Float32Array(POOL_SIZE);
  private colorR = new Float32Array(POOL_SIZE);
  private colorG = new Float32Array(POOL_SIZE);
  private colorB = new Float32Array(POOL_SIZE);
  private activeCount = 0;

  private positionBuffer: Float32Array;
  private sizeBuffer: Float32Array;
  private colorBuffer: Float32Array;
  private posAttr: THREE.BufferAttribute;
  private sizeAttr: THREE.BufferAttribute;
  private colorAttr: THREE.BufferAttribute;
  private geometry: THREE.BufferGeometry;
  private points: THREE.Points;

  constructor(private scene: THREE.Scene) {
    this.positionBuffer = new Float32Array(POOL_SIZE * 3);
    this.sizeBuffer = new Float32Array(POOL_SIZE);
    this.colorBuffer = new Float32Array(POOL_SIZE * 3);

    this.geometry = new THREE.BufferGeometry();

    this.posAttr = new THREE.BufferAttribute(this.positionBuffer, 3);
    this.posAttr.setUsage(THREE.DynamicDrawUsage);
    this.geometry.setAttribute('position', this.posAttr);

    this.sizeAttr = new THREE.BufferAttribute(this.sizeBuffer, 1);
    this.sizeAttr.setUsage(THREE.DynamicDrawUsage);
    this.geometry.setAttribute('size', this.sizeAttr);

    this.colorAttr = new THREE.BufferAttribute(this.colorBuffer, 3);
    this.colorAttr.setUsage(THREE.DynamicDrawUsage);
    this.geometry.setAttribute('particleColor', this.colorAttr);

    this.geometry.setDrawRange(0, 0);

    const material = new THREE.ShaderMaterial({
      vertexShader: `
        attribute float size;
        attribute vec3 particleColor;
        varying vec3 vColor;
        void main() {
          vColor = particleColor;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = size;
        }
      `,
      fragmentShader: `
        varying vec3 vColor;
        void main() {
          float dist = length(gl_PointCoord - vec2(0.5));
          if (dist > 0.5) discard;
          float alpha = 1.0 - dist * 2.0;
          gl_FragColor = vec4(vColor, alpha);
        }
      `,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });

    this.points = new THREE.Points(this.geometry, material);
    this.points.frustumCulled = false;
    scene.add(this.points);
  }

  emitTrail(x: number, y: number, z: number, dirX: number, dirZ: number): void {
    if (this.activeCount >= SOFT_CAP) return;
    const count = 3 + Math.floor(Math.random() * 3);
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
        12 + Math.random() * 4,
      );
    }
  }

  emitExplosion(x: number, y: number, z: number): void {
    const count = 40 + Math.floor(Math.random() * 21);
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
        Math.random() > 0.5 ? 16 : 10,
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
          14 + Math.random() * 10,
        );
      }
    }
  }

  emitMeteorTrail(x: number, y: number, z: number): void {
    if (this.activeCount >= SOFT_CAP) return;
    const count = 2 + Math.floor(Math.random() * 2);
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
        8 + Math.random() * 6,
      );
    }
  }

  emitCrater(x: number, z: number, radius: number): void {
    if (this.activeCount >= SOFT_CAP) return;
    const count = Math.max(4, Math.round(radius / 10));
    for (let i = 0; i < count; i++) {
      if (this.activeCount >= POOL_SIZE) return;
      const theta = Math.random() * Math.PI * 2;
      const r = Math.sqrt(Math.random()) * radius;
      this.spawn(
        x + Math.cos(theta) * r,
        1,
        z + Math.sin(theta) * r,
        (Math.random() - 0.5) * 10,
        30 + Math.random() * 30,
        (Math.random() - 0.5) * 10,
        0.3 + Math.random() * 0.3,
        10 + Math.random() * 8,
      );
    }
  }

  emitMeteorImpact(x: number, y: number, z: number): void {
    if (this.activeCount >= SOFT_CAP) return;
    const count = 50 + Math.floor(Math.random() * 21);
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
        Math.random() > 0.5 ? 18 : 12,
      );
    }
  }

  emitTeleportSparks(x: number, y: number, z: number): void {
    const count = 20 + Math.floor(Math.random() * 11);
    for (let i = 0; i < count; i++) {
      if (this.activeCount >= POOL_SIZE) return;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.random() * Math.PI * 0.5;
      const speed = 80 + Math.random() * 100;
      const idx = this.activeCount;
      this.spawn(
        x + (Math.random() - 0.5) * 6,
        y + (Math.random() - 0.5) * 6,
        z + (Math.random() - 0.5) * 6,
        Math.cos(theta) * Math.sin(phi) * speed,
        Math.cos(phi) * speed * 0.5 + 20,
        Math.sin(theta) * Math.sin(phi) * speed,
        0.15 + Math.random() * 0.05,
        10 + Math.random() * 6,
      );
      this.colorR[idx] = 1.0;
      this.colorG[idx] = 0.84 + Math.random() * 0.16;
      this.colorB[idx] = 0.4 + Math.random() * 0.6;
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
    this.colorR[i] = DEFAULT_COLOR_R;
    this.colorG[i] = DEFAULT_COLOR_G;
    this.colorB[i] = DEFAULT_COLOR_B;
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
        this.colorR[i] = this.colorR[last]; this.colorG[i] = this.colorG[last]; this.colorB[i] = this.colorB[last];
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
      this.colorBuffer[t]     = this.colorR[i];
      this.colorBuffer[t + 1] = this.colorG[i];
      this.colorBuffer[t + 2] = this.colorB[i];
      this.sizeBuffer[i] = this.particleSize[i] * (this.life[i] / this.maxLife[i]);
      i++;
    }

    this.geometry.setDrawRange(0, this.activeCount);
    this.posAttr.needsUpdate = true;
    this.sizeAttr.needsUpdate = true;
    this.colorAttr.needsUpdate = true;
  }

  dispose(): void {
    this.scene.remove(this.points);
    this.geometry.dispose();
    (this.points.material as THREE.ShaderMaterial).dispose();
  }
}
