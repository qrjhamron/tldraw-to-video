import { DEFAULT_THEME, type TLTheme } from "tldraw";
const light = structuredClone(DEFAULT_THEME.colors.light);
for (const [key, solid] of Object.entries({
  black: "#263238",
  blue: "#285d92",
  orange: "#b47a25",
  red: "#b84d46",
  grey: "#78817f",
  green: "#3e7869",
})) {
  const c = light[key as keyof typeof light];
  if (typeof c === "object") {
    c.solid = solid;
    c.fill = solid;
    c.semi = solid;
    c.pattern = solid;
  }
}
light.background = "#faf8f2";
light.solid = "#faf8f2";
light.text = "#263238";
export const teachingTheme: TLTheme = {
  ...DEFAULT_THEME,
  id: "teaching",
  colors: { light, dark: DEFAULT_THEME.colors.dark },
};
declare module "@tldraw/tlschema" {
  interface TLThemes {
    teaching: TLTheme;
  }
}
