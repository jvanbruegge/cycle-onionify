import xs, {Stream, InternalListener, OutSender, Operator, NO} from 'xstream';
import {Instances, CollectionEntry} from './index';

class PickCombineListener<Si, T> implements InternalListener<T> {
  private key: string;
  public p: PickCombine<Si, T>;
  public val: T;
  public ins: Stream<T>;
  public idx: number;

  constructor(p: PickCombine<Si, T>, ins: Stream<T>, idx: number) {
    this.p = p;
    this.val = NO as any;
    this.ins = ins;
    this.idx = idx;
  }

  _start(): void {
    this.ins._add(this);
  }

  _stop(): void {
    const ins = this.ins;
    this.ins = this.val = null as any;
    if (ins === null) return;
    ins._remove(this);
  }

  _n(t: T): void {
    const p = this.p, val = this.val;
    this.val = t;
    p.up(val === NO);
  }

  _e(err: any): void {
    this.p._e(err);
  }

  _c(): void {
  }
}

class PickCombine<Si, R> implements Operator<Instances<Si>, Array<R>> {
  public type = 'combine';
  public ins: Stream<Instances<Si>>;
  public out: Stream<Array<R>>;
  private sel: string;
  private ils: Map<any, PickCombineListener<Si, R>>;
  private pending: number;
  private active: boolean;

  constructor(sel: string, ins: Stream<Instances<Si>>) {
    this.ins = ins;
    this.sel = sel;
    this.out = null as any;
    this.ils = new Map();
    this.pending = 0;
    this.active = false;
  }

  _start(out: Stream<Array<R>>): void {
    this.out = out;
    this.ins._add(this);
  }

  _stop(): void {
    const ils = this.ils, ins = this.ins;
    this.ils = new Map();
    this.pending = 0;
    this.out = this.ins = null as any;
    this.active = false;
    ils.forEach(il => {
      il._stop();
    });
    ins._remove(this);
  }

  up(childReady: boolean): void {
    if (childReady) {
      this.pending--;
    }
    if (this.pending === 0 && this.out !== null) {
      const ils = this.ils;
      const arr = Array(ils.size);
      ils.forEach(il => {
        arr[il.idx] = il.val;
      })
      this.out._n(arr);
    }
  }

  _n(inst: Instances<Si>): void {
    const {added, removed, reindexed} = this.active ? inst : {
      added: new Set(inst.cache.values()),
      reindexed: new Set<CollectionEntry<Si>>(),
      removed: new Set<CollectionEntry<Si>>()
    };
    const ils = this.ils, sel = this.sel;
    this.active = true;
    // NOTE: order is *important*
    // removed first (they don't emit any events)
    removed.forEach(ce => {
      const il = ils.get(ce.key);
      if (il !== undefined) {
        il.val === NO && this.pending--;
        ils.delete(ce.key);
        il._stop();
      }
    });
    // then reindexed (again, no events emitted)
    reindexed.forEach(ce => {
      const il = ils.get(ce.key);
      if (il !== undefined) {
        il.idx = ce.idx;
      }
    });
    // then added. note that the added entries might emit events synchronously, hence we
    // need a 2-stage addition (first step increments our pending counter which prevents the
    // incomplete states from propagating to the 'out' stream)
    added.forEach(ce => {
      this.pending++;
      const ins = ce.sinks[sel] || xs.of(undefined);
      ils.set(ce.key, new PickCombineListener(this, ins, ce.idx));
    });
    added.forEach(ce => {
      (ils.get(ce.key) as PickCombineListener<Si, R>)._start();
    });

    // if we have added anything, the inner subscriptions will invoke 'up' sooner or later
    // so we need to trigger 'up' manually only if there are no additions or no items at
    // all (otherwise this wouldn't emit anything for empty collections...)
    if ((added.size === 0 && (removed.size > 0 || reindexed.size > 0)) || ils.size === 0) {
      this.up(false);
    }
  }

  _e(e: any): void {
    const out = this.out;
    if (out === null) return;
    out._e(e);
  }

  _c(): void {
    const out = this.out;
    if (out === null) return;
    out._c();
  }
}

/**
 * Like `combine` in xstream, this operator combines multiple streams together,
 * but picks those streams from a stream of instances.
 *
 * The instances data structure has a sinks object for each instance. Use the
 * `selector` string to pick a stream from the sinks object of each instance,
 * then pickCombine will combine all those picked streams.
 *
 * @param {String} selector a name of a channel in a sinks object belonging to
 * each component in the collection of instances.
 * @return {Function} an operator to be used with xstream's `compose` method.
 */
export function pickCombine(selector: string) {
  return function pickCombineOperator(inst$: Stream<Instances<any>>): Stream<Array<any>> {
    return new Stream(new PickCombine(selector, inst$));
  };
}
