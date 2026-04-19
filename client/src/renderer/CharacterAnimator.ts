import * as THREE from 'three';

type AnimState = 'idle' | 'walk' | 'cast';

export class CharacterAnimator {
  private mixer: THREE.AnimationMixer;
  private actions = new Map<AnimState, THREE.AnimationAction>();
  private current: AnimState = 'idle';

  constructor(root: THREE.Object3D, clips: THREE.AnimationClip[]) {
    this.mixer = new THREE.AnimationMixer(root);

    const find = (...names: string[]) => {
      const lower = names.map(n => n.toLowerCase());
      return clips.find(c => lower.includes(c.name.toLowerCase())) ?? clips[0];
    };

    const idleClip  = find('idle', 'Idle', 'IDLE');
    const walkClip  = find('walk', 'Walk', 'WALK', 'run', 'Run') ?? idleClip;
    const castClip  = find('attack', 'Attack', 'cast', 'Cast', 'spell', 'Spell') ?? idleClip;

    this.actions.set('idle', this.mixer.clipAction(idleClip));
    this.actions.set('walk', this.mixer.clipAction(walkClip));

    const castAction = this.mixer.clipAction(castClip);
    castAction.setLoop(THREE.LoopOnce, 1);
    castAction.clampWhenFinished = true;
    this.actions.set('cast', castAction);

    this.actions.get('idle')!.play();

    this.mixer.addEventListener('finished', (e) => {
      if (e.action === this.actions.get('cast') && this.current === 'cast') {
        this.current = 'idle'; // reset so transitionTo can run
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

  transitionTo(state: AnimState): void {
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
