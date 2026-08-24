import ParticleOrb from "./ParticleOrb"
import app from "ags/gtk4/app"
import { Astal, Gtk, Gdk } from "ags/gtk4"
import { createState, createBinding, createEffect, createComputed, onCleanup, For, With } from "gnim"
import GLib from "gi://GLib"

let AstalHyprland: any = null
try { AstalHyprland = (await import("gi://AstalHyprland")).default } catch (e) { }

let AstalTray: any = null
try { AstalTray = (await import("gi://AstalTray")).default } catch (e) { }

let AstalNetwork: any = null
try { AstalNetwork = (await import("gi://AstalNetwork")).default } catch (e) { }

let AstalBluetooth: any = null
try { AstalBluetooth = (await import("gi://AstalBluetooth")).default } catch (e) { }

let AstalMpris: any = null
try { AstalMpris = (await import("gi://AstalMpris")).default } catch (e) { }

const theme = Gtk.IconTheme.get_for_display(Gdk.Display.get_default())
if (theme) {
    theme.add_search_path(GLib.get_home_dir() + "/.local/share/icons")
    theme.add_search_path(GLib.get_home_dir() + "/.icons")
}

const getIconName = (cls: string | null | undefined) => {
    if (!cls) return "application-x-executable"
    if (!theme) return "application-x-executable"
    
    if (theme.has_icon(cls)) return cls
    if (theme.has_icon(cls.toLowerCase())) return cls.toLowerCase()
    
    if (cls === "code-oss") return "com.visualstudio.code.oss"
    
    return "application-x-executable"
}


function Workspaces() {
    if (!AstalHyprland) {
        return <box><label label="Hyprland missing" cssClasses={["dim"]}/></box>
    }
    
    const hypr = AstalHyprland.get_default()
    const workspacesBinding = createBinding(hypr, "workspaces")
    const clientsBinding = createBinding(hypr, "clients")
    const focusedWsBinding = createBinding(hypr, "focused-workspace")

    // Lightweight tick just for forcing CSS class updates on special workspace toggles
    let specialTick = 0
    const [workspaceTick, setWorkspaceTick] = createState(0)

    hypr.connect("event", (_self: any, event: string) => {
        const ev = event.split(",")[0]
        if (ev === "activespecial" || ev === "togglespecialworkspace") {
            specialTick++
            setWorkspaceTick(specialTick)
        }
    })

    const forceUpdateGeometry = () => {
        hypr.sync_clients((_, res) => {
            try {
                hypr.sync_clients_finish(res)
                for (const c of hypr.get_clients()) {
                    c.notify("width")
                    c.notify("height")
                    c.notify("x")
                    c.notify("y")
                }
            } catch (e) {
                console.error(e)
            }
        })
    }

    const animateUpdate = () => {
        let count = 0
        // Sync at 50, 150, 250, 350, 450ms to catch the animation frames
        GLib.timeout_add(GLib.PRIORITY_DEFAULT, 100, () => {
            forceUpdateGeometry()
            count++
            if (count >= 5) return GLib.SOURCE_REMOVE
            return GLib.SOURCE_CONTINUE
        })
    }

    hypr.connect("client-added", () => {
        hypr.notify("clients")
        animateUpdate()
    })
    
    hypr.connect("client-removed", () => {
        hypr.notify("clients")
        animateUpdate()
    })

    return (
        <box cssClasses={["workspaces"]} spacing={6}>
            <With value={workspacesBinding}>
                {(wsList: any[]) => {
                    const sortedWs = [...wsList].sort((a, b) => a.id - b.id)
                    return (
                        <box spacing={8}>
                            {sortedWs.map(ws => {
                                const monitor = ws.monitor || hypr.get_monitors()[0]
                                const screenW = monitor?.width || 1920
                                const screenH = monitor?.height || 1080
                                const screenX = monitor?.x || 0
                                const screenY = monitor?.y || 0
                                
                                const WS_WIDTH = 64
                                const WS_HEIGHT = Math.floor(WS_WIDTH * (screenH / screenW))
                                const scaleX = WS_WIDTH / screenW
                                const scaleY = WS_HEIGHT / screenH

                                const classesBinding = createComputed(() => {
                                    const _tick = workspaceTick()
                                    const fws = focusedWsBinding()
                                    let isActive = fws?.id === ws.id
                                    if (ws.id < 0 && monitor?.get_special_workspace()?.id === ws.id) {
                                        isActive = true
                                    }
                                    return ["workspace-btn", "workspace-rect", ws.id < 0 ? "special" : "", isActive ? "active" : ""]
                                })

                                return (
                                    <button
                                        cssClasses={classesBinding}
                                        onClicked={() => {
                                            if (ws.id < 0) {
                                                const name = ws.name.replace("special:", "")
                                                GLib.spawn_command_line_async(`bash -c "hyprctl eval \\"hl.dispatch(hl.dsp.workspace.toggle_special('${name}'))\\" > /dev/null"`)
                                            } else {
                                                GLib.spawn_command_line_async(`bash -c "hyprctl eval \\"hl.dispatch(hl.dsp.focus({ workspace = '${ws.name}' }))\\" > /dev/null"`)
                                            }
                                        }}
                                        tooltipText={ws.id < 0 ? ws.name : `Workspace ${ws.id}`}
                                    >
                                        <box 
                                            cssClasses={["workspace-minimap"]} 
                                            widthRequest={WS_WIDTH} 
                                            heightRequest={WS_HEIGHT}
                                        >
                                            <With value={clientsBinding}>
                                                {(clientList: any[]) => (
                                                    <overlay hexpand vexpand>
                                                        <box hexpand vexpand />
                                                        {clientList.map((c: any) => {
                                                            const relX = createBinding(c, "x")((x: number) => Math.max(0, (x - screenX) * scaleX))
                                                            const relY = createBinding(c, "y")((y: number) => Math.max(0, (y - screenY) * scaleY))
                                                            const cw = createBinding(c, "width")((w: number) => Math.max(4, w * scaleX))
                                                            const ch = createBinding(c, "height")((h: number) => Math.max(4, h * scaleY))
                                                            const isVisible = createBinding(c, "workspace")((w: any) => w?.id === ws.id)

                                                            return (
                                                                <box 
                                                                    $type="overlay"
                                                                    halign={Gtk.Align.START}
                                                                    valign={Gtk.Align.START}
                                                                    margin-start={relX}
                                                                    margin-top={relY}
                                                                    widthRequest={cw}
                                                                    heightRequest={ch}
                                                                    visible={isVisible}
                                                                    cssClasses={["minimap-client"]}
                                                                >
                                                                    <image 
                                                                        iconName={getIconName(c.get_class())} 
                                                                        pixelSize={12}
                                                                        hexpand={true}
                                                                        vexpand={true}
                                                                        halign={Gtk.Align.CENTER}
                                                                        valign={Gtk.Align.CENTER}
                                                                    />
                                                                </box>
                                                            )
                                                        })}
                                                    </overlay>
                                                )}
                                            </With>
                                        </box>
                                    </button>
                                )
                            })}
                        </box>
                    )
                }}
            </With>
        </box>
    )
}

