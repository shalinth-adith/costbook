/**
 * The only part of the bench that touches a browser. Everything it renders is
 * built by render.ts, which is pure and covered by tests.
 */

import { renderBench } from './render.js';

const app = document.querySelector('#app');
if (app !== null) app.innerHTML = renderBench();
