import xs from 'xstream';
import {run} from '@cycle/run';
import {makeDOMDriver} from '@cycle/dom';
import onionify from 'cycle-onionify';
import BmiApp from './BmiApp';

const main = onionify(BmiApp);

run(main, {
  DOM: makeDOMDriver('#main-container')
});
