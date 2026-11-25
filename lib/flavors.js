// Gusti di base: disegnati come lattine stilizzate (colori del corpo, delle fasce e della scritta).
// Chiunque può aggiungere una foto vera a uno di questi, o creare gusti nuovi dall'app.
export const BUILTIN = [
  { id: 'original',     name: 'Original',         body: '#111311', accent: '#86d41c', ink: '#9be22d' },
  { id: 'zero-sugar',   name: 'Zero Sugar',       body: '#111316', accent: '#3fb4ea', ink: '#7fd0f5' },
  { id: 'lo-carb',      name: 'Lo-Carb',          body: '#14171c', accent: '#5aa0e6', ink: '#e8eef5' },
  { id: 'ultra-white',  name: 'Ultra White',      body: '#f3f4f2', accent: '#c4c8c4', ink: '#1d201d' },
  { id: 'ultra-paradise', name: 'Ultra Paradise', body: '#eef6e6', accent: '#6fbf3a', ink: '#2f6b14' },
  { id: 'ultra-fiesta', name: 'Ultra Fiesta',     body: '#e7f4fb', accent: '#2aa4dc', ink: '#0f5e85' },
  { id: 'ultra-gold',   name: 'Ultra Gold',       body: '#f4f1e8', accent: '#d2a128', ink: '#6e5310' },
  { id: 'ultra-rosa',   name: 'Ultra Rosà',       body: '#fbe9ef', accent: '#e8719a', ink: '#8c2a4d' },
  { id: 'ultra-red',    name: 'Ultra Red',        body: '#f6f3f3', accent: '#d3192d', ink: '#8a0f1c' },
  { id: 'ultra-violet', name: 'Ultra Violet',     body: '#efe8f7', accent: '#8350c2', ink: '#4b2780' },
  { id: 'ultra-strawberry', name: 'Ultra Strawberry', body: '#f7c6d5', accent: '#ffffff', ink: '#a3213f' },
  { id: 'ultra-watermelon', name: 'Ultra Watermelon', body: '#f7f7f3', accent: '#ef5b6c', ink: '#3f8c3a' },
  { id: 'mango-loco',   name: 'Mango Loco',       body: '#1ea2d6', accent: '#ffc21a', ink: '#ffffff' },
  { id: 'pipeline-punch', name: 'Pipeline Punch', body: '#f3a6c4', accent: '#f2622e', ink: '#5a1630' },
  { id: 'khaotic',      name: 'Juiced Khaotic',   body: '#ff8d1a', accent: '#1d1d1d', ink: '#1d1d1d' },
  { id: 'monarch',      name: 'Monarch',          body: '#f6d7a5', accent: '#d2621f', ink: '#6b2c08' },
  { id: 'the-doctor',   name: 'The Doctor',       body: '#121212', accent: '#ffd21a', ink: '#ffd21a' },
];
export const BUILTIN_IDS = new Set(BUILTIN.map((f) => f.id));
