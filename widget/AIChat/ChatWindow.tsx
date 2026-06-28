import app from "ags/gtk4/app"
import { Astal, Gtk, Gdk } from "ags/gtk4"
import { createState, createComputed } from "gnim"
import Cairo from "cairo"
import GLib from "gi://GLib"
import Gio from "gi://Gio"

// Fix for Wayland Protocol error 71 (DMA-BUF renderer crash on file dialogs)
GLib.setenv("WEBKIT_DISABLE_DMABUF_RENDERER", "1", true)
// Fix for WebKitGTK hanging on ChatGPT when typing long texts
GLib.setenv("WEBKIT_DISABLE_COMPOSITING_MODE", "1", true)

const WebKitModule = await import("gi://WebKit?version=6.0")
    .then(({ default: W }) => W)
    .catch(() => null)

const WINDOW_NAME = "aiChat"
const CONFIG_PATH = GLib.get_user_data_dir() + "/ags-ai-chat/config.json"
const FAVICON_CACHE_DIR = GLib.get_user_cache_dir() + "/ags-ai-chat/favicons"

const defaultProviders = [
    { name: "ChatGPT", badge: "G", url: "https://chatgpt.com" },
    { name: "Gemini", badge: "Ge", url: "https://gemini.google.com/app" },
    { name: "Claude", badge: "C", url: "https://claude.ai/new" },
    { name: "Perplexity", badge: "P", url: "https://www.perplexity.ai" },
]

let config = {
    providers: defaultProviders,
    lastSelected: "https://chatgpt.com",
    windowWidth: 450,
    windowHeight: 550
}

function loadConfig() {
    try {
        const file = Gio.File.new_for_path(CONFIG_PATH)
        const [success, contents] = file.load_contents(null)
        if (success) {
            const data = JSON.parse(new TextDecoder("utf-8").decode(contents))
            if (data.providers) config.providers = data.providers
            if (data.lastSelected) config.lastSelected = data.lastSelected
            if (data.windowWidth) config.windowWidth = data.windowWidth
            if (data.windowHeight) config.windowHeight = data.windowHeight
        }
    } catch (e) {
        saveConfig()
    }
}

function saveConfig() {
    try {
        const file = Gio.File.new_for_path(CONFIG_PATH)
        const dir = file.get_parent()
        if (dir && !dir.query_exists(null)) {
            dir.make_directory_with_parents(null)
        }
        const encoder = new TextEncoder()
        file.replace_contents(encoder.encode(JSON.stringify(config, null, 2)), null, false, Gio.FileCreateFlags.NONE, null)
    } catch (e) {
        console.error("Failed to save config:", e)
    }
}

loadConfig()

const MIN_BROWSER_WIDTH = 430
const MIN_BROWSER_HEIGHT = 430
const DEFAULT_WIDTH = 450
const DEFAULT_HEIGHT = 550
const RESIZE_BORDER = 14



// Ensure favicon cache dir exists
try {
    const cacheDir = Gio.File.new_for_path(FAVICON_CACHE_DIR)
    if (!cacheDir.query_exists(null)) cacheDir.make_directory_with_parents(null)
} catch (_) { }

