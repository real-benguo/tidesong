import '@fontsource-variable/noto-serif-sc';
import '@fontsource-variable/noto-sans-sc';
import '@fontsource/cormorant-garamond/400.css';
import '@fontsource/cormorant-garamond/600.css';
import './styles/ui.css';
import { Game } from './core/Game.js';

const canvas = document.getElementById('scene');
const game = new Game(canvas);

window.__TIDESONG__ = game;
window.__game = game;

game.boot().catch((err) => {
  console.error('[TIDESONG] boot failed', err);
  const boot = document.getElementById('boot-screen');
  if (boot) {
    const status = boot.querySelector('.boot-status');
    if (status) status.textContent = '潮水没有回应。请刷新页面。';
  }
});
