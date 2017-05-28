import xs, {Stream} from 'xstream';
import {div, input, button, p, makeDOMDriver, VNode, DOMSource} from '@cycle/dom';
import {StateSource} from 'cycle-onionify';

export type State = {
  key?: number,
  weight: number;
  height: number;
};

export type Reducer = (prev?: State) => State | undefined;

export type Sources = {
  DOM: DOMSource;
  onion: StateSource<State>;
};

export type Sinks = {
  DOM: Stream<VNode>;
  onion: Stream<Reducer>;
};

export function bmi(state: State): number {
  const {height: h, weight: w} = state;
  return w / (h * h);
}

export function randomCounter(): State {
  return {
    height: 1 + Math.random(),
    weight: 40 + Math.random() * 80
  }
}

export default function BmiCounter(sources: Sources): Sinks {
  const state$ = sources.onion.state$;
  const vdom$ = state$.map(state =>
    div([
      div([
        'Height', input('.height', {attrs: {type: 'range', min: 90, max: 220, value: state.height * 100}})
      ]),
      div([
        'Weight', input('.weight', {attrs: {type: 'range', min: 30, max: 150, value: state.weight}})
      ]),
      p(['BMI is: ' + bmi(state).toFixed(2) + ' ', button('.rm', 'Remove this counter')]),
    ])
  );
  const reducer$ = xs.merge(
    sources.DOM.select('.weight').events('input').map(ev => (state: State): State => ({
      ...state,
      weight: Number((ev.target as HTMLInputElement).value)
    })),
    sources.DOM.select('.height').events('input').map(ev => (state: State): State => ({
      ...state,
      height: Number((ev.target as HTMLInputElement).value) / 100
    })),
    sources.DOM.select('.rm').events('click').map(() => () => undefined)
  );
  return {
    DOM: vdom$,
    onion: reducer$,
  };
}
