class DialControl {
    constructor(options) {
        this.patchConnection= options.patchConnection;
        this.param= options.param;
        this.knob= options.knob;
        this.ring= options.ring;
        this.valueLabel= options.valueLabel;
        this.formatValue= options.formatValue;
        this.onChange= options.onChange;
        this.min= options.min;
        this.max= options.max;
        this.step= options.step;
        this.defaultValue= options.defaultValue;

        if (!(this.max > this.min)) { this.min= 0; this.max= 1; }
        if (!(this.step > 0)) this.step= (this.max - this.min) / 100;

        this.value= this.defaultValue;
        this.dragging= false;
        this.activePointerId= null;

        this.knob.addEventListener("pointerdown", (e)=> this.onPointerDown(e));
        window.addEventListener("pointermove", (e)=> this.onPointerMove(e));
        window.addEventListener("pointerup", (e)=> this.onPointerUp(e));
        this.knob.addEventListener("dblclick", ()=> this.setValue(this.defaultValue, true));

        this.setValue(this.defaultValue, false);
    }

    setValue(value, notify) {
        const numericValue= Number.isFinite(value) ? value : this.defaultValue;
        const clamped= Math.max(this.min, Math.min(this.max, numericValue));
        const steps= Math.round((clamped - this.min) / this.step);
        this.value= this.min + steps * this.step;

        this.updateVisuals();

        if (this.valueLabel) this.valueLabel.textContent= this.formatValue(this.value);
        if (notify === true) this.patchConnection.sendEventOrValue(this.param, this.value);
    }

    updateVisuals() {
        const norm= (this.value - this.min) / (this.max - this.min);
        const dash_array= 283; // 2 * PI * R
        const offset= dash_array - (norm * dash_array);
        
        this.ring.style.strokeDashoffset= offset;
        this.knob.style.setProperty("--norm", norm);
        this.knob.style.setProperty("--angle", `${-135 + norm * 270}deg`);
    }

    onPointerDown(e) {
        if (e.button !== 0) return;
        this.startY= e.clientY;
        this.startValue= this.value;
        this.activePointerId= e.pointerId;
        this.dragging= true;
        this.knob.setPointerCapture(e.pointerId);
    }

    onPointerMove(e) {
        if (!this.dragging || this.activePointerId !== e.pointerId) return;
        const delta= this.startY - e.clientY;
        const sensitivity= (this.max - this.min) / 200;
        const fine= e.shiftKey ? 0.1 : 1.0;
        this.setValue(this.startValue + delta * sensitivity * fine, true);
    }

    onPointerUp(e) {
        if (this.activePointerId !== e.pointerId) return;
        this.dragging= false;
        this.activePointerId= null;
    }
}

class AutoDialsPatchView extends HTMLElement {
    constructor(patchConnection) {
        super();
        this.patchConnection= patchConnection;
        this.className= "empire-ui-root";
        this.paramSpecs= [
            { id: 'param1', label: 'Osc 1 Fine', min: -100, max: 100, step: 1, init: 0 },
            { id: 'param2', label: 'FM Amount', min: 0, max: 1, step: 0.01, init: 0.22 },
            { id: 'param3', label: 'Drive', min: 0, max: 2, step: 0.01, init: 1 },
            { id: 'param4', label: 'Pulse Width', min: 0.05, max: 0.95, step: 0.01, init: 0.5 },
            { id: 'param5', label: 'Attack', min: 0, max: 2, step: 0.01, init: 0.01 },
            { id: 'param6', label: 'Decay', min: 0, max: 2, step: 0.01, init: 0.1 },
            { id: 'param7', label: 'Sustain', min: 0, max: 1, step: 0.01, init: 0.7 },
            { id: 'param8', label: 'Release', min: 0, max: 3, step: 0.01, init: 0.5 },
            { id: 'param9', label: 'Cutoff', min: 0, max: 1, step: 0.01, init: 0.8 }
        ];
        this.innerHTML= this.getHTML();
        this.controls= new Map();
    }

