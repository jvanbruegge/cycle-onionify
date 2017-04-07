import {DevToolEnabledSource} from '@cycle/run';
import xs, {Stream, MemoryStream} from 'xstream';
import { Record } from './record';
import dropRepeats from 'xstream/extra/dropRepeats';

export type MainFn<So, Si> = (sources: So) => Si;
export type Reducer<T> = (state: Record<T> | undefined) => Record<T> | undefined;
export type Selector = (sinks: any) => any;
export type Aggregator = (...streams: Array<Stream<any>>) => Stream<any>;
export type Getter<T> = (state: Record<T> | undefined) => T[keyof T] | undefined;
export type Setter<T, R> = (state: Record<T> | undefined, childState: T[keyof T] | undefined) => Record<T> | undefined;
export type Lens<T, R> = {
  get: Getter<T>;
  set: Setter<T, R>;
}
export type Scope<T, R> = keyof T | Lens<T, R>;

function isLens<T, R>(scope : Scope<T, R>) : scope is Lens<T, R> {
    return !(typeof scope === 'string');
}

export function pick(selector: Selector | string) {
  if (typeof selector === 'string') {
    return function pickWithString(sinksArray$: Stream<Array<any>>): Stream<Array<any>> {
      return sinksArray$.map(sinksArray => sinksArray.map(sinks => sinks[selector]));
    };
  } else {
    return function pickWithFunction(sinksArray$: Stream<Array<any>>): Stream<Array<any>> {
      return sinksArray$.map(sinksArray => sinksArray.map(selector));
    };
  }
}

export function mix(aggregator: Aggregator) {
  return function mixOperator(streamArray$: Stream<Array<Stream<any>>>): Stream<any> {
    return streamArray$
      .map(streamArray => aggregator(...streamArray))
      .flatten();
  }
}

function makeGetter<T, R>(scope: Scope<T, R>): Getter<T> {
  if (!isLens(scope)) {
    return function lensGet(state : Record<T> | undefined) {
      if (typeof state === 'undefined') {
        return void 0;
      } else {
        return state.get(scope);
      }
    };
  } else {
    return scope.get;
  }
}

function makeSetter<T, R>(scope: Scope<T, R>): Setter<T, R> {
  if (!isLens(scope)) {
      return function lensSet(state: Record<T> | undefined, childState: T[keyof T]): Record<T> {
        const record = typeof state === 'undefined' ? new Record<T>() : state;
        return record.set(scope, childState);
    };
  } else {
    return scope.set;
  }
}

export function isolateSource<T, R>(
                             source: StateSource<T>,
                             scope: Scope<T, R>): StateSource<R> {
  return source.select(scope);
}

export function isolateSink<T, R>(
                           innerReducer$: Stream<Reducer<R>>,
                           scope: Scope<T, R>): Stream<Reducer<T>> {
  const get = makeGetter(scope);
  const set = makeSetter(scope);

  return innerReducer$
    .map(innerReducer => function outerReducer(outer: Record<T> | undefined) {
      const prevInner = get(outer);
      const nextInner = innerReducer(prevInner as Record<R> | undefined)as any as T[keyof T];
      if (prevInner === nextInner) {
        return outer;
      } else {
        return set(outer, nextInner);
      }
    });
}

export class StateSource<T> {
  public state$: MemoryStream<Record<T>>;
  private _name: string | null;

  constructor(stream: Stream<any>, name: string | null) {
    this._name = name;
    this.state$ = stream.compose(dropRepeats()).remember();
    if (!name) {
      return;
    }
    (this.state$ as MemoryStream<Record<T>> & DevToolEnabledSource)._isCycleSource = name;
  }

  public select<R>(scope: Scope<T, R>): StateSource<R> {
    const get = makeGetter(scope);
    return new StateSource<R>(
      this.state$.map(get).filter(s => typeof s !== 'undefined'),
      null,
    );
  }

  public isolateSource = isolateSource;
  public isolateSink = isolateSink;
}

export default function onionify<So, Si>(
                                main: MainFn<So, Si>,
                                name: string = 'onion'): MainFn<Partial<So>, Partial<Si>> {
  return function mainOnionified(sources: Partial<So>): Partial<Si> {
    const reducerMimic$ = xs.create<Reducer<any>>();
    const state$ = reducerMimic$
      .fold((state, reducer) => reducer(state), void 0 as Record<any> | undefined)
      .drop(1);
    sources[name] = new StateSource<any>(state$, name) as any;
    const sinks = main(sources as So);
    reducerMimic$.imitate(sinks[name]);
    return sinks;
  }
}
