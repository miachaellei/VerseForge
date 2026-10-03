import React from "react";
import ReactDOM from "react-dom/client";
import Home from "../app/page";
import "../app/globals.css";

const root = document.getElementById("root");
if (!root) throw new Error("Desktop root element is missing");

ReactDOM.createRoot(root).render(
  <React.StrictMode>
    <Home />
  </React.StrictMode>,
);

