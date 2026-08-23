import { Astal, Gtk } from "ags/gtk4"
import app from "ags/gtk4/app"

export default function CalendarWindow() {
    return (
        <window
            name="calendar"
            application={app}
            visible={false}
            anchor={Astal.WindowAnchor.BOTTOM | Astal.WindowAnchor.RIGHT}
            margin-end={10}
            margin-bottom={50}
        >
            <box cssClasses={["calendar-window"]}>
                <Gtk.Calendar />
            </box>
        </window>
    )
}
