import * as THREE from 'three';
import type { CaseKind } from './types';
import { CASE_SPECS } from './formats';

export interface Pose { x: number; y: number; z: number; yaw: number; pitch: number; roll: number; s: number; lid: number; spread: number; fade: number }
export interface MovingCase { index: number; pose: Pose }
type Phase = 'rest' | 'opening' | 'open' | 'closing';
type Key = readonly [number, number];
const clamp = THREE.MathUtils.clamp;
const mix = THREE.MathUtils.lerp;
const ease = (t: number): number => { t = clamp(t, 0, 1); return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; };
const pose = (): Pose => ({ x: 0, y: 0, z: 0, yaw: 0, pitch: 0, roll: 0, s: 1, lid: 0, spread: 0, fade: 1 });

/** Fritsch–Carlson tangents preserve each segment's direction, including the lid bounce. */
export function curve(points: readonly Key[]): (t: number) => number {
  if (points.length < 2) throw new Error('A motion curve needs two points');
  const n = points.length, slopes = new Float64Array(n - 1), tangents = new Float64Array(n);
  for (let i = 0; i < n - 1; i++) slopes[i] = (points[i + 1][1] - points[i][1]) / (points[i + 1][0] - points[i][0]);
  tangents[0] = slopes[0]; tangents[n - 1] = slopes[n - 2];
  for (let i = 1; i < n - 1; i++) tangents[i] = slopes[i - 1] * slopes[i] <= 0 ? 0 : (slopes[i - 1] + slopes[i]) / 2;
  for (let i = 0; i < n - 1; i++) {
    if (slopes[i] === 0) { tangents[i] = 0; tangents[i + 1] = 0; continue; }
    const a = tangents[i] / slopes[i], b = tangents[i + 1] / slopes[i], length = Math.hypot(a, b);
    if (length > 3) { const factor = 3 / length; tangents[i] = factor * a * slopes[i]; tangents[i + 1] = factor * b * slopes[i]; }
  }
  return (time: number) => {
    if (time <= points[0][0]) return points[0][1];
    if (time >= points[n - 1][0]) return points[n - 1][1];
    let i = 0;
    while (time > points[i + 1][0]) i++;
    const width = points[i + 1][0] - points[i][0], t = (time - points[i][0]) / width;
    const t2 = t * t, t3 = t2 * t;
    return (2 * t3 - 3 * t2 + 1) * points[i][1] + (t3 - 2 * t2 + t) * width * tangents[i]
      + (-2 * t3 + 3 * t2) * points[i + 1][1] + (t3 - t2) * width * tangents[i + 1];
  };
}
type Ease = 'in' | 'out' | 'elastic' | 'smooth';
type FlightKey = readonly [number, number, Ease?];
function flight(points: readonly FlightKey[]): (t: number) => number {
  return t => {
    if (t <= points[0][0]) return points[0][1];
    if (t >= points[points.length - 1][0]) return points[points.length - 1][1];
    let i = 0;
    while (t > points[i + 1][0]) i++;
    let e = (t - points[i][0]) / (points[i + 1][0] - points[i][0]);
    const easing = points[i + 1][2];
    e = easing === 'in' ? e * e * e : easing === 'out' ? 1 - Math.pow(1 - e, 3)
      : easing === 'elastic' ? (1 - Math.exp(-6 * e) * Math.cos(3 * Math.PI * e)) / (1 + Math.exp(-6)) : ease(e);
    return mix(points[i][1], points[i + 1][1], e);
  };
}
// A real jewel case: the latch pops (a tiny hesitation), the lid swings on its
// hinge, overshoots its stop a touch and settles about 170° open. No showy spin.
const OPEN_TIME = 1.7, OPEN_LID = 2.96;
const opening = {
  yaw: curve([[0, 0], [0.5, 0.04], [1.1, 0.05], [OPEN_TIME, 0]]),
  lid: curve([[0, 0], [0.1, 0.06], [0.2, 0.055], [0.55, 0.75], [0.95, 2.05], [1.25, 2.86], [1.42, 3.02], [1.56, 2.93], [OPEN_TIME, OPEN_LID]]),
  spread: curve([[0, 0], [0.4, 0], [1.25, 0.86], [OPEN_TIME, 1]]),
  pitch: curve([[0, 0], [0.3, 0.04], [1.0, -0.06], [OPEN_TIME, -0.1]]),
};
const closing = {
  lid: curve([[0, OPEN_LID], [0.22, 1.75], [0.48, 1.55], [1.05, 1.08], [1.42, 0.6], [1.6, 0.26], [1.7, 0], [1.78, 0.07], [1.88, 0]]),
  spread: curve([[0, 1], [0.3, 0.92], [1.2, 0.55], [1.72, 0]]),
  yaw: curve([[0, 0], [0.5, 0.2], [1.3, 0.12], [1.88, 0]]),
  pitch: curve([[0, -0.1], [1.6, -0.05], [1.7, 0.035], [1.82, -0.01], [1.95, 0]]),
  roll: curve([[0, 0], [0.8, -0.05], [1.95, 0]]),
};
const outgoing = {
  y: flight([[0, 0], [0.48, -0.8 * 142], [1, -0.12 * 142]]),
  z: flight([[0, 0], [0.45, -46], [1, -82, 'in']]),
  s: flight([[0, 1], [1, 0.62, 'in']]),
  roll: flight([[0, 0], [0.5, 0.2], [1, 0.08]]),
  pitch: flight([[0, 0], [0.45, 0.3], [1, 0]]),
  fade: flight([[0, 1], [0.55, 0.8], [1, 0, 'in']]),
};
const incoming = {
  y: flight([[0, 0.12 * 142], [0.42, 0.9 * 142, 'out'], [1, 0]]),
  z: flight([[0, -55], [0.25, -32, 'out'], [0.5, 27], [1, 0]]),
  s: flight([[0, 0.62], [0.42, 0.9, 'out'], [1, 1, 'out']]),
  roll: flight([[0, -0.28], [0.42, 0.1], [1, 0, 'elastic']]),
  pitch: flight([[0, 0.1], [0.42, -0.4], [0.8, 0.14], [1, 0]]),
};

