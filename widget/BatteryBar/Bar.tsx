
import { Astal, Gtk, Gdk } from "ags/gtk4"
import { createState, createComputed } from "gnim"
import Battery from "gi://AstalBattery"
import Cairo from "cairo"

const battery = Battery.get_default()

const [percentage, setPercentage] = createState(battery.percentage)
const [charging, setCharging] = createState(battery.charging)

battery.connect("notify::percentage", () => {
    setPercentage(battery.percentage)
})

battery.connect("notify::charging", () => {
    setCharging(battery.charging)
})

function makeClickThrough(window: Astal.Window) {
    const emptyRegion = new Cairo.Region()
    const apply = () => window.get_surface()?.set_input_region(emptyRegion)

    window.connect("realize", apply)
    apply()
}

export default function Bar(gdkmonitor: Gdk.Monitor) {
    const labelCss = createComputed(() =>
        `color: ${charging() ? "rgb(63, 201, 63)" : "rgb(255, 255, 255)"};`
    )

    const batteryPercentage = createComputed(() =>
        Math.max(0, Math.min(1, percentage()))
    )

    const fillWidth = createComputed(() =>
        Math.round(gdkmonitor.get_geometry().width * batteryPercentage())
    )

    const glowClass = createComputed(() => {
        if (batteryPercentage() < 0.2) return "battery-glow critical"
        if (batteryPercentage() < 0.5) return "battery-glow warning"
        return "battery-glow"
    })

    return (
        <window visible class="batteryBar"
            $={makeClickThrough}
            gdkmonitor={gdkmonitor}
            layer={Astal.Layer.OVERLAY}
            exclusivity={Astal.Exclusivity.IGNORE}
            canFocus={false}
            anchor={
                Astal.WindowAnchor.TOP |
                Astal.WindowAnchor.LEFT |
                Astal.WindowAnchor.RIGHT
            }>
            <box>
                <overlay
                    halign={Gtk.Align.START}
                    widthRequest={fillWidth}
                    heightRequest={50}>
                    <box class={glowClass} />
                    <label
                        $type="overlay"
                        halign={Gtk.Align.END}
                        valign={Gtk.Align.CENTER}
                        css={labelCss}
                        label={createComputed(() => {
                            return `${Math.round(batteryPercentage() * 100)}%`
                        })} />
                </overlay>
                <box class="battery-empty" hexpand />
            </box>
        </window>
    )
}
