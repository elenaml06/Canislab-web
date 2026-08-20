import React from "react";
import ReactDOM from "react-dom/client";
import { iniciarSentry } from "./sentry.js";
import App from "./App.jsx";
import "./index.css";

// Lo primero de todo, antes de montar React: así un fallo que ocurra
// durante el primer render también queda capturado.
iniciarSentry();

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
