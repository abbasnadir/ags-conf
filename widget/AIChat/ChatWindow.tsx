import app from "ags/gtk4/app"
import { Astal, Gtk, Gdk } from "ags/gtk4"
import { createState, createComputed } from "gnim"
import Cairo from "cairo"

const WebKit = await import("gi://WebKit?version=6.0")
    .then(({ default: WebKit }) => WebKit)
    .catch(() => null)

const WINDOW_NAME = "aiChat"

const providers = [
    { name: "ChatGPT", hint: "OpenAI", badge: "G", url: "https://chatgpt.com" },
    { name: "Gemini", hint: "Google", badge: "Ge", url: "https://gemini.google.com/app" },
    { name: "Claude", hint: "Anthropic", badge: "C", url: "https://claude.ai/new" },
    { name: "Perplexity", hint: "Search + chat", badge: "P", url: "https://www.perplexity.ai" },
]

const MIN_PICKER_WIDTH = 430
const MIN_PICKER_HEIGHT = 320
const MIN_BROWSER_WIDTH = 1080
const MIN_BROWSER_HEIGHT = 760

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

    const updateInputRegion = () => {
        if (!windowRef || !panelRef) return

        const surface = windowRef.get_surface()
        if (!surface) return

        const [ok, x, y] = panelRef.translate_coordinates(windowRef, 0, 0)
        if (!ok) return

        const width = panelRef.get_allocated_width()
        const height = panelRef.get_allocated_height()
        if (width <= 0 || height <= 0) return

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
            return false
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

    const [panelX, setPanelX] = createState(0)
    const [panelY, setPanelY] = createState(0)
    const [panelWidth, setPanelWidth] = createState(0)
    const [panelHeight, setPanelHeight] = createState(0)

    const panelMarginStart = createComputed(() => Math.round(panelX()))
    const panelMarginTop = createComputed(() => Math.round(panelY()))
    const panelWidthRequest = createComputed(() =>
        panelWidth() > 0 ? Math.round(panelWidth()) : -1
    )
    const panelHeightRequest = createComputed(() =>
        panelHeight() > 0 ? Math.round(panelHeight()) : -1
    )

    const webView = new WebKit.WebView()
    webView.hexpand = true
    webView.vexpand = true

    const updateBrowserHeader = () => {
        address.label = webView.uri ?? ""
        backButton.sensitive = webView.can_go_back()
    }

    webView.connect("notify::uri", updateBrowserHeader)
    webView.connect("notify::can-go-back", updateBrowserHeader)

    const getMinPanelSize = () => {
        if (activePanel === browser) {
            return { width: MIN_BROWSER_WIDTH, height: MIN_BROWSER_HEIGHT }
        }

        return { width: MIN_PICKER_WIDTH, height: MIN_PICKER_HEIGHT }
    }

    const getWindowSize = () => {
        const surface = windowRef?.get_surface()

        if (!surface) return { width: 0, height: 0 }

        return { width: surface.get_width(), height: surface.get_height() }
    }

    const getPanelSize = () => {
        const minSize = getMinPanelSize()
        const width = panelWidth() > 0
            ? panelWidth()
            : activePanel?.get_allocated_width() ?? 0
        const height = panelHeight() > 0
            ? panelHeight()
            : activePanel?.get_allocated_height() ?? 0

        return {
            width: Math.max(width, minSize.width),
            height: Math.max(height, minSize.height),
        }
    }

    const updateInputRegion = () => {
        if (!windowRef || !activePanel) return

        const surface = windowRef.get_surface()
        if (!surface) return

        const [ok, x, y] = activePanel.translate_coordinates(windowRef, 0, 0)
        if (!ok) return

        const width = activePanel.get_allocated_width()
        const height = activePanel.get_allocated_height()
        if (width <= 0 || height <= 0) return

        const region = new Cairo.Region()
        region.unionRectangle({
            x: Math.round(x),
            y: Math.round(y),
            width: Math.round(width),
            height: Math.round(height),
        })
        surface.set_input_region(region)
    }

    const scheduleInputRegionUpdate = (panel?: Gtk.Widget) => {
        const target = panel ?? activePanel
        if (!target) return

        target.add_tick_callback(() => {
            updateInputRegion()
            return false
        })
    }

    const maybeCenterPanel = () => {
        if (hasPosition || !windowRef || !activePanel) return

        const windowSize = getWindowSize()
        const panelSize = getPanelSize()

        if (windowSize.width <= 0 || panelSize.width <= 0 || panelSize.height <= 0) return

        setPanelX(Math.round((windowSize.width - panelSize.width) / 2))
        setPanelY(Math.round((windowSize.height - panelSize.height) / 2))
    }

    const setActivePanel = (panel: Gtk.Widget) => {
        activePanel = panel
        maybeCenterPanel()
        updateInputRegion()
        scheduleInputRegionUpdate(panel)
    }

    const attachMoveController = (widget: Gtk.Widget) => {
        const controller = new Gtk.GestureDrag()
        let startX = 0
        let startY = 0

        controller.connect("drag-begin", () => {
            startX = panelX()
            startY = panelY()
        })

        controller.connect("drag-update", (_controller, offsetX, offsetY) => {
            if (!windowRef) return

            const windowSize = getWindowSize()
            const panelSize = getPanelSize()
            const nextX = clamp(startX + offsetX, 0, Math.max(0, windowSize.width - panelSize.width))
            const nextY = clamp(startY + offsetY, 0, Math.max(0, windowSize.height - panelSize.height))

            setPanelX(Math.round(nextX))
            setPanelY(Math.round(nextY))
            hasPosition = true
            updateInputRegion()
        })

        widget.add_controller(controller)
    }

    const attachResizeController = (widget: Gtk.Widget) => {
        const controller = new Gtk.GestureDrag()
        let startWidth = 0
        let startHeight = 0

        controller.connect("drag-begin", () => {
            const panelSize = getPanelSize()
            startWidth = panelWidth() > 0 ? panelWidth() : panelSize.width
            startHeight = panelHeight() > 0 ? panelHeight() : panelSize.height
        })

        controller.connect("drag-update", (_controller, offsetX, offsetY) => {
            if (!windowRef) return

            const minSize = getMinPanelSize()
            const windowSize = getWindowSize()
            const maxWidth = Math.max(minSize.width, windowSize.width - panelX())
            const maxHeight = Math.max(minSize.height, windowSize.height - panelY())

            const nextWidth = clamp(startWidth + offsetX, minSize.width, maxWidth)
            const nextHeight = clamp(startHeight + offsetY, minSize.height, maxHeight)

            setPanelWidth(Math.round(nextWidth))
            setPanelHeight(Math.round(nextHeight))
            updateInputRegion()
        })

        widget.add_controller(controller)
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
                    class="ai-chat-panel ai-chat-picker"
                    halign={Gtk.Align.START}
                    valign={Gtk.Align.START}
                    marginStart={panelMarginStart}
                    marginTop={panelMarginTop}
                    widthRequest={panelWidthRequest}
                    heightRequest={panelHeightRequest}
                    $={(self) => {
                        picker = self
                        trackPanel(self)
                    }}>
                    <box orientation={Gtk.Orientation.VERTICAL} spacing={18}>
                        <box class="ai-drag-handle" spacing={12} $={(self) => attachMoveController(self)}>
                            <box orientation={Gtk.Orientation.VERTICAL} spacing={3} hexpand>
                                <label class="ai-chat-title" label="AI Chat" halign={Gtk.Align.START} />
                                <label
                                    class="ai-chat-subtitle"
                                    label="Pick a service or open your own."
                                    halign={Gtk.Align.START} />
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
                                            <label
                                                class="ai-provider-hint"
                                                label={provider.hint}
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

                        <label
                            class="ai-chat-footer"
                            label="Sites stay inside this popup. Esc hides it."
                            halign={Gtk.Align.START} />
                    </box>

                    <box
                        $type="overlay"
                        class="ai-resize-handle"
                        halign={Gtk.Align.END}
                        valign={Gtk.Align.END}
                        $={(self) => attachResizeController(self)} />
                </overlay>

                <overlay
                    $type="overlay"
                    class="ai-chat-browser"
                    halign={Gtk.Align.START}
                    valign={Gtk.Align.START}
                    marginStart={panelMarginStart}
                    marginTop={panelMarginTop}
                    widthRequest={panelWidthRequest}
                    heightRequest={panelHeightRequest}
                    visible={false}
                    $={(self) => {
                        browser = self
                        trackPanel(self)
                    }}>
                    <box orientation={Gtk.Orientation.VERTICAL} spacing={10}>
                        <box class="ai-browser-toolbar ai-drag-handle" spacing={8} $={(self) => attachMoveController(self)}>
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
                        <box class="ai-browser-content" hexpand vexpand>
                            {webView}
                        </box>
                    </box>

                    <box
                        $type="overlay"
                        class="ai-resize-handle"
                        halign={Gtk.Align.END}
                        valign={Gtk.Align.END}
                        $={(self) => attachResizeController(self)} />
                </overlay>
            </overlay>
        </window>
    )
}
