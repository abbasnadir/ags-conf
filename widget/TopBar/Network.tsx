import { Astal, Gtk } from "ags/gtk4"
import Flames from "./Flames"
import { createBinding, For, createState, With, createComputed } from "gnim"
import app from "ags/gtk4/app"
import GLib from "gi://GLib"
import Gio from "gi://Gio"

let AstalNetwork: any = null
try { AstalNetwork = (await import("gi://AstalNetwork")).default } catch (e) { }

async function execAsync(cmd: string): Promise<string> {
    return new Promise((resolve, reject) => {
        const [, argv] = GLib.shell_parse_argv(cmd)
        const proc = Gio.Subprocess.new(argv, Gio.SubprocessFlags.STDOUT_PIPE | Gio.SubprocessFlags.STDERR_PIPE)
        proc.communicate_utf8_async(null, null, (p, res) => {
            try {
                const [, stdout, stderr] = p.communicate_utf8_finish(res)
                if (p.get_successful()) resolve(stdout)
                else reject(stderr || stdout)
            } catch (e) {
                reject(e)
            }
        })
    })
}

function APItem({ ap, wifi }: { ap: any, wifi: any }) {
    const ssid = createBinding(ap, "ssid")
    const iconName = createBinding(ap, "icon-name")

    const [expanded, setExpanded] = createState(false)
    const [errorMsg, setErrorMsg] = createState("")
    
    let pwEntry: Gtk.Entry

    const handleConnect = async () => {
        const s = ap.get_ssid()
        if (!s) return
        
        setErrorMsg("Connecting...")
        
        try {
            if (pwEntry && pwEntry.text) {
                await execAsync(`nmcli device wifi connect "${s}" password "${pwEntry.text}"`)
            } else {
                await execAsync(`nmcli device wifi connect "${s}"`)
            }
            app.toggle_window("network")
        } catch (e) {
            setErrorMsg(String(e))
        }
    }

    return (
        <box orientation={Gtk.Orientation.VERTICAL} cssClasses={["ap-container"]}>
            <button 
                cssClasses={["ap-btn"]}
                onClicked={() => setExpanded(!expanded())}
            >
                <box spacing={8}>
                    <image iconName={iconName} />
                    <label label={ssid((s: string) => s || "Unknown")} />
                </box>
            </button>
            <With value={expanded}>
                {(exp: boolean) => exp ? (
                    <box orientation={Gtk.Orientation.VERTICAL} spacing={4} cssClasses={["ap-password-box"]} margin-top={4} margin-bottom={4}>
                        <entry 
                            placeholder_text="Password (if needed)"
                            visibility={false}
                            $={(self: Gtk.Entry) => { pwEntry = self }}
                        />
                        <button onClicked={handleConnect} cssClasses={["connect-btn"]}><label label="Connect" /></button>
                        <With value={errorMsg}>
                            {(err: string) => err ? <label label={err} cssClasses={["error-msg"]} wrap={true} /> : ""}
                        </With>
                    </box>
                ) : ""}
            </With>
        </box>
    )
}

function ConnectedNetworkHero({ wifi }: { wifi: any }) {
    const activeAP = createBinding(wifi, "active-access-point")
    
    return (
        <With value={activeAP}>
            {(ap: any) => {
                if (!ap) return <box />
                const ssid = createBinding(ap, "ssid")
                const iconName = createBinding(ap, "icon-name")
                const strength = createBinding(ap, "strength")
                
                return (
                    <box cssClasses={["connected-hero"]} orientation={Gtk.Orientation.VERTICAL} spacing={8}>
                        <label label="Currently Connected" halign={Gtk.Align.START} cssClasses={["dim", "small-text"]} />
                        <box spacing={12} cssClasses={["ap-btn", "connected"]} hexpand>
                            <image iconName={iconName} pixelSize={32} />
                            <box orientation={Gtk.Orientation.VERTICAL} hexpand halign={Gtk.Align.START}>
                                <label label={ssid((s: string) => s || "Unknown")} cssClasses={["network-title"]} />
                                <label label={strength((s: number) => `Signal Strength: ${s}%`)} cssClasses={["dim"]} />
                            </box>
                            <button 
                                cssClasses={["connect-btn"]}
                                onClicked={() => {
                                    execAsync(`nmcli connection down "${ap.get_ssid()}"`).catch(console.error)
                                }}
                            >
                                <label label="Disconnect" />
                            </button>
                        </box>
                    </box>
                )
            }}
        </With>
    )
}

