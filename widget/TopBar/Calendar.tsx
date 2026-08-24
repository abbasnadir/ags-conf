import { Astal, Gtk } from "ags/gtk4"
import app from "ags/gtk4/app"
import Flames from "./Flames"
import GLib from "gi://GLib"

export default function CalendarWindow() {
    return (
        <window
            name="calendar"
            cssClasses={["popup-window"]}
            application={app}
            visible={false}
            layer={Astal.Layer.OVERLAY}
            exclusivity={Astal.Exclusivity.IGNORE}
            keymode={Astal.Keymode.ON_DEMAND}
            anchor={Astal.WindowAnchor.BOTTOM | Astal.WindowAnchor.RIGHT}
            margin-end={10}
            margin-bottom={50}
        >
            <box cssClasses={["calendar-window"]}>
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
                        }}>
                        <Gtk.Calendar hexpand vexpand />
                    </box>
                </overlay>
            </box>
        </window>
    )
}
