/**
 * `api.capture.record`'s steps (D-457, D-464), pure: what each does, how it is named when it fails,
 * and the page scripts that run them. The recorder (`record.ts`) runs these in an offscreen window.
 */

export type CaptureStep =
  | { do: "go"; url: string; name?: string }
  | { do: "click"; selector: string; name?: string }
  | { do: "hover"; selector: string; name?: string }
  | { do: "type"; selector: string; text: string; name?: string }
  | { do: "scroll"; selector?: string; y?: number; name?: string }
  | { do: "wait"; ms: number; name?: string }
  | { do: "highlight"; selector: string; ms?: number; name?: string };

export const STEP_KINDS = ["go", "click", "hover", "type", "scroll", "wait", "highlight"] as const;

export const CAPTURE_LIMITS = {
  steps: 40,
  seconds: 120,
  wait: 10_000,
  text: 500,
  selector: 300,
  minSize: 320,
  maxSize: 3840,
};

/** Only pages a demo lives on: the web, or a file on this computer. */
export function isCaptureUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === "http:" || u.protocol === "https:" || u.protocol === "file:";
  } catch {
    return false;
  }
}

/** How a step is called in an error: its own name, else what it does. */
export function describeStep(step: CaptureStep, index: number): string {
  const what = step.name?.trim()
    ? step.name.trim()
    : step.do === "go"
      ? `go to ${step.url}`
      : step.do === "wait"
        ? `wait ${step.ms} ms`
        : step.do === "type"
          ? `type into ${step.selector}`
          : step.do === "scroll"
            ? `scroll${step.selector ? ` to ${step.selector}` : ` to ${step.y ?? 0}`}`
            : `${step.do} ${step.selector}`;
  return `Step ${index + 1} (${what})`;
}

/** How long a step takes on screen at least, so the video can follow it (ms). */
export function stepPause(step: CaptureStep): number {
  switch (step.do) {
    case "click":
      return 450;
    case "hover":
      return 400;
    case "scroll":
      return 900;
    case "highlight":
      return Math.min(CAPTURE_LIMITS.wait, step.ms ?? 1200);
    case "wait":
      return Math.min(CAPTURE_LIMITS.wait, step.ms);
    default:
      return 250;
  }
}

const js = (value: unknown) => JSON.stringify(value);

/** The cursor and highlight layer the steps draw on (added after every page load). */
export const OVERLAY_SCRIPT = `(function(){
if(document.getElementById("__jig_cursor"))return true;
var c=document.createElement("div");c.id="__jig_cursor";
c.style.cssText="position:fixed;left:-40px;top:-40px;width:22px;height:22px;z-index:2147483647;pointer-events:none;transition:left .6s cubic-bezier(.2,.9,.25,1),top .6s cubic-bezier(.2,.9,.25,1)";
c.innerHTML='<svg width="22" height="22" viewBox="0 0 24 24"><path d="M4 2l16 11-7 1.5L9.5 21z" fill="#111" stroke="#fff" stroke-width="1.6" stroke-linejoin="round"/></svg>';
document.documentElement.appendChild(c);return true})()`;

/** Waits up to `timeout` ms for `selector`; resolves to the element's centre or an error text. */
export function findScript(selector: string, timeout = 5000): string {
  return `new Promise(function(done){var end=Date.now()+${timeout};(function look(){var el;try{el=document.querySelector(${js(selector)})}catch(e){return done({error:"isn't a valid selector"})}
if(el){el.scrollIntoView({block:"center",inline:"center"});var r=el.getBoundingClientRect();return done({x:r.left+r.width/2,y:r.top+r.height/2,w:r.width,h:r.height,left:r.left,top:r.top})}
if(Date.now()>end)return done({error:"nothing matches "+${js(selector)}});setTimeout(look,100)})()})`;
}