    connectedCallback() {
        this.querySelectorAll(".control").forEach((node)=> {
            const param= node.dataset.param;
            const spec= this.paramSpecs.find((s)=> s.id === param);
            const dial= new DialControl({
                patchConnection: this.patchConnection,
                param,
                knob: node.querySelector(".knob-hit-zone"),
                ring: node.querySelector(".ring-progress"),
                valueLabel: node.querySelector(".value-text"),
                min: spec.min, max: spec.max, step: spec.step, defaultValue: spec.init,
                formatValue: (v)=> v.toFixed(2)
            });
            this.controls.set(param, dial);
            this.patchConnection.requestParameterValue(param);
        });

        this.paramListener= (e)=> {
            const c= this.controls.get(e.endpointID);
            if (c) c.setValue(Number(e.value), false);
        };
        this.patchConnection.addAllParameterListener(this.paramListener);
    }

    getHTML() {
        const controls= this.paramSpecs.map(s => `
            <div class="control" data-param="${s.id}">
                <div class="knob-container">
                    <svg class="knob-svg" viewBox="0 0 100 100">
                        <circle class="ring-bg" cx="50" cy="50" r="45" />
                        <circle class="ring-progress" cx="50" cy="50" r="45" />
                    </svg>
                    <div class="knob-hit-zone">
                        <div class="knob-core">
                            <div class="knob-indicator"></div>
                        </div>
                    </div>
                    <div class="value-display">
                        <span class="value-text">${s.init}</span>
                    </div>
                </div>
                <div class="label">${s.label}</div>
            </div>
        `).join("");

        return `
            <style>
                :host {
                    display: block; width: 800px; height: 600px;
                    background: #0a0b0d; color: #fff;
                    font-family: 'Courier New', monospace;
                }
                .empire-ui-root {
                    padding: 40px;
                    background: radial-gradient(circle at 50% 0%, #1a1c20 0%, #0a0b0d 100%);
                    height: 100%; display: flex; flex-direction: column;
                }
                .controls-grid {
                    display: grid; grid-template-columns: repeat(3, 1fr); gap: 40px;
                    justify-items: center; align-items: center;
                }
                .knob-container {
                    position: relative; width: 120px; height: 120px;
                    filter: drop-shadow(0 0 15px rgba(0, 255, 150, 0.1));
                }
                .knob-svg {
                    width: 100%; height: 100%; transform: rotate(135deg);
                }
                .ring-bg {
                    fill: none; stroke: rgba(255,255,255,0.05); stroke-width: 6;
                    stroke-dasharray: 283; stroke-dashoffset: 70; /* Show 270 degrees */
                }
                .ring-progress {
                    fill: none; stroke: #00ff96; stroke-width: 6;
                    stroke-linecap: round; stroke-dasharray: 283;
                    stroke-dashoffset: 283; transition: stroke-dashoffset 0.1s ease;
                    filter: drop-shadow(0 0 5px #00ff96);
                }
                .knob-hit-zone {
                    position: absolute; inset: 15px; border-radius: 50%;
                    background: #15171b; cursor: ns-resize;
                    box-shadow: inset 0 2px 5px rgba(255,255,255,0.1), 0 5px 15px rgba(0,0,0,0.5);
                    display: flex; align-items: center; justify-content: center;
                }
                .knob-core {
                    width: 80%; height: 80%; border-radius: 50%;
                    background: linear-gradient(145deg, #1e2025, #0a0b0d);
                    border: 1px solid rgba(255,255,255,0.05);
                    position: relative; transform: rotate(var(--angle, -135deg));
                }
                .knob-indicator {
                    position: absolute; top: 10%; left: 50%; width: 4px; height: 15%;
                    background: #00ff96; transform: translateX(-50%); border-radius: 2px;
                    box-shadow: 0 0 10px #00ff96;
                }
                .value-display {
                    position: absolute; bottom: -20px; left: 50%; transform: translateX(-50%);
                    background: rgba(0,255,150,0.1); padding: 2px 8px; border-radius: 4px;
                    border: 1px solid rgba(0,255,150,0.2);
                }
                .value-text { color: #00ff96; font-size: 10px; font-weight: bold; }
                .label { margin-top: 30px; text-align: center; color: #888; font-size: 11px; text-transform: uppercase; letter-spacing: 2px; }
            </style>
            <div class="empire-ui-root">
                <div class="controls-grid">${controls}</div>
            </div>
        `;
    }
}

export default function createPatchView(patchConnection) {
    const name= "empire-fancy-view";
    if (!window.customElements.get(name)) window.customElements.define(name, AutoDialsPatchView);
    return new (window.customElements.get(name))(patchConnection);
}