export default function NetworkWindow() {
    if (!AstalNetwork) return <window name="network" application={app} visible={false}><box/></window>

    const network = AstalNetwork.get_default()
    const wifi = network.get_wifi()
    if (!wifi) return <window name="network" application={app} visible={false}><box/></window>

    const accessPoints = createBinding(wifi, "access-points")
    const activeAP = createBinding(wifi, "active-access-point")
    
    // Filter out the active one and hidden networks from the list below
    const availablePoints = createComputed(() => {
        const aps = accessPoints() || []
        const active = activeAP()
        
        const activeBssid = active ? active.get_bssid() : null
        const activeSsid = active ? active.get_ssid() : null
        
        return aps.filter((ap: any) => {
            const ssid = ap.get_ssid()
            // Hide networks with empty/unknown names
            if (!ssid || ssid.trim() === "") return false
            if (active) {
                return ap.get_bssid() !== activeBssid && ssid !== activeSsid
            }
            return true
        })
    })

    return (
        <window
            name="network"
            cssClasses={["popup-window"]}
            application={app}
            visible={false}
            layer={Astal.Layer.OVERLAY}
            exclusivity={Astal.Exclusivity.IGNORE}
            keymode={Astal.Keymode.ON_DEMAND}
            anchor={Astal.WindowAnchor.BOTTOM}
            margin-bottom={50}
            $={(self) => {
                self.connect("notify::is-active", () => {
                    if (!self.is_active && self.visible) {
                        self.visible = false
                    }
                })
            }}
        >
            <box cssClasses={["network-window"]}>
                <overlay hexpand vexpand>
                    <Flames />
                    <box $type="overlay" hexpand vexpand
                    $={(self: any) => {
                        GLib.idle_add(GLib.PRIORITY_DEFAULT, () => {
                            const parent = self.get_parent();
                            if (parent && parent.set_measure_overlay) {
                                parent.set_measure_overlay(self, true);
                            }
                            return GLib.SOURCE_REMOVE;
                        });
                    }} orientation={Gtk.Orientation.VERTICAL} 
                        spacing={12}
                    >
                <box halign={Gtk.Align.FILL}>
                    <label cssClasses={["network-title"]} label="Wi-Fi Settings" hexpand halign={Gtk.Align.START} />
                    <button 
                        cssClasses={["refresh-btn"]}
                        tooltipText="Scan for networks"
                        onClicked={() => wifi.scan()}
                    >
                        <image iconName="view-refresh-symbolic" />
                    </button>
                </box>
                
                <ConnectedNetworkHero wifi={wifi} />
                
                <Gtk.Separator />
                
                <label label="Available Networks" halign={Gtk.Align.START} cssClasses={["dim", "small-text"]} />
                <Gtk.ScrolledWindow heightRequest={250} widthRequest={300}>
                    <box orientation={Gtk.Orientation.VERTICAL} spacing={4}>
                        <For each={availablePoints}>
                            {(ap: any) => <APItem ap={ap} wifi={wifi} />}
                        </For>
                    </box>
                </Gtk.ScrolledWindow>
                
                <box cssClasses={["network-footer"]} halign={Gtk.Align.FILL}>
                    <button 
                        hexpand
                        cssClasses={["advanced-settings-btn"]} 
                        onClicked={() => {
                            GLib.spawn_command_line_async("kitty -e nmtui")
                            app.toggle_window("network")
                        }}
                    >
                        <label label="Advanced Settings" />
                    </button>
                </box>
            </box>
            </overlay>
            </box>
        </window>
    )
}