function getFaviconPath(url: string): string | null {
    try {
        const domain = url.replace(/^https?:\/\//, "").replace(/\/.*$/, "")
        const cachePath = `${FAVICON_CACHE_DIR}/${domain}.png`
        const cacheFile = Gio.File.new_for_path(cachePath)
        if (cacheFile.query_exists(null)) return cachePath
        // Download favicon from Google's service
        const faviconUrl = `https://www.google.com/s2/favicons?domain=${domain}&sz=64`
        const [ok] = GLib.spawn_command_line_sync(`curl -sL -o ${cachePath} "${faviconUrl}"`)
        if (ok && cacheFile.query_exists(null)) return cachePath
    } catch (_) { }
    return null
}

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

export default function ChatWindow() {
    if (!WebKitModule) {
        console.error("WebKit is missing. Please install webkitgtk-6.0")
        return <window name={WINDOW_NAME} visible={false} />
    }

    let browser!: Gtk.Widget
    let address!: Gtk.Label
    let backButton!: Gtk.Button
    let windowRef: Astal.Window | null = null
    let hasPosition = false
    let lastInputRegion = ""
    let isDragging = false
    let sidebar!: Gtk.Widget
    let providerGrid!: Gtk.Box
    let regionUpdateQueued = false

    const [panelX, setPanelX] = createState(0)
    const [panelY, setPanelY] = createState(0)

    const panelMarginStart = createComputed(() => Math.round(panelX()))
    const panelMarginTop = createComputed(() => Math.round(panelY()))

    const dataDir = `${GLib.get_user_data_dir()}/ags-ai-chat`
    const cacheDir = `${GLib.get_user_cache_dir()}/ags-ai-chat`

    // In WebKit 6.0, NetworkSession replaces WebsiteDataManager and WebContext.
    // It automatically handles DOM storage, Service Workers, and persistent cache 
    // when created with dataDir and cacheDir!
    const session = (WebKitModule as any).NetworkSession.new(dataDir, cacheDir)

    const cookieManager = session.get_cookie_manager()
    cookieManager.set_persistent_storage(`${dataDir}/cookies.sqlite`, (WebKitModule as any).CookiePersistentStorage.SQLITE)

    // Enable WebRTC for microphone/audio support and allow clipboard access
    const settings = new (WebKitModule as any).Settings()
    settings.enable_webrtc = true
    settings.enable_developer_extras = true
    settings.javascript_can_access_clipboard = true
    settings.enable_page_cache = true

    const webView = new WebKitModule.WebView({
        network_session: session,
        settings: settings,
    } as any)

    // Automatically allow media/audio permission requests
    webView.connect("permission-request", (_, request) => {
        request.allow()
        return true
    })

    // Intercept file chooser to prevent Wayland protocol crash (Error 71) on Layer Shell
    webView.connect("run-file-chooser", (_, request) => {
        const dialog = new Gtk.FileDialog()
        if (request.get_select_multiple()) {
            dialog.open_multiple(null, null, (d, res) => {
                try {
                    const files = d!.open_multiple_finish(res)
                    const paths: string[] = []
                    for (let i = 0; i < files.get_n_items(); i++) {
                        const f = files.get_item(i) as any
                        if (f && typeof f.get_path === "function" && f.get_path()) {
                            paths.push(f.get_path()!)
                        }
                    }
                    if (paths.length > 0) request.select_files(paths)
                    else request.cancel()
                } catch (e) { request.cancel() }
            })
        } else {
            dialog.open(null, null, (d, res) => {
                try {
                    const file = d!.open_finish(res) as any
                    const path = file && typeof file.get_path === "function" ? file.get_path() : null
                    if (path) request.select_files([path])
                    else request.cancel()
                } catch (e) { request.cancel() }
            })
        }
        return true
    })

    webView.hexpand = true
    webView.vexpand = true

    webView.load_uri(config.lastSelected)

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
        if (hasPosition || !windowRef || !browser) return
        const windowSize = getWindowSize()
        if (windowSize.width <= 100 || windowSize.height <= 100) return
        const width = browser.get_allocated_width()
        const height = browser.get_allocated_height()
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
        if (!windowRef || !browser) return
        maybeCenterPanel()
        const surface = windowRef.get_surface()
        if (!surface) return
        const rw = browser.get_allocated_width()
        const rh = browser.get_allocated_height()
        if (rw <= 0 || rh <= 0) return
        const rx = panelX()
        const ry = panelY()
        const currentRegion = `${rx},${ry},${rw},${rh}`
        if (lastInputRegion === currentRegion) return
        lastInputRegion = currentRegion
        const region = new Cairo.Region()
        // Add a generous margin around the panel so resize handles are always reachable
        const margin = RESIZE_BORDER + 5
        const ws = getWindowSize()
        region.unionRectangle({
            x: Math.max(0, rx - margin),
            y: Math.max(0, ry - margin),
            width: Math.min(rw + margin * 2, ws.width - Math.max(0, rx - margin)),
            height: Math.min(rh + margin * 2, ws.height - Math.max(0, ry - margin)),
        })
        surface.set_input_region(region)
    }

    // Debounced region update to avoid excessive calls during drag
    const queueRegionUpdate = () => {
        if (regionUpdateQueued) return
        regionUpdateQueued = true
        GLib.idle_add(GLib.PRIORITY_DEFAULT, () => {
            regionUpdateQueued = false
            updateInputRegion()
            return GLib.SOURCE_REMOVE
        })
    }

    const scheduleInputRegionUpdate = (panel?: Gtk.Widget) => {
        const target = panel ?? browser
        if (!target) return
        target.add_tick_callback(() => {
            if (!isDragging) updateInputRegion()
            return true
        })
    }

    const setCursor = (widget: Gtk.Widget, name: string) => {
        try { widget.set_cursor(Gdk.Cursor.new_from_name(name, null)) } catch (_) { }
    }

    const attachMoveController = (widget: Gtk.Widget, getPanel: () => Gtk.Widget | null) => {
        const controller = new Gtk.GestureDrag()
        let startPanelX = 0, startPanelY = 0, startWinX = 0, startWinY = 0, startWidgetX = 0, startWidgetY = 0
        const isInteractive = (target: Gtk.Widget | null): boolean => {
            if (!target) return false
            if (target instanceof Gtk.Button) return true
            if (target instanceof Gtk.Entry) return true
            if (WebKitModule && target instanceof WebKitModule.WebView) return true
            if (target instanceof Gtk.ScrolledWindow) return true
            // Walk up the widget tree to check parent interactivity
            const parent = target.get_parent()
            if (parent && parent !== widget) return isInteractive(parent)
            return false
        }
        controller.connect("drag-begin", (_c: any, sx: number, sy: number) => {
            const target = widget.pick(sx, sy, Gtk.PickFlags.DEFAULT)
            if (isInteractive(target)) { controller.set_state(Gtk.EventSequenceState.DENIED); return }
            if (!windowRef) return
            startWidgetX = sx; startWidgetY = sy
            const [ok, wx, wy] = widget.translate_coordinates(windowRef, sx, sy)
            if (ok) { startWinX = wx; startWinY = wy }
            startPanelX = panelX(); startPanelY = panelY()
            isDragging = true
            setFullInputRegion()
        })
        const endDrag = () => {
            isDragging = false
            lastInputRegion = ""
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
            const trueOffsetX = wx - startWinX; const trueOffsetY = wy - startWinY
            const windowSize = getWindowSize()
            const pw = panel.get_allocated_width(); const ph = panel.get_allocated_height()
            const nextX = clamp(startPanelX + trueOffsetX, 0, Math.max(0, windowSize.width - pw))
            const nextY = clamp(startPanelY + trueOffsetY, 0, Math.max(0, windowSize.height - ph))
            setPanelX(Math.round(nextX)); setPanelY(Math.round(nextY))
            hasPosition = true
        })
        widget.add_controller(controller)
        const motion = new Gtk.EventControllerMotion()
        motion.connect("motion", (_m: any, mx: number, my: number) => {
            if (isDragging) return
            widget.pick(mx, my, Gtk.PickFlags.DEFAULT)
        })
        motion.connect("leave", () => { if (!isDragging) widget.set_cursor(null) })
        widget.add_controller(motion)
    }

    const attachResizeHandle = (widget: Gtk.Widget, getPanel: () => Gtk.Widget | null, edge: string, minW: number, minH: number) => {
        const controller = new Gtk.GestureDrag()
        let startWidth = 0, startHeight = 0, startPanelX = 0, startPanelY = 0, startWinX = 0, startWinY = 0, startWidgetX = 0, startWidgetY = 0
        controller.connect("drag-begin", (_c: any, sx: number, sy: number) => {
            const panel = getPanel()
            if (!panel || !windowRef) return
            startWidgetX = sx; startWidgetY = sy
            const [ok, wx, wy] = widget.translate_coordinates(windowRef, sx, sy)
            if (ok) { startWinX = wx; startWinY = wy }
            startWidth = panel.get_allocated_width(); startHeight = panel.get_allocated_height()
            startPanelX = panelX(); startPanelY = panelY()
            isDragging = true
            setFullInputRegion()
        })
        const endDrag = () => {
            isDragging = false
            lastInputRegion = ""
            updateInputRegion()
            const panel = getPanel()
            if (panel) {
                config.windowWidth = panel.get_allocated_width()
                config.windowHeight = panel.get_allocated_height()
                saveConfig()
            }
        }
        controller.connect("drag-end", endDrag)
        controller.connect("cancel", endDrag)
        controller.connect("drag-update", (_c: any, ox: number, oy: number) => {
            const panel = getPanel()
            if (!panel || !windowRef) return
            const [ok, wx, wy] = widget.translate_coordinates(windowRef, startWidgetX + ox, startWidgetY + oy)
            if (!ok) return
            const trueOffsetX = wx - startWinX; const trueOffsetY = wy - startWinY
            const windowSize = getWindowSize()
            let nw = startWidth, nh = startHeight, nx = startPanelX, ny = startPanelY
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
            setPanelX(Math.round(nx)); setPanelY(Math.round(ny))
        })
        widget.add_controller(controller)
        const motion = new Gtk.EventControllerMotion()
        motion.connect("enter", () => setCursor(widget, `${edge}-resize`))
        motion.connect("leave", () => { if (!isDragging) widget.set_cursor(null) })
        widget.add_controller(motion)
    }

    const trackPanel = (panel: Gtk.Widget) => {
        panel.connect("realize", () => scheduleInputRegionUpdate(panel))
    }

    const setupWindow = (window: Astal.Window) => {
        windowRef = window
        addEscapeHandler(window)
        window.connect("realize", () => scheduleInputRegionUpdate())
        
        // Force webView to hide when window hides. This stops Wayland/WebKit 
        // from rendering background animations, reducing idle CPU usage to 0!
        window.connect("notify::visible", () => {
            webView.visible = window.visible
            if (window.visible) {
                scheduleInputRegionUpdate()
            }
        })
    }

    const toggleSidebar = () => {
        sidebar.visible = !sidebar.visible
    }

    const openChat = (value: string) => {
        const url = normalizeUrl(value)
        if (!url) return
        sidebar.visible = false
        address.label = url
        config.lastSelected = url
        saveConfig()
        webView.load_uri(url)
    }

    const goBack = () => {
        if (webView.can_go_back()) {
            webView.go_back()
        }
    }

    const removeProvider = (index: number) => {
        const provider = config.providers[index]
        if (provider) {
            const faviconPath = getFaviconPath(provider.url)
            if (faviconPath) {
                try {
                    const file = Gio.File.new_for_path(faviconPath)
                    if (file.query_exists(null)) file.delete(null)
                } catch (e) {
                    console.error("Failed to delete favicon cache:", e)
                }
            }
        }
        config.providers.splice(index, 1)
        saveConfig()
        renderProviders()
    }

    const addProvider = (name: string, url: string) => {
        const cleanUrl = normalizeUrl(url)
        if (!name || !cleanUrl) return
        config.providers.push({ name, badge: name.charAt(0).toUpperCase(), url: cleanUrl })
        saveConfig()
        renderProviders()
    }

    const renderProviders = () => {
        if (!providerGrid) return
        let child = providerGrid.get_first_child()
        while (child) {
            const next = child.get_next_sibling()
            providerGrid.remove(child)
            child = next
        }

        config.providers.forEach((provider, index) => {
            const faviconPath = getFaviconPath(provider.url)
            const row = new Gtk.Box({ spacing: 8 })

            const btn = new Gtk.Button({ cssClasses: ["ai-provider"], hexpand: true, tooltipText: `Open ${provider.name}` })
            btn.connect("clicked", () => openChat(provider.url))

            const btnBox = new Gtk.Box({ spacing: 12 })
            btn.set_child(btnBox)

            if (faviconPath) {
                const img = new Gtk.Image({ cssClasses: ["ai-provider-badge"], file: faviconPath, pixelSize: 32 })
                btnBox.append(img)
            } else {
                const lbl = new Gtk.Label({ cssClasses: ["ai-provider-badge"], label: provider.badge })
                btnBox.append(lbl)
            }

            const nameLbl = new Gtk.Label({ cssClasses: ["ai-provider-name"], label: provider.name, halign: Gtk.Align.START, hexpand: true })
            btnBox.append(nameLbl)

            const removeBtn = new Gtk.Button({ cssClasses: ["ai-provider-remove"], tooltipText: "Remove" })
            removeBtn.connect("clicked", () => removeProvider(index))
            const removeImg = new Gtk.Image({ iconName: "user-trash-symbolic" })
            removeBtn.set_child(removeImg)

            row.append(btn)
            row.append(removeBtn)

            providerGrid.append(row)
        })
    }


    let addNameEntry!: Gtk.Entry
    let addUrlEntry!: Gtk.Entry

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
            anchor={Astal.WindowAnchor.TOP | Astal.WindowAnchor.BOTTOM | Astal.WindowAnchor.LEFT | Astal.WindowAnchor.RIGHT}>
            <overlay class="ai-chat-backdrop" hexpand vexpand>
                <box hexpand vexpand />

                <overlay
                    $type="overlay"
                    halign={Gtk.Align.START}
                    valign={Gtk.Align.START}
                    marginStart={panelMarginStart}
                    marginTop={panelMarginTop}
                    $={(self) => {
                        browser = self
                        self.set_size_request(config.windowWidth, config.windowHeight)
                        trackPanel(self)
                    }}>
                    <box class="ai-chat-browser" orientation={Gtk.Orientation.VERTICAL} spacing={10} css="margin: 10px;" $={(self) => attachMoveController(self, () => browser)}>
                        <box class="ai-browser-toolbar ai-drag-handle" spacing={8}>
                            <button
                                class="ai-browser-control"
                                tooltipText="Back"
                                $={(self) => backButton = self}
                                onClicked={goBack}>
                                <image iconName="go-previous-symbolic" />
                            </button>
                            <button
                                class="ai-browser-control"
                                tooltipText="Choose another chatbot"
                                onClicked={toggleSidebar}>
                                <image iconName="view-list-symbolic" />
                            </button>
                            <overlay hexpand>
                                <box />
                                <label
                                    $type="overlay"
                                    class="ai-browser-address"
                                    label={config.lastSelected}
                                    ellipsize={3}
                                    widthChars={1}
                                    halign={Gtk.Align.FILL}
                                    $={(self) => address = self} />
                            </overlay>
                            <button
                                class="ai-browser-control"
                                tooltipText="Reload"
                                onClicked={() => webView.reload()}>
                                <image iconName="view-refresh-symbolic" />
                            </button>
                        </box>

                        {/* Browser Content with Sidebar overlay */}
                        <overlay hexpand vexpand>
                            <Gtk.ScrolledWindow 
                                class="ai-browser-content" 
                                hexpand 
                                vexpand 
                                minContentWidth={100} 
                                minContentHeight={100}
                                hscrollbarPolicy={Gtk.PolicyType.AUTOMATIC}
                                vscrollbarPolicy={Gtk.PolicyType.AUTOMATIC}
                                propagateNaturalWidth={false}
                                propagateNaturalHeight={false}>
                                {webView}
                            </Gtk.ScrolledWindow>

                            {/* Sidebar overlays the browser */}
                            <box $type="overlay" class="ai-sidebar" orientation={Gtk.Orientation.VERTICAL} spacing={10} visible={false} widthRequest={250} halign={Gtk.Align.START} valign={Gtk.Align.FILL} $={(self) => { sidebar = self; }}>
                                <label class="ai-chat-title" label="Chatbots" halign={Gtk.Align.START} />

                                <Gtk.ScrolledWindow hexpand vexpand>
                                    <box class="ai-provider-grid" orientation={Gtk.Orientation.VERTICAL} spacing={6} $={(self) => { providerGrid = self; renderProviders(); }} />
                                </Gtk.ScrolledWindow>

                                <box class="ai-custom-url" orientation={Gtk.Orientation.VERTICAL} spacing={6}>
                                    <label class="ai-provider-name" label="Add New AI" halign={Gtk.Align.START} />
                                    <entry placeholder_text="Name" $={(self) => addNameEntry = self} />
                                    <entry placeholder_text="URL" $={(self) => addUrlEntry = self} />
                                    <button
                                        class="ai-custom-open"
                                        onClicked={() => {
                                            addProvider(addNameEntry.text, addUrlEntry.text)
                                            addNameEntry.text = ""
                                            addUrlEntry.text = ""
                                        }}>
                                        <image iconName="list-add-symbolic" />
                                    </button>
                                </box>
                            </box>
                        </overlay>
                    </box>

                    <box $type="overlay" valign={Gtk.Align.START} heightRequest={RESIZE_BORDER} css="background: transparent;" $={(self) => attachResizeHandle(self, () => browser, "n", MIN_BROWSER_WIDTH, MIN_BROWSER_HEIGHT)} />
                    <box $type="overlay" valign={Gtk.Align.END} heightRequest={RESIZE_BORDER} css="background: transparent;" $={(self) => attachResizeHandle(self, () => browser, "s", MIN_BROWSER_WIDTH, MIN_BROWSER_HEIGHT)} />
                    <box $type="overlay" halign={Gtk.Align.START} widthRequest={RESIZE_BORDER} css="background: transparent;" $={(self) => attachResizeHandle(self, () => browser, "w", MIN_BROWSER_WIDTH, MIN_BROWSER_HEIGHT)} />
                    <box $type="overlay" halign={Gtk.Align.END} widthRequest={RESIZE_BORDER} css="background: transparent;" $={(self) => attachResizeHandle(self, () => browser, "e", MIN_BROWSER_WIDTH, MIN_BROWSER_HEIGHT)} />

                    <box $type="overlay" halign={Gtk.Align.START} valign={Gtk.Align.START} widthRequest={RESIZE_BORDER} heightRequest={RESIZE_BORDER} css="background: transparent;" $={(self) => attachResizeHandle(self, () => browser, "nw", MIN_BROWSER_WIDTH, MIN_BROWSER_HEIGHT)} />
                    <box $type="overlay" halign={Gtk.Align.END} valign={Gtk.Align.START} widthRequest={RESIZE_BORDER} heightRequest={RESIZE_BORDER} css="background: transparent;" $={(self) => attachResizeHandle(self, () => browser, "ne", MIN_BROWSER_WIDTH, MIN_BROWSER_HEIGHT)} />
                    <box $type="overlay" halign={Gtk.Align.START} valign={Gtk.Align.END} widthRequest={RESIZE_BORDER} heightRequest={RESIZE_BORDER} css="background: transparent;" $={(self) => attachResizeHandle(self, () => browser, "sw", MIN_BROWSER_WIDTH, MIN_BROWSER_HEIGHT)} />
                    <box $type="overlay" halign={Gtk.Align.END} valign={Gtk.Align.END} widthRequest={RESIZE_BORDER} heightRequest={RESIZE_BORDER} css="background: transparent;" $={(self) => attachResizeHandle(self, () => browser, "se", MIN_BROWSER_WIDTH, MIN_BROWSER_HEIGHT)} />
                </overlay>
            </overlay>
        </window>
    )
}
