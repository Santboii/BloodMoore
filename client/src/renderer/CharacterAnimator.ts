import * as THREE from 'three';

type AnimState = 'idle' | 'walk' | 'cast';

export class CharacterAnimator {
  private mixer: THREE.AnimationMixer;
  private actions = new Map<AnimState, THREE.AnimationAction>();
  private current: AnimState = 'idle';

  constructor(root: THREE.Object3D, clips: THREE.AnimationClip[]) {
    this.mixer = new THREE.AnimationMixer(root);

    if (clips.length === 0) {
      console.warn('CharacterAnimator: no animation clips — animator inert');
      // actions map stays empty; update() calls mixer.update() but transitions no-op
      this.actions.get('idle')?.play();
      return;
    }

    const find = (...names: string[]) => {
      const lower = names.map(n => n.toLowerCase());
      return clips.find(c => lower.includes(c.name.toLowerCase())) ?? clips[0];
    };

    const idleClip  = find('idle');
    const walkClip  = find('walk', 'run');
    const castClip  = find('attack', 'cast', 'spell');

    this.actions.set('idle', this.mixer.clipAction(idleClip));
    this.actions.set('walk', this.mixer.clipAction(walkClip));

    const castAction = this.mixer.clipAction(castClip);
    castAction.setLoop(THREE.LoopOnce, 1);
    castAction.clampWhenFinished = true;
    this.actions.set('cast', castAction);

    this.actions.get('idle')!.play();

    this.mixer.addEventListener('finished', (e) => {
      if (e.action === this.actions.get('cast') && this.current === 'cast') {
        this.transitionTo('idle');
      }
    });
  }

  update(delta: number, velocityMag: number, isCasting: boolean): void {
    this.mixer.update(delta);

    if (this.current === 'cast') return; // let cast finish via 'finished' event

    if (isCasting) {
      this.transitionTo('cast');
      return;
    }

    const target: AnimState = velocityMag > 5 ? 'walk' : 'idle';
    if (target !== this.current) this.transitionTo(target);
  }

  private transitionTo(state: AnimState): void {
    if (state === this.current) return;
    const from = this.actions.get(this.current)!;
    const to = this.actions.get(state)!;

    if (state === 'cast') {
      to.reset();
      to.play();
    }

    from.crossFadeTo(to, 0.2, true);
    this.current = state;
  }
}
