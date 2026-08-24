import { Gtk } from "ags/gtk4"
import GLib from "gi://GLib"

export default function ParticleOrb() {
    const total = 120
    const particles = []
    for (let i = 1; i <= total; i++) {
        particles.push(<box cssClasses={["orb-c", `orb-c-${i}`]} />)
    }
    
    const wrap = (
        <box $type="overlay" cssClasses={["orb-wrap"]} halign={Gtk.Align.FILL} hexpand={true} valign={Gtk.Align.CENTER} canFocus={false} visible={false}>
            {particles}
        </box>
    ) as any
    
    // Delay showing particles until CSS has been fully applied
    GLib.timeout_add(GLib.PRIORITY_DEFAULT, 1500, () => {
        wrap.visible = true
        return GLib.SOURCE_REMOVE
    })
    
    return wrap
}
