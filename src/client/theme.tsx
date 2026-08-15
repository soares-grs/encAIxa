import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
type Theme="light"|"dark";
const ThemeContext=createContext<{theme:Theme;toggle:()=>void}>({theme:"light",toggle:()=>{}});
export function ThemeProvider({children}:{children:ReactNode}){const[theme,setTheme]=useState<Theme>(()=>document.documentElement.classList.contains("dark")?"dark":"light");useEffect(()=>{document.documentElement.classList.toggle("dark",theme==="dark");localStorage.setItem("encaixa-theme",theme)},[theme]);return <ThemeContext.Provider value={{theme,toggle:()=>setTheme(v=>v==="dark"?"light":"dark")}}>{children}</ThemeContext.Provider>}
export const useTheme=()=>useContext(ThemeContext);