export function moveScript(x: number, y: number): string {
  return `(function(){var c=document.getElementById("__jig_cursor");if(c){c.style.left=${Math.round(x)}+"px";c.style.top=${Math.round(y)}+"px"}return true})()`;
}

export function clickScript(selector: string): string {
  return `(function(){var el=document.querySelector(${js(selector)});if(!el)return false;
var r=el.getBoundingClientRect(),d=document.createElement("div");d.style.cssText="position:fixed;z-index:2147483646;pointer-events:none;border-radius:50%;width:36px;height:36px;left:"+(r.left+r.width/2-18)+"px;top:"+(r.top+r.height/2-18)+"px;background:rgba(80,140,255,.35);transition:transform .45s ease-out,opacity .45s ease-out";document.documentElement.appendChild(d);requestAnimationFrame(function(){d.style.transform="scale(1.8)";d.style.opacity="0"});setTimeout(function(){d.remove()},600);
["pointerdown","mousedown","pointerup","mouseup"].forEach(function(t){el.dispatchEvent(new MouseEvent(t,{bubbles:true,cancelable:true,view:window}))});if(el.focus)el.focus();el.click();return true})()`;
}

export function hoverScript(selector: string): string {
  return `(function(){var el=document.querySelector(${js(selector)});if(!el)return false;["pointerover","mouseover","pointerenter","mouseenter"].forEach(function(t){el.dispatchEvent(new MouseEvent(t,{bubbles:true,view:window}))});return true})()`;
}

/** Types one character the way a framework's input notices (the native setter, then input). */
export function typeCharScript(selector: string, soFar: string): string {
  return `(function(){var el=document.querySelector(${js(selector)});if(!el)return false;el.focus&&el.focus();
var proto=el instanceof HTMLTextAreaElement?HTMLTextAreaElement.prototype:HTMLInputElement.prototype,d=Object.getOwnPropertyDescriptor(proto,"value");
if(el.isContentEditable){el.textContent=${js(soFar)}}else if(d&&d.set){d.set.call(el,${js(soFar)})}else{el.value=${js(soFar)}}
el.dispatchEvent(new Event("input",{bubbles:true}));return true})()`;
}

export function changeScript(selector: string): string {
  return `(function(){var el=document.querySelector(${js(selector)});if(el)el.dispatchEvent(new Event("change",{bubbles:true}));return true})()`;
}

export function scrollScript(step: Extract<CaptureStep, { do: "scroll" }>): string {
  if (step.selector)
    return `(function(){var el=document.querySelector(${js(step.selector)});if(!el)return false;el.scrollIntoView({behavior:"smooth",block:"center"});return true})()`;
  return `(function(){window.scrollTo({top:${Math.max(0, Math.round(step.y ?? 0))},behavior:"smooth"});return true})()`;
}

export function highlightScript(
  rect: { left: number; top: number; w: number; h: number },
  ms: number,
): string {
  return `(function(){var d=document.createElement("div");d.style.cssText="position:fixed;z-index:2147483646;pointer-events:none;border-radius:10px;box-shadow:0 0 0 4px rgba(80,140,255,.9),0 0 0 9999px rgba(0,0,0,.28);opacity:0;transition:opacity .25s;left:${Math.round(rect.left - 6)}px;top:${Math.round(rect.top - 6)}px;width:${Math.round(rect.w + 12)}px;height:${Math.round(rect.h + 12)}px";document.documentElement.appendChild(d);requestAnimationFrame(function(){d.style.opacity="1"});setTimeout(function(){d.style.opacity="0";setTimeout(function(){d.remove()},300)},${Math.max(300, ms - 300)});return true})()`;
}

/** The page's visible text, for the real-data scan (cut). */
export const TEXT_SCRIPT = `(document.body&&document.body.innerText||"").slice(0,20000)`;

/** How many frames a recording should have after `elapsedMs` at `fps`. */
export function framesDue(elapsedMs: number, fps: number): number {
  return Math.floor((elapsedMs * fps) / 1000) + 1;
}
