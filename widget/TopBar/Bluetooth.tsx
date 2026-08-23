import app from "ags/gtk4/app"
import { Astal, Gtk } from "ags/gtk4"
import { createBinding, createComputed, With } from "gnim"

let AstalBluetooth: any = null
try { AstalBluetooth = (await import("gi://AstalBluetooth")).default } catch (e) { }

function DeviceItem({ device }: { device: any }) {
    const connected = createBinding(device, "connected")
    const connecting = createBinding(device, "connecting")
    const paired = createBinding(device, "paired")
    
    const statusLabel = createComputed(() => {
        const conn = connected()
        const cnct = connecting()
        const prd = paired()
        if (conn) return "Connected"
        if (cnct) return "Connecting..."
        if (prd) return "Paired"
        return "Available"
    })
    
    return (
        <box cssClasses={["bluetooth-device-item"]} spacing={8}>
            <image iconName={device.icon || "bluetooth-active-symbolic"} pixelSize={24} />
            <box orientation={Gtk.Orientation.VERTICAL} hexpand>
                <label label={device.name || device.address} halign={Gtk.Align.START} />
                <label label={statusLabel} cssClasses={["dim"]} halign={Gtk.Align.START} />
            </box>
            <button 
                cssClasses={["bluetooth-connect-btn"]}
                onClicked={() => {
                    if (device.connected) {
                        device.disconnect_device(() => {})
                    } else {
                        device.connect_device(() => {})
                    }
                }}
            >
                <label label={createComputed(() => connected() ? "Disconnect" : "Connect")} />
            </button>
        </box>
    )
}

export default function BluetoothWindow() {
    if (!AstalBluetooth) return <window name="bluetooth" visible={false} />
    const bt = AstalBluetooth.get_default()
    const devices = createBinding(bt, "devices")
    const isPowered = createBinding(bt, "is-powered")
    const adapterBinding = createBinding(bt, "adapter")

    return (
        <window
            name="bluetooth"
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
            <box 
                cssClasses={["bluetooth-window"]} 
                orientation={Gtk.Orientation.VERTICAL} 
                spacing={8}
            >
                <box halign={Gtk.Align.FILL} spacing={8}>
                    <label cssClasses={["bluetooth-title"]} label="Bluetooth Devices" hexpand halign={Gtk.Align.START} />
                    
                    <With value={adapterBinding}>
                        {(adapter: any) => {
                            if (!adapter) return <box />
                            const discovering = createBinding(adapter, "discovering")
                            return (
                                <box>
                                    <With value={discovering}>
                                        {(disc: boolean) => (
                                            <button 
                                                cssClasses={["bluetooth-scan-btn"]}
                                                onClicked={() => {
                                                    if (disc) adapter.stop_discovery()
                                                    else adapter.start_discovery()
                                                }}
                                                tooltipText={disc ? "Stop Scanning" : "Scan for Devices"}
                                            >
                                                <image iconName={disc ? "media-playback-pause-symbolic" : "view-refresh-symbolic"} />
                                            </button>
                                        )}
                                    </With>
                                </box>
                            )
                        }}
                    </With>

                    <With value={isPowered}>
                        {(p: boolean) => (
                            <switch 
                                active={p} 
                                onNotifyActive={(self) => {
                                    if (bt.get_adapter() && self.active !== bt.get_is_powered()) {
                                        bt.toggle()
                                    }
                                }} 
                            />
                        )}
                    </With>
                </box>

                <Gtk.Separator />

                <Gtk.ScrolledWindow
                    hscrollbarPolicy={Gtk.PolicyType.NEVER}
                    vscrollbarPolicy={Gtk.PolicyType.AUTOMATIC}
                    maxContentHeight={300}
                    minContentHeight={150}
                    minContentWidth={250}
                >
                    <With value={isPowered}>
                        {(powered: boolean) => {
                            if (!powered) {
                                return (
                                    <box halign={Gtk.Align.CENTER} valign={Gtk.Align.CENTER} vexpand>
                                        <label label="Bluetooth is turned off" cssClasses={["dim"]} />
                                    </box>
                                )
                            }
                            
                            return (
                                <box hexpand vexpand>
                                    <With value={devices}>
                                        {(devs: any[]) => {
                                        if (!devs || devs.length === 0) {
                                            return (
                                                <box halign={Gtk.Align.CENTER} valign={Gtk.Align.CENTER} vexpand>
                                                    <label label="No devices found" cssClasses={["dim"]} />
                                                </box>
                                            )
                                        }
                                        
                                        const sorted = [...devs].sort((a, b) => {
                                            if (a.connected !== b.connected) return a.connected ? -1 : 1
                                            if (a.paired !== b.paired) return a.paired ? -1 : 1
                                            return 0
                                        })
                                        
                                        return (
                                            <box orientation={Gtk.Orientation.VERTICAL} spacing={4}>
                                                {sorted.map(d => <DeviceItem device={d} />)}
                                            </box>
                                        )
                                    }}
                                    </With>
                                </box>
                            )
                        }}
                    </With>
                </Gtk.ScrolledWindow>
            </box>
        </window>
    )
}
