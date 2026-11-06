/// <reference types="vite/client" />

declare module "@demo/demo" {
  const demo: import("./kit/types").DemoConfig;
  export default demo;
}
