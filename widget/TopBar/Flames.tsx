import { Gtk } from "ags/gtk4"

export default function Flames() {
    const burnCount = 80 // Reduced to 80 for performance over a larger area
    const burns = []
    for (let i = 1; i <= burnCount; i++) {
        burns.push(<box $type="overlay" cssClasses={["burn-goo", `burn-goo-${i}`]} halign={Gtk.Align.CENTER} valign={Gtk.Align.END} />)
    }
    
    const fire = (
        <overlay cssClasses={["fire-goo"]} halign={Gtk.Align.FILL} hexpand={true} valign={Gtk.Align.FILL} vexpand={true}>
            <box /> 
            {burns}
        </overlay>
    )

    return (
        <box cssClasses={["ember-wrap"]} halign={Gtk.Align.FILL} hexpand={true} valign={Gtk.Align.FILL} vexpand={true} canFocus={false} canTarget={false}>
            {fire}
        </box>
    ) as any
}
