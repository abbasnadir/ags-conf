import app from "ags/gtk4/app"
import { Astal, Gtk, Gdk } from "ags/gtk4"
import { createState, createComputed } from "gnim"
import Cairo from "cairo"

const WebKit = await import("gi://WebKit?version=6.0")
    .then(({ default: WebKit }) => WebKit)
    .catch(() => null)

const WINDOW_NAME = "aiChat"

const providers = [
    { name: "ChatGPT", badge: "G", url: "https://chatgpt.com" },
    { name: "Gemini", badge: "Ge", url: "https://gemini.google.com/app" },
    { name: "Claude", badge: "C", url: "https://claude.ai/new" },
    { name: "Perplexity", badge: "P", url: "https://www.perplexity.ai" },
]

const MIN_PICKER_WIDTH = 430
const MIN_PICKER_HEIGHT = 320
const MIN_BROWSER_WIDTH = 430
const MIN_BROWSER_HEIGHT = 430
const RESIZE_BORDER = 10

const clamp = (value: number, min: number, max: number) =>
    Math.min(max, Math.max(min, value))

function normalizeUrl(value: string) {
    const url = value.trim()

    if (!url) return null
    if (/^[a-z][a-z\d+.-]*:\/\//i.test(url)) return url

    return `https://${url}`
}

function addEscapeHandler(window: Astal.Window) {
    const controller = new Gtk.EventControllerKey()

    controller.connect("key-pressed", (_, keyval) => {
        if (keyval !== Gdk.KEY_Escape) return false

        window.hide()
        return true
    })

    window.add_controller(controller)
}

function MissingWebKitWindow() {
    let windowRef: Astal.Window | null = null
    let panelRef: Gtk.Widget | null = null
    let lastInputRegion = ""

    const updateInputRegion = () => {
        if (!windowRef || !panelRef) return

        const surface = windowRef.get_surface()
        if (!surface) return

        const [ok, x, y] = panelRef.translate_coordinates(windowRef, 0, 0)
        if (!ok) return

        const width = panelRef.get_allocated_width()
        const height = panelRef.get_allocated_height()
        if (width <= 0 || height <= 0) return

        const currentRegion = `${x},${y},${width},${height}`
        if (lastInputRegion === currentRegion) return
        lastInputRegion = currentRegion

        const region = new Cairo.Region()
        region.unionRectangle({
            x: Math.round(x),
            y: Math.round(y),
            width: Math.round(width),
            height: Math.round(height),
        })
        surface.set_input_region(region)
    }

    const setupWindow = (window: Astal.Window) => {
        windowRef = window
        addEscapeHandler(window)
        window.connect("realize", updateInputRegion)
    }

    const scheduleInputRegionUpdate = (panel: Gtk.Widget) => {
        panel.add_tick_callback(() => {
            updateInputRegion()
            return true
        })
    }

    const trackPanel = (panel: Gtk.Widget) => {
        panelRef = panel
        panel.connect("realize", () => scheduleInputRegionUpdate(panel))
    }

    return (
        <window
            name={WINDOW_NAME}
            visible={false}
            class="aiChat"
            $={setupWindow}
            exclusivity={Astal.Exclusivity.IGNORE}
            keymode={Astal.Keymode.ON_DEMAND}
            anchor={
                Astal.WindowAnchor.TOP |
                Astal.WindowAnchor.BOTTOM |
                Astal.WindowAnchor.LEFT |
                Astal.WindowAnchor.RIGHT
            }>
            <box class="ai-chat-backdrop">
                <box
                    class="ai-chat-panel"
                    orientation={Gtk.Orientation.VERTICAL}
                    spacing={14}
                    halign={Gtk.Align.CENTER}
                    valign={Gtk.Align.CENTER}
                    $={(self) => trackPanel(self)}>
                    <label class="ai-chat-title" label="WebKit required" halign={Gtk.Align.START} />
                    <label
                        class="ai-chat-subtitle"
                        label="Install embedded browser support, then restart AGS:"
                        halign={Gtk.Align.START} />
                    <label
                        class="ai-chat-command"
                        label="sudo pacman -S --needed webkitgtk-6.0"
                        halign={Gtk.Align.START} />
                    <button
                        class="ai-custom-open"
                        onClicked={() => app.get_window(WINDOW_NAME)?.hide()}>
                        <label label="Close" />
                    </button>
                </box>
            </box>
        </window>
    )
}

export default function ChatWindow() {
    if (!WebKit) return MissingWebKitWindow()

    let picker!: Gtk.Widget
    let browser!: Gtk.Widget
    let address!: Gtk.Label
    let backButton!: Gtk.Button
    let windowRef: Astal.Window | null = null
    let activePanel: Gtk.Widget | null = null
    let hasPosition = false
    let customUrl = ""
    let lastInputRegion = ""
    let isDragging = false

    const [panelX, setPanelX] = createState(0)
    const [panelY, setPanelY] = createState(0)

    const panelMarginStart = createComputed(() => Math.round(panelX()))
    const panelMarginTop = createComputed(() => Math.round(panelY()))

    const webView = new WebKit.WebView()
    webView.hexpand = true
    webView.vexpand = true

    const updateBrowserHeader = () => {
        address.label = webView.uri ?? ""
        backButton.sensitive = webView.can_go_back()
    }

    webView.connect("notify::uri", updateBrowserHeader)
    webView.connect("notify::can-go-back", updateBrowserHeader)

    const getWindowSize = () => {
        const surface = windowRef?.get_surface()

        if (!surface) return { width: 0, height: 0 }

        return { width: surface.get_width(), height: surface.get_height() }
    }

    const maybeCenterPanel = () => {
        if (hasPosition || !windowRef || !activePanel) return

        const windowSize = getWindowSize()
        if (windowSize.width <= 100 || windowSize.height <= 100) return

        const width = activePanel.get_allocated_width()
        const height = activePanel.get_allocated_height()
        if (width <= 10 || height <= 10) return

        setPanelX(Math.round((windowSize.width - width) / 2))
        setPanelY(Math.round((windowSize.height - height) / 2))
        hasPosition = true
    }

    const setFullInputRegion = () => {
        if (!windowRef) return
        const surface = windowRef.get_surface()
        if (!surface) return
        const ws = getWindowSize()
        if (ws.width <= 0 || ws.height <= 0) return
        const region = new Cairo.Region()
        region.unionRectangle({ x: 0, y: 0, width: ws.width, height: ws.height })
        surface.set_input_region(region)
        lastInputRegion = ""
    }

    const updateInputRegion = () => {
        if (isDragging || !windowRef || !activePanel) return

        maybeCenterPanel()

        const surface = windowRef.get_surface()
        if (!surface) return

        const rw = activePanel.get_allocated_width()
        const rh = activePanel.get_allocated_height()
        if (rw <= 0 || rh <= 0) return

        const rx = panelX()
        const ry = panelY()

        const currentRegion = `${rx},${ry},${rw},${rh}`
        if (lastInputRegion === currentRegion) return
        lastInputRegion = currentRegion

        const region = new Cairo.Region()
        region.unionRectangle({ x: rx, y: ry, width: rw, height: rh })
        surface.set_input_region(region)
    }

    const scheduleInputRegionUpdate = (panel?: Gtk.Widget) => {
        const target = panel ?? activePanel
        if (!target) return

        target.add_tick_callback(() => {
            updateInputRegion()
            return true
        })
    }

    const setActivePanel = (panel: Gtk.Widget) => {
        activePanel = panel
        maybeCenterPanel()
        updateInputRegion()
        scheduleInputRegionUpdate(panel)
    }

    const setCursor = (widget: Gtk.Widget, name: string) => {
        try {
            widget.set_cursor(Gdk.Cursor.new_from_name(name, null))
        } catch (_) { /* cursor unavailable */ }
    }

    const attachMoveController = (widget: Gtk.Widget, getPanel: () => Gtk.Widget | null) => {
        const controller = new Gtk.GestureDrag()
        let startPanelX = 0
        let startPanelY = 0
        let startWinX = 0
        let startWinY = 0
        let startWidgetX = 0
        let startWidgetY = 0

        const isInteractive = (target: Gtk.Widget | null) => {
            if (!target) return false
            if (target instanceof Gtk.Button) return true
            if (target instanceof Gtk.Entry) return true
            if (WebKit && target instanceof WebKit.WebView) return true
            if (target instanceof Gtk.ScrolledWindow) return true
            return false
        }

        controller.connect("drag-begin", (_c: any, sx: number, sy: number) => {
            const target = widget.pick(sx, sy, Gtk.PickFlags.DEFAULT)
            if (isInteractive(target)) {
                controller.set_state(Gtk.EventSequenceState.DENIED)
                return
            }

            if (!windowRef) return
            startWidgetX = sx
            startWidgetY = sy
            const [ok, wx, wy] = widget.translate_coordinates(windowRef, sx, sy)
            if (ok) {
                startWinX = wx
                startWinY = wy
            }
            startPanelX = panelX()
            startPanelY = panelY()
            isDragging = true
            setFullInputRegion()
        })

        const endDrag = () => {
            isDragging = false
            widget.set_cursor(null)
            updateInputRegion()
        }
        controller.connect("drag-end", endDrag)
        controller.connect("cancel", endDrag)

        controller.connect("drag-update", (_c: any, ox: number, oy: number) => {
            const panel = getPanel()
            if (!windowRef || !panel) return

            const [ok, wx, wy] = widget.translate_coordinates(windowRef, startWidgetX + ox, startWidgetY + oy)
            if (!ok) return

            const trueOffsetX = wx - startWinX
            const trueOffsetY = wy - startWinY

            const windowSize = getWindowSize()
            const pw = panel.get_allocated_width()
            const ph = panel.get_allocated_height()

            const nextX = clamp(startPanelX + trueOffsetX, 0, Math.max(0, windowSize.width - pw))
            const nextY = clamp(startPanelY + trueOffsetY, 0, Math.max(0, windowSize.height - ph))

            setPanelX(Math.round(nextX))
            setPanelY(Math.round(nextY))
            hasPosition = true
        })

        widget.add_controller(controller)

        const motion = new Gtk.EventControllerMotion()
        motion.connect("motion", (_m: any, mx: number, my: number) => {
            if (isDragging) return
            const target = widget.pick(mx, my, Gtk.PickFlags.DEFAULT)
        })
        motion.connect("leave", () => {
            if (!isDragging) widget.set_cursor(null)
        })
        widget.add_controller(motion)
    }

    const attachResizeHandle = (widget: Gtk.Widget, getPanel: () => Gtk.Widget | null, edge: string, minW: number, minH: number) => {
        const controller = new Gtk.GestureDrag()
        let startWidth = 0
        let startHeight = 0
        let startPanelX = 0
        let startPanelY = 0
        let startWinX = 0
        let startWinY = 0
        let startWidgetX = 0
        let startWidgetY = 0

        controller.connect("drag-begin", (_c: any, sx: number, sy: number) => {
            const panel = getPanel()
            if (!panel || !windowRef) return
            startWidgetX = sx
            startWidgetY = sy
            const [ok, wx, wy] = widget.translate_coordinates(windowRef, sx, sy)
            if (ok) {
                startWinX = wx
                startWinY = wy
            }
            startWidth = panel.get_allocated_width()
            startHeight = panel.get_allocated_height()
            startPanelX = panelX()
            startPanelY = panelY()
            isDragging = true
            setFullInputRegion()
        })

        const endDrag = () => {
            isDragging = false
            updateInputRegion()
        }
        controller.connect("drag-end", endDrag)
        controller.connect("cancel", endDrag)

        controller.connect("drag-update", (_c: any, ox: number, oy: number) => {
            const panel = getPanel()
            if (!panel || !windowRef) return

            const [ok, wx, wy] = widget.translate_coordinates(windowRef, startWidgetX + ox, startWidgetY + oy)
            if (!ok) return

            const trueOffsetX = wx - startWinX
            const trueOffsetY = wy - startWinY

            const windowSize = getWindowSize()
            let nw = startWidth
            let nh = startHeight
            let nx = startPanelX
            let ny = startPanelY

            if (edge.includes("e")) {
                const maxW = Math.max(minW, windowSize.width - startPanelX)
                nw = clamp(startWidth + trueOffsetX, minW, maxW)
            }
            if (edge.includes("w")) {
                const maxW = startWidth + startPanelX
                nw = clamp(startWidth - trueOffsetX, minW, maxW)
                nx = startPanelX + (startWidth - nw)
            }
            if (edge.includes("s")) {
                const maxH = Math.max(minH, windowSize.height - startPanelY)
                nh = clamp(startHeight + trueOffsetY, minH, maxH)
            }
            if (edge.includes("n")) {
                const maxH = startHeight + startPanelY
                nh = clamp(startHeight - trueOffsetY, minH, maxH)
                ny = startPanelY + (startHeight - nh)
            }

            panel.set_size_request(Math.round(nw), Math.round(nh))
            setPanelX(Math.round(nx))
            setPanelY(Math.round(ny))
        })

        widget.add_controller(controller)

        const motion = new Gtk.EventControllerMotion()
        motion.connect("enter", () => setCursor(widget, `${edge}-resize`))
        motion.connect("leave", () => {
            if (!isDragging) widget.set_cursor(null)
        })
        widget.add_controller(motion)
    }

    const trackPanel = (panel: Gtk.Widget) => {
        panel.connect("realize", () => {
            if (!activePanel) setActivePanel(panel)
            scheduleInputRegionUpdate(panel)
        })
    }

    const setupWindow = (window: Astal.Window) => {
        windowRef = window
        addEscapeHandler(window)
        window.connect("realize", () => scheduleInputRegionUpdate())
    }

    const showPicker = () => {
        browser.visible = false
        picker.visible = true
        setActivePanel(picker)
    }

    const openChat = (value: string) => {
        const url = normalizeUrl(value)

        if (!url) return

        picker.visible = false
        browser.visible = true
        setActivePanel(browser)
        address.label = url
        webView.load_uri(url)
    }

    const goBack = () => {
        if (webView.can_go_back()) {
            webView.go_back()
        } else {
            showPicker()
        }
    }

    return (
        <window
            name={WINDOW_NAME}
            visible={false}
            class="aiChat"
            $={setupWindow}
            application={app}
            layer={Astal.Layer.OVERLAY}
            exclusivity={Astal.Exclusivity.IGNORE}
            keymode={Astal.Keymode.ON_DEMAND}
            anchor={
                Astal.WindowAnchor.TOP |
                Astal.WindowAnchor.BOTTOM |
                Astal.WindowAnchor.LEFT |
                Astal.WindowAnchor.RIGHT
            }>
            <overlay class="ai-chat-backdrop" hexpand vexpand>
                <box hexpand vexpand />

                <overlay
                    $type="overlay"
                    halign={Gtk.Align.START}
                    valign={Gtk.Align.START}
                    marginStart={panelMarginStart}
                    marginTop={panelMarginTop}
                    $={(self) => {
                        picker = self
                        trackPanel(self)
                    }}>
                    <box class="ai-chat-panel ai-chat-picker" orientation={Gtk.Orientation.VERTICAL} spacing={18} css="margin: 15px;" $={(self) => attachMoveController(self, () => picker)}>
                        <box class="ai-drag-handle" spacing={12}>
                            <box orientation={Gtk.Orientation.VERTICAL} spacing={3} hexpand>
                                <label class="ai-chat-title" label="AI Chat" halign={Gtk.Align.START} />
                            </box>
                            <button
                                class="ai-chat-close"
                                tooltipText="Close"
                                onClicked={() => app.get_window(WINDOW_NAME)?.hide()}>
                                <label label="x" />
                            </button>
                        </box>

                        <box class="ai-provider-grid" orientation={Gtk.Orientation.VERTICAL} spacing={10}>
                            {providers.map((provider) => (
                                <button
                                    class="ai-provider"
                                    tooltipText={`Open ${provider.name}`}
                                    onClicked={() => openChat(provider.url)}>
                                    <box spacing={12}>
                                        <label class="ai-provider-badge" label={provider.badge} />
                                        <box orientation={Gtk.Orientation.VERTICAL} spacing={2} hexpand>
                                            <label
                                                class="ai-provider-name"
                                                label={provider.name}
                                                halign={Gtk.Align.START} />
                                        </box>
                                        <label class="ai-provider-open" label="open" />
                                    </box>
                                </button>
                            ))}
                        </box>

                        <box class="ai-custom-url" spacing={8}>
                            <entry
                                hexpand
                                placeholder_text="Custom URL, e.g. chat.mistral.ai"
                                $={(self) => {
                                    self.connect("changed", () => {
                                        customUrl = self.text
                                    })
                                }}
                                onActivate={(self) => openChat(self.text)} />
                            <button
                                class="ai-custom-open"
                                onClicked={() => openChat(customUrl)}>
                                <label label="Open" />
                            </button>
                        </box>
                    </box>

                    <box $type="overlay" valign={Gtk.Align.START} heightRequest={15} css="background: transparent;" $={(self) => attachResizeHandle(self, () => picker, "n", MIN_PICKER_WIDTH, MIN_PICKER_HEIGHT)} />
                    <box $type="overlay" valign={Gtk.Align.END} heightRequest={15} css="background: transparent;" $={(self) => attachResizeHandle(self, () => picker, "s", MIN_PICKER_WIDTH, MIN_PICKER_HEIGHT)} />
                    <box $type="overlay" halign={Gtk.Align.START} widthRequest={15} css="background: transparent;" $={(self) => attachResizeHandle(self, () => picker, "w", MIN_PICKER_WIDTH, MIN_PICKER_HEIGHT)} />
                    <box $type="overlay" halign={Gtk.Align.END} widthRequest={15} css="background: transparent;" $={(self) => attachResizeHandle(self, () => picker, "e", MIN_PICKER_WIDTH, MIN_PICKER_HEIGHT)} />

                    <box $type="overlay" halign={Gtk.Align.START} valign={Gtk.Align.START} widthRequest={15} heightRequest={15} css="background: transparent;" $={(self) => attachResizeHandle(self, () => picker, "nw", MIN_PICKER_WIDTH, MIN_PICKER_HEIGHT)} />
                    <box $type="overlay" halign={Gtk.Align.END} valign={Gtk.Align.START} widthRequest={15} heightRequest={15} css="background: transparent;" $={(self) => attachResizeHandle(self, () => picker, "ne", MIN_PICKER_WIDTH, MIN_PICKER_HEIGHT)} />
                    <box $type="overlay" halign={Gtk.Align.START} valign={Gtk.Align.END} widthRequest={15} heightRequest={15} css="background: transparent;" $={(self) => attachResizeHandle(self, () => picker, "sw", MIN_PICKER_WIDTH, MIN_PICKER_HEIGHT)} />
                    <box $type="overlay" halign={Gtk.Align.END} valign={Gtk.Align.END} widthRequest={15} heightRequest={15} css="background: transparent;" $={(self) => attachResizeHandle(self, () => picker, "se", MIN_PICKER_WIDTH, MIN_PICKER_HEIGHT)} />

                </overlay>

                <overlay
                    $type="overlay"
                    halign={Gtk.Align.START}
                    valign={Gtk.Align.START}
                    marginStart={panelMarginStart}
                    marginTop={panelMarginTop}
                    visible={false}
                    $={(self) => {
                        browser = self
                        trackPanel(self)
                    }}>
                    <box class="ai-chat-browser" orientation={Gtk.Orientation.VERTICAL} spacing={10} css="margin: 15px;" $={(self) => attachMoveController(self, () => browser)}>
                        <box class="ai-browser-toolbar ai-drag-handle" spacing={8}>
                            <button
                                class="ai-browser-control"
                                tooltipText="Back"
                                $={(self) => backButton = self}
                                onClicked={goBack}>
                                <label label="<" />
                            </button>
                            <button
                                class="ai-browser-control"
                                tooltipText="Choose another chatbot"
                                onClicked={showPicker}>
                                <label label="AI" />
                            </button>
                            <label
                                class="ai-browser-address"
                                label=""
                                hexpand
                                widthChars={10}
                                maxWidthChars={5}
                                ellipsize={3}
                                halign={Gtk.Align.START}
                                $={(self) => address = self} />
                            <button
                                class="ai-browser-control"
                                tooltipText="Reload"
                                onClicked={() => webView.reload()}>
                                <label label="reload" />
                            </button>
                            <button
                                class="ai-chat-close"
                                tooltipText="Close"
                                onClicked={() => app.get_window(WINDOW_NAME)?.hide()}>
                                <label label="x" />
                            </button>
                        </box>
                        <overlay hexpand vexpand>
                            <box hexpand vexpand />
                            <Gtk.ScrolledWindow $type="overlay" class="ai-browser-content" hexpand vexpand>
                                {webView}
                            </Gtk.ScrolledWindow>
                        </overlay>
                    </box>

                    <box $type="overlay" valign={Gtk.Align.START} heightRequest={15} css="background: transparent;" $={(self) => attachResizeHandle(self, () => browser, "n", MIN_BROWSER_WIDTH, MIN_BROWSER_HEIGHT)} />
                    <box $type="overlay" valign={Gtk.Align.END} heightRequest={15} css="background: transparent;" $={(self) => attachResizeHandle(self, () => browser, "s", MIN_BROWSER_WIDTH, MIN_BROWSER_HEIGHT)} />
                    <box $type="overlay" halign={Gtk.Align.START} widthRequest={15} css="background: transparent;" $={(self) => attachResizeHandle(self, () => browser, "w", MIN_BROWSER_WIDTH, MIN_BROWSER_HEIGHT)} />
                    <box $type="overlay" halign={Gtk.Align.END} widthRequest={15} css="background: transparent;" $={(self) => attachResizeHandle(self, () => browser, "e", MIN_BROWSER_WIDTH, MIN_BROWSER_HEIGHT)} />

                    <box $type="overlay" halign={Gtk.Align.START} valign={Gtk.Align.START} widthRequest={15} heightRequest={15} css="background: transparent;" $={(self) => attachResizeHandle(self, () => browser, "nw", MIN_BROWSER_WIDTH, MIN_BROWSER_HEIGHT)} />
                    <box $type="overlay" halign={Gtk.Align.END} valign={Gtk.Align.START} widthRequest={15} heightRequest={15} css="background: transparent;" $={(self) => attachResizeHandle(self, () => browser, "ne", MIN_BROWSER_WIDTH, MIN_BROWSER_HEIGHT)} />
                    <box $type="overlay" halign={Gtk.Align.START} valign={Gtk.Align.END} widthRequest={15} heightRequest={15} css="background: transparent;" $={(self) => attachResizeHandle(self, () => browser, "sw", MIN_BROWSER_WIDTH, MIN_BROWSER_HEIGHT)} />
                    <box $type="overlay" halign={Gtk.Align.END} valign={Gtk.Align.END} widthRequest={15} heightRequest={15} css="background: transparent;" $={(self) => attachResizeHandle(self, () => browser, "se", MIN_BROWSER_WIDTH, MIN_BROWSER_HEIGHT)} />

                </overlay>
            </overlay>
        </window>
    )
}
