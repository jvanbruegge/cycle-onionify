import xs, {Stream, InternalListener, Operator} from 'xstream';
import {Instances, CollectionEntry} from './index';

class PickMergeListener<Si, T> implements InternalListener<T> {
  public ins: Stream<T>;
  public key: any;
  public p: PickMerge<Si, T>;

  constructor(key: any, p: PickMerge<Si, T>, ins: Stream<T>) {
    this.key = key;
    this.ins = ins;
    this.p = p;
  }

  _start(): void {
    if (this.ins === null) return;
    this.ins._add(this);
  }

  _stop(): void {
    const ins = this.ins;
    if (ins === null) return;
    this.ins = null as any;
    ins._remove(this);
  }

  _n(t: T): void {
    this.p.upn(t);
  }

  _e(err: any): void {
    this.p.upe(err);
  }

  _c(): void {
    this.p.upc(this);
  }
}

class PickMerge<Si, T> implements Operator<Instances<Si>, T> {
  public type = 'pickMerge';
  public ins: Stream<Instances<Si>>;
  public out: Stream<T>;
  private sel: string;
  private ils: Map<any, PickMergeListener<Si, T>>;
  private active: boolean;

  constructor(sel: string, ins: Stream<Instances<Si>>) {
    this.ins = ins;
    this.out = null as any;
    this.sel = sel;
    this.ils = new Map();
    this.active = false;
  }

  upn(t: T): void {
    if (this.out !== null) {
      this.out._n(t);
    }
  }

  upe(err: Error): void {
    this._e(err);
  }

  upc(il: PickMergeListener<Si, T>) {
    this.ils.delete(il.key);
    il._stop();
  }

  _start(out: Stream<T>): void {
    this.out = out;
    this.ins._add(this);
  }

  _stop(): void {
    const ils = this.ils, ins = this.ins;
    this.out = this.ins = null as any;
    this.ils = new Map();
    this.active = false;
    ils.forEach(il => {
      il._stop();
    });
    ins._remove(this);
  }

  _n(inst: Instances<Si>): void {
    const ils = this.ils, sel = this.sel;
    const {added, removed} = this.active ? inst : {added: new Set(inst.cache.values()), removed: new Set<CollectionEntry<Si>>()};
    this.active = true;
    removed.forEach(ce => {
      const il = ils.get(ce.key);
      if (il) {
        ils.delete(ce.key);
        il._stop();
      }
    });
    added.forEach(ce => {
      const key = ce.key;
      const sink = ce.sinks[sel] || xs.never();
      ils.set(key, new PickMergeListener(key, this, sink));
    })
    added.forEach(({key}) => {
      (ils.get(key) as PickMergeListener<Si, T>)._start();
    })
  }

  _e(err: any) {
    const u = this.out;
    if (u === null) return;
    u._e(err);
  }

  _c() {
    const u = this.out;
    if (u === null) return;
    u._c();
  }
}

/**
 * Like `merge` in xstream, this operator blends multiple streams together, but
 * picks those streams from a stream of instances.
 *
 * The instances data structure has a sinks object for each instance. Use the
 * `selector` string to pick a stream from the sinks object of each instance,
 * then pickMerge will merge all those picked streams.
 *
 * @param {String} selector a name of a channel in a sinks object belonging to
 * each component in the collection of instances.
 * @return {Function} an operator to be used with xstream's `compose` method.
 */
export function pickMerge(selector: string) {
  return function pickMergeOperator(inst$: Stream<Instances<any>>): Stream<any> {
    return new Stream(new PickMerge(selector, inst$));
  };
}
