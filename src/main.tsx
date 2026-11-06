import "@generated/demo.css";
import demo from "@demo/demo";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { DemoApp } from "@/kit/App";

const root = document.getElementById("root");
if (!root) throw new Error("no #root");
createRoot(root).render(
  <StrictMode>
    <DemoApp demo={demo} />
  </StrictMode>,
);