function FocusedClient() {
    if (!AstalHyprland) {
        return <box><label label="Hyprland missing" cssClasses={["dim"]}/></box>
    }
    const hypr = AstalHyprland.get_default()
    const focused = createBinding(hypr, "focused-client")
    
    return (
        <box cssClasses={["focused-client"]} visible={createComputed(() => !!focused())}>
            <With value={focused}>
                {(c: any) => {
                    if (!c) return <box />
                    const titleBinding = createBinding(c, "title")
                    const classBinding = createBinding(c, "class")
                    
                    return (
                        <box spacing={8}>
                            <image 
                                iconName={createComputed(() => getIconName(classBinding()))} 
                                pixelSize={18} 
                                cssClasses={["focused-icon"]}
                            />
                            <label 
                                label={createComputed(() => {
                                    const t = titleBinding() || ""
                                    return t.length > 40 ? t.substring(0, 40) + "..." : t
                                })} 
                                cssClasses={["focused-title"]}
                            />
                        </box>
                    )
                }}
            </With>
        </box>
    )
}

function SysTray() {
    if (!AstalTray) {
        return <box><label label="Tray missing" cssClasses={["dim"]}/></box>
    }
    
    const tray = AstalTray.get_default()
    const itemsBinding = createBinding(tray, "items")
    
    return (
        <box cssClasses={["systray"]} spacing={6}>
            <For each={itemsBinding}>
                {(item: any) => (
                    <button
                        cssClasses={["tray-item"]}
                        tooltipMarkup={createBinding(item, "tooltip-markup")}
                        onClicked={() => item.activate(0, 0)}
                    >
                        <image gicon={createBinding(item, "gicon")} />
                    </button>
                )}
            </For>
        </box>
    )
}