export class Motion {
  readonly cases: [MovingCase, MovingCase] = [{ index: 0, pose: pose() }, { index: 0, pose: pose() }];
  count = 1;
  current: number;
  phase: Phase = 'rest';
  switching = false;
  dragging = false;
  overCase = false;
  reduced = false;
  spinOn = true;
  spin = 0;
  hoverX = 0; hoverY = 0; dragX = 0; dragY = 0;
  private hoverTargetX = 0; private hoverTargetY = 0;
  private vx = 0; private vy = 0; private flickX = 0; private flickY = 0;
  private yawTarget = 0; private coast = 0;
  private face: 'front' | 'back' = 'front';
  private pointerX = 0; private pointerY = 0; private moveTime = 0; private travel = 0;
  private time = 0; private elapsed = 0; private switchTime = 0; private spinRate = 0;
  private queue = -1; private switches = 0; private direction = 1;
  private closeAfterOpen = false; private openAfterClose = false;
  private auto = false; private autoOpened = false; private userOpened = false;
  private idleClock = 0; private awayClock = 0;
  private readonly start = pose(); private readonly frozen = pose();
  constructor(readonly discCount: number, index: number, private readonly onIndex?: (index: number) => void, private readonly onOpen?: (open: boolean) => void, private readonly onFace?: (face: 'front' | 'back') => void) {
    this.current = index; this.cases[0].index = index;
    this.idle(this.cases[0].pose, index);
    this.onFace?.('front');
  }
  private visibleFront(): boolean { return Math.cos(this.cases[0].pose.yaw + this.hoverY + this.dragY) >= 0; }
  /** Flip to the adjacent face, preserving accumulated turns. */
  flip(direction = 1): void {
    if (this.switching || this.dragging) return;
    this.coast = 0; this.vy = 0;
    this.yawTarget = (Math.round(this.dragY / Math.PI) + Math.sign(direction)) * Math.PI;
  }
  activate(): void {
    if (this.visibleFront()) this.setOpen();
    else {
      this.coast = 0; this.vy = 0;
      this.yawTarget = Math.round(this.dragY / (Math.PI * 2)) * Math.PI * 2;
    }
  }
  isOpen(): boolean { return this.phase === 'opening' || this.phase === 'open' || this.openAfterClose; }
  /** Idle bob and steady disc spin can draw at 30 fps; interaction and settling cannot. */
  isInteracting(): boolean {
    return this.dragging || this.overCase || this.switching || this.phase === 'opening' || this.phase === 'closing'
      || this.coast > 0 || Math.abs(this.vx) + Math.abs(this.vy) > 0.01
      || Math.abs(this.dragX) + Math.abs(this.dragY - this.yawTarget) > 0.002
      || Math.abs(this.hoverX - this.hoverTargetX) + Math.abs(this.hoverY - this.hoverTargetY) > 0.002
      || Math.abs(this.spinRate - (this.spinOn ? Math.PI / 10 : 0)) > 0.005;
  }
  goTo(index: number): void {
    if (!Number.isInteger(index) || index < 0 || index >= this.discCount || index === this.current) return;
    if (this.switching) { this.queue = index; return; }
    Object.assign(this.frozen, this.cases[0].pose);
    this.frozen.yaw += this.dragY + this.hoverY; this.frozen.pitch += this.dragX + this.hoverX;
    this.dragX = 0; this.dragY = 0; this.hoverX = 0; this.hoverY = 0;
    this.vx = 0; this.vy = 0; this.yawTarget = 0; this.coast = 0;
    if (this.face !== 'front') { this.face = 'front'; this.onFace?.('front'); }
    this.cases[1].index = index;
    this.direction = Math.floor(this.switches++ / 2) % 2 === 0 ? 1 : -1;
    const wasOpen = this.isOpen();
    this.phase = 'rest'; this.closeAfterOpen = false; this.openAfterClose = false;
    this.autoOpened = false; this.userOpened = false; this.idleClock = 0;
    this.switching = true; this.switchTime = 0; this.count = 2; this.current = index;
    this.dragging = false; this.hoverTargetX = 0; this.hoverTargetY = 0;
    if (wasOpen) this.onOpen?.(false);
    this.onIndex?.(index);
  }
  next(): void { this.goTo((this.current + 1) % this.discCount); }
  prev(): void { this.goTo((this.current + this.discCount - 1) % this.discCount); }
  setOpen(open = !this.isOpen(), automatic = false): void {
    if (this.switching) return;
    if (open) {
      if (this.phase === 'opening' || this.phase === 'open') return;
      if (this.phase === 'closing') { this.openAfterClose = true; return; }
      Object.assign(this.start, this.cases[0].pose);
      this.phase = 'opening'; this.elapsed = 0; this.closeAfterOpen = false;
      this.autoOpened = automatic; this.userOpened = !automatic; this.awayClock = 0;
      this.onOpen?.(true);
    } else {
      this.openAfterClose = false;
      if (this.phase === 'opening') { this.closeAfterOpen = true; return; }
      if (this.phase !== 'open') return;
      Object.assign(this.start, this.cases[0].pose);
      // Preserve the current orientation when closing after a drag or idle sway.
      this.start.yaw = THREE.MathUtils.euclideanModulo(this.start.yaw + Math.PI, Math.PI * 2) - Math.PI;
      this.phase = 'closing'; this.elapsed = 0; this.userOpened = false;
      this.onOpen?.(false);
    }
  }
  setAutoDemo(on: boolean): void {
    this.auto = on;
    if (!on && this.autoOpened) this.setOpen(false);
  }
  setHover(insideCanvas: boolean, overCase: boolean, nx = 0, ny = 0): void {
    this.overCase = overCase;
    this.hoverTargetX = insideCanvas && !this.switching ? 0.22 * ny : 0;
    this.hoverTargetY = insideCanvas && !this.switching ? -0.35 * nx : 0;
  }
  beginDrag(x: number, y: number, now: number): void {
    if (this.switching) return;
    this.dragging = true; this.pointerX = x; this.pointerY = y; this.moveTime = now;
    this.travel = 0; this.flickX = 0; this.flickY = 0; this.vx = 0; this.vy = 0;
    this.coast = 0;
  }
  moveDrag(x: number, y: number, now: number): void {
    if (!this.dragging) return;
    const dx = x - this.pointerX, dy = y - this.pointerY;
    this.pointerX = x; this.pointerY = y; this.travel += Math.hypot(dx, dy);
    this.dragX = clamp(this.dragX + dy * 0.008, -0.45, 0.45);
    this.dragY += dx * 0.008;
    if (dx !== 0 || dy !== 0) {
      const dt = Math.max((now - this.moveTime) / 1000, 1 / 240);
      this.flickX = clamp(dy * 0.008 / dt, -4, 4);
      this.flickY = clamp(dx * 0.008 / dt, -18, 18);
      this.moveTime = now;
    }
  }
  endDrag(now: number, cancelled = false): void {
    if (!this.dragging) return;
    this.dragging = false;
    this.vx = now - this.moveTime > 90 || cancelled ? 0 : this.flickX;
    this.vy = now - this.moveTime > 90 || cancelled ? 0 : this.flickY;
    this.coast = Math.abs(this.vy) > 0.6 ? 0.24 : 0;
    this.yawTarget = Math.round(this.dragY / Math.PI) * Math.PI;
    if (!cancelled && this.travel < 6) { this.vx = 0; this.vy = 0; this.coast = 0; this.activate(); }
  }
  private idle(p: Pose, index: number): void {
    const t = this.time, seed = index * 2.39996323, m = this.reduced ? 0.35 : 1;
    p.x = 0; p.z = 0; p.s = 1; p.fade = 1; p.lid = 0; p.spread = 0;
    p.yaw = -0.14 + (0.07 * Math.sin(0.7 * t + seed) + 0.02 * Math.sin(1.7 * t + 2 * seed)) * m;
    p.pitch = -0.1 + 0.035 * Math.sin(0.55 * t + 1.7 * seed) * m;
    p.roll = 0.02 + 0.012 * Math.sin(0.45 * t + 0.7 * seed) * m;
    p.y = 1.4 * Math.sin(0.9 * t + seed) * m;
  }
  update(delta: number): void {
    const dt = clamp(delta, 0, 0.05);
    this.time += dt;
    this.spinRate += ((this.spinOn ? Math.PI / 10 : 0) - this.spinRate) * (1 - Math.exp(-2.7 * dt));
    this.spin = (this.spin + this.spinRate * dt) % (Math.PI * 2);
    const hoverBlend = 1 - Math.exp(-4 * dt);
    this.hoverX += ((this.dragging ? 0 : this.hoverTargetX) - this.hoverX) * hoverBlend;
    this.hoverY += ((this.dragging ? 0 : this.hoverTargetY) - this.hoverY) * hoverBlend;
    if (!this.dragging) {
      // Small integration steps keep a large release flick stable at low frame rates.
      const steps = Math.max(1, Math.ceil(dt / 0.0125)), step = dt / steps;
      for (let i = 0; i < steps; i++) {
        this.vx += (-16 * this.dragX - 5.5 * this.vx) * step;
        if (this.coast > 0) {
          this.vy *= Math.exp(-3.2 * step); this.coast -= step;
          this.yawTarget = Math.round((this.dragY + this.vy * 0.12) / Math.PI) * Math.PI;
        } else this.vy += (-(this.dragY - this.yawTarget) * 22 - 8.5 * this.vy) * step;
        this.dragX = clamp(this.dragX + this.vx * step, -0.45, 0.45);
        this.dragY += this.vy * step;
      }
    }
    if (this.switching) {
      this.switchTime += dt;
      const t = clamp(this.switchTime / 1.15, 0, 1), dir = this.direction;
      const a = this.cases[0].pose, b = this.cases[1].pose;
      Object.assign(a, this.frozen); this.idle(b, this.current);
      a.y += outgoing.y(t) * dir; a.z += outgoing.z(t); a.s *= outgoing.s(t);
      a.roll += outgoing.roll(t) * dir; a.pitch += outgoing.pitch(t) * dir; a.fade = outgoing.fade(t);
      a.lid *= 1 - ease(t / 0.72); a.spread *= 1 - ease(t / 0.72);
      b.y += incoming.y(t) * dir; b.z += incoming.z(t); b.s *= incoming.s(t);
      b.roll += incoming.roll(t) * dir; b.pitch += incoming.pitch(t) * dir;
      if (t >= 1) {
        this.switching = false; this.count = 1; this.cases[0].index = this.current;
        Object.assign(a, b); this.elapsed = 0;
        const queued = this.queue; this.queue = -1;
        if (queued >= 0) this.goTo(queued);
      }
      return;
    }
    this.elapsed += dt;
    const p = this.cases[0].pose, e = this.elapsed, m = this.reduced ? 0.35 : 1;
    this.idle(p, this.current);
    if (this.phase === 'opening') {
      p.yaw = opening.yaw(e) + this.start.yaw * (1 - ease(e / 1.1));
      p.pitch = opening.pitch(e) + this.start.pitch * (1 - ease(e / 1.2));
      p.roll = this.start.roll * (1 - ease(e / 1.1)); p.lid = opening.lid(e); p.spread = opening.spread(e);
      if (e >= OPEN_TIME) { this.phase = 'open'; this.elapsed = 0; this.awayClock = 0; if (this.closeAfterOpen) this.setOpen(false); }
    } else if (this.phase === 'open') {
      // Ease the bob in from its exact opening endpoint.
      const bob = m * ease(e / 0.5);
      p.yaw = 0.06 * Math.sin(0.6 * this.time) * bob;
      p.pitch = -0.1 + 0.02 * Math.sin(0.8 * this.time) * bob;
      p.roll = 0; p.lid = OPEN_LID + 0.012 * Math.sin(1.3 * this.time) * bob; p.spread = 1;
    } else if (this.phase === 'closing') {
      const blend = ease((e - 0.9) / 1.05), startWeight = 1 - ease(e / 0.3);
      p.yaw = mix(closing.yaw(e) + this.start.yaw * startWeight, p.yaw, blend);
      p.pitch = mix(closing.pitch(e) + (this.start.pitch + 0.1) * startWeight, p.pitch, blend);
      p.roll = mix(closing.roll(e), p.roll, blend);
      p.lid = closing.lid(e) + (this.start.lid - OPEN_LID) * startWeight; p.spread = closing.spread(e);
      if (e >= 1.95) {
        this.phase = 'rest'; this.elapsed = 0; this.autoOpened = false;
        this.idleClock = Math.max(this.idleClock, 7.1);
        if (this.openAfterClose) { this.openAfterClose = false; this.setOpen(true); }
      }
    }
    if (this.auto) {
      const away = !this.dragging && !this.overCase;
      this.awayClock = away ? this.awayClock + dt : 0;
      if (away && !this.userOpened) this.idleClock += dt;
      if (this.phase === 'rest' && away && this.visibleFront() && this.idleClock >= 2.6 && this.idleClock < 3.1) this.setOpen(true, true);
      if (this.phase === 'open' && this.autoOpened && this.awayClock >= 0.25) this.setOpen(false, true);
      if (this.phase === 'rest' && away && this.idleClock >= 8.8) { this.idleClock = 0; this.next(); }
    }
    const facing = Math.cos(p.yaw + this.dragY + this.hoverY);
    const face = facing > 0.06 ? 'front' : facing < -0.06 ? 'back' : this.face;
    if (face !== this.face) { this.face = face; this.onFace?.(face); }
  }
}

