import { Astal, Gtk } from "ags/gtk4"
import { createBinding, For, createState, With } from "gnim"
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
    const active = createBinding(wifi, "active-access-point")

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
            app.toggle_window("network") // Close on success
        } catch (e) {
            setErrorMsg(String(e))
        }
    }

    return (
        <box orientation={Gtk.Orientation.VERTICAL} cssClasses={["ap-container"]}>
            <button 
                cssClasses={["ap-btn"]}
                onClicked={() => {
                    const isActive = active()?.get_ssid() === ap.get_ssid()
                    if (isActive) return
                    setExpanded(!expanded())
                }}
            >
                <box spacing={8}>
                    <image iconName={iconName} />
                    <label label={ssid((s: string) => {
                        const isActive = active()?.get_ssid() === s
                        return isActive ? `[Connected] ${s || "Unknown"}` : (s || "Unknown")
                    })} />
                </box>
            </button>
            <With value={expanded}>
                {(exp: boolean) => exp ? (
                    <box orientation={Gtk.Orientation.VERTICAL} spacing={4} cssClasses={["ap-password-box"]}>
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

export default function NetworkWindow() {
    if (!AstalNetwork) return <window name="network" application={app} visible={false}><box/></window>

    const network = AstalNetwork.get_default()
    const wifi = network.get_wifi()
    if (!wifi) return <window name="network" application={app} visible={false}><box/></window>

    const accessPoints = createBinding(wifi, "access-points")

    return (
        <window
            name="network"
            application={app}
            visible={false}
            layer={Astal.Layer.OVERLAY}
            exclusivity={Astal.Exclusivity.IGNORE}
            keymode={Astal.Keymode.ON_DEMAND}
            anchor={Astal.WindowAnchor.BOTTOM}
            margin-bottom={50}
            $={(self) => {
                // Auto-close when clicking outside (losing focus)
                self.connect("notify::is-active", () => {
                    if (!self.is_active && self.visible) {
                        self.visible = false
                    }
                })
            }}
        >
            <box 
                cssClasses={["network-window"]} 
                orientation={Gtk.Orientation.VERTICAL} 
                spacing={8}
            >
                <box halign={Gtk.Align.FILL}>
                    <label cssClasses={["network-title"]} label="Wi-Fi Networks" hexpand halign={Gtk.Align.START} />
                        <button 
                            cssClasses={["refresh-btn"]}
                            tooltipText="Scan for networks"
                            onClicked={() => wifi.scan()}
                        >
                            <image iconName="view-refresh-symbolic" />
                        </button>
                    </box>
                    
                    <Gtk.ScrolledWindow heightRequest={350} widthRequest={300}>
                        <box orientation={Gtk.Orientation.VERTICAL} spacing={4}>
                            <For each={accessPoints}>
                                {(ap: any) => <APItem ap={ap} wifi={wifi} />}
                            </For>
                        </box>
                    </Gtk.ScrolledWindow>
                    
                    <box cssClasses={["network-footer"]} halign={Gtk.Align.FILL}>
                        <button 
                            hexpand
                            cssClasses={["advanced-settings-btn"]} 
                            onClicked={() => {
                                GLib.spawn_command_line_async("nm-connection-editor")
                                app.toggle_window("network")
                            }}
                        >
                            <label label="Advanced Settings" />
                        </button>
                    </box>
                </box>
        </window>
    )
}
