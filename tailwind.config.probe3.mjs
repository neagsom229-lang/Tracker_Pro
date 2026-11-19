import config from './tailwind.config.js';

export default {
  content: [{ raw: '<div class="text-primary bg-card bg-muted text-secondary text-warning text-destructive text-ring"></div>' }],
  theme: { extend: { colors: config.theme.extend.colors } },
};