/** Scratch transforms are owned by the caller, so frame updates allocate nothing. */
export class PoseMatrices {
  readonly tray = new THREE.Matrix4(); readonly lid = new THREE.Matrix4(); readonly disc = new THREE.Matrix4();
  private readonly position = new THREE.Vector3(); private readonly scale = new THREE.Vector3();
  private readonly rotation = new THREE.Quaternion(); private readonly euler = new THREE.Euler();
  private readonly hinge = new THREE.Matrix4().makeTranslation(-69.2, 0, 3.6);
  private readonly unhinge = new THREE.Matrix4().makeTranslation(69.2, 0, -3.6);
  private readonly turn = new THREE.Matrix4();
  private readonly discCentre = new THREE.Matrix4().makeTranslation(3.5, 0, 0);
  constructor(private readonly kind: CaseKind = 'jewel') {
    if (kind !== 'jewel') {
      const spec = CASE_SPECS[kind];
      this.hinge.makeTranslation(spec.hingeX, 0, spec.hingeZ);
      this.unhinge.makeTranslation(-spec.hingeX, 0, -spec.hingeZ);
      this.discCentre.makeTranslation(0, 0, 0);
    }
  }
  update(p: Pose, motion: Motion, openScale: number): void {
    const a = p.s * mix(1, openScale, p.spread);
    this.position.set(p.x + CASE_SPECS[this.kind].width / 2 * a * p.spread * 0.96, p.y, p.z);
    this.euler.set(p.pitch + motion.hoverX + motion.dragX, p.yaw + motion.hoverY + motion.dragY, p.roll);
    this.rotation.setFromEuler(this.euler); this.scale.setScalar(a);
    this.tray.compose(this.position, this.rotation, this.scale);
    this.turn.makeRotationY(-p.lid * (this.kind === 'jewel' ? 1 : CASE_SPECS[this.kind].angle / 2.96));
    this.lid.copy(this.tray).multiply(this.hinge).multiply(this.turn).multiply(this.unhinge);
    this.disc.copy(this.tray).multiply(this.discCentre).multiply(this.turn.makeRotationZ(this.kind === 'jewel' ? -motion.spin : 0));
  }
}
