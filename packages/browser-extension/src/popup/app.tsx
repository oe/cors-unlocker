import React from "react";
import ReactDOM from "react-dom/client";
import { useEffect } from 'react';
import "./style.css";

function App() {
  useEffect(() => {
    console.log("Hello from the popup!");
  }, []);

  return (
    <div>
      <img src="/icon-with-shadow.svg" />
      <h1>vite-plugin-web-extension</h1>
      <p>
        Templates: <code>react-ts</code>
      </p>
    </div>
  )
}

ReactDOM.createRoot(document.body).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
