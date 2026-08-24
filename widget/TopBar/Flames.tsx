import { Gtk } from "ags/gtk4"
import GLib from "gi://GLib"

export default function Flames() {
    const burnCount = 100
    const burns = []
    for (let i = 1; i <= burnCount; i++) {
        burns.push(<box $type="overlay" cssClasses={["burn-goo", `burn-goo-${i}`]} halign={Gtk.Align.CENTER} valign={Gtk.Align.END} />)
    }
    
    const fire = (
        <overlay cssClasses={["fire-goo"]} halign={Gtk.Align.FILL} hexpand={true} valign={Gtk.Align.END}>
            <box /> 
            {burns}
        </overlay>
    )

    const wrap = (
        <box cssClasses={["ember-wrap"]} halign={Gtk.Align.FILL} hexpand={true} valign={Gtk.Align.END} vexpand={true} canFocus={false} visible={false}>
            {fire}
        </box>
    ) as any
    
    GLib.timeout_add(GLib.PRIORITY_DEFAULT, 500, () => {
        wrap.visible = true
        return GLib.SOURCE_REMOVE
    })
    
    return wrap
}
