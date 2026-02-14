/**
 * JD 2036 Slider Range Card
 * type: custom:jd2036-slider-range-card
 *
 * Supports:
 *  - decimals: number (default 1)
 *  - orientation: "horizontal" | "vertical" (default "horizontal")
 *  - vertical_height: "auto" | number | string (e.g. 280, "280", "280px") default "auto"
 *  - vertical_height_min: number | string (default 30)
 *  - vertical_height_max: number | string (default 1000)
 *  - thickness: number (px) slider track thickness (default 4)
 *
 *  - slider_pct_horizontal: number (1..100) width % of card when horizontal (default 100)
 *  - slider_pct_vertical: number (1..100) height % of available area when vertical (default 100)
 *
 * Colors (all optional; if not set, uses HA theme vars):
 *  - color_base: CSS color (background under the whole slider) default var(--card-background-color)
 *  - color_track: CSS color (unselected track) default var(--divider-color)
 *  - color_connect: CSS color (selected range) default var(--primary-color)
 *  - color_handle: CSS color (handle fill/border) default var(--primary-color)
 *  - color_text: CSS color (values/title) default var(--primary-text-color)
 *
 * Handle sizing + alignment (all optional):
 *  - handle_width: number (default 14)
 *  - handle_height: number (default 14)
 *  - handle_border: number (default 2)
 *  - handle_width_horizontal: number|null (default null -> handle_width)
 *  - handle_height_horizontal: number|null (default null -> handle_height)
 *  - handle_width_vertical: number|null (default null -> handle_width)
 *  - handle_height_vertical: number|null (default null -> handle_height)
 *
 * Offsets:
 *  - handle_y_offset_horizontal: number (px; default 2)  // positive moves DOWN
 *  - handle_x_offset_vertical: number (px; default 0)    // positive moves RIGHT
 *
 * Vertical auto-height behavior:
 *  - If vertical_height = "auto" and the host has a real height (e.g., rows set), it adapts to available space.
 *  - If rows is null / container provides no measurable height (host height < 80px), it falls back to vertical_height_max
 *    to avoid infinite growth / collapse loops.
 */

