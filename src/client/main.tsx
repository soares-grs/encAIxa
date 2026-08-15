import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./app.css";
import "./branding.css";
createRoot(document.getElementById("root")!).render(<React.StrictMode><App/></React.StrictMode>);
