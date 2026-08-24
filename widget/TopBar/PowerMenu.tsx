import { Astal, Gtk } from "ags/gtk4"
import app from "ags/gtk4/app"
import GLib from "gi://GLib"
import Flames from "./Flames"

export default function PowerMenuWindow() {
    return (
        <window
            name="powermenu"
            cssClasses={["popup-window"]}
            application={app}
            visible={false}
            layer={Astal.Layer.OVERLAY}
            exclusivity={Astal.Exclusivity.IGNORE}
            keymode={Astal.Keymode.ON_DEMAND}
            anchor={Astal.WindowAnchor.BOTTOM | Astal.WindowAnchor.RIGHT}
            margin-bottom={50}
            margin-right={10}
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
                    }} orientation={Gtk.Orientation.VERTICAL} spacing={12}>
                <label cssClasses={["network-title"]} label="Power" hexpand halign={Gtk.Align.START} />
                
                <box spacing={8}>
                    <button 
                        cssClasses={["advanced-settings-btn"]} 
                        onClicked={() => {
                            GLib.spawn_command_line_async("systemctl suspend")
                            app.toggle_window("powermenu")
                        }}
                    >
                        <box spacing={4}><image iconName="system-suspend-symbolic" /><label label="Suspend" /></box>
                    </button>
                    
                    <button 
                        cssClasses={["advanced-settings-btn"]} 
                        onClicked={() => {
                            GLib.spawn_command_line_async("systemctl reboot")
                        }}
                    >
                        <box spacing={4}><image iconName="system-reboot-symbolic" /><label label="Reboot" /></box>
                    </button>
                    
                    <button 
                        cssClasses={["connect-btn"]} 
                        onClicked={() => {
                            GLib.spawn_command_line_async("systemctl poweroff")
                        }}
                    >
                        <box spacing={4}><image iconName="system-shutdown-symbolic" /><label label="Shutdown" /></box>
                    </button>
                </box>
            </box>
            </overlay>
            </box>
        </window>
    )
}