class Jd2036SliderRangeCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this._updateTimeout = null;
    this.isUpdating = false;

    this._resizeObserver = null;
    this._lastOrient = "horizontal";
    this._lastVertHeightSetting = "auto";
    this._lastVertMin = 30;
    this._lastVertMax = 1000;

    this._lastPctH = 100;
    this._lastPctV = 100;

    // NEW: detect if user explicitly set vertical_height_max
    this._userHasVertMax = false;
  }

  setConfig(config) {
    if (!config.entity_min || !config.entity_max) {
      throw new Error("You need to define 'entity_min' and 'entity_max'");
    }
    this.config = config;

    // NEW: remember if vertical_height_max was provided in YAML
    this._userHasVertMax = Object.prototype.hasOwnProperty.call(config, "vertical_height_max");
  }

  connectedCallback() {
    if (!this._resizeObserver) {
      this._resizeObserver = new ResizeObserver(() => {
        this._applyAutoVerticalHeight();
      });
      this._resizeObserver.observe(this);
    }
    this.render();
  }

  disconnectedCallback() {
    if (this._resizeObserver) {
      this._resizeObserver.disconnect();
      this._resizeObserver = null;
    }
  }

  set hass(hass) {
    this._hass = hass;
    clearTimeout(this._updateTimeout);
    this._updateTimeout = setTimeout(() => {
      if (this.shadowRoot && !this.isUpdating) {
        this.render();
      }
    }, 500);
  }

  _parsePx(v, fallback) {
    if (v === null || v === undefined) return fallback;
    const s = String(v).trim().toLowerCase();
    if (s === "auto") return null;
    const n = parseFloat(s.endsWith("px") ? s.slice(0, -2) : s);
    return Number.isFinite(n) ? n : fallback;
  }

  _cssOrFallback(v, fallbackCss) {
    if (v === null || v === undefined) return fallbackCss;
    const s = String(v).trim();
    return s.length ? s : fallbackCss;
  }

  _clampPct(v, fallback = 100) {
    const n = Number(v);
    if (!Number.isFinite(n)) return fallback;
    return Math.max(1, Math.min(100, Math.round(n)));
  }

  _applyAutoVerticalHeight() {
    if (!this.shadowRoot) return;

    const titleEl = this.shadowRoot.querySelector(".title");
    const valuesEl = this.shadowRoot.querySelector(".values");
    if (!titleEl || !valuesEl) return;

    if (this._lastOrient !== "vertical") return;
    if (String(this._lastVertHeightSetting).toLowerCase() !== "auto") return;

    const hostRect = this.getBoundingClientRect();

    const vmin = Math.max(30, this._lastVertMin || 30);
    let vmax = Math.max(vmin, this._lastVertMax || 1000);

    // NEW: if host height is not measurable AND user did NOT set vertical_height_max,
    // use a sane fallback budget instead of 1000.
    if ((!hostRect.height || hostRect.height < 80) && !this._userHasVertMax) {
      vmax = Math.max(vmin, 350);
    }

    const titleRect = titleEl.getBoundingClientRect();
    const valuesRect = valuesEl.getBoundingClientRect();
    const chrome = (titleRect.height || 0) + (valuesRect.height || 0) + 24;

    // If height is NOT measurable (stack-in-card / no rows):
    // Force card budget to vmax so the % can exist without loop.
    if (!hostRect.height || hostRect.height < 80) {
      this.style.setProperty("--jd-card-height", `${vmax}px`);

      let avail = Math.floor(vmax - chrome);
      avail = Math.max(vmin, avail);

      const scaledAvail = Math.floor(avail * (this._lastPctV / 100));
      const finalH = Math.max(vmin, Math.min(avail, scaledAvail));

      this.style.setProperty("--jd-vert-height", `${finalH}px`);
      return;
    }

    // measurable height (rows set): don't force card height
    this.style.removeProperty("--jd-card-height");

    let avail = Math.floor(hostRect.height - chrome);
    avail = Math.max(vmin, Math.min(vmax, avail));

    const scaledAvail = Math.floor(avail * (this._lastPctV / 100));
    const finalH = Math.max(vmin, Math.min(avail, scaledAvail));

    this.style.setProperty("--jd-vert-height", `${finalH}px`);
  }

  async render() {
    const {
      entity_min,
      entity_max,
      min = 0,
      max = 100,
      step = 1,
      name = "Range Slider",
      unit = "%",
      decimals = 1,
      orientation = "horizontal",
      vertical_height = "auto",
      vertical_height_min = 30,
      vertical_height_max = 1000,
      thickness = 4,

      // percent sizing
      slider_pct_horizontal = 100,
      slider_pct_vertical = 100,

      // colors
      color_base,
      color_track,
      color_connect,
      color_handle,
      color_text,

      // handle
      handle_width = 14,
      handle_height = 14,
      handle_border = 2,
      handle_width_horizontal = null,
      handle_height_horizontal = null,
      handle_width_vertical = null,
      handle_height_vertical = null,

      // offsets
      handle_y_offset_horizontal = 2, // default 2px down
      handle_x_offset_vertical = 0, // default 0px
    } = this.config;

    // store clamped percents for reuse in auto-height
    this._lastPctH = this._clampPct(slider_pct_horizontal, 100);
    this._lastPctV = this._clampPct(slider_pct_vertical, 100);

    const stateMin = this._hass?.states?.[entity_min];
    const stateMax = this._hass?.states?.[entity_max];

    if (!stateMin || !stateMax) {
      this.shadowRoot.innerHTML = `<p>Entities not found</p>`;
      return;
    }

    const valueMin = parseFloat(stateMin.state);
    const valueMax = parseFloat(stateMax.state);

    const dec = Number.isFinite(Number(decimals))
      ? Math.max(0, Math.floor(Number(decimals)))
      : 1;

    const orient =
      String(orientation).toLowerCase() === "vertical" ? "vertical" : "horizontal";

    this._lastOrient = orient;
    this._lastVertHeightSetting = vertical_height;

    // clamp bounds
    const vminParsed = this._parsePx(vertical_height_min, 30);
    const vmaxParsed = this._parsePx(vertical_height_max, 1000);
    this._lastVertMin = Math.max(30, Number(vminParsed) || 30);
    this._lastVertMax = Math.max(this._lastVertMin, Number(vmaxParsed) || 1000);

    // thickness
    const thick = Math.max(2, Number(thickness) || 4);

    // colors (defaults are HA theme vars)
    const baseCss = this._cssOrFallback(color_base, "var(--card-background-color)");
    const trackCss = this._cssOrFallback(color_track, "var(--divider-color)");
    const connectCss = this._cssOrFallback(color_connect, "var(--primary-color)");
    const handleCss = this._cssOrFallback(color_handle, "var(--primary-color)");
    const textCss = this._cssOrFallback(color_text, "var(--primary-text-color)");

    this.style.setProperty("--jd-base-color", baseCss);
    this.style.setProperty("--jd-track-color", trackCss);
    this.style.setProperty("--jd-connect-color", connectCss);
    this.style.setProperty("--jd-handle-color", handleCss);
    this.style.setProperty("--jd-text-color", textCss);

    // horizontal percent width (as CSS)
    this.style.setProperty("--jd-horiz-width", `${this._lastPctH}%`);

    // vertical handle x offset as CSS var (robust: separate translateX)
    const vxOff = Number(handle_x_offset_vertical) || 0;
    this.style.setProperty("--jd-vhandle-xoff", `${vxOff}px`);

    // handle normalize
    const hW = Math.max(4, Number(handle_width) || 14);
    const hH = Math.max(4, Number(handle_height) || 14);
    const hB = Math.max(0, Number(handle_border) || 2);

    const hW_h =
      handle_width_horizontal === null
        ? hW
        : Math.max(4, Number(handle_width_horizontal) || hW);
    const hH_h =
      handle_height_horizontal === null
        ? hH
        : Math.max(4, Number(handle_height_horizontal) || hH);

    const hW_v =
      handle_width_vertical === null
        ? hW
        : Math.max(4, Number(handle_width_vertical) || hW);
    const hH_v =
      handle_height_vertical === null
        ? hH
        : Math.max(4, Number(handle_height_vertical) || hH);

    const yOffH = Number(handle_y_offset_horizontal) || 0;

    // fixed height if provided (leave behavior)
    const vhFixed = this._parsePx(vertical_height, null);
    if (orient === "vertical") {
      if (vhFixed !== null) {
        const fixed = Math.max(this._lastVertMin, Math.min(this._lastVertMax, vhFixed));
        const scaledFixed = Math.floor(fixed * (this._lastPctV / 100));
        const finalFixed = Math.max(
          this._lastVertMin,
          Math.min(this._lastVertMax, scaledFixed)
        );
        this.style.setProperty("--jd-vert-height", `${finalFixed}px`);
      } else if (!this.style.getPropertyValue("--jd-vert-height")) {
        const base = Math.min(350, this._lastVertMax);
        const scaled = Math.floor(base * (this._lastPctV / 100));
        this.style.setProperty("--jd-vert-height", `${Math.max(this._lastVertMin, scaled)}px`);
      }
    } else {
      this.style.removeProperty("--jd-card-height");
    }

    this.shadowRoot.innerHTML = `
      <style>
        @import "https://cdnjs.cloudflare.com/ajax/libs/noUiSlider/15.7.0/nouislider.min.css";

        :host {
          display: block;
          height: var(--jd-card-height, 100%);
        }

        .container {
          display: flex;
          flex-direction: column;
          align-items: center;
          padding: 4px;
          height: 100%;
          background: transparent !important;
          box-sizing: border-box;
        }

        .slider {
          width: auto;
          margin: 6px auto;
          box-sizing: border-box;
        }

        /* Horizontal width as % of card */
        .slider.horizontal {
          width: var(--jd-horiz-width, 100%);
          height: ${thick}px;
        }

        .slider.vertical {
          width: ${thick}px;
          height: var(--jd-vert-height, 350px);
          margin: 6px auto;
          flex: 0 0 auto;
          /* NEW: center between title (top) and values (bottom) when card has free space */
          margin-top: auto;
          margin-bottom: auto;
        }

        .values {
          display: flex;
          justify-content: space-between;
          width: 100%;
          font-size: 0.85rem;
          font-family: Arial, sans-serif;
          color: var(--jd-text-color);
          opacity: 0.9;
        }

        .values.vertical {
          flex-direction: column;
          align-items: center;
          gap: 6px;
        }

        .title {
          font-size: 1rem;
          font-weight: 600;
          margin-bottom: 6px;
          font-family: Arial, sans-serif;
          color: var(--jd-text-color);
        }

        /* Kill noUi default whites */
        .noUi-target {
          background: var(--jd-base-color) !important;
          border: 0 !important;
          box-shadow: none !important;
        }

        /* Wrapper provides base; overflow hidden kills 1px artifacts */
        .noUi-connects {
          background: var(--jd-base-color) !important;
          border: 0 !important;
          box-shadow: none !important;
          overflow: hidden !important;
          border-radius: 999px !important;
          position: relative !important;
        }

        /* Track underlay (unselected part) */
        .noUi-connects::before {
          content: "";
          position: absolute;
          inset: 0;
          background: var(--jd-track-color);
          pointer-events: none;
          z-index: 0;
        }

        .noUi-base {
          background: transparent !important;
          border: 0 !important;
          box-shadow: none !important;
        }

        /* Selected range */
        .noUi-connect {
          background: var(--jd-connect-color) !important;
          border: 0 !important;
          box-shadow: none !important;
          position: relative !important;
          z-index: 1 !important;
        }

        /* HANDLE (default = vertical sizing) */
        .noUi-handle {
          width: ${hW_v}px !important;
          height: ${hH_v}px !important;
          background: var(--jd-handle-color);
          border: ${hB}px solid var(--jd-handle-color) !important;
          border-radius: 50%;
          box-shadow: none !important;
          z-index: 2 !important;
        }

        .noUi-handle::before,
        .noUi-handle::after {
          display: none !important;
        }

        /* Horizontal handle size override */
        .slider.horizontal .noUi-handle {
          width: ${hW_h}px !important;
          height: ${hH_h}px !important;
        }

        /* HORIZONTAL handle position (fine-tunable) */
        .slider.horizontal .noUi-handle {
          top: 50% !important;
          right: 0 !important;
          transform: translate(50%, calc(-50% + ${yOffH}px)) !important;
        }

        /* VERTICAL handle position + robust X offset */
        .slider.vertical .noUi-handle {
          right: 0 !important;
          left: 0 !important;
          transform: translate(-70%, -70%) translateX(var(--jd-vhandle-xoff, 0px)) !important;
        }

        /* HORIZONTAL sizes */
        .slider.horizontal .noUi-base {
          height: ${thick}px !important;
          width: 100% !important;
        }
        .slider.horizontal .noUi-target,
        .slider.horizontal .noUi-connects,
        .slider.horizontal .noUi-connect {
          height: ${thick}px !important;
        }

        /* VERTICAL sizes */
        .slider.vertical .noUi-base,
        .slider.vertical .noUi-target,
        .slider.vertical .noUi-connects {
          width: ${thick}px !important;
          height: 100% !important;
          margin: 0px auto;
        }
        .slider.vertical .noUi-connect {
          width: ${thick}px !important;
        }
      </style>

      <div class="container">
        <div class="title">${name}</div>

        <div class="slider ${orient}" id="slider"></div>

        <div class="values ${orient}">
          <span id="min-value">Min: ${Number(valueMin).toFixed(dec)}${unit}</span>
          <span id="max-value">Max: ${Number(valueMax).toFixed(dec)}${unit}</span>
        </div>
      </div>
    `;

    this._applyAutoVerticalHeight();

    const slider = this.shadowRoot.getElementById("slider");
    const noUiSlider = await this.loadNoUiSlider();

    if (slider.noUiSlider) {
      slider.noUiSlider.destroy();
    }

    noUiSlider.create(slider, {
      start: [valueMin, valueMax],
      connect: true,
      range: { min, max },
      step,
      orientation: orient,
      direction: orient === "vertical" ? "rtl" : "ltr",
    });

    slider.noUiSlider.on("start", () => {
      this.isUpdating = true;
    });

    slider.noUiSlider.on("update", (values) => {
      this.shadowRoot.getElementById("min-value").textContent =
        `Min: ${Number(values[0]).toFixed(dec)}${unit}`;
      this.shadowRoot.getElementById("max-value").textContent =
        `Max: ${Number(values[1]).toFixed(dec)}${unit}`;
    });

    slider.noUiSlider.on("change", (values) => {
      this.isUpdating = false;

      this._hass.callService("input_number", "set_value", {
        entity_id: entity_min,
        value: parseFloat(values[0]),
      });

      this._hass.callService("input_number", "set_value", {
        entity_id: entity_max,
        value: parseFloat(values[1]),
      });
    });
  }

  async loadNoUiSlider() {
    if (!window.noUiSlider) {
      await import(
        "https://cdnjs.cloudflare.com/ajax/libs/noUiSlider/15.7.0/nouislider.min.js"
      );
    }
    return window.noUiSlider;
  }

  getCardSize() {
    return 2;
  }
}

if (!customElements.get("jd2036-slider-range-card")) {
  customElements.define("jd2036-slider-range-card", Jd2036SliderRangeCard);
}

