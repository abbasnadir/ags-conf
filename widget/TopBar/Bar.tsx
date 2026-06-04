
import app from "ags/gtk4/app"
import { Astal, Gtk, Gdk } from "ags/gtk4"
import { createState, createComputed } from "gnim"


export default function Bar(gdkmonitor: Gdk.Monitor) {
    return (
        <window visible class="topBar"
            exclusivity={Astal.Exclusivity.EXCLUSIVE}
            anchor={
                Astal.WindowAnchor.BOTTOM |
                Astal.WindowAnchor.LEFT |
                Astal.WindowAnchor.RIGHT
            }>
            <box>
                <label label="Astal GTK4" />
            </box>
        </window>
    )
}