import { initEvents } from './ui/events.js';
import { init } from './ui/init.js';

// Mesma ordem do antigo arquivo único: primeiro os eventos, depois idioma, estado e primeiro render.
initEvents();
init();
