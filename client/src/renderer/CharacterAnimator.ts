import * as THREE from 'three';

type AnimState = 'idle' | 'walk' | 'cast' | 'death';

export class CharacterAnimator {
  private mixer: THREE.AnimationMixer;
  private actions = new Map<AnimState, THREE.AnimationAction>();
  private current: AnimState = 'idle';
  private dead = false;

  constructor(root: THREE.Object3D, clips: THREE.AnimationClip[]) {
    this.mixer = new THREE.AnimationMixer(root);

    if (clips.length === 0) {
      console.warn('CharacterAnimator: no clips');
      return;
    }

    const find = (...names: string[]) => {
      const lower = names.map(n => n.toLowerCase());
      return clips.find(c => lower.some(n => c.name.toLowerCase().includes(n))) ?? clips[0];
    };

    const idleClip  = find('idle');
    const walkClip  = find('run', 'walk');
    const castClip  = find('shoot', 'attack', 'cast', 'punch', 'slash');
    const deathClip = find('death', 'defeat', 'die');

    this.actions.set('idle', this.mixer.clipAction(idleClip));
    this.actions.set('walk', this.mixer.clipAction(walkClip));

    for (const state of ['cast', 'death'] as const) {
      const clip = state === 'cast' ? castClip : deathClip;
      const action = this.mixer.clipAction(clip);
      action.setLoop(THREE.LoopOnce, 1);
      action.clampWhenFinished = true;
      this.actions.set(state, action);
    }

    this.actions.get('idle')!.play();

    this.mixer.addEventListener('finished', (e) => {
      if (e.action === this.actions.get('cast') && this.current === 'cast') {
        this.transitionTo('idle');
      }
    });
  }

  update(delta: number, velocityMag: number, isCasting: boolean): void {
    this.mixer.update(delta);
    if (this.dead || this.current === 'death') return;
    if (this.current === 'cast') return;
    if (isCasting) { this.transitionTo('cast'); return; }
    this.transitionTo(velocityMag > 1.5 ? 'walk' : 'idle');
  }

  die(): void {
    if (this.dead) return;
    this.dead = true;
    this.transitionTo('death');
  }

  private transitionTo(state: AnimState): void {
    if (state === this.current) return;
    const FADE = 0.2;
    this.actions.forEach(a => a.fadeOut(FADE));
    const to = this.actions.get(state)!;
    to.reset().fadeIn(FADE).play();
    this.current = state;
  }
}
