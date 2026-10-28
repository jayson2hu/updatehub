// Shared by the server layout (boot script) and the client toggle; no React here.
export type ThemeChoice = 'system' | 'light' | 'dark';
export const THEMES: ThemeChoice[] = ['system', 'light', 'dark'];
export const THEME_KEY = 'bmiao:v1:theme';

/** Applies the stored choice before first paint to avoid a light flash in dark mode. */
export const themeBootScript = `try{var t=JSON.parse(localStorage.getItem(${JSON.stringify(THEME_KEY)})||'"system"');if(t==='light'||t==='dark'||t==='system')document.documentElement.dataset.theme=t}catch(e){}`;
