// import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import "./movie-app/index.css";
import AppRouter from "./movie-app/AppRouter";

createRoot(document.getElementById("root")!).render(
  <>
    <BrowserRouter>
      <AppRouter port={(window as any).PORT}></AppRouter>
    </BrowserRouter>
  </>,
);
