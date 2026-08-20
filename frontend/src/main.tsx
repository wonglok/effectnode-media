(window as any).PORT = 4000;

// import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import "./movie-app/index.css";
import AppRouter from "./movie-app/AppRouter";

createRoot(document.getElementById("root")!).render(
  <>
    <BrowserRouter>
      <AppRouter port={4000}></AppRouter>
    </BrowserRouter>
  </>,
);