function Media() {
    if (!AstalMpris) return <box />
    
    const mpris = AstalMpris.get_default()
    const playersBinding = createBinding(mpris, "players")
    
    return (
        <box cssClasses={["media"]}>
            <With value={playersBinding}>
                {(players: any[]) => {
                    if (players.length === 0) return <box visible={false} />
                    const player = players[0]
                    const title = createBinding(player, "title")
                    const artist = createBinding(player, "artist")
                    const status = createBinding(player, "playback-status")
                    
                    return (
                        <button
                            cssClasses={["media-item"]}
                            onClicked={() => player.play_pause()}
                            tooltipText={createComputed(() => `${title()} - ${artist()}`)}
                        >
                            <box spacing={8}>
                                <image 
                                    iconName={createComputed(() => 
                                        status() === AstalMpris.PlaybackStatus.PLAYING 
                                            ? "media-playback-pause-symbolic" 
                                            : "media-playback-start-symbolic"
                                    )} 
                                />
                                <label 
                                    label={createComputed(() => {
                                        const t = title() || ""
                                        return t.length > 25 ? t.substring(0, 25) + "..." : t
                                    })} 
                                />
                            </box>
                        </button>
                    )
                }}
            </With>
        </box>
    )
}

function Network() {
    if (!AstalNetwork) {
        return (
            <button cssClasses={["network", "tray-item"]} onClicked={() => app.toggle_window("network")}>
                <image iconName="network-wireless-offline-symbolic" />
            </button>
        )
    }
    
    const net = AstalNetwork.get_default()
    const [icon, setIcon] = createState("network-wireless-offline-symbolic")
    
    const update = () => {
        if (net.wifi) {
            setIcon(net.wifi.icon_name || "network-wireless-offline-symbolic")
        } else {
            setIcon("network-wireless-offline-symbolic")
        }
    }
    
    // Connect to wifi changes
    net.connect("notify::wifi", () => {
        update()
        if (net.wifi) {
            net.wifi.connect("notify::icon-name", update)
        }
    })
    
    if (net.wifi) {
        net.wifi.connect("notify::icon-name", update)
    }
    
    // Initial state
    update()
    
    return (
        <button 
            cssClasses={["network", "tray-item"]}
            onClicked={() => app.toggle_window("network")}
        >
            <image iconName={icon} />
        </button>
    )
}

function Bluetooth() {
    if (!AstalBluetooth) {
        return (
            <button cssClasses={["bluetooth", "tray-item"]} onClicked={() => app.toggle_window("bluetooth")}>
                <image iconName="bluetooth-disabled-symbolic" />
            </button>
        )
    }
    
    const bt = AstalBluetooth.get_default()
    const [icon, setIcon] = createState("bluetooth-disabled-symbolic")
    
    const update = () => {
        if (!bt.is_powered) {
            setIcon("bluetooth-disabled-symbolic")
        } else if (bt.is_connected) {
            setIcon("bluetooth-active-symbolic")
        } else {
            setIcon("bluetooth-disconnected-symbolic")
        }
    }
    
    bt.connect("notify::is-powered", update)
    bt.connect("notify::is-connected", update)
    update()
    
    return (
        <button 
            cssClasses={["bluetooth", "tray-item"]}
            onClicked={() => app.toggle_window("bluetooth")}
        >
            <image iconName={icon} />
        </button>
    )
}

function Clock() {
    const [time, setTime] = createState(GLib.DateTime.new_now_local().format("%H:%M")!)
    
    createEffect(() => {
        const id = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 1000, () => {
            setTime(GLib.DateTime.new_now_local().format("%H:%M")!)
            return GLib.SOURCE_CONTINUE
        })
        return () => GLib.source_remove(id)
    })

    return (
        <button cssClasses={["clock"]}>
            <label label={time} />
        </button>
    )
}

export default function Bar() {
    return (
        <window visible class="topBar"
            name="topbar"
            application={app}
            exclusivity={Astal.Exclusivity.EXCLUSIVE}
            anchor={
                Astal.WindowAnchor.BOTTOM |
                Astal.WindowAnchor.LEFT |
                Astal.WindowAnchor.RIGHT
            }>
            <overlay>
                <Gtk.CenterBox 
                    cssClasses={["bar-layout"]}
                    start_widget={
                        <box halign={Gtk.Align.START} spacing={12}>
                            <Workspaces />
                        </box>
                    }
                    center_widget={
                        <box halign={Gtk.Align.CENTER} spacing={12}>
                            <Network />
                            <button 
                                cssClasses={["tray-item"]}
                                onClicked={() => app.toggle_window("powermenu")}
                            >
                                <image iconName="system-shutdown-symbolic" />
                            </button>
                            <Bluetooth />
                        </box>
                    }
                    end_widget={
                        <box halign={Gtk.Align.END} spacing={12}>
                            <button 
                                cssClasses={["tray-item"]}
                                onClicked={() => {
                                    GLib.spawn_command_line_async("swaync-client -t")
                                }}
                            >
                                <image iconName="preferences-system-notifications-symbolic" />
                            </button>
                            <Media />
                            <Clock />
                            <SysTray />
                        </box>
                    }
                />
                <ParticleOrb />
            </overlay>
        </window>
    )
}
